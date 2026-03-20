import React, { useState, useEffect, useCallback } from 'react';
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
import { fetchStatus, fetchGroups, fetchMessages, fetchStatusUpdates } from './api.js';

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
  },
};

export default function App() {
  const [status, setStatus] = useState('disconnected');
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('messages');

  const refreshMessages = useCallback(async () => {
    const msgs = await fetchMessages();
    setMessages(msgs);
  }, []);

  const refreshStatusUpdates = useCallback(async () => {
    const updates = await fetchStatusUpdates();
    setStatusUpdates(updates);
  }, []);



  useEffect(() => {
    const poll = setInterval(async () => {
      const { status: s } = await fetchStatus();
      setStatus(s);
      if (s === 'connected' && groups.length === 0) {
        const g = await fetchGroups();
        setGroups(g);
      }
    }, 3000);

    refreshMessages();
    refreshStatusUpdates();
    const msgPoll = setInterval(refreshMessages, 10000);
    const statusPoll = setInterval(refreshStatusUpdates, 10000);

    return () => {
      clearInterval(poll);
      clearInterval(msgPoll);
      clearInterval(statusPoll);
    };
  }, [groups.length, refreshMessages, refreshStatusUpdates]);

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <h1 style={styles.title}>Auto WhatsApp</h1>
        <ConnectionStatus status={status} />
      </div>

      <div style={styles.tabs}>
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
      </div>

      {activeTab === 'messages' && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Programar mensaje</h2>
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

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Mensajes programados</h2>
            <MessageList messages={messages} onRefresh={refreshMessages} />
          </div>
        </>
      )}

      {activeTab === 'status' && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Programar estado</h2>
            <StatusForm onCreated={refreshStatusUpdates} />
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Estados programados</h2>
            <StatusList statusUpdates={statusUpdates} onRefresh={refreshStatusUpdates} />
          </div>
        </>
      )}

      {activeTab === 'contacts' && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Contactos de grupos</h2>
            <ContactList />
          </div>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Mensajes directos programados</h2>
            <DirectMessageList />
          </div>
        </>
      )}

      {activeTab === 'quick' && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Enviar mensaje a numeros</h2>
            <QuickMessageForm />
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Mensajes directos programados</h2>
            <DirectMessageList />
          </div>
        </>
      )}

      {activeTab === 'agenda' && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Contactos de agenda</h2>
            <AgendaList />
          </div>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Mensajes directos programados</h2>
            <DirectMessageList />
          </div>
        </>
      )}
    </div>
  );
}
