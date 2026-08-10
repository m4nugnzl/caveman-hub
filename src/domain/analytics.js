/**
 * Serie temporal unificada para el panel analítico.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Los datos viven en ejes distintos: el peso y el % graso van por FECHA
 * (registros de antropometría), mientras que el tonelaje y el volumen van por
 * SEMANA DE PROGRAMA (microciclos). Para poder cruzarlos en un mismo gráfico
 * —«kcal contra evolución del peso»— hace falta un eje común.
 *
 * Ese eje es la **semana natural**: cada microciclo se sitúa por su fecha, y
 * cada registro de peso por la suya. Así todo cae en el mismo cubo semanal y
 * cualquier métrica se puede comparar contra cualquier otra.
 */

import { toNum, toNum0, round } from '@/lib/num';
import { weekStart, shortDate } from '@/lib/dates';
import { fatPercent } from './anthropometry';
import { countSets, findMicrocycle, weekMuscleVolume, weekTonnage } from './training';

/**
 * Adherencia: qué porcentaje de las series programadas tienen repeticiones
 * registradas. Es el KPI que dice si el cliente está entrenando lo que se le
 * ha puesto, más allá de cuánto levanta.
 */
export const weekAdherence = (microcycles, weekNumber) => {
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return null;

  let planned = 0;
  let logged = 0;
  for (const day of micro.days || []) {
    planned += countSets(day);
    for (const exercise of day.exercises || []) {
      for (const set of exercise.sets || []) {
        if ((toNum(set?.reps) ?? 0) > 0) logged += 1;
      }
    }
  }

  if (planned === 0) return null;
  return { planned, logged, pct: round((logged / planned) * 100) };
};

/** Métricas disponibles para los ejes de los gráficos. */
export const METRICS = [
  { id: 'weight', label: 'Peso corporal', unit: ' kg', color: 'var(--accent)', decimals: 1 },
  { id: 'fat', label: '% graso', unit: '%', color: 'var(--data-rose)', decimals: 1 },
  { id: 'kcals', label: 'Kcal objetivo', unit: ' kcal', color: 'var(--data-amber)', decimals: 0 },
  { id: 'tonnage', label: 'Tonelaje', unit: ' kg', color: 'var(--data-violet)', decimals: 0 },
  { id: 'sets', label: 'Series efectivas', unit: '', color: 'var(--data-violet)', decimals: 0 },
  { id: 'adherence', label: 'Adherencia', unit: '%', color: '#a3e635', decimals: 0 },
  { id: 'waist', label: 'Cintura', unit: ' cm', color: '#fb923c', decimals: 1 },
  { id: 'proteinShare', label: '% de kcal en proteína', unit: '%', color: '#ec4899', decimals: 0 },
];

export const metricById = (id) => METRICS.find((m) => m.id === id) || METRICS[0];

const avg = (values) => (values.length === 0 ? null : round(values.reduce((a, b) => a + b, 0) / values.length, 3));

/**
 * Construye la tabla semanal completa: una fila por semana natural con todas
 * las métricas que se puedan calcular en ella. Las semanas sin dato para una
 * métrica la dejan en `null`, que es lo que permite dibujar huecos en vez de
 * inventar ceros.
 */
