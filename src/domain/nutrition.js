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
import { todayISO } from '@/lib/dates';
import { MICRO_TARGET_FIELDS, freezeMicros } from './micros';
/* El comparador de nombres, de su módulo y no de `foodEquiv`: ése importa de
   aquí, y pedirle la categoría cerraría el círculo. Es la misma función que usan
   las equivalencias, así que la cesta y ellas resuelven igual. */
import { matchFood } from './foodMatch';
/* `training` no sabe nada de dietas, así que no hay ciclo: la capa de debajo es
   ella. Lo que se trae es el calendario del ciclo —qué día es hoy— que es de
   quien reparte el entreno, no de quien reparte la comida. */
import { claveDelDia } from './training';

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

/**
 * LOS OBJETIVOS QUE VA A TENER CADA DÍA al recibir una dieta entera.
 *
 * Es la mitad de `replaceDietDays` que hace falta ANTES de escribir nada: el
 * reparto lleva cada menú a lo pautado de su día, y ese «lo pautado» tiene que
 * ser EXACTAMENTE el que se va a guardar con él. Calculado en dos sitios con
 * dos criterios, el plan acabaría diciendo una cifra y su propio menú sumando
 * otra — que es la avería que el reajuste del menú acaba de curar. Ver
 * `reparto.js`.
 */
export const targetsAlRecibir = (nutrition, days = []) => {
  const base = withDays(nutrition || emptyNutrition());
  /* Su objetivo, el del primer día que tenía: es lo que NO viaja. Cuelga de
     `.targets` del día, como lo lee `targetsFor`. */
  const suyo = soloTargets(base.days[0]?.targets);
  const kcals = toNum0(suyo.targetKcals);

  return days.map((dia, i) => {
    const proporcion = Number(dia?.proporcion) || 1;
    /* El primero se queda su objetivo tal cual; sin objetivo puesto no hay nada
       que escalar y los días nuevos nacen con el mismo (vacío) que tenía. */
    const escala = i > 0 && kcals > 0 && proporcion !== 1;
    if (!escala) return suyo;

    const suKcal = Math.round(kcals * proporcion);
    return {
      ...suyo,
      targetKcals: suKcal,
      carbsGrams:
        carbsFromRest({ kcals: suKcal, protein: suyo.proteinGrams, fats: suyo.fatsGrams }) ??
        suyo.carbsGrams,
    };
  });
};

