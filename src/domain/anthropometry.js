/**
 * Antropometría y seguimiento de peso.
 *
 * ── Cómo está guardado, de verdad ───────────────────────────────────────────
 * La tabla `anthropometry` tiene UNA sola columna de datos: `history` (jsonb).
 * No existe `three_day_weights`, que es lo que el código asumía y por lo que
 * el guardado fallaba entero (y, en consecuencia, no se registraba ni el peso:
 * de ahí que las gráficas del panel aparecieran vacías).
 *
 * Así que el promedio de los 3 días alternos ya no se almacena: se DERIVA de
 * los registros de `history`. Es mejor de las dos maneras — no hace falta
 * migrar nada, y en vez de tres huecos que se sobrescriben cada semana quedan
 * pesajes con fecha real que alimentan la tendencia.
 *
 * Cada entrada de `history`:
 *   { id, date, weight, skinFolds?, perimeters?, nutrition? }
 *
 * `weight` es lo único obligatorio. Pliegues y perímetros son opcionales y solo
 * se guardan si se han rellenado. `nutrition` es una foto de las kcal y macros
 * vigentes en ese momento, para poder cruzar dieta con evolución de peso (la
 * tabla de nutrición solo guarda el plan actual, sin histórico).
 */

import { toNum, toNum0, round } from '@/lib/num';
import { toISODate, weekStart } from '@/lib/dates';
import { newId } from '@/lib/ids';

export const FOLDS_LABELS = {
  tricipital: 'Tricipital',
  subescapular: 'Subescapular',
  abdominal: 'Abdominal',
  suprailiaco: 'Suprailíaco',
  muslo: 'Muslo',
  pantorrilla: 'Pantorrilla',
};

export const PERIMETER_LABELS = {
  pecho: 'Pecho',
  brazoD: 'Brazo Dcho.',
  brazoI: 'Brazo Izq.',
  ombligo: 'Ombligo',
  gluteo: 'Glúteo',
  musloD: 'Muslo Dcho.',
  musloI: 'Muslo Izq.',
  gemeloD: 'Gemelo Dcho.',
  gemeloI: 'Gemelo Izq.',
};

export const emptyFolds = () => Object.fromEntries(Object.keys(FOLDS_LABELS).map((k) => [k, '']));
export const emptyPerimeters = () =>
  Object.fromEntries(Object.keys(PERIMETER_LABELS).map((k) => [k, '']));

export const emptyAnthropometry = () => ({ history: [] });

// ── % graso ────────────────────────────────────────────────────────────────

export const foldsSum = (folds) =>
  Object.values(folds || {}).reduce((acc, v) => acc + toNum0(v), 0);

/**
 * % graso por suma de 6 pliegues, o `null` si no hay pliegues.
 *   Hombres: 2,59   + (Σ × 0,1051)
 *   Mujeres: 3,5803 + (Σ × 0,1548)
 */
export const fatPercent = (folds, gender) => {
  const sum = foldsSum(folds);
  if (sum <= 0) return null;
  const pct = gender === 'Mujer' ? 3.5803 + sum * 0.1548 : 2.59 + sum * 0.1051;
  return round(pct, 1);
};

// ── Construcción de registros ──────────────────────────────────────────────

/** Deja fuera los grupos de medidas que no se han rellenado. */
const compact = (values) => {
  const entries = Object.entries(values || {}).filter(([, v]) => toNum(v) !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([k, v]) => [k, toNum(v)]));
};

/**
 * Registro completo de revisión. Solo `weight` es obligatorio; pliegues y
 * perímetros se omiten si están vacíos, en vez de guardarse llenos de ceros
 * (un cero no es lo mismo que "no medido", y falseaba las sumas).
 *
 * `nutritionPlan` se guarda como foto del momento para poder cruzar después
 * kcal y macros con la evolución del peso.
 */
export const buildAnthropometryLog = ({ date, weight, folds, perimeters, nutritionPlan }) => {
  const log = {
    id: newId('log'),
    date: toISODate(date),
    weight: toNum(weight),
  };

  const skinFolds = compact(folds);
  const perims = compact(perimeters);
  if (skinFolds) log.skinFolds = skinFolds;
  if (perims) log.perimeters = perims;

  if (nutritionPlan) {
    const snapshot = compact({
      kcals: nutritionPlan.targetKcals,
      protein: nutritionPlan.proteinGrams,
      carbs: nutritionPlan.carbsGrams,
      fats: nutritionPlan.fatsGrams,
    });
    if (snapshot) log.nutrition = snapshot;
  }

  return log;
};

