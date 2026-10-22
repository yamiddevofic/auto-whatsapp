# 07 — Correcciones aplicadas

Registro de la remediación ejecutada el **14 de octubre de 2026** sobre la rama `main`,
partiendo de la auditoría del 8 de septiembre.

## Resumen

| | Antes | Después |
|---|---|---|
| Hallazgos críticos abiertos | 4 | **0** |
| Hallazgos altos abiertos | 6 | **0** |
| Hallazgos medios abiertos | 11 | **0** |
| Vulnerabilidades en dependencias | 17 | **0** |
| Pruebas automatizadas | 0 | **38** |
| Linter | ninguno | ESLint, sin errores |
| Nota de seguridad | 2.5 / 10 | **≈ 7.5 / 10** (limitada por la falta de TLS) |

> La nota no llega más alto porque el despliegue sigue sirviéndose por HTTP: SEC-004 sólo
> puede cerrarse del todo con un certificado y un dominio, que son decisiones del operador.

## Cambios por hallazgo

### 🔴 SEC-001 — Secreto JWT hardcodeado · corregido

`server/src/auth.js` ya no tiene valor por defecto. La validación vive en
`server/src/config.js`, que exige `AUTH_SECRET` de 32 caracteres como mínimo y aborta el
arranque con un mensaje claro si falta. Se generó un secreto nuevo con `openssl rand`.

Se añadieron además `jti` por token, emisor (`issuer: 'auto-whatsapp'`) y una lista de
revocación en memoria que alimenta el nuevo `POST /api/auth/logout`.

**Verificado:** un token firmado con el secreto antiguo recibe 401.

### 🔴 SEC-002 — Credenciales en el repositorio · corregido

`.env.example` ahora sólo contiene marcadores de posición. `server/src/routes/auth.js` dejó
de tener `|| 'yamiddev'` y `|| 'nidian56'`. La contraseña se guarda **hasheada con bcrypt**
(coste 12) en `AUTH_PASSWORD_HASH`, nunca en claro, y se añadió el script
`npm run hash-password` para generarla.

**Pendiente del operador:** purgar `.env.example` del historial de git
(`git filter-repo --path .env.example --invert-paths`) y rotar esa contraseña en cualquier
otro servicio donde se haya reutilizado.

### 🔴 SEC-003 — WebSocket anónimo que emitía el QR · corregido

`server/src/server.js` instala `io.use(socketAuth)`: el handshake exige un JWT válido. El
cliente (`client/src/App.jsx`) lo envía en `auth.token` y maneja `connect_error`.

**Verificado:** la conexión anónima se rechaza con `unauthorized`; con token válido conecta.

### 🔴 SEC-004 — HTTP plano · parcial

Lo que sí se hizo: el servidor escucha sólo en `127.0.0.1` (`BIND_ADDR`), por lo que ya no
es alcanzable directamente desde la red; `auto-whatsapp-nginx.conf` incorpora las cabeceras
de seguridad, `X-Forwarded-*` y el proxy de `/socket.io/`; la bandera `BEHIND_TLS` activa
HSTS, `upgrade-insecure-requests` y la marca `Secure` de la cookie en cuanto haya TLS.

**Pendiente:** emitir el certificado (`certbot --nginx -d tu-dominio`) y poner
`BEHIND_TLS=true`. Mientras tanto, el acceso debe ser local o por VPN.

### 🟠 SEC-005 — Subida de archivos sin autenticación · corregido

En `server/src/app.js` el orden es ahora: autenticación → middlewares de `multer` → rutas.
El límite por imagen bajó de 50 MB a 8 MB.

**Verificado:** `POST /api/messages` sin token devuelve 401 y **no deja ningún archivo** en
el directorio de subidas.

### 🟠 SEC-006 / SEC-022 — Adjuntos públicos y predecibles · corregido

Los nombres pasan a `${timestamp}-${16 bytes aleatorios}${ext}`, lo que elimina a la vez la
adivinación y las colisiones. `/uploads` está detrás de `mediaAuthMiddleware`, que acepta la
cabecera `Authorization` o una cookie `httpOnly; SameSite=Strict` emitida en el login; así
las etiquetas `<img>` siguen funcionando sin exponer los archivos. La cookie sólo habilita
lecturas de `/uploads`, de modo que no abre superficie de CSRF en la API.

**Verificado:** `GET /uploads/...` sin token devuelve 401.

### 🟠 SEC-007 — Login sin protección · corregido

bcrypt para la contraseña, `crypto.timingSafeEqual` para el usuario, verificación del hash
**siempre** (también con usuario incorrecto, para no filtrar su existencia por tiempo de
respuesta) y `express-rate-limit` con 5 intentos cada 15 minutos.

