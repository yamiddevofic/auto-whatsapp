import React, { useState, useEffect, useCallback } from 'react';
import { fetchDirectMessages, cancelDirectMessage, deleteDirectMessageApi } from '../api.js';
import { Icon, Button, Empty, StatusBadge, formatDate, toast, confirmDialog } from './ui.jsx';

export default function DirectMessageList() {
  const [messages, setMessages] = useState(null);

  const load = useCallback(async () => {
    const data = await fetchDirectMessages();
    if (data) setMessages(data);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleCancel = async (id) => {
    if (!(await confirmDialog({ title: '¿Cancelar este mensaje?', message: 'No se enviará a los destinatarios.', confirmLabel: 'Cancelar envío', danger: true }))) return;
    await cancelDirectMessage(id);
    toast.info('Envío cancelado');
    load();
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: '¿Eliminar este mensaje?', message: 'Se borrará de forma permanente.', confirmLabel: 'Eliminar', danger: true }))) return;
    await deleteDirectMessageApi(id);
    toast.success('Mensaje eliminado');
    load();
  };

  if (messages === null) {
    return <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>;
  }

  if (messages.length === 0) {
    return (
      <Empty icon="send" title="No hay mensajes directos programados">
        Cuando programes un mensaje a contactos o números, lo verás aquí.
      </Empty>
    );
  }

  const action = (m) =>
    m.status === 'pending' ? (
      <Button size="sm" variant="ghost" icon="ban" onClick={() => handleCancel(m.id)}>Cancelar</Button>
    ) : (
      <Button size="sm" variant="ghost" className="btn-icon" aria-label="Eliminar" title="Eliminar" onClick={() => handleDelete(m.id)}>
        <Icon name="trash" size="sm" />
      </Button>
    );

  return (
    <>
      <div className="table-wrap responsive">
        <table className="table">
          <thead>
            <tr><th>Destinatarios</th><th>Mensaje</th><th>Programado</th><th>Estado</th><th aria-label="Acciones" /></tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td><b>{m.recipient_label}</b></td>
                <td className="cell-clip" title={m.content}>{m.content}</td>
                <td className="nowrap">{formatDate(m.scheduled_at)}</td>
                <td><StatusBadge status={m.status} /></td>
                <td><div className="cell-actions">{action(m)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="items">
        {messages.map((m) => (
          <article className="item" key={m.id}>
            <div className="item-top">
              <span className="item-title">{m.recipient_label}</span>
              <StatusBadge status={m.status} />
            </div>
            <p className="item-text">{m.content}</p>
            <div className="item-meta">
              <span><Icon name="clock" size="sm" className="inline-icon" /> {formatDate(m.scheduled_at)}</span>
              {action(m)}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
