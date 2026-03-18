import { Router } from 'express';
import fs from 'fs';
import { getStatus, getQR, initWhatsApp, disconnectWhatsApp } from '../whatsapp.js';
import { deleteAllContacts } from '../contacts.js';
import config from '../config.js';

const router = Router();

router.get('/api/status', (req, res) => {
  res.json(getStatus());
});

router.get('/api/qr', (req, res) => {
  const qr = getQR();
  if (qr) {
    res.json({ qr });
  } else {
    res.json({ qr: null });
  }
});

router.post('/api/unlink', async (req, res) => {
  try {
    // Disconnect current session
    await disconnectWhatsApp();

    // Delete auth credentials
    if (fs.existsSync(config.authDir)) {
      fs.rmSync(config.authDir, { recursive: true, force: true });
      console.log('[Server] Auth info deleted');
    }

    // Clear contacts so they re-sync on new link
    deleteAllContacts();

    // Re-init to generate new QR — wait a bit for socket cleanup
    setTimeout(() => {
      initWhatsApp().catch((e) => console.error('[Server] Re-init failed:', e.message));
    }, 2000);

    res.json({ success: true, message: 'Desvinculado. Escanea el nuevo QR para vincular.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
