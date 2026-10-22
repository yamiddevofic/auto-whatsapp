import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  generateWAMessageContent,
  generateWAMessageFromContent,
  encodeWAMessage,
  encodeSignedDeviceIdentity,
  jidDecode,
  jidEncode,
  jidNormalizedUser,
  USyncQuery,
  USyncUser,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import config from './config.js';
import { saveContacts, savePushName, updateContactGroups, getAllContactJids, getContactCount } from './contacts.js';
import { getAgendaWhatsAppJids } from './agenda.js';
import { emit } from './realtime.js';
import { logger } from './logger.js';
import { httpError } from './middleware/error-handler.js';
import { createPublishedStatus, incrementStatusUpdateCount } from './db.js';
import { buildWhatsAppLinkPreview } from './link-preview.js';

// Baileys es muy verboso: su log propio se silencia; el nuestro es logger.js
// WA_TRACE_FILE=<ruta> vuelca el tráfico completo del protocolo a ese archivo (sólo diagnóstico)
const baileysLogger = process.env.WA_TRACE_FILE
  ? pino({ level: 'trace' }, pino.destination(process.env.WA_TRACE_FILE))
  : pino({ level: 'silent' });

/** Estructura de un mensaje sin el contenido binario, para comparar formatos. */
function describeMessage(value, depth = 0) {
  if (value === null || value === undefined || depth > 6) return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `<${value.length} bytes>`;
  if (typeof value === 'string') return value.length > 60 ? `<texto ${value.length}>` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => describeMessage(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && v !== undefined) out[k] = describeMessage(v, depth + 1);
  }
  return out;
}

let sock = null;
let qrDataUrl = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

// WhatsApp puede rechazar un mensaje después de que sendMessage haya resuelto: el rechazo
// llega como messages.update con status ERROR (0). Antes nadie lo escuchaba y un estado
// rechazado se daba por publicado.
const pendingRejections = new Map(); // messageId -> callback(error)
const ACK_WAIT_MS = 8000;

// Color de fondo de los estados de texto (verde oscuro de WhatsApp)
const STATUS_BACKGROUND = '#075E54';

function waitForRejection(messageId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRejections.delete(messageId);
      resolve(null);
    }, ACK_WAIT_MS);
    pendingRejections.set(messageId, (error) => {
      clearTimeout(timer);
      pendingRejections.delete(messageId);
      resolve(error);
    });
  });
}

export async function initWhatsApp() {
  reconnectAttempts = 0;
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
    logger.info({ version: version.join('.') }, 'Versión de WhatsApp Web detectada');
  } catch {
    logger.warn('No se pudo obtener la última versión; se usa la predeterminada');
  }

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    logger: baileysLogger,
    ...(version && { version }),
  });

  sock.ev.on('creds.update', saveCreds);

  if (process.env.WA_TRACE_FILE) {
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      for (const msg of messages) {
        if (msg.key?.remoteJid !== 'status@broadcast') continue;
        logger.info({ type, key: msg.key, message: describeMessage(msg.message) }, '[diag] estado recibido');
      }
    });
  }

  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      if (!key?.fromMe || update?.status !== 0) continue;
      const error = update.messageStubParameters?.[0] || 'desconocido';
      logger.warn(
        { id: key.id, destino: key.remoteJid === 'status@broadcast' ? 'estado' : 'chat', error },
        'WhatsApp rechazó un mensaje enviado'
      );
      pendingRejections.get(key.id)?.(error);
    }
  });

  // Listen for any session-related errors
  sock.ev.on('error', (err) => {
    const errorMessage = err?.message || '';
    if (errorMessage.includes('Bad MAC') || errorMessage.includes('Session error')) {
      logger.warn('Sesión de cifrado corrupta; se limpia auth_info y se reinicia');
      
      // Clean auth_info directory
      if (fs.existsSync(config.authDir)) {
        try {
          fs.rmSync(config.authDir, { recursive: true, force: true });
          logger.info('auth_info eliminado');
        } catch (err) {
          logger.error({ err: err.message }, 'No se pudo eliminar auth_info');
        }
      }
      
      // Restart connection
      setTimeout(initWhatsApp, 2000);
    }
  });

  // Full contacts from history sync (fires on first QR link)
  sock.ev.on('messaging-history.set', ({ contacts }) => {
    if (contacts && contacts.length > 0) {
      logger.info({ total: contacts.length }, 'Sincronización de historial de contactos');
      saveContacts(contacts.map((c) => ({
        jid: c.id,
        name: c.name || null,
        notify: c.notify || null,
      })));
    }
  });

  // Full contact objects (reliable on WhatsApp Business)
  sock.ev.on('contacts.upsert', (contacts) => {
    logger.debug({ total: contacts.length }, 'contacts.upsert recibido');
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
      logger.info('Código QR generado: escanéalo desde tu teléfono');
      emit('whatsapp:qr', qrDataUrl);
      emit('whatsapp:status', { status: connectionStatus });
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      qrDataUrl = null;
      reconnectAttempts = 0;
      logger.info('WhatsApp conectado');
      emit('whatsapp:status', { status: connectionStatus });

      // Auto-sync contacts from groups if DB is empty
      if (getContactCount() === 0) {
        syncContactsFromGroups().catch((err) =>
          logger.error({ err: err.message }, 'La sincronización automática de contactos falló')
        );
      }
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      const errorMessage = error?.message || '';
      logger.warn({ statusCode, error: errorMessage }, 'Conexión de WhatsApp cerrada');
      emit('whatsapp:status', { status: connectionStatus });

      // Detect Bad MAC error - corrupted encryption session
      if (errorMessage.includes('Bad MAC') || errorMessage.includes('Session error')) {
        logger.warn('Error Bad MAC: sesión de cifrado corrupta; se limpia auth_info');
        
        // Clean auth_info directory
        if (fs.existsSync(config.authDir)) {
          try {
            fs.rmSync(config.authDir, { recursive: true, force: true });
            logger.info('auth_info eliminado');
          } catch (err) {
            logger.error({ err: err.message }, 'No se pudo eliminar auth_info');
          }
        }
        
        // Reset reconnect attempts and restart
        reconnectAttempts = 0;
        setTimeout(initWhatsApp, 2000);
        return;
      }

      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
        logger.info({ seconds: delay / 1000, attempt: reconnectAttempts }, 'Reconectando a WhatsApp');
        setTimeout(initWhatsApp, delay);
      } else if (loggedOut) {
        logger.warn('Sesión cerrada desde WhatsApp: hay que volver a vincular (borra auth_info/)');
      } else if (reconnectAttempts >= MAX_RECONNECT) {
        logger.error({ attempts: reconnectAttempts }, 'Máximo de reintentos alcanzado; vuelve a vincular');
      }
    }
  });

  return sock;
}

