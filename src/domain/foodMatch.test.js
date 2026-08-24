import { describe, expect, it } from 'vitest';

import { claveDeAlimento, matchFood, matchFoodNames, pendingMatches, tokens } from './foodMatch';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * La regla que separa una importación de la que te puedes fiar de una que te
 * cuela datos: **lo que encaja con una sola cosa se da por bueno; lo que encaja
 * con varias, o solo se parece, se pregunta.**
 *
 * El caso que lo resume es «Garbanzos»: entre los crudos y los cocidos hay
 * ciento cincuenta kilocalorías por cada cien gramos, la hoja no dice cuáles
 * son, y elegir el primero por sorteo daría una dieta que cuadra en la pantalla
 * y no cuadra en el plato. Lo mismo con «Huevo», con «Pasta» y con «Arroz
 * blanco», que son la mitad de las dietas que existen.
 */

const BIBLIOTECA = [
  { id: '1', name: 'Avena', proteinPer100: 13 },
  { id: '2', name: 'Harina de avena', proteinPer100: 13 },
  { id: '3', name: 'Garbanzos (crudos)', proteinPer100: 19 },
  { id: '4', name: 'Garbanzos (cocidos)', proteinPer100: 8 },
  { id: '5', name: 'Crema de cacahuete', proteinPer100: 25 },
  { id: '6', name: 'Plátano', proteinPer100: 1 },
  { id: '7', name: 'Manzana', proteinPer100: 0 },
  { id: '8', name: 'Naranja', proteinPer100: 1 },
  { id: '9', name: 'Dátil', proteinPer100: 2 },
  { id: '10', name: 'Tomate', proteinPer100: 1 },
  { id: '11', name: 'Aceite de oliva virgen extra', proteinPer100: 0 },
  { id: '12', name: 'Proteína de suero (polvo)', proteinPer100: 80 },
  { id: '13', name: 'Pechuga de pollo', proteinPer100: 23 },
];

const buscar = (nombre) => matchFood(nombre, BIBLIOTECA);

describe('tokens', () => {
  it('quita tildes, mayúsculas y palabras de relleno', () => {
    expect(tokens('Crema de Cacahuete')).toEqual(tokens('crema cacahuete'));
  });

  it('el plural y el singular caen en la misma raíz', () => {
    /* «Manzanas» en la hoja y «Manzana» en el catálogo son la misma fruta; y
       «Dátiles» y «Dátil» también, que es donde se rompía quitar solo la «s». */
    expect(claveDeAlimento('Manzanas')).toBe(claveDeAlimento('Manzana'));
    expect(claveDeAlimento('Dátiles')).toBe(claveDeAlimento('Dátil'));
    expect(claveDeAlimento('Tomates')).toBe(claveDeAlimento('Tomate'));
  });

  it('los paréntesis cuentan como una palabra más', () => {
    /* «(crudo)» y «(cocido)» son la diferencia entre 350 y 120 kcal: tirarlos
       convertiría dos alimentos distintos en el mismo. */
    expect(tokens('Garbanzos (crudos)')).toContain('crudo');
  });
});

describe('matchFood', () => {
  it('el nombre idéntico se da por bueno', () => {
    const r = buscar('Avena');
    expect(r.food.name).toBe('Avena');
    expect(r.sure).toBe(true);
  });

  it('lo escrito sin tildes ni en singular también', () => {
    expect(buscar('platano').food.name).toBe('Plátano');
    expect(buscar('Manzanas').food.name).toBe('Manzana');
  });

  it('un nombre contenido en uno solo se da por bueno', () => {
    /* «Crema Cacahuete» solo puede ser «Crema de cacahuete». */
    const r = buscar('Crema Cacahuete');
    expect(r.food.name).toBe('Crema de cacahuete');
    expect(r.sure).toBe(true);
  });

  it('cuando encaja con varios, se propone el más parecido y se PREGUNTA', () => {
    const r = buscar('Garbanzos');
    expect(r.sure).toBe(false);
    expect(r.food.name).toBe('Garbanzos (crudos)');
    expect(r.candidates.map((c) => c.name)).toEqual(['Garbanzos (crudos)', 'Garbanzos (cocidos)']);
  });

  it('un nombre MÁS concreto que el de la biblioteca se propone, nunca se da por bueno', () => {
    /* «Plátano mediano» solo puede ser el plátano y «Tomate frito» no es el
       tomate —lleva aceite y azúcar—, y por forma son idénticos. Se propone el
       de la biblioteca y se enseña: aceptarlo es no hacer nada. */
    const platano = buscar('Plátano mediano');
    expect(platano.food.name).toBe('Plátano');
    expect(platano.sure).toBe(false);

    const tomate = buscar('Tomate frito');
    expect(tomate.food.name).toBe('Tomate');
    expect(tomate.sure).toBe(false);
  });

  it('las abreviaturas que ningún catálogo lleva se traducen', () => {
    /* «AOVE» no se parece en ninguna letra a «aceite de oliva»: por parecido no
       se encuentra nunca. */
    expect(buscar('AOVE').food.name).toBe('Aceite de oliva virgen extra');
    expect(buscar('Whey').food.name).toBe('Proteína de suero (polvo)');
  });

  it('«Copos de avena» es la avena y no la harina de avena', () => {
    /* Las dos comparten una palabra; la que menos palabras añade gana. */
    expect(buscar('Copos de avena').food.name).toBe('Avena');
  });

  it('lo que no está, no está', () => {
    const r = buscar('Papilla de bebé');
    expect(r.food).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it('sin biblioteca no revienta', () => {
    expect(matchFood('Avena', []).food).toBeNull();
    expect(matchFood('', BIBLIOTECA).food).toBeNull();
  });
});

describe('matchFoodNames', () => {
  it('cada nombre se resuelve UNA vez, aunque salga cinco veces', () => {
    const m = matchFoodNames(['Avena', 'avena', 'AVENA '], BIBLIOTECA);
    expect(m.size).toBe(1);
  });

  it('acepta el alimento entero y conserva su unidad para poder preguntarla', () => {
    const m = matchFoodNames([{ name: 'Papilla de bebé', units: 2, unitLabel: 'cacito' }], BIBLIOTECA);
    expect([...m.values()][0]).toMatchObject({ units: 2, unitLabel: 'cacito', food: null });
  });

  it('lo pendiente es lo que hay que mirar, y nada más', () => {
    const m = matchFoodNames(['Avena', 'Garbanzos', 'Papilla de bebé'], BIBLIOTECA);
    expect(pendingMatches(m).map((p) => p.name)).toEqual(['Garbanzos', 'Papilla de bebé']);
  });
});
