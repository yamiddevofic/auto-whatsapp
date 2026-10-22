import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/* ---------- Iconos (trazos estilo Lucide) ---------- */
const PATHS = {
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  groups: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  status: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  contacts: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  image: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22',
  chevronL: 'm15 18-6-6 6-6',
  chevronR: 'm9 18 6-6-6-6',
  unlink: 'M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.71 1.71M5.17 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71M8 2v3M2 8h3M16 22v-3M22 16h-3',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01M17 17v3h3',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  whatsapp: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.93 4.93l14.14 14.14',
  play: 'M5 3l14 9-14 9V3z',
  stop: 'M6 6h12v12H6z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
};

export function Icon({ name, size, className = '' }) {
  const cls = `icon ${size === 'sm' ? 'icon-sm' : size === 'lg' ? 'icon-lg' : ''} ${className}`;
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(PATHS[name] || '').split(/(?=M)/).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Cargando" />;
}

export function Button({ variant = 'secondary', size, icon, loading, block, className = '', children, ...rest }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest} disabled={rest.disabled || loading}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 'sm' : undefined} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, extra, children, htmlFor }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          <span>{label}</span>
          {extra && <small>{extra}</small>}
        </label>
      )}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Alert({ type = 'info', children }) {
  const icon = type === 'success' ? 'checkCircle' : type === 'error' || type === 'warn' ? 'alert' : 'info';
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size="sm" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} /></div>
      {title && <h4>{title}</h4>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, pad = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="count-pill">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal accesible ---------- */
export function Modal({ onClose, children, className = '', labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...f].filter((el) => !el.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const auto = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('input, textarea, select, button');
    auto?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [onClose]);

  // Portal a <body>: un ancestro con backdrop-filter (la barra superior) atraparía el position:fixed
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Toasts y diálogos imperativos ---------- */
let toasts = [];
let dialog = null;
const listeners = new Set();
let version = 0;
const emit = () => { version += 1; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
let nextId = 1;

function pushToast(type, text, opts = {}) {
  const id = nextId++;
  toasts = [...toasts, { id, type, text, action: opts.action }];
  emit();
  setTimeout(() => dismissToast(id), opts.duration ?? (type === 'error' ? 7000 : 4500));
}
function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (text, opts) => pushToast('success', text, opts),
  error: (text, opts) => pushToast('error', text, opts),
  info: (text, opts) => pushToast('info', text, opts),
};

/** Sustituye a window.confirm. Devuelve Promise<boolean>. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    dialog = { kind: 'confirm', title, message, confirmLabel, danger, resolve };
    emit();
  });
}

/** Pide la contraseña actual (SEC-025). Devuelve la contraseña o null si se cancela. */
export function promptPassword({ title, message, confirmLabel = 'Confirmar', danger = true }) {
  return new Promise((resolve) => {
    dialog = { kind: 'password', title, message, confirmLabel, danger, resolve };
    emit();
  });
}

function closeDialog(value) {
  const d = dialog;
  dialog = null;
  emit();
  d?.resolve(value);
}

function DialogView({ d }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const isPw = d.kind === 'password';
  return (
    <Modal onClose={() => closeDialog(isPw ? null : false)} labelledBy="dlg-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          closeDialog(isPw ? pw || null : true);
        }}
      >
        <div className="modal-head">
          <div className={`modal-icon ${d.danger ? 'danger' : ''}`}>
            <Icon name={isPw ? 'lock' : d.danger ? 'alert' : 'info'} />
          </div>
          <div>
            <h3 id="dlg-title">{d.title}</h3>
            {d.message && <p>{d.message}</p>}
          </div>
        </div>
        {isPw && (
          <div className="modal-body">
            <Field label="Confirma con tu contraseña" htmlFor="dlg-pw">
              <div className="pw-wrap">
                <input
                  id="dlg-pw" data-autofocus className="input" required
                  type={show ? 'text' : 'password'} autoComplete="current-password"
                  value={pw} onChange={(e) => setPw(e.target.value)}
                />
                <button type="button" className="btn btn-ghost btn-icon btn-sm pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  <Icon name={show ? 'eyeOff' : 'eye'} size="sm" />
                </button>
              </div>
            </Field>
          </div>
        )}
        <div className="modal-foot">
          <Button type="button" variant="secondary" onClick={() => closeDialog(isPw ? null : false)}>Cancelar</Button>
          <Button type="submit" variant={d.danger ? 'danger' : 'primary'} data-autofocus={!isPw ? true : undefined}>{d.confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function UiHost() {
  useSyncExternalStore(subscribe, () => version);
  return (
    <>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast is-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon name={t.type === 'success' ? 'checkCircle' : t.type === 'error' ? 'alert' : 'info'} />
            <div className="toast-body">
              {t.text}
              {t.action && (
                <button className="toast-action" onClick={() => { t.action.onClick(); dismissToast(t.id); }}>
                  {t.action.label}
                </button>
              )}
            </div>
            <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Cerrar"><Icon name="x" size="sm" /></button>
          </div>
        ))}
      </div>
      {dialog && <DialogView key={dialog.title + dialog.kind} d={dialog} />}
    </>
  );
}

