/**
 * Nutrición: macros objetivo y menú cerrado por alimentos.
 *
 * Estructura de una dieta cerrada:
 *   comida  → { id, name, options[] }
 *   opción  → { id, foods[] }          ← alternativas intercambiables
 *   alimento→ { id, name, grams, proteinPer100, carbsPer100, fatsPer100 }
 *
 * Las kcal y los macros NUNCA se teclean: se calculan desde gramos × macros
 * por 100 g, alimento a alimento.
 */

import { isBlank, round, toNum, toNum0 } from '@/lib/num';
import { newId } from '@/lib/ids';

/**
 * `hasDayVariants` activo ⇒ el cliente tiene dos dietas cerradas distintas
 * (entreno / descanso). Si no, hay una sola lista de comidas.
 */
export const VARIANT_KEY = {
  default: 'closedMeals',
  training: 'closedMealsTraining',
  rest: 'closedMealsRest',
};

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fats: 9 };

export const emptyNutrition = () => ({
  type: 'macros',
  targetKcals: null,
  proteinGrams: null,
  carbsGrams: null,
  fatsGrams: null,
  stepsGoal: '',
  /* La otra mitad del gasto. Del plan y no de la variante, igual que los pasos:
     un cliente con dos dietas no tiene dos cardios. */
  cardioGoal: '',
  habitsNotes: [],
  hasDayVariants: false,
  // Objetivo de los días de DESCANSO. Ver `targetsFor` más abajo.
  restTargets: null,
  closedMeals: [],
  closedMealsTraining: [],
  closedMealsRest: [],
});

export const TARGET_FIELDS = ['targetKcals', 'proteinGrams', 'carbsGrams', 'fatsGrams'];

/**
 * ¿Este plan está en blanco?
 *
 * ── Por qué hace falta distinguirlo de «no existe» ──────────────────────────
 * Que haya fila en `nutrition_plans` no significa que haya dieta: la fila nace en
 * cuanto se toca cualquier cosa de la pantalla, así que un cliente al que se le
 * activó y se le desactivó una opción tiene fila con todo a nulo.
 *
 * Y la diferencia importa justo donde se COPIA de un cliente a otro: copiar
 * SUSTITUYE, así que traerse un plan vacío no es una copia inocua, es borrarle la
 * dieta al destino. Sin esta comprobación, la única señal de que ha pasado es que
 * la pantalla del destino se queda en blanco.
 */
export const isEmptyDiet = (plan) => {
  if (!plan) return true;

  const sinObjetivo = TARGET_FIELDS.every((k) => plan[k] === null || plan[k] === undefined || plan[k] === '');
  const sinDescanso =
    !plan.restTargets ||
    TARGET_FIELDS.every((k) => plan.restTargets[k] === null || plan.restTargets[k] === undefined);

  return (
    sinObjetivo &&
    sinDescanso &&
    String(plan.stepsGoal || '').trim() === '' &&
    String(plan.cardioGoal || '').trim() === '' &&
    (plan.habitsNotes || []).length === 0 &&
    (plan.closedMeals || []).length === 0 &&
    (plan.closedMealsTraining || []).length === 0 &&
    (plan.closedMealsRest || []).length === 0
  );
};

/**
 * Objetivo calórico y de macros de una variante.
 *
 * ── Por qué hay dos ─────────────────────────────────────────────────────────
 * Activar "dos dietas (entreno / descanso)" no era solo tener dos listas de
 * comidas: en un día de descanso cambian las calorías y el reparto de macros,
 * que es justo el motivo de separarlos. Antes había un único objetivo para las
 * dos variantes, así que la cifra mostrada era incorrecta en uno de los dos días.
 *
 * Reparto: las columnas principales de la tabla guardan el objetivo de los días
 * de ENTRENO (o el único, si no hay variantes), y `restTargets` el de los días
 * de descanso. Si el de descanso no se ha configurado, se hereda el de entreno,
 * de modo que activar la opción nunca deja una cifra vacía.
 */
