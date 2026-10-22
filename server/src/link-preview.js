import http from 'http';
import https from 'https';
import dns from 'dns';
import net from 'net';
import zlib from 'zlib';
import config from './config.js';
import { logger } from './logger.js';
import { httpError } from './middleware/error-handler.js';
import { detectImageMime } from './middleware/image-check.js';

/**
 * Vista previa de enlaces. El servidor descarga la URL que pega el usuario (el CSP del
 * cliente no permite cargar imágenes externas), así que cada petición se protege contra
 * SSRF: sólo http/https a puertos 80/443, y la dirección IP se valida en el momento de
 * conectar (lookup propio), no antes, para que un DNS que cambie entre comprobación y
 * conexión (DNS rebinding) no pueda apuntar a la red interna. Las redirecciones se
 * siguen a mano y cada salto pasa por la misma validación.
 */

const HTML_MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;
const USER_AGENT = 'Mozilla/5.0 (compatible; AutoWhatsApp-LinkPreview/1.0)';

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
]) blocked.addSubnet(addr, prefix, 'ipv6');

// Sólo para los tests, que levantan un servidor en 127.0.0.1
const policy = { allowPrivate: false };
export const _testing = { setAllowPrivate: (v) => { policy.allowPrivate = v; } };

export function isBlockedAddress(address) {
  if (policy.allowPrivate) return false;
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    // IPv4 mapeada en IPv6 (::ffff:10.0.0.1): se comprueba la IPv4 de dentro
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find((a) => isBlockedAddress(a.address));
    if (bad || addresses.length === 0) {
      return callback(httpError(400, 'Ese enlace apunta a una dirección no permitida'));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

export function parsePublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw httpError(400, 'El enlace no es válido');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw httpError(400, 'Sólo se admiten enlaces http o https');
  }
  if (url.username || url.password) throw httpError(400, 'El enlace no puede llevar credenciales');
  if (url.port && !['80', '443'].includes(url.port) && !policy.allowPrivate) {
    throw httpError(400, 'Sólo se admiten los puertos 80 y 443');
  }
  // Un literal IP no pasa por lookup: se valida aquí
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw httpError(400, 'Ese enlace apunta a una dirección no permitida');
  }
  return url;
}

function requestOnce(url, maxBytes, accept) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      lookup: safeLookup,
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'es,en;q=0.8',
      },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url) });
      }
      if (status >= 400) {
        res.resume();
        return reject(httpError(422, `El enlace respondió con un error (${status})`));
      }

      // La descompresión cuenta los bytes ya descomprimidos: evita bombas gzip
      const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      let size = 0;
      let done = false;
      const finish = (truncated) => {
        if (done) return;
        done = true;
        req.destroy();
        resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated });
      };
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
          finish(true);
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => finish(false));
      stream.on('error', (err) => { if (!done) { done = true; reject(err); } });
    });
    req.on('timeout', () => req.destroy(httpError(504, 'El enlace tardó demasiado en responder')));
    req.on('error', (err) => reject(err.publicMessage ? err : httpError(422, 'No se pudo abrir el enlace')));
    req.end();
  });
}

async function safeFetch(rawUrl, { maxBytes, accept }) {
  let url = parsePublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(url, maxBytes, accept);
    if (!res.redirect) return { ...res, url };
    url = parsePublicUrl(res.redirect.href);
  }
  throw httpError(422, 'El enlace redirige demasiadas veces');
}

const contentTypeOf = (headers) => String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();

/* ---------- Lectura de metadatos HTML ---------- */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const clean = (s, max) => {
  if (!s) return null;
  const out = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return out ? out.slice(0, max) : null;
};

function decodeHtml(buffer, headers) {
  const headerCharset = String(headers['content-type'] || '').match(/charset=([^;]+)/i)?.[1];
  const metaCharset = buffer.toString('latin1', 0, 4096).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const label of [headerCharset, metaCharset, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label.trim().toLowerCase()).decode(buffer);
    } catch { /* etiqueta desconocida: siguiente */ }
  }
  return buffer.toString('utf8');
}