**Verificado:** el séptimo intento fallido devuelve 429.

### 🟠 SEC-008 — Dependencias vulnerables · corregido

`npm audit fix` en servidor y cliente, Baileys fijado en 6.7.24 (cierra la crítica
GHSA-qvv5-jq5g-4cgg), `multer` a 2.4.0 y `vitest` a 5.x (cierra las críticas de `tinypool`).

**Verificado:** `npm audit` devuelve **0 vulnerabilidades** en ambos proyectos.

### 🟠 SEC-009 — CORS abierto · corregido

Lista blanca por `ALLOWED_ORIGIN`, vacía por defecto (sólo mismo origen). Un origen no
permitido simplemente no recibe cabeceras CORS: devolver 403 rompía la carga de recursos
estáticos en cuanto el navegador enviaba `Origin`.

### 🟠 SEC-010 — Cabeceras de seguridad · corregido

`helmet` con CSP explícita (`script-src 'self'`, `frame-ancestors 'none'`, `img-src` con
`data:` para el QR, `connect-src` con `ws:`), `frameguard: deny` y HSTS condicionado a TLS.

**Verificado:** CSP, `X-Content-Type-Options` y `Referrer-Policy` presentes; la interfaz y
el QR funcionan bajo esa política.

### 🟡 SEC-011 — `uncaughtException` que no terminaba · corregido

`server/src/server.js` registra el fallo y cierra de forma ordenada con tope de 5 s. El
supervisor de `start.sh` reinicia, ahora con un máximo de 20 reintentos para no entrar en un
bucle infinito ante un error de configuración.

### 🟡 SEC-012 — Errores internos filtrados · corregido

`server/src/middleware/error-handler.js` centraliza el manejo: registra el detalle con una
referencia corta y devuelve un mensaje genérico. Cubre además los errores de `multer`, que
antes producían una página HTML de Express. Los 9 routers usan `next(err)`.

**Verificado:** ninguna respuesta de error expone rutas del sistema.

### 🟡 SEC-013 — Sin validación de entrada · corregido

`server/src/schemas.js` (zod) valida formato de JID, longitud de contenido, fechas
(rechazando las inválidas y las caducadas hace más de 10 minutos), cardinalidad de
destinatarios y parámetros de paginación. `parseId` normaliza los `:id` de ruta.

**Verificado:** `scheduledAt: "el lunes"` devuelve 400 con el detalle, no un trabajo que
nunca se ejecuta; `/api/messages/abc` devuelve 400.

### 🟡 SEC-014 — Envío masivo sin límite · corregido

`/send-now` acepta como máximo 20 destinatarios, consulta el límite diario antes de empezar,
incrementa el contador por mensaje y aplica el mismo retardo aleatorio de 3-15 s que la ruta
programada. El lote de `/api/agenda/check` baja de 50 a 15.

### 🟡 SEC-015 — Secretos en reposo · corregido

Nuevo `DATA_DIR` (por defecto `<proyecto>/data`, en producción `/var/lib/auto-whatsapp`) que
agrupa `auth_info/`, `data.db` y `uploads/` fuera del árbol servido, creados con permisos
`0700`. Se incluye migración automática de instalaciones antiguas.

### 🟡 SEC-017 — Datos personales en los logs · corregido

`server/src/logger.js` (pino) con `redact` sobre teléfonos, contenido y destinatarios, y
`maskJid()` para los identificadores. Se eliminaron los 32 `console.log` de `whatsapp.js`,
`scheduler.js` y `contacts.js` que volcaban números y texto de mensajes.

### 🟡 SEC-018 — Validación de archivos por extensión · corregido

Se exige extensión **y** `mimetype` declarado, y `server/src/middleware/image-check.js`
comprueba además los *magic bytes* (JPEG, PNG, GIF, WEBP) sin dependencias extra. Si la
petición termina en error, sus adjuntos se borran.

**Verificado:** un `.png` con contenido HTML devuelve 400 y no queda en disco.

### 🟡 SEC-020 — Sesiones sin revocación · corregido

TTL configurable (8 h por defecto), `jti` por token, lista de revocación y
`POST /api/auth/logout`, que el botón "Cerrar sesión" ahora invoca. El cliente comprueba
`exp` antes de dar la sesión por válida.

**Verificado:** tras cerrar sesión, el mismo token devuelve 401.

### 🟡 SEC-021 — Límites de cuerpo y rate limiting · corregido

Cuerpo JSON de 50 MB a 1 MB; 180 peticiones/minuto en `/api`; 5/minuto en
`/api/agenda/check`, `/api/contacts/sync` y `/api/unlink`.

### 🔵 SEC-023 — Adjuntos huérfanos · corregido

