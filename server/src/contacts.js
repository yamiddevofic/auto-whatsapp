import db, { dropColumnIfExists } from './db.js';
import { logger } from './logger.js';

export function initContactsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      jid TEXT PRIMARY KEY,
      name TEXT,
      notify TEXT,
      groups_list TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN groups_list TEXT`);
  } catch {
    // column already exists
  }

  // El sistema es monousuario: la columna user_id sugería un aislamiento que ninguna
  // consulta aplicaba. Ver Docs/02-hallazgos-seguridad.md SEC-019.
  dropColumnIfExists('contacts', 'user_id');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_notify ON contacts(notify)');
}

export function saveContacts(contactsList) {
  const valid = contactsList.filter((c) => c.jid && c.jid.endsWith('@s.whatsapp.net'));
  if (valid.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO contacts (jid, name, notify, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(jid) DO UPDATE SET
      name = COALESCE(excluded.name, contacts.name),
      notify = COALESCE(excluded.notify, contacts.notify),
      updated_at = datetime('now')
  `);

  const tx = db.transaction((list) => {
    for (const c of list) {
      stmt.run(c.jid, c.name || null, c.notify || null);
    }
  });

  tx(valid);
  logger.debug({ total: valid.length }, 'Contactos guardados');
}

export function savePushName(jid, pushName) {
  if (!jid || !pushName || !jid.endsWith('@s.whatsapp.net')) return;
  db.prepare(`
    INSERT INTO contacts (jid, notify, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(jid) DO UPDATE SET
      notify = ?,
      updated_at = datetime('now')
  `).run(jid, pushName, pushName);
}

export function updateContactGroups(contactGroupMap) {
  const stmt = db.prepare(`
    UPDATE contacts SET groups_list = ? WHERE jid = ?
  `);
  const tx = db.transaction((entries) => {
    for (const [jid, groups] of entries) {
      stmt.run(groups, jid);
    }
  });
  tx(Object.entries(contactGroupMap));
}

export function getAllContacts() {
  return db.prepare(`
    SELECT c.*,
      COALESCE(a1.name, a2.name) as agenda_name
    FROM contacts c
    LEFT JOIN agenda_contacts a1 ON a1.jid = c.jid
    LEFT JOIN agenda_contacts a2 ON ('+' || REPLACE(c.jid, '@s.whatsapp.net', '')) = a2.phone
    ORDER BY COALESCE(c.notify, c.name, a1.name, a2.name, c.jid)
  `).all();
}

const CONTACTS_FROM = `
  FROM contacts c
  LEFT JOIN agenda_contacts a1 ON a1.jid = c.jid
  LEFT JOIN agenda_contacts a2 ON ('+' || REPLACE(c.jid, '@s.whatsapp.net', '')) = a2.phone
`;

/**
 * Búsqueda y paginación en SQL. Antes se cargaban todas las filas y se filtraba en
 * JavaScript en cada pulsación del buscador. Ver Docs/04-calidad-arquitectura.md ARQ-004.
 */
export function findContacts({ search = '', limit = 50, offset = 0 } = {}) {
  const like = `%${search.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const where = search
    ? `WHERE lower(c.notify) LIKE @q ESCAPE '\\' OR lower(c.name) LIKE @q ESCAPE '\\'
         OR lower(COALESCE(a1.name, a2.name)) LIKE @q ESCAPE '\\'
         OR lower(c.groups_list) LIKE @q ESCAPE '\\' OR lower(c.jid) LIKE @q ESCAPE '\\'`
    : '';
  const params = search ? [{ q: like }] : [];

  const total = db.prepare(`SELECT COUNT(*) AS n ${CONTACTS_FROM} ${where}`).get(...params).n;
  const items = db.prepare(`
    SELECT c.*, COALESCE(a1.name, a2.name) AS agenda_name
    ${CONTACTS_FROM} ${where}
    ORDER BY COALESCE(c.notify, c.name, a1.name, a2.name, c.jid)
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `).all(...params);

  return { items, total };
}

export function getContactCount() {
  return db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
}

export function getAllContactJids() {
  return db.prepare('SELECT jid FROM contacts').all().map((r) => r.jid);
}

export function deleteAllContacts() {
  db.prepare('DELETE FROM contacts').run();
}
