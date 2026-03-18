import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { createMessage } from '../api.js';

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
    backgroundColor: '#25D366',
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
};

export default function MessageForm({ group, onCreated }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() || !scheduledAt) return;

    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('groupId', group.id);
    formData.append('groupName', group.name);
    formData.append('content', content);
    formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    if (image) formData.append('image', image);

    try {
      const result = await createMessage(formData);
      if (result.error) {
        setFeedback({ type: 'error', text: result.error });
      } else {
        setFeedback({ type: 'success', text: 'Mensaje programado correctamente' });
        setContent('');
        setScheduledAt('');
        setImage(null);
        onCreated();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al programar el mensaje' });
    } finally {
      setLoading(false);
    }
  };

  const isValid = content.trim() && scheduledAt;

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <label style={styles.label}>Mensaje</label>
      <textarea
        style={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escribe tu mensaje..."
      />

      <ImageUpload file={image} onFileChange={setImage} />

      <label style={styles.label}>Fecha y hora de envio</label>
      <input
        type="datetime-local"
        style={styles.dateInput}
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
      />

      <button
        type="submit"
        disabled={!isValid || loading}
        style={{
          ...styles.submitBtn,
          ...(!isValid || loading ? styles.submitBtnDisabled : {}),
        }}
      >
        {loading ? 'Programando...' : 'Programar mensaje'}
      </button>

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
