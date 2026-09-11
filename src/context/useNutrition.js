import { useCallback } from 'react';

import { toNum } from '@/lib/num';
import {
  addDietDay,
  buildFoodEntry,
  cloneMeal,
  cloneMeals,
  cloneOption,
  duplicateDietDay,
  mealsForVariant,
  moveDietDay,
  moveItem,
  buildMeal,
  buildOption,
  emptyNutrition,
  planDays,
  removeDietDay,
  replaceDietDays,
  renameDietDay,
  setDayMeals,
  setDayTargets,
  setCycleSlot,
  cycleFromSplit,
  withDays,
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

  /**
   * Actualiza el menú de UN día.
   *
   * Dónde vive ese menú —las columnas de siempre o la lista `days`— lo resuelve
   * `setDayMeals` en el dominio, y por eso todo lo de abajo puede hablar de días
   * sin saber nada del esquema. Ver «LOS DÍAS DE LA DIETA».
   */
  const applyMeals = useCallback(
    (clientId, dayId, updater, options) =>
      applyNutrition(
        clientId,
        (n) => {
          const meals = updater(mealsForVariant(n, dayId));
          return meals === null ? n : setDayMeals(n, dayId, meals);
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

  /** Actualiza el objetivo de kcal y macros de UN día. Ver `setDayTargets`. */
  const updateNutritionTargets = useCallback(
    (clientId, dayId, fields, options) =>
      applyNutrition(clientId, (n) => setDayTargets(n, dayId, fields), options),
    [applyNutrition]
  );

  /*
    ══ LOS DÍAS DEL PLAN ══════════════════════════════════════════════════════

    Aquí había un solo verbo, `setHasDayVariants`, y era un interruptor: encendía
    «dos dietas (entreno / descanso)» o las apagaba. Vivía en Ajustes, así que
    añadir un día era buscar una casilla en otro sitio de la pantalla y quitarlo
    era volver a buscarla — y desde la cinta, donde están los días, no había
    forma de quitar el que acababas de añadir.

    Ahora son cuatro verbos y viven donde se ven: añadir, duplicar, renombrar y
    quitar, cada uno colgando del día al que le pasa. La regla de qué significa
    cada uno está en el dominio; esto solo escribe.
  */

  /** Añade un día al final, con el objetivo del día del que sale. */
  const addDietDayTo = useCallback(
    (clientId, { desde = null, name = null } = {}) =>
      applyNutrition(clientId, (n) => addDietDay(n, { desde, name })),
    [applyNutrition]
  );

  /**
   * Un día NUEVO con un menú puesto, en UNA escritura.
   *
   * Es lo que hace falta para repartir un día a varias personas (ver
   * `domain/reparto`): al destinatario se le AÑADE un día y no se le toca
   * ninguno de los que tenga. Va junto y no como `addDietDay` + `setDayMeals`
   * porque entre las dos llamadas el día existe VACÍO —y en el camino hay una
   * escritura a la base y un guardado en cola—, así que un fallo en medio deja
   * un día en blanco en la dieta de alguien.
   *
   * El id del día lo pone `addDietDay` y aquí se lee del resultado: es la única
   * forma de saber cuál es el recién creado sin suponer que es el último.
   */
  const addDietDayWithMeals = useCallback(
    (clientId, { name = null, meals = [] } = {}) =>
      applyNutrition(clientId, (n) => {
        const conDia = addDietDay(n, { name });
        const dias = planDays(conDia);
        const nuevo = dias[dias.length - 1];
        /* `cloneMeals` por lo de siempre: la misma pieza se reparte a ocho, y
           sin ids nuevos las ocho copias compartirían los del original. */
        return setDayMeals(conDia, nuevo.id, cloneMeals(meals));
      }),
    [applyNutrition]
  );

  /**
   * Sustituir la dieta entera: sus días por otros.
   *
   * El ÚNICO verbo de nutrición que borra, y por eso está solo aquí y lo llama
   * un solo sitio —el reparto, después de haberlo avisado por persona—. La
   * regla de qué se conserva vive en `replaceDietDays`; esto solo escribe.
   */
  const replaceDietOf = useCallback(
    (clientId, days) => applyNutrition(clientId, (n) => replaceDietDays(n, days)),
    [applyNutrition]
  );

  /** Duplica un día con su menú entero: el gesto que hace llevadero tener N. */
  const duplicateDietDayOf = useCallback(
    (clientId, dayId) => applyNutrition(clientId, (n) => duplicateDietDay(n, dayId)),
    [applyNutrition]
  );

  const renameDietDayOf = useCallback(
    (clientId, dayId, name) =>
      applyNutrition(clientId, (n) => renameDietDay(n, dayId, name), { immediate: false }),
    [applyNutrition]
  );

  const moveDietDayOf = useCallback(
    (clientId, from, to) => applyNutrition(clientId, (n) => moveDietDay(n, from, to)),
    [applyNutrition]
  );

  /**
   * Quita un día. Quien llama guarda el plan de antes para el «Deshacer»: quitar
   * un día se lleva su menú, y la pareja honesta de eso es poder volver.
   */
  const removeDietDayOf = useCallback(
    (clientId, dayId) => applyNutrition(clientId, (n) => removeDietDay(n, dayId)),
    [applyNutrition]
  );

  /** El reparto del ciclo, casilla a casilla. */
  const setDietCycleSlot = useCallback(
    (clientId, casilla, dayId) => applyNutrition(clientId, (n) => setCycleSlot(n, casilla, dayId)),
    [applyNutrition]
  );

  /**
   * «Repartir por el entreno»: copia el `weeklySplit` del programa —o el patrón del ciclo rotativo— al mapa
   * de la dieta. Se copia UNA VEZ y no queda enlazado — el split es por bloque y los
   * bloques cambian, y una dieta que se recoloca sola es la aplicación decidiendo
   * por el entrenador. Cuando dejen de coincidir, se dice y se vuelve a pulsar.
   */
  const repartirPorElEntreno = useCallback(
    (clientId, slots, { entreno, descanso }) =>
      applyNutrition(clientId, (n) => ({
        ...withDays(n),
        /* Se escribe el mapa ENTERO y no se funde con lo que hubiera: repartir
           por el entreno es contestar todas las casillas de una vez, y dejar
           debajo el reparto de un ciclo anterior sería guardar dos respuestas. */
        week: cycleFromSplit(slots, { entreno, descanso }),
      })),
    [applyNutrition]
  );

  /**
   * Sustituir el menú de un día por uno ya calculado.
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

  /**
   * Trae el menú de un día a otro, dentro del mismo cliente.
   *
   * ── El hueco que cierra ─────────────────────────────────────────────────────
   * Un día nuevo nace vacío, a propósito: «+ día» y «duplicar» son dos gestos y
   * no uno. Pero a partir de ahí los días divergen y hacía falta un camino de
   * vuelta: el entrenador monta seis comidas en el de entreno, va al de descanso
   * y se lo encuentra como lo dejó hace tres semanas. Rehacerlo a mano es media
   * hora por cliente.
   *
   * Y es el caso NORMAL, no el raro: un día de descanso casi nunca es una dieta
   * distinta, es la misma con menos hidratos.
   *
   * ── Qué NO copia, y por qué ─────────────────────────────────────────────────
   * El objetivo de kcal y macros. Es justo lo que distingue a un día de otro —si
   * fueran iguales no habría dos— y arrastrarlo borraría la única cifra que el
   * entrenador ajustó a mano al separarlos.
   *
   * Los identificadores se regeneran (ver `cloneMeals`), para que compartir `id`
   * entre dos días nunca llegue a ser una suposición sobre la que alguien
   * construya.
   */
  const copyVariantMeals = useCallback(
    (clientId, from, to) => {
      if (from === to) return false;
      const source = mealsForVariant(nutritionRef.current[clientId], from);
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
      const source = mealsForVariant(nutritionRef.current[clientId], from)[mealIdx];
      if (!source) return null;

      applyMeals(clientId, to, (meals) => [...meals, cloneMeal(source, { rename: false })]);
      return source.name || 'Comida';
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
        let next = { ...n };
        const variantes = plan?.variants || [];

        if (variantes.some((v) => v.meals?.length)) next.type = 'closed';

        if (plan?.targets) Object.assign(next, toTargetFields(plan.targets));
        if (plan?.steps) next.stepsGoal = plan.steps;
        if (plan?.cardio) next.cardioGoal = plan.cardio;
        if (plan?.notes?.length) next.habitsNotes = [...(n.habitsNotes || []), ...plan.notes];

        /*
          ── A qué DÍA cae cada variante de la hoja ─────────────────────────────
          Por posición y contra los días que el cliente ya tiene: la primera
          variante al primer día, la segunda al segundo. Si la hoja trae dos días
          y esta persona solo tiene uno, se le añade el que falta — si la hoja
          distingue entreno de descanso y el plan no, uno de los dos no se podría
          ni enseñar.

          Lo que NO se hace es al revés: una hoja de un solo día traída a alguien
          con cuatro cae en el primero y los otros tres se quedan como estaban,
          que es lo menos destructivo que se puede hacer sin preguntar.
        */
        for (let i = 0; i < variantes.length; i += 1) {
          if (planDays(next).length <= i) next = addDietDay(next, { name: variantes[i].label || null });
          const dia = planDays(next)[i];
          next = setDayMeals(next, dia.id, variantes[i].meals || []);
          if (variantes[i].targets) {
            next = setDayTargets(next, dia.id, toTargetFields(variantes[i].targets));
          }
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

  /**
   * Ponerle nombre a una alternativa: «Con avena», «Sin lactosa», «Si entreno
   * tarde». Se guarda en el propio menú, sin columna nueva.
   *
   * `immediate: false` como el nombre de la comida: se teclea letra a letra y
   * escribir en la base de datos en cada pulsación no lo merece.
   */
  const renameMealOption = useCallback(
    (clientId, variant, mealIdx, optIdx, name) =>
      applyMeals(
        clientId,
        variant,
        (meals) =>
          meals.map((m, i) =>
            i !== mealIdx
              ? m
              : { ...m, options: m.options.map((o, k) => (k === optIdx ? { ...o, name } : o)) }
          ),
        { immediate: false }
      ),
    [applyMeals]
  );

  /**
   * Las alternativas de una comida, de una vez.
   *
   * ── Por qué hace falta además de `addMealOption` ───────────────────────────
   * Porque pegar una comida COMO OTRA OPCIÓN de esta —«la cena de Marta, como
   * alternativa de esta cena»— es un solo gesto que puede traer dos o tres
   * alternativas, y con las de una en una serían un alta por cada una más un
   * renombrado por cada una: la pantalla parpadearía por los pasos intermedios
   * y el «Deshacer» tendría que rehacerlos al revés y en orden. Aquí el inverso
   * es la lista de antes, que es la misma ley que `setBlockSheetExercises` en el
   * entreno y que `restoreMeal`: lo que se escribe de una vez se deshace de una
   * vez.
   *
   * Una comida SIEMPRE tiene al menos una alternativa —es lo que se lee cuando
   * no hay elección—, así que una lista vacía no se escribe: sería dejar la
   * comida sin nada dentro por un fallo de quien llama, no por una decisión.
   */
  const setMealOptions = useCallback(
    (clientId, variant, mealIdx, options) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) => (i !== mealIdx || !options?.length ? m : { ...m, options }))
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

  /**
   * Añade al final una comida que viene de FUERA de esta lista.
   *
   * ── Por qué no vale `duplicateMeal` ────────────────────────────────────────
   * Aquel lee la comida de la lista en la que escribe, así que solo sabe copiar
   * dentro del mismo menú y del mismo cliente. Desde que hay portapapeles la
   * comida puede venir de otro día, de la otra variante o de otra persona, y lo
   * único que hace falta saber es dónde cae.
   *
   * `cloneMeal` con `rename: false` porque el nombre ya no es ambiguo: «Cena»
   * pegada desde otro cliente es la única «Cena» de esta lista, y marcarla como
   * «(copia)» obligaría a renombrar algo que no se ha duplicado. Los ids sí se
   * renuevan —de eso se encarga `cloneMeal`—, que es lo que impide que la misma
   * comida pegada dos veces comparta identificador.
   */
  /**
   * Una comida al final del menú, y DEVUELVE la que ha quedado puesta.
   *
   * El clon se hace aquí fuera y no dentro del actualizador para poder
   * devolverlo: quien pega necesita saber qué acaba de entrar para que el
   * «Deshacer» del aviso pueda quitar eso y no «la última», que a los seis
   * segundos de vida del aviso puede ser otra cosa. Aplicar dos veces el mismo
   * clon sobre el mismo estado da el mismo resultado, así que ser el mismo
   * objeto no cambia nada.
   */
  const appendMeal = useCallback(
    (clientId, variant, meal) => {
      const puesta = cloneMeal(meal, { rename: false });
      applyMeals(clientId, variant, (meals) => [...meals, puesta]);
      return puesta;
    },
    [applyMeals]
  );

  /** El inverso de pegar: quita por id las que se pusieron, estén donde estén. */
  const removeMealsById = useCallback(
    (clientId, variant, ids) => {
      const fuera = new Set(ids || []);
      return applyMeals(clientId, variant, (meals) => meals.filter((m) => !fuera.has(m.id)));
    },
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

  /**
   * VARIAS entradas de golpe, ya construidas. Es cómo se pone un plato.
   *
   * ── Por qué no vale llamar a la de arriba en un bucle ──────────────────────
   * Por dos motivos, y el segundo es el de verdad:
   *
   *   · Cada llamada persiste, así que un plato de cinco alimentos serían cinco
   *     escrituras del plan entero por un solo gesto.
   *   · Y sobre todo: `addFoodToOption` construye la entrada por dentro, así que
   *     quien llama no sabe qué ids han salido. Poner un plato necesita saberlo
   *     —es lo que permite ofrecer «cuadrarlo» al objetivo de la comida
   *     inmediatamente después, sin adivinar cuáles de las filas eran suyas—.
   *
   * Las entradas llegan hechas (`platoFoods`), que es la otra mitad de lo
   * mismo: se construyen donde se van a necesitar identificadas.
   */
  const addFoodsToOption = useCallback(
    (clientId, variant, mealIdx, optIdx, entries = []) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx ? o : { ...o, foods: [...(o.foods || []), ...entries] }
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
    addDietDay: addDietDayTo,
    addDietDayWithMeals,
    duplicateDietDay: duplicateDietDayOf,
    renameDietDay: renameDietDayOf,
    moveDietDay: moveDietDayOf,
    removeDietDay: removeDietDayOf,
    replaceDiet: replaceDietOf,
    setDietCycleSlot,
    repartirPorElEntreno,
    applyRescaledMeals,
    copyVariantMeals,
    copyMealToVariant,
    importDiet,
    addMeal,
    appendMeal,
    removeMealsById,
    removeMeal,
    restoreMeal,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    addMealOption,
    setMealOptions,
    renameMealOption,
    removeMealOption,
    moveMeal,
    moveFood,
    duplicateOption,
    duplicateMeal,
    addFoodToOption,
    addFoodsToOption,
    removeFoodFromOption,
    restoreFoodInOption,
    patchFood,
    updateFoodGrams,
    swapFood,
    setFoodEquivalences,
    setFoodDisplay,
  };
};