/** Error público (503) para operaciones que necesitan la sesión de WhatsApp activa. */
function notConnectedError() {
  return httpError(503, 'WhatsApp no está conectado');
}

export function isConnected() {
  return !!sock && connectionStatus === 'connected';
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
  logger.info('WhatsApp desconectado para re-vinculación');
}

export async function checkOnWhatsApp(phone) {
  if (!sock || connectionStatus !== 'connected') {
    throw notConnectedError();
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
    throw notConnectedError();
  }

  if (imagePath && fs.existsSync(imagePath)) {
    await sock.sendMessage(groupId, {
      image: fs.readFileSync(imagePath),
      caption: content || undefined,
    });
  } else if (content) {
    // Si el texto lleva un enlace, se adjunta su tarjeta (título, descripción, miniatura)
    await sock.sendMessage(groupId, { text: content, linkPreview: await buildWhatsAppLinkPreview(content) });
  } else {
    throw new Error('Message must have text or image');
  }
}

export async function syncContactsFromGroups() {
  if (!sock || connectionStatus !== 'connected') {
    throw notConnectedError();
  }

  logger.info('Sincronizando contactos desde los grupos');
  const groups = await sock.groupFetchAllParticipating();
  const seen = new Set();
  const contacts = [];
  // Map jid -> list of group names
  const contactGroupMap = {};
  // Participantes que WhatsApp entrega sólo con identificador @lid (sin número visible):
  // no se pueden guardar como contacto, pero se cuentan para avisar en la interfaz.
  let hiddenMembers = 0;

  for (const group of Object.values(groups)) {
    const groupName = group.subject || 'Sin nombre';
    for (const p of group.participants || []) {
      // En grupos con addressing_mode 'lid', p.id es el @lid y el número llega en p.jid.
      // Antes sólo se miraba p.jid || p.id, así que un p.jid vacío descartaba al miembro.
      const jid = phoneJidOf(p);
      if (!jid) {
        hiddenMembers += 1;
        continue;
      }
      if (!seen.has(jid)) {
        seen.add(jid);
        contacts.push({ jid, name: null, notify: null });
        contactGroupMap[jid] = [groupName];
      } else {
        contactGroupMap[jid].push(groupName);
      }
    }
  }

  if (contacts.length > 0) {
    saveContacts(contacts);
    // Se guarda la lista completa: antes se truncaba a 3 grupos + "(+N)" y la búsqueda
    // por nombre de grupo no encontraba a quien estuviera en más de tres.
    const groupsForDb = {};
    for (const [jid, groupNames] of Object.entries(contactGroupMap)) {
      groupsForDb[jid] = [...new Set(groupNames)].join(', ');
    }
    updateContactGroups(groupsForDb);
  }
  logger.info(
    { contacts: contacts.length, groups: Object.keys(groups).length, hiddenMembers },
    'Contactos sincronizados',
  );

  return { count: contacts.length, hiddenMembers };
}

