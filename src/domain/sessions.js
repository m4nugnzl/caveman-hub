// @ts-check
/**
 * Sesiones de entrenamiento con fecha.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 * Hasta ahora los kilos se anotaban DENTRO del plan: `day.exercises[].sets[]`
 * guardaba a la vez lo programado y lo ejecutado. Eso hacía imposible saber
 * cuándo se entrenó, repetir un día en la misma semana, o distinguir "no lo ha
 * hecho" de "lo hizo con 0 kg". Y si el entrenador cambiaba el plan, se
 * sobrescribía el registro.
 *
 * ── El modelo ───────────────────────────────────────────────────────────────
 * Se separan las dos cosas dentro del mismo JSONB, sin migración:
 *
 *   microcycle.days[]      → EL PLAN: qué ejercicios, en qué orden, con qué
 *                            objetivo de repeticiones y cuántas series.
 *   microcycle.sessions[]  → LA EJECUCIÓN: una entrada por día entrenado, con
 *                            su fecha real y los kilos, repeticiones y RIR.
 *
 *   session = {
 *     id, date: 'YYYY-MM-DD', dayName,
 *     entries: [{ exerciseId, name, muscle, sets: [{ kg, reps, rir }] }],
 *     notes
 *   }
 *
 * ── Compatibilidad ──────────────────────────────────────────────────────────
 * Los datos ya guardados tienen kilos dentro del plan. `legacySession` los
 * expone como una sesión sin fecha propia (se le asigna la del microciclo), de
 * modo que la analítica sigue viéndolos y nada se pierde. Cuando un día ya tiene
 * sesiones registradas, se ignora su versión heredada para no contar doble.
 */

import { newId } from '@/lib/ids';
import { round, toNum } from '@/lib/num';
import { shortDate, todayISO, toISODate } from '@/lib/dates';

const emptySet = () => ({ kg: '', reps: '', rir: '' });

/** ¿Tiene esta serie algo registrado? */
export const isSetLogged = (set) => (toNum(set?.reps) ?? 0) > 0;

/** El RIR a partir del cual una serie ya no va cerca del fallo. */
export const RIR_CERCA_DEL_FALLO = 3;

/** Si una serie con RIR apuntado va cerca del fallo. Sin RIR, sí: no se
    castiga a quien no lo apunta. */
export const cercaDelFallo = (set) => {
  const rir = toNum(set?.rir);
  return rir === null || rir <= RIR_CERCA_DEL_FALLO;
};

/**
 * Una SERIE EFECTIVA, en toda la aplicación: hecha (con repeticiones) y, si
 * lleva RIR, cerca del fallo (`RIR_CERCA_DEL_FALLO` o menos). Una serie a
 * RIR 5 está hecha —cuenta para lo registrado (`isSetLogged`)— pero no es
 * estímulo: no suma al volumen por músculo ni a las series efectivas.
 */
export const esSerieEfectiva = (set) => isSetLogged(set) && cercaDelFallo(set);

/** ¿Tiene este conjunto de series algo registrado? */
const anyLogged = (sets) => (sets || []).some(isSetLogged);

// ── Construcción ───────────────────────────────────────────────────────────

/**
 * Sesión vacía a partir del plan de un día: mismos ejercicios, mismo número de
 * series, todos los valores en blanco.
 */
/**
 * @param {import('@/types').Day} day
 * @param {string} [date]
 * @returns {import('@/types').Session}
 */
export const buildSessionFromPlan = (day, date = todayISO()) => ({
  id: newId('ses'),
  date: toISODate(date) || todayISO(),
  dayName: day.dayName,
  /*
    ── El principio, para que la pantalla pueda contarlo ya ──────────────────
    El sello que MANDA lo pone el servidor (`log_session_set`, 0119): el reloj
    de un teléfono se puede adelantar y la duración se le dice a una persona.
    Éste es la copia optimista, la que hace que el resumen sepa cuánto ha
    costado sin esperar a recargar — y es la misma hora con unos milisegundos
    de diferencia, así que ninguna de las dos miente.
  */
  startedAt: new Date().toISOString(),
  notes: '',
  entries: (day.exercises || []).map((exercise) => ({
    exerciseId: exercise.id,
    name: exercise.name,
    muscle: exercise.muscle,
    sets: (exercise.sets || [emptySet()]).map(() => emptySet()),
  })),
});

// ── Consultas sobre un microciclo ──────────────────────────────────────────

export const sessionsOf = (microcycle) => microcycle?.sessions || [];

/** Sesiones de un día concreto, de la más reciente a la más antigua. */
export const sessionsOfDay = (microcycle, dayName) =>
  sessionsOf(microcycle)
    .filter((s) => s.dayName === dayName)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

export const findSession = (microcycle, sessionId) =>
  sessionsOf(microcycle).find((s) => s.id === sessionId) || null;

/** Series registradas de un ejercicio dentro de una sesión, indexadas por id. */
export const entryFor = (session, exerciseId) =>
  session?.entries?.find((e) => e.exerciseId === exerciseId) || null;

/**
 * Serie a mostrar en la celda: la de la sesión si existe, o vacía. El objetivo
 * de repeticiones NO viene de aquí: es del plan.
 */
export const setFrom = (session, exerciseId, index) =>
  entryFor(session, exerciseId)?.sets?.[index] || emptySet();

// ── Compatibilidad con los datos antiguos ──────────────────────────────────

/**
 * Convierte los kilos guardados dentro del plan en una sesión sin fecha propia.
 * Devuelve `null` si ese día no tiene nada registrado en el plan.
 */
/**
 * @param {import('@/types').Day} day
 * @param {import('@/types').Microcycle} microcycle
 * @returns {import('@/types').Session | null}
 */
