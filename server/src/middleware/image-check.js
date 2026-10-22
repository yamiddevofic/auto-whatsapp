import fs from 'fs';
import { deleteAttachment } from '../db.js';

/**
 * Verificación del contenido real de las imágenes subidas. La extensión y el mimetype los
 * declara el cliente; los primeros bytes del archivo no se pueden falsear sin dejar de ser
 * una imagen válida. Ver Docs/02-hallazgos-seguridad.md SEC-018.
 */
const SIGNATURES = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'image/gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)) },
  {
    mime: 'image/webp',
    test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  },
];

export function detectImageMime(buffer) {
  return SIGNATURES.find((sig) => buffer.length >= 12 && sig.test(buffer))?.mime ?? null;
}

async function readHead(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const uploadedFiles = (req) => req.files ?? (req.file ? [req.file] : []);

export async function verifyImageContent(req, res, next) {
  const files = uploadedFiles(req);
  if (files.length === 0) return next();

  // Si la petición acaba en error, sus adjuntos no se quedan huérfanos en disco
  // (deleteAttachment no borra los que ya referencie alguna fila).
  res.on('finish', () => {
    if (res.statusCode >= 400) files.forEach((f) => deleteAttachment(f.path));
  });

  try {
    for (const file of files) {
      if (!detectImageMime(await readHead(file.path))) {
        return res.status(400).json({ error: 'El archivo no es una imagen JPG, PNG, GIF o WEBP válida' });
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}
