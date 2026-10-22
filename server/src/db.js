import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import config from './config.js';
import { logger } from './logger.js';

// SQLite nativo con escrituras atómicas reales. Sustituye a sql.js, que serializaba y
// reescribía el archivo completo en cada INSERT. Ver Docs/04-calidad-arquitectura.md ARQ-001.
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const ATTACHMENT_TABLES = ['messages', 'status_updates', 'direct_messages', 'published_statuses'];

/** ¿Alguna fila sigue usando este adjunto? Un estado enviado y su registro en
 *  published_statuses comparten la misma imagen. */
function isAttachmentReferenced(imagePath) {
  return ATTACHMENT_TABLES.some((table) =>
    db.prepare(`SELECT 1 FROM ${table} WHERE image_path = ? LIMIT 1`).get(imagePath)
  );
}

/**
 * Borra un adjunto si ya ninguna fila lo referencia, verificando que esté dentro del
 * directorio de subidas. Llamar después de borrar la fila que lo usaba.
 */
export function deleteAttachment(imagePath) {
  if (!imagePath) return;
  const resolved = path.resolve(imagePath);
  const uploads = path.resolve(config.uploadsDir);
  if (!resolved.startsWith(uploads + path.sep)) {
    logger.warn('Se ignoró el borrado de un adjunto fuera del directorio de subidas');
    return;
  }
  if (isAttachmentReferenced(imagePath)) return;
  fs.promises.unlink(resolved).catch((err) => {
    if (err.code !== 'ENOENT') logger.warn({ err: err.message }, 'No se pudo borrar el adjunto');
  });
}

/** Elimina una columna si existe (SQLite >= 3.35). */
export function dropColumnIfExists(table, column) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (exists) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

export async function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      content TEXT NOT NULL,
      image_path TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS status_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      image_path TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipients TEXT NOT NULL,
      recipient_label TEXT NOT NULL,
      content TEXT NOT NULL,
      image_path TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS message_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      messages_sent INTEGER DEFAULT 0,
      status_updates_sent INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS published_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      image_path TEXT,
      published_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Tokens revocados por logout; persisten entre reinicios. Ver SEC-020.
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_status        ON messages(status);
    CREATE INDEX IF NOT EXISTS idx_status_updates_status  ON status_updates(status);
    CREATE INDEX IF NOT EXISTS idx_direct_messages_status ON direct_messages(status);
  `);

  // Audiencia del estado (JSON). NULL = todos, que era el comportamiento anterior.
  const hasAudience = db.prepare("SELECT 1 FROM pragma_table_info('status_updates') WHERE name = 'audience'").get();
  if (!hasAudience) db.exec('ALTER TABLE status_updates ADD COLUMN audience TEXT');

  logger.info({ db: config.dbPath }, 'Base de datos inicializada');
  return db;
}

// --- Status updates ---

export function createStatusUpdate({ content, imagePath, scheduledAt, audience }) {
  const result = db.prepare(
    `INSERT INTO status_updates (content, image_path, scheduled_at, audience) VALUES (?, ?, ?, ?)`
  ).run(content || null, imagePath || null, scheduledAt, audience ? JSON.stringify(audience) : null);
  return getStatusUpdateById(result.lastInsertRowid);
}

export function getAllStatusUpdates() {
  return db.prepare('SELECT * FROM status_updates ORDER BY scheduled_at DESC').all();
}

export function getStatusUpdateById(id) {
  return db.prepare('SELECT * FROM status_updates WHERE id = ?').get(id);
}

export function updateStatusUpdateStatus(id, status, error = null) {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  db.prepare('UPDATE status_updates SET status = ?, sent_at = ?, error = ? WHERE id = ?')
    .run(status, sentAt, error, id);
}

export function getPendingStatusUpdates() {
  return db.prepare("SELECT * FROM status_updates WHERE status = 'pending'").all();
}

export function cancelStatusUpdate(id) {
  db.prepare("UPDATE status_updates SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
}

export function updateStatusUpdate(id, { content, scheduledAt }) {
  const fields = [];
  const values = [];
  if (content !== undefined) { fields.push('content = ?'); values.push(content); }
  if (scheduledAt !== undefined) { fields.push('scheduled_at = ?'); values.push(scheduledAt); }
  if (fields.length === 0) return getStatusUpdateById(id);
  values.push(id);
  db.prepare(`UPDATE status_updates SET ${fields.join(', ')} WHERE id = ? AND status = 'pending'`).run(...values);
  return getStatusUpdateById(id);
}

export function deleteStatusUpdate(id) {
  const row = getStatusUpdateById(id);
  db.prepare('DELETE FROM status_updates WHERE id = ?').run(id);
  deleteAttachment(row?.image_path);
}

// --- Messages ---

export function createMessage({ groupId, groupName, content, imagePath, scheduledAt }) {
  const result = db.prepare(
    `INSERT INTO messages (group_id, group_name, content, image_path, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(groupId, groupName, content, imagePath || null, scheduledAt);
  return getMessageById(result.lastInsertRowid);
}

