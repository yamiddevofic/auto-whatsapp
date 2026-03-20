import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import config from './config.js';
import { initWhatsApp } from './whatsapp.js';
import { loadPendingMessages } from './scheduler.js';
import statusRoutes from './routes/status.js';
import groupsRoutes from './routes/groups.js';
import messagesRoutes from './routes/messages.js';
import statusUpdatesRoutes from './routes/status-updates.js';
import contactsRoutes from './routes/contacts.js';
import agendaRoutes from './routes/agenda.js';
import directMessagesRoutes from './routes/direct-messages.js';

// Ensure uploads dir exists
fs.mkdirSync(config.uploadsDir, { recursive: true });

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Apply multer to message and status update creation routes
app.use('/api/messages', (req, res, next) => {
  if (req.method === 'POST') {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
});

app.use('/api/status-updates', (req, res, next) => {
  if (req.method === 'POST') {
    upload.array('images', 20)(req, res, next);
  } else {
    next();
  }
});

app.use('/api/direct-messages', (req, res, next) => {
  if (req.method === 'POST') {
    upload.single('image')(req, res, next);
  } else {
    next();
  }
});

// Multer for VCF upload (in memory)
const vcfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.vcf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .vcf'));
    }
  },
});

app.use('/api/agenda/import', (req, res, next) => {
  if (req.method === 'POST') {
    vcfUpload.single('vcf')(req, res, next);
  } else {
    next();
  }
});

// Routes
app.use(statusRoutes);
app.use(groupsRoutes);
app.use(messagesRoutes);
app.use(statusUpdatesRoutes);
app.use(contactsRoutes);
app.use(agendaRoutes);
app.use(directMessagesRoutes);

// Serve uploaded images
app.use('/uploads', express.static(config.uploadsDir));

// In production, serve React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(config.clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
}

// Catch unhandled errors to prevent process crash
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});

// Start
async function start() {
  await initWhatsApp();
  loadPendingMessages();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${config.port}`);
  });
}

start().catch(console.error);
