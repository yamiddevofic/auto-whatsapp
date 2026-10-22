import React from 'react';
import { Icon, Modal, Button } from './ui.jsx';

const LABELS = {
  connected: 'Conectado',
  connecting: 'Esperando QR…',
  disconnected: 'Desconectado',
};

export default function ConnectionStatus({ status, qr }) {
  const key = LABELS[status] ? status : 'disconnected';
  const closeQr = () => window.dispatchEvent(new CustomEvent('close-qr'));

  return (
    <>
      <div className={`conn is-${key}`} role="status" aria-live="polite">
        <span className="conn-dot" />
        {LABELS[key]}
      </div>

      {qr && (
        <Modal onClose={closeQr} className="modal-qr" labelledBy="qr-title">
          <div className="modal-head" style={{ justifyContent: 'center', textAlign: 'center' }}>
            <div>
              <h3 id="qr-title">Vincula tu WhatsApp</h3>
              <p>Escanea el código desde tu teléfono.</p>
            </div>
          </div>
          <div className="modal-body">
            <div className="qr-frame"><img src={qr} alt="Código QR para vincular WhatsApp" /></div>
            <ol className="steps">
              <li>Abre WhatsApp en tu teléfono</li>
              <li>Ve a <b>Ajustes → Dispositivos vinculados</b></li>
              <li>Toca <b>Vincular un dispositivo</b> y apunta a este código</li>
            </ol>
          </div>
          <div className="modal-foot">
            <Button variant="secondary" onClick={closeQr} data-autofocus>Cerrar</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
