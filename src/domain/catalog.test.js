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
 * Tres cosas quedan fuera y por tres motivos distintos: el catálogo es de
 * referencia, la copia que tienes de un alimento del catálogo SIGUE siendo ese
 * alimento, y lo que dio de alta un compañero es suyo.
 *
 * El del medio es el que costó: la biblioteca de arranque (0022) se siembra con
 * el `coach_id` del dueño del equipo, y copiar del catálogo también pone el
 * tuyo. Preguntar solo por `coach_id` decía que todo era tuyo — que es justo lo
 * que se veía en pantalla, un lápiz en cada fila.
 */
describe('canEditLibraryItem', () => {
  const YO = 'coach-1';
  const OTRO = 'coach-2';

  /* «Pechuga de pollo» está aquí con MI coach_id a propósito: es exactamente
     cómo queda un alimento sembrado por la 0022 o copiado del catálogo. */
  const equipo = [
    { name: 'Pan integral Bimbo', coachId: YO },
    { name: 'Pechuga de pollo', coachId: YO },
    { name: 'Batido de la marca X', coachId: OTRO },
  ];
  const generales = [{ name: 'Pechuga de pollo' }, { name: 'Lentejas' }];
  const opciones = { library: mergeCatalog(equipo, generales), catalog: generales, coachId: YO };

  it.each([
    ['Pan integral Bimbo', true, 'lo diste de alta tú y no es de nadie más'],
    ['pan INTEGRAL bimbo ', true, 'misma clave que la mezcla: da igual cómo se escriba'],
    ['Pechuga de pollo', false, 'tu copia de un general SIGUE siendo el general'],
    ['Lentejas', false, 'el catálogo no lo edita nadie desde el navegador'],
    ['Batido de la marca X', false, 'lo dio de alta un compañero de equipo'],
    ['Boniato', true, 'no está en la biblioteca de nadie: al guardarlo nace tuyo'],
  ])('%#: %s', (name, expected) => {
    expect(canEditLibraryItem(name, opciones)).toBe(expected);
  });

  /* Sin sesión no se corrige nada. La vista del cliente ya no enseña el lápiz
     por `editable`; esto es el cinturón además de los tirantes. */
  it('sin saber quién eres, nada es tuyo', () => {
    expect(canEditLibraryItem('Pan integral Bimbo', { ...opciones, coachId: null })).toBe(false);
  });

  /*
    Sin la 0033 aplicada no hay catálogo, y entonces no hay forma de distinguir
    un general de lo tuyo. Se cae a `coach_id` en vez de bloquearlo todo: es un
    entorno a medio migrar, no un motivo para dejar a nadie sin arreglar un macro.
  */
  it('sin catálogo cargado se cae a la regla de `coach_id`', () => {
    const sinCatalogo = { library: equipo, catalog: [], coachId: YO };
    expect(canEditLibraryItem('Pechuga de pollo', sinCatalogo)).toBe(true);
    expect(canEditLibraryItem('Batido de la marca X', sinCatalogo)).toBe(false);
  });

  /* Y sin argumentos raros: llamarla mal no abre la puerta. */
  it('sin nada, no', () => {
    expect(canEditLibraryItem('Lo que sea')).toBe(false);
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