export function parseHtmlMeta(html, baseUrl) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const [, name, , dq, sq, bare] of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[name.toLowerCase()] = dq ?? sq ?? bare;
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content != null && !(key in meta)) meta[key] = attrs.content;
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const resolve = (u) => {
    if (!u) return null;
    try {
      const abs = new URL(decodeEntities(u.trim()), baseUrl);
      return abs.protocol === 'http:' || abs.protocol === 'https:' ? abs.href : null;
    } catch {
      return null;
    }
  };

  return {
    title: clean(meta['og:title'] || meta['twitter:title'] || title, 200),
    description: clean(meta['og:description'] || meta['twitter:description'] || meta.description, 400),
    siteName: clean(meta['og:site_name'], 100) || new URL(baseUrl).hostname.replace(/^www\./, ''),
    image: resolve(meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src']),
  };
}

/* ---------- API pública ---------- */

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 200;

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Devuelve { kind: 'image', ... } o { kind: 'page', title, description, siteName, image }. */
export async function getLinkPreview(rawUrl) {
  const key = String(rawUrl).trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  const res = await safeFetch(key, {
    maxBytes: HTML_MAX_BYTES,
    accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5',
  });
  const type = contentTypeOf(res.headers);
  const finalUrl = res.url.href;

  if (type.startsWith('image/') || detectImageMime(res.body)) {
    return remember(key, { kind: 'image', url: finalUrl, contentType: detectImageMime(res.body) || type });
  }
  if (!type.includes('html') && type !== '') {
    return remember(key, { kind: 'other', url: finalUrl, contentType: type, siteName: res.url.hostname.replace(/^www\./, '') });
  }
  const info = parseHtmlMeta(decodeHtml(res.body, res.headers), finalUrl);
  return remember(key, { kind: 'page', url: finalUrl, ...info });
}

/** Descarga una imagen de un enlace y comprueba por sus primeros bytes que lo es de verdad. */
export async function fetchImage(rawUrl) {
  const res = await safeFetch(rawUrl, { maxBytes: config.limits.imageBytes + 1, accept: 'image/*' });
  if (res.truncated || res.body.length > config.limits.imageBytes) {
    throw httpError(413, 'La imagen del enlace supera el tamaño máximo permitido');
  }
  const contentType = detectImageMime(res.body);
  if (!contentType) throw httpError(415, 'El enlace no contiene una imagen JPG, PNG, GIF o WEBP');
  return { buffer: res.body, contentType, url: res.url.href };
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/i;

/**
 * Construye la vista previa que Baileys adjunta al mensaje (título, descripción y
 * miniatura), para que quien lo recibe vea la tarjeta del enlace. Si algo falla, el
 * mensaje se envía igual, sin tarjeta.
 */
const waCache = new Map();

export async function buildWhatsAppLinkPreview(text) {
  const matched = text?.match(URL_IN_TEXT)?.[0];
  if (!matched) return undefined;
  // Un mensaje directo se envía una vez por destinatario: la tarjeta se reutiliza
  const hit = waCache.get(matched);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  const value = await buildUncached(matched);
  if (waCache.size >= CACHE_MAX) waCache.delete(waCache.keys().next().value);
  waCache.set(matched, { at: Date.now(), value });
  return value;
}

async function buildUncached(matched) {
  try {
    const info = await getLinkPreview(matched);
    if (info.kind !== 'page' || (!info.title && !info.description)) return undefined;

    let jpegThumbnail;
    if (info.image) {
      try {
        const { extractImageThumb } = await import('@whiskeysockets/baileys');
        const { buffer } = await fetchImage(info.image);
        jpegThumbnail = (await extractImageThumb(buffer, 192)).buffer;
      } catch (err) {
        logger.debug({ err: err.message }, 'Vista previa sin miniatura');
      }
    }
    return {
      'canonical-url': info.url,
      'matched-text': matched,
      title: info.title || info.siteName,
      description: info.description || undefined,
      jpegThumbnail,
    };
  } catch (err) {
    logger.debug({ err: err.message }, 'No se pudo generar la vista previa del enlace');
    return undefined;
  }
}
