import { describe, expect, it } from 'vitest';

import { byCategory, mergeCatalog } from './catalog';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que tu biblioteca gane siempre. Si el catálogo pisara a lo tuyo, un entrenador
 * que ha ajustado los macros de «Pan integral» a los de la marca que compra
 * volvería a los genéricos sin enterarse, y las dietas que monte a partir de ahí
 * estarían mal en una cifra que nadie vuelve a mirar.
 *
 * Y que no salgan duplicados: ver dos «Pan integral» en el desplegable es elegir
 * el equivocado la mitad de las veces.
 */

const mios = [
  { id: 'a', name: 'Pan integral', proteinPer100: 11 },
  { id: 'b', name: 'Pechuga de pollo', proteinPer100: 23 },
];

const comunes = [
  { id: 'x', name: 'Pan integral', proteinPer100: 9 },
  { id: 'y', name: 'Lentejas', proteinPer100: 9 },
  { id: 'z', name: 'Salmón', proteinPer100: 20 },
];

describe('mergeCatalog', () => {
  it('lo tuyo primero y el catálogo detrás', () => {
    expect(mergeCatalog(mios, comunes).map((f) => f.name)).toEqual([
      'Pan integral',
      'Pechuga de pollo',
      'Lentejas',
      'Salmón',
    ]);
  });

  it('tu versión gana: el pan que sale es el tuyo', () => {
    const pan = mergeCatalog(mios, comunes).find((f) => f.name === 'Pan integral');
    expect(pan.proteinPer100).toBe(11);
    expect(pan.id).toBe('a');
  });

  it('no cuela un duplicado del catálogo', () => {
    const panes = mergeCatalog(mios, comunes).filter((f) => f.name === 'Pan integral');
    expect(panes).toHaveLength(1);
  });

  /*
    Los duplicados de verdad no se escriben igual. «Pan Integral» con mayúscula y
    «pan integral » con un espacio de más son el mismo alimento para cualquiera
    que lo lea, y comparando en crudo saldrían los dos.
  */
  it('compara sin distinguir mayúsculas ni espacios sobrantes', () => {
    const raros = [{ id: 'x', name: '  PAN INTEGRAL ' }];
    expect(mergeCatalog(mios, raros)).toHaveLength(2);
  });

  it('marca lo que viene del catálogo, y solo eso', () => {
    const out = mergeCatalog(mios, comunes);
    expect(out.find((f) => f.name === 'Lentejas').fromCatalog).toBe(true);
    expect(out.find((f) => f.name === 'Pechuga de pollo').fromCatalog).toBeUndefined();
  });

  it('sin catálogo devuelve tu biblioteca intacta', () => {
    expect(mergeCatalog(mios, [])).toEqual(mios);
    expect(mergeCatalog(mios, undefined)).toEqual(mios);
  });

  it('sin biblioteca devuelve el catálogo entero', () => {
    expect(mergeCatalog([], comunes)).toHaveLength(3);
    expect(mergeCatalog(undefined, comunes)).toHaveLength(3);
  });

  // 2 míos + 2 del catálogo (el pan se deduplica) y el nulo se descarta.
  it('aguanta filas nulas sin explotar', () => {
    expect(mergeCatalog(mios, [null, ...comunes])).toHaveLength(4);
  });
});

describe('byCategory', () => {
  it('agrupa respetando el orden de llegada', () => {
    const grupos = byCategory([
      { name: 'Pollo', category: 'Carne' },
      { name: 'Merluza', category: 'Pescado' },
      { name: 'Ternera', category: 'Carne' },
    ]);

    expect([...grupos.keys()]).toEqual(['Carne', 'Pescado']);
    expect(grupos.get('Carne').map((f) => f.name)).toEqual(['Pollo', 'Ternera']);
  });

  it('lo que no tiene categoría cae en Otros', () => {
    expect([...byCategory([{ name: 'X' }]).keys()]).toEqual(['Otros']);
  });
});
