import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAgenda, fetchAgendaStats, importAgendaVCF, checkAgendaWhatsApp,
  resetAgendaChecks, deleteAgenda,
} from '../api.js';
import DirectMessageForm from './DirectMessageForm.jsx';
import Pager from './Pager.jsx';
import { askPassword } from '../askPassword.js';
import { Icon, Button, Empty, Alert, toast, initials } from './ui.jsx';

const PAGE_SIZE = 50;

export default function AgendaList() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [stats, setStats] = useState({ total: 0, onWhatsApp: 0 });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState('');
  const [selected, setSelected] = useState(new Map()); // phone -> {jid, name, phone}
  const [showForm, setShowForm] = useState(false);
  const [countryCode, setCountryCode] = useState('57');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const formRef = useRef(null);
  const checkingRef = useRef(false);

  const loadData = useCallback(async (p, s, f) => {
    const [result, st] = await Promise.all([
      fetchAgenda({ page: p, limit: PAGE_SIZE, search: s, filter: f }),
      fetchAgendaStats(),
    ]);
    if (result) setData(result);
    if (st) setStats(st);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadData(page, search, filter), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [page, search, filter, loadData]);

  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm]);

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };
  const handleFilter = (e) => { setFilter(e.target.value); setPage(1); };

  const importFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await importAgendaVCF(file);
      if (!result) return;
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${result.imported} contactos importados`);
        setPage(1);
        await loadData(1, search, filter);
      }
    } catch { toast.error('Error al importar el archivo'); }
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
        if (!result) break;
        if (result.error) { toast.error(result.error); break; }
        totalChecked += result.checked;
        totalFound += result.found;
        setCheckProgress(`Verificados: ${totalChecked} · En WhatsApp: ${totalFound}`);
        await loadData(page, search, filter);
        if (!result.remaining || result.checked === 0) break;
      }
      setCheckProgress(`Listo: ${totalChecked} verificados, ${totalFound} en WhatsApp.`);
    } catch { toast.error('Error al verificar contactos'); }
    finally { setChecking(false); checkingRef.current = false; }
  };

  const handleStopCheck = () => { checkingRef.current = false; };

  const handleReset = async () => {
    const password = await askPassword('Se reiniciará la verificación de todos los contactos para volver a comprobarlos.', 'Re-verificar todos');
    if (!password) return;
    const result = await resetAgendaChecks(password);
    if (result?.error) { toast.error(result.error); return; }
    setCheckProgress('');
    setPage(1);
    await loadData(1, search, filter);
    toast.success('Verificación reiniciada');
  };

  const handleDelete = async () => {
    const password = await askPassword('Se eliminarán todos los contactos de tu agenda importada.', 'Borrar agenda');
    if (!password) return;
    const result = await deleteAgenda(password);
    if (result?.error) { toast.error(result.error); return; }
    setPage(1);
    setSelected(new Map());
    await loadData(1, search, filter);
    toast.success('Agenda eliminada');
  };

  const contactToEntry = (c) => ({
    phone: c.phone,
    jid: c.jid || (c.phone.replace(/^\+/, '') + '@s.whatsapp.net'),
    name: c.name || c.phone,
  });

  const toggleSelect = (c) => {
    if (!c.on_whatsapp) return;
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
      pageWA.forEach((c) => (allSelected ? next.delete(c.phone) : next.set(c.phone, contactToEntry(c))));
      return next;
    });
  };

  const selectAllWhatsApp = async () => {
    try {
      const result = await fetchAgenda({ page: 1, limit: 50000, search, filter: 'whatsapp' });
      const next = new Map();
      result.items.forEach((c) => next.set(c.phone, contactToEntry(c)));
      setSelected(next);
    } catch { toast.error('Error al seleccionar todos'); }
  };

  const clearSelection = () => { setSelected(new Map()); setShowForm(false); };

  const { items, total, totalPages } = data;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pageWhatsApp = items.filter((c) => c.on_whatsapp);
  const pageAllSelected = pageWhatsApp.length > 0 && pageWhatsApp.every((c) => selected.has(c.phone));
  const pct = stats.total ? Math.round((stats.onWhatsApp / stats.total) * 100) : 0;

  return (
    <div className="stack-lg">
      <div
        className={`dropzone ${dragOver ? 'is-over' : ''}`} role="button" tabIndex={0}
        onClick={() => !importing && fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); importFile(e.dataTransfer.files[0]); }}
      >
        {importing ? <span className="spinner" /> : <Icon name="upload" />}
        <b>{importing ? 'Importando contactos…' : stats.total ? 'Importar otro archivo .vcf' : 'Importa tu agenda (.vcf)'}</b>
        <small>Arrastra el archivo aquí o haz clic. Expórtalo desde la app de contactos de tu teléfono.</small>
      </div>
      <input ref={fileRef} type="file" accept=".vcf" className="sr-only" tabIndex={-1} onChange={(e) => importFile(e.target.files[0])} disabled={importing} />

      {stats.total > 0 && (
        <>
          <div className="stat-row">
            <div className="stat"><b>{stats.total}</b><span>en tu agenda</span></div>
            <div className="stat"><b>{stats.onWhatsApp}</b><span>con WhatsApp ({pct}%)</span></div>
            <div className="stat" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              <span>Verificación</span>
              <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
            </div>
          </div>

          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row">
              <label className="field-label" htmlFor="cc" style={{ margin: 0 }}>Código de país</label>
              <input
                id="cc" className="input" inputMode="numeric" style={{ width: 84, textAlign: 'center', minHeight: 38 }}
                value={countryCode} onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))} placeholder="57"
              />
              {!checking ? (
                <Button variant="primary" icon="checkCircle" onClick={handleCheck}>Verificar en WhatsApp</Button>
              ) : (
                <Button variant="danger" icon="stop" onClick={handleStopCheck}>Detener</Button>
              )}
              <span className="grow" />
              <Button size="sm" variant="ghost" icon="refresh" onClick={handleReset} disabled={checking}>Re-verificar todos</Button>
              <Button size="sm" variant="danger-soft" icon="trash" onClick={handleDelete} disabled={checking}>Borrar agenda</Button>
            </div>
            {checkProgress && (
              <Alert type={checking ? 'info' : 'success'}>
                {checking && <span className="spinner" style={{ display: 'inline-block', verticalAlign: -3, marginRight: 8 }} />}
                {checkProgress}
              </Alert>
            )}
          </div>

          {showForm && selected.size > 0 && (
            <div ref={formRef}>
              <DirectMessageForm selectedContacts={[...selected.values()]} onClose={() => setShowForm(false)} onSent={clearSelection} />
            </div>
          )}

          <div className="toolbar">
            <div className="input-wrap">
              <Icon name="search" size="sm" />
              <input className="input" type="search" placeholder="Buscar por nombre o número…" value={search} onChange={handleSearch} aria-label="Buscar en la agenda" />
            </div>
            <select className="select" value={filter} onChange={handleFilter} aria-label="Filtrar">
              <option value="all">Todos</option>
              <option value="whatsapp">En WhatsApp</option>
              <option value="not_whatsapp">Sin WhatsApp</option>
              <option value="unchecked">Sin verificar</option>
            </select>
          </div>

          {items.length === 0 ? (
            <Empty icon="search" title="Sin resultados">Prueba con otra búsqueda o cambia el filtro.</Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>
                        <input type="checkbox" className="checkbox" checked={pageAllSelected} onChange={toggleSelectAll} disabled={pageWhatsApp.length === 0} aria-label="Seleccionar contactos en WhatsApp de esta página" title="Seleccionar contactos en WhatsApp de esta página" />
                      </th>
                      <th>Contacto</th>
                      <th>WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c, i) => {
                      const canSelect = !!c.on_whatsapp;
                      const isSel = selected.has(c.phone);
                      return (
                        <tr key={c.phone + i} className={isSel ? 'is-selected' : ''} onClick={() => toggleSelect(c)} style={{ cursor: canSelect ? 'pointer' : 'default' }}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox" className="checkbox" checked={isSel} onChange={() => toggleSelect(c)} disabled={!canSelect}
                              title={canSelect ? '' : 'Solo contactos verificados en WhatsApp'} aria-label={`Seleccionar ${c.name || c.phone}`}
                            />
                          </td>
                          <td>
                            <div className="person">
                              <span className="avatar">{initials(c.name)}</span>
                              <div style={{ minWidth: 0 }}>
                                <div className="person-name">{c.name || <span className="muted">Sin nombre</span>}</div>
                                <div className="person-sub">{c.phone}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {c.checked_at ? (
                              <span className={`badge ${c.on_whatsapp ? 'badge-sent' : 'badge-cancelled'}`}>{c.on_whatsapp ? 'En WhatsApp' : 'Sin WhatsApp'}</span>
                            ) : (
                              <span className="badge badge-pending">Sin verificar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={page} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
            </>
          )}
        </>
      )}

      {selected.size > 0 && !showForm && (
        <div className="selection-bar" role="region" aria-label="Acciones de selección">
          <span className="grow"><b>{selected.size}</b> seleccionado(s)</span>
          {selected.size < stats.onWhatsApp && <Button size="sm" variant="ghost" onClick={selectAllWhatsApp}>Seleccionar los {stats.onWhatsApp} en WhatsApp</Button>}
          <Button size="sm" variant="ghost" onClick={clearSelection}>Limpiar</Button>
          <Button size="sm" variant="primary" icon="send" onClick={() => setShowForm(true)}>Programar mensaje</Button>
        </div>
      )}
    </div>
  );
}
