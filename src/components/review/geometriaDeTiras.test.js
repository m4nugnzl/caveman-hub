import { describe, expect, it } from 'vitest';

import { COL_COMPACTA, medirColumnas, partir } from './geometriaDeTiras';

describe('medirColumnas', () => {
  it('con sitio, la casilla va completa y todas las semanas en una tira', () => {
    const m = medirColumnas({ ancho: 1240, mayor: 12 });
    expect(m.porTira).toBe(12);
    expect(m.compacta).toBe(false);
  });

  it('26 semanas en un portátil van compactas y sin partir', () => {
    const m = medirColumnas({ ancho: 1400, mayor: 26 });
    expect(m.porTira).toBe(26);
    expect(m.compacta).toBe(true);
    expect(m.col).toBeGreaterThanOrEqual(COL_COMPACTA);
  });

  it('si no caben a 52 px, la tira se parte antes que desplazarse', () => {
    const m = medirColumnas({ ancho: 900, mayor: 26 });
    expect(m.porTira).toBe(16);
    expect(m.col).toBeGreaterThanOrEqual(COL_COMPACTA);
  });

  it('en el teléfono, de 5 en 5', () => {
    expect(medirColumnas({ ancho: 360, mayor: 26, telefono: true }).porTira).toBe(5);
  });

  it('una fase corta no estira sus columnas', () => {
    expect(medirColumnas({ ancho: 1240, mayor: 3 }).col).toBe(96);
  });
});

describe('partir', () => {
  it('reparte en tramos parejos', () => {
    const lista = Array.from({ length: 30 }, (_, i) => i);
    expect(partir(lista, 26).map((t) => t.length)).toEqual([15, 15]);
    expect(partir(lista.slice(0, 7), 5).map((t) => t.length)).toEqual([4, 3]);
  });
});
