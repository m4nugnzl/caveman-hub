import { describe, expect, it } from 'vitest';

import { byCategory, canEditLibraryItem, findByName, mergeCatalog } from './catalog';

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

/**
 * ══ Solo se corrige lo que diste de alta tú ════════════════════════════════
 *
 * La biblioteca es del EQUIPO (0006) y sus políticas dejan a cualquier miembro
 * escribir cualquier fila: la base no para nada de esto. Y el catálogo (0033) es
 * de todos y de nadie. Así que la regla es de producto y se comprueba aquí.
 */
describe('canEditLibraryItem', () => {
  const YO = 'coach-1';
  const OTRO = 'coach-2';

  const equipo = [
    { name: 'Pan integral', coachId: YO },
    { name: 'Pechuga de pollo', coachId: OTRO },
  ];
  const lista = mergeCatalog(equipo, [{ name: 'Lentejas' }]);

  it.each([
    ['Pan integral', true, 'lo diste de alta tú'],
    ['pan INTEGRAL ', true, 'y da igual cómo se escriba: misma clave que la mezcla'],
    ['Pechuga de pollo', false, 'lo dio de alta un compañero de equipo'],
    ['Lentejas', false, 'el catálogo común no lo edita nadie desde el navegador'],
    ['Boniato', true, 'no está en la biblioteca de nadie: al guardarlo nace tuyo'],
  ])('%#: %s', (name, expected) => {
    expect(canEditLibraryItem(name, lista, YO)).toBe(expected);
  });

  /* Sin sesión no se corrige nada. Es la vista del cliente, que ya no enseña el
     lápiz por `editable`; esto es el cinturón además de los tirantes. */
  it('sin saber quién eres, nada es tuyo', () => {
    expect(canEditLibraryItem('Pan integral', lista, null)).toBe(false);
  });

  /*
    El caso que de verdad importa y que no se ve mirando una lista: el catálogo
    solo queda fuera MIENTRAS no lo hayas usado. En cuanto lo eliges se copia a
    tu biblioteca con tu nombre encima, y esa copia sí se corrige — que es lo que
    prometen la 0033 y la cabecera de este archivo.
  */
  it('un alimento del catálogo, una vez copiado, ya es tuyo', () => {
    expect(canEditLibraryItem('Lentejas', lista, YO)).toBe(false);

    const despues = mergeCatalog([...equipo, { name: 'Lentejas', coachId: YO }], [{ name: 'Lentejas' }]);
    expect(canEditLibraryItem('Lentejas', despues, YO)).toBe(true);
  });
});

describe('findByName', () => {
  const lista = [{ name: 'Pan integral', coachId: 'a' }];

  it('encuentra ignorando mayúsculas y espacios, como la mezcla', () => {
    expect(findByName(lista, '  PAN Integral ')?.coachId).toBe('a');
  });

  it('devuelve null y no revienta con lo que no está', () => {
    expect(findByName(lista, 'Boniato')).toBe(null);
    expect(findByName(undefined, 'Pan integral')).toBe(null);
    expect(findByName(lista, null)).toBe(null);
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
