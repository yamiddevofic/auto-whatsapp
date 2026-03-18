import React, { useState, useEffect } from 'react';
import { fetchQR } from '../api.js';

const statusColors = {
  connected: '#25D366',
  connecting: '#FFA726',
  disconnected: '#EF5350',
};

const statusLabels = {
  connected: 'Conectado',
  connecting: 'Esperando QR...',
  disconnected: 'Desconectado',
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: (color) => ({
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: color,
  }),
  label: {
    fontSize: 14,
    fontWeight: 500,
  },
  qrContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  qrCard: {
    background: '#fff',
    padding: 24,
    borderRadius: 12,
    textAlign: 'center',
  },
  qrImg: {
    width: 280,
    height: 280,
  },
};

export default function ConnectionStatus({ status }) {
  const [qr, setQr] = useState(null);

  useEffect(() => {
    if (status !== 'connecting') {
      setQr(null);
      return;
    }

    const poll = setInterval(async () => {
      const { qr: qrData } = await fetchQR();
      setQr(qrData);
    }, 2000);

    fetchQR().then(({ qr: qrData }) => setQr(qrData));

    return () => clearInterval(poll);
  }, [status]);

  const color = statusColors[status] || statusColors.disconnected;

  return (
    <>
      <div style={styles.container}>
        <div style={styles.dot(color)} />
        <span style={styles.label}>{statusLabels[status] || status}</span>
      </div>

      {status === 'connecting' && qr && (
        <div style={styles.qrContainer}>
          <div style={styles.qrCard}>
            <h3 style={{ margin: '0 0 16px' }}>Escanea el QR con WhatsApp</h3>
            <img src={qr} alt="QR Code" style={styles.qrImg} />
            <p style={{ color: '#666', marginTop: 12 }}>
              Abre WhatsApp &gt; Dispositivos vinculados &gt; Vincular dispositivo
            </p>
          </div>
        </div>
      )}
    </>
  );
}
