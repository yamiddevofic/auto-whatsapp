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
  progress: {
    marginTop: 8,
    fontSize: 13,
    color: '#075E54',
    fontWeight: 500,
  },
};

export default function StatusForm({ onCreated }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [progress, setProgress] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!content.trim() && images.length === 0) || !scheduledAt) return;

    setLoading(true);
    setFeedback(null);
    setProgress('');

    try {
      const formData = new FormData();
      if (content.trim()) formData.append('content', content);
      formData.append('scheduledAt', new Date(scheduledAt).toISOString());
      images.forEach((img) => formData.append('images', img));

      const result = await createStatusUpdate(formData);
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        const count = result.count || 1;
        setFeedback({
          type: 'success',
          text: count > 1
            ? `${count} estados programados correctamente`
            : 'Estado programado correctamente',
        });
        setContent('');
        setScheduledAt('');
        setImages([]);
        onCreated();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al programar el estado' });
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const hasContent = content.trim() || images.length > 0;
  const isValid = hasContent && scheduledAt;

  const handleSendNow = async () => {
    if (!hasContent) return;

    const imageCount = images.length;
    const confirmMsg = imageCount > 1
      ? `Enviar ${imageCount} imagenes como estados ahora mismo?`
      : 'Enviar el estado ahora mismo?';
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setFeedback(null);
    setProgress('');

    try {
      if (images.length <= 1) {
        // Single image or text only — one request
        const formData = new FormData();
        if (content.trim()) formData.append('content', content);
        if (images[0]) formData.append('images', images[0]);
        const result = await sendStatusNow(formData);
        if (result.error) {
          setFeedback({ type: 'error', text: result.error });
          return;
        }
      } else {
        // Multiple images — send one by one in order
        for (let i = 0; i < images.length; i++) {
          setProgress(`Enviando imagen ${i + 1} de ${images.length}...`);
          const formData = new FormData();
          // Caption only on the first image
          if (i === 0 && content.trim()) formData.append('content', content);
          formData.append('images', images[i]);
          const result = await sendStatusNow(formData);
          if (result.error) {
            setFeedback({
              type: 'error',
              text: `Error en imagen ${i + 1}: ${result.error}`,
            });
            return;
          }
        }
      }
      setFeedback({
        type: 'success',
        text: imageCount > 1
          ? `${imageCount} estados publicados correctamente`
          : 'Estado publicado correctamente',
      });
      setContent('');
      setImages([]);
    } catch {
      setFeedback({ type: 'error', text: 'Error al publicar el estado' });
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <p style={styles.hint}>
        Puedes publicar texto, imagenes, o ambos. Si seleccionas varias imagenes, se publicaran como estados separados en el orden elegido.
      </p>

      <label style={styles.label}>Texto del estado (opcional si hay imagen)</label>
      <textarea
        style={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe el texto de tu estado..."
      />

      <ImageUpload files={images} onFilesChange={setImages} multiple={true} />

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

      {progress && <div style={styles.progress}>{progress}</div>}

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
