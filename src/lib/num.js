import { localeNumber } from '@/lib/dates';

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

/**
 * Un tamaño de almacenamiento en la unidad en que se lee: «512 MB», «10 GB».
 *
 * Recibe MEGABYTES porque esa es la unidad de `plan_limits.max_storage_mb`
 * (0067) — el tope del plan de partida es medio giga y una columna de gigas
 * enteros no sabe contar hasta ahí. Está aquí y no en una pantalla por lo mismo
 * que `planPrice`: lo escriben la portada y Ajustes → Plan, y dos formatos del
 * mismo tope es la clase de incoherencia que solo acaba viendo el cliente.
 *
 * `decimals` solo afecta a los GB: los MB con decimales son falsa precisión.
 */
export const storageLabel = (mb, { decimals = 0 } = {}) => {
  const n = toNum(mb);
  if (n === null) return null;
  return n >= 1024 ? `${round(n / 1024, decimals)} GB` : `${round(n, 0)} MB`;
};
/**
 * El precio de un plan: «39 € al mes», «390 € al año», «Gratis».
 *
 * ── Por qué está aquí y no en la pantalla del plan ──────────────────────────
 * Porque desde que hay página pública lo escriben DOS sitios —Ajustes → Plan y
 * la portada—, y un precio formateado de dos maneras distintas es la clase de
 * incoherencia que nadie ve hasta que un cliente la ve.
 *
 * Los céntimos solo se escriben si los hay: «25,00 €» en una lista de precios
 * redondos es ruido, y lo único que se compara aquí es la cifra.
 *
 * ── `anual` ─────────────────────────────────────────────────────────────────
 * Lee `price_cents_year` (0062). Devuelve `null` —y no «Gratis»— cuando ese plan
 * no tiene precio anual: son dos cosas distintas y quien llama tiene que poder
 * distinguirlas para NO ofrecer un botón que no lleva a ninguna parte.
 */
export const planPrice = (plan, { conPeriodo = true, anual = false, mensualizado = false } = {}) => {
  const base = anual ? plan?.price_cents_year : plan?.price_cents;

  if (anual && !base) return null;
  if (!base) return 'Gratis';

  /*
    `mensualizado` enseña el anual dividido entre doce, que es como se comparan
    dos tarifas: nadie tiene en la cabeza cuánto son 390 € al año frente a 39 al
    mes, y sí sabe si 32,50 es menos que 39. No es un precio inventado —es el
    mismo dinero repartido— pero **exige que el total esté a la vista al lado**,
    y por eso `conPeriodo` sigue diciendo «al mes»: el importe anual completo lo
    escribe quien llama, en su propia línea.
  */
  const cents = anual && mensualizado ? Math.round(base / 12) : base;

  const importe = localeNumber(cents / 100, {
    style: 'currency',
    currency: (plan.currency || 'eur').toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

  if (!conPeriodo) return importe;
  // Con `anual` el periodo lo decide la llamada, no la fila: `interval` describe
  // a `price_cents`, que es el mensual (ver la cabecera de la 0062).
  if (anual) return `${importe} al ${mensualizado ? 'mes' : 'año'}`;
  return `${importe} al ${plan.interval === 'year' ? 'año' : 'mes'}`;
};

/**
 * Cuánto se ahorra pagando por años, en porcentaje entero: 17.
 *
 * ── Por qué en porcentaje y no en meses ─────────────────────────────────────
 * «Dos meses gratis» se entiende sin traducir y es mejor frase, pero **no cabe**
 * donde tiene que ir: dentro del botón de un interruptor, al lado de la palabra
 * «Al año». Una etiqueta que obliga a ensanchar el control que la contiene está
 * mandando ella sobre el diseño, y aquí lo que manda es que las dos mitades del
 * carril midan lo mismo. `−17 %` ocupa un tercio y dice lo mismo.
 *
 * Se redondea al entero: el 16,67 % exacto es una precisión que nadie usa para
 * decidir y que ensucia una cifra que se lee de pasada.
 *
 * Devuelve `null` si no hay anual o si no sale a cuenta. Esto último no debería
 * pasar nunca y pasó: con los precios a medio migrar, el «anual» de Solo salía
 * un 30 % más caro que pagar por meses, y esta guarda es lo único que impidió
 * que la portada lo anunciara como un ahorro.
 */
export const planAhorroPct = (plan) => {
  if (!plan?.price_cents || !plan?.price_cents_year) return null;
  const anualSinDescuento = plan.price_cents * 12;
  const pct = Math.round(((anualSinDescuento - plan.price_cents_year) / anualSinDescuento) * 100);
  return pct > 0 ? pct : null;
};
