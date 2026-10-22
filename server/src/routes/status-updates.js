import { Router } from 'express';
import {
  createStatusUpdate, getAllStatusUpdates, cancelStatusUpdate, getStatusUpdateById,
  updateStatusUpdate, deleteStatusUpdate, getAllPublishedStatuses,
} from '../db.js';
import { scheduleStatusUpdateJob, cancelScheduledStatusUpdate } from '../scheduler.js';
import { sendStatusUpdate, countStatusAudiences } from '../whatsapp.js';
import { emit } from '../realtime.js';
import { logger } from '../logger.js';
import { validate } from '../middleware/validate.js';
import {
  createStatusUpdateSchema, sendStatusNowSchema, updateStatusUpdateSchema, statusAudienceQuerySchema,
} from '../schemas.js';
import { validateQuery } from '../middleware/validate.js';
import { parseId, httpError, asyncRoute } from '../middleware/error-handler.js';

const router = Router();

const imagePathsOf = (req) => (req.files || []).map((file) => file.path);

router.get('/api/status-updates', (req, res) => {
  res.json(getAllStatusUpdates());
});

// Cuántas personas recibirían un estado con cada audiencia (para mostrarlo antes de publicar)
router.get('/api/status-audience', validateQuery(statusAudienceQuerySchema), asyncRoute(async (req, res) => {
  res.json(await countStatusAudiences(req.validatedQuery.groupIds));
}));

router.post('/api/status-updates/send-now', validate(sendStatusNowSchema), asyncRoute(async (req, res) => {
  const { content, audience } = req.body;
  const imagePaths = imagePathsOf(req);

  if (!content && imagePaths.length === 0) {
    throw httpError(400, 'Se requiere texto o imagen');
  }

  if (imagePaths.length <= 1) {
    logger.info({ images: imagePaths.length }, 'Publicando estado inmediato');
    await sendStatusUpdate(content || null, imagePaths[0] || null, audience);
  } else {
    // Varias imágenes: se publican en orden, una por estado
    for (let i = 0; i < imagePaths.length; i++) {
      logger.info({ index: i + 1, total: imagePaths.length }, 'Publicando imagen de estado');
      await sendStatusUpdate(i === 0 ? (content || null) : null, imagePaths[i], audience);
    }
  }

  emit('published-statuses:updated', getAllPublishedStatuses());
  res.json({ success: true });
}));

router.post('/api/status-updates', validate(createStatusUpdateSchema), (req, res, next) => {
  try {
    const { content, scheduledAt, audience } = req.body;
    const imagePaths = imagePathsOf(req);

    if (!content && imagePaths.length === 0) {
      throw httpError(400, 'Se requiere texto o imagen');
    }

    const created = [];

    if (imagePaths.length <= 1) {
      const statusUpdate = createStatusUpdate({
        content: content || null,
        imagePath: imagePaths[0] || null,
        scheduledAt,
        audience,
      });
      scheduleStatusUpdateJob(statusUpdate);
      created.push(statusUpdate);
    } else {
      // Una publicación por imagen, escalonadas 5 segundos para no parecer automatizado
      const baseTime = new Date(scheduledAt).getTime();
      for (let i = 0; i < imagePaths.length; i++) {
        const statusUpdate = createStatusUpdate({
          content: i === 0 ? (content || null) : null,
          imagePath: imagePaths[i],
          scheduledAt: new Date(baseTime + i * 5000).toISOString(),
          audience,
        });
        scheduleStatusUpdateJob(statusUpdate);
        created.push(statusUpdate);
      }
    }

    emit('status-updates:updated', getAllStatusUpdates());
    res.status(201).json({ success: true, count: created.length, items: created });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/status-updates/:id', parseId, (req, res, next) => {
  try {
    const statusUpdate = getStatusUpdateById(req.id);
    if (!statusUpdate) throw httpError(404, 'Estado no encontrado');
    if (statusUpdate.status !== 'pending') {
      throw httpError(400, 'Solo se pueden cancelar estados pendientes');
    }

    cancelScheduledStatusUpdate(req.id);
    cancelStatusUpdate(req.id);
    emit('status-updates:updated', getAllStatusUpdates());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.put('/api/status-updates/:id', parseId, validate(updateStatusUpdateSchema), (req, res, next) => {
  try {
    const statusUpdate = getStatusUpdateById(req.id);
    if (!statusUpdate) throw httpError(404, 'Estado no encontrado');
    if (statusUpdate.status !== 'pending') {
      throw httpError(400, 'Solo se pueden editar estados pendientes');
    }

    const updated = updateStatusUpdate(req.id, req.body);
    cancelScheduledStatusUpdate(req.id);
    scheduleStatusUpdateJob(updated);
    emit('status-updates:updated', getAllStatusUpdates());
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/status-updates/:id/permanent', parseId, (req, res, next) => {
  try {
    const statusUpdate = getStatusUpdateById(req.id);
    if (!statusUpdate) throw httpError(404, 'Estado no encontrado');

    if (statusUpdate.status === 'pending') cancelScheduledStatusUpdate(req.id);

    deleteStatusUpdate(req.id);
    emit('status-updates:updated', getAllStatusUpdates());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
