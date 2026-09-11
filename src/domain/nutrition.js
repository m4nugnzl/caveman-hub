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
import { newId, deepClone } from '@/lib/ids';
import { norm, pluralEs } from '@/lib/texto';
import { MICRO_TARGET_FIELDS, freezeMicros } from './micros';

/**
 * Las columnas heredadas, una por día de los que cabían antes de que los días
 * fueran una lista. Siguen siendo dónde se guarda un plan de uno o dos días:
 * ver el bloque «LOS DÍAS DE LA DIETA» más abajo.
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
  /* Los días, cuando son más de los que caben en las columnas de arriba, y el
     reparto del ciclo. Vacíos hasta que hacen falta: ver «LOS DÍAS DE LA DIETA». */
  days: [],
  week: {},
});

export const TARGET_FIELDS = ['targetKcals', 'proteinGrams', 'carbsGrams', 'fatsGrams'];

/* ==========================================================================
   LOS DÍAS DE LA DIETA
   --------------------------------------------------------------------------
   Un plan tenía EXACTAMENTE dos días, y con el nombre puesto en el esquema:
   `has_day_variants`, `closed_meals_training`, `closed_meals_rest` y el
   objetivo de descanso aparte. Un alto/medio/bajo no cabía y un ciclado de
   hidratos de siete días, tampoco. Y la pareja estaba escrita a mano en cinco
   sitios, así que añadir un tercero no era un cambio: eran cinco.

   Ahora el plan lleva una LISTA, y el reparto de la semana al lado:

       days: [{ id, name, targets: { targetKcals, … }, meals: [ … ] }]
       week: { Lunes: dayId|null, …, Domingo: dayId|null }

   ── La lista se materializa cuando hace falta, y no antes ──────────────────
   Mientras el plan sea uno o dos días con los nombres de siempre, `days` está
   vacío y todo se lee y se escribe en las columnas de siempre: sin la
   migración 0111 aplicada, la aplicación funciona exactamente como hoy. En
   cuanto se añade un tercero, se renombra uno o se reparte el ciclo, `days`
   pasa a ser la única verdad — y el mapeador sigue reflejando los dos primeros
   días en las columnas viejas (`mapNutritionToDb`), para que nada de lo que ya
   lee un plan por su cuenta —la copia de seguridad, la radiografía, un cliente
   con la versión anterior abierta— se quede a ciegas.

   ── El día NO es la opción de la comida ────────────────────────────────────
   El día es qué dieta te toca hoy; la opción es qué versión de este desayuno
   te comes. Confundirlos es lo que obliga a duplicar el plan entero por
   persona.
   ========================================================================== */

/** Objetivo en blanco: los cuatro campos existen siempre, aunque estén a nulo. */
const vacios = () => Object.fromEntries(TARGET_FIELDS.map((k) => [k, null]));

/** ¿Hay alguna de las cuatro cifras puesta? */
const hayObjetivo = (targets) =>
  TARGET_FIELDS.some((k) => targets?.[k] !== null && targets?.[k] !== undefined && targets?.[k] !== '');

/**
 * El objetivo de un día, con lo que de verdad es un objetivo y nada más.
 *
 * ── Y las cuatro del envase, si alguien las ha escrito ────────────────────
 * Fibra, azúcares, saturadas y sal pueden llevar objetivo desde las opciones
 * avanzadas (ver `MICRO_TARGET_FIELDS` en `domain/micros.js`). Van aquí porque
 * son objetivo DEL DÍA como los otros cuatro, y solo se copian **cuando están
 * puestas**: si se sembraran a nulo como las kcal, cada día de cada plan de
 * cada cliente engordaría con cuatro nulos por una opción que casi nadie
 * enciende. La ausencia sigue significando «no lo pautas».
 */
const soloTargets = (raw) => {
  const base = Object.fromEntries(TARGET_FIELDS.map((k) => [k, raw?.[k] ?? null]));
  for (const k of MICRO_TARGET_FIELDS) {
    if (raw?.[k] !== null && raw?.[k] !== undefined && raw?.[k] !== '') base[k] = raw[k];
  }
  return base;
};

export const DAY_NAME_MAX = 40;

/* «Día 3», «Día 4»… El nombre se cambia en su sitio, así que lo único que tiene
   que hacer el de partida es no repetirse ni obligar a teclear para empezar. */
const nombreLibre = (dias) => {
  for (let n = dias.length + 1; ; n += 1) {
    const nombre = `Día ${n}`;
    if (!dias.some((d) => norm(d.name) === norm(nombre))) return nombre;
  }
};

/**
 * Un día nuevo. Hereda el objetivo del día del que sale —lo normal es cambiar
 * los hidratos y poco más—, y el menú NO: si viniera con la comida puesta, «+
 * día» y «duplicar día» serían el mismo gesto con dos nombres.
 */
export const buildDietDay = ({ name = 'Día nuevo', targets = null } = {}) => ({
  id: newId('dia'),
  name,
  targets: targets ? soloTargets(targets) : vacios(),
  meals: [],
});

/** Los días tal y como se leen de las columnas de siempre. */
const diasHeredados = (n) => {
  const principal = soloTargets(n);
  if (!n?.hasDayVariants) {
    return [{ id: 'default', name: 'Dieta única', targets: principal, meals: n?.closedMeals || [] }];
  }
  const rest = n.restTargets || {};
  return [
    { id: 'training', name: 'Días de entreno', targets: principal, meals: n.closedMealsTraining || [] },
    {
      id: 'rest',
      name: 'Días de descanso',
      /* Hereda el de entreno EN CADA CAMPO que no declare, no en bloque: es la
         regla que tenía `targetsFor` y se queda. `restTargets` es un parche del
         objetivo —quien solo baja las kcal deja los macros a nulo—, y fundirlo
         entero borraba la proteína heredada. */
      targets: Object.fromEntries(TARGET_FIELDS.map((k) => [k, rest[k] ?? principal[k]])),
      meals: n.closedMealsRest || [],
    },
  ];
};

const normalizaDia = (dia) => ({
  id: dia?.id || newId('dia'),
  name: dia?.name || 'Día',
  targets: soloTargets(dia?.targets),
  meals: Array.isArray(dia?.meals) ? dia.meals : [],
});

/**
 * LOS DÍAS DEL PLAN, salgan de donde salgan. Es la única puerta: nadie mira
 * `closedMeals*` ni `hasDayVariants` por su cuenta.
 */
export const planDays = (nutrition) =>
  nutrition?.days?.length ? nutrition.days.map(normalizaDia) : diasHeredados(nutrition);

