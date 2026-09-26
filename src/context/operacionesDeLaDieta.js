import {
  addDietDay,
  buildMeal,
  cloneMeal,
  cloneMeals,
  cycleFromSplit,
  duplicateDietDay,
  mealsForVariant,
  moveDietDay,
  planDays,
  removeDietDay,
  renameDietDay,
  replaceDietDays,
  setCycleSlot,
  setDayMeals,
  setDayTargets,
  withDays,
} from '@/domain/nutrition';
import { menu, parcheDeAlimento } from '@/domain/menu';
import { toTargetFields } from '@/domain/dietSheet';

/**
 * LOS VERBOS DE UNA DIETA, sin saber dónde vive (letra e, 26 sep 2026).
 *
 * ══ Por qué salen de `useNutrition` ═════════════════════════════════════════
 *
 * Todos eran `(clientId, …) => applyNutrition(clientId, …)`: la dieta de un
 * cliente, en memoria y en la cola de guardado. Para preparar una dieta que
 * empieza otro día (la dieta programada) hace falta el MISMO editor sobre
 * otra copia, y el editor no puede saber cuál tiene delante. Así que los
 * verbos reciben las dos puertas:
 *
 *   · `aplicar(actualizador, { immediate })`: escribe el plan que devuelve el
 *     actualizador y devuelve el plan nuevo (o el mismo, si no cambió nada).
 *   · `leer()`: el plan de ahora, para los verbos que miran antes de escribir.
 *
 * `useNutrition` las ata a la dieta de cada cliente (`dietaDe`), y el editor
 * entra por `useEditorDeDieta`. Los verbos del menú son los de `domain/menu`,
 * los mismos que usa el menú de una variación.
 *
 * `immediate: false` en lo que se teclea letra a letra (nombres, notas,
 * objetivos, gramos): escribir en la base en cada pulsación no lo merece.
 */
