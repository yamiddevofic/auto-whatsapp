import React, { useState, useEffect, useCallback } from 'react';
import { fetchContacts, syncContacts, deleteAllContacts, unlinkWhatsApp } from '../api.js';
import DirectMessageForm from './DirectMessageForm.jsx';

const PAGE_SIZE = 50;

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 8,
  },
  count: { fontSize: 14, color: '#555' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: (color, bg) => ({
    padding: '6px 14px', fontSize: 13, fontWeight: 600, color,
    backgroundColor: bg, border: 'none', borderRadius: 4, cursor: 'pointer',
  }),
  searchInput: {
    padding: '8px 12px', fontSize: 14, border: '1px solid #ccc',
    borderRadius: 6, width: '100%', boxSizing: 'border-box',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #e0e0e0',
    color: '#555', fontWeight: 600,
  },
  td: { padding: '8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' },
  tdMuted: {
    padding: '8px', borderBottom: '1px solid #f0f0f0',
    color: '#bbb', fontStyle: 'italic', verticalAlign: 'top',
  },
  groupsCell: {
    padding: '8px', borderBottom: '1px solid #f0f0f0', fontSize: 12,
    color: '#777', maxWidth: 220, verticalAlign: 'top',
  },
  empty: { color: '#999', textAlign: 'center', padding: 20 },
  info: { fontSize: 13, color: '#777', marginBottom: 8, lineHeight: 1.5 },
  pagination: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    gap: 8, marginTop: 12,
  },
  pageBtn: (disabled) => ({
    padding: '6px 14px', fontSize: 13, fontWeight: 600,
    color: disabled ? '#bbb' : '#075E54',
    backgroundColor: disabled ? '#f5f5f5' : '#E8F5E9',
    border: '1px solid ' + (disabled ? '#e0e0e0' : '#25D366'),
    borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
  }),
  pageInfo: { fontSize: 13, color: '#555' },
  unlinkBox: {
    marginTop: 16, padding: 16, background: '#FFF3E0',
    border: '1px solid #FFB74D', borderRadius: 6,
  },
  unlinkTitle: { margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#E65100' },
  unlinkText: { fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.5 },
  selectionBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
    background: '#E3F2FD', borderRadius: 6, fontSize: 13, color: '#1565C0',
    fontWeight: 500,
  },
  checkbox: { width: 16, height: 16, cursor: 'pointer' },
};

function getDisplayName(c) {
  return c.notify || c.name || c.agenda_name || null;
}

