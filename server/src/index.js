// Punto de entrada. Carga el .env y arranca el servidor, reportando de forma legible los
// errores de configuración (variables obligatorias ausentes) antes de cualquier otra cosa.
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = process.env.ENV_FILE || path.join(ROOT_DIR, '.env');

if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Todo lo que cree el proceso (base de datos, WAL, sesión de WhatsApp, adjuntos) queda
// legible sólo por su usuario. Ver Docs/02-hallazgos-seguridad.md SEC-015.
process.umask(0o077);

try {
  const { start } = await import('./server.js');
  await start();
} catch (err) {
  if (err?.message?.startsWith('[FATAL]')) {
    console.error(err.message);
  } else {
    console.error('[FATAL] El servidor no pudo arrancar:', err);
  }
  process.exit(1);
}
