import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import Login from './components/Login.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import GroupList from './components/GroupList.jsx';
import MessageForm from './components/MessageForm.jsx';
import MessageList from './components/MessageList.jsx';
import StatusForm from './components/StatusForm.jsx';
import StatusList from './components/StatusList.jsx';
import ContactList from './components/ContactList.jsx';
import AgendaList from './components/AgendaList.jsx';
import DirectMessageList from './components/DirectMessageList.jsx';
import QuickMessageForm from './components/QuickMessageForm.jsx';
import PublishedStatusList from './components/PublishedStatusList.jsx';
import { Icon, Button, Card, Segmented, UiHost, initials } from './components/ui.jsx';
import { fetchStatus, fetchQR, fetchGroups, fetchMessages, fetchStatusUpdates, fetchDirectMessages, fetchPublishedStatuses, getToken, isTokenValid, logout } from './api.js';
import './styles/app.css';

const NAV = [
  { id: 'messages', label: 'Grupos', title: 'Mensajes a grupos', sub: 'Programa mensajes para tus grupos de WhatsApp', icon: 'groups' },
  { id: 'status', label: 'Estados', title: 'Estados de WhatsApp', sub: 'Publica o programa estados con texto e imágenes', icon: 'status' },
  { id: 'quick', label: 'Directos', title: 'Mensajes directos', sub: 'Envía o programa mensajes a números concretos', icon: 'bolt' },
  { id: 'contacts', label: 'Contactos', title: 'Contactos de grupos', sub: 'Escribe a las personas de tus grupos', icon: 'contacts' },
  { id: 'agenda', label: 'Agenda', title: 'Contactos de agenda', sub: 'Importa tu agenda y comprueba quién tiene WhatsApp', icon: 'book' },
];

function readTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* almacenamiento no disponible */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1210' : '#f4f6f5');
  }, [theme]);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('theme', next); } catch { /* ignorar */ }
  };
  return [theme, toggle];
}

