/**
 * Reglas de entrenamiento. Funciones puras: no tocan React ni Supabase, así
 * que se pueden testear directamente y reutilizar desde coach y cliente.
 *
 * "Serie efectiva" = serie con repeticiones registradas (> 0). Una serie
 * programada pero sin ejecutar no cuenta como volumen.
 */

import { newId, deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';

export const MUSCLE_GROUPS = [
  'Pecho',
  'Dorsal',
  'Espalda Alta',
  'Tríceps',
  'Bíceps',
  'Deltoides Anterior',
  'Deltoides Lateral',
  'Deltoides Posterior',
  'Cuádriceps',
  'Isquiotibiales',
  'Glúteos',
  'Aductor',
  'Gemelo',
  'Abdominales',
  'Otros',
];

export const MUSCLE_COLORS = {
  Pecho: '#f43f5e',
  Dorsal: '#06b6d4',
  'Espalda Alta': '#3b82f6',
  Tríceps: '#8b5cf6',
  Bíceps: '#ec4899',
  'Deltoides Anterior': '#f59e0b',
  'Deltoides Lateral': '#10b981',
  'Deltoides Posterior': '#14b8a6',
  Cuádriceps: '#84cc16',
  Isquiotibiales: '#22d3ee',
  Glúteos: '#a855f7',
  Aductor: '#fb923c',
  Gemelo: '#6ee7b7',
  Abdominales: '#fbbf24',
  Otros: '#94a3b8',
};

/** MEV = volumen mínimo efectivo · MRV = volumen máximo recuperable (series/semana). */
export const MRV_GOALS = {
  Pecho: { mev: 8, mrv: 20 },
  Dorsal: { mev: 10, mrv: 22 },
  'Espalda Alta': { mev: 10, mrv: 22 },
  Tríceps: { mev: 6, mrv: 18 },
  Bíceps: { mev: 6, mrv: 20 },
  'Deltoides Anterior': { mev: 6, mrv: 16 },
  'Deltoides Lateral': { mev: 6, mrv: 22 },
  'Deltoides Posterior': { mev: 6, mrv: 22 },
  Cuádriceps: { mev: 8, mrv: 20 },
  Isquiotibiales: { mev: 6, mrv: 16 },
  Glúteos: { mev: 4, mrv: 16 },
  Aductor: { mev: 4, mrv: 12 },
};

export const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Paleta por índice de serie, compartida por coach y cliente. */
export const SET_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#22d3ee', '#a3e635', '#fb923c'];
export const setColor = (i) => SET_COLORS[i % SET_COLORS.length];

/**
 * 'weekly'   = estructura atada a los días de la semana natural.
 * 'rotating' = ciclo tipo "2 entreno / 1 descanso" que se repite sin fin.
 */
export const unitLabel = (cycleType) => (cycleType === 'rotating' ? 'Sesión' : 'Semana');
export const unitLabelPlural = (cycleType) => (cycleType === 'rotating' ? 'sesiones' : 'semanas');

// ── Constructores ──────────────────────────────────────────────────────────

export const emptySet = (targetReps = '') => ({ kg: '', reps: '', rir: '', targetReps });
export const buildSets = (n, targetReps = '') => Array.from({ length: n }, () => emptySet(targetReps));

export const emptyWorkoutData = () => ({
  weeklySplit: {},
  mobilityDrills: [],
  notes: '',
  microcycles: [],
});

export const restWeekSplit = () => Object.fromEntries(WEEK_DAYS.map((d) => [d, 'Descanso']));

export const buildExercise = ({ name, muscle, numSets, targetReps }) => ({
  id: newId('ex'),
  name: name.trim(),
  muscle,
  sets: buildSets(numSets, targetReps),
});

export const buildMicrocycle = ({ weekNumber, days = [], date = today() }) => ({
  id: newId('mc'),
  weekNumber,
  sessionNumber: weekNumber,
  date,
  days,
});

export const today = () => new Date().toISOString().slice(0, 10);

/** Reasigna ids a un subárbol clonado para que no colisione con el original. */
export const reidExercises = (exercises) =>
  exercises.map((ex) => ({ ...ex, id: newId('ex') }));

export const cloneDays = (days) =>
  deepClone(days).map((d) => ({ ...d, exercises: reidExercises(d.exercises || []) }));

// ── Consultas ──────────────────────────────────────────────────────────────

export const findMicrocycle = (microcycles, weekNumber) =>
  microcycles.find((m) => m.weekNumber === weekNumber) || null;

export const nextWeekNumber = (microcycles) =>
  microcycles.length === 0 ? 1 : Math.max(...microcycles.map((m) => m.weekNumber)) + 1;

/** Nombre libre pero único dentro del microciclo: "Día 1 (copia)", "(copia 2)"… */
export const uniqueDayName = (days, base) => {
  if (!days.some((d) => d.dayName === base)) return base;
  let name = `${base} (copia)`;
  let n = 2;
  while (days.some((d) => d.dayName === name)) name = `${base} (copia ${n++})`;
  return name;
};

/** Series efectivas del día, agrupadas por grupo muscular. */
export const dayMuscleVolume = (day) => {
  const out = {};
  for (const ex of day?.exercises || []) {
    const muscle = ex.muscle || 'Otros';
    const effective = (ex.sets || []).filter((s) => (toNum(s?.reps) ?? 0) > 0).length;
    if (effective > 0) out[muscle] = (out[muscle] || 0) + effective;
  }
  return out;
};

/** Series efectivas de una semana completa, agrupadas por grupo muscular. */
export const weekMuscleVolume = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return {};
  const out = {};
  for (const day of micro.days || []) {
    for (const [muscle, count] of Object.entries(dayMuscleVolume(day))) {
      out[muscle] = (out[muscle] || 0) + count;
    }
  }
  return out;
};

