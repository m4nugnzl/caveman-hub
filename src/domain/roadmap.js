/**
 * El roadmap: el objetivo del cliente repartido en tramos con fechas.
 *
 * ══ Qué añade sobre `goals.js` ═════════════════════════════════════════════
 *
 * `goals.js` responde «¿hacia dónde va esta persona?» con una dirección y un
 * ritmo. Aquí se responde lo mismo pero **por fecha**, y eso cambia dos cosas:
 *
 *   · La analítica deja de equivocarse al cambiar de bloque. El día que empieza
 *     el volumen, subir de peso pasa a leerse como «en rumbo» sin que nadie tenga
 *     que acordarse de tocar nada.
 *   · El cliente puede ver el plan entero, no solo la semana que le toca.
 *
 * ══ La regla de la que dependen todas estas funciones ══════════════════════
 *
 * **Las fases no se solapan.** No se comprueba aquí en cada llamada porque lo
 * garantiza la base de datos con un constraint de exclusión (migración 0028): dos
 * tramos que cubran el mismo día no se pueden ni guardar.
 *
 * Eso es lo que hace que `phaseAt` sea una función de verdad —o hay exactamente
 * una fase, o no hay ninguna— en vez de «la primera que encaje», que es una
 * respuesta que depende del orden y por tanto no es una respuesta.
 *
 * `overlapping()` existe de todas formas, pero no para proteger los datos: para
 * poder decir *cuál* choca antes de mandar el INSERT, porque el error que
 * devuelve Postgres es correcto y no se le puede enseñar a nadie.
 *
 * ══ Sin fases no pasa nada ═════════════════════════════════════════════════
 *
 * Una cartera entera puede no tener ni una, y entonces todo esto devuelve vacío y
 * `clientGoal` sigue leyendo `preferences.goal` como siempre. El roadmap es una
 * capa opcional encima de lo que ya funcionaba, no un reemplazo.
 */

import { daysBetween, todayISO, toISODate } from '@/lib/dates';
import { round, toNum } from '@/lib/num';
import { clientGoal, directionById, targetRateKg } from './goals';

/** Una fase dura al menos esto para que hablar de «ritmo semanal» signifique algo. */
export const MIN_PHASE_DAYS = 7;

/**
 * El rango de duraciones que se puede elegir, en semanas.
 *
 * ── Por qué se piensa en semanas y no en fechas ─────────────────────────────
 * Porque es como se planifica: nadie dice «definición hasta el 23 de mayo», dice
 * «doce semanas de definición». La fecha de fin es una CONSECUENCIA de esa
 * decisión, no la decisión.
 *
 * La primera versión invirtió eso: pedía las dos fechas y ofrecía unos atajos de
 * semanas al lado, con lo que había que hacer la cuenta mentalmente o aceptar el
 * atajo más cercano. Ahora se elige la duración y la fecha se deriva.
 *
 * El tope de 24 no es arbitrario: por encima de medio año, un bloque deja de ser
 * un bloque y lo que toca es partirlo en dos.
 */
export const PHASE_WEEKS_RANGE = { min: 1, max: 24 };

/** Duraciones de un toque: lo que más se usa en la práctica. */
export const PHASE_PRESETS = [4, 8, 12, 16];

/**
 * La fecha en la que acaba un tramo de N semanas que empieza en `startsOn`.
 *
 * Se resta un día porque ambos extremos cuentan: cuatro semanas que empiezan el
 * lunes 1 acaban el domingo 28, no el lunes 29. Ese día de más es justo el que
 * haría que la fase siguiente se solapara y la base la rechazara.
 */
export const endFromWeeks = (startsOn, weeks) => {
  const desde = iso(startsOn);
  const semanas = Math.max(1, Math.round(Number(weeks) || 0));
  return desde ? addDays(desde, semanas * 7 - 1) : null;
};

const iso = (value) => toISODate(value);

/**
 * Ordena por fecha de inicio.
 *
 * Se ordena aquí y no se confía en el orden que devuelva la consulta: las fases
 * llegan por varios caminos —la carga inicial, un alta optimista, una recarga— y
 * el resto del módulo asume orden cronológico para decir «la siguiente».
 */
export const sortPhases = (phases) =>
  [...(phases || [])].sort((a, b) => String(a?.startsOn || '').localeCompare(String(b?.startsOn || '')));

