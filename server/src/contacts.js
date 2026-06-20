import db from './db.js';

export function initContactsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      jid TEXT PRIMARY KEY,
      name TEXT,
      notify TEXT,
      groups_list TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL DEFAULT 'default'
    )
  `);

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN groups_list TEXT`);
  } catch {
    // column already exists
  }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`);
  } catch {
    // column already exists
  }
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
  console.log(`[Contacts] Saved ${valid.length} contacts`);
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

export function getContactCount() {
  return db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
}

export function getAllContactJids() {
  return db.prepare('SELECT jid FROM contacts').all().map((r) => r.jid);
}

export function deleteAllContacts() {
  db.prepare('DELETE FROM contacts').run();
}
