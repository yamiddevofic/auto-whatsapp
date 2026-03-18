import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAgenda, fetchAgendaStats, importAgendaVCF, checkAgendaWhatsApp, resetAgendaChecks, deleteAgenda } from '../api.js';
import DirectMessageForm from './DirectMessageForm.jsx';

const PAGE_SIZE = 50;

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 },
  info: { fontSize: 13, color: '#777', marginBottom: 4, lineHeight: 1.5 },
  stats: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 },
  stat: (bg, color) => ({
    padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
    backgroundColor: bg, color,
  }),
  uploadBox: {
    padding: 16, border: '2px dashed #ccc', borderRadius: 8,
    textAlign: 'center', marginBottom: 12, background: '#fafafa',
  },
  uploadLabel: { fontSize: 14, color: '#555', marginBottom: 8, display: 'block' },
  btn: (color, bg) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 600, color,
    backgroundColor: bg, border: 'none', borderRadius: 4, cursor: 'pointer',
  }),
  btnSmall: (color, bg) => ({
    padding: '5px 12px', fontSize: 12, fontWeight: 600, color,
    backgroundColor: bg, border: 'none', borderRadius: 4, cursor: 'pointer',
  }),
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  searchRow: { display: 'flex', gap: 8 },
  searchInput: {
    padding: '8px 12px', fontSize: 14, border: '1px solid #ccc',
    borderRadius: 6, flex: 1, boxSizing: 'border-box',
  },
  filterSelect: {
    padding: '8px 12px', fontSize: 13, border: '1px solid #ccc',
    borderRadius: 6, background: '#fff',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #e0e0e0',
    color: '#555', fontWeight: 600,
  },
  td: { padding: '8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' },
  badge: (yes) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
    fontSize: 11, fontWeight: 600,
    color: yes ? '#2E7D32' : '#999',
    backgroundColor: yes ? '#E8F5E9' : '#f5f5f5',
  }),
  empty: { color: '#999', textAlign: 'center', padding: 20 },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
  pageBtn: (disabled) => ({
    padding: '6px 14px', fontSize: 13, fontWeight: 600,
    color: disabled ? '#bbb' : '#075E54',
    backgroundColor: disabled ? '#f5f5f5' : '#E8F5E9',
    border: '1px solid ' + (disabled ? '#e0e0e0' : '#25D366'),
    borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
  }),
  pageInfo: { fontSize: 13, color: '#555' },
  progress: { fontSize: 13, color: '#1E88E5', fontWeight: 500 },
  selectionBar: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
    background: '#E3F2FD', borderRadius: 6, fontSize: 13, color: '#1565C0',
    fontWeight: 500, flexWrap: 'wrap',
  },
  checkbox: { width: 16, height: 16, cursor: 'pointer' },
};

