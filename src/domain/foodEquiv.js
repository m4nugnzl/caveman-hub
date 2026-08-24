/**
 * Equivalencias de alimentos: cambiar uno por otro de su grupo sin descuadrar.
 *
 * ══ Qué es una equivalencia aquí ═══════════════════════════════════════════
 *
 * La de toda la vida en consulta: «150 g de plátano ≈ 250 g de fresas». Cada
 * grupo de alimentos tiene UN macro que lo define —la fruta son hidratos, la
 * carne es proteína, el aceite es grasa— y dos alimentos del mismo grupo son
 * equivalentes cuando aportan los mismos gramos de ESE macro. La cuenta es una
 * regla de tres sobre los macros por 100 g que la dieta ya guarda:
 *
 *     gramos_B = gramos_A × macroPor100_A / macroPor100_B
 *
 * Los demás macros y las kcal no se igualan —no se puede igualar todo a la
 * vez— y por eso se enseñan: la diferencia es información, no un error.
 *
 * ══ De dónde sale el grupo de un alimento ══════════════════════════════════
 *
 * Del catálogo común, que es el único sitio con categorías. La entrada de una
 * dieta es una foto sin categoría, así que se resuelve POR NOMBRE con
 * `matchFood`, el mismo comparador que ya ata los nombres de una hoja
 * importada: «Plátano mediano» cae en el plátano y por tanto en la fruta. Si el
 * nombre no cae en ningún alimento del catálogo, no hay equivalencias — mejor
 * ninguna que las de un grupo adivinado.
 *
 * ══ El macro lo decide el GRUPO, no el alimento ════════════════════════════
 *
 * Se probó derivarlo de cada alimento (el macro que más kcal aporta) y rompe
 * los lácteos: la leche entera es «de grasas» y la desnatada «de hidratos», así
 * que dejarían de ser intercambiables entre sí, que es absurdo. El grupo dice
 * qué papel juega el alimento en la dieta, y ese papel es el que se conserva.
 *
 * ══ El filtro de cordura por kcal ══════════════════════════════════════════
 *
 * Igualar un solo macro puede disparar los otros dos: 150 g de plátano y el
 * aguacate comparten grupo, pero igualar sus hidratos son ~350 g de aguacate y
 * el cuádruple de kcal. Una equivalencia que multiplica las calorías no es una
 * equivalencia, así que lo que se sale del margen no se ofrece.
 */

import { norm } from '@/lib/texto';
import { toNum0 } from '@/lib/num';
import { matchFood } from './foodMatch';
import { foodMacros } from './nutrition';

/**
 * El macro que define cada grupo del catálogo (las categorías de la 0033).
 *
 * «Otros» no está a propósito: es el cajón de lo que no tiene grupo, y ofrecer
 * intercambios dentro de él sería equiparar cosas que solo comparten no tener
 * sitio. Los dulces sí: se prescriben como hidratos (el arroz inflado, la
 * mermelada) y cambiarlos entre sí por hidratos es exactamente lo que se hace.
 */
export const SWAP_MACRO = {
  Carne: 'protein',
  Pescado: 'protein',
  Huevos: 'protein',
  Lácteos: 'protein',
  Suplementos: 'protein',
  Fruta: 'carbs',
  Verdura: 'carbs',
  Cereales: 'carbs',
  Legumbres: 'carbs',
  Tubérculos: 'carbs',
  Dulces: 'carbs',
  'Frutos secos': 'fats',
  Grasas: 'fats',
};

const PER100 = { protein: 'proteinPer100', carbs: 'carbsPer100', fats: 'fatsPer100' };

/**
 * Por debajo de esto, el alimento apenas lleva el macro del grupo y la regla de
 * tres dispara raciones absurdas: igualar por hidratos contra la lechuga
 * (1,5 g/100 g) propone medio kilo de lechuga. Un alimento así no es un
 * intercambio del grupo aunque viva en él.
 */
const MIN_PER100 = 2;

/**
 * El margen del filtro de kcal. En proporción para las raciones normales, y
 * absoluto para las minúsculas: entre verduras de 15 y 25 kcal la proporción
 * es un 66 % «de error» y la diferencia real es la mitad de una zanahoria.
 *
 * El absoluto es PEQUEÑO a propósito. Empezó en 60 kcal y con eso una ración
 * chica lo pasaba todo: 10 g de cacao (37 kcal) daban por buenas equivalencias
 * de 7 a 90 kcal — la pantalla entera de despropósitos. 15 kcal cubren el caso
 * de las verduras, que es para lo que existe, y nada más.
 */
