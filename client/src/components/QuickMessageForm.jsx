import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { sendDirectMessageNow, createDirectMessage } from '../api.js';

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 4,
    color: '#333',
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: 10,
    fontSize: 15,
    border: '1px solid #ccc',
    borderRadius: 6,
    marginBottom: 4,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    minHeight: 100,
    padding: 10,
    fontSize: 15,
    border: '1px solid #ccc',
    borderRadius: 6,
    resize: 'vertical',
    fontFamily: 'inherit',
    marginBottom: 12,
    boxSizing: 'border-box',
  },
  dateInput: {
    padding: '10px 12px',
    fontSize: 15,
    border: '1px solid #ccc',
    borderRadius: 6,
    marginBottom: 16,
    width: '100%',
    boxSizing: 'border-box',
  },
  btnRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  sendNowBtn: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#128C7E',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  scheduleBtn: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#25D366',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  feedback: {
    marginTop: 12,
    padding: 10,
    borderRadius: 6,
    fontSize: 14,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    fontSize: 13,
    background: '#E8F5E9',
    color: '#2E7D32',
    borderRadius: 16,
    border: '1px solid #A5D6A7',
  },
};

function parseNumbers(input) {
  return input
    .split(',')
    .map((n) => n.trim().replace(/[^0-9+]/g, ''))
    .filter((n) => n.length >= 7);
}

export default function QuickMessageForm({ onSent }) {
  const [numbersInput, setNumbersInput] = useState('');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const numbers = parseNumbers(numbersInput);
  const canSendNow = numbers.length > 0 && (content.trim() || image);
  const canSchedule = canSendNow && scheduledAt;

  const handleSendNow = async () => {
    if (!canSendNow) return;
    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('numbers', numbers.join(','));
    formData.append('content', content);
    if (image) formData.append('image', image);

    try {
      const result = await sendDirectMessageNow(formData);
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        const msg = `Enviado a ${result.sent}/${result.total} numeros`;
        const notFound = (result.results || []).filter((r) => r.status === 'not_found');
        const failed = (result.results || []).filter((r) => r.status === 'failed');
        let extra = '';
        if (notFound.length > 0) extra += `. No encontrados: ${notFound.map((r) => r.number).join(', ')}`;
        if (failed.length > 0) extra += `. Fallidos: ${failed.map((r) => r.number).join(', ')}`;
        setFeedback({ type: result.sent > 0 ? 'success' : 'error', text: msg + extra });
        if (result.sent > 0) {
          setContent('');
          setImage(null);
          setNumbersInput('');
          if (onSent) onSent();
        }
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al enviar los mensajes' });
    } finally {
      setLoading(false);
    }
  };

  const handleSchedule = async () => {
    if (!canSchedule) return;
    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('numbers', numbers.join(','));
    formData.append('content', content);
    formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    if (image) formData.append('image', image);

    try {
      const result = await createDirectMessage(formData);
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        setFeedback({ type: 'success', text: 'Mensaje programado correctamente' });
        setContent('');
        setScheduledAt('');
        setImage(null);
        setNumbersInput('');
        if (onSent) onSent();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al programar el mensaje' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.form}>
      <label style={styles.label}>Numeros de telefono</label>
      <input
        type="text"
        style={styles.input}
        value={numbersInput}
        onChange={(e) => setNumbersInput(e.target.value)}
        placeholder="Ej: 573001234567, 573009876543, 521234567890"
      />
      <p style={styles.hint}>
        Separa los numeros con coma. Incluye el codigo de pais (ej: 57 para Colombia, 52 para Mexico).
      </p>

      {numbers.length > 0 && (
        <div style={styles.chips}>
          {numbers.map((n, i) => (
            <span key={i} style={styles.chip}>{n}</span>
          ))}
        </div>
      )}

      <label style={styles.label}>Mensaje</label>
      <textarea
        style={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe tu mensaje..."
      />

      <ImageUpload file={image} onFileChange={setImage} />

      <label style={styles.label}>Fecha y hora (opcional, para programar)</label>
      <input
        type="datetime-local"
        style={styles.dateInput}
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
      />

      <div style={styles.btnRow}>
        <button
          type="button"
          onClick={handleSendNow}
          disabled={!canSendNow || loading}
          style={{
            ...styles.sendNowBtn,
            ...(!canSendNow || loading ? styles.btnDisabled : {}),
          }}
        >
          {loading ? 'Enviando...' : 'Enviar ahora'}
        </button>
        <button
          type="button"
          onClick={handleSchedule}
          disabled={!canSchedule || loading}
          style={{
            ...styles.scheduleBtn,
            ...(!canSchedule || loading ? styles.btnDisabled : {}),
          }}
        >
          {loading ? 'Programando...' : 'Programar envio'}
        </button>
      </div>

      {feedback && (
        <div
          style={{
            ...styles.feedback,
            background: feedback.type === 'success' ? '#E8F5E9' : '#FFEBEE',
            color: feedback.type === 'success' ? '#2E7D32' : '#C62828',
          }}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