/**
 * Cuántas semanas dura un tramo, o `null` si no son semanas exactas.
 *
 * Sirve para marcar cuál de los atajos de duración está puesto. Devolver `null`
 * ante un tramo de 17 días es lo correcto: no es «2 semanas y pico», es que
 * ninguno de los atajos lo describe, y marcar el más cercano diría que el
 * formulario tiene un valor que no tiene.
 */
export const phaseWeeks = (startsOn, endsOn) => {
  const dias = daysBetween(iso(startsOn), iso(endsOn));
  if (dias === null) return null;
  const total = dias + 1; // ambos extremos incluidos
  return total > 0 && total % 7 === 0 ? total / 7 : null;
};

/** ¿Cubre esta fase esa fecha? Ambos extremos incluidos, igual que en la base. */
export const coversDate = (phase, date = todayISO()) => {
  const day = iso(date);
  const from = iso(phase?.startsOn);
  if (!day || !from || day < from) return false;
  const to = iso(phase?.endsOn);
  return !to || day <= to; // sin final = sigue abierta
};

/**
 * La fase de un día concreto, o `null`.
 *
 * `null` es información y hay que tratarla como tal: significa que ese día cae en
 * un hueco del plan o antes de que empezara. La interfaz debe ofrecerse a
 * rellenarlo, no fingir que hay una fase.
 */
export const phaseAt = (phases, date = todayISO()) =>
  (phases || []).find((phase) => coversDate(phase, date)) || null;

/** La primera fase que empieza después de esa fecha. */
export const nextPhaseAfter = (phases, date = todayISO()) => {
  const day = iso(date);
  if (!day) return null;
  return sortPhases(phases).find((phase) => iso(phase?.startsOn) > day) || null;
};

/**
 * El objetivo de `goals.js` que corresponde a una fase.
 *
 * Devuelve exactamente la misma forma que `clientGoal` —`{direction, ratePct,
 * note}`— y eso es deliberado: así `rateVerdict` y `targetRateKg` funcionan sobre
 * una fase sin enterarse de que existen las fases. Una forma común en vez de dos
 * caminos paralelos que hay que mantener a la vez.
 */
export const phaseGoal = (phase) => {
  const direction = directionById(phase?.direction);
  if (!direction) return null;
  return {
    direction: direction.id,
    ratePct: direction.sign === 0 ? 0 : Math.min(2, Math.abs(Number(phase?.ratePct) || 0)),
    note: typeof phase?.note === 'string' ? phase.note : '',
  };
};

/**
 * El objetivo contra el que hay que juzgar a esta persona HOY.
 *
 * ══ Por qué está aquí y no en `goals.js` ═══════════════════════════════════
 *
 * Porque la dependencia tiene que ir en un solo sentido. `goals.js` no sabe que
 * existen las fases —y no debe: es la capa de abajo, la que define qué es una
 * dirección y cómo se juzga un ritmo—. Si se le añadiera aquí el conocimiento del
 * roadmap tendríamos un ciclo entre los dos módulos, que ESM aguanta y que
 * convierte cualquier refactor posterior en una ruleta.
 *
 * ══ El orden de preferencia, y por qué ese ═════════════════════════════════
 *
 *   1. **La fase que cubre hoy.** Es lo más específico y lo más reciente: si
 *      alguien se ha molestado en planificar este tramo, ese es el criterio.
 *   2. **`preferences.goal`.** Lo de siempre. Cubre a quien no usa el roadmap y
 *      también los huecos entre fases de quien sí.
 *   3. **`null`.** Nadie ha declarado nada, y la analítica ya sabe pedirlo en vez
 *      de inventárselo.
 *
 * Sustituir las dos llamadas a `clientGoal` por esta es lo único que hace falta
 * para que toda la lectura y todos los gráficos entiendan de fases.
 */
export const effectiveGoal = (client, phases, date = todayISO()) => {
  const goal = phaseGoal(phaseAt(phases, date));
  if (goal) return goal;
  return clientGoal(client);
};

/**
 * Por dónde va una fase: días transcurridos, los que quedan y el porcentaje.
 *
 * En una fase abierta (`endsOn` nulo) no hay porcentaje que calcular y se
 * devuelve `null` en `pct` en lugar de un número inventado. Una barra de progreso
 * sobre un final que nadie ha decidido sería una mentira con forma de dato.
 */
