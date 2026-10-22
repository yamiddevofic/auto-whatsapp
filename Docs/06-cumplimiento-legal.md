# 06 — Cumplimiento legal y riesgo de plataforma

Riesgos que no son vulnerabilidades técnicas, pero que pueden terminar el proyecto de forma
más definitiva que cualquier fallo de seguridad. Se documentan para que la decisión sea
informada.

> Este apartado es una evaluación técnica de riesgo, no asesoría jurídica. Para un uso
> comercial conviene consultar con un abogado especializado en protección de datos.

---

## 1. Riesgo de plataforma: uso de un cliente no oficial

**Qué se usa:** `@whiskeysockets/baileys`, una implementación por ingeniería inversa del
protocolo de WhatsApp Web. No es la API oficial (WhatsApp Business Platform / Cloud API).

**Qué dicen las condiciones de WhatsApp.** Los Términos de Servicio prohíben expresamente
acceder al servicio por medios automatizados o no autorizados, y el uso de clientes no
oficiales es causa de suspensión. La automatización de mensajería masiva está señalada de
forma explícita.

**Consecuencia realista:** suspensión permanente del **número de teléfono personal**, no sólo
de la aplicación. Se pierde el acceso a las conversaciones personales de esa línea.

**Factores del proyecto que aumentan la probabilidad de detección**

