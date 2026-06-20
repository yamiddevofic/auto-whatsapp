import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.AUTH_SECRET || 'auto-whatsapp-secret-key-2024';

export function generateToken(username) {
  return jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = decoded;
  next();
}
