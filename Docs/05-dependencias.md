# 05 — Dependencias vulnerables

Resultado de `npm audit` ejecutado el **8 de septiembre de 2026** sobre `server/` y `client/`.

```
server/  →  10 vulnerabilidades   (1 crítica, 5 altas, 3 moderadas, 1 baja)
client/  →   7 vulnerabilidades   (6 altas, 1 baja)
```

Todas tienen corrección disponible con `npm audit fix`.

---

## Servidor

### 🔴 Crítica — `@whiskeysockets/baileys` `< 6.7.22`

**Instalada:** `^6.7.16` · **Aviso:** [GHSA-qvv5-jq5g-4cgg](https://github.com/advisories/GHSA-qvv5-jq5g-4cgg)
**CWE:** 290 (suplantación por *spoofing*), 345 y 346 (verificación insuficiente de origen y datos)

> *Baileys has message upsert / hist sync spoofing and app state corruption when using
> maliciously crafted protocolMessage payload.*

Un remitente malicioso puede enviar un `protocolMessage` manipulado que provoca la inserción de
mensajes falsos y la corrupción del estado sincronizado de la aplicación.

**Por qué importa especialmente aquí:** el proyecto procesa activamente los mensajes entrantes
y persiste datos derivados de ellos. En
[`whatsapp.js:106-116`](../server/src/whatsapp.js#L106) cada `pushName` recibido se escribe en
la tabla `contacts` mediante `savePushName()`, y en
[`whatsapp.js:84-93`](../server/src/whatsapp.js#L84) la sincronización de historial vuelca
contactos completos. Un atacante que conozca el número de teléfono de la víctima puede inyectar
nombres falsos en su agenda —o corromper el estado de la sesión— sin ninguna interacción del
usuario.

**Corrección:** actualizar a `>= 6.7.22`.

```json
"@whiskeysockets/baileys": "^6.7.22"
```

> Es un salto de versión en la librería central: tras actualizar hay que probar la vinculación
> por QR, el envío a grupos, la publicación de estados y `onWhatsApp()` de extremo a extremo.

### 🟠 Alta — `axios` `1.0.0 – 1.17.0` (dependencia transitiva de Baileys)

29 avisos acumulados. Los más relevantes para este despliegue:

| Aviso | Descripción |
|---|---|
| [GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7) | Bypass de `NO_PROXY` vía subred de loopback → SSRF (CVSS 7.2) |
| [GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63) | Bypass de autenticación por *prototype pollution* en `validateStatus` |
| [GHSA-fvcv-3m26-pcqx](https://github.com/advisories/GHSA-fvcv-3m26-pcqx) | Exfiltración de metadatos de nube por inyección de cabeceras |
| [GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw) | Robo de credenciales por *prototype pollution* en la fusión de configuración |

En un despliegue en la nube (el proyecto incluye `nixpacks.toml`, orientado a PaaS), el SSRF
hacia el endpoint de metadatos de la instancia es el riesgo más concreto: puede exponer
credenciales del proveedor.

### 🟠 Alta — `socket.io-parser` `4.0.0 – 4.2.6`

[GHSA-2m8v-j782-fhvr](https://github.com/advisories/GHSA-2m8v-j782-fhvr) — *Zero-attachment
Memory Exhaustion*. Un paquete binario declarado con cero adjuntos provoca consumo de memoria
no acotado.

**Explotable directamente** mientras el WebSocket acepte conexiones anónimas
([SEC-003](02-hallazgos-seguridad.md#sec-003--websocket-sin-autenticación-que-emite-el-qr-de-vinculación)):
cualquiera puede tumbar el servidor sin credenciales.

### 🟠 Alta — `form-data` `4.0.0 – 4.0.5`

[GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) — inyección CRLF a
través de nombres de campo y de archivo sin escapar en cuerpos multipart.

### 🟠 Alta — `path-to-regexp` `< 0.1.13`

[GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2) — ReDoS con rutas de
múltiples parámetros. Llega a través de Express; la superficie real es limitada porque las
rutas del proyecto tienen como máximo un parámetro (`:id`), pero conviene actualizar igualmente.

### 🟠 Alta — `sharp` `< 0.35.0`

[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — hereda
CVE-2026-33327, CVE-2026-33328, CVE-2026-35590 y CVE-2026-35591 de libvips. `sharp` entra como
dependencia opcional de Baileys para el procesamiento de miniaturas.

**Relevancia:** el sistema acepta imágenes subidas por el usuario y las envía por WhatsApp; si
Baileys las procesa con `sharp`, una imagen manipulada alcanza código nativo vulnerable. La
validación de contenido real de
[SEC-018](02-hallazgos-seguridad.md#sec-018--validación-de-archivos-sólo-por-extensión) reduce
—pero no elimina— esta exposición.

### 🟡 Moderadas y baja

| Paquete | Rango | Aviso | Problema |
|---|---|---|---|
| `body-parser` | `< 1.20.6` | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) | Un `limit` inválido desactiva silenciosamente el control de tamaño → DoS |
| `follow-redirects` | `<= 1.15.11` | [GHSA-r4q5-vmmm-2653](https://github.com/advisories/GHSA-r4q5-vmmm-2653) | Filtra cabeceras de autenticación al seguir redirecciones entre dominios |
| `protobufjs` | `7.5.0 – 7.6.4` | [GHSA-j3f2-48v5-ccww](https://github.com/advisories/GHSA-j3f2-48v5-ccww) | Bucle infinito al analizar opciones `.proto` → DoS |
| `qs` | `2.2.5 – 6.15.3` | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) y otros | DoS remoto y bypass del límite de arrays |

> `body-parser` merece atención: el proyecto configura `express.json({ limit: '50mb' })`
> ([`index.js:38`](../server/src/index.js#L38)). Un valor mal escrito allí desactivaría el
> control de tamaño por completo. Otra razón para bajarlo a `'1mb'`
> ([SEC-021](02-hallazgos-seguridad.md#sec-021--límites-de-cuerpo-excesivos-y-sin-rate-limiting-global)).

---

## Cliente

### 🟠 Alta — `vite` `<= 6.4.2`

**Instalada:** `^6.0.5`

| Aviso | Descripción |
|---|---|
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | Path traversal en el manejo de `.map` de dependencias optimizadas |
| [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583) | **Lectura arbitraria de archivos vía el WebSocket del servidor de desarrollo** |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | Bypass de `server.fs.deny` con rutas alternativas en Windows |

**Riesgo real:** afectan al **servidor de desarrollo**, no al bundle de producción. Pero
`client/vite.config.js:8` configura `host: true`, lo que expone el servidor de desarrollo en
todas las interfaces de red. Si alguna vez se ejecuta `npm run dev` en la máquina de
producción o en una red compartida, cualquiera en esa red puede leer archivos arbitrarios —
incluidos `.env` y `auth_info/`.

**Mitigación inmediata** además de actualizar: quitar `host: true` o restringirlo.

```js
server: {
  port: 5173,
  host: process.env.VITE_HOST || 'localhost',
  proxy: { '/api': 'http://localhost:3001', '/uploads': 'http://localhost:3001' },
}
```

### 🟠 Alta — `postcss`

Tres avisos de lectura arbitraria de archivos `.map` mediante `sourceMappingURL` controlado por
el atacante en comentarios CSS
([GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q),
[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp),
[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)). Afecta al proceso de
compilación. Riesgo bajo mientras no se procese CSS de terceros.

### 🟠 Alta — `socket.io-parser`

El mismo aviso que en el servidor, en el lado cliente.

---

## Plan de actualización

```bash
# 1. Punto de retorno
git checkout -b fix/dependencias-vulnerables

# 2. Servidor
cd server
npm audit fix
npm audit --audit-level=moderate     # revisar lo que quede

# 3. Cliente
cd ../client
npm audit fix
npm audit --audit-level=moderate

# 4. Compilar y verificar
npm run build
```

### Pruebas manuales obligatorias tras la actualización

`npm test` cubre la API, pero no habla con WhatsApp: lo que toca el protocolo se verifica a
mano. Baileys es la actualización de mayor riesgo:

- [ ] Arranque del servidor sin errores
- [ ] Generación y visualización del código QR
- [ ] Vinculación completa desde el teléfono
- [ ] Sincronización de contactos desde grupos (`POST /api/contacts/sync`)
- [ ] Listado de grupos (`GET /api/groups`)
- [ ] Envío de un mensaje de texto a un grupo
- [ ] Envío de un mensaje con imagen
- [ ] Publicación de un estado con imagen, comprobando que se **ve en el teléfono** (no basta
      con que WhatsApp lo acepte: ver [07](07-correcciones-aplicadas.md#estados-no-compatibles-cuentas-migradas-a-lid))
- [ ] Verificación de números de la agenda (`POST /api/agenda/check`)
- [ ] Mensaje directo inmediato y programado
- [ ] Desvinculación y re-vinculación
- [ ] Reconexión tras cortar la red

### Prevención

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /server
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: npm
    directory: /client
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
```

Y bloquear la integración de código con vulnerabilidades altas en CI:

```yaml
- run: cd server && npm audit --audit-level=high
- run: cd client && npm audit --audit-level=high
```

> Nota sobre Baileys: al ser un cliente de ingeniería inversa del protocolo de WhatsApp, sus
> versiones se suceden con rapidez y las roturas entre menores son frecuentes. Conviene fijar
> una versión exacta y actualizar de forma deliberada, revisando el changelog, en lugar de
> aceptar rangos abiertos.
