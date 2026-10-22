const BASE = '';

const TOKEN_KEY = 'token';
const USER_KEY = 'username';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** Comprueba la expiración del JWT en el cliente para no mostrar una sesión muerta. */
export function isTokenValid(token = getToken()) {
  if (!token) return false;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return typeof exp === 'number' && exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('auth-expired'));
}

/**
 * Único punto de autenticación del cliente. Soporta JSON y FormData: con FormData no se
 * fija Content-Type para que el navegador añada el boundary correcto.
 * Antes este bloque estaba copiado ocho veces. Ver Docs/04-calidad-arquitectura.md ARQ-006.
 */
async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) headers.Authorization = `Bearer ${token}`;

  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    return null;
  }

  return res;
}

/** Ejecuta la petición y devuelve el JSON, o null si la sesión expiró. */
async function request(url, options) {
  const res = await authFetch(url, options);
  if (!res) return null;
  // Una respuesta que no es JSON (p. ej. la página 404 de un servidor desactualizado)
  // se convierte en un error legible en vez de "Unexpected token '<'".
  try {
    return await res.json();
  } catch {
    return {
      error: res.status === 404
        ? 'El servidor no reconoce esta función: reinícialo para aplicar la última versión.'
        : `Respuesta inesperada del servidor (${res.status})`,
    };
  }
}

const json = (body) => ({ body: JSON.stringify(body) });

// --- Sesión ---

export async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function logout() {
  try {
    await authFetch(`${BASE}/api/auth/logout`, { method: 'POST' });
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

// --- Estado de la conexión ---

export const fetchStatus = () => request(`${BASE}/api/status`);
export const fetchQR = () => request(`${BASE}/api/qr`);
export const fetchGroups = () => request(`${BASE}/api/groups`);
// Las operaciones destructivas exigen la contraseña actual (SEC-025)
export const unlinkWhatsApp = (password) =>
  request(`${BASE}/api/unlink`, { method: 'POST', ...json({ password }) });

// --- Mensajes a grupos ---

export const fetchMessages = () => request(`${BASE}/api/messages`);
export const createMessage = (formData) =>
  request(`${BASE}/api/messages`, { method: 'POST', body: formData });
export const cancelMessage = (id) =>
  request(`${BASE}/api/messages/${id}`, { method: 'DELETE' });
export const updateMessageApi = (id, data) =>
  request(`${BASE}/api/messages/${id}`, { method: 'PUT', ...json(data) });
export const deleteMessageApi = (id) =>
  request(`${BASE}/api/messages/${id}/permanent`, { method: 'DELETE' });

// --- Estados ---

export const fetchStatusUpdates = () => request(`${BASE}/api/status-updates`);
export const createStatusUpdate = (formData) =>
  request(`${BASE}/api/status-updates`, { method: 'POST', body: formData });
export const sendStatusNow = (formData) =>
  request(`${BASE}/api/status-updates/send-now`, { method: 'POST', body: formData });
export const cancelStatusUpdate = (id) =>
  request(`${BASE}/api/status-updates/${id}`, { method: 'DELETE' });
export const updateStatusUpdateApi = (id, data) =>
  request(`${BASE}/api/status-updates/${id}`, { method: 'PUT', ...json(data) });
export const deleteStatusUpdateApi = (id) =>
  request(`${BASE}/api/status-updates/${id}/permanent`, { method: 'DELETE' });

// --- Contactos de grupos ---

export const fetchContacts = ({ page = 1, limit = 50, search = '' } = {}) =>
  request(`${BASE}/api/contacts?${new URLSearchParams({ page, limit, search })}`);
export const syncContacts = () => request(`${BASE}/api/contacts/sync`, { method: 'POST' });
export const deleteAllContacts = (password) =>
  request(`${BASE}/api/contacts`, { method: 'DELETE', ...json({ password }) });

// --- Agenda ---

export const fetchAgenda = ({ page = 1, limit = 50, search = '', filter = 'all' } = {}) =>
  request(`${BASE}/api/agenda?${new URLSearchParams({ page, limit, search, filter })}`);
export const fetchAgendaStats = () => request(`${BASE}/api/agenda/stats`);
export const resetAgendaChecks = (password) =>
  request(`${BASE}/api/agenda/reset-checks`, { method: 'POST', ...json({ password }) });
export const deleteAgenda = (password) =>
  request(`${BASE}/api/agenda`, { method: 'DELETE', ...json({ password }) });
export const checkAgendaWhatsApp = (countryCode = '') =>
  request(`${BASE}/api/agenda/check`, { method: 'POST', ...json({ countryCode }) });

export function importAgendaVCF(file) {
  const formData = new FormData();
  formData.append('vcf', file);
  return request(`${BASE}/api/agenda/import`, { method: 'POST', body: formData });
}

// --- Mensajes directos ---

export const fetchDirectMessages = () => request(`${BASE}/api/direct-messages`);
export const createDirectMessage = (formData) =>
  request(`${BASE}/api/direct-messages`, { method: 'POST', body: formData });
export const sendDirectMessageNow = (formData) =>
  request(`${BASE}/api/direct-messages/send-now`, { method: 'POST', body: formData });
export const cancelDirectMessage = (id) =>
  request(`${BASE}/api/direct-messages/${id}`, { method: 'DELETE' });
export const deleteDirectMessageApi = (id) =>
  request(`${BASE}/api/direct-messages/${id}/permanent`, { method: 'DELETE' });

// --- Estados publicados ---

export async function fetchPublishedStatuses() {
  const res = await authFetch(`${BASE}/api/published-statuses`);
  if (!res) return [];
  return res.json();
}

export const deletePublishedStatusApi = (id) =>
  request(`${BASE}/api/published-statuses/${id}`, { method: 'DELETE' });

// --- Vista previa de enlaces ---

export const fetchLinkPreview = (url) =>
  request(`${BASE}/api/link-preview?${new URLSearchParams({ url })}`);

/** Descarga (vía el servidor) la imagen de un enlace y la devuelve como File listo para subir. */
export async function fetchLinkImage(url) {
  const res = await authFetch(`${BASE}/api/link-preview/image?${new URLSearchParams({ url })}`);
  if (!res) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo descargar la imagen');
  }
  const blob = await res.blob();
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[blob.type] || 'jpg';
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '-').slice(0, 40);
  return new File([blob], `${base || 'imagen-enlace'}.${ext}`, { type: blob.type });
}

// --- Audiencia de estados ---

export const fetchStatusAudience = (groupIds = []) =>
  request(`${BASE}/api/status-audience?${new URLSearchParams(groupIds.length ? { groupIds: groupIds.join(',') } : {})}`);
