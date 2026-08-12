/**
 * Las respuestas del cliente, convertidas en algo que se puede seguir.
 *
 * ══ Por qué esto es tan corto ═══════════════════════════════════════════════
 *
 * Porque la decisión de fondo ya está tomada en `protocol.js`: una pregunta de
 * escala es un número contestado en una fecha. Eso YA es una serie temporal, así
 * que aquí no hay que inventar analítica nueva — hay que agrupar por semana y
 * devolver exactamente la misma forma de punto que el resto del panel
 * (`{ week, label, value }`, ver `analytics.js`), para que los gráficos que ya
 * existen la dibujen sin enterarse de que es otra cosa.
 *
 * Ese es el motivo de que «que se pueda medir y trackear» no haya costado una
 * pantalla aparte: la fatiga entra en el panel por la misma puerta que el peso.
 *
 * ── Por SEMANA NATURAL, no por semana de programa ───────────────────────────
 * Se agrupa por el lunes, igual que `buildWeeklySeries`. Es lo que permite poner
 * la fatiga y el peso en el mismo eje y leerlos juntos, que es justo la lectura
 * interesante: «subió el tonelaje y con él la fatiga, pero el peso no se movió».
 * Agrupar por semana de programa daría una serie que no casa con ninguna otra.
 *
 * ── El promedio, no el último ───────────────────────────────────────────────
 * Una semana tiene tres o cinco sesiones y cada una su respuesta. Quedarse con
 * la última haría que la serie dependiera de qué día se entrenó el último, que
 * es ruido. El promedio de la semana es lo comparable, por el mismo motivo por
 * el que el peso se promedia en vez de tomarse el del domingo.
 */

import { round, toNum } from '@/lib/num';
import { shortDate, weekStart } from '@/lib/dates';
import { allSessions, sessionTonnage } from './sessions';

const avg = (values) =>
  values.length === 0 ? null : round(values.reduce((a, v) => a + v, 0) / values.length, 1);

/** Las respuestas de una sesión, siempre un objeto. */
export const sessionAnswers = (session) =>
  session?.feedback && typeof session.feedback === 'object' ? session.feedback : {};

/** ¿Ha contestado algo el cliente en esta sesión? */
export const hasAnswers = (session) =>
  Object.values(sessionAnswers(session)).some((v) => String(v ?? '').trim() !== '');

/**
 * Serie semanal de UNA pregunta.
 *
 * Devuelve `{ week, label, value }` — la misma forma que `metricPoints`, así que
 * se puede pasar tal cual a `BandChart` o a `Sparkline`.
 */
export const questionSeries = (microcycles, questionId) => {
  const buckets = new Map();

  for (const session of allSessions(microcycles)) {
    const value = toNum(sessionAnswers(session)[questionId]);
    if (value === null) continue;

    const key = weekStart(session.date);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(value);
  }

  return [...buckets.entries()]
    .map(([week, values]) => ({ week, label: shortDate(week), value: avg(values) }))
    .sort((a, b) => a.week.localeCompare(b.week));
};

/**
 * Todas las preguntas medibles del protocolo, listas para un gráfico de líneas.
 *
 * Se descartan las que no tienen ni un dato: una leyenda con cuatro nombres de
 * los que solo dos dibujan algo hace pensar que faltan líneas por cargar.
 */
export const buildFeedbackSeries = (microcycles, questions) =>
  questions
    .map((question) => ({
      id: question.id,
      label: question.short || question.label,
      color: question.color || 'var(--data-slate)',
      decimals: 1,
      points: questionSeries(microcycles, question.id),
    }))
    .filter((serie) => serie.points.length > 0);

/**
 * Las etiquetas del eje, sacadas de las propias series.
 *
 * ── Por qué no se reutilizan las del panel ──────────────────────────────────
 * `BandChart` empareja los puntos con las etiquetas POR TEXTO, y las del panel
 * salen de `buildWeeklySeries`, que solo genera semana cuando hay un pesaje, una
 * comida o un entreno registrado. Una semana en la que el cliente contestó pero
 * no se pesó no tendría etiqueta, y su respuesta se caería del gráfico sin que
 * nadie lo notara: la línea aparecería con un hueco que no existe en los datos.
 *
 * Construyéndolas aquí, el eje del gráfico de feedback es exactamente el de sus
 * datos.
 */
export const feedbackLabels = (series) => {
  const weeks = new Map();
  for (const serie of series) {
    for (const point of serie.points) weeks.set(point.week, point.label);
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, label]) => label);
};

