import { describe, expect, it } from 'vitest';

import {
  coverageSaid,
  declares,
  foodMicro,
  freezeMicros,
  microError,
  microPer100,
  microSaid,
  sumMicros,
} from './micros';

/* Tres alimentos: uno que lo declara todo, uno que declara un cero de verdad y
   uno que no dice nada. Los tres casos que este módulo existe para distinguir. */
const avena = { name: 'Avena', grams: 80, fiberPer100: 10, sugarsPer100: 1, saltPer100: '0,02' };
const pollo = { name: 'Pollo', grams: 200, fiberPer100: 0 };
const suplemento = { name: 'Batido', grams: 30 };

describe('microPer100', () => {
  it('distingue «no dice» de «no lleva»', () => {
    expect(microPer100(pollo, 'fiber')).toBe(0);
    expect(microPer100(suplemento, 'fiber')).toBe(null);
    expect(declares(pollo, 'fiber')).toBe(true);
    expect(declares(suplemento, 'fiber')).toBe(false);
  });

  it('lee la coma decimal y la cadena de `numeric`', () => {
    expect(microPer100(avena, 'salt')).toBe(0.02);
    expect(microPer100({ fiberPer100: '3.5' }, 'fiber')).toBe(3.5);
  });

  it('de un micro que no existe no inventa nada', () => {
    expect(microPer100(avena, 'hierro')).toBe(null);
  });
});

describe('foodMicro', () => {
  it('escala por los gramos de la entrada', () => {
    expect(foodMicro(avena, 'fiber')).toBeCloseTo(8, 5);
  });

  it('sin declarar no aporta cero: no aporta nada', () => {
    expect(foodMicro(suplemento, 'fiber')).toBe(null);
  });
});

describe('sumMicros', () => {
  it('suma solo lo declarado y dice de cuántos sale', () => {
    const total = sumMicros([avena, pollo, suplemento]);
    expect(total.fiber.value).toBeCloseTo(8, 5);
    expect(total.fiber.declared).toBe(2);
    expect(total.fiber.total).toBe(3);
  });

  it('sin nadie que lo declare el valor es null, nunca cero', () => {
    const total = sumMicros([suplemento]);
    expect(total.saturates.value).toBe(null);
    expect(total.saturates.declared).toBe(0);
  });

  it('la lista vacía no dice nada de nada', () => {
    const total = sumMicros([]);
    expect(total.fiber).toEqual({ value: null, declared: 0, total: 0 });
  });
});

describe('coverageSaid', () => {
  it('solo habla cuando la cobertura es parcial', () => {
    expect(coverageSaid({ declared: 12, total: 18 })).toBe('12 de 18 lo declaran');
    expect(coverageSaid({ declared: 18, total: 18 })).toBe(null);
    expect(coverageSaid({ declared: 0, total: 18 })).toBe(null);
  });
});

describe('microSaid', () => {
  it('dice la cifra con su unidad, y «no dice» cuando no la hay', () => {
    expect(microSaid('fiber', { value: 22.4, declared: 3, total: 3 })).toBe('22 g de fibra');
    expect(microSaid('salt', { value: 1.24, declared: 3, total: 3 })).toBe('1,2 g de sal');
    expect(microSaid('fiber', { value: null, declared: 0, total: 3 })).toBe('Fibra: no dice');
  });
});

describe('freezeMicros', () => {
  it('congela lo declarado y NO escribe lo que no se dice', () => {
    expect(freezeMicros(avena)).toEqual({
      fiberPer100: 10,
      sugarsPer100: 1,
      saltPer100: 0.02,
    });
    expect(freezeMicros(suplemento)).toEqual({});
    // Un cero declarado sí viaja: es un hecho.
    expect(freezeMicros(pollo)).toEqual({ fiberPer100: 0 });
  });
});

describe('microError', () => {
  it('en blanco vale: significa «no dice»', () => {
    expect(microError('')).toBe(null);
    expect(microError(null)).toBe(null);
  });

  it('corta el error de tecleo con el mismo tope que los macros', () => {
    expect(microError('101')).toBe('Máximo 100 por 100 g.');
    expect(microError('-1')).toBe('No puede ser negativo.');
    expect(microError('mucha')).toBe('Solo números.');
    expect(microError('3,5')).toBe(null);
  });
});
