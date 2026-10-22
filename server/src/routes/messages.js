import { Router } from 'express';
import {
  createMessage, getAllMessages, cancelMessage, getMessageById, updateMessage, deleteMessage,
} from '../db.js';
import { scheduleMessage, cancelScheduledMessage } from '../scheduler.js';
import { emit } from '../realtime.js';
import { validate } from '../middleware/validate.js';
import { createMessageSchema, updateMessageSchema } from '../schemas.js';
import { parseId, httpError } from '../middleware/error-handler.js';

const router = Router();

router.get('/api/messages', (req, res) => {
  res.json(getAllMessages());
});

router.post('/api/messages', validate(createMessageSchema), (req, res, next) => {
  try {
    const { groupId, groupName, content, scheduledAt } = req.body;

    const msg = createMessage({
      groupId,
      groupName,
      content,
      imagePath: req.file ? req.file.path : null,
      scheduledAt,
    });

    scheduleMessage(msg);
    emit('messages:updated', getAllMessages());
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/messages/:id', parseId, (req, res, next) => {
  try {
    const msg = getMessageById(req.id);
    if (!msg) throw httpError(404, 'Mensaje no encontrado');
    if (msg.status !== 'pending') throw httpError(400, 'Solo se pueden cancelar mensajes pendientes');

    cancelScheduledMessage(req.id);
    cancelMessage(req.id);
    emit('messages:updated', getAllMessages());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.put('/api/messages/:id', parseId, validate(updateMessageSchema), (req, res, next) => {
  try {
    const msg = getMessageById(req.id);
    if (!msg) throw httpError(404, 'Mensaje no encontrado');
    if (msg.status !== 'pending') throw httpError(400, 'Solo se pueden editar mensajes pendientes');

    const updated = updateMessage(req.id, req.body);

    cancelScheduledMessage(req.id);
    scheduleMessage(updated);
    emit('messages:updated', getAllMessages());
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/messages/:id/permanent', parseId, (req, res, next) => {
  try {
    const msg = getMessageById(req.id);
    if (!msg) throw httpError(404, 'Mensaje no encontrado');

    if (msg.status === 'pending') cancelScheduledMessage(req.id);

    deleteMessage(req.id);
    emit('messages:updated', getAllMessages());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
