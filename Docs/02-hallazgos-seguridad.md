# 02 — Hallazgos de seguridad

Catálogo completo de vulnerabilidades detectadas. Cada hallazgo incluye evidencia con
referencia a archivo y línea, impacto realista y la corrección concreta.

**Criterio de severidad**

| Nivel | Significado |
|---|---|
| 🔴 Crítica | Explotable de forma remota y anónima; compromete la cuenta de WhatsApp o el sistema completo |
| 🟠 Alta | Compromete datos personales o permite abuso significativo del servicio |
| 🟡 Media | Requiere condiciones previas o produce daño acotado |
| 🔵 Baja | Higiene de seguridad, defensa en profundidad |

## Índice de hallazgos

| ID | Severidad | Título |
|---|:---:|---|
| [SEC-001](#sec-001--secreto-de-firma-jwt-hardcodeado-y-público) | 🔴 Crítica | Secreto de firma JWT hardcodeado y público |
| [SEC-002](#sec-002--credenciales-reales-versionadas-en-el-repositorio) | 🔴 Crítica | Credenciales reales versionadas en el repositorio |
| [SEC-003](#sec-003--websocket-sin-autenticación-que-emite-el-qr-de-vinculación) | 🔴 Crítica | WebSocket sin autenticación que emite el QR de vinculación |
| [SEC-004](#sec-004--tráfico-en-http-plano-en-producción) | 🔴 Crítica | Tráfico en HTTP plano en producción |
| [SEC-005](#sec-005--subida-de-archivos-sin-autenticación) | 🟠 Alta | Subida de archivos sin autenticación |
| [SEC-006](#sec-006--directorio-uploads-público-con-nombres-predecibles) | 🟠 Alta | Directorio `/uploads` público con nombres predecibles |
| [SEC-007](#sec-007--login-sin-rate-limiting-ni-hash-de-contraseña) | 🟠 Alta | Login sin rate limiting ni hash de contraseña |
| [SEC-008](#sec-008--dependencias-con-vulnerabilidades-conocidas) | 🟠 Alta | Dependencias con vulnerabilidades conocidas |
| [SEC-009](#sec-009--cors-completamente-abierto) | 🟠 Alta | CORS completamente abierto |
| [SEC-010](#sec-010--ausencia-de-cabeceras-de-seguridad--token-en-localstorage) | 🟠 Alta | Ausencia de cabeceras de seguridad + token en `localStorage` |
| [SEC-011](#sec-011--uncaughtexception-que-no-termina-el-proceso) | 🟡 Media | `uncaughtException` que no termina el proceso |
| [SEC-012](#sec-012--filtración-de-errores-internos-al-cliente) | 🟡 Media | Filtración de errores internos al cliente |
| [SEC-013](#sec-013--ausencia-total-de-validación-de-entrada) | 🟡 Media | Ausencia total de validación de entrada |
| [SEC-014](#sec-014--sin-límite-de-destinatarios-abuso-de-envío-masivo) | 🟡 Media | Sin límite de destinatarios: abuso de envío masivo |
| [SEC-015](#sec-015--secretos-en-reposo-sin-protección) | 🟡 Media | Secretos en reposo sin protección |
| [SEC-016](#sec-016--imagen-docker-con-env-incluido-y-ejecución-como-root) | 🟡 Media | Imagen Docker con `.env` incluido y ejecución como root |
| [SEC-017](#sec-017--datos-personales-en-los-logs) | 🟡 Media | Datos personales en los logs |
| [SEC-018](#sec-018--validación-de-archivos-sólo-por-extensión) | 🟡 Media | Validación de archivos sólo por extensión |
| [SEC-019](#sec-019--sin-control-de-autorización-por-recurso) | 🟡 Media | Sin control de autorización por recurso |
| [SEC-020](#sec-020--sesiones-sin-revocación-ni-verificación-de-expiración) | 🟡 Media | Sesiones sin revocación ni verificación de expiración |
| [SEC-021](#sec-021--límites-de-cuerpo-excesivos-y-sin-rate-limiting-global) | 🟡 Media | Límites de cuerpo excesivos y sin rate limiting global |
| [SEC-022](#sec-022--colisión-de-nombres-de-archivo-subidos) | 🔵 Baja | Colisión de nombres de archivo subidos |
| [SEC-023](#sec-023--archivos-huérfanos-nunca-depurados) | 🔵 Baja | Archivos huérfanos nunca depurados |
| [SEC-024](#sec-024--configuración-de-nginx-incompleta-e-insegura) | 🔵 Baja | Configuración de nginx incompleta e insegura |
| [SEC-025](#sec-025--endpoints-destructivos-sin-confirmación) | 🔵 Baja | Endpoints destructivos sin confirmación |

---

## SEC-001 — Secreto de firma JWT hardcodeado y público

**Severidad:** 🔴 Crítica · **CWE-798** (credenciales embebidas) · **CWE-321** (clave criptográfica fija)

### Evidencia

`server/src/auth.js:3`

```js
const SECRET_KEY = process.env.AUTH_SECRET || 'auto-whatsapp-secret-key-2024';
```

El mismo valor está además publicado en `.env.example`, que **sí está versionado en git**
(confirmado con `git log --diff-filter=A`).

### Impacto

Cualquier persona con acceso al repositorio —o que simplemente pruebe ese valor por defecto—
puede firmar un token válido sin conocer usuario ni contraseña:

```js
jwt.sign({ username: 'yamiddev' }, 'auto-whatsapp-secret-key-2024', { expiresIn: '24h' })
```

Ese token supera `authMiddleware` y concede acceso a **los 27 endpoints protegidos**: enviar
mensajes en nombre del usuario, descargar toda la agenda telefónica, desvincular la cuenta.
Es un **bypass total de autenticación**, sin necesidad de fuerza bruta.

### Solución

1. Eliminar el valor por defecto: el proceso debe **negarse a arrancar** sin secreto.
2. Generar un secreto aleatorio de 256 bits y guardarlo sólo en `.env` (nunca versionado).
3. Rotar el secreto invalida todas las sesiones existentes — es lo deseado aquí.

```js
// server/src/auth.js
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.AUTH_SECRET;

if (!SECRET_KEY || SECRET_KEY.length < 32) {
  throw new Error(
    '[FATAL] AUTH_SECRET no definido o demasiado corto (mínimo 32 caracteres). ' +
    'Genera uno con: openssl rand -base64 48'
  );
}
```

```bash
openssl rand -base64 48
```

---

## SEC-002 — Credenciales reales versionadas en el repositorio

**Severidad:** 🔴 Crítica · **CWE-798** · **CWE-259** (contraseña embebida)

### Evidencia

`.env.example` (versionado en git desde el primer commit):

```
AUTH_USERNAME=yamiddev
AUTH_PASSWORD=nidian56
AUTH_SECRET=auto-whatsapp-secret-key-2024
```

Y como valores por defecto en el código, `server/src/routes/auth.js:7-8`:

```js
const VALID_USERNAME = process.env.AUTH_USERNAME || 'yamiddev';
const VALID_PASSWORD = process.env.AUTH_PASSWORD || 'nidian56';
```

El README indica que el repositorio remoto es `github.com:yamiddevofic/auto-whatsapp`.

### Impacto

Si el repositorio es público, **las credenciales de administración están publicadas en
Internet**. Aunque se hiciera privado hoy, siguen en el historial de git y muy probablemente
en cachés de terceros. Además, si esa contraseña se reutiliza en otros servicios, el impacto
excede este proyecto.

### Solución

1. **Rotar la contraseña ahora mismo**, aquí y en cualquier otro servicio donde se reutilice.
2. Reemplazar `.env.example` por un archivo con marcadores de posición:

```bash
# .env.example — plantilla. Copiar a .env y rellenar. NUNCA poner valores reales aquí.
PORT=3001
SESSION_NAME=whatsapp
AUTH_USERNAME=cambiar-usuario
AUTH_PASSWORD_HASH=          # bcrypt: node -e "console.log(require('bcrypt').hashSync(process.argv[1],12))" 'TU_PASSWORD'
AUTH_SECRET=                 # openssl rand -base64 48
NODE_ENV=production
```

3. Eliminar los valores por defecto del código: si falta una variable, el arranque falla.

```js
// server/src/routes/auth.js
const VALID_USERNAME = process.env.AUTH_USERNAME;
const PASSWORD_HASH  = process.env.AUTH_PASSWORD_HASH;

if (!VALID_USERNAME || !PASSWORD_HASH) {
  throw new Error('[FATAL] AUTH_USERNAME y AUTH_PASSWORD_HASH son obligatorios.');
}
```

4. Purgar el historial de git (con el repositorio ya rotado, es higiene, no remedio):

```bash
git filter-repo --path .env.example --invert-paths
```

> Cuidado: reescribe el historial. Coordina con cualquier clon existente antes de forzar el push.

---

## SEC-003 — WebSocket sin autenticación que emite el QR de vinculación

**Severidad:** 🔴 Crítica · **CWE-306** (falta de autenticación en función crítica) · **CWE-200** (exposición de información)

### Evidencia

`server/src/index.js:30-35`

```js
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
```

No hay `io.use(...)` de autenticación en ninguna parte del código. Cualquier cliente puede
conectarse. Y sobre ese canal se emiten:

| Evento | Contenido emitido | Origen |
|---|---|---|
| `whatsapp:qr` | **Código QR de vinculación de WhatsApp** | [`whatsapp.js:137`](../server/src/whatsapp.js#L137) |
| `whatsapp:status` | Estado de conexión | [`whatsapp.js:138`](../server/src/whatsapp.js#L138) |
| `messages:updated` | Todos los mensajes con contenido y grupos | [`routes/messages.js:32`](../server/src/routes/messages.js#L32) |
| `direct-messages:updated` | **Números de teléfono destinatarios y contenido** | [`routes/direct-messages.js:115`](../server/src/routes/direct-messages.js#L115) |
| `status-updates:updated` | Estados programados | [`routes/status-updates.js:85`](../server/src/routes/status-updates.js#L85) |
| `published-statuses:updated` | Historial de estados publicados | [`routes/published-statuses.js:20`](../server/src/routes/published-statuses.js#L20) |

### Impacto

Este es el hallazgo más grave del sistema, por dos vías:

1. **Toma de control de la cuenta de WhatsApp.** Un atacante anónimo mantiene un socket
   abierto esperando. En el momento en que el usuario legítimo pulsa "Desvincular"
   ([`routes/status.js:22`](../server/src/routes/status.js#L22)) o la sesión se corrompe por
   *Bad MAC* (el código borra `auth_info` y reinicia automáticamente,
   [`whatsapp.js:165-182`](../server/src/whatsapp.js#L165)), se genera un QR nuevo que se
   emite a **todos** los sockets conectados. El atacante lo escanea primero y vincula la
   cuenta de WhatsApp de la víctima a su propio dispositivo: lee todas sus conversaciones y
   envía mensajes en su nombre.
2. **Fuga continua de datos personales.** Sin hacer nada más, el atacante recibe en tiempo
   real todos los mensajes programados, el contenido y los números de teléfono destinatarios.

Explotación trivial:

```js
// Desde cualquier navegador o script, sin credenciales:
const s = io('http://<host>:3001');
s.on('whatsapp:qr', qr => console.log('QR capturado:', qr));
s.onAny((ev, data) => console.log(ev, data));
```

### Solución

Autenticar el handshake de Socket.IO con el mismo JWT, y restringir el origen.

```js
// server/src/index.js
import { verifyToken } from './auth.js';

const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN?.split(',') ?? false,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const decoded = token && verifyToken(token);
  if (!decoded) return next(new Error('unauthorized'));
  socket.data.user = decoded;
  next();
});
```

En el cliente, `client/src/App.jsx:159`:

```js
const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
  auth: { token: localStorage.getItem('token') },
});
socket.on('connect_error', (err) => {
  if (err.message === 'unauthorized') {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth-expired'));
  }
});
```

**Refuerzo adicional recomendado:** el QR nunca debería difundirse por broadcast. Emitirlo a
una sala privada por usuario (`io.to(userRoom).emit(...)`) o servirlo únicamente vía
`GET /api/qr` bajo autenticación, que ya existe.

---

## SEC-004 — Tráfico en HTTP plano en producción

**Severidad:** 🔴 Crítica · **CWE-319** (transmisión de datos sensibles en claro)

### Evidencia

`auto-whatsapp-nginx.conf:2`

```nginx
server {
    listen 4323;      # sin ssl, sin redirección a HTTPS
    server_name _;
```

### Impacto

Sobre HTTP plano viajan sin cifrar:

- Usuario y contraseña en el `POST /api/auth/login`.
- El token JWT en cada cabecera `Authorization`.
- **El código QR de vinculación de WhatsApp.**
- Toda la agenda telefónica y el contenido de los mensajes.

Cualquiera en la ruta de red (WiFi compartida, ISP, proxy intermedio) captura las credenciales
y el QR. Además, sin TLS todas las mitigaciones de cookies/tokens son irrelevantes.

### Solución

Terminar TLS en nginx con Let's Encrypt y redirigir todo HTTP a HTTPS. `certbot` automatiza
la emisión y renovación:

```bash
sudo certbot --nginx -d tu-dominio.example.com
```

```nginx
server {
    listen 80;
    server_name tu-dominio.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.example.com;

    ssl_certificate     /etc/letsencrypt/live/tu-dominio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    # ... resto de la configuración (ver SEC-024)
}
```

Si no hay dominio disponible, la alternativa correcta es **no exponer el puerto** y acceder
por VPN (WireGuard/Tailscale) o túnel SSH.

---

## SEC-005 — Subida de archivos sin autenticación

**Severidad:** 🟠 Alta · **CWE-306** · **CWE-434** (subida sin restricción) · **CWE-400** (agotamiento de recursos)

### Evidencia

En `server/src/index.js`, los middlewares de `multer` se montan en las **líneas 64-107**,
mientras que la autenticación se aplica en la **línea 113**:

```js
app.use('/api/messages', (req, res, next) => {        // línea 64
  if (req.method === 'POST') upload.single('image')(req, res, next);
  else next();
});
app.use('/api/status-updates', /* upload.array('images', 20) */);  // línea 72
app.use('/api/direct-messages', /* upload.single('image')  */);    // línea 80
app.use('/api/agenda/import',  /* vcfUpload.single('vcf')  */);    // línea 101

app.use('/api/auth', authRoutes());   // línea 110
app.use('/api', authMiddleware);      // línea 113  ← demasiado tarde
```

Express ejecuta el middleware en orden de registro. `multer` **escribe el archivo en disco
antes** de que `authMiddleware` rechace la petición con 401.

### Impacto

Un atacante anónimo puede escribir archivos en el servidor:

```bash
# Cada petición deja 50 MB en disco antes del 401
for i in $(seq 1 200); do
  curl -s -F "image=@50mb.png" http://<host>:3001/api/messages > /dev/null &
done
```

Con 4 endpoints y 20 archivos por petición en `/api/status-updates`, llenar el disco es
cuestión de minutos. Cuando el disco se llena, el `fs.writeFileSync` de
[`db.js:62`](../server/src/db.js#L62) falla a mitad de escritura y **corrompe `data.db`**,
porque la base entera se reescribe en cada operación.

### Solución

Mover la autenticación **antes** de cualquier middleware de subida:

```js
// server/src/index.js — orden correcto
app.use('/api/auth', authRoutes());   // público: sólo login
app.use('/api', authMiddleware);      // ← PRIMERO la autenticación

// Sólo después, los middlewares de subida
app.use('/api/messages',        uploadOnPost(upload.single('image')));
app.use('/api/status-updates',  uploadOnPost(upload.array('images', 20)));
app.use('/api/direct-messages', uploadOnPost(upload.single('image')));
app.use('/api/agenda/import',   uploadOnPost(vcfUpload.single('vcf')));

// Y las rutas
app.use(statusRoutes);
// ...
```

Con un helper que elimina la repetición:

```js
const uploadOnPost = (mw) => (req, res, next) =>
  req.method === 'POST' ? mw(req, res, next) : next();
```

Reducir además el límite de tamaño: 50 MB por imagen es excesivo (WhatsApp comprime a
mucho menos). 8 MB es más que suficiente.

---

## SEC-006 — Directorio `/uploads` público con nombres predecibles

**Severidad:** 🟠 Alta · **CWE-548** / **CWE-200**

### Evidencia

`server/src/index.js:126`

```js
app.use('/uploads', express.static(config.uploadsDir));
```

Se monta **fuera** del prefijo `/api`, por lo que `authMiddleware` no lo cubre. Y los nombres
son deterministas, `index.js:44-47`:

```js
filename: (req, file, cb) => {
  const ext = path.extname(file.originalname);
  cb(null, `${Date.now()}${ext}`);   // p. ej. 1757352123456.png
}
```

### Impacto

Las imágenes que el usuario programa para enviar —que pueden ser privadas— son accesibles sin
autenticación por cualquiera que adivine la marca de tiempo. El espacio de búsqueda es
pequeño: si se sabe aproximadamente cuándo se subió (por ejemplo, observando el WebSocket
abierto de SEC-003), bastan unos miles de peticiones para acertar el milisegundo.

```bash
for ms in $(seq 1757352120000 1757352180000); do
  curl -sf -o "$ms.png" "http://<host>:3001/uploads/$ms.png"
done
```

### Solución

Dos cambios complementarios:

```js
// 1. Nombres no adivinables
import crypto from 'crypto';

filename: (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
}

// 2. Servir los adjuntos sólo autenticado
app.use('/uploads', authMiddleware, express.static(config.uploadsDir, {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));
```

> Nota: si `/uploads` requiere token, el cliente debe pedir las imágenes con `fetch` +
> cabecera `Authorization` y crear un `blob:` URL, o bien usar URLs firmadas de corta
> duración. Las URLs firmadas son la opción más simple para etiquetas `<img>`.

---

## SEC-007 — Login sin rate limiting ni hash de contraseña

**Severidad:** 🟠 Alta · **CWE-307** (intentos ilimitados) · **CWE-256** (contraseña sin proteger) · **CWE-208** (comparación no constante)

### Evidencia

`server/src/routes/auth.js:10-23` — el endpoint completo:

```js
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '...' });
  if (username === VALID_USERNAME && password === VALID_PASSWORD) {   // texto plano, ===
    return res.json({ token: generateToken(username), username });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});
```

Tres problemas en cinco líneas: sin límite de intentos, contraseña almacenada en texto plano
en el entorno, y comparación con `===` (no de tiempo constante).

### Impacto

Combinado con el CORS abierto (SEC-009), un atacante puede lanzar fuerza bruta desde
cualquier origen, sin límite ni registro de intentos fallidos. Una contraseña de 8 caracteres
alfanuméricos cae en horas. Y como la contraseña está en claro en el entorno, cualquier
volcado de proceso, `/proc/<pid>/environ` o log de despliegue la expone.

### Solución

```bash
npm i express-rate-limit bcrypt
```

```js
// server/src/routes/auth.js
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,                       // 5 intentos por IP cada 15 min
  standardHeaders: true,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
});

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Credenciales requeridas' });
  }

  const userOk = safeEqual(username, VALID_USERNAME);
  const passOk = await bcrypt.compare(password, PASSWORD_HASH);   // siempre se ejecuta

  if (userOk && passOk) {
    console.log(`[Auth] Login correcto: ${username} desde ${req.ip}`);
    return res.json({ token: generateToken(username), username });
  }

  console.warn(`[Auth] Login fallido para "${username}" desde ${req.ip}`);
  return res.status(401).json({ error: 'Credenciales inválidas' });
});
```

Generar el hash una sola vez:

```bash
node -e "console.log(require('bcrypt').hashSync(process.argv[1], 12))" 'TU_PASSWORD_NUEVA'
```

Añadir `app.set('trust proxy', 1)` en `index.js` para que `req.ip` refleje la IP real detrás
de nginx (que ya envía `X-Real-IP`).

---

## SEC-008 — Dependencias con vulnerabilidades conocidas

**Severidad:** 🟠 Alta · **CWE-1395** (dependencia con componente vulnerable)

### Evidencia

`npm audit` ejecutado el 2026-09-08:

- **Servidor:** 10 vulnerabilidades — 1 crítica, 5 altas, 3 moderadas, 1 baja.
- **Cliente:** 7 vulnerabilidades — 6 altas, 1 baja.

La crítica afecta a la librería central del proyecto:

```
@whiskeysockets/baileys  <6.7.22   — CRÍTICA
Baileys has message upsert / hist sync spoofing and app state corruption
when using maliciously crafted protocolMessage payload
GHSA-qvv5-jq5g-4cgg  (CWE-290 suplantación, CWE-345/346 validación de origen)
```

El detalle completo está en [05 — Dependencias vulnerables](05-dependencias.md).

### Impacto

`GHSA-qvv5-jq5g-4cgg` permite que un remitente malicioso de WhatsApp envíe un
`protocolMessage` manipulado que **suplanta mensajes y corrompe el estado de la aplicación**.
Como el proyecto procesa cada mensaje entrante en `messages.upsert`
([`whatsapp.js:49`](../server/src/whatsapp.js#L49) y [`:106`](../server/src/whatsapp.js#L106))
y guarda `pushName` en la base de datos, un atacante externo que sólo conozca el número de
teléfono puede inyectar datos falsos en la agenda del sistema.

`socket.io-parser` (alta, agotamiento de memoria con adjuntos vacíos) es explotable
directamente por el WebSocket anónimo de SEC-003.

### Solución

```bash
cd server && npm audit fix && npm audit
cd ../client && npm audit fix && npm audit
```

Y fijar la versión mínima de Baileys en `server/package.json`:

```json
"@whiskeysockets/baileys": "^6.7.22"
```

Automatizar la vigilancia con Dependabot (`.github/dependabot.yml`) o `npm audit` en CI, para
que esto no se repita — ver [03 — Plan de remediación](03-plan-de-remediacion.md).

---

## SEC-009 — CORS completamente abierto

**Severidad:** 🟠 Alta · **CWE-942** (política de dominios cruzados demasiado permisiva)

### Evidencia

`server/src/index.js:37`

```js
app.use(cors());   // equivale a Access-Control-Allow-Origin: *
```

Y lo mismo en la configuración de Socket.IO (`index.js:32`): `origin: '*'`.

### Impacto

Cualquier página web que la víctima visite puede emitir peticiones a la API. El token vive en
`localStorage` y no se envía automáticamente, así que no hay CSRF clásico sobre los endpoints
autenticados; pero sí queda abierto:

- **Fuerza bruta del login desde cualquier origen** (`POST /api/auth/login` es público).
- **Subida anónima de archivos** desde cualquier sitio web (combinado con SEC-005).
- Conexión al WebSocket desde cualquier origen (combinado con SEC-003, es el vector de la
  captura del QR: basta con que la víctima visite una página cualquiera del atacante… o ni
  siquiera, porque el servidor es alcanzable directamente).

### Solución

Lista blanca explícita, configurable por entorno:

```js
// server/src/index.js
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Permite peticiones del mismo origen (sin cabecera Origin) y las de la lista blanca
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));
```

```
# .env
ALLOWED_ORIGIN=https://tu-dominio.example.com
```

Como el frontend se sirve desde el mismo Express (`express.static(config.clientDist)`), en
producción **CORS puede quedar prácticamente deshabilitado** y sólo permitir el mismo origen.

---

## SEC-010 — Ausencia de cabeceras de seguridad + token en `localStorage`

**Severidad:** 🟠 Alta · **CWE-1021** (protección insuficiente de la interfaz) · **CWE-522**

### Evidencia

No se usa `helmet` ni se define ninguna cabecera de seguridad, ni en Express ni en nginx.
Faltan: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`.

El token se guarda en `localStorage` (`client/src/components/Login.jsx:28-29`) y se lee en
cada petición (`client/src/api.js:5`).

### Impacto

Sin CSP, cualquier XSS —hoy no hay ninguno en el código propio, pero puede introducirse en un
cambio futuro o venir de una dependencia comprometida del frontend— permite leer
`localStorage` y **exfiltrar el token**, que es válido 24 h y no puede revocarse (SEC-020).
Sin `X-Frame-Options`, la interfaz puede embeberse en un iframe para clickjacking sobre
acciones destructivas como "Desvincular" o "Eliminar todos los contactos".

### Solución

```bash
npm i helmet
```

```js
// server/src/index.js
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],   // Vite inyecta estilos en línea
      imgSrc:     ["'self'", 'data:', 'blob:'],    // el QR es un data: URL
      connectSrc: ["'self'", 'ws:', 'wss:'],       // socket.io
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

**Sobre el almacenamiento del token:** la solución robusta es migrar a una cookie
`httpOnly; Secure; SameSite=Strict`, inaccesible desde JavaScript. Requiere añadir protección
CSRF (token de doble envío o `SameSite=Strict` estricto). Si se mantiene `localStorage`, al
menos reducir la vida del token a 1–2 horas y añadir refresco silencioso.

---

## SEC-011 — `uncaughtException` que no termina el proceso

**Severidad:** 🟡 Media · **CWE-755** (manejo inadecuado de condiciones excepcionales)

### Evidencia

`server/src/index.js:135-142`

```js
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
```

### Impacto

Tras una excepción no capturada, el estado del proceso es **indefinido por definición**:
transacciones de base de datos a medias (`_inTransaction` puede quedar en `true`, bloqueando
todos los `save()` posteriores en [`db.js:55`](../server/src/db.js#L55)), sockets
semiabiertos, jobs en estado inconsistente. El servidor sigue atendiendo peticiones y
enviando mensajes de WhatsApp con datos potencialmente corruptos. Es la receta clásica para
la corrupción silenciosa de datos.

El proyecto ya tiene la infraestructura correcta para reiniciar: el bucle de `start.sh`
reinicia el proceso a los 5 segundos.

### Solución

Registrar y **salir**, dejando que el supervisor reinicie limpio:

```js
process.on('uncaughtException', (err) => {
  console.error('[Server] Excepción no capturada — cerrando:', err.message, err.stack);
  // Cierre ordenado con tope de 5 s
  httpServer.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Promesa rechazada sin manejar:', reason);
  process.exit(1);
});
```

Y sustituir el bucle `while true` de tmux por un supervisor real (systemd o PM2), que aporta
reinicio con backoff, límite de reintentos y rotación de logs — ver
[04 — Calidad y arquitectura](04-calidad-arquitectura.md).

---

## SEC-012 — Filtración de errores internos al cliente

**Severidad:** 🟡 Media · **CWE-209** (exposición de información en mensajes de error)

### Evidencia

Patrón repetido en los 9 routers. Ejemplos:

```js
// routes/messages.js:35, status-updates.js:40, direct-messages.js:59,
// agenda.js:70, contacts.js:42, status.js:43, groups.js:11 …
catch (err) {
  res.status(500).json({ error: err.message });
}
```

Y en `scheduler.js:230`, los mensajes de error de Baileys se concatenan y se guardan en la
base de datos, desde donde se emiten por WebSocket a todos los clientes conectados.

### Impacto

Los mensajes de error de Baileys, `sql.js` y `fs` incluyen rutas absolutas del sistema de
archivos, JIDs, fragmentos de SQL y detalles internos del protocolo. Esto da a un atacante
información de reconocimiento gratuita y, combinado con SEC-003, esa información se difunde
por el WebSocket anónimo.

### Solución

Manejador de errores centralizado que registra el detalle y devuelve un mensaje genérico:

```js
// server/src/middleware/error-handler.js
export function errorHandler(err, req, res, next) {
  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[Error ${id}] ${req.method} ${req.path}:`, err.stack || err.message);

  if (err.code === 'LIMIT_FILE_SIZE')  return res.status(413).json({ error: 'Archivo demasiado grande' });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'Demasiados archivos' });
  if (err.status === 400)              return res.status(400).json({ error: err.message });

  res.status(500).json({
    error: 'Error interno del servidor',
    ref: id,                                   // el usuario reporta este id, el detalle vive en el log
  });
}
```

Registrarlo **después de todas las rutas** en `index.js`, y sustituir cada `catch` de los
routers por `next(err)`. Esto resuelve además un problema hoy invisible: los errores de
`multer` (archivo demasiado grande, tipo no permitido) no tienen manejador y devuelven la
página de error HTML por defecto de Express.

---

## SEC-013 — Ausencia total de validación de entrada

**Severidad:** 🟡 Media · **CWE-20** (validación de entrada inadecuada)

### Evidencia

Ningún endpoint valida formato, tipo, longitud ni rango. Casos concretos:

| Campo | Ubicación | Problema |
|---|---|---|
| `scheduledAt` | [`routes/messages.js:15`](../server/src/routes/messages.js#L15) | Se pasa a `new Date()` sin validar. `"lunes"` → `Invalid Date` → `node-schedule` devuelve `null` y **el mensaje queda pendiente para siempre** |
| `content` | todos los routers | Sin longitud máxima. Un `content` de 40 MB entra por el límite de `express.json({ limit: '50mb' })` |
| `groupId` | [`routes/messages.js:15`](../server/src/routes/messages.js#L15) | Sin validar formato JID; se envía tal cual a `sock.sendMessage()` |
| `recipients` | [`routes/direct-messages.js:97`](../server/src/routes/direct-messages.js#L97) | Sólo se comprueba que sea un array no vacío; sin cardinalidad ni formato |
| `numbers` | [`routes/direct-messages.js:27`](../server/src/routes/direct-messages.js#L27) | Sin límite; cada elemento dispara una consulta a la red de WhatsApp |
| `countryCode` | [`routes/agenda.js:88`](../server/src/routes/agenda.js#L88) | Se limpia con `replace(/\D/g,'')` pero sin límite de longitud |
| `id` de rutas | todos los `:id` | `parseInt(req.params.id)` puede dar `NaN`; se consulta con `NaN` sin comprobar |

### Impacto

Mezcla de fallos de fiabilidad (mensajes que nunca se envían y no reportan error) y de
seguridad (consumo de recursos, comportamiento inesperado en la capa de red de WhatsApp).

### Solución

Validación por esquema en el borde. `zod` es la opción más ligera para este tamaño de
proyecto:

```bash
npm i zod
```

```js
// server/src/middleware/validate.js
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  req.body = result.data;
  next();
};
```

```js
// server/src/schemas.js
import { z } from 'zod';

const futureISODate = z.string().refine((s) => {
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.getTime() > Date.now() - 10 * 60 * 1000;
}, 'Fecha inválida o más de 10 minutos en el pasado');

export const createMessageSchema = z.object({
  groupId:     z.string().regex(/^[\w.-]+@(g\.us|s\.whatsapp\.net)$/, 'JID inválido'),
  groupName:   z.string().min(1).max(200),
  content:     z.string().min(1).max(4096),
  scheduledAt: futureISODate,
});

export const directMessageSchema = z.object({
  recipients:     z.array(z.string().regex(/^[\w.-]+@s\.whatsapp\.net$/)).min(1).max(500),
  recipientLabel: z.string().max(200).optional(),
  content:        z.string().min(1).max(4096),
  scheduledAt:    futureISODate,
});
```

```js
// routes/messages.js
router.post('/api/messages', validate(createMessageSchema), (req, res, next) => { … });
```

Y para los parámetros de ruta, un guardia reutilizable:

```js
const parseId = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido' });
  req.id = id;
  next();
};
```

---

## SEC-014 — Sin límite de destinatarios: abuso de envío masivo

**Severidad:** 🟡 Media · **CWE-770** (asignación sin límites) · riesgo de plataforma

### Evidencia

`server/src/routes/direct-messages.js:15-61` (`/send-now`) itera sobre `numbers` sin límite
de cardinalidad y **sin ningún retardo entre envíos**:

```js
for (const num of numbers) {
  const jid = await checkOnWhatsApp(num);
  if (jid) await sendMessage(jid, content || null, imagePath);   // sin delay
}
```

Contrasta con la ruta programada, que sí implementa retardo aleatorio y límite diario
([`scheduler.js:186-207`](../server/src/scheduler.js#L186)). El límite diario de
`canSendMoreMessages()` **no se consulta en `/send-now`**.

### Impacto

1. **Ban de la cuenta de WhatsApp.** El envío rápido sin retardo a muchos números es
   exactamente el patrón que detectan los sistemas antispam de WhatsApp. Se pierde la cuenta
   personal, no sólo la aplicación.
2. **Bloqueo del bucle de eventos.** El `await` secuencial mantiene la petición HTTP abierta
   durante minutos u horas con 1.000 números; no hay timeout de respuesta.
3. Un atacante autenticado (o cualquiera, dada SEC-001) puede usar el sistema como plataforma
   de spam desde la cuenta de la víctima.

### Solución

```js
const MAX_DESTINATARIOS_INMEDIATOS = 20;   // el envío masivo debe programarse

if (numbers.length > MAX_DESTINATARIOS_INMEDIATOS) {
  return res.status(400).json({
    error: `Máximo ${MAX_DESTINATARIOS_INMEDIATOS} destinatarios en envío inmediato. ` +
           `Para más, usa un envío programado.`,
  });
}

if (!canSendMoreMessages(numbers.length)) {
  return res.status(429).json({ error: 'Límite diario de mensajes alcanzado' });
}
```

Aplicar además el mismo retardo aleatorio de `scheduler.js` y llamar a
`incrementMessageCount()` en cada envío de `/send-now`, para que el contador diario refleje
la realidad. Y devolver `202 Accepted` con un identificador de trabajo en vez de bloquear la
petición hasta terminar.

---

## SEC-015 — Secretos en reposo sin protección

**Severidad:** 🟡 Media · **CWE-312** (almacenamiento de datos sensibles en claro) · **CWE-732** (permisos incorrectos)

### Evidencia

`server/src/config.js:9-11`

```js
uploadsDir: path.join(ROOT_DIR, 'uploads'),
authDir:    path.join(ROOT_DIR, 'auth_info'),
dbPath:     path.join(ROOT_DIR, 'data.db'),
```

`auth_info/` contiene las **credenciales completas de la sesión de WhatsApp** (claves Signal,
identidad del dispositivo). `data.db` contiene la agenda telefónica íntegra y el contenido de
todos los mensajes. Ninguno tiene permisos restringidos explícitos ni cifrado; heredan el
`umask` del proceso (típicamente `0644`, legible por cualquier usuario del sistema).

Además, nginx sirve el frontend desde `/home/yamiddev/auto-whatsapp/client/dist`
(`auto-whatsapp-nginx.conf:5`), es decir, **el directorio raíz del proyecto está dentro del
home del usuario, junto a `auth_info/` y `data.db`**. Un `root` mal configurado o un
`try_files` con un enlace simbólico podría llegar a exponerlos.

### Impacto

Quien lea `auth_info/` controla la cuenta de WhatsApp: copia el directorio a otra máquina y
tiene la sesión activa, sin QR y sin que la víctima lo note. Es equivalente a robar la sesión
completa.

### Solución

1. **Mover los datos fuera del árbol servido por el servidor web.**

```js
// server/src/config.js
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');

export default {
  port: process.env.PORT || 3001,
  uploadsDir: path.join(DATA_DIR, 'uploads'),
  authDir:    path.join(DATA_DIR, 'auth_info'),
  dbPath:     path.join(DATA_DIR, 'data.db'),
  clientDist: path.join(ROOT_DIR, 'client/dist'),
};
```

```
DATA_DIR=/var/lib/auto-whatsapp
```

2. **Permisos restrictivos** al crear los directorios:

```js
fs.mkdirSync(config.uploadsDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.authDir,    { recursive: true, mode: 0o700 });
```

```bash
sudo install -d -o auto-whatsapp -g auto-whatsapp -m 700 /var/lib/auto-whatsapp
chmod 600 /var/lib/auto-whatsapp/data.db
```

3. **Cifrado del volumen** (LUKS o el cifrado de disco del proveedor) y copias de seguridad
   cifradas de `data.db`.

---

## SEC-016 — Imagen Docker con `.env` incluido y ejecución como root

**Severidad:** 🟡 Media · **CWE-522** · **CWE-250** (privilegios innecesarios)

### Evidencia

`Dockerfile:16` y ausencia de `USER`:

```dockerfile
# Copy .env if exists
COPY .env* ./          # ← incrusta los secretos en una capa de la imagen

# … no hay instrucción USER: el proceso corre como root
CMD ["node", "server/src/index.js"]
```

### Impacto

- Los secretos quedan **grabados permanentemente en una capa** de la imagen. Quien pueda hacer
  `docker pull` (o inspeccione el registro) los extrae con `docker history` / `docker save`,
  aunque un `Dockerfile` posterior los borre.
- El proceso corre como `root` dentro del contenedor: cualquier ejecución de código arbitraria
  se convierte en root del contenedor, y con ello aumenta el riesgo de escape.
- `COPY server ./server` y `COPY client ./client` copian también `node_modules` locales si
  existen (el `.dockerignore` sólo excluye `node_modules` en la raíz, no `server/node_modules`
  ni `client/node_modules` — aunque la regla `node_modules` sin barra sí aplica en
  subdirectorios, conviene ser explícito).

### Solución

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm ci && cd server && npm ci --omit=dev && cd ../client && npm ci
COPY . .
RUN cd client && npm run build

FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=build --chown=app:app /app/server        ./server
COPY --from=build --chown=app:app /app/client/dist   ./client/dist
COPY --from=build --chown=app:app /app/package*.json ./

ENV NODE_ENV=production
USER app
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "server/src/index.js"]
```

Los secretos se inyectan **en tiempo de ejecución**, nunca en la imagen:

```bash
docker run --env-file .env -v aw-data:/var/lib/auto-whatsapp auto-whatsapp
```

Añadir `.env` y `.env.*` al `.dockerignore` (hoy sólo está `.env` y `.env.local`; falta el
comodín) y una ruta `/health` en Express para el healthcheck.

---

## SEC-017 — Datos personales en los logs

**Severidad:** 🟡 Media · **CWE-532** (inserción de información sensible en un log)

### Evidencia

```js
// scheduler.js:197
console.log(`[Scheduler] Sending to ${jid} (${contactName}): ${variedContent?.substring(0,50)}...`);

// routes/direct-messages.js:20
console.log('[DirectMessages] send-now body:', { numbers, content: content?.substring(0,30), … });

// routes/direct-messages.js:38
console.log(`[DirectMessages] Checking number: ${num}`);

// whatsapp.js:367
console.log(`[WhatsApp] Status JIDs: ${statusJidList.slice(0,10).join(', ')}…`);
```

Y `pino` está configurado en `level: 'silent'` ([`whatsapp.js:16`](../server/src/whatsapp.js#L16)),
por lo que todo el registro real ocurre por `console.log` sin niveles ni rotación.

### Impacto

Números de teléfono, nombres reales y contenido de mensajes privados quedan escritos en texto
plano en los logs de tmux/systemd/Docker, sin rotación ni control de acceso. Es una fuga de
datos personales por sí misma y un problema de cumplimiento (ver
[06 — Cumplimiento legal](06-cumplimiento-legal.md)).

### Solución

Adoptar `pino` de verdad (ya es una dependencia) con redacción automática:

```js
// server/src/logger.js
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['jid', 'phone', 'numbers', 'content', 'recipients', '*.jid', '*.phone', '*.content'],
    censor: '[redactado]',
  },
});

// Utilidad para logs de diagnóstico que sí necesitan identificar al destinatario
export const maskJid = (jid = '') => jid.replace(/^(\d{3})\d+(\d{2})/, '$1****$2');
```

```js
logger.info({ jid: maskJid(jid) }, 'Enviando mensaje');   // → 573****89
```

Reemplazar los `console.log` por `logger.*` y no registrar nunca el cuerpo del mensaje en
nivel `info`; si hace falta para depurar, sólo en `debug` y desactivado en producción.

---

## SEC-018 — Validación de archivos sólo por extensión

**Severidad:** 🟡 Media · **CWE-434** (subida de archivos peligrosos sin restricción)

### Evidencia

`server/src/index.js:53-60`

```js
fileFilter: (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
  if (allowed.test(path.extname(file.originalname))) cb(null, true);
  else cb(new Error('Only image files are allowed'));
}
```

Sólo se comprueba la extensión del nombre proporcionado por el cliente. No se valida el
`mimetype` ni el contenido real del archivo.

> Nota: `path.extname()` elimina cualquier componente de directorio, y la expresión regular
> está anclada con `$`, así que **no hay path traversal** aquí. El riesgo es de contenido, no
> de ruta.

### Impacto

Se puede almacenar contenido arbitrario (HTML, SVG con scripts, ejecutables) bajo un nombre
`.png`. Sirviéndose desde `/uploads` sin `X-Content-Type-Options: nosniff` (SEC-010), un
navegador antiguo o un cliente permisivo podría interpretarlo, abriendo la puerta a XSS
almacenado. También se consume disco con archivos que no son imágenes.

### Solución

Validar extensión + MIME declarado y, tras la escritura, los *magic bytes* reales:

```js
import { fileTypeFromFile } from 'file-type';

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const extOk  = /\.(jpe?g|png|gif|webp)$/i.test(path.extname(file.originalname));
    const mimeOk = MIME_PERMITIDOS.has(file.mimetype);
    cb(extOk && mimeOk ? null : new Error('Sólo se permiten imágenes JPG, PNG, GIF o WEBP'), extOk && mimeOk);
  },
});

// Middleware posterior: verificar el contenido real y borrar si no coincide
export async function verificarImagenReal(req, res, next) {
  const files = req.files ?? (req.file ? [req.file] : []);
  for (const f of files) {
    const tipo = await fileTypeFromFile(f.path);
    if (!tipo || !MIME_PERMITIDOS.has(tipo.mime)) {
      await Promise.all(files.map((x) => fs.promises.unlink(x.path).catch(() => {})));
      return res.status(400).json({ error: 'El archivo no es una imagen válida' });
    }
  }
  next();
}
```

Y servir siempre los adjuntos con `X-Content-Type-Options: nosniff` (ver SEC-006).

---

## SEC-019 — Sin control de autorización por recurso

**Severidad:** 🟡 Media · **CWE-862** (falta de autorización) · **CWE-639** (IDOR)

### Evidencia

El esquema **anticipa multiusuario**: las tablas `contacts` y `agenda_contacts` tienen una
columna `user_id` ([`contacts.js:11`](../server/src/contacts.js#L11),
[`agenda.js:12`](../server/src/agenda.js#L12)), y la importación VCF la rellena con
`req.user?.username` ([`routes/agenda.js:66`](../server/src/routes/agenda.js#L66)).

Pero **ninguna consulta de lectura filtra por `user_id`**:

```js
// contacts.js:74 — devuelve TODOS los contactos, de cualquier usuario
export function getAllContacts() {
  return db.prepare(`SELECT c.*, … FROM contacts c LEFT JOIN agenda_contacts …`).all();
}

// agenda.js:39
export function getAllAgendaContacts() {
  return db.prepare('SELECT * FROM agenda_contacts ORDER BY name').all();
}
```

Y las tablas `messages`, `status_updates`, `direct_messages` ni siquiera tienen `user_id`.
Cualquier `:id` es accesible por cualquier usuario autenticado (IDOR).

### Impacto

Hoy el impacto es bajo porque sólo existe un usuario. Pero es una **bomba de relojería**: en
el momento en que se añada un segundo usuario, cada uno verá la agenda telefónica completa y
los mensajes del otro, sin ningún cambio de código que lo delate. La estructura sugiere
aislamiento donde no lo hay.

### Solución

Decidir explícitamente y documentarlo:

- **Si el sistema es monousuario:** eliminar las columnas `user_id` para que nadie asuma
  aislamiento inexistente, y dejarlo escrito en el README.
- **Si va a ser multiusuario:** añadir `user_id` a las tres tablas de mensajes y filtrar en
  **todas** las consultas:

```js
export function getAllContacts(userId) {
  return db.prepare(`SELECT c.*, … FROM contacts c WHERE c.user_id = ? ORDER BY …`).all(userId);
}

export function getMessageById(id, userId) {
  return db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').get(id, userId);
}
```

Con migración de esquema y una prueba automatizada por endpoint que verifique que el usuario A
recibe 404 al pedir un recurso de B.

---

## SEC-020 — Sesiones sin revocación ni verificación de expiración

**Severidad:** 🟡 Media · **CWE-613** (expiración de sesión insuficiente)

### Evidencia

Token de 24 h sin identificador ni lista de revocación (`auth.js:5-7`):

```js
export function generateToken(username) {
  return jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
}
```

El cliente considera al usuario autenticado con la mera presencia de la cadena en
`localStorage`, sin decodificar ni comprobar `exp` (`client/src/App.jsx:126-128`):

```js
const token = localStorage.getItem('token');
if (token) setIsAuthenticated(true);
```

El "logout" (`App.jsx:242-243`) sólo borra el `localStorage`: **el token sigue siendo válido
en el servidor hasta que expira**.

### Impacto

- Un token robado (por XSS, por captura en HTTP plano según SEC-004, o por un backup del
  navegador) es utilizable durante 24 h y **no hay forma de invalidarlo**. Ni siquiera cerrar
  sesión en todos los dispositivos.
- El usuario ve la interfaz cargada con un token caducado y sólo descubre el problema cuando
  la primera petición devuelve 401.

### Solución

1. Reducir la vida del token a 1–2 h y emitir un *refresh token* de vida larga almacenado en
   cookie `httpOnly`.
2. Añadir `jti` (identificador único) al token y una tabla `revoked_tokens` que el
   `authMiddleware` consulte; el logout inserta ahí el `jti`.
3. Verificar la expiración en el cliente antes de asumir sesión activa:

```js
function tokenVigente(token) {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return exp * 1000 > Date.now();
  } catch { return false; }
}

const token = localStorage.getItem('token');
if (token && tokenVigente(token)) setIsAuthenticated(true);
else localStorage.removeItem('token');
```

> Es una comprobación de conveniencia en el cliente, no una medida de seguridad: la
> verificación autoritativa sigue siendo la del servidor.

---

## SEC-021 — Límites de cuerpo excesivos y sin rate limiting global

**Severidad:** 🟡 Media · **CWE-770** (asignación de recursos sin límites)

### Evidencia

`server/src/index.js:38-39`

```js
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

No existe ningún `rate limit` en toda la aplicación.

### Impacto

Un puñado de peticiones concurrentes con cuerpos JSON de 50 MB agota la memoria del proceso
Node (que también mantiene **la base de datos completa en memoria** por usar `sql.js`).
Sin rate limiting, además, cualquier endpoint puede martillearse: `/api/agenda/check` dispara
consultas a la red de WhatsApp, y `/api/contacts/sync` recorre todos los grupos.

### Solución

```js
import rateLimit from 'express-rate-limit';

app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));               // el JSON nunca necesita más
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Límite general para toda la API
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));

// Límite estricto para operaciones costosas
const limiteEstricto = rateLimit({ windowMs: 60_000, max: 5 });
app.use('/api/agenda/check',   limiteEstricto);
app.use('/api/contacts/sync',  limiteEstricto);
app.use('/api/unlink',         limiteEstricto);
```

Las imágenes siguen entrando por `multipart/form-data` a través de `multer`, que tiene su
propio `limits.fileSize`; bajar el límite JSON no las afecta.

---

## SEC-022 — Colisión de nombres de archivo subidos

**Severidad:** 🔵 Baja · **CWE-330** (uso de valores insuficientemente aleatorios)

### Evidencia

`server/src/index.js:44-47` — el nombre es `${Date.now()}${ext}`. En
`/api/status-updates` se aceptan hasta **20 archivos por petición**
([`index.js:74`](../server/src/index.js#L74)); varios pueden resolverse en el mismo
milisegundo.

### Impacto

Dos archivos con el mismo nombre: el segundo sobrescribe al primero. Se publica el estado
equivocado, o se pierde una imagen que otra fila de la base de datos sigue referenciando.

### Solución

Ya cubierta por el cambio de SEC-006: añadir 16 bytes aleatorios al nombre.

```js
cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
```

---

## SEC-023 — Archivos huérfanos nunca depurados

**Severidad:** 🔵 Baja · **CWE-459** (limpieza incompleta)

### Evidencia

Sólo `deletePublishedStatus()` borra su imagen ([`db.js:392-394`](../server/src/db.js#L392)).
`deleteMessage()`, `deleteStatusUpdate()` y `deleteDirectMessage()` eliminan la fila y **dejan
el archivo en disco**. Los mensajes cancelados o fallidos tampoco liberan su imagen.

### Impacto

Crecimiento monótono del directorio `uploads/`. Combinado con SEC-005 (subida anónima), acelera
el agotamiento del disco. Además, se conservan indefinidamente imágenes personales que el
usuario cree haber eliminado — un problema de minimización de datos.

### Solución

Borrar el archivo asociado en cada eliminación, y añadir una tarea de limpieza periódica:

```js
function borrarAdjunto(rutaImagen) {
  if (!rutaImagen) return;
  fs.promises.unlink(rutaImagen).catch((e) => {
    if (e.code !== 'ENOENT') logger.warn({ err: e.message }, 'No se pudo borrar el adjunto');
  });
}

export function deleteMessage(id) {
  const msg = getMessageById(id);
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  borrarAdjunto(msg?.image_path);
}
```

```js
// Limpieza diaria de huérfanos: archivos en uploads/ que ninguna fila referencia
schedule.scheduleJob('0 4 * * *', async () => {
  const referenciados = new Set([
    ...getAllMessages(), ...getAllStatusUpdates(),
    ...getAllDirectMessages(), ...getAllPublishedStatuses(),
  ].map((r) => r.image_path).filter(Boolean).map((p) => path.basename(p)));

  for (const archivo of await fs.promises.readdir(config.uploadsDir)) {
    if (!referenciados.has(archivo)) {
      await fs.promises.unlink(path.join(config.uploadsDir, archivo)).catch(() => {});
    }
  }
});
```

---

## SEC-024 — Configuración de nginx incompleta e insegura

**Severidad:** 🔵 Baja (funcional) / contribuye a 🔴 SEC-004

### Evidencia

`auto-whatsapp-nginx.conf` completo:

```nginx
server {
    listen 4323;                                    # sin TLS
    root /home/yamiddev/auto-whatsapp/client/dist;  # dentro del home, junto a auth_info/
    client_max_body_size 50M;
    location /api/    { proxy_pass http://127.0.0.1:3001; … }
    location /uploads/ { proxy_pass http://127.0.0.1:3001; }
    # falta: /socket.io/, cabeceras de seguridad, X-Forwarded-Proto
}
```

### Impacto

1. **`/socket.io/` no está proxeado.** El cliente se conecta a `window.location.origin`
   (`App.jsx:159`), es decir al puerto 4323 de nginx, que devuelve el `index.html` de la SPA
   para esa ruta. El WebSocket **falla en producción a través de nginx**; hoy funciona sólo
   porque también se accede directamente al puerto 3001 de Express — que es precisamente lo
   que expone el WebSocket anónimo de SEC-003.
2. Sin `proxy_set_header X-Forwarded-Proto`, Express no puede detectar HTTPS ni marcar
   cookies como `Secure` cuando se añada TLS.
3. Sin `X-Forwarded-For`, el rate limiting por IP (SEC-007, SEC-021) verá siempre `127.0.0.1`.
4. `client_max_body_size 50M` amplifica SEC-005.

### Solución

```nginx
server {
    listen 80;
    server_name tu-dominio.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.example.com;

    ssl_certificate     /etc/letsencrypt/live/tu-dominio.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY"    always;
    add_header Referrer-Policy           "no-referrer" always;

    client_max_body_size 10M;
    root  /var/www/auto-whatsapp/dist;      # fuera del home y de los datos
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_read_timeout 7d;
    }
}
```

Y hacer que Express escuche **sólo en localhost**, para que el único camino de entrada sea
nginx con TLS:

```js
httpServer.listen(config.port, process.env.BIND_ADDR || '127.0.0.1', () => { … });
```

Este último cambio, por sí solo, elimina el acceso directo al puerto 3001 y con él buena parte
de la superficie de SEC-003 y SEC-005.

---

## SEC-025 — Endpoints destructivos sin confirmación

**Severidad:** 🔵 Baja · **CWE-352** (falta de verificación de intención)

### Evidencia

| Endpoint | Efecto |
|---|---|
| `POST /api/unlink` | Borra `auth_info/` y **todos los contactos** ([`routes/status.js:22-45`](../server/src/routes/status.js#L22)) |
| `DELETE /api/contacts` | Borra la tabla completa de contactos |
| `DELETE /api/agenda` | Borra la agenda importada completa |
| `POST /api/agenda/reset-checks` | Invalida todas las verificaciones de WhatsApp |

Ninguno pide confirmación en el servidor ni registra quién lo ejecutó, y todos son idempotentes
respecto a la sesión: un token válido basta.

### Impacto

Un token filtrado (SEC-001, SEC-004, SEC-010) permite destruir en una petición todo el trabajo
de importación y verificación de la agenda, y forzar la regeneración del QR — que es
precisamente el momento en que SEC-003 se vuelve explotable. La combinación
`POST /api/unlink` + WebSocket anónimo es una **cadena de ataque completa para el secuestro de
la cuenta**.

### Solución

- Exigir reautenticación (contraseña actual en el cuerpo) para las operaciones destructivas.
- Registrar en un log de auditoría: usuario, IP, marca de tiempo y acción.
- Aplicar el rate limiting estricto de SEC-021.
- Convertir el borrado en lógico (`deleted_at`) con purga diferida a 30 días, para permitir
  recuperación.

```js
router.post('/api/unlink', limiteEstricto, requiereReautenticacion, async (req, res, next) => {
  logger.warn({ user: req.user.username, ip: req.ip }, 'Desvinculación de WhatsApp solicitada');
  …
});
```