/** Tonelaje = Σ (kg × reps) de la semana. Solo cuenta series con ambos datos. */
export const weekTonnage = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return 0;
  let total = 0;
  for (const day of micro.days || []) {
    for (const ex of day.exercises || []) {
      for (const s of ex.sets || []) {
        const kg = toNum(s?.kg);
        const reps = toNum(s?.reps);
        if (kg !== null && reps !== null && kg > 0 && reps > 0) total += kg * reps;
      }
    }
  }
  return Math.round(total);
};

export const tonnageByWeek = (microcycles) =>
  microcycles.map((m) => ({ week: m.weekNumber, tonnage: weekTonnage(microcycles, m.weekNumber) }));

export const countSets = (day) =>
  (day?.exercises || []).reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);

/**
 * Qué día de la semana natural corresponde a un día del microciclo, si el
 * split semanal lo menciona. Solo aplica a cycleType 'weekly'.
 */
export const weekdayForDay = (weeklySplit, dayName) => {
  if (!weeklySplit || !dayName) return null;
  const target = dayName.toLowerCase();
  return Object.keys(weeklySplit).find((d) => weeklySplit[d]?.toLowerCase() === target) || null;
};

// ── Analítica de entrenamiento ─────────────────────────────────────────────
//
// Todo lo de aquí abajo existe para responder preguntas de entrenamiento que
// antes no se podían responder: ¿este ejercicio progresa? ¿con qué intensidad
// se está entrenando? ¿cuántas veces por semana se toca cada músculo?

/**
 * 1RM estimado por la fórmula de Epley: kg × (1 + reps/30).
 *
 * Sirve para comparar series de rangos distintos: 100 kg × 5 y 85 kg × 10 son
 * esfuerzos parecidos, y mirando solo los kg parecería un retroceso. Pierde
 * precisión por encima de 12 repeticiones, así que ahí se descarta.
 */
export const estimatedOneRm = (kg, reps) => {
  const load = toNum(kg);
  const r = toNum(reps);
  if (load === null || r === null || load <= 0 || r <= 0 || r > 12) return null;
  return Math.round(load * (1 + r / 30));
};

