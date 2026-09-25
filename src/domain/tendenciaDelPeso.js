import { daysBetween } from '@/lib/dates';

/** Desde cuántos días pesados la tendencia se enseña sin atenuar. */
export const PESAJES_FIRMES = 3;

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const media = (vs) => vs.reduce((a, b) => a + b, 0) / vs.length;

/**
 * LA TENDENCIA DEL PESO de un tramo (25 sep 2026): la pendiente por mínimos
 * cuadrados de sus pesajes, en % del peso medio por semana. UNA cuenta para la
 * tarjeta de impacto, la ficha de semana y el resumen del periodo.
 *
 * Basta con dos días pesados: con menos no hay pendiente. Con pocos, la cifra
 * sale igual, pero con cuántos pesajes la sostienen, y la pantalla la atenúa
 * por debajo de `PESAJES_FIRMES`. Dos pesajes el mismo día cuentan como uno,
 * su media.
 *
 * @param pesajes `[{ date, weight }]`, en cualquier orden.
 * @param desde / hasta el tramo, inclusive (`YYYY-MM-DD`).
 * @param hoy lo de después no ha pasado.
 * @returns `{ media, ritmo, pesajes }` (`ritmo` es `null` con menos de dos
 *   días pesados), o `null` sin ningún pesaje.
 */
export const tendenciaDelPeso = (pesajes, { desde, hasta, hoy = hasta }) => {
  const porDia = new Map();
  for (const p of pesajes || []) {
    if (!p?.date || p.date < desde || p.date > hasta || p.date > hoy || !esNumero(p.weight)) continue;
    const d = porDia.get(p.date) || [];
    d.push(p.weight);
    porDia.set(p.date, d);
  }
  if (porDia.size === 0) return null;
  const puntos = [...porDia].map(([fecha, ws]) => ({ x: daysBetween(desde, fecha) ?? 0, y: media(ws) }));
  const m = media(puntos.map((p) => p.y));
  let ritmo = null;
  if (puntos.length >= 2 && m > 0) {
    const mx = media(puntos.map((p) => p.x));
    let num = 0;
    let den = 0;
    for (const p of puntos) {
      num += (p.x - mx) * (p.y - m);
      den += (p.x - mx) ** 2;
    }
    ritmo = den > 0 ? ((num / den) * 7 * 100) / m : null;
  }
  return { media: m, ritmo, pesajes: puntos.length };
};

/** «1 pesaje», «2 pesajes». */
export const pesajesTexto = (n) => `${n} ${n === 1 ? 'pesaje' : 'pesajes'}`;
