import { describe, expect, it } from 'vitest';

import {
  buildFoodEntry,
  buildMeal,
  claseDe,
  cloneMeal,
  cloneMeals,
  carbsFromRest,
  cloneOption,
  optionGaps,
  optionName,
  replaceDietDays,
  cuadra,
  cycleFoto,
  dietNotes,
  displayAsUnits,
  foodMacros,
  foodUnits,
  foodClientsByName,
  gramsFromUnits,
  hasUnits,
  emptyNutrition,
  estadoDe,
  isEmptyDiet,
  macroError,
  setDayTargets,
  margenDe,
  MAX_NOTES,
  mealTarget,
  mealTargetsTotal,
  moveItem,
  notesToStorage,
  optionMacros,
  addDietDay,
  duplicateDietDay,
  hasCycleMap,
  cycleAverage,
  cycleMap,
  setCycleSlot,
  planDays,
  removeDietDay,
  renameDietDay,
  repartoDelDia,
  setDayMeals,
  targetsFor,
  cycleFromSplit,
  cycleMatchesSplit,
  rescaleMeals,
  singleDietFrom,
  unitsLabel,
  vozDelReparto,
} from './nutrition';
import { cycleSlots } from './training';

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

/**
 * ══ Corregir un alimento mal dado de alta ══════════════════════════════════
 *
 * El caso real: se teclea «135» donde iban «13,5» y el alimento entra así en la
 * biblioteca del equipo. Antes no había vuelta atrás —solo se podía tocar al
 * crearlo— y ahora la hay (`FoodDialog`), pero lo primero es que la cifra
 * imposible no llegue a entrar.
 *
 * El tope no es una preferencia: 100 g de un alimento no pueden llevar más de
 * 100 g de nada. El aceite, que es el extremo, lleva 100 de grasa.
 */