| Factor | Ubicación | Riesgo |
|---|---|---|
| Envío masivo a contactos que no han escrito primero | [`scheduler.js:184`](../server/src/scheduler.js#L184) | Alto — es el patrón principal que se detecta |
| `/send-now` sin retardo entre envíos | [`routes/direct-messages.js:37-53`](../server/src/routes/direct-messages.js#L37) | Alto |
| `onWhatsApp()` en lotes de 50 números | [`routes/agenda.js:89`](../server/src/routes/agenda.js#L89) | Medio-alto — enumerar números es señal fuerte de automatización |
| Estados dirigidos a listas grandes de JIDs | [`whatsapp.js:360`](../server/src/whatsapp.js#L360) | Medio |
| Reconexiones agresivas tras *Bad MAC* | [`whatsapp.js:165-182`](../server/src/whatsapp.js#L165) | Medio |

**Mitigaciones ya presentes en el código** — conviene reconocerlas, están bien pensadas:
límite diario progresivo, retardo aleatorio de 3–15 s y variación de contenido por
destinatario ([`scheduler.js:11-35`](../server/src/scheduler.js#L11)).

**Recomendaciones**

1. Usar un **número dedicado**, nunca la línea personal principal.
2. Aplicar el tope de destinatarios y el retardo también en `/send-now`
   ([SEC-014](02-hallazgos-seguridad.md#sec-014--sin-límite-de-destinatarios-abuso-de-envío-masivo)).
3. Reducir el lote de `/api/agenda/check` de 50 a 10–15 y espaciar las consultas.
4. Enviar sólo a contactos que hayan dado su consentimiento (ver sección 2).
5. Si el proyecto va a tener uso comercial, **migrar a la WhatsApp Business Cloud API oficial**.
   Tiene coste por conversación y exige plantillas aprobadas, pero elimina por completo el
   riesgo de suspensión.

---

## 2. Tratamiento de datos personales

El sistema almacena y procesa datos personales de terceros que **no son usuarios de la
aplicación** y que en la mayoría de los casos no saben que están en ella:

| Dato | Origen | Tabla |
|---|---|---|
| Número de teléfono | Importación VCF, participantes de grupos | `agenda_contacts.phone`, `contacts.jid` |
| Nombre real | VCF (`FN`/`N`) | `agenda_contacts.name` |
| Nombre público de WhatsApp | `pushName` de mensajes entrantes | `contacts.notify` |
| Pertenencia a grupos | Sincronización de grupos | `contacts.groups_list` |
| Presencia en WhatsApp | `onWhatsApp()` | `agenda_contacts.on_whatsapp` |
| Contenido de mensajes enviados | Creado por el usuario | `messages.content`, `direct_messages.content` |

Bajo el **RGPD** (UE) y la **Ley 1581 de 2012** de Colombia con su decreto reglamentario, este
tratamiento requiere base legal, información al titular y garantías sobre sus derechos.

### Brechas frente a la normativa

| Requisito | Estado | Referencia técnica |
|---|:---:|---|
| Base legal / consentimiento del titular | ❌ No se registra ninguno | — |
| Información al titular sobre el tratamiento | ❌ No existe aviso de privacidad | — |
| Cifrado de datos personales en reposo | ❌ `data.db` sin cifrar | [SEC-015](02-hallazgos-seguridad.md#sec-015--secretos-en-reposo-sin-protección) |
| Cifrado en tránsito | ❌ HTTP plano | [SEC-004](02-hallazgos-seguridad.md#sec-004--tráfico-en-http-plano-en-producción) |
| Control de acceso adecuado | ❌ Bypass de autenticación trivial | [SEC-001](02-hallazgos-seguridad.md#sec-001--secreto-de-firma-jwt-hardcodeado-y-público), [SEC-003](02-hallazgos-seguridad.md#sec-003--websocket-sin-autenticación-que-emite-el-qr-de-vinculación) |
| Minimización de datos | ❌ Se guardan todos los contactos de todos los grupos | [`whatsapp.js:295-340`](../server/src/whatsapp.js#L295) |
| Limitación del plazo de conservación | ❌ Nada se borra automáticamente | [SEC-023](02-hallazgos-seguridad.md#sec-023--archivos-huérfanos-nunca-depurados) |
| Derecho de supresión por titular | ⚠️ Sólo borrado masivo, no individual | `DELETE /api/contacts` |
| Registro de actividades de tratamiento | ❌ No existe | — |
| Mecanismo de baja (*opt-out*) | ❌ No existe | — |
| Registro de la brecha / notificación | ❌ Sin auditoría ni logs de acceso | [SEC-025](02-hallazgos-seguridad.md#sec-025--endpoints-destructivos-sin-confirmación) |

### Medidas técnicas recomendadas

1. **Consentimiento y baja.** Añadir a `agenda_contacts` y `contacts` las columnas
   `consentimiento_at` y `baja_at`, y excluir de todo envío a quien tenga `baja_at`:

```sql
ALTER TABLE agenda_contacts ADD COLUMN consentimiento_at TEXT;
ALTER TABLE agenda_contacts ADD COLUMN baja_at TEXT;
ALTER TABLE contacts        ADD COLUMN baja_at TEXT;
```

```js
export function getAgendaWhatsAppJids() {
  return db.prepare(`
    SELECT jid FROM agenda_contacts
    WHERE on_whatsapp = 1 AND jid IS NOT NULL AND baja_at IS NULL
  `).all().map((r) => r.jid);
}
```

2. **Borrado individual.** Endpoints `DELETE /api/contacts/:jid` y `DELETE /api/agenda/:phone`,
   para poder atender una solicitud de supresión sin borrar la base entera.

3. **Retención limitada.** Purga automática de mensajes enviados con más de 90 días y de
   contactos sin actividad:

```js
schedule.scheduleJob('0 3 * * *', () => {
  db.prepare("DELETE FROM messages         WHERE status IN ('sent','failed','cancelled') AND sent_at < date('now','-90 days')").run();
  db.prepare("DELETE FROM direct_messages  WHERE status IN ('sent','failed','cancelled') AND sent_at < date('now','-90 days')").run();
});
```

4. **Cifrado en reposo y en tránsito** — Fases 1 y 2 del
   [plan de remediación](03-plan-de-remediacion.md).

5. **Registro de auditoría** de quién envió qué y a cuántos destinatarios, con conservación
   acotada, sin el contenido del mensaje.

6. **Aviso de privacidad** en el primer mensaje enviado a un contacto nuevo, indicando el
   origen del dato y cómo darse de baja (por ejemplo, responder «BAJA»), y procesar esas
   respuestas automáticamente marcando `baja_at`.

---

## 3. Matriz de riesgo

| Riesgo | Probabilidad | Impacto | Prioridad |
|---|:---:|:---:|:---:|
| Suspensión del número de WhatsApp por envío masivo | Alta | Alto | 🔴 |
| Secuestro de la cuenta por el QR expuesto (SEC-003) | Media | Crítico | 🔴 |
| Acceso no autorizado por el secreto JWT público (SEC-001) | Alta | Crítico | 🔴 |
| Fuga de la agenda telefónica completa | Media | Alto | 🟠 |
| Sanción por tratamiento de datos sin base legal | Baja (uso personal) / Media (comercial) | Alto | 🟠 |
| Pérdida total de datos por corrupción de `data.db` | Media | Alto | 🟠 |
| Denuncia por spam de un destinatario | Media | Medio | 🟡 |

---

## 4. Conclusión

Para **uso personal**, con un número dedicado y consentimiento de los contactos, el proyecto es
viable una vez aplicadas las Fases 0 y 1 del
[plan de remediación](03-plan-de-remediacion.md).

Para **uso comercial o multiusuario**, la recomendación es distinta: migrar a la WhatsApp
Business Cloud API oficial e implementar la gestión de consentimiento descrita arriba. El
ahorro de costes de usar un cliente no oficial no compensa el riesgo de perder las cuentas y
la exposición legal por el tratamiento de datos de terceros.