export default function App() {
  const [status, setStatus] = useState('disconnected');
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [publishedStatuses, setPublishedStatuses] = useState([]);
  const [qr, setQr] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('tab') || 'messages'; } catch { return 'messages'; }
  });
  const [statusView, setStatusView] = useState('schedule');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [theme, toggleTheme] = useTheme();

  const go = (id) => {
    setActiveTab(id);
    try { localStorage.setItem('tab', id); } catch { /* ignorar */ }
    window.scrollTo({ top: 0 });
  };

  const refreshMessages = useCallback(async () => {
    const msgs = await fetchMessages();
    if (msgs) setMessages(msgs);
  }, []);

  const refreshStatusUpdates = useCallback(async () => {
    const updates = await fetchStatusUpdates();
    if (updates) setStatusUpdates(updates);
  }, []);

  // Comprueba si ya hay sesión iniciada
  useEffect(() => {
    // Antes bastaba con que existiera la cadena en localStorage: la interfaz se cargaba
    // con un token caducado y sólo fallaba en la primera petición.
    if (isTokenValid()) {
      setIsAuthenticated(true);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
    }

    const handleAuthExpired = () => setIsAuthenticated(false);
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Carga inicial
    refreshMessages();
    refreshStatusUpdates();
    fetchDirectMessages().then((d) => d && setDirectMessages(d));
    fetchPublishedStatuses().then(setPublishedStatuses);

    // Estado inicial desde el servidor
    fetchStatus().then((statusData) => {
      if (statusData && statusData.status) {
        setStatus(statusData.status);

        if (statusData.status === 'connected') {
          fetchGroups().then((g) => Array.isArray(g) && setGroups(g));
        } else {
          // Si ya hay un QR pendiente, se recupera por la API: antes la interfaz se quedaba
          // en "Esperando QR..." hasta la siguiente emisión por WebSocket.
          fetchQR().then((data) => {
            if (data?.qr) setQr(data.qr);
          });
        }
      }
    });

    // WebSocket autenticado: el servidor rechaza los handshakes sin token, de modo que
    // el QR de vinculación y los mensajes ya no se emiten a clientes anónimos.
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
      auth: { token: getToken() },
      withCredentials: true,
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setIsAuthenticated(false);
      }
    });

    socket.on('whatsapp:status', ({ status: s }) => {
      setStatus(s);
      if (s === 'connected') {
        setQr(null);
        fetchGroups().then((g) => Array.isArray(g) && setGroups(g));
      }
    });

    socket.on('whatsapp:qr', (qrDataUrl) => setQr(qrDataUrl));

    const handleCloseQR = () => setQr(null);
    window.addEventListener('close-qr', handleCloseQR);

    socket.on('messages:updated', setMessages);
    socket.on('status-updates:updated', setStatusUpdates);
    socket.on('direct-messages:updated', setDirectMessages);
    socket.on('published-statuses:updated', setPublishedStatuses);

    // Resultado de un envío inmediato, que el servidor procesa en segundo plano
    socket.on('direct-messages:send-now-result', (result) => {
      window.dispatchEvent(new CustomEvent('send-now-result', { detail: result }));
    });

    return () => {
      socket.disconnect();
      window.removeEventListener('close-qr', handleCloseQR);
    };
  }, [refreshMessages, refreshStatusUpdates, isAuthenticated]);

  const handleLogout = async () => {
    // Revoca el token en el servidor: antes seguía siendo válido 24 h
    await logout();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <>
        <Login onLoginSuccess={() => setIsAuthenticated(true)} />
        <UiHost />
      </>
    );
  }

  const pending = (list) => list.filter((m) => m.status === 'pending').length;
  const counts = {
    messages: pending(messages),
    status: pending(statusUpdates),
    quick: pending(directMessages),
  };
  const current = NAV.find((n) => n.id === activeTab) || NAV[0];
  const username = (() => { try { return localStorage.getItem('username') || 'Usuario'; } catch { return 'Usuario'; } })();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Icon name="whatsapp" size="lg" /></div>
          <div className="brand-name">Auto WhatsApp<small>Panel de envíos</small></div>
        </div>

        <nav className="nav" aria-label="Principal">
          <div className="nav-label">Enviar</div>
          {NAV.slice(0, 3).map((n) => (
            <button key={n.id} className="nav-link" aria-current={activeTab === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
              <Icon name={n.icon} />
              {n.title === 'Mensajes a grupos' ? 'Grupos' : n.label}
              {counts[n.id] > 0 && <span className="count-pill" title="Pendientes">{counts[n.id]}</span>}
            </button>
          ))}
          <div className="nav-label">Personas</div>
          {NAV.slice(3).map((n) => (
            <button key={n.id} className="nav-link" aria-current={activeTab === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar">{initials(username)}</span>
            <span>{username}</span>
          </div>
          <div className="foot-actions">
            <Button variant="secondary" size="sm" className="grow" icon={theme === 'dark' ? 'sun' : 'moon'} onClick={toggleTheme}>
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </Button>
            <Button variant="secondary" size="sm" className="grow" icon="logout" onClick={handleLogout}>Salir</Button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="brand-logo mobile-brand"><Icon name="whatsapp" size="sm" /></div>
          <div className="grow">
            <h1><span className="t-full">{current.title}</span><span className="t-short">{current.label}</span></h1>
            <div className="topbar-sub">{current.sub}</div>
          </div>
          <ConnectionStatus status={status} qr={qr} />
          <div className="mobile-only-actions" style={{ display: 'contents' }}>
            <Button className="btn-icon topbar-mobile" variant="ghost" size="sm" onClick={toggleTheme} aria-label="Cambiar tema" title="Cambiar tema">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size="sm" />
            </Button>
            <Button className="btn-icon topbar-mobile" variant="ghost" size="sm" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icon name="logout" size="sm" />
            </Button>
          </div>
        </header>

        <main className="content" key={activeTab}>
          {activeTab === 'messages' && (
            <div className="stack-lg">
              <Card
                title={<><span className="step-num" style={{ display: 'inline-grid', marginRight: 10 }}>1</span>Elige el grupo</>}
                subtitle={status !== 'connected' ? 'Conecta WhatsApp para cargar tus grupos' : undefined}
              >
                {selectedGroup ? (
                  <div className="selected-banner">
                    <span className="avatar">{initials(selectedGroup.name)}</span>
                    <div className="grow">
                      <div className="person-name">{selectedGroup.name}</div>
                      <div className="person-sub">{selectedGroup.participants} participantes</div>
                    </div>
                    <Button size="sm" onClick={() => setSelectedGroup(null)}>Cambiar</Button>
                  </div>
                ) : (
                  <GroupList groups={groups} selected={selectedGroup} onSelect={setSelectedGroup} />
                )}
              </Card>

              {selectedGroup && (
                <Card title={<><span className="step-num" style={{ display: 'inline-grid', marginRight: 10 }}>2</span>Redacta y programa</>}>
                  <MessageForm group={selectedGroup} onCreated={refreshMessages} />
                </Card>
              )}

              <Card title="Mensajes programados" subtitle={counts.messages ? `${counts.messages} pendiente(s)` : undefined}><MessageList messages={messages} onRefresh={refreshMessages} />
              </Card>
            </div>
          )}

          {activeTab === 'status' && (
            <div className="stack-lg">
              <Segmented
                label="Vista de estados" value={statusView} onChange={setStatusView}
                options={[
                  { value: 'schedule', label: 'Programar', count: counts.status || undefined },
                  { value: 'published', label: 'Publicados', count: publishedStatuses.length || undefined },
                ]}
              />
              {statusView === 'schedule' ? (
                <>
                  <Card title="Nuevo estado"><StatusForm onCreated={refreshStatusUpdates} groups={groups} /></Card>
                  <Card title="Estados programados"><StatusList statusUpdates={statusUpdates} onRefresh={refreshStatusUpdates} />
                  </Card>
                </>
              ) : (
                <Card title="Estados publicados">
                  <PublishedStatusList
                    statuses={publishedStatuses}
                    onDelete={() => fetchPublishedStatuses().then(setPublishedStatuses)}
                  />
                </Card>
              )}
            </div>
          )}

          {activeTab === 'quick' && (
            <div className="stack-lg">
              <Card title="Nuevo mensaje" subtitle="Envía ahora o programa para más tarde">
                <QuickMessageForm />
              </Card>
              <Card title="Mensajes directos programados" subtitle={counts.quick ? `${counts.quick} pendiente(s)` : undefined}>
                <DirectMessageList />
              </Card>
            </div>
          )}

          {activeTab === 'contacts' && (
            <div className="stack-lg">
              <Card title="Personas de tus grupos" subtitle="Selecciona contactos y programa un mensaje para todos a la vez">
                <ContactList />
              </Card>
            </div>
          )}

          {activeTab === 'agenda' && (
            <div className="stack-lg">
              <Card title="Tu agenda" subtitle="Importa un archivo .vcf y verifica quién está en WhatsApp">
                <AgendaList />
              </Card>
            </div>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="Principal">
        {NAV.map((n) => (
          <button key={n.id} aria-current={activeTab === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            <Icon name={n.icon} />
            {n.label}
          </button>
        ))}
      </nav>

      <UiHost />
    </div>
  );
}
