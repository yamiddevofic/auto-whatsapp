import schedule from 'node-schedule';
import { getPendingMessages, updateMessageStatus, getMessageById, getPendingStatusUpdates, updateStatusUpdateStatus, getStatusUpdateById, getPendingDirectMessages, updateDirectMessageStatus, getDirectMessageById, incrementMessageCount, getDailyLimit, canSendMoreMessages, getTodayMessageStats, getAllMessages, getAllStatusUpdates, getAllDirectMessages } from './db.js';
import { getAllContacts } from './contacts.js';
import { sendMessage, sendStatusUpdate } from './whatsapp.js';
import { emit } from './realtime.js';
import { logger, maskJid } from './logger.js';

const activeJobs = new Map();

/** Retardo aleatorio de 3-15 s entre mensajes, para no disparar la detección antispam. */
export function randomSendDelay() {
  return Math.floor(Math.random() * 12000) + 3000;
}

const activeStatusJobs = new Map();
const activeDirectJobs = new Map();

// Helper function to add content variations for anti-bot detection
function varyMessageContent(content, contactName) {
  if (!content) return content;
  
  let variedContent = content;
  
  // Add contact name if available and content doesn't already have it
  if (contactName && !content.toLowerCase().includes(contactName.toLowerCase())) {
    const greetings = ['Hola', 'Buenos días', 'Buenas tardes', 'Hola'];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    variedContent = `${greeting} ${contactName}, ${content.charAt(0).toLowerCase() + content.slice(1)}`;
  }
  
  // Add small random variations
  const variations = [
    // Add emoji occasionally (30% chance)
    () => Math.random() < 0.3 ? variedContent + ' 👋' : variedContent,
    // Add variation in punctuation occasionally (20% chance)
    () => Math.random() < 0.2 ? variedContent.replace(/[.!?]$/, '...') : variedContent,
    // No change
    () => variedContent
  ];
  
  return variations[Math.floor(Math.random() * variations.length)]();
}

export function scheduleMessage(row) {
  const date = new Date(row.scheduled_at);

  if (date <= new Date()) {
    const minutesLate = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutesLate <= 10) {
      logger.info({ id: row.id, minutesLate }, 'Mensaje atrasado: se envía ahora');
      (async () => {
        try {
          const msg = getMessageById(row.id);
          if (!msg || msg.status !== 'pending') return;
          await sendMessage(msg.group_id, msg.content, msg.image_path);
          updateMessageStatus(row.id, 'sent');
          emit('messages:updated', getAllMessages());
          logger.info({ id: row.id }, 'Mensaje atrasado enviado');
        } catch (err) {
          logger.error({ id: row.id, err: err.message }, 'El mensaje atrasado falló');
          updateMessageStatus(row.id, 'failed', err.message);
          emit('messages:updated', getAllMessages());
        }
      })();
      return;
    }
    logger.warn({ id: row.id, minutesLate }, 'Mensaje demasiado antiguo: marcado como fallido');
    updateMessageStatus(row.id, 'failed', 'Scheduled time already passed');
    emit('messages:updated', getAllMessages());
    return;
  }

  const job = schedule.scheduleJob(date, async () => {
    const msg = getMessageById(row.id);
    if (!msg || msg.status !== 'pending') {
      activeJobs.delete(row.id);
      return;
    }

    try {
      logger.info({ id: row.id }, 'Enviando mensaje programado al grupo');
      await sendMessage(msg.group_id, msg.content, msg.image_path);
      updateMessageStatus(row.id, 'sent');
      emit('messages:updated', getAllMessages());
      logger.info({ id: row.id }, 'Mensaje enviado');
    } catch (err) {
      logger.error({ id: row.id, err: err.message }, 'El mensaje falló');
      updateMessageStatus(row.id, 'failed', err.message);
      emit('messages:updated', getAllMessages());
    } finally {
      activeJobs.delete(row.id);
    }
  });

  if (job) {
    activeJobs.set(row.id, job);
  }
}