export function getAllMessages() {
  return db.prepare('SELECT * FROM messages ORDER BY scheduled_at DESC').all();
}

export function getMessageById(id) {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

export function updateMessageStatus(id, status, error = null) {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  db.prepare('UPDATE messages SET status = ?, sent_at = ?, error = ? WHERE id = ?')
    .run(status, sentAt, error, id);
}

export function getPendingMessages() {
  return db.prepare("SELECT * FROM messages WHERE status = 'pending'").all();
}

export function cancelMessage(id) {
  db.prepare("UPDATE messages SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
}

export function updateMessage(id, { content, scheduledAt, groupId, groupName }) {
  const fields = [];
  const values = [];
  if (content !== undefined) { fields.push('content = ?'); values.push(content); }
  if (scheduledAt !== undefined) { fields.push('scheduled_at = ?'); values.push(scheduledAt); }
  if (groupId !== undefined) { fields.push('group_id = ?'); values.push(groupId); }
  if (groupName !== undefined) { fields.push('group_name = ?'); values.push(groupName); }
  if (fields.length === 0) return getMessageById(id);
  values.push(id);
  db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ? AND status = 'pending'`).run(...values);
  return getMessageById(id);
}

export function deleteMessage(id) {
  const row = getMessageById(id);
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  deleteAttachment(row?.image_path);
}

// --- Direct messages ---

export function createDirectMessage({ recipients, recipientLabel, content, imagePath, scheduledAt }) {
  const result = db.prepare(
    `INSERT INTO direct_messages (recipients, recipient_label, content, image_path, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(JSON.stringify(recipients), recipientLabel, content, imagePath || null, scheduledAt);
  return getDirectMessageById(result.lastInsertRowid);
}

export function getAllDirectMessages() {
  return db.prepare('SELECT * FROM direct_messages ORDER BY scheduled_at DESC').all();
}

export function getDirectMessageById(id) {
  return db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(id);
}

export function updateDirectMessageStatus(id, status, error = null) {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  db.prepare('UPDATE direct_messages SET status = ?, sent_at = ?, error = ? WHERE id = ?')
    .run(status, sentAt, error, id);
}

export function getPendingDirectMessages() {
  return db.prepare("SELECT * FROM direct_messages WHERE status = 'pending'").all();
}

export function cancelDirectMessage(id) {
  db.prepare("UPDATE direct_messages SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id);
}

export function updateDirectMessage(id, { content, scheduledAt }) {
  const fields = [];
  const values = [];
  if (content !== undefined) { fields.push('content = ?'); values.push(content); }
  if (scheduledAt !== undefined) { fields.push('scheduled_at = ?'); values.push(scheduledAt); }
  if (fields.length === 0) return getDirectMessageById(id);
  values.push(id);
  db.prepare(`UPDATE direct_messages SET ${fields.join(', ')} WHERE id = ? AND status = 'pending'`).run(...values);
  return getDirectMessageById(id);
}

export function deleteDirectMessage(id) {
  const row = getDirectMessageById(id);
  db.prepare('DELETE FROM direct_messages WHERE id = ?').run(id);
  deleteAttachment(row?.image_path);
}

// --- Estadísticas y límite diario anti-bloqueo ---

export function getTodayMessageStats() {
  const today = new Date().toISOString().split('T')[0];
  return db.prepare('SELECT * FROM message_stats WHERE date = ?').get(today)
    ?? { date: today, messages_sent: 0, status_updates_sent: 0 };
}

export function incrementMessageCount() {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO message_stats (date, messages_sent, status_updates_sent) VALUES (?, 1, 0)
    ON CONFLICT(date) DO UPDATE SET messages_sent = messages_sent + 1
  `).run(today);
}

export function incrementStatusUpdateCount() {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO message_stats (date, messages_sent, status_updates_sent) VALUES (?, 0, 1)
    ON CONFLICT(date) DO UPDATE SET status_updates_sent = status_updates_sent + 1
  `).run(today);
}

/**
 * Límite diario progresivo: 200 el primer día, +50 por día de antigüedad, tope 500.
 * Antes contaba filas de message_stats (días con envíos), no la antigüedad real de la
 * cuenta. Ver Docs/04-calidad-arquitectura.md ARQ-008.
 */
export function getDailyLimit() {
  const first = db.prepare('SELECT MIN(date) AS d FROM message_stats').get().d;
  if (!first) return 200;
  const days = Math.max(0, Math.floor((Date.now() - new Date(first).getTime()) / 86_400_000));
  return Math.min(200 + days * 50, 500);
}

export function canSendMoreMessages(count = 1) {
  const stats = getTodayMessageStats();
  return (stats.messages_sent + count) <= getDailyLimit();
}

// --- Estados publicados ---

export function createPublishedStatus({ content, imagePath }) {
  const result = db.prepare(
    `INSERT INTO published_statuses (content, image_path) VALUES (?, ?)`
  ).run(content || null, imagePath || null);
  return getPublishedStatusById(result.lastInsertRowid);
}

export function getAllPublishedStatuses() {
  return db.prepare('SELECT * FROM published_statuses ORDER BY published_at DESC').all();
}

export function getPublishedStatusById(id) {
  return db.prepare('SELECT * FROM published_statuses WHERE id = ?').get(id);
}

export function deletePublishedStatus(id) {
  const row = getPublishedStatusById(id);
  if (!row) return null;
  db.prepare('DELETE FROM published_statuses WHERE id = ?').run(id);
  deleteAttachment(row.image_path);
  return row;
}

// --- Tokens revocados ---

export function revokeTokenId(jti, expiresAtMs) {
  db.prepare('INSERT OR REPLACE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)')
    .run(jti, expiresAtMs);
}

export function isTokenIdRevoked(jti) {
  return !!db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(jti);
}

export function purgeExpiredRevokedTokens() {
  return db.prepare('DELETE FROM revoked_tokens WHERE expires_at <= ?').run(Date.now()).changes;
}

// --- Mantenimiento ---

/** Purga mensajes históricos más antiguos que el periodo de retención configurado. */
export function purgeOldHistory(days = config.retentionDays) {
  if (!days || days <= 0) return 0;
  const cutoff = `-${days} days`;
  let removed = 0;
  for (const table of ['messages', 'direct_messages', 'status_updates']) {
    const rows = db.prepare(
      `SELECT id, image_path FROM ${table}
       WHERE status IN ('sent','failed','cancelled') AND created_at < date('now', ?)`
    ).all(cutoff);
    const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    for (const row of rows) {
      del.run(row.id);
      deleteAttachment(row.image_path);
      removed++;
    }
  }
  if (removed > 0) logger.info({ removed, days }, 'Historial antiguo purgado');
  return removed;
}

/** Borra los adjuntos de uploads/ que ya no referencia ninguna fila. Ver SEC-023. */
export function cleanOrphanUploads() {
  const referenced = new Set(
    [
      ...getAllMessages(), ...getAllStatusUpdates(),
      ...getAllDirectMessages(), ...getAllPublishedStatuses(),
    ]
      .map((row) => row.image_path)
      .filter(Boolean)
      .map((p) => path.basename(p))
  );

  // Los archivos recientes pueden pertenecer a una petición o un envío inmediato en curso
  const minAge = Date.now() - 60 * 60 * 1000;
  let removed = 0;
  for (const file of fs.readdirSync(config.uploadsDir)) {
    if (!referenced.has(file)) {
      try {
        const full = path.join(config.uploadsDir, file);
        if (fs.statSync(full).mtimeMs > minAge) continue;
        fs.unlinkSync(full);
        removed++;
      } catch (err) {
        if (err.code !== 'ENOENT') logger.warn({ err: err.message }, 'No se pudo borrar un huérfano');
      }
    }
  }
  if (removed > 0) logger.info({ removed }, 'Adjuntos huérfanos eliminados');
  return removed;
}

export function closeDatabase() {
  try { db.close(); } catch { /* ya cerrada */ }
}

export default db;
