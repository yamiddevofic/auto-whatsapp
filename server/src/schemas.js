import { z } from 'zod';
import config from './config.js';

const MAX_CHARS = config.limits.messageChars;

/** Acepta un array, un JSON serializado o una lista separada por comas (FormData). */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* se trata como lista separada por comas */ }
  }
  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

/** Normaliza un número: quita espacios, guiones y paréntesis, conserva el + inicial. */
function normalizePhone(value) {
  if (typeof value !== 'string') return value;
  const cleaned = value.replace(/[\s\-().]/g, '');
  return cleaned.startsWith('+') ? `+${cleaned.slice(1).replace(/\D/g, '')}` : cleaned.replace(/\D/g, '');
}

const jid = z.string().regex(
  /^[A-Za-z0-9._:-]+@(g\.us|s\.whatsapp\.net)$/,
  'JID de WhatsApp inválido'
);

const phone = z.preprocess(
  normalizePhone,
  z.string().min(7, 'Número demasiado corto').max(20, 'Número demasiado largo')
    .regex(/^\+?\d+$/, 'El número sólo puede contener dígitos')
);

const content = z.string().trim().min(1, 'El texto no puede estar vacío').max(
  MAX_CHARS, `El texto no puede superar ${MAX_CHARS} caracteres`
);

const optionalContent = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().max(MAX_CHARS, `El texto no puede superar ${MAX_CHARS} caracteres`).optional()
);

const scheduledAt = z.string()
  .min(1, 'Se requiere fecha y hora de envío')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Fecha y hora inválidas')
  .refine(
    (value) => new Date(value).getTime() > Date.now() - 10 * 60 * 1000,
    'La fecha indicada ya pasó hace más de 10 minutos'
  );

const recipients = z.preprocess(
  toArray,
  z.array(jid)
    .min(1, 'Selecciona al menos un contacto')
    .max(500, 'Máximo 500 destinatarios por envío programado')
);

const numberList = (max, message) => z.preprocess(
  toArray,
  z.array(phone).min(1, 'Ingresa al menos un número').max(max, message)
);

const numbers = numberList(500, 'Máximo 500 números por envío programado');

// --- Mensajes a grupos ---

export const createMessageSchema = z.object({
  groupId: jid,
  groupName: z.string().trim().min(1).max(200),
  content,
  scheduledAt,
});

export const updateMessageSchema = z.object({
  content: content.optional(),
  scheduledAt: scheduledAt.optional(),
  groupId: jid.optional(),
  groupName: z.string().trim().min(1).max(200).optional(),
});

// --- Estados ---

// Audiencia de un estado. Llega como texto JSON (multipart) o como objeto.
export const audience = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return { mode: 'all' };
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  },
  z.object({
    mode: z.enum(['all', 'agenda', 'groups', 'custom', 'me']),
    groupIds: z.array(z.string().regex(/^[\w.-]+@g\.us$/, 'Grupo inválido')).max(200, 'Máximo 200 grupos').optional(),
  }).refine((a) => a.mode !== 'custom' || (a.groupIds?.length ?? 0) > 0, {
    message: 'Elige al menos un grupo',
    path: ['groupIds'],
  })
);

export const createStatusUpdateSchema = z.object({
  content: optionalContent,
  scheduledAt,
  audience,
});

export const sendStatusNowSchema = z.object({
  content: optionalContent,
  audience,
});

export const statusAudienceQuerySchema = z.object({
  groupIds: z.preprocess(
    (v) => (typeof v === 'string' && v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []),
    z.array(z.string().regex(/^[\w.-]+@g\.us$/)).max(200)
  ),
});

export const updateStatusUpdateSchema = z.object({
  content: optionalContent,
  scheduledAt: scheduledAt.optional(),
});

// --- Mensajes directos ---

export const createDirectMessageSchema = z.object({
  recipients: recipients.optional(),
  numbers: numbers.optional(),
  recipientLabel: z.string().trim().max(200).optional(),
  content,
  scheduledAt,
}).refine(
  (data) => data.recipients?.length || data.numbers?.length,
  { message: 'Selecciona al menos un contacto o ingresa un número', path: ['recipients'] }
);

export const sendDirectNowSchema = z.object({
  numbers: numberList(
    config.limits.immediateRecipients,
    `Máximo ${config.limits.immediateRecipients} destinatarios en envío inmediato; para más, programa el envío`
  ),
  content: optionalContent,
});

export const updateDirectMessageSchema = z.object({
  content: content.optional(),
  scheduledAt: scheduledAt.optional(),
});

// --- Agenda y contactos ---

export const agendaCheckSchema = z.object({
  countryCode: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v),
    z.string().max(4, 'Código de país inválido').optional()
  ),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  // Hasta 10000: "Seleccionar todos" del cliente pide la lista completa en una página
  limit: z.coerce.number().int().min(1).max(10000).catch(50),
  search: z.string().trim().max(100).catch(''),
  filter: z.enum(['all', 'whatsapp', 'not_whatsapp', 'unchecked']).catch('all'),
});

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const linkPreviewQuerySchema = z.object({
  url: z.string().trim().min(1, 'Falta el enlace').max(2048, 'El enlace es demasiado largo')
    .refine((u) => /^https?:\/\//i.test(u), 'Sólo se admiten enlaces http o https'),
});
