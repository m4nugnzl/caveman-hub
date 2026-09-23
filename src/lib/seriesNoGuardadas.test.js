import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CADUCA_MS, almacenNoGuardadas, contarFallos, esDelCliente } from './seriesNoGuardadas';

/** `localStorage` de mentira, porque vitest corre sin navegador. */
const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

describe('almacenNoGuardadas', () => {
  const payload = { weekNumber: 3, dayName: 'Pull A', setIndex: 0, field: 'kg', value: '40' };

  it('apunta una rechazada con su error y sobrevive a recargar', () => {
    almacenNoGuardadas('u1').put('set:c1:s1:e1:0:kg', payload, { message: 'El día Pull A no está en el plan' }, 1000);
    const otra = almacenNoGuardadas('u1');
    expect(otra.list(2000)).toEqual([
      { key: 'set:c1:s1:e1:0:kg', payload, error: 'El día Pull A no está en el plan', at: 1000 },
    ]);
  });

  it('la misma clave sustituye a la anterior: es el mismo campo', () => {
    const a = almacenNoGuardadas('u1');
    a.put('set:c1:s1:e1:0:kg', payload, 'x', 1000);
    a.put('set:c1:s1:e1:0:kg', { ...payload, value: '42.5' }, 'x', 1500);
    expect(a.list(2000)).toHaveLength(1);
    expect(a.list(2000)[0].payload.value).toBe('42.5');
  });

  it('se quita cuando por fin se guarda', () => {
    const a = almacenNoGuardadas('u1');
    a.put('set:c1:s1:e1:0:kg', payload, 'x', 1000);
    expect(a.quitar('set:c1:s1:e1:0:kg')).toEqual([]);
    expect(a.list(2000)).toEqual([]);
  });

  it('caduca a las dos semanas', () => {
    const a = almacenNoGuardadas('u1');
    a.put('set:c1:s1:e1:0:kg', payload, 'x', 1000);
    expect(a.list(1000 + CADUCA_MS + 1)).toEqual([]);
  });

  it('cada persona tiene las suyas', () => {
    almacenNoGuardadas('u1').put('set:c1:s1:e1:0:kg', payload, 'x', 1000);
    expect(almacenNoGuardadas('u2').list(2000)).toEqual([]);
  });

  it('sabe de qué cliente es cada una', () => {
    expect(esDelCliente({ key: 'set:c1:s1:e1:0:kg' }, 'c1')).toBe(true);
    expect(esDelCliente({ key: 'set:c10:s1:e1:0:kg' }, 'c1')).toBe(false);
  });
});

describe('contarFallos', () => {
  it('una serie es una aunque fallen sus kilos y sus repeticiones', () => {
    expect(contarFallos(['set:c1:s1:e1:0:kg', 'set:c1:s1:e1:0:reps'])).toEqual({ series: 1, otros: 0, total: 1 });
  });

  it('dos series son dos; una clave repetida no cuenta dos veces', () => {
    expect(contarFallos(['set:c1:s1:e1:0:kg', 'set:c1:s1:e1:1:kg', 'set:c1:s1:e1:1:kg']).series).toBe(2);
  });

  it('lo que no es una serie se cuenta aparte', () => {
    expect(contarFallos(['workout:c1', 'set:c1:s1:e1:0:kg'])).toEqual({ series: 1, otros: 1, total: 2 });
  });
});