export const legacySession = (day, microcycle) => {
  const entries = (day.exercises || [])
    .filter((exercise) => anyLogged(exercise.sets))
    .map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      muscle: exercise.muscle,
      sets: (exercise.sets || []).map((s) => ({ kg: s.kg, reps: s.reps, rir: s.rir })),
    }));

  if (entries.length === 0) return null;

  return {
    id: `legacy_${microcycle.id}_${day.dayName}`,
    date: toISODate(microcycle.date) || null,
    dayName: day.dayName,
    entries,
    notes: '',
    isLegacy: true,
  };
};

/**
 * Lo que la CARTERA necesita saber del entrenamiento de un cliente.
 *
 * ══ Por qué existe esta forma ══════════════════════════════════════════════
 *
 * La cartera y «Hoy» hablan de veinte clientes a la vez, y para eso no hace falta
 * su programa entero: hace falta cuándo entrenó por última vez, cuántas sesiones
 * lleva, cuántas semanas tiene programadas, y las sesiones de los últimos días
 * —esas sí completas, porque «Hoy» dice cuántas series y cuántos kilos—.
 *
 * Un año de programa son varios MB por cliente; esto son unos kilobytes. Es lo que
 * permite que el arranque deje de descargar la cartera entera (`auditoria.md` 1.5).
 *
 * ══ Por qué es una función y no un formato que arme cada uno ═══════════════
 *
 * Porque hay DOS sitios que producen esta forma: el servidor, que la calcula para
 * los veinte clientes a la vez, y esta función, que la deriva del programa
 * completo cuando ya está cargado. Que los dos caminos den lo mismo es la
 * condición para que la cartera no cambie según de dónde vengan los datos, y
 * teniendo la forma definida aquí se puede comprobar con una prueba.
 *
 * @param {{ microcycles?: import('@/types').Microcycle[], blocks?: any[] }} program
 * @param {{ today?: string, days?: number }} ventana
 */
export const trainingSummary = (program, { today = todayISO(), days = 21 } = {}) => {
  const microcycles = program?.microcycles || [];
  const sessions = allSessions(microcycles);

  const desde = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000)
    .toISOString()
    .slice(0, 10);

  return {
    microcycleCount: microcycles.length,
    // La semana más alta que hay montada: la «S3» que la barra pone al lado del nombre.
    weekNumber: microcycles.length ? Math.max(...microcycles.map((m) => m.weekNumber || 0)) : null,
    sessionCount: sessions.length,
    /*
      La última de todas, tenga la edad que tenga: la alerta «X días sin entrenar»
      es justamente la que salta cuando la fecha se sale de cualquier ventana.

      Se busca el máximo entre las que TIENEN fecha en lugar de coger la última de
      la lista: una sesión heredada de un microciclo sin fecha ordena al final
      —`String(null)` es «null», que va después de cualquier año— y dejaría el
      último entreno en blanco teniendo veinte sesiones fechadas delante.
    */
    lastTraining:
      sessions
        .map((s) => s.date)
        .filter(Boolean)
        .sort()
        .pop() || null,
    recentSessions: sessions.filter((s) => s.date && s.date >= desde),
    /*
      ── EL ÍNDICE DEL PROGRAMA ────────────────────────────────────────────────
      Los números de semana escritos y los bloques, sin nada dentro. Con eso
      —y nada más— las funciones de `domain/blocks` saben situar una semana en
      su bloque, así que la cartera puede contestar «¿hay hoja para la que
      viene?» de veinte personas sin descargar el programa de ninguna.

      Es deliberadamente la MISMA forma que un programa (`{ microcycles, blocks }`)
      para que `horizonteEscrito` y `horizonteDeBloque` se le puedan pasar tal
      cual: si hubiera que escribir una versión «de resumen» de esa aritmética,
      habría dos y divergirían.

      Pesa lo que pesa un puñado de enteros: un año de programa son varios MB y
      su índice son cuatro líneas de JSON.
    */
    indice: {
      microcycles: microcycles.map((m) => ({ weekNumber: m.weekNumber })),
      blocks: (program?.blocks || []).map(({ id, name, fromWeek, toWeek, plannedWeeks }) => ({
        id,
        name,
        fromWeek,
        toWeek,
        ...(plannedWeeks ? { plannedWeeks } : {}),
      })),
    },
  };
};

/** El resumen de quien no tiene nada. Evita comprobar `null` en cada consumidor. */
export const emptyTrainingSummary = () => ({
  microcycleCount: 0,
  sessionCount: 0,
  lastTraining: null,
  recentSessions: [],
  indice: { microcycles: [], blocks: [] },
});

/**
 * Convierte los registros heredados en sesiones reales, de una vez y para siempre.
 *
 * ══ Por qué hay que hacerlo, y por qué ahora ═══════════════════════════════
 *
 * Un registro heredado no tiene fecha propia: `legacySession` le pone la del
 * microciclo. Eso ya trae dos problemas conocidos —la analítica de progresión sale
 * movida, y `executedSessions` descarta la versión heredada de un día en cuanto
 * ese día tiene una sesión real, así que los kilos pueden desaparecer sin aviso—.
 *
 * Y trae un tercero que aparece al querer dejar de descargar el programa entero de
 * todos los clientes al arrancar: para saber en el SERVIDOR cuándo entrenó alguien
 * habría que reimplementar en SQL esta compatibilidad —qué cuenta como día
 * entrenado, cuándo se descarta la versión heredada—, es decir, escribir por
 * segunda vez una regla de negocio que ya costó un fallo grave. Con los datos
 * normalizados, «cuándo entrenó» es leer las fechas de `sessions`: mecánico, sin
 * ninguna regla que duplicar.
 *
 * ══ Qué hace exactamente ═══════════════════════════════════════════════════
 *
 * Por cada día del plan con kilos anotados y sin sesión propia, crea la sesión
 * equivalente y **vacía esos valores del plan**, que es donde nunca debieron
 * estar. El plan conserva su estructura: los mismos ejercicios y el mismo número
 * de series, en blanco.
 *
 * Es idempotente: pasado dos veces, la segunda no encuentra nada que convertir.
 *
 * ══ Lo que NO convierte ════════════════════════════════════════════════════
 *
 * Un microciclo sin fecha. La sesión resultante no tendría cuándo, y una sesión
 * sin fecha es exactamente el problema que esto viene a quitar. Se quedan como
 * están —se siguen viendo por el camino heredado— y se informa de cuántos son,
 * porque son los que hay que mirar a mano.
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @returns {{ microcycles: import('@/types').Microcycle[], converted: number, skipped: number }}
 */
