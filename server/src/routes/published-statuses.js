import { Router } from 'express';
import { getAllPublishedStatuses, deletePublishedStatus } from '../db.js';
import { emit } from '../realtime.js';
import { parseId, httpError } from '../middleware/error-handler.js';

const router = Router();

router.get('/api/published-statuses', (req, res) => {
  res.json(getAllPublishedStatuses());
});

router.delete('/api/published-statuses/:id', parseId, (req, res, next) => {
  try {
    const status = deletePublishedStatus(req.id);
    if (!status) throw httpError(404, 'Estado publicado no encontrado');

    emit('published-statuses:updated', getAllPublishedStatuses());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