export const targetsFor = (nutrition, variant) => {
  const base = {
    targetKcals: nutrition?.targetKcals ?? null,
    proteinGrams: nutrition?.proteinGrams ?? null,
    carbsGrams: nutrition?.carbsGrams ?? null,
    fatsGrams: nutrition?.fatsGrams ?? null,
    stepsGoal: nutrition?.stepsGoal ?? '',
  };

  if (variant !== 'rest' || !nutrition?.hasDayVariants) return base;

  const rest = nutrition.restTargets || {};
  const hasAny = TARGET_FIELDS.some((key) => rest[key] !== null && rest[key] !== undefined && rest[key] !== '');
  if (!hasAny) return base;

  return {
    targetKcals: rest.targetKcals ?? base.targetKcals,
    proteinGrams: rest.proteinGrams ?? base.proteinGrams,
    carbsGrams: rest.carbsGrams ?? base.carbsGrams,
    fatsGrams: rest.fatsGrams ?? base.fatsGrams,
    stepsGoal: base.stepsGoal,
  };
};

/** Las dos variantes que hay que mostrar, según la configuración del plan. */
export const activeVariants = (nutrition) =>
  nutrition?.hasDayVariants
    ? [
        { id: 'training', label: 'Días de entreno' },
        { id: 'rest', label: 'Días de descanso' },
      ]
    : [{ id: 'default', label: 'Dieta única' }];

export const buildMeal = () => ({
  id: newId('meal'),
  name: 'Nueva Comida',
  // La pauta de esta comida y su objetivo: ver el bloque «La estructura del día».
  note: '',
  target: null,
  options: [{ id: newId('opt'), foods: [] }],
});

export const buildOption = () => ({ id: newId('opt'), foods: [] });

/**
 * Un alimento dentro de una opción de comida.
 *
 * ── Por qué copia los datos en vez de referenciar la biblioteca ─────────────
 * Ya lo hacía con las macros y ahora también con la unidad: la entrada es una
 * FOTO del alimento en el momento de añadirlo. Si el entrenador corrige mañana
 * los macros de «Pan integral» en su biblioteca, las dietas ya montadas no se
 * recalculan solas a espaldas de nadie.
 *
 * `grams` arranca en una unidad entera cuando el alimento tiene una. Añadir un
 * huevo y que aparezca «100 g» —casi dos huevos— obliga a corregirlo siempre; que
 * aparezca «1 huevo» acierta la mayoría de las veces.
 */
export const buildFoodEntry = (food, grams = null) => {
  const unitGrams = toNum0(food?.unitGrams) || null;
  const porDefecto = unitGrams || 100;

  return {
    id: newId('food'),
    name: food.name,
    grams: toNum0(grams) || porDefecto,
    proteinPer100: toNum0(food.proteinPer100),
    carbsPer100: toNum0(food.carbsPer100),
    fatsPer100: toNum0(food.fatsPer100),
    // `null` explícito y no ausente: distingue «este alimento se pesa» de «esta
    // entrada es antigua y no se sabe», que a efectos de pantalla son lo mismo
    // pero a efectos de depuración no.
    unitLabel: food.unitLabel ?? null,
    unitGrams,
    // Cómo se cuenta ESTA entrada. Empieza en unidades si las tiene, y el
    // entrenador puede cambiarlo por alimento y por dieta: hay clientes que
    // pesan todo y clientes que no tienen báscula.
    showAs: unitGrams ? 'units' : 'grams',
  };
};

/**
 * ¿Vale este macro por 100 g? Devuelve el error, o `null` si está bien.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Porque el alta de un alimento no comprobaba nada: lo que se tecleara acababa
 * en la biblioteca del equipo tal cual, y de ahí a todas las dietas que lo usen.
 * Un «13.5» escrito «135» multiplica por diez las calorías de esa comida y no
 * lo delata nada — la fila enseña un número grande, que es lo que enseñaría un
 * alimento graso de verdad.
 *
 * El tope de 100 no es una preferencia: **un alimento no puede llevar más de
 * 100 g de nada por cada 100 g**. El aceite, que es el extremo, lleva 100 de
 * grasa. Cualquier cifra por encima es un error de tecleo, siempre.
 *
 * En blanco vale y significa cero: casi ningún alimento tiene los tres macros, y
 * obligar a escribir «0» en dos de cada tres casillas es peor formulario.
 */
export const macroError = (value) => {
  if (isBlank(value)) return null;
  const n = toNum(value);
  if (n === null) return 'Solo números.';
  if (n < 0) return 'No puede ser negativo.';
  if (n > 100) return 'Máximo 100 por 100 g.';
  return null;
};

