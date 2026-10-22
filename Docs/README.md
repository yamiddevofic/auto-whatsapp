# Auditoría técnica y de seguridad — Auto WhatsApp

> Revisión realizada el **8 de septiembre de 2026** sobre la rama `main` (commit `81d279e`).
> Alcance: 100 % del código fuente propio (`server/src`, `client/src`), configuración de
> despliegue (`Dockerfile`, `nixpacks.toml`, `auto-whatsapp-nginx.conf`, `start.sh`) y
> árbol de dependencias (`npm audit` en servidor y cliente).

## Índice

| Documento | Contenido |
|---|---|
| [01 — Evaluación general del proyecto](01-evaluacion-general.md) | Calificación por dimensión, madurez, arquitectura, qué está bien hecho |
| [02 — Hallazgos de seguridad](02-hallazgos-seguridad.md) | Catálogo completo de vulnerabilidades con evidencia, impacto y solución |
| [03 — Plan de remediación](03-plan-de-remediacion.md) | Roadmap priorizado en 4 fases, con código listo para aplicar |
| [04 — Calidad, arquitectura y fiabilidad](04-calidad-arquitectura.md) | Deuda técnica no relacionada con seguridad |
| [05 — Dependencias vulnerables](05-dependencias.md) | Resultado de `npm audit` y estrategia de actualización |
| [06 — Cumplimiento legal y riesgo de plataforma](06-cumplimiento-legal.md) | Ban de WhatsApp, tratamiento de datos personales |
| [07 — Correcciones aplicadas](07-correcciones-aplicadas.md) | **Qué se corrigió (14/10/2026 y estados por LID 21–22/10/2026), cómo se verificó y qué queda abierto** |

---

> ⚠️ **Estado actualizado (14 de octubre de 2026).** La remediación de las fases 0 a 2 ya
> está aplicada y verificada: los 4 hallazgos críticos y los 6 altos están cerrados, y las
> 17 vulnerabilidades de dependencias en cero. El análisis que sigue describe el estado
> **original** del 8 de septiembre; para lo que hay hoy, ver
> [07 — Correcciones aplicadas](07-correcciones-aplicadas.md).

## Resumen ejecutivo

Auto WhatsApp es una aplicación web (Express + React + SQLite + Baileys) que automatiza el
envío de mensajes, estados y mensajes directos de WhatsApp. Funcionalmente es un producto
completo y bien resuelto: la lógica de negocio (programación, reintentos, anti-detección,
importación VCF, sincronización de contactos) está pensada con cuidado y cubre casos reales.

**El problema no es la funcionalidad, es la superficie de exposición.** La aplicación
controla una cuenta personal de WhatsApp y almacena la agenda telefónica completa del
usuario, pero está publicada en Internet sobre HTTP plano, con un secreto de firma JWT
conocido públicamente en el repositorio y con un canal WebSocket que emite el **código QR de
vinculación a cualquier cliente anónimo**. Cualquiera de esos tres hechos, por sí solo,
permite el secuestro total de la cuenta de WhatsApp.

### Calificación global

| Dimensión | Nota | Comentario |
|---|:---:|---|
| Funcionalidad y alcance | **8.5 / 10** | Completa, bien pensada, resuelve el problema real |
| Arquitectura y organización | **7.0 / 10** | Separación clara por capas; ensuciada por dependencias circulares |
| Calidad de código | **6.5 / 10** | Legible y consistente; con duplicación y sin validación de entrada |
| **Seguridad** | **2.5 / 10** | **Crítico. Bypass de autenticación trivial y toma de cuenta remota** |
| Fiabilidad y operación | **4.5 / 10** | Persistencia frágil (`sql.js`), sin observabilidad, sin healthcheck |
| Pruebas y CI | **0 / 10** | No existen pruebas ni pipeline |
| Documentación | **7.5 / 10** | README de usuario bueno; sin documentación técnica ni de despliegue seguro |
| **Global** | **≈ 4.6 / 10** | **Prototipo funcional avanzado, NO apto para producción expuesta** |

### Veredicto

> **Grado de madurez: prototipo avanzado / MVP interno.**
> No debe estar accesible desde Internet en su estado actual. Con las 4 correcciones
> críticas de la [Fase 0](03-plan-de-remediacion.md#fase-0--contención-inmediata-hoy)
> —que son unas 2 horas de trabajo— pasa a ser razonablemente seguro para uso personal.
> Para uso multiusuario o comercial requiere las Fases 1 a 3 completas.

### Conteo de hallazgos

| Severidad | Cantidad |
|---|:---:|
| 🔴 Crítica | 4 |
| 🟠 Alta | 6 |
| 🟡 Media | 11 |
| 🔵 Baja | 4 |
| **Total** | **25** |

Adicionalmente: **17 vulnerabilidades conocidas en dependencias** (1 crítica, 11 altas,
3 moderadas, 2 bajas) sumando servidor y cliente, y **11 puntos de deuda técnica** documentados
en el informe de arquitectura.
