/**
 * TUS PLATOS: las raciones que has guardado con nombre.
 *
 * ══ La idea, y por qué faltaba el objeto ═══════════════════════════════════
 *
 * **Nadie pauta «avena».** Se pauta *80 g de avena con 200 ml de leche y un
 * plátano*, y eso tiene nombre propio: «mi desayuno de definición». La unidad
 * con la que se prescribe una dieta es la RACIÓN, no el alimento — y hasta hoy
 * la app solo sabía de alimentos.
 *
 * El producto ya sabe esto del lado del entreno: una **pieza** es un día
 * guardado (`pieces.js`) y tiene su vitrina en `/plantillas`. Esto es el gemelo:
 *
 *   un alimento es a una dieta lo que un ejercicio es a una rutina;
 *   **un plato es a una dieta lo que una plantilla es a un bloque.**
 *
 * ══ Lo que un plato NO es ══════════════════════════════════════════════════
 *
 * No es una receta y esto no es un recetario. No lleva foto, ni pasos de
 * cocina, ni etiquetas de dieta, y la app no propone ninguno: un plato es
 * **tuyo**, lo guardas de una dieta que ya montaste, y ponerlo es un gesto
 * tuyo. La app resalta y calcula; no receta un menú.
 *
 * ══ Dónde viven ════════════════════════════════════════════════════════════
 *
 * En `profiles.preferences.platos.items`, exactamente como las piezas y por el
 * mismo motivo: es criterio propio guardado con nombre, son del ENTRENADOR y no
 * de un cliente, `updateCoachPreferences` ya fusiona por secciones sin pisar lo
 * demás, y no cuesta migración.
 *
 * **El precio, dicho**: un plato no se comparte con el equipo —las bibliotecas
 * de alimentos y ejercicios sí lo son desde la 0006, así que la expectativa
 * razonable es que esto también—, y por eso hay tope: una fila de perfil no es
 * sitio para doscientos. Si la queja de equipo aparece, una tabla propia es una
 * migración posterior que lee ESTE MISMO módulo: las funciones no cambian de
 * firma.
 *
 * ══ Ponerlo DESPLIEGA, no enlaza ═══════════════════════════════════════════
 *
 * Elegir un plato en una dieta mete sus alimentos como entradas congeladas, una
 * por una, no un puntero. **Consecuencia, dicha**: editar el plato después no
 * cambia las dietas que ya lo usaron. Es correcto, es el modelo desde
 * `buildFoodEntry` —una dieta es una foto— y es cómo se comporta una pieza.
 */

import { newId } from '@/lib/ids';
import { toNum0 } from '@/lib/num';
import { buildFoodEntry, optionMacros, rescaleMeals } from './nutrition';
import { freezeMicros } from './micros';

/**
 * Cuarenta ya es mucho para una fila de perfil, y bastante más que los treinta
 * de las piezas por un motivo: un desayuno, una comida y una cena por cada tipo
 * de día son más combinaciones que días de entreno.
 */
export const MAX_PLATOS = 40;

/**
 * Un alimento del plato: MATERIAL, no entrada de dieta.
 *
 * Conserva lo que describe la ración —qué alimento, cuánto, qué lleva y cómo se
 * cuenta— y deja fuera lo que es de la dieta de una persona concreta:
 *
 *   · el `id`, que se cruzaría con el de la entrada de la que salió;
 *   · `equivHidden`, que es una decisión sobre lo que ve UN cliente;
 *   · `alternatives`, que las trae el importador de un PDF y son de aquel plan.
 *
 * Es la misma poda que hace `cloneExerciseAsTemplate` al guardar una pieza, y
 * por la misma razón: lo que se guarda es el criterio, no el caso.
 */
const comoMaterial = (entry) => ({
  name: String(entry?.name || '').trim(),
  grams: toNum0(entry?.grams),
  proteinPer100: toNum0(entry?.proteinPer100),
  carbsPer100: toNum0(entry?.carbsPer100),
  fatsPer100: toNum0(entry?.fatsPer100),
  unitLabel: entry?.unitLabel ?? null,
  unitGrams: entry?.unitGrams ?? null,
  showAs: entry?.showAs === 'units' ? 'units' : 'grams',
  /* Lo que declare la entrada, y solo eso: los micros viajan congelados igual
     que los macros, y lo que no dice sigue sin decir nada (ver `micros.js`). */
  ...freezeMicros(entry),
});

