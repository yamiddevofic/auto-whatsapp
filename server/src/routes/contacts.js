import { Router } from 'express';
import { getAllContacts, getContactCount, deleteAllContacts } from '../contacts.js';
import { syncContactsFromGroups } from '../whatsapp.js';

const router = Router();

router.get('/api/contacts', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const search = (req.query.search || '').toLowerCase().trim();

  let contacts = getAllContacts();

  if (search) {
    contacts = contacts.filter((c) =>
      (c.notify && c.notify.toLowerCase().includes(search)) ||
      (c.name && c.name.toLowerCase().includes(search)) ||
      (c.agenda_name && c.agenda_name.toLowerCase().includes(search)) ||
      (c.groups_list && c.groups_list.toLowerCase().includes(search)) ||
      c.jid.toLowerCase().includes(search)
    );
  }

  const total = contacts.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const items = contacts.slice(offset, offset + limit);

  res.json({ items, total, page, totalPages, limit });
});

router.get('/api/contacts/count', (req, res) => {
  const count = getContactCount();
  res.json({ count });
});

router.post('/api/contacts/sync', async (req, res) => {
  try {
    const count = await syncContactsFromGroups();
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/contacts', (req, res) => {
  deleteAllContacts();
  res.json({ success: true });
});

export default router;
