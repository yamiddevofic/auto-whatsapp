import { describe, it, expect } from 'vitest';
import './setup-env.js';
import { parseVCF } from '../src/agenda.js';

describe('parseVCF', () => {
  it('extrae nombre y teléfono de una tarjeta simple', () => {
    const contacts = parseVCF(`BEGIN:VCARD
VERSION:3.0
FN:Ana Pérez
TEL;TYPE=CELL:+57 300 123 4567
END:VCARD`);
    expect(contacts).toEqual([{ name: 'Ana Pérez', phone: '+573001234567' }]);
  });

  it('decodifica QUOTED-PRINTABLE', () => {
    const contacts = parseVCF(`BEGIN:VCARD
FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 Mu=C3=B1oz
TEL:3001234567
END:VCARD`);
    expect(contacts[0].name).toBe('José Muñoz');
  });

  it('devuelve una entrada por cada teléfono del contacto', () => {
    const contacts = parseVCF(`BEGIN:VCARD
FN:Dos Numeros
TEL;TYPE=CELL:3001111111
TEL;TYPE=WORK:3002222222
END:VCARD`);
    expect(contacts).toHaveLength(2);
  });

  it('ignora tarjetas sin nombre o sin teléfono', () => {
    expect(parseVCF('BEGIN:VCARD\nTEL:3001234567\nEND:VCARD')).toHaveLength(0);
    expect(parseVCF('BEGIN:VCARD\nFN:Sin Telefono\nEND:VCARD')).toHaveLength(0);
  });

  it('descarta números demasiado cortos', () => {
    expect(parseVCF('BEGIN:VCARD\nFN:Corto\nTEL:123\nEND:VCARD')).toHaveLength(0);
  });

  it('no falla con una cadena vacía', () => {
    expect(parseVCF('')).toEqual([]);
  });
});
