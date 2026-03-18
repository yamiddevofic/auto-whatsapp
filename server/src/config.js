import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export default {
  port: process.env.PORT || 3001,
  uploadsDir: path.join(ROOT_DIR, 'uploads'),
  authDir: path.join(ROOT_DIR, 'auth_info'),
  dbPath: path.join(ROOT_DIR, 'data.db'),
  clientDist: path.join(ROOT_DIR, 'client/dist'),
};
