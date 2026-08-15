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

/* ==========================================================================
   Cómo se escriben las fechas
   --------------------------------------------------------------------------
   ══ Por qué el idioma está aquí y en un solo sitio ══════════════════════════

   `'es-ES'` estaba escrito a mano en catorce sitios: en el histórico de
   feedback, en las revisiones del cliente, en el registro de cambios, en tres
   pantallas de ajustes, en «Hoy»… Cada uno con sus opciones, y ninguno enterado
   de los demás.

   Eso no molesta mientras haya un idioma. Molesta el día que haya dos: la
   decisión está tomada —más idiomas SÍ, pero no ahora (ver el README)— y lo que
   encarece esperar no son las cadenas, que se extraen mecánicamente, sino tener
   el idioma repartido por los componentes.

   Con el locale en una constante y las cuatro formas de escribir una fecha aquí,
   internacionalizar esta parte pasa a ser cambiar una línea. Sin esto habría que
   encontrar catorce.

   ── No es i18n, y no pretende serlo ────────────────────────────────────────
   No hay diccionario, ni detección de idioma, ni ganchos. Esto solo evita que la
   deuda siga creciendo mientras se decide cuándo pagarla.
   ========================================================================== */

/** El idioma de todo lo que se formatea. El día que haya más, empieza aquí. */
export const LOCALE = 'es-ES';

/** Etiqueta corta para ejes de gráficos: "12 mar". */
export const shortDate = (value) => {
  const iso = toISODate(value);
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/**
 * "12 mar" o "12 mar 2025": el año solo si NO es el actual.
 *
 * Es lo que hacían por su cuenta las revisiones del cliente y el panel de
 * soporte, con el mismo código escrito dos veces. El año de este año no aporta
 * nada y ocupa; el de otro año es imprescindible.
 */
export const dayMonthMaybeYear = (value, { conHora = false } = {}) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const esteAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: esteAno ? undefined : 'numeric',
    /* Con hora para los hilos de soporte, donde dos mensajes del mismo día son
       lo normal y el día solo no los ordena. */
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/** Solo el día: "12/03/2026". Para sellos de sincronización y similares. */
export const dateOnly = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(LOCALE);
};

/** Día y hora: para cuando el minuto importa (un evento, una grabación). */
export const dateTime = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(LOCALE);
};

/** Solo la hora: "09:05". */
export const timeOfDay = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
};

/**
 * El día de la semana. Con `conFecha`, además el día y el mes.
 *
 * `timeZone: 'UTC'` no es un detalle: las fechas de este proyecto son ISO sin
 * hora, y sin fijar la zona un `2026-08-10` se interpreta como medianoche local
 * y en husos al oeste de Greenwich retrocede al día anterior. El lunes salía
 * domingo.
 */
export const weekdayName = (value, { conFecha = false } = {}) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALE, {
    weekday: 'long',
    ...(conFecha ? { day: 'numeric', month: 'long' } : {}),
    timeZone: 'UTC',
  });
};

/** Un número con los separadores del idioma: "1.520". */
export const localeNumber = (n, opciones) => Number(n).toLocaleString(LOCALE, opciones);
