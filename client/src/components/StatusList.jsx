import React, { useState } from 'react';
import { cancelStatusUpdate, updateStatusUpdateApi, deleteStatusUpdateApi } from '../api.js';

const statusConfig = {
  pending: { label: 'Pendiente', color: '#FFA726', bg: '#FFF3E0' },
  sent: { label: 'Publicado', color: '#66BB6A', bg: '#E8F5E9' },
  failed: { label: 'Fallido', color: '#EF5350', bg: '#FFEBEE' },
  cancelled: { label: 'Cancelado', color: '#BDBDBD', bg: '#F5F5F5' },
};

const styles = {
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '10px 8px',
    borderBottom: '2px solid #e0e0e0',
    color: '#555',
    fontWeight: 600,
  },
  td: {
    padding: '10px 8px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'top',
  },
  badge: (status) => {
    const cfg = statusConfig[status] || statusConfig.pending;
    return {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      color: cfg.color,
      backgroundColor: cfg.bg,
    };
  },
  actionBtn: (color) => ({
    background: 'none',
    border: `1px solid ${color}`,
    color: color,
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    marginRight: 4,
  }),
  empty: {
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
  content: {
    maxWidth: 300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  typeTag: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    marginRight: 4,
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: '#fff',
    borderRadius: 8,
    padding: 24,
    width: '90%',
    maxWidth: 450,
  },
  modalTitle: {
    margin: '0 0 16px',
    fontSize: 18,
    color: '#075E54',
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    color: '#555',
    fontWeight: 600,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: 14,
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: 14,
    minHeight: 80,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  btnPrimary: {
    background: '#075E54',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
  btnSecondary: {
    background: 'none',
    border: '1px solid #ccc',
    color: '#555',
    padding: '8px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
  },
};

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getTypeLabel(su) {
  const hasText = !!su.content;
  const hasImage = !!su.image_path;
  if (hasText && hasImage) return { label: 'Texto + Imagen', color: '#7B1FA2', bg: '#F3E5F5' };
  if (hasImage) return { label: 'Imagen', color: '#1565C0', bg: '#E3F2FD' };
  return { label: 'Texto', color: '#2E7D32', bg: '#E8F5E9' };
}

export default function StatusList({ statusUpdates, onRefresh }) {
  const [editingSu, setEditingSu] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');

  if (statusUpdates.length === 0) {
    return <p style={styles.empty}>No hay estados programados</p>;
  }

  const handleCancel = async (id) => {
    await cancelStatusUpdate(id);
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Estas seguro de que quieres eliminar este estado?')) return;
    await deleteStatusUpdateApi(id);
    onRefresh();
  };

  const openEdit = (su) => {
    setEditingSu(su);
    setEditContent(su.content || '');
    setEditScheduledAt(toDatetimeLocal(su.scheduled_at));
  };

  const handleEditSave = async () => {
    if (!editingSu) return;
    await updateStatusUpdateApi(editingSu.id, {
      content: editContent,
      scheduledAt: new Date(editScheduledAt).toISOString(),
    });
    setEditingSu(null);
    onRefresh();
  };

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Tipo</th>
              <th style={styles.th}>Contenido</th>
              <th style={styles.th}>Programado</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {statusUpdates.map((su) => {
              const typeInfo = getTypeLabel(su);
              return (
                <tr key={su.id}>
                  <td style={styles.td}>
                    <span style={{ ...styles.typeTag, color: typeInfo.color, backgroundColor: typeInfo.bg }}>
                      {typeInfo.label}
                    </span>
                  </td>
                  <td style={{ ...styles.td, ...styles.content }} title={su.content || '(solo imagen)'}>
                    {su.content || '(solo imagen)'}
                  </td>
                  <td style={styles.td}>{formatDate(su.scheduled_at)}</td>
                  <td style={styles.td}>
                    <span style={styles.badge(su.status)}>
                      {statusConfig[su.status]?.label || su.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {su.status === 'pending' && (
                      <>
                        <button
                          style={styles.actionBtn('#1E88E5')}
                          onClick={() => openEdit(su)}
                        >
                          Editar
                        </button>
                        <button
                          style={styles.actionBtn('#EF5350')}
                          onClick={() => handleCancel(su.id)}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    <button
                      style={styles.actionBtn('#757575')}
                      onClick={() => handleDelete(su.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingSu && (
        <div style={styles.modal} onClick={() => setEditingSu(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Editar estado</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Texto</label>
              <textarea
                style={styles.textarea}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Fecha y hora</label>
              <input
                type="datetime-local"
                style={styles.input}
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
            </div>
            <div style={styles.modalActions}>
              <button style={styles.btnSecondary} onClick={() => setEditingSu(null)}>
                Cancelar
              </button>
              <button style={styles.btnPrimary} onClick={handleEditSave}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
