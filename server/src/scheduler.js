import schedule from 'node-schedule';
import { getPendingMessages, updateMessageStatus, getMessageById, getPendingStatusUpdates, updateStatusUpdateStatus, getStatusUpdateById, getPendingDirectMessages, updateDirectMessageStatus, getDirectMessageById, incrementMessageCount, getDailyLimit, canSendMoreMessages, getTodayMessageStats, getAllMessages, getAllStatusUpdates, getAllDirectMessages } from './db.js';
import { getAllContacts } from './contacts.js';
import { sendMessage, sendStatusUpdate } from './whatsapp.js';
import { io } from './index.js';

const activeJobs = new Map();
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
      console.log(`[Scheduler] Message ${row.id} is ${minutesLate}m late, sending now`);
      (async () => {
        try {
          const msg = getMessageById(row.id);
          if (!msg || msg.status !== 'pending') return;
          await sendMessage(msg.group_id, msg.content, msg.image_path);
          updateMessageStatus(row.id, 'sent');
          io.emit('messages:updated', getAllMessages());
          console.log(`[Scheduler] Late message ${row.id} sent successfully`);
        } catch (err) {
          console.error(`[Scheduler] Late message ${row.id} failed:`, err.message);
          updateMessageStatus(row.id, 'failed', err.message);
          io.emit('messages:updated', getAllMessages());
        }
      })();
      return;
    }
    console.log(`[Scheduler] Message ${row.id} is ${minutesLate}m in the past, marking as failed`);
    updateMessageStatus(row.id, 'failed', 'Scheduled time already passed');
    io.emit('messages:updated', getAllMessages());
    return;
  }

  const job = schedule.scheduleJob(date, async () => {
    const msg = getMessageById(row.id);
    if (!msg || msg.status !== 'pending') {
      activeJobs.delete(row.id);
      return;
    }

    try {
      console.log(`[Scheduler] Sending message ${row.id} to ${msg.group_name}`);
      await sendMessage(msg.group_id, msg.content, msg.image_path);
      updateMessageStatus(row.id, 'sent');
      io.emit('messages:updated', getAllMessages());
      console.log(`[Scheduler] Message ${row.id} sent successfully`);
    } catch (err) {
      console.error(`[Scheduler] Message ${row.id} failed:`, err.message);
      updateMessageStatus(row.id, 'failed', err.message);
      io.emit('messages:updated', getAllMessages());
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

export function scheduleStatusUpdateJob(row) {
  const date = new Date(row.scheduled_at);

  if (date <= new Date()) {
    const minutesLate = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutesLate <= 10) {
      console.log(`[Scheduler] Status ${row.id} is ${minutesLate}m late, sending now`);
      (async () => {
        try {
          const su = getStatusUpdateById(row.id);
          if (!su || su.status !== 'pending') return;
          await sendStatusUpdate(su.content, su.image_path);
          updateStatusUpdateStatus(row.id, 'sent');
          io.emit('status-updates:updated', getAllStatusUpdates());
          console.log(`[Scheduler] Late status ${row.id} sent successfully`);
        } catch (err) {
          console.error(`[Scheduler] Late status ${row.id} failed:`, err.message);
          updateStatusUpdateStatus(row.id, 'failed', err.message);
          io.emit('status-updates:updated', getAllStatusUpdates());
        }
      })();
      return;
    }
    console.log(`[Scheduler] Status ${row.id} is ${minutesLate}m in the past, marking as failed`);
    updateStatusUpdateStatus(row.id, 'failed', 'Scheduled time already passed');
    io.emit('status-updates:updated', getAllStatusUpdates());
    return;
  }

  const job = schedule.scheduleJob(date, async () => {
    const su = getStatusUpdateById(row.id);
    if (!su || su.status !== 'pending') {
      activeStatusJobs.delete(row.id);
      return;
    }

    try {
      console.log(`[Scheduler] Posting status update ${row.id}`);
      await sendStatusUpdate(su.content, su.image_path);
      updateStatusUpdateStatus(row.id, 'sent');
      io.emit('status-updates:updated', getAllStatusUpdates());
      console.log(`[Scheduler] Status ${row.id} posted successfully`);
    } catch (err) {
      console.error(`[Scheduler] Status ${row.id} failed:`, err.message);
      updateStatusUpdateStatus(row.id, 'failed', err.message);
      io.emit('status-updates:updated', getAllStatusUpdates());
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
    console.log(`[Scheduler] sendToAll() called with ${recipients.length} recipients`);
    let sent = 0;
    let errors = [];
    try {
      const dailyLimit = getDailyLimit();
      const currentStats = getTodayMessageStats();
      console.log(`[Scheduler] Daily limit check: ${dailyLimit}, sent: ${currentStats.messages_sent}`);
      const contacts = getAllContacts();
      console.log(`[Scheduler] Loaded ${contacts.length} contacts`);
      const contactMap = new Map(contacts.map(c => [c.jid, c]));
      console.log(`[Scheduler] Daily message limit: ${dailyLimit}, Already sent: ${currentStats.messages_sent}`);

      for (const jid of recipients) {
        // Check daily limit before each message
        if (!canSendMoreMessages(1)) {
          console.log(`[Scheduler] Daily limit reached (${dailyLimit}). Stopping message sending.`);
          break;
        }

        try {
          // Get contact name for content variation
          const contact = contactMap.get(jid);
          const contactName = contact?.name || contact?.notify || contact?.agenda_name || null;
          const variedContent = varyMessageContent(row.content, contactName);
          
          console.log(`[Scheduler] Sending to ${jid} (${contactName || 'unknown'}): ${variedContent?.substring(0, 50)}...`);
          await sendMessage(jid, variedContent, row.image_path);
          console.log(`[Scheduler] Successfully sent to ${jid}`);
          incrementMessageCount();
          sent++;
          // Random delay between messages (3-15 seconds) to avoid bot detection
          if (sent < recipients.length) {
            const delay = Math.floor(Math.random() * 12000) + 3000; // 3000-15000ms
            console.log(`[Scheduler] Waiting ${delay / 1000}s before next message`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (err) {
          console.error(`[Scheduler] Failed to send to ${jid}:`, err.message);
          errors.push(`${jid}: ${err.message}`);
        }
      }
      return { sent, errors };
    } catch (err) {
      console.error(`[Scheduler] Error in sendToAll():`, err.message);
      return { sent, errors: [err.message] };
    }
  };

  if (date <= new Date()) {
    const minutesLate = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutesLate <= 10) {
      console.log(`[Scheduler] Direct message ${row.id} is ${minutesLate}m late, sending now`);
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
          io.emit('direct-messages:updated', getAllDirectMessages());
          console.log(`[Scheduler] Direct message ${row.id}: ${sent}/${recipients.length} sent`);
        } catch (err) {
          updateDirectMessageStatus(row.id, 'failed', err.message);
          io.emit('direct-messages:updated', getAllDirectMessages());
        }
      })();
      return;
    }
    updateDirectMessageStatus(row.id, 'failed', 'Scheduled time already passed');
    io.emit('direct-messages:updated', getAllDirectMessages());
    return;
  }

  const job = schedule.scheduleJob(date, async () => {
    const msg = getDirectMessageById(row.id);
    if (!msg || msg.status !== 'pending') {
      activeDirectJobs.delete(row.id);
      return;
    }

    try {
      console.log(`[Scheduler] Sending direct message ${row.id} to ${recipients.length} contacts`);
      const { sent, errors } = await sendToAll();
      if (errors.length > 0) {
        updateDirectMessageStatus(row.id, sent > 0 ? 'sent' : 'failed', errors.join('; '));
      } else {
        updateDirectMessageStatus(row.id, 'sent');
      }
      io.emit('direct-messages:updated', getAllDirectMessages());
      console.log(`[Scheduler] Direct message ${row.id}: ${sent}/${recipients.length} sent`);
    } catch (err) {
      updateDirectMessageStatus(row.id, 'failed', err.message);
      io.emit('direct-messages:updated', getAllDirectMessages());
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
  console.log(`[Scheduler] Loading ${pending.length} pending messages`);
  for (const msg of pending) {
    scheduleMessage(msg);
  }

  const pendingStatuses = getPendingStatusUpdates();
  console.log(`[Scheduler] Loading ${pendingStatuses.length} pending status updates`);
  for (const su of pendingStatuses) {
    scheduleStatusUpdateJob(su);
  }

  const pendingDirect = getPendingDirectMessages();
  console.log(`[Scheduler] Loading ${pendingDirect.length} pending direct messages`);
  for (const dm of pendingDirect) {
    scheduleDirectMessage(dm);
  }
}
