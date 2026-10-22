import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import zlib from 'zlib';
import './setup-env.js';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(64)]);
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
  <title>Título de respaldo</title>
  <meta property="og:title" content="Oferta &amp; descuentos">
  <meta property='og:description' content='Hasta 50% en toda la tienda'>
  <meta property="og:site_name" content="Mi Tienda">
  <meta property="og:image" content="/img/portada.png">
</head><body>hola</body></html>`;

let lp;
let app;
let token;
let server;
let base;

beforeAll(async () => {
  lp = await import('../src/link-preview.js');
  const { initDatabase } = await import('../src/db.js');
  const { initContactsTable } = await import('../src/contacts.js');
  const { initAgendaTable } = await import('../src/agenda.js');
  await initDatabase();
  initContactsTable();
  initAgendaTable();
  const { createApp } = await import('../src/app.js');
  app = createApp();
  token = (await request(app).post('/api/auth/login')
    .send({ username: process.env.AUTH_USERNAME, password: process.env.AUTH_PASSWORD })).body.token;

  server = createServer((req, res) => {
    if (req.url === '/pagina') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(PAGE); }
    if (req.url === '/comprimida') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Encoding', 'gzip');
      return res.end(zlib.gzipSync(PAGE));
    }
    if (req.url === '/foto' || req.url === '/img/portada.png') { res.setHeader('Content-Type', 'image/png'); return res.end(PNG); }
    if (req.url === '/falsa-imagen') { res.setHeader('Content-Type', 'image/png'); return res.end('<script>alert(1)</script>'); }
    if (req.url === '/salto') { res.statusCode = 302; res.setHeader('Location', '/pagina'); return res.end(); }
    if (req.url === '/bucle') { res.statusCode = 302; res.setHeader('Location', '/bucle'); return res.end(); }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server?.close());
afterEach(() => lp._testing.setAllowPrivate(false));

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

describe('protección SSRF', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/x',
    'http://usuario:clave@example.com/',
    'http://example.com:8080/',
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://192.168.1.1/',
  ])('rechaza %s', (url) => {
    expect(() => lp.parsePublicUrl(url)).toThrow();
  });

  it('acepta una URL pública normal', () => {
    expect(lp.parsePublicUrl('https://example.com/a?b=1').hostname).toBe('example.com');
  });

  it('bloquea un nombre que resuelve a loopback al conectar (no sólo los literales IP)', async () => {
    await expect(lp.getLinkPreview('http://localhost/')).rejects.toThrow(/no permitida/);
  });

  it('bloquea una redirección hacia la red interna', async () => {
    // Con la política estricta el propio servidor de pruebas (127.0.0.1) ya es inaccesible
    await expect(lp.getLinkPreview(`${base}/salto`)).rejects.toThrow();
  });

  it('clasifica direcciones públicas y privadas', () => {
    expect(lp.isBlockedAddress('8.8.8.8')).toBe(false);
    expect(lp.isBlockedAddress('2606:4700:4700::1111')).toBe(false);
    expect(lp.isBlockedAddress('100.64.1.1')).toBe(true);
    expect(lp.isBlockedAddress('fd00::1')).toBe(true);
  });
});

describe('lectura de la vista previa', () => {
  it('extrae Open Graph, decodifica entidades y resuelve la imagen relativa', () => {
    const info = lp.parseHtmlMeta(PAGE, 'https://tienda.example/promo');
    expect(info).toEqual({
      title: 'Oferta & descuentos',
      description: 'Hasta 50% en toda la tienda',
      siteName: 'Mi Tienda',
      image: 'https://tienda.example/img/portada.png',
    });
  });

  it('usa <title> y el dominio cuando no hay Open Graph', () => {
    const info = lp.parseHtmlMeta('<title> Hola  mundo </title>', 'https://www.ejemplo.com/');
    expect(info.title).toBe('Hola mundo');
    expect(info.siteName).toBe('ejemplo.com');
    expect(info.image).toBeNull();
  });

  it('describe una página, siguiendo redirecciones y descomprimiendo gzip', async () => {
    lp._testing.setAllowPrivate(true);
    const page = await lp.getLinkPreview(`${base}/salto`);
    expect(page).toMatchObject({ kind: 'page', title: 'Oferta & descuentos', image: `${base}/img/portada.png` });
    const gz = await lp.getLinkPreview(`${base}/comprimida`);
    expect(gz.title).toBe('Oferta & descuentos');
  });

  it('detecta que un enlace es una imagen', async () => {
    lp._testing.setAllowPrivate(true);
    expect(await lp.getLinkPreview(`${base}/foto`)).toMatchObject({ kind: 'image', contentType: 'image/png' });
  });

  it('no acepta como imagen algo que sólo dice serlo', async () => {
    lp._testing.setAllowPrivate(true);
    await expect(lp.fetchImage(`${base}/falsa-imagen`)).rejects.toThrow(/JPG, PNG/);
  });

  it('corta los bucles de redirección', async () => {
    lp._testing.setAllowPrivate(true);
    await expect(lp.getLinkPreview(`${base}/bucle`)).rejects.toThrow(/redirige/);
  });
});

describe('rutas /api/link-preview', () => {
  it('exige autenticación', async () => {
    expect((await request(app).get('/api/link-preview?url=https://example.com')).status).toBe(401);
  });

  it('valida el enlace', async () => {
    const res = await auth(request(app).get('/api/link-preview?url=javascript:alert(1)'));
    expect(res.status).toBe(400);
  });

  it('rechaza una dirección interna con un mensaje claro', async () => {
    const res = await auth(request(app).get('/api/link-preview?url=http://127.0.0.1/'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no permitida/);
  });

  it('sirve la imagen de un enlace con su tipo real', async () => {
    lp._testing.setAllowPrivate(true);
    const res = await auth(request(app).get(`/api/link-preview/image?url=${encodeURIComponent(`${base}/foto`)}`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