/** Los platos guardados, saneados: con id, nombre y algo dentro. */
export const platosOf = (coachPrefs) =>
  (Array.isArray(coachPrefs?.platos?.items) ? coachPrefs.platos.items : []).filter(
    (p) => p && p.id && String(p.name || '').trim() && Array.isArray(p.foods) && p.foods.length > 0
  );

/**
 * Un plato nuevo a partir de una opción de comida. `savedAt` lo pone quien
 * llama, que es quien tiene reloj.
 */
export const buildPlato = ({ name, foods = [], savedAt = null }) => ({
  id: newId('plato'),
  name: String(name || '').trim(),
  foods: (foods || []).filter((f) => f && String(f.name || '').trim()).map(comoMaterial),
  savedAt,
});

/** Macros y kcal del plato entero. La misma cuenta que una opción, porque lo es. */
export const platoMacros = (plato) => optionMacros({ foods: plato?.foods || [] });

/** Las kcal, redondeadas: es la cifra con la que se elige un plato. */
export const platoKcals = (plato) => Math.round(platoMacros(plato).kcal);

/** «3 alimentos · 512 kcal», para la fila de la vitrina y la del buscador. */
export const platoSummary = (plato) => {
  const n = (plato?.foods || []).length;
  return `${n} ${n === 1 ? 'alimento' : 'alimentos'} · ${platoKcals(plato)} kcal`;
};

/**
 * Los alimentos del plato como ENTRADAS DE DIETA nuevas, con sus ids propios.
 *
 * Pasa por `buildFoodEntry` y no por una copia a mano para que una entrada
 * puesta desde un plato sea indistinguible de una puesta a mano: mismo id
 * nuevo, misma unidad, mismo `showAs`. Dos formas de crear la misma cosa es
 * como se acaba con dos comportamientos.
 */
export const platoFoods = (plato) =>
  (plato?.foods || []).map((item) => buildFoodEntry(item, item.grams));

/**
 * El nombre con el que un plato entra en tu vitrina sin pisar otro que ya se
 * llame así: «Desayuno», «Desayuno 2», «Desayuno 3»… La misma mecánica que
 * `freeSheetName`, y a propósito: dos formas de desempatar nombres serían dos
 * comportamientos que explicar.
 */
export const freePlatoName = (name, existentes = []) => {
  const usados = new Set((existentes || []).map((n) => String(n || '').trim().toLowerCase()));
  const base = String(name || '').trim() || 'Plato';
  if (!usados.has(base.toLowerCase())) return base;
  let n = 2;
  while (usados.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
};

/**
 * CUADRAR un plato al objetivo de la comida donde cae.
 *
 * ══ Qué es y qué no es ═════════════════════════════════════════════════════
 *
 * Tu plato de 700 kcal cae en una comida cuyo objetivo son 500. La app no
 * decide nada —no elige el plato, no lo cambia sola y no propone otro—: pone la
 * diferencia a la vista y ofrece la aritmética que estabas haciendo a mano.
 *
 * Es la mitad útil de un generador de dietas sin recetario y sin que la app
 * opine del menú.
 *
 * ══ Y no hay algoritmo nuevo ═══════════════════════════════════════════════
 *
 * Se envuelve el plato en una comida de una sola opción y se llama a
 * `rescaleMeals`, que ya está escrito y probado: la proteína no se toca, lo que
 * se cuenta por unidades tampoco, y el redondeo es de cocina (a 5 g desde 25 g).
 * Escribir aquí una segunda regla de escalado sería tener dos.
 *
 * @param entries  Entradas de dieta (las que devuelve `platoFoods`).
 * @param toKcals  El objetivo al que cuadrarlas.
 * @returns `{ foods, cambios }`, o `null` cuando no hay nada que mover — un
 *   plato hecho solo de proteína y unidades no tiene de dónde recortar, y
 *   rendirse en voz alta es mejor que devolver lo mismo fingiendo que cambió.
 */
export const scalePlatoTo = (entries = [], toKcals) => {
  const from = Math.round(optionMacros({ foods: entries }).kcal);
  const to = Math.round(toNum0(toKcals));
  if (!from || !to || from === to) return null;

  const res = rescaleMeals([{ id: 'plato', name: 'plato', options: [{ id: 'op', foods: entries }] }], {
    fromKcals: from,
    toKcals: to,
  });
  if (!res) return null;

  return { foods: res.meals[0].options[0].foods, cambios: res.cambios };
};