describe('macroError — un macro por 100 g imposible es siempre un error de tecleo', () => {
  it.each([
    ['', null, 'en blanco vale: significa cero'],
    ['   ', null, 'solo espacios es lo mismo que en blanco'],
    [null, null, 'sin dato'],
    ['0', null, 'cero es un macro legítimo'],
    ['13,5', null, 'coma decimal, que es lo que produce el teclado español'],
    ['100', null, 'el extremo: el aceite lleva 100 g de grasa por 100 g'],
    ['100.1', 'Máximo 100 por 100 g.', 'pasarse del tope, aunque sea por poco'],
    ['135', 'Máximo 100 por 100 g.', 'el error que motivó todo esto'],
    ['-1', 'No puede ser negativo.', 'negativo'],
    ['pollo', 'Solo números.', 'texto'],
  ])('%#: %s', (value, expected) => {
    expect(macroError(value)).toBe(expected);
  });

  /* La comprobación vive en el dominio y no en cada pantalla para que el alta
     (`AddFoodControl`) y la corrección (`FoodDialog`) no puedan discrepar: sería
     absurdo que se pudiera crear un alimento que luego no se deja guardar. */
  it('el cero se distingue del vacío, y los dos valen', () => {
    expect(macroError('0')).toBe(null);
    expect(macroError('')).toBe(null);
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

describe('pautas del entrenador', () => {
  /* El formato viejo son cadenas sueltas y hay clientes con ellas guardadas. Si
     esto dejara de leerlas, sus recomendaciones desaparecerían de su plan. */
  it('lee las notas viejas, que eran cadenas', () => {
    const notes = dietNotes(['Bebe 2 L al día', 'Cena 2 h antes de dormir']);
    expect(notes).toHaveLength(2);
    expect(notes[0].body).toBe('Bebe 2 L al día');
    expect(notes[0].title).toBe('');
    expect(notes[0].id).toBeTruthy();
  });

  it('lee las nuevas con título y cuerpo', () => {
    const notes = dietNotes([{ id: 'n1', title: 'Hipotiroidismo', body: 'Subimos hidratos\nlos días de pierna.' }]);
    expect(notes[0]).toEqual({
      id: 'n1',
      title: 'Hipotiroidismo',
      body: 'Subimos hidratos\nlos días de pierna.',
    });
  });

  /* Un título sin cuerpo ocuparía sitio en la pantalla del cliente sin contarle
     nada, así que no llega a existir. */
  it('descarta las que no tienen cuerpo', () => {
    expect(dietNotes([{ title: 'Solo título', body: '   ' }, '', '   '])).toEqual([]);
  });

  it('respeta el tope y no se rompe con basura', () => {
    expect(dietNotes(Array.from({ length: 40 }, (_, i) => `n${i}`))).toHaveLength(MAX_NOTES);
    expect(dietNotes(null)).toEqual([]);
    expect(dietNotes([null, 42, undefined])).toEqual([]);
  });

  it('ida y vuelta conserva lo escrito', () => {
    const original = [{ id: 'n1', title: 'Patología', body: 'Línea 1\nLínea 2' }];
    expect(dietNotes(notesToStorage(dietNotes(original)))).toEqual(original);
  });

  it('al guardar se caen las vacías y se recortan los espacios', () => {
    const guardado = notesToStorage([
      { id: 'a', title: '  Título  ', body: '  Cuerpo  ' },
      { id: 'b', title: 'x', body: '' },
    ]);
    expect(guardado).toEqual([{ id: 'a', title: 'Título', body: 'Cuerpo' }]);
  });
});

describe('estabilidad de los ids de las pautas', () => {
  /*
    `dietNotes` se llama en cada render. Con ids aleatorios, React remontaría la
    lista entera en cada tecla: se perdería el foco y el editor no reconocería su
    propio borrador. Este test es lo que impide que alguien «arregle» esto
    volviendo a `newId()`.
  */
  it('leer dos veces lo mismo da los mismos ids', () => {
    const raw = ['Bebe 2 L al día', { title: 'X', body: 'Y' }];
    expect(dietNotes(raw).map((n) => n.id)).toEqual(dietNotes(raw).map((n) => n.id));
  });

  it('un id propio siempre gana al derivado de la posición', () => {
    expect(dietNotes([{ id: 'mio', body: 'texto' }])[0].id).toBe('mio');
  });
});

describe('la estructura del día', () => {
  const comida = (target, foods = []) => ({ id: 'm1', name: 'Comida', target, options: [{ id: 'o1', foods }] });

  /* Distinguir «sin objetivo» de «objetivo cero» importa: sin esto, borrar los
     cuatro campos dejaría la comida marcada con un objetivo imposible. */
  it('una comida sin objetivo real da null', () => {
    expect(mealTarget(comida(null))).toBeNull();
    expect(mealTarget(comida({}))).toBeNull();
    expect(mealTarget(comida({ kcals: '', protein: '0' }))).toBeNull();
  });

  /*
    La casilla de hidratos casi nunca se rellena: la estructura del día ya enseña
    los gramos que cuadran la comida y el entrenador los da por buenos. Si el
    objetivo se leyera tal cual, el anillo del cliente diría «C 0 g» con un
    reparto que no cuadra con sus propias kilocalorías — que es exactamente lo que
    hacía.
  */
  it('los hidratos en blanco son lo que sobra de las calorías', () => {
    // 600 − 40 P (160) − 15 G (135) = 305 → 76 g
    expect(mealTarget(comida({ kcals: '600', protein: '40', fats: '15' }))).toEqual({
      kcals: 600,
      protein: 40,
      carbs: 76,
      fats: 15,
    });
    expect(mealTarget(comida({ kcals: '500' })).carbs).toBe(125);
  });

  /* Un cero escrito es una decisión —una comida cetogénica— y no una casilla sin
     tocar. Completarlo sería cambiarle el plan al entrenador. */
  it('un cero escrito se respeta', () => {
    expect(mealTarget(comida({ kcals: '500', protein: '50', carbs: '0' })).carbs).toBe(0);
  });

  it('suma lo repartido y dice lo que queda del día', () => {
    const meals = [comida({ kcals: '500' }), comida({ kcals: '700' }), comida(null)];
    expect(mealTargetsTotal(meals, 2000)).toMatchObject({ kcals: 1200, meals: 2, left: 800 });
  });

  /* Pasarse tiene que salir en negativo: esconderlo con un `Math.max` sería
     enseñar una cifra falsa justo donde se toma la decisión. */
  it('pasarse del objetivo del día sale en negativo', () => {
    expect(mealTargetsTotal([comida({ kcals: '2500' })], 2000).left).toBe(-500);
  });

  it('sin objetivo del día no se inventa un restante', () => {
    expect(mealTargetsTotal([comida({ kcals: '500' })], null).left).toBeNull();
  });


  /* La pauta y el objetivo viajan con la comida al copiarla al otro día: sin
     esto, «Cena» llegaría al día de descanso sin su indicación. */
  it('cloneMeal se lleva la nota y el objetivo', () => {
    const copia = cloneMeal({ name: 'Cena', note: '2 h antes de dormir', target: { kcals: '500' }, options: [] });
    expect(copia.note).toBe('2 h antes de dormir');
    expect(copia.target).toEqual({ kcals: '500' });
  });
});

describe('los hidratos son siempre el resto', () => {
  it('rellena con lo que sobra de calorías', () => {
    // 600 kcal − 40 P (160) − 15 G (135) = 305 → 76 g de hidratos
    expect(carbsFromRest({ kcals: '600', protein: '40', fats: '15' })).toBe(76);
  });

  it('sin calorías no hay nada que repartir', () => {
    expect(carbsFromRest({ kcals: '', protein: '40', fats: '15' })).toBeNull();
    expect(carbsFromRest({})).toBeNull();
  });

  /* Cero y no negativo: un reparto que no cabe se ve como «no te queda nada»,
     que es cierto y accionable. Un −20 solo confunde. */
  it('si la proteína y la grasa ya se pasan, no quedan hidratos', () => {
    expect(carbsFromRest({ kcals: '300', protein: '50', fats: '20' })).toBe(0);
  });

  it('sin proteína ni grasa, todas las calorías son hidratos', () => {
    expect(carbsFromRest({ kcals: '400' })).toBe(100);
  });
});

describe('cada opción contra el objetivo de su comida', () => {
  const alimento = (grams, p, c, f) => ({
    id: `f${grams}`,
    name: 'x',
    grams,
    proteinPer100: p,
    carbsPer100: c,
    fatsPer100: f,
  });

  /*
    Las alternativas existen para ser INTERCAMBIABLES, y eso solo se cumple si se
    parecen. Mirando solo la primera, el día cuadra al montarlo y descuadra en
    cuanto el cliente elige otra opción.
  */
  it('mide todas las opciones, no solo la primera', () => {
    const meal = {
      id: 'm1',
      target: { kcals: '400' },
      options: [
        { id: 'o1', foods: [alimento(100, 0, 100, 0)] }, // 400 kcal
        { id: 'o2', foods: [alimento(175, 0, 100, 0)] }, // 700 kcal
      ],
    };
    const gaps = optionGaps(meal);

    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ tone: 'ok' });
    expect(gaps[1]).toMatchObject({ tone: 'over' });
    expect(gaps[1].diff.kcals).toBe(300);
  });

  /* Dos opciones pueden coincidir en calorías y llevar 40 g de proteína de
     diferencia: ese es el error que no se ve mirando un solo número. */
  it('da la diferencia de los cuatro valores, no solo de las kcal', () => {
    const meal = {
      id: 'm1',
      target: { kcals: '400', protein: '40', carbs: '0', fats: '0' },
      options: [{ id: 'o1', foods: [alimento(100, 0, 100, 0)] }],
    };
    const [gap] = optionGaps(meal);

    expect(gap.diff.kcals).toBe(0);
    expect(gap.diff.protein).toBe(-40);
    expect(gap.diff.carbs).toBe(100);
  });

  it('sin objetivo no hay nada que comparar', () => {
    expect(optionGaps({ id: 'm1', target: null, options: [{ id: 'o1', foods: [] }] })).toEqual([]);
  });
});

/*
  ══ El plan en blanco ═══════════════════════════════════════════════════════

  Existe para la copia entre clientes, que SUSTITUYE: traerse el plan de alguien
  que no tiene dieta configurada le borra la suya al destino, y el único aviso
  sería su pantalla de nutrición vacía. Por eso «no hay fila» y «hay fila sin
  nada» tienen que dar la misma respuesta.
*/
describe('isEmptyDiet', () => {
  it('sin plan, y con el plan recién nacido, es lo mismo', () => {
    expect(isEmptyDiet(undefined)).toBe(true);
    expect(isEmptyDiet(null)).toBe(true);
    expect(isEmptyDiet(emptyNutrition())).toBe(true);
  });

  it('un objetivo puesto ya es una dieta, aunque no haya menú', () => {
    expect(isEmptyDiet({ ...emptyNutrition(), targetKcals: 2400 })).toBe(false);
    expect(isEmptyDiet({ ...emptyNutrition(), proteinGrams: 180 })).toBe(false);
  });

  it('el objetivo de los días de descanso cuenta igual', () => {
    expect(isEmptyDiet({ ...emptyNutrition(), restTargets: { targetKcals: 2000 } })).toBe(false);
    // Un `restTargets` con los cuatro a nulo es lo que deja `setHasDayVariants`
    // partiendo de una dieta vacía: sigue sin haber nada configurado.
    expect(
      isEmptyDiet({
        ...emptyNutrition(),
        hasDayVariants: true,
        restTargets: { targetKcals: null, proteinGrams: null, carbsGrams: null, fatsGrams: null },
      })
    ).toBe(true);
  });

  it('el menú cuenta en cualquiera de las tres variantes', () => {
    const comida = { id: 'm1', name: 'Cena', options: [] };
    expect(isEmptyDiet({ ...emptyNutrition(), closedMeals: [comida] })).toBe(false);
    expect(isEmptyDiet({ ...emptyNutrition(), closedMealsTraining: [comida] })).toBe(false);
    expect(isEmptyDiet({ ...emptyNutrition(), closedMealsRest: [comida] })).toBe(false);
  });

  it('los pasos, el cardio y las pautas también son trabajo hecho', () => {
    expect(isEmptyDiet({ ...emptyNutrition(), stepsGoal: '10.000 al día' })).toBe(false);
    expect(isEmptyDiet({ ...emptyNutrition(), cardioGoal: '2 sesiones' })).toBe(false);
    expect(isEmptyDiet({ ...emptyNutrition(), habitsNotes: ['Bebe 2 L de agua'] })).toBe(false);
    // Una cadena en blanco no es un objetivo: es el campo tocado y vaciado.
    expect(isEmptyDiet({ ...emptyNutrition(), stepsGoal: '   ' })).toBe(true);
  });
});

describe('reescalar el menú (rescaleMeals)', () => {
  const alimento = (name, grams, per100, extra = {}) => ({
    id: name,
    name,
    grams,
    proteinPer100: per100.p,
    carbsPer100: per100.c,
    fatsPer100: per100.g,
    unitLabel: null,
    unitGrams: null,
    showAs: 'grams',
    ...extra,
  });

  /* Un día simple: pollo (proteína), arroz (hidrato), aceite… y un plátano por
     unidades. Solo arroz y aceite pueden moverse. */
  const comidas = () => [
    {
      id: 'm1',
      name: 'Comida 1',
      options: [
        {
          id: 'o1',
          foods: [
            alimento('Pollo', 150, { p: 23, c: 0, g: 2 }),
            alimento('Arroz', 100, { p: 3, c: 78, g: 1 }),
            alimento('Aceite', 20, { p: 0, c: 0, g: 100 }),
            alimento('Plátano', 120, { p: 1, c: 23, g: 0 }, { showAs: 'units', unitGrams: 120, unitLabel: 'ud' }),
          ],
        },
      ],
    },
  ];

  it('escala hidratos y grasas; proteína y unidades quedan quietas', () => {
    const res = rescaleMeals(comidas(), { fromKcals: 2500, toKcals: 2250 });
    expect(res).not.toBeNull();
    const foods = res.meals[0].options[0].foods;
    expect(foods.find((f) => f.name === 'Pollo').grams).toBe(150);
    expect(foods.find((f) => f.name === 'Plátano').grams).toBe(120);
    expect(foods.find((f) => f.name === 'Arroz').grams).toBeLessThan(100);
    /* Redondeo de cocina: a 5 g por encima de 25. */
    expect(foods.find((f) => f.name === 'Arroz').grams % 5).toBe(0);
    /* Y el resultado se acerca a la proporción pedida (±3 % por el redondeo). */
    const antes = comidas()[0].options[0];
    const despues = res.meals[0].options[0];
    const objetivo = (2250 / 2500) * optionMacros(antes).kcal;
    expect(Math.abs(optionMacros(despues).kcal - objetivo)).toBeLessThan(objetivo * 0.03);
  });

  it('cada cambio queda apuntado para la vista previa', () => {
    const res = rescaleMeals(comidas(), { fromKcals: 2500, toKcals: 2250 });
    const arroz = res.cambios.find((c) => c.food === 'Arroz');
    expect(arroz).toMatchObject({ meal: 'Comida 1', from: 100 });
    expect(res.cambios.every((c) => c.food !== 'Pollo' && c.food !== 'Plátano')).toBe(true);
  });

  it('una opción sin nada que recortar se queda como está y se dice', () => {
    const soloProteina = [
      {
        id: 'm1',
        name: 'Cena',
        options: [{ id: 'o1', foods: [alimento('Merluza', 200, { p: 17, c: 0, g: 2 })] }],
      },
    ];
    expect(rescaleMeals(soloProteina, { fromKcals: 2000, toKcals: 1800 })).toBeNull();

    /* Y mezclada con una comida escalable, sale en `sinTocar`. */
    const res = rescaleMeals([...soloProteina, ...comidas()], { fromKcals: 2500, toKcals: 2250 });
    expect(res.sinTocar).toContainEqual({ meal: 'Cena', option: 1 });
  });

  it('sin objetivo previo, sin cambio o con factor desorbitado, no reescala', () => {
    expect(rescaleMeals(comidas(), { fromKcals: null, toKcals: 2000 })).toBeNull();
    expect(rescaleMeals(comidas(), { fromKcals: 2500, toKcals: 2500 })).toBeNull();
    /* Pedir un cuarto de las calorías no es un ajuste: la opción no se toca. */
    const res = rescaleMeals(comidas(), { fromKcals: 2500, toKcals: 300 });
    expect(res).toBeNull();
  });
});

/*
  ══ VOLVER A UNA SOLA DIETA ═════════════════════════════════════════════════

  Lo que protege: que apagar «dos dietas» no deje al cliente con la pantalla en
  blanco y dos menús guardados a los que ya no se llega. La variante elegida
  PASA A SER la dieta, con su menú y —si es la de descanso— con su objetivo.
*/
describe('singleDietFrom', () => {
  const comida = (name) => ({ id: `m-${name}`, name, note: '', target: null, options: [{ id: `o-${name}`, foods: [] }] });

  const conDosDietas = () => ({
    ...emptyNutrition(),
    type: 'closed',
    hasDayVariants: true,
    targetKcals: 3000,
    proteinGrams: 200,
    carbsGrams: 350,
    fatsGrams: 80,
    restTargets: { targetKcals: 2400, proteinGrams: 200, carbsGrams: 200, fatsGrams: 80 },
    closedMeals: [],
    closedMealsTraining: [comida('Desayuno E'), comida('Cena E')],
    closedMealsRest: [comida('Desayuno D')],
  });

  it('quedándose con la de entreno, su menú es la dieta y el objetivo no se mueve', () => {
    const out = singleDietFrom(conDosDietas(), 'training');

    expect(out.hasDayVariants).toBe(false);
    expect(out.closedMeals.map((m) => m.name)).toEqual(['Desayuno E', 'Cena E']);
    expect(out.targetKcals).toBe(3000);
    expect(out.carbsGrams).toBe(350);
  });

  it('quedándose con la de descanso, sube también SU objetivo', () => {
    const out = singleDietFrom(conDosDietas(), 'rest');

    expect(out.closedMeals.map((m) => m.name)).toEqual(['Desayuno D']);
    expect(out.targetKcals).toBe(2400);
    expect(out.carbsGrams).toBe(200);
    // El objetivo de descanso ya no tiene dónde vivir: es el del plan.
    expect(out.restTargets).toBeNull();
  });

  it('las listas de variante se vacían: una sola dieta, una sola fuente', () => {
    const out = singleDietFrom(conDosDietas(), 'training');

    expect(out.closedMealsTraining).toEqual([]);
    expect(out.closedMealsRest).toEqual([]);
  });

  it('el menú se copia, no se comparte: tocarlo después no toca al de la variante', () => {
    const antes = conDosDietas();
    const out = singleDietFrom(antes, 'training');

    expect(out.closedMeals[0]).not.toBe(antes.closedMealsTraining[0]);
    expect(out.closedMeals[0].id).not.toBe(antes.closedMealsTraining[0].id);
  });

  it('sin objetivo propio, el de descanso hereda el de entreno (targetsFor manda)', () => {
    const plan = { ...conDosDietas(), restTargets: null };
    const out = singleDietFrom(plan, 'rest');

    expect(out.targetKcals).toBe(3000);
  });
});

/*
  ══ A QUIÉNES LES DAS CADA ALIMENTO ═════════════════════════════════════════

  Es lo que hace podable una biblioteca cuyo camino de crecimiento ES la
  duplicación. Lo que hay que fijar con pruebas es que cuenta DIETAS y no
  apariciones —«se usa 38 veces» no responde a ninguna pregunta— y que mira las
  tres variantes, porque un alimento que solo sale los días de descanso se usa
  igual.

  Y que devuelve QUIÉNES: la cifra sale de `.length`, así que si la lista se
  ensuciara con repetidos la cuenta mentiría en el mismo sitio donde antes
  acertaba. Por eso la primera prueba mira las dos cosas a la vez.
*/
describe('foodClientsByName', () => {
  const conAlimentos = (clave, nombres) => ({
    [clave]: [{ id: 'm1', name: 'Comida', options: [{ id: 'o1', foods: nombres.map((name, i) => ({ id: `f${i}`, name })) }] }],
  });

  it('una dieta por cliente, no una por aparición', () => {
    const plan = {
      closedMeals: [
        { id: 'm1', name: 'Desayuno', options: [{ id: 'o1', foods: [{ id: 'f1', name: 'Avena' }] }] },
        { id: 'm2', name: 'Merienda', options: [{ id: 'o2', foods: [{ id: 'f2', name: 'Avena' }] }] },
      ],
    };

    expect(foodClientsByName({ javier: plan }).get('avena')).toEqual(['javier']);
  });

  it('acumula un cliente por cada uno que lo lleva', () => {
    const quienes = foodClientsByName({
      javier: conAlimentos('closedMeals', ['Avena']),
      marta: conAlimentos('closedMeals', ['Avena', 'Plátano']),
    });

    expect(quienes.get('avena')).toEqual(['javier', 'marta']);
    expect(quienes.get('platano')).toEqual(['marta']);
  });

  /* Las tres variantes cuentan: la única, la de entreno y la de descanso. */
  it('mira también las dietas de entreno y de descanso', () => {
    const plan = {
      ...conAlimentos('closedMealsTraining', ['Arroz']),
      ...conAlimentos('closedMealsRest', ['Lentejas']),
    };

    const quienes = foodClientsByName({ javier: plan });
    expect(quienes.get('arroz')).toEqual(['javier']);
    expect(quienes.get('lentejas')).toEqual(['javier']);
  });

  /* Se compara con `norm`, la misma clave que usa el resto del producto para
     atar un nombre escrito por una persona con su fila: sin esto, «Plátano» en
     la dieta y «platano» en la biblioteca serían dos alimentos. */
  it('ata los nombres sin tildes ni mayúsculas', () => {
    const plan = conAlimentos('closedMeals', ['PLÁTANO']);
    expect(foodClientsByName({ javier: plan }).get('platano')).toEqual(['javier']);
  });

  it('lo que no está en ninguna dieta no aparece', () => {
    const quienes = foodClientsByName({ javier: conAlimentos('closedMeals', ['Avena']) });
    expect(quienes.get('quinoa')).toBeUndefined();
  });

  it('aguanta un plan vacío, sin comidas y sin listas', () => {
    expect(foodClientsByName({ a: null, b: {}, c: { closedMeals: [] } }).size).toBe(0);
    expect(foodClientsByName().size).toBe(0);
  });
});

/**
 * ══ EL SEMÁFORO ════════════════════════════════════════════════════════════
 *
 * Lo que protege esta tanda: **el margen tiene suelo, y hay UNO**. La versión
 * anterior juzgaba con el 5 % relativo y nada más, así que una comida con 4 g
 * de grasa pautados se medía con ±0,2 g y no podía estar en verde nunca —17 de
 * 20 celdas marcadas en un plan que el entrenador acababa de cuadrar—. Y estaba
 * escrito cuatro veces, así que arreglarlo en una dejaba media pantalla
 * riñendo.
 *
 * Si alguien vuelve a escribir un `objetivo * 0.05` en una pantalla, estas
 * pruebas no lo ven; lo que sí garantizan es que la función a la que todas
 * llaman se comporta como se decidió.
 */
describe('el semáforo, con suelo y en un solo sitio', () => {
  it('en gramos el suelo son 3 g, aunque el 5 % sea menos', () => {
    // 5 % de 4 g = 0,2 g. Con el suelo, ±3 g.
    expect(estadoDe(6, 4, 'fats')).toBe('ok');
    expect(estadoDe(8, 4, 'fats')).toBe('over');
    expect(estadoDe(1, 4, 'fats')).toBe('ok');
  });

  it('en kilocalorías el suelo son 25', () => {
    expect(estadoDe(320, 300, 'kcals')).toBe('ok');
    expect(estadoDe(330, 300, 'kcals')).toBe('over');
  });

  /* Con cifras grandes manda el 5 %, que es lo que siempre hizo: el suelo está
     para las pequeñas, no para ensanchar el margen de un día entero. */
  it('con cifras grandes sigue mandando el 5 %', () => {
    expect(margenDe(3000, 'kcals')).toBe(150);
    expect(estadoDe(2800, 3000, 'kcals')).toBe('under');
    expect(estadoDe(2900, 3000, 'kcals')).toBe('ok');
  });

  /* «Sin objetivo» no es «cuadra»: es que no hay pregunta. Confundirlos pinta
     de verde las comidas que nadie ha pautado. */
  it('sin objetivo no juzga', () => {
    expect(estadoDe(500, 0, 'kcals')).toBe('none');
    expect(estadoDe(500, null, 'kcals')).toBe('none');
    expect(claseDe(500, null, 'kcals')).toBe('');
    expect(cuadra(500, null, 'kcals')).toBe(false);
  });

  it('la clase se pega tal cual a la del elemento', () => {
    expect(claseDe(330, 300, 'kcals')).toBe(' is-over');
    expect(claseDe(300, 300, 'kcals')).toBe(' is-ok');
    expect(claseDe(200, 300, 'kcals')).toBe(' is-under');
  });
});

/**
 * ══ «CUADRA» DICE DE QUÉ ═══════════════════════════════════════════════════
 *
 * El veredicto del reparto miraba SOLO las kilocalorías: en la pantalla medida
 * decía «el reparto cuadra» con la proteína repartida 48 g por encima de su
 * objetivo, con los dos números a la vista en la misma fila.
 */
describe('el reparto del día mira los cuatro números', () => {
  const comida = (target) => ({ id: `m${Math.random()}`, name: 'Comida', target, options: [] });
  const objetivo = { targetKcals: 2000, proteinGrams: 150, carbsGrams: 200, fatsGrams: 60 };

  it('cuadra cuando cuadran los cuatro', () => {
    const meals = [
      comida({ kcals: '1000', protein: '75', carbs: '100', fats: '30' }),
      comida({ kcals: '1000', protein: '75', carbs: '100', fats: '30' }),
    ];
    const reparto = repartoDelDia(meals, objetivo);
    expect(reparto.cuadra).toBe(true);
    expect(vozDelReparto(reparto)).toBe('el reparto cuadra');
  });

  it('con las kcal cuadradas y un macro fuera, lo dice', () => {
    const meals = [
      comida({ kcals: '1000', protein: '110', carbs: '100', fats: '30' }),
      comida({ kcals: '1000', protein: '110', carbs: '100', fats: '30' }),
    ];
    const reparto = repartoDelDia(meals, objetivo);
    expect(reparto.cuadra).toBe(false);
    expect(reparto.estados.kcals).toBe('ok');
    expect(vozDelReparto(reparto)).toBe('cuadra en kcal, no cuadra en P');
  });

  it('con kcal por repartir lo dice primero, y luego de qué más falla', () => {
    const meals = [comida({ kcals: '1000', protein: '75', carbs: '100', fats: '30' })];
    const reparto = repartoDelDia(meals, objetivo);
    expect(vozDelReparto(reparto)).toBe('quedan 1000 kcal por repartir · no cuadra en P ni C ni G');
  });

  /* Sin comidas repartidas no hay veredicto: callar es la respuesta correcta y
     un «no cuadra» sobre un plan sin empezar es reñir por nada. */
  it('sin nada repartido no dice nada', () => {
    expect(vozDelReparto(repartoDelDia([], objetivo))).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LOS DÍAS DE LA DIETA
   --------------------------------------------------------------------------
   Lo que hay que fijar aquí no es que la lista funcione: es que el plan siga
   leyéndose ENTERO mientras `days` está vacío. Un plan de uno o dos días vive
   en las columnas de siempre y no ha pasado por la migración 0111; si `planDays`
   dejara de derivarlos, la dieta de todo el mundo saldría en blanco el día del
   despliegue y nadie se enteraría hasta abrir un cliente.
   ══════════════════════════════════════════════════════════════════════════ */
describe('planDays: los días salen de la lista o de las columnas de siempre', () => {
  const comida = (name) => ({ id: `m-${name}`, name, options: [{ id: 'o', foods: [] }] });

  it('sin variantes es UN día con la dieta única y el objetivo principal', () => {
    const dias = planDays({
      ...emptyNutrition(),
      targetKcals: 2400,
      proteinGrams: 180,
      closedMeals: [comida('Cena')],
    });
    expect(dias).toHaveLength(1);
    expect(dias[0].id).toBe('default');
    expect(dias[0].targets.targetKcals).toBe(2400);
    expect(dias[0].meals).toHaveLength(1);
  });

  it('con variantes son DOS, y el de descanso hereda el objetivo si no tiene', () => {
    const plan = {
      ...emptyNutrition(),
      hasDayVariants: true,
      targetKcals: 3100,
      proteinGrams: 180,
      closedMealsTraining: [comida('Comida')],
      closedMealsRest: [],
    };
    const dias = planDays(plan);
    expect(dias.map((d) => d.id)).toEqual(['training', 'rest']);
    /* Heredar es la regla que tenía `targetsFor` y que no se puede perder:
       activar el segundo día nunca deja una cifra vacía en pantalla. */
    expect(dias[1].targets.targetKcals).toBe(3100);
    expect(targetsFor(plan, 'rest').targetKcals).toBe(3100);
  });

  it('el objetivo propio del día de descanso manda sobre el heredado', () => {
    const plan = {
      ...emptyNutrition(),
      hasDayVariants: true,
      targetKcals: 3100,
      proteinGrams: 180,
      restTargets: { targetKcals: 2600, proteinGrams: null, carbsGrams: null, fatsGrams: null },
    };
    expect(targetsFor(plan, 'rest').targetKcals).toBe(2600);
    /* Lo que NO declara sigue heredándose: `restTargets` es un parche del
       objetivo, no un objetivo entero. */
    expect(targetsFor(plan, 'rest').proteinGrams).toBe(180);
  });

  it('con `days` escrito manda la lista y las columnas viejas se ignoran', () => {
    const dias = planDays({
      ...emptyNutrition(),
      closedMeals: [comida('Fantasma')],
      days: [
        { id: 'd1', name: 'Alto', targets: { targetKcals: 3400 }, meals: [comida('Desayuno')] },
        { id: 'd2', name: 'Bajo', targets: { targetKcals: 2400 }, meals: [] },
        { id: 'd3', name: 'Descanso', targets: { targetKcals: 2100 }, meals: [] },
      ],
    });
    expect(dias.map((d) => d.name)).toEqual(['Alto', 'Bajo', 'Descanso']);
    expect(dias[0].meals[0].name).toBe('Desayuno');
  });
});

describe('añadir, duplicar y quitar días', () => {
  const comida = (name) => ({ id: `m-${name}`, name, options: [{ id: 'o', foods: [] }] });

  it('el día nuevo hereda el objetivo del que sale y nace SIN menú', () => {
    const plan = {
      ...emptyNutrition(),
      targetKcals: 2400,
      proteinGrams: 180,
      closedMeals: [comida('Cena')],
    };
    const dias = planDays(addDietDay(plan, { desde: 'default' }));
    expect(dias).toHaveLength(2);
    expect(dias[1].targets.targetKcals).toBe(2400);
    /* Que nazca vacío es lo que separa «+ día» de «duplicar día»: si viniera con
       la comida puesta serían dos nombres para el mismo gesto. */
    expect(dias[1].meals).toEqual([]);
  });

  it('duplicar se lleva el menú entero, con identificadores nuevos', () => {
    const plan = { ...emptyNutrition(), targetKcals: 2400, closedMeals: [comida('Cena')] };
    const dias = planDays(duplicateDietDay(plan, 'default'));
    expect(dias).toHaveLength(2);
    expect(dias[1].meals).toHaveLength(1);
    expect(dias[1].meals[0].name).toBe('Cena');
    /* Compartir `id` entre dos días sería una suposición sobre la que alguien
       acabaría construyendo: se regeneran. */
    expect(dias[1].meals[0].id).not.toBe(dias[0].meals[0].id);
  });

  it('quitar uno de dos días heredados NO obliga a materializar la lista', () => {
    const plan = {
      ...emptyNutrition(),
      hasDayVariants: true,
      targetKcals: 3100,
      restTargets: { targetKcals: 2600 },
      closedMealsTraining: [comida('Comida')],
      closedMealsRest: [comida('Cena')],
    };
    const fuera = removeDietDay(plan, 'training');
    /* Sigue en las columnas de siempre: quitar un día tiene que funcionar
       aunque la 0111 no esté aplicada. */
    expect(fuera.days).toEqual([]);
    expect(fuera.hasDayVariants).toBe(false);
    /* Y se queda con el menú Y el objetivo del que sobrevive. */
    expect(fuera.closedMeals[0].name).toBe('Cena');
    expect(fuera.targetKcals).toBe(2600);
  });

  it('el último día no se puede quitar', () => {
    const plan = { ...emptyNutrition(), targetKcals: 2400, closedMeals: [comida('Cena')] };
    expect(planDays(removeDietDay(plan, 'default'))).toHaveLength(1);
  });

  it('quitar un día limpia las casillas de la semana que apuntaban a él', () => {
    const plan = {
      ...emptyNutrition(),
      days: [
        { id: 'd1', name: 'Alto', targets: {}, meals: [] },
        { id: 'd2', name: 'Bajo', targets: {}, meals: [] },
        { id: 'd3', name: 'Descanso', targets: {}, meals: [] },
      ],
      week: { Lunes: 'd1', Martes: 'd2', Miércoles: 'd1', Jueves: 'd3' },
    };
    const fuera = removeDietDay(plan, 'd1');
    expect(fuera.week.Lunes).toBeNull();
    expect(fuera.week['Miércoles']).toBeNull();
    expect(fuera.week.Martes).toBe('d2');
  });

  it('renombrar un día materializa la lista y no toca su menú', () => {
    const plan = { ...emptyNutrition(), targetKcals: 2400, closedMeals: [comida('Cena')] };
    const dias = planDays(renameDietDay(plan, 'default', '  Alto en hidratos  '));
    expect(dias[0].name).toBe('Alto en hidratos');
    expect(dias[0].meals[0].name).toBe('Cena');
  });

  it('escribir el menú de un día que ya no existe cae en el primero y no se pierde', () => {
    /* Quien llama trae el día que tiene abierto en pantalla, que puede haberse
       quedado rancio. Antes esto se tragaba el cambio en silencio. */
    const plan = {
      ...emptyNutrition(),
      days: [{ id: 'd1', name: 'Alto', targets: {}, meals: [] }],
    };
    const escrito = setDayMeals(plan, 'fantasma', [comida('Cena')]);
    expect(escrito.days[0].meals[0].name).toBe('Cena');
  });
});

describe('el reparto del ciclo', () => {
  const plan = {
    ...emptyNutrition(),
    days: [
      { id: 'alto', name: 'Alto', targets: { targetKcals: 3200, proteinGrams: 180, carbsGrams: 420, fatsGrams: 80 }, meals: [] },
      { id: 'bajo', name: 'Bajo', targets: { targetKcals: 2400, proteinGrams: 180, carbsGrams: 220, fatsGrams: 70 }, meals: [] },
    ],
  };

  /* Las casillas del ciclo natural: las siete de siempre. */
  const semana = cycleSlots({ cycleType: 'weekly' });

  it('sin reparto no hay media, y no se inventa ninguna', () => {
    expect(hasCycleMap(plan)).toBe(false);
    expect(cycleAverage(plan, semana)).toBeNull();
  });

  it('la media es ponderada por las casillas que le tocan a cada uno', () => {
    const conSemana = {
      ...plan,
      week: {
        Lunes: 'alto',
        Martes: 'bajo',
        'Miércoles': 'alto',
        Jueves: 'bajo',
        Viernes: 'alto',
        'Sábado': 'bajo',
        Domingo: 'bajo',
      },
    };
    const media = cycleAverage(conSemana, semana);
    expect(media.days).toBe(7);
    /* 3 altos y 4 bajos: (3x3200 + 4x2400) / 7 = 2742,8... */
    expect(media.targetKcals).toBe(2743);
  });

  it('medio ciclo repartido se divide entre lo repartido, no entre las casillas', () => {
    const conSemana = { ...plan, week: { Lunes: 'alto', Martes: 'alto' } };
    const media = cycleAverage(conSemana, semana);
    expect(media.days).toBe(2);
    /* Dividir entre siete diría que come 914 kcal al día, que es falso. */
    expect(media.targetKcals).toBe(3200);
  });

  it('las casillas que apuntan a un día que ya no existe se leen como vacías', () => {
    const conSemana = { ...plan, week: { Lunes: 'fantasma', Martes: 'bajo' } };
    expect(cycleMap(conSemana, semana).Lunes).toBeNull();
    expect(cycleMap(conSemana, semana).Martes).toBe('bajo');
    /* Y «hay algo puesto» tampoco se deja engañar por un día fantasma. */
    expect(hasCycleMap({ ...plan, week: { Lunes: 'fantasma' } })).toBe(false);
  });

  it('«repartir por el entreno» pone el día de entreno donde hay sesión', () => {
    const split = {
      Lunes: 'Push A',
      Martes: '',
      'Miércoles': 'Pull A',
      Jueves: 'Descanso',
      Viernes: 'Pierna',
      'Sábado': '',
      Domingo: '',
    };
    const mapa = cycleFromSplit(cycleSlots({ cycleType: 'weekly', weeklySplit: split }), {
      entreno: 'alto',
      descanso: 'bajo',
    });
    expect(mapa.Lunes).toBe('alto');
    /* Vacío es descanso: la regla es `isRestDay` y no se reescribe aquí. */
    expect(mapa.Martes).toBe('bajo');
    expect(mapa.Jueves).toBe('bajo');
    expect(mapa.Viernes).toBe('alto');
  });

  it('dice cuándo el reparto de la dieta ya no coincide con el del entreno', () => {
    const split = {
      Lunes: 'Push A',
      Martes: '',
      'Miércoles': '',
      Jueves: '',
      Viernes: '',
      'Sábado': '',
      Domingo: '',
    };
    const casillas = cycleSlots({ cycleType: 'weekly', weeklySplit: split });
    const pareja = { entreno: 'alto', descanso: 'bajo' };
    const igual = { ...plan, week: cycleFromSplit(casillas, pareja) };
    expect(cycleMatchesSplit(igual, casillas, pareja)).toBe(true);

    const movido = { ...igual, week: { ...igual.week, Lunes: 'bajo' } };
    expect(cycleMatchesSplit(movido, casillas, pareja)).toBe(false);
  });

  /* -- Y LO QUE NO SE PODÍA HACER: un alto/bajo con ciclo rotativo ----------
     La avería que trae aquí a este bloque: las casillas eran los siete días de
     la semana, así que a quien entrena «2 y 1» se le pedía repartir la dieta
     por unos martes que en su ciclo no existen. */
  describe('con ciclo rotativo', () => {
    const sesiones = [{ dayName: 'Empuje' }, { dayName: 'Tirón' }, { dayName: 'Pierna' }, { dayName: 'Full' }];
    const casillas = cycleSlots({ cycleType: 'rotating', pattern: { train: 2, rest: 1 }, sessions: sesiones });

    it('las casillas son los días del microciclo, con los descansos dentro', () => {
      /* 2/1 con cuatro sesiones: E - T - descanso - P - F - descanso. */
      expect(casillas.map((c) => c.corto)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
      expect(casillas.map((c) => c.rest)).toEqual([false, false, true, false, false, true]);
      expect(casillas.map((c) => c.sesion)).toEqual(['Empuje', 'Tirón', null, 'Pierna', 'Full', null]);
    });

    it('se reparte por posición del ciclo, y la media sale de sus seis días', () => {
      const puesto = casillas.reduce((n, c) => setCycleSlot(n, c.key, c.rest ? 'bajo' : 'alto'), plan);
      expect(hasCycleMap(puesto)).toBe(true);
      const media = cycleAverage(puesto, casillas);
      expect(media.days).toBe(6);
      /* 4 altos y 2 bajos: (4x3200 + 2x2400) / 6 = 2933,3... */
      expect(media.targetKcals).toBe(2933);
    });

    it('«repartir por el entreno» es exacto: el patrón ya dice qué es descanso', () => {
      const mapa = cycleFromSplit(casillas, { entreno: 'alto', descanso: 'bajo' });
      expect(mapa['3']).toBe('bajo');
      expect(mapa['6']).toBe('bajo');
      expect(mapa['1']).toBe('alto');
      expect(mapa['4']).toBe('alto');
    });

    it('lo repartido por semana no se enseña aquí, pero tampoco se borra', () => {
      const conSemana = { ...plan, week: { Lunes: 'alto', Domingo: 'bajo' } };
      /* Ninguna casilla del rotativo se llama «Lunes»: no se lee. */
      expect(Object.values(cycleMap(conSemana, casillas)).every((v) => v === null)).toBe(true);
      /* Y escribir una casilla del ciclo deja lo de la semana donde estaba: el
         día que vuelva al ciclo natural, su reparto sigue ahí. */
      const escrito = setCycleSlot(conSemana, '1', 'alto');
      expect(escrito.week.Lunes).toBe('alto');
      expect(escrito.week['1']).toBe('alto');
    });

    it('quitar un día limpia las casillas del ciclo que apuntaban a él', () => {
      const puesto = setCycleSlot(setCycleSlot(plan, '1', 'alto'), '3', 'bajo');
      const fuera = removeDietDay(puesto, 'bajo');
      expect(fuera.week['1']).toBe('alto');
      expect(fuera.week['3']).toBeNull();
    });
  });
});

describe('rescaleMeals por hidratos', () => {
  /* 100 g de arroz (78 g de hidratos) y 150 g de pollo: la fuente de hidratos y
     la de proteína. Bajar los hidratos tiene que mover el arroz y solo el arroz. */
  const menu = () => [
    {
      id: 'm1',
      name: 'Comida',
      options: [
        {
          id: 'o1',
          foods: [
            { id: 'f1', name: 'Arroz', grams: 100, proteinPer100: 7, carbsPer100: 78, fatsPer100: 1 },
            { id: 'f2', name: 'Pollo', grams: 150, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2 },
            { id: 'f3', name: 'Aceite', grams: 10, proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 },
          ],
        },
      ],
    },
  ];

  it('mueve la fuente de hidratos y deja quietas la proteína Y LAS GRASAS', () => {
    const res = rescaleMeals(menu(), { fromCarbs: 78, toCarbs: 39 });
    expect(res).not.toBeNull();
    expect(res.medida).toBe('carbs');
    expect(res.cambios.map((c) => c.food)).toEqual(['Arroz']);
    expect(res.cambios[0].to).toBe(50);
  });

  it('por kcal, en cambio, el aceite también baja', () => {
    /* Es la diferencia entre las dos medidas, y es justo lo que un ciclado de
       hidratos no quiere: por eso hacían falta las dos. */
    const res = rescaleMeals(menu(), { fromKcals: 1000, toKcals: 800 });
    expect(res.cambios.map((c) => c.food).sort()).toEqual(['Aceite', 'Arroz']);
  });

  it('una opción sin hidratos se queda como está y se dice', () => {
    const soloProte = [
      {
        id: 'm1',
        name: 'Merienda',
        options: [
          { id: 'o1', foods: [{ id: 'f1', name: 'Pollo', grams: 150, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2 }] },
        ],
      },
      ...menu(),
    ];
    const res = rescaleMeals(soloProte, { fromCarbs: 78, toCarbs: 39 });
    expect(res.sinTocar).toEqual([{ meal: 'Merienda', option: 1 }]);
  });
});

describe('las alternativas de una comida se nombran', () => {
  it('sin nombre propio se llaman por su sitio en la lista', () => {
    expect(optionName({ id: 'o1', foods: [] }, 0)).toBe('Opción 1');
    expect(optionName({ id: 'o2', foods: [] }, 1)).toBe('Opción 2');
  });

  it('con nombre propio, el nombre manda', () => {
    expect(optionName({ id: 'o1', name: 'Con avena' }, 0)).toBe('Con avena');
  });

  /* Un nombre en blanco no es un nombre: se guarda «   » al borrar lo escrito y
     dejarlo así daría una pastilla vacía en la que ya no se puede pulsar. */
  it('un nombre en blanco cae al ordinal', () => {
    expect(optionName({ id: 'o1', name: '   ' }, 2)).toBe('Opción 3');
    expect(optionName({ id: 'o1', name: '' }, 0)).toBe('Opción 1');
  });

  it('aguanta que no haya opción', () => {
    expect(optionName(undefined, 0)).toBe('Opción 1');
    expect(optionName(null, 1)).toBe('Opción 2');
  });

  /* El nombre viaja con la copia: duplicar «Con avena» tiene que dar otra «Con
     avena», no una «Opción 2» sin apellido. */
  it('el nombre sobrevive a clonar la opción', () => {
    const clon = cloneOption({ id: 'o1', name: 'Con avena', foods: [] });
    expect(clon.name).toBe('Con avena');
    expect(clon.id).not.toBe('o1');
  });
});

describe('replaceDietDays: la única escritura de dieta que borra', () => {
  const plan = () => ({
    type: 'closed',
    hasDayVariants: true,
    habitsNotes: [{ id: 'n1', title: 'Agua', body: 'Tres litros' }],
    stepsGoal: 9000,
    cardioGoal: '3 días de 25 min',
    clientSwaps: true,
    week: { Lunes: 'd1', Martes: 'd2' },
    days: [
      { id: 'd1', name: 'Entreno', targets: { targetKcals: 3000, proteinGrams: 180, carbsGrams: 350, fatsGrams: 90 }, meals: [buildMeal()] },
      { id: 'd2', name: 'Descanso', targets: { targetKcals: 2400 }, meals: [] },
    ],
  });

  const nuevos = [
    { name: 'Alto', proporcion: 1, meals: [buildMeal(), buildMeal()] },
    { name: 'Medio', proporcion: 0.9, meals: [buildMeal()] },
    { name: 'Bajo', proporcion: 0.8, meals: [] },
  ];

  it('sustituye los días enteros', () => {
    const out = replaceDietDays(plan(), nuevos);
    expect(out.days.map((d) => d.name)).toEqual(['Alto', 'Medio', 'Bajo']);
    expect(out.days[0].meals).toHaveLength(2);
    expect(out.hasDayVariants).toBe(true);
  });

  /* Lo que es de la persona y no del plan. Es la mitad del trato: mandarle una
     dieta a alguien no es mandarle sus hábitos ni sus pasos. */
  it('le deja sus pautas, sus pasos, su cardio y sus equivalencias', () => {
    const out = replaceDietDays(plan(), nuevos);
    expect(out.habitsNotes).toHaveLength(1);
    expect(out.stepsGoal).toBe(9000);
    expect(out.cardioGoal).toBe('3 días de 25 min');
    expect(out.clientSwaps).toBe(true);
  });

  /* La firma: SU objetivo se queda y los días nuevos lo escalan por la
     proporción que traían. Mandar la misma dieta a ocho no es darles las mismas
     calorías. */
  it('el primer día conserva SU objetivo y los demás guardan la proporción', () => {
    const out = replaceDietDays(plan(), nuevos);
    expect(out.days[0].targets.targetKcals).toBe(3000);
    expect(out.days[1].targets.targetKcals).toBe(2700);
    expect(out.days[2].targets.targetKcals).toBe(2400);
  });

  /* La misma ley que `rescaleMeals` aplica al menú: se mueven las kcal y los
     hidratos, y la proteína y las grasas se quedan donde están. */
  it('al escalar mueve los hidratos y deja quietas proteína y grasas', () => {
    const out = replaceDietDays(plan(), nuevos);
    expect(out.days[1].targets.proteinGrams).toBe(180);
    expect(out.days[1].targets.fatsGrams).toBe(90);
    expect(out.days[1].targets.carbsGrams).toBeLessThan(350);
  });

  /* `week` apunta a ids que dejan de existir: conservarlo dejaría al cliente con
     un «hoy te toca» sin día al que apuntar. */
  it('vacía el reparto del ciclo', () => {
    expect(replaceDietDays(plan(), nuevos).week).toEqual({});
  });

  it('con un solo día deja de haber variantes', () => {
    const out = replaceDietDays(plan(), [{ name: 'Única', meals: [] }]);
    expect(out.hasDayVariants).toBe(false);
    expect(out.days).toHaveLength(1);
  });

  /* Los ids se renuevan: la misma dieta se manda a ocho, y ocho copias con los
     mismos identificadores acabarían compartiéndolos. */
  it('renueva los identificadores de las comidas', () => {
    const comida = buildMeal();
    const out = replaceDietDays(plan(), [{ name: 'Única', meals: [comida] }]);
    expect(out.days[0].meals[0].id).not.toBe(comida.id);
    expect(out.days[0].meals[0].name).toBe(comida.name);
  });

  it('sin días no toca nada', () => {
    const antes = plan();
    expect(replaceDietDays(antes, []).days.map((d) => d.name)).toEqual(['Entreno', 'Descanso']);
  });

  it('a quien no tenía objetivo no le inventa uno', () => {
    const sinObjetivo = { ...plan(), days: [{ id: 'd1', name: 'Uno', targets: {}, meals: [] }] };
    const out = replaceDietDays(sinObjetivo, nuevos);
    expect(out.days[1].targets.targetKcals ?? null).toBeNull();
  });
});

/* ══ LA FOTO DEL CICLO ═══════════════════════════════════════════════════════
   La cifra que se guarda de un plan de varios días. Hasta hoy se guardaba
   `targetKcals` —el primer día—, así que en un alto/bajo el histórico entero
   dibujaba el alto y lo llamaba «lo que tenía pautado». */
describe('cycleFoto', () => {
  const slots = ['1', '2', '3'].map((key) => ({ key, corto: `D${key}` }));
  const alto = { id: 'a', name: 'Alto', targets: { targetKcals: 3000, proteinGrams: 180, carbsGrams: 400, fatsGrams: 60 }, meals: [] };
  const bajo = { id: 'b', name: 'Bajo', targets: { targetKcals: 2100, proteinGrams: 180, carbsGrams: 175, fatsGrams: 60 }, meals: [] };
  const ciclado = (week) => ({ ...emptyNutrition(), days: [alto, bajo], week });

  it('con el ciclo repartido, la cabecera es la media ponderada', () => {
    const foto = cycleFoto(ciclado({ 1: 'a', 2: 'a', 3: 'b' }), slots);
    expect(foto.kcals).toBe(2700); // (3000 + 3000 + 2100) / 3
    expect(foto.de).toBe('media');
    expect(foto.reparto).toBe(3);
  });

  /* Sin reparto no se puede ponderar sin adivinar cuántos días entrena, así que
     se enseña lo que hay —el primer día— y se DICE que es un día. */
  it('sin repartir, es el primer día y lo dice', () => {
    const foto = cycleFoto(ciclado({}), slots);
    expect(foto.kcals).toBe(3000);
    expect(foto.de).toBe('dia');
    expect(foto.dia).toBe('Alto');
  });

  it('trae los días con lo que pide cada uno y cuántas casillas le tocan', () => {
    const foto = cycleFoto(ciclado({ 1: 'a', 2: 'a', 3: 'b' }), slots);
    expect(foto.cycle).toEqual([
      { n: 'Alto', kcals: 3000, protein: 180, carbs: 400, fats: 60, x: 2 },
      { n: 'Bajo', kcals: 2100, protein: 180, carbs: 175, fats: 60, x: 1 },
    ]);
  });

  /* Con un solo día no hay ambigüedad que deshacer, y repetir «de: dia» en cada
     pesaje de cada cliente es ruido en la columna de todo el mundo. */
  it('con un solo día no dice de dónde sale ni lista nada', () => {
    const foto = cycleFoto({ ...emptyNutrition(), targetKcals: 2400 }, slots);
    expect(foto.kcals).toBe(2400);
    expect(foto.de).toBe(null);
    expect(foto.cycle).toBe(null);
  });

  it('un plan sin una sola cifra no deja foto', () => {
    expect(cycleFoto(emptyNutrition(), slots)).toBe(null);
    expect(cycleFoto(null, slots)).toBe(null);
  });
});

/* ══ LOS OBJETIVOS DEL ENVASE ════════════════════════════════════════════════
   Fibra, azúcares, saturadas y sal pueden llevar objetivo desde las opciones
   avanzadas. No hay columna para ellos, así que obligan a materializar `days`:
   escribirlos al nivel del plan los perdería el mapeador en silencio. */
describe('los objetivos de los micros', () => {
  it('pautar la fibra materializa la lista de días', () => {
    const plano = emptyNutrition();
    expect(plano.days).toEqual([]);
    const out = setDayTargets(plano, 'default', { fiberGrams: 35 });
    expect(out.days).toHaveLength(1);
    expect(targetsFor(out, out.days[0].id).fiberGrams).toBe(35);
  });

  it('en blanco es «no lo pautas», y no una cadena vacía guardada', () => {
    const con = setDayTargets(emptyNutrition(), 'default', { fiberGrams: 35 });
    const sin = setDayTargets(con, con.days[0].id, { fiberGrams: '' });
    expect(sin.days[0].targets.fiberGrams).toBe(null);
    expect(targetsFor(sin, sin.days[0].id).fiberGrams ?? null).toBe(null);
  });

  /* Un objetivo de macros sin micros no puede convertir un plan de dos columnas
     en una lista: eso cambiaría dónde se guarda todo lo demás. */
  it('guardar solo macros no materializa nada', () => {
    const out = setDayTargets(emptyNutrition(), 'default', { targetKcals: 2400 });
    expect(out.days).toEqual([]);
    expect(out.targetKcals).toBe(2400);
  });

  it('el objetivo del día viaja con el día al leerlo', () => {
    const con = setDayTargets(emptyNutrition(), 'default', { fiberGrams: 30, saltGrams: 5 });
    const leido = targetsFor(con, con.days[0].id);
    expect(leido.fiberGrams).toBe(30);
    expect(leido.saltGrams).toBe(5);
  });
});
