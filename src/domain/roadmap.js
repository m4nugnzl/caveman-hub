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

import { daysBetween, shortDate, todayISO, toISODate, weekStart } from '@/lib/dates';
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
export const phaseGoal = (phase, date = null) => {
  const direction = directionById(phase?.direction);
  if (!direction) return null;
  /*
    Con fecha, el ritmo es el del último replanteo hecho hasta ese día (decisión
    2a de `docs/roadmap-replanteo.md`): el veredicto semanal juzga contra lo que
    está en vigor, que es lo que decidió el entrenador. Sin fecha, o sin
    replanteos, el de la fase — lo de siempre.
  */
  const vigente = date ? replanteoVigente(phase, date) : null;
  const rate = vigente ? vigente.ratePct : Number(phase?.ratePct) || 0;
  return {
    direction: direction.id,
    ratePct: direction.sign === 0 ? 0 : Math.min(2, Math.abs(rate)),
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
 *
 * ══ El peso objetivo viaja siempre, también con fase ═══════════════════════
 *
 * La fase manda en la DIRECCIÓN y el RITMO, que es lo que se juzga semana a
 * semana. El peso al que se va no es de ninguna fase: es del proceso entero, y
 * vive en `preferences.goal.targetWeightKg`. Devolviendo `phaseGoal` a secas se
 * perdía, y el portal —que lo lee de aquí (Peso, Progreso, Inicio)— dejaba de
 * enseñarlo en cuanto el cliente tenía una fase en curso, mientras el
 * entrenador, que lo lee de `clientGoal`, lo seguía viendo. Ver
 * `docs/eje-temporal.md` §4. Por fase NO hay peso objetivo, a propósito: el
 * destino de una fase ya es su arranque + ritmo × semanas (`phaseProjection`).
 */
export const effectiveGoal = (client, phases, date = todayISO()) => {
  const suelto = clientGoal(client);
  const goal = phaseGoal(phaseAt(phases, date), date);
  if (goal) return { ...goal, targetWeightKg: suelto?.targetWeightKg ?? null };
  return suelto;
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

/* ══════════════════════════════════════════════════════════════════════════
   EL REPLANTEO
   ══════════════════════════════════════════════════════════════════════════

   El entrenador toma la media real de una semana como base nueva y sigue desde
   ahí, con el mismo ritmo o con otro (`client_phases.replanteos`, 0123). El
   razonamiento entero está en `docs/roadmap-replanteo.md`.

   ══ El límite ═════════════════════════════════════════════════════════════
   Nada de esto se hace solo. El sistema enseña la desviación; no sugiere
   replanteos, no reajusta solo, no avisa. Un replanteo existe porque alguien
   pulsó «Igualar aquí» en una semana concreta.

   ══ La expectativa es una recta por tramos ════════════════════════════════
     · Tramo 0: del arranque de la fase, con el pesaje más cercano al arranque
       y el ritmo de la fase. ES LA ORIGINAL, y no cambia nunca.
     · Tramo k: del JUEVES de la semana del replanteo k, con su base y su
       ritmo. El jueves porque la media de una recta en siete días es su valor
       en el día del medio: cada semana se juzga media contra media, y en la
       semana en que se iguala la desviación sale 0 exacto.
   ══════════════════════════════════════════════════════════════════════════ */

/** Tope de la base (0123): un array de 52 como mucho. */
export const MAX_REPLANTEOS = 52;

/** Una base humana, la misma horquilla que el peso objetivo de `clientGoal`. */
const pesoHumano = (v) => {
  const n = toNum(v);
  return n !== null && n >= 20 && n <= 400 ? n : null;
};

/**
 * Los replanteos de una fase, saneados y por semana.
 *
 * Lo que no se pueda leer se ignora al leer, no se borra: un replanteo que se
 * queda fuera porque la fase se acortó vuelve si la fase se alarga. Uno por
 * semana: si la lista trae dos de la misma, gana el último, que es el que
 * sustituyó al otro.
 *
 * @returns `[{ semana, pesoBase, ratePct, nota, creadoEl }]`, de la más vieja a
 *   la más nueva.
 */
export const replanteosDe = (fase) => {
  if (!Array.isArray(fase?.replanteos)) return [];
  const inicio = iso(fase?.startsOn);
  const fin = iso(fase?.endsOn);
  const porSemana = new Map();

  for (const r of fase.replanteos) {
    const semana = iso(r?.semana);
    const pesoBase = pesoHumano(r?.pesoBase);
    const ratePct = toNum(r?.ratePct);
    if (!semana || weekStart(semana) !== semana || pesoBase === null || ratePct === null) continue;
    /* Dentro de la fase: su jueves tiene que caer en ella, que es donde se ancla
       la recta. */
    const jueves = addDays(semana, 3);
    if (!inicio || jueves < inicio || (fin && jueves > fin)) continue;
    porSemana.set(semana, {
      semana,
      pesoBase: round(pesoBase, 2),
      ratePct: Math.min(2, Math.abs(ratePct)),
      nota: typeof r?.nota === 'string' ? r.nota.slice(0, 120) : '',
      creadoEl: r?.creadoEl ?? null,
    });
  }

  return [...porSemana.values()].sort((a, b) => a.semana.localeCompare(b.semana));
};

/** El último replanteo que ya estaba en vigor ese día, o `null`. */
export const replanteoVigente = (fase, date = todayISO()) => {
  const day = iso(date);
  if (!day) return null;
  return replanteosDe(fase).filter((r) => r.semana <= day).pop() || null;
};

/**
 * El peso de partida de una fase: el último pesaje de antes del arranque, y si
 * no hubo ninguno, el primero de después. Es la base del tramo 0 y la `desde`
 * de `phaseProjection`: una sola regla para las dos.
 */
const baseDelArranque = (fase, history = []) => {
  const pesos = [...(history || [])]
    .filter((h) => h?.date && toNum(h?.weight) !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (pesos.length === 0) return null;
  const inicio = iso(fase?.startsOn);
  const previo = [...pesos].reverse().find((h) => String(h.date) <= inicio);
  return toNum((previo || pesos[0]).weight);
};

/**
 * LA EXPECTATIVA DE UNA FASE: sus tramos.
 *
 * Una sola cuenta para todo lo que la dibuja o la mide —`phaseProjection`, la
 * línea y el libro del roadmap—, así que no pueden discrepar.
 *
 * @returns `{ fase, tramos, original }` o `null` si no hay dirección o no hay
 *   ni un pesaje del que partir. Cada tramo es
 *   `{ desde, ancla, base, ratePct, ritmoKg, replanteo }`: `desde` es el día
 *   en que empieza a mandar, `ancla` el día en que vale `base`.
 */
export const expectativaDeFase = (fase, history = []) => {
  const direction = directionById(fase?.direction);
  const inicio = iso(fase?.startsOn);
  const base0 = baseDelArranque(fase, history);
  if (!direction || !inicio || base0 === null) return null;

  const tramo = (desde, ancla, base, ratePct, replanteo) => {
    const rate = direction.sign === 0 ? 0 : Math.min(2, Math.abs(Number(ratePct) || 0));
    return {
      desde,
      ancla,
      base,
      ratePct: rate,
      ritmoKg: targetRateKg({ direction: direction.id, ratePct: rate }, base) ?? 0,
      replanteo,
    };
  };

  const tramos = [
    tramo(inicio, inicio, base0, fase.ratePct, null),
    ...replanteosDe(fase).map((r) => tramo(r.semana, addDays(r.semana, 3), r.pesoBase, r.ratePct, r)),
  ];

  return { fase, tramos, original: tramos[0] };
};

/** El tramo que manda un día: el último que ya había empezado. */
export const tramoEn = (expectativa, date) => {
  const day = iso(date);
  if (!expectativa || !day) return null;
  let vigente = expectativa.tramos[0];
  for (const t of expectativa.tramos) if (t.desde <= day) vigente = t;
  return vigente;
};

/** El valor de un tramo un día, sin redondear: `base + ritmo × días / 7`. */
export const valorDelTramo = (tramo, date) => {
  const dias = daysBetween(tramo?.ancla, iso(date));
  if (!tramo || dias === null) return null;
  return tramo.base + (tramo.ritmoKg * dias) / 7;
};

/** Lo que se espera ese día según lo vigente. */
export const esperadoEn = (expectativa, date) => valorDelTramo(tramoEn(expectativa, date), date);

/**
 * Lo que se esperaba ese día según el plan ORIGINAL: el fantasma. Solo existe
 * desde el primer replanteo; antes, original y vigente son la misma recta y
 * dibujarla dos veces sería ruido.
 */
export const esperadoOriginalEn = (expectativa, date) => {
  const primero = expectativa?.tramos[1];
  const day = iso(date);
  if (!primero || !day || day < primero.desde) return null;
  return valorDelTramo(expectativa.original, day);
};

/**
 * Por qué no se puede igualar esa semana, o `null` si se puede.
 *
 * Las reglas que no caben en un CHECK porque dependen de la fase (0123): la
 * semana dentro de la fase y no futura, porque sin pesajes no hay media.
 */
export const validarReplanteo = (fase, { semana, pesoBase, ratePct } = {}, date = todayISO()) => {
  const lunes = iso(semana);
  if (!fase) return 'Esa semana no está dentro de ninguna fase.';
  if (!lunes || weekStart(lunes) !== lunes) return 'Un replanteo se hace sobre una semana, de lunes a domingo.';
  const jueves = addDays(lunes, 3);
  if (jueves < iso(fase.startsOn) || (fase.endsOn && jueves > iso(fase.endsOn))) {
    return 'Esa semana no está dentro de la fase.';
  }
  if (lunes > iso(date)) return 'No se puede igualar una semana que todavía no ha empezado.';
  if (pesoHumano(pesoBase) === null) return 'La base tiene que ser un peso, en kg.';
  const rate = toNum(ratePct);
  if (rate === null || rate < 0 || rate > 2) return 'El ritmo va de 0 a 2 % por semana.';
  return null;
};

/**
 * La lista de replanteos con uno más. Igualar dos veces la misma semana
 * sustituye al anterior.
 */
export const conReplanteo = (fase, replanteo, ahora = new Date().toISOString()) => {
  const semana = iso(replanteo?.semana);
  const nuevo = {
    semana,
    pesoBase: round(toNum(replanteo?.pesoBase), 2),
    ratePct: Math.min(2, Math.abs(toNum(replanteo?.ratePct) ?? 0)),
    nota: String(replanteo?.nota || '').trim().slice(0, 120),
    creadoEl: ahora,
  };
  const resto = (Array.isArray(fase?.replanteos) ? fase.replanteos : []).filter((r) => iso(r?.semana) !== semana);
  return [...resto, nuevo].sort((a, b) => String(a.semana).localeCompare(String(b.semana))).slice(-MAX_REPLANTEOS);
};

/** La lista sin el replanteo de esa semana; `null` si no queda ninguno (0123: nunca `[]`). */
export const sinReplanteo = (fase, semana) => {
  const lunes = iso(semana);
  const resto = (Array.isArray(fase?.replanteos) ? fase.replanteos : []).filter((r) => iso(r?.semana) !== lunes);
  return resto.length > 0 ? resto : null;
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
 * ── Con replanteos, crece; sin ellos, no cambia ─────────────────────────────
 * `objetivo` y `desvio` pasan a medirse contra la expectativa VIGENTE, que es
 * lo que decidió el entrenador, y se añaden `objetivoOriginal` y
 * `desvioOriginal`. Sin replanteos los dos pares son iguales y todos los
 * números son los de antes: `TarjetaProgreso` sigue funcionando sin tocarla.
 *
 * @returns `{ desde, hoy, proyectado, objetivo, desvio, semanas, restantes,
 *   objetivoOriginal, desvioOriginal, base, replanteo }`
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
  const objetivoOriginal = ritmoObjetivo === null ? null : round(desde + ritmoObjetivo * semanas, 1);
  const proyectado = round(hoy + perWeek * restantes, 1);

  /* Lo vigente: el último tramo, llevado al día siguiente al final, que es el
     mismo punto en el que `desde + ritmo × semanas` mide el original. */
  const expectativa = expectativaDeFase(phase, history);
  const ultimo = expectativa?.tramos[expectativa.tramos.length - 1] || null;
  const replanteo = ultimo?.replanteo || null;
  const objetivo =
    replanteo && objetivoOriginal !== null
      ? round(valorDelTramo(ultimo, addDays(iso(phase.endsOn), 1)), 1)
      : objetivoOriginal;

  return {
    desde: round(desde, 1),
    hoy: round(hoy, 1),
    proyectado,
    objetivo,
    desvio: objetivo === null ? null : round(proyectado - objetivo, 1),
    semanas: Math.round(semanas),
    restantes: Math.ceil(restantes),
    objetivoOriginal,
    desvioOriginal: objetivoOriginal === null ? null : round(proyectado - objetivoOriginal, 1),
    base: replanteo ? round(replanteo.pesoBase, 1) : round(desde, 1),
    replanteo,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   EL ANCLA Y LA TEMPORADA
   ══════════════════════════════════════════════════════════════════════════

   Una fase sabe hacia dónde va el cuerpo; no sabe PARA QUÉ. El ancla es un
   evento del calendario —una competición o un objetivo con fecha— marcado como
   destino del plan (`client_events.ancla`, migración 0122).

   ══ Las fases no se enlazan con el ancla: se miden contra ella ═════════════
   El tramo hacia un ancla son las fases que empiezan en
   `[ancla anterior, ancla)`. Una fase que empieza el mismo día de la
   competición ya es de después. Así no hay nada que etiquetar ni un estado
   contradictorio posible, y `effectiveGoal` no se entera de que esto existe.

   ══ La temporada no es una tabla ═══════════════════════════════════════════
   Es ese mismo tramo, con el nombre de su ancla. Lo que queda detrás de la
   última ancla es plan «sin destino», y se lee como siempre.

   ══ Lo que esto NO hace ════════════════════════════════════════════════════
   Mide y lo dice. No propone fases para tapar un hueco, no reparte un exceso y
   no avisa. Un hueco dibujado es información, no un error de validación. Ver
   `docs/eje-temporal.md` §9.
   ══════════════════════════════════════════════════════════════════════════ */

/** Las anclas de una lista de eventos, por fecha. Acepta el calendario entero. */
export const anclasDelPlan = (events = []) =>
  (events || [])
    .filter((e) => e?.ancla && iso(e?.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

/** La primera ancla de hoy en adelante, o `null`. La de hoy todavía cuenta. */
export const anclaSiguiente = (events = [], date = todayISO()) => {
  const day = iso(date);
  if (!day) return null;
  return anclasDelPlan(events).find((e) => iso(e.date) >= day) || null;
};

/** Por debajo de esto la cuenta atrás se dice en días: dos semanas y un día no son «3 semanas». */
const CUENTA_EN_DIAS = 14;

/**
 * La cuenta atrás hasta un ancla: «faltan 14 semanas», «faltan 9 días», «es hoy».
 *
 * Las semanas se redondean hacia arriba, como `phaseProgress.weeksLeft`: es lo
 * que queda por planificar. Por eso, por debajo de dos semanas se cuenta en
 * días —ahí el redondeo ya engaña—. `null` si el ancla ya pasó: una cuenta
 * atrás negativa sería un reproche, y la casa no reprocha.
 */
export const cuentaAtras = (ancla, date = todayISO()) => {
  const dias = daysBetween(iso(date), iso(ancla?.date));
  if (dias === null || dias < 0) return null;
  if (dias === 0) return { dias, semanas: 0, texto: 'es hoy' };
  if (dias < CUENTA_EN_DIAS) {
    return { dias, semanas: null, texto: dias === 1 ? 'falta 1 día' : `faltan ${dias} días` };
  }
  const semanas = Math.ceil(dias / 7);
  return { dias, semanas, texto: `faltan ${semanas} semanas` };
};

/**
 * Cómo acaba un final contra la fecha del ancla.
 *
 *   · `llega`  — acaba la víspera o el mismo día.
 *   · `hueco`  — acaba antes; `dias` son los que quedan sin cubrir.
 *   · `exceso` — acaba después; `dias` son los que se pasa.
 *   · `abierta`— no tiene final: no se sabe, y no se inventa.
 */
const llegadaDe = (fin, fecha) => {
  if (!fin) return { estado: 'abierta', dias: null };
  const d = daysBetween(fin, fecha);
  if (d === null) return { estado: 'abierta', dias: null };
  if (d === 0 || d === 1) return { estado: 'llega', dias: 0 };
  if (d > 1) return { estado: 'hueco', dias: d - 1 };
  return { estado: 'exceso', dias: -d };
};

/**
 * El plan medido contra UN ancla.
 *
 * `fases` son las del tramo, ya ordenadas. Si la última lleva un cruce (0073),
 * cada camino se mide también: sus semanas contadas desde el día siguiente al
 * final de la fase, igual que haría `optionToPhaseDraft` al elegirlo. Es dibujar
 * un dato —«este llega, este se pasa»—, no recomendar ninguno.
 */
export const llegadaAlAncla = (fases = [], ancla) => {
  const fecha = iso(ancla?.date);
  const ultima = fases[fases.length - 1] || null;
  if (!ultima || !fecha) return { estado: 'vacio', dias: null, caminos: [] };

  const fin = iso(ultima.endsOn);
  const caminos =
    fin && Array.isArray(ultima.nextOptions)
      ? ultima.nextOptions.map((option) => ({
          option,
          ...llegadaDe(endFromWeeks(addDays(fin, 1), option?.weeks), fecha),
        }))
      : [];

  return { ...llegadaDe(fin, fecha), caminos };
};

/**
 * LAS TEMPORADAS: el plan partido por sus anclas.
 *
 * @returns `{ tramos, sinDestino }`. Cada tramo es
 *   `{ ancla, nombre, fases, desde, hasta, pasada, enCurso, llegada }`:
 *   `desde` es el inicio de su primera fase (o `null` si no tiene ninguna),
 *   `hasta` la fecha del ancla. `sinDestino` son las fases detrás de la última.
 */
export const temporadas = (phases = [], events = [], date = todayISO()) => {
  const day = iso(date);
  const fases = sortPhases(phases);
  const anclas = anclasDelPlan(events);

  let desdeAncla = null;
  const tramos = anclas.map((ancla) => {
    const hasta = iso(ancla.date);
    const suyas = fases.filter((f) => {
      const inicio = iso(f.startsOn);
      return inicio && inicio < hasta && (desdeAncla === null || inicio >= desdeAncla);
    });
    const tramo = {
      ancla,
      nombre: ancla.title,
      fases: suyas,
      desde: suyas[0] ? iso(suyas[0].startsOn) : null,
      hasta,
      pasada: Boolean(day && hasta < day),
      /* El día de la competición todavía es de SU temporada, no de la siguiente:
         de ahí el `<` estricto con el ancla anterior. */
      enCurso: Boolean(day && hasta >= day && (desdeAncla === null || desdeAncla < day)),
      llegada: llegadaAlAncla(suyas, ancla),
    };
    desdeAncla = hasta;
    return tramo;
  });

  const sinDestino = desdeAncla === null ? fases : fases.filter((f) => iso(f.startsOn) >= desdeAncla);
  return { tramos, sinDestino };
};

/** «Las fases acaban el 21 mar: quedan 13 días sin plan hasta el Nacional.» */
export const fraseDeLlegada = (tramo) => {
  if (!tramo) return null;
  const { llegada, nombre, fases } = tramo;
  const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
  const fin = fases[fases.length - 1]?.endsOn;
  switch (llegada.estado) {
    case 'llega':
      return `Las fases llegan a ${nombre}.`;
    case 'hueco':
      return `Las fases acaban el ${shortDate(fin)}: quedan ${dias(llegada.dias)} sin plan hasta ${nombre}.`;
    case 'exceso':
      return `La última fase se pasa ${dias(llegada.dias)} de ${nombre}.`;
    case 'abierta':
      return `La última fase no tiene final, así que no se sabe si llega a ${nombre}.`;
    default:
      return `Todavía no hay fases hacia ${nombre}.`;
  }
};
