import { Router } from 'express';
import {
  importAgendaContacts,
  getAllAgendaContacts,
  getAgendaCount,
  getAgendaWhatsAppCount,
  getUncheckedAgendaContacts,
  markAgendaWhatsApp,
  markAgendaNotWhatsApp,
  resetAgendaChecks,
  deleteAllAgendaContacts,
  parseVCF,
} from '../agenda.js';
import { checkOnWhatsApp } from '../whatsapp.js';

const router = Router();

router.get('/api/agenda', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const search = (req.query.search || '').toLowerCase().trim();
  const filter = req.query.filter || 'all'; // all | whatsapp | not_whatsapp | unchecked

  let contacts = getAllAgendaContacts();

  if (filter === 'whatsapp') contacts = contacts.filter((c) => c.on_whatsapp === 1);
  else if (filter === 'not_whatsapp') contacts = contacts.filter((c) => c.on_whatsapp === 0 && c.checked_at);
  else if (filter === 'unchecked') contacts = contacts.filter((c) => !c.checked_at);

  if (search) {
    contacts = contacts.filter((c) =>
      c.name.toLowerCase().includes(search) ||
      c.phone.includes(search)
    );
  }

  const total = contacts.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const items = contacts.slice(offset, offset + limit);

  res.json({ items, total, page, totalPages, limit });
});

router.get('/api/agenda/stats', (req, res) => {
  res.json({
    total: getAgendaCount(),
    onWhatsApp: getAgendaWhatsAppCount(),
  });
});

// Upload VCF file
router.post('/api/agenda/import', (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se envio ningun archivo' });
    }

    const vcfText = req.file.buffer.toString('utf-8');
    const contacts = parseVCF(vcfText);

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No se encontraron contactos en el archivo VCF' });
    }

    const count = importAgendaContacts(contacts);
    res.json({ success: true, imported: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Normalize phone number with country code
function normalizePhone(phone, countryCode) {
  // Already has + prefix — assume it's complete
  if (phone.startsWith('+')) return phone;
  // Already starts with country code digits
  if (countryCode && phone.startsWith(countryCode)) return '+' + phone;
  // Prepend country code
  if (countryCode) return '+' + countryCode + phone;
  return phone;
}

// Check which contacts are on WhatsApp (in batches)
router.post('/api/agenda/check', async (req, res) => {
  try {
    const countryCode = (req.body.countryCode || '').replace(/\D/g, '');
    const unchecked = getUncheckedAgendaContacts(50);

    if (unchecked.length === 0) {
      return res.json({ success: true, checked: 0, message: 'Todos los contactos ya fueron verificados' });
    }

    let found = 0;
    for (const contact of unchecked) {
      try {
        // Try the original number first
        let result = await checkOnWhatsApp(contact.phone);

        // If not found and we have a country code, try with it
        if (!result && countryCode) {
          const normalized = normalizePhone(contact.phone, countryCode);
          if (normalized !== contact.phone) {
            result = await checkOnWhatsApp(normalized);
          }
        }

        if (result) {
          markAgendaWhatsApp(contact.phone, result);
          found++;
        } else {
          markAgendaNotWhatsApp(contact.phone);
        }
      } catch {
        markAgendaNotWhatsApp(contact.phone);
      }
    }

    const remaining = getUncheckedAgendaContacts(1).length;
    res.json({ success: true, checked: unchecked.length, found, remaining: remaining > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/agenda/reset-checks', (req, res) => {
  resetAgendaChecks();
  res.json({ success: true });
});

router.delete('/api/agenda', (req, res) => {
  deleteAllAgendaContacts();
  res.json({ success: true });
});

export default router;