export const normalizeMicrocycles = (microcycles) => {
  let converted = 0;
  let skipped = 0;

  const next = (microcycles || []).map((micro) => {
    const covered = new Set(sessionsOf(micro).map((s) => s.dayName));
    const nuevas = [];
    let tocado = false;

    const days = (micro.days || []).map((day) => {
      if (covered.has(day.dayName)) return day;

      const session = legacySession(day, micro);
      if (!session) return day;

      if (!session.date) {
        skipped += 1;
        return day;
      }

      // La sesión pasa a ser real: pierde la marca de heredada, que es lo que
      // hacía que `executedSessions` la tratara como un apaño.
      const { isLegacy: _isLegacy, ...real } = session;
      nuevas.push(real);
      converted += 1;
      tocado = true;

      // El plan se queda con su forma y sin los kilos: eran ejecución, no plan.
      return {
        ...day,
        exercises: (day.exercises || []).map((exercise) => ({
          ...exercise,
          sets: (exercise.sets || []).map(() => emptySet()),
        })),
      };
    });

    if (!tocado) return micro;
    return { ...micro, days, sessions: [...sessionsOf(micro), ...nuevas] };
  });

  return { microcycles: next, converted, skipped };
};

/**
 * Lo EJECUTADO en un microciclo: sus sesiones reales, más las heredadas de los
 * días que no tengan ninguna.
 *
 * ── Por qué esta función es la única puerta a los datos ejecutados ───────────
 * Es la respuesta a «¿qué se ha entrenado esta semana?», y toda la analítica de
 * entrenamiento debe pasar por aquí. Cuando no era así, cada función leía
 * `micro.days` por su cuenta —el PLAN— y el resultado fue que **la analítica dejó
 * de ver los kilos en cuanto el registro pasó a sesiones**: tonelaje 0, volumen
 * vacío, adherencia 0 % y progresión sin puntos, con las series perfectamente
 * guardadas al lado.
 *
 * El descarte de la versión heredada cuando el día ya tiene sesión no es un
 * detalle: sin él los mismos kilos se contarían dos veces.
 */
export const executedSessions = (micro) => {
  if (!micro) return [];
  const real = sessionsOf(micro);
  const covered = new Set(real.map((s) => s.dayName));

  const legacy = [];
  for (const day of micro.days || []) {
    if (covered.has(day.dayName)) continue;
    const session = legacySession(day, micro);
    if (session) legacy.push(session);
  }

  return [...real, ...legacy];
};

/**
 * Todas las sesiones del programa, reales y heredadas, con su microciclo.
 *
 * Si un día ya tiene sesiones registradas, su versión heredada se descarta: los
 * mismos kilos estarían contados dos veces.
 */
/**
 * @param {import('@/types').Microcycle[]} microcycles
 * @returns {import('@/types').Session[]}
 */
