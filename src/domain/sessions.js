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
import { todayISO, toISODate } from '@/lib/dates';

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
 * Devuelve los ejercicios con la misma forma que antes —`sets` con `targetReps`,
 * `kg`, `reps` y `rir`— de modo que la lista de ejercicios no necesita saber que
 * ahora hay dos orígenes:
 *
 *   · `targetReps` viene del PLAN (lo que el entrenador programó).
 *   · `kg`, `reps` y `rir` vienen de la SESIÓN (lo que se ejecutó ese día).
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
  return session.date || 'Sin fecha';
};
