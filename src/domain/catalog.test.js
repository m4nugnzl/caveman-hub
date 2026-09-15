import { describe, expect, it } from 'vitest';

import {
  byCategory,
  canEditLibraryItem,
  findByName,
  foodConflicts,
  foodTagLabels,
  groupInOrder,
  mergeCatalog,
  similarNames,
} from './catalog';

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

  /* Tu copia se guarda sin categoría a propósito, y la mezcla tapaba la fila del
     catálogo: el dato se perdía en cuanto usabas el alimento una vez. */
  it('tu copia hereda la categoría del catálogo', () => {
    const mezcla = mergeCatalog(
      [{ id: 'a', name: 'Brócoli', proteinPer100: 2.8 }],
      [{ id: 'x', name: 'Brócoli', category: 'Verdura' }]
    );
    expect(mezcla.find((f) => f.name === 'Brócoli').category).toBe('Verdura');
  });

  it('pero la tuya manda si la tiene puesta', () => {
    const mezcla = mergeCatalog(
      [{ id: 'a', name: 'Brócoli', category: 'Mis marcas' }],
      [{ id: 'x', name: 'Brócoli', category: 'Verdura' }]
    );
    expect(mezcla.find((f) => f.name === 'Brócoli').category).toBe('Mis marcas');
  });

  /* Los ejercicios pasan por el mismo mezclador y no tienen categoría: nadie
     debe salir de aquí con un `category: null` inventado. */
  it('lo que no tiene categoría en ninguna de las dos listas sale intacto', () => {
    const mezcla = mergeCatalog([{ id: 'a', name: 'Press banca' }], [{ id: 'x', name: 'Press banca' }]);
    expect('category' in mezcla[0]).toBe(false);
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

/* ══ Las etiquetas del alimento y el aviso pasivo (C12) ═══════════════════ */

describe('foodConflicts — información, nunca filtro', () => {
  const pan = { name: 'Pan integral', tags: ['gluten'] };
  const gambas = { name: 'Gambas peladas', tags: ['marisco'] };
  const pollo = { name: 'Pechuga de pollo', tags: ['carne'] };
  const yogur = { name: 'Yogur natural', tags: ['lactosa'] };

  const cond = (label, extra = {}) => ({ label, area: 'nutrition', resolvedAt: null, ...extra });

  it('cruza la etiqueta con el condicionante escrito en lenguaje del cliente', () => {
    expect(foodConflicts(pan, [cond('Celiaquía')])).toEqual(['gluten']);
    expect(foodConflicts(yogur, [cond('Intolerancia a la lactosa')])).toEqual(['lactosa']);
    expect(foodConflicts(gambas, [cond('Alergia alimentaria', { detail: 'al marisco' })])).toEqual([
      'marisco',
    ]);
  });

  it('el vegetariano choca con carne y pescado; el vegano, además, con huevo y lactosa', () => {
    expect(foodConflicts(pollo, [cond('Vegetariano o vegano', { detail: 'vegetariano' })])).toEqual(
      ['carne']
    );
    expect(foodConflicts(yogur, [cond('Vegano')])).toEqual(['lactosa']);
    expect(foodConflicts(yogur, [cond('Vegetariano')])).toEqual([]);
  });

  it('una lesión de hombro no opina de un pan', () => {
    expect(foodConflicts(pan, [{ label: 'Celiaquía', area: 'training', resolvedAt: null }])).toEqual(
      []
    );
  });

  it('lo resuelto ya no restringe', () => {
    expect(foodConflicts(pan, [cond('Celiaquía', { resolvedAt: '2026-01-01' })])).toEqual([]);
  });

  it('sin etiquetas o sin condicionantes no hay nada que decir', () => {
    expect(foodConflicts({ name: 'Arroz', tags: [] }, [cond('Celiaquía')])).toEqual([]);
    expect(foodConflicts(pan, [])).toEqual([]);
    expect(foodConflicts(pan)).toEqual([]);
  });
});

describe('foodTagLabels', () => {
  it('traduce solo las etiquetas conocidas', () => {
    expect(foodTagLabels({ tags: ['gluten', 'inventada', 'lactosa'] })).toEqual([
      'Gluten',
      'Lactosa',
    ]);
    expect(foodTagLabels({})).toEqual([]);
  });
});

/*
  ══ LOS QUE SE PARECEN DEMASIADO ════════════════════════════════════════════

  Lo que hay que fijar es el equilibrio: si señala de más, la marca se vuelve
  adorno y nadie la mira; si señala de menos, no sirve para lo que existe. Las
  dos mitades de esa frontera están abajo, y la de «no señala de más» es la
  importante — en una despensa, que un nombre contenga a otro es lo NORMAL.
*/
describe('similarNames', () => {
  it('caza el acento perdido, que es el duplicado de verdad', () => {
    expect(similarNames('Plátano', ['Platano', 'Manzana'])).toEqual(['Platano']);
  });

  it('caza el singular contra el plural y la letra de más', () => {
    expect(similarNames('Alubias', ['Alubia'])).toEqual(['Alubia']);
    expect(similarNames('Lentejas', ['Lentehas'])).toEqual(['Lentehas']);
  });

  it('NO señala dos alimentos de verdad que comparten principio', () => {
    expect(similarNames('Almendras', ['Almendras crudas', 'Almendras tostadas'])).toEqual([]);
    expect(similarNames('Aceite de coco', ['Aceite de oliva virgen extra'])).toEqual([]);
  });

  /* El suelo de longitud: con nombres cortos una distancia de dos empareja casi
     todo, y entonces la señal deja de significar nada. */
  it('no compara nombres cortos, donde todo se parece a todo', () => {
    expect(similarNames('Sal', ['Col', 'Sol'])).toEqual([]);
    expect(similarNames('Quinoa', ['Sal'])).toEqual([]);
  });

  it('no se propone a sí mismo ni repite una pareja', () => {
    expect(similarNames('Plátano', ['Plátano', 'plátano ', 'PLÁTANO'])).toEqual([]);
  });

  it('aguanta la lista vacía y el nombre en blanco', () => {
    expect(similarNames('Plátano')).toEqual([]);
    expect(similarNames('', ['Plátano'])).toEqual([]);
    expect(similarNames(null, ['Plátano'])).toEqual([]);
  });
});

/**
 * ══ Qué protege esto ═══════════════════════════════════════════════════════
 *
 * Que la Librería no pierda filas al agruparse. Es una lista de doscientas
 * treinta y nueve entradas y de trescientas catorce, y un ejercicio que se
 * cayera del reparto —porque su músculo no está en el orden que se pasa, o
 * porque no tiene ninguno— desaparecería de la única pantalla desde la que se
 * corrige, sin error y sin hueco donde se note.
 */
describe('groupInOrder', () => {
  const lista = [
    { name: 'Dominadas', muscle: 'Dorsal' },
    { name: 'Press banca', muscle: 'Pectoral' },
    { name: 'Remo', muscle: 'Dorsal' },
    { name: 'Assault bike', muscle: null },
  ];

  it('parte la lista en los grupos que le pasan, y en ese orden', () => {
    expect(groupInOrder(lista, 'muscle', ['Dorsal', 'Pectoral'])).toEqual([
      { grupo: 'Dorsal', filas: [lista[0], lista[2]] },
      { grupo: 'Pectoral', filas: [lista[1]] },
      { grupo: null, filas: [lista[3]] },
    ]);
  });

  /* El orden lo calcula el selector de filtros contando lo que hay. Si algún día
     lo pasa incompleto, el grupo que falte no puede evaporarse. */
  it('no pierde un grupo que no venga en el orden: lo pone detrás', () => {
    expect(groupInOrder(lista, 'muscle', ['Pectoral']).map((g) => g.grupo)).toEqual([
      'Pectoral',
      'Dorsal',
      null,
    ]);
  });

  /* Un grupo vacío pintaría una cabecera con cero filas debajo. */
  it('se salta los grupos sin filas', () => {
    expect(groupInOrder(lista, 'muscle', ['Dorsal', 'Gemelo']).map((g) => g.grupo)).toEqual([
      'Dorsal',
      'Pectoral',
      null,
    ]);
  });

  /* «Sin clasificar» arriba sería lo primero que se lee al abrir, y es lo único
     de la lista que no dice nada de nada. */
  it('deja lo que no está clasificado al final y con el grupo en null', () => {
    expect(groupInOrder([{ name: 'Comba' }], 'muscle', ['Dorsal'])).toEqual([
      { grupo: null, filas: [{ name: 'Comba' }] },
    ]);
  });

  it('aguanta la lista vacía', () => {
    expect(groupInOrder([], 'muscle', ['Dorsal'])).toEqual([]);
    expect(groupInOrder()).toEqual([]);
  });
});
