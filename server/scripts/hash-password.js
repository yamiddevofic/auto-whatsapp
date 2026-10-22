#!/usr/bin/env node
// Genera el hash bcrypt de una contraseña para AUTH_PASSWORD_HASH.
//   npm run hash-password -- 'MiContraseñaSegura'
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const [, , passwordArg] = process.argv;

if (!passwordArg) {
  console.error('Uso: npm run hash-password -- \'TuContraseña\'');
  console.error('Para generar también un AUTH_SECRET nuevo:');
  console.error(`  AUTH_SECRET=${crypto.randomBytes(48).toString('base64')}`);
  process.exit(1);
}

if (passwordArg.length < 12) {
  console.error('La contraseña debe tener al menos 12 caracteres.');
  process.exit(1);
}

console.log(bcrypt.hashSync(passwordArg, 12));