export const phaseProgress = (phase, date = todayISO()) => {
  const day = iso(date);
  const from = iso(phase?.startsOn);
  if (!day || !from) return null;

  const to = iso(phase?.endsOn);
  const elapsed = Math.max(0, (daysBetween(from, day) ?? 0) + 1);

  if (!to) {
    return { elapsed, total: null, remaining: null, pct: null, weeksLeft: null, open: true };
  }

  const total = Math.max(1, (daysBetween(from, to) ?? 0) + 1);
  const remaining = Math.max(0, (daysBetween(day, to) ?? 0));

  return {
    elapsed: Math.min(elapsed, total),
    total,
    remaining,
    pct: Math.min(100, Math.round((Math.min(elapsed, total) / total) * 100)),
    // Se redondea hacia arriba: quedando nueve días se dice «2 semanas», que es lo
    // que hay que planificar, y no «1», que llegaría tarde.
    weeksLeft: Math.ceil(remaining / 7),
    open: false,
  };
};

/**
 * El roadmap entero visto desde un día: lo hecho, lo de ahora y lo que viene.
 *
 * Es lo que consume la pantalla de una sola vez para no recorrer la lista cuatro
 * veces con criterios que podrían desincronizarse.
 */
export const roadmapState = (phases, date = todayISO()) => {
  const sorted = sortPhases(phases);
  const day = iso(date);
  const current = phaseAt(sorted, day);

  return {
    all: sorted,
    current,
    progress: current ? phaseProgress(current, day) : null,
    next: nextPhaseAfter(sorted, day),
    past: sorted.filter((phase) => {
      const to = iso(phase?.endsOn);
      return to && day && to < day;
    }),
    future: sorted.filter((phase) => day && iso(phase?.startsOn) > day),
    // Un roadmap que existe pero no cubre hoy: hay plan y hay un agujero. Es el
    // caso que la interfaz tiene que señalar, y sin esto habría que deducirlo.
    gapToday: sorted.length > 0 && !current,
  };
};

/**
 * Las fases que chocarían con un tramo nuevo.
 *
 * Existe para el mensaje, no para la seguridad: la base ya lo impide. Poder decir
 * «se pisa con "Definición" (1 mar – 20 abr)» en vez de soltar el error del
 * constraint es la diferencia entre corregirlo en dos segundos y no entender nada.
 *
 * `ignoreId` deja editar una fase sin que choque consigo misma.
 */
export const overlapping = (phases, candidate, ignoreId = null) => {
  const from = iso(candidate?.startsOn);
  if (!from) return [];
  const to = iso(candidate?.endsOn);

  return (phases || []).filter((phase) => {
    if (!phase || phase.id === ignoreId) return false;
    const otherFrom = iso(phase.startsOn);
    if (!otherFrom) return false;
    const otherTo = iso(phase.endsOn);

    // Dos intervalos cerrados se solapan si cada uno empieza antes de que acabe el
    // otro. Con final nulo el intervalo no acaba nunca, de ahí los `!to`/`!otherTo`.
    return (!to || otherFrom <= to) && (!otherTo || from <= otherTo);
  });
};

/**
 * Comprueba un tramo antes de mandarlo, con el motivo en castellano.
 *
 * Devuelve `null` cuando está bien. Los tres motivos que se pueden dar son los
 * mismos que rechazaría la base —fecha ordenada, duración mínima y solape—, pero
 * dichos donde el usuario puede corregirlos.
 */
export const validatePhase = (phases, candidate, ignoreId = null) => {
  if (!String(candidate?.title || '').trim()) return 'Ponle un nombre a la fase.';
  if (!directionById(candidate?.direction)) return 'Elige si es definición, mantenimiento o volumen.';

  const from = iso(candidate?.startsOn);
  if (!from) return 'Falta la fecha de inicio.';

  const to = iso(candidate?.endsOn);
  if (to) {
    if (to < from) return 'La fecha de fin es anterior a la de inicio.';
    const days = (daysBetween(from, to) ?? 0) + 1;
    if (days < MIN_PHASE_DAYS) {
      return `Una fase de menos de ${MIN_PHASE_DAYS} días no da tiempo a ver una tendencia.`;
    }
  }

  const choques = overlapping(phases, candidate, ignoreId);
  if (choques.length > 0) {
    const primera = choques[0];
    return `Se pisa con «${primera.title}». Ajusta las fechas: una fase empieza el día siguiente al final de la anterior.`;
  }

  return null;
};

