# 03 — Plan de remediación

Roadmap priorizado por relación impacto/esfuerzo. Cada fase es independiente y deja el sistema
en un estado mejor que el anterior.

| Fase | Objetivo | Esfuerzo | Hallazgos que cierra |
|---|---|---|---|
| **Fase 0** | Contención inmediata | ~2 h | SEC-001, SEC-002, SEC-003, SEC-005 |
| **Fase 1** | Endurecimiento base | ~1 día | SEC-004, SEC-006 – SEC-010, SEC-024 |
| **Fase 2** | Robustez y datos | ~2-3 días | SEC-011 – SEC-018, SEC-020 – SEC-023, SEC-025 |
| **Fase 3** | Calidad sostenible | ~1 semana | SEC-019 + deuda técnica (doc. 04) |

---

## Fase 0 — Contención inmediata (hoy)

> Estas cuatro acciones eliminan las vías de compromiso total. Si sólo se hace una cosa de
> todo este informe, que sea esta fase.

### 0.1 Rotar todos los secretos

```bash
# Generar un secreto nuevo
openssl rand -base64 48

# Generar el hash de una contraseña nueva (no reutilices la anterior)
cd server && npm i bcrypt
node -e "console.log(require('bcrypt').hashSync(process.argv[1], 12))" 'TU_NUEVA_PASSWORD'
```

Escribir el resultado en `.env` (que **no** está versionado) y limpiar `.env.example`:

```bash
cat > /home/yamiddevofic/Projects/auto-whatsapp/.env.example <<'EOF'
PORT=3001
SESSION_NAME=whatsapp
BIND_ADDR=127.0.0.1
DATA_DIR=/var/lib/auto-whatsapp
ALLOWED_ORIGIN=https://tu-dominio.example.com

AUTH_USERNAME=
AUTH_PASSWORD_HASH=     # node -e "console.log(require('bcrypt').hashSync(process.argv[1],12))" 'PASSWORD'
AUTH_SECRET=            # openssl rand -base64 48

NODE_ENV=production
LOG_LEVEL=info
EOF
```

- [ ] `AUTH_SECRET` nuevo, ≥ 32 caracteres, sólo en `.env`
- [ ] Contraseña nueva, hasheada con bcrypt
- [ ] Contraseña antigua rotada en cualquier otro servicio donde se reutilizara
- [ ] `.env.example` sin valores reales
- [ ] Verificar que `.env` está en `.gitignore` (ya lo está)

### 0.2 Eliminar los valores por defecto del código

