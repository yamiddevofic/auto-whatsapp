import { Router } from 'express';
import { getLinkPreview, fetchImage } from '../link-preview.js';
import { validateQuery } from '../middleware/validate.js';
import { linkPreviewQuerySchema } from '../schemas.js';
import { asyncRoute } from '../middleware/error-handler.js';

const router = Router();

router.get('/api/link-preview', validateQuery(linkPreviewQuerySchema), asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'private, max-age=300');
  res.json(await getLinkPreview(req.validatedQuery.url));
}));

// Proxy de imágenes: el CSP del cliente sólo permite imágenes propias, data: y blob:
router.get('/api/link-preview/image', validateQuery(linkPreviewQuerySchema), asyncRoute(async (req, res) => {
  const { buffer, contentType } = await fetchImage(req.validatedQuery.url);
  res.set({
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=300',
  });
  res.send(buffer);
}));

export default router;
