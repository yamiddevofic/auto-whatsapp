# Auto WhatsApp

Plataforma de automatización de WhatsApp con interfaz web. Programa mensajes a grupos, publica estados, gestiona contactos de grupos y agenda, y envía mensajes directos a contactos seleccionados.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Funcionalidades

### Mensajes programados a grupos
- Envía mensajes de texto e imagen a cualquier grupo de WhatsApp
- Programación por fecha y hora exacta
- Los grupos de comunidades se agrupan automáticamente en el selector
- Historial de mensajes enviados, pendientes y fallidos

### Estados de WhatsApp
- Publica estados de texto, imagen o ambos
- Programación o envío inmediato
- Audiencia a elegir: todos, sólo agenda verificada, sólo contactos de grupos, los miembros
  de grupos concretos o «Solo yo» (para probar sin que lo vea nadie más)
- Vista previa de enlaces en estados de texto y mensajes
- Si WhatsApp rechaza un estado, la interfaz lo informa en vez de darlo por publicado

### Contactos de grupos
- Sincronización automática de participantes de todos tus grupos
- Muestra nombre, número y de qué grupo proviene cada contacto
- Nombres cruzados con la agenda para mostrar el nombre real
- Selección individual o masiva para enviar mensajes directos

### Contactos de agenda
- Importa tus contactos desde un archivo `.vcf` (exportado desde tu teléfono)
- Verifica cuáles están en WhatsApp con código de país configurable
- Filtros: todos, en WhatsApp, sin WhatsApp, sin verificar
- Selección de contactos para envío de mensajes directos

### Mensajes directos
- Envía mensajes programados a contactos individuales seleccionados
- Funciona desde contactos de grupos o contactos de agenda
- Selección individual, por página o todos de una vez

### Gestión de conexión
- Autenticación por código QR
- Reconexión automática con backoff exponencial
- Desvinculación y re-vinculación sin reiniciar el servidor

## Requisitos

- Node.js 18 o superior
- npm

## Instalación

```bash
git clone git@github.com:yamiddevofic/auto-whatsapp.git
cd auto-whatsapp

# Dependencias del servidor
cd server && npm install && cd ..

# Dependencias del cliente
cd client && npm install && cd ..
```

## Configuración (obligatoria)

El servidor **no arranca sin un archivo `.env`**: no existen credenciales ni secretos por
defecto en el código.

```bash
cp .env.example .env

# 1. Secreto de firma de los tokens de sesión (mínimo 32 caracteres)
openssl rand -base64 48

# 2. Hash bcrypt de tu contraseña
cd server && npm run hash-password -- 'TuContraseñaSegura' && cd ..
```

Completa en `.env`:

| Variable | Descripción |
|---|---|
| `AUTH_USERNAME` | Usuario de acceso a la interfaz |
| `AUTH_PASSWORD_HASH` | Hash bcrypt generado arriba (nunca la contraseña en claro) |
| `AUTH_SECRET` | Secreto aleatorio de firma del JWT |
| `DATA_DIR` | Directorio de datos (sesión de WhatsApp, base de datos, adjuntos) |
| `BIND_ADDR` | Interfaz de escucha; `127.0.0.1` por defecto |
| `BEHIND_TLS` | `true` sólo si un proxy sirve la app por HTTPS |
| `ALLOWED_ORIGIN` | Orígenes CORS permitidos; vacío = sólo mismo origen |
| `RETENTION_DAYS` | Días de conservación del historial enviado |
| `LOG_LEVEL` | Nivel de log (`info` por defecto) |
| `TRUST_PROXY` | Valor de `trust proxy` de Express; `loopback` por defecto (nginx en la misma máquina) |
| `WA_TRACE_FILE` | Sólo diagnóstico: ruta donde volcar todo el tráfico del protocolo de WhatsApp. Déjala vacía en uso normal |

> `.env`, `.credenciales-local.txt` y el directorio de datos están en `.gitignore`.
> Nunca los subas al repositorio.

## Uso

```bash
bash start.sh
```