/**
 * Un tramo nuevo pegado al final del roadmap.
 *
 * Empieza al día siguiente de donde acabe lo último planificado —o hoy, si no hay
 * nada— para que el caso normal, que es encadenar, no exija tocar ninguna fecha.
 * Una fase que hay que recolocar a mano cada vez se deja de usar a la tercera.
 */
export const nextPhaseDraft = (phases, direction = 'cut', weeks = 12, date = todayISO()) => {
  const sorted = sortPhases(phases);
  const last = sorted[sorted.length - 1];
  const meta = directionById(direction);

  // Detrás de una fase abierta no se puede encadenar nada sin cerrarla antes: el
  // solape sería inevitable. La pantalla lo usa para pedir el final primero.
  if (last && !iso(last.endsOn)) return null;

  const startsOn = last ? addDays(iso(last.endsOn), 1) : iso(date);

  return {
    title: meta?.label || 'Fase',
    direction: meta?.id || 'cut',
    ratePct: meta?.defaultRate ?? 0,
    startsOn,
    endsOn: addDays(startsOn, weeks * 7 - 1),
    note: '',
  };
};

const addDays = (day, count) => {
  const base = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(base)) return null;
  return new Date(base + count * 86400000).toISOString().slice(0, 10);
};

/**
 * DÓNDE VA A ACABAR LA FASE SI SIGUE ASÍ.
 *
 * ══ Por qué hacía falta ════════════════════════════════════════════════════
 *
 * El panel abría con «−0,45 kg/semana», debajo «En rumbo: −0,45 kg/semana»,
 * debajo un medidor con ese mismo −0,45 y debajo «Objetivo: −0,46». Cuatro
 * repeticiones de dos números: mucha tinta para no decir nada que no supieras ya
 * al mirar la báscula.
 *
 * Lo que un entrenador no puede calcular de cabeza —y es lo que decide si toca
 * algo esta semana— es la PROYECCIÓN: a este ritmo, y con las semanas que quedan
 * de fase, ¿dónde acaba? ¿Y coincide con dónde tenía que acabar? Ahí sí hay una
 * decisión: si se va a quedar dos kilos corto quedan cinco semanas para
 * corregir, y si se va a pasar, también.
 *
 * ── Solo con fase cerrada ───────────────────────────────────────────────────
 * Sin final decidido no hay tramo que proyectar, y estirar la recta «hasta
 * siempre» daría un número inventado. Devuelve `null`, y la pantalla enseña
 * entonces lo que sí sabe.
 *
 * ── El peso de partida es el de la báscula, no el del plan ─────────────────
 * El objetivo del final se calcula sobre lo que pesaba AL EMPEZAR la fase, que
 * es contra lo que se fijó el ritmo. Tomarlo del peso de hoy convertiría cada
 * semana de retraso en un objetivo nuevo y más fácil.
 *
 * @returns `{ desde, hoy, proyectado, objetivo, desvio, semanas, restantes }`
 */
export const phaseProjection = ({ phase, history = [], perWeek = null, goal = null, date = todayISO() } = {}) => {
  const progreso = phaseProgress(phase, date);
  if (!progreso || progreso.open || perWeek === null || perWeek === undefined) return null;

  const pesos = [...history]
    .filter((h) => h?.date && toNum(h?.weight) !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (pesos.length === 0) return null;

  const inicio = iso(phase?.startsOn);
  /* El pesaje más cercano al arranque de la fase: el último de antes, y si no
     hubo ninguno, el primero de después. */
  const previo = [...pesos].reverse().find((h) => String(h.date) <= inicio);
  const desde = toNum((previo || pesos[0]).weight);
  const hoy = toNum(pesos[pesos.length - 1].weight);

  const semanas = progreso.total / 7;
  const restantes = progreso.remaining / 7;

  const ritmoObjetivo = targetRateKg(goal, desde);
  const objetivo = ritmoObjetivo === null ? null : round(desde + ritmoObjetivo * semanas, 1);
  const proyectado = round(hoy + perWeek * restantes, 1);

  return {
    desde: round(desde, 1),
    hoy: round(hoy, 1),
    proyectado,
    objetivo,
    desvio: objetivo === null ? null : round(proyectado - objetivo, 1),
    semanas: Math.round(semanas),
    restantes: Math.ceil(restantes),
  };
};
