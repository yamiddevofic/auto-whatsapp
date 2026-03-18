import { Router } from 'express';
import { createMessage, getAllMessages, cancelMessage, getMessageById, updateMessage, deleteMessage } from '../db.js';
import { scheduleMessage, cancelScheduledMessage } from '../scheduler.js';

const router = Router();

router.get('/api/messages', (req, res) => {
  const messages = getAllMessages();
  res.json(messages);
});

router.post('/api/messages', (req, res) => {
  try {
    const { groupId, groupName, content, scheduledAt } = req.body;

    if (!groupId || !groupName || !content || !scheduledAt) {
      return res.status(400).json({ error: 'Missing required fields: groupId, groupName, content, scheduledAt' });
    }

    const imagePath = req.file ? req.file.path : null;

    const msg = createMessage({
      groupId,
      groupName,
      content,
      imagePath,
      scheduledAt,
    });

    scheduleMessage(msg);
    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const msg = getMessageById(id);

  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (msg.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending messages can be cancelled' });
  }

  cancelScheduledMessage(id);
  cancelMessage(id);
  res.json({ success: true });
});

router.put('/api/messages/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const msg = getMessageById(id);

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (msg.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending messages can be edited' });
    }

    const { content, scheduledAt, groupId, groupName } = req.body;
    const updated = updateMessage(id, { content, scheduledAt, groupId, groupName });

    // Reschedule if the time changed
    cancelScheduledMessage(id);
    scheduleMessage(updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/messages/:id/permanent', (req, res) => {
  const id = parseInt(req.params.id);
  const msg = getMessageById(id);

  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (msg.status === 'pending') {
    cancelScheduledMessage(id);
  }

  deleteMessage(id);
  res.json({ success: true });
});

export default router;
