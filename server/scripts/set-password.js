#!/usr/bin/env node
// Cambia la contraseña de acceso a la aplicación sin dejarla en el historial de la shell:
// la pide de forma oculta, guarda su hash bcrypt en AUTH_PASSWORD_HASH del .env y rota
// AUTH_SECRET, lo que cierra todas las sesiones abiertas.
//   cd server && npm run set-password
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = process.env.ENV_FILE || path.join(ROOT_DIR, '.env');

// Una sola interfaz para todas las preguntas: no se pierden líneas entre una y otra
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const lines = rl[Symbol.asyncIterator]();
let prompt = '';
// No mostrar lo que se escribe (sólo la pregunta)
rl._writeToOutput = (text) => {
  if (text.startsWith(prompt)) rl.output.write(prompt);
};

async function askHidden(question) {
  prompt = question;
  rl.output.write(question);
  const { value = '' } = await lines.next();
  rl.output.write('\n');
  return value;
}

function setVar(content, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
}

if (!fs.existsSync(envFile)) {
  console.error(`No existe ${envFile}. Copia .env.example a .env primero.`);
  process.exit(1);
}

const password = await askHidden('Nueva contraseña (mínimo 12 caracteres): ');
if (password.length < 12) {
  console.error('La contraseña debe tener al menos 12 caracteres.');
  process.exit(1);
}
const repeated = await askHidden('Repite la contraseña: ');
rl.close();
if (password !== repeated) {
  console.error('Las contraseñas no coinciden. No se cambió nada.');
  process.exit(1);
}

let content = fs.readFileSync(envFile, 'utf8');
content = setVar(content, 'AUTH_PASSWORD_HASH', bcrypt.hashSync(password, 12));
content = setVar(content, 'AUTH_SECRET', crypto.randomBytes(48).toString('base64'));
fs.writeFileSync(envFile, content, { mode: 0o600 });
fs.chmodSync(envFile, 0o600);

console.log('Contraseña cambiada y AUTH_SECRET rotado (se cerrarán todas las sesiones).');
console.log('Reinicia el servidor para aplicarlo:  ./start.sh');
