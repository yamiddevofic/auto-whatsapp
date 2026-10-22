import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { TEST_DATA_DIR } from './setup-env.js';

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

describe('login', () => {
  it('acepta las credenciales correctas y devuelve un token', () => {
    expect(token).toBeTruthy();
  });

  it('rechaza una contraseña incorrecta', async () => {
    await request(app).post('/api/auth/login')
      .send({ username: process.env.AUTH_USERNAME, password: 'incorrecta' })
      .expect(401);
  });

  it('rechaza un cuerpo sin credenciales con 400, no con 500', async () => {
    const res = await request(app).post('/api/auth/login').send({}).expect(400);
    expect(res.body.error).toBe('Datos inválidos');
  });
});

describe('protección de la API', () => {
  it('rechaza peticiones sin token', async () => {
    await request(app).get('/api/messages').expect(401);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const forged = jwt.sign({ username: 'intruso' }, 'secreto-incorrecto-pero-largo-igual', {
      issuer: 'auto-whatsapp',
    });
    await request(app).get('/api/messages').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('acepta el token válido', async () => {
    await request(app).get('/api/messages').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('invalida el token tras cerrar sesión', async () => {
    const login = await request(app).post('/api/auth/login')
      .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD });
    const temp = login.body.token;

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${temp}`).expect(200);
    await request(app).get('/api/messages').set('Authorization', `Bearer ${temp}`).expect(401);
  });
});

describe('subida de archivos', () => {
  it('no escribe archivos en peticiones no autenticadas', async () => {
    const fixture = path.join(TEST_DATA_DIR, 'fixture.png');
    fs.writeFileSync(fixture, Buffer.from('89504e470d0a1a0a', 'hex'));
    const uploads = path.join(TEST_DATA_DIR, 'uploads');
    const before = fs.readdirSync(uploads).length;

    await request(app).post('/api/messages').attach('image', fixture).expect(401);

    expect(fs.readdirSync(uploads).length).toBe(before);
  });
});

describe('adjuntos', () => {
  it('no sirve /uploads de forma anónima', async () => {
    await request(app).get('/uploads/cualquier-cosa.png').expect(401);
  });
});
