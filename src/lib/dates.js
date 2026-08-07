/** Utilidades de fecha. Todo en formato ISO `YYYY-MM-DD`, sin husos horarios. */

const DAY_MS = 86400000;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const toISODate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export const daysBetween = (from, to) => {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
};

/**
 * Lunes de la semana a la que pertenece una fecha, en ISO.
 *
 * Se usa para agrupar los pesajes por semana: el promedio semanal es lo que
 * de verdad indica la tendencia, porque filtra la variación diaria de agua y
 * glucógeno (que puede ser de más de un kilo entre dos días seguidos).
 */
export const weekStart = (date) => {
  const d = new Date(`${toISODate(date)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
};

/** Etiqueta corta para ejes de gráficos: "12 mar". */
export const shortDate = (value) => {
  const iso = toISODate(value);
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