Compila el frontend y levanta el servidor en `http://127.0.0.1:3001` dentro de una sesión
tmux llamada `auto-whatsapp`.

1. Abre `http://127.0.0.1:3001` e inicia sesión con tus credenciales
2. Escanea el código QR con WhatsApp desde tu teléfono
3. Los grupos se cargan automáticamente al conectar

```bash
tmux attach -t auto-whatsapp        # ver logs (salir: Ctrl+B, D)
tmux kill-session -t auto-whatsapp  # detener
```

## Desarrollo y verificación

```bash
cd server
npm test          # pruebas de autenticación, validación, endurecimiento, audiencia de estados, vista previa de enlaces y parser VCF
npm run lint      # análisis estático
npm audit         # vulnerabilidades en dependencias
```

## Seguridad

El servidor escucha sólo en `127.0.0.1`. Para exponerlo a Internet hace falta un proxy
con TLS: `auto-whatsapp-nginx.conf` incluye la plantilla, pero **todavía sirve en HTTP
plano**. Hay que terminar TLS antes de publicarlo.

Medidas activas: autenticación con JWT y contraseña hasheada con bcrypt, límite de
intentos de login, WebSocket autenticado (el QR de vinculación nunca se emite a clientes
anónimos), adjuntos protegidos por token, cabeceras de seguridad con CSP, validación de
entrada por esquema, verificación del contenido real de las imágenes, límites de envío
anti-bloqueo y **contraseña obligatoria** (campo `password` en el cuerpo) para las
operaciones destructivas: desvincular, borrar contactos, borrar agenda y reiniciar
verificaciones. El sistema es **monousuario**: no hay aislamiento de datos entre usuarios.

La auditoría completa, con los hallazgos pendientes, está en [`Docs/`](Docs/README.md).

## Estructura del proyecto

```
auto-whatsapp/
├── client/                    # Frontend React + Vite
│   └── src/
│       ├── App.jsx            # Componente principal con tabs
│       ├── api.js             # Funciones de comunicación con el API
│       └── components/
│           ├── AgendaList.jsx          # Gestión de contactos de agenda
│           ├── ConnectionStatus.jsx    # Indicador de conexión
│           ├── ContactList.jsx         # Contactos de grupos
│           ├── DirectMessageForm.jsx   # Formulario de mensaje directo
│           ├── DirectMessageList.jsx   # Lista de mensajes directos
│           ├── GroupList.jsx           # Selector de grupos
│           ├── ImageUpload.jsx         # Carga de imágenes
│           ├── MessageForm.jsx         # Formulario de mensaje a grupo
│           ├── MessageList.jsx         # Lista de mensajes programados
│           ├── StatusForm.jsx          # Formulario de estado
│           └── StatusList.jsx          # Lista de estados programados
├── server/                    # Backend Node.js + Express
│   ├── test/                  # Pruebas (vitest + supertest)
│   ├── scripts/
│   │   └── hash-password.js   # Generador del hash bcrypt
│   └── src/
│       ├── index.js           # Carga del .env y arranque
│       ├── server.js          # Bootstrap: HTTP, WebSocket, trabajos
│       ├── app.js             # Aplicación Express y middlewares
│       ├── auth.js            # JWT, sesiones y autenticación
│       ├── realtime.js        # Emisión de eventos por WebSocket
│       ├── logger.js          # Log estructurado con redacción de datos
│       ├── schemas.js         # Esquemas de validación (zod)
│       ├── middleware/        # Validación y manejo de errores
│       ├── whatsapp.js        # Conexión y funciones de WhatsApp
│       ├── db.js              # Base de datos SQLite (better-sqlite3)
│       ├── contacts.js        # Gestión de contactos de grupos
│       ├── agenda.js          # Gestión de agenda y parser VCF
│       ├── scheduler.js       # Programador de tareas
│       ├── config.js          # Configuración
│       └── routes/
│           ├── messages.js         # API de mensajes a grupos
│           ├── direct-messages.js  # API de mensajes directos
│           ├── status-updates.js   # API de estados
│           ├── contacts.js         # API de contactos de grupos
│           ├── agenda.js           # API de contactos de agenda
│           ├── groups.js           # API de grupos
│           └── status.js          # API de estado de conexión
├── Docs/                      # Auditoría técnica y de seguridad
├── start.sh                   # Script de inicio
├── .env.example               # Plantilla de configuración
└── auto-whatsapp-nginx.conf   # Configuración de Nginx (requiere TLS)
```

## API

### Conexión
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/status` | Estado de conexión |
| GET | `/api/qr` | Código QR para vincular |
| POST | `/api/unlink` | Desvincular WhatsApp (exige `password`) |

### Grupos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/groups` | Lista de grupos |

### Mensajes a grupos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/messages` | Listar mensajes programados |
| POST | `/api/messages` | Crear mensaje programado |
| PUT | `/api/messages/:id` | Editar mensaje pendiente |
| DELETE | `/api/messages/:id` | Cancelar mensaje pendiente |
| DELETE | `/api/messages/:id/permanent` | Eliminar mensaje |

### Mensajes directos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/direct-messages` | Listar mensajes directos |
| POST | `/api/direct-messages` | Crear mensaje directo |
| POST | `/api/direct-messages/send-now` | Envío inmediato (máx. 20 números; responde 202 y el resultado llega por WebSocket) |
| PUT | `/api/direct-messages/:id` | Editar mensaje pendiente |
| DELETE | `/api/direct-messages/:id` | Cancelar mensaje pendiente |
| DELETE | `/api/direct-messages/:id/permanent` | Eliminar mensaje |

### Estados de WhatsApp
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/status-updates` | Listar estados programados |
| GET | `/api/status-audience` | Recuento de destinatarios por tipo de audiencia |
| POST | `/api/status-updates` | Crear estado programado |
| POST | `/api/status-updates/send-now` | Publicar estado inmediatamente |
| PUT | `/api/status-updates/:id` | Editar estado pendiente |
| DELETE | `/api/status-updates/:id` | Cancelar estado pendiente |
| DELETE | `/api/status-updates/:id/permanent` | Eliminar estado |

### Vista previa de enlaces
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/link-preview?url=` | Título, descripción e imagen de una URL (protegido contra SSRF) |
| GET | `/api/link-preview/image?url=` | Proxy de la imagen de la vista previa |

### Contactos de grupos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/contacts` | Listar contactos (paginado) |
| POST | `/api/contacts/sync` | Sincronizar desde grupos |
| DELETE | `/api/contacts` | Eliminar todos (exige `password`) |

### Contactos de agenda
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/agenda` | Listar contactos (paginado, filtros) |
| GET | `/api/agenda/stats` | Estadísticas |
| POST | `/api/agenda/import` | Importar archivo VCF |
| POST | `/api/agenda/check` | Verificar en WhatsApp (batch) |
| POST | `/api/agenda/reset-checks` | Reiniciar verificaciones (exige `password`) |
| DELETE | `/api/agenda` | Eliminar todos (exige `password`) |

## Stack técnico

- **@whiskeysockets/baileys** — Librería de WhatsApp Web
- **Express** — Servidor HTTP
- **React + Vite** — Frontend
- **better-sqlite3** — Base de datos
- **node-schedule** — Programador de tareas
- **multer** — Carga de archivos
- **qrcode** — Generación de QR

## Notas

- Todo lo persistente vive en `DATA_DIR` (por defecto `data/`): la sesión de WhatsApp en
  `auth_info/`, la base de datos en `data.db` y las imágenes en `uploads/`. No borres
  `auth_info/` salvo que quieras desvincular manualmente.
- Las cuentas de WhatsApp migradas a LID necesitan que los estados se firmen y direccionen
  por LID; ver [Docs/07](Docs/07-correcciones-aplicadas.md#estados-no-compatibles-cuentas-migradas-a-lid).
- Para producción, se recomienda usar Nginx como reverse proxy (ver `auto-whatsapp-nginx.conf`).