/** Pesaje rápido: solo fecha y peso, que es el caso habitual del cliente. */
export const buildWeightLog = ({ date, weight, nutritionPlan }) =>
  buildAnthropometryLog({ date, weight, nutritionPlan });

// ── Consultas ──────────────────────────────────────────────────────────────

/** De más antiguo a más reciente, para leer tendencias de izquierda a derecha. */
export const chronological = (history) =>
  [...(history || [])].filter((h) => h && h.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));

/** De más reciente a más antiguo, para listados. */
export const reverseChronological = (history) => chronological(history).reverse();

export const weightSeries = (history) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.weight) }))
    .filter((p) => p.value !== null);

/**
 * El último peso registrado, o `null` si no hay ninguno.
 *
 * ══ Por qué existe, y qué reemplaza ═════════════════════════════════════════
 *
 * Había una columna `clients.current_weight` que se pintaba en el portal del
 * cliente bajo la etiqueta «Peso actual» y en el roadmap. **Nadie la escribía**:
 * ni la aplicación ni ninguna migración. Se quedó con el valor que tuviera el día
 * que se dejó de rellenar, y desde entonces le enseñaba a cada persona un peso
 * congelado presentado como el de hoy.
 *
 * Un dato desactualizado con etiqueta de actual es peor que no tener el dato: el
 * hueco vacío se pregunta, la cifra equivocada se cree. Y aquí la cree quien está
 * siguiendo una dieta a partir de ella.
 *
 * El peso de verdad siempre estuvo en `anthropometry.history`, que es lo que la
 * persona rellena cada semana. Esto lo lee de ahí.
 *
 * Se pone en el dominio y no en cada pantalla porque ya se estaba calculando a
 * mano en la analítica (`weightPts[weightPts.length - 1]`), y dos sitios
 * calculando «el último peso» por su cuenta es de donde salen las cifras que no
 * coinciden entre pantallas.
 */
export const latestWeight = (history) => {
  const puntos = weightSeries(history);
  return puntos.length > 0 ? puntos[puntos.length - 1].value : null;
};

export const fatSeries = (history, gender) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: fatPercent(h.skinFolds, gender) }))
    .filter((p) => p.value !== null);

/** Serie de kcal registradas en cada revisión (a partir de la foto guardada). */
export const kcalSeries = (history) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.nutrition?.kcals) }))
    .filter((p) => p.value !== null);

/** Serie del % que representa cada macro sobre el total calórico, por revisión. */
export const macroShareSeries = (history) =>
  chronological(history)
    .map((h) => {
      const p = toNum0(h.nutrition?.protein) * 4;
      const c = toNum0(h.nutrition?.carbs) * 4;
      const f = toNum0(h.nutrition?.fats) * 9;
      const total = p + c + f;
      if (total <= 0) return null;
      return {
        date: h.date,
        protein: round((p / total) * 100),
        carbs: round((c / total) * 100),
        fats: round((f / total) * 100),
      };
    })
    .filter(Boolean);

/** Serie de un perímetro concreto (cintura, brazo…) a lo largo del tiempo. */
export const perimeterSeries = (history, key) =>
  chronological(history)
    .map((h) => ({ date: h.date, value: toNum(h.perimeters?.[key]) }))
    .filter((p) => p.value !== null);

/**
 * Promedio de los últimos `n` pesajes. Sustituye al widget de "3 días alternos":
 * misma idea (promediar para filtrar el ruido diario) pero sobre registros con
 * fecha real, y sin exigir que sean exactamente tres.
 */
export const rollingWeightAverage = (history, n = 3) => {
  const values = weightSeries(history).slice(-n).map((p) => p.value);
  if (values.length === 0) return null;
  return { average: round(values.reduce((a, b) => a + b, 0) / values.length, 2), count: values.length };
};

