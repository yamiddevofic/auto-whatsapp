// Entorno aislado para las pruebas: datos en un directorio temporal y credenciales ficticias.
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-whatsapp-test-'));

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = tmp;
process.env.AUTH_USERNAME = 'tester';
process.env.AUTH_PASSWORD = 'contrasena-de-prueba';
process.env.AUTH_PASSWORD_HASH = bcrypt.hashSync(process.env.AUTH_PASSWORD, 4);
process.env.AUTH_SECRET = 'secreto-de-pruebas-de-32-caracteres-minimo';
process.env.LOG_LEVEL = 'silent';

export const TEST_DATA_DIR = tmp;
