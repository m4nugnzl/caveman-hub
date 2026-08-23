/**
 * El cruce: los dos o tres caminos que salen del final de una fase.
 *
 * ══ Qué añade sobre `roadmap.js` ═══════════════════════════════════════════
 *
 * `roadmap.js` responde «¿qué toca hoy?» sobre una línea recta: una fase detrás
 * de otra, todas decididas. Y para guardarla hay que decidir hoy lo que viene
 * dentro de tres meses, que no es como se entrena. Lo que se piensa de verdad
 * es: «doce semanas de recomposición, y si el punto ha bajado lo suficiente
 * metemos volumen; si todavía no, seis semanas más de definición».
 *
 * Aquí vive ese «si». Un cruce son dos o tres caminos colgados del final de una
 * fase, con una frase cada uno, y una fecha en la que hay que elegir.
 *
 * ══ Un camino no es una fase, y por eso esto no rompe nada ═════════════════
 *
 * «Volumen, 16 semanas» y «Definición, 6 semanas» empiezan el mismo día: como
 * fases se solaparían, y el `EXCLUDE` de la 0028 —lo único que hace que
 * `phaseAt(hoy)` tenga UNA respuesta— las rechazaría con razón.
 *
 * Así que un camino es un BORRADOR. Vive en un `jsonb` de la fase que lo
 * precede, no tiene fechas y no lo mira nadie más. Al elegir, se convierte en
 * una fase normal —`optionToPhaseDraft`— que pasa por `validatePhase` y por la
 * exclusión como cualquier otra, y los caminos se borran.
 *
 * Consecuencia que importa: **el cruce no toca `effectiveGoal`**. La analítica
 * no se entera de que existe. Un cliente con un cruce planteado se lee hoy
 * exactamente igual que uno sin él.
 *
 * ══ La frase no es una regla ═══════════════════════════════════════════════
 *
 * `when` —«Si el punto ha bajado lo suficiente»— no se compara con nada. Un
 * criterio evaluable («grasa ≤ 12 %») parecería mejor y sería peor: en cuanto
 * hay algo que una máquina puede comprobar aparece la presión para que la
 * aplicación avance sola, y esto acabaría decidiendo por el entrenador. Que la
 * decisión sea suya está escrito en la cabecera de `reading.js` y aquí se
 * respeta por construcción: no hay nada que ejecutar sin que alguien pulse.
 *
 * La evidencia tampoco hace falta inventarla. El día que toca decidir,
 * `weeklyReading` ya está calculando en esa misma ficha el veredicto de ritmo,
 * la adherencia y la fuerza. El cruce solo trae la decisión al momento en el que
 * esa lectura ya está delante.
 *
 * ══ Dónde puede haber un cruce ═════════════════════════════════════════════
 *
 *   1. En la ÚLTIMA fase planificada. Si ya hay otra detrás, la decisión está
 *      tomada y no hay nada que elegir.
 *   2. Con fecha de fin. Sin ella no hay día en el que decidir, y lo garantiza
 *      también la base (`client_phases_fork_needs_end`, migración 0073).
 *
 * De ahí que no haya árboles: nada cuelga de un camino. Se encadenan en el
 * tiempo —decides, y planteas el cruce siguiente—, que da la misma expresividad
 * sin convertir la pantalla en un plano de metro.
 */

import { addDays, daysBetween, todayISO, toISODate } from '@/lib/dates';
import { clampInt, toNum } from '@/lib/num';
import { directionById } from './goals';
import { PHASE_WEEKS_RANGE, endFromWeeks, sortPhases } from './roadmap';

/**
 * Cuántos caminos caben.
 *
 * Uno no es un cruce: eso es la fase siguiente y se crea como siempre. Y más de
 * tres no es una decisión, es no tener criterio.
 */
export const FORK_RANGE = { min: 2, max: 3 };

/** ¿Tiene esta fase un cruce planteado? */
export const hasFork = (phase) =>
  Array.isArray(phase?.nextOptions) && phase.nextOptions.length > 0;

/**
 * La fase a la que se le puede colgar un cruce hoy, o `null`.
 *
 * Es la última del plan, y solo si tiene final. Devolver `null` es lo que deja
 * a la pantalla pedir lo que falta —«ponle un final a la fase primero»— en vez
 * de ofrecer un formulario que la base va a rechazar.
 */
export const forkablePhase = (phases) => {
  const sorted = sortPhases(phases);
  const last = sorted[sorted.length - 1];
  if (!last || !toISODate(last.endsOn)) return null;
  return last;
};

/**
 * El cruce abierto del plan, visto desde un día.
 *
 * Solo se mira la ÚLTIMA fase. Si aparecen caminos en una anterior son restos
 * —alguien creó la fase siguiente y con eso ya eligió—, y hacerles caso sería
 * ofrecer una decisión que ya está tomada. `staleForks` los localiza para que
 * quien escribe pueda limpiarlos.
 */
export const forkState = (phases, date = todayISO()) => {
  const sorted = sortPhases(phases);
  const phase = sorted[sorted.length - 1];
  if (!hasFork(phase)) return null;

  const decidesOn = toISODate(phase.endsOn);
  const daysLeft = daysBetween(toISODate(date), decidesOn);

  return {
    phase,
    options: phase.nextOptions,
    decidesOn,
    daysLeft,
    // El día que acaba la fase todavía cuenta como suyo —los extremos entran—,
    // así que `daysLeft === 0` es «se decide hoy», no «se pasó».
    due: daysLeft !== null && daysLeft <= 0,
    // Y esto es lo que hay que gritar: la fase terminó, nadie eligió, y desde
    // ayer el cliente está en un hueco del plan (`roadmapState.gapToday`).
    overdue: daysLeft !== null && daysLeft < 0,
  };
};