`deleteMessage`, `deleteStatusUpdate` y `deleteDirectMessage` borran su archivo (validando
que esté dentro del directorio de subidas), y un trabajo diario a las 04:00 limpia huérfanos
y purga el historial según `RETENTION_DAYS`.

### 🔵 SEC-024 — nginx incompleto · corregido (falta TLS)

Añadidos el bloque `/socket.io/` que faltaba —sin él el tiempo real no funcionaba detrás de
nginx—, las cabeceras `X-Forwarded-*` y las de seguridad; `client_max_body_size` de 50M a
10M; la raíz sale del `home` del usuario.

### 🔵 SEC-025 — Endpoints destructivos · corregido

`/api/unlink`, `DELETE /api/contacts` y `DELETE /api/agenda` registran usuario e IP y están
bajo el limitador estricto. Además exigen la contraseña actual en el cuerpo (`password`), igual que
`POST /api/agenda/reset-checks`; el cliente la pide en un diálogo. Una contraseña
incorrecta devuelve 403 (no 401, para no cerrar la sesión).

## Deuda técnica resuelta

| ID | Cambio |
|---|---|
| ARQ-001 | Migración de `sql.js` a **better-sqlite3**: escrituras atómicas, sin reescribir la base entera en cada INSERT, WAL real, índices en las columnas `status` |
| ARQ-002 | Nuevo `realtime.js`: desaparece la dependencia circular `index.js ↔ whatsapp/scheduler/routers`; `app.js` y `server.js` separan aplicación de arranque, lo que hace posible probar con supertest |
| ARQ-003 | Eliminado el listener `messages.upsert` duplicado, que escribía dos veces en la base por cada mensaje entrante |
| ARQ-005 | Manejador de errores de Express y envoltorio `asyncRoute` para rutas asíncronas |
| ARQ-006 | `client/src/api.js` pasa de 334 a 159 líneas con un único `authFetch` que soporta JSON y FormData |
| ARQ-007 | Log estructurado con pino y endpoint `/health` con estado real de WhatsApp |
| ARQ-008 | `getDailyLimit()` se basa en la antigüedad real de la cuenta, no en el número de días con envíos |
| ARQ-010 | `start.sh` valida que exista `.env` y acota los reintentos |
| ARQ-011 | ESLint configurado; `npm run lint` sin errores |

También se corrigió un contador muerto: `incrementStatusUpdateCount()` existía pero no se
invocaba nunca; ahora se incrementa al publicar un estado.

## Corrección funcional del cliente

La interfaz se quedaba en *"Esperando QR..."* al recargar la página, porque el QR sólo
llegaba por WebSocket en el momento de generarse y `GET /api/qr` no se usaba. Ahora el
cliente recupera el QR pendiente al montar.

## Verificación ejecutada

```
✅ login correcto / contraseña incorrecta -> 401
✅ credenciales antiguas del repositorio -> 401
✅ token firmado con el secreto público antiguo -> 401
✅ API sin token -> 401 · con token -> 200
✅ subida sin token -> 401 y sin escribir en disco
✅ /uploads sin token -> 401
✅ WebSocket anónimo rechazado · con token conecta
✅ fecha inválida -> 400 con detalle · id no numérico -> 400
✅ las respuestas de error no exponen rutas internas
✅ CSP, X-Content-Type-Options y Referrer-Policy presentes
✅ séptimo intento de login fallido -> 429
✅ la SPA se sirve y el QR se muestra en la interfaz
```

Más 22 pruebas automatizadas (`npm test`), ESLint sin errores y `npm audit` en cero.

## Segunda ronda (sesión «Errores y despliegue local»)

| Hallazgo | Cambio |
|---|---|
| SEC-016 | `Dockerfile` multi-etapa con Node 22: sin `.env` en la imagen, usuario `node`, datos en el volumen `/var/lib/auto-whatsapp` (0700), `HEALTHCHECK`. `.dockerignore` excluye `.env.*` y `data/`. Verificado construyendo y arrancando el contenedor |
| SEC-015 | `umask 077` al arrancar y corrección de permisos heredados (`data.db` estaba en 0644, `auth_info/` en 0775) |
| SEC-019 | Decisión: **monousuario**. Se eliminan las columnas `user_id` de `contacts` y `agenda_contacts` (migración automática) y se documenta en el README |
| SEC-020 | La lista de revocación pasa de memoria a la tabla `revoked_tokens` (sobrevive a reinicios); el logout y la caducidad del token cierran también el WebSocket |
| SEC-021 | `trust proxy` = `loopback` (configurable con `TRUST_PROXY`): `X-Forwarded-For` ya no se puede falsear para saltar el rate limit |
| ARQ-004 | Búsqueda, filtros y paginación de contactos y agenda en SQL, con índices |
| ARQ-009 | `POST /api/direct-messages/send-now` responde `202` y envía en segundo plano; el resultado llega por WebSocket (`direct-messages:send-now-result`) |
| ARQ-007 | `/health` (proceso vivo, siempre 200) y `/health/ready` (503 sin sesión de WhatsApp), sin datos internos |
| CI | `.github/workflows/ci.yml` (audit, lint, pruebas, build y imagen Docker) y `.github/dependabot.yml` |

