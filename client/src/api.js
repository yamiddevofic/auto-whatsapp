const BASE = '';

export async function fetchStatus() {
  const res = await fetch(`${BASE}/api/status`);
  return res.json();
}

export async function fetchQR() {
  const res = await fetch(`${BASE}/api/qr`);
  return res.json();
}

export async function fetchGroups() {
  const res = await fetch(`${BASE}/api/groups`);
  return res.json();
}

export async function fetchMessages() {
  const res = await fetch(`${BASE}/api/messages`);
  return res.json();
}

export async function createMessage(formData) {
  const res = await fetch(`${BASE}/api/messages`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function cancelMessage(id) {
  const res = await fetch(`${BASE}/api/messages/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function updateMessageApi(id, data) {
  const res = await fetch(`${BASE}/api/messages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMessageApi(id) {
  const res = await fetch(`${BASE}/api/messages/${id}/permanent`, {
    method: 'DELETE',
  });
  return res.json();
}

// --- Status updates ---

export async function fetchStatusUpdates() {
  const res = await fetch(`${BASE}/api/status-updates`);
  return res.json();
}

export async function createStatusUpdate(formData) {
  const res = await fetch(`${BASE}/api/status-updates`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function sendStatusNow(formData) {
  const res = await fetch(`${BASE}/api/status-updates/send-now`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function cancelStatusUpdate(id) {
  const res = await fetch(`${BASE}/api/status-updates/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function updateStatusUpdateApi(id, data) {
  const res = await fetch(`${BASE}/api/status-updates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteStatusUpdateApi(id) {
  const res = await fetch(`${BASE}/api/status-updates/${id}/permanent`, {
    method: 'DELETE',
  });
  return res.json();
}

// --- Contacts ---

export async function fetchContacts({ page = 1, limit = 50, search = '' } = {}) {
  const params = new URLSearchParams({ page, limit, search });
  const res = await fetch(`${BASE}/api/contacts?${params}`);
  return res.json();
}

export async function syncContacts() {
  const res = await fetch(`${BASE}/api/contacts/sync`, {
    method: 'POST',
  });
  return res.json();
}

export async function deleteAllContacts() {
  const res = await fetch(`${BASE}/api/contacts`, {
    method: 'DELETE',
  });
  return res.json();
}

// --- Unlink ---

export async function unlinkWhatsApp() {
  const res = await fetch(`${BASE}/api/unlink`, {
    method: 'POST',
  });
  return res.json();
}

// --- Agenda (phone contacts) ---

export async function fetchAgenda({ page = 1, limit = 50, search = '', filter = 'all' } = {}) {
  const params = new URLSearchParams({ page, limit, search, filter });
  const res = await fetch(`${BASE}/api/agenda?${params}`);
  return res.json();
}

export async function fetchAgendaStats() {
  const res = await fetch(`${BASE}/api/agenda/stats`);
  return res.json();
}

export async function importAgendaVCF(file) {
  const formData = new FormData();
  formData.append('vcf', file);
  const res = await fetch(`${BASE}/api/agenda/import`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function checkAgendaWhatsApp(countryCode = '') {
  const res = await fetch(`${BASE}/api/agenda/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode }),
  });
  return res.json();
}

// --- Direct messages (to contacts) ---

export async function fetchDirectMessages() {
  const res = await fetch(`${BASE}/api/direct-messages`);
  return res.json();
}

export async function createDirectMessage(formData) {
  const res = await fetch(`${BASE}/api/direct-messages`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function cancelDirectMessage(id) {
  const res = await fetch(`${BASE}/api/direct-messages/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function deleteDirectMessageApi(id) {
  const res = await fetch(`${BASE}/api/direct-messages/${id}/permanent`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function resetAgendaChecks() {
  const res = await fetch(`${BASE}/api/agenda/reset-checks`, {
    method: 'POST',
  });
  return res.json();
}

export async function deleteAgenda() {
  const res = await fetch(`${BASE}/api/agenda`, {
    method: 'DELETE',
  });
  return res.json();
}
