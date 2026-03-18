import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import QRCode from 'qrcode';
import config from './config.js';
import { saveContacts, savePushName, updateContactGroups, getAllContactJids as getStoredContactJids, getContactCount } from './contacts.js';
import { getAgendaWhatsAppJids } from './agenda.js';

const logger = pino({ level: 'silent' });

let sock = null;
let qrDataUrl = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

export async function initWhatsApp() {
  reconnectAttempts = 0;
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
    console.log(`[WhatsApp] Using WA version: ${version.join('.')}`);
  } catch (e) {
    console.log('[WhatsApp] Could not fetch latest version, using default');
  }

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    ...(version && { version }),
  });

  sock.ev.on('creds.update', saveCreds);

  // Full contacts from history sync (fires on first QR link)
  sock.ev.on('messaging-history.set', ({ contacts }) => {
    if (contacts && contacts.length > 0) {
      console.log(`[WhatsApp] History sync: ${contacts.length} contacts`);
      saveContacts(contacts.map((c) => ({
        jid: c.id,
        name: c.name || null,
        notify: c.notify || null,
      })));
    }
  });

  // Full contact objects (reliable on WhatsApp Business)
  sock.ev.on('contacts.upsert', (contacts) => {
    console.log(`[WhatsApp] contacts.upsert: ${contacts.length}`);
    saveContacts(contacts.map((c) => ({
      jid: c.id,
      name: c.name || null,
      notify: c.notify || null,
    })));
  });

  // Capture pushName from every incoming message
  sock.ev.on('messages.upsert', ({ messages: msgs }) => {
    for (const msg of msgs) {
      if (msg.pushName && msg.key?.remoteJid) {
        // For group messages, the sender is key.participant
        const senderJid = msg.key.participant || msg.key.remoteJid;
        if (senderJid && senderJid.endsWith('@s.whatsapp.net')) {
          savePushName(senderJid, msg.pushName);
        }
      }
    }
  });

  // Partial updates — only save if they have name or notify
  sock.ev.on('contacts.update', (updates) => {
    const valid = updates.filter((c) => c.id && (c.name || c.notify));
    if (valid.length > 0) {
      saveContacts(valid.map((c) => ({
        jid: c.id,
        name: c.name || null,
        notify: c.notify || null,
      })));
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'connecting';
      qrDataUrl = await QRCode.toDataURL(qr);
      console.log('[WhatsApp] QR code generated — scan from your phone');
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      qrDataUrl = null;
      reconnectAttempts = 0;
      console.log('[WhatsApp] Connected');

      // Auto-sync contacts from groups if DB is empty
      if (getContactCount() === 0) {
        syncContactsFromGroups().catch((e) =>
          console.error('[WhatsApp] Auto contact sync failed:', e.message)
        );
      }
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      console.log(`[WhatsApp] Connection closed — statusCode: ${statusCode}, error: ${error?.message}`);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
        console.log(`[WhatsApp] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`);
        setTimeout(initWhatsApp, delay);
      } else {
        console.log('[WhatsApp] Disconnected permanently. Delete auth_info/ and restart to re-link.');
      }
    }
  });

  return sock;
}

export function getStatus() {
  return { status: connectionStatus };
}

export function getQR() {
  return qrDataUrl;
}

export async function disconnectWhatsApp() {
  // Prevent the close handler from auto-reconnecting
  reconnectAttempts = MAX_RECONNECT;

  if (sock) {
    // Just close the socket — don't call logout() as it invalidates server-side session
    try {
      sock.end(undefined);
    } catch {
      // ignore
    }
    sock = null;
  }
  connectionStatus = 'disconnected';
  qrDataUrl = null;
  console.log('[WhatsApp] Disconnected for re-link');
}

