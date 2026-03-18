import { Router } from 'express';
import { createStatusUpdate, getAllStatusUpdates, cancelStatusUpdate, getStatusUpdateById, updateStatusUpdate, deleteStatusUpdate } from '../db.js';
import { scheduleStatusUpdateJob, cancelScheduledStatusUpdate } from '../scheduler.js';
import { sendStatusUpdate } from '../whatsapp.js';

const router = Router();

router.get('/api/status-updates', (req, res) => {
  const updates = getAllStatusUpdates();
  res.json(updates);
});

router.post('/api/status-updates/send-now', async (req, res) => {
  try {
    const { content } = req.body;
    const imagePath = req.file ? req.file.path : null;

    if (!content && !imagePath) {
      return res.status(400).json({ error: 'Se requiere texto o imagen' });
    }

    console.log('[StatusUpdate] Sending now:', { content: content?.substring(0, 30), imagePath });
    await sendStatusUpdate(content || null, imagePath);
    res.json({ success: true });
  } catch (err) {
    console.error('[StatusUpdate] Send now failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/status-updates', (req, res) => {
  try {
    const { content, scheduledAt } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Se requiere fecha y hora de envio' });
    }

    const imagePath = req.file ? req.file.path : null;

    if (!content && !imagePath) {
      return res.status(400).json({ error: 'Se requiere texto o imagen' });
    }

    const su = createStatusUpdate({
      content: content || null,
      imagePath,
      scheduledAt,
    });

    scheduleStatusUpdateJob(su);
    res.status(201).json(su);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/status-updates/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const su = getStatusUpdateById(id);

  if (!su) {
    return res.status(404).json({ error: 'Status update not found' });
  }

  if (su.status !== 'pending') {
    return res.status(400).json({ error: 'Solo se pueden cancelar estados pendientes' });
  }

  cancelScheduledStatusUpdate(id);
  cancelStatusUpdate(id);
  res.json({ success: true });
});

router.put('/api/status-updates/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const su = getStatusUpdateById(id);

    if (!su) {
      return res.status(404).json({ error: 'Status update not found' });
    }

    if (su.status !== 'pending') {
      return res.status(400).json({ error: 'Solo se pueden editar estados pendientes' });
    }

    const { content, scheduledAt } = req.body;
    const updated = updateStatusUpdate(id, { content, scheduledAt });

    cancelScheduledStatusUpdate(id);
    scheduleStatusUpdateJob(updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/status-updates/:id/permanent', (req, res) => {
  const id = parseInt(req.params.id);
  const su = getStatusUpdateById(id);

  if (!su) {
    return res.status(404).json({ error: 'Status update not found' });
  }

  if (su.status === 'pending') {
    cancelScheduledStatusUpdate(id);
  }

  deleteStatusUpdate(id);
  res.json({ success: true });
});

export default router;
