import { Router } from 'express';
import { getGroups } from '../whatsapp.js';
import { asyncRoute } from '../middleware/error-handler.js';

const router = Router();

router.get('/api/groups', asyncRoute(async (req, res) => {
  res.json(await getGroups());
}));

export default router;
