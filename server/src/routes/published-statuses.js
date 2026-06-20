import { Router } from 'express';
import { getAllPublishedStatuses, deletePublishedStatus } from '../db.js';
import { io } from '../index.js';

const router = Router();

router.get('/api/published-statuses', (req, res) => {
  const statuses = getAllPublishedStatuses();
  res.json(statuses);
});

router.delete('/api/published-statuses/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const status = deletePublishedStatus(id);
  
  if (!status) {
    return res.status(404).json({ error: 'Estado publicado no encontrado' });
  }
  
  io.emit('published-statuses:updated', getAllPublishedStatuses());
  res.json({ success: true });
});

export default router;