/** Un día por su id. Sin id o con uno que ya no existe, el primero. */
export const dayById = (nutrition, dayId) => {
  const dias = planDays(nutrition);
  return dias.find((d) => d.id === dayId) || dias[0];
};

/** ¿El plan tiene más de un día? */
export const hasSeveralDays = (nutrition) => planDays(nutrition).length > 1;

/**
 * Pasa el plan a la lista, si no lo estaba ya.
 *
 * Los ids de los días heredados se conservan (`default` / `training` / `rest`):
 * son estables, no se repiten y hacen legible un plan a medio migrar. Lo que ya
 * NO significan es en qué columna vive cada uno — el reflejo del mapeador es
 * por posición, porque el día que se quite el primero, el segundo pasa a serlo.
 */
export const withDays = (nutrition) => {
  const base = nutrition || emptyNutrition();
  if (base.days?.length) return base;
  return { ...base, days: planDays(base).map((d) => ({ ...d, meals: deepClone(d.meals) })) };
};

/** Añade un día al final. `desde` es el día del que hereda el objetivo. */
export const addDietDay = (nutrition, { desde = null, name = null } = {}) => {
  const base = withDays(nutrition);
  const origen = desde ? dayById(base, desde) : base.days[base.days.length - 1];
  const dia = buildDietDay({
    name: name || nombreLibre(base.days),
    targets: origen?.targets,
  });
  return { ...base, days: [...base.days, dia], hasDayVariants: true };
};

/**
 * SUSTITUIR LOS DÍAS DE UNA DIETA POR OTROS.
 *
 * ══ Es la única escritura de nutrición que BORRA ═══════════════════════════
 *
 * Todo lo demás del reparto añade, y está escrito el porqué en `reparto.js`:
 * una dieta no tiene lista de planes, así que lo que se pisa no queda en
 * ninguna parte. Existe para «mandar la dieta entera», que es lo que un
 * entrenador hace cuando monta a alguien igual que a otro — y por eso se pide
 * aparte y se avisa por persona antes de llegar aquí.
 *
 * ── Qué se conserva, y no es un detalle ────────────────────────────────────
 *
 * Todo lo que es de la persona y no del plan: sus pautas escritas, sus pasos,
 * su cardio, si ve las equivalencias, y sobre todo SU OBJETIVO. Mandar la misma
 * dieta a ocho no es darles las mismas calorías; los menús llegan ya
 * reescalados (ver `consecuenciaDe`) y los objetivos de los días nuevos se
 * derivan del suyo.
 *
 * ── La proporción, y por qué la proteína no se mueve ───────────────────────
 *
 * Con un alto/bajo, lo que define el plan es la DISTANCIA entre sus días. El
 * primero se queda con el objetivo que el destinatario ya tenía y los demás lo
 * multiplican por su proporción de origen. Dentro de cada uno se mueven las
 * kcal y los HIDRATOS —`carbsFromRest`—, con la proteína y las grasas quietas:
 * es la misma ley que `rescaleMeals` aplica al menú, y tenerla en dos sitios
 * con dos criterios daría un objetivo que no cuadra con su propio menú.
 *
 * ── Y el reparto del ciclo se vacía ──────────────────────────────────────────
 *
 * `week` apunta a ids de días que dejan de existir. Conservarlo dejaría al
 * cliente con un mapa roto —«hoy te toca» sin día al que apuntar—, así que se
 * borra y hay que volver a repartir. La pantalla lo dice antes.
 */
export const replaceDietDays = (nutrition, days = []) => {
  const base = withDays(nutrition || emptyNutrition());
  if (days.length === 0) return base;

  /* Su objetivo, el del primer día que tenía: es lo que NO viaja. Cuelga de
     `.targets` del día, como lo lee `targetsFor`. */
  const suyo = soloTargets(base.days[0]?.targets);
  const kcals = toNum0(suyo.targetKcals);

  const nuevos = days.map((dia, i) => {
    const proporcion = Number(dia.proporcion) || 1;
    /* El primero se queda su objetivo tal cual; sin objetivo puesto no hay nada
       que escalar y los días nuevos nacen con el mismo (vacío) que tenía. */
    const escala = i > 0 && kcals > 0 && proporcion !== 1;
    const suKcal = escala ? Math.round(kcals * proporcion) : 0;
    const targets = escala
      ? {
          ...suyo,
          targetKcals: suKcal,
          carbsGrams:
            carbsFromRest({ kcals: suKcal, protein: suyo.proteinGrams, fats: suyo.fatsGrams }) ??
            suyo.carbsGrams,
        }
      : suyo;

    return {
      ...buildDietDay({ name: dia.name || `Día ${i + 1}`, targets }),
      meals: cloneMeals(dia.meals || []),
    };
  });

  return {
    ...base,
    days: nuevos,
    /* Con más de uno hay variantes; con uno solo, deja de haberlas. Es la misma
       bandera que mantiene el reflejo de las columnas viejas. Ver la 0111. */
    hasDayVariants: nuevos.length > 1,
    week: {},
  };
};

/**
 * Duplica un día con su menú entero.
 *
 * Es el gesto que sostiene N días: un día de descanso casi nunca es otra dieta,
 * es la misma con menos hidratos. Los identificadores de las comidas se
 * regeneran (`cloneMeals`) para que compartir `id` entre dos días no llegue a
 * ser una suposición sobre la que alguien construya.
 */
export const duplicateDietDay = (nutrition, dayId) => {
  const base = withDays(nutrition);
  const origen = dayById(base, dayId);
  if (!origen) return base;
  const copia = {
    ...buildDietDay({ name: `${origen.name} (copia)`, targets: origen.targets }),
    meals: cloneMeals(origen.meals),
  };
  const donde = base.days.findIndex((d) => d.id === origen.id);
  const days = [...base.days];
  days.splice(donde + 1, 0, copia);
  return { ...base, days, hasDayVariants: true };
};

/**
 * Quita un día, con su menú y su objetivo.
 *
 * El último no se puede quitar: un plan sin ningún día no es un plan vacío, es
 * una pantalla sin sitio donde escribir. Y el reparto del ciclo se limpia de las
 * casillas que apuntaban a él, o la semana señalaría a un día que ya no existe.
 */