export const allSessions = (microcycles) => {
  const out = [];

  for (const micro of microcycles || []) {
    for (const session of executedSessions(micro)) {
      out.push({ ...session, weekNumber: micro.weekNumber });
    }
  }

  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

// ── Métricas de una sesión ─────────────────────────────────────────────────

/** @param {import('@/types').Session} session */
export const sessionTonnage = (session) => {
  let total = 0;
  for (const entry of session?.entries || []) {
    for (const set of entry.sets || []) {
      const kg = toNum(set?.kg);
      const reps = toNum(set?.reps);
      if (kg !== null && reps !== null && kg > 0 && reps > 0) total += kg * reps;
    }
  }
  return Math.round(total);
};

/** Series efectivas (`esSerieEfectiva`) por grupo muscular en una sesión. */
export const sessionMuscleVolume = (session) => {
  const out = {};
  for (const entry of session?.entries || []) {
    const muscle = entry.muscle || 'Otros';
    const count = (entry.sets || []).filter(esSerieEfectiva).length;
    if (count > 0) out[muscle] = (out[muscle] || 0) + count;
  }
  return out;
};

export const sessionSetCount = (session) =>
  (session?.entries || []).reduce((acc, e) => acc + (e.sets || []).filter(isSetLogged).length, 0);

// ── El principio, el fin, y lo que quedó a medias ──────────────────────────
//
// Una sesión era una FECHA con series dentro, y eso deja sin poder decirse las
// dos cosas que la tanda 2 del móvil necesita: cuánto ha costado y si se dejó
// sin terminar. Los dos sellos los pone la 0119.

/**
 * Cuánto duró, en minutos, o `null` si no se puede decir.
 *
 * ══ Por qué se niega a contestar tantas veces ══════════════════════════════
 *
 * Porque esta cifra se le enseña a una persona —«te ha costado 52 min»— y una
 * duración inventada es peor que ninguna. Devuelve `null`:
 *
 *   · si falta cualquiera de los dos sellos (todo lo registrado antes de la
 *     0119, y cualquier sesión todavía abierta);
 *   · si el fin es anterior al principio, que es lo que produciría un reloj
 *     mal puesto;
 *   · y si pasan de SEIS HORAS. Eso no es un entreno largo: es una sesión que
 *     se quedó abierta el martes y se cerró el jueves al abrirla otra vez. La
 *     duración no la ha medido nadie, así que no se dice.
 *
 * Redondeado al minuto, que es la única precisión que significa algo aquí.
 */
export const minutosDeSesion = (session) => {
  const inicio = Date.parse(session?.startedAt || '');
  const fin = Date.parse(session?.endedAt || '');
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return null;
  const minutos = Math.round((fin - inicio) / 60000);
  if (minutos < 0 || minutos > 6 * 60) return null;
  return minutos;
};

/** ¿Tiene algo anotado y nadie la ha cerrado? Entonces se dejó a medias. */
export const sesionAbierta = (session) =>
  Boolean(session) && !session.isLegacy && !session.endedAt && sessionSetCount(session) > 0;

/**
 * LA QUE DEJASTE A MEDIAS: la sesión abierta más reciente de todo el programa.
 *
 * ══ Por qué hace falta que la busque alguien ═══════════════════════════════
 *
 * Porque hoy esa sesión existe en los datos y no existe para la persona. Quien
 * cerró el navegador a mitad de un empuje solo la reencuentra si vuelve a esa
 * hoja por su cuenta — y si no vuelve, se queda ahí con la fecha de anteayer y
 * cuatro series de catorce, contando como un entreno en la adherencia.
 *
 * ── Una, y la más reciente ────────────────────────────────────────────────
 * Puede haber varias abiertas (dos semanas seguidas dejadas a medias). La
 * portada ofrece UNA: anunciar tres es convertir un aviso en una lista de
 * tareas. Y es la última, que es la única que alguien puede querer seguir.
 *
 * ── Las cuentas salen de la SESIÓN, no del plan ───────────────────────────
 * Sus `entries` son la foto del plan de ese día, así que «4 de 14 series» se
 * puede decir sin buscar el día en el microciclo. Si el plan cambió por debajo
 * después, manda lo que la sesión trajo: es lo que la persona tenía delante.
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @returns {{
 *   session: import('@/types').Session, weekNumber: number, dayName: string,
 *   hechas: number, series: number, ejercicios: number, conAlgo: number
 * } | null}
 */
export const sesionAMedias = (microcycles) => {
  let elegida = null;

  for (const micro of microcycles || []) {
    if (!Number.isFinite(micro?.weekNumber)) continue;
    for (const session of sessionsOf(micro)) {
      if (!sesionAbierta(session)) continue;
      const cuando = session.startedAt || session.date || '';
      /* Por el sello de inicio y, sin él, por la fecha: las dos son cadenas ISO
         y ordenan igual. Una sesión sin ninguno de los dos no puede ganar. */
      if (!elegida || String(cuando).localeCompare(elegida.cuando) > 0) {
        elegida = { session, weekNumber: micro.weekNumber, cuando: String(cuando) };
      }
    }
  }

  if (!elegida) return null;

  const entries = elegida.session.entries || [];
  return {
    session: elegida.session,
    weekNumber: elegida.weekNumber,
    dayName: elegida.session.dayName,
    hechas: sessionSetCount(elegida.session),
    series: entries.reduce((n, e) => n + (e.sets || []).length, 0),
    ejercicios: entries.length,
    conAlgo: entries.filter((e) => (e.sets || []).some(isSetLogged)).length,
  };
};

/** ¿Está la sesión completa respecto al plan del día? */
export const sessionCompletion = (session, day) => {
  const planned = (day?.exercises || []).reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);
  const logged = sessionSetCount(session);
  if (planned === 0) return null;
  return { planned, logged, pct: Math.round((logged / planned) * 100) };
};