// ── Reordenar y duplicar ───────────────────────────────────────────────────

/**
 * Mueve un elemento de una lista a otra posición. Devuelve una lista nueva.
 *
 * ── Por qué está aquí y no repetido en cada acción ─────────────────────────
 * Porque hacen falta tres —comidas, alimentos y, si algún día se ordenan, las
 * alternativas— y la operación es idéntica. Es además la misma que `moveExercise`
 * hace sobre la rutina: el orden importa en las dos pantallas por el mismo
 * motivo, que es que la gente come y entrena EN UN ORDEN.
 *
 * Los índices fuera de rango devuelven la lista tal cual en vez de reventar: al
 * arrastrar, el índice de destino puede pasarse por uno al soltar en el borde.
 */
export const moveItem = (list, fromIndex, toIndex) => {
  const items = [...(list || [])];
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= items.length) return items;
  const [moved] = items.splice(fromIndex, 1);
  items.splice(Math.max(0, Math.min(items.length, toIndex)), 0, moved);
  return items;
};

/**
 * Copia una opción con identificadores NUEVOS.
 *
 * ── Por qué se regeneran los identificadores ───────────────────────────────
 * Porque si no, los dos alimentos copiados comparten `id` con los originales, y
 * `updateFoodGrams` busca por identificador: escribir 150 g en la alternativa B
 * los escribiría también en la A. React además usa esos `id` como `key`, así que
 * duplicados hacen que la lista se repinte mal.
 *
 * Es el mismo motivo por el que la rutina tiene `reidExercises`.
 */
export const cloneOption = (option) => ({
  id: newId('opt'),
  foods: (option?.foods || []).map((food) => ({ ...food, id: newId('food') })),
});

/**
 * Copia una comida entera, con todas sus alternativas.
 *
 * ── Por qué el nombre se marca, y cuándo no ────────────────────────────────
 * Duplicando DENTRO del mismo día, «(copia)» es necesario: dos comidas con el
 * mismo nombre en la misma lista son indistinguibles y el entrenador acaba
 * editando la que no era. Que salga marcada obliga a renombrarla, que es lo que
 * iba a hacer igualmente.
 *
 * Copiando a la OTRA variante —de días de entreno a días de descanso— no hay tal
 * ambigüedad: son dos listas distintas y «Desayuno» debe seguir llamándose
 * «Desayuno». De ahí `rename`.
 */
export const cloneMeal = (meal, { rename = true } = {}) => ({
  id: newId('meal'),
  name: rename ? `${meal?.name || 'Comida'} (copia)` : meal?.name || 'Comida',
  /* La pauta y el objetivo viajan con la comida. Son parte de lo que se copia:
     llevarse «Cena» al día de descanso sin su «que sea 2 h antes de dormir»
     dejaría media comida en el destino. */
  note: meal?.note || '',
  target: meal?.target ? { ...meal.target } : null,
  options: (meal?.options || []).map(cloneOption),
});

/** Un día entero de comidas, copiado tal cual y con identificadores nuevos. */
export const cloneMeals = (meals) => (meals || []).map((meal) => cloneMeal(meal, { rename: false }));

// ── Unidades ───────────────────────────────────────────────────────────────
//
// Los gramos son la verdad y la unidad es una lente encima (ver la migración
// 0030). Estas dos funciones son toda la conversión que existe, y por eso ningún
// cálculo de macros necesitó cambiar.

/** ¿Se PUEDE contar este alimento en piezas? (lo dice la biblioteca) */
export const hasUnits = (entry) => Boolean(entry?.unitLabel) && toNum0(entry?.unitGrams) > 0;

/**
 * ¿Se ESTÁ contando en piezas? (lo dice el entrenador, alimento a alimento)
 *
 * Separado de `hasUnits` a propósito: poder y querer son cosas distintas. Un
 * huevo siempre se puede contar en unidades, y aun así hay clientes que pesan
 * todo y a los que «110 g» les dice más que «2 huevos».
 *
 * Las entradas guardadas antes de que existiera el interruptor no tienen `showAs`
 * y caen en unidades, que es el motivo por el que se añadió todo esto.
 */
export const displayAsUnits = (entry) => hasUnits(entry) && entry?.showAs !== 'grams';