export const removeDietDay = (nutrition, dayId) => {
  /* Con el plan todavía en las columnas de siempre y dos días, quitar uno lo
     deja en uno: eso ya lo sabe hacer `singleDietFrom`, y así quitar un día
     sigue funcionando sin la migración 0111 aplicada. */
  const heredados = !nutrition?.days?.length && planDays(nutrition);
  if (heredados && heredados.length === 2) {
    const otro = heredados.find((d) => d.id !== dayId);
    return otro ? singleDietFrom(nutrition, otro.id) : nutrition;
  }

  const base = withDays(nutrition);
  if (base.days.length <= 1) return base;
  const days = base.days.filter((d) => d.id !== dayId);
  if (days.length === base.days.length) return base;

  /* Y el reparto se limpia POR VALOR, recorriendo lo guardado: las casillas
     son las del ciclo del cliente —siete días, o los del microciclo— y aquí no
     se tiene delante cuál es. Lo que se busca es a quién apuntaba. */
  const week = Object.fromEntries(
    Object.entries(base.week || {}).map(([k, v]) => [k, v === dayId ? null : v])
  );
  return { ...base, days, week, hasDayVariants: days.length > 1 };
};

export const renameDietDay = (nutrition, dayId, name) => {
  const limpio = String(name || '').trim().slice(0, DAY_NAME_MAX);
  if (!limpio) return nutrition;
  const base = withDays(nutrition);
  return { ...base, days: base.days.map((d) => (d.id === dayId ? { ...d, name: limpio } : d)) };
};

/** Mueve un día en la cinta. Reordenar no cambia a quién le toca qué: `week` manda. */
export const moveDietDay = (nutrition, from, to) => {
  const base = withDays(nutrition);
  const days = moveItem(base.days, from, to);
  return days === base.days ? base : { ...base, days };
};

/**
 * Escribe el menú de un día.
 *
 * Con `days` sin materializar va a su columna de siempre; con la lista puesta,
 * a la lista. Es la única indirección: quien llama dice el día y no dónde vive.
 */
export const setDayMeals = (nutrition, dayId, meals) => {
  const base = nutrition || emptyNutrition();
  /* Se resuelve por `dayById` y no por el id crudo: quien llama trae el día que
     tiene abierto en pantalla, que puede haberse quedado rancio si otro cambio
     rehízo la lista. Escribir contra un id que ya no existe se tragaría el
     cambio en silencio, que es la peor de las tres opciones. */
  const dia = dayById(base, dayId);
  if (base.days?.length) {
    return { ...base, days: base.days.map((d) => (d.id === dia?.id ? { ...d, meals } : d)) };
  }
  return { ...base, [VARIANT_KEY[dia?.id] || VARIANT_KEY.default]: meals };
};

/**
 * Escribe (parcialmente) el objetivo de un día. Ver `setDayMeals`.
 *
 * ── Las cuatro del envase OBLIGAN a materializar la lista ─────────────────
 * Un plan de uno o dos días vive en las columnas de siempre, y ahí no hay
 * columna para la fibra: escribirla al nivel del plan la perdería el mapeador
 * en silencio, que es la peor manera de no guardar algo. `days` es jsonb y
 * guarda lo que se le ponga, así que en cuanto se pauta un micro el plan pasa a
 * la lista. Es lo mismo que ya hacen renombrar un día o repartir el ciclo:
 * la lista se materializa cuando hace falta, y no antes.
 */
export const setDayTargets = (nutrition, dayId, fields) => {
  /* Un micro en blanco es «no lo pautas», y eso se escribe como `null` y no como
     la cadena vacía: `soloTargets` solo deja pasar los que tienen valor, así que
     un `''` guardado sería una clave muerta en el jsonb de todos los días. */
  const limpio = { ...(fields || {}) };
  for (const k of MICRO_TARGET_FIELDS) {
    if (k in limpio && (limpio[k] === '' || limpio[k] === undefined)) limpio[k] = null;
  }
  const pide = MICRO_TARGET_FIELDS.some((k) => limpio[k] !== null && limpio[k] !== undefined);

  const base = pide ? withDays(nutrition || emptyNutrition()) : nutrition || emptyNutrition();
  const dia = dayById(base, dayId);
  if (base.days?.length) {
    return {
      ...base,
      days: base.days.map((d) => (d.id === dia?.id ? { ...d, targets: { ...d.targets, ...limpio } } : d)),
    };
  }
  /* Sin lista materializada no hay dónde guardar un micro —las columnas de
     siempre no lo tienen—, pero aquí ya se sabe que no hay ninguno que guardar:
     con alguno puesto, `withDays` ha materializado la lista más arriba. */
  return dia?.id === 'rest' && base.hasDayVariants
    ? { ...base, restTargets: { ...(base.restTargets || {}), ...limpio } }
    : { ...base, ...limpio };
};

/* ── EL REPARTO DEL CICLO ──────────────────────────────────────────────────
   A qué día de dieta le toca cada casilla del ciclo de esta persona. Un solo
   dato —el mapa `week`— y dos maneras de rellenarlo: a mano, casilla a casilla,
   o de un botón que lo copia del entreno. No es un enlace vivo, y es a
   propósito: el `weeklySplit` es por bloque y los bloques cambian; y un ciclado
   de hidratos no sigue al entreno ni queriendo. Cuando dejen de coincidir se
   DICE, con el botón al lado — la aplicación no recoloca sola la dieta de nadie.

   ══ AQUÍ SE REPARTÍA LA SEMANA, Y ESA ERA LA AVERÍA ═══════════════════════

   Las casillas eran los siete días de la semana, escritos a mano en esta misma
   función. Y funcionaba para quien entrena de lunes a domingo: para un ciclo
   rotativo —«2 entreno / 1 descanso»— no hay martes al que atar nada, así que
   la única pantalla desde la que se reparte una dieta le hacía a esa persona
   una pregunta sin respuesta posible. Un alto/bajo con ciclo rotativo, que es
   la combinación más normal del mundo en un ciclado de hidratos, no se podía
   pautar: el reparto se quedaba vacío y con él la media del ciclo, el aviso de
   que ya no coincide con el entreno y lo que el cliente ve en su portal.

   Ahora la dieta NO SABE de días de la semana. Sabe de casillas, y quién las
   pone es el ciclo del cliente (`cycleSlots`, en `domain/training.js`). Siete
   con nombre de día para el semanal; los días del microciclo con sus descansos
   intercalados para el rotativo. Aquí no hay una segunda rama por tipo de
   ciclo: hay una lista que llega hecha.

   ── La columna se sigue llamando `week`, y no es descuido ──────────────────
   Es jsonb: guardar `{ "1": …, "2": … }` en vez de `{ "Lunes": … }` no le pide
   nada al esquema. Renombrarla costaría una migración sobre una tabla viva para
   cambiar una palabra que solo se lee desde aquí. Lo que sí se corrige es el
   comentario de la 0111, que prometía claves de `WEEK_DAYS`.

   ── Y lo que había repartido un rotativo se queda quieto ───────────────────
   El saneado es de LECTURA: una casilla que ya no existe —un «Lunes» en un
   ciclo rotativo, o un día 9 en un ciclo que se ha quedado en seis— no se
   enseña, pero tampoco se borra de lo guardado. Volver al ciclo semanal
   devuelve el reparto que había, y ese es el mismo trato que la 0111 le da a
   las columnas viejas. */

