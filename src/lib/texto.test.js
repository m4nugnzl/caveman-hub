import { describe, expect, it } from 'vitest';

import { norm, pluralEs } from './texto';

describe('norm', () => {
  it('quita mayúsculas y tildes para poder comparar lo que escribe una persona', () => {
    expect(norm('Plátano')).toBe('platano');
    expect(norm('MARTÍNEZ')).toBe('martinez');
    expect(norm('Peña')).toBe('pena');
  });

  it('aguanta lo que no es texto', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
    expect(norm(0)).toBe('');
  });
});

describe('pluralEs', () => {
  /* Las unidades REALES del catálogo de la casa: son las que se ven en la
     dieta de cualquier cliente, y son las que decían «3 unidads». */
  it.each([
    ['unidad', 'unidades'],
    ['dátil', 'dátiles'],
    ['cucharada', 'cucharadas'],
    ['vaso', 'vasos'],
    ['loncha', 'lonchas'],
    ['rebanada', 'rebanadas'],
    ['cazo', 'cazos'],
    ['lata', 'latas'],
    ['tortita', 'tortitas'],
    ['yogur', 'yogures'],
    ['huevo', 'huevos'],
    ['palito', 'palitos'],
    ['onza', 'onzas'],
    ['clara', 'claras'],
    ['plátano', 'plátanos'],
    ['diente', 'dientes'],
    ['higo', 'higos'],
    ['cebolla', 'cebollas'],
    ['galleta', 'galletas'],
    ['yema', 'yemas'],
    ['cacito', 'cacitos'],
  ])('«%s» → «%s»', (uno, varios) => {
    expect(pluralEs(uno)).toBe(varios);
  });

  it('la -z se hace -ces', () => {
    expect(pluralEs('nuez')).toBe('nueces');
    expect(pluralEs('rodaja')).toBe('rodajas');
  });

  it('la aguda con tilde la pierde, y la llana la conserva', () => {
    // Deja de ser aguda al ganar una sílaba, así que la tilde sobra.
    expect(pluralEs('melón')).toBe('melones');
    expect(pluralEs('limón')).toBe('limones');
    // La tilde no está en la última sílaba: se queda donde está.
    expect(pluralEs('dátil')).toBe('dátiles');
    expect(pluralEs('azúcar')).toBe('azúcares');
  });

  it('la llana acabada en -s no cambia', () => {
    expect(pluralEs('lunes')).toBe('lunes');
  });

  it('devuelve lo que le den cuando no hay palabra', () => {
    expect(pluralEs('')).toBe('');
    expect(pluralEs(null)).toBe('');
    expect(pluralEs('  ')).toBe('');
  });
});
