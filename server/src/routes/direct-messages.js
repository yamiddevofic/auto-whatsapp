import { Router } from 'express';
import { createDirectMessage, getAllDirectMessages, cancelDirectMessage, getDirectMessageById, updateDirectMessage, deleteDirectMessage } from '../db.js';
import { scheduleDirectMessage, cancelScheduledDirectMessage } from '../scheduler.js';
import { sendMessage, checkOnWhatsApp } from '../whatsapp.js';

const router = Router();

router.get('/api/direct-messages', (req, res) => {
  const messages = getAllDirectMessages();
  res.json(messages);
});

// Send immediately to phone numbers
router.post('/api/direct-messages/send-now', async (req, res) => {
  try {
    let { numbers, content } = req.body;
    const imagePath = req.file ? req.file.path : null;

    if (!content && !imagePath) {
      return res.status(400).json({ error: 'Se requiere texto o imagen' });
    }

    // Parse numbers: comma-separated string
    if (typeof numbers === 'string') {
      numbers = numbers.split(',').map((n) => n.trim()).filter(Boolean);
    }

    if (!numbers || numbers.length === 0) {
      return res.status(400).json({ error: 'Ingresa al menos un numero' });
    }

    // Validate each number on WhatsApp and collect JIDs
    const results = [];
    for (const num of numbers) {
      const jid = await checkOnWhatsApp(num);
      if (jid) {
        try {
          await sendMessage(jid, content || '', imagePath);
          results.push({ number: num, status: 'sent' });
        } catch (err) {
          results.push({ number: num, status: 'failed', error: err.message });
        }
      } else {
        results.push({ number: num, status: 'not_found', error: 'Numero no encontrado en WhatsApp' });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    res.json({ success: true, sent, total: numbers.length, results });
  } catch (err) {
    console.error('[DirectMessages] Send now failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/direct-messages', async (req, res) => {
  try {
    let { recipients, recipientLabel, content, scheduledAt, numbers } = req.body;

    // recipients comes as JSON string from FormData
    if (typeof recipients === 'string') {
      try { recipients = JSON.parse(recipients); } catch { recipients = null; }
    }

    // If numbers provided (comma-separated), resolve them to JIDs
    if (!recipients && numbers) {
      const numList = typeof numbers === 'string'
        ? numbers.split(',').map((n) => n.trim()).filter(Boolean)
        : numbers;

      const jids = [];
      const notFound = [];
      for (const num of numList) {
        const jid = await checkOnWhatsApp(num);
        if (jid) {
          jids.push(jid);
        } else {
          notFound.push(num);
        }
      }

      if (notFound.length > 0 && jids.length === 0) {
        return res.status(400).json({ error: `Ningun numero encontrado en WhatsApp: ${notFound.join(', ')}` });
      }

      recipients = jids;
      recipientLabel = recipientLabel || `${jids.length} numero(s)${notFound.length > 0 ? ` (${notFound.length} no encontrados)` : ''}`;
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
