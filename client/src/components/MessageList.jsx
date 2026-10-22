import React, { useState } from 'react';
import { cancelMessage, updateMessageApi, deleteMessageApi } from '../api.js';
import { Icon, Button, Field, Modal, Empty, StatusBadge, formatDate, toDatetimeLocal, toast, confirmDialog, ScheduleField } from './ui.jsx';

export default function MessageList({ messages, onRefresh }) {
  const [editingMsg, setEditingMsg] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);

  if (messages.length === 0) {
    return (
      <Empty icon="send" title="Aún no hay mensajes programados">
        Elige un grupo arriba y programa tu primer mensaje.
      </Empty>
    );
  }

  const handleCancel = async (id) => {
    if (!(await confirmDialog({ title: '¿Cancelar este envío?', message: 'El mensaje no se enviará. Podrás eliminarlo después.', confirmLabel: 'Cancelar envío', danger: true }))) return;
    await cancelMessage(id);
    toast.info('Envío cancelado');
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: '¿Eliminar este mensaje?', message: 'Se borrará de forma permanente.', confirmLabel: 'Eliminar', danger: true }))) return;
    await deleteMessageApi(id);
    toast.success('Mensaje eliminado');
    onRefresh();
  };

  const openEdit = (msg) => {
    setEditingMsg(msg);
    setEditContent(msg.content);
    setEditScheduledAt(toDatetimeLocal(msg.scheduled_at));
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingMsg) return;
    setBusy(true);
    try {
      await updateMessageApi(editingMsg.id, {
        content: editContent,
        scheduledAt: new Date(editScheduledAt).toISOString(),
      });
      setEditingMsg(null);
      toast.success('Cambios guardados');
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const actions = (msg) => (
    <>
      {msg.status === 'pending' && (
        <>
          <Button size="sm" variant="secondary" icon="edit" onClick={() => openEdit(msg)}>Editar</Button>
          <Button size="sm" variant="ghost" icon="ban" onClick={() => handleCancel(msg.id)}>Cancelar</Button>
        </>
      )}
      <Button size="sm" variant="ghost" className="btn-icon" aria-label="Eliminar" title="Eliminar" onClick={() => handleDelete(msg.id)}>
        <Icon name="trash" size="sm" />
      </Button>
    </>
  );

  return (
    <>
      <div className="table-wrap responsive">
        <table className="table">
          <thead>
            <tr><th>Grupo</th><th>Mensaje</th><th>Programado</th><th>Estado</th><th aria-label="Acciones" /></tr>
          </thead>
          <tbody>
            {messages.map((msg) => (
              <tr key={msg.id}>
                <td><b>{msg.group_name}</b></td>
                <td className="cell-clip" title={msg.content}>{msg.content}</td>
                <td className="nowrap">{formatDate(msg.scheduled_at)}</td>
                <td><StatusBadge status={msg.status} /></td>
                <td><div className="cell-actions">{actions(msg)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="items">
        {messages.map((msg) => (
          <article className="item" key={msg.id}>
            <div className="item-top">
              <span className="item-title">{msg.group_name}</span>
              <StatusBadge status={msg.status} />
            </div>
            <p className="item-text">{msg.content}</p>
            <div className="item-meta"><span><Icon name="clock" size="sm" className="inline-icon" /> {formatDate(msg.scheduled_at)}</span></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>{actions(msg)}</div>
          </article>
        ))}
      </div>

      {editingMsg && (
        <Modal onClose={() => setEditingMsg(null)} labelledBy="edit-msg">
          <form onSubmit={handleEditSave}>
            <div className="modal-head"><div><h3 id="edit-msg">Editar mensaje</h3><p>{editingMsg.group_name}</p></div></div>
            <div className="modal-body">
              <Field label="Mensaje" htmlFor="em-c">
                <textarea id="em-c" data-autofocus className="textarea" value={editContent} onChange={(e) => setEditContent(e.target.value)} required />
              </Field>
              <ScheduleField label="Fecha y hora" value={editScheduledAt} onChange={setEditScheduledAt} />
            </div>
            <div className="modal-foot">
              <Button type="button" onClick={() => setEditingMsg(null)}>Cancelar</Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!editContent.trim() || !editScheduledAt}>Guardar</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
