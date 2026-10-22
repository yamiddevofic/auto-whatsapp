import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { useLinkTools, LinkPanel, BubbleLinkCard } from './LinkTools.jsx';
import { createDirectMessage } from '../api.js';
import { Button, Field, Alert, Icon, ScheduleField, WaPreview, toast } from './ui.jsx';

export default function DirectMessageForm({ selectedContacts, onClose, onSent }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const link = useLinkTools({ text: content, setText: setContent, addImage: setImage, removeImage: (f) => setImage((cur) => (cur === f ? null : cur)) });

  const isValid = content.trim() && scheduledAt && selectedContacts.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('recipients', JSON.stringify(selectedContacts.map((c) => c.jid)));
    formData.append('recipientLabel', `${selectedContacts.length} contacto(s)`);
    formData.append('content', content);
    formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    if (image) formData.append('image', image);

    try {
      const result = await createDirectMessage(formData);
      if (!result) return;
      if (result.error) {
        setError(result.error);
      } else {
        toast.success(`Mensaje programado para ${selectedContacts.length} contacto(s)`);
        setContent('');
        setScheduledAt('');
        setImage(null);
        if (onSent) onSent();
      }
    } catch {
      setError('No se pudo programar el mensaje.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card" aria-label="Programar mensaje a contactos" style={{ borderColor: 'var(--accent)' }}>
      <header className="card-head">
        <div>
          <h3 className="card-title">Programar mensaje</h3>
          <p className="card-sub">{selectedContacts.length} contacto(s) seleccionado(s)</p>
        </div>
        <Button variant="ghost" size="sm" className="btn-icon" onClick={onClose} aria-label="Cerrar formulario"><Icon name="x" size="sm" /></Button>
      </header>
      <form onSubmit={handleSubmit} className="card-body compose-grid">
        <div className="stack">
          <Field label="Mensaje" htmlFor="dm-content">
            <textarea id="dm-content" onPaste={link.onPaste} className="textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribe tu mensaje…" autoFocus />
          </Field>
        <LinkPanel tools={link} setText={setContent} addImage={setImage} />
          <ImageUpload file={image} onFileChange={setImage} />
          <ScheduleField value={scheduledAt} onChange={setScheduledAt} />
          {error && <Alert type="error">{error}</Alert>}
          <div className="row">
            <Button type="submit" variant="primary" icon="clock" loading={loading} disabled={!isValid}>
              {loading ? 'Programando…' : 'Programar mensaje'}
            </Button>
            <Button type="button" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
        <aside className="compose-aside"><WaPreview text={content} imageFile={image} when={scheduledAt} linkCard={<BubbleLinkCard preview={link.preview} />} /></aside>
      </form>
    </section>
  );
}
