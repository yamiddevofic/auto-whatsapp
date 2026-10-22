import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { useLinkTools, LinkPanel, BubbleLinkCard } from './LinkTools.jsx';
import { createMessage } from '../api.js';
import { Button, Field, Alert, ScheduleField, WaPreview, toast } from './ui.jsx';

const MAX = 4096;

export default function MessageForm({ group, onCreated }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const link = useLinkTools({ text: content, setText: setContent, addImage: setImage, removeImage: (f) => setImage((cur) => (cur === f ? null : cur)) });

  const isValid = content.trim() && scheduledAt;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('groupId', group.id);
    formData.append('groupName', group.name);
    formData.append('content', content);
    formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    if (image) formData.append('image', image);

    try {
      const result = await createMessage(formData);
      if (!result) return;
      if (result.error) {
        setError(result.error);
      } else {
        toast.success(`Mensaje programado para “${group.name}”`);
        setContent('');
        setScheduledAt('');
        setImage(null);
        onCreated();
      }
    } catch {
      setError('No se pudo programar el mensaje. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="compose-grid">
      <div className="stack">
        <Field label="Mensaje" htmlFor="msg-content" extra={`${content.length}/${MAX}`}>
          <textarea
            id="msg-content" onPaste={link.onPaste} className="textarea" value={content} maxLength={MAX}
            onChange={(e) => setContent(e.target.value)} placeholder="Escribe tu mensaje…"
          />
        </Field>
        <LinkPanel tools={link} setText={setContent} addImage={setImage} />
        <ImageUpload file={image} onFileChange={setImage} />
        <ScheduleField value={scheduledAt} onChange={setScheduledAt} />
        {error && <Alert type="error">{error}</Alert>}
        <div className="row">
          <Button type="submit" variant="primary" size="lg" icon="clock" loading={loading} disabled={!isValid}>
            {loading ? 'Programando…' : 'Programar mensaje'}
          </Button>
          {!isValid && <span className="field-hint">Escribe el mensaje y elige cuándo enviarlo.</span>}
        </div>
      </div>
      <aside className="compose-aside">
        <WaPreview text={content} imageFile={image} when={scheduledAt} linkCard={<BubbleLinkCard preview={link.preview} />} />
      </aside>
    </form>
  );
}
