import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import './setup-env.js';

let app;
let token;

beforeAll(async () => {
  const { initDatabase } = await import('../src/db.js');
  const { initContactsTable } = await import('../src/contacts.js');
  const { initAgendaTable } = await import('../src/agenda.js');
  await initDatabase();
  initContactsTable();
  initAgendaTable();

  const { createApp } = await import('../src/app.js');
  app = createApp();

  const res = await request(app).post('/api/auth/login')
    .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD });
  token = res.body.token;
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const future = () => new Date(Date.now() + 3600_000).toISOString();

describe('validación de mensajes', () => {
  it('rechaza una fecha inválida con 400', async () => {
    const res = await auth(request(app).post('/api/messages')).send({
      groupId: '123-456@g.us', groupName: 'Grupo', content: 'hola', scheduledAt: 'el lunes',
    }).expect(400);
    expect(res.body.details.join()).toMatch(/Fecha y hora inválidas/);
  });

  it('rechaza un JID con formato incorrecto', async () => {
    await auth(request(app).post('/api/messages')).send({
      groupId: 'no-es-un-jid', groupName: 'Grupo', content: 'hola', scheduledAt: future(),
    }).expect(400);
  });

  it('rechaza contenido que excede el máximo', async () => {
    await auth(request(app).post('/api/messages')).send({
      groupId: '123@g.us', groupName: 'G', content: 'x'.repeat(5000), scheduledAt: future(),
    }).expect(400);
  });

  it('rechaza un id de ruta no numérico con 400', async () => {
    await auth(request(app).delete('/api/messages/abc')).expect(400);
  });

  it('devuelve 404 para un mensaje inexistente', async () => {
    await auth(request(app).delete('/api/messages/999999')).expect(404);
  });
});

describe('límites de envío', () => {
  it('rechaza más destinatarios de los permitidos en envío inmediato', async () => {
    const res = await auth(request(app).post('/api/direct-messages/send-now')).send({
      numbers: Array.from({ length: 25 }, (_, i) => `57300123456${i}`),
      content: 'hola',
    }).expect(400);
    expect(res.body.details.join()).toMatch(/Máximo 20 destinatarios/);
  });
});

describe('paginación', () => {
  it('acota el límite máximo de resultados', async () => {
    const res = await auth(request(app).get('/api/contacts?limit=50000&page=1')).expect(200);
    expect(res.body.limit).toBe(50);
  });

  it('permite pedir la lista completa para "Seleccionar todos"', async () => {
    const res = await auth(request(app).get('/api/contacts?limit=10000&page=1')).expect(200);
    expect(res.body.limit).toBe(10000);
  });
});
