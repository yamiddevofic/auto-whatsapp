import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import config from '../config.js';
import { logger } from '../logger.js';
import {
  generateToken, revokeToken, bearerFrom, setMediaCookie, clearMediaCookie, authMiddleware,
} from '../auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../schemas.js';
import { asyncRoute } from '../middleware/error-handler.js';

const { username: VALID_USERNAME, passwordHash: PASSWORD_HASH } = config.auth;

/** Comparación en tiempo constante. Antes se usaba === . Ver SEC-007. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Límite de intentos: antes el login admitía fuerza bruta ilimitada. Ver SEC-007.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos fallidos. Vuelve a intentarlo en 15 minutos.' },
});

export default function authRoutes() {
  const router = Router();

  router.post('/login', loginLimiter, validate(loginSchema), asyncRoute(async (req, res) => {
    const { username, password } = req.body;

    const userOk = safeEqual(username, VALID_USERNAME);
    // El hash se verifica siempre, también con usuario incorrecto: así el tiempo de
    // respuesta no revela si el usuario existe.
    const passOk = await bcrypt.compare(password, PASSWORD_HASH);

    if (!userOk || !passOk) {
      logger.warn({ ip: req.ip }, 'Intento de inicio de sesión fallido');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken(username);
    setMediaCookie(res, token);
    logger.info({ user: username, ip: req.ip }, 'Inicio de sesión correcto');
    res.json({ token, username });
  }));

  router.post('/logout', authMiddleware, (req, res) => {
    const token = bearerFrom(req);
    if (token) revokeToken(token);
    clearMediaCookie(res);
    logger.info({ user: req.user?.username }, 'Sesión cerrada');
    res.json({ success: true });
  });

  return router;
}
