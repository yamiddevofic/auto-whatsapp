/**
 * Validación de entrada por esquema. Antes ningún endpoint validaba tipos, formatos ni
 * longitudes. Ver Docs/02-hallazgos-seguridad.md SEC-013.
 */
function format(error) {
  return error.issues.map((issue) => {
    const field = issue.path.join('.');
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: format(result.error) });
  }
  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    return res.status(400).json({ error: 'Parámetros inválidos', details: format(result.error) });
  }
  req.validatedQuery = result.data;
  next();
};
