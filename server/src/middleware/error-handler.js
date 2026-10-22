import crypto from 'crypto';
import { logger } from '../logger.js';

/** Envuelve manejadores asíncronos para que sus rechazos lleguen al errorHandler. */
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Normaliza los ids numéricos de ruta. Antes se usaba parseInt sin validar (NaN). */
export function parseId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  req.id = id;
  next();
}

const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: [413, 'El archivo supera el tamaño máximo permitido'],
  LIMIT_FILE_COUNT: [413, 'Demasiados archivos en la misma petición'],
  LIMIT_UNEXPECTED_FILE: [400, 'Campo de archivo inesperado'],
};

/**
 * Manejador de errores centralizado: registra el detalle y devuelve un mensaje genérico
 * con una referencia. Antes cada router devolvía err.message al cliente, filtrando rutas
 * del sistema y detalles internos. Ver Docs/02-hallazgos-seguridad.md SEC-012.
 */
export function errorHandler(err, req, res, _next) {
  const ref = crypto.randomBytes(4).toString('hex');
  logger.error(
    { ref, method: req.method, path: req.path, err: err.message, stack: err.stack },
    'Error no controlado en una petición'
  );

  if (res.headersSent) return;

  const multer = MULTER_ERRORS[err.code];
  if (multer) return res.status(multer[0]).json({ error: multer[1], ref });

  // Errores marcados explícitamente como públicos (httpError), incluidos los 503 de
  // "WhatsApp no está conectado"; el resto de 4xx (body-parser...) sin cambios
  if (err.publicMessage && err.status) {
    return res.status(err.status).json({ error: err.publicMessage, ref });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.publicMessage || err.message, ref });
  }

  res.status(500).json({ error: 'Error interno del servidor', ref });
}

/** Crea un error con mensaje seguro para el cliente. */
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}
