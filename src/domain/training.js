/**
 * Reglas de entrenamiento. Funciones puras: no tocan React ni Supabase, así
 * que se pueden testear directamente y reutilizar desde coach y cliente.
 *
 * "Serie efectiva" = serie con repeticiones registradas (> 0). Una serie
 * programada pero sin ejecutar no cuenta como volumen.
 */

import { newId, deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';
import { addDays, toISODate } from '@/lib/dates';
// `sessions` no importa de aquí, así que no hay ciclo: es la capa de debajo.
import { executedSessions, sessionMuscleVolume, sessionTonnage } from './sessions';

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

/**
 * El color de un grupo muscular.
 *
 * Existe por el respaldo, que estaba copiado en tres sitios de dos archivos
 * —`MUSCLE_COLORS[name] || 'var(--data-slate)'`— y en uno de ellos el respaldo
 * era otro (violeta). Un músculo que no está en el mapa salía de un color en el
 * resumen y de otro en la analítica.
 */
export const muscleColor = (name) => MUSCLE_COLORS[name] || 'var(--data-slate)';

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

/**
 * El patrón rotativo, saneado. Un patrón corrupto —texto, nulo, un cero— no
 * puede devolver un ciclo de cero días: dejaría todos los microciclos en la
 * misma fecha.
 */
export const normalizePattern = (pattern) => ({
  train: Math.max(1, Math.round(toNum(pattern?.train) ?? 2)),
  rest: Math.max(0, Math.round(toNum(pattern?.rest) ?? 1)),
});

/**
 * Cuántos días dura un ciclo del programa.
 *
 * Siete en el semanal, y en el rotativo lo que sume su patrón: un 3/1 dura
 * cuatro días, no siete. Es lo que permite fechar la siguiente sesión de un
 * programa rotativo sin inventarse una semana que ahí no existe.
 */
export const cycleLengthDays = (cycleType, pattern) => {
  if (cycleType !== 'rotating') return 7;
  const { train, rest } = normalizePattern(pattern);
  return train + rest;
};

/**
 * El ciclo rotativo, casilla a casilla: qué se entrena y cuándo se descansa.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * Un cliente de semana natural ve su estructura —lunes empuje, martes tirón…—
 * en su panel de progreso. Uno de ciclo rotativo no la veía en NINGÚN sitio: ni
 * en progreso, donde la tarjeta se escondía por no haber semana a la que
 * atarse, ni en su rutina, donde las sesiones salen en fila pero los descansos
 * no aparecen. Su estructura existía solo en la cabeza del entrenador.
 *
 * ── Los entrenos salen de los DÍAS, el descanso del patrón ──────────────────
 * Nada obliga a que el número de días del microciclo case con el `train` del
 * patrón: el entrenador añade y quita días cuando quiere. Si se pintaran las
 * casillas del patrón, un ciclo con seis días programados y un patrón de dos
 * enseñaría dos sesiones al cliente mientras su rutina le enseña seis.
 *
 * Así que las sesiones son las que hay, con su nombre, y el descanso es lo que
 * dice el patrón — que es lo único que el patrón sabe de verdad. Sin días
 * todavía (el entrenador está montando) se cae a casillas genéricas, para que
 * la forma del ciclo se vea antes de tener nombres que poner.
 *
 * ── El descanso va INTERCALADO, que es lo que significa «2 y 1» ─────────────
 * «Dos de entreno y uno de descanso» no quiere decir «todos los entrenos y
 * luego un descanso»: quiere decir que se descansa CADA DOS sesiones. Con seis
 * días programados y un patrón 2/1, el ciclo son nueve días
 *
 *     Legs A · Push A · descanso · Pull A · Legs B · descanso · Push B · Pull B · descanso
 *
 * y no siete con el descanso al final. Ponerlo todo junto al final describía un
 * programa que nadie entrena — y era además el único sitio donde el cliente
 * podía leer su ritmo, así que se lo describía mal.
 *
 * El ciclo CIERRA descansando aunque la última tanda esté a medias: el descanso
 * separa tandas, y al volver a empezar hay una tanda nueva detrás.
 */
export const rotatingSlots = (pattern, days = []) => {
  const { train, rest } = normalizePattern(pattern);

  const sesiones =
    days.length > 0 ? days.map((day) => day.dayName) : Array.from({ length: train }, () => 'Entreno');

  const slots = [];
  let dia = 0;

  sesiones.forEach((name, i) => {
    dia += 1;
    slots.push({ key: `t${i}`, lead: `Día ${dia}`, name, rest: false });

    /* Se descansa al completar una tanda de `train`, y también al terminar la
       última aunque se haya quedado corta. Las dos condiciones en la misma
       comprobación: con un número de sesiones múltiplo del patrón, las dos son
       ciertas a la vez y por separado meterían el descanso dos veces. */
    const cierraTanda = (i + 1) % train === 0 || i === sesiones.length - 1;
    if (!cierraTanda) return;

    for (let r = 0; r < rest; r += 1) {
      dia += 1;
      slots.push({ key: `r${i}-${r}`, lead: `Día ${dia}`, name: 'Descanso', rest: true });
    }
  });

  return slots;
};

// ── Constructores ──────────────────────────────────────────────────────────

/**
 * Una serie.
 *
 * Los campos van en dos parejas, y la simetría no es casual:
 *
 *   · `targetReps` / `reps` — lo que se pidió y lo que se hizo.
 *   · `targetRir`  / `rir`  — lo mismo con el esfuerzo.
 *
 * `rir` existía desde el principio; `targetRir` es lo que faltaba para poder
 * comparar. Sin él, el RIR que anota el cliente es un número sin referencia:
 * «me sobraron 4» no dice si eso está bien o mal hasta que se sabe que se le
 * habían pedido 2.
 *
 * Va vacío por defecto y solo se ve si el entrenador enciende el módulo `rir`
 * de su protocolo. Quien no programe por RIR no tiene por qué verlo.
 */
export const emptySet = (targetReps = '') => ({
  kg: '',
  reps: '',
  rir: '',
  targetReps,
  targetRir: '',
});
export const buildSets = (n, targetReps = '') => Array.from({ length: n }, () => emptySet(targetReps));

export const emptyWorkoutData = () => ({
  weeklySplit: {},
  mobilityDrills: [],
  notes: '',
  microcycles: [],
});

export const restWeekSplit = () => Object.fromEntries(WEEK_DAYS.map((d) => [d, 'Descanso']));

/**
 * ¿Esta casilla de la semana es descanso?
 *
 * La regla estaba escrita a mano en el editor de la estructura y otra vez en el
 * tablero, y ya habían divergido en el caso que más se da: **la casilla vacía**.
 * Al borrar el texto de un día, el editor lo seguía pintando como entreno (en
 * tinta de acento) y el contador lo sumaba, así que la semana decía «5 días de
 * entreno» con cuatro puestos. Vacío es descanso: no hay nada programado ahí.
 */
export const isRestDay = (value) => {
  const v = (value ?? '').trim().toLowerCase();
  return v === '' || v === 'descanso';
};

/** Cuántos días de la semana natural son de entreno. */
export const trainingDayCount = (weeklySplit) =>
  WEEK_DAYS.filter((day) => !isRestDay(weeklySplit?.[day])).length;

export const buildExercise = ({ name, muscle, numSets, targetReps }) => ({
  id: newId('ex'),
  name: name.trim(),
  muscle,
  sets: buildSets(numSets, targetReps),
});

/**
 * Un ejercicio de otra persona, convertido en PLANTILLA para esta.
 *
 * Conserva lo que es programa —nombre, músculo, número de series y el objetivo
 * de cada una— y deja fuera lo que es de la otra persona: sus kilos y reps
 * anotados en series heredadas, su nota de entrenador. El id es nuevo porque el
 * ejercicio es nuevo; reutilizarlo cruzaría los registros de dos clientes.
 *
 * Es lo que usa «Traer un día de otro cliente»: el Legs de Marta como base del
 * de Luis, sin arrastrar lo que Marta levantó.
 */
export const cloneExerciseAsTemplate = (exercise) => ({
  id: newId('ex'),
  name: exercise.name,
  muscle: exercise.muscle,
  sets: (exercise.sets || []).map((set) => ({
    ...emptySet(set?.targetReps ?? ''),
    targetRir: set?.targetRir ?? '',
  })),
});

export const buildMicrocycle = ({ weekNumber, days = [], date = today() }) => ({
  id: newId('mc'),
  weekNumber,
  sessionNumber: weekNumber,
  date,
  days,
});

export const today = () => new Date().toISOString().slice(0, 10);

/*
  ══ Cuándo empieza cada ciclo ═══════════════════════════════════════════════

  Todos los microciclos nacían con la fecha de HOY, que es la de cuando el
  entrenador los crea y casi nunca la de cuando se entrenan. Dos consecuencias
  reales:

    · Quien monta la rutina en agosto para una asesoría que arranca en
      septiembre tiene la semana 1 fechada dos semanas antes de existir.
    · Y quien programa cuatro semanas de golpe —el gesto normal— las tiene las
      cuatro el mismo día, así que la analítica, que agrupa por `micro.date`,
      las mete todas en el mismo cubo.

  Las dos funciones de aquí abajo son la respuesta: de dónde sale la fecha de la
  PRIMERA (la de empezar, que la decide el entrenador) y de dónde la de cada
  siguiente (la anterior más lo que dura un ciclo). La fecha sigue siendo
  editable microciclo a microciclo: esto es de dónde parte, no una atadura.
*/

/**
 * Cuándo empieza el primer ciclo de un cliente.
 *
 * Su fecha de inicio si todavía está por llegar, y hoy en cualquier otro caso.
 * No se usa una fecha de inicio pasada porque un programa nuevo montado en el
 * mes seis de una asesoría empieza hoy, no el día que esa persona entró: fechar
 * su semana 1 medio año atrás desordenaría toda la analítica.
 */
export const firstCycleDate = (startDate) => {
  const hoy = today();
  const inicio = toISODate(startDate);
  return inicio && inicio > hoy ? inicio : hoy;
};

/**
 * Cuánto dura un ciclo CONTANDO las sesiones que tiene dentro.
 *
 * ══ Por qué no basta con el patrón ══════════════════════════════════════════
 *
 * `cycleLengthDays` mide una tanda —«2 entreno + 1 descanso» son tres días— y
 * eso solo es el ciclo entero cuando el microciclo tiene exactamente `train`
 * sesiones. Con seis sesiones y un patrón 2/1, el ciclo son NUEVE días: tres
 * tandas con su descanso cada una.
 *
 * Fechando por la tanda, el ciclo siguiente nacía tres días después del
 * anterior cuando el cliente todavía tenía seis sesiones por delante. Y no es
 * cosmético: la analítica agrupa por `micro.date`, así que el tonelaje y la
 * adherencia de tres ciclos caían en la misma semana.
 */
export const cycleSpanDays = (cycleType, pattern, days = []) => {
  if (cycleType !== 'rotating') return 7;
  if (!days || days.length === 0) return cycleLengthDays(cycleType, pattern);
  return rotatingSlots(pattern, days).length;
};

/**
 * Cuándo empieza el ciclo siguiente a `previous`: su fecha más lo que dura ese
 * ciclo, sesiones incluidas. Sin fecha anterior de la que partir —datos
 * viejos—, hoy.
 */
export const nextCycleDate = (previous, cycleType, pattern) =>
  addDays(previous?.date, cycleSpanDays(cycleType, pattern, previous?.days)) || today();

/** Reasigna ids a un subárbol clonado para que no colisione con el original. */
export const reidExercises = (exercises) =>
  exercises.map((ex) => ({ ...ex, id: newId('ex') }));

export const cloneDays = (days) =>
  deepClone(days).map((d) => ({ ...d, exercises: reidExercises(d.exercises || []) }));

/**
 * Clona la ESTRUCTURA de unos días y vacía lo EJECUTADO.
 *
 * ── La distinción que hace falta y `cloneDays` no hace ──────────────────────
 * Un día tiene dos clases de información mezcladas en el mismo objeto:
 *
 *   · lo que el entrenador PROGRAMA — nombre del día, ejercicios, grupo
 *     muscular, cuántas series y el rango objetivo de cada una;
 *   · lo que se REGISTRA al entrenar — kg, reps y RIR.
 *
 * `cloneDays` copia las dos, que es lo correcto para «duplicar la semana 3» del
 * entrenador: quiere la semana entera tal cual para retocarla.
 *
 * Pero cuando lo que se quiere es la semana SIGUIENTE, arrastrar los kilos de la
 * anterior es peor que no traer nada. Los números aparecerían ya rellenos sin que
 * nadie los haya levantado, y a partir de ahí no hay forma de distinguir un peso
 * heredado de uno real: la analítica contaría como entrenada una semana que no se
 * ha hecho, y `weekAdherence` daría 100 % con cero series realizadas.
 *
 * Se conservan `targetReps` y `targetRir` porque no son registros sino parte del
 * plan: son el rango y el esfuerzo que el entrenador puso, y siguen vigentes la
 * semana siguiente. Lo que se borra es lo que levantó la persona.
 */
export const blankDays = (days) =>
  cloneDays(days).map((day) => ({
    ...day,
    exercises: (day.exercises || []).map((exercise) => ({
      ...exercise,
      sets: (exercise.sets || []).map((set) => ({
        ...emptySet(set?.targetReps ?? ''),
        targetRir: set?.targetRir ?? '',
      })),
    })),
  }));

// ── Consultas ──────────────────────────────────────────────────────────────

export const findMicrocycle = (microcycles, weekNumber) =>
  microcycles.find((m) => m.weekNumber === weekNumber) || null;

export const nextWeekNumber = (microcycles) =>
  microcycles.length === 0 ? 1 : Math.max(...microcycles.map((m) => m.weekNumber)) + 1;

/**
 * Dónde queda un elemento después de que OTRO se mueva por encima de él.
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * El carril de días se puede arrastrar, y el editor de abajo abre uno concreto
 * POR ÍNDICE. Mover cualquier otro día corre ese índice: arrastrar el cuarto día
 * delante del primero te dejaba, sin tocar nada más, editando el día de al lado
 * del que tenías abierto. Con el nombre cambiado en la cabecera, que es la forma
 * más rápida de escribirle series al día que no era.
 *
 * Es la aritmética del `splice`: quien se mueve va a `to`; quien queda dentro del
 * tramo recorrido se desplaza un puesto en sentido contrario; el resto no se
 * entera. Vive aquí y con prueba porque es exactamente donde se cuela un error de
 * uno, y ese error no da un fallo visible sino datos escritos en el sitio
 * equivocado.
 */
export const indexAfterMove = (index, from, to) => {
  if (index === from) return to;
  if (from < index && index <= to) return index - 1;
  if (to <= index && index < from) return index + 1;
  return index;
};

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

/*
  ══ Todo lo que sigue lee LO EJECUTADO, no el plan ══════════════════════════

  Estas funciones leían `micro.days`, que es donde los kilos se guardaban ANTES de
  separar plan y ejecución. Desde que el registro va a `micro.sessions`, leer el
  plan significa leer un sitio donde ya nadie escribe: la pantalla de Analítica
  daba tonelaje 0, volumen vacío, adherencia 0 % y progresión sin puntos con las
  series correctamente guardadas al lado. Reproducido con un microciclo de tres
  series a 100×8: 2400 kg registrados, 0 kg en la analítica.

  `executedSessions` es la única puerta a esos datos y ya resuelve la
  compatibilidad: si un día no tiene sesión pero sí kilos dentro del plan (datos
  antiguos), los expone como sesión heredada. Así el histórico se sigue viendo sin
  necesidad de migrar nada.
*/

/** Series efectivas de una semana completa, agrupadas por grupo muscular. */
export const weekMuscleVolume = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return {};

  const out = {};
  for (const session of executedSessions(micro)) {
    for (const [muscle, count] of Object.entries(sessionMuscleVolume(session))) {
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
  for (const session of executedSessions(micro)) total += sessionTonnage(session);
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
// antes no se podían responder: ¿este ejercicio progresa? ¿cuánto volumen
// lleva cada músculo? ¿cuántas veces por semana se toca?

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

    // El ejercicio está PROGRAMADO en el plan y REGISTRADO en las sesiones. La
    // fila existe si está programado —así una semana planificada y no entrenada
    // aparece con un hueco en vez de desaparecer del eje— y los números salen de
    // lo ejecutado.
    const found = (micro.days || []).some((day) =>
      (day.exercises || []).some((exercise) => exercise.name === name)
    );

    for (const session of executedSessions(micro)) {
      for (const entry of session.entries || []) {
        if (entry.name !== name) continue;

        for (const set of entry.sets || []) {
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

    if (!found && sets === 0) continue;
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

/**
 * Volumen PLANIFICADO de un día: series por grupo muscular, se hayan hecho o no.
 *
 * ── Por qué no vale `dayMuscleVolume` ───────────────────────────────────────
 * Esa cuenta series EFECTIVAS —las que tienen repeticiones anotadas—, que es lo
 * correcto para medir lo que se entrenó. Pero al PROGRAMAR no hay nada anotado
 * todavía, así que devuelve un objeto vacío justo cuando el entrenador está
 * repartiendo el volumen y es cuando más falta hace verlo.
 *
 * Son dos preguntas distintas sobre el mismo día —«¿cuánto le he puesto?» y
 * «¿cuánto ha hecho?»— y por eso son dos funciones y no un parámetro: mezclarlas
 * lleva a enseñar una cuando se preguntaba la otra.
 */
export const dayPlannedVolume = (day) => {
  const out = {};
  for (const ex of day?.exercises || []) {
    const muscle = ex.muscle || 'Otros';
    const sets = (ex.sets || []).length;
    if (sets > 0) out[muscle] = (out[muscle] || 0) + sets;
  }
  return out;
};

/** Series programadas del día, en total. */
export const dayPlannedSets = (day) =>
  (day?.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0);

// ── Calentamiento: el del programa, o el de este día ───────────────────────

/**
 * El calentamiento que toca en un día concreto.
 *
 * ══ Por qué el día SUSTITUYE y no tiene el suyo desde el principio ══════════
 *
 * Un calentamiento se repite: es la rutina de movilidad de esta persona, no una
 * decisión que se tome cada lunes. Si cada día tuviera el suyo habría que
 * montarlo cinco veces y mantenerlo cinco veces, y en cuanto uno divergiera el
 * cliente haría cosas distintas según el día sin que nadie lo hubiera decidido.
 *
 * Pero hay días que sí piden lo suyo —el de pierna no se calienta como el de
 * empuje—, así que un día puede tener el suyo Y ENTONCES manda. El caso común
 * sigue costando cero y el específico es posible.
 *
 * ── `null` y `[]` no significan lo mismo ────────────────────────────────────
 * `undefined`/`null` es «este día no ha decidido nada, usa el del programa».
 * `[]` es «este día ha decidido que NO se calienta», y hay que respetarlo: un
 * día de descanso activo o una sesión de test no llevan movilidad, y caer al del
 * programa reaparecería el que el entrenador acaba de quitar.
 *
 * @param {{ mobilityDrills?: MobilityDrill[] }} program
 * @param {{ mobilityDrills?: MobilityDrill[]|null }} day
 */
export const drillsForDay = (program, day) => {
  const propios = day?.mobilityDrills;
  if (Array.isArray(propios)) return propios;
  return program?.mobilityDrills || [];
};

/** ¿Este día tiene calentamiento propio, o hereda el del programa? */
export const dayHasOwnDrills = (day) => Array.isArray(day?.mobilityDrills);
