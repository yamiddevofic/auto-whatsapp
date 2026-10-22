import React, { useState } from 'react';
import { cancelStatusUpdate, updateStatusUpdateApi, deleteStatusUpdateApi } from '../api.js';
import { audienceSummary } from './AudiencePicker.jsx';
import { Icon, Button, Field, Modal, Empty, StatusBadge, formatDate, toDatetimeLocal, toast, confirmDialog, ScheduleField } from './ui.jsx';

function typeOf(su) {
  const hasText = !!su.content;
  const hasImage = !!su.image_path;
  if (hasText && hasImage) return { label: 'Texto + imagen', icon: 'image' };
  if (hasImage) return { label: 'Imagen', icon: 'image' };
  return { label: 'Texto', icon: 'file' };
}

export default function StatusList({ statusUpdates, onRefresh }) {
  const [editingSu, setEditingSu] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);

  if (statusUpdates.length === 0) {
    return (
      <Empty icon="status" title="No hay estados programados">
        Programa un estado con texto o imágenes y aparecerá aquí.
      </Empty>
    );
  }

  const handleCancel = async (id) => {
    if (!(await confirmDialog({ title: '¿Cancelar este estado?', message: 'No se publicará.', confirmLabel: 'Cancelar estado', danger: true }))) return;
    await cancelStatusUpdate(id);
    toast.info('Estado cancelado');
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: '¿Eliminar este estado?', message: 'Se borrará de forma permanente.', confirmLabel: 'Eliminar', danger: true }))) return;
    await deleteStatusUpdateApi(id);
    toast.success('Estado eliminado');
    onRefresh();
  };

  const openEdit = (su) => {
    setEditingSu(su);
    setEditContent(su.content || '');
    setEditScheduledAt(toDatetimeLocal(su.scheduled_at));
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editingSu) return;
    setBusy(true);
    try {
      await updateStatusUpdateApi(editingSu.id, {
        content: editContent,
        scheduledAt: new Date(editScheduledAt).toISOString(),
      });
      setEditingSu(null);
      toast.success('Cambios guardados');
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const actions = (su) => (
    <>
      {su.status === 'pending' && (
        <>
          <Button size="sm" icon="edit" onClick={() => openEdit(su)}>Editar</Button>
          <Button size="sm" variant="ghost" icon="ban" onClick={() => handleCancel(su.id)}>Cancelar</Button>
        </>
      )}
      <Button size="sm" variant="ghost" className="btn-icon" aria-label="Eliminar" title="Eliminar" onClick={() => handleDelete(su.id)}>
        <Icon name="trash" size="sm" />
      </Button>
    </>
  );

  return (
    <>
      <div className="table-wrap responsive">
        <table className="table">
          <thead>
            <tr><th>Tipo</th><th>Contenido</th><th>Audiencia</th><th>Programado</th><th>Estado</th><th aria-label="Acciones" /></tr>
          </thead>
          <tbody>
            {statusUpdates.map((su) => {
              const t = typeOf(su);
              return (
                <tr key={su.id}>
                  <td><span className="badge badge-info badge-plain"><Icon name={t.icon} size="sm" />{t.label}</span></td>
                  <td className="cell-clip" title={su.content || ''}>{su.content || <span className="muted">(solo imagen)</span>}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{audienceSummary(su.audience)}</td>
                  <td className="nowrap">{formatDate(su.scheduled_at)}</td>
                  <td><StatusBadge status={su.status} sentLabel="Publicado" /></td>
                  <td><div className="cell-actions">{actions(su)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="items">
        {statusUpdates.map((su) => {
          const t = typeOf(su);
          return (
            <article className="item" key={su.id}>
              <div className="item-top">
                <span className="badge badge-info badge-plain"><Icon name={t.icon} size="sm" />{t.label}</span>
                <StatusBadge status={su.status} sentLabel="Publicado" />
              </div>
              <p className="item-text">{su.content || <span className="muted">(solo imagen)</span>}</p>
              <div className="item-meta"><span><Icon name="clock" size="sm" className="inline-icon" /> {formatDate(su.scheduled_at)}</span><span>{audienceSummary(su.audience)}</span></div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>{actions(su)}</div>
            </article>
          );
        })}
      </div>

      {editingSu && (
        <Modal onClose={() => setEditingSu(null)} labelledBy="edit-st">
          <form onSubmit={handleEditSave}>
            <div className="modal-head"><div><h3 id="edit-st">Editar estado</h3></div></div>
            <div className="modal-body">
              <Field label="Texto" htmlFor="es-c">
                <textarea id="es-c" data-autofocus className="textarea" value={editContent} onChange={(e) => setEditContent(e.target.value)} />
              </Field>
              <ScheduleField label="Fecha y hora" value={editScheduledAt} onChange={setEditScheduledAt} />
            </div>
            <div className="modal-foot">
              <Button type="button" onClick={() => setEditingSu(null)}>Cancelar</Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!editScheduledAt}>Guardar</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
