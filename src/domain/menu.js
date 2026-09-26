import { toNum } from '@/lib/num';
import { buildFoodEntry, buildMeal, buildOption, cloneMeal, cloneOption, displayAsUnits, moveItem } from './nutrition';

/**
 * EL MENÚ DE UN DÍA, SUS VERBOS (letra e, 26 sep 2026).
 *
 * Cada gesto sobre un menú —la lista de comidas de un día— como una función
 * pura: recibe las comidas y devuelve las nuevas. Los usan los dos sitios que
 * editan menús:
 *
 *   · la dieta del cliente (`operacionesDeLaDieta`), que además guarda;
 *   · el menú de una variación (`VentanaDeVariacion`), que lo edita en memoria
 *     hasta «Guardar».
 *
 * Antes eran dos copias (`useNutrition` y `editarMenu` en variaciones.js) que
 * decían lo mismo con palabras distintas; la segunda nació para no tocar la
 * primera. Un solo sitio para la regla —una comida no se queda sin
 * alternativas, un objetivo a cero es «sin objetivo»— y ninguna de las dos
 * pantallas puede divergir de la otra sin querer.
 *
 * Los índices son el camino: comida (`i`), alternativa (`o`), y el alimento
 * por su `id`.
 */

/** Cambia UNA alternativa de UNA comida. */
const enOpcion = (meals, i, o, cambio) =>
  meals.map((m, k) =>
    k !== i ? m : { ...m, options: m.options.map((op, j) => (j !== o ? op : { ...op, ...cambio(op) })) }
  );

/** Cambia UNA comida. */
const enComida = (meals, i, cambio) => meals.map((m, k) => (k === i ? { ...m, ...cambio(m) } : m));

export const menu = {
  // ── Las comidas ──────────────────────────────────────────────────────────
  /** Una comida al final: la que se pasa, o una en blanco. */
  anadirComida: (meals, comida = buildMeal()) => [...meals, comida],
  quitarComida: (meals, i) => meals.filter((_, k) => k !== i),
  /** El inverso de quitarla: vuelve a su sitio. */
  restaurarComida: (meals, i, comida) => {
    const next = [...meals];
    next.splice(Math.max(0, Math.min(i, next.length)), 0, comida);
    return next;
  },
  /** El inverso de pegar: quita por id las que se pusieron, estén donde estén. */
  quitarComidasPorId: (meals, ids) => {
    const fuera = new Set(ids || []);
    return meals.filter((m) => !fuera.has(m.id));
  },
  /** Detrás de la original, con ids nuevos y «(copia)». */
  duplicarComida: (meals, i) => {
    const source = meals[i];
    if (!source) return meals;
    const next = [...meals];
    next.splice(i + 1, 0, cloneMeal(source));
    return next;
  },
  moverComida: (meals, de, a) => moveItem(meals, de, a),
  renombrarComida: (meals, i, name) => enComida(meals, i, () => ({ name })),
  notaDeComida: (meals, i, note) => enComida(meals, i, () => ({ note })),
  /** Un objetivo que se queda entero a cero es `null`: «sin objetivo», no «cero kcal». */
  objetivoDeComida: (meals, i, campo, valor) =>
    enComida(meals, i, (m) => {
      const target = { ...(m.target || {}), [campo]: valor };
      const vacio = Object.values(target).every((v) => v === '' || v === null || Number(v) === 0);
      return { target: vacio ? null : target };
    }),
  /** El candado de la comida: no se mueve aunque cambie el objetivo del día. */
  alternarFija: (meals, i) => enComida(meals, i, (m) => ({ fijo: !m.fijo })),

  // ── Las alternativas ─────────────────────────────────────────────────────
  anadirOpcion: (meals, i) => enComida(meals, i, (m) => ({ options: [...m.options, buildOption()] })),
  renombrarOpcion: (meals, i, o, name) => enOpcion(meals, i, o, () => ({ name })),
  /** Todas de una vez. Una comida siempre tiene al menos una: una lista vacía no se escribe. */
  ponerOpciones: (meals, i, options) =>
    meals.map((m, k) => (k !== i || !options?.length ? m : { ...m, options })),
  /** Nunca la última: una comida sin alternativas no tiene nada que leer. */
  quitarOpcion: (meals, i, o) =>
    meals.map((m, k) =>
      k !== i || m.options.length <= 1 ? m : { ...m, options: m.options.filter((_, j) => j !== o) }
    ),
  /** Detrás de la que se copia, no al final: es donde se espera encontrarla. */
  duplicarOpcion: (meals, i, o) =>
    meals.map((m, k) => {
      if (k !== i) return m;
      const source = m.options[o];
      if (!source) return m;
      const options = [...m.options];
      options.splice(o + 1, 0, cloneOption(source));
      return { ...m, options };
    }),

  // ── Los alimentos ────────────────────────────────────────────────────────
  /** `grams: null` deja elegir a `buildFoodEntry`: una unidad si la tiene, 100 g si se pesa. */
  anadirAlimento: (meals, i, o, food, grams = null) =>
    enOpcion(meals, i, o, (op) => ({ foods: [...(op.foods || []), buildFoodEntry(food, grams)] })),
  /** Varias entradas ya construidas (un plato): quien llama sabe sus ids. */
  anadirAlimentos: (meals, i, o, entries = []) =>
    enOpcion(meals, i, o, (op) => ({ foods: [...(op.foods || []), ...entries] })),
  quitarAlimento: (meals, i, o, foodId) =>
    enOpcion(meals, i, o, (op) => ({ foods: (op.foods || []).filter((f) => f.id !== foodId) })),
  /** El inverso de quitarlo: vuelve a su sitio. */
  restaurarAlimento: (meals, i, o, food, idx) =>
    enOpcion(meals, i, o, (op) => {
      const foods = [...(op.foods || [])];
      foods.splice(Math.max(0, Math.min(idx, foods.length)), 0, food);
      return { foods };
    }),
  moverAlimento: (meals, i, o, de, a) => enOpcion(meals, i, o, (op) => ({ foods: moveItem(op.foods || [], de, a) })),
  /** Cambia UN alimento: `parche(actual)` devuelve los campos nuevos. */
  cambiarAlimento: (meals, i, o, foodId, parche) =>
    enOpcion(meals, i, o, (op) => ({
      foods: (op.foods || []).map((f) => (f.id === foodId ? { ...f, ...parche(f) } : f)),
    })),
};