export const buildWeeklySeries = ({ microcycles = [], history = [], gender }) => {
  /** weekStart -> acumuladores */
  const buckets = new Map();

  const bucket = (date) => {
    const key = weekStart(date);
    if (!key) return null;
    if (!buckets.has(key)) {
      buckets.set(key, {
        week: key,
        weights: [],
        fats: [],
        kcals: [],
        proteinShares: [],
        waists: [],
        tonnage: null,
        sets: null,
        adherence: null,
        programWeeks: [],
      });
    }
    return buckets.get(key);
  };

  // Registros de antropometría: peso, % graso, cintura y la foto de nutrición.
  for (const log of history) {
    const b = bucket(log.date);
    if (!b) continue;

    const weight = toNum(log.weight);
    if (weight !== null) b.weights.push(weight);

    const fat = fatPercent(log.skinFolds, gender);
    if (fat !== null) b.fats.push(fat);

    const waist = toNum(log.perimeters?.ombligo);
    if (waist !== null) b.waists.push(waist);

    const kcals = toNum(log.nutrition?.kcals);
    if (kcals !== null) b.kcals.push(kcals);

    const p = toNum0(log.nutrition?.protein) * 4;
    const c = toNum0(log.nutrition?.carbs) * 4;
    const f = toNum0(log.nutrition?.fats) * 9;
    if (p + c + f > 0) b.proteinShares.push(round((p / (p + c + f)) * 100));
  }

  // Microciclos: tonelaje, series efectivas y adherencia.
  for (const micro of microcycles) {
    const b = bucket(micro.date);
    if (!b) continue;

    b.programWeeks.push(micro.weekNumber);
    b.tonnage = (b.tonnage || 0) + weekTonnage(microcycles, micro.weekNumber);

    const volume = weekMuscleVolume(microcycles, micro.weekNumber);
    b.sets = (b.sets || 0) + Object.values(volume).reduce((a, v) => a + v, 0);

    const adherence = weekAdherence(microcycles, micro.weekNumber);
    if (adherence) {
      b.adherence = b.adherence === null ? adherence.pct : round((b.adherence + adherence.pct) / 2);
    }
  }

  return [...buckets.values()]
    .map((b) => ({
      week: b.week,
      label: shortDate(b.week),
      programWeeks: b.programWeeks.sort((a, z) => a - z),
      weight: avg(b.weights),
      fat: avg(b.fats),
      waist: avg(b.waists),
      kcals: avg(b.kcals),
      proteinShare: avg(b.proteinShares),
      tonnage: b.tonnage,
      sets: b.sets,
      adherence: b.adherence,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
};

/** Últimas `n` semanas de la serie, o todas si `n` es null. */
export const lastWeeks = (series, n) => (n ? series.slice(-n) : series);

/** Extrae una métrica como puntos dibujables, descartando semanas sin dato. */
export const metricPoints = (series, metricId) =>
  series
    .map((row) => ({ label: row.label, week: row.week, value: row[metricId] }))
    .filter((p) => p.value !== null && p.value !== undefined);

/**
 * Recta de tendencia por mínimos cuadrados sobre los puntos disponibles.
 *
 * Devuelve también `r2` (0–1): cuánta de la variación explica la recta. Con r²
 * bajo la línea existe pero no significa nada, y conviene decirlo en vez de
 * pintar una tendencia que sugiere una certeza que no hay.
 */
export const linearTrend = (points) => {
  const values = points.map((p) => Number(p.value)).filter((v) => Number.isFinite(v));
  const n = values.length;
  if (n < 3) return null;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * i;
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - predicted) ** 2;
  }

  return {
    slope: round(slope, 3),
    from: round(intercept, 3),
    to: round(intercept + slope * (n - 1), 3),
    r2: ssTot === 0 ? 1 : round(1 - ssRes / ssTot, 2),
    perWeek: round(slope, 2),
  };
};

/** Comparación de la última semana con dato contra la anterior. */
export const weekOverWeek = (series, metricId) => {
  const points = metricPoints(series, metricId);
  if (points.length < 2) return null;

  const current = points[points.length - 1];
  const previous = points[points.length - 2];
  const delta = round(current.value - previous.value, 2);

  return {
    current: current.value,
    previous: previous.value,
    delta,
    pct: previous.value === 0 ? null : round((delta / Math.abs(previous.value)) * 100, 1),
    currentLabel: current.label,
    previousLabel: previous.label,
  };
};

/**
 * Serie apilada del reparto de macros (% de las kcal en cada macro), a partir de
 * las fotos de nutrición guardadas en cada revisión.
 */
export const macroShareBands = (history) => {
  const rows = [];
  for (const log of [...history].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const p = toNum0(log.nutrition?.protein) * 4;
    const c = toNum0(log.nutrition?.carbs) * 4;
    const f = toNum0(log.nutrition?.fats) * 9;
    const total = p + c + f;
    if (total <= 0) continue;
    rows.push({
      label: shortDate(log.date),
      date: log.date,
      protein: round((p / total) * 100),
      carbs: round((c / total) * 100),
      fats: round((f / total) * 100),
      kcals: toNum(log.nutrition?.kcals),
    });
  }
  return rows;
};