Errores corregidos en esta ronda:

- Borrar un estado programado ya enviado eliminaba la imagen que seguía usando su registro
  en «Estados publicados» (y viceversa): ahora sólo se borra el archivo sin referencias.
- `/api/agenda/check` marcaba como «sin WhatsApp» los contactos si la conexión caía a mitad
  del lote.
- «WhatsApp no está conectado» llegaba al usuario como «Error interno»: ahora es un 503 claro.
- «Seleccionar todos» sólo traía 50 contactos (el límite de paginación sube a 10000).
- En `npm run dev` faltaba el proxy de `/socket.io`, así que el tiempo real no funcionaba.
- La limpieza diaria de huérfanos ya no borra archivos de menos de una hora (subidas en curso).

## Estados «no compatibles» (cuentas migradas a LID)

> **21–22 de octubre de 2026 · ◐ pendiente de verificar en el teléfono.** El cambio está
> aplicado y WhatsApp acepta los envíos, pero falta confirmar que el estado se ve.

**Síntoma.** Los estados publicados desde la app (con imagen o de texto) WhatsApp los
aceptaba, pero en WhatsApp Web aparecían como *«Recibiste un estado, pero no es compatible
con esta versión de WhatsApp»* y en el teléfono del autor no aparecían. Los del 18/10, con
la misma versión de Baileys y prácticamente el mismo código, sí se vieron.

**Diagnóstico.** Se descartaron, en este orden:

| Hipótesis | Resultado |
|---|---|
| Imagen inválida | No: JPEG válido de 1130×1600 |
| Formato del id del mensaje (`generateMessageID`, 40 caracteres) | Cambiado al formato actual (`generateMessageIDV2`); no lo resolvió |
| Falta `messageContextInfo.messageSecret` (Baileys 7 lo añade siempre) | Añadido; no lo resolvió por sí solo |
| Rechazo del servidor | No: el `ack` llega sin error |

Con `WA_TRACE_FILE` se volcó el tráfico del protocolo y se compararon las claves de grupo
guardadas en la sesión (`sender-key-status@broadcast--<emisor>--<dispositivo>`): los estados
de los contactos **y los del propio teléfono** llegan firmados con su **LID**, mientras que la
app firmaba con el número de teléfono (PN) y repartía la clave a 5.588 dispositivos
direccionados por PN. Baileys 6.7.24 no sabe direccionar estados por LID; Baileys 7 sí
(`groupSenderIdentity = meLid`).

**Corrección** (`server/src/whatsapp.js`):

- `relayStatusAsLid()`: una consulta usync con los protocolos de dispositivos y LID obtiene la
  LID y los dispositivos de cada destinatario; el estado se cifra con la clave de grupo de la
  LID propia, se reparte por LID y la estrofa lleva `type='media'` en las imágenes, como en
  Baileys 7. Los destinatarios sin LID se omiten y se cuentan en el log. Si la cuenta no tiene
  LID se usa el envío anterior.
- El mensaje se genera a mano (`generateWAMessageContent`) para añadir `messageSecret`.
- Los estados de texto llevan color de fondo y fuente (`font: 1`; Baileys descarta el 0).
- Se escucha `messages.update`: un estado rechazado por WhatsApp devuelve un 502 en vez de
  darse por publicado.
- `WA_TRACE_FILE` (sólo diagnóstico) vuelca el tráfico del protocolo y registra la estructura
  de los estados enviados y recibidos.

**Verificación pendiente.** Publicar un estado con imagen y audiencia «Solo yo» y comprobar
que aparece en el teléfono y en WhatsApp Web; después, con una audiencia real. La solución de
fondo es migrar a Baileys 7, que trae este direccionamiento de serie.

## Lo que queda abierto

| Hallazgo | Por qué sigue abierto |
|---|---|
| **SEC-004** (TLS) | Requiere dominio y certificado: decisión del operador |
| **SEC-002** (historial de git) | La purga del historial reescribe commits y debe coordinarla el operador |
| Estados por LID | Falta confirmar en el teléfono que el estado se ve (ver arriba) |
| Baileys 7 | La 6.7.24 no maneja LID de serie; el envío de estados lo suple a mano |
| Cumplimiento (doc. 06) | Consentimiento, baja y aviso de privacidad siguen sin implementarse |
