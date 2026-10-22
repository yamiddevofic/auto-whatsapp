import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import schedule from 'node-schedule';
import config, { migrateLegacyData } from './config.js';
import { logger } from './logger.js';
import { socketAuth } from './auth.js';
import { setIO } from './realtime.js';
import { createApp } from './app.js';
import {
  initDatabase, cleanOrphanUploads, purgeOldHistory, purgeExpiredRevokedTokens, closeDatabase,
} from './db.js';
import { initContactsTable } from './contacts.js';
import { initAgendaTable } from './agenda.js';
import { initWhatsApp } from './whatsapp.js';
import { loadPendingMessages } from './scheduler.js';

let httpServer = null;

/** Corrige permisos de datos creados por versiones anteriores (antes heredaban 0644). */
function restrictDataPermissions() {
  const targets = [
    [config.dataDir, 0o700], [config.authDir, 0o700], [config.uploadsDir, 0o700],
    [config.dbPath, 0o600], [`${config.dbPath}-wal`, 0o600], [`${config.dbPath}-shm`, 0o600],
  ];
  for (const [target, mode] of targets) {
    try {
      fs.chmodSync(target, mode);
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn({ target, err: err.message }, 'No se pudieron ajustar permisos');
    }
  }
  if (fs.existsSync(config.authDir)) {
    for (const file of fs.readdirSync(config.authDir)) {
      try { fs.chmodSync(path.join(config.authDir, file), 0o600); } catch { /* ignorar */ }
    }
  }
}

export async function start() {
  const migrated = migrateLegacyData();
  if (migrated.length > 0) {
    logger.warn({ migrated }, 'Datos movidos al nuevo directorio de datos');
  }

  await initDatabase();
  restrictDataPermissions();
  initContactsTable();
  initAgendaTable();

  const app = createApp();
  httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // El handshake exige un JWT válido: antes cualquier cliente anónimo recibía el QR de
  // vinculación de WhatsApp y todos los mensajes. Ver Docs/02-hallazgos-seguridad.md SEC-003.
  io.use(socketAuth);
  io.on('connection', (socket) => {
    logger.debug({ user: socket.data.user?.username }, 'Cliente conectado por WebSocket');
  });
  setIO(io);

  await initWhatsApp();
  loadPendingMessages();

  // Mantenimiento diario: huérfanos en uploads/ y purga del historial antiguo.
  schedule.scheduleJob('0 4 * * *', () => {
    try {
      cleanOrphanUploads();
      purgeOldHistory();
      purgeExpiredRevokedTokens();
    } catch (err) {
      logger.error({ err: err.message }, 'El mantenimiento diario falló');
    }
  });

  await new Promise((resolve) => {
    httpServer.listen(config.port, config.bindAddr, resolve);
  });

  logger.info(
    { url: `http://${config.bindAddr}:${config.port}`, env: config.env, dataDir: config.dataDir },
    'Servidor escuchando'
  );

  return httpServer;
}

async function shutdown(reason, code = 0) {
  logger.info({ reason }, 'Cerrando el servidor');
  await schedule.gracefulShutdown().catch(() => {});
  closeDatabase();

  if (!httpServer) process.exit(code);

  httpServer.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 5000).unref();
}

// Tras una excepción no capturada el estado del proceso es indefinido: se registra y se
// termina para que el supervisor reinicie limpio. Ver SEC-011.
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Excepción no capturada');
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason: String(reason) }, 'Promesa rechazada sin manejar');
  shutdown('unhandledRejection', 1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