/** Caminos que sobraron: los de cualquier fase que ya no es la última. */
export const staleForks = (phases) => sortPhases(phases).slice(0, -1).filter(hasFork);

/**
 * Un camino en blanco, listo para el formulario.
 *
 * `when` vacío a propósito: es lo único que no se puede proponer por nadie, y
 * dejarlo escrito con un ejemplo haría que se guardara el ejemplo.
 */
export const optionDraft = (direction = 'bulk', weeks = 12) => {
  const meta = directionById(direction) || directionById('bulk');
  return {
    when: '',
    title: meta.label,
    direction: meta.id,
    ratePct: meta.defaultRate,
    weeks: clampInt(weeks, PHASE_WEEKS_RANGE.min, PHASE_WEEKS_RANGE.max, 12),
  };
};

/**
 * El par por defecto: subir o bajar.
 *
 * No es una opinión sobre el caso de cada uno; es que la duda que hace falta
 * escribir en algún sitio casi siempre es esa. El mantenimiento aparece como
 * fase encadenada mucho más que como rama.
 */
export const forkDraft = () => [optionDraft('bulk', 12), optionDraft('cut', 12)];

/**
 * Comprueba los caminos antes de guardarlos, con el motivo en castellano.
 *
 * Devuelve `null` cuando están bien. Es aquí y no en un CHECK con jsonpath
 * porque un camino es un borrador: lo peor que hace uno malformado es pintar una
 * tarjeta rara, y para convertirse en fase tiene que pasar igualmente por
 * `validatePhase` y por los CHECK de la tabla.
 */
export const validateOptions = (options) => {
  if (!Array.isArray(options) || options.length < FORK_RANGE.min) {
    return 'Un cruce son dos caminos o tres. Con uno solo, lo que toca es encadenar la fase siguiente.';
  }
  if (options.length > FORK_RANGE.max) {
    return `Más de ${FORK_RANGE.max} caminos no es una decisión. Quédate con los que de verdad te estás planteando.`;
  }

  for (const option of options) {
    if (!String(option?.when || '').trim()) {
      return 'A cada camino le falta su «si»: cuándo se coge ese y no el otro.';
    }
    if (!String(option?.title || '').trim()) {
      return 'Ponle un nombre a cada camino.';
    }
    if (!directionById(option?.direction)) {
      return 'Cada camino tiene que ser definición, mantenimiento o volumen.';
    }
    const weeks = toNum(option?.weeks);
    if (!Number.isInteger(weeks) || weeks < PHASE_WEEKS_RANGE.min || weeks > PHASE_WEEKS_RANGE.max) {
      return `Cada camino dura entre ${PHASE_WEEKS_RANGE.min} y ${PHASE_WEEKS_RANGE.max} semanas.`;
    }
  }

  /*
    Dos caminos con la misma frase no se distinguen en el momento de elegir, que
    es el único momento en el que se leen. Es un error de copiar y pegar y se
    detecta ahora, no dentro de tres meses delante del cliente.
  */
  const frases = options.map((o) => String(o.when).trim().toLowerCase());
  if (new Set(frases).size !== frases.length) {
    return 'Dos caminos con la misma condición no son una decisión. Cambia uno de los dos «si».';
  }

  return null;
};

/**
 * Comprueba además que el cruce vaya donde puede ir.
 *
 * Las dos reglas de colocación dependen de las demás fases, así que no caben en
 * un CHECK de fila y se comprueban aquí.
 */
export const validateFork = (phases, phaseId, options) => {
  const sorted = sortPhases(phases);
  const phase = sorted.find((p) => p?.id === phaseId);
  if (!phase) return 'Esa fase ya no está.';

  if (!toISODate(phase.endsOn)) {
    return 'La fase no tiene fecha de fin, así que no hay día en el que decidir. Ponle un final primero.';
  }
  if (sorted[sorted.length - 1]?.id !== phaseId) {
    return 'Ya hay otra fase detrás de esta, así que el camino está decidido. El cruce va al final del plan.';
  }

  return validateOptions(options);
};

/**
 * El camino elegido, convertido en la fase que hay que insertar.
 *
 * Las fechas se derivan aquí y no antes: el inicio es el día siguiente al final
 * de la fase que precede —encadenar sin pisarse, la misma cuenta que hace
 * `nextPhaseDraft`— y el final sale de las semanas. Guardarlas en el camino
 * habría dejado dos fechas envejeciendo desde el día en que se escribieron.
 *
 * Devuelve `null` si el camino o la fase no dan para una fase válida, que es lo
 * que la pantalla necesita para no mandar un INSERT que va a fallar.
 */
export const optionToPhaseDraft = (phase, option) => {
  const end = toISODate(phase?.endsOn);
  const meta = directionById(option?.direction);
  const weeks = toNum(option?.weeks);
  if (!end || !meta || !weeks || weeks < PHASE_WEEKS_RANGE.min) return null;

  const startsOn = addDays(end, 1);
  const rate = toNum(option?.ratePct);

  return {
    title: String(option?.title || meta.label).trim(),
    direction: meta.id,
    // Mismo saneado que `clientGoal`: un mantenimiento no tiene ritmo, y un
    // valor ausente es el de por defecto de esa dirección, no un cero.
    ratePct: meta.sign === 0 ? 0 : Math.min(2, Math.abs(rate ?? meta.defaultRate)),
    startsOn,
    endsOn: endFromWeeks(startsOn, weeks),
    /*
      La nota nace vacía y el «si» no viaja con ella. La frase describía la
      DUDA —«si el punto ha bajado lo suficiente»—, y una vez elegido el camino
      la duda ya no existe: dejarla escrita en la fase que empieza contaría el
      pasado en el sitio donde el cliente lee lo que le toca.
    */
    note: '',
  };
};