/**
 * El reparto, con una entrada por casilla y sin días que ya no existen.
 *
 * @param slots `cycleSlots(...)` — quien llama trae el ciclo del cliente.
 */
export const cycleMap = (nutrition, slots = []) => {
  const dias = new Set(planDays(nutrition).map((d) => d.id));
  const raw = nutrition?.week || {};
  return Object.fromEntries(slots.map((s) => [s.key, dias.has(raw[s.key]) ? raw[s.key] : null]));
};

/**
 * ¿Se ha repartido algo? Un mapa vacío no es un reparto: es que no hay.
 *
 * Sin casillas a propósito: lo contesta quien no tiene delante el ciclo del
 * cliente —el reparto a varios lo pregunta de ocho personas a la vez— y para
 * «¿hay algo puesto?» basta con que apunte a un día que exista.
 */
export const hasCycleMap = (nutrition) => {
  const dias = new Set(planDays(nutrition).map((d) => d.id));
  return Object.values(nutrition?.week || {}).some((id) => dias.has(id));
};

export const setCycleSlot = (nutrition, key, dayId) => {
  const base = withDays(nutrition);
  /* Se escribe sobre lo GUARDADO y no sobre el mapa saneado: cambiar el martes
     no puede llevarse por delante el reparto rotativo de esta misma persona. */
  return { ...base, week: { ...(base.week || {}), [key]: dayId } };
};

/**
 * «Repartir por el entreno»: el día de entreno a las casillas con sesión, el de
 * descanso a las vacías. Devuelve el mapa; no escribe nada.
 */
export const cycleFromSplit = (slots = [], { entreno, descanso }) =>
  Object.fromEntries(slots.map((s) => [s.key, s.rest ? descanso ?? null : entreno ?? null]));

/** ¿El reparto de la dieta dice lo mismo que el del entreno? */
export const cycleMatchesSplit = (nutrition, slots = [], { entreno, descanso }) => {
  const mapa = cycleMap(nutrition, slots);
  const segunEntreno = cycleFromSplit(slots, { entreno, descanso });
  return slots.every((s) => mapa[s.key] === segunEntreno[s.key]);
};

/**
 * LA MEDIA DEL CICLO PONDERADA: lo que come esta persona en una vuelta de su
 * ciclo, dividido entre los días que tiene.
 *
 * ══ Por qué es la única cifra que dice algo con varios días ════════════════
 * En un alto/bajo, ni el alto ni el bajo son «sus calorías». Sin reparto no se
 * podía calcular sin adivinar cuántos días entrena; con el mapa es aritmética.
 * Sin reparto devuelve `null` y no se inventa nada.
 */
export const cycleAverage = (nutrition, slots = []) => {
  const mapa = cycleMap(nutrition, slots);
  const acc = { targetKcals: 0, proteinGrams: 0, carbsGrams: 0, fatsGrams: 0 };
  let puestos = 0;

  for (const s of slots) {
    const dia = mapa[s.key] ? dayById(nutrition, mapa[s.key]) : null;
    if (!dia) continue;
    puestos += 1;
    for (const k of TARGET_FIELDS) acc[k] += toNum0(dia.targets?.[k]);
  }

  if (puestos === 0) return null;
  /* Se divide entre los días REPARTIDOS y no entre los del ciclo: medio ciclo
     repartido dividido entre todo diría que come la mitad de lo que come. */
  return {
    days: puestos,
    ...Object.fromEntries(TARGET_FIELDS.map((k) => [k, Math.round(acc[k] / puestos)])),
  };
};

/**
 * LA FOTO DEL PLAN: lo que come esta persona, en cuatro cifras y con los días
 * de los que salen.
 *
 * ══ La avería que cierra ═══════════════════════════════════════════════════
 *
 * «No tiene mucho sentido que las gráficas muestren tanto high como low y la
 * media, pero le des clic a la gráfica principal de kcals y solo muestre high.»
 *
 * Y era literal. Todo lo que guarda un histórico de la dieta —la foto de cada
 * pesaje (`buildAnthropometryLog`), la de cada revisión cerrada (`planSnapshot`)
 * y con ellas la escalera del Resumen, la de la revisión y la ventana de la
 * evolución— leía `nutrition.targetKcals`, que es la columna heredada, que es
 * **el primer día del plan**. En un alto/bajo, siempre el alto. Sin decirlo.
 *
 * Así que el costado decía «High 3.100, Low 2.400, de media 2.867» y la gráfica
 * de al lado dibujaba una raya en 3.100 rotulada «las kcal que tenía pautadas».
 * De las tres cifras, la única que la persona no come ningún día.
 *
 * ══ Qué se guarda ahora ════════════════════════════════════════════════════
 *
 * Las cuatro cifras de cabecera son **la media ponderada del ciclo** cuando el
 * ciclo está repartido —la única que significa algo en un ciclado, y la misma
 * que ya da `cycleAverage` en el costado— y el día que haya cuando no lo está,
 * porque sin reparto no se puede ponderar sin adivinar. `de` dice cuál de las
 * dos es, para que ninguna pantalla tenga que suponerlo.
 *
 * Y debajo van los días con lo que pide cada uno, que es lo que permite que la
 * gráfica pueda contestar de dónde salía esa media sin volver a la dieta de
 * hoy —que ya no es la de entonces—.
 *
 * ── Lo viejo se sigue leyendo como lo que era ─────────────────────────────
 * Una foto guardada antes de esto no tiene `days` ni `de`: es una cifra suelta
 * y quien la pinte la trata como lo que siempre fue. No se reescribe nada
 * hacia atrás: inventar la media de julio con el reparto de hoy sería peor que
 * el escalón que falta.
 *
 * @param slots `cycleSlots(...)`. Sin ellos no hay reparto que ponderar.
 */
export const cycleFoto = (nutrition, slots = []) => {
  const dias = planDays(nutrition);
  if (dias.length === 0) return null;

  const mapa = cycleMap(nutrition, slots);
  const media = cycleAverage(nutrition, slots);
  const cabeza = media || soloTargets(dias[0].targets);
  const cifras = TARGET_FIELDS.map((k) => toNum(cabeza[k]));

  /*
    Un plan sin una sola cifra no deja foto. La regla es de `planSnapshot` —«las
    claves vacías no se guardan: una foto llena de nulos ocupa lo mismo que una
    con datos y hace creer que se midió algo que no existía»— y se cumple aquí,
    que es donde nace la foto: si no, cada cliente sin dieta arrastraría el
    nombre de su día y una lista de nulos en cada pesaje.
  */
  if (cifras.every((v) => v === null)) return null;

  return {
    kcals: cifras[0],
    protein: cifras[1],
    carbs: cifras[2],
    fats: cifras[3],
    /*
      De dónde salen las cuatro de arriba: la media del ciclo o un día suelto
      —y entonces cuál—. Sin esto, «2.867 kcal» y «3.100 kcal» se leen igual.

      Con UN SOLO DÍA no se dice nada: no hay ambigüedad que deshacer, y una
      foto de cada pesaje de cada cliente repitiendo «de: dia, dia: Dieta
      única» es ruido en la columna de todo el mundo para el caso en el que no
      hay pregunta.
    */
    de: dias.length > 1 ? (media ? 'media' : 'dia') : null,
    dia: dias.length > 1 && !media ? dias[0].name : null,
    reparto: media ? media.days : null,
    /* Recortado a lo que se lee: nombre, cifras y cuántas casillas le tocan. El
       menú NO viaja aquí — la foto de la revisión ya lo guarda aparte y con su
       presupuesto (ver `planSnapshot`).

       Y se llama `cycle` y no `days`: en las fotos de revisión `days` es una
       forma ANTIGUA de guardar los días del PROGRAMA, que `semanasDe` sigue
       aceptando por compatibilidad. Dos cosas distintas con el mismo nombre en
       la misma columna serían días de entreno leídos como días de dieta.

       Y solo con MÁS DE UNO: la lista de un plan de un día repite las cifras de
       arriba con otro nombre. */
    cycle: dias.length < 2 ? null : dias.map((d) => ({
      n: String(d.name || '').slice(0, DAY_NAME_MAX),
      kcals: toNum(d.targets?.targetKcals),
      protein: toNum(d.targets?.proteinGrams),
      carbs: toNum(d.targets?.carbsGrams),
      fats: toNum(d.targets?.fatsGrams),
      x: slots.filter((s) => mapa[s.key] === d.id).length || null,
    })),
  };
};

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

  /*
    Se mira por los DÍAS —con la lista materializada, las columnas de siempre
    solo llevan el reflejo de los dos primeros, y preguntarles a ellas diría
    «vacía» de un plan de cuatro—, y ADEMÁS por las columnas crudas.

    Lo segundo no es cinturón y tirantes: hay planes con `has_day_variants` en
    falso y menú escrito en `closed_meals_training`, porque apagar «dos dietas»
    fue durante mucho tiempo bajar la bandera y nada más. `planDays` no los
    devuelve —y hace bien, son días que no se enseñan—, pero siguen siendo dos
    menús montados a mano. Y de esta respuesta cuelga si copiar la dieta de otro
    cliente avisa de que va a SUSTITUIR algo: darla por vacía es borrarlos sin
    decirlo.
  */
  const dias = planDays(plan);
  const columnas = [plan.closedMeals, plan.closedMealsTraining, plan.closedMealsRest];

  return (
    dias.every((dia) => !hayObjetivo(dia.targets) && (dia.meals || []).length === 0) &&
    columnas.every((lista) => (lista || []).length === 0) &&
    !hayObjetivo(plan.restTargets) &&
    String(plan.stepsGoal || '').trim() === '' &&
    String(plan.cardioGoal || '').trim() === '' &&
    (plan.habitsNotes || []).length === 0
  );
};

/**
 * Objetivo calórico y de macros de UN día.
 *
 * ── Por qué cada día lleva el suyo ──────────────────────────────────────────
 * Porque es justo lo que distingue a un día de otro: en uno de descanso cambian
 * las calorías y el reparto de macros, que es el motivo de separarlos. Un solo
 * objetivo para todos los días haría que la cifra mostrada fuera incorrecta en
 * todos menos uno.
 *
 * Los pasos van con el objetivo aunque sean del PLAN y no del día —lo que esta
 * persona camina no depende de si hoy entrena—: se devuelven aquí porque quien
 * pinta un objetivo los pinta al lado, y separarlos obligaría a pasar dos cosas
 * a todas partes.
 */
export const targetsFor = (nutrition, dayId) => ({
  ...soloTargets(dayById(nutrition, dayId)?.targets),
  stepsGoal: nutrition?.stepsGoal ?? '',
});

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
 * Cómo se llama una alternativa de comida.
 *
 * ══ Por qué las opciones se nombran ════════════════════════════════════════
 *
 * «Opción 1» y «Opción 2» es vocabulario del sistema: dice DÓNDE está la cosa
 * en una lista, no qué es. Y lo lee el cliente, que es quien tiene que elegir
 * una: entre «Opción 1» y «Opción 2» no hay nada que decidir; entre «Con
 * avena» y «Con tostada», sí. Al entrenador le pasa lo mismo montando una
 * comida de tres alternativas.
 *
 * El nombre es OPCIONAL y vive en el propio jsonb del menú, así que no hay
 * columna nueva ni migración: sin él se cae al ordinal de siempre, que es la
 * respuesta correcta para las miles de opciones que ya existen sin nombre y
 * para la que se acaba de crear.
 */
export const optionName = (option, index) => {
  const propio = String(option?.name ?? '').trim();
  return propio || `Opción ${index + 1}`;
};

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
    /*
      Y las cuatro del envase, congeladas igual que los macros y por el mismo
      motivo: la entrada es una foto. Solo se escriben las que el alimento
      DECLARA — lo que falta significa «no dice», así que una dieta montada
      antes de la 0102 se comporta como una de hoy con un alimento que no lo
      dice, en vez de mentir con un cero. Ver `micros.js`.
    */
    ...freezeMicros(food),
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
  /* El nombre viaja con la copia. Duplicar «Con avena» para cambiarle una cosa
     tiene que dar otra «Con avena» —y renombrarla es un gesto—, no una «Opción
     2» sin apellido. Sin nombre no se escribe la clave: ver `optionName`. */
  ...(String(option?.name ?? '').trim() ? { name: option.name } : {}),
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
 * «2 huevos», «1 rebanada», «1,5 cucharadas», «3 unidades».
 *
 * El plural se hacía añadiendo una «s», con este argumento: «una etiqueta que
 * acabe en consonante la escribe el entrenador y la ve él». Era falso, y lo
 * desmiente el catálogo de la casa: DIECISÉIS de sus alimentos tienen «unidad»
 * por unidad, así que la aplicación decía «3 unidads» a todo el mundo —al
 * entrenador y a su cliente— y «2 dátils» al que desayunara dátiles.
 *
 * Las reglas del castellano están en `pluralEs` (`lib/texto.js`), que es donde
 * viven las cosas del idioma y no de la nutrición.
 */
export const unitsLabel = (entry) => {
  const units = foodUnits(entry);
  if (units === null) return null;
  const nombre = units === 1 ? entry.unitLabel : pluralEs(entry.unitLabel);
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

/** Nº de comidas configuradas, sumando todos los días del plan. */
export const mealsConfigured = (nutrition) =>
  planDays(nutrition).reduce((total, dia) => total + (dia.meals?.length || 0), 0);

/** Lista de comidas de un día. */
export const mealsForVariant = (nutrition, dayId) => dayById(nutrition, dayId)?.meals || [];

/**
 * VOLVER A UNA SOLA DIETA QUEDÁNDOSE CON UNA DE LAS DOS.
 *
 * ══ Lo que pasaba antes ════════════════════════════════════════════════════
 *
 * Apagar «dos dietas» no era más que bajar la bandera. El menú único vive en
 * `closedMeals` y los de las variantes en `closedMealsTraining` /
 * `closedMealsRest`, así que al apagarla la pantalla volvía a enseñar
 * `closedMeals`: lo que hubiera ANTES de separarlas, normalmente nada. Las dos
 * dietas montadas seguían guardadas —no se borraba nada— pero no había ninguna
 * puerta para volver a verlas, y desde fuera eso es exactamente perderlas: el
 * entrenador se encuentra la pantalla en blanco y vuelve a montar el menú de
 * cero.
 *
 * Y no era solo el menú. El objetivo de los días de descanso vive en
 * `restTargets`, así que quedarse con la dieta de descanso significaba también
 * subir esas kcal y esos macros a las columnas principales, que son las que lee
 * un plan sin variantes.
 *
 * ══ Lo que hace ════════════════════════════════════════════════════════════
 *
 * La variante elegida PASA A SER la dieta única —su menú y, si es la de
 * descanso, también su objetivo— y las dos listas de variante se vacían.
 *
 * Vaciarlas es parte del trato, no un descuido: mientras siguieran ahí, volver
 * a encender «dos dietas» resucitaría los menús de antes en vez de partir de
 * la dieta que hay ahora, y el entrenador se encontraría con una tercera
 * versión que no escribió. Una sola dieta significa una sola fuente.
 *
 * Quien llama tiene que haber preguntado cuál se queda: aquí no se adivina.
 */
export const singleDietFrom = (nutrition, variant) => {
  const base = nutrition || emptyNutrition();
  const dia = dayById(base, variant);

  return {
    ...base,
    /* El objetivo del día elegido SUBE a las columnas principales: son las que
       lee un plan de un solo día, y quedarse con el de descanso sin subirlo
       dejaba las kcal del de entreno con el menú del otro. */
    ...soloTargets(dia?.targets),
    hasDayVariants: false,
    restTargets: null,
    days: [],
    week: {},
    closedMeals: cloneMeals(dia?.meals || []),
    closedMealsTraining: [],
    closedMealsRest: [],
  };
};
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
/**
 * A QUIÉNES LES DAS CADA ALIMENTO —y, contando, en cuántas dietas está.
 *
 * ══ Para qué sirve una cifra así ═══════════════════════════════════════════
 *
 * Es lo que convierte una biblioteca en algo que se puede podar. El camino de
 * crecimiento de `foods` **es** la duplicación —los macros de tu marca obligan a
 * un nombre nuevo, porque `upsertByName` identifica por nombre— así que antes o
 * después hay dos «Pan integral» parecidos, y el que se queda es el que de
 * verdad usas.
 *
 * ── Y no cuesta una consulta ───────────────────────────────────────────────
 * Los `nutrition_plans` de TODOS los clientes ya se cargan al arrancar (ver el
 * proveedor), así que esto es una vuelta sobre datos que están en memoria. Con
 * sesenta clientes, seis comidas y seis alimentos son ~2.000 iteraciones: se
 * memoriza en la pantalla por si la cartera crece, no porque hoy pese.
 *
 * ── Cuenta DIETAS, no apariciones ──────────────────────────────────────────
 * Un alimento que sale en el desayuno y en la merienda de la misma persona es
 * UNA dieta. «Se usa en 14 dietas» responde a «cuánta gente come esto», que es
 * la pregunta; «se usa 38 veces» no responde a nada.
 *
 * Mira TODOS los días del plan: un
 * alimento que solo aparece los días de descanso se usa igual.
 *
 * ══ Y devuelve QUIÉNES, no cuántos ═════════════════════════════════════════
 *
 * Contaba dietas y punto, y la cifra salía en gris al pie de la ficha: «se usa
 * en 4 dietas». Eso no es accionable — para saber a quién le tocas la dieta si
 * corriges los macros de algo hay que abrir a los catorce y buscar.
 *
 * La misma vuelta que ya se daba devuelve ahora los identificadores, y contar
 * es `.length`. No cuesta nada más: el bucle era el mismo y los planes ya están
 * en memoria. Que la ficha pueda decir «Javier, Marta y dos más» en vez de «4»
 * es la diferencia entre un dato y una puerta.
 *
 * @param nutritionByClient  El mapa del proveedor: `{ [clientId]: plan }`.
 * @returns `Map` de nombre normalizado → ids de cliente, en el orden en que
 *   aparecen. Sin repetidos: un alimento en dos comidas de la misma persona es
 *   una dieta, no dos.
 */
export const foodClientsByName = (nutritionByClient = {}) => {
  const quienes = new Map();

  for (const [clientId, plan] of Object.entries(nutritionByClient || {})) {
    if (!plan) continue;
    /* Por plan y no global: el mismo alimento en dos comidas suyas no son dos
       dietas. Se acumula al terminar cada uno. */
    const enEstaDieta = new Set();

    /* Los días del plan Y las columnas crudas, por lo mismo que `isEmptyDiet`:
       un alimento que solo está en un menú de variante apagado sigue estando en
       la dieta de esa persona el día que se vuelva a encender. Repetir no cuesta
       nada aquí, porque lo que se acumula es un conjunto de nombres. */
    const menus = [
      ...planDays(plan).map((d) => d.meals || []),
      plan.closedMeals || [],
      plan.closedMealsTraining || [],
      plan.closedMealsRest || [],
    ];

    for (const menu of menus) {
      for (const meal of menu) {
        for (const option of meal?.options || []) {
          for (const food of option?.foods || []) {
            const nombre = norm(String(food?.name || '').trim());
            if (nombre) enEstaDieta.add(nombre);
          }
        }
      }
    }

    for (const nombre of enEstaDieta) {
      const ya = quienes.get(nombre);
      if (ya) ya.push(clientId);
      else quienes.set(nombre, [clientId]);
    }
  }

  return quienes;
};

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

/* ══════════════════════════════════════════════════════════════════════════
   EL SEMÁFORO, Y VIVE AQUÍ
   ══════════════════════════════════════════════════════════════════════════

   ── Lo que fallaba: el margen era RELATIVO y nada más ──────────────────────
   Cuadrar contra un objetivo se juzgaba con el 5 % de lo pautado, así que 620
   kcal se medían con ±31 y 4 g de grasa con ±0,2. Una comida con 4 g de grasa
   pautados NO podía estar en verde nunca. Medido en un plan que el propio
   entrenador acababa de cuadrar: 17 de 20 celdas marcadas en ámbar o rojo. Eso
   no es señalar, es reñir — y la ley de la casa dice que aquí no se riñe.

   Con suelo —`máx(5 %, 3 g)` y `máx(5 %, 25 kcal)`— esas 17 celdas bajan a 6, y
   las 6 son desvíos de verdad (23 g de grasa donde se pidieron 9).

   ── Y estaba escrito CUATRO veces ─────────────────────────────────────────
   `estadoDe` en `MealCard`, otro `estadoDe` idéntico en `PlanDia`, `tono` en
   `DiaPopup` y `estadoMacro` en `macros.jsx`, más el 5 % suelto de `optionGaps`
   y el de `DiaResumen` (que ya no existe: su lectura vive en `ObjetivoDelDia`). Arreglar el margen en una sola dejaba media pantalla
   riñendo con la otra mitad, así que el suelo entra por aquí y todas beben de
   esta función. Cualquier pieza que juzgue una cifra contra su objetivo llama a
   `estadoDe`; ninguna vuelve a escribir un 0,05.                             */

/** El suelo del margen, por campo. En gramos y en kilocalorías. */
export const SUELO_MARGEN = { kcals: 25, protein: 3, carbs: 3, fats: 3 };

/** El margen dentro del cual una cifra cuadra: el 5 %, pero nunca menos que el suelo. */
export const margenDe = (objetivo, campo = 'kcals') =>
  Math.max(Math.abs(toNum0(objetivo)) * 0.05, SUELO_MARGEN[campo] ?? SUELO_MARGEN.protein);

/**
 * El veredicto sobre una DIFERENCIA ya calculada: `'ok' | 'over' | 'under'`, o
 * `'none'` cuando no hay objetivo contra el que juzgar —que no es lo mismo que
 * cuadrar—.
 */
export const estadoDeDiff = (diff, objetivo, campo = 'kcals') => {
  const meta = toNum0(objetivo);
  if (!meta) return 'none';
  const margen = margenDe(meta, campo);
  return diff > margen ? 'over' : diff < -margen ? 'under' : 'ok';
};

/** Lo mismo, con lo real y lo pautado. */
export const estadoDe = (real, objetivo, campo = 'kcals') =>
  estadoDeDiff(toNum0(real) - toNum0(objetivo), objetivo, campo);

/** `' is-ok'`, `' is-over'`, `' is-under'` o cadena vacía, para pegar a una clase. */
export const claseDe = (real, objetivo, campo = 'kcals') => {
  const estado = estadoDe(real, objetivo, campo);
  return estado === 'none' ? '' : ` is-${estado}`;
};

/** ¿Cuadra? Sin objetivo no cuadra ni descuadra: no hay pregunta. */
export const cuadra = (real, objetivo, campo = 'kcals') => estadoDe(real, objetivo, campo) === 'ok';

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

/* ══════════════════════════════════════════════════════════════════════════
   «CUADRA» TIENE QUE DECIR DE QUÉ
   ══════════════════════════════════════════════════════════════════════════

   Medido en la pantalla: la fila de mando decía «el reparto cuadra» mirando
   SOLO las kilocalorías, y en esa misma pantalla la proteína repartida eran
   204 g contra un objetivo de 156. Las dos cosas eran ciertas y la palabra
   «cuadra» se estaba gastando en la mitad de la pregunta.

   Un reparto cuadra cuando cuadran los CUATRO números. Y cuando no, dice
   cuál — que es lo que convierte un veredicto en una lectura.                */

const NOMBRE_CAMPO = { kcals: 'kcal', protein: 'P', carbs: 'C', fats: 'G' };
const CAMPO_DEL_PLAN = {
  kcals: 'targetKcals',
  protein: 'proteinGrams',
  carbs: 'carbsGrams',
  fats: 'fatsGrams',
};

/** Lo repartido entre las comidas frente al objetivo del día, campo a campo. */
export const repartoDelDia = (meals, targets) => {
  const total = mealTargetsTotal(meals, targets?.targetKcals);
  const estados = {};
  const fuera = [];

  for (const key of TARGET_KEYS) {
    estados[key] = estadoDe(total[key], targets?.[CAMPO_DEL_PLAN[key]], key);
    if (estados[key] === 'over' || estados[key] === 'under') fuera.push(key);
  }

  return { ...total, estados, fuera, cuadra: total.meals > 0 && fuera.length === 0 };
};

/**
 * El veredicto del reparto, dicho. `null` cuando no hay nada que decir —sin
 * comidas repartidas o sin objetivo, callar es la respuesta correcta—.
 */
export const vozDelReparto = (reparto) => {
  if (!reparto || reparto.meals === 0) return null;

  const macros = reparto.fuera.filter((key) => key !== 'kcals');
  const cola = macros.length > 0 ? `no cuadra en ${macros.map((k) => NOMBRE_CAMPO[k]).join(' ni ')}` : '';

  if (reparto.estados.kcals === 'none') return cola || null;
  if (reparto.estados.kcals === 'ok') return cola ? `cuadra en kcal, ${cola}` : 'el reparto cuadra';

  const kcal =
    reparto.left > 0
      ? `quedan ${reparto.left} kcal por repartir`
      : `el reparto se pasa ${Math.abs(reparto.left)} kcal`;
  return cola ? `${kcal} · ${cola}` : kcal;
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
      /* El mismo margen que el resto de la pantalla, con su suelo: cuadrar a la
         kilocaloría exacta con alimentos reales no es posible, y un aviso que
         nunca se apaga se deja de mirar. Ver `estadoDe`. */
      tone: estadoDeDiff(diff.kcals, target.kcals, 'kcals'),
    };
  });
};