/**
 * Cuántas unidades son estos gramos. `null` si el alimento se pesa.
 *
 * Se redondea a un decimal porque media rebanada y medio huevo existen, y 0,37
 * huevos no. Como los gramos no se tocan, el redondeo es solo de lo que se
 * ENSEÑA: las macros se siguen calculando sobre el gramo exacto.
 */
export const foodUnits = (entry) => {
  if (!hasUnits(entry)) return null;
  return Math.round((toNum0(entry.grams) / toNum0(entry.unitGrams)) * 10) / 10;
};

/** Los gramos de N unidades, que es lo que se guarda al escribir en la casilla. */
export const gramsFromUnits = (entry, units) => {
  if (!hasUnits(entry)) return toNum0(units);
  return Math.round(toNum0(units) * toNum0(entry.unitGrams));
};

/**
 * «2 huevos», «1 rebanada», «1,5 cucharadas».
 *
 * El plural se hace añadiendo una «s» y solo funciona en castellano, que es el
 * único idioma de la aplicación. La alternativa —guardar singular y plural de
 * cada etiqueta— es el doble de campos para arreglar «lata»/«latas», y una
 * etiqueta que acabe en consonante («filet») la escribe el entrenador y la ve él.
 */
export const unitsLabel = (entry) => {
  const units = foodUnits(entry);
  if (units === null) return null;
  const nombre = units === 1 ? entry.unitLabel : `${entry.unitLabel}s`;
  return `${String(units).replace('.', ',')} ${nombre}`;
};

// ── Cálculos ───────────────────────────────────────────────────────────────

const kcalOf = ({ protein, carbs, fats }) =>
  protein * KCAL_PER_GRAM.protein + carbs * KCAL_PER_GRAM.carbs + fats * KCAL_PER_GRAM.fats;

/** Macros y kcal de UN alimento según sus gramos. */
export const foodMacros = (food) => {
  const factor = toNum0(food?.grams) / 100;
  const macros = {
    protein: toNum0(food?.proteinPer100) * factor,
    carbs: toNum0(food?.carbsPer100) * factor,
    fats: toNum0(food?.fatsPer100) * factor,
  };
  return { ...macros, kcal: kcalOf(macros) };
};

/** Macros y kcal de una OPCIÓN = suma de sus alimentos. */
export const optionMacros = (option) => {
  const totals = (option?.foods || []).reduce(
    (acc, f) => {
      const m = foodMacros(f);
      return {
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fats: acc.fats + m.fats,
      };
    },
    { protein: 0, carbs: 0, fats: 0 }
  );
  return { ...totals, kcal: kcalOf(totals) };
};

export const optionKcals = (option) => Math.round(optionMacros(option).kcal);

/**
 * Rango calórico de una comida entre su opción más ligera y la más pesada.
 *
 * Antes se mostraba `Math.max(...)` bajo la etiqueta "primera opción", que se
 * contradecían: el número era el de la opción más calórica, no el de la
 * primera. Ahora se devuelven los tres valores y la vista dice cuál muestra.
 */
export const mealKcalRange = (meal) => {
  const values = (meal?.options || []).map(optionKcals);
  if (values.length === 0) return { first: 0, min: 0, max: 0, varies: false };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { first: values[0], min, max, varies: min !== max };
};

/** Total del día tomando la PRIMERA opción de cada comida (la de referencia). */
export const dayKcals = (meals) =>
  (meals || []).reduce((sum, meal) => sum + mealKcalRange(meal).first, 0);

/** Rango del día entre elegir siempre la opción más ligera o la más pesada. */
export const dayKcalRange = (meals) =>
  (meals || []).reduce(
    (acc, meal) => {
      const r = mealKcalRange(meal);
      return { min: acc.min + r.min, max: acc.max + r.max };
    },
    { min: 0, max: 0 }
  );

/** Reparto calórico de los macros objetivo, para la barra de proporciones. */
export const macroSplit = (nutrition) => {
  const parts = {
    protein: toNum0(nutrition?.proteinGrams) * KCAL_PER_GRAM.protein,
    carbs: toNum0(nutrition?.carbsGrams) * KCAL_PER_GRAM.carbs,
    fats: toNum0(nutrition?.fatsGrams) * KCAL_PER_GRAM.fats,
  };
  const total = parts.protein + parts.carbs + parts.fats;
  return {
    ...parts,
    total,
    pct: total > 0
      ? {
          protein: round((parts.protein / total) * 100),
          carbs: round((parts.carbs / total) * 100),
          fats: round((parts.fats / total) * 100),
        }
      : { protein: 0, carbs: 0, fats: 0 },
  };
};

