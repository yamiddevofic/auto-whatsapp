import { useState } from 'react';
import { Icon, Button, Field, Alert } from './ui.jsx';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo iniciar sesión');
      }

      const data = await response.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const brand = (
    <div className="brand">
      <div className="brand-logo"><Icon name="whatsapp" size="lg" /></div>
      <div className="brand-name">Auto WhatsApp<small>Automatización de mensajes</small></div>
    </div>
  );

  return (
    <div className="login">
      <aside className="login-hero">
        {brand}
        <div>
          <h2>Programa. Envía. Olvídate.</h2>
          <p>Mensajes a grupos, estados y chats directos, enviados justo cuando tú quieres.</p>
        </div>
        <div className="login-points">
          <div><span className="dot"><Icon name="clock" size="sm" /></span>Programación precisa al minuto</div>
          <div><span className="dot"><Icon name="status" size="sm" /></span>Estados con varias imágenes en orden</div>
          <div><span className="dot"><Icon name="shield" size="sm" /></span>Acciones sensibles protegidas con contraseña</div>
        </div>
      </aside>

      <main className="login-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-mobile-brand">{brand}</div>
          <div>
            <h1>Bienvenido</h1>
            <p className="lead">Inicia sesión para gestionar tus envíos.</p>
          </div>

          <Field label="Usuario" htmlFor="username">
            <input
              id="username" className="input" type="text" autoComplete="username" autoFocus
              value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Tu usuario" required disabled={loading}
            />
          </Field>

          <Field label="Contraseña" htmlFor="password">
            <div className="pw-wrap">
              <input
                id="password" className="input" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña" required disabled={loading}
              />
              <button type="button" className="btn btn-ghost btn-icon btn-sm pw-toggle" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                <Icon name={showPw ? 'eyeOff' : 'eye'} size="sm" />
              </button>
            </div>
          </Field>

          {error && <Alert type="error">{error}</Alert>}

          <Button type="submit" variant="primary" size="lg" block loading={loading}>
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
        </form>
      </main>
    </div>
  );
}
