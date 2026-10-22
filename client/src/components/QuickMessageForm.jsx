import React, { useState, useEffect, useRef } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { useLinkTools, LinkPanel, BubbleLinkCard } from './LinkTools.jsx';
import { sendDirectMessageNow, createDirectMessage } from '../api.js';
import { Button, Field, Alert, Icon, ScheduleField, WaPreview, toast } from './ui.jsx';

function parseNumbers(input) {
  return [...new Set(
    input
      .split(/[,\n;]/)
      .map((n) => n.trim().replace(/[^0-9+]/g, ''))
      .filter((n) => n.length >= 7),
  )];
}

export default function QuickMessageForm({ onSent }) {
  const [numbersInput, setNumbersInput] = useState('');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(null); // 'now' | 'schedule' | null
  const [feedback, setFeedback] = useState(null);
  const pendingJob = useRef(null);

  const link = useLinkTools({ text: content, setText: setContent, addImage: setImage, removeImage: (f) => setImage((cur) => (cur === f ? null : cur)) });

  // El envío inmediato responde 202 y el resultado llega después por WebSocket
  useEffect(() => {
    const onResult = ({ detail: result }) => {
      if (!result || result.jobId !== pendingJob.current) return;
      pendingJob.current = null;
      const msg = `Enviado a ${result.sent}/${result.total} números`;
      const notFound = (result.results || []).filter((r) => r.status === 'not_found');
      const failed = (result.results || []).filter((r) => r.status === 'failed');
      let extra = '';
      if (notFound.length > 0) extra += `. No encontrados: ${notFound.map((r) => r.number).join(', ')}`;
      if (failed.length > 0) extra += `. Fallidos: ${failed.map((r) => r.number).join(', ')}`;
      const type = result.sent > 0 ? 'success' : 'error';
      setFeedback({ type: extra ? 'warn' : type, text: msg + extra });
      toast[type === 'success' ? 'success' : 'error'](msg);
      if (result.sent > 0 && onSent) onSent();
    };
    window.addEventListener('send-now-result', onResult);
    return () => window.removeEventListener('send-now-result', onResult);
  }, [onSent]);

  const numbers = parseNumbers(numbersInput);
  const canSendNow = numbers.length > 0 && (content.trim() || image);
  const canSchedule = canSendNow && scheduledAt;

  const removeNumber = (n) => setNumbersInput(numbers.filter((x) => x !== n).join(', '));

  const handleSendNow = async () => {
    if (!canSendNow) return;
    setLoading('now');
    setFeedback(null);

    const formData = new FormData();
    formData.append('numbers', numbers.join(','));
    formData.append('content', content);
    if (image) formData.append('image', image);

    try {
      const result = await sendDirectMessageNow(formData);
      if (!result) return;
      if (result.error) {
        setFeedback({ type: 'error', text: result.details?.join('. ') || result.error });
      } else {
        pendingJob.current = result.jobId;
        setFeedback({
          type: 'info',
          text: `Enviando a ${result.total} número(s) en segundo plano, con pausas entre mensajes. Te avisaremos al terminar.`,
        });
        setContent('');
        setImage(null);
        setNumbersInput('');
      }
    } catch {
      setFeedback({ type: 'error', text: 'No se pudieron enviar los mensajes.' });
    } finally {
      setLoading(null);
    }
  };

  const handleSchedule = async () => {
    if (!canSchedule) return;
    setLoading('schedule');
    setFeedback(null);

    const formData = new FormData();
    formData.append('numbers', numbers.join(','));
    formData.append('content', content);
    formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    if (image) formData.append('image', image);

    try {
      const result = await createDirectMessage(formData);
      if (!result) return;
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        toast.success('Mensaje programado');
        setFeedback(null);
        setContent('');
        setScheduledAt('');
        setImage(null);
        setNumbersInput('');
        if (onSent) onSent();
      }
    } catch {
      setFeedback({ type: 'error', text: 'No se pudo programar el mensaje.' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="compose-grid">
      <div className="stack">
        <Field
          label="Números de teléfono" htmlFor="qm-numbers"
          extra={numbers.length ? `${numbers.length} válido(s)` : undefined}
          hint="Separa con comas o saltos de línea. Incluye el código de país (57 Colombia, 52 México…)."
        >
          <textarea
            id="qm-numbers" className="textarea" style={{ minHeight: 76 }} value={numbersInput}
            onChange={(e) => setNumbersInput(e.target.value)}
            placeholder="573001234567, 573009876543, 521234567890"
          />
        </Field>

        {numbers.length > 0 && (
          <div className="chips" aria-label="Números detectados">
            {numbers.map((n) => (
              <span key={n} className="chip">
                {n}
                <button type="button" onClick={() => removeNumber(n)} aria-label={`Quitar ${n}`}><Icon name="x" size="sm" /></button>
              </span>
            ))}
          </div>
        )}

        <Field label="Mensaje" htmlFor="qm-content">
          <textarea id="qm-content" onPaste={link.onPaste} className="textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribe tu mensaje…" />
        </Field>
        <LinkPanel tools={link} setText={setContent} addImage={setImage} />

        <ImageUpload file={image} onFileChange={setImage} />
        <ScheduleField label="Programar para" optional value={scheduledAt} onChange={setScheduledAt} />

        {feedback && <Alert type={feedback.type}>{feedback.text}</Alert>}

        <div className="row">
          <Button variant="primary" size="lg" icon="bolt" loading={loading === 'now'} disabled={!canSendNow || !!loading} onClick={handleSendNow}>
            {loading === 'now' ? 'Enviando…' : 'Enviar ahora'}
          </Button>
          <Button size="lg" icon="clock" loading={loading === 'schedule'} disabled={!canSchedule || !!loading} onClick={handleSchedule}>
            {loading === 'schedule' ? 'Programando…' : 'Programar envío'}
          </Button>
        </div>
      </div>
      <aside className="compose-aside"><WaPreview text={content} imageFile={image} when={scheduledAt} linkCard={<BubbleLinkCard preview={link.preview} />} /></aside>
    </div>
  );
}