export const replaceDietDays = (nutrition, days = []) => {
  const base = withDays(nutrition || emptyNutrition());
  if (days.length === 0) return base;

  const objetivos = targetsAlRecibir(base, days);
  const nuevos = days.map((dia, i) => ({
    ...buildDietDay({ name: dia.name || `Día ${i + 1}`, targets: objetivos[i] }),
    meals: cloneMeals(dia.meals || []),
  }));

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
  /* Una casilla en blanco es «no lo pautas», y eso se escribe como `null` y no
     como la cadena vacía. Dos motivos, uno por destino:
       · en el jsonb de `days`, `soloTargets` solo deja pasar lo que tiene valor,
         así que un `''` guardado sería una clave muerta en todos los días;
       · en las columnas de siempre —`target_kcals`, `protein_grams`…— el `''`
         llega tal cual a una columna `numeric` y la escritura ENTERA se cae con
         «invalid input syntax for type numeric». Poner 1600 kcal sin tocar los
         macros no guardaba nada: los tres macros iban vacíos en el formulario.
     Las cuatro del envase y las cuatro del objetivo, por lo mismo. */
  const limpio = { ...(fields || {}) };
  for (const k of [...TARGET_FIELDS, ...MICRO_TARGET_FIELDS]) {
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

/**
 * Las kcal PAUTADAS de un día: la cifra escrita, o la que suman sus macros.
 *
 * No es lo mismo un objetivo escrito que uno deducido, pero las dos cosas son
 * lo que le han puesto, y quien lee la dieta no distingue entre ellas. La regla
 * estaba escrita dentro de la dieta del cliente y la necesitan también su
 * portada y la cinta de días: copiada, el día que alguien arregle una de las
 * dos, la otra se queda diciendo otra cifra.
 */
export const dayKcalTarget = (nutrition, dayId) => {
  const targets = targetsFor(nutrition, dayId);
  const escrito = Number(targets?.targetKcals) || 0;
  if (escrito > 0) return escrito;
  const suma = macroSplit(targets).total;
  return suma > 0 ? Math.round(suma) : 0;
};

/**
 * QUÉ COME HOY: la dieta que le cae a la casilla de hoy, con su cifra.
 *
 * ══ CON UNA SOLA DIETA NO HAY NADA QUE REPARTIR ════════════════════════════
 *
 * Y esa es la respuesta que faltaba. Esto pedía SIEMPRE un reparto —el mapa de
 * casillas a días— y devolvía `null` sin él, así que a quien tiene una dieta y
 * ya está, su portada no le decía qué comer: le salía «Hoy» con la línea de los
 * pasos y nada más. Y es la mayoría, porque el alto/bajo es una pauta avanzada
 * y el reparto por días es algo que el entrenador hace después, si lo hace.
 *
 * Con un solo día no hay pregunta que contestar: hoy come lo que come todos los
 * días. No se inventa nada, y por eso tampoco depende del tipo de ciclo — un
 * rotativo con una sola dieta también sabe qué toca.
 *
 * El nombre de ese día NO viaja: se llama «Dieta única», que es como se llama
 * por dentro cuando nadie le ha puesto nombre, no algo que el cliente haya
 * leído nunca. Quien lo pinta lo titula.
 *
 * ── Con varias, hace falta el reparto ──────────────────────────────────────
 * Un plan con dos dietas y sin repartir no dice nada: elegir una de las dos
 * sería mandarle a comer el menú de otro día.
 *
 * Y con un ciclo rotativo hace falta además saber en qué casilla cae hoy, que
 * no se deduce del calendario —no hay martes, hay un D4—. Aquí decía que esa
 * fecha «no se guarda en ninguna parte», y era falso: se guarda desde siempre
 * en el microciclo (`micro.date`), y desde el 13 de septiembre de 2026
 * `semanaDelCliente` hace la cuenta. Quien llama pasa la casilla en `casilla`;
 * sin ella, esto sigue contestando solo a los ciclos naturales.
 *
 * ── Y una dieta vacía no es una respuesta ──────────────────────────────────
 * Sin comidas y sin objetivo, el día existe en los datos y no existe para
 * nadie: la fila diría «Tu dieta · 0 comidas» y llevaría a una pantalla en
 * blanco. Ahí no hay nada que decir todavía.
 *
 * @param slots  Las casillas de su ciclo (`clientCycleSlots`).
 * @returns `{ id, name, kcal, comidas, unica }` o `null`.
 */
export const dietaDeHoy = (nutrition, slots = [], fecha = todayISO(), casilla = null) => {
  const dias = planDays(nutrition);
  const unica = dias.length === 1;

  const dia = unica ? dias[0] : deLaCasilla(nutrition, slots, fecha, casilla);
  if (!dia) return null;

  const kcal = dayKcalTarget(nutrition, dia.id);
  const comidas = mealsForVariant(nutrition, dia.id).length;
  if (kcal <= 0 && comidas === 0) return null;

  return { id: dia.id, name: dia.name, kcal, comidas, unica };
};

/**
 * CÓMO SE REPARTE SU CICLO: cada dieta del plan con cuántas casillas le tocan.
 *
 * ══ Por qué es una cuenta y no tres textos ═════════════════════════════════
 *
 * En el prototipo esto se escribía a mano en tres sitios —el subtítulo de la
 * pantalla, la línea del reparto y las tarjetas de «Tus dietas»— y ya se
 * contradecían entre ellos. El día que el entrenador monta una tercera dieta,
 * un texto a mano se queda diciendo que hay dos.
 *
 * Aquí sale una vez, del mismo mapa que usa todo lo demás (`cycleMap`), y quien
 * lo pinta elige qué parte enseña.
 *
 * @param slots `cycleSlots(...)`. Sin ellos, todas las dietas salen con cero
 *   casillas, que es la verdad de un plan sin repartir.
 * @returns `[{ id, name, kcal, targets, dias, casillas }]` — `casillas` son las
 *   etiquetas cortas de los días que le tocan, para decir CUÁLES.
 */
export const repartoDelCiclo = (nutrition, slots = []) => {
  const mapa = cycleMap(nutrition, slots);

  return planDays(nutrition).map((dia) => {
    const suyas = slots.filter((s) => mapa[s.key] === dia.id);
    return {
      id: dia.id,
      name: dia.name,
      kcal: dayKcalTarget(nutrition, dia.id),
      targets: targetsFor(nutrition, dia.id),
      dias: suyas.length,
      casillas: suyas.map((s) => s.corto),
    };
  });
};

/**
 * QUÉ MANDOS TIENE ESTA DIETA: si se puede elegir por día, por dieta, o ninguno.
 *
 * ══ Por qué sube al dominio ════════════════════════════════════════════════
 *
 * Porque desde el 13 de septiembre lo preguntan DOS: la pantalla, para decidir
 * qué pinta debajo, y la RUTA, que es quien monta la cabecera y por tanto quien
 * tiene que saber si hay un segmentado que poner en ella (el dueño: *«aún queda
 * para el caso del PC poner en la cabecera las opciones»*). Escrita dos veces,
 * la cabecera acabaría ofreciendo un mando que la pantalla no usa —o al revés—
 * el día que el entrenador monte una dieta más.
 *
 *   · «El día» solo existe con el ciclo REPARTIDO y con más de una casilla que
 *     mirar: siete casillas que llevan todas al mismo sitio no mandan nada.
 *   · «Tus dietas» solo con más de una dieta: elegir entre una no es elegir.
 *
 * @param columnas Cuántas casillas se enumeran de verdad —siete con la semana
 *   puesta, las del ciclo sin ella—. Lo sabe quien pinta, no el plan.
 */
export const mandosDeLaDieta = (nutrition, slots = [], columnas = slots.length) => {
  const mapa = cycleMap(nutrition, slots);
  return {
    hayDia: slots.some((s) => mapa[s.key]) && columnas > 1,
    hayDietas: planDays(nutrition).length > 1,
  };
};

/**
 * UNA SIGLA CORTA Y DISTINTA PARA CADA DIETA, para la cinta de días.
 *
 * ══ Por qué no basta con la inicial ════════════════════════════════════════
 *
 * Porque el nombre lo escribe el entrenador. «Alto» y «Bajo» dan A y B, pero
 * «Día alto» y «Día bajo» dan D y D: la cinta diría lo mismo los siete días. Y
 * ese nombre es de lo más normal del mundo.
 *
 * La regla es **la ÚLTIMA palabra**, que en castellano es donde vive la
 * distinción: «día alto» → A, «día de descanso» → D, «entreno» → E. Si con una
 * letra dos siguen chocando, se alarga la sigla hasta que no —hasta cuatro—, y
 * si ni así, se numeran: dos dietas que se llaman igual no se distinguen por su
 * nombre, y el número por lo menos no miente.
 *
 * ── Por qué hace falta, y qué sustituye ───────────────────────────────────
 * A la muesca que marcaba «los días altos». Con dos dietas decía la verdad; con
 * tres, una marca de dos estados miente —el medio no es ni alto ni bajo— y el
 * color no clasifica en esta casa. La letra sí lo dice, y lo dice para
 * cualquier número de dietas.
 *
 * @returns `{ [dayId]: 'A' }`
 */
export const siglasDeDietas = (dias = []) => {
  const ultimas = dias.map((d) =>
    String(d?.name || '').trim().split(/\s+/).filter(Boolean).pop() || ''
  );

  for (let largo = 1; largo <= 4; largo += 1) {
    const siglas = ultimas.map((p) => recorta(p, largo));
    if (new Set(siglas).size === dias.length) {
      return Object.fromEntries(dias.map((d, i) => [d.id, siglas[i]]));
    }
  }

  return Object.fromEntries(dias.map((d, i) => [d.id, String(i + 1)]));
};

/** Las `n` primeras letras, con la inicial en mayúscula. Sin nombre, un signo. */
const recorta = (palabra, n) => {
  const trozo = palabra.slice(0, n);
  return trozo ? trozo.charAt(0).toUpperCase() + trozo.slice(1).toLowerCase() : '·';
};

/**
 * El día que el reparto pone en la casilla de hoy, si hay casilla y reparto.
 *
 * `casilla` es la de hoy cuando quien llama SABE cuál es: en un ciclo rotativo
 * la casilla no se deduce de la fecha —no hay martes, hay un D4— y hasta el 13
 * de septiembre de 2026 eso hacía que la portada de quien lleva un rotativo no
 * dijera qué comer. La sabe `semanaDelCliente`, que coloca su ciclo en los días
 * naturales a partir de la fecha de su microciclo. Sin ella, la casilla es el
 * día de la semana, que es lo que había.
 */
const deLaCasilla = (nutrition, slots, fecha, casilla = null) => {
  const clave = casilla || claveDelDia(fecha);
  if (!clave || !slots.some((s) => s.key === clave)) return null;

  const dayId = cycleMap(nutrition, slots)[clave];
  return dayId ? planDays(nutrition).find((d) => d.id === dayId) : null;
};

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

/**
 * La unidad ABREVIADA: «cda», «reb», «ud».
 *
 * Vivía dentro de `MealCard` —la pieza del entrenador— y ahora la piden dos
 * tablas: la suya y la comida del cliente (`ComidaDelCliente`). Es una regla del
 * vocabulario de la nutrición, igual que `unitsLabel`, así que baja aquí en vez
 * de cruzar un import del portal al editor.
 *
 * Se abrevian las medidas con abreviatura reconocible y el resto cae en «ud»,
 * que se entiende sin aprender nada. El nombre entero no se pierde: va en el
 * `title` de la casilla.
 */
const ABREVIATURAS = {
  cucharada: 'cda',
  cucharadita: 'cdta',
  rebanada: 'reb',
  vaso: 'vaso',
  lata: 'lata',
  cazo: 'cazo',
  filete: 'fil',
};

export const abreviarUnidad = (label) => ABREVIATURAS[String(label || '').toLowerCase()] || 'ud';

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

/**
 * Los cuatro números que SUMA el menú, con la primera opción de cada comida.
 *
 * La misma referencia que `dayKcals` —la opción 1 es la que cuenta para el
 * día—, pero con los macros y no solo con la energía: es lo que hace falta para
 * saber a qué distancia está el menú de lo pautado, que es de donde arranca el
 * reajuste. Ver `rescaleMeals`.
 */
export const dayMacros = (meals) => {
  const totals = (meals || []).reduce(
    (acc, meal) => {
      const m = optionMacros((meal?.options || [])[0]);
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
 * CUADRAR LOS MACROS CONTRA EL OBJETIVO: quién absorbe el cambio.
 *
 * ══ El aviso que no llevaba a ninguna parte ═════════════════════════════════
 *
 * Bajar de 2.500 a 2.300 kcal dejaba los tres gramajes donde estaban, y el
 * editor contestaba con una línea roja: «los macros suman 2.499 kcal, 199 por
 * encima del objetivo de 2.300». Cierto, inútil y sin salida — el entrenador
 * tenía que dividir 199 entre 4 en la cabeza para saber que eran 50 g de
 * hidratos, y teclearlos.
 *
 * Esto es esa división. No propone un objetivo: el número lo ha puesto el
 * entrenador. Lo que se elige es **quién lo absorbe**, que es la decisión de
 * oficio, y de ahí salen los gramos.
 *
 * ══ Se cuadra contra el OBJETIVO, no contra el salto ═══════════════════════
 *
 * O sea `(kcal − lo que no se mueve) / 4`, y no «los hidratos de antes menos
 * 50». La diferencia se ve cuando lo de antes ya venía descuadrado —que es el
 * caso normal, porque los gramos se redondean—: restando el salto, el descuadre
 * viejo sobrevive al ajuste y se arrastra para siempre; cuadrando contra el
 * objetivo, muere aquí.
 *
 * @param antes  Los gramos de partida, `{ protein, carbs, fats }`.
 * @param kcals  El objetivo al que tienen que sumar.
 * @param ancla  Quién absorbe:
 *   · `'carbs'` | `'fats'` | `'protein'` — ese macro absorbe y los otros dos se
 *     quedan clavados. `'carbs'` es lo que hace un entrenador nueve de cada
 *     diez veces, y es también el motor de «a mano»: se teclean dos y el
 *     tercero cuadra.
 *   · `'kcals'` — hidratos y grasas en la proporción que ya tienen entre ellos;
 *     la proteína no se toca. El ajuste clásico.
 *   · `'reparto'` — los tres a la vez: el porcentaje de cada macro no cambia.
 * @returns `{ protein, carbs, fats, cabe }`. `cabe` es falso cuando lo pedido no
 *   entra —bajar 600 kcal con la proteína quieta y 40 g de hidratos en la
 *   dieta—: los gramos salen a cero y quien llame lo dice, en vez de enseñar un
 *   número negativo.
 */
export const cuadrarMacros = ({ antes, kcals, ancla = 'carbs' } = {}) => {
  const base = {
    protein: toNum0(antes?.protein),
    carbs: toNum0(antes?.carbs),
    fats: toNum0(antes?.fats),
  };
  const objetivo = toNum0(kcals);
  /* Sin objetivo no hay contra qué cuadrar: los gramos son lo que son. */
  if (objetivo <= 0) return { ...base, cabe: true };

  const energia = (m) =>
    m.protein * KCAL_PER_GRAM.protein + m.carbs * KCAL_PER_GRAM.carbs + m.fats * KCAL_PER_GRAM.fats;

  if (ancla === 'reparto') {
    const total = energia(base);
    /* Sin macros de partida no hay reparto que mantener. */
    if (total <= 0) return { ...base, cabe: false };
    const factor = objetivo / total;
    return {
      protein: Math.round(base.protein * factor),
      carbs: Math.round(base.carbs * factor),
      fats: Math.round(base.fats * factor),
      cabe: true,
    };
  }

  if (ancla === 'kcals') {
    const libre = objetivo - base.protein * KCAL_PER_GRAM.protein;
    const hc = base.carbs * KCAL_PER_GRAM.carbs;
    const gr = base.fats * KCAL_PER_GRAM.fats;
    /* En la proporción que ya tienen entre ellos; sin ninguno de los dos, dos
       tercios de hidratos, que es el reparto de una dieta normal. */
    const parteHC = hc + gr > 0 ? hc / (hc + gr) : 0.67;
    return {
      protein: base.protein,
      carbs: Math.max(0, Math.round((libre * parteHC) / KCAL_PER_GRAM.carbs)),
      fats: Math.max(0, Math.round((libre * (1 - parteHC)) / KCAL_PER_GRAM.fats)),
      cabe: libre >= 0,
    };
  }

  const clave = ['protein', 'carbs', 'fats'].includes(ancla) ? ancla : 'carbs';
  const libre = objetivo - energia({ ...base, [clave]: 0 });
  return {
    ...base,
    [clave]: Math.max(0, Math.round(libre / KCAL_PER_GRAM[clave])),
    cabe: libre >= 0,
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

/**
 * Lo que se le tolera a UNA COMIDA en kilocalorías, que NO es lo que se le
 * tolera al día: el 2 %, nunca menos de 15 kcal.
 *
 * ── Por qué una comida se juzga más fino que un plan ──────────────────────
 * El 5 % con suelo de 25 está calibrado para la cifra del DÍA —3.100 kcal son
 * 155 kcal de holgura—, y aplicado tal cual a cada comida le da 55 a una cena
 * de 1.100: un alimento entero de margen. Y hay una razón que no es de gusto:
 * el error del día es la SUMA de los de sus comidas, así que si la parte se
 * juzga con la misma anchura que el todo, tres comidas «en verde» pueden dar
 * un día que no cuadra. La parte se mide más estrecho.
 *
 * Solo en kcal. Los gramos de macro se quedan con el suelo de 3 g de arriba,
 * que ya es estrecho sobre cifras pequeñas: apretarlo pintaría de ámbar «37 de
 * 40 g de proteína», que es exactamente el reñir que esta casa no hace.
 */
export const MARGEN_COMIDA_KCALS = { pct: 0.02, suelo: 15 };

/**
 * El margen dentro del cual una cifra cuadra: el 5 %, pero nunca menos que el
 * suelo. Con `escala: 'comida'` y en kcal, el de aquí arriba.
 */
export const margenDe = (objetivo, campo = 'kcals', escala = 'plan') => {
  const valor = Math.abs(toNum0(objetivo));
  if (escala === 'comida' && campo === 'kcals')
    return Math.max(valor * MARGEN_COMIDA_KCALS.pct, MARGEN_COMIDA_KCALS.suelo);
  return Math.max(valor * 0.05, SUELO_MARGEN[campo] ?? SUELO_MARGEN.protein);
};

/**
 * El veredicto sobre una DIFERENCIA ya calculada: `'ok' | 'over' | 'under'`, o
 * `'none'` cuando no hay objetivo contra el que juzgar —que no es lo mismo que
 * cuadrar—.
 */
export const estadoDeDiff = (diff, objetivo, campo = 'kcals', escala = 'plan') => {
  const meta = toNum0(objetivo);
  if (!meta) return 'none';
  const margen = margenDe(meta, campo, escala);
  return diff > margen ? 'over' : diff < -margen ? 'under' : 'ok';
};

/** Lo mismo, con lo real y lo pautado. */
export const estadoDe = (real, objetivo, campo = 'kcals', escala = 'plan') =>
  estadoDeDiff(toNum0(real) - toNum0(objetivo), objetivo, campo, escala);

/** `' is-ok'`, `' is-over'`, `' is-under'` o cadena vacía, para pegar a una clase. */
export const claseDe = (real, objetivo, campo = 'kcals', escala = 'plan') => {
  const estado = estadoDe(real, objetivo, campo, escala);
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
 * EL REPARTO SIGUE AL OBJETIVO DEL DÍA.
 *
 * ══ La avería que cierra ═══════════════════════════════════════════════════
 *
 * Una dieta tiene el objetivo escrito en dos pisos: lo que se le pide al día y
 * lo que se le pide a cada comida. Al bajar el día de 2.400 a 2.250 el segundo
 * piso se quedaba donde estaba —cuatro comidas de 600, que siguen sumando
 * 2.400—, y como el reajuste apunta a lo que el entrenador escribió en cada
 * comida (`objetivosPorComida`), el menú aterrizaba clavado en la cifra vieja:
 * las cuatro comidas cuadraban con su 600 y el día decía «145 de más» para
 * siempre, sin manera de arreglarlo desde la ventana del objetivo.
 *
 * Medido en la dieta de la que salió: día 2.250/115/324/55, reparto
 * 2.400/120/354/55, menú 2.395/127/359/50. El reajuste movía cuatro gramajes y
 * dejaba los hidratos exactamente donde estaban, porque cada comida YA estaba
 * dentro del margen de su propio objetivo.
 *
 * ══ Y se lleva a lo pautado, no se escala en proporción ════════════════════
 *
 * Es la misma ley que el menú un piso más abajo: mover el reparto el mismo
 * tanto por ciento que se ha movido el día arrastra intacta la distancia que el
 * reparto ya tuviera. El reparto ES una división del día, así que se vuelve a
 * dividir el día — respetando la forma que tiene, que esa sí es del entrenador.
 *
 * ══ Las tres reglas ════════════════════════════════════════════════════════
 *
 *   · **O está repartido entero, o no se toca.** Con una comida sin objetivo,
 *     lo que sobra del día es suyo —eso ya lo hace `objetivosPorComida`— y no
 *     hay nada viejo que corregir. Un reparto a medias es trabajo sin terminar,
 *     no trabajo caducado.
 *   · **Una comida con candado no se mueve** (`meal.fijo`), y las demás cargan
 *     con todo el salto: el batido de después de entrenar son 300 kcal y punto.
 *   · **El blanco de los hidratos sigue siendo «el resto».** No se rellena: se
 *     recalcula solo, y por eso los hidratos van los ÚLTIMOS — cuando las kcal
 *     y los otros dos macros de esa comida ya están escalados, `carbsFromRest`
 *     los deriva sobre la cifra nueva.
 *
 * @param objetivo  Lo pautado del día: `{ kcals, protein, carbs, fats }`.
 * @returns `{ meals, cambios }` con el reparto nuevo, o `null` cuando no hay
 *   nada que mover — que es la respuesta normal y la que pide la ley del reposo.
 */
const ORDEN_DEL_REPARTO = ['kcals', 'protein', 'fats', 'carbs'];

export const repartoAlObjetivo = (meals = [], objetivo = null) => {
  const lista = meals || [];
  if (lista.length === 0) return null;
  if (!lista.every((meal) => mealTarget(meal))) return null;

  const nuevos = lista.map((meal) => ({ ...(meal.target || {}) }));
  /* Sobre el borrador y no sobre el original: una casilla que esta misma vuelta
     acaba de escribirse ya cuenta como escrita. */
  const hayCifra = (i, clave) => String(nuevos[i]?.[clave] ?? '').trim() !== '';

  for (const clave of ORDEN_DEL_REPARTO) {
    const meta = toNum0(objetivo?.[clave]);
    if (!(meta > 0)) continue;

    let puesto = 0;
    const libres = [];
    lista.forEach((meal, i) => {
      if (meal?.fijo === true || !hayCifra(i, clave)) {
        /* Resuelto y no en crudo: el hueco de los hidratos vale lo que vale
           AHORA, con las kcal de esa comida ya escaladas. */
        puesto += toNum0(mealTarget({ target: nuevos[i] })?.[clave]);
        return;
      }
      libres.push(i);
    });

    const resto = meta - puesto;
    const suma = libres.reduce((n, i) => n + toNum0(nuevos[i][clave]), 0);
    /* Sin nadie que pueda cogerlo, o sin sitio que repartir, no se inventa un
       número: el descuadre es del entrenador y `vozDelReparto` ya se lo dice. */
    if (!(suma > 0) || !(resto > 0)) continue;

    /*
      Y las cuatro celdas tienen que SUMAR la cifra del día, que es justo lo que
      esto viene a arreglar: cuatro comidas iguales de 2.250 kcal salen a 562,5
      y redondear cada una por su cuenta da 2.252.

      Así que se reparte por el resto más grande: todas se quedan con su parte
      entera y los gramos sueltos van a quien más cerca estaba del siguiente. Es
      la misma decisión que el reparto del sobrante del escalón de cocina un
      piso más abajo, y por el mismo motivo — la alternativa es cargarle el
      descuadre entero a una comida y que se vea.
    */
    const parte = libres.map((i) => (toNum0(nuevos[i][clave]) / suma) * resto);
    let repartido = 0;
    libres.forEach((i, n) => {
      nuevos[i][clave] = Math.floor(parte[n]);
      repartido += nuevos[i][clave];
    });
    const cola = libres
      .map((i, n) => ({ i, resto: parte[n] - Math.floor(parte[n]) }))
      .sort((a, b) => b.resto - a.resto);
    for (let n = 0; n < resto - repartido && n < cola.length; n += 1) {
      nuevos[cola[n].i][clave] += 1;
    }
  }

  const cambios = [];
  lista.forEach((meal, i) => {
    const antes = mealTarget(meal);
    const ahora = mealTarget({ target: nuevos[i] });
    if (TARGET_KEYS.every((k) => toNum0(antes?.[k]) === toNum0(ahora?.[k]))) return;
    cambios.push({ meal: meal.name, antes, ahora, fijo: meal?.fijo === true });
  });
  if (cambios.length === 0) return null;

  return { meals: lista.map((meal, i) => ({ ...meal, target: nuevos[i] })), cambios };
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
 *   · REDONDEO DE COCINA: el escalón crece con la cantidad y un cambio que no
 *     llega a un escalón NO SALE. Ver `escalonDeCocina`.
 *
 * ── Cuándo se rinde, y lo dice ──────────────────────────────────────────────
 * Una opción hecha solo de proteína y unidades no tiene de dónde recortar; y
 * un factor fuera de 0,25–4 ya no es un ajuste, es otra dieta. Esas opciones
 * se quedan como están y salen en `sinTocar`, para que la vista previa lo
 * cuente en vez de callar.
 *
 * @returns `{ meals, cambios, sinTocar, fuera, ratio }`, o `null` si no hay nada
 *   que reescalar (sin objetivo previo, sin cambio, o sin ningún gramo que
 *   mover). `fuera` son las alternativas que acaban lejos —en kilocalorías— de
 *   la primera opción de su comida, o sea las que han dejado de ser
 *   intercambiables; solo al apuntar a un objetivo, que es cuando todas las
 *   opciones de una comida apuntan al mismo sitio.
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
  fats: {
    unidad: 'g de grasas',
    valor: (m) => m.fats,
    quieta: (m) => !(m.kcal > 0 && (m.fats * 9) / m.kcal >= 0.5),
    sinNada: 'no tiene ninguna fuente de grasas que mover',
  },
  protein: {
    unidad: 'g de proteína',
    valor: (m) => m.protein,
    quieta: (m) => !(m.kcal > 0 && (m.protein * 4) / m.kcal >= 0.5),
    sinNada: 'no tiene ninguna fuente de proteína que mover',
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   LA CESTA: qué alimentos absorben el recorte
   ══════════════════════════════════════════════════════════════════════════

   ══ La avería que cierra ═══════════════════════════════════════════════════

   La regla era «es fuente de hidratos si más de la mitad de su energía son
   hidratos», y eso mete en el mismo saco la manzana (≈95 %) y la pasta (≈85 %):
   en una bajada de 50 g de hidratos, las dos pierden exactamente la misma
   proporción y la manzana se queda en 125 g.

   Eso no lo hace nadie. La fruta y la verdura se sostienen, y el recorte sale
   del arroz, la patata, la pasta y el pan. El porcentaje de energía describe lo
   que un alimento ES; la cesta describe de dónde se recorta, que es una decisión
   del oficio y no una propiedad del alimento.

   ── Sale gratis: la categoría ya existe ────────────────────────────────────
   Las categorías son las del catálogo (`FOOD_CATEGORIES`) y una entrada de dieta
   se resuelve a la suya por NOMBRE con `matchFood`, que es exactamente lo que ya
   hacen las equivalencias. Cero datos nuevos y cero migración.

   ── Y hay reserva, para cuando no queda otra ───────────────────────────────
   Una comida que solo lleva fruta no tiene cesta principal. Antes que rendirse
   —y dejar la comida entera sin ajustar— se recorta de la reserva: es lo que
   haría a mano quien se quedara sin arroz que quitar. */
export const CESTAS = {
  carbs: {
    principal: ['Cereales', 'Tubérculos', 'Legumbres', 'Dulces'],
    reserva: ['Fruta', 'Verdura'],
  },
  fats: { principal: ['Grasas', 'Frutos secos'], reserva: [] },
  protein: { principal: ['Carne', 'Pescado', 'Huevos', 'Lácteos'], reserva: [] },
  /* Por kcal se mueve todo lo que no sea fuente de proteína: no hay cesta que
     elegir, porque el recorte no tiene macro. Se queda con la regla de siempre. */
  kcals: null,
};

/**
 * DE QUÉ FILAS SALE EL CAMBIO, para una medida y una opción.
 *
 * Estaba escrito dentro de `unaPasada`, que era su único cliente. Sale aquí
 * porque ahora hay un segundo —`objetivosPorComida`, que necesita saber si una
 * comida tiene siquiera de dónde mover un macro antes de asignarle parte de
 * él—, y dos copias de esta regla es exactamente lo que no puede haber: el
 * objetivo se repartiría con un criterio y el ajuste se daría con otro.
 *
 * Con categorías resueltas manda la cesta; sin catálogo, la densidad del macro.
 * Y si la cesta principal se queda vacía entra la reserva, que es lo que hace
 * que una comida de solo fruta se pueda ajustar en vez de rendirse.
 */
const elegiblesPara = (foods = [], clave, { catalog = [], intocable = null } = {}) => {
  const medida = MEDIDAS[clave];
  if (!medida) return [];

  const fuera = intocable || (() => false);
  /* La categoría de una entrada, resuelta por nombre. Sin catálogo —`platos.js`,
     `reparto.js`, cualquier prueba— no hay ninguna y todo cae en la regla de
     densidad de siempre: la cesta MEJORA el criterio donde hay con qué, y nunca
     lo empeora donde no lo hay. */
  const categoriaDe = (f) =>
    catalog.length > 0 ? matchFood(f.name, catalog).food?.category ?? null : null;
  const enCesta = (f, lista) => {
    const cat = categoriaDe(f);
    return cat ? lista.includes(cat) : !medida.quieta(foodMacros(f));
  };

  const cesta = CESTAS[clave];
  if (!cesta) return foods.filter((f) => !fuera(f) && !medida.quieta(foodMacros(f)));

  const principal = foods.filter((f) => !fuera(f) && enCesta(f, cesta.principal));
  if (principal.length > 0 || cesta.reserva.length === 0) return principal;
  return foods.filter((f) => !fuera(f) && enCesta(f, cesta.reserva));
};

/**
 * ══ EL OBJETIVO BAJA UN PISO: DE DÍA A COMIDA ══════════════════════════════
 *
 * ── Lo que no se podía arreglar mirando el día ─────────────────────────────
 * Un día con cuatro comidas de dos opciones son dieciséis menús distintos, y el
 * cliente elige uno cada mañana. Cuadrar el día contra lo pautado solo cuadra
 * UNO de los dieciséis —el de las primeras opciones, que es el que suma
 * `dayMacros`—; los otros quince quedan donde estén. Medido en la pantalla:
 * 2.167 y 2.368 kcal sobre 2.250 pautadas según qué opciones estuvieran
 * abiertas, y ninguna de las dos era la combinación que el reajuste acababa de
 * cuadrar.
 *
 * Recorrer las combinaciones no es la salida: son N₁×N₂×…×Nₖ. La salida es
 * bajar el objetivo un piso. Si cada opción cuadra con el objetivo de SU
 * comida, cuadran las dieciséis a la vez y el problema deja de ser
 * combinatorio. Es además lo que `optionGaps` lleva diciendo desde que se
 * escribió —«una opción B que se va 300 kcal por encima de la A no es una
 * alternativa, es otra comida»—, que hasta ahora solo medía.
 *
 * ── De dónde sale el objetivo de una comida ────────────────────────────────
 * De dos sitios, y en este orden:
 *
 *   · **Lo que el entrenador repartió.** Si la comida tiene objetivo puesto
 *     (`mealTarget`), va a ese número exacto. Lo escribió él y no se toca.
 *   · **Lo que queda, en la proporción que ya tiene.** El resto del día
 *     —lo pautado menos lo ya repartido— se divide entre las comidas sin
 *     objetivo según lo que hoy pesa cada una. Este es el caso normal: el
 *     reparto casi nunca está relleno, y sin derivarlo no habría contra qué
 *     cuadrar las alternativas.
 *
 * Y la cuenta derivada es EXACTAMENTE la que el reajuste ya hacía con el día:
 * comida × (pautado / lo que suma el menú). Por eso la primera opción de cada
 * comida acaba en el mismo gramaje que antes de este cambio, y lo único nuevo
 * es que las alternativas apuntan ahí también en vez de conservar su distancia.
 *
 * ── Y solo reparte entre quien puede cogerlo ───────────────────────────────
 * Un desayuno de avena y claras no tiene ni una fuente de grasa. Darle su
 * parte proporcional de los 60 g pautados es darle algo que no puede coger: la
 * pasada de las grasas no encuentra de dónde, el desayuno se queda en 4 g, y
 * los 8 g que le sobraban al día no se los lleva nadie. El día acababa corto
 * por repartir bien.
 *
 * Así que una comida sin fuente de un macro no entra en el reparto de ese
 * macro: se queda en lo que tiene y su parte pasa a las que sí pueden moverlo,
 * que es lo que hace a mano quien echa el aceite en la comida porque en el
 * desayuno no hay dónde. Quién puede se pregunta con la MISMA regla con la que
 * luego se ajusta (`elegiblesPara`) — repartir con un criterio y ajustar con
 * otro sería volver a lo de antes por otro camino.
 *
 * ── Cuando el reparto no deja sitio ────────────────────────────────────────
 * Si las comidas con objetivo puesto ya se comen el día entero —o se pasan—, a
 * las demás no les queda nada que repartir. Ahí no se inventa un número: se
 * quedan en lo que suman hoy y no se mueven. El descuadre del reparto es del
 * entrenador y la aplicación ya se lo dice en su sitio (`vozDelReparto`);
 * corregírselo por detrás sería recetar, y aquí no se receta.
 *
 * @param objetivo  Lo pautado del DÍA, con las claves que haya:
 *   `{ protein, carbs, fats }` o `{ kcals }`.
 * @param catalog/quietos  Los mismos que recibe el ajuste, para preguntar por
 *   la capacidad con su regla exacta.
 * @returns Un objetivo por comida, en el mismo orden que `meals`.
 */
export const objetivosPorComida = (meals = [], objetivo = null, { catalog = [], quietos = null } = {}) => {
  const lista = meals || [];
  const metas = lista.map(() => ({}));

  /* Lo que suma hoy la primera opción de cada comida: la misma referencia que
     `dayMacros` usa para el día, comida a comida. */
  const ahora = lista.map((meal) => {
    const m = optionMacros((meal?.options || [])[0]);
    return { kcals: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats };
  });
  const repartido = lista.map(mealTarget);

  for (const clave of TARGET_KEYS) {
    const meta = toNum0(objetivo?.[clave]);
    if (!(meta > 0)) continue;

    let puesto = 0;
    const libres = [];
    lista.forEach((meal, i) => {
      /* Un cero escrito en la casilla de proteína o de grasa no se distingue de
         una casilla en blanco una vez guardado —`mealTarget` los junta—, así que
         «repartido» aquí es «puesto y mayor que cero». Los hidratos sí se
         distinguen, y su blanco llega ya resuelto como el resto del día. */
      const suyo = toNum0(repartido[i]?.[clave]);
      if (suyo > 0) {
        metas[i][clave] = suyo;
        puesto += suyo;
        return;
      }

      /* ¿Puede esta comida mover este macro? Con la regla del ajuste, sobre su
         primera opción, que es la que marca el día. El umbral es el mismo que
         `unaPasada` usa para rendirse: por debajo de un gramo no hay nada que
         escalar. */
      const primera = (meal?.options || [])[0];
      const puede = elegiblesPara(primera?.foods || [], clave, {
        catalog,
        intocable: (f) =>
          f.fijo === true ||
          f.showAs === 'units' ||
          quietos?.has(claveDelCambio(meal?.name, 1, f.name)) === true,
      }).reduce((n, f) => n + MEDIDAS[clave].valor(foodMacros(f)), 0);

      if (puede > 1) libres.push(i);
      else {
        metas[i][clave] = ahora[i][clave];
        puesto += ahora[i][clave];
      }
    });

    const resto = meta - puesto;
    const suma = libres.reduce((n, i) => n + ahora[i][clave], 0);
    for (const i of libres) {
      metas[i][clave] = resto > 0 && suma > 0 ? (ahora[i][clave] / suma) * resto : ahora[i][clave];
    }
  }

  return metas;
};


/**
 * UNA PASADA del reescalado: una medida, un factor, y los gramos que se mueven.
 *
 * Se extrajo de `rescaleMeals` cuando el reparto dejó de ser uno solo. Con
 * «P 0 · HC 40 · GR 4» hay que mover dos macros con dos factores distintos, y
 * escribir eso dentro del bucle habría sido una segunda regla de escalado
 * conviviendo con la primera.
 *
 * @returns `{ meals, ratio, cambios }` — sin `sinTocar`: quién se ha quedado sin
 *   tocar solo se sabe cuando han pasado TODAS las pasadas, y decirlo por pasada
 *   listaría como intocada una comida que la siguiente sí mueve.
 */
/**
 * La llave de UN gramaje dentro del menú: comida, opción y alimento.
 *
 * La usan las dos puntas de la misma conversación —el dominio, para fundir los
 * cambios de varias pasadas y para saber qué filas ha apartado el entrenador; y
 * la ventana, para marcarlas—, así que se escribe una vez. Con el nombre de la
 * comida y no con su índice porque es lo que la vista previa enseña.
 */
export const claveDelCambio = (meal, option, food) => `${meal}·${option}·${food}`;

/**
 * EL ESCALÓN CON EL QUE SE ESCRIBE UN GRAMAJE.
 *
 * ══ Por qué la regla vieja hacía el ridículo ═══════════════════════════════
 *
 * Era «a 5 g desde 25 g, al gramo por debajo», y con eso el reajuste devolvía
 * una lista llena de correcciones que nadie escribe a mano: 10 g de miel a 8,
 * 20 g de whey a 19, 100 g de pollo a 95. Son ciertas —el factor sale así— y
 * son ridículas: ningún entrenador cambia una pauta por un cinco por ciento, y
 * verlo propuesto veinte veces resta crédito a los cambios que sí importan.
 *
 * El escalón crece con la cantidad, que es como se escriben los gramajes de
 * verdad: lo pequeño va de cinco en cinco, un plato de diez en diez y un vaso
 * de leche de veinticinco en veinticinco. Cada escalón vale entre el 5 y el
 * 12 % de lo que hay en la fila, así que la regla trae de propina el suelo que
 * faltaba: un cambio que no llega a un escalón no llega a la lista, la fila se
 * queda como estaba y el resto de su opción absorbe la diferencia.
 *
 *     10 g de miel  · escalón 5   → se mueve a 5 o a 15, nunca a 8
 *     100 g de pollo· escalón 10  → se mueve a 90 o a 110, nunca a 95
 *     400 g de leche· escalón 25  → 375, no 355
 */
export const escalonDeCocina = (gramos) => {
  const g = Math.abs(toNum0(gramos));
  if (g < 50) return 5;
  if (g < 200) return 10;
  if (g < 500) return 25;
  return 50;
};

/**
 * El múltiplo del escalón más cercano al gramaje ideal.
 *
 * En un empate gana QUEDARSE: 95 g con escalón de 10 está a la misma distancia
 * de 90 que de 100, y 100 es lo que ya había escrito. Un empate resuelto hacia
 * el cambio es exactamente el cambio que no hacía falta.
 *
 * El suelo es el propio escalón, para que nada caiga a cero —o el gramaje de
 * partida si ya era más pequeño, que es la pizca de canela: subirla a 5 g por
 * redondear sería inventarse una pauta.
 */
const aEscalon = (ideal, desde, paso) => {
  const suelo = Math.min(paso, Math.max(1, Math.round(desde)));
  const abajo = Math.max(0, Math.floor(ideal / paso) * paso);
  const arriba = abajo + paso;
  const dAbajo = ideal - abajo;
  const dArriba = arriba - ideal;
  const elegido =
    dAbajo < dArriba
      ? abajo
      : dArriba < dAbajo
        ? arriba
        : Math.abs(abajo - desde) <= Math.abs(arriba - desde)
          ? abajo
          : arriba;
  return Math.max(suelo, elegido);
};

const unaPasada = (
  meals,
  clave,
  from,
  to,
  { catalog = [], quietos = null, sentido = null, sentidos = null, origen = null, metas = null } = {}
) => {
  const medida = MEDIDAS[clave];
  if (!medida) return null;
  /* Con objetivo por comida no hay un `from` ni un `to` del día: cada opción
     tiene el suyo y la pasada siempre se da. Ver `objetivosPorComida`. */
  if (!metas && (!from || !to || from === to)) return null;
  const ratio = metas ? null : to / from;

  const cambios = [];

  const nuevas = meals.map((meal, mealIndex) => ({
    ...meal,
    options: (meal.options || []).map((option, optIndex) => {
      const total = medida.valor(optionMacros(option));
      if (total <= 0) return option;

      /*
        ADÓNDE VA ESTA OPCIÓN. Con objetivo por comida, al de su comida — el
        mismo para todas sus alternativas, que es lo que las vuelve de verdad
        intercambiables. Escalando en proporción, a su propio tamaño por el
        factor del día, que es lo de siempre.

        Sin nada a lo que apuntar, la opción se queda: llevarla a cero sería
        borrar una comida por no tener cifra.
      */
      const objetivo = metas ? toNum0(metas[mealIndex]?.[clave]) : total * ratio;
      if (!(objetivo > 0)) return option;

      /*
        ══ Y LO QUE YA CUADRA NO SE TOCA ══════════════════════════════════════

        Con el objetivo en la comida hay un veredicto por opción, así que se
        puede preguntar antes de mover nada: ¿está esta opción dentro del margen
        de lo que le toca? Si lo está, se queda — proponer un cambio sobre una
        cifra que la propia aplicación pinta en verde es contradecirse en dos
        pantallas seguidas.

        Y hace falta preguntarlo. Sin esto, un menú que ya estaba en lo pautado
        salía con gramajes movidos igual: `aEscalon` lleva cada fila al múltiplo
        de su escalón, y un aceite escrito en 34 g se iba a 35 sin que nadie
        hubiera pedido nada. El día entero se libraba de eso por un guardia que
        solo miraba el total (`from === to`); la opción necesita el suyo.
      */
      if (metas && cuadra(total, objetivo, clave)) return option;

      const foods = option.foods || [];

      /*
        Lo que NUNCA se mueve, pase lo que pase: lo que se cuenta por unidades
        —«1 plátano» no puede volverse 0,8 plátanos— y lo que el entrenador ha
        marcado como fijo en la fila. El `fijo` es la marca por alimento: el
        plátano de después de entrenar, el aceite de la ensalada, los 30 g de
        avena que son el desayuno entero de esa persona.
      */
      /*
        Y `quietos` es la TERCERA razón, la del momento: las filas que el
        entrenador ha apartado en la vista previa de este ajuste. No se escribe
        en la dieta —para eso está `fijo`, que es la marca permanente—, y no
        tacha el renglón: lo fija y el reescalado se rehace, así que lo que ese
        alimento dejaba de poner lo pone el resto de su opción y la comida sigue
        cuadrando. Descontar el cambio sin recalcular habría dejado la opción a
        medio ajustar, que es exactamente lo que nadie quiere firmar.
      */
      const intocable = (f) =>
        f.fijo === true ||
        f.showAs === 'units' ||
        quietos?.has(claveDelCambio(meal.name, optIndex + 1, f.name)) === true;

      /* Y de los demás, los que están en la cesta. Ver `elegiblesPara`, que es
         la misma regla con la que se repartió el objetivo. */
      const elegibles = elegiblesPara(foods, clave, { catalog, intocable });

      const mueve = new Set(elegibles.map((f) => f.id ?? f.name));
      const puedeMoverse = (f) => mueve.has(f.id ?? f.name);

      const quietas = foods
        .filter((f) => !puedeMoverse(f))
        .reduce((n, f) => n + medida.valor(foodMacros(f)), 0);
      const variables = total - quietas;
      /* El factor de lo variable: lo que tiene que moverse para que la opción
         entera quede en su proporción, con lo fijo quieto. */
      const factor = variables > 1 ? (objetivo - quietas) / variables : null;

      /* Fuera de 0,25–4 ya no es un ajuste, es otra dieta: la opción se queda. */
      if (factor === null || factor < 0.25 || factor > 4) return option;

      /* Cada fila movible con su gramaje llevado al escalón de cocina, y lo que
         vale un gramo suyo en la medida de esta pasada: la medida es lineal con
         los gramos, así que con esa razón se puede probar un escalón arriba o
         abajo sin recalcular macros. */
      /*
        ── Y NADA VA A CONTRAPELO ────────────────────────────────────────────
        Un ajuste tiene un sentido, y ningún gramaje puede ir contra él: en un
        recorte nada sube y en una subida nada baja. Parece obvio y no lo era —
        con «100 g de crema de arroz» redondeados a 80 la comida se quedaba
        corta, y de todo lo que había en la mesa lo que mejor tapaba ese hueco
        eran cinco gramos más de miel. La cuenta salía y el renglón decía «Miel
        10 → 15» EN UNA BAJADA de hidratos, que es de las cosas que hacen cerrar
        una aplicación. El tope va aquí, en el redondeo, y otra vez abajo en el
        reparto del sobrante, que es el que lo proponía.

        ── Y el sentido es el DEL AJUSTE, no el de esta pasada ────────────────
        Con dos vueltas, mirar el factor de la pasada no basta: recortar cien
        gramos de pollo se lleva los hidratos que ese pollo ponía, así que la
        segunda vuelta de los hidratos se encuentra el día por debajo y su
        factor sale mayor que uno. Y ahí estaba otra vez la miel subiendo de 10
        a 15 dentro de una bajada de hidratos de 367 a 300.

        Así que el sentido se decide UNA vez, con lo que sumaba el menú al
        principio contra lo pautado, y el tope se mide contra el gramaje DEL
        PRINCIPIO (`origen`) y no contra el que traía esta pasada. Ninguna
        vuelta puede devolver una fila al otro lado de donde empezó. */
      /* Y el sentido es el de ESTA opción cuando cada una tiene su objetivo: la
         alternativa que se pasaba baja aunque el día entero suba. */
      const suyo = sentidos ? sentidos.get(`${mealIndex}·${optIndex}·${clave}`) : sentido;
      const baja = suyo !== null && suyo !== undefined ? suyo < 0 : objetivo < total;
      const aFavor = (gramos, tope) => (baja ? Math.min(tope, gramos) : Math.max(tope, gramos));

      const piezas = new Map();
      foods.forEach((f, i) => {
        const antes = toNum0(f.grams);
        if (!puedeMoverse(f) || !(antes > 0)) return;
        const paso = escalonDeCocina(antes);
        const tope = origen?.get(claveDelCambio(meal.name, optIndex + 1, f.name)) ?? antes;
        piezas.set(i, {
          antes,
          tope,
          paso,
          gramos: aFavor(aEscalon(antes * factor, antes, paso), tope),
          porGramo: medida.valor(foodMacros(f)) / antes,
          movida: 0,
        });
      });

      /*
        ══ Y EL SOBRANTE DEL REDONDEO SE COLOCA ═══════════════════════════════

        Redondear cada fila por su cuenta desvía la opción entera: tres filas
        redondeadas hacia abajo son treinta kilocalorías de menos, y con
        escalones de cocina —que son gruesos a propósito— esa deriva ya se nota
        en el día. Así que el resto se reparte: se prueba un escalón arriba o
        abajo en cada fila y se aplica el que más acerque la opción a su
        objetivo, hasta que ningún movimiento mejore.

        Cada fila puede apartarse UN escalón de su redondeo y no más, y nunca a
        contrapelo del ajuste (ver `aFavor`). Con eso los gramajes siguen siendo
        redondos, ninguno se va de su sitio, y el que absorbe el resto es el
        alimento al que menos le cuesta —que es lo que se hace a mano: bajar el
        arroz otros diez gramos antes que tocar el aceite.
      */
      const valorAhora = () =>
        quietas + [...piezas.values()].reduce((n, p) => n + p.gramos * p.porGramo, 0);

      for (let vuelta = 0; vuelta < 12; vuelta += 1) {
        const error = objetivo - valorAhora();
        let mejor = null;
        for (const [i, p] of piezas) {
          if (p.porGramo <= 0) continue;
          for (const signo of [-1, 1]) {
            if (Math.abs(p.movida + signo) > 1) continue;
            const gramos = p.gramos + signo * p.paso;
            if (gramos < Math.min(p.paso, p.antes)) continue;
            if (baja ? gramos > p.tope : gramos < p.tope) continue;
            const queda = Math.abs(error - signo * p.paso * p.porGramo);
            if (queda < Math.abs(error) && (!mejor || queda < mejor.queda))
              mejor = { i, signo, gramos, queda };
          }
        }
        if (!mejor) break;
        const p = piezas.get(mejor.i);
        p.gramos = mejor.gramos;
        p.movida += mejor.signo;
      }

      const siguientes = foods.map((f, i) => {
        const p = piezas.get(i);
        if (!p || p.gramos === p.antes) return f;
        cambios.push({
          meal: meal.name,
          option: optIndex + 1,
          food: f.name,
          from: p.antes,
          to: p.gramos,
        });
        return { ...f, grams: p.gramos };
      });
      return { ...option, foods: siguientes };
    }),
  }));

  return { meals: nuevas, ratio, cambios };
};

/**
 * ══ EL REAJUSTE APUNTA A LO PAUTADO, NO AL SALTO ═══════════════════════════
 *
 * `objetivo` es la forma con la que se ajusta una dieta desde la ventana del
 * objetivo, y es la que arregla la avería que se veía en pantalla: «tenía 2.500
 * y le he bajado cinco gramos de proteína; ahora no cumple ni las kcal ni los
 * macros».
 *
 * Lo que hacía era escalar el menú EN LA MISMA PROPORCIÓN en que se movía lo
 * pautado —de 120 a 115 g de proteína son un 4 % menos, así que el menú perdía
 * un 4 %—. Y esa cuenta arrastra intacta la distancia que el menú ya tuviera:
 * con 148 g de proteína pautados 120, el menú se quedaba en 142 contra 115. El
 * reajuste movía gramos y no cuadraba nada, que es peor que no moverlos.
 *
 *     salto      menú × (pautado nuevo / pautado viejo)   →  148 → 142 · sobra 27
 *     objetivo   menú → pautado nuevo                     →  148 → 115 · clavado
 *
 * La diferencia es de dónde sale el `from` de cada pasada: de lo que había
 * PAUTADO antes, o de lo que SUMA el menú ahora (`dayMacros`, con la primera
 * opción de cada comida, que es la que cuenta para el día). Y se mide otra vez
 * antes de cada pasada, porque bajar el arroz también baja algo de proteína.
 *
 * Van los tres macros, haya cambiado su cifra o no: el arroz y el aceite se
 * corrigen igual que la proteína, porque lo que se pide es que el menú cuadre
 * con lo pautado, no que se mueva lo que se acaba de teclear. Lo que impide que
 * eso se vuelva un menú reescrito cada vez es el escalón de cocina, que ya está
 * para eso: una diferencia que no llega a un escalón no propone nada.
 *
 * @param objetivo  Los macros pautados a los que hay que LLEVAR el menú:
 *   `{ protein, carbs, fats }`.
 * @param objetivoKcals  Lo mismo sin macros pautados: las kilocalorías a las
 *   que llevar el menú. El camino corto de una dieta pautada solo en energía.
 * @param fromKcals/toKcals  Escalar EN PROPORCIÓN, sin objetivo al que llegar:
 *   un plato llevado a su ración (`platos.js`) o una dieta que se manda a otra
 *   persona (`reparto.js`), donde no hay un menú de destino contra el que
 *   medirse.
 * @param fromCarbs/toCarbs  Lo mismo con la fuente de hidratos.
 * @param reparto  DE DÓNDE SALEN las calorías, macro a macro:
 *   `{ carbs: { from, to }, fats: {…}, protein: {…} }`, también en proporción.
 * @param catalog  El catálogo de alimentos, para resolver la cesta por
 *   categoría. Sin él se mantiene la regla de densidad de siempre.
 * @param quietos  Las filas que el entrenador ha apartado en la vista previa
 *   (`Set` de `claveDelCambio`). Se fijan y el resto de su opción absorbe lo
 *   que ellas dejan de poner.
 * @param fijados  Los gramajes que ha ESCRITO en la vista previa (`Map` de
 *   `claveDelCambio` a gramos). Hermanos de los apartados —apartar es escribir
 *   el gramaje que ya tenía— y por eso comparten camino.
 */
export const rescaleMeals = (
  meals = [],
  {
    objetivo = null,
    objetivoKcals = 0,
    fromKcals,
    toKcals,
    fromCarbs,
    toCarbs,
    reparto = null,
    catalog = [],
    quietos = null,
    fijados = null,
  } = {}
) => {
  if (meals.length === 0) return null;

  /*
    ══ LO ESCRITO A MANO VA PRIMERO ═══════════════════════════════════════════

    Un gramaje escrito no es otra pasada: es el punto de partida. Se pone antes
    de reescalar nada y esa fila queda inmóvil el resto del camino, así que el
    total de su opción ya cuenta con él y lo que falte para cuadrar sale de los
    demás alimentos. Eso es lo que hace que dejar el chocolate en 30 g baje la
    patata un poco más, en vez de dejar la comida a medio ajustar.

    Y cuenta como cambio por derecho propio: sin esto, escribir un gramaje sin
    tocar nada más devolvía `null` —«aquí no se mueve nada»— y lo escrito se
    perdía justo al guardar.
  */
  const aMano = fijados && fijados.size > 0 ? fijados : null;
  const forzados = [];
  let partida = meals;
  if (aMano) {
    partida = meals.map((meal) => ({
      ...meal,
      options: (meal.options || []).map((option, i) => ({
        ...option,
        foods: (option.foods || []).map((f) => {
          const llave = claveDelCambio(meal.name, i + 1, f.name);
          if (!aMano.has(llave)) return f;
          const nuevos = Math.round(toNum0(aMano.get(llave)));
          const antes = toNum0(f.grams);
          /* Una casilla a medio escribir —vacía, o un cero— no es un gramaje: la
             fila se queda donde estaba hasta que diga algo. */
          if (!(nuevos > 0) || nuevos === antes) return f;
          forzados.push({ meal: meal.name, option: i + 1, food: f.name, from: antes, to: nuevos, aMano: true });
          return { ...f, grams: nuevos };
        }),
      })),
    }));
  }

  /* Y las dos clases de fila quieta se juntan aquí: las apartadas y las
     escritas. De ahí para abajo el reescalado no tiene que saber cuál es cuál. */
  const inmoviles = aMano ? new Set([...(quietos || []), ...aMano.keys()]) : quietos;

  /*
    ══ Qué pasadas hay que dar ════════════════════════════════════════════════

    El OBJETIVO manda cuando llega, porque es lo que el entrenador tiene
    pautado: una pasada por macro, con la cifra a la que hay que llegar. Detrás
    van las tres formas en proporción —el reparto y las dos cortas de siempre,
    por kcal y por hidratos—, que siguen valiendo para quien no tiene un destino
    contra el que medirse: un plato llevado a su ración, una dieta que se manda
    a otra persona.

    El orden es hidratos → grasas → proteína, y es el orden en que se ajusta una
    dieta de verdad: lo primero que se mueve es el hidrato.
  */
  const pasos = [];
  /* Con objetivo, el `from` de cada pasada no llega escrito: se mide sobre el
     menú justo antes de darla. Ver la cabecera. */
  let alObjetivo = false;
  /* Lo pautado del día, guardado tal cual para bajarlo a las comidas. */
  let delDia = null;
  if (objetivo && ['carbs', 'fats', 'protein'].some((k) => toNum0(objetivo[k]) > 0)) {
    alObjetivo = true;
    delDia = {};
    for (const clave of ['carbs', 'fats', 'protein']) {
      const to = toNum0(objetivo[clave]);
      if (to > 0) {
        pasos.push({ clave, to });
        delDia[clave] = to;
      }
    }
  } else if (toNum0(objetivoKcals) > 0) {
    alObjetivo = true;
    delDia = { kcals: toNum0(objetivoKcals) };
    pasos.push({ clave: 'kcals', to: toNum0(objetivoKcals) });
  } else if (reparto) {
    for (const clave of ['carbs', 'fats', 'protein']) {
      const tramo = reparto[clave];
      const from = toNum0(tramo?.from);
      const to = toNum0(tramo?.to);
      if (from && to && from !== to) pasos.push({ clave, from, to });
    }
  } else if (fromCarbs !== undefined || toCarbs !== undefined) {
    pasos.push({ clave: 'carbs', from: toNum0(fromCarbs), to: toNum0(toCarbs) });
  } else {
    pasos.push({ clave: 'kcals', from: toNum0(fromKcals), to: toNum0(toKcals) });
  }

  /*
    ══ EL OBJETIVO DE CADA COMIDA, una sola vez ═══════════════════════════════

    Se calcula sobre el menú de PARTIDA y no se vuelve a tocar: si se recalculara
    entre vuelta y vuelta, cada pasada movería la portería que la siguiente tiene
    que meter. Ver `objetivosPorComida`.
  */
  const metas = alObjetivo
    ? objetivosPorComida(partida, delDia, { catalog, quietos: inmoviles })
    : null;

  /*
    EL SENTIDO DE CADA OPCIÓN Y EL GRAMAJE DE PARTIDA, decididos antes de mover
    nada: son el tope que ninguna vuelta puede saltarse. Ver `unaPasada`.

    Y el sentido es de la OPCIÓN, no del día: con el objetivo bajado a la comida,
    una alternativa que se pasaba tiene que bajar aunque el día entero suba. Con
    un solo sentido para todos, esa opción se quedaba clavada.
  */
  const sentidosDe = (lista) => {
    if (!metas) return null;
    const mapa = new Map();
    lista.forEach((meal, mi) =>
      (meal.options || []).forEach((option, oi) => {
        const suma = optionMacros(option);
        for (const paso of pasos) {
          const meta = toNum0(metas[mi]?.[paso.clave]);
          mapa.set(
            `${mi}·${oi}·${paso.clave}`,
            meta > 0 ? Math.sign(meta - MEDIDAS[paso.clave].valor(suma)) : 0
          );
        }
      })
    );
    return mapa;
  };

  const origen = alObjetivo ? new Map() : null;
  if (origen) {
    for (const meal of partida) {
      (meal.options || []).forEach((option, i) =>
        (option.foods || []).forEach((f) =>
          origen.set(claveDelCambio(meal.name, i + 1, f.name), toNum0(f.grams))
        )
      );
    }
  }

  /*
    ══ Y SE DAN DOS VUELTAS, porque los macros no viven separados ═════════════

    Ningún alimento es un macro puro: quitar cien gramos de pollo se lleva por
    delante dos de grasa, y el arroz trae su propia proteína. Así que la pasada
    de las grasas —que va antes— acaba corta por culpa de la de la proteína, que
    va después, y el menú se queda a cuatro gramos de lo pautado sin que ninguna
    de las dos haya hecho nada mal.

    La segunda vuelta vuelve a medir y remata. Lo que queda entonces es el error
    del escalón de cocina, que es el que tiene que quedar. Solo al apuntar a un
    objetivo: escalar en proporción no tiene adónde converger, y una vuelta de
    más ahí sería escalar dos veces.

    ── Y van en una función porque hay que darlas más de una vez ──────────────
    El reparador de más abajo necesita preguntar «¿y si esta opción no llevara
    aguacate?», y eso es volver a dar las dos vueltas sobre otro menú de partida.
    Estaba escrito en línea cuando solo se daban una vez.

    `metas` y `origen` NO se recalculan —son la portería y el tope, y moverlos
    entre intentos sería comparar dos cosas distintas—, pero `sentidos` SÍ: una
    opción a la que se le ha quitado una fila es otra opción, y la que se pasaba
    de grasa puede necesitar subir de hidratos. Ver la ley de la dirección.
  */
  const vueltas = (desde) => {
    let anda = desde;
    const partes = [];
    const movidos = new Map();
    const sentidos = sentidosDe(desde);
    for (let vuelta = 0; vuelta < (alObjetivo ? 2 : 1); vuelta += 1) {
      for (const paso of pasos) {
        /* Lo que suma el menú AHORA, no lo que sumaba al abrir: cada pasada deja
           el siguiente macro en otro sitio, y medirlo una sola vez al principio
           dejaría la última apuntando a un número que ya no existe. */
        const from = alObjetivo
          ? Math.round(MEDIDAS[paso.clave].valor(dayMacros(anda)))
          : paso.from;
        const res = unaPasada(anda, paso.clave, from, paso.to, {
          catalog,
          quietos: inmoviles,
          sentidos,
          origen,
          metas,
        });
        if (!res) continue;
        anda = res.meals;
        /* El parte es el de la PRIMERA vuelta: es la que contesta a lo que se ha
           pedido, y la segunda solo remata su redondeo. */
        if (vuelta === 0)
          partes.push({ ...paso, from, ratio: res.ratio, unidad: MEDIDAS[paso.clave].unidad });
        /* Los cambios se funden por alimento: el arroz puede moverse en la pasada
           de hidratos y no en las demás, pero si dos pasadas lo tocaran, la vista
           previa tiene que enseñar UN renglón —de dónde sale y dónde acaba— y no
           dos saltos que el entrenador tendría que sumar en la cabeza. */
        for (const c of res.cambios) {
          const llave = claveDelCambio(c.meal, c.option, c.food);
          const previo = movidos.get(llave);
          movidos.set(llave, previo ? { ...previo, to: c.to } : c);
        }
      }
    }
    return { meals: anda, partes, movidos };
  };

  let { meals: actuales, partes: dados, movidos } = vueltas(partida);

  /*
    ══ CUANDO NO HAY GRAMAJE QUE LA CUADRE, SE PROPONE QUITAR UNA FILA ════════

    ── La avería, medida ──────────────────────────────────────────────────────
    Una comida de patata, tres huevos, brócoli y aguacate contra 562 kcal y 15 g
    de grasa: los tres huevos ya ponen 16 g de grasa ellos solos y se cuentan por
    unidades, así que son intocables. El factor de la pasada sale negativo,
    `unaPasada` se planta —y hace bien— y la opción se queda en 758 kcal con el
    aviso de «revísala a mano». Ningún gramaje la arregla. Quitar el aguacate,
    sí: 592 kcal y 16 g de grasa sobre 15.

    ── Por qué esto no es recetar ─────────────────────────────────────────────
    Es el mismo trato que el resto de la lista: se propone, se ve, se desmarca y
    no toca la dieta hasta que se guarda. La diferencia con inventar una comida
    es que aquí no se AÑADE nada — añadir un alimento sí sería escribirle la
    dieta a alguien, y eso no se hace ni pidiéndolo.

    ── Y una comida tiene una estructura, así que hay frenos ──────────────────
    Quitar el plato principal no es ajustar, es borrar la comida. Una fila solo
    es candidata si:

      · **lleva el macro que está atascado**, con la misma cesta con la que se
        ajusta (`elegiblesPara`). Sin esto, el reparador quitaba el pan de una
        comida a la que le sobraba GRASA: el pan no pone grasa, pero quitarlo
        cuadraba la proteína de rebote y la patata crecía para tapar el hueco.
        La cuenta salía y el renglón era inexplicable. Se quita lo que estorba,
        no lo que resulta que mueve el marcador;
      · no es la más grande de su opción —nunca el plato principal—;
      · no llega a un tercio de las kcal de la opción: lo que se quita es un
        acompañamiento, no media comida;
      · no está fija, no se cuenta por unidades y no la has apartado ni escrito
        tú en la vista previa;
      · y su opción se queda con dos alimentos por lo menos.

    ── Una sola puerta: que no haya gramaje que la cuadre ─────────────────────
    La opción sigue fuera del margen después de las dos vueltas. Y solo esa: lo
    que cuadra no pierde nada, aunque quitando algo cuadrara «mejor».

    Estuvo escrita una segunda —«la opción cuadra, sí, pero dejando una fila en
    un gramaje de adorno: 120 g de aguacate en 10 g no son una ración, son una
    coma»— y se retiró al medirla, porque esa situación no existe: `unaPasada`
    se planta con un factor por debajo de 0,25, así que ninguna fila baja de una
    cuarta parte de lo que tenía y no hay adorno que rescatar. Queda escrito
    para que nadie la vuelva a añadir sin medirla.

    ── Se prueba, no se adivina ───────────────────────────────────────────────
    Para cada candidata se quita, se vuelven a dar las dos vueltas y se cuenta
    cuántos macros de esa comida quedan dentro del margen. Gana la que más
    arregla, y solo si arregla MÁS que no tocar nada; en empate, la fila más
    pequeña. Un «quita lo más graso» habría propuesto el brócoli en media docena
    de menús: en el de arriba, quitar la patata deja la opción peor que estaba.

    ── Una por opción ─────────────────────────────────────────────────────────
    Quitar dos de cuatro alimentos es escribirle otra comida al cliente. Cuando
    con una no basta, se quita esa y el aviso de siempre dice lo que queda.
  */
  const quitadas = [];
  if (metas) {
    const dentro = (option, meta) =>
      TARGET_KEYS.filter(
        (k) => toNum0(meta?.[k]) > 0 && cuadra(MEDIDAS[k].valor(optionMacros(option)), meta[k], k)
      ).length;
    const pedidos = (meta) => TARGET_KEYS.filter((k) => toNum0(meta?.[k]) > 0).length;

    partida.forEach((meal, mi) => {
      const meta = metas[mi];
      if (!meta || pedidos(meta) === 0) return;
      (meal.options || []).forEach((option, oi) => {
        const foods = option.foods || [];
        /* Con dos alimentos no hay acompañamiento que quitar: lo que queda es
           media comida. */
        if (foods.length < 3) return;
        const despues = actuales[mi]?.options?.[oi] || option;

        const base = dentro(despues, meta);

        /* Quién lleva el macro que está atascado, con la cesta del ajuste. Y de
           aquí sale también la ley del reposo, sin escribirla dos veces: una
           opción que cuadra no tiene ningún macro fuera, así que no señala a
           nadie y no hay candidatas que probar. Estuvo además un `if` arriba
           diciendo lo mismo; se quitó al no poder hacerlo fallar. */
        const intocable = (f) =>
          f.fijo === true ||
          f.showAs === 'units' ||
          inmoviles?.has(claveDelCambio(meal.name, oi + 1, f.name)) === true;
        const estorban = new Set();
        for (const clave of TARGET_KEYS) {
          if (!(toNum0(meta[clave]) > 0)) continue;
          if (cuadra(MEDIDAS[clave].valor(optionMacros(despues)), meta[clave], clave)) continue;
          for (const f of elegiblesPara(foods, clave, { catalog, intocable }))
            estorban.add(f.id ?? f.name);
        }

        const total = optionMacros(option).kcal;
        const mayor = Math.max(...foods.map((f) => foodMacros(f).kcal));
        const candidatas = foods.filter((f) => {
          const suya = foodMacros(f).kcal;
          if (!(suya > 0) || suya >= mayor || suya > total / 3) return false;
          if (intocable(f)) return false;
          return estorban.has(f.id ?? f.name);
        });
        if (candidatas.length === 0) return;

        /*
          EL ENSAYO SE HACE CON LA OPCIÓN SOLA, y no con el menú entero.

          Con el objetivo bajado a la comida, una opción se ajusta contra la meta
          de SU comida y nada más: ni el día ni sus hermanas entran en la cuenta.
          Así que para preguntar «¿y si esta no llevara aguacate?» basta con dar
          las dos vueltas sobre ella, y las demás se pasan vacías —`unaPasada` se
          salta una opción sin alimentos— para que los índices de `metas`,
          `sentidos` y `origen` sigan cuadrando.

          No es una microoptimización: esto corre en un `useMemo` mientras se
          teclea el objetivo, y recalcular el menú entero una vez por candidata
          lo dejaba en 173 ms por tecla con cinco comidas de seis opciones (7 ms
          sin el reparador). Con la opción sola baja a la decena de milisegundos.
        */
        const enSolitario = (suyos) =>
          partida.map((m, i) => ({
            ...m,
            options: (m.options || []).map((o, j) => ({
              ...o,
              foods: i === mi && j === oi ? suyos : [],
            })),
          }));

        let mejor = null;
        for (const f of candidatas) {
          const sin = enSolitario(foods.filter((x) => x !== f));
          const ensayo = vueltas(sin).meals[mi]?.options?.[oi];
          const puntos = dentro(ensayo, meta);
          if (puntos <= base) continue;
          const coste = foodMacros(f).kcal;
          if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && coste < mejor.coste))
            mejor = { food: f, puntos, coste, mi, oi, meal: meal.name };
        }
        if (mejor) quitadas.push(mejor);
      });
    });

    if (quitadas.length > 0) {
      const podada = partida.map((meal, mi) => {
        const suyas = quitadas.filter((q) => q.mi === mi);
        if (suyas.length === 0) return meal;
        return {
          ...meal,
          options: (meal.options || []).map((option, oi) => {
            const q = suyas.find((x) => x.oi === oi);
            return q
              ? { ...option, foods: (option.foods || []).filter((x) => x !== q.food) }
              : option;
          }),
        };
      });
      ({ meals: actuales, partes: dados, movidos } = vueltas(podada));
    }
  }

  /* Y las tres clases de renglón se juntan aquí: lo escrito a mano, lo movido
     por las pasadas y lo que se propone quitar. */
  const porAlimento = new Map(forzados.map((c) => [claveDelCambio(c.meal, c.option, c.food), c]));
  for (const [llave, c] of movidos) {
    const previo = porAlimento.get(llave);
    porAlimento.set(llave, previo ? { ...previo, to: c.to } : c);
  }
  for (const q of quitadas) {
    porAlimento.set(claveDelCambio(q.meal, q.oi + 1, q.food.name), {
      meal: q.meal,
      option: q.oi + 1,
      food: q.food.name,
      from: toNum0(q.food.grams),
      to: 0,
      quitar: true,
    });
  }

  const cambios = [...porAlimento.values()].filter((c) => c.from !== c.to);
  if (cambios.length === 0) return null;

  /*
    Y quién se ha quedado sin tocar, contado UNA vez sobre el resultado: una
    opción con alimentos y sin un solo gramo movido.

    ── Pero «no se ha movido» no es «no se ha podido» ─────────────────────────
    Con el objetivo bajado a la comida, la mayoría de las alternativas que no se
    mueven es porque YA cuadran con su comida — y decirle al entrenador que «se
    quedan como están: no tienen de dónde recortar» sería alarmar por lo único
    que ha salido bien. Así que se mide: una opción dentro del margen de su
    objetivo no sale en la lista. La que sigue fuera, sí, que es la que
    `rescaleMeals` no ha sabido cuadrar y él tiene que mirar.
  */
  /*
    ══ LAS QUE HAN DEJADO DE SER ALTERNATIVAS ═════════════════════════════════

    Con el objetivo en la comida, todas las opciones de una comida apuntan al
    mismo sitio, así que por fin se puede comprobar lo que `optionGaps` lleva
    diciendo desde que se escribió: «una opción B que se va 300 kcal por encima
    de la A no es una alternativa, es otra comida».

    Y no todas se pueden cuadrar. Una cena que es el doble que su hermana pide
    un factor por debajo de 0,25, y ahí `unaPasada` se planta a propósito: media
    ración de todo no es la misma comida más pequeña. Lo que no puede pasar es
    que el reajuste mueva dieciocho gramajes, diga «hecho» y deje una opción 485
    kcal por encima sin mencionarlo — que es justo la avería que esto venía a
    cerrar, reaparecida al final. Se dice y no se arregla: el entrenador decide
    si esa alternativa se queda, se recorta a mano o deja de serlo.

    ── Contra la opción 1, y no contra el objetivo derivado ───────────────────
    Porque cuando el reparto no está puesto, el objetivo de la comida lo hemos
    derivado nosotros: es una cuenta interna, no una cifra que el entrenador
    haya escrito, y señalar la opción 1 por alejarse de ella sería contarle
    nuestra contabilidad. Lo que sí es suyo —y lo que mira en la hoja— es si las
    alternativas siguen siendo intercambiables. Esa es la pregunta que se
    contesta aquí.

    ── Y se juzga en kilocalorías ─────────────────────────────────────────────
    Macro a macro el aviso no se apagaría nunca: el gramaje se escribe en
    escalones de cocina —25 g en un plato de arroz, casi 20 g de hidratos—
    mientras que el margen del 5 % sobre lo que le toca a esa comida son 8. La
    opción queda todo lo cerca que el escalón permite y aun así saldría
    señalada, no por estar mal sino por medirla con una regla más fina que la
    herramienta. En kilocalorías los restos se compensan entre macros y el suelo
    de 25 kcal los absorbe. Es además con lo que `optionGaps` ya juzga una
    opción dentro de la hoja: dos sitios, un veredicto.
  */
  const fuera = [];
  if (metas) {
    for (const meal of actuales) {
      const opciones = meal.options || [];
      const primera = Math.round(optionMacros(opciones[0]).kcal);
      if (!(primera > 0)) continue;
      opciones.forEach((option, i) => {
        if (i === 0 || (option.foods || []).length === 0) return;
        const tiene = Math.round(optionMacros(option).kcal);
        if (cuadra(tiene, primera, 'kcals')) return;
        fuera.push({ meal: meal.name, option: i + 1, kcals: tiene, primera, diff: tiene - primera });
      });
    }
  }

  /*
    Y quién se ha quedado sin tocar: una opción con alimentos y sin un solo
    gramo movido.

    ── «No se ha movido» no es «no se ha podido» ──────────────────────────────
    Con el objetivo bajado a la comida, casi todas las alternativas que no se
    mueven es porque YA cuadran con lo que les toca — y decirle al entrenador
    que «se quedan como están: no tienen de dónde recortar» sería alarmar por lo
    único que ha salido bien. Sin tocar de verdad es no haberse movido Y seguir
    lejos de su objetivo.
  */
  const leFaltaba = (option, meta) => {
    const suyo = Math.round(kcalOf(meta || {}) || toNum0(meta?.kcals));
    if (!(suyo > 0)) return true;
    return !cuadra(Math.round(optionMacros(option).kcal), suyo, 'kcals');
  };

  const tocadas = new Set(cambios.map((c) => `${c.meal}·${c.option}`));
  const sinTocar = [];
  meals.forEach((meal, mi) => {
    (meal.options || []).forEach((option, i) => {
      if ((option.foods || []).length === 0) return;
      if (tocadas.has(`${meal.name}·${i + 1}`)) return;
      if (metas && !leFaltaba(actuales[mi]?.options?.[i] || option, metas[mi])) return;
      sinTocar.push({ meal: meal.name, option: i + 1 });
    });
  });

  const uno = pasos.length === 1 ? MEDIDAS[pasos[0].clave] : null;
  return {
    meals: actuales,
    /* El de la única pasada; con varias no hay UN factor, y fingir uno sería
       decir que la dieta se ha escalado en bloque cuando no lo ha hecho. */
    ratio: dados.length === 1 ? dados[0].ratio : null,
    cambios,
    sinTocar,
    fuera,
    medida: pasos.length === 1 ? pasos[0].clave : 'macros',
    pasos: dados,
    unidad: uno ? uno.unidad : 'g',
    sinNada: uno ? uno.sinNada : 'no tiene de dónde recortar lo que has pedido',
  };
};
