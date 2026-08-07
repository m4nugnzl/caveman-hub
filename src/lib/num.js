/**
 * Conversión de números introducidos por el usuario.
 *
 * Los campos de kg / reps / rir / pliegues se guardan como texto en JSONB
 * (el usuario escribe "102.5", "" o "8-10"), así que cada punto de lectura
 * tenía que convertirlos. El problema: `Number('')` es `0`, indistinguible de
 * un 0 real. Eso hacía que un campo vacío contase como serie de 0 kg en los
 * cálculos de volumen y tonelaje.
 *
 * `toNum` devuelve `null` para "sin dato" y un número solo cuando hay dato.
 */

/** true si el valor es "sin rellenar" (null, undefined, '' o solo espacios). */
export const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Número o `null`. Acepta coma decimal ("102,5") porque el teclado numérico
 * de Android en configuración española produce coma, no punto.
 */
export const toNum = (v) => {
  if (isBlank(v)) return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Número o 0 — solo donde un ausente equivale de verdad a cero (sumas). */
export const toNum0 = (v) => toNum(v) ?? 0;

/** Entero acotado a [min, max], con fallback si el valor no es válido. */
export const clampInt = (v, min, max, fallback = min) => {
  const n = toNum(v);
  if (n === null) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

/** Redondeo a `decimals` devolviendo número (no string, como hacía toFixed). */
export const round = (n, decimals = 0) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** Formatea para mostrar, con guion largo cuando no hay dato. */
export const fmt = (v, { decimals = 0, unit = '', dash = '—' } = {}) => {
  const n = toNum(v);
  if (n === null) return dash;
  return `${round(n, decimals)}${unit}`;
};