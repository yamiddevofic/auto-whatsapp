import initSqlJs from 'sql.js';
import fs from 'fs';
import config from './config.js';

let _raw = null;
let _inTransaction = false;

class Statement {
  constructor(rawDb, sql) {
    this._rawDb = rawDb;
    this._sql = sql;
  }

  _prepare(params) {
    const stmt = this._rawDb.prepare(this._sql);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    return stmt;
  }

  get(...params) {
    const stmt = this._prepare(params);
    try {
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = this._prepare(params);
    try {
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  run(...params) {
    const stmt = this._prepare(params);
    try {
      stmt.step();
      stmt.free();
      const idStmt = this._rawDb.prepare('SELECT last_insert_rowid() as id');
      const lastId = idStmt.step() ? idStmt.getAsObject().id : null;
      idStmt.free();
      const changes = this._rawDb.getRowsModified();
      return { lastInsertRowid: lastId, changes };
    } finally {
      if (!_inTransaction) save();
    }
  }
}

function save() {
  const data = _raw.export();
  fs.writeFileSync(config.dbPath, Buffer.from(data));
}

const db = {
  prepare(sql) {
    return new Statement(_raw, sql);
  },

  exec(sql) {
    _raw.exec(sql);
    save();
  },

  transaction(fn) {
    return (...args) => {
      _raw.run('BEGIN');
      _inTransaction = true;
      try {
        const result = fn(...args);
        _raw.run('COMMIT');
        _inTransaction = false;
        save();
        return result;
      } catch (e) {
        _inTransaction = false;
        try {
          _raw.run('ROLLBACK');
        } catch (rollbackError) {
          console.warn('[DB] rollback failed:', rollbackError.message);
        }
        throw e;
      }
    };
  },
};

export async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    _raw = new SQL.Database(buffer);
  } else {
    _raw = new SQL.Database();
  }

  _raw.run('PRAGMA journal_mode = WAL');

  _raw.exec(`
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

  _raw.exec(`
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

  _raw.exec(`
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

  _raw.exec(`
    CREATE TABLE IF NOT EXISTS message_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      messages_sent INTEGER DEFAULT 0,
      status_updates_sent INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  save();
  return db;
}

// --- Status updates CRUD ---

export function createStatusUpdate({ content, imagePath, scheduledAt }) {
  const result = db.prepare(
    `INSERT INTO status_updates (content, image_path, scheduled_at)
     VALUES (?, ?, ?)`
  ).run(content || null, imagePath || null, scheduledAt);
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

// --- Direct messages CRUD ---

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

// --- Message stats for anti-bot detection ---

export function getTodayMessageStats() {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare('SELECT * FROM message_stats WHERE date = ?').get(today);
  if (!stats) {
    return { date: today, messages_sent: 0, status_updates_sent: 0 };
  }
  return stats;
}

export function incrementMessageCount() {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO message_stats (date, messages_sent, status_updates_sent)
    VALUES (?, 1, 0)
    ON CONFLICT(date) DO UPDATE SET
      messages_sent = messages_sent + 1
  `).run(today);
}

export function incrementStatusUpdateCount() {
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO message_stats (date, messages_sent, status_updates_sent)
    VALUES (?, 0, 1)
    ON CONFLICT(date) DO UPDATE SET
      status_updates_sent = status_updates_sent + 1
  `).run(today);
}

export function getDailyLimit() {
  const stats = getTodayMessageStats();
  const daysActive = db.prepare('SELECT COUNT(*) as count FROM message_stats').get().count;
  
  // Gradual increase: 200 for day 1, +50 per day up to 500 max
  if (daysActive === 0) return 200;
  const limit = Math.min(200 + (daysActive * 50), 500);
  return limit;
}

export function canSendMoreMessages(count = 1) {
  const stats = getTodayMessageStats();
  const limit = getDailyLimit();
  return (stats.messages_sent + count) <= limit;
}

export default db;