const KCAL_RATIO = 1.5;
const KCAL_SLACK = 15;

/**
 * Por debajo de esto no hay intercambio que hacer: 10 g de cacao llevan ~1 g de
 * hidratos, y «lo que iguala 1 g de hidratos» es cualquier miga de cualquier
 * cosa —0,7 galletas, 5 g de pizza—. Es una ración de CONDIMENTO, no una ración
 * del grupo, y la respuesta honesta es no ofrecer lista. El umbral son ~20 kcal
 * del macro: por debajo, la equivalencia importa menos que el redondeo.
 */
const MIN_MACRO_GRAMS = 5;

/* A un múltiplo de 5 g: «163 g de manzana» es una precisión que ninguna báscula
   de cocina se toma en serio, y el macro igualado se desvía menos de lo que ya
   se desvía la manzana de la tabla. */
const round5 = (grams) => Math.max(5, Math.round(grams / 5) * 5);

/** El grupo de un nombre, resuelto contra el catálogo. `null` si no cae. */
export const foodCategory = (name, catalog = []) =>
  matchFood(name, catalog).food?.category ?? null;

/**
 * Las equivalencias de una entrada de la dieta.
 *
 * @param entry    La entrada tal como vive en la comida (nombre, gramos y
 *                 macros por 100 g).
 * @param catalog  El catálogo común, que aporta grupos y candidatos.
 * @param library  La biblioteca del equipo. Manda sobre el catálogo cuando el
 *                 nombre se repite —la misma regla que `mergeCatalog`—: si el
 *                 entrenador ajustó los macros de «Manzana» a su marca, la
 *                 equivalencia se calcula con SUS números, no con los genéricos.
 * @returns `{ macro, category, macroGrams, items }` o `null` si no hay grupo,
 *   cantidad o densidad con los que calcular. Cada item es
 *   `{ food, grams, kcal }` con los gramos ya redondeados.
 */
export const equivalencesFor = (entry, catalog = [], library = [], { max = 12 } = {}) => {
  const grams = toNum0(entry?.grams);
  if (!grams || !entry?.name) return null;

  const category = foodCategory(entry.name, catalog);
  const macro = SWAP_MACRO[category];
  if (!macro) return null;

  const per100 = toNum0(entry[PER100[macro]]);
  if (per100 < MIN_PER100) return null;

  const macroGrams = (grams * per100) / 100;
  if (macroGrams < MIN_MACRO_GRAMS) return null;

  const srcKcal = foodMacros(entry).kcal;

  /* Lo tuyo tapa al catálogo por nombre. El grupo y la lista de candidatos los
     pone el catálogo —es quien los tiene—; los números, tu biblioteca. */
  const propios = new Map();
  for (const food of library) {
    const clave = norm(food?.name || '');
    if (clave && !propios.has(clave)) propios.set(clave, food);
  }

  const yo = norm(entry.name);
  const items = [];

  for (const candidato of catalog) {
    if (candidato?.category !== category) continue;
    const clave = norm(candidato.name || '');
    if (!clave || clave === yo) continue;

    const efectivo = propios.get(clave) || candidato;
    const suyo = toNum0(efectivo[PER100[macro]]);
    if (suyo < MIN_PER100) continue;

    const cuanto = round5((macroGrams * 100) / suyo);
    const kcal = foodMacros({ ...efectivo, grams: cuanto }).kcal;

    /* La cordura: mismo macro pero el triple de kcal no es un intercambio. */
    const ratio = srcKcal > 0 ? kcal / srcKcal : 1;
    if (Math.abs(kcal - srcKcal) > KCAL_SLACK && (ratio > KCAL_RATIO || ratio < 1 / KCAL_RATIO))
      continue;

    items.push({ food: efectivo, grams: cuanto, kcal: Math.round(kcal) });
  }

  if (items.length === 0) return null;

  /* Las más parecidas en kcal primero: son las que de verdad se cambian sin
     pensar, y las del borde del margen quedan al final, a la vista pero lejos. */
  items.sort((a, b) => Math.abs(a.kcal - srcKcal) - Math.abs(b.kcal - srcKcal));

  return {
    macro,
    category,
    macroGrams: Math.round(macroGrams),
    items: items.slice(0, max),
  };
};