/** JID con número de un participante de grupo, o null si WhatsApp lo da sólo como @lid. */
function phoneJidOf(participant) {
  return [participant.jid, participant.id].find((j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net')) || null;
}

/**
 * Destinatarios de un estado según la audiencia elegida:
 *  - all: agenda verificada + contactos de grupos (comportamiento original)
 *  - agenda: sólo la agenda verificada en WhatsApp
 *  - groups: sólo los contactos sincronizados de grupos
 *  - custom: los miembros actuales de los grupos elegidos (consulta WhatsApp en vivo)
 *  - me: sólo la propia cuenta (para probar sin que lo vea nadie más)
 * Siempre se añade la propia cuenta para que el estado aparezca al autor.
 */
export async function resolveStatusAudience(audience = { mode: 'all' }) {
  const mode = audience?.mode || 'all';
  let jids = [];
  let hiddenMembers = 0;

  if (mode === 'me') jids = [];
  else if (mode === 'all') jids = [...getAgendaWhatsAppJids(), ...getAllContactJids()];
  else if (mode === 'agenda') jids = getAgendaWhatsAppJids();
  else if (mode === 'groups') jids = getAllContactJids();
  else if (mode === 'custom') {
    if (!sock || connectionStatus !== 'connected') throw notConnectedError();
    const wanted = new Set(audience.groupIds || []);
    const groups = await sock.groupFetchAllParticipating();
    for (const group of Object.values(groups)) {
      if (!wanted.has(group.id)) continue;
      for (const p of group.participants || []) {
        const jid = phoneJidOf(p);
        if (jid) jids.push(jid);
        else hiddenMembers += 1;
      }
    }
  }

  const recipients = [...new Set(jids)];
  const own = sock?.user?.id;
  return { jids: [...new Set([...recipients, ...(own ? [own] : [])])], recipients: recipients.length, hiddenMembers };
}

/** Recuentos para mostrar en la interfaz antes de publicar. */
export async function countStatusAudiences(groupIds = []) {
  const counts = {};
  for (const mode of ['all', 'agenda', 'groups']) {
    counts[mode] = (await resolveStatusAudience({ mode })).recipients;
  }
  if (groupIds.length > 0) {
    const custom = await resolveStatusAudience({ mode: 'custom', groupIds });
    counts.custom = custom.recipients;
    counts.customHidden = custom.hiddenMembers;
  }
  return counts;
}

/**
 * Envía un estado direccionado por LID, como lo hacen hoy el teléfono y Baileys 7.
 *
 * Baileys 6.7.24 firma los estados con el número de teléfono (PN) y los reparte a los
 * dispositivos por PN. En una cuenta migrada a LID WhatsApp los acepta, pero el teléfono
 * no los muestra y WhatsApp Web dice "no es compatible con esta versión". Aquí se firma
 * con la LID propia y cada destinatario se direcciona por su LID.
 * Devuelve false si no se puede (cuenta sin LID) para usar el envío normal.
 */
async function relayStatusAsLid(message, recipientJids, messageId) {
  const { creds } = sock.authState;
  const meLid = creds.me?.lid;
  if (!meLid) return false;

  const { user: myPnUser, device: myDevice } = jidDecode(creds.me.id);
  const myLidUser = jidDecode(meLid).user;

  // Dispositivos + LID de cada destinatario en una sola consulta usync
  const users = [...new Set(recipientJids.map((j) => jidNormalizedUser(j)))];
  const query = new USyncQuery().withContext('message').withDeviceProtocol().withLIDProtocol();
  for (const jid of users) query.withUser(new USyncUser().withId(jid));
  const result = await sock.executeUSyncQuery(query);

  const deviceJids = [];
  let withoutLid = 0;
  for (const item of result?.list || []) {
    const pnUser = jidDecode(item.id)?.user;
    const lidUser = pnUser === myPnUser ? myLidUser : item.lid && jidDecode(item.lid)?.user;
    if (!lidUser) {
      withoutLid += 1;
      continue;
    }
    for (const { id: device, keyIndex } of item.devices?.deviceList || []) {
      if (lidUser === myLidUser && device === myDevice) continue; // este mismo dispositivo
      if (device !== 0 && !keyIndex) continue; // mismo filtro que extractDeviceJids
      deviceJids.push(jidEncode(lidUser, 'lid', device));
    }
  }
  if (deviceJids.length === 0) return false;

  const { ciphertext, senderKeyDistributionMessage } = await sock.signalRepository.encryptGroupMessage({
    group: 'status@broadcast',
    data: encodeWAMessage(message),
    meId: meLid,
  });

  const mediaType = message.imageMessage ? 'image' : null;
  const extraAttrs = mediaType ? { mediatype: mediaType } : {};
  await sock.assertSessions(deviceJids, false);
  const { nodes, shouldIncludeDeviceIdentity } = await sock.createParticipantNodes(
    deviceJids,
    {
      senderKeyDistributionMessage: {
        axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
        groupId: 'status@broadcast',
      },
    },
    extraAttrs
  );

  const content = [
    { tag: 'enc', attrs: { v: '2', type: 'skmsg', ...extraAttrs }, content: ciphertext },
    { tag: 'participants', attrs: {}, content: nodes },
  ];
  if (shouldIncludeDeviceIdentity) {
    content.push({ tag: 'device-identity', attrs: {}, content: encodeSignedDeviceIdentity(creds.account, true) });
  }
  await sock.sendNode({
    tag: 'message',
    attrs: { id: messageId, to: 'status@broadcast', type: mediaType ? 'media' : 'text' },
    content,
  });

  logger.info(
    { usuarios: users.length, dispositivos: deviceJids.length, sinLid: withoutLid },
    'Estado enviado direccionado por LID'
  );
  return true;
}

export async function sendStatusUpdate(content, imagePath, audience = { mode: 'all' }) {
  if (!sock || connectionStatus !== 'connected') {
    throw notConnectedError();
  }

  const statusJid = 'status@broadcast';

  const { jids: statusJidList, recipients, hiddenMembers } = await resolveStatusAudience(audience);

  if (recipients === 0 && audience?.mode !== 'me') {
    throw new Error('No hay contactos en la audiencia elegida para mostrar el estado');
  }

  logger.info(
    { audiencia: recipients, modo: audience?.mode || 'all', sinNumero: hiddenMembers },
    'Audiencia calculada para el estado'
  );

  let msgContent;
  // Un estado de texto sin color de fondo ni fuente llega como "no compatible con esta
  // versión de WhatsApp" a WhatsApp Web y a algunos móviles.
  let textStatusOptions = {};
  if (imagePath && fs.existsSync(imagePath)) {
    logger.debug('Estado con imagen');
    msgContent = {
      image: fs.readFileSync(imagePath),
      caption: content || undefined,
    };
  } else if (content) {
    logger.debug({ chars: content.length }, 'Estado de texto');
    msgContent = { text: content, linkPreview: await buildWhatsAppLinkPreview(content) };
    // font 0 (SYSTEM) Baileys lo descarta por ser falsy: se usa SYSTEM_TEXT (1)
    textStatusOptions = { backgroundColor: STATUS_BACKGROUND, font: 1 };
  } else {
    throw new Error('Status must have text or image');
  }

  try {
    // Se fija el id antes de enviar para no perder un rechazo que llegue muy rápido
    const messageId = generateMessageIDV2(sock.user?.id);
    const rejection = waitForRejection(messageId);
    // Se arma el mensaje a mano en vez de usar sock.sendMessage: Baileys 6.7.24 no añade
    // messageContextInfo.messageSecret y sin él WhatsApp muestra el estado como "no
    // compatible con esta versión" (Baileys 7 ya lo añade a casi todos los mensajes).
    const message = await generateWAMessageContent(msgContent, {
      upload: sock.waUploadToServer,
      logger: baileysLogger,
      ...textStatusOptions,
    });
    message.messageContextInfo = { ...message.messageContextInfo, messageSecret: randomBytes(32) };
    const fullMsg = generateWAMessageFromContent(statusJid, message, { userJid: sock.user.id, messageId });
    if (process.env.WA_TRACE_FILE) {
      logger.info({ id: messageId, message: describeMessage(fullMsg.message) }, '[diag] estado enviado');
    }
    const sentAsLid = await relayStatusAsLid(fullMsg.message, statusJidList, messageId);
    if (!sentAsLid) {
      await sock.relayMessage(statusJid, fullMsg.message, { messageId, statusJidList });
    }
    const error = await rejection;
    if (error) {
      throw httpError(502, `WhatsApp rechazó el estado (código ${error}). Prueba con una audiencia más pequeña.`);
    }
    logger.info({ audiencia: statusJidList.length, id: messageId }, 'Estado publicado y aceptado por WhatsApp');

    createPublishedStatus({ content, imagePath });
    incrementStatusUpdateCount();
  } catch (err) {
    logger.error({ err: err.message }, 'No se pudo publicar el estado');
    throw err;
  }
}