/**
 * Los tres macros con su color, en UN SOLO SITIO.
 *
 * ── Por qué estaba mal ──────────────────────────────────────────────────────
 * La tripleta estaba escrita cuatro veces —en la hoja de nutrición, en el
 * resumen, en analítica y aquí— y aquí con la paleta chillona anterior, ya sin
 * usar. Cuatro copias del mismo dato divergen: basta que alguien cambie una.
 *
 * Y la elección era mala: las grasas usaban `--data-teal`, que está a un paso del
 * verde de marca (`--accent`). El resultado es que «grasas» se leía como el color
 * de acento de la aplicación en lugar de como una serie más, y en los anillos y
 * las bandas apiladas competía con todo lo demás.
 *
 * Ahora la tripleta son tres tintes bien separados que además no colisionan con
 * ningún color de ESTADO —ni con el verde de acento, ni con el rojo de error, ni
 * con el ámbar de aviso—, que era la otra fuente de confusión:
 *
 *   proteína → magenta   (carne)
 *   carbos   → dorado    (cereal)
 *   grasas   → violeta   (el único hueco libre lejos del verde y del rojo)
 */
export const MACROS = [
  { key: 'protein', label: 'Proteína', short: 'P', color: 'var(--data-pink)' },
  { key: 'carbs', label: 'Carbos', short: 'C', color: 'var(--data-amber)' },
  { key: 'fats', label: 'Grasas', short: 'G', color: 'var(--data-violet)' },
];

export const macroColor = (key) => MACROS.find((m) => m.key === key)?.color || 'var(--data-slate)';

/** Nº de comidas configuradas, contando las dos variantes si están activas. */
export const mealsConfigured = (nutrition) =>
  nutrition?.hasDayVariants
    ? (nutrition.closedMealsTraining?.length || 0) + (nutrition.closedMealsRest?.length || 0)
    : nutrition?.closedMeals?.length || 0;

/** Lista de comidas activa según la variante seleccionada. */
export const mealsForVariant = (nutrition, variant) =>
  nutrition?.[VARIANT_KEY[variant] || VARIANT_KEY.default] || [];
/* ==========================================================================
   Las pautas del entrenador
   --------------------------------------------------------------------------
   Esto era `habitsNotes`: una lista de frases sueltas de una línea, pintadas
   con un ✓ delante. Servía para «bebe 2 L de agua al día» y para nada más.

   Pero lo que un entrenador necesita dejar escrito casi nunca es una regla
   suelta: es una explicación. «Teniendo en cuenta tu hipotiroidismo vamos a
   repartir los hidratos así, y estos dos días de la semana los subimos porque
   entrenas pierna». Eso no cabe en una línea, y sobre todo no se lee como una
   casilla: se lee como algo que te han escrito a ti.

   Así que la pauta pasa a tener TÍTULO y CUERPO, y el cuerpo conserva los saltos
   de línea. El título es opcional a propósito: sin él sigue valiendo para la
   frase corta de siempre, y con él una pauta larga se puede encontrar de un
   vistazo entre otras cinco.

   ── Por qué no es un concepto nuevo ─────────────────────────────────────────
   Porque tener «hábitos» y «pautas» por separado obligaría a decidir en cuál de
   los dos sitios va cada cosa cada vez, y la diferencia entre una frase corta y
   un párrafo no justifica dos apartados en la pantalla ni dos columnas.

   ── Sin migración ───────────────────────────────────────────────────────────
   Se sigue guardando en `habits_notes`, que es jsonb. Lo que había son cadenas
   sueltas y `dietNotes` las convierte al leerlas, así que ningún cliente pierde
   lo que tuviera escrito.
   ========================================================================== */

/** Tope de pautas. Suficiente para un plan completo; corta el copia y pega. */
export const MAX_NOTES = 12;
export const NOTE_TITLE_MAX = 80;
export const NOTE_BODY_MAX = 1500;

export const buildDietNote = () => ({ id: newId('nota'), title: '', body: '' });

