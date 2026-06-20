import React from 'react';
import { deletePublishedStatusApi } from '../api.js';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  item: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  text: {
    margin: 0,
    fontSize: 14,
    color: '#333',
    whiteSpace: 'pre-wrap',
  },
  image: {
    width: 80,
    height: 80,
    objectFit: 'cover',
    borderRadius: 4,
    marginRight: 12,
  },
  imageContainer: {
    display: 'flex',
    alignItems: 'center',
    marginRight: 16,
  },
  info: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    padding: '6px 12px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: '#999',
  },
};

export default function PublishedStatusList({ statuses, onDelete }) {
  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este estado publicado?')) return;
    
    await deletePublishedStatusApi(id);
    if (onDelete) onDelete();
  };

  if (statuses.length === 0) {
    return <div style={styles.empty}>No hay estados publicados</div>;
  }

  return (
    <div style={styles.container}>
      {statuses.map((status) => (
        <div key={status.id} style={styles.item}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            {status.image_path && (
              <div style={styles.imageContainer}>
                <img
                  src={`/uploads/${status.image_path.split('/').pop()}`}
                  alt="Status"
                  style={styles.image}
                />
              </div>
            )}
            <div style={styles.content}>
              {status.content && <p style={styles.text}>{status.content}</p>}
              <div style={styles.info}>
                Publicado: {new Date(status.published_at).toLocaleString('es-ES')}
              </div>
            </div>
          </div>
          <button
            style={styles.deleteButton}
            onClick={() => handleDelete(status.id)}
          >
            Eliminar
          </button>
        </div>
      ))}
    </div>
  );
}
