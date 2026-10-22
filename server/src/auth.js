import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from './config.js';
import { logger } from './logger.js';
import { revokeTokenId, isTokenIdRevoked } from './db.js';
import { getIO } from './realtime.js';

const { secret: SECRET_KEY, tokenTtl: TOKEN_TTL, cookieName: COOKIE_NAME } = config.auth;

export function generateToken(username) {
  const jti = crypto.randomUUID();
  return jwt.sign({ username, jti }, SECRET_KEY, {
    expiresIn: TOKEN_TTL,
    issuer: 'auto-whatsapp',
  });
}

export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, SECRET_KEY, { issuer: 'auto-whatsapp' });
    // Lista de revocación persistente: el logout invalida el token antes de su expiración.
    // Ver Docs/02-hallazgos-seguridad.md SEC-020.
    if (!decoded.jti || isTokenIdRevoked(decoded.jti)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function revokeToken(token) {
  try {
    const decoded = jwt.verify(token, SECRET_KEY, { issuer: 'auto-whatsapp' });
    if (decoded.jti) {
      revokeTokenId(decoded.jti, (decoded.exp ?? 0) * 1000);
      disconnectSockets(decoded.jti);
      return true;
    }
  } catch {
    // Token ya inválido: nada que revocar
  }
  return false;
}

export function bearerFrom(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Protege la API: exige el token en la cabecera Authorization. */
export function authMiddleware(req, res, next) {
  const token = bearerFrom(req);
  if (!token) return res.status(401).json({ error: 'No se proporcionó token' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Token inválido o expirado' });

  req.user = decoded;
  req.token = token;
  next();
}

/**
 * Protege los adjuntos de /uploads. Acepta la cabecera Authorization (fetch) o la cookie
 * httpOnly emitida en el login, para que las etiquetas <img> sigan funcionando sin
 * exponer los archivos de forma anónima. La cookie sólo habilita lecturas GET: las
 * operaciones de la API siguen exigiendo la cabecera, así que no hay superficie de CSRF.
 * Ver Docs/02-hallazgos-seguridad.md SEC-006.
 */
export function mediaAuthMiddleware(req, res, next) {
  const token = bearerFrom(req) || req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Token inválido o expirado' });

  req.user = decoded;
  next();
}

export function setMediaCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.behindTls,
    path: '/uploads',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export function clearMediaCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/uploads' });
}

/** Cierra los WebSockets abiertos con un token concreto (logout). */
function disconnectSockets(jti) {
  const io = getIO();
  if (!io) return;
  for (const socket of io.of('/').sockets.values()) {
    if (socket.data.user?.jti === jti) socket.disconnect(true);
  }
}

/**
 * Reautenticación para operaciones destructivas: exige la contraseña actual en el cuerpo
 * (`password`) y deja constancia en el log de auditoría. Ver SEC-025.
 */
export async function requireReauth(req, res, next) {
  try {
    const password = req.body?.password;
    const ok = typeof password === 'string' && password.length > 0 && password.length <= 200 &&
      await bcrypt.compare(password, config.auth.passwordHash);
    const audit = { user: req.user?.username, ip: req.ip, action: `${req.method} ${req.originalUrl}` };

    if (!ok) {
      logger.warn({ ...audit, audit: true }, 'Operación destructiva rechazada: contraseña incorrecta');
      // 403 y no 401: el cliente interpreta 401 como sesión caducada y cerraría la sesión
      return res.status(403).json({ error: 'Contraseña incorrecta' });
    }

    logger.warn({ ...audit, audit: true }, 'Operación destructiva autorizada');
    next();
  } catch (err) {
    next(err);
  }
}

/** Autenticación del handshake de Socket.IO. Ver SEC-003. */
export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  const decoded = token ? verifyToken(token) : null;

  if (!decoded) {
    logger.warn({ ip: socket.handshake.address }, 'Conexión WebSocket rechazada sin token válido');
    return next(new Error('unauthorized'));
  }

  socket.data.user = decoded;

  // El handshake sólo se verifica una vez: cerrar el socket cuando caduque el token
  const msLeft = Math.min((decoded.exp ?? 0) * 1000 - Date.now(), 2 ** 31 - 1);
  const timer = setTimeout(() => socket.disconnect(true), Math.max(0, msLeft));
  socket.on('disconnect', () => clearTimeout(timer));

  next();
}