/* ---------- Utilidades de fecha ---------- */
const pad = (n) => String(n).padStart(2, '0');

/**
 * SQLite (datetime('now')) guarda UTC sin zona: "2026-10-19 01:10:11". new Date() lo
 * interpretaría como hora local y en Colombia (UTC-5) un estado publicado a las 20:10
 * aparecería como "Mañana, 01:10". Las fechas sin zona del servidor se leen como UTC.
 */
export function parseServerDate(value) {
  if (value instanceof Date) return value;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return new Date(`${s.replace(' ', 'T')}Z`);
  return new Date(s);
}

export function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = parseServerDate(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = parseServerDate(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diffDays === 0) return `Hoy, ${time}`;
  if (diffDays === 1) return `Mañana, ${time}`;
  if (diffDays === -1) return `Ayer, ${time}`;
  const date = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  return `${date}, ${time}`;
}

/** Accesos rápidos para elegir fecha: pone la hora en formato datetime-local. */
export function QuickTimes({ onPick }) {
  const at = (fn) => () => {
    const d = new Date();
    fn(d);
    d.setSeconds(0, 0);
    onPick(toDatetimeLocal(d.toISOString()));
  };
  return (
    <div className="quick-times" aria-label="Atajos de fecha">
      <button type="button" onClick={at((d) => d.setMinutes(d.getMinutes() + 15))}>En 15 min</button>
      <button type="button" onClick={at((d) => d.setHours(d.getHours() + 1))}>En 1 hora</button>
      <button type="button" onClick={at((d) => { d.setDate(d.getDate() + 1); d.setHours(9, 0); })}>Mañana 9:00</button>
      <button type="button" onClick={at((d) => { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0); })}>Próximo lunes</button>
    </div>
  );
}

/** Campo de fecha con atajos y validación de pasado. */
export function ScheduleField({ value, onChange, label = 'Fecha y hora de envío', optional }) {
  const isPast = value && new Date(value).getTime() < Date.now();
  return (
    <Field label={label} extra={optional ? 'Opcional' : undefined} hint={isPast ? undefined : undefined}>
      <input type="datetime-local" className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={isPast || undefined} />
      <QuickTimes onPick={onChange} />
      {isPast && <span className="field-hint" style={{ color: 'var(--warn)' }}>Esa hora ya pasó: se enviará de inmediato.</span>}
    </Field>
  );
}

/** Vista previa de cómo se verá el mensaje en WhatsApp. */
export function WaPreview({ text, imageFile, when, linkCard }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!imageFile) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(imageFile);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imageFile]);
  const empty = !text?.trim() && !url;
  const t = when ? new Date(when) : new Date();
  return (
    <div>
      <div className="wa-preview-label">Vista previa</div>
      <div className="wa-preview">
        <div className={`wa-bubble ${empty ? 'is-empty' : ''}`}>
          {url && <img src={url} alt="" />}
          {!url && linkCard}
          {empty ? 'Tu mensaje aparecerá aquí…' : text}
          <time>{t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ✓✓</time>
        </div>
      </div>
    </div>
  );
}

export function initials(name = '') {
  const parts = String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '#';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export const STATUS_LABELS = { pending: 'Pendiente', sent: 'Enviado', failed: 'Fallido', cancelled: 'Cancelado' };

export function StatusBadge({ status, sentLabel }) {
  const label = status === 'sent' && sentLabel ? sentLabel : STATUS_LABELS[status] || status;
  return <span className={`badge badge-${STATUS_LABELS[status] ? status : 'pending'}`}>{label}</span>;
}

/** Vista previa de un estado de WhatsApp: tarjeta vertical a pantalla completa, no una burbuja de chat. */
export function StatusPreview({ text, imageFile, count = 0, linkCard }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!imageFile) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(imageFile);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imageFile]);
  const empty = !text?.trim() && !url;
  return (
    <div>
      <div className="wa-preview-label">Vista previa del estado</div>
      <div className="story">
        <div className="story-bars">
          {Array.from({ length: Math.max(count, 1) }).map((_, i) => <i key={i} className={i === 0 ? 'on' : ''} />)}
        </div>
        <div className="story-head"><span className="avatar">Tú</span><b>Mi estado</b><small>Ahora</small></div>
        {url ? <img className="story-img" src={url} alt="" /> : null}
        <div className={`story-text ${url ? 'is-caption' : ''} ${empty ? 'is-empty' : ''}`}>
          {empty ? 'Tu estado aparecerá aquí…' : text}
          {!url && linkCard && <div className="story-link">{linkCard}</div>}
        </div>
      </div>
    </div>
  );
}
