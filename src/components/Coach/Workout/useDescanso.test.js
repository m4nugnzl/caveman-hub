import { describe, expect, it } from 'vitest';

import { TOPE_SIN_PAUTA, lecturaDelDescanso, mmss } from './useDescanso';

/**
 * LA REGLA DEL DESCANSO.
 *
 * Lo que se prueba aquí es la decisión, no el reloj: con pauta cuenta atrás y
 * se apaga al llegar; sin pauta cuenta hacia arriba y no promete nada. Es la
 * corrección de septiembre de 2026 — antes, sin pauta no había NADA, y sin
 * pauta está la mayoría de los entrenadores.
 */
const T0 = 1_600_000_000_000;
const enSegundo = (n, pauta) => lecturaDelDescanso({ desde: T0, pauta, ahora: T0 + n * 1000 });

describe('lecturaDelDescanso', () => {
  it('sin arrancar no enseña nada', () => {
    expect(lecturaDelDescanso({ desde: null, pauta: 90, ahora: T0 })).toBeNull();
  });

  describe('con descanso pautado', () => {
    it('cuenta hacia atrás desde la pauta', () => {
      expect(enSegundo(0, 90)).toEqual({ segundos: 90, cuentaAtras: true, pauta: 90 });
      expect(enSegundo(18, 90)).toEqual({ segundos: 72, cuentaAtras: true, pauta: 90 });
    });

    it('se apaga al llegar a cero y no sigue en negativo', () => {
      expect(enSegundo(89, 90).segundos).toBe(1);
      expect(enSegundo(90, 90)).toBeNull();
      expect(enSegundo(400, 90)).toBeNull();
    });
  });

  describe('sin descanso pautado', () => {
    /* La mitad del cambio: antes esto devolvía `null` desde el primer segundo,
       así que quien no pauta —el caso mayoritario— no veía nunca la pieza. */
    it('cuenta hacia arriba en vez de no existir', () => {
      expect(enSegundo(0, null)).toEqual({ segundos: 0, cuentaAtras: false, pauta: null });
      expect(enSegundo(48, null)).toEqual({ segundos: 48, cuentaAtras: false, pauta: null });
    });

    it('trata el cero y lo que no es número como «sin pauta»', () => {
      expect(enSegundo(48, 0).cuentaAtras).toBe(false);
      expect(enSegundo(48, undefined).cuentaAtras).toBe(false);
    });

    it('se apaga sola en el tope: por encima ya no es un descanso', () => {
      expect(enSegundo(TOPE_SIN_PAUTA - 1, null).segundos).toBe(TOPE_SIN_PAUTA - 1);
      expect(enSegundo(TOPE_SIN_PAUTA, null)).toBeNull();
    });
  });

  it('un reloj que va hacia atrás no da segundos negativos', () => {
    expect(lecturaDelDescanso({ desde: T0, pauta: null, ahora: T0 - 5000 }).segundos).toBe(0);
  });
});

describe('mmss', () => {
  it('escribe los segundos como los lee quien descansa', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(9)).toBe('0:09');
    expect(mmss(72)).toBe('1:12');
    expect(mmss(600)).toBe('10:00');
  });
});
