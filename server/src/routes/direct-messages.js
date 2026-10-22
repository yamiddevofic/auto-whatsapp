import { Router } from 'express';
import crypto from 'crypto';
import {
  createDirectMessage, getAllDirectMessages, cancelDirectMessage, getDirectMessageById,
  updateDirectMessage, deleteDirectMessage, canSendMoreMessages, incrementMessageCount,
  getDailyLimit, deleteAttachment,
} from '../db.js';
import { scheduleDirectMessage, cancelScheduledDirectMessage, randomSendDelay } from '../scheduler.js';
import { sendMessage, checkOnWhatsApp, isConnected } from '../whatsapp.js';
import { emit } from '../realtime.js';
import { logger, maskJid } from '../logger.js';
import { validate } from '../middleware/validate.js';
import {
  createDirectMessageSchema, sendDirectNowSchema, updateDirectMessageSchema,
} from '../schemas.js';
import { parseId, httpError, asyncRoute } from '../middleware/error-handler.js';

const router = Router();

router.get('/api/direct-messages', (req, res) => {
  res.json(getAllDirectMessages());
});

/** Envía a cada número con retardo aleatorio y publica el resultado por WebSocket. */
async function runImmediateSend(jobId, numbers, content, imagePath) {
  const results = [];
  try {
    for (const [index, number] of numbers.entries()) {
      if (!canSendMoreMessages(1)) {
        results.push({ number, status: 'failed', error: 'Límite diario alcanzado' });
        continue;
      }

      try {
        const jid = await checkOnWhatsApp(number);
        if (!jid) {
          results.push({ number, status: 'not_found', error: 'Numero no encontrado en WhatsApp' });
          continue;
        }
        await sendMessage(jid, content || null, imagePath);
        incrementMessageCount();
        results.push({ number, status: 'sent' });
        logger.info({ jid: maskJid(jid) }, 'Mensaje directo enviado');
      } catch (err) {
        logger.error({ number: maskJid(number), err: err.message }, 'Fallo al enviar mensaje directo');
        results.push({ number, status: 'failed', error: 'No se pudo enviar' });
      }

      // Retardo aleatorio también en el envío inmediato, para no disparar la detección
      // antispam de WhatsApp.
      if (index < numbers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, randomSendDelay()));
      }
    }
  } finally {
    emit('direct-messages:send-now-result', {
      jobId,
      sent: results.filter((r) => r.status === 'sent').length,
      total: numbers.length,
      results,
    });
    // El adjunto de un envío inmediato no lo referencia ninguna fila
    deleteAttachment(imagePath);
  }
}

// Envío inmediato a números concretos. El número de destinatarios está acotado por el
// esquema y se respeta el límite diario anti-bloqueo (SEC-014). Responde 202 y trabaja en
// segundo plano: con el retardo entre envíos la petición duraría minutos y los proxies la
// cortarían (ARQ-009).
router.post('/api/direct-messages/send-now', validate(sendDirectNowSchema), (req, res, next) => {
  try {
    const { numbers, content } = req.body;
    const imagePath = req.file ? req.file.path : null;

    if (!content && !imagePath) throw httpError(400, 'Se requiere texto o imagen');
    if (!isConnected()) throw httpError(503, 'WhatsApp no está conectado');
    if (!canSendMoreMessages(numbers.length)) {
      throw httpError(429, `Límite diario de mensajes alcanzado (${getDailyLimit()})`);
    }

    const jobId = crypto.randomUUID();
    res.status(202).json({ accepted: true, jobId, total: numbers.length });

    runImmediateSend(jobId, numbers, content, imagePath).catch((err) =>
      logger.error({ err: err.message }, 'El envío inmediato falló'));
  } catch (err) {
    next(err);
  }
});

router.post('/api/direct-messages', validate(createDirectMessageSchema), asyncRoute(async (req, res) => {
  const { content, scheduledAt, numbers } = req.body;
  let { recipients, recipientLabel } = req.body;

  // Si llegan números en lugar de JIDs, se resuelven contra WhatsApp
  if ((!recipients || recipients.length === 0) && numbers?.length) {
    const jids = [];
    const notFound = [];

    for (const number of numbers) {
      const jid = await checkOnWhatsApp(number);
      if (jid) jids.push(jid);
      else notFound.push(number);
    }

    if (jids.length === 0) {
      throw httpError(400, `Ningun numero encontrado en WhatsApp: ${notFound.join(', ')}`);
    }

    recipients = jids;
    recipientLabel = recipientLabel
      || `${jids.length} numero(s)${notFound.length > 0 ? ` (${notFound.length} no encontrados)` : ''}`;
  }

  if (!recipients || recipients.length === 0) {
    throw httpError(400, 'Selecciona al menos un contacto');
  }

  const msg = createDirectMessage({
    recipients,
    recipientLabel: recipientLabel || `${recipients.length} contactos`,
    content,
    imagePath: req.file ? req.file.path : null,
    scheduledAt,
  });

  scheduleDirectMessage(msg);
  emit('direct-messages:updated', getAllDirectMessages());
  res.status(201).json(msg);
}));

router.delete('/api/direct-messages/:id', parseId, (req, res, next) => {
  try {
    const msg = getDirectMessageById(req.id);
    if (!msg) throw httpError(404, 'Mensaje no encontrado');
    if (msg.status !== 'pending') throw httpError(400, 'Solo se pueden cancelar mensajes pendientes');

    cancelScheduledDirectMessage(req.id);
    cancelDirectMessage(req.id);
    emit('direct-messages:updated', getAllDirectMessages());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.put('/api/direct-messages/:id', parseId, validate(updateDirectMessageSchema), (req, res, next) => {
  try {
    const msg = getDirectMessageById(req.id);
    if (!msg) throw httpError(404, 'Mensaje no encontrado');
    if (msg.status !== 'pending') throw httpError(400, 'Solo se pueden editar mensajes pendientes');

    const updated = updateDirectMessage(req.id, req.body);
    cancelScheduledDirectMessage(req.id);
    scheduleDirectMessage(updated);
    emit('direct-messages:updated', getAllDirectMessages());
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/direct-messages/:id/permanent', parseId, (req, res, next) => {
  try {
    const msg = getDirectMessageById(req.id);
    if (!msg) throw httpError(404, 'Mensaje no encontrado');

    if (msg.status === 'pending') cancelScheduledDirectMessage(req.id);

    deleteDirectMessage(req.id);
    emit('direct-messages:updated', getAllDirectMessages());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