/**
 * Las pautas de un plan, normalizadas.
 *
 * Acepta las dos formas: la vieja —una cadena por pauta— y la nueva. Una pauta
 * sin cuerpo se descarta: un título solo no dice nada y ocuparía sitio en la
 * pantalla del cliente sin contarle nada.
 */
export const dietNotes = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  /*
    El id de una nota sin id se deriva de su POSICIÓN, no de `newId()`.

    Esta función se llama en cada render, así que un id aleatorio sería distinto
    cada vez: React remontaría la lista entera —perdiendo el foco y lo que se
    estuviera escribiendo— y el editor no podría reconocer su propio borrador. Un
    id derivado de la posición es el mismo mientras la lista no cambie, que es
    exactamente lo que se necesita aquí.
  */
  const posicional = (i) => `nota-${i}`;

  for (const [i, item] of raw.entries()) {
    if (typeof item === 'string') {
      const body = item.trim().slice(0, NOTE_BODY_MAX);
      if (body) out.push({ id: posicional(i), title: '', body });
    } else if (item && typeof item === 'object') {
      const body = String(item.body || '').trim().slice(0, NOTE_BODY_MAX);
      if (!body) continue;
      out.push({
        id: String(item.id || '') || posicional(i),
        title: String(item.title || '').trim().slice(0, NOTE_TITLE_MAX),
        body,
      });
    }
    if (out.length >= MAX_NOTES) break;
  }
  return out;
};

/** Lo que se escribe en `habits_notes`. Las vacías no llegan a guardarse. */
export const notesToStorage = (notes) =>
  (notes || [])
    .filter((note) => String(note?.body || '').trim())
    .slice(0, MAX_NOTES)
    .map((note) => ({
      id: note.id,
      title: String(note.title || '').trim().slice(0, NOTE_TITLE_MAX),
      body: String(note.body).trim().slice(0, NOTE_BODY_MAX),
    }));

/* ==========================================================================
   La estructura del día
   --------------------------------------------------------------------------
   Montar una dieta cerrada empieza siempre igual: 2400 kcal repartidas en cinco
   comidas. Pero la aplicación solo conocía el total del día, así que ese reparto
   —que es la PRIMERA decisión que se toma— vivía en la cabeza del entrenador
   mientras iba metiendo alimentos, y solo se sabía si había acertado al sumar el
   día entero al final.

   Poner el objetivo por comida ANTES de llenarla convierte cada comida en un
   problema pequeño y cerrado: «aquí me caben 520 kcal y 40 g de proteína». El
   total del día deja de ser algo que se comprueba al final y pasa a ser algo que
   se reparte al principio.

   ── Por qué el objetivo vive EN la comida ───────────────────────────────────
   Y no en una lista aparte del plan. Porque si fueran dos listas habría que
   emparejarlas por nombre o por posición, y las dos formas se rompen igual: al
   renombrar «Comida» a «Almuerzo», o al reordenar. Dentro de la comida, el
   objetivo la sigue a donde vaya —incluso al copiarla al otro día—.
   ========================================================================== */

const TARGET_KEYS = ['kcals', 'protein', 'carbs', 'fats'];

/**
 * El objetivo de una comida, en números. `null` si no se ha puesto nada.
 *
 * ── Los hidratos en blanco son el resto, no un cero ─────────────────────────
 * La casilla de hidratos de la estructura del día casi nunca se rellena: ofrece
 * los gramos que cuadran la comida como sugerencia y el entrenador la deja pasar
 * porque el número que ve YA es el correcto. Pero solo era un texto de ayuda, así
 * que el objetivo se guardaba sin hidratos y todo el que lo leía —el anillo del
 * cliente, el más visible— enseñaba «C 0 g» y un reparto que no cuadraba con sus
 * propias kilocalorías.
 *
 * Se completa AQUÍ, en el sitio por el que pasan todos, y no escribiéndolo en la
 * casilla del entrenador: rellenar solo lo que alguien ha tocado sigue siendo
 * suyo, y así un plan antiguo se arregla sin tener que reabrirlo comida a comida.
 *
 * Quien quiera cero hidratos —una comida cetogénica— escribe un 0, que sí se
 * guarda y sí se respeta. En blanco significa «lo que sobre», que es lo que
 * significa en la cabeza de quien reparte un día.
 */
