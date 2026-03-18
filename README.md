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
- Se envían únicamente a tus contactos de agenda verificados en WhatsApp

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

# Instalar dependencias del servidor
npm install

# Instalar dependencias del cliente y compilar
cd client
npm install
npm run build
cd ..
```

## Uso

```bash
bash start.sh
```

El servidor se ejecuta en `http://localhost:3001` dentro de una sesión tmux llamada `auto-whatsapp`.

1. Abre `http://localhost:3001` en tu navegador
2. Escanea el código QR con WhatsApp desde tu teléfono
3. Listo — los grupos se cargan automáticamente al conectar

Para ver los logs del servidor:

```bash
tmux attach -t auto-whatsapp
```

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
│   └── src/
│       ├── index.js           # Servidor Express y configuración
│       ├── whatsapp.js        # Conexión y funciones de WhatsApp
│       ├── db.js              # Base de datos SQLite
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
├── start.sh                   # Script de inicio
└── auto-whatsapp-nginx.conf   # Configuración de Nginx (opcional)
```

## API

### Conexión
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/status` | Estado de conexión |
| GET | `/api/qr` | Código QR para vincular |
| POST | `/api/unlink` | Desvincular WhatsApp |

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
| PUT | `/api/direct-messages/:id` | Editar mensaje pendiente |
| DELETE | `/api/direct-messages/:id` | Cancelar mensaje pendiente |
| DELETE | `/api/direct-messages/:id/permanent` | Eliminar mensaje |

### Estados de WhatsApp
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/status-updates` | Listar estados programados |
| POST | `/api/status-updates` | Crear estado programado |
| POST | `/api/status-updates/send-now` | Publicar estado inmediatamente |
| PUT | `/api/status-updates/:id` | Editar estado pendiente |
| DELETE | `/api/status-updates/:id` | Cancelar estado pendiente |
| DELETE | `/api/status-updates/:id/permanent` | Eliminar estado |

### Contactos de grupos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/contacts` | Listar contactos (paginado) |
| POST | `/api/contacts/sync` | Sincronizar desde grupos |
| DELETE | `/api/contacts` | Eliminar todos |

### Contactos de agenda
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/agenda` | Listar contactos (paginado, filtros) |
| GET | `/api/agenda/stats` | Estadísticas |
| POST | `/api/agenda/import` | Importar archivo VCF |
| POST | `/api/agenda/check` | Verificar en WhatsApp (batch) |
| POST | `/api/agenda/reset-checks` | Reiniciar verificaciones |
| DELETE | `/api/agenda` | Eliminar todos |

## Stack técnico

- **@whiskeysockets/baileys** — Librería de WhatsApp Web
- **Express** — Servidor HTTP
- **React + Vite** — Frontend
- **better-sqlite3** — Base de datos
- **node-schedule** — Programador de tareas
- **multer** — Carga de archivos
- **qrcode** — Generación de QR

## Notas

- La sesión de WhatsApp se almacena en `auth_info/`. No borrar este directorio a menos que quieras desvincular manualmente.
- La base de datos se almacena en `data.db` en la raíz del proyecto.
- Las imágenes subidas se guardan en `uploads/`.
- Para producción, se recomienda usar Nginx como reverse proxy (ver `auto-whatsapp-nginx.conf`).
