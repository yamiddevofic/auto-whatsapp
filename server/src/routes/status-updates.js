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
    const imagePaths = (req.files || []).map((f) => f.path);

    if (!content && imagePaths.length === 0) {
      return res.status(400).json({ error: 'Se requiere texto o imagen' });
    }

    if (imagePaths.length <= 1) {
      // Single image or text-only
      const imagePath = imagePaths[0] || null;
      console.log('[StatusUpdate] Sending now:', { content: content?.substring(0, 30), imagePath });
      await sendStatusUpdate(content || null, imagePath);
    } else {
      // Multiple images — send one by one in order
      for (let i = 0; i < imagePaths.length; i++) {
        const caption = i === 0 ? (content || null) : null;
        console.log(`[StatusUpdate] Sending image ${i + 1}/${imagePaths.length}:`, imagePaths[i]);
        await sendStatusUpdate(caption, imagePaths[i]);
      }
    }

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

    const imagePaths = (req.files || []).map((f) => f.path);

    if (!content && imagePaths.length === 0) {
      return res.status(400).json({ error: 'Se requiere texto o imagen' });
    }

    const created = [];

    if (imagePaths.length <= 1) {
      // Single image or text-only
      const su = createStatusUpdate({
        content: content || null,
        imagePath: imagePaths[0] || null,
        scheduledAt,
      });
      scheduleStatusUpdateJob(su);
      created.push(su);
    } else {
      // Multiple images — create one status per image, staggered by 5 seconds
      const baseTime = new Date(scheduledAt).getTime();
      for (let i = 0; i < imagePaths.length; i++) {
        const staggeredTime = new Date(baseTime + i * 5000).toISOString();
        const caption = i === 0 ? (content || null) : null;
        const su = createStatusUpdate({
          content: caption,
          imagePath: imagePaths[i],
          scheduledAt: staggeredTime,
        });
        scheduleStatusUpdateJob(su);
        created.push(su);
      }
    }

    res.status(201).json({ success: true, count: created.length, items: created });
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
