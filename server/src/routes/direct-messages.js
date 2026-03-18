import { Router } from 'express';
import { createDirectMessage, getAllDirectMessages, cancelDirectMessage, getDirectMessageById, updateDirectMessage, deleteDirectMessage } from '../db.js';
import { scheduleDirectMessage, cancelScheduledDirectMessage } from '../scheduler.js';

const router = Router();

router.get('/api/direct-messages', (req, res) => {
  const messages = getAllDirectMessages();
  res.json(messages);
});

router.post('/api/direct-messages', (req, res) => {
  try {
    let { recipients, recipientLabel, content, scheduledAt } = req.body;

    // recipients comes as JSON string from FormData
    if (typeof recipients === 'string') {
      try { recipients = JSON.parse(recipients); } catch { recipients = null; }
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos un contacto' });
    }
    if (!content || !scheduledAt) {
      return res.status(400).json({ error: 'Faltan campos requeridos: content, scheduledAt' });
    }

    const imagePath = req.file ? req.file.path : null;

    const msg = createDirectMessage({
      recipients,
      recipientLabel: recipientLabel || `${recipients.length} contactos`,
      content,
      imagePath,
      scheduledAt,
    });

    scheduleDirectMessage(msg);
    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/direct-messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const msg = getDirectMessageById(id);

  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
  if (msg.status !== 'pending') return res.status(400).json({ error: 'Solo se pueden cancelar mensajes pendientes' });

  cancelScheduledDirectMessage(id);
  cancelDirectMessage(id);
  res.json({ success: true });
});

router.put('/api/direct-messages/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const msg = getDirectMessageById(id);

    if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (msg.status !== 'pending') return res.status(400).json({ error: 'Solo se pueden editar mensajes pendientes' });

    const { content, scheduledAt } = req.body;
    const updated = updateDirectMessage(id, { content, scheduledAt });

    cancelScheduledDirectMessage(id);
    scheduleDirectMessage(updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/direct-messages/:id/permanent', (req, res) => {
  const id = parseInt(req.params.id);
  const msg = getDirectMessageById(id);

  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });

  if (msg.status === 'pending') {
    cancelScheduledDirectMessage(id);
  }

  deleteDirectMessage(id);
  res.json({ success: true });
});

export default router;
