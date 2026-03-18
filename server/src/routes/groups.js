import { Router } from 'express';
import { getGroups } from '../whatsapp.js';

const router = Router();

router.get('/api/groups', async (req, res) => {
  try {
    const groups = await getGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
