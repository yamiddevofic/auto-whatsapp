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
import { fetchStatus, fetchGroups, fetchMessages, fetchStatusUpdates, fetchDirectMessages, fetchPublishedStatuses } from './api.js';

const styles = {
  app: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#1a1a1a',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    borderBottom: '2px solid #25D366',
    paddingBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 24,
    color: '#075E54',
  },
  section: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    margin: '0 0 16px',
    fontSize: 18,
    color: '#075E54',
  },
  tabs: {
    display: 'flex',
    gap: 0,
    marginBottom: 20,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  tabsContainer: {
    '@media (max-width: 768px)': {
      '&::-webkit-scrollbar': {
        display: 'none',
      },
    },
  },
  tab: {
    flex: 1,
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 600,
    border: '1px solid #e0e0e0',
    background: '#f5f5f5',
    color: '#777',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    minWidth: 'max-content',
  },
  tabActive: {
    flex: 1,
    padding: '12px 16px',
    fontSize: 15,
    fontWeight: 600,
    border: '1px solid #25D366',
    borderBottom: '3px solid #25D366',
    background: '#fff',
    color: '#075E54',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    minWidth: 'max-content',
  },
};

export default function App() {
  const [status, setStatus] = useState('disconnected');
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [publishedStatuses, setPublishedStatuses] = useState([]);
  const [qr, setQr] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('messages');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const refreshMessages = useCallback(async () => {
    const msgs = await fetchMessages();
    setMessages(msgs);
  }, []);

  const refreshStatusUpdates = useCallback(async () => {
    const updates = await fetchStatusUpdates();
    setStatusUpdates(updates);
  }, []);

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }

    // Listen for auth-expired event
    const handleAuthExpired = () => {
      setIsAuthenticated(false);
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);



  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial fetch
    refreshMessages();
    refreshStatusUpdates();
    fetchDirectMessages().then(setDirectMessages);
    fetchPublishedStatuses().then(setPublishedStatuses);

    // Fetch initial status from server
    fetchStatus().then((statusData) => {
      if (statusData && statusData.status) {
        setStatus(statusData.status);
      }
    });

    // WebSocket connection
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin);

    // Listen for WhatsApp status updates
    socket.on('whatsapp:status', ({ status: s }) => {
      setStatus(s);
      // Clear QR when successfully connected
      if (s === 'connected') {
        setQr(null);
      }
      if (s === 'connected' && groups.length === 0) {
        fetchGroups().then(setGroups);
      }
    });

    // Listen for QR code updates
    socket.on('whatsapp:qr', (qrDataUrl) => {
      setQr(qrDataUrl);
    });

    // Listen for QR close event
    const handleCloseQR = () => {
      setQr(null);
    };
    window.addEventListener('close-qr', handleCloseQR);

    // Listen for messages updates
    socket.on('messages:updated', (messages) => {
      setMessages(messages);
    });

    // Listen for status updates
    socket.on('status-updates:updated', (updates) => {
      setStatusUpdates(updates);
    });

    // Listen for direct messages updates
    socket.on('direct-messages:updated', (directMsgs) => {
      setDirectMessages(directMsgs);
    });

    // Listen for published statuses updates
    socket.on('published-statuses:updated', (publishedStatuses) => {
      setPublishedStatuses(publishedStatuses);
    });

    return () => {
      socket.disconnect();
      window.removeEventListener('close-qr', handleCloseQR);
    };
  }, [refreshMessages, refreshStatusUpdates, isAuthenticated]);

  return (
    <>
      {!isAuthenticated ? (
        <Login onLoginSuccess={() => setIsAuthenticated(true)} />
      ) : (
        <div style={{
          ...styles.app,
          padding: isMobile ? '10px' : '20px',
        }}>
          <div style={{
            ...styles.header,
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            gap: isMobile ? '8px' : '12px',
            paddingBottom: isMobile ? '8px' : '12',
          }}>
            <h1 style={{
              ...styles.title,
              fontSize: isMobile ? '18px' : '24px',
            }}>Auto WhatsApp</h1>
            <ConnectionStatus status={status} qr={qr} />
            <button
              style={{
                marginLeft: 'auto',
                padding: isMobile ? '6px 12px' : '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: isMobile ? '12px' : '14px',
              }}
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                setIsAuthenticated(false);
              }}
            >
              Cerrar sesión
            </button>
          </div>

      <div style={{
        ...styles.tabs,
        padding: isMobile ? '0 10px' : '0',
      }}>
        <button
          style={activeTab === 'messages' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('messages')}
        >
          Mensajes a grupos
        </button>
        <button
          style={activeTab === 'status' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('status')}
        >
          Estados de WhatsApp
        </button>
        <button
          style={activeTab === 'contacts' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('contacts')}
        >
          Contactos de grupos
        </button>
        <button
          style={activeTab === 'quick' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('quick')}
        >
          Mensaje rapido
        </button>
        <button
          style={activeTab === 'agenda' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('agenda')}
        >
          Contactos de agenda
        </button>
        <button
          style={activeTab === 'published' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('published')}
        >
          Estados publicados
        </button>
      </div>

      {activeTab === 'messages' && (
        <>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Programar mensaje</h2>
            <GroupList
              groups={groups}
              selected={selectedGroup}
              onSelect={setSelectedGroup}
            />
            {selectedGroup && (
              <MessageForm
                group={selectedGroup}
                onCreated={refreshMessages}
              />
            )}
          </div>

          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Mensajes programados</h2>
            <MessageList messages={messages} onRefresh={refreshMessages} />
          </div>
        </>
      )}

      {activeTab === 'status' && (
        <>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Programar estado</h2>
            <StatusForm onCreated={refreshStatusUpdates} />
          </div>

          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Estados programados</h2>
            <StatusList statusUpdates={statusUpdates} onRefresh={refreshStatusUpdates} />
          </div>
        </>
      )}

      {activeTab === 'contacts' && (
        <>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Contactos de grupos</h2>
            <ContactList />
          </div>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Mensajes directos programados</h2>
            <DirectMessageList />
          </div>
        </>
      )}

      {activeTab === 'quick' && (
        <>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Enviar mensaje a numeros</h2>
            <QuickMessageForm />
          </div>

          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Mensajes directos programados</h2>
            <DirectMessageList />
          </div>
        </>
      )}

      {activeTab === 'agenda' && (
        <>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Contactos de agenda</h2>
            <AgendaList />
          </div>
          <div style={{
            ...styles.section,
            padding: isMobile ? '12px' : '20px',
          }}>
            <h2 style={{
              ...styles.sectionTitle,
              fontSize: isMobile ? '16px' : '18px',
            }}>Mensajes directos programados</h2>
            <DirectMessageList />
          </div>
        </>
      )}

      {activeTab === 'published' && (
        <div style={{
          ...styles.section,
          padding: isMobile ? '12px' : '20px',
        }}>
          <h2 style={{
            ...styles.sectionTitle,
            fontSize: isMobile ? '16px' : '18px',
          }}>Estados publicados</h2>
          <PublishedStatusList
            statuses={publishedStatuses}
            onDelete={() => fetchPublishedStatuses().then(setPublishedStatuses)}
          />
        </div>
      )}
        </div>
      )}
    </>
  );
}
