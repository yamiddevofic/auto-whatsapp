import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { TEST_DATA_DIR } from './setup-env.js';

let app;
let token;
let db;
let httpServer;
let port;

const uploads = path.join(TEST_DATA_DIR, 'uploads');
const PNG_HEADER = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const auth = (req, t = token) => req.set('Authorization', `Bearer ${t}`);
const login = async () => (await request(app).post('/api/auth/login')
  .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD })).body.token;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  db = await import('../src/db.js');
  const { initContactsTable } = await import('../src/contacts.js');
  const { initAgendaTable } = await import('../src/agenda.js');
  await db.initDatabase();
  initContactsTable();
  initAgendaTable();

  const { createApp } = await import('../src/app.js');
  const { socketAuth } = await import('../src/auth.js');
  const { setIO } = await import('../src/realtime.js');
  app = createApp();

  httpServer = createServer(app);
  const io = new Server(httpServer);
  io.use(socketAuth);
  setIO(io);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  port = httpServer.address().port;

  token = await login();
});

afterAll(() => new Promise((resolve) => httpServer.close(resolve)));

describe('reautenticación en operaciones destructivas (SEC-025)', () => {
  it('rechaza el borrado de la agenda sin contraseña', async () => {
    await auth(request(app).delete('/api/agenda')).send({}).expect(403);
  });

  it('rechaza una contraseña incorrecta sin cerrar la sesión (403, no 401)', async () => {
    await auth(request(app).delete('/api/agenda')).send({ password: 'otra' }).expect(403);
    await auth(request(app).get('/api/messages')).expect(200);
  });

  it('permite la operación con la contraseña correcta', async () => {
    await auth(request(app).delete('/api/agenda'))
      .send({ password: process.env.AUTH_PASSWORD }).expect(200);
  });

  it('protege también la desvinculación de WhatsApp', async () => {
    await auth(request(app).post('/api/unlink')).send({}).expect(403);
  });
});

describe('contenido real de las imágenes (SEC-018)', () => {
  it('rechaza un archivo .png que no es una imagen y no lo deja en disco', async () => {
    const before = fs.readdirSync(uploads).length;
    const res = await auth(request(app).post('/api/messages'))
      .field('groupId', '123@g.us').field('groupName', 'G').field('content', 'hola')
      .field('scheduledAt', new Date(Date.now() + 3600_000).toISOString())
      .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
    expect(res.body.error).toMatch(/no es una imagen/);
    await wait(50);
    expect(fs.readdirSync(uploads).length).toBe(before);
  });

  it('borra la imagen válida si la petición falla por validación', async () => {
    const before = fs.readdirSync(uploads).length;
    await auth(request(app).post('/api/messages'))
      .field('groupId', '123@g.us').field('groupName', 'G').field('content', 'hola')
      .field('scheduledAt', 'fecha-invalida')
      .attach('image', PNG_HEADER, { filename: 'ok.png', contentType: 'image/png' })
      .expect(400);
    await wait(50);
    expect(fs.readdirSync(uploads).length).toBe(before);
  });

  it('acepta una imagen real y la conserva', async () => {
    const res = await auth(request(app).post('/api/messages'))
      .field('groupId', '123@g.us').field('groupName', 'G').field('content', 'hola')
      .field('scheduledAt', new Date(Date.now() + 3600_000).toISOString())
      .attach('image', PNG_HEADER, { filename: 'ok.png', contentType: 'image/png' })
      .expect(201);
    expect(fs.existsSync(res.body.image_path)).toBe(true);
  });
});

describe('adjuntos compartidos (SEC-023)', () => {
  it('no borra una imagen que otra fila sigue usando', async () => {
    const file = path.join(uploads, 'compartida.png');
    fs.writeFileSync(file, PNG_HEADER);

    const su = db.createStatusUpdate({ content: null, imagePath: file, scheduledAt: new Date().toISOString() });
    const published = db.createPublishedStatus({ content: null, imagePath: file });

    db.deleteStatusUpdate(su.id);
    await wait(50);
    expect(fs.existsSync(file)).toBe(true);

    db.deletePublishedStatus(published.id);
    await wait(50);
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe('búsqueda y paginación en SQL (ARQ-004)', () => {
  it('filtra la agenda y trata % como literal', async () => {
    const { importAgendaContacts } = await import('../src/agenda.js');
    importAgendaContacts([
      { name: 'Ana 100%', phone: '+573001112233' },
      { name: 'Bruno', phone: '+573004445566' },
    ]);

    const pct = await auth(request(app).get('/api/agenda?search=%25')).expect(200);
    expect(pct.body.items.map((c) => c.name)).toEqual(['Ana 100%']);

    const unchecked = await auth(request(app).get('/api/agenda?filter=unchecked&limit=1')).expect(200);
    expect(unchecked.body.total).toBe(2);
    expect(unchecked.body.items).toHaveLength(1);
    expect(unchecked.body.totalPages).toBe(2);
  });

  it('busca contactos por el nombre de la agenda', async () => {
    const { saveContacts } = await import('../src/contacts.js');
    saveContacts([{ jid: '573004445566@s.whatsapp.net', name: null, notify: null }]);
    const res = await auth(request(app).get('/api/contacts?search=brun')).expect(200);
    expect(res.body.items[0].agenda_name).toBe('Bruno');
  });
});

describe('WebSocket (SEC-003, SEC-020)', () => {
  const connect = (t) => ioClient(`http://127.0.0.1:${port}`, {
    auth: t ? { token: t } : undefined, transports: ['websocket'], reconnection: false,
  });

  it('rechaza conexiones anónimas', async () => {
    const socket = connect();
    const err = await new Promise((resolve) => socket.on('connect_error', resolve));
    expect(err.message).toBe('unauthorized');
    socket.close();
  });

  it('cierra el socket al cerrar la sesión', async () => {
    const temp = await login();
    const socket = connect(temp);
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    const disconnected = new Promise((resolve) => socket.on('disconnect', resolve));
    await auth(request(app).post('/api/auth/logout'), temp).expect(200);
    await disconnected;
    socket.close();
  });
});

describe('estado del servicio', () => {
  it('/health indica proceso vivo aunque WhatsApp no esté vinculado', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('/health/ready devuelve 503 sin sesión de WhatsApp', async () => {
    await request(app).get('/health/ready').expect(503);
  });

  it('el envío inmediato responde 503 claro si WhatsApp no está conectado', async () => {
    const res = await auth(request(app).post('/api/direct-messages/send-now'))
      .send({ numbers: ['573001112233'], content: 'hola' }).expect(503);
    expect(res.body.error).toBe('WhatsApp no está conectado');
  });
});