/** Promedio de peso por semana natural: la tendencia limpia de ruido diario. */
export const weeklyWeightAverages = (history) => {
  const buckets = new Map();
  for (const point of weightSeries(history)) {
    const key = weekStart(point.date);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(point.value);
  }

  return [...buckets.entries()]
    .map(([week, values]) => ({
      date: week,
      value: round(values.reduce((a, b) => a + b, 0) / values.length, 2),
      count: values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/** Variación entre el primer y el último registro de una serie. */
export const seriesDelta = (points) => {
  if (!points || points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return { from: first, to: last, delta: round(last - first, 2) };
};

/**
 * Ritmo de cambio por semana, en base a promedios semanales. Es la cifra que
 * de verdad usa un entrenador para decidir si ajustar calorías.
 */
export const weeklyRateOfChange = (history) => {
  const weekly = weeklyWeightAverages(history);
  if (weekly.length < 2) return null;
  const first = weekly[0];
  const last = weekly[weekly.length - 1];
  const weeks = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / (7 * 86400000)));
  return round((last.value - first.value) / weeks, 2);
};

/** ¿Se ha medido algún pliegue o perímetro alguna vez? */
export const hasMeasurements = (history) =>
  chronological(history).some((h) => h.skinFolds || h.perimeters);

// ── Check-in semanal ───────────────────────────────────────────────────────
//
// El seguimiento real de un cliente no es un pesaje suelto: es un CHECK-IN
// semanal. Se pesa varios días, se promedia para filtrar el ruido diario de agua
// y glucógeno, y ese promedio es el dato que se compara con la semana anterior.
//
// Los pesajes del día se guardan como registros normales de `history`, así que
// no hace falta ninguna estructura nueva: el check-in es una LECTURA de los
// registros de una semana, no otro tipo de dato.

/** Registros de peso que caen dentro de la semana natural de `date`. */
export const weekEntries = (history, date, weeks = 1) => {
  const key = weekStart(date);
  if (!key) return [];

  /*
    ── Por qué esto puede abarcar más de una semana ──────────────────────────
    Porque la cadencia de check-in no siempre es semanal: se puede revisar cada
    dos o cada cuatro (`domain/calendar.js`). Con una ventana fija de una semana,
    el cliente que se pesaba en la SEGUNDA semana de un periodo quincenal
    entregaba su check-in sin peso —la media salía de la primera, que estaba
    vacía— mientras la pantalla le decía «3 de 3 pesajes».

    Por defecto sigue siendo una semana, que es la cadencia de casi todo el mundo
    y lo que necesitan la analítica y el histórico.
  */
  const fin = new Date(Date.parse(`${key}T00:00:00Z`) + Math.max(1, weeks) * 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  return chronological(history).filter(
    (h) => h.date >= key && h.date < fin && toNum(h.weight) !== null
  );
};

/**
 * Estado del check-in de una semana: qué días se ha pesado, cuál es el promedio
 * y cuánto ha cambiado respecto a la semana anterior.
 *
 * `target` son los días de pesaje recomendados (3 alternos por defecto). No es
 * un requisito: con dos ya se promedia, y el aviso solo informa de cuántos
 * faltan para tener una media fiable.
 */
export const weeklyCheckIn = (history, date, { target = 3, weeks = 1 } = {}) => {
  const entries = weekEntries(history, date, weeks);
  const values = entries.map((h) => toNum(h.weight));
  const average = values.length > 0 ? round(values.reduce((a, b) => a + b, 0) / values.length, 2) : null;

  const weekly = weeklyWeightAverages(history);
  const current = weekStart(date);
  const previousWeek = weekly.filter((w) => w.date < current).pop() || null;

  return {
    weekStart: current,
    entries,
    count: values.length,
    /* El objetivo escala con el periodo: pedir tres pesajes en dos semanas sería
       pedir la mitad de los que hacen falta para que la media signifique algo. */
    target: target * Math.max(1, weeks),
    average,
    previousAverage: previousWeek?.value ?? null,
    delta: average !== null && previousWeek ? round(average - previousWeek.value, 2) : null,
    complete: values.length >= target * Math.max(1, weeks),
  };
};

/** Días de la semana natural que empieza en `weekStartISO`, en ISO. */
export const weekDates = (weekStartISO) => {
  const start = Date.parse(`${weekStartISO}T00:00:00Z`);
  if (!Number.isFinite(start)) return [];
  return Array.from({ length: 7 }, (_, i) => new Date(start + i * 86400000).toISOString().slice(0, 10));
};
