import schedule from 'node-schedule';
import { getPendingMessages, updateMessageStatus, getMessageById, getPendingStatusUpdates, updateStatusUpdateStatus, getStatusUpdateById, getPendingDirectMessages, updateDirectMessageStatus, getDirectMessageById } from './db.js';
import { sendMessage, sendStatusUpdate } from './whatsapp.js';

const activeJobs = new Map();
const activeStatusJobs = new Map();
const activeDirectJobs = new Map();

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
          console.log(`[Scheduler] Late message ${row.id} sent successfully`);
        } catch (err) {
          console.error(`[Scheduler] Late message ${row.id} failed:`, err.message);
          updateMessageStatus(row.id, 'failed', err.message);
        }
      })();
      return;
    }
    console.log(`[Scheduler] Message ${row.id} is ${minutesLate}m in the past, marking as failed`);
    updateMessageStatus(row.id, 'failed', 'Scheduled time already passed');
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
      console.log(`[Scheduler] Message ${row.id} sent successfully`);
    } catch (err) {
      console.error(`[Scheduler] Message ${row.id} failed:`, err.message);
      updateMessageStatus(row.id, 'failed', err.message);
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
          console.log(`[Scheduler] Late status ${row.id} sent successfully`);
        } catch (err) {
          console.error(`[Scheduler] Late status ${row.id} failed:`, err.message);
          updateStatusUpdateStatus(row.id, 'failed', err.message);
        }
      })();
      return;
    }
    console.log(`[Scheduler] Status ${row.id} is ${minutesLate}m in the past, marking as failed`);
    updateStatusUpdateStatus(row.id, 'failed', 'Scheduled time already passed');
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
      console.log(`[Scheduler] Status ${row.id} posted successfully`);
    } catch (err) {
      console.error(`[Scheduler] Status ${row.id} failed:`, err.message);
      updateStatusUpdateStatus(row.id, 'failed', err.message);
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
    let sent = 0;
    let errors = [];
    for (const jid of recipients) {
      try {
        await sendMessage(jid, row.content, row.image_path);
        sent++;
      } catch (err) {
        errors.push(`${jid}: ${err.message}`);
      }
    }
    return { sent, errors };
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
          console.log(`[Scheduler] Direct message ${row.id}: ${sent}/${recipients.length} sent`);
        } catch (err) {
          updateDirectMessageStatus(row.id, 'failed', err.message);
        }
      })();
      return;
    }
    updateDirectMessageStatus(row.id, 'failed', 'Scheduled time already passed');
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
      console.log(`[Scheduler] Direct message ${row.id}: ${sent}/${recipients.length} sent`);
    } catch (err) {
      updateDirectMessageStatus(row.id, 'failed', err.message);
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
