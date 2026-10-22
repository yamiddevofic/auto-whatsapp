import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import AudiencePicker, { audienceSummary } from './AudiencePicker.jsx';
import { fetchStatusAudience } from '../api.js';
import { useLinkTools, LinkPanel, BubbleLinkCard } from './LinkTools.jsx';
import { createStatusUpdate, sendStatusNow } from '../api.js';
import { Button, Field, Alert, ScheduleField, StatusPreview, toast, confirmDialog } from './ui.jsx';

export default function StatusForm({ onCreated, groups = [] }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(null); // 'schedule' | 'now' | null
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [audience, setAudience] = useState({ mode: 'all' });

  const link = useLinkTools({ text: content, setText: setContent, addImage: (f) => setImages((prev) => [...prev, f]), removeImage: (f) => setImages((prev) => prev.filter((x) => x !== f)) });

  const hasContent = content.trim() || images.length > 0;
  const audienceOk = audience.mode !== 'custom' || (audience.groupIds?.length ?? 0) > 0;
  const isValid = hasContent && scheduledAt && audienceOk;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading('schedule');
    setError(null);

    try {
      const formData = new FormData();
      if (content.trim()) formData.append('content', content);
      formData.append('scheduledAt', new Date(scheduledAt).toISOString());
      formData.append('audience', JSON.stringify(audience));
      images.forEach((img) => formData.append('images', img));

      const result = await createStatusUpdate(formData);
      if (!result) return;
      if (result.error) {
        setError(result.error);
      } else {
        const count = result.count || 1;
        toast.success(count > 1 ? `${count} estados programados` : 'Estado programado');
        setContent('');
        setScheduledAt('');
        setImages([]);
        onCreated();
      }
    } catch {
      setError('No se pudo programar el estado. Inténtalo de nuevo.');
    } finally {
      setLoading(null);
    }
  };

  const handleSendNow = async () => {
    if (!hasContent) return;

    const imageCount = images.length;
    let who = '';
    try {
      const res = await fetchStatusAudience(audience.mode === 'custom' ? audience.groupIds || [] : []);
      const n = res && !res.error ? (audience.mode === 'custom' ? res.custom : res[audience.mode]) : null;
      if (n != null) who = `\nLo recibirán ${n} persona(s) (${audienceSummary(audience).toLowerCase()}).`;
    } catch { /* se publica igualmente, sin recuento */ }
    const ok = await confirmDialog({
      title: 'Publicar ahora',
      message: (imageCount > 1 ? `Se publicarán ${imageCount} imágenes como estados separados.` : 'Tu estado se publicará de inmediato.') + who,
      confirmLabel: 'Publicar',
    });
    if (!ok) return;

    setLoading('now');
    setError(null);
    setProgress('');

    try {
      if (images.length <= 1) {
        const formData = new FormData();
        if (content.trim()) formData.append('content', content);
        if (images[0]) formData.append('images', images[0]);
        formData.append('audience', JSON.stringify(audience));
        const result = await sendStatusNow(formData);
        if (!result) return;
        if (result.error) { setError(result.error); return; }
      } else {
        for (let i = 0; i < images.length; i++) {
          setProgress(`Publicando imagen ${i + 1} de ${images.length}…`);
          const formData = new FormData();
          if (i === 0 && content.trim()) formData.append('content', content);
          formData.append('images', images[i]);
          formData.append('audience', JSON.stringify(audience));
          const result = await sendStatusNow(formData);
          if (!result) return;
          if (result.error) { setError(`Error en la imagen ${i + 1}: ${result.error}`); return; }
        }
      }
      toast.success(imageCount > 1 ? `${imageCount} estados publicados` : 'Estado publicado');
      setContent('');
      setImages([]);
    } catch {
      setError('No se pudo publicar el estado.');
    } finally {
      setLoading(null);
      setProgress('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="compose-grid">
      <div className="stack">
        <Field label="Texto del estado" htmlFor="st-content" extra="Opcional si hay imagen" hint="Si eliges varias imágenes, se publican como estados separados en el orden elegido.">
          <textarea id="st-content" onPaste={link.onPaste} className="textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribe el texto de tu estado…" />
        </Field>
        <LinkPanel tools={link} setText={setContent} addImage={(f) => setImages((prev) => [...prev, f])} />
        <ImageUpload files={images} onFilesChange={setImages} multiple />
        <AudiencePicker value={audience} onChange={setAudience} groups={groups} />
        <ScheduleField label="Fecha y hora de publicación" value={scheduledAt} onChange={setScheduledAt} />
        {error && <Alert type="error">{error}</Alert>}
        {progress && <Alert type="info">{progress}</Alert>}
        <div className="row">
          <Button type="submit" variant="primary" size="lg" icon="clock" loading={loading === 'schedule'} disabled={!isValid || !!loading}>
            {loading === 'schedule' ? 'Programando…' : 'Programar estado'}
          </Button>
          <Button type="button" size="lg" icon="bolt" loading={loading === 'now'} disabled={!hasContent || !audienceOk || !!loading} onClick={handleSendNow}>
            {loading === 'now' ? 'Publicando…' : 'Publicar ahora'}
          </Button>
        </div>
      </div>
      <aside className="compose-aside">
        <StatusPreview text={content} imageFile={images[0]} count={images.length} linkCard={<BubbleLinkCard preview={link.preview} />} />
        {images.length > 1 && <p className="field-hint" style={{ marginTop: 8 }}>Mostrando la primera de {images.length} imágenes.</p>}
      </aside>
    </form>
  );
}