export function cancelScheduledMessage(id) {
  const job = activeJobs.get(id);
  if (job) {
    job.cancel();
    activeJobs.delete(id);
  }
}

function parseAudience(raw) {
  try { return raw ? JSON.parse(raw) : { mode: 'all' }; } catch { return { mode: 'all' }; }
}

export function scheduleStatusUpdateJob(row) {
  const date = new Date(row.scheduled_at);

  if (date <= new Date()) {
    const minutesLate = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutesLate <= 10) {
      logger.info({ id: row.id, minutesLate }, 'Estado atrasado: se publica ahora');
      (async () => {
        try {
          const su = getStatusUpdateById(row.id);
          if (!su || su.status !== 'pending') return;
          await sendStatusUpdate(su.content, su.image_path, parseAudience(su.audience));
          updateStatusUpdateStatus(row.id, 'sent');
          emit('status-updates:updated', getAllStatusUpdates());
          logger.info({ id: row.id }, 'Estado atrasado publicado');
        } catch (err) {
          logger.error({ id: row.id, err: err.message }, 'El estado atrasado falló');
          updateStatusUpdateStatus(row.id, 'failed', err.message);
          emit('status-updates:updated', getAllStatusUpdates());
        }
      })();
      return;
    }
    logger.warn({ id: row.id, minutesLate }, 'Estado demasiado antiguo: marcado como fallido');
    updateStatusUpdateStatus(row.id, 'failed', 'Scheduled time already passed');
    emit('status-updates:updated', getAllStatusUpdates());
    return;
  }

  const job = schedule.scheduleJob(date, async () => {
    const su = getStatusUpdateById(row.id);
    if (!su || su.status !== 'pending') {
      activeStatusJobs.delete(row.id);
      return;
    }

    try {
      logger.info({ id: row.id }, 'Publicando estado programado');
      await sendStatusUpdate(su.content, su.image_path, parseAudience(su.audience));
      updateStatusUpdateStatus(row.id, 'sent');
      emit('status-updates:updated', getAllStatusUpdates());
      logger.info({ id: row.id }, 'Estado publicado');
    } catch (err) {
      logger.error({ id: row.id, err: err.message }, 'El estado falló');
      updateStatusUpdateStatus(row.id, 'failed', err.message);
      emit('status-updates:updated', getAllStatusUpdates());
    } finally {
      activeStatusJobs.delete(row.id);
    }
  });

  if (job) {
    activeStatusJobs.set(row.id, job);
  }
}

export function cancelScheduledStatusUpdate(id) {
  const job = activeStatusJobs.get(id);
  if (job) {
    job.cancel();
    activeStatusJobs.delete(id);
  }
}

// --- Direct messages to contacts ---