/**
 * REESCALAR EL MENÚ al objetivo que el entrenador acaba de poner.
 *
 * ══ Qué es y qué no es ══════════════════════════════════════════════════════
 *
 * No es una propuesta: el número lo puso el entrenador al cambiar el objetivo.
 * Esto es la aritmética que venía haciendo a mano después — recuadrar los
 * gramos de cada opción de cada comida—, que con tres comidas de cuatro
 * alternativas son veinte filas cada dos o tres semanas.
 *
 * ══ Las reglas ══════════════════════════════════════════════════════════════
 *
 *   · LA PROTEÍNA NO SE TOCA. Un alimento cuya energía es proteína en más de
 *     la mitad (pollo, claras, pescado blanco…) es una fuente de proteína, y
 *     en un ajuste calórico la proteína se mantiene: se escalan hidratos y
 *     grasas, que es como se ajusta una dieta de verdad. Ajustando POR HIDRATOS
 *     (`fromCarbs`/`toCarbs`) solo se mueve la fuente de hidratos y las grasas
 *     también se quedan — ver `MEDIDAS`.
 *   · LO QUE SE CUENTA POR UNIDADES NO SE TOCA. «1 plátano» no puede volverse
 *     0,8 plátanos; si el entrenador quiere quitarlo, lo quita él.
 *   · CADA OPCIÓN A SU PROPORCIÓN. Todas las alternativas de una comida bajan
 *     en la misma proporción que el día, así que siguen siendo equivalentes
 *     entre sí después del ajuste.
 *   · REDONDEO DE COCINA: a 5 g desde 25 g, al gramo por debajo. Un menú con
 *     «87,3 g de arroz» no lo pesa nadie.
 *
 * ── Cuándo se rinde, y lo dice ──────────────────────────────────────────────
 * Una opción hecha solo de proteína y unidades no tiene de dónde recortar; y
 * un factor fuera de 0,25–4 ya no es un ajuste, es otra dieta. Esas opciones
 * se quedan como están y salen en `sinTocar`, para que la vista previa lo
 * cuente en vez de callar.
 *
 * @returns `{ meals, cambios, sinTocar, ratio }`, o `null` si no hay nada que
 *   reescalar (sin objetivo previo, sin cambio, o sin ningún gramo que mover).
 */
