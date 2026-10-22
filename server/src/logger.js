import pino from 'pino';
import config from './config.js';

// Los datos personales (teléfonos, nombres, contenido de mensajes) no deben quedar en
// texto plano en los logs. Ver Docs/02-hallazgos-seguridad.md SEC-017.
export const logger = pino({
  level: process.env.LOG_LEVEL || (config.env === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'phone', 'phones', 'numbers', 'content', 'recipients', 'jids', 'password', 'token',
      '*.phone', '*.numbers', '*.content', '*.recipients', '*.password', '*.token',
    ],
    censor: '[redactado]',
  },
  transport: config.env === 'production'
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
});

/** Enmascara un JID o teléfono dejando sólo los extremos: 573001234567 -> 573****567 */
export function maskJid(jid) {
  if (!jid || typeof jid !== 'string') return '[vacío]';
  const [user, domain] = jid.split('@');
  const masked = user.length <= 6
    ? `${user.slice(0, 2)}***`
    : `${user.slice(0, 3)}***${user.slice(-3)}`;
  return domain ? `${masked}@${domain}` : masked;
}

/** Cuenta elementos sin exponerlos. */
export const count = (arr) => (Array.isArray(arr) ? arr.length : 0);

export default logger;