export default function ContactList() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [selected, setSelected] = useState(new Map()); // jid -> {jid, name}
  const [showForm, setShowForm] = useState(false);

  const loadContacts = useCallback(async (p, s) => {
    setLoading(true);
    try {
      const result = await fetchContacts({ page: p, limit: PAGE_SIZE, search: s });
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts(page, search);
  }, [page, search, loadContacts]);

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };

  const handleSync = async () => {
    setLoading(true);
    try {
      const result = await syncContacts();
      if (result.error) alert(result.error);
      else { setPage(1); await loadContacts(1, search); }
    } catch { alert('Error al sincronizar contactos'); }
    finally { setLoading(false); }
  };

  const handleUnlink = async () => {
    if (!window.confirm(
      'Esto desvinculara tu WhatsApp y eliminara los contactos guardados.\n\n' +
      'Tendras que escanear el QR de nuevo.\n\nContinuar?'
    )) return;
    setUnlinking(true);
    try {
      const result = await unlinkWhatsApp();
      if (result.error) alert(result.error);
      else {
        setData({ items: [], total: 0, page: 1, totalPages: 0 });
        alert('Desvinculado. Ve al inicio y escanea el nuevo codigo QR.');
      }
    } catch { alert('Error al desvincular'); }
    finally { setUnlinking(false); }
  };

  const contactToEntry = (c) => ({
    jid: c.jid,
    name: getDisplayName(c) || c.jid.replace('@s.whatsapp.net', ''),
  });

  const toggleSelect = (c) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.jid)) next.delete(c.jid);
      else next.set(c.jid, contactToEntry(c));
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageItems = data.items;
    const allSelected = pageItems.length > 0 && pageItems.every((c) => selected.has(c.jid));
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        pageItems.forEach((c) => next.delete(c.jid));
      } else {
        pageItems.forEach((c) => next.set(c.jid, contactToEntry(c)));
      }
      return next;
    });
  };

  const selectAllContacts = async () => {
    try {
      const result = await fetchContacts({ page: 1, limit: 10000, search });
      const next = new Map();
      result.items.forEach((c) => next.set(c.jid, contactToEntry(c)));
      setSelected(next);
    } catch {
      alert('Error al seleccionar todos');
    }
  };

  const clearSelection = () => { setSelected(new Map()); setShowForm(false); };

  const getSelectedContacts = () => {
    return [...selected.values()];
  };

  const { items, total, totalPages } = data;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pageAllSelected = items.length > 0 && items.every((c) => selected.has(c.jid));

  return (
    <div style={styles.container}>
      <p style={styles.info}>
        Selecciona contactos para programar mensajes directos. Puedes seleccionar todos o elegir individualmente.
      </p>

      <div style={styles.header}>
        <span style={styles.count}>{total} contactos</span>
        <div style={styles.actions}>
          <button style={styles.btn('#fff', '#25D366')} onClick={handleSync} disabled={loading}>
            {loading ? 'Sincronizando...' : 'Sincronizar desde grupos'}
          </button>
        </div>
      </div>

      <input
        style={styles.searchInput}
        type="text"
        placeholder="Buscar por nombre, numero o grupo..."
        value={search}
        onChange={handleSearch}
      />

      {selected.size > 0 && (
        <div style={styles.selectionBar}>
          <span>{selected.size} contacto(s) seleccionado(s)</span>
          <button style={styles.btn('#fff', '#25D366')} onClick={() => setShowForm(true)}>
            Programar mensaje
          </button>
          <button style={styles.btn('#fff', '#1E88E5')} onClick={selectAllContacts}>
            Seleccionar todos ({total})
          </button>
          <button style={styles.btn('#555', '#e0e0e0')} onClick={clearSelection}>
            Limpiar
          </button>
        </div>
      )}

      {showForm && selected.size > 0 && (
        <DirectMessageForm
          selectedContacts={getSelectedContacts()}
          onClose={() => setShowForm(false)}
          onSent={() => { clearSelection(); }}
        />
      )}

      {items.length === 0 ? (
        <p style={styles.empty}>
          {total === 0 && !search
            ? 'No hay contactos. Sincroniza o desvincula y vuelve a escanear el QR.'
            : 'No se encontraron contactos'}
        </p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 36 }}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={pageAllSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ ...styles.th, width: 40 }}>#</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={styles.th}>Numero</th>
                  <th style={styles.th}>Grupos</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => {
                  const name = getDisplayName(c);
                  const num = c.jid.replace('@s.whatsapp.net', '');
                  return (
                    <tr key={c.jid} style={selected.has(c.jid) ? { background: '#E3F2FD' } : {}}>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          style={styles.checkbox}
                          checked={selected.has(c.jid)}
                          onChange={() => toggleSelect(c)}
                        />
                      </td>
                      <td style={styles.td}>{from + i}</td>
                      <td style={name ? styles.td : styles.tdMuted}>
                        {name || `+${num}`}
                      </td>
                      <td style={styles.td}>+{num}</td>
                      <td style={styles.groupsCell}>{c.groups_list || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button style={styles.pageBtn(page <= 1)} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span style={styles.pageInfo}>{from}-{to} de {total}</span>
              <button style={styles.pageBtn(page >= totalPages)} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      <div style={styles.unlinkBox}>
        <h4 style={styles.unlinkTitle}>Desvincular y re-vincular WhatsApp</h4>
        <p style={styles.unlinkText}>
          Si los contactos aparecen sin nombre, desvincula y vuelve a escanear el QR.
        </p>
        <button style={styles.btn('#fff', '#E65100')} onClick={handleUnlink} disabled={unlinking}>
          {unlinking ? 'Desvinculando...' : 'Desvincular WhatsApp'}
        </button>
      </div>
    </div>
  );
}