/**
 * Estado de una pregunta: su última semana, la variación y cuántas respuestas
 * la sostienen.
 *
 * `count` no es decoración: un promedio de una sola respuesta y otro de cinco se
 * leen igual en un gráfico y no valen lo mismo. Quien lo pinte puede decidir si
 * lo enseña, pero el dato tiene que estar.
 */
export const questionStats = (microcycles, question) => {
  const points = questionSeries(microcycles, question.id);
  if (points.length === 0) return null;

  const last = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;

  const answers = allSessions(microcycles).filter(
    (s) => weekStart(s.date) === last.week && toNum(sessionAnswers(s)[question.id]) !== null
  ).length;

  return {
    id: question.id,
    label: question.label,
    short: question.short || question.label,
    color: question.color || 'var(--data-slate)',
    max: question.max ?? 10,
    lowerIsBetter: Boolean(question.lowerIsBetter),
    neutral: Boolean(question.neutral),
    value: last.value,
    week: last.week,
    count: answers,
    delta: previous === null ? null : round(last.value - previous.value, 1),
    points,
  };
};

/**
 * La última sesión con algo contestado, con sus respuestas ya emparejadas a su
 * pregunta. Es lo que se enseña al entrenador cuando abre a un cliente: lo
 * último que le ha dicho, no un promedio.
 */
export const lastFeedback = (microcycles, questions) => {
  const sessions = allSessions(microcycles).filter(hasAnswers);
  if (sessions.length === 0) return null;

  const session = sessions[sessions.length - 1];
  const answers = sessionAnswers(session);

  return {
    date: session.date,
    dayName: session.dayName,
    /* Se recorre el PROTOCOLO y no las claves guardadas: así una pregunta que el
       entrenador ha retirado deja de mostrarse, aunque su respuesta siga en el
       histórico. Lo contrario haría reaparecer preguntas ya jubiladas. */
    values: questions
      .map((question) => ({ question, value: answers[question.id] }))
      .filter((row) => String(row.value ?? '').trim() !== ''),
  };
};

/**
 * El histórico completo, sesión a sesión y de la más reciente a la más antigua.
 *
 * ── Por qué hace falta además de las series ─────────────────────────────────
 * Un gráfico contesta «¿va a más o a menos?». No contesta «¿qué pasó el 12 de
 * agosto?», y esa es justo la pregunta que se hace un entrenador cuando ve un
 * pico: quiere leer la nota de ese día. El promedio semanal, que es lo correcto
 * para la tendencia, borra precisamente eso.
 *
 * Por eso el histórico guarda la sesión entera —fecha, día, tonelaje, respuestas
 * y las dos notas— y no una fila por número. Es el registro; la serie es la
 * lectura.
 */
export const feedbackLog = (microcycles, questions) =>
  allSessions(microcycles)
    .filter((session) => hasAnswers(session) || String(session.clientNote ?? '').trim() !== '')
    .map((session) => {
      const answers = sessionAnswers(session);
      return {
        id: session.id,
        date: session.date,
        dayName: session.dayName,
        weekNumber: session.weekNumber,
        tonnage: sessionTonnage(session),
        clientNote: String(session.clientNote ?? '').trim(),
        coachNote: String(session.coachNote ?? '').trim(),
        /* Se recorre el protocolo, no lo guardado: una pregunta retirada no
           reaparece en el histórico aunque su respuesta siga en el jsonb. */
        values: questions
          .map((question) => ({ question, value: answers[question.id] }))
          .filter((row) => String(row.value ?? '').trim() !== ''),
      };
    })
    .reverse();

/**
 * Cuántas de las sesiones registradas llevan respuesta.
 *
 * Es la cifra que dice si el protocolo FUNCIONA. Un entrenador con seis
 * preguntas y un 20 % de respuesta no tiene datos: tiene un formulario que su
 * cliente ha dejado de rellenar, y es mejor enterarse por aquí que por el hueco
 * en un gráfico.
 */
export const feedbackAdherence = (microcycles) => {
  const sessions = allSessions(microcycles).filter(
    (s) => (s.entries || []).some((e) => (e.sets || []).some((set) => toNum(set?.reps) !== null))
  );
  if (sessions.length === 0) return null;

  const answered = sessions.filter(hasAnswers).length;
  return { sessions: sessions.length, answered, pct: Math.round((answered / sessions.length) * 100) };
};