`server/src/auth.js` y `server/src/routes/auth.js`: el proceso debe fallar al arrancar si
faltan las variables. Código completo en
[SEC-001](02-hallazgos-seguridad.md#sec-001--secreto-de-firma-jwt-hardcodeado-y-público) y
[SEC-002](02-hallazgos-seguridad.md#sec-002--credenciales-reales-versionadas-en-el-repositorio).

### 0.3 Autenticar el WebSocket

Es el cambio de mayor impacto de todo el informe: cierra el vector de secuestro de la cuenta
de WhatsApp. Código completo en
[SEC-003](02-hallazgos-seguridad.md#sec-003--websocket-sin-autenticación-que-emite-el-qr-de-vinculación)
(servidor `index.js` + cliente `App.jsx`).

### 0.4 Corregir el orden de los middlewares

Mover `app.use('/api', authMiddleware)` **antes** de los cuatro middlewares de `multer`.
Es mover dos líneas de sitio y elimina la escritura anónima de archivos
([SEC-005](02-hallazgos-seguridad.md#sec-005--subida-de-archivos-sin-autenticación)).

### Verificación de la Fase 0

```bash
# 1. El WebSocket ya no acepta conexiones anónimas
node -e "
  const io = require('socket.io-client');
  const s = io('http://localhost:3001');
  s.on('connect',       () => { console.error('FALLO: conectó sin token'); process.exit(1); });
  s.on('connect_error', e  => { console.log('OK: rechazado —', e.message); process.exit(0); });
"

# 2. La subida anónima devuelve 401 (y no deja archivos)
before=$(ls uploads | wc -l)
curl -s -o /dev/null -w '%{http_code}\n' -F "image=@/tmp/test.png" http://localhost:3001/api/messages
[ "$(ls uploads | wc -l)" -eq "$before" ] && echo "OK: no se escribió ningún archivo"

# 3. Un token firmado con el secreto antiguo ya no sirve
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $(node -e "console.log(require('jsonwebtoken').sign({username:'yamiddev'},'auto-whatsapp-secret-key-2024'))")" \
  http://localhost:3001/api/messages     # debe ser 401
```

---

## Fase 1 — Endurecimiento base (esta semana)

### 1.1 TLS y nginx correcto

```bash
sudo certbot --nginx -d tu-dominio.example.com
```

Reemplazar `auto-whatsapp-nginx.conf` por la versión de
[SEC-024](02-hallazgos-seguridad.md#sec-024--configuración-de-nginx-incompleta-e-insegura),
que añade HTTPS, el proxy de `/socket.io/`, las cabeceras `X-Forwarded-*` y las cabeceras de
seguridad.

### 1.2 Express sólo en localhost

```js
// server/src/index.js
httpServer.listen(config.port, process.env.BIND_ADDR || '127.0.0.1', () => {
  console.log(`[Server] Escuchando en ${process.env.BIND_ADDR || '127.0.0.1'}:${config.port}`);
});
```

Cierra el acceso directo al puerto 3001, dejando nginx+TLS como única entrada.

### 1.3 Instalar y configurar las defensas estándar

```bash
cd server && npm i helmet express-rate-limit bcrypt zod
```

```js
// server/src/index.js — orden final de middlewares
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

app.set('trust proxy', 1);
app.use(helmet({ /* ver SEC-010 */ }));
app.use(cors({ /* lista blanca, ver SEC-009 */ }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));

app.use('/api/auth', authRoutes());          // público (con su propio limitador estricto)
app.use('/api', authMiddleware);             // ← autenticación

app.use('/api/messages',        uploadOnPost(upload.single('image')));
app.use('/api/status-updates',  uploadOnPost(upload.array('images', 20)));
app.use('/api/direct-messages', uploadOnPost(upload.single('image')));
app.use('/api/agenda/import',   uploadOnPost(vcfUpload.single('vcf')));

app.use(statusRoutes, groupsRoutes, messagesRoutes, statusUpdatesRoutes,
        contactsRoutes, agendaRoutes, directMessagesRoutes, publishedStatusesRoutes);

app.use('/uploads', authMiddleware, express.static(config.uploadsDir, { /* ver SEC-006 */ }));
app.use(express.static(config.clientDist));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('*', (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));

app.use(errorHandler);                       // ← siempre el último
```

### 1.4 Login endurecido

Rate limiting + bcrypt + comparación de tiempo constante, según
[SEC-007](02-hallazgos-seguridad.md#sec-007--login-sin-rate-limiting-ni-hash-de-contraseña).

### 1.5 Actualizar dependencias

```bash
cd server && npm audit fix && npm audit
cd ../client && npm audit fix && npm audit
```

Verificar que Baileys queda en `>= 6.7.22` y probar la vinculación de extremo a extremo, ya
que es un salto en la librería central. Detalle en [05 — Dependencias](05-dependencias.md).

### Checklist de la Fase 1

- [ ] HTTPS activo, HTTP redirige, HSTS presente
- [ ] `/socket.io/` proxeado correctamente por nginx
- [ ] Express escuchando en `127.0.0.1`
- [ ] `helmet` con CSP activa (comprobar que la SPA y el QR `data:` siguen funcionando)
- [ ] CORS con lista blanca
- [ ] Login con bcrypt y máximo 5 intentos / 15 min
- [ ] `/uploads` requiere autenticación y usa nombres aleatorios
- [ ] `npm audit` sin vulnerabilidades altas ni críticas

---

## Fase 2 — Robustez y protección de datos

### 2.1 Manejo de errores centralizado

Crear `server/src/middleware/error-handler.js`
([SEC-012](02-hallazgos-seguridad.md#sec-012--filtración-de-errores-internos-al-cliente)) y
sustituir los 9 bloques `catch { res.status(500).json({ error: err.message }) }` por
`catch (err) { next(err) }`.

### 2.2 Validación con esquemas

Crear `server/src/schemas.js` y `server/src/middleware/validate.js`
([SEC-013](02-hallazgos-seguridad.md#sec-013--ausencia-total-de-validación-de-entrada)), y
aplicarlos a los 27 endpoints. Empezar por los que reciben datos de usuario:
`POST /api/messages`, `POST /api/direct-messages`, `POST /api/status-updates`.

### 2.3 Límites de envío masivo

Tope de destinatarios en `/send-now`, consulta del límite diario y retardo aleatorio también
en la ruta inmediata
([SEC-014](02-hallazgos-seguridad.md#sec-014--sin-límite-de-destinatarios-abuso-de-envío-masivo)).

### 2.4 Datos fuera del árbol web

```bash
sudo install -d -o auto-whatsapp -g auto-whatsapp -m 700 /var/lib/auto-whatsapp
sudo mv auth_info uploads data.db /var/lib/auto-whatsapp/
sudo chown -R auto-whatsapp:auto-whatsapp /var/lib/auto-whatsapp
sudo chmod 600 /var/lib/auto-whatsapp/data.db
```

Con `DATA_DIR=/var/lib/auto-whatsapp` en `.env` y el `config.js` de
[SEC-015](02-hallazgos-seguridad.md#sec-015--secretos-en-reposo-sin-protección).

### 2.5 Copias de seguridad

```bash
# /etc/cron.daily/auto-whatsapp-backup
#!/bin/sh
set -eu
DEST=/var/backups/auto-whatsapp
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d)
tar czf - -C /var/lib/auto-whatsapp data.db auth_info \
  | gpg --batch --yes --encrypt --recipient tu@correo.example \
  > "$DEST/backup-$STAMP.tar.gz.gpg"
find "$DEST" -name 'backup-*.gpg' -mtime +30 -delete
```

> `auth_info/` son las credenciales de la sesión de WhatsApp: la copia **debe** ir cifrada.

### 2.6 Logs sin datos personales

Adoptar `pino` con `redact`
([SEC-017](02-hallazgos-seguridad.md#sec-017--datos-personales-en-los-logs)) y sustituir todos
los `console.log`.

### 2.7 Resto de la fase

- [ ] `uncaughtException` que termina el proceso (SEC-011)
- [ ] Validación de imágenes por *magic bytes* (SEC-018)
- [ ] Vida del token reducida + verificación de `exp` en el cliente (SEC-020)
- [ ] Nombres de archivo aleatorios (SEC-022)
- [ ] Borrado de adjuntos + limpieza diaria de huérfanos (SEC-023)
- [ ] Reautenticación y auditoría en endpoints destructivos (SEC-025)

---

## Fase 3 — Calidad sostenible

### 3.1 Migrar de `sql.js` a `better-sqlite3`

Es el cambio con mayor retorno en fiabilidad. La API es prácticamente idéntica a la fachada
que ya existe en `db.js`, así que el resto del código no cambia:

```bash
cd server && npm rm sql.js && npm i better-sqlite3
```

```js
// server/src/db.js — sustituye toda la clase Statement y la función save()
import Database from 'better-sqlite3';
import config from './config.js';

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');     // aquí sí tiene efecto real
db.pragma('foreign_keys = ON');

export async function initDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS messages (…)`);
  // … resto de tablas, sin cambios
  return db;
}

export default db;
```

Beneficios: escrituras atómicas reales (no se reescribe el archivo entero), transacciones
seguras, sin riesgo de truncamiento, y rendimiento O(1) por operación en vez de O(tamaño BD).

### 3.2 Romper la dependencia circular

Hoy `whatsapp.js`, `scheduler.js` y los routers importan `io` desde `index.js`, que a su vez
los importa a ellos. Extraer el bus de eventos:

```js
// server/src/realtime.js
let io = null;
export const setIO = (instance) => { io = instance; };
export const emit  = (evento, datos) => io?.emit(evento, datos);
```

`index.js` llama a `setIO(io)` tras crear el servidor; el resto importa `emit` desde
`realtime.js`.

### 3.3 Pruebas automatizadas

```bash
cd server && npm i -D vitest supertest
```

Prioridad de cobertura, de mayor a menor valor:

1. **Autenticación**: token ausente / inválido / caducado → 401 en cada grupo de rutas.
2. **Validación**: cuerpos malformados → 400, no 500.
3. **`parseVCF`**: es lógica pura y compleja; casos con *folding*, `QUOTED-PRINTABLE`, varios
   teléfonos, VCF vacío.
4. **`normalizePhone`** y `checkOnWhatsApp` con Baileys simulado.
5. **Programación**: fechas pasadas, atrasadas < 10 min, futuras.

```js
// server/test/auth.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

describe('autenticación', () => {
  it('rechaza peticiones sin token', async () => {
    await request(app).get('/api/messages').expect(401);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const falso = jwt.sign({ username: 'x' }, 'secreto-incorrecto');
    await request(app).get('/api/messages').set('Authorization', `Bearer ${falso}`).expect(401);
  });

  it('no escribe archivos en peticiones no autenticadas', async () => {
    const antes = fs.readdirSync(config.uploadsDir).length;
    await request(app).post('/api/messages').attach('image', 'test/fixtures/a.png').expect(401);
    expect(fs.readdirSync(config.uploadsDir).length).toBe(antes);
  });
});
```

> Para que esto sea posible hay que exportar `app` desde `index.js` y mover el `listen()` a un
> `server.js` separado — un refactor pequeño que además mejora la estructura.

### 3.4 Integración continua

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }

      - run: cd server && npm ci
      - run: cd server && npm audit --audit-level=high
      - run: cd server && npx eslint src
      - run: cd server && npm test

      - run: cd client && npm ci
      - run: cd client && npm audit --audit-level=high
      - run: cd client && npm run build
```

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /server
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /client
    schedule: { interval: weekly }
```

### 3.5 Supervisión con systemd

Sustituir `start.sh` (tmux + `while true`) por una unidad real:

```ini
# /etc/systemd/system/auto-whatsapp.service
[Unit]
Description=Auto WhatsApp
After=network-online.target

[Service]
Type=simple
User=auto-whatsapp
WorkingDirectory=/opt/auto-whatsapp
EnvironmentFile=/etc/auto-whatsapp/env
ExecStart=/usr/bin/node server/src/index.js
Restart=always
RestartSec=5

# Aislamiento
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/auto-whatsapp
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now auto-whatsapp
journalctl -u auto-whatsapp -f
```

Aporta reinicio con backoff, arranque en el boot, logs rotados y aislamiento del sistema de
archivos — todo lo que el bucle de tmux no da.

### 3.6 Decisión sobre multiusuario

Resolver [SEC-019](02-hallazgos-seguridad.md#sec-019--sin-control-de-autorización-por-recurso):
o se elimina la columna `user_id` y se documenta que el sistema es monousuario, o se implementa
el aislamiento completo con pruebas que lo verifiquen. Dejarlo a medias es la peor opción.

---

## Resumen de dependencias a añadir

```bash
cd server && npm i helmet express-rate-limit bcrypt zod file-type
cd server && npm rm sql.js && npm i better-sqlite3
cd server && npm i -D vitest supertest eslint
```

## Tabla de seguimiento

> **Estado al 14 de octubre de 2026.** ✅ corregido y verificado · ◐ parcial · ☐ pendiente.
> El detalle de lo aplicado está en [07 — Correcciones aplicadas](07-correcciones-aplicadas.md).

| ID | Severidad | Fase | Estado |
|---|:---:|:---:|:---:|
| SEC-001 Secreto JWT público | 🔴 | 0 | ✅ |
| SEC-002 Credenciales versionadas | 🔴 | 0 | ✅ |
| SEC-003 WebSocket sin auth (QR) | 🔴 | 0 | ✅ |
| SEC-005 Subida sin auth | 🟠 | 0 | ✅ |
| SEC-004 HTTP plano | 🔴 | 1 | ◐ |
| SEC-006 `/uploads` público | 🟠 | 1 | ✅ |
| SEC-007 Login sin rate limit | 🟠 | 1 | ✅ |
| SEC-008 Dependencias vulnerables | 🟠 | 1 | ✅ |
| SEC-009 CORS abierto | 🟠 | 1 | ✅ |
| SEC-010 Sin cabeceras de seguridad | 🟠 | 1 | ✅ |
| SEC-024 nginx incompleto | 🔵 | 1 | ✅ |
| SEC-011 `uncaughtException` | 🟡 | 2 | ✅ |
| SEC-012 Errores filtrados | 🟡 | 2 | ✅ |
| SEC-013 Sin validación | 🟡 | 2 | ✅ |
| SEC-014 Envío masivo sin límite | 🟡 | 2 | ✅ |
| SEC-015 Secretos en reposo | 🟡 | 2 | ✅ |
| SEC-016 Docker inseguro | 🟡 | 2 | ☐ |
| SEC-017 PII en logs | 🟡 | 2 | ✅ |
| SEC-018 Validación por extensión | 🟡 | 2 | ◐ |
| SEC-020 Sesiones sin revocación | 🟡 | 2 | ✅ |
| SEC-021 Límites de cuerpo | 🟡 | 2 | ✅ |
| SEC-022 Colisión de nombres | 🔵 | 2 | ✅ |
| SEC-023 Archivos huérfanos | 🔵 | 2 | ✅ |
| SEC-025 Endpoints destructivos | 🔵 | 2 | ✅ |
| SEC-019 Sin autorización por recurso | 🟡 | 3 | ☐ |
