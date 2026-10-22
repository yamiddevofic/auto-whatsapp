import React, { useEffect, useMemo, useState } from 'react';
import { fetchStatusAudience } from '../api.js';
import { Icon, Field, Spinner, initials } from './ui.jsx';

export const AUDIENCE_LABELS = {
  all: 'Agenda + contactos de grupos',
  agenda: 'Solo mi agenda',
  groups: 'Solo contactos de grupos',
  custom: 'Grupos concretos',
  me: 'Solo yo',
};

const OPTIONS = [
  { mode: 'all', icon: 'contacts', title: 'Todos', desc: 'Agenda verificada y contactos de tus grupos' },
  { mode: 'agenda', icon: 'book', title: 'Solo agenda', desc: 'Contactos de tu agenda que tienen WhatsApp' },
  { mode: 'groups', icon: 'groups', title: 'Contactos de grupos', desc: 'Personas sincronizadas desde tus grupos' },
  { mode: 'custom', icon: 'checkCircle', title: 'Grupos concretos', desc: 'Solo los miembros de los grupos que elijas' },
  { mode: 'me', icon: 'eye', title: 'Solo yo (prueba)', desc: 'Para comprobar cómo queda sin que nadie más lo vea' },
];

/** Texto corto de la audiencia de un estado (la guarda el servidor como JSON). */
export function audienceSummary(raw) {
  let a = raw;
  if (typeof raw === 'string') { try { a = JSON.parse(raw); } catch { a = null; } }
  if (!a?.mode) return AUDIENCE_LABELS.all;
  if (a.mode === 'custom') return `${a.groupIds?.length || 0} grupo(s)`;
  return AUDIENCE_LABELS[a.mode] || AUDIENCE_LABELS.all;
}

/** Cuántas personas recibirán el estado con la audiencia elegida (null = aún no se sabe). */
export function useAudienceCount(value) {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const key = value.mode === 'custom' ? [...(value.groupIds || [])].sort().join(',') : '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchStatusAudience(value.mode === 'custom' ? value.groupIds || [] : []);
        if (!cancelled && res && !res.error) setCounts(res);
      } catch { /* sin recuento: la interfaz lo tolera */ }
      finally { if (!cancelled) setLoading(false); }
    }, value.mode === 'custom' ? 400 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value.mode, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = counts ? (value.mode === 'custom' ? counts.custom : counts[value.mode]) : null;
  return { counts, count: current ?? null, hidden: value.mode === 'custom' ? counts?.customHidden ?? 0 : 0, loading };
}

export default function AudiencePicker({ value, onChange, groups }) {
  const [query, setQuery] = useState('');
  const { counts, count, hidden, loading } = useAudienceCount(value);
  const selected = new Set(value.groupIds || []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups || [])
      .filter((g) => !g.isCommunity && (!q || g.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, query]);

  const setMode = (mode) => onChange({ mode, groupIds: mode === 'custom' ? value.groupIds || [] : undefined });
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ mode: 'custom', groupIds: [...next] });
  };

  return (
    <Field label="¿Quién verá este estado?" extra={loading ? undefined : count != null ? `${count} persona(s)` : undefined}>
      <div className="audience-grid" role="radiogroup" aria-label="Audiencia">
        {OPTIONS.map((o) => {
          const n = counts ? (o.mode === 'custom' ? null : counts[o.mode]) : null;
          return (
            <button
              key={o.mode} type="button" role="radio" aria-checked={value.mode === o.mode}
              className={`audience-opt ${value.mode === o.mode ? 'is-active' : ''}`} onClick={() => setMode(o.mode)}
            >
              <Icon name={o.icon} />
              <span className="grow">
                <b>{o.title}</b>
                <small>{o.desc}</small>
              </span>
              {n != null && <span className="count-pill">{n}</span>}
            </button>
          );
        })}
      </div>

      {value.mode === 'custom' && (
        <div className="stack" style={{ gap: 8, marginTop: 4 }}>
          {(groups || []).length === 0 ? (
            <span className="field-hint">Conecta WhatsApp para elegir entre tus grupos.</span>
          ) : (
            <>
              <div className="input-wrap">
                <Icon name="search" size="sm" />
                <input className="input" type="search" placeholder="Buscar grupo…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar grupo" />
              </div>
              <div className="group-list" role="group" aria-label="Grupos de la audiencia">
                {list.map((g) => (
                  <label key={g.id} className={`group-row ${selected.has(g.id) ? 'is-active' : ''}`}>
                    <input type="checkbox" className="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
                    <span className="avatar">{initials(g.name)}</span>
                    <span className="grow person-name">{g.name}</span>
                    <span className="muted nowrap" style={{ fontSize: 13 }}>{g.participants}</span>
                  </label>
                ))}
                {list.length === 0 && <p className="muted" style={{ padding: 16, textAlign: 'center' }}>Ningún grupo coincide.</p>}
              </div>
              <span className="field-hint">
                {selected.size === 0 ? 'Marca al menos un grupo.' : `${selected.size} grupo(s) elegido(s).`}
                {hidden > 0 && ` ${hidden} miembro(s) ocultan su número y no recibirán el estado.`}
              </span>
            </>
          )}
        </div>
      )}

      <span className="field-hint">
        {loading ? <><Spinner /> Calculando destinatarios…</> : 'WhatsApp solo muestra tu estado a quien te tiene guardado en su agenda.'}
      </span>
    </Field>
  );
}
