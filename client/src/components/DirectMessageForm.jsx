import React, { useState } from 'react';
import ImageUpload from './ImageUpload.jsx';
import { createDirectMessage } from '../api.js';

const styles = {
  container: {
    background: '#F1F8E9',
    border: '1px solid #AED581',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
  },
  title: {
    margin: '0 0 12px',
    fontSize: 15,
    fontWeight: 600,
    color: '#33691E',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    color: '#333',
  },
  textarea: {
    width: '100%',
    minHeight: 80,
    padding: 10,
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 6,
    resize: 'vertical',
    fontFamily: 'inherit',
    marginBottom: 8,
    boxSizing: 'border-box',
  },
  dateInput: {
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #ccc',
    borderRadius: 6,
    marginBottom: 12,
    width: '100%',
    boxSizing: 'border-box',
  },
  btnRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  submitBtn: {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#25D366',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 500,
    color: '#555',
    backgroundColor: '#e0e0e0',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  feedback: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    fontSize: 13,
  },
  selectedInfo: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
  },
};

export default function DirectMessageForm({ selectedContacts, onClose, onSent }) {
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() || !scheduledAt || selectedContacts.length === 0) return;

    setLoading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('recipients', JSON.stringify(selectedContacts.map((c) => c.jid)));
    formData.append('recipientLabel', `${selectedContacts.length} contacto(s)`);
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
        if (onSent) onSent();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Error al programar el mensaje' });
    } finally {
      setLoading(false);
    }
  };

  const isValid = content.trim() && scheduledAt && selectedContacts.length > 0;

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>Programar mensaje a contactos</h4>
      <p style={styles.selectedInfo}>
        {selectedContacts.length} contacto(s) seleccionado(s)
      </p>
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

        <div style={styles.btnRow}>
          <button
            type="submit"
            disabled={!isValid || loading}
            style={{
              ...styles.submitBtn,
              ...(!isValid || loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          >
            {loading ? 'Programando...' : 'Programar mensaje'}
          </button>
          <button type="button" style={styles.cancelBtn} onClick={onClose}>
            Cancelar
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
    </div>
  );
}
