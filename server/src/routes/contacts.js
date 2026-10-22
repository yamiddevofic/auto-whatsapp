import { Router } from 'express';
import { findContacts, getContactCount, deleteAllContacts } from '../contacts.js';
import { requireReauth } from '../auth.js';
import { syncContactsFromGroups } from '../whatsapp.js';
import { logger } from '../logger.js';
import { validateQuery } from '../middleware/validate.js';
import { paginationSchema } from '../schemas.js';
import { asyncRoute } from '../middleware/error-handler.js';

const router = Router();

router.get('/api/contacts', validateQuery(paginationSchema), (req, res) => {
  const { page, limit, search } = req.validatedQuery;

  const { items, total } = findContacts({ search, limit, offset: (page - 1) * limit });
  res.json({ items, total, page, totalPages: Math.ceil(total / limit), limit });
});

router.get('/api/contacts/count', (req, res) => {
  res.json({ count: getContactCount() });
});

router.post('/api/contacts/sync', asyncRoute(async (req, res) => {
  const { count, hiddenMembers } = await syncContactsFromGroups();
  res.json({ success: true, count, hiddenMembers });
}));

router.delete('/api/contacts', requireReauth, (req, res) => {
  logger.warn({ user: req.user?.username, ip: req.ip }, 'Borrado masivo de contactos');
  deleteAllContacts();
  res.json({ success: true });
});

export default router;