export default function AgendaList() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [stats, setStats] = useState({ total: 0, onWhatsApp: 0 });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState('');
  const [selected, setSelected] = useState(new Map()); // phone -> {jid, name, phone}
  const [showForm, setShowForm] = useState(false);
  const [countryCode, setCountryCode] = useState('57');
  const fileRef = useRef();
  const checkingRef = useRef(false);

  const loadData = useCallback(async (p, s, f) => {
    const [result, st] = await Promise.all([
      fetchAgenda({ page: p, limit: PAGE_SIZE, search: s, filter: f }),
      fetchAgendaStats(),
    ]);
    setData(result);
    setStats(st);
  }, []);

  useEffect(() => {
    loadData(page, search, filter);
  }, [page, search, filter, loadData]);

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };
  const handleFilter = (e) => { setFilter(e.target.value); setPage(1); };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importAgendaVCF(file);
      if (result.error) alert(result.error);
      else {
        alert(`${result.imported} contactos importados`);
        setPage(1);
        await loadData(1, search, filter);
      }
    } catch { alert('Error al importar archivo'); }
    finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    checkingRef.current = true;
    let totalChecked = 0;
    let totalFound = 0;
    try {
      while (checkingRef.current) {
        const result = await checkAgendaWhatsApp(countryCode);
        if (result.error) { alert(result.error); break; }
        totalChecked += result.checked;
        totalFound += result.found;
        setCheckProgress(`Verificados: ${totalChecked} | En WhatsApp: ${totalFound}`);
        await loadData(page, search, filter);
        if (!result.remaining || result.checked === 0) break;
      }
      setCheckProgress(`Listo. ${totalChecked} verificados, ${totalFound} en WhatsApp.`);
    } catch { alert('Error al verificar contactos'); }
    finally { setChecking(false); checkingRef.current = false; }
  };

  const handleStopCheck = () => { checkingRef.current = false; };

  const handleReset = async () => {
    if (!window.confirm('Esto reiniciara la verificacion de todos los contactos para volver a verificarlos.')) return;
    await resetAgendaChecks();
    setCheckProgress('');
    setPage(1);
    await loadData(1, search, filter);
  };

  const handleDelete = async () => {
    if (!window.confirm('Eliminar todos los contactos de agenda?')) return;
    await deleteAgenda();
    setPage(1);
    await loadData(1, search, filter);
  };

  const contactToEntry = (c) => ({
    phone: c.phone,
    jid: c.jid || (c.phone.replace(/^\+/, '') + '@s.whatsapp.net'),
    name: c.name || c.phone,
  });

  const toggleSelect = (c) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.phone)) next.delete(c.phone);
      else next.set(c.phone, contactToEntry(c));
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageWA = data.items.filter((c) => c.on_whatsapp);
    const allSelected = pageWA.length > 0 && pageWA.every((c) => selected.has(c.phone));
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        pageWA.forEach((c) => next.delete(c.phone));
      } else {
        pageWA.forEach((c) => next.set(c.phone, contactToEntry(c)));
      }
      return next;
    });
  };

  const selectAllWhatsApp = async () => {
    try {
      const result = await fetchAgenda({ page: 1, limit: 50000, search, filter: 'whatsapp' });
      const next = new Map();
      result.items.forEach((c) => next.set(c.phone, contactToEntry(c)));
      setSelected(next);
    } catch { alert('Error al seleccionar todos'); }
  };

  const clearSelection = () => { setSelected(new Map()); setShowForm(false); };

  const getSelectedContacts = () => {
    return [...selected.values()];
  };

  const { items, total, totalPages } = data;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pageWhatsApp = items.filter((c) => c.on_whatsapp);
  const pageAllSelected = pageWhatsApp.length > 0 && pageWhatsApp.every((c) => selected.has(c.phone));

  return (
    <div style={styles.container}>
      <p style={styles.info}>
        Importa tu agenda desde un archivo .vcf (exportado desde tu telefono).
        Luego verifica cuales estan en WhatsApp para poder enviarles mensajes.
      </p>

      <div style={styles.stats}>
        <span style={styles.stat('#E3F2FD', '#1565C0')}>{stats.total} en agenda</span>
        <span style={styles.stat('#E8F5E9', '#2E7D32')}>{stats.onWhatsApp} en WhatsApp</span>
      </div>

      <div style={styles.uploadBox}>
        <label style={styles.uploadLabel}>
          {importing ? 'Importando...' : 'Selecciona tu archivo de contactos (.vcf)'}
        </label>
        <input ref={fileRef} type="file" accept=".vcf" onChange={handleImport} disabled={importing} style={{ fontSize: 14 }} />
      </div>

      <div style={styles.actions}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 13, color: '#555' }}>Codigo pais:</label>
          <input
            type="text"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))}
            placeholder="57"
            style={{ width: 50, padding: '6px 8px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4, textAlign: 'center' }}
          />
        </div>
        {!checking ? (
          <button style={styles.btn('#fff', '#1E88E5')} onClick={handleCheck} disabled={stats.total === 0}>
            Verificar en WhatsApp
          </button>
        ) : (
          <button style={styles.btn('#fff', '#EF5350')} onClick={handleStopCheck}>
            Detener verificacion
          </button>
        )}
        <button style={styles.btnSmall('#fff', '#FF9800')} onClick={handleReset} disabled={checking}>
          Re-verificar todos
        </button>
        <button style={styles.btnSmall('#fff', '#EF5350')} onClick={handleDelete}>
          Borrar agenda
        </button>
        {checkProgress && <span style={styles.progress}>{checkProgress}</span>}
      </div>

      {selected.size > 0 && (
        <div style={styles.selectionBar}>
          <span>{selected.size} contacto(s) seleccionado(s)</span>
          <button style={styles.btn('#fff', '#25D366')} onClick={() => setShowForm(true)}>
            Programar mensaje
          </button>
          <button style={styles.btn('#fff', '#1E88E5')} onClick={selectAllWhatsApp}>
            Seleccionar todos en WhatsApp ({stats.onWhatsApp})
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

      {stats.total > 0 && (
        <>
          <div style={styles.searchRow}>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="Buscar por nombre o numero..."
              value={search}
              onChange={handleSearch}
            />
            <select style={styles.filterSelect} value={filter} onChange={handleFilter}>
              <option value="all">Todos</option>
              <option value="whatsapp">En WhatsApp</option>
              <option value="not_whatsapp">Sin WhatsApp</option>
              <option value="unchecked">Sin verificar</option>
            </select>
          </div>

          {items.length === 0 ? (
            <p style={styles.empty}>No se encontraron contactos</p>
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
                          title="Seleccionar contactos en WhatsApp de esta pagina"
                        />
                      </th>
                      <th style={{ ...styles.th, width: 40 }}>#</th>
                      <th style={styles.th}>Nombre</th>
                      <th style={styles.th}>Telefono</th>
                      <th style={styles.th}>WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c, i) => {
                      const canSelect = c.on_whatsapp;
                      return (
                        <tr key={c.phone + i} style={selected.has(c.phone) ? { background: '#E3F2FD' } : {}}>
                          <td style={styles.td}>
                            <input
                              type="checkbox"
                              style={styles.checkbox}
                              checked={selected.has(c.phone)}
                              onChange={() => toggleSelect(c)}
                              disabled={!canSelect}
                              title={canSelect ? '' : 'Solo contactos verificados en WhatsApp'}
                            />
                          </td>
                          <td style={styles.td}>{from + i}</td>
                          <td style={styles.td}>{c.name}</td>
                          <td style={styles.td}>{c.phone}</td>
                          <td style={styles.td}>
                            {c.checked_at ? (
                              <span style={styles.badge(c.on_whatsapp)}>
                                {c.on_whatsapp ? 'Si' : 'No'}
                              </span>
                            ) : (
                              <span style={{ color: '#bbb', fontSize: 12 }}>Sin verificar</span>
                            )}
                          </td>
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
        </>
      )}
    </div>
  );
}
