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
import { toNum } from '@/lib/num';
import { shortDate, todayISO, toISODate } from '@/lib/dates';

const emptySet = () => ({ kg: '', reps: '', rir: '' });

/** ¿Tiene esta serie algo registrado? */
export const isSetLogged = (set) => (toNum(set?.reps) ?? 0) > 0;

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
 * @param {{ microcycles?: import('@/types').Microcycle[] }} program
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
  };
};

/** El resumen de quien no tiene nada. Evita comprobar `null` en cada consumidor. */
export const emptyTrainingSummary = () => ({
  microcycleCount: 0,
  sessionCount: 0,
  lastTraining: null,
  recentSessions: [],
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

/** Series efectivas por grupo muscular en una sesión. */
export const sessionMuscleVolume = (session) => {
  const out = {};
  for (const entry of session?.entries || []) {
    const muscle = entry.muscle || 'Otros';
    const count = (entry.sets || []).filter(isSetLogged).length;
    if (count > 0) out[muscle] = (out[muscle] || 0) + count;
  }
  return out;
};

export const sessionSetCount = (session) =>
  (session?.entries || []).reduce((acc, e) => acc + (e.sets || []).filter(isSetLogged).length, 0);

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
          targetReps: planSet?.targetReps ?? '',
          targetRir: planSet?.targetRir ?? '',
          kg: logged?.kg ?? '',
          reps: logged?.reps ?? '',
          rir: logged?.rir ?? '',
        };
      }),
    };
  });
};

/**
 * Escribe un valor de ejecución en una sesión, creando lo que falte por el
 * camino (la entrada del ejercicio o la serie), de forma inmutable.
 */
export const withSessionSet = (session, exercise, setIndex, field, value) => {
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
  base.sets[setIndex] = { ...base.sets[setIndex], [field]: value };

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
  return `${exerciseName}#${setIndex}`;
}

// ── La mejor marca, para saber cuándo hay un récord ────────────────────────

/**
 * Una repetición máxima estimada (Epley). No es un dato: es la vara con la que
 * comparar dos series de distinto peso y distintas repeticiones —90 × 8 contra
 * 95 × 5— para decir cuál es mejor. Solo se usa para eso; nunca se enseña como
 * cifra.
 */
export const e1rm = (kg, reps) => {
  const k = toNum(kg) ?? 0;
  const r = toNum(reps) ?? 0;
  if (k <= 0 || r <= 0) return 0;
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
