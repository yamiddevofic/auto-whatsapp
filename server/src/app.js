import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import config from './config.js';
import { logger } from './logger.js';
import { authMiddleware, mediaAuthMiddleware } from './auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { verifyImageContent } from './middleware/image-check.js';
import { getStatus } from './whatsapp.js';

import authRoutes from './routes/auth.js';
import statusRoutes from './routes/status.js';
import groupsRoutes from './routes/groups.js';
import messagesRoutes from './routes/messages.js';
import statusUpdatesRoutes from './routes/status-updates.js';
import contactsRoutes from './routes/contacts.js';
import agendaRoutes from './routes/agenda.js';
import directMessagesRoutes from './routes/direct-messages.js';
import publishedStatusesRoutes from './routes/published-statuses.js';
import linkPreviewRoutes from './routes/link-preview.js';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const storage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (req, file, cb) => {
    // Nombre no adivinable: antes era Date.now(), predecible y con colisiones.
    // Ver Docs/02-hallazgos-seguridad.md SEC-006 y SEC-022.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const imageFilter = (req, file, cb) => {
  const extOk = IMAGE_EXT.test(path.extname(file.originalname));
  const mimeOk = IMAGE_MIME.has(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(null, false); // se descarta el archivo sin abortar la petición
};

const upload = multer({
  storage,
  limits: { fileSize: config.limits.imageBytes, files: config.limits.imagesPerRequest },
  fileFilter: imageFilter,
});

const vcfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.vcfBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(null, file.originalname.toLowerCase().endsWith('.vcf')),
});

/** Aplica una cadena de middlewares de subida sólo a las peticiones POST. */
const uploadOnPost = (...middlewares) => (req, res, next) => {
  if (req.method !== 'POST') return next();
  let i = 0;
  const step = (err) => {
    if (err) return next(err);
    const middleware = middlewares[i++];
    return middleware ? middleware(req, res, step) : next();
  };
  step();
};

export function createApp() {
  const app = express();

  // Detrás de nginx en la misma máquina: sólo se confía en X-Forwarded-For cuando la
  // conexión viene de loopback, así no se puede falsear la IP para saltar el rate limit.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.disable('x-powered-by');

  // Cabeceras de seguridad. Ver SEC-010.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Sólo tiene sentido cuando la app se sirve por HTTPS
        ...(config.behindTls ? {} : { upgradeInsecureRequests: null }),
      },
    },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
    hsts: config.behindTls ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));

  // CORS con lista blanca. Vacía = sólo mismo origen. Ver SEC-009.
  // Un origen no permitido simplemente no recibe cabeceras CORS (cb(null, false)); el
  // navegador bloquea entonces la lectura de la respuesta. Devolver un error aquí haría
  // fallar con 403 cualquier petición que traiga Origin, incluidos los recursos estáticos.
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 600,
  }));

  app.use(cookieParser());

  // Límites de cuerpo acotados: antes 50 MB, suficiente para agotar memoria. Ver SEC-021.
  app.use(express.json({ limit: config.limits.jsonBody }));
  app.use(express.urlencoded({ limit: config.limits.jsonBody, extended: true }));

  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: 180,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones, espera un momento' },
  }));

  const strictLimiter = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Operación limitada: espera un minuto antes de reintentar' },
  });

  // Rutas públicas (el login tiene su propio limitador estricto en el router)
  app.use('/api/auth', authRoutes());

  // ---- A partir de aquí todo exige autenticación ----
  // El orden importa: antes los middlewares de multer se ejecutaban ANTES de esta línea
  // y escribían archivos en disco en peticiones anónimas. Ver SEC-005.
  app.use('/api', authMiddleware);

  // Operaciones costosas o destructivas
  app.use('/api/agenda/check', strictLimiter);
  app.use('/api/contacts/sync', strictLimiter);
  app.use('/api/unlink', strictLimiter);
  app.use('/api/agenda/reset-checks', strictLimiter);
  // Cada vista previa hace que el servidor descargue una URL externa
  app.use('/api/link-preview', rateLimit({
    windowMs: 60_000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas vistas previas seguidas, espera un momento' },
  }));

  // Subidas, ya autenticadas
  app.use('/api/messages', uploadOnPost(upload.single('image'), verifyImageContent));
  app.use('/api/status-updates',
    uploadOnPost(upload.array('images', config.limits.imagesPerRequest), verifyImageContent));
  app.use('/api/direct-messages', uploadOnPost(upload.single('image'), verifyImageContent));
  app.use('/api/agenda/import', uploadOnPost(vcfUpload.single('vcf')));

  app.use(statusRoutes);
  app.use(groupsRoutes);
  app.use(messagesRoutes);
  app.use(statusUpdatesRoutes);
  app.use(contactsRoutes);
  app.use(agendaRoutes);
  app.use(directMessagesRoutes);
  app.use(publishedStatusesRoutes);
  app.use(linkPreviewRoutes);

  // Adjuntos: requieren token (cabecera o cookie httpOnly). Ver SEC-006.
  app.use('/uploads', mediaAuthMiddleware, express.static(config.uploadsDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
    },
  }));

  // Salud sin autenticación y sin datos: /health = proceso vivo (para el supervisor),
  // /health/ready = además, sesión de WhatsApp conectada (para monitorización).
  app.get('/health', (req, res) => {
    res.json({ ok: true, whatsapp: getStatus().status, uptime: Math.round(process.uptime()) });
  });
  app.get('/health/ready', (req, res) => {
    const { status } = getStatus();
    res.status(status === 'connected' ? 200 : 503).json({ ok: status === 'connected', whatsapp: status });
  });

  // Frontend compilado
  app.use(express.static(config.clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });

  app.use(errorHandler);

  logger.debug('Aplicación Express construida');
  return app;
}

export default createApp;