export async function checkOnWhatsApp(phone) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  // Normalize: remove + prefix, ensure @s.whatsapp.net
  const clean = phone.replace(/^\+/, '');
  const jid = clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;

  try {
    const [result] = await sock.onWhatsApp(jid);
    if (result && result.exists) {
      return result.jid;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function getGroups() {
  if (!sock || connectionStatus !== 'connected') return [];
  const groups = await sock.groupFetchAllParticipating();
  const all = Object.values(groups).map((g) => ({
    id: g.id,
    name: g.subject,
    participants: g.participants?.length || 0,
    parent: g.linkedParent || null,
    isCommunity: g.isCommunity || false,
  }));

  // Build community grouping: map parent id -> community name
  const communityNames = {};
  for (const g of all) {
    if (g.isCommunity) {
      communityNames[g.id] = g.name;
    }
  }

  // Assign community name to sub-groups
  return all.map((g) => ({
    ...g,
    communityName: g.parent ? (communityNames[g.parent] || null) : (g.isCommunity ? g.name : null),
  }));
}

export async function sendMessage(groupId, content, imagePath) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  if (imagePath && fs.existsSync(imagePath)) {
    await sock.sendMessage(groupId, {
      image: fs.readFileSync(imagePath),
      caption: content || undefined,
    });
  } else {
    await sock.sendMessage(groupId, { text: content });
  }
}

export async function syncContactsFromGroups() {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  console.log('[WhatsApp] Syncing contacts from groups...');
  const groups = await sock.groupFetchAllParticipating();
  const seen = new Set();
  const contacts = [];
  // Map jid -> list of group names
  const contactGroupMap = {};

  for (const group of Object.values(groups)) {
    const groupName = group.subject || 'Sin nombre';
    for (const p of group.participants || []) {
      const jid = p.jid || p.id;
      if (jid.endsWith('@s.whatsapp.net')) {
        if (!seen.has(jid)) {
          seen.add(jid);
          contacts.push({ jid, name: null, notify: null });
          contactGroupMap[jid] = [groupName];
        } else {
          contactGroupMap[jid].push(groupName);
        }
      }
    }
  }

  if (contacts.length > 0) {
    saveContacts(contacts);
    // Save groups as comma-separated, max 3 to keep it readable
    const groupsForDb = {};
    for (const [jid, groupNames] of Object.entries(contactGroupMap)) {
      const unique = [...new Set(groupNames)];
      if (unique.length > 3) {
        groupsForDb[jid] = unique.slice(0, 3).join(', ') + ` (+${unique.length - 3})`;
      } else {
        groupsForDb[jid] = unique.join(', ');
      }
    }
    updateContactGroups(groupsForDb);
    console.log(`[WhatsApp] Synced ${contacts.length} contacts from ${Object.keys(groups).length} groups`);
  }

  return contacts.length;
}

export async function sendStatusUpdate(content, imagePath) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp not connected');
  }

  const statusJid = 'status@broadcast';

  // Use only real contacts from agenda (phone contacts verified on WhatsApp)
  const allJids = getAgendaWhatsAppJids().filter((jid) => jid && jid.endsWith('@s.whatsapp.net'));

  if (allJids.length === 0) {
    throw new Error('No hay contactos de agenda verificados en WhatsApp. Ve a Contactos de agenda, importa tu .vcf y verifica.');
  }

  console.log(`[WhatsApp] Status will be visible to ${allJids.length} agenda contacts`);

  // Build the message content
  let msgContent;
  if (imagePath && fs.existsSync(imagePath)) {
    console.log(`[WhatsApp] Status with image: ${imagePath}`);
    msgContent = {
      image: fs.readFileSync(imagePath),
      caption: content || undefined,
    };
  } else if (content) {
    console.log(`[WhatsApp] Status with text: "${content.substring(0, 50)}"`);
    msgContent = {
      text: content,
      font: 0,
      backgroundColor: '#075E54',
    };
  } else {
    throw new Error('Status must have text or image');
  }

  console.log(`[WhatsApp] Posting status to ${allJids.length} contacts`);
  await sock.sendMessage(statusJid, msgContent, { statusJidList: allJids });
  console.log(`[WhatsApp] Status posted successfully`);
}