export const mealTarget = (meal) => {
  const raw = meal?.target;
  if (!raw || typeof raw !== 'object') return null;

  const out = {};
  let alguno = false;
  for (const key of TARGET_KEYS) {
    const value = toNum0(raw[key]);
    out[key] = value || 0;
    if (value) alguno = true;
  }
  if (!alguno) return null;

  /* `raw.carbs` en blanco, no `out.carbs` a cero: son cosas distintas y solo la
     primera es una casilla sin tocar. */
  if (!String(raw.carbs ?? '').trim()) out.carbs = carbsFromRest(out) ?? 0;

  return out;
};

/**
 * Lo que llevas repartido frente al objetivo del día.
 *
 * Es la cifra que hace útil el reparto: sin ella hay que sumar cinco comidas a
 * mano para saber si te has pasado. `left` puede ser negativo a propósito —pasarse
 * es información, y esconderla con un `Math.max` sería mentir—.
 */
export const mealTargetsTotal = (meals, dayTarget) => {
  const sum = { kcals: 0, protein: 0, carbs: 0, fats: 0 };
  let conObjetivo = 0;

  for (const meal of meals || []) {
    const target = mealTarget(meal);
    if (!target) continue;
    conObjetivo += 1;
    for (const key of TARGET_KEYS) sum[key] += target[key];
  }

  return {
    ...sum,
    meals: conObjetivo,
    left: toNum0(dayTarget) ? toNum0(dayTarget) - sum.kcals : null,
  };
};

/**
 * Los hidratos que faltan para cuadrar una comida.
 *
 * ── Por qué solo los hidratos ───────────────────────────────────────────────
 * Porque en la práctica son los que se ajustan. La proteína se fija por peso
 * corporal y las grasas por un mínimo; lo que sobra de calorías se rellena con
 * hidratos, siempre. Calcular al revés —«dime hidratos y grasas y te digo la
 * proteína»— sería técnicamente igual y no es lo que hace nadie.
 *
 * Devuelve `null` cuando no hay con qué calcular, y CERO cuando la proteína y la
 * grasa ya se comen las calorías: pasarse es un dato, y esconderlo detrás de un
 * hueco vacío haría que el entrenador no se enterara de que su reparto no cabe.
 */
export const carbsFromRest = ({ kcals, protein, fats }) => {
  const total = toNum0(kcals);
  if (!total) return null;

  const resto =
    total - toNum0(protein) * KCAL_PER_GRAM.protein - toNum0(fats) * KCAL_PER_GRAM.fats;
  return Math.max(0, Math.round(resto / KCAL_PER_GRAM.carbs));
};

/**
 * Lo que hay en CADA opción frente al objetivo de la comida.
 *
 * ── Por qué todas y no solo la primera ──────────────────────────────────────
 * La primera opción es la que cuenta para el total del día, así que sería la
 * candidata obvia a ser la única medida.
 *
 * Pero las alternativas existen para ser intercambiables, y eso solo se cumple
 * si se parecen: una opción B que se va 300 kcal por encima de la A no es una
 * alternativa, es otra comida. Sin verlo opción a opción, el día cuadra con la
 * primera y descuadra en cuanto el cliente elige otra.
 *
 * Y da los CUATRO valores, no solo las kilocalorías: dos opciones pueden coincidir
 * en calorías y llevar 40 g de proteína de diferencia, que es exactamente el
 * error que no se ve mirando un único número.
 */
export const optionGaps = (meal) => {
  const target = mealTarget(meal);
  if (!target) return [];

  return (meal?.options || []).map((option, index) => {
    const actual = optionMacros(option);
    const diff = {
      kcals: Math.round(actual.kcal) - target.kcals,
      protein: Math.round(actual.protein) - target.protein,
      carbs: Math.round(actual.carbs) - target.carbs,
      fats: Math.round(actual.fats) - target.fats,
    };
    return {
      index,
      id: option.id,
      target,
      actual,
      diff,
      // Margen del 5 %: cuadrar al kilocaloría exacta
      // con alimentos reales no es posible, y un aviso que nunca se apaga se
      // deja de mirar.
      tone:
        target.kcals === 0
          ? 'none'
          : Math.abs(diff.kcals) <= target.kcals * 0.05
            ? 'ok'
            : diff.kcals > 0
              ? 'over'
              : 'under',
    };
  });
};
