const BASE = '';

// Helper function to add auth token to requests
function getHeaders(headers = {}) {
  const token = localStorage.getItem('token');
  return {
    ...headers,
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
}

// Helper function for authenticated fetch
async function authFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: getHeaders(options.headers),
  });

  if (response.status === 401) {
    // Token expired or invalid, clear and redirect
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }

  return response;
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function fetchStatus() {
  const res = await authFetch(`${BASE}/api/status`);
  if (!res) return null;
  return res.json();
}

export async function fetchQR() {
  const res = await authFetch(`${BASE}/api/qr`);
  if (!res) return null;
  return res.json();
}

export async function fetchGroups() {
  const res = await authFetch(`${BASE}/api/groups`);
  if (!res) return null;
  return res.json();
}

export async function fetchMessages() {
  const res = await authFetch(`${BASE}/api/messages`);
  if (!res) return null;
  return res.json();
}

export async function createMessage(formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }
  return res.json();
}

export async function cancelMessage(id) {
  const res = await authFetch(`${BASE}/api/messages/${id}`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

export async function updateMessageApi(id, data) {
  const res = await authFetch(`${BASE}/api/messages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res) return null;
  return res.json();
}

export async function deleteMessageApi(id) {
  const res = await authFetch(`${BASE}/api/messages/${id}/permanent`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

// --- Status updates ---

export async function fetchStatusUpdates() {
  const res = await authFetch(`${BASE}/api/status-updates`);
  if (!res) return null;
  return res.json();
}

export async function createStatusUpdate(formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/status-updates`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }
  return res.json();
}

export async function sendStatusNow(formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/status-updates/send-now`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }
  return res.json();
}

export async function cancelStatusUpdate(id) {
  const res = await authFetch(`${BASE}/api/status-updates/${id}`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

export async function updateStatusUpdateApi(id, data) {
  const res = await authFetch(`${BASE}/api/status-updates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res) return null;
  return res.json();
}

export async function deleteStatusUpdateApi(id) {
  const res = await authFetch(`${BASE}/api/status-updates/${id}/permanent`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

// --- Contacts ---

export async function fetchContacts({ page = 1, limit = 50, search = '' } = {}) {
  const params = new URLSearchParams({ page, limit, search });
  const res = await authFetch(`${BASE}/api/contacts?${params}`);
  if (!res) return null;
  return res.json();
}

export async function syncContacts() {
  const res = await authFetch(`${BASE}/api/contacts/sync`, {
    method: 'POST',
  });
  if (!res) return null;
  return res.json();
}

export async function deleteAllContacts() {
  const res = await authFetch(`${BASE}/api/contacts`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

// --- Unlink ---

export async function unlinkWhatsApp() {
  const res = await authFetch(`${BASE}/api/unlink`, {
    method: 'POST',
  });
  if (!res) return null;
  return res.json();
}

// --- Agenda (phone contacts) ---

export async function fetchAgenda({ page = 1, limit = 50, search = '', filter = 'all' } = {}) {
  const params = new URLSearchParams({ page, limit, search, filter });
  const res = await authFetch(`${BASE}/api/agenda?${params}`);
  if (!res) return null;
  return res.json();
}

export async function fetchAgendaStats() {
  const res = await authFetch(`${BASE}/api/agenda/stats`);
  if (!res) return null;
  return res.json();
}

export async function importAgendaVCF(file) {
  const formData = new FormData();
  formData.append('vcf', file);
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/agenda/import`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }
  return res.json();
}

export async function checkAgendaWhatsApp(countryCode = '') {
  const res = await authFetch(`${BASE}/api/agenda/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode }),
  });
  if (!res) return null;
  return res.json();
}

// --- Direct messages (to contacts) ---

export async function fetchDirectMessages() {
  const res = await authFetch(`${BASE}/api/direct-messages`);
  if (!res) return null;
  return res.json();
}

export async function createDirectMessage(formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/direct-messages`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }
  return res.json();
}

export async function cancelDirectMessage(id) {
  const res = await authFetch(`${BASE}/api/direct-messages/${id}`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

export async function sendDirectMessageNow(formData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/direct-messages/send-now`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    return null;
  }
  return res.json();
}

export async function deleteDirectMessageApi(id) {
  const res = await authFetch(`${BASE}/api/direct-messages/${id}/permanent`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}

export async function resetAgendaChecks() {
  const res = await authFetch(`${BASE}/api/agenda/reset-checks`, {
    method: 'POST',
  });
  if (!res) return null;
  return res.json();
}

export async function deleteAgenda() {
  const res = await authFetch(`${BASE}/api/agenda`, {
    method: 'DELETE',
  });
  if (!res) return null;
  return res.json();
}
