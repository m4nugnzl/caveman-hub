/**
 * EL RESUMEN DE UN RANGO DE SEMANAS: lo que pasó entre dos lunes (24 sep 2026).
 *
 * Lo pide la línea de tiempo al seleccionar un tramo arrastrando sobre su eje
 * (`components/temporada/`), y lo pedirán el calendario y Revisiones. No
 * vuelve a contar nada: suma lo que ya traen las filas de `semanasDelPlan`
 * (con su estado de `estadosDeSemana`), el rendimiento de
 * `rendimientoDeLaTemporada` y los entrenos de `entrenoDeLasSemanas`.
 *
 * ══ Qué dice ══════════════════════════════════════════════════════════════
 *   · El PESO, por fase: cuánto cambió la media de la primera semana pesada a
 *     la última (real) y cuánto se esperaba en esas mismas semanas (la recta
 *     vigente de la fase), en kg y en %/sem. Un rango que cruza dos fases da
 *     dos tramos: sumar un volumen y una definición no dice nada.
 *   · La DIETA pautada: media de kcal y pasos de las semanas vividas, con su
 *     mínimo y su máximo si cambió; las kcal de cada tipo de día; las macros
 *     medias en g y en g/kg (con la media REAL de cada semana); y los refeeds
 *     y diet breaks, que son pauta. Lo registrado no existe todavía.
 *   · Los HECHOS que tocan el rango: vacaciones, enfermedad, competiciones.
 *   · El ENTRENO: entrenos hechos de los pedidos y, POR BLOQUE, las series
 *     efectivas y cuánto se movió cada referencia DENTRO del rango.
 *   · Las REVISIONES: cuántas semanas hay en cada estado.
 *
 * ══ Qué no dice ═══════════════════════════════════════════════════════════
 * Ningún juicio. «Real −1,2 kg · esperado −2,0 kg» son dos cifras juntas; la
 * herramienta no las colorea ni dice si está bien. El entrenador decide.
 */

import { addDays, daysBetween, weekStart } from '@/lib/dates';
import { esIntervencion, gPorKg } from './pautaDelDia';
import { tendenciaDelPeso } from './tendenciaDelPeso';

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Lo pautado de una clave en las semanas vividas: `{ media, min, max, semanas }` o `null`. */
const pautaDe = (filas, clave) => {
  const valores = filas.map((s) => s.pauta?.[clave]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valores.length === 0) return null;
  return { media: media(valores), min: Math.min(...valores), max: Math.max(...valores), semanas: valores.length };
};

/**
 * Las macros medias de las semanas vividas, en g y en g/kg. Los g/kg son la
 * media de los de cada semana, cada una con SU peso medio real: dividir la
 * media de gramos por la media de pesos mezclaría semanas distintas.
 */
const macrosDe = (filas) => {
  const salida = {};
  for (const k of ['protein', 'carbs', 'fats']) {
    const conGramos = filas.filter((s) => typeof s.pauta?.[k] === 'number');
    if (conGramos.length === 0) {
      salida[k] = null;
      continue;
    }
    const porKilo = conGramos.map((s) => gPorKg(s.pauta[k], s.media)).filter((v) => v !== null);
    salida[k] = { g: media(conGramos.map((s) => s.pauta[k])), gkg: media(porKilo), semanasConPeso: porKilo.length };
  }
  return Object.values(salida).some(Boolean) ? salida : null;
};

/**
 * Las kcal de cada tipo de día en las semanas vividas, por su nombre: «alta
 * 3.000 · baja 2.800». Solo si hay más de uno; con uno, lo dice la media.
 */
const tiposDe = (filas) => {
  const porNombre = new Map();
  for (const s of filas)
    for (const t of s.pauta?.tipos || []) {
      if (typeof t.kcals !== 'number') continue;
      if (!porNombre.has(t.n)) porNombre.set(t.n, []);
      porNombre.get(t.n).push(t.kcals);
    }
  if (porNombre.size < 2) return [];
  return [...porNombre]
    .map(([n, v]) => ({ n, kcals: media(v), min: Math.min(...v), max: Math.max(...v) }))
    .sort((a, b) => b.kcals - a.kcals);
};

/**
 * El peso de un tramo de filas seguidas de la misma fase.
 * `real` y `esperado` en kg; los ritmos, en % del peso por semana.
 */
const pesoDelTramo = (fase, filas) => {
  const conMedia = filas.filter((s) => s.media !== null);
  const primera = conMedia[0] || null;
  const ultima = conMedia[conMedia.length - 1] || null;
  const semanas = primera && ultima ? (daysBetween(primera.lunes, ultima.lunes) ?? 0) / 7 : 0;
  const real = semanas > 0 ? ultima.media - primera.media : null;
  const esperado =
    semanas > 0 && primera.esperado !== null && ultima.esperado !== null ? ultima.esperado - primera.esperado : null;
  return {
    fase,
    desde: filas[0].lunes,
    hasta: filas[filas.length - 1].domingo,
    semanas: filas.length,
    pesadas: conMedia.length,
    inicial: primera?.media ?? null,
    final: ultima?.media ?? null,
    real,
    esperado,
    ritmoReal: real !== null ? (real / primera.media / semanas) * 100 : null,
    ritmoEsperado: esperado !== null && primera.esperado ? (esperado / primera.esperado / semanas) * 100 : null,
    /* La tendencia de sus pesajes, la misma cuenta que la tarjeta de impacto. */
    tendencia: tendenciaDelPeso(
      filas.flatMap((s) => s.pesajes || []),
      { desde: filas[0].lunes, hasta: filas[filas.length - 1].domingo }
    ),
  };
};

