/**
 * La semana de un cliente: lo programado, lo ejecutado y lo entregado, juntos.
 *
 * ══ Por qué existe este archivo ═════════════════════════════════════════════
 *
 * Porque la aplicación estaba partida por sus TABLAS y no por su trabajo. Lo que
 * un entrenador hace cada lunes —mirar la semana de alguien y contestarle—
 * cruzaba cuatro secciones: la rutina (qué le puse), la revisión (qué me ha
 * entregado), la nutrición (si le cuadró) y el progreso (qué decido ahora). Cada
 * una con su propio selector de semana, y ninguna sabiendo en qué semana estaba
 * la de al lado.
 *
 * La prueba de que el corte estaba mal es la misma que el README usa para
 * justificar la fusión de «Fotos» y «Check-ins» un piso más abajo: hizo falta
 * inventar un MODO —`ReviewSession`, con barra flotante— para poder terminar la
 * tarea cruzando de una sección a otra. Un modo que existe para pegar dos
 * pantallas es la señal de que faltaba una.
 *
 * ── Qué hace y qué NO hace ──────────────────────────────────────────────────
 * Esto **no calcula nada nuevo**. Cada cifra sale de la función que ya la
 * calculaba —`weekTonnage`, `weekAdherence`, `weeklyCheckIn`, `sessionTonnage`—
 * y aquí solo se reúnen bajo una misma semana. Es deliberado: si hubiera que
 * escribir una regla nueva para pintar esta pantalla, la pantalla estaría
 * inventándose un dato en vez de enseñar el que hay.
 *
 * Y por eso tampoco pide nada a la red. Todo lo que entra ya está cargado.
 */
import { round, toNum } from '@/lib/num';
import { weekAdherence } from './analytics';
import { weeklyCheckIn } from './anthropometry';
import { groupByWeek, weekStartOfProgramWeek } from './photos';
import { executedSessions, sessionSetCount, sessionTonnage } from './sessions';
import { countSets, findMicrocycle, weekTonnage } from './training';

/** Los días de una semana con lo programado y lo ejecutado, en el orden del plan. */
const daysOfWeek = (micro) => {
  if (!micro) return [];

  const sesiones = executedSessions(micro);

  return (micro.days || []).map((day) => {
    /*
      Todas las sesiones de ese día, no la primera. Repetir un «Push» en la misma
      semana es legítimo —pasa cuando alguien recupera un día perdido— y quedarse
      con una sola contaba la mitad de sus kilos.
    */
    const suyas = sesiones.filter((s) => s.dayName === day.dayName);

    return {
      dayName: day.dayName,
      /* Ejercicios PROGRAMADOS: es lo que se comparó al decidir la semana. */
      exercises: (day.exercises || []).length,
      plannedSets: countSets(day),
      loggedSets: suyas.reduce((n, s) => n + sessionSetCount(s), 0),
      tonnage: Math.round(suyas.reduce((n, s) => n + sessionTonnage(s), 0)),
      /* La fecha real en que entrenó, que es lo que hace legible «se saltó el
         viernes y lo hizo el sábado». `null` si no lo hizo. */
      date: suyas[0]?.date ?? null,
      done: suyas.length > 0,
      /* Lo que escribió al terminar. Es lo más leído de toda la pantalla y vivía
         enterrado dentro del editor de rutina. */
      note: suyas.find((s) => s.clientNote)?.clientNote ?? null,
    };
  });
};

/**
 * Todo lo que hay que saber de la semana `weekNumber` de un cliente.
 *
 * @param startDate  El alta del cliente. De ahí sale la conversión entre semana
 *   de programa y semana natural, que es la que permite casar los pesajes —que
 *   van por lunes— con las sesiones —que van por número de semana—. Ver
 *   `photos.weekStartOfProgramWeek` y `auditoria.md` 1.2.
 */
export const clientWeek = ({
  microcycles = [],
  history = [],
  photos = [],
  startDate = null,
  weekNumber = null,
} = {}) => {
  const micro = weekNumber === null ? null : findMicrocycle(microcycles, weekNumber);
  const days = daysOfWeek(micro);
  const weekStart = startDate && weekNumber !== null ? weekStartOfProgramWeek(startDate, weekNumber) : null;

  const adherence = weekNumber === null ? null : weekAdherence(microcycles, weekNumber);
  const checkIn = weekStart ? weeklyCheckIn(history, weekStart) : null;

  const dePeso = groupByWeek(photos, startDate).find((g) => g.week === weekNumber);

  const hechos = days.filter((d) => d.done).length;

  return {
    weekNumber,
    weekStart,
    days,
    /*
      «3 de 4» y no «3»: sin el denominador, tres sesiones puede ser una semana
      redonda o media semana perdida, y es la diferencia entre felicitar a alguien
      y preguntarle qué ha pasado.
    */
    sessions: { done: hechos, planned: days.length },
    tonnage: weekNumber === null ? 0 : weekTonnage(microcycles, weekNumber),
    sets: {
      logged: days.reduce((n, d) => n + d.loggedSets, 0),
      planned: days.reduce((n, d) => n + d.plannedSets, 0),
    },
    adherence,
    checkIn,
    photos: dePeso?.photos || [],
    /* Las notas de sesión de la semana, con su día delante. */
    notes: days.filter((d) => d.note).map((d) => ({ dayName: d.dayName, note: d.note })),
  };
};

/**
 * La semana por la que conviene entrar.
 *
 * ── Por qué no es «la última» ───────────────────────────────────────────────
 * Porque la última semana del programa puede ser una que el entrenador acaba de
 * dejar montada para dentro de quince días, y entrar por ahí enseña una semana
 * vacía y da la sensación de que el cliente no ha hecho nada. Se entra por la
 * última en la que hay ALGO —una sesión registrada o un pesaje—, y solo si no
 * hay ninguna se cae a la última montada.
 */
export const latestActiveWeek = ({ microcycles = [], history = [], startDate = null } = {}) => {
  if (microcycles.length === 0) return null;

  const ordenadas = [...microcycles].sort((a, b) => b.weekNumber - a.weekNumber);

  for (const micro of ordenadas) {
    if (executedSessions(micro).length > 0) return micro.weekNumber;

    const inicio = startDate ? weekStartOfProgramWeek(startDate, micro.weekNumber) : null;
    if (inicio && (weeklyCheckIn(history, inicio)?.count ?? 0) > 0) return micro.weekNumber;
  }

  return ordenadas[0].weekNumber;
};

/**
 * Cuánto se ha movido el peso entre dos semanas consecutivas.
 *
 * Va aparte de `clientWeek` porque necesita la semana ANTERIOR, y meter dentro
 * de «la semana N» un dato de la N-1 acabaría con alguien leyéndolo como si
 * fuera de la N.
 */
export const weightMove = ({ history = [], startDate = null, weekNumber = null } = {}) => {
  if (!startDate || weekNumber === null || weekNumber <= 1) return null;

  const ahora = weeklyCheckIn(history, weekStartOfProgramWeek(startDate, weekNumber));
  const antes = weeklyCheckIn(history, weekStartOfProgramWeek(startDate, weekNumber - 1));

  const a = toNum(ahora?.average);
  const b = toNum(antes?.average);
  if (a === null || b === null) return null;

  return { delta: round(a - b, 2), from: b, to: a };
};
