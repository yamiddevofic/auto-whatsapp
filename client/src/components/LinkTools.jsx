import React, { useEffect, useRef, useState } from 'react';
import { fetchLinkPreview, fetchLinkImage } from '../api.js';
import { Icon, Button, Field, Spinner, toast } from './ui.jsx';

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/i;
const LONE_URL_RE = /^https?:\/\/\S+$/i;

export const firstUrl = (text) => text?.match(URL_RE)?.[0] || null;
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/** Quita una URL del texto sin dejar espacios dobles ni líneas vacías sueltas. */
const removeUrl = (text, url) => text.replace(url, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Detecta el primer enlace del texto y obtiene su vista previa (vía servidor).
 * Devuelve { url, loading, data, thumb, error }.
 */
export function useLinkPreview(text) {
  const url = firstUrl(text);
  const [state, setState] = useState({ url: null, loading: false, data: null, thumb: null, error: null });

  useEffect(() => {
    if (!url) { setState({ url: null, loading: false, data: null, thumb: null, error: null }); return undefined; }
    let cancelled = false;
    let objectUrl = null;
    setState((s) => (s.url === url ? s : { url, loading: true, data: null, thumb: null, error: null }));

    const t = setTimeout(async () => {
      try {
        const data = await fetchLinkPreview(url);
        if (cancelled || !data) return;
        if (data.error) { setState({ url, loading: false, data: null, thumb: null, error: data.error }); return; }
        setState({ url, loading: false, data, thumb: null, error: null });
        const imgUrl = data.kind === 'image' ? data.url : data.image;
        if (imgUrl) {
          const file = await fetchLinkImage(imgUrl).catch(() => null);
          if (cancelled || !file) return;
          objectUrl = URL.createObjectURL(file);
          setState((s) => (s.url === url ? { ...s, thumb: objectUrl, file } : s));
        }
      } catch {
        if (!cancelled) setState({ url, loading: false, data: null, thumb: null, error: 'No se pudo leer el enlace' });
      }
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

/** Convierte un enlace en imagen adjunta; devuelve el File o null. */
async function linkToImage(url) {
  const file = await fetchLinkImage(url);
  if (!file) return null;
  return file;
}

/**
 * Herramientas de enlace para un formulario:
 *  - onPaste para el textarea: si se pega un enlace de imagen, se adjunta como imagen.
 *  - <LinkPanel>: campo "Pegar enlace" + tarjeta con la vista previa del enlace del texto.
 */
export function useLinkTools({ text, setText, addImage, removeImage }) {
  const preview = useLinkPreview(text);

  const convert = async (url, { fromPaste } = {}) => {
    const file = await linkToImage(url);
    if (!file) return false;
    setText((t) => removeUrl(t, url));
    addImage(file);
    toast.success(fromPaste ? 'Enlace de imagen convertido en imagen' : 'Imagen añadida desde el enlace', {
      action: {
        label: 'Deshacer',
        onClick: () => {
          removeImage(file);
          setText((t) => (t ? `${t} ${url}` : url));
        },
      },
    });
    return true;
  };

  const onPaste = (e) => {
    const pasted = e.clipboardData?.getData('text')?.trim();
    if (!pasted || !LONE_URL_RE.test(pasted)) return;
    // Se deja pegar normalmente; si resulta ser una imagen, se convierte después
    fetchLinkPreview(pasted)
      .then((info) => (info?.kind === 'image' ? convert(pasted, { fromPaste: true }) : null))
      .catch(() => {});
  };

  return { preview, onPaste, convert };
}

export function LinkPanel({ tools, setText, addImage, imageLabel = 'Usar su imagen' }) {
  const { preview, convert } = tools;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const submit = async (raw) => {
    const url = (raw ?? value).trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { setError('El enlace debe empezar por http:// o https://'); return; }
    setBusy(true);
    setError(null);
    try {
      const info = await fetchLinkPreview(url);
      if (!info) return;
      if (info.error) { setError(info.error); return; }
      if (info.kind === 'image') {
        const file = await fetchLinkImage(url);
        if (file) {
          addImage(file);
          toast.success('Imagen añadida desde el enlace');
        }
      } else {
        setText((t) => (t.includes(url) ? t : t.trim() ? `${t.trimEnd()}\n${url}` : url));
        toast.success('Enlace añadido al texto');
      }
      setValue('');
    } catch (err) {
      setError(err.message || 'No se pudo leer el enlace');
    } finally {
      setBusy(false);
    }
  };

  const data = preview.data;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Field label="Enlace" extra="Opcional" hint={error ? undefined : 'Si es una imagen se adjunta; si es una página, se añade al texto con su vista previa.'}>
        <div className="link-row">
          <div className="input-wrap grow">
            <Icon name="link" size="sm" />
            <input
              ref={inputRef} className="input" type="url" inputMode="url" placeholder="Pega un enlace…"
              value={value} onChange={(e) => { setValue(e.target.value); setError(null); }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text').trim();
                if (LONE_URL_RE.test(pasted)) { e.preventDefault(); setValue(pasted); submit(pasted); }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              aria-invalid={!!error || undefined} aria-label="Enlace"
            />
          </div>
          <Button type="button" loading={busy} disabled={!value.trim()} onClick={() => submit()}>Añadir</Button>
        </div>
        {error && <span className="field-hint" style={{ color: 'var(--danger)' }}>{error}</span>}
      </Field>

      {preview.url && (
        <div className="link-card" aria-live="polite">
          <div className="link-thumb">
            {preview.thumb ? <img src={preview.thumb} alt="" /> : preview.loading ? <Spinner /> : <Icon name={data?.kind === 'image' ? 'image' : 'link'} />}
          </div>
          <div className="link-info">
            <span className="link-site">{data?.siteName || domainOf(preview.url)}</span>
            {preview.loading && <b className="muted">Cargando vista previa…</b>}
            {preview.error && <b className="muted">{preview.error}</b>}
            {data?.kind === 'image' && <b>Este enlace es una imagen</b>}
            {data?.kind === 'page' && <b>{data.title || domainOf(preview.url)}</b>}
            {data?.kind === 'page' && data.description && <p>{data.description}</p>}
            {data?.kind === 'other' && <b>Archivo ({data.contentType})</b>}
            {(data?.kind === 'image' || (data?.kind === 'page' && data.image && preview.file)) && (
              <div className="row" style={{ marginTop: 6 }}>
                {data.kind === 'image' ? (
                  <Button type="button" size="sm" variant="primary" icon="image" onClick={() => convert(preview.url)}>Usar como imagen</Button>
                ) : (
                  <Button type="button" size="sm" icon="image" onClick={() => { addImage(preview.file); toast.success('Imagen de la página añadida'); }}>{imageLabel}</Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tarjeta de enlace dentro de la burbuja de la vista previa de WhatsApp. */
export function BubbleLinkCard({ preview }) {
  const data = preview?.data;
  if (!data || data.kind !== 'page' || (!data.title && !data.description)) return null;
  return (
    <div className="wa-link">
      {preview.thumb && <img src={preview.thumb} alt="" />}
      <div>
        <b>{data.title || data.siteName}</b>
        {data.description && <p>{data.description}</p>}
        <small>{data.siteName || domainOf(data.url)}</small>
      </div>
    </div>
  );
}