/**
 * @param semanas      las filas del plan, con su estado de revisión.
 * @param desde        el lunes de la primera semana del rango.
 * @param hasta        el domingo de la última.
 * @param hoy          el día de hoy: lo de después no ha pasado.
 * @param rendimiento  `rendimientoDeLaTemporada`, o `null` sin entreno.
 * @param entreno      `entrenoDeLasSemanas`, o `null` sin entreno.
 */
export const resumenDelRango = ({ semanas = [], desde, hasta, hoy, rendimiento = null, entreno = null }) => {
  const filas = semanas.filter((s) => s.lunes >= desde && s.lunes <= hasta);
  const vividas = filas.filter((s) => s.lunes <= hoy);

  /* ── El peso, por tramos de la misma fase ─────────────────────────────── */
  const tramos = [];
  for (const s of vividas) {
    const clave = s.fase?.id ?? null;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.filas.push(s);
    else tramos.push({ clave, fase: s.fase || null, filas: [s] });
  }
  const peso = tramos.map((t) => pesoDelTramo(t.fase, t.filas));

  /* ── Los hechos que tocan el rango, una vez cada uno ──────────────────── */
  const vistos = new Map();
  for (const s of filas)
    for (const h of s.hechos || []) {
      const clave = h.id || `${h.kind}-${h.date}`;
      if (!vistos.has(clave)) vistos.set(clave, h);
    }
  const todos = [...vistos.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  /* Los refeeds y diet breaks son pauta: van con la dieta, no con los hechos. */
  const hechos = todos.filter((h) => !esIntervencion(h));
  const intervenciones = todos.filter(esIntervencion);

  /* ── El entreno ────────────────────────────────────────────────────────── */
  let sesiones = null;
  if (entreno) {
    let hechas = 0;
    let pedidos = 0;
    let contables = 0;
    for (const s of vividas) {
      const d = entreno.get(s.lunes);
      if (!d) continue;
      hechas += d.hechas || 0;
      if (d.pedidos !== null && d.pedidos !== undefined) {
        pedidos += d.pedidos;
        contables += 1;
      }
    }
    sesiones = { hechas, pedidos: contables > 0 ? pedidos : null };
  }

  /* Cada referencia, de su primera a su última semana dentro del rango. El %
     de la temporada va contra la primera semana del BLOQUE; aquí se rebasa a
     la primera del rango: (1 + pₙ) / (1 + p₁) − 1. */
  const referencias = [];
  const bloques = [];
  for (const b of rendimiento?.bloques || []) {
    if (b.hasta < desde || b.desde > hasta) continue;
    /* Las series efectivas del bloque dentro del rango: sus semanas vividas. */
    const suyas = vividas.filter((s) => s.lunes >= weekStart(b.desde) && s.lunes <= b.hasta);
    const efectivas = suyas.reduce((n, s) => n + (rendimiento.semanas.get(s.lunes)?.efectivas || 0), 0);
    const propias = [];
    for (const r of b.referencias) {
      const puntos = r.puntos.filter((p) => p.lunes >= desde && p.lunes <= hasta);
      if (puntos.length < 2) continue;
      const [p1, pn] = [puntos[0], puntos[puntos.length - 1]];
      const ref = {
        bloque: b.nombre,
        nombre: r.nombre,
        pct: (1 + pn.pct) / (1 + p1.pct) - 1,
        desde: p1.lunes,
        hasta: pn.lunes,
        semanas: puntos.length,
      };
      referencias.push(ref);
      propias.push(ref);
    }
    if (efectivas > 0 || propias.length > 0)
      bloques.push({ nombre: b.nombre, efectivas, semanas: suyas.length, referencias: propias });
  }

  /* ── Las revisiones, por estado ───────────────────────────────────────── */
  const revisiones = {};
  for (const s of filas) if (s.revision5) revisiones[s.revision5] = (revisiones[s.revision5] || 0) + 1;

  return {
    desde,
    hasta,
    semanas: filas.length,
    vividas: vividas.length,
    /* La primera semana que se puede abrir en Revisiones: la primera del
       rango que no es futura. */
    primeraRevisable: (vividas[0] || filas[0])?.lunes ?? null,
    peso,
    kcals: pautaDe(vividas, 'kcals'),
    pasos: pautaDe(vividas, 'steps'),
    tipos: tiposDe(vividas),
    macros: macrosDe(vividas),
    soloMedia: vividas.filter((s) => s.pauta?.soloMedia).length,
    intervenciones,
    hechos,
    sesiones,
    referencias,
    bloques,
    revisiones,
  };
};

/** El rango de una selección en la URL: `2026-06-15..2026-08-23`. */
export const rangoAParam = ({ desde, hasta }) => `${desde}..${hasta}`;

/** Al revés, o `null` si no es un rango válido. `hasta` es un domingo. */
export const rangoDeParam = (valor) => {
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(String(valor || ''));
  if (!m || m[1] > m[2]) return null;
  return { desde: m[1], hasta: m[2] };
};

/** Los lunes de un rango, en orden. */
export const lunesDelRango = ({ desde, hasta }) => {
  const salida = [];
  for (let l = desde; l <= hasta && salida.length < 520; l = addDays(l, 7)) salida.push(l);
  return salida;
};
