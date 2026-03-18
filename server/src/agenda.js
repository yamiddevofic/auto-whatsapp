import db from './db.js';

// Table for address book contacts imported from VCF
db.exec(`
  CREATE TABLE IF NOT EXISTS agenda_contacts (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    jid TEXT,
    on_whatsapp INTEGER DEFAULT 0,
    checked_at TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const upsertStmt = db.prepare(`
  INSERT INTO agenda_contacts (phone, name, imported_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(phone) DO UPDATE SET
    name = excluded.name,
    imported_at = datetime('now')
`);

const upsertMany = db.transaction((contacts) => {
  for (const c of contacts) {
    upsertStmt.run(c.phone, c.name);
  }
});

export function importAgendaContacts(contacts) {
  if (contacts.length === 0) return 0;
  upsertMany(contacts);
  return contacts.length;
}

export function getAllAgendaContacts() {
  return db.prepare('SELECT * FROM agenda_contacts ORDER BY name').all();
}

export function getAgendaCount() {
  return db.prepare('SELECT COUNT(*) as count FROM agenda_contacts').get().count;
}

export function getAgendaWhatsAppCount() {
  return db.prepare('SELECT COUNT(*) as count FROM agenda_contacts WHERE on_whatsapp = 1').get().count;
}

export function getUncheckedAgendaContacts(limit = 100) {
  return db.prepare('SELECT * FROM agenda_contacts WHERE checked_at IS NULL LIMIT ?').all(limit);
}

export function markAgendaWhatsApp(phone, jid) {
  db.prepare(`
    UPDATE agenda_contacts SET on_whatsapp = 1, jid = ?, checked_at = datetime('now') WHERE phone = ?
  `).run(jid, phone);
}

export function markAgendaNotWhatsApp(phone) {
  db.prepare(`
    UPDATE agenda_contacts SET on_whatsapp = 0, jid = NULL, checked_at = datetime('now') WHERE phone = ?
  `).run(phone);
}

export function getAgendaWhatsAppJids() {
  return db.prepare("SELECT jid FROM agenda_contacts WHERE on_whatsapp = 1 AND jid IS NOT NULL")
    .all().map((r) => r.jid);
}

export function resetAgendaChecks() {
  db.prepare('UPDATE agenda_contacts SET on_whatsapp = 0, jid = NULL, checked_at = NULL').run();
}

export function deleteAllAgendaContacts() {
  db.prepare('DELETE FROM agenda_contacts').run();
}

// Decode Quoted-Printable string (e.g. =C3=B1 → ñ)
function decodeQuotedPrintable(str) {
  // First, join soft line breaks (trailing =)
  const joined = str.replace(/=\r?\n/g, '');
  // Replace =XX hex sequences with actual bytes
  const bytes = [];
  let i = 0;
  while (i < joined.length) {
    if (joined[i] === '=' && i + 2 < joined.length) {
      const hex = joined.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(joined.charCodeAt(i));
    i++;
  }
  return Buffer.from(bytes).toString('utf8');
}

// Check if a VCF property line uses Quoted-Printable encoding
function isQuotedPrintable(line) {
  return /ENCODING=QUOTED-PRINTABLE/i.test(line);
}

// Parse a VCF string into [{name, phone}]
export function parseVCF(vcfText) {
  const contacts = [];
  const entries = vcfText.split('BEGIN:VCARD');

  for (const entry of entries) {
    if (!entry.trim()) continue;

    let name = null;
    const phones = [];

    // Join folded lines: lines starting with space/tab are continuations
    const rawLines = entry.split('\n');
    const lines = [];
    for (const rawLine of rawLines) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith(' ') || line.startsWith('\t')) {
        if (lines.length > 0) {
          lines[lines.length - 1] += line.substring(1);
        }
      } else {
        lines.push(line);
      }
    }

    // Also join Quoted-Printable soft line breaks (line ending with =)
    const joined = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      while (line.endsWith('=') && i + 1 < lines.length) {
        i++;
        line = line.slice(0, -1) + lines[i];
      }
      joined.push(line);
    }

    for (const line of joined) {
      // Parse FN (formatted name) — preferred
      if (line.startsWith('FN:') || line.startsWith('FN;')) {
        let val = line.substring(line.indexOf(':') + 1).trim();
        if (val) {
          if (isQuotedPrintable(line)) val = decodeQuotedPrintable(val);
          name = val;
        }
      }

      // Parse N if no FN
      if (!name && (line.startsWith('N:') || line.startsWith('N;'))) {
        let val = line.substring(line.indexOf(':') + 1).trim();
        if (val) {
          if (isQuotedPrintable(line)) val = decodeQuotedPrintable(val);
          const parts = val.split(';').filter(Boolean);
          if (parts.length > 0) name = parts.reverse().join(' ').trim();
        }
      }

      // Parse TEL
      if (/^TEL/i.test(line)) {
        let phone = line.substring(line.indexOf(':') + 1).trim();
        if (phone) {
          phone = phone.replace(/[\s\-().]/g, '');
          if (phone.length >= 7) {
            phones.push(phone);
          }
        }
      }
    }

    if (name && phones.length > 0) {
      for (const phone of phones) {
        contacts.push({ name, phone });
      }
    }
  }

  return contacts;
}