/** Series de una sesión con su RIR, para el reparto de intensidad. */
export const sessionRirCounts = (session, counts = new Map()) => {
  for (const entry of session?.entries || []) {
    for (const set of entry.sets || []) {
      if (!isSetLogged(set)) continue;
      const rir = toNum(set?.rir);
      const key = rir === null ? 'sin dato' : String(Math.round(rir));
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
};

/** Mejor serie de un ejercicio en una sesión, por 1RM estimado. */
export const bestSetOf = (session, exerciseName, estimate) => {
  let best = null;
  for (const entry of session?.entries || []) {
    if (entry.name !== exerciseName) continue;
    for (const set of entry.sets || []) {
      const kg = toNum(set?.kg);
      const reps = toNum(set?.reps);
      if (kg === null || reps === null || reps <= 0) continue;
      const e1rm = estimate(kg, reps);
      if (e1rm !== null && (best === null || e1rm > best.e1rm)) best = { kg, reps, e1rm };
    }
  }
  return best;
};

/** Días distintos entrenados, para medir frecuencia real. */
export const trainedDates = (sessions) =>
  [...new Set(sessions.map((s) => s.date).filter(Boolean))].sort();

// ── Unión de plan y ejecución para la interfaz ──────────────────────────────

/**
 * Combina el PLAN de un día con los valores de una SESIÓN concreta.
 *
 * Devuelve los ejercicios con la misma forma que antes, de modo que la lista de
 * ejercicios no necesita saber que ahora hay dos orígenes:
 *
 *   · `targetReps` y `targetRir` vienen del PLAN (lo que el entrenador pidió).
 *   · `kg`, `reps` y `rir` vienen de la SESIÓN (lo que se ejecutó ese día).
 *
 * Los dos objetivos van juntos por el mismo motivo: son lo que se PIDE. Dejar
 * `targetRir` fuera de aquí era el fallo que hacía que el cliente escribiera su
 * RIR sin ver nunca el que se le había programado.
 *
 * El número de series lo marca siempre el plan, así que si el entrenador añade o
 * quita series no hace falta migrar las sesiones ya guardadas: lo que falte sale
 * en blanco y lo que sobre se ignora.
 */
export const mergePlanWithSession = (day, session) => {
  if (!day) return [];

  return (day.exercises || []).map((exercise) => {
    const entry = entryFor(session, exercise.id);
    return {
      ...exercise,
      sets: (exercise.sets || []).map((planSet, index) => {
        const logged = entry?.sets?.[index];
        return {
          targetKg: planSet?.targetKg ?? '',
          targetReps: planSet?.targetReps ?? '',
          targetRir: planSet?.targetRir ?? '',
          /* El remate de esta serie es PLAN: viene del plan aunque la sesión ya
             tenga registros. Sus subseries, en cambio, son de las dos mitades —
             lo pautado lo dice `tecnica`, lo levantado va en `extras`—. */
          ...(planSet?.tecnica ? { tecnica: planSet.tecnica } : {}),
          ...(Array.isArray(logged?.extras) ? { extras: logged.extras } : {}),
          kg: logged?.kg ?? '',
          reps: logged?.reps ?? '',
          rir: logged?.rir ?? '',
        };
      }),
      /* Lo que dijo el cliente de este ejercicio EN ESTE entreno. Viaja con el
         ejercicio fusionado porque se lee justo ahí —en su ficha, y encima de
         sus series en la pantalla del entrenador— y no encima de la sesión.
         `coachNote` llega por el `...exercise` de arriba: es del plan. */
      clientNote: entry?.clientNote ?? '',
    };
  });
};

/**
 * Escribe un valor de ejecución en una sesión, creando lo que falte por el
 * camino (la entrada del ejercicio o la serie), de forma inmutable.
 *
 * ── `sub`: las subseries de un remate ──────────────────────────────────────
 * Una bajada doble son dos tandas más colgando de la serie, y cada una tiene
 * sus kilos y sus repeticiones. Van en `sets[i].extras[j]` y NO como series
 * sueltas del array: una serie con bajada sigue siendo UNA serie para el
 * volumen, y meterlas en `sets` inflaría el recuento del microciclo (que es la
 * cifra con la que se decide la semana siguiente). Ver `TECNICAS`.
 */
export const withSessionSet = (session, exercise, setIndex, field, value, sub = null) => {
  const entries = [...(session.entries || [])];
  const at = entries.findIndex((e) => e.exerciseId === exercise.id);

  const base =
    at >= 0
      ? { ...entries[at], sets: [...(entries[at].sets || [])] }
      : {
          exerciseId: exercise.id,
          name: exercise.name,
          muscle: exercise.muscle,
          sets: [],
        };

  while (base.sets.length <= setIndex) base.sets.push(emptySet());
  if (sub === null) {
    base.sets[setIndex] = { ...base.sets[setIndex], [field]: value };
  } else {
    const extras = [...(base.sets[setIndex].extras || [])];
    while (extras.length <= sub) extras.push({ kg: '', reps: '' });
    extras[sub] = { ...extras[sub], [field]: value };
    base.sets[setIndex] = { ...base.sets[setIndex], extras };
  }

  // El nombre y el músculo se refrescan: si el entrenador renombró el ejercicio,
  // la sesión guardada conservaría el nombre viejo en la analítica.
  base.name = exercise.name;
  base.muscle = exercise.muscle;

  if (at >= 0) entries[at] = base;
  else entries.push(base);

  return { ...session, entries };
};

/**
 * Sesiones de un día incluyendo la heredada, para el selector de la interfaz.
 *
 * Si el día ya tiene sesiones reales la heredada se omite: sus kilos son los
 * mismos y aparecerían duplicados.
 */
export const allSessionsOfDay = (microcycle, dayName) => {
  const real = sessionsOfDay(microcycle, dayName);
  if (real.length > 0) return real;

  const day = (microcycle?.days || []).find((d) => d.dayName === dayName);
  const legacy = day ? legacySession(day, microcycle) : null;
  return legacy ? [legacy] : [];
};

/** Etiqueta legible de una sesión para el selector. */
export const sessionLabel = (session) => {
  if (!session) return 'Sin sesión';
  if (session.isLegacy) return 'Registro anterior';
  return session.date ? shortDate(session.date) : 'Sin fecha';
};

// ── La vez anterior ────────────────────────────────────────────────────────

/**
 * Lo último que se levantó en cada serie, antes de la semana que se está
 * registrando.
 *
 * ══ Por qué hace falta ══════════════════════════════════════════════════════
 *
 * Es la pregunta que se hace CADA VEZ que alguien se pone delante de una barra:
 * ¿cuánto le metí la semana pasada? Sin ella no hay progresión — subir cinco
 * kilos exige saber de qué. Y la aplicación no la contestaba: para verlo había
 * que irse al selector de semanas, retroceder, buscar el día, leer la cifra y
 * volver, en mitad del descanso entre series y con el móvil en una mano.
 *
 * ── Y por qué NO se rellenan los campos ─────────────────────────────────────
 * Porque son dos cosas distintas. `blankDays` vacía a propósito lo ejecutado al
 * crear la semana siguiente, y hace bien: unos kilos heredados que nadie ha
 * levantado son indistinguibles de los reales y la analítica daría por entrenada
 * una semana que no se ha hecho. Esto no rellena nada — solo enseña la
 * referencia al lado, y lo que se guarda sigue siendo únicamente lo que teclea
 * la persona.
 *
 * ── Por qué se busca por NOMBRE y no por id ─────────────────────────────────
 * Porque al clonar una semana, `reidExercises` le da un id nuevo a cada
 * ejercicio: el press de banca de la semana 4 no comparte id con el de la 3. Lo
 * que se mantiene entre semanas es el nombre, que además es lo que el cliente
 * reconoce.
 *
 * ── Por qué el orden es por SEMANA y luego por fecha ────────────────────────
 * Una sesión heredada puede no tener fecha, y `String(null)` ordena después de
 * cualquier año. Ordenando primero por el número de semana, una sesión sin fecha
 * no puede colarse como «la más reciente».
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @param {number} weekNumber Semana que se está registrando; solo cuentan las anteriores.
 * @returns {Map<string, { kg: string, reps: string, weekNumber: number, date: string|null }>}
 */
export const previousSetsBefore = (microcycles, weekNumber) => {
  const out = new Map();
  if (!Number.isFinite(weekNumber)) return out;

  const anteriores = allSessions(microcycles)
    .filter((s) => Number.isFinite(s.weekNumber) && s.weekNumber < weekNumber)
    .sort(
      (a, b) =>
        a.weekNumber - b.weekNumber || String(a.date || '').localeCompare(String(b.date || ''))
    );

  /* De la más antigua a la más reciente: la última que escribe cada clave es la
     que queda, que es justo la que se busca. */
  for (const session of anteriores) {
    for (const entry of session.entries || []) {
      if (!entry.name) continue;
      (entry.sets || []).forEach((set, index) => {
        if (!isSetLogged(set)) return;
        out.set(previousSetKey(entry.name, index), {
          kg: set.kg ?? '',
          reps: set.reps ?? '',
          /* El RIR de la vez anterior, para el «La última vez: 45 · 8 · RIR 0»
             del modo entreno. Solo se enseña con el módulo encendido. */
          rir: set.rir ?? '',
          weekNumber: session.weekNumber,
          date: session.date || null,
        });
      });
    }
  }

  return out;
};

/** La clave del mapa anterior. En un solo sitio para que no diverja. */
export function previousSetKey(exerciseName, setIndex) {
  return `${claveDeEjercicio(exerciseName)}#${setIndex}`;
}

// ── Qué ejercicio es el mismo ──────────────────────────────────────────────

/**
 * LA CLAVE DE UN EJERCICIO: su nombre sin espacios de más y en minúsculas.
 *
 * Es la ÚNICA manera en que la app decide que dos ejercicios son el mismo
 * —el historial, la vez anterior, la última nota y los ajustes del cliente
 * (`exercise_settings`, 0139)—, y por eso vive en un solo sitio: «Press banca»
 * y «press  banca » tienen que ser lo mismo en todas partes o en ninguna.
 *
 * ── Por qué el nombre y no un id ──────────────────────────────────────────
 * Porque el plan no guarda ningún id de ejercicio que dure: al añadirlo a una
 * hoja se copian su nombre y su músculo, y el id del hueco cambia al clonar un
 * microciclo (`reidExercises`).
 * FASE FUTURA: guardar en cada ejercicio del plan el id de la librería o del
 * catálogo, y cambiar esta clave por ese id. Hasta entonces, renombrar un
 * ejercicio lo separa de su historial y de sus ajustes.
 */
export const claveDeEjercicio = (nombre) =>
  String(nombre ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Las sesiones del programa con este ejercicio, de la más reciente a la más
 * antigua, con su entrada. Por semana y luego por fecha, como
 * `previousSetsBefore`: una sesión heredada sin fecha no puede colarse como la
 * última.
 */
const sesionesDelEjercicio = (microcycles, nombre, { sinSesion = null, antesDe = null } = {}) => {
  const clave = claveDeEjercicio(nombre);
  if (!clave) return [];
  return allSessions(microcycles)
    .filter((s) => !sinSesion || s.id !== sinSesion)
    .filter((s) => !antesDe || !s.date || String(s.date) <= String(antesDe))
    .sort(
      (a, b) =>
        (a.weekNumber ?? 0) - (b.weekNumber ?? 0) || String(a.date || '').localeCompare(String(b.date || ''))
    )
    .reverse()
    .map((session) => ({
      session,
      entry: (session.entries || []).find((e) => claveDeEjercicio(e.name) === clave) || null,
    }))
    .filter((x) => x.entry);
};

/**
 * LA ÚLTIMA VEZ en un ejercicio: la sesión más reciente en la que se apuntó
 * alguna serie de él, con sus series y su nota.
 *
 * ── UNA sesión, y no serie a serie ────────────────────────────────────────
 * `previousSetsBefore` junta, serie por serie, lo último de cada índice: si la
 * última vez hizo dos series, la tercera sale de otra sesión más vieja. Y solo
 * mira microciclos anteriores, así que el jueves no veía el lunes de la misma
 * semana. Esto es un día concreto, y lo que dice el bloque «La última vez» y
 * lo que sale en gris en las casillas es lo mismo.
 *
 * ── Cualquier rutina y cualquier microciclo ───────────────────────────────
 * Se busca por el ejercicio, no por el hueco en la hoja: el press del jueves
 * ve el press del lunes aunque sean dos hojas distintas.
 *
 * @param sinSesion  La sesión que se está mirando: la suya no es «la última».
 * @param antesDe    Su fecha (ISO). Pasar del papel el martes con el jueves
 *   ya apuntado tiene que enseñar lo de antes del martes.
 * @returns `{ fecha, weekNumber, dayName, series, sets, nota }` o `null`.
 *   `sets` va alineado con los índices (`null` en la que no se hizo), para las
 *   casillas; `series` son solo las hechas, para leerlas.
 */
export const ultimaVezDeEjercicio = (microcycles, nombre, opciones = {}) => {
  for (const { session, entry } of sesionesDelEjercicio(microcycles, nombre, opciones)) {
    const sets = (entry.sets || []).map((s) =>
      isSetLogged(s) ? { kg: String(s.kg ?? ''), reps: String(s.reps ?? ''), rir: String(s.rir ?? '') } : null
    );
    if (!sets.some(Boolean)) continue;
    return {
      fecha: session.date || null,
      weekNumber: session.weekNumber,
      dayName: session.dayName,
      series: sets.filter(Boolean),
      sets,
      nota: String(entry.clientNote || '').trim(),
    };
  }
  return null;
};

// ── Lo que hiciste en un ejercicio, y tu marca ─────────────────────────────
//
// Las dos son PUERTAS, no cálculos nuevos: `previousSetsBefore` ya recorre
// todos los microciclos del programa indexando por nombre de ejercicio, y lo
// hace mientras se entrena. Ese histórico completo se estaba enseñando solo
// como el número gris de dentro del campo. Ver `M-03`.

/**
 * SESIÓN A SESIÓN, lo que se levantó en este ejercicio. De hoy hacia atrás.
 *
 * ── Por nombre, y eso es lo que hace que cruce bloques ────────────────────
 * Al clonar una semana cada ejercicio estrena id (`reidExercises`), así que el
 * press de banca de septiembre no comparte id con el de agosto. Lo que se
 * mantiene es el nombre, que además es lo que la persona reconoce — y por eso
 * el bloque de hace dos meses sigue apareciendo aquí.
 *
 * ── Solo lo que tiene algo escrito ────────────────────────────────────────
 * Una sesión sin series anotadas de este ejercicio no es un día en el que lo
 * hiciste flojo: es un día en el que no lo hiciste. Enseñarla vacía diría lo
 * primero.
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @param {string} nombre
 * @returns {{
 *   weekNumber: number, date: string|null, dayName: string,
 *   sets: { kg: string, reps: string }[], nota: string
 * }[]}
 */
export const historialDeEjercicio = (microcycles, nombre) => {
  const buscado = claveDeEjercicio(nombre);
  if (!buscado) return [];

  const dias = [];
  for (const session of allSessions(microcycles)) {
    for (const entry of session.entries || []) {
      if (claveDeEjercicio(entry.name) !== buscado) continue;
      const sets = (entry.sets || [])
        .filter(isSetLogged)
        .map((s) => ({ kg: s.kg ?? '', reps: s.reps ?? '' }));
      if (sets.length === 0) continue;
      dias.push({
        weekNumber: session.weekNumber,
        date: session.date || null,
        dayName: session.dayName,
        sets,
        nota: String(entry.clientNote || '').trim(),
      });
    }
  }

  /* `allSessions` ordena por fecha de la más antigua a la más reciente; aquí se
     quiere al revés, porque lo que se busca al abrir esto es la última vez. */
  return dias.reverse();
};

/**
 * TU MARCA en un ejercicio: el peso máximo, las repeticiones máximas y el
 * tonelaje de todo lo que llevas hecho.
 *
 * ── Por qué las tres por separado y no un 1RM estimado ────────────────────
 * Porque son tres hechos y el 1RM es una fórmula. `e1rm` existe y sirve para
 * ordenar récords —ahí hay que comparar 100×3 con 80×8 de alguna manera—, pero
 * en la ficha de quien entrena un número calculado invita a perseguirlo, y esta
 * aplicación no propone objetivos. «32 kg» y «12 reps» son cosas que pasaron.
 *
 * El máximo de repeticiones es el de CUALQUIER serie, no el de la serie del
 * peso máximo: son dos marcas distintas y juntarlas escondería una de las dos.
 *
 * @param {ReturnType<typeof historialDeEjercicio>} historial
 */
export const marcasDeEjercicio = (historial) => {
  let maxKg = null;
  let maxReps = null;
  let tonelaje = 0;

  for (const dia of historial || []) {
    for (const set of dia.sets) {
      const kg = toNum(set.kg);
      const reps = toNum(set.reps);
      if (kg !== null && (maxKg === null || kg > maxKg)) maxKg = kg;
      if (reps !== null && (maxReps === null || reps > maxReps)) maxReps = reps;
      if (kg !== null && reps !== null && kg > 0 && reps > 0) tonelaje += kg * reps;
    }
  }

  return { maxKg, maxReps, tonelaje };
};

/**
 * EL REGISTRO: todos sus ejercicios, por lo último que levantó en cada uno.
 *
 * ══ Qué contesta ═══════════════════════════════════════════════════════════
 *
 * «¿Cuánto hice la última vez en press banca?». Es la pregunta que una persona
 * le hace a su historial, y la que se hace de pie delante de la máquina —no
 * «cuánto tonelaje llevo este mes», que es la pregunta de quien programa—.
 *
 * Por eso el progreso del entreno EN EL TELÉFONO es esta lista y no una gráfica:
 * una curva de tonelaje se mira una vez al mes con calma, y esto se mira entre
 * serie y serie. Ver `docs/portal-dos-aparatos.html`, «el logbook».
 *
 * ── La serie que representa un día es la MÁS PESADA ────────────────────────
 * No la primera ni la última. Un día de press banca son 82,5×8, 82,5×8 y 75×10
 * al fallo: la primera y la tercera cuentan cosas distintas, y la que alguien
 * recuerda como «lo que hice» es la de más peso. A igualdad de peso manda la de
 * más repeticiones, que es la misma regla con la que se ordena un récord.
 *
 * ── El salto se mide contra el DÍA anterior, no contra el récord ───────────
 * «+5 kg» quiere decir «cinco más que la última vez», que es lo que hace mirar
 * la lista. Contra el récord, quien viene de una descarga vería «−15 kg» en todo
 * y la lista se leería como un suspenso — y esta aplicación no juzga, resalta.
 * Sin día anterior no hay salto: `null`, y quien pinta decide qué escribe.
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @returns `[{ nombre, kg, reps, date, dayName, salto, veces }]`, del más
 *   reciente al más antiguo.
 */
export const registroDeEjercicios = (microcycles) => {
  /* Un paso por todas las sesiones y no uno por ejercicio: `historialDeEjercicio`
     recorre el historial entero cada vez que se le llama, y llamarlo una vez por
     nombre sería recorrerlo cuarenta veces para pintar una lista. */
  const porNombre = new Map();

  for (const session of allSessions(microcycles)) {
    for (const entry of session.entries || []) {
      const nombre = String(entry.name || '').trim();
      if (!nombre) continue;

      /* La más pesada del día. `isSetLogged` ya descarta la serie en blanco: sin
         repeticiones no hubo serie, aunque lleve kilos escritos. */
      let mejor = null;
      for (const set of entry.sets || []) {
        if (!isSetLogged(set)) continue;
        const kg = toNum(set.kg) ?? 0;
        const reps = toNum(set.reps) ?? 0;
        if (!mejor || kg > mejor.kg || (kg === mejor.kg && reps > mejor.reps)) mejor = { kg, reps };
      }
      if (!mejor) continue;

      const previo = porNombre.get(nombre);
      porNombre.set(nombre, {
        nombre,
        kg: mejor.kg,
        reps: mejor.reps,
        date: session.date || null,
        dayName: session.dayName,
        /* El día de antes es el que estaba guardado, porque `allSessions` va de
           la más antigua a la más reciente y esta lo sustituye. */
        anterior: previo ? { kg: previo.kg, reps: previo.reps } : null,
        veces: (previo?.veces || 0) + 1,
      });
    }
  }

  return [...porNombre.values()]
    .map((e) => ({
      ...e,
      salto: e.anterior ? round(e.kg - e.anterior.kg, 2) : null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

// ── La hoja veraz: lo hecho al lado del plan ───────────────────────────────

/**
 * La última sesión ejecutada de una hoja dentro de unas semanas concretas.
 *
 * Es la materia prima del «fantasma» del plan: bajo la pauta de cada ejercicio
 * se enseña lo que la persona hizo la última vez que tocó esa hoja, y para eso
 * hay que encontrar esa vez. Se queda con la más reciente por semana y, dentro
 * de la semana, por fecha — el mismo criterio de `previousSetsBefore`.
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @param {number[]} weeks — en qué semanas buscar (las del bloque, normalmente)
 * @param {string} dayName
 */
export const ultimaSesionDeHoja = (microcycles, weeks, dayName) => {
  const quiero = new Set(weeks || []);
  let mejor = null;
  for (const micro of microcycles || []) {
    if (!quiero.has(micro.weekNumber)) continue;
    for (const session of executedSessions(micro)) {
      if (session.dayName !== dayName) continue;
      const candidata = { ...session, weekNumber: micro.weekNumber };
      if (
        !mejor ||
        candidata.weekNumber > mejor.weekNumber ||
        (candidata.weekNumber === mejor.weekNumber &&
          String(candidata.date || '').localeCompare(String(mejor.date || '')) > 0)
      ) {
        mejor = candidata;
      }
    }
  }
  return mejor;
};

/**
 * Lo que hizo con UN ejercicio en una sesión, listo para leerse en una línea:
 * el mayor peso que movió y sus repeticiones serie a serie («80 kg · 8·8·7»).
 * Empareja por nombre, como `previousSetsBefore`, y por el mismo motivo.
 * Devuelve `null` si esa sesión no registró nada del ejercicio.
 */
export const resumenDeEntrada = (session, exerciseName) => {
  const entry = (session?.entries || []).find((e) => e.name === exerciseName);
  const sets = (entry?.sets || []).filter(isSetLogged);
  if (sets.length === 0) return null;
  const kgs = sets.map((s) => toNum(s.kg)).filter((kg) => kg !== null && kg > 0);
  return {
    kg: kgs.length > 0 ? Math.max(...kgs) : null,
    reps: sets.map((s) => toNum(s.reps)),
    series: sets.length,
  };
};

// ── La mejor marca, para saber cuándo hay un récord ────────────────────────

/**
 * EPLEY, la única copia: kg × (1 + reps/30). No es un dato: es la vara con la
 * que comparar dos series de distinto peso y distintas repeticiones —90 × 8
 * contra 95 × 5— para decir cuál es mejor. Solo se usa para eso; la línea de
 * tiempo nunca lo enseña como cifra, solo su variación en %.
 *
 * Hasta el 24 sep había dos copias (esta y `estimatedOneRm` en `training.js`)
 * que no coincidían: aquella redondeaba, descartaba más de 12 repeticiones y
 * pasaba la serie de 1 por la fórmula. Ahora la fórmula vive aquí y el tope lo
 * pide quien lo necesita.
 *
 * @param hasta las repeticiones por encima de las cuales la serie no se mide
 *              (la fórmula pierde precisión pasadas las 12). Sin tope si no
 *              se pasa.
 * @returns el número, o `0` si la serie no se puede medir. `0` y no `null`
 *          porque quien compara hace `>` y `Math.max` con él.
 */
export const e1rm = (kg, reps, { hasta = null } = {}) => {
  const k = toNum(kg) ?? 0;
  const r = toNum(reps) ?? 0;
  if (k <= 0 || r <= 0) return 0;
  if (hasta !== null && r > hasta) return 0;
  return r === 1 ? k : k * (1 + r / 30);
};

/**
 * La mejor serie de cada ejercicio ANTES de una semana: el listón que hay que
 * superar para que una serie de hoy sea un récord.
 *
 * Empareja por nombre, como `previousSetsBefore`, y por el mismo motivo. Solo
 * cuentan las series con kilos: una serie a peso corporal no tiene marca que
 * batir con esta vara.
 *
 * @returns {Map<string, {kg: string, reps: string, e1rm: number, weekNumber: number}>}
 */
export const bestSetsBefore = (microcycles, weekNumber) => {
  const out = new Map();
  if (!Number.isFinite(weekNumber)) return out;

  for (const session of allSessions(microcycles)) {
    if (!Number.isFinite(session.weekNumber) || session.weekNumber >= weekNumber) continue;
    for (const entry of session.entries || []) {
      if (!entry.name) continue;
      for (const set of entry.sets || []) {
        const marca = e1rm(set?.kg, set?.reps);
        if (marca <= 0) continue;
        const actual = out.get(entry.name);
        if (!actual || marca > actual.e1rm) {
          out.set(entry.name, { kg: set.kg, reps: set.reps, e1rm: marca, weekNumber: session.weekNumber });
        }
      }
    }
  }

  return out;
};

/** Si una serie supera el listón de su ejercicio. Sin listón no hay récord. */
export const isRecord = (set, best) => {
  if (!best || best.e1rm <= 0) return false;
  return e1rm(set?.kg, set?.reps) > best.e1rm + 1e-9;
};
