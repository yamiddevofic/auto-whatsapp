import React, { useState, useEffect, useCallback } from 'react';
import { fetchDirectMessages, cancelDirectMessage, deleteDirectMessageApi } from '../api.js';

const styles = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #e0e0e0',
    color: '#555', fontWeight: 600,
  },
  td: { padding: '8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' },
  badge: (status) => {
    const colors = {
      pending: { bg: '#FFF3E0', color: '#E65100' },
      sent: { bg: '#E8F5E9', color: '#2E7D32' },
      failed: { bg: '#FFEBEE', color: '#C62828' },
      cancelled: { bg: '#f5f5f5', color: '#999' },
    };
    const c = colors[status] || colors.pending;
    return {
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      fontSize: 11, fontWeight: 600, color: c.color, backgroundColor: c.bg,
    };
  },
  btnSmall: (color, bg) => ({
    padding: '4px 10px', fontSize: 12, fontWeight: 600, color,
    backgroundColor: bg, border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 4,
  }),
  empty: { color: '#999', textAlign: 'center', padding: 16, fontSize: 13 },
};

const statusLabels = { pending: 'Pendiente', sent: 'Enviado', failed: 'Fallido', cancelled: 'Cancelado' };

export default function DirectMessageList() {
  const [messages, setMessages] = useState([]);

  const load = useCallback(async () => {
    const data = await fetchDirectMessages();
    setMessages(data);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleCancel = async (id) => {
    if (!window.confirm('Cancelar este mensaje?')) return;
    await cancelDirectMessage(id);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar permanentemente?')) return;
    await deleteDirectMessageApi(id);
    load();
  };

  if (messages.length === 0) {
    return <p style={styles.empty}>No hay mensajes directos programados</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Destinatarios</th>
            <th style={styles.th}>Mensaje</th>
            <th style={styles.th}>Programado</th>
            <th style={styles.th}>Estado</th>
            <th style={styles.th}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <td style={styles.td}>{m.recipient_label}</td>
              <td style={{ ...styles.td, maxWidth: 250, wordBreak: 'break-word' }}>
                {m.content?.substring(0, 100)}{m.content?.length > 100 ? '...' : ''}
              </td>
              <td style={styles.td}>
                {new Date(m.scheduled_at).toLocaleString()}
              </td>
              <td style={styles.td}>
                <span style={styles.badge(m.status)}>
                  {statusLabels[m.status] || m.status}
                </span>
              </td>
              <td style={styles.td}>
                {m.status === 'pending' && (
                  <button style={styles.btnSmall('#fff', '#EF5350')} onClick={() => handleCancel(m.id)}>
                    Cancelar
                  </button>
                )}
                {m.status !== 'pending' && (
                  <button style={styles.btnSmall('#fff', '#999')} onClick={() => handleDelete(m.id)}>
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
