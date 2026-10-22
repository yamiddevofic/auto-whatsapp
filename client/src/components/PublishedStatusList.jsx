import React from 'react';
import { deletePublishedStatusApi } from '../api.js';
import { Icon, Button, Empty, toast, confirmDialog, formatDate } from './ui.jsx';

export default function PublishedStatusList({ statuses, onDelete }) {
  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: '¿Eliminar este estado publicado?', message: 'Se retirará de tu historial.', confirmLabel: 'Eliminar', danger: true }))) return;
    await deletePublishedStatusApi(id);
    toast.success('Estado eliminado');
    if (onDelete) onDelete();
  };

  if (statuses.length === 0) {
    return (
      <Empty icon="status" title="Todavía no has publicado estados">
        Los estados que publiques aparecerán aquí.
      </Empty>
    );
  }

  return (
    <div className="status-grid">
      {statuses.map((status) => (
        <article key={status.id} className="status-card">
          <div className="status-media">
            {status.image_path ? (
              <img src={`/uploads/${status.image_path.split('/').pop()}`} alt="Imagen del estado" loading="lazy" />
            ) : (
              <span>{status.content}</span>
            )}
          </div>
          <div className="status-body">
            {status.image_path && status.content && <p>{status.content}</p>}
            <div className="status-foot">
              <span><Icon name="clock" size="sm" className="inline-icon" /> {formatDate(status.published_at)}</span>
              <Button size="sm" variant="ghost" className="btn-icon" aria-label="Eliminar estado" title="Eliminar" onClick={() => handleDelete(status.id)}>
                <Icon name="trash" size="sm" />
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
