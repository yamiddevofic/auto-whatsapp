import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

// Los datos sensibles (sesión de WhatsApp, base de datos, adjuntos) viven fuera del
// árbol que sirve el servidor web. Ver Docs/02-hallazgos-seguridad.md SEC-015.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data');

function requireEnv(name, { minLength = 1 } = {}) {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `[FATAL] La variable de entorno ${name} es obligatoria` +
      (minLength > 1 ? ` y debe tener al menos ${minLength} caracteres.` : '.') +
      ' Copia .env.example a .env y complétala.'
    );
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3001,
  bindAddr: process.env.BIND_ADDR || '127.0.0.1',

  // true cuando un proxy sirve la app por HTTPS: activa HSTS, upgrade-insecure-requests
  // y la marca Secure en la cookie de adjuntos.
  behindTls: process.env.BEHIND_TLS === 'true',

  dataDir: DATA_DIR,
  uploadsDir: path.join(DATA_DIR, 'uploads'),
  authDir: path.join(DATA_DIR, 'auth_info'),
  dbPath: path.join(DATA_DIR, 'data.db'),
  clientDist: path.join(ROOT_DIR, 'client/dist'),

  // Orígenes permitidos por CORS. Vacío = sólo mismo origen (recomendado en producción).
  allowedOrigins: (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  auth: {
    username: requireEnv('AUTH_USERNAME'),
    passwordHash: requireEnv('AUTH_PASSWORD_HASH'),
    secret: requireEnv('AUTH_SECRET', { minLength: 32 }),
    tokenTtl: process.env.AUTH_TOKEN_TTL || '8h',
    cookieName: 'aw_media',
  },

  limits: {
    jsonBody: '1mb',
    imageBytes: 8 * 1024 * 1024,
    imagesPerRequest: 20,
    vcfBytes: 10 * 1024 * 1024,
    maxVcfContacts: 20000,
    immediateRecipients: 20,
    messageChars: 4096,
  },

  // Retención de mensajes históricos (0 = sin purga automática)
  retentionDays: Number(process.env.RETENTION_DAYS) || 0,
};

// Los directorios deben existir antes de que db.js abra la base de datos.
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.uploadsDir, { recursive: true, mode: 0o700 });

// Migración de instalaciones antiguas: los datos vivían en la raíz del proyecto.
export function migrateLegacyData() {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(config.uploadsDir, { recursive: true, mode: 0o700 });

  const legacy = [
    [path.join(ROOT_DIR, 'data.db'), config.dbPath],
    [path.join(ROOT_DIR, 'auth_info'), config.authDir],
    [path.join(ROOT_DIR, 'uploads'), config.uploadsDir],
  ];

  const migrated = [];
  for (const [from, to] of legacy) {
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.renameSync(from, to);
      migrated.push(`${path.basename(from)} -> ${to}`);
    }
  }
  return migrated;
}

export default config;
