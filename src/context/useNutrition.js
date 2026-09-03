import { useCallback } from 'react';

import { deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';
import {
  VARIANT_KEY,
  buildFoodEntry,
  cloneMeal,
  cloneMeals,
  cloneOption,
  moveItem,
  buildMeal,
  buildOption,
  emptyNutrition,
} from '@/domain/nutrition';
import { toTargetFields } from '@/domain/dietSheet';

/*
  ══ La dieta, fuera de AppContext ════════════════════════════════════════════

  Con la convención de `useRoadmap.js` y la frontera de `useClients.js`: recibe
  `persist` y el estado espejado del bloque, que sigue siendo del proveedor.

  `editFood` NO está aquí: escribe a la vez en la dieta abierta (con
  `patchFood`, que este gancho devuelve) y en la biblioteca del equipo, así que
  es el puente entre dos dominios y vive en el proveedor, como `assignClient`.
*/

export const useNutrition = ({ nutritionRef, setNutrition, persist }) => {
  const applyNutrition = useCallback(
    (clientId, updater, { immediate = true } = {}) => {
      const current = nutritionRef.current[clientId] || emptyNutrition();
      const next = updater(current);
      if (next === current) return current;

      setNutrition({ ...nutritionRef.current, [clientId]: next });
      persist('nutrition', clientId, next, { immediate });
      return next;
    },
    [nutritionRef, persist, setNutrition]
  );

  /** Actualiza una lista de comidas de la variante indicada. */
  const applyMeals = useCallback(
    (clientId, variant, updater, options) =>
      applyNutrition(
        clientId,
        (n) => {
          const key = VARIANT_KEY[variant] || VARIANT_KEY.default;
          const meals = updater(n[key] || []);
          return meals === null ? n : { ...n, [key]: meals };
        },
        options
      ),
    [applyNutrition]
  );

  const updateNutrition = useCallback(
    (clientId, fields, options) =>
      applyNutrition(clientId, (n) => ({ ...n, ...fields }), options),
    [applyNutrition]
  );

  /**
   * Actualiza el objetivo de kcal y macros de UNA variante.
   *
   * Las columnas principales son el objetivo de los días de entreno (o el único
   * si no hay variantes); el de descanso vive en `restTargets`. Sin esta
   * separación, activar "dos dietas" mostraba la misma cifra en los dos días,
   * que es precisamente lo que la opción quiere distinguir.
   */
  const updateNutritionTargets = useCallback(
    (clientId, variant, fields, options) =>
      applyNutrition(
        clientId,
        (n) =>
          variant === 'rest' && n.hasDayVariants
            ? { ...n, restTargets: { ...(n.restTargets || {}), ...fields } }
            : { ...n, ...fields },
        options
      ),
    [applyNutrition]
  );

  const setHasDayVariants = useCallback(
    (clientId, value) =>
      applyNutrition(clientId, (n) => {
        if (!value || n.hasDayVariants) return { ...n, hasDayVariants: value };
        // Al activar por primera vez se parte de una copia de la dieta única,
        // tanto en comidas como en OBJETIVO, para no dejar el día de descanso
        // con cifras vacías ni perder lo ya configurado.
        return {
          ...n,
          hasDayVariants: true,
          restTargets: n.restTargets || {
            targetKcals: n.targetKcals,
            proteinGrams: n.proteinGrams,
            carbsGrams: n.carbsGrams,
            fatsGrams: n.fatsGrams,
          },
          closedMealsTraining: n.closedMealsTraining?.length
            ? n.closedMealsTraining
            : deepClone(n.closedMeals || []),
          closedMealsRest: n.closedMealsRest?.length
            ? n.closedMealsRest
            : deepClone(n.closedMeals || []),
        };
      }),
    [applyNutrition]
  );

  /**
   * Trae el menú de una variante a la otra, dentro del mismo cliente.
   *
   * ── El hueco que cierra ─────────────────────────────────────────────────────
   * Al ACTIVAR las dos dietas, `setHasDayVariants` copia la única a ambas, así que
   * se empieza con lo mismo en las dos. Pero a partir de ahí divergen y no había
   * ningún camino de vuelta: el entrenador monta seis comidas en el día de
   * entreno, va al de descanso y se lo encuentra como lo dejó hace tres semanas.
   * Rehacerlo a mano es media hora por cliente.
   *
   * Y es el caso NORMAL, no el raro: un día de descanso casi nunca es una dieta
   * distinta, es la misma con menos hidratos. Partir de una copia y quitar es el
   * flujo de trabajo real.
   *
   * ── Qué NO copia, y por qué ─────────────────────────────────────────────────
   * El objetivo de kcal y macros. Es justo lo que distingue a las dos variantes
   * —si fueran iguales no habría dos— y arrastrarlo borraría la única cifra que
   * el entrenador ajustó a mano al separarlas.
   *
   * Los identificadores se regeneran (ver `cloneMeals`). Hoy no haría falta,
   * porque cada variante es un array aparte y las acciones van dirigidas a uno;
   * se hace igualmente para que compartir `id` entre listas nunca llegue a ser
   * una suposición sobre la que alguien construya.
   */
  /**
   * Sustituir el menú de una variante por uno ya calculado.
   *
   * Existe para el reescalado al objetivo nuevo: el cálculo vive en el dominio
   * (`rescaleMeals`), la vista previa lo enseña, y esto solo escribe lo que el
   * entrenador acaba de aprobar. Quien llama guarda el menú anterior, porque
   * el «Deshacer» es volver a llamar aquí con él.
   */
  const applyRescaledMeals = useCallback(
    (clientId, variant, meals) => applyMeals(clientId, variant, () => meals),
    [applyMeals]
  );

  const copyVariantMeals = useCallback(
    (clientId, from, to) => {
      if (from === to) return false;
      const source = nutritionRef.current[clientId]?.[VARIANT_KEY[from]] || [];
      if (source.length === 0) return false;

      applyMeals(clientId, to, () => cloneMeals(source));
      return true;
    },
    [applyMeals, nutritionRef]
  );

  /**
   * Llevar UNA comida a la otra variante.
   *
   * `copyVariantMeals` copia el día entero y sustituye lo que hubiera. Eso vale
   * para montar el día de descanso desde cero, pero no para lo que se hace
   * después: el día de descanso ya está hecho y solo quieres llevarte la cena que
   * acabas de ajustar en el de entreno. Con la única herramienta que había, la
   * opción era rehacerla a mano o tirar el día entero y volver a empezar.
   *
   * Se AÑADE al final y no sustituye nada: copiar no debería poder borrar. Si
   * acaba habiendo dos «Cena», se ve al momento y se borra una — que es un error
   * reversible, al revés que perder la que estaba.
   */
  const copyMealToVariant = useCallback(
    (clientId, from, to, mealIdx) => {
      if (from === to) return null;
      const source = nutritionRef.current[clientId]?.[VARIANT_KEY[from]]?.[mealIdx];
      if (!source) return null;

      applyMeals(clientId, to, (meals) => [...meals, cloneMeal(source, { rename: false })]);
      return source.name || 'Comida';
    },
    [applyMeals, nutritionRef]
  );

  /**
   * Llevar UNA opción a la comida que se llama igual en la otra variante.
   *
   * ── Por qué no pregunta a dónde ─────────────────────────────────────────────
   * Porque la respuesta es siempre la misma: la alternativa de pasta del almuerzo
   * de entreno va al almuerzo de descanso. Un selector de destino sería un paso
   * más para elegir lo único que se iba a elegir, y el nombre de la comida ya
   * dice a dónde va.
   *
   * Si esa comida no existe allí, se crea con ese nombre. La alternativa —negarse
   * a copiar— obligaría a ir a la otra variante, crear la comida vacía, volver y
   * repetir la operación.
   */
  const copyOptionToVariant = useCallback(
    (clientId, from, to, mealIdx, optIdx) => {
      if (from === to) return null;
      const source = nutritionRef.current[clientId]?.[VARIANT_KEY[from]]?.[mealIdx];
      const option = source?.options?.[optIdx];
      if (!option) return null;

      const nombre = source.name || 'Comida';
      applyMeals(clientId, to, (meals) => {
        const destino = meals.findIndex((m) => (m.name || '') === nombre);
        if (destino < 0) {
          return [...meals, { ...buildMeal(), name: nombre, options: [cloneOption(option)] }];
        }
        return meals.map((m, i) =>
          i === destino ? { ...m, options: [...(m.options || []), cloneOption(option)] } : m
        );
      });
      return nombre;
    },
    [applyMeals, nutritionRef]
  );

  /**
   * Traer una dieta entera de fuera, en UNA escritura.
   *
   * ══ Por qué no es `updateNutrition` llamado ocho veces ═════════════════════
   *
   * Porque cada llamada reserializa el plan entero y encola su guardado: una
   * dieta importada —objetivo, pasos, cardio, pautas y dos listas de comidas—
   * mandaría ocho escrituras del mismo documento por la cola, y la última en
   * llegar decide. Es la misma razón por la que la rutina tiene `importDays`.
   *
   * ══ Qué sustituye y qué respeta ═══════════════════════════════════════════
   *
   * Las comidas de las variantes que se traen se SUSTITUYEN: importar encima de
   * un menú a medias y que quedaran mezclados sería peor que cualquiera de los
   * dos. Lo que no venga en la lectura no se toca —una hoja que solo trae los
   * macros no borra el menú que hubiera—, y las pautas se AÑADEN a las que ya
   * estaban, porque son suyas y nadie ha pedido quitarlas.
   *
   * Quien llama pregunta antes si había algo: la advertencia va en el diálogo,
   * que es donde se ve lo que se va a sustituir.
   */
  const importDiet = useCallback(
    (clientId, plan) =>
      applyNutrition(clientId, (n) => {
        const next = { ...n };
        const variantes = plan?.variants || [];

        if (variantes.some((v) => v.meals?.length)) next.type = 'closed';

        if (plan?.targets) Object.assign(next, toTargetFields(plan.targets));
        if (plan?.steps) next.stepsGoal = plan.steps;
        if (plan?.cardio) next.cardioGoal = plan.cardio;
        if (plan?.notes?.length) next.habitsNotes = [...(n.habitsNotes || []), ...plan.notes];

        /* Dos variantes traídas encienden las dos dietas: si la hoja distingue
           el día de entreno del de descanso, el plan también tiene que hacerlo o
           una de las dos no se podría ni enseñar. */
        if (variantes.length > 1) next.hasDayVariants = true;

        for (const variante of variantes) {
          /*
            Una dieta única traída a un cliente que YA tiene dos cae en la de
            entreno, no en la lista única: con las dos dietas encendidas, esa
            lista no se enseña en ninguna parte, así que importar ahí sería
            importar a un sitio invisible. La de descanso se queda como estaba,
            que es lo menos destructivo de lo que se puede hacer sin preguntar.
          */
          const destino = !next.hasDayVariants
            ? 'default'
            : variante.variant === 'default'
              ? 'training'
              : variante.variant;
          next[VARIANT_KEY[destino] || VARIANT_KEY.default] = variante.meals || [];

          if (!variante.targets) continue;
          if (destino === 'rest') next.restTargets = toTargetFields(variante.targets);
          else Object.assign(next, toTargetFields(variante.targets));
        }

        return next;
      }),
    [applyNutrition]
  );

  const addMeal = useCallback(
    (clientId, variant) => applyMeals(clientId, variant, (meals) => [...meals, buildMeal()]),
    [applyMeals]
  );

  const removeMeal = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) => meals.filter((_, i) => i !== mealIdx)),
    [applyMeals]
  );

  /** El inverso de `removeMeal`, para el «Deshacer» del aviso (ver
      `restoreExercise`: misma regla, mismo motivo). */
  const restoreMeal = useCallback(
    (clientId, variant, mealIdx, meal) =>
      applyMeals(clientId, variant, (meals) => {
        const next = [...meals];
        next.splice(Math.max(0, Math.min(mealIdx, next.length)), 0, meal);
        return next;
      }),
    [applyMeals]
  );

  const updateMealName = useCallback(
    (clientId, variant, mealIdx, name) =>
      applyMeals(
        clientId,
        variant,
        (meals) => meals.map((m, i) => (i === mealIdx ? { ...m, name } : m)),
        { immediate: false }
      ),
    [applyMeals]
  );

  /** La pauta escrita de una comida: «que sea 2 h antes de dormir», «marca X». */
  const updateMealNote = useCallback(
    (clientId, variant, mealIdx, note) =>
      applyMeals(
        clientId,
        variant,
        (meals) => meals.map((m, i) => (i === mealIdx ? { ...m, note } : m)),
        { immediate: false }
      ),
    [applyMeals]
  );

  /**
   * El objetivo de una comida, campo a campo.
   *
   * Un objetivo que se queda entero a cero se guarda como `null` y no como cuatro
   * ceros: `mealTarget` distingue «no le he puesto objetivo» de «le he puesto
   * cero kcal», y sin esto borrar los cuatro campos dejaría la comida marcada
   * como si tuviera un objetivo imposible de cumplir.
   */
  const updateMealTarget = useCallback(
    (clientId, variant, mealIdx, field, value) =>
      applyMeals(
        clientId,
        variant,
        (meals) =>
          meals.map((m, i) => {
            if (i !== mealIdx) return m;
            const target = { ...(m.target || {}), [field]: value };
            const vacio = Object.values(target).every((v) => v === '' || v === null || Number(v) === 0);
            return { ...m, target: vacio ? null : target };
          }),
        { immediate: false }
      ),
    [applyMeals]
  );

  const addMealOption = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) => (i === mealIdx ? { ...m, options: [...m.options, buildOption()] } : m))
      ),
    [applyMeals]
  );

  const removeMealOption = useCallback(
    (clientId, variant, mealIdx, optIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx || m.options.length <= 1
            ? m
            : { ...m, options: m.options.filter((_, o) => o !== optIdx) }
        )
      ),
    [applyMeals]
  );

  // ── Orden y duplicados en la dieta ─────────────────────────────────────────
  //
  // Montar una dieta es sobre todo REORGANIZAR: la comida que va antes, la
  // alternativa que es casi igual que la anterior con un cambio. Sin esto, la
  // única forma de cambiar el orden de dos comidas era borrar una y volver a
  // escribirla entera con sus alimentos.

  const moveMeal = useCallback(
    (clientId, variant, fromIndex, toIndex) =>
      applyMeals(clientId, variant, (meals) => moveItem(meals, fromIndex, toIndex)),
    [applyMeals]
  );

  const moveFood = useCallback(
    (clientId, variant, mealIdx, optIdx, fromIndex, toIndex) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx ? o : { ...o, foods: moveItem(o.foods || [], fromIndex, toIndex) }
                ),
              }
        )
      ),
    [applyMeals]
  );

  /**
   * Duplica una alternativa dentro de su comida.
   *
   * Es el atajo que faltaba y el que más se usa: la segunda opción de una comida
   * casi nunca se monta desde cero, sino que es la primera con el arroz cambiado
   * por pasta. Sin esto había que volver a buscar y añadir los cinco alimentos.
   */
  const duplicateOption = useCallback(
    (clientId, variant, mealIdx, optIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) => {
          if (i !== mealIdx) return m;
          const source = m.options[optIdx];
          if (!source) return m;
          // Detrás de la que se copia, no al final: es donde se espera encontrarla.
          const options = [...m.options];
          options.splice(optIdx + 1, 0, cloneOption(source));
          return { ...m, options };
        })
      ),
    [applyMeals]
  );

  const duplicateMeal = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) => {
        const source = meals[mealIdx];
        if (!source) return meals;
        const next = [...meals];
        next.splice(mealIdx + 1, 0, cloneMeal(source));
        return next;
      }),
    [applyMeals]
  );

  const addFoodToOption = useCallback(
    // `null` y no 100: deja que `buildFoodEntry` elija: una unidad entera si el
    // alimento la tiene, 100 g si se pesa. Ver `domain/nutrition.js`.
    (clientId, variant, mealIdx, optIdx, food, grams = null) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx
                    ? o
                    : { ...o, foods: [...(o.foods || []), buildFoodEntry(food, grams)] }
                ),
              }
        )
      ),
    [applyMeals]
  );

  const removeFoodFromOption = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx ? o : { ...o, foods: (o.foods || []).filter((f) => f.id !== foodId) }
                ),
              }
        )
      ),
    [applyMeals]
  );

  /** El inverso de `removeFoodFromOption`, para el «Deshacer» del aviso. */
  const restoreFoodInOption = useCallback(
    (clientId, variant, mealIdx, optIdx, food, foodIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) => {
                  if (oi !== optIdx) return o;
                  const foods = [...(o.foods || [])];
                  foods.splice(Math.max(0, Math.min(foodIdx, foods.length)), 0, food);
                  return { ...o, foods };
                }),
              }
        )
      ),
    [applyMeals]
  );

  /**
   * Cambia UN alimento dentro de una opción de una comida.
   *
   * Los cuatro índices son el camino hasta él y son idénticos para cualquier
   * cambio, así que estaban a punto de repetirse veinte líneas por cada campo
   * nuevo. Se extrae una vez y cada acción pone solo lo suyo.
   */
  const patchFood = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, patch) =>
      applyMeals(
        clientId,
        variant,
        (meals) =>
          meals.map((m, i) =>
            i !== mealIdx
              ? m
              : {
                  ...m,
                  options: m.options.map((o, oi) =>
                    oi !== optIdx
                      ? o
                      : {
                          ...o,
                          foods: (o.foods || []).map((f) =>
                            f.id === foodId ? { ...f, ...patch(f) } : f
                          ),
                        }
                  ),
                }
          ),
        { immediate: false }
      ),
    [applyMeals]
  );

  const updateFoodGrams = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, grams) =>
      patchFood(clientId, variant, mealIdx, optIdx, foodId, () => ({
        grams: toNum(grams) ?? 0,
      })),
    [patchFood]
  );

  /**
   * Sustituye UN alimento por otro, en su sitio.
   *
   * Es lo que hace real el intercambio de equivalencias: «este plátano pasa a
   * ser 250 g de manzana». Se conserva el `id` y la posición —cambiar no es
   * quitar y añadir al final, la fila se queda donde el entrenador la puso— y
   * se reescribe la foto entera del alimento: nombre, macros, unidad y gramos.
   *
   * Recibe los campos ya montados (los de `buildFoodEntry`, sin su `id`) y se
   * queda solo con los que una entrada conoce: así el mismo camino sirve para
   * aplicar un equivalente y para deshacerlo pasándole la entrada capturada,
   * sin arrastrar por accidente claves de otro dominio (`category`,
   * `fromCatalog`) dentro de la dieta guardada.
   */
  const swapFood = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, entry) =>
      patchFood(clientId, variant, mealIdx, optIdx, foodId, () => ({
        name: entry.name,
        grams: toNum(entry.grams) ?? 0,
        proteinPer100: entry.proteinPer100,
        carbsPer100: entry.carbsPer100,
        fatsPer100: entry.fatsPer100,
        unitLabel: entry.unitLabel ?? null,
        unitGrams: entry.unitGrams ?? null,
        showAs: entry.showAs === 'units' ? 'units' : 'grams',
      })),
    [patchFood]
  );

  /**
   * ¿Este alimento en concreto lleva equivalencias en la vista del cliente?
   *
   * Es la EXCEPCIÓN, no la regla: la regla la pone el módulo «Equivalencias en
   * la dieta» del protocolo del cliente, y esto la ajusta alimento a alimento
   * —las nueces se cambian por lo que sea, los cornflakes son esos y no otros—.
   * Vive en la entrada de la dieta, como `showAs`, porque es una decisión de
   * ESTE alimento en ESTA comida: el mismo cereal puede llevar margen en el
   * desayuno libre y no llevarlo en la comida de después de entrenar.
   *
   * Se guarda solo el apagado (`equivHidden: true`); lo demás es el estado
   * natural y no ensucia las entradas ya guardadas.
   */
  const setFoodEquivalences = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, visible) =>
      patchFood(clientId, variant, mealIdx, optIdx, foodId, () => ({
        equivHidden: visible ? null : true,
      })),
    [patchFood]
  );

  /**
   * Elige si este alimento se cuenta en gramos o en unidades.
   *
   * Es una preferencia POR ALIMENTO Y POR DIETA, no de la biblioteca: el mismo
   * entrenador escribe «2 huevos» en la dieta de quien cocina y «110 g» en la de
   * quien pesa todo. Que la biblioteca decidiera por los dos obligaría a tener el
   * huevo duplicado.
   *
   * Los gramos no se tocan al cambiar de modo —son la verdad, la unidad es la
   * lente—, así que ir y volver no mueve ni una caloría.
   */
  const setFoodDisplay = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, mode) =>
      patchFood(clientId, variant, mealIdx, optIdx, foodId, () => ({
        showAs: mode === 'units' ? 'units' : 'grams',
      })),
    [patchFood]
  );

  return {
    updateNutrition,
    updateNutritionTargets,
    setHasDayVariants,
    applyRescaledMeals,
    copyVariantMeals,
    copyMealToVariant,
    copyOptionToVariant,
    importDiet,
    addMeal,
    removeMeal,
    restoreMeal,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    addMealOption,
    removeMealOption,
    moveMeal,
    moveFood,
    duplicateOption,
    duplicateMeal,
    addFoodToOption,
    removeFoodFromOption,
    restoreFoodInOption,
    patchFood,
    updateFoodGrams,
    swapFood,
    setFoodEquivalences,
    setFoodDisplay,
  };
};