/** Todos los nombres de ejercicio que aparecen en el programa, sin repetir. */
export const exerciseNames = (microcycles) => {
  const names = new Set();
  for (const micro of microcycles || []) {
    for (const day of micro.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise.name) names.add(exercise.name);
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

/**
 * Progresión de UN ejercicio a lo largo del programa. Por cada semana en la que
 * aparece devuelve la mejor serie, el 1RM estimado, el tonelaje y las series
 * efectivas.
 *
 * "Mejor serie" es la de mayor 1RM estimado, no la de más kilos: es la que de
 * verdad representa el mejor rendimiento de esa sesión.
 */
export const exerciseProgression = (microcycles, name) => {
  const rows = [];

  for (const micro of [...(microcycles || [])].sort((a, b) => a.weekNumber - b.weekNumber)) {
    let best = null;
    let tonnage = 0;
    let sets = 0;
    let found = false;

    for (const day of micro.days || []) {
      for (const exercise of day.exercises || []) {
        if (exercise.name !== name) continue;
        found = true;

        for (const set of exercise.sets || []) {
          const kg = toNum(set?.kg);
          const reps = toNum(set?.reps);
          if (kg === null || reps === null || reps <= 0) continue;

          sets += 1;
          tonnage += kg * reps;

          const e1rm = estimatedOneRm(kg, reps);
          if (e1rm !== null && (best === null || e1rm > best.e1rm)) {
            best = { kg, reps, e1rm };
          }
        }
      }
    }

    if (!found) continue;
    rows.push({
      week: micro.weekNumber,
      label: `S${micro.weekNumber}`,
      date: micro.date,
      bestKg: best?.kg ?? null,
      bestReps: best?.reps ?? null,
      e1rm: best?.e1rm ?? null,
      tonnage: tonnage > 0 ? Math.round(tonnage) : null,
      sets: sets > 0 ? sets : null,
    });
  }

  return rows;
};

/** Series efectivas de un músculo concreto, semana a semana. */
export const muscleVolumeOverTime = (microcycles, muscle) =>
  [...(microcycles || [])]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((micro) => {
      const volume = weekMuscleVolume(microcycles, micro.weekNumber);
      return {
        week: micro.weekNumber,
        label: `S${micro.weekNumber}`,
        value: volume[muscle] ?? 0,
      };
    });

/** Músculos que aparecen en todo el programa, ordenados por volumen total. */
export const trainedMuscles = (microcycles) => {
  const totals = {};
  for (const micro of microcycles || []) {
    for (const [muscle, count] of Object.entries(weekMuscleVolume(microcycles, micro.weekNumber))) {
      totals[muscle] = (totals[muscle] || 0) + count;
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle]) => muscle);
};

/**
 * Frecuencia semanal: en cuántos días distintos se entrena cada músculo.
 *
 * Con el mismo volumen total, repartirlo en dos sesiones suele rendir más que
 * concentrarlo en una. Es un dato que no se ve mirando solo el total de series.
 */
export const muscleFrequency = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return {};

  const frequency = {};
  for (const day of micro.days || []) {
    const inDay = new Set();
    for (const exercise of day.exercises || []) {
      const effective = (exercise.sets || []).some((s) => (toNum(s?.reps) ?? 0) > 0);
      if (effective) inDay.add(exercise.muscle || 'Otros');
    }
    for (const muscle of inDay) frequency[muscle] = (frequency[muscle] || 0) + 1;
  }
  return frequency;
};

/**
 * Reparto de RIR de una semana: cuántas series se han hecho a cada nivel de
 * repeticiones en reserva. Es la medida de intensidad real del bloque — dice si
 * se está entrenando cerca del fallo o sobrado.
 */
export const rirDistribution = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return [];

  const counts = new Map();
  for (const day of micro.days || []) {
    for (const exercise of day.exercises || []) {
      for (const set of exercise.sets || []) {
        if ((toNum(set?.reps) ?? 0) <= 0) continue;
        const rir = toNum(set?.rir);
        const key = rir === null ? 'sin dato' : String(Math.round(rir));
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (a[0] === 'sin dato') return 1;
      if (b[0] === 'sin dato') return -1;
      return Number(a[0]) - Number(b[0]);
    })
    .map(([rir, count]) => ({ label: rir === 'sin dato' ? '—' : `RIR ${rir}`, value: count }));
};

/** Resumen de una semana: días, ejercicios, series y tonelaje. */
export const weekSummary = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return null;

  const days = micro.days || [];
  return {
    days: days.length,
    exercises: days.reduce((acc, d) => acc + (d.exercises?.length || 0), 0),
    sets: days.reduce((acc, d) => acc + countSets(d), 0),
    tonnage: weekTonnage(microcycles, weekNumber),
  };
};