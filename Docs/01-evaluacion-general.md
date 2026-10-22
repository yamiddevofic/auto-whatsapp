# 01 — Evaluación general del proyecto

## 1. Qué es el sistema

Aplicación web monolítica que actúa como **cliente no oficial de WhatsApp** mediante la
librería `@whiskeysockets/baileys` (protocolo WhatsApp Web ingeniería inversa). Permite:

- Programar mensajes a grupos (texto + imagen).
- Publicar estados (status) programados o inmediatos, con audiencia calculada.
- Sincronizar contactos desde los grupos participantes.
- Importar la agenda telefónica desde `.vcf` y verificar quién tiene WhatsApp.
- Enviar mensajes directos masivos con retardo aleatorio y variación de contenido.

```
Navegador (React SPA)
      │  HTTP /api/*  +  WebSocket socket.io
      ▼
Express (server/src/index.js)  ──►  node-schedule (jobs en memoria)
      │                                     │
      ├─► sql.js  (data.db, archivo completo reescrito en cada write)
      └─► Baileys (auth_info/ = credenciales de sesión de WhatsApp)
                    │
                    ▼
             Servidores de WhatsApp
```

## 2. Métricas del código

| Métrica | Valor |
|---|---|
| Líneas de código propias | ~5.900 (2.155 servidor / 3.752 cliente) |
| Módulos de servidor | 8 core + 9 routers |
| Componentes React | 14 |
| Endpoints HTTP | 27 |
| Eventos WebSocket emitidos | 6 |
| Dependencias directas | 10 (servidor) + 5 (cliente) |
| Pruebas automatizadas | **0** |
| Configuración de lint / formato / CI | **Ninguna** |

## 3. Lo que está bien hecho

Es importante decirlo con claridad, porque hay decisiones de ingeniería acertadas:

1. **Separación por capas coherente.** `routes/` (HTTP) → `db.js` / `contacts.js` /
   `agenda.js` (persistencia) → `whatsapp.js` (integración externa) → `scheduler.js`
   (orquestación). Cada archivo tiene una responsabilidad identificable.
2. **Consultas SQL 100 % parametrizadas.** Todas las sentencias usan `?` con `bind()`
   ([`server/src/db.js:14-20`](../server/src/db.js#L14)). **No se detectó ninguna inyección
   SQL**, ni siquiera en la construcción dinámica de `UPDATE` de
   [`db.js:257-268`](../server/src/db.js#L257), donde los nombres de columna son literales
   del código y sólo los valores viajan como parámetros. Esto está bien resuelto.
3. **Sin XSS en el cliente.** No hay un solo uso de `dangerouslySetInnerHTML`, `innerHTML`
   ni `eval` en los 14 componentes React. El escapado por defecto de React se respeta.
4. **Recuperación de estado tras reinicio.** `loadPendingMessages()` reprograma los trabajos
   pendientes desde la base de datos, y `scheduleMessage()` distingue entre "atrasado menos
   de 10 minutos" (envía) y "atrasado más" (marca fallido)
   ([`scheduler.js:37-64`](../server/src/scheduler.js#L37)). Es un detalle maduro.
5. **Reconexión con backoff exponencial** y tope de intentos
   ([`whatsapp.js:188-192`](../server/src/whatsapp.js#L188)).
6. **Anti-detección deliberada**: límite diario progresivo (200 → 500 mensajes), retardos
   aleatorios de 3–15 s entre envíos y variación de contenido por destinatario
   ([`scheduler.js:11-35`](../server/src/scheduler.js#L11), [`db.js:353-367`](../server/src/db.js#L353)).
7. **Parser VCF robusto**: maneja *line folding* RFC 6350, `QUOTED-PRINTABLE` y múltiples
   teléfonos por contacto ([`agenda.js:108-183`](../server/src/agenda.js#L108)). Es de las
   piezas mejor escritas del repositorio.
8. **README de usuario claro**, con badges, instalación y descripción funcional.

## 4. Lo que falla estructuralmente

### 4.1 El modelo de amenazas nunca se definió

El sistema fue construido asumiendo *"esto corre en mi máquina y sólo yo entro"*, pero está
desplegado con `listen(0.0.0.0)` ([`index.js:154`](../server/src/index.js#L154)), nginx
escuchando en el `0.0.0.0:4323` y CORS abierto. La brecha entre el modelo mental y el
despliegue real es el origen de casi todos los hallazgos críticos.

Un atacante que sólo conoce la IP y el puerto puede, hoy:

- Leer el repositorio público, tomar `AUTH_SECRET` y **firmar su propio token válido**.
- Conectarse al WebSocket sin token y **recibir el QR de vinculación** para enlazar la
  cuenta de WhatsApp a su propio dispositivo.
- Recibir en tiempo real todos los mensajes, números de teléfono y estados.

### 4.2 La autenticación es un único portero en la puerta principal

`authMiddleware` protege exclusivamente el prefijo `/api`
([`index.js:113`](../server/src/index.js#L113)). Todo lo que no pasa por ahí —el canal
WebSocket, el directorio `/uploads`, y los middlewares de `multer` que se montan **antes**
en las líneas 64-107— queda completamente abierto. No hay defensa en profundidad: una única
línea mal ubicada expone el sistema.

### 4.3 No hay validación de entrada en ninguna capa

Ningún endpoint valida tipos, formatos, longitudes ni rangos. `scheduledAt` se pasa
directamente a `new Date()` sin comprobar validez; `content` no tiene longitud máxima;
`numbers` y `recipients` no tienen cardinalidad máxima. No se usa ningún esquema (Zod, Joi,
express-validator). Esto es a la vez un problema de seguridad y de fiabilidad.

### 4.4 La persistencia es frágil por diseño

`sql.js` es SQLite compilado a WebAssembly, **en memoria**. Cada escritura serializa la base
de datos completa y la vuelca a disco con `fs.writeFileSync`
([`db.js:60-63`](../server/src/db.js#L60)). Consecuencias:

- Coste O(tamaño total de la BD) por cada `INSERT`.
- Una caída durante el `writeFileSync` deja el archivo truncado: **pérdida total de datos**.
- El `PRAGMA journal_mode = WAL` de [`db.js:108`](../server/src/db.js#L108) no tiene ningún
  efecto real (no hay archivo WAL; el `.gitignore` los lista por error).

### 4.5 Cero verificación automatizada

Sin pruebas, sin linter, sin tipos, sin CI. Cada cambio se valida manualmente. En un sistema
que envía mensajes irreversibles a cientos de contactos reales, esto es un riesgo operativo
de primer orden: un error en `sendToAll()` no se detecta hasta que ya se enviaron los mensajes.

## 5. Calificación detallada

| Dimensión | Nota | Justificación |
|---|:---:|---|
| Funcionalidad | 8.5 | Cubre el dominio completo con casos borde reales resueltos |
| Arquitectura | 7.0 | Capas claras, pero dependencia circular `index ↔ whatsapp/scheduler` y estado global mutable |
| Legibilidad | 7.5 | Nombres consistentes, funciones cortas, comentarios útiles |
| Validación de entrada | 2.0 | Prácticamente inexistente |
| Autenticación / autorización | 2.0 | JWT con secreto público; sin autorización por recurso |
| Gestión de secretos | 1.0 | Credenciales reales versionadas en el repositorio |
| Transporte | 1.0 | HTTP plano en producción |
| Dependencias | 3.0 | 17 CVEs conocidos, uno crítico en la librería central |
| Manejo de errores | 4.0 | `err.message` filtrado al cliente; `uncaughtException` que no termina |
| Persistencia | 3.5 | `sql.js` con reescritura total; sin backups |
| Observabilidad | 3.0 | Sólo `console.log`, con PII; `pino` en `silent` |
| Pruebas / CI | 0.0 | No existen |
| Documentación | 7.5 | Buena para el usuario final, nula para el operador |
| **Promedio ponderado** | **≈ 4.6** | |

## 6. Comparación con un estándar de producción

| Práctica esperada | Estado |
|---|:---:|
| HTTPS obligatorio con HSTS | ❌ |
| Secretos fuera del repositorio | ❌ |
| Rate limiting en autenticación | ❌ |
| Cabeceras de seguridad (Helmet/CSP) | ❌ |
| Validación de esquema en endpoints | ❌ |
| Autenticación en el canal WebSocket | ❌ |
| Contraseñas con hash (bcrypt/argon2) | ❌ |
| Dependencias sin CVEs conocidos | ❌ |
| Pruebas automatizadas + CI | ❌ |
| Logs sin datos personales | ❌ |
| Backups de la base de datos | ❌ |
| Contenedor sin privilegios de root | ❌ |
| Consultas SQL parametrizadas | ✅ |
| Escapado de salida en el frontend | ✅ |
| Recuperación de trabajos tras reinicio | ✅ |
| Manejo de reconexión resiliente | ✅ |

**4 de 16.** El detalle de cada punto y su corrección está en
[02 — Hallazgos de seguridad](02-hallazgos-seguridad.md).