export const operacionesDeLaDieta = ({ aplicar, leer }) => {
  /**
   * Actualiza el menú de UN día.
   *
   * Dónde vive ese menú —las columnas de siempre o la lista `days`— lo resuelve
   * `setDayMeals` en el dominio, y por eso todo lo de abajo puede hablar de días
   * sin saber nada del esquema. Ver «LOS DÍAS DE LA DIETA».
   */
  const aplicarMenu = (dayId, actualizador, opciones) =>
    aplicar((n) => {
      const meals = actualizador(mealsForVariant(n, dayId));
      return meals === null ? n : setDayMeals(n, dayId, meals);
    }, opciones);

  const TECLEO = { immediate: false };

  /** Cambia UN alimento dentro de una opción de una comida. */
  const patchFood = (variant, mealIdx, optIdx, foodId, patch) =>
    aplicarMenu(variant, (meals) => menu.cambiarAlimento(meals, mealIdx, optIdx, foodId, patch), TECLEO);

  return {
    updateNutrition: (fields, opciones) => aplicar((n) => ({ ...n, ...fields }), opciones),

    /** Actualiza el objetivo de kcal y macros de UN día. Ver `setDayTargets`. */
    updateNutritionTargets: (dayId, fields, opciones) => aplicar((n) => setDayTargets(n, dayId, fields), opciones),

    /*
      ══ LOS DÍAS DEL PLAN ════════════════════════════════════════════════════

      Aquí había un solo verbo, `setHasDayVariants`, y era un interruptor:
      encendía «dos dietas (entreno / descanso)» o las apagaba. Ahora son cuatro
      verbos y viven donde se ven: añadir, duplicar, renombrar y quitar, cada
      uno colgando del día al que le pasa. La regla de qué significa cada uno
      está en el dominio; esto solo escribe.
    */

    /** Añade un día al final, con el objetivo del día del que sale. */
    addDietDay: ({ desde = null, name = null } = {}) => aplicar((n) => addDietDay(n, { desde, name })),

    /**
     * Un día NUEVO con un menú puesto, en UNA escritura.
     *
     * Es lo que hace falta para repartir un día a varias personas (ver
     * `domain/reparto`): al destinatario se le AÑADE un día y no se le toca
     * ninguno de los que tenga. Va junto y no como `addDietDay` + `setDayMeals`
     * porque entre las dos llamadas el día existe VACÍO, así que un fallo en
     * medio deja un día en blanco en la dieta de alguien.
     *
     * El id del día lo pone `addDietDay` y aquí se lee del resultado: es la
     * única forma de saber cuál es el recién creado sin suponer que es el último.
     */
    addDietDayWithMeals: ({ name = null, meals = [] } = {}) =>
      aplicar((n) => {
        const conDia = addDietDay(n, { name });
        const dias = planDays(conDia);
        const nuevo = dias[dias.length - 1];
        /* `cloneMeals`: la misma pieza se reparte a ocho, y sin ids nuevos las
           ocho copias compartirían los del original. */
        return setDayMeals(conDia, nuevo.id, cloneMeals(meals));
      }),

    /**
     * Sustituir la dieta entera: sus días por otros. El ÚNICO verbo de
     * nutrición que borra; lo llama un solo sitio —el reparto, después de
     * haberlo avisado por persona—. La regla vive en `replaceDietDays`.
     */
    replaceDiet: (days, pauta = null) => aplicar((n) => replaceDietDays(n, days, pauta)),

    /** Duplica un día con su menú entero: el gesto que hace llevadero tener N. */
    duplicateDietDay: (dayId) => aplicar((n) => duplicateDietDay(n, dayId)),
    renameDietDay: (dayId, name) => aplicar((n) => renameDietDay(n, dayId, name), TECLEO),
    moveDietDay: (from, to) => aplicar((n) => moveDietDay(n, from, to)),
    /** Quien llama guarda el plan de antes para el «Deshacer». */
    removeDietDay: (dayId) => aplicar((n) => removeDietDay(n, dayId)),

    /** El reparto del ciclo, casilla a casilla. */
    setDietCycleSlot: (casilla, dayId) => aplicar((n) => setCycleSlot(n, casilla, dayId)),

    /**
     * «Repartir por el entreno»: copia el `weeklySplit` del programa —o el
     * patrón del ciclo rotativo— al mapa de la dieta. Se copia UNA VEZ y no
     * queda enlazado: una dieta que se recoloca sola es la aplicación
     * decidiendo por el entrenador. Se escribe el mapa ENTERO: dejar debajo el
     * reparto de un ciclo anterior sería guardar dos respuestas.
     */
    repartirPorElEntreno: (slots, { entreno, descanso }) =>
      aplicar((n) => ({ ...withDays(n), week: cycleFromSplit(slots, { entreno, descanso }) })),

    /**
     * Sustituir el menú de un día por uno ya calculado (el reescalado al
     * objetivo nuevo). Quien llama guarda el menú anterior: el «Deshacer» es
     * volver a llamar aquí con él.
     */
    applyRescaledMeals: (variant, meals) => aplicarMenu(variant, () => meals),

    /**
     * Trae el menú de un día a otro. NO copia el objetivo de kcal y macros: es
     * justo lo que distingue a un día de otro. Los ids se regeneran.
     */
    copyVariantMeals: (from, to) => {
      if (from === to) return false;
      const source = mealsForVariant(leer(), from);
      if (source.length === 0) return false;
      aplicarMenu(to, () => cloneMeals(source));
      return true;
    },

    /**
     * Llevar UNA comida a otro día. Se AÑADE al final y no sustituye nada:
     * copiar no debería poder borrar.
     */
    copyMealToVariant: (from, to, mealIdx) => {
      if (from === to) return null;
      const source = mealsForVariant(leer(), from)[mealIdx];
      if (!source) return null;
      aplicarMenu(to, (meals) => menu.anadirComida(meals, cloneMeal(source, { rename: false })));
      return source.name || 'Comida';
    },

    /**
     * Traer una dieta entera de fuera, en UNA escritura (y no ocho
     * `updateNutrition`, cada una con su guardado en cola).
     *
     * Las comidas de las variantes que se traen se SUSTITUYEN; lo que no venga
     * en la lectura no se toca, y las pautas se AÑADEN a las que ya estaban.
     * Cada variante cae en el día de su posición; si la hoja trae más días de
     * los que hay, se añaden. Quien llama pregunta antes si había algo.
     */
    importDiet: (plan) =>
      aplicar((n) => {
        let next = { ...n };
        const variantes = plan?.variants || [];

        if (variantes.some((v) => v.meals?.length)) next.type = 'closed';

        if (plan?.targets) Object.assign(next, toTargetFields(plan.targets));
        if (plan?.steps) next.stepsGoal = plan.steps;
        if (plan?.cardio) next.cardioGoal = plan.cardio;
        if (plan?.notes?.length) next.habitsNotes = [...(n.habitsNotes || []), ...plan.notes];

        for (let i = 0; i < variantes.length; i += 1) {
          if (planDays(next).length <= i) next = addDietDay(next, { name: variantes[i].label || null });
          const dia = planDays(next)[i];
          /* `meals: null` es una variante de solo objetivo: se ponen sus cifras
             y el menú no se toca. */
          if (variantes[i].meals) next = setDayMeals(next, dia.id, variantes[i].meals);
          if (variantes[i].targets) {
            next = setDayTargets(next, dia.id, toTargetFields(variantes[i].targets));
          }
        }

        return next;
      }),

    // ── Las comidas ────────────────────────────────────────────────────────
    addMeal: (variant) => aplicarMenu(variant, (meals) => menu.anadirComida(meals, buildMeal())),
    removeMeal: (variant, mealIdx) => aplicarMenu(variant, (meals) => menu.quitarComida(meals, mealIdx)),
    /** El inverso de `removeMeal`, para el «Deshacer» del aviso. */
    restoreMeal: (variant, mealIdx, meal) => aplicarMenu(variant, (meals) => menu.restaurarComida(meals, mealIdx, meal)),
    updateMealName: (variant, mealIdx, name) =>
      aplicarMenu(variant, (meals) => menu.renombrarComida(meals, mealIdx, name), TECLEO),
    /** La pauta escrita de una comida: «que sea 2 h antes de dormir», «marca X». */
    updateMealNote: (variant, mealIdx, note) =>
      aplicarMenu(variant, (meals) => menu.notaDeComida(meals, mealIdx, note), TECLEO),
    /** El objetivo de una comida, campo a campo. Ver `menu.objetivoDeComida`. */
    updateMealTarget: (variant, mealIdx, field, value) =>
      aplicarMenu(variant, (meals) => menu.objetivoDeComida(meals, mealIdx, field, value), TECLEO),
    /**
     * EL CANDADO DE UNA COMIDA: esta no se mueve aunque cambie el día. Es del
     * reparto y no del menú: aquí se clava LO QUE SE LE PIDE a la comida; que
     * un alimento no se mueva al reajustar es `setFoodFixed`.
     */
    toggleMealFijo: (variant, mealIdx) => aplicarMenu(variant, (meals) => menu.alternarFija(meals, mealIdx)),
    moveMeal: (variant, fromIndex, toIndex) => aplicarMenu(variant, (meals) => menu.moverComida(meals, fromIndex, toIndex)),
    duplicateMeal: (variant, mealIdx) => aplicarMenu(variant, (meals) => menu.duplicarComida(meals, mealIdx)),

    /**
     * Una comida de FUERA al final del menú (del portapapeles: otro día, otra
     * persona), y DEVUELVE la que ha quedado puesta: el «Deshacer» del aviso
     * quita esa y no «la última». `rename: false`: pegada no es duplicada.
     */
    appendMeal: (variant, meal) => {
      const puesta = cloneMeal(meal, { rename: false });
      aplicarMenu(variant, (meals) => menu.anadirComida(meals, puesta));
      return puesta;
    },
    /** El inverso de pegar: quita por id las que se pusieron, estén donde estén. */
    removeMealsById: (variant, ids) => aplicarMenu(variant, (meals) => menu.quitarComidasPorId(meals, ids)),

    // ── Las alternativas ───────────────────────────────────────────────────
    addMealOption: (variant, mealIdx) => aplicarMenu(variant, (meals) => menu.anadirOpcion(meals, mealIdx)),
    /** «Con avena», «Sin lactosa»: se guarda en el propio menú. */
    renameMealOption: (variant, mealIdx, optIdx, name) =>
      aplicarMenu(variant, (meals) => menu.renombrarOpcion(meals, mealIdx, optIdx, name), TECLEO),
    /**
     * Las alternativas de una comida, de una vez: pegar una comida COMO OTRA
     * OPCIÓN trae dos o tres, y lo que se escribe de una vez se deshace de una
     * vez (el inverso es la lista de antes).
     */
    setMealOptions: (variant, mealIdx, options) =>
      aplicarMenu(variant, (meals) => menu.ponerOpciones(meals, mealIdx, options)),
    removeMealOption: (variant, mealIdx, optIdx) =>
      aplicarMenu(variant, (meals) => menu.quitarOpcion(meals, mealIdx, optIdx)),
    /** La segunda opción casi nunca se monta desde cero: es la primera con un cambio. */
    duplicateOption: (variant, mealIdx, optIdx) =>
      aplicarMenu(variant, (meals) => menu.duplicarOpcion(meals, mealIdx, optIdx)),

    // ── Los alimentos ──────────────────────────────────────────────────────
    moveFood: (variant, mealIdx, optIdx, fromIndex, toIndex) =>
      aplicarMenu(variant, (meals) => menu.moverAlimento(meals, mealIdx, optIdx, fromIndex, toIndex)),
    addFoodToOption: (variant, mealIdx, optIdx, food, grams = null) =>
      aplicarMenu(variant, (meals) => menu.anadirAlimento(meals, mealIdx, optIdx, food, grams)),
    /**
     * VARIAS entradas de golpe, ya construidas: es cómo se pone un plato. Una
     * escritura y no cinco, y quien llama sabe qué ids han salido (para
     * «cuadrarlo» al objetivo de la comida justo después).
     */
    addFoodsToOption: (variant, mealIdx, optIdx, entries = []) =>
      aplicarMenu(variant, (meals) => menu.anadirAlimentos(meals, mealIdx, optIdx, entries)),
    removeFoodFromOption: (variant, mealIdx, optIdx, foodId) =>
      aplicarMenu(variant, (meals) => menu.quitarAlimento(meals, mealIdx, optIdx, foodId)),
    /** El inverso de `removeFoodFromOption`, para el «Deshacer» del aviso. */
    restoreFoodInOption: (variant, mealIdx, optIdx, food, foodIdx) =>
      aplicarMenu(variant, (meals) => menu.restaurarAlimento(meals, mealIdx, optIdx, food, foodIdx)),
    patchFood,
    updateFoodGrams: (variant, mealIdx, optIdx, foodId, grams) =>
      patchFood(variant, mealIdx, optIdx, foodId, parcheDeAlimento.gramos(grams)),
    /**
     * Sustituye UN alimento por otro, en su sitio: el intercambio de
     * equivalencias. Se conserva el `id` y la posición; el mismo camino sirve
     * para deshacerlo pasándole la entrada capturada.
     */
    swapFood: (variant, mealIdx, optIdx, foodId, entry) =>
      patchFood(variant, mealIdx, optIdx, foodId, parcheDeAlimento.sustituto(entry)),
    /**
     * ¿Este alimento lleva equivalencias en la vista del cliente? Es la
     * EXCEPCIÓN a la regla del protocolo, alimento a alimento.
     */
    setFoodEquivalences: (variant, mealIdx, optIdx, foodId, visible) =>
      patchFood(variant, mealIdx, optIdx, foodId, parcheDeAlimento.equivalencias(visible)),
    /**
     * Gramos o unidades, POR ALIMENTO Y POR DIETA. Los gramos no se tocan al
     * cambiar de modo: son la verdad, la unidad es la lente.
     */
    setFoodDisplay: (variant, mealIdx, optIdx, foodId, mode) =>
      patchFood(variant, mealIdx, optIdx, foodId, parcheDeAlimento.mostrarComo(mode)),
    /** ESTE ALIMENTO NO SE MUEVE AL AJUSTAR: lo que la categoría no acierte, lo dice el entrenador. */
    setFoodFixed: (variant, mealIdx, optIdx, foodId, fijo) =>
      patchFood(variant, mealIdx, optIdx, foodId, parcheDeAlimento.fijo(fijo)),
  };
};
