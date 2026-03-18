import Database from 'better-sqlite3';
import config from './config.js';

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

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
  )
`);

// Status updates table
db.exec(`
  CREATE TABLE IF NOT EXISTS status_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    image_path TEXT,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    error TEXT
  )
`);

// --- Status updates CRUD ---

export function createStatusUpdate({ content, imagePath, scheduledAt }) {
  const stmt = db.prepare(
    `INSERT INTO status_updates (content, image_path, scheduled_at)
     VALUES (?, ?, ?)`
  );
  const result = stmt.run(content || null, imagePath || null, scheduledAt);
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
  db.prepare(
    'UPDATE status_updates SET status = ?, sent_at = ?, error = ? WHERE id = ?'
  ).run(status, sentAt, error, id);
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
  db.prepare('DELETE FROM status_updates WHERE id = ?').run(id);
}

// --- Messages CRUD ---

export function createMessage({ groupId, groupName, content, imagePath, scheduledAt }) {
  const stmt = db.prepare(
    `INSERT INTO messages (group_id, group_name, content, image_path, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const result = stmt.run(groupId, groupName, content, imagePath || null, scheduledAt);
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
  db.prepare(
    'UPDATE messages SET status = ?, sent_at = ?, error = ? WHERE id = ?'
  ).run(status, sentAt, error, id);
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
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

// Direct messages table (messages to individual contacts)
db.exec(`
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
  )
`);

// --- Direct messages CRUD ---

export function createDirectMessage({ recipients, recipientLabel, content, imagePath, scheduledAt }) {
  const stmt = db.prepare(
    `INSERT INTO direct_messages (recipients, recipient_label, content, image_path, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const result = stmt.run(JSON.stringify(recipients), recipientLabel, content, imagePath || null, scheduledAt);
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
  db.prepare(
    'UPDATE direct_messages SET status = ?, sent_at = ?, error = ? WHERE id = ?'
  ).run(status, sentAt, error, id);
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
  db.prepare('DELETE FROM direct_messages WHERE id = ?').run(id);
}

export default db;
