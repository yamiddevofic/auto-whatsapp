import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchContacts, syncContacts, unlinkWhatsApp } from '../api.js';
import DirectMessageForm from './DirectMessageForm.jsx';
import Pager from './Pager.jsx';
import { askPassword } from '../askPassword.js';
import { Icon, Button, Empty, toast, initials } from './ui.jsx';

const PAGE_SIZE = 50;

function getDisplayName(c) {
  return c.notify || c.name || c.agenda_name || null;
}

export default function ContactList() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [selected, setSelected] = useState(new Map()); // jid -> {jid, name}
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef(null);

  const loadContacts = useCallback(async (p, s) => {
    setLoading(true);
    try {
      const result = await fetchContacts({ page: p, limit: PAGE_SIZE, search: s });
      if (result) setData(result);
    } catch {
      toast.error('No se pudieron cargar los contactos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Pequeño debounce para no consultar en cada pulsación
    const t = setTimeout(() => loadContacts(page, search), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [page, search, loadContacts]);

  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm]);

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncContacts();
      if (!result) return;
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${result.count} contactos sincronizados`);
        if (result.hiddenMembers > 0) {
          toast.info(`${result.hiddenMembers} participante(s) de tus grupos ocultan su número en WhatsApp y no se pueden añadir como contacto.`, { duration: 9000 });
        }
        setPage(1);
        await loadContacts(1, search);
      }
    } catch { toast.error('Error al sincronizar contactos'); }
    finally { setSyncing(false); }
  };

  const handleUnlink = async () => {
    const password = await askPassword(
      'Esto desvinculará tu WhatsApp y eliminará los contactos guardados.\nTendrás que escanear el QR de nuevo.',
      'Desvincular WhatsApp',
    );
    if (!password) return;
    setUnlinking(true);
    try {
      const result = await unlinkWhatsApp(password);
      if (!result) return;
      if (result.error) toast.error(result.error);
      else {
        setData({ items: [], total: 0, page: 1, totalPages: 0 });
        window.location.reload(); // restablece el socket y el estado del QR
      }
    } catch { toast.error('Error al desvincular'); }
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
      pageItems.forEach((c) => (allSelected ? next.delete(c.jid) : next.set(c.jid, contactToEntry(c))));
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
      toast.error('Error al seleccionar todos');
    }
  };

  const clearSelection = () => { setSelected(new Map()); setShowForm(false); };

  const { items, total, totalPages } = data;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const pageAllSelected = items.length > 0 && items.every((c) => selected.has(c.jid));

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <div className="input-wrap">
          <Icon name="search" size="sm" />
          <input className="input" type="search" placeholder="Buscar por nombre, número o grupo…" value={search} onChange={handleSearch} aria-label="Buscar contactos" />
        </div>
        <Button className="btn-block-sm" icon="refresh" loading={syncing} onClick={handleSync}>{syncing ? 'Sincronizando…' : 'Sincronizar desde grupos'}</Button>
      </div>

      {showForm && selected.size > 0 && (
        <div ref={formRef}>
          <DirectMessageForm
            selectedContacts={[...selected.values()]}
            onClose={() => setShowForm(false)}
            onSent={clearSelection}
          />
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="stack">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}</div>
      ) : items.length === 0 ? (
        <Empty icon="contacts" title={total === 0 && !search ? 'Aún no hay contactos' : 'Sin resultados'}>
          {total === 0 && !search
            ? 'Sincroniza desde tus grupos, o desvincula y vuelve a escanear el QR.'
            : `No encontramos contactos para “${search}”.`}
        </Empty>
      ) : (
        <>
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input type="checkbox" className="checkbox" checked={pageAllSelected} onChange={toggleSelectAll} aria-label="Seleccionar toda la página" />
                  </th>
                  <th>Contacto</th>
                  <th className="hide-sm">Grupos</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const name = getDisplayName(c);
                  const num = c.jid.replace('@s.whatsapp.net', '');
                  const isSel = selected.has(c.jid);
                  return (
                    <tr key={c.jid} className={isSel ? 'is-selected' : ''} onClick={() => toggleSelect(c)} style={{ cursor: 'pointer' }}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="checkbox" checked={isSel} onChange={() => toggleSelect(c)} aria-label={`Seleccionar ${name || num}`} />
                      </td>
                      <td>
                        <div className="person">
                          <span className="avatar">{initials(name || '')}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="person-name">{name || <span className="muted">Sin nombre</span>}</div>
                            <div className="person-sub">+{num}</div>
                          </div>
                        </div>
                      </td>
                      <td className="cell-clip muted hide-sm" style={{ maxWidth: 320, fontSize: 13 }} title={c.groups_list}>{c.groups_list || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
        </>
      )}

      {selected.size > 0 && !showForm && (
        <div className="selection-bar" role="region" aria-label="Acciones de selección">
          <span className="grow"><b>{selected.size}</b> seleccionado(s)</span>
          {selected.size < total && <Button size="sm" variant="ghost" onClick={selectAllContacts}>Seleccionar los {total}</Button>}
          <Button size="sm" variant="ghost" onClick={clearSelection}>Limpiar</Button>
          <Button size="sm" variant="primary" icon="send" onClick={() => setShowForm(true)}>Programar mensaje</Button>
        </div>
      )}

      <div className="alert alert-warn" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name="unlink" size="sm" />
        <div className="grow">
          <b>¿Contactos sin nombre?</b> Desvincula WhatsApp y vuelve a escanear el QR para recuperar los nombres.
        </div>
        <Button size="sm" variant="danger-soft" loading={unlinking} onClick={handleUnlink}>Desvincular WhatsApp</Button>
      </div>
    </div>
  );
}
