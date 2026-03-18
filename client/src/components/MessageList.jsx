import React, { useState } from 'react';
import { cancelMessage, updateMessageApi, deleteMessageApi } from '../api.js';

const statusConfig = {
  pending: { label: 'Pendiente', color: '#FFA726', bg: '#FFF3E0' },
  sent: { label: 'Enviado', color: '#66BB6A', bg: '#E8F5E9' },
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
    maxWidth: 250,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    background: '#25D366',
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

export default function MessageList({ messages, onRefresh }) {
  const [editingMsg, setEditingMsg] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');

  if (messages.length === 0) {
    return <p style={styles.empty}>No hay mensajes programados</p>;
  }

  const handleCancel = async (id) => {
    await cancelMessage(id);
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este mensaje?')) return;
    await deleteMessageApi(id);
    onRefresh();
  };

  const openEdit = (msg) => {
    setEditingMsg(msg);
    setEditContent(msg.content);
    setEditScheduledAt(toDatetimeLocal(msg.scheduled_at));
  };

  const handleEditSave = async () => {
    if (!editingMsg) return;
    await updateMessageApi(editingMsg.id, {
      content: editContent,
      scheduledAt: new Date(editScheduledAt).toISOString(),
    });
    setEditingMsg(null);
    onRefresh();
  };

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Grupo</th>
              <th style={styles.th}>Mensaje</th>
              <th style={styles.th}>Programado</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((msg) => (
              <tr key={msg.id}>
                <td style={styles.td}>{msg.group_name}</td>
                <td style={{ ...styles.td, ...styles.content }} title={msg.content}>
                  {msg.content}
                </td>
                <td style={styles.td}>{formatDate(msg.scheduled_at)}</td>
                <td style={styles.td}>
                  <span style={styles.badge(msg.status)}>
                    {statusConfig[msg.status]?.label || msg.status}
                  </span>
                </td>
                <td style={styles.td}>
                  {msg.status === 'pending' && (
                    <>
                      <button
                        style={styles.actionBtn('#1E88E5')}
                        onClick={() => openEdit(msg)}
                      >
                        Editar
                      </button>
                      <button
                        style={styles.actionBtn('#EF5350')}
                        onClick={() => handleCancel(msg.id)}
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  <button
                    style={styles.actionBtn('#757575')}
                    onClick={() => handleDelete(msg.id)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingMsg && (
        <div style={styles.modal} onClick={() => setEditingMsg(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Editar mensaje</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Mensaje</label>
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
              <button style={styles.btnSecondary} onClick={() => setEditingMsg(null)}>
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
