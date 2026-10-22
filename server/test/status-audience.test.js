import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import './setup-env.js';

let app;
let token;
let db;

beforeAll(async () => {
  db = await import('../src/db.js');
  const { initContactsTable, saveContacts } = await import('../src/contacts.js');
  const { initAgendaTable } = await import('../src/agenda.js');
  await db.initDatabase();
  initContactsTable();
  initAgendaTable();
  saveContacts([
    { jid: '573001111111@s.whatsapp.net', name: 'A' },
    { jid: '573002222222@s.whatsapp.net', name: 'B' },
  ]);
  const { createApp } = await import('../src/app.js');
  app = createApp();
  token = (await request(app).post('/api/auth/login')
    .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD })).body.token;
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const future = () => new Date(Date.now() + 3600_000).toISOString();
const schedule = (fields) => {
  const r = auth(request(app).post('/api/status-updates')).field('content', 'hola').field('scheduledAt', future());
  for (const [k, v] of Object.entries(fields)) r.field(k, v);
  return r;
};

describe('audiencia de estados', () => {
  it('sin audiencia usa "todos" (comportamiento anterior)', async () => {
    const res = await schedule({});
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body.items[0].audience)).toEqual({ mode: 'all' });
  });

  it('guarda la audiencia elegida con el estado programado', async () => {
    const audience = JSON.stringify({ mode: 'custom', groupIds: ['120363000000000001@g.us'] });
    const res = await schedule({ audience });
    expect(res.status).toBe(201);
    const row = db.getStatusUpdateById(res.body.items[0].id);
    expect(JSON.parse(row.audience)).toEqual({ mode: 'custom', groupIds: ['120363000000000001@g.us'] });
  });

  it.each([
    ['modo desconocido', JSON.stringify({ mode: 'todos-menos-yo' })],
    ['grupos concretos sin grupos', JSON.stringify({ mode: 'custom', groupIds: [] })],
    ['id de grupo inválido', JSON.stringify({ mode: 'custom', groupIds: ['no-es-un-grupo'] })],
    ['JSON roto', '{mode:'],
  ])('rechaza %s', async (_name, audience) => {
    const res = await schedule({ audience });
    expect(res.status).toBe(400);
  });

  it('acepta la audiencia "solo yo"', async () => {
    const res = await schedule({ audience: JSON.stringify({ mode: 'me' }) });
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body.items[0].audience)).toEqual({ mode: 'me' });
  });

  it('cuenta destinatarios de cada modo sin conexión a WhatsApp', async () => {
    const res = await auth(request(app).get('/api/status-audience'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ all: 2, agenda: 0, groups: 2 });
  });

  it('exige sesión y valida los ids de grupo del recuento', async () => {
    expect((await request(app).get('/api/status-audience')).status).toBe(401);
    expect((await auth(request(app).get('/api/status-audience?groupIds=zzz'))).status).toBe(400);
  });

  it('no deja publicar a grupos concretos si WhatsApp no está conectado', async () => {
    const res = await auth(request(app).post('/api/status-updates/send-now'))
      .field('content', 'hola')
      .field('audience', JSON.stringify({ mode: 'custom', groupIds: ['120363000000000001@g.us'] }));
    expect(res.status).toBe(503);
  });
});
