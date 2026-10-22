# 04 — Calidad, arquitectura y fiabilidad

Deuda técnica que no es estrictamente de seguridad, pero que afecta la mantenibilidad y la
fiabilidad del sistema. Numerada como `ARQ-xxx` para no confundirla con los hallazgos de
seguridad.

| ID | Impacto | Título |
|---|:---:|---|
| [ARQ-001](#arq-001--sqljs-reescribe-la-base-de-datos-completa-en-cada-escritura) | 🔴 Alto | `sql.js` reescribe la base de datos completa en cada escritura |
| [ARQ-002](#arq-002--dependencia-circular-entre-indexjs-y-los-módulos-de-dominio) | 🟠 Medio | Dependencia circular entre `index.js` y los módulos de dominio |
| [ARQ-003](#arq-003--listener-de-messagesupsert-registrado-dos-veces) | 🟠 Medio | Listener de `messages.upsert` registrado dos veces |
| [ARQ-004](#arq-004--paginación-y-búsqueda-en-memoria) | 🟠 Medio | Paginación y búsqueda en memoria |
| [ARQ-005](#arq-005--sin-manejador-de-errores-de-express) | 🟠 Medio | Sin manejador de errores de Express |
| [ARQ-006](#arq-006--duplicación-masiva-en-el-cliente-api) | 🟡 Bajo | Duplicación masiva en el cliente de API |
| [ARQ-007](#arq-007--observabilidad-nula) | 🟡 Bajo | Observabilidad nula |
| [ARQ-008](#arq-008--el-límite-diario-crece-con-los-días-registrados-no-con-la-antigüedad) | 🟡 Bajo | El límite diario crece con los días registrados, no con la antigüedad |
| [ARQ-009](#arq-009--envío-secuencial-bloqueante-en-endpoints-http) | 🟡 Bajo | Envío secuencial bloqueante en endpoints HTTP |
| [ARQ-010](#arq-010--supervisión-mediante-tmux-y-while-true) | 🟡 Bajo | Supervisión mediante `tmux` y `while true` |
| [ARQ-011](#arq-011--sin-linter-formateador-ni-verificación-de-tipos) | 🟡 Bajo | Sin linter, formateador ni verificación de tipos |

---

## ARQ-001 — `sql.js` reescribe la base de datos completa en cada escritura

**Ubicación:** [`server/src/db.js:60-63`](../server/src/db.js#L60)

```js
function save() {
  const data = _raw.export();                      // serializa TODA la base de datos
  fs.writeFileSync(config.dbPath, Buffer.from(data));   // y la vuelca entera, síncrono
}
```

`save()` se invoca en **cada** `run()` ([`db.js:55`](../server/src/db.js#L55)) y en cada
`exec()`. Con 5.000 contactos importados, cada `INSERT` individual serializa y escribe la base
completa.

**Consecuencias**

- Coste O(n) por operación: importar un VCF de 3.000 contactos hace 3.000 volcados completos.
  La transacción de [`contacts.js:41-47`](../server/src/contacts.js#L41) mitiga esto mediante
  el flag `_inTransaction`, pero es un parche frágil: si una excepción escapa entre
  `_inTransaction = true` y el `finally`, la bandera queda encendida y **ningún dato vuelve a
  persistirse** hasta reiniciar.
- `writeFileSync` bloquea el bucle de eventos: durante el volcado el servidor no atiende nada.
- **Riesgo de pérdida total**: si el proceso muere a mitad del `writeFileSync` (SIGKILL, disco
  lleno, corte de energía), `data.db` queda truncado. No hay escritura atómica ni backup.
- El `PRAGMA journal_mode = WAL` de [`db.js:108`](../server/src/db.js#L108) no hace nada:
  `sql.js` opera en memoria y no genera archivos WAL. El `.gitignore` lista `data.db-shm` y
  `data.db-wal`, archivos que nunca existirán.

**Solución** — migrar a `better-sqlite3` (código en
[Fase 3.1 del plan](03-plan-de-remediacion.md#31-migrar-de-sqljs-a-better-sqlite3)). La API
coincide casi exactamente con la fachada que ya existe, así que los 40+ puntos de llamada no
cambian. Si por alguna razón hay que mantener `sql.js`, al menos hacer el volcado atómico:

```js
function save() {
  const tmp = `${config.dbPath}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(_raw.export()));
  fs.renameSync(tmp, config.dbPath);      // rename es atómico en el mismo sistema de archivos
}
```

---

## ARQ-002 — Dependencia circular entre `index.js` y los módulos de dominio

**Ubicación:** `whatsapp.js:13`, `scheduler.js:5`, y los 5 routers que hacen
`import { io } from '../index.js'`.

```
index.js ──importa──► whatsapp.js ──importa──► index.js
        └─importa──► scheduler.js ─importa──► index.js
        └─importa──► routes/*.js  ─importa──► index.js
```

Funciona hoy porque ESM resuelve los ciclos con *bindings* diferidos y `io` se usa sólo dentro
de funciones (nunca en el cuerpo del módulo). Pero es frágil: cualquier uso de `io` en tiempo
de carga daría `undefined`, y hace **imposible probar los módulos de forma aislada** —
importar `db.js` en un test arrastra `index.js`, que abre un servidor HTTP y conecta con
WhatsApp.

**Solución** — extraer el emisor a su propio módulo
([Fase 3.2](03-plan-de-remediacion.md#32-romper-la-dependencia-circular)):

```js
// server/src/realtime.js
let io = null;
export const setIO = (instance) => { io = instance; };
export const emit  = (evento, datos) => io?.emit(evento, datos);
```

---

## ARQ-003 — Listener de `messages.upsert` registrado dos veces

**Ubicación:** [`whatsapp.js:49-59`](../server/src/whatsapp.js#L49) y
[`whatsapp.js:106-116`](../server/src/whatsapp.js#L106)

Los dos manejadores hacen **exactamente lo mismo** (extraer `pushName` y llamar a
`savePushName`). Cada mensaje entrante ejecuta dos veces la misma escritura en base de datos —
y con `sql.js`, dos volcados completos del archivo (ARQ-001).

El primero (línea 49) tiene además un comentario que anuncia una captura de errores de sesión
que no implementa: el `for` no está dentro de ningún `try`.

**Solución** — eliminar el bloque de las líneas 49-59, que es puramente redundante.

---

## ARQ-004 — Paginación y búsqueda en memoria

**Ubicación:** [`routes/contacts.js:12-27`](../server/src/routes/contacts.js#L12) y
[`routes/agenda.js:24-40`](../server/src/routes/agenda.js#L24)

```js
let contacts = getAllContacts();                    // carga TODAS las filas
if (search) contacts = contacts.filter(…);          // filtra en JavaScript
const items = contacts.slice(offset, offset + limit);   // pagina en JavaScript
```

Para devolver 50 filas se cargan todas, se construye el `LEFT JOIN` doble de
[`contacts.js:74-82`](../server/src/contacts.js#L74) sobre el conjunto completo, se filtra en
memoria y se descarta el 99 %. Con una agenda de 5.000 contactos, cada pulsación de tecla en el
buscador procesa 5.000 objetos.

**Solución** — mover filtrado y paginación a SQL:

```js
export function findContacts({ search = '', limit = 50, offset = 0 }) {
  const like = `%${search.toLowerCase()}%`;
  const where = search
    ? `WHERE lower(c.notify) LIKE ? OR lower(c.name) LIKE ? OR lower(c.jid) LIKE ?`
    : '';
  const params = search ? [like, like, like] : [];

  const total = db.prepare(`SELECT COUNT(*) AS n FROM contacts c ${where}`).get(...params).n;
  const items = db.prepare(`
    SELECT c.*, COALESCE(a1.name, a2.name) AS agenda_name
    FROM contacts c
    LEFT JOIN agenda_contacts a1 ON a1.jid = c.jid
    LEFT JOIN agenda_contacts a2 ON ('+' || REPLACE(c.jid,'@s.whatsapp.net','')) = a2.phone
    ${where}
    ORDER BY COALESCE(c.notify, c.name, a1.name, a2.name, c.jid)
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { items, total };
}
```

Y añadir índices:

```sql
CREATE INDEX IF NOT EXISTS idx_contacts_notify        ON contacts(notify);
CREATE INDEX IF NOT EXISTS idx_agenda_jid             ON agenda_contacts(jid);
CREATE INDEX IF NOT EXISTS idx_agenda_checked         ON agenda_contacts(checked_at);
CREATE INDEX IF NOT EXISTS idx_messages_status        ON messages(status);
CREATE INDEX IF NOT EXISTS idx_status_updates_status  ON status_updates(status);
CREATE INDEX IF NOT EXISTS idx_direct_messages_status ON direct_messages(status);
```

---

## ARQ-005 — Sin manejador de errores de Express

No existe ningún middleware de 4 argumentos `(err, req, res, next)`. Consecuencias visibles
hoy para el usuario:

- Un archivo mayor de 50 MB o de tipo no permitido hace que `multer` llame a `cb(new Error(…))`,
  y Express responde con **su página HTML de error por defecto**, no con JSON. El cliente hace
  `res.json()` sobre HTML y falla con un error de *parsing* incomprensible.
- Cualquier excepción lanzada fuera de un `try` en una ruta asíncrona ni siquiera llega a
  Express (Express 4 no captura rechazos de promesas), y termina en el
  `unhandledRejection` global.

**Solución** — el `errorHandler` de
[SEC-012](02-hallazgos-seguridad.md#sec-012--filtración-de-errores-internos-al-cliente),
registrado como último middleware, más un envoltorio para rutas asíncronas:

```js
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.post('/api/direct-messages/send-now', asyncRoute(async (req, res) => { … }));
```

---

## ARQ-006 — Duplicación masiva en el cliente de API

**Ubicación:** [`client/src/api.js`](../client/src/api.js) — 334 líneas

El bloque de gestión del token aparece **ocho veces** copiado literalmente:

```js
const token = localStorage.getItem('token');
const res = await fetch(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
if (res.status === 401) {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.dispatchEvent(new Event('auth-expired'));
  return null;
}
```

Existe ya un helper `authFetch` (líneas 13-29) que hace exactamente esto, pero no se usa en las
funciones que envían `FormData` — probablemente porque había que evitar fijar
`Content-Type` manualmente. Es un problema resoluble.

**Solución** — un único `authFetch` que soporte ambos casos:

```js
async function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  // No fijar Content-Type con FormData: el navegador añade el boundary correcto
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.dispatchEvent(new Event('auth-expired'));
    return null;
  }
  return res;
}
```

Reduce el archivo a menos de la mitad y deja un único punto donde cambiar la política de
autenticación.

---

## ARQ-007 — Observabilidad nula

- `pino` está instalado pero configurado en `level: 'silent'`
  ([`whatsapp.js:16`](../server/src/whatsapp.js#L16)): se usa sólo para silenciar los logs de
  Baileys, nunca para registrar los propios.
- Todo el registro real ocurre con `console.log`: sin niveles, sin marca de tiempo, sin
  correlación de peticiones, sin rotación.
- No hay endpoint de salud, ni métricas, ni forma de saber si el proceso está vivo pero
  desconectado de WhatsApp.

**Solución**

```js
// server/src/logger.js — ver también SEC-017 para la redacción de PII
export const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: { … } });
```

```js
// Endpoint de salud con estado real
app.get('/health', (req, res) => {
  const { status } = getStatus();
  res.status(status === 'connected' ? 200 : 503).json({
    ok: status === 'connected',
    whatsapp: status,
    uptime: Math.round(process.uptime()),
    pendientes: getPendingMessages().length,
  });
});
```

Con eso, `systemd`, Docker o un monitor externo pueden detectar que WhatsApp se desconectó
aunque el proceso siga respondiendo.

---

## ARQ-008 — El límite diario crece con los días registrados, no con la antigüedad

**Ubicación:** [`db.js:353-361`](../server/src/db.js#L353)

```js
export function getDailyLimit() {
  const daysActive = db.prepare('SELECT COUNT(*) as count FROM message_stats').get().count;
  if (daysActive === 0) return 200;
  return Math.min(200 + (daysActive * 50), 500);
}
```

`daysActive` cuenta **filas en `message_stats`**, es decir días en los que se envió al menos un
mensaje. Efectos:

- Una cuenta que envía un día al mes tarda 6 meses en llegar al límite máximo, aunque tenga
  años de antigüedad.
- El primer día ya existe una fila (creada por el primer `incrementMessageCount()`), así que
  `daysActive` vale 1 y el límite es 250, no los 200 que sugiere la rama `=== 0` — que en la
  práctica es **código muerto**.
- La variable `stats` de la línea 354 se calcula y no se usa.

**Solución** — basar el límite en la antigüedad real de la cuenta:

```js
export function getDailyLimit() {
  const primera = db.prepare('SELECT MIN(date) AS d FROM message_stats').get().d;
  if (!primera) return 200;
  const dias = Math.floor((Date.now() - new Date(primera).getTime()) / 86_400_000);
  return Math.min(200 + dias * 50, 500);
}
```

---

## ARQ-009 — Envío secuencial bloqueante en endpoints HTTP

**Ubicación:** [`routes/direct-messages.js:37-53`](../server/src/routes/direct-messages.js#L37)
y [`routes/agenda.js:96-118`](../server/src/routes/agenda.js#L96)

Ambos endpoints recorren la lista completa con `await` dentro del manejador HTTP. Con 50
contactos, `/api/agenda/check` mantiene la petición abierta durante todo el proceso; los
proxies y navegadores la cortan por timeout mucho antes, y el cliente no sabe si el trabajo
terminó o no.

**Solución** — responder `202 Accepted` inmediatamente y notificar el progreso por el
WebSocket que ya existe:

```js
router.post('/api/agenda/check', (req, res) => {
  const trabajo = crypto.randomUUID();
  res.status(202).json({ jobId: trabajo, message: 'Verificación iniciada' });

  (async () => {
    for (const [i, contacto] of unchecked.entries()) {
      … 
      emit('agenda:progreso', { jobId: trabajo, hechos: i + 1, total: unchecked.length });
    }
    emit('agenda:completado', { jobId: trabajo, encontrados });
  })().catch((err) => logger.error({ err }, 'Verificación de agenda fallida'));
});
```

---

## ARQ-010 — Supervisión mediante `tmux` y `while true`

**Ubicación:** [`start.sh`](../start.sh)

```bash
tmux new-session -d -s "$SESSION" "while true; do NODE_ENV=production node server/src/index.js; sleep 5; done"
```

Limitaciones: no arranca al reiniciar la máquina, no hay límite de reintentos (un fallo de
configuración produce un bucle infinito de reinicios cada 5 s), los logs viven sólo en el
buffer de tmux, y el proceso hereda todos los privilegios del usuario.

**Solución** — la unidad systemd de la
[Fase 3.5](03-plan-de-remediacion.md#35-supervisión-con-systemd), que además aporta aislamiento
(`ProtectSystem=strict`, `ReadWritePaths`) y logs en journald.

---

## ARQ-011 — Sin linter, formateador ni verificación de tipos

No hay `.eslintrc`, `.prettierrc`, `jsconfig.json` ni `tsconfig.json`. En un proyecto de ~5.900
líneas sin pruebas, esto significa que errores triviales (variables no usadas como `stats` en
[`db.js:354`](../server/src/db.js#L354), condiciones redundantes como `loggedOut` /
`shouldReconnect` en [`whatsapp.js:185-186`](../server/src/whatsapp.js#L185) —que son la
negación exacta la una de la otra—, o promesas sin `await`) sólo se descubren en producción.

**Solución mínima**

```bash
cd server && npm i -D eslint @eslint/js
```

```js
// eslint.config.js
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'require-atomic-updates': 'error',
      'no-floating-promises': 'off',   // requiere typescript-eslint para funcionar de verdad
    },
  },
];
```

Un paso más allá, sin migrar a TypeScript: añadir `// @ts-check` y JSDoc en los módulos de
dominio (`db.js`, `whatsapp.js`, `scheduler.js`) da comprobación de tipos en el editor con
coste casi nulo.

---

## Orden recomendado

1. **ARQ-003** (eliminar el listener duplicado) — 5 minutos, sin riesgo.
2. **ARQ-001** (migrar a `better-sqlite3`) — el mayor retorno en fiabilidad.
3. **ARQ-005** + **ARQ-002** — habilitan las pruebas automatizadas.
4. **ARQ-011** + pruebas — red de seguridad para todo lo demás.
5. **ARQ-004**, **ARQ-006**, **ARQ-008**, **ARQ-009** — mejoras incrementales.
6. **ARQ-007**, **ARQ-010** — operación.
