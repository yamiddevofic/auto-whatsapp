import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { createStatusUpdate, sendStatusNow } from '../api.js';

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
  submitBtn: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#075E54',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  feedback: {
    marginTop: 12,
    padding: 10,
    borderRadius: 6,
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    color: '#777',
    marginBottom: 12,
  },
};

export default function StatusForm({ onCreated }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!content.trim() && !image) || !scheduledAt) return;

    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    if (content.trim()) formData.append('content', content);
    formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    if (image) formData.append('image', image);

    try {
      const result = await createStatusUpdate(formData);
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        setFeedback({ type: 'success', text: 'Estado programado correctamente' });
        setContent('');
        setScheduledAt('');
        setImage(null);
        onCreated();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al programar el estado' });
    } finally {
      setLoading(false);
    }
  };

  const hasContent = content.trim() || image;
  const isValid = hasContent && scheduledAt;

  const handleSendNow = async () => {
    if (!hasContent) return;
    if (!window.confirm('Enviar el estado ahora mismo?')) return;
    setLoading(true);
    setFeedback(null);
    const formData = new FormData();
    if (content.trim()) formData.append('content', content);
    if (image) formData.append('image', image);
    try {
      const result = await sendStatusNow(formData);
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        setFeedback({ type: 'success', text: 'Estado publicado correctamente' });
        setContent('');
        setImage(null);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al publicar el estado' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <p style={styles.hint}>
        Puedes publicar texto, imagen, o ambos. Si solo envias imagen, se publica como estado de foto.
      </p>

      <label style={styles.label}>Texto del estado (opcional si hay imagen)</label>
      <textarea
        style={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe el texto de tu estado..."
      />

      <ImageUpload file={image} onFileChange={setImage} />

      <label style={styles.label}>Fecha y hora de publicacion</label>
      <input
        type="datetime-local"
        style={styles.dateInput}
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={!isValid || loading}
          style={{
            ...styles.submitBtn,
            ...(!isValid || loading ? styles.submitBtnDisabled : {}),
          }}
        >
          {loading ? 'Programando...' : 'Programar estado'}
        </button>
        <button
          type="button"
          disabled={!hasContent || loading}
          onClick={handleSendNow}
          style={{
            ...styles.submitBtn,
            backgroundColor: '#1E88E5',
            ...(!hasContent || loading ? styles.submitBtnDisabled : {}),
          }}
        >
          {loading ? 'Enviando...' : 'Enviar ahora'}
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
    </form>
  );
}
