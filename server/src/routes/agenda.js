import { Router } from 'express';
import {
  importAgendaContacts, findAgendaContacts, getAgendaCount, getAgendaWhatsAppCount,
  getUncheckedAgendaContacts, markAgendaWhatsApp, markAgendaNotWhatsApp, resetAgendaChecks,
  deleteAllAgendaContacts, parseVCF,
} from '../agenda.js';
import { checkOnWhatsApp, isConnected } from '../whatsapp.js';
import { requireReauth } from '../auth.js';
import config from '../config.js';
import { logger } from '../logger.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { agendaCheckSchema, paginationSchema } from '../schemas.js';
import { httpError, asyncRoute } from '../middleware/error-handler.js';

const router = Router();

// Lote reducido: verificar muchos números seguidos es un patrón que WhatsApp detecta.
const CHECK_BATCH_SIZE = 15;

router.get('/api/agenda', validateQuery(paginationSchema), (req, res) => {
  const { page, limit, search, filter } = req.validatedQuery;

  const { items, total } = findAgendaContacts({ search, filter, limit, offset: (page - 1) * limit });
  res.json({ items, total, page, totalPages: Math.ceil(total / limit), limit });
});

router.get('/api/agenda/stats', (req, res) => {
  res.json({ total: getAgendaCount(), onWhatsApp: getAgendaWhatsAppCount() });
});

router.post('/api/agenda/import', (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'No se envió ningún archivo .vcf válido');

    const contacts = parseVCF(req.file.buffer.toString('utf-8'));

    if (contacts.length === 0) {
      throw httpError(400, 'No se encontraron contactos en el archivo VCF');
    }
    if (contacts.length > config.limits.maxVcfContacts) {
      throw httpError(413, `El archivo contiene demasiados contactos (máximo ${config.limits.maxVcfContacts})`);
    }

    const imported = importAgendaContacts(contacts);
    logger.info({ imported, user: req.user?.username }, 'Agenda importada');
    res.json({ success: true, imported });
  } catch (err) {
    next(err);
  }
});

/** Añade el código de país a un número que no lo trae. */
function normalizePhone(phone, countryCode) {
  if (phone.startsWith('+')) return phone;
  if (countryCode && phone.startsWith(countryCode)) return `+${phone}`;
  if (countryCode) return `+${countryCode}${phone}`;
  return phone;
}

router.post('/api/agenda/check', validate(agendaCheckSchema), asyncRoute(async (req, res) => {
  const { countryCode } = req.body;
  // Sin conexión, cada consulta fallaría y los contactos quedarían marcados como
  // "sin WhatsApp" por error
  if (!isConnected()) throw httpError(503, 'WhatsApp no está conectado');

  const unchecked = getUncheckedAgendaContacts(CHECK_BATCH_SIZE);

  if (unchecked.length === 0) {
    return res.json({ success: true, checked: 0, message: 'Todos los contactos ya fueron verificados' });
  }

  let found = 0;
  for (const contact of unchecked) {
    try {
      let result = await checkOnWhatsApp(contact.phone);

      if (!result && countryCode) {
        const normalized = normalizePhone(contact.phone, countryCode);
        if (normalized !== contact.phone) result = await checkOnWhatsApp(normalized);
      }

      if (result) {
        markAgendaWhatsApp(contact.phone, result);
        found++;
      } else {
        markAgendaNotWhatsApp(contact.phone);
      }
    } catch (err) {
      if (!isConnected()) throw err; // la conexión cayó a mitad del lote: no marcar nada más
      logger.debug({ err: err.message }, 'Verificación de contacto fallida');
      markAgendaNotWhatsApp(contact.phone);
    }
  }

  res.json({
    success: true,
    checked: unchecked.length,
    found,
    remaining: getUncheckedAgendaContacts(1).length > 0,
  });
}));

router.post('/api/agenda/reset-checks', requireReauth, (req, res) => {
  logger.warn({ user: req.user?.username }, 'Reinicio de verificaciones de agenda');
  resetAgendaChecks();
  res.json({ success: true });
});

router.delete('/api/agenda', requireReauth, (req, res) => {
  logger.warn({ user: req.user?.username, ip: req.ip }, 'Borrado masivo de la agenda');
  deleteAllAgendaContacts();
  res.json({ success: true });
});

export default router;
