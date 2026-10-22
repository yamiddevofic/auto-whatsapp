import { Router } from 'express';
import fs from 'fs';
import { getStatus, getQR, initWhatsApp, disconnectWhatsApp } from '../whatsapp.js';
import { deleteAllContacts } from '../contacts.js';
import config from '../config.js';
import { logger } from '../logger.js';
import { asyncRoute } from '../middleware/error-handler.js';
import { requireReauth } from '../auth.js';

const router = Router();

router.get('/api/status', (req, res) => {
  res.json(getStatus());
});

router.get('/api/qr', (req, res) => {
  res.json({ qr: getQR() ?? null });
});

router.post('/api/unlink', requireReauth, asyncRoute(async (req, res) => {
  // Operación destructiva: queda registrada con usuario e IP. Ver SEC-025.
  logger.warn({ user: req.user?.username, ip: req.ip }, 'Desvinculación de WhatsApp solicitada');

  await disconnectWhatsApp();

  if (fs.existsSync(config.authDir)) {
    fs.rmSync(config.authDir, { recursive: true, force: true });
    logger.info('Credenciales de sesión de WhatsApp eliminadas');
  }

  deleteAllContacts();

  // Re-inicializa para generar un QR nuevo, dando tiempo al cierre del socket anterior
  setTimeout(() => {
    initWhatsApp().catch((err) => logger.error({ err: err.message }, 'La re-inicialización falló'));
  }, 2000);

  res.json({ success: true, message: 'Desvinculado. Escanea el nuevo QR para vincular.' });
}));

export default router;
