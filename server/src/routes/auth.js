import express from 'express';
import { generateToken } from '../auth.js';

const router = express.Router();

export default function authRoutes() {
  const VALID_USERNAME = process.env.AUTH_USERNAME || 'yamiddev';
  const VALID_PASSWORD = process.env.AUTH_PASSWORD || 'nidian56';

  router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      const token = generateToken(username);
      return res.json({ token, username });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  });

  return router;
}
