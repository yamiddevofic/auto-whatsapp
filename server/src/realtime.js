// Bus de eventos en tiempo real. Evita la dependencia circular que existía cuando
// whatsapp.js, scheduler.js y los routers importaban `io` desde index.js.
// Ver Docs/04-calidad-arquitectura.md ARQ-002.
import { logger } from './logger.js';

let io = null;

export function setIO(instance) {
  io = instance;
}

export function emit(event, payload) {
  if (!io) {
    logger.debug({ event }, 'Evento descartado: Socket.IO todavía no está inicializado');
    return;
  }
  io.emit(event, payload);
}

export function getIO() {
  return io;
}