/*
  Los cambios de UN alimento, como parches para `menu.cambiarAlimento`. Son los
  campos, no el recorrido: el recorrido es siempre el mismo.
*/
export const parcheDeAlimento = {
  gramos: (grams) => () => ({ grams: toNum(grams) ?? 0 }),
  mostrarComo: (mode) => () => ({ showAs: mode === 'units' ? 'units' : 'grams' }),
  /** Solo se guarda el apagado; lo demás es el estado natural. */
  equivalencias: (visible) => () => ({ equivHidden: visible ? null : true }),
  /** Solo se guarda el encendido. */
  fijo: (fijo) => () => ({ fijo: fijo ? true : null }),
  /**
   * La ficha corregida con el lápiz (macros y unidad). Sin unidad se ve en
   * gramos; si antes ya tenía unidad se respeta cómo se veía; si la estrena,
   * pasa a verse en unidades.
   */
  ficha: (cambios) => (actual) => ({
    ...cambios,
    showAs: !cambios.unitGrams ? 'grams' : actual.unitGrams ? actual.showAs : 'units',
  }),
  /**
   * Otro alimento en el mismo sitio: la foto entera (nombre, macros, unidad y
   * gramos), sin arrastrar claves de otro dominio (`category`, `fromCatalog`).
   */
  sustituto: (entry) => () => ({
    name: entry.name,
    grams: toNum(entry.grams) ?? 0,
    proteinPer100: entry.proteinPer100,
    carbsPer100: entry.carbsPer100,
    fatsPer100: entry.fatsPer100,
    unitLabel: entry.unitLabel ?? null,
    unitGrams: entry.unitGrams ?? null,
    /* Lo que se VE (`displayAsUnits`): una entrada antigua sin `showAs` se veía
       en unidades, y con la clave a secas volvería en gramos. */
    showAs: displayAsUnits(entry) ? 'units' : 'grams',
  }),
};
