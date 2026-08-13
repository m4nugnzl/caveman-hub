import { describe, expect, it } from 'vitest';

import {
  buildFoodEntry,
  cloneMeal,
  cloneMeals,
  cloneOption,
  displayAsUnits,
  foodMacros,
  foodUnits,
  gramsFromUnits,
  hasUnits,
  moveItem,
  unitsLabel,
} from './nutrition';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * La regla de la que depende todo lo demás: **los gramos son la verdad y la
 * unidad es una lente**. Si alguna vez se colara la cantidad en unidades dentro
 * del cálculo, las macros de media dieta se multiplicarían por el peso de un
 * huevo y nadie lo notaría hasta que un cliente dejara de progresar.
 *
 * Por eso la primera prueba es la que compara un alimento con unidad contra el
 * mismo alimento sin ella: tienen que dar exactamente lo mismo.
 */

const huevo = {
  name: 'Huevo entero',
  proteinPer100: 13,
  carbsPer100: 1,
  fatsPer100: 11,
  unitLabel: 'huevo',
  unitGrams: 55,
};

const arroz = { name: 'Arroz', proteinPer100: 7, carbsPer100: 78, fatsPer100: 0.6 };

describe('las unidades no tocan el cálculo', () => {
  it('mismos gramos, mismas macros, tenga unidad o no', () => {
    const conUnidad = { ...buildFoodEntry(huevo), grams: 110 };
    const sinUnidad = { ...buildFoodEntry({ ...huevo, unitLabel: null, unitGrams: null }), grams: 110 };

    expect(foodMacros(conUnidad)).toEqual(foodMacros(sinUnidad));
  });

  it('las macros salen de los gramos, no del número de unidades', () => {
    const dosHuevos = { ...buildFoodEntry(huevo), grams: 110 };
    const macros = foodMacros(dosHuevos);

    // 110 g de un alimento con 13 g de proteína por 100 g → 14,3 g
    expect(macros.protein).toBeCloseTo(14.3, 5);
    expect(macros.fats).toBeCloseTo(12.1, 5);
  });
});

describe('buildFoodEntry', () => {
  /*
    El caso que motiva el cambio: añadir un huevo y que la casilla ponga 100 g
    —casi dos— obligaba a corregirlo TODAS las veces. Con unidad, la cantidad por
    defecto es una pieza entera.
  */
  it('arranca en una unidad entera cuando el alimento la tiene', () => {
    expect(buildFoodEntry(huevo).grams).toBe(55);
  });

  it('arranca en 100 g cuando el alimento se pesa', () => {
    expect(buildFoodEntry(arroz).grams).toBe(100);
  });

  it('una cantidad explícita manda sobre las dos', () => {
    expect(buildFoodEntry(huevo, 165).grams).toBe(165);
    expect(buildFoodEntry(arroz, 250).grams).toBe(250);
  });

  it('copia la unidad, no la referencia', () => {
    const entry = buildFoodEntry(huevo);
    expect(entry.unitLabel).toBe('huevo');
    expect(entry.unitGrams).toBe(55);
  });

  it('un alimento sin unidad la guarda como null, no como ausente', () => {
    const entry = buildFoodEntry(arroz);
    expect(entry.unitLabel).toBeNull();
    expect(entry.unitGrams).toBeNull();
  });
});

describe('hasUnits', () => {
  it.each([
    [huevo, true, 'etiqueta y gramos'],
    [{ ...huevo, unitGrams: 0 }, false, 'gramos a cero no convierten nada'],
    [{ ...huevo, unitLabel: '' }, false, 'sin etiqueta no hay nada que nombrar'],
    [arroz, false, 'alimento que se pesa'],
    [null, false, 'sin alimento'],
  ])('%#: %s', (entry, expected) => {
    expect(hasUnits(entry)).toBe(expected);
  });
});

describe('moveItem', () => {
  const lista = ['a', 'b', 'c', 'd'];

  it.each([
    [0, 1, ['b', 'a', 'c', 'd'], 'baja uno'],
    [3, 0, ['d', 'a', 'b', 'c'], 'sube del final al principio'],
    [2, 1, ['a', 'c', 'b', 'd'], 'sube uno'],
  ])('%s → %s: %s', (from, to, expected) => {
    expect(moveItem(lista, from, to)).toEqual(expected);
  });

  it('no muta la lista original', () => {
    moveItem(lista, 0, 3);
    expect(lista).toEqual(['a', 'b', 'c', 'd']);
  });

  /*
    Al arrastrar, el índice de destino puede pasarse por uno al soltar en el
    borde. Reventar ahí perdería la dieta entera por un píxel.
  */
  it.each([
    [0, 0],
    [-1, 2],
    [9, 0],
    [0, 99],
  ])('índices raros (%s → %s) no rompen nada', (from, to) => {
    expect(moveItem(lista, from, to)).toHaveLength(4);
  });
});

describe('cloneOption y cloneMeal', () => {
  const opcion = {
    id: 'opt-1',
    foods: [
      { id: 'f1', name: 'Arroz', grams: 80 },
      { id: 'f2', name: 'Pollo', grams: 150 },
    ],
  };

  /*
    El motivo de que exista `cloneOption`. Sin identificadores nuevos, los
    alimentos copiados COMPARTEN `id` con los originales, y `updateFoodGrams`
    busca por identificador: escribir 150 g en la alternativa B los escribiría
    también en la A, y nadie lo notaría hasta que las cuentas no cuadren.
  */
  it('regenera los identificadores de la opción y de sus alimentos', () => {
    const copia = cloneOption(opcion);
    expect(copia.id).not.toBe(opcion.id);
    expect(copia.foods.map((f) => f.id)).not.toEqual(['f1', 'f2']);
    expect(new Set(copia.foods.map((f) => f.id)).size).toBe(2);
  });

  it('conserva todo lo demás del alimento', () => {
    const [arroz] = cloneOption(opcion).foods;
    expect(arroz.name).toBe('Arroz');
    expect(arroz.grams).toBe(80);
  });

  it('no toca el original', () => {
    cloneOption(opcion);
    expect(opcion.foods.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('una opción vacía se copia vacía, sin explotar', () => {
    expect(cloneOption({ id: 'x' }).foods).toEqual([]);
    expect(cloneOption(null).foods).toEqual([]);
  });

  it('la comida copiada se marca en el nombre', () => {
    const copia = cloneMeal({ id: 'm1', name: 'Desayuno', options: [opcion] });
    expect(copia.name).toBe('Desayuno (copia)');
    expect(copia.id).not.toBe('m1');
  });

  it('la comida copiada trae todas sus alternativas, con ids nuevos', () => {
    const copia = cloneMeal({ name: 'Cena', options: [opcion, opcion] });
    expect(copia.options).toHaveLength(2);
    expect(copia.options[0].id).not.toBe(copia.options[1].id);
  });

  /*
    Copiando a la OTRA variante —de días de entreno a días de descanso— no hay
    ambigüedad de nombres: son dos listas distintas y «Desayuno» tiene que seguir
    llamándose «Desayuno». Marcarlo con «(copia)» ahí obligaría a renombrar seis
    comidas a mano cada vez.
  */
  it('cloneMeals conserva los nombres tal cual', () => {
    const dia = [
      { id: 'm1', name: 'Desayuno', options: [opcion] },
      { id: 'm2', name: 'Comida', options: [opcion] },
    ];
    const copia = cloneMeals(dia);

    expect(copia.map((m) => m.name)).toEqual(['Desayuno', 'Comida']);
    expect(copia.map((m) => m.id)).not.toEqual(['m1', 'm2']);
  });

  it('cloneMeals de un día vacío no explota', () => {
    expect(cloneMeals([])).toEqual([]);
    expect(cloneMeals(undefined)).toEqual([]);
  });
});

describe('displayAsUnits — poder contarlo y querer contarlo son cosas distintas', () => {
  it('un alimento con unidad arranca contándose en unidades', () => {
    expect(buildFoodEntry(huevo).showAs).toBe('units');
    expect(displayAsUnits(buildFoodEntry(huevo))).toBe(true);
  });

  it('el entrenador puede pasarlo a gramos sin perder la unidad', () => {
    const entry = { ...buildFoodEntry(huevo), showAs: 'grams' };
    expect(displayAsUnits(entry)).toBe(false);
    // La unidad sigue ahí: el interruptor va y vuelve.
    expect(hasUnits(entry)).toBe(true);
  });

  it('un alimento que se pesa no se cuenta en unidades aunque se le pida', () => {
    expect(displayAsUnits({ ...buildFoodEntry(arroz), showAs: 'units' })).toBe(false);
  });

  /*
    Las dietas montadas antes de que existiera el interruptor no tienen `showAs`.
    Caen en unidades, que es el comportamiento por el que se añadió todo esto.
  */
  it('una entrada antigua sin showAs se cuenta en unidades', () => {
    expect(displayAsUnits({ ...huevo, grams: 110 })).toBe(true);
  });

  it('cambiar de modo no toca los gramos, así que no toca las macros', () => {
    const enUnidades = { ...buildFoodEntry(huevo), grams: 110 };
    const enGramos = { ...enUnidades, showAs: 'grams' };
    expect(foodMacros(enGramos)).toEqual(foodMacros(enUnidades));
  });
});

describe('foodUnits y gramsFromUnits — ida y vuelta', () => {
  it('convierte gramos a unidades', () => {
    expect(foodUnits({ ...huevo, grams: 110 })).toBe(2);
    expect(foodUnits({ ...huevo, grams: 55 })).toBe(1);
  });

  /*
    Medio huevo y media rebanada existen; 0,37 huevos no. Como el redondeo es solo
    de lo que se ENSEÑA —los gramos guardados no se tocan—, las macros siguen
    saliendo del gramo exacto.
  */
  it('redondea a un decimal lo que se enseña', () => {
    expect(foodUnits({ ...huevo, grams: 82 })).toBe(1.5);
    expect(foodUnits({ ...huevo, grams: 20 })).toBe(0.4);
  });

  it('un alimento que se pesa no tiene unidades', () => {
    expect(foodUnits({ ...arroz, grams: 100 })).toBeNull();
  });

  it('escribir unidades devuelve gramos enteros', () => {
    expect(gramsFromUnits(huevo, 2)).toBe(110);
    expect(gramsFromUnits(huevo, 1.5)).toBe(83);
  });

  /*
    Sin unidad, lo que se escribe SON gramos. Es lo que permite que la pantalla
    llame siempre a la misma función sin preguntar antes de qué tipo es el
    alimento.
  */
  it('sin unidad, lo escrito son gramos', () => {
    expect(gramsFromUnits(arroz, 250)).toBe(250);
  });
});

describe('unitsLabel', () => {
  it.each([
    [55, '1 huevo'],
    [110, '2 huevos'],
    [82, '1,5 huevos'],
  ])('%s g → «%s»', (grams, expected) => {
    expect(unitsLabel({ ...huevo, grams })).toBe(expected);
  });

  it('el decimal se escribe con coma, como en castellano', () => {
    expect(unitsLabel({ ...huevo, grams: 82 })).toContain(',');
  });

  it('un alimento que se pesa no tiene etiqueta de unidades', () => {
    expect(unitsLabel({ ...arroz, grams: 100 })).toBeNull();
  });
});
