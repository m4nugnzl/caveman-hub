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

import { toNum0, round } from '@/lib/num';
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
  options: [{ id: newId('opt'), foods: [] }],
});

export const buildOption = () => ({ id: newId('opt'), foods: [] });

export const buildFoodEntry = (food, grams = 100) => ({
  id: newId('food'),
  name: food.name,
  grams: toNum0(grams) || 100,
  proteinPer100: toNum0(food.proteinPer100),
  carbsPer100: toNum0(food.carbsPer100),
  fatsPer100: toNum0(food.fatsPer100),
});

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