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
  dayMacros,
  dietNotes,
  dietaDeHoy,
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
  objetivosPorComida,
  repartoAlObjetivo,
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
  escalonDeCocina,
  cuadrarMacros,
  claveDelCambio,
  singleDietFrom,
  unitsLabel,
  vozDelReparto,
  repartoDelCiclo,
  siglasDeDietas,
} from './nutrition';
import { mergeCatalog } from './catalog';
import { cycleSlots, WEEK_DAYS } from './training';

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
    /* Redondeo de cocina: el escalón de 100 g es de diez en diez. */
    expect(foods.find((f) => f.name === 'Arroz').grams % 10).toBe(0);
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

/* ══════════════════════════════════════════════════════════════════════════
   LA CESTA — qué alimentos absorben el recorte
   ══════════════════════════════════════════════════════════════════════════

   La avería: «es fuente de hidratos si más de la mitad de su energía son
   hidratos» mete en el mismo saco la manzana (≈95 %) y la pasta (≈85 %), así
   que en una bajada las dos pierden la misma proporción. Nadie recorta 25 g de
   manzana: el recorte sale del arroz.
   ══════════════════════════════════════════════════════════════════════════ */
describe('rescaleMeals · la cesta', () => {
  const CATALOGO = [
    { name: 'Arroz blanco', category: 'Cereales' },
    { name: 'Manzana', category: 'Fruta' },
    { name: 'Pechuga de pollo', category: 'Carne' },
    { name: 'Aceite de oliva', category: 'Grasas' },
  ];

  /* El almuerzo del estudio: arroz, pollo, aceite y manzana. */
  const almuerzo = () => [
    {
      id: 'm1',
      name: 'Almuerzo',
      options: [
        {
          id: 'o1',
          foods: [
            { id: 'f1', name: 'Arroz blanco', grams: 100, proteinPer100: 7, carbsPer100: 78, fatsPer100: 1 },
            { id: 'f2', name: 'Pechuga de pollo', grams: 200, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2 },
            { id: 'f3', name: 'Aceite de oliva', grams: 10, proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 },
            { id: 'f4', name: 'Manzana', grams: 150, proteinPer100: 0.3, carbsPer100: 13, fatsPer100: 0.2 },
          ],
        },
      ],
    },
  ];

  const gramosDe = (res, nombre) =>
    res.meals[0].options[0].foods.find((f) => f.name === nombre).grams;

  it('sin catálogo se comporta como siempre: la manzana baja con el arroz', () => {
    const carbs = 78 + 13 * 1.5;
    const res = rescaleMeals(almuerzo(), { fromCarbs: carbs, toCarbs: carbs - 50 });
    expect(gramosDe(res, 'Manzana')).toBeLessThan(150);
  });

  it('con catálogo, el recorte sale de la cesta y la manzana no se toca', () => {
    const carbs = 78 + 13 * 1.5;
    const res = rescaleMeals(almuerzo(), {
      fromCarbs: carbs,
      toCarbs: carbs - 50,
      catalog: CATALOGO,
    });
    expect(gramosDe(res, 'Manzana')).toBe(150);
    expect(gramosDe(res, 'Pechuga de pollo')).toBe(200);
    expect(gramosDe(res, 'Aceite de oliva')).toBe(10);
    expect(gramosDe(res, 'Arroz blanco')).toBeLessThan(100);
  });

  /*
    ── Y con el catálogo TAL COMO LLEGA DE LA PANTALLA ───────────────────────
    La dieta no recibe `catalogFoods`: recibe `mergeCatalog(foodLibrary, …)`, y
    en esa mezcla tu copia tapa la fila del catálogo. Como la copia se guarda sin
    categoría, la cesta se caía a la densidad y la manzana volvía a bajar con el
    arroz — o sea, la avería de arriba reaparecía en cuanto el alimento se había
    usado una vez. Ver `mergeCatalog`.
  */
  it('con el catálogo mezclado con tu biblioteca, la manzana sigue quieta', () => {
    const miBiblioteca = [
      { id: 'l1', name: 'Arroz blanco', proteinPer100: 7 },
      { id: 'l2', name: 'Manzana', proteinPer100: 0.3 },
    ];
    const carbs = 78 + 13 * 1.5;
    const res = rescaleMeals(almuerzo(), {
      fromCarbs: carbs,
      toCarbs: carbs - 50,
      catalog: mergeCatalog(miBiblioteca, CATALOGO),
    });
    expect(gramosDe(res, 'Manzana')).toBe(150);
    expect(gramosDe(res, 'Arroz blanco')).toBeLessThan(100);
  });

  /* La reserva: una comida que solo lleva fruta no tiene cesta principal, y
     rendirse dejaría la comida entera sin ajustar. */
  it('sin nada en la cesta principal se recorta de la reserva', () => {
    const soloFruta = [
      {
        id: 'm1',
        name: 'Merienda',
        options: [
          {
            id: 'o1',
            foods: [
              { id: 'f4', name: 'Manzana', grams: 300, proteinPer100: 0.3, carbsPer100: 13, fatsPer100: 0.2 },
            ],
          },
        ],
      },
    ];
    const res = rescaleMeals(soloFruta, { fromCarbs: 39, toCarbs: 30, catalog: CATALOGO });
    expect(res.meals[0].options[0].foods[0].grams).toBeLessThan(300);
  });

  /*
    ── APARTAR UNA FILA de este ajuste, sin escribir nada en la dieta ─────────
    La vista previa deja quitar un cambio que no gusta. Quitarlo no es tacharlo:
    la fila se fija y el reescalado SE REHACE, así que el resto de su opción
    absorbe lo que ella deja de poner y la comida sigue cuadrando.
  */
  it('una fila apartada se queda quieta y el resto de su opción lo absorbe', () => {
    const carbs = 78 + 13 * 1.5;
    const opciones = { fromCarbs: carbs, toCarbs: carbs - 10, catalog: CATALOGO };

    const conTodo = rescaleMeals(almuerzo(), opciones);
    const arrozSolo = gramosDe(conTodo, 'Arroz blanco');

    /* Apartado el arroz, el recorte cae en la reserva: la manzana. */
    const apartado = rescaleMeals(almuerzo(), {
      ...opciones,
      quietos: new Set([claveDelCambio('Almuerzo', 1, 'Arroz blanco')]),
    });
    expect(gramosDe(apartado, 'Arroz blanco')).toBe(100);
    expect(gramosDe(apartado, 'Manzana')).toBeLessThan(150);
    expect(arrozSolo).toBeLessThan(100);

    /* Y no se escribe ninguna marca en la dieta: `fijo` es la permanente y esto
       es solo para este ajuste. */
    expect(
      apartado.meals[0].options[0].foods.every((f) => f.fijo === undefined)
    ).toBe(true);
  });

  /* La marca por alimento: lo que la categoría no acierte lo dice el entrenador
     en la fila. Hermano de `showAs`, y con precedente probado —lo que se cuenta
     por unidades ya es un alimento fijo, solo que hoy lo decide la aplicación. */
  it('un alimento marcado como fijo no se mueve aunque esté en la cesta', () => {
    const conFijo = almuerzo();
    conFijo[0].options[0].foods[0] = { ...conFijo[0].options[0].foods[0], fijo: true };
    const carbs = 78 + 13 * 1.5;
    const res = rescaleMeals(conFijo, { fromCarbs: carbs, toCarbs: carbs - 10, catalog: CATALOGO });
    /* Sin arroz que mover, el recorte cae en la reserva: la manzana. */
    expect(gramosDe(res, 'Arroz blanco')).toBe(100);
    expect(gramosDe(res, 'Manzana')).toBeLessThan(150);
  });

  /*
    ── ESCRIBIR EL GRAMAJE de una fila, que es el otro arreglo del último paso ──
    «Déjame el arroz en 60 y que lo coja otro». La fila se clava ahí ANTES de
    reescalar nada, así que el total de la comida ya cuenta con ella y lo que
    falte sale del resto: es el «deja el chocolate y baja la patata».
  */
  const elArroz = claveDelCambio('Almuerzo', 1, 'Arroz blanco');

  it('un gramaje escrito se clava y el resto de su opción absorbe la diferencia', () => {
    const carbs = 78 + 13 * 1.5;
    const res = rescaleMeals(almuerzo(), {
      fromCarbs: carbs,
      toCarbs: carbs - 10,
      catalog: CATALOGO,
      fijados: new Map([[elArroz, 60]]),
    });

    expect(gramosDe(res, 'Arroz blanco')).toBe(60);
    /* Y como el arroz ya no puede moverse, el ajuste cae en la reserva. */
    expect(gramosDe(res, 'Manzana')).toBeLessThan(150);
    /* La fila escrita sale en la lista de cambios con su salto entero —de 100 a
       60— y no en dos trozos: la vista previa enseña UN renglón por alimento. */
    expect(res.cambios.filter((c) => c.food === 'Arroz blanco')).toEqual([
      { meal: 'Almuerzo', option: 1, food: 'Arroz blanco', from: 100, to: 60, aMano: true },
    ]);
    /* Nada se escribe en la dieta: `fijo` es la marca permanente y esto no. */
    expect(res.meals[0].options[0].foods.every((f) => f.fijo === undefined)).toBe(true);
  });

  it('un gramaje escrito basta por sí solo, sin haber movido el objetivo', () => {
    const res = rescaleMeals(almuerzo(), {
      fromKcals: 2000,
      toKcals: 2000,
      catalog: CATALOGO,
      fijados: new Map([[elArroz, 120]]),
    });
    /* Sin esto devolvía `null` —«aquí no se mueve nada»— y lo escrito se perdía
       justo al guardar. */
    expect(res).not.toBeNull();
    expect(gramosDe(res, 'Arroz blanco')).toBe(120);
  });

  it('una casilla a medio escribir no mueve la fila', () => {
    const opciones = { fromKcals: 2000, toKcals: 2000, catalog: CATALOGO };
    expect(rescaleMeals(almuerzo(), { ...opciones, fijados: new Map([[elArroz, '']]) })).toBeNull();
    expect(rescaleMeals(almuerzo(), { ...opciones, fijados: new Map([[elArroz, 0]]) })).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   EL ESCALÓN DE COCINA — un gramaje se escribe como se cocina
   ══════════════════════════════════════════════════════════════════════════

   La avería, dicha por el dueño delante de la lista: «cambiar 10 g de miel por
   8 es absurdo, o 20 de proteína por 18, o 100 de pollo por 95; prefiero menos
   cambios pero no tan ridículos». Con el redondeo al gramo por debajo de 25 g
   todas esas filas salían propuestas y ninguna se escribe a mano.
   ══════════════════════════════════════════════════════════════════════════ */
describe('rescaleMeals · el escalón de cocina', () => {
  it('el escalón crece con la cantidad', () => {
    expect(escalonDeCocina(10)).toBe(5);
    expect(escalonDeCocina(49)).toBe(5);
    expect(escalonDeCocina(100)).toBe(10);
    expect(escalonDeCocina(400)).toBe(25);
    expect(escalonDeCocina(800)).toBe(50);
  });

  /* El desayuno de la captura: avena, leche, miel y whey. */
  const desayuno = () => [
    {
      id: 'm1',
      name: 'Desayuno',
      options: [
        {
          id: 'o1',
          foods: [
            { id: 'f1', name: 'Avena', grams: 70, proteinPer100: 13, carbsPer100: 59, fatsPer100: 7 },
            { id: 'f2', name: 'Leche', grams: 400, proteinPer100: 3.3, carbsPer100: 4.8, fatsPer100: 1.6 },
            { id: 'f3', name: 'Miel', grams: 10, proteinPer100: 0, carbsPer100: 82, fatsPer100: 0 },
            { id: 'f4', name: 'Whey', grams: 20, proteinPer100: 80, carbsPer100: 6, fatsPer100: 6 },
          ],
        },
      ],
    },
  ];
  const gramosDe = (res, nombre) =>
    res.meals[0].options[0].foods.find((f) => f.name === nombre).grams;

  it('los gramajes pequeños no se mueven por un ajuste pequeño', () => {
    const res = rescaleMeals(desayuno(), { fromKcals: 2500, toKcals: 2300 });
    /* La miel se queda en 10: su escalón son 5 g y el ajuste no llega. La whey
       es fuente de proteína y no se toca nunca. */
    expect(gramosDe(res, 'Miel')).toBe(10);
    expect(gramosDe(res, 'Whey')).toBe(20);
    /* Y lo que sí se mueve, en números que se escriben: 60 g de avena y 375 de
       leche, no 63 y 355. */
    expect(gramosDe(res, 'Avena')).toBe(60);
    expect(gramosDe(res, 'Leche')).toBe(375);
  });

  it('todo cambio propuesto es un escalón entero de su fila', () => {
    const res = rescaleMeals(desayuno(), { fromKcals: 2500, toKcals: 2300 });
    for (const c of res.cambios) {
      const paso = escalonDeCocina(c.from);
      expect(c.to % paso).toBe(0);
      expect(Math.abs(c.to - c.from)).toBeGreaterThanOrEqual(paso);
    }
  });

  /* El sobrante del redondeo se coloca: con escalones gruesos, redondear cada
     fila por su cuenta dejaría la opción muy corta. */
  it('la opción sigue cuadrando con lo pedido pese al escalón grueso', () => {
    const antes = optionMacros(desayuno()[0].options[0]).kcal;
    const res = rescaleMeals(desayuno(), { fromKcals: 2500, toKcals: 2300 });
    const objetivo = antes * (2300 / 2500);
    const ahora = optionMacros(res.meals[0].options[0]).kcal;
    expect(Math.abs(ahora - objetivo)).toBeLessThan(objetivo * 0.015);
  });

  /* Menos cambios, no cambios peores: un ajuste del 2 % mueve UNA fila —la que
     mejor lo absorbe— en vez de rascar cuatro gramos de cada una. */
  it('un ajuste pequeño mueve una fila, no cuatro', () => {
    const res = rescaleMeals(desayuno(), { fromKcals: 2500, toKcals: 2450 });
    expect(res.cambios).toHaveLength(1);
  });

  /*
    ── Y NADA SUBE EN UNA BAJADA ─────────────────────────────────────────────
    La avería que salió al mirarlo con una dieta de verdad: «10 g de miel → 15»
    bajando hidratos y proteína. El reparto del sobrante elegía el escalón que
    mejor cuadraba la comida SIN mirar hacia dónde iba el ajuste, y con la crema
    de arroz redondeada de 100 a 80 la comida se quedaba corta: subir la miel
    cinco gramos era la mejor cuenta. Cierta, y absurda — en un recorte no se
    sube nada.
  */
  it('la miel no sube cuando se bajan los hidratos', () => {
    /* La «opción 3» de la captura: crema de arroz y miel, las dos hidrato. */
    const opcion3 = [
      {
        id: 'm1',
        name: 'Comida 1',
        options: [
          {
            id: 'o3',
            foods: [
              { id: 'f1', name: 'Crema de Arroz', grams: 100, proteinPer100: 7, carbsPer100: 82, fatsPer100: 1 },
              { id: 'f2', name: 'Miel', grams: 10, proteinPer100: 0, carbsPer100: 82, fatsPer100: 0 },
            ],
          },
        ],
      },
    ];
    const res = rescaleMeals(opcion3, { fromCarbs: 90.2, toCarbs: 76.2 });
    const gramos = (n) => res.meals[0].options[0].foods.find((f) => f.name === n).grams;
    expect(gramos('Crema de Arroz')).toBeLessThan(100);
    expect(gramos('Miel')).toBeLessThanOrEqual(10);
  });

  it('en una bajada ningún gramaje sube, y en una subida ninguno baja', () => {
    for (const to of [2450, 2400, 2350, 2300, 2250, 2200, 2100, 2000]) {
      for (const c of rescaleMeals(desayuno(), { fromKcals: 2500, toKcals: to })?.cambios || [])
        expect(c.to).toBeLessThan(c.from);
    }
    for (const to of [2550, 2600, 2700, 2800, 3000]) {
      for (const c of rescaleMeals(desayuno(), { fromKcals: 2500, toKcals: to })?.cambios || [])
        expect(c.to).toBeGreaterThan(c.from);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   CUADRAR LOS MACROS — quién absorbe el cambio de objetivo
   ══════════════════════════════════════════════════════════════════════════ */
describe('cuadrarMacros', () => {
  /* El caso del dueño: 2.500 kcal con 120 P / 381 HC / 55 GR. */
  const antes = { protein: 120, carbs: 381, fats: 55 };
  const suma = (m) => m.protein * 4 + m.carbs * 4 + m.fats * 9;

  it('todo de hidratos: proteína y grasas quietas, y la suma cuadra', () => {
    const r = cuadrarMacros({ antes, kcals: 2300, ancla: 'carbs' });
    expect(r.protein).toBe(120);
    expect(r.fats).toBe(55);
    expect(r.carbs).toBe(331);
    expect(suma(r)).toBe(2299); // el gramo entero, no la kilocaloría exacta
    expect(r.cabe).toBe(true);
  });

  /* Lo que mata el aviso rojo: el descuadre viejo no sobrevive al ajuste.
     Restando el salto (381 − 50 = 331 también) el resultado coincide aquí por
     casualidad; con unos macros que ya vengan torcidos, no. */
  it('cuadra contra el objetivo, así que arrastra el descuadre de antes', () => {
    /* 120 P / 400 HC / 55 GR = 2.575 kcal con un objetivo de 2.500: torcido. */
    const torcidos = { protein: 120, carbs: 400, fats: 55 };
    const r = cuadrarMacros({ antes: torcidos, kcals: 2300, ancla: 'carbs' });
    expect(Math.abs(suma(r) - 2300)).toBeLessThan(4);
  });

  it('hidratos y grasas: la proteína no se toca y los dos bajan a su proporción', () => {
    const r = cuadrarMacros({ antes, kcals: 2300, ancla: 'kcals' });
    expect(r.protein).toBe(120);
    expect(r.carbs).toBeLessThan(381);
    expect(r.fats).toBeLessThan(55);
    expect(Math.abs(suma(r) - 2300)).toBeLessThan(10);
    /* La proporción entre los dos se conserva. */
    const antesHC = (381 * 4) / (381 * 4 + 55 * 9);
    const ahoraHC = (r.carbs * 4) / (r.carbs * 4 + r.fats * 9);
    expect(Math.abs(ahoraHC - antesHC)).toBeLessThan(0.01);
  });

  it('mantén el reparto: los tres se mueven y los porcentajes no', () => {
    const r = cuadrarMacros({ antes, kcals: 2300, ancla: 'reparto' });
    expect(r.protein).toBeLessThan(120);
    expect(r.carbs).toBeLessThan(381);
    expect(r.fats).toBeLessThan(55);
    const pct = (m, k) => (m[k] * (k === 'fats' ? 9 : 4)) / suma(m);
    for (const k of ['protein', 'carbs', 'fats']) {
      expect(Math.abs(pct(r, k) - pct(antes, k))).toBeLessThan(0.01);
    }
  });

  /* «A mano» es esto mismo: se teclean dos macros y el tercero cuadra. El caso
     que pidió el dueño —«mantener la proteína, −5 g de grasa y el resto
     carbos»— es el ancla de hidratos sobre unos macros ya tocados a mano. */
  it('a mano: bajas 5 g de grasa y los hidratos recogen el hueco', () => {
    const r = cuadrarMacros({ antes: { ...antes, fats: 50 }, kcals: 2500, ancla: 'carbs' });
    expect(r.protein).toBe(120);
    expect(r.fats).toBe(50);
    /* Las 45 kcal de las cinco grasas, en hidratos: ~11 g más. */
    expect(r.carbs).toBe(393);
    expect(Math.abs(suma(r) - 2500)).toBeLessThan(4);
  });

  it('lo que no cabe sale a cero y se dice, en vez de dar un negativo', () => {
    /* 120 g de proteína son 480 kcal: no caben en un objetivo de 400. */
    const r = cuadrarMacros({ antes, kcals: 400, ancla: 'carbs' });
    expect(r.carbs).toBe(0);
    expect(r.cabe).toBe(false);
  });

  it('sin objetivo no hay nada que cuadrar', () => {
    expect(cuadrarMacros({ antes, kcals: 0 })).toMatchObject(antes);
    expect(cuadrarMacros({ antes, kcals: null })).toMatchObject(antes);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   EL REPARTO — de dónde salen las 200 kcal
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════
   APUNTAR A LO PAUTADO, NO AL SALTO
   ══════════════════════════════════════════════════════════════════════════

   La avería, medida en la pantalla de un cliente real: un menú con 148 g de
   proteína sobre 120 pautados. El entrenador baja el objetivo a 2.300 kcal y
   la proteína pautada a 115, y el reajuste deja el menú en 142 g —el 4 % menos
   que se ha movido lo pautado— contra 115. Movía veinte gramajes y no cuadraba
   ni las kilocalorías ni un solo macro.

   Escalar en proporción arrastra intacta la distancia que el menú ya tuviera.
   Lo que se pide al reajustar no es «bájalo un 4 %», es «déjalo en lo pautado».
   ══════════════════════════════════════════════════════════════════════════ */
describe('rescaleMeals · al objetivo', () => {
  /* El caso de la pantalla: el menú suma P 148 · C 351 · G 42 (2.374 kcal)
     mientras lo pautado eran P 120 · C 381 · G 55 (2.500). */
  const elCaso = () => [
    {
      id: 'm1',
      name: 'Comida',
      options: [
        {
          id: 'o1',
          foods: [
            { id: 'f1', name: 'Pollo', grams: 400, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2 },
            { id: 'f2', name: 'Claras', grams: 300, proteinPer100: 11, carbsPer100: 0, fatsPer100: 0 },
            { id: 'f3', name: 'Atún', grams: 100, proteinPer100: 23, carbsPer100: 0, fatsPer100: 0 },
            { id: 'f4', name: 'Arroz', grams: 450, proteinPer100: 0, carbsPer100: 78, fatsPer100: 0 },
            { id: 'f5', name: 'Aceite', grams: 34, proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 },
          ],
        },
      ],
    },
  ];

  const PAUTADO = { protein: 115, carbs: 336, fats: 55 };

  it('el menú acaba en lo pautado, no a la distancia a la que estaba', () => {
    const res = rescaleMeals(elCaso(), { objetivo: PAUTADO });
    const fin = dayMacros(res.meals);

    /* Dentro del margen con el que la propia app juzga si algo cuadra. */
    for (const k of ['protein', 'carbs', 'fats']) {
      expect(cuadra(fin[k], PAUTADO[k], k)).toBe(true);
    }
    expect(cuadra(fin.kcal, 2300, 'kcals')).toBe(true);
  });

  it('escalar en proporción NO cuadraba: es la avería que esto cierra', () => {
    const porElSalto = rescaleMeals(elCaso(), {
      reparto: {
        protein: { from: 120, to: 115 },
        carbs: { from: 381, to: 336 },
        fats: { from: 55, to: 55 },
      },
    });
    /* 148 × (115/120) = 142, que es lo que enseñaba la pantalla. */
    expect(Math.round(dayMacros(porElSalto.meals).protein)).toBe(142);
    expect(cuadra(dayMacros(porElSalto.meals).protein, 115, 'protein')).toBe(false);
  });

  it('corrige un macro aunque su cifra pautada no se haya tocado', () => {
    /* Las grasas seguían pautadas en 55 y el menú tenía 42: son 117 kcal que
       faltan, y no arreglarlas es no cuadrar el día. */
    const res = rescaleMeals(elCaso(), { objetivo: PAUTADO });
    expect(dayMacros(res.meals).fats).toBeGreaterThan(dayMacros(elCaso()).fats);
    expect(res.cambios.some((c) => c.food === 'Aceite' && c.to > c.from)).toBe(true);
  });

  it('sin macros pautados, apunta a las kilocalorías', () => {
    const res = rescaleMeals(elCaso(), { objetivoKcals: 2100 });
    expect(cuadra(dayMacros(res.meals).kcal, 2100, 'kcals')).toBe(true);
    /* Y por kcal la proteína sigue sin tocarse: es la regla de siempre. */
    const pollo = res.meals[0].options[0].foods.find((f) => f.name === 'Pollo');
    expect(pollo.grams).toBe(400);
  });

  /*
    «¿Por qué alimentos como la miel me los sube si estoy bajándole hidratos?»

    Porque recortar la proteína se lleva por delante los hidratos que esa
    proteína ponía —el batido, la leche—, y la segunda vuelta de los hidratos se
    encontraba el día por debajo: su factor salía mayor que uno y la miel subía
    de 10 a 15 DENTRO de una bajada de 367 a 300. El sentido de cada macro se
    decide una sola vez, con el menú de partida, y ninguna vuelta puede devolver
    una fila al otro lado de donde empezó.
  */
  it('en una bajada de un macro, ninguna de sus fuentes sube', () => {
    const CATALOGO = [
      { name: 'Crema de arroz', category: 'Cereales' },
      { name: 'Proteína de suero', category: 'Lácteos' },
      { name: 'Miel', category: 'Dulces' },
      { name: 'Leche', category: 'Lácteos' },
      { name: 'Pollo', category: 'Carne' },
      { name: 'Arroz', category: 'Cereales' },
    ];
    /* Proteína que ARRASTRA hidratos, que es lo que lo destapó. */
    const conBatido = [
      {
        id: 'm1',
        name: 'Desayuno',
        options: [
          {
            id: 'o1',
            foods: [
              { id: 'a', name: 'Crema de arroz', grams: 80, proteinPer100: 7, carbsPer100: 80, fatsPer100: 1 },
              { id: 'b', name: 'Proteína de suero', grams: 30, proteinPer100: 80, carbsPer100: 8, fatsPer100: 5 },
              { id: 'c', name: 'Miel', grams: 10, proteinPer100: 0, carbsPer100: 82, fatsPer100: 0 },
              { id: 'd', name: 'Leche', grams: 400, proteinPer100: 3.2, carbsPer100: 4.8, fatsPer100: 1.5 },
            ],
          },
        ],
      },
      {
        id: 'm2',
        name: 'Comida',
        options: [
          {
            id: 'o1',
            foods: [
              { id: 'e', name: 'Pollo', grams: 400, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2 },
              { id: 'f', name: 'Arroz', grams: 350, proteinPer100: 7, carbsPer100: 78, fatsPer100: 1 },
            ],
          },
        ],
      },
    ];

    const antes = dayMacros(conBatido);
    expect(Math.round(antes.carbs)).toBeGreaterThan(300);

    const res = rescaleMeals(conBatido, {
      objetivo: { protein: 115, carbs: 300, fats: 55 },
      catalog: CATALOGO,
    });

    /* Los hidratos bajan, así que ni la miel ni el cereal suben un gramo. */
    expect(dayMacros(res.meals).carbs).toBeLessThan(antes.carbs);
    for (const nombre of ['Miel', 'Crema de arroz', 'Arroz']) {
      const cambio = res.cambios.find((c) => c.food === nombre);
      if (cambio) expect(cambio.to).toBeLessThanOrEqual(cambio.from);
    }
  });

  it('un menú que ya está en lo pautado no propone nada', () => {
    const res = rescaleMeals(elCaso(), { objetivo: dayMacros(elCaso()) });
    expect(res).toBeNull();
  });
});

/*
  ══ EL REPARTO SIGUE AL OBJETIVO ═══════════════════════════════════════════

  El caso de la avería, con las cifras reales de la dieta de la que salió: día
  2.250/115/324/55 y cuatro comidas repartidas que suman 2.400/120/354/55,
  escritas cuando el día valía 2.400.
*/
describe('el reparto sigue al objetivo (repartoAlObjetivo)', () => {
  const comida = (name, target, extra = {}) => ({
    id: name,
    name,
    target,
    options: [{ id: `${name}-1`, foods: [] }],
    ...extra,
  });

  const cuatro = () => [
    comida('Comida 1', { kcals: 600, protein: 30, carbs: 86, fats: 15 }),
    comida('Comida 2', { kcals: 600, protein: 30, carbs: 86, fats: 15 }),
    comida('Comida 3', { kcals: 600, protein: 30, carbs: 98, fats: 10 }),
    comida('Comida 4', { kcals: 600, protein: 30, carbs: 84, fats: 15 }),
  ];

  const DIA = { kcals: 2250, protein: 115, carbs: 324, fats: 55 };
  const suma = (meals, clave) =>
    meals.reduce((n, m) => n + mealTarget(m)[clave], 0);

  it('el reparto vuelve a sumar EXACTAMENTE lo que pide el día', () => {
    const { meals } = repartoAlObjetivo(cuatro(), DIA);
    expect(suma(meals, 'kcals')).toBe(2250);
    expect(suma(meals, 'protein')).toBe(115);
    expect(suma(meals, 'carbs')).toBe(324);
    expect(suma(meals, 'fats')).toBe(55);
  });

  it('cada comida conserva el peso que tenía dentro del día', () => {
    const { meals } = repartoAlObjetivo(cuatro(), DIA);
    /* Las cuatro valían lo mismo, así que siguen valiendo lo mismo. */
    expect(meals.map((m) => mealTarget(m).kcals)).toEqual([563, 563, 562, 562]);
  });

  it('una comida con candado no se mueve y las demás cargan con el salto', () => {
    const meals = cuatro();
    meals[0].fijo = true;
    const res = repartoAlObjetivo(meals, DIA);
    expect(mealTarget(res.meals[0]).kcals).toBe(600);
    expect(suma(res.meals, 'kcals')).toBe(2250);
    expect(res.cambios.find((c) => c.meal === 'Comida 1')).toBeUndefined();
  });

  /*
    El blanco de los hidratos significa «el resto» y tiene que seguir
    significándolo: no se rellena, se vuelve a derivar sobre las kcal nuevas.
    Ver `mealTarget`.
  */
  it('el hueco de los hidratos sigue en blanco y se deriva de las kcal nuevas', () => {
    const meals = cuatro();
    meals[1].target = { kcals: 600, protein: 30, carbs: '', fats: 15 };
    const { meals: nuevas } = repartoAlObjetivo(meals, DIA);
    expect(nuevas[1].target.carbs).toBe('');
    /* 4 kcal por gramo, con la proteína y la grasa de esa comida descontadas. */
    const suyo = mealTarget(nuevas[1]);
    expect(suyo.carbs).toBe(carbsFromRest(nuevas[1].target));
    expect(suma(nuevas, 'kcals')).toBe(2250);
    expect(suyo.carbs).toBeGreaterThan(0);
  });

  it('un reparto a medias es trabajo sin terminar y no se toca', () => {
    const meals = cuatro();
    meals[3].target = null;
    expect(repartoAlObjetivo(meals, DIA)).toBeNull();
  });

  it('un reparto que ya cuadra con el día no propone nada', () => {
    const { meals } = repartoAlObjetivo(cuatro(), DIA);
    expect(repartoAlObjetivo(meals, DIA)).toBeNull();
  });

  it('con todas las comidas con candado no se inventa nada', () => {
    const meals = cuatro().map((m) => ({ ...m, fijo: true }));
    expect(repartoAlObjetivo(meals, DIA)).toBeNull();
  });

  it('un día sin macros pautados mueve solo las kcal', () => {
    const { meals } = repartoAlObjetivo(cuatro(), { kcals: 2250 });
    expect(suma(meals, 'kcals')).toBe(2250);
    expect(suma(meals, 'protein')).toBe(120);
  });
});

/*
  ══ Y LA AVERÍA, DE PUNTA A PUNTA ═════════════════════════════════════════

  Con el reparto viejo, el reajuste llevaba el menú a 2.400 y el día seguía
  diciendo «de más». Con el reparto ya seguido al objetivo, aterriza en 2.250.
*/
describe('bajar el objetivo baja el menú (reparto + reajuste)', () => {
  const f = (name, grams, p, c, g) => ({
    id: name,
    name,
    grams,
    proteinPer100: p,
    carbsPer100: c,
    fatsPer100: g,
  });
  const comida = (name, target, foods) => ({
    id: name,
    name,
    target,
    options: [{ id: `${name}-1`, foods }],
  });

  const menu = () => [
    comida('Comida 1', { kcals: 600, protein: 30, carbs: 86, fats: 15 }, [
      f('Avena', 80, 13, 60, 7),
      f('Leche', 250, 3.3, 4.8, 1.6),
      f('Whey', 15, 80, 6, 6),
      f('Plátano', 120, 1, 23, 0.3),
    ]),
    comida('Comida 2', { kcals: 600, protein: 30, carbs: 86, fats: 15 }, [
      f('Arroz', 80, 7, 78, 0.6),
      f('Pollo', 90, 23, 0, 1.5),
      f('Aguacate', 90, 2, 9, 15),
      f('Naranja', 180, 1, 9, 0.1),
    ]),
    comida('Comida 3', { kcals: 600, protein: 30, carbs: 98, fats: 10 }, [
      f('Crema de arroz', 70, 7, 83, 1),
      f('Whey', 20, 80, 6, 6),
      f('Leche', 300, 3.3, 4.8, 1.6),
      f('Plátano', 120, 1, 23, 0.3),
    ]),
    comida('Comida 4', { kcals: 600, protein: 30, carbs: 84, fats: 15 }, [
      f('Arroz', 80, 7, 78, 0.6),
      f('Merluza', 150, 18, 0, 0.7),
      f('Aceite', 15, 0, 0, 100),
      f('Manzana', 180, 0.5, 12, 0.2),
    ]),
  ];

  const DIA = { protein: 115, carbs: 324, fats: 55 };

  it('sin seguir el reparto, el menú se queda clavado en la cifra vieja', () => {
    const res = rescaleMeals(menu(), { objetivo: DIA });
    const despues = dayMacros((res || { meals: menu() }).meals);
    /* La avería: el día pide 2.250 y el menú aterriza doscientas por encima. */
    expect(Math.round(despues.kcal)).toBeGreaterThan(2300);
  });

  it('con el reparto seguido, el menú aterriza en lo pautado', () => {
    const { meals } = repartoAlObjetivo(menu(), { kcals: 2250, ...DIA });
    const res = rescaleMeals(meals, { objetivo: DIA });
    const despues = dayMacros(res.meals);
    /* El margen que queda es el del escalón de cocina, que es el que tiene
       que quedar. Ver `escalonDeCocina`. */
    expect(Math.abs(Math.round(despues.kcal) - 2250)).toBeLessThanOrEqual(60);
    expect(Math.abs(Math.round(despues.carbs) - 324)).toBeLessThanOrEqual(12);
  });
});


describe('el objetivo baja a la comida (objetivosPorComida)', () => {
  const comida = (name, foods) => ({ id: name, name, options: [{ id: `${name}-1`, foods }] });
  const f = (name, grams, p, c, g) => ({
    id: name,
    name,
    grams,
    proteinPer100: p,
    carbsPer100: c,
    fatsPer100: g,
  });

  /* Dos comidas: la primera pone 100 g de hidratos y la segunda 200. */
  const dos = () => [
    comida('Desayuno', [f('Avena', 100, 0, 100, 0)]),
    comida('Comida', [f('Arroz', 200, 0, 100, 0)]),
  ];

  it('sin reparto puesto, cada comida recibe lo suyo en la proporción que ya tiene', () => {
    const metas = objetivosPorComida(dos(), { carbs: 240 });
    expect(metas.map((m) => Math.round(m.carbs))).toEqual([80, 160]);
  });

  it('una comida con objetivo puesto va a ese número exacto, y el resto se reparte lo que queda', () => {
    const meals = dos();
    meals[0].target = { kcals: 400, protein: 0, carbs: 100, fats: 0 };

    const metas = objetivosPorComida(meals, { carbs: 240 });
    expect(metas[0].carbs).toBe(100);
    expect(Math.round(metas[1].carbs)).toBe(140);
  });

  /*
    Un desayuno de avena y claras no tiene ni una fuente de grasa: darle su
    parte proporcional de los gramos pautados es darle algo que no puede coger,
    y los que le sobran al día no se los lleva nadie. Su parte pasa a las
    comidas que sí pueden moverla.
  */
  it('una comida sin fuente de un macro no se lleva parte de él', () => {
    const meals = [
      comida('Desayuno', [f('Avena', 80, 13, 60, 7), f('Claras', 300, 11, 0, 0)]),
      comida('Comida', [f('Pollo', 250, 23, 0, 2), f('Aceite', 20, 0, 0, 100)]),
    ];

    const metas = objetivosPorComida(meals, { fats: 60 });
    /* El desayuno se queda en sus 5,6 g y la comida carga con el resto. */
    expect(Math.round(metas[0].fats)).toBe(6);
    expect(Math.round(metas[1].fats)).toBe(54);
    expect(Math.round(metas[0].fats + metas[1].fats)).toBe(60);
  });

  /* El reparto del entrenador se pasa del día: no se le corrige por detrás. La
     comida sin objetivo se queda en lo que suma y no se mueve. */
  it('si el reparto no deja sitio, las demás se quedan donde están', () => {
    const meals = dos();
    meals[0].target = { kcals: 1200, protein: 0, carbs: 300, fats: 0 };

    const metas = objetivosPorComida(meals, { carbs: 240 });
    expect(metas[0].carbs).toBe(300);
    expect(Math.round(metas[1].carbs)).toBe(200);
  });
});

describe('rescaleMeals · cuadrar por comida, no por día', () => {
  const f = (name, grams, p, c, g) => ({
    id: name,
    name,
    grams,
    proteinPer100: p,
    carbsPer100: c,
    fatsPer100: g,
  });

  /*
    Cuatro comidas de dos opciones son dieciséis menús, y el cliente elige uno
    cada mañana. Las segundas opciones están a propósito por encima de las
    primeras, que es lo que el reajuste por día no corregía nunca: cuadraba el
    menú de las opciones 1 —el único que suma `dayMacros`— y dejaba los otros
    quince donde estuvieran.
  */
  const dia = () => [
    {
      id: 'm1',
      name: 'Desayuno',
      options: [
        { id: 'a', foods: [f('Avena', 80, 13, 60, 7), f('Claras', 300, 11, 0, 0)] },
        { id: 'b', foods: [f('Pan', 150, 9, 50, 3), f('Huevo', 200, 13, 1, 11)] },
      ],
    },
    {
      id: 'm2',
      name: 'Comida',
      options: [
        { id: 'a', foods: [f('Arroz', 300, 7, 78, 1), f('Pollo', 250, 23, 0, 2), f('Aceite', 15, 0, 0, 100)] },
        { id: 'b', foods: [f('Pasta', 400, 12, 72, 2), f('Ternera', 200, 21, 0, 6), f('Oliva', 25, 0, 0, 100)] },
      ],
    },
    {
      id: 'm3',
      name: 'Merienda',
      options: [
        { id: 'a', foods: [f('Yogur', 250, 10, 4, 0), f('Fruta', 200, 0, 12, 0)] },
        { id: 'b', foods: [f('Tostada', 100, 9, 50, 3), f('Atún', 120, 23, 0, 1)] },
      ],
    },
    {
      id: 'm4',
      name: 'Cena',
      options: [
        { id: 'a', foods: [f('Patata', 350, 2, 17, 0), f('Merluza', 250, 17, 0, 1), f('AOVE', 10, 0, 0, 100)] },
        { id: 'b', foods: [f('Quinoa', 250, 14, 64, 6), f('Salmón', 180, 20, 0, 13)] },
      ],
    },
  ];

  const PAUTADO = { protein: 190, carbs: 240, fats: 70 };
  const KCAL = PAUTADO.protein * 4 + PAUTADO.carbs * 4 + PAUTADO.fats * 9;

  /** Los menús que se pueden armar eligiendo una opción por comida. */
  const combinaciones = (meals, salta = () => false) => {
    let out = [[]];
    for (const [mi, meal] of meals.entries()) {
      out = out.flatMap((pre) =>
        meal.options.filter((_, oi) => !salta(meal.name, oi + 1)).map((o) => [...pre, o])
      );
      if (out.length === 0) return [];
      void mi;
    }
    return out.map((ops) => Math.round(ops.reduce((n, o) => n + optionMacros(o).kcal, 0)));
  };

  it('antes, ninguna de las dieciséis combinaciones cuadra', () => {
    const todas = combinaciones(dia());
    expect(todas).toHaveLength(16);
    expect(todas.filter((k) => cuadra(k, KCAL, 'kcals'))).toHaveLength(0);
  });

  /*
    Las que el ajuste SÍ puede cuadrar, cuadran todas — no solo la de las
    opciones 1. Las que no, están dichas en `fuera` y por eso se pueden apartar
    de la cuenta: el trato es «o lo cuadro o lo digo», nunca callarlo.
  */
  it('después cuadran todas las combinaciones, salvo las que el parte señala', () => {
    const res = rescaleMeals(dia(), { objetivo: PAUTADO });
    const senalada = (meal, option) =>
      res.fuera.some((o) => o.meal === meal && o.option === option);

    const buenas = combinaciones(res.meals, senalada);
    expect(buenas.length).toBeGreaterThan(0);
    for (const kcal of buenas) expect(cuadra(kcal, KCAL, 'kcals')).toBe(true);
  });

  it('las alternativas dejan de heredar la distancia que tenían con la primera', () => {
    const antes = dia().map((m) => m.options.map((o) => Math.round(optionMacros(o).kcal)));
    /* La opción 2 del desayuno empieza 289 kcal por encima de la 1. */
    expect(antes[0][1] - antes[0][0]).toBeGreaterThan(250);

    const res = rescaleMeals(dia(), { objetivo: PAUTADO });
    const despues = res.meals.map((m) => m.options.map((o) => Math.round(optionMacros(o).kcal)));
    expect(despues[0][1] - despues[0][0]).toBeLessThan(antes[0][1] - antes[0][0]);

    /* Y las que el parte no señala acaban pegadas a su hermana. */
    for (const [mi, meal] of res.meals.entries()) {
      const limpias = meal.options
        .map((o, oi) => ({ kcal: optionMacros(o).kcal, oi }))
        .filter(({ oi }) => !res.fuera.some((x) => x.meal === meal.name && x.option === oi + 1));
      if (limpias.length < 2) continue;
      const kcals = limpias.map((x) => x.kcal);
      expect(Math.max(...kcals) - Math.min(...kcals)).toBeLessThan(
        margenDe(despues[mi][0], 'kcals') * 2
      );
    }
  });

  /*
    La cuenta derivada es la misma que el reajuste hacía con el día, así que la
    primera opción —la que cuenta para el total— tiene que seguir llevando el día
    a lo pautado. Es la garantía de que esto no reescribe el ajuste: lo baja de
    piso sin perder lo que ya hacía bien.
  */
  it('la primera opción sigue llevando el día a lo pautado', () => {
    const res = rescaleMeals(dia(), { objetivo: PAUTADO });
    const fin = dayMacros(res.meals);
    for (const k of ['protein', 'carbs', 'fats']) {
      expect(cuadra(fin[k], PAUTADO[k], k)).toBe(true);
    }
    expect(cuadra(fin.kcal, KCAL, 'kcals')).toBe(true);
  });

  /*
    La cena de quinoa y salmón es el doble que la de patata y merluza: cuadrarla
    pediría un factor por debajo de 0,25, que es donde `unaPasada` se planta a
    propósito. Lo que no puede pasar es que se calle.
  */
  it('lo que no se ha podido cuadrar sale en «fuera», no en silencio', () => {
    const res = rescaleMeals(dia(), { objetivo: PAUTADO });
    const cena = res.fuera.find((o) => o.meal === 'Cena' && o.option === 2);
    expect(cena).toBeTruthy();
    expect(cena.diff).toBeGreaterThan(300);
    expect(cena.kcals - cena.primera).toBe(cena.diff);
  });

  /* Y la primera opción nunca se señala: es la referencia contra la que se mide,
     no una alternativa que se haya soltado. */
  it('«fuera» solo habla de alternativas, nunca de la opción 1', () => {
    const res = rescaleMeals(dia(), { objetivo: PAUTADO });
    expect(res.fuera.every((o) => o.option > 1)).toBe(true);
  });

  it('el objetivo que el entrenador repartió manda sobre el derivado', () => {
    const meals = dia();
    /* Un reparto que el desayuno puede alcanzar: no tiene ninguna fuente de
       grasa, así que pedirle doce gramos sería pedirle lo imposible. */
    meals[0].target = { kcals: 454, protein: 45, carbs: 55, fats: 6 };

    const res = rescaleMeals(meals, { objetivo: PAUTADO });
    const primera = res.meals[0].options[0];
    expect(cuadra(optionMacros(primera).carbs, 55, 'carbs')).toBe(true);
    expect(cuadra(optionMacros(primera).kcal, 454, 'kcals')).toBe(true);

    /* Y la del día se ignora para esa comida: 454 es lo suyo, no su parte
       proporcional de las 2.350 del día. */
    expect(Math.round(optionMacros(primera).kcal)).toBeLessThan(520);
  });

  /* Una opción que YA cuadra no es una que «no se ha podido»: antes cualquiera
     sin gramos movidos salía como si no tuviera de dónde recortar. */
  it('una opción que ya cuadra no sale en «sinTocar» ni en «fuera»', () => {
    const meals = dia();
    meals[3].options[1] = { id: 'b', foods: meals[3].options[0].foods.map((x) => ({ ...x })) };

    const res = rescaleMeals(meals, { objetivo: PAUTADO });
    expect(res.sinTocar.some((o) => o.meal === 'Cena')).toBe(false);
    expect(res.fuera.some((o) => o.meal === 'Cena')).toBe(false);
  });
});

describe('rescaleMeals · el reparto por macros', () => {
  const dia = () => [
    {
      id: 'm1',
      name: 'Comida',
      options: [
        {
          id: 'o1',
          foods: [
            { id: 'f1', name: 'Arroz', grams: 100, proteinPer100: 7, carbsPer100: 78, fatsPer100: 1 },
            { id: 'f2', name: 'Pollo', grams: 200, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2 },
            { id: 'f3', name: 'Aceite', grams: 20, proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 },
          ],
        },
      ],
    },
  ];

  const gramosDe = (res, nombre) =>
    res.meals[0].options[0].foods.find((f) => f.name === nombre).grams;

  it('mueve cada macro con su propio factor, en una sola operación', () => {
    const res = rescaleMeals(dia(), {
      reparto: { carbs: { from: 78, to: 58 }, fats: { from: 21, to: 16 } },
    });
    expect(gramosDe(res, 'Arroz')).toBeLessThan(100);
    expect(gramosDe(res, 'Aceite')).toBeLessThan(20);
    expect(gramosDe(res, 'Pollo')).toBe(200);
    expect(res.medida).toBe('macros');
    expect(res.pasos.map((p) => p.clave)).toEqual(['carbs', 'fats']);
  });

  it('un macro sin cambio no da pasada', () => {
    const res = rescaleMeals(dia(), {
      reparto: { carbs: { from: 78, to: 58 }, fats: { from: 21, to: 21 } },
    });
    expect(res.pasos).toHaveLength(1);
    expect(gramosDe(res, 'Aceite')).toBe(20);
  });

  /* Un alimento tocado por dos pasadas sale en UN renglón: de dónde sale y
     dónde acaba. Dos saltos obligarían a sumar en la cabeza. */
  it('el mismo alimento tocado dos veces se cuenta una', () => {
    const soloArroz = [
      {
        id: 'm1',
        name: 'Comida',
        options: [
          {
            id: 'o1',
            foods: [
              { id: 'f1', name: 'Arroz', grams: 200, proteinPer100: 7, carbsPer100: 78, fatsPer100: 8 },
            ],
          },
        ],
      },
    ];
    const res = rescaleMeals(soloArroz, {
      reparto: { carbs: { from: 156, to: 140 }, fats: { from: 16, to: 14 } },
    });
    const delArroz = res.cambios.filter((c) => c.food === 'Arroz');
    expect(delArroz).toHaveLength(1);
    expect(delArroz[0].from).toBe(200);
    expect(delArroz[0].to).toBe(gramosDe(res, 'Arroz'));
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

/* ══ LO QUE COME HOY ═════════════════════════════════════════════════════════
   La misma lectura que la cinta de días, sacada del componente para que la
   portada del cliente diga exactamente la misma dieta que su pantalla. */
describe('dietaDeHoy', () => {
  const alto = {
    id: 'a',
    name: 'Alto',
    targets: { targetKcals: 3100 },
    meals: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }],
  };
  const bajo = { id: 'b', name: 'Bajo', targets: { proteinGrams: 190, carbsGrams: 300, fatsGrams: 68 }, meals: [] };
  const semanales = WEEK_DAYS.map((dia) => ({ key: dia, corto: dia.slice(0, 3) }));
  const plan = (week) => ({ ...emptyNutrition(), days: [alto, bajo], week });

  /* Un sábado de verdad: 12 de septiembre de 2026. La fecha entra por parámetro
     justo para que esto no dependa del día en que se corran las pruebas. */
  const SABADO = '2026-09-12';

  it('devuelve la dieta de la casilla de hoy, con su cifra y sus comidas', () => {
    const hoy = dietaDeHoy(plan({ Sábado: 'a' }), semanales, SABADO);
    expect(hoy).toEqual({ id: 'a', name: 'Alto', kcal: 3100, comidas: 4, unica: false });
  });

  /* Las kcal pueden no estar escritas y salir de los macros: las dos cosas son
     lo que le han puesto. (190×4 + 300×4 + 68×9 = 2.572) */
  it('sin kcal escritas, la cifra sale de los macros', () => {
    expect(dietaDeHoy(plan({ Sábado: 'b' }), semanales, SABADO).kcal).toBe(2572);
  });

  it('sin reparto y con VARIAS dietas no dice nada: elegir una sería inventar', () => {
    expect(dietaDeHoy(plan({}), semanales, SABADO)).toBe(null);
  });

  /* Con una sola dieta no hay nada que repartir: hoy come lo que come todos los
     días. Es la mayoría de los planes, y su portada se quedaba muda. */
  it('con una sola dieta contesta sin reparto', () => {
    const unica = { ...emptyNutrition(), targetKcals: 2400, closedMeals: [{ id: 'm1' }, { id: 'm2' }] };
    expect(dietaDeHoy(unica, semanales, SABADO)).toEqual({
      id: 'default',
      name: 'Dieta única',
      kcal: 2400,
      comidas: 2,
      unica: true,
    });
  });

  /* Y tampoco depende del tipo de ciclo: quien entrena por vueltas de cinco
     días también sabe qué come si solo tiene una dieta. */
  it('con una sola dieta contesta también en un ciclo rotativo', () => {
    const rotativas = ['1', '2', '3'].map((key) => ({ key, corto: `D${key}` }));
    const unica = { ...emptyNutrition(), targetKcals: 2400 };
    expect(dietaDeHoy(unica, rotativas, SABADO)?.kcal).toBe(2400);
  });

  /* Un plan recién creado tiene un día, y ese día no es una respuesta: la fila
     diría «Tu dieta · 0 comidas» y llevaría a una pantalla en blanco. */
  it('una dieta sin cifra y sin comidas no es una respuesta', () => {
    expect(dietaDeHoy(emptyNutrition(), semanales, SABADO)).toBe(null);
    expect(dietaDeHoy(null, semanales, SABADO)).toBe(null);
  });

  /* En un rotativo no hay «sábado»: hay un día 3 de cinco que cae donde caiga
     según cuándo empezó la vuelta, y esa fecha no se guarda en ninguna parte. */
  it('en un ciclo rotativo se calla', () => {
    const rotativas = ['1', '2', '3'].map((key) => ({ key, corto: `D${key}` }));
    expect(dietaDeHoy(plan({ 1: 'a', 2: 'b', 3: 'b' }), rotativas, SABADO)).toBe(null);
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

  /* La avería del 17 de septiembre: poner 1600 kcal sin tocar los macros
     mandaba `''` a tres columnas `numeric` y Postgres tumbaba la fila entera
     con «invalid input syntax for type numeric». El objetivo no se guardaba. */
  it('un macro en blanco se guarda como null y no como cadena vacía', () => {
    const out = setDayTargets(emptyNutrition(), 'default', {
      targetKcals: '1600',
      proteinGrams: '',
      carbsGrams: '',
      fatsGrams: '',
    });
    expect(out.targetKcals).toBe('1600');
    expect(out.proteinGrams).toBe(null);
    expect(out.carbsGrams).toBe(null);
    expect(out.fatsGrams).toBe(null);
  });

  it('el objetivo del día viaja con el día al leerlo', () => {
    const con = setDayTargets(emptyNutrition(), 'default', { fiberGrams: 30, saltGrams: 5 });
    const leido = targetsFor(con, con.days[0].id);
    expect(leido.fiberGrams).toBe(30);
    expect(leido.saltGrams).toBe(5);
  });
});

/* ══ DE QUÉ ESTÁ HECHO SU PLAN ═══════════════════════════════════════════════
   La cuenta que alimenta las tres cosas que la pantalla de la dieta dice del
   reparto: la letra de cada casilla, las tarjetas de «Tus dietas» y la línea de
   debajo del mando. Escritas por separado se contradecían. */
describe('repartoDelCiclo', () => {
  const alto = { id: 'a', name: 'Alto', targets: { targetKcals: 3100, proteinGrams: 190 }, meals: [] };
  const bajo = { id: 'b', name: 'Bajo', targets: { targetKcals: 2600 }, meals: [] };
  const semanales = WEEK_DAYS.map((dia) => ({ key: dia, corto: dia.slice(0, 3) }));
  const plan = (week) => ({ ...emptyNutrition(), days: [alto, bajo], week });

  it('cada dieta con cuántas casillas le tocan y cuáles', () => {
    const out = repartoDelCiclo(plan({ Lunes: 'a', Sábado: 'a', Martes: 'b' }), semanales);
    expect(out.map((d) => [d.name, d.dias])).toEqual([
      ['Alto', 2],
      ['Bajo', 1],
    ]);
    expect(out[0].casillas).toEqual(['Lun', 'Sáb']);
    expect(out[0].kcal).toBe(3100);
    expect(out[0].targets.proteinGrams).toBe(190);
  });

  /* Una dieta montada y sin repartir no le toca nunca, y eso es exactamente lo
     que hay que poder decir para no buscarla en la semana. */
  it('sin reparto, todas salen con cero casillas', () => {
    expect(repartoDelCiclo(plan({}), semanales).map((d) => d.dias)).toEqual([0, 0]);
  });

  /* Un reparto que apunta a un día borrado no cuenta: `cycleMap` ya lo sanea al
     leer, y aquí no puede reaparecer por la puerta de atrás. */
  it('una casilla que apunta a un día que ya no existe no cuenta', () => {
    expect(repartoDelCiclo(plan({ Lunes: 'fantasma' }), semanales).map((d) => d.dias)).toEqual([0, 0]);
  });
});

/* ══ LA LETRA DE CADA DÍA ════════════════════════════════════════════════════
   Sustituye a la muesca que marcaba «los altos»: con tres dietas, una marca de
   dos estados miente. El nombre lo escribe el entrenador, así que la sigla tiene
   que salir bien de cualquier cosa que escriba. */
describe('siglasDeDietas', () => {
  const de = (...nombres) => siglasDeDietas(nombres.map((name, i) => ({ id: String(i), name })));

  it('la inicial cuando basta', () => {
    expect(Object.values(de('Alto', 'Medio', 'Bajo'))).toEqual(['A', 'M', 'B']);
  });

  /* El caso que la inicial a secas no aguanta, y es un nombre de lo más normal:
     «Día alto» y «Día bajo» darían D y D los siete días. */
  it('se fija en la ÚLTIMA palabra, que es donde está la distinción', () => {
    expect(Object.values(de('Día alto', 'Día bajo'))).toEqual(['A', 'B']);
    expect(Object.values(de('Días de entreno', 'Días de descanso'))).toEqual(['E', 'D']);
  });

  it('se alarga hasta que dejan de chocar', () => {
    expect(Object.values(de('Carga', 'Cardio'))).toEqual(['Carg', 'Card']);
  });

  /* Dos dietas que se llaman igual no se distinguen por su nombre. El número no
     dice nada, pero tampoco miente. */
  it('con nombres iguales, se numeran', () => {
    expect(Object.values(de('Alto', 'Alto'))).toEqual(['1', '2']);
    expect(Object.values(de('', ''))).toEqual(['1', '2']);
  });
});


/* ══════════════════════════════════════════════════════════════════════════
   QUITAR UNA FILA: el último recurso del reajuste
   ══════════════════════════════════════════════════════════════════════════

   Sale de la comida 4 de un cliente de verdad (14 sep 2026): patata, tres
   huevos, brócoli y aguacate contra 562 kcal y 15 g de grasa. Los huevos ponen
   16 g de grasa ellos solos y se cuentan por unidades, así que la pasada se
   planta y la opción se quedaba en 758 kcal sin mover un gramo.

   ── Cada freno tiene su fixture, y no vale reciclar ────────────────────────
   La primera versión de estas pruebas pasaba entera con los frenos QUITADOS:
   el menú de arriba ya no daba candidatas por otras razones, así que «nunca el
   plato principal» no probaba nada. Cada `it` de aquí abajo está construido
   para que el guardia que vigila sea el ÚNICO que puede parar esa fila, y se
   ha comprobado quitándolo del dominio y viendo caer la prueba.              */
describe('rescaleMeals · quitar una fila', () => {
  /* Los macros se escriben por ración y la ayuda los pasa a «por 100», que es
     como se leen en la pantalla del entrenador. */
  const f = (name, grams, p, c, g, extra = {}) => ({
    id: name,
    name,
    grams,
    proteinPer100: (p / grams) * 100,
    carbsPer100: (c / grams) * 100,
    fatsPer100: (g / grams) * 100,
    ...extra,
  });

  const HUEVO = { showAs: 'units', unitLabel: 'ud', unitGrams: 55 };
  const META = { protein: 28, carbs: 79, fats: 15 };

  const ajustar = (foods, { target = META, ...opciones } = {}) =>
    rescaleMeals([{ id: 'm4', name: 'Comida 4', target, options: [{ id: 'o1', foods }] }], {
      objetivo: target,
      ...opciones,
    });
  const quitadas = (res) => (res?.cambios || []).filter((c) => c.quitar).map((c) => c.food);

  const laDeAntonio = (extra = {}) => [
    f('Patata', 375, 8, 64, 0),
    f('Huevo', 165, 21, 1, 16, HUEVO),
    f('Brócoli', 100, 3, 4, 0),
    f('Aguacate', 120, 2, 10, 18, extra),
  ];

  /* ── Lo que hace ─────────────────────────────────────────────────────────── */

  it('quita el aguacate cuando ningún gramaje cuadra la opción', () => {
    const antes = optionMacros({ foods: laDeAntonio() });
    expect(Math.round(antes.kcal)).toBe(758);
    expect(Math.round(antes.fats)).toBe(34);

    const res = ajustar(laDeAntonio());
    expect(quitadas(res)).toEqual(['Aguacate']);

    /* Y la fila se va de verdad del menú que se va a guardar, no solo de la
       lista: el que llega a `EditarObjetivo` es este. */
    const despues = res.meals[0].options[0];
    expect(despues.foods.map((x) => x.name)).toEqual(['Patata', 'Huevo', 'Brócoli']);
    /* La grasa entra en su sitio y el resto de la opción absorbe lo que el
       aguacate dejaba de poner. */
    expect(Math.round(optionMacros(despues).fats)).toBe(16);
    expect(Math.round(optionMacros(despues).kcal)).toBe(592);
  });

  it('el renglón dice de dónde sale y que se quita, no «a 0 g»', () => {
    const fila = (ajustar(laDeAntonio()).cambios || []).find((c) => c.food === 'Aguacate');
    expect(fila).toMatchObject({ meal: 'Comida 4', option: 1, from: 120, to: 0, quitar: true });
  });

  /* ── Los frenos: una comida tiene una estructura ─────────────────────────── */

  /* El freno que solo salió al medirlo: sin él, a esta comida —a la que le sobra
     GRASA— el reparador le quitaba el pan. El pan no pone grasa; quitarlo
     cuadraba la proteína de rebote y la patata crecía para tapar los hidratos.
     La cuenta salía y el renglón era inexplicable. */
  it('solo quita lo que lleva el macro atascado, no lo que mueve el marcador', () => {
    const conPan = [
      f('Patata', 300, 6, 51, 0),
      f('Aceite', 28, 0, 0, 28),
      f('Huevo', 165, 21, 1, 16, HUEVO),
      f('Pan', 60, 5, 30, 1),
    ];
    expect(quitadas(ajustar(conPan))).not.toContain('Pan');
  });

  /* Cuatro filas parejas para que la más grande NO llegue a un tercio de la
     opción: así el único guardia que puede parar el aceite es el de «nunca la
     mayor». Quitarlo dejaría la grasa en 17 sobre 15, que cuadra. */
  it('nunca la fila más grande, aunque quitarla cuadrara la comida', () => {
    const conAceiteGrande = [
      f('Aceite', 28, 0, 0, 28),
      f('Huevo', 165, 21, 1, 16, HUEVO),
      f('Patata', 300, 6, 51, 0),
      f('Pan', 60, 5, 30, 1),
    ];
    expect(quitadas(ajustar(conAceiteGrande))).toEqual([]);
  });

  /* Y la segunda más grande tampoco, si se come un tercio de la comida: el
     aceite son 288 kcal de 855, justo por encima del tercio. */
  it('nunca una fila que sea un tercio de la opción', () => {
    const conAceiteGordo = [
      f('Patata', 400, 8, 68, 0),
      f('Aceite', 32, 0, 0, 32),
      f('Huevo', 165, 21, 1, 16, HUEVO),
      f('Brócoli', 100, 3, 4, 0),
    ];
    expect(quitadas(ajustar(conAceiteGordo))).toEqual([]);
  });

  it('nunca lo que se cuenta por unidades: tres huevos no son dos', () => {
    /* Sin aguacate la grasa se pasa igual —16 sobre 15— y el único sitio de
       donde saldría es el huevo. No se toca. */
    const sinAguacate = laDeAntonio().filter((x) => x.name !== 'Aguacate');
    expect(quitadas(ajustar([...sinAguacate, f('Tomate', 100, 1, 4, 0)]))).toEqual([]);
  });

  it('nunca una fila marcada «no la muevas»', () => {
    expect(quitadas(ajustar(laDeAntonio({ fijo: true })))).toEqual([]);
  });

  it('nunca una fila que has apartado tú en la vista previa', () => {
    const quietos = new Set([claveDelCambio('Comida 4', 1, 'Aguacate')]);
    expect(quitadas(ajustar(laDeAntonio(), { quietos }))).toEqual([]);
  });

  it('escribirle un gramaje cancela la propuesta', () => {
    const fijados = new Map([[claveDelCambio('Comida 4', 1, 'Aguacate'), '60']]);
    const res = ajustar(laDeAntonio(), { fijados });
    expect(quitadas(res)).toEqual([]);
    expect(res.meals[0].options[0].foods.find((x) => x.name === 'Aguacate').grams).toBe(60);
  });

  /* Pollo fijo y aceite: el aceite es una cuarta parte de la comida y no es la
     fila mayor, así que pasa los dos guardias del tamaño. Quitarlo dejaría la
     grasa en 9 sobre 9 — y la comida en un alimento. */
  it('con dos alimentos no se quita nada: lo que queda es media comida', () => {
    const dos = [f('Pollo', 300, 60, 0, 9, { fijo: true }), f('Aceite', 12, 0, 0, 12)];
    expect(quitadas(ajustar(dos, { target: { protein: 60, carbs: 3, fats: 9 } }))).toEqual([]);
  });

  it('lo que cuadra no pierde nada', () => {
    /* Una opción dentro del margen no da candidatas: no hay macro atascado al
       que señalar. Reposo es no tocar lo que cuadra. */
    const cuadrada = [
      f('Arroz', 100, 8, 79, 1),
      f('Pollo', 90, 20, 0, 2),
      f('Aceite', 13, 0, 0, 13),
      f('Lechuga', 50, 1, 1, 0),
    ];
    expect(quitadas(ajustar(cuadrada) || { cambios: [] })).toEqual([]);
  });

  /* ── Y cómo elige ────────────────────────────────────────────────────────── */

  /* Seis huevos ponen 32 g de grasa sobre 15 pautados: quitar el aceite deja la
     opción en 32, que sigue fuera. Quitar por quitar no arregla nada, así que no
     se quita. */
  it('no quita si con eso la opción no mejora', () => {
    const sinArreglo = [
      f('Patata', 400, 8, 68, 0),
      f('Huevo', 330, 42, 2, 32, HUEVO),
      f('Aceite', 10, 0, 0, 10),
    ];
    expect(quitadas(ajustar(sinArreglo))).toEqual([]);
  });

  /* Dos macros atascados y una salida para cada uno: el pan está fijo y ya pone
     los 100 g de hidratos, así que la miel sobra; el huevo va por unidades y ya
     pone los 16 g de grasa, así que el aceite sobra. Quitar cualquiera de los
     dos arregla UNA cosa, y se quita solo uno — el más pequeño, que es la miel
     por ocho kilocalorías. */
  it('una por opción, y en empate la más pequeña', () => {
    const dosSalidas = [
      f('Pan', 200, 0, 100, 0, { fijo: true }),
      f('Huevo', 165, 21, 1, 16, HUEVO),
      f('Aceite', 8, 0, 0, 8),
      f('Miel', 20, 0, 16, 0),
    ];
    const res = ajustar(dosSalidas, { target: { protein: 21, carbs: 100, fats: 16 } });
    expect(quitadas(res)).toEqual(['Miel']);
  });

  it('se prueba fila a fila: gana la que más arregla, no la más pequeña', () => {
    /* El brócoli es más pequeño que el aguacate y quitarlo no arregla la grasa,
       así que pierde. */
    expect(quitadas(ajustar(laDeAntonio()))).toEqual(['Aguacate']);
  });

  /* ── Y el ensayo se hace con la opción sola ──────────────────────────────── */

  /* La suposición sobre la que se apoya el atajo del ensayo: con el objetivo en
     la comida, una opción se ajusta contra SU meta y nada más. Si eso dejara de
     ser cierto, el reparador decidiría mirando un menú de mentira. Así que se
     comprueba de la única forma que no depende de cómo esté escrito por dentro:
     el mismo menú entero y comida a comida tienen que decidir lo mismo.

     Sin el atajo esto tardaba 173 ms por tecleo con estas cinco comidas —corre
     en un `useMemo` mientras se escribe el objetivo—, y con él, cinco. */
  it('decide lo mismo con el menú entero que comida a comida', () => {
    const cinco = [1, 2, 3, 4, 5].map((n) => ({
      id: `m${n}`,
      name: `Comida ${n}`,
      target: META,
      options: [1, 2].map((o) => ({
        id: `m${n}-o${o}`,
        foods: laDeAntonio().map((x) => ({ ...x, grams: Math.round(x.grams * (o === 1 ? 1 : 0.9)) })),
      })),
    }));

    const juntas = rescaleMeals(cinco, { objetivo: META });
    const sueltas = cinco.flatMap((meal) =>
      (rescaleMeals([meal], { objetivo: META })?.cambios || []).filter((c) => c.quitar)
    );

    const llave = (c) => `${c.meal}·${c.option}·${c.food}`;
    expect((juntas?.cambios || []).filter((c) => c.quitar).map(llave).sort()).toEqual(
      sueltas.map(llave).sort()
    );
    /* Y que no sea una lista vacía comparada con otra vacía. */
    expect(sueltas.length).toBe(10);
  });
});
