import React, { useMemo, useState } from 'react';
import { Icon, Empty, initials } from './ui.jsx';

/** Selector de grupo con búsqueda, agrupado por comunidad. */
export default function GroupList({ groups, selected, onSelect }) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const comms = {};
    const alone = [];
    const q = query.trim().toLowerCase();
    for (const g of groups) {
      if (g.isCommunity) continue;
      if (q && !g.name.toLowerCase().includes(q) && !(g.communityName || '').toLowerCase().includes(q)) continue;
      if (g.communityName) (comms[g.communityName] ||= []).push(g);
      else alone.push(g);
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    const out = Object.keys(comms).sort().map((name) => ({ title: name, community: true, items: comms[name].sort(byName) }));
    if (alone.length) out.push({ title: out.length ? 'Otros grupos' : null, items: alone.sort(byName) });
    return out;
  }, [groups, query]);

  if (groups.length === 0) {
    return (
      <Empty icon="groups" title="Sin grupos todavía">
        Conecta WhatsApp para ver tus grupos y poder programar mensajes.
      </Empty>
    );
  }

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="input-wrap">
        <Icon name="search" size="sm" />
        <input
          className="input" type="search" placeholder={`Buscar entre ${groups.filter((g) => !g.isCommunity).length} grupos…`}
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar grupo"
        />
      </div>

      <div className="group-list" role="listbox" aria-label="Grupos">
        {total === 0 && <p className="muted" style={{ padding: 16, textAlign: 'center' }}>Ningún grupo coincide con “{query}”.</p>}
        {sections.map((s) => (
          <div key={s.title || 'all'}>
            {s.title && <div className="group-section">{s.community ? '📁 ' : ''}{s.title}</div>}
            {s.items.map((g) => {
              const active = selected?.id === g.id;
              return (
                <button
                  key={g.id} type="button" role="option" aria-selected={active}
                  className={`group-row ${active ? 'is-active' : ''}`}
                  onClick={() => onSelect(active ? null : g)}
                >
                  <span className="avatar">{initials(g.name)}</span>
                  <span className="grow person-name">{g.name}</span>
                  <span className="muted nowrap" style={{ fontSize: 13 }}>{g.participants} <Icon name="contacts" size="sm" className="inline-icon" /></span>
                  {active && <Icon name="checkCircle" className="group-check" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