/**
 * LAS DOS MEDIDAS CON LAS QUE SE REESCALA, y quién no se mueve en cada una.
 *
 * ── Por qué hay una segunda ────────────────────────────────────────────────
 * Con un solo día, ajustar es «de 3.100 a 2.900 kcal» y se recorta de todo lo
 * que no es proteína. Con varios días la operación real es otra: duplicas
 * «Alto» y le quitas cien gramos de HIDRATOS, con la proteína y las grasas
 * clavadas — que es lo que hace que los dos días sigan siendo la misma dieta.
 * Sobre kcal, ese ajuste tocaría el aceite y el pescado, que es justo lo que
 * un ciclado no quiere mover.
 */
const MEDIDAS = {
  kcals: {
    unidad: 'kcal',
    valor: (m) => m.kcal,
    /* Quieta: la fuente de proteína —más de la mitad de su energía— y lo que se
       cuenta por unidades. */
    quieta: (m) => m.kcal > 0 && (m.protein * 4) / m.kcal >= 0.5,
    sinNada: 'no tiene hidratos ni grasas que mover',
  },
  carbs: {
    unidad: 'g de hidratos',
    valor: (m) => m.carbs,
    /* Aquí se mueve SOLO la fuente de hidratos: lo demás se queda, incluidas
       las grasas, que en el reescalado por kcal sí bajaban. */
    quieta: (m) => !(m.kcal > 0 && (m.carbs * 4) / m.kcal >= 0.5),
    sinNada: 'no tiene ninguna fuente de hidratos que mover',
  },
};

export const rescaleMeals = (meals = [], { fromKcals, toKcals, fromCarbs, toCarbs } = {}) => {
  const porHidratos = fromCarbs !== undefined || toCarbs !== undefined;
  const medida = porHidratos ? MEDIDAS.carbs : MEDIDAS.kcals;
  const from = toNum0(porHidratos ? fromCarbs : fromKcals);
  const to = toNum0(porHidratos ? toCarbs : toKcals);
  if (!from || !to || from === to || meals.length === 0) return null;
  const ratio = to / from;

  const cambios = [];
  const sinTocar = [];

  const fija = (f) => f.showAs === 'units' || medida.quieta(foodMacros(f));

  const nuevas = meals.map((meal) => ({
    ...meal,
    options: (meal.options || []).map((option, optIndex) => {
      const total = medida.valor(optionMacros(option));
      if (total <= 0) {
        if ((option.foods || []).length > 0) sinTocar.push({ meal: meal.name, option: optIndex + 1 });
        return option;
      }

      const kcalFijas = (option.foods || [])
        .filter(fija)
        .reduce((n, f) => n + medida.valor(foodMacros(f)), 0);
      const kcalVariables = total - kcalFijas;
      /* El factor de lo variable: lo que tiene que moverse para que la opción
         entera quede en su proporción, con lo fijo quieto. */
      const factor = kcalVariables > 1 ? (total * ratio - kcalFijas) / kcalVariables : null;

      if (factor === null || factor < 0.25 || factor > 4) {
        sinTocar.push({ meal: meal.name, option: optIndex + 1 });
        return option;
      }

      const foods = (option.foods || []).map((f) => {
        if (fija(f)) return f;
        const gramos = toNum0(f.grams) * factor;
        const paso = gramos >= 25 ? 5 : 1;
        const nuevos = Math.max(paso, Math.round(gramos / paso) * paso);
        if (nuevos === toNum0(f.grams)) return f;
        cambios.push({ meal: meal.name, option: optIndex + 1, food: f.name, from: toNum0(f.grams), to: nuevos });
        return { ...f, grams: nuevos };
      });
      return { ...option, foods };
    }),
  }));

  if (cambios.length === 0) return null;
  return { meals: nuevas, ratio, cambios, sinTocar, medida: porHidratos ? 'carbs' : 'kcals', unidad: medida.unidad, sinNada: medida.sinNada };
};