export function scheduleDirectMessage(row) {
  const date = new Date(row.scheduled_at);
  const recipients = JSON.parse(row.recipients);

  const sendToAll = async () => {
    logger.debug({ destinatarios: recipients.length }, 'Iniciando envío a destinatarios');
    let sent = 0;
    const errors = [];
    try {
      const dailyLimit = getDailyLimit();
      const currentStats = getTodayMessageStats();
      const contacts = getAllContacts();
      logger.debug({ contactos: contacts.length }, 'Contactos cargados para personalizar');
      const contactMap = new Map(contacts.map(c => [c.jid, c]));
      logger.info({ limite: dailyLimit, enviadosHoy: currentStats.messages_sent }, 'Límite diario');

      for (const jid of recipients) {
        // Check daily limit before each message
        if (!canSendMoreMessages(1)) {
          logger.warn({ limite: dailyLimit }, 'Límite diario alcanzado: se detiene el envío');
          break;
        }

        try {
          // Get contact name for content variation
          const contact = contactMap.get(jid);
          const contactName = contact?.name || contact?.notify || contact?.agenda_name || null;
          const variedContent = varyMessageContent(row.content, contactName);
          
          logger.info({ jid: maskJid(jid) }, 'Enviando mensaje directo');
          await sendMessage(jid, variedContent, row.image_path);
          logger.debug({ jid: maskJid(jid) }, 'Enviado');
          incrementMessageCount();
          sent++;
          // Retardo aleatorio entre mensajes para no disparar la detección antispam
          if (sent < recipients.length) {
            await new Promise((resolve) => setTimeout(resolve, randomSendDelay()));
          }
        } catch (err) {
          logger.error({ jid: maskJid(jid), err: err.message }, 'Fallo al enviar');
          errors.push(`${jid}: ${err.message}`);
        }
      }
      return { sent, errors };
    } catch (err) {
      logger.error({ err: err.message }, 'Error durante el envío masivo');
      return { sent, errors: [err.message] };
    }
  };

  if (date <= new Date()) {
    const minutesLate = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutesLate <= 10) {
      logger.info({ id: row.id, minutesLate }, 'Mensaje directo atrasado: se envía ahora');
      (async () => {
        try {
          const msg = getDirectMessageById(row.id);
          if (!msg || msg.status !== 'pending') return;
          const { sent, errors } = await sendToAll();
          if (errors.length > 0) {
            updateDirectMessageStatus(row.id, sent > 0 ? 'sent' : 'failed', errors.join('; '));
          } else {
            updateDirectMessageStatus(row.id, 'sent');
          }
          emit('direct-messages:updated', getAllDirectMessages());
          logger.info({ id: row.id, enviados: sent, total: recipients.length }, 'Mensaje directo procesado');
        } catch (err) {
          updateDirectMessageStatus(row.id, 'failed', err.message);
          emit('direct-messages:updated', getAllDirectMessages());
        }
      })();
      return;
    }
    updateDirectMessageStatus(row.id, 'failed', 'Scheduled time already passed');
    emit('direct-messages:updated', getAllDirectMessages());
    return;
  }

  const job = schedule.scheduleJob(date, async () => {
    const msg = getDirectMessageById(row.id);
    if (!msg || msg.status !== 'pending') {
      activeDirectJobs.delete(row.id);
      return;
    }

    try {
      logger.info({ id: row.id, total: recipients.length }, 'Enviando mensaje directo programado');
      const { sent, errors } = await sendToAll();
      if (errors.length > 0) {
        updateDirectMessageStatus(row.id, sent > 0 ? 'sent' : 'failed', errors.join('; '));
      } else {
        updateDirectMessageStatus(row.id, 'sent');
      }
      emit('direct-messages:updated', getAllDirectMessages());
      logger.info({ id: row.id, enviados: sent, total: recipients.length }, 'Mensaje directo procesado');
    } catch (err) {
      updateDirectMessageStatus(row.id, 'failed', err.message);
      emit('direct-messages:updated', getAllDirectMessages());
    } finally {
      activeDirectJobs.delete(row.id);
    }
  });

  if (job) {
    activeDirectJobs.set(row.id, job);
  }
}

export function cancelScheduledDirectMessage(id) {
  const job = activeDirectJobs.get(id);
  if (job) {
    job.cancel();
    activeDirectJobs.delete(id);
  }
}

export function loadPendingMessages() {
  const pending = getPendingMessages();
  logger.info({ total: pending.length }, 'Reprogramando mensajes pendientes');
  for (const msg of pending) {
    scheduleMessage(msg);
  }

  const pendingStatuses = getPendingStatusUpdates();
  logger.info({ total: pendingStatuses.length }, 'Reprogramando estados pendientes');
  for (const su of pendingStatuses) {
    scheduleStatusUpdateJob(su);
  }

  const pendingDirect = getPendingDirectMessages();
  logger.info({ total: pendingDirect.length }, 'Reprogramando mensajes directos pendientes');
  for (const dm of pendingDirect) {
    scheduleDirectMessage(dm);
  }
}
