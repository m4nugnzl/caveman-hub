import { kindMeta } from '@/domain/calendar';
import { PESAJES_FIRMES, pesajesTexto } from '@/domain/tendenciaDelPeso';
import { localeNumber } from '@/lib/dates';
import { entero, pctSemana } from './lectura';
import { escalaDe, valoresPorSemana } from './capas';

/**
 * EL RESUMEN DEL PERIODO: lo que pasó en el tramo que se ve (o en el rango
 * elegido), contra el tramo de antes de la misma duración (24 sep 2026).
 *
 * Cuatro tarjetas, siempre bajo la gráfica y sin pulsar nada:
 *
 *   · la tendencia del peso, en %/sem, con la de antes y el objetivo;
 *   · las kcal medias, con las de antes y los refeeds o diet breaks;
 *   · las dos sensaciones que más han cambiado respecto al tramo de antes.
 *
 * Cada tarjeta: etiqueta, valor y UNA línea de comparación en palabras
 * («antes 3,1»); debajo, si hace falta, una segunda («sube desde S12»). Lo que
 * no cambia no se escribe. Sin tramo de antes (la temporada entera), las
 * sensaciones se comparan dentro del propio tramo: el valor es el de su
 * último tercio y la comparación, el del primero («al principio 3,1»).
 * Ningún juicio: dos cifras juntas y hacia dónde van.
 */

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const media = (vs) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null);
const d1 = (v) => localeNumber(Math.round(v * 10) / 10, { maximumFractionDigits: 1 });
const sinUnidad = (v) => pctSemana(v).replace(' %/sem', '');

/** «1 refeed y 2 diet breaks». */
const intervencionesTexto = (intervenciones) => {
  const cuenta = new Map();
  for (const e of intervenciones) {
    const nombre = kindMeta(e.kind).label.toLowerCase();
    cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
  }
  const partes = [...cuenta].map(([n, c]) => `${c} ${n}${c === 1 ? '' : 's'}`);
  return partes.length ? [partes.slice(0, -1).join(', '), partes[partes.length - 1]].filter(Boolean).join(' y ') : null;
};

/** La tendencia de un resumen: la del último tramo de fase que la tiene (dos días pesados o más). */
const tramoConRitmo = (resumen) => (resumen ? [...resumen.peso].reverse().find((t) => esNumero(t.tendencia?.ritmo)) || null : null);

/**
 * Desde qué semana está el valor del lado al que se movió, sin volver a
 * cruzar: la primera de la última racha. `null` si la última semana ya no
 * está de ese lado.
 */
const desdeCuando = (puntos, referencia, sube) => {
  const lado = (v) => (sube ? v > referencia : v < referencia);
  if (puntos.length === 0 || !lado(puntos[puntos.length - 1].valor)) return null;
  let i = puntos.length - 1;
  while (i > 0 && lado(puntos[i - 1].valor)) i -= 1;
  return puntos[i].lunes;
};

/**
 * EL CAMBIO DE UNA SENSACIÓN en el tramo.
 *
 * @returns `{ capa, valor, antes, desde, hasta, cambio, peso, desdeLunes }` o `null`.
 */
export const cambioDeSensacion = ({ valores, lunes, lunesAntes }) => {
  const puntos = lunes.filter((l) => valores.has(l)).map((l) => ({ lunes: l, valor: valores.get(l) }));
  if (puntos.length === 0) return null;
  const valor = media(puntos.map((p) => p.valor));
  const previos = lunesAntes.filter((l) => valores.has(l)).map((l) => valores.get(l));
  if (previos.length) {
    const antes = media(previos);
    return { valor, antes, cambio: valor - antes, referencia: antes, desdeLunes: desdeCuando(puntos, antes, valor > antes) };
  }
  /* Sin tramo de antes: el primer tercio contra el último. */
  if (puntos.length < 3) return null;
  const n = Math.max(1, Math.floor(puntos.length / 3));
  const al = media(puntos.slice(0, n).map((p) => p.valor));
  const ultimo = media(puntos.slice(-n).map((p) => p.valor));
  return { valor, principio: al, final: ultimo, cambio: ultimo - al, referencia: al, desdeLunes: desdeCuando(puntos, al, ultimo > al) };
};

/**
 * @param actual  `resumenDelRango` del tramo.
 * @param anterior `resumenDelRango` del tramo de antes, o `null`.
 * @param lunes / lunesAntes los lunes vividos de cada tramo.
 * @param capas   las sensaciones que se pueden comparar (`capasDisponibles`).
 * @param nombreDe `(lunes) => 'S12'`.
 * @returns `[{ id, etiqueta, valor, unidad, compara, nota }]`, para `Cifras`.
 */
export const cifrasDelPeriodo = ({ actual, anterior = null, lunes, lunesAntes, capas = [], semanas, sesionesPorLunes, nombreDe }) => {
  const cifras = [];

  const t = tramoConRitmo(actual);
  const ta = tramoConRitmo(anterior);
  cifras.push({
    id: 'tendencia',
    etiqueta: 'Tendencia del peso',
    valor: t ? sinUnidad(t.tendencia.ritmo) : null,
    unidad: '%/sem',
    debil: Boolean(t) && t.tendencia.pesajes < PESAJES_FIRMES,
    ...[
      t ? pesajesTexto(t.tendencia.pesajes) : null,
      ta ? `antes ${pctSemana(ta.tendencia.ritmo)}` : null,
      esNumero(t?.ritmoEsperado) ? `objetivo ${pctSemana(t.ritmoEsperado)}` : null,
    ]
      .filter(Boolean)
      .reduce((o, linea, i) => (i === 0 ? { ...o, compara: linea } : { ...o, nota: o.nota ? `${o.nota}, ${linea}` : linea }), {}),
  });

  const k = actual.kcals;
  const ka = anterior?.kcals;
  cifras.push({
    id: 'kcal',
    etiqueta: 'Kcal medias',
    valor: k ? entero(k.media) : null,
    compara: k && ka && Math.round(ka.media) !== Math.round(k.media) ? `antes ${entero(ka.media)}` : null,
    nota: intervencionesTexto(actual.intervenciones),
  });

  /* Las dos sensaciones que más se movieron, en proporción a su escala: un
     punto en 1–5 es más que un punto en 0–10. */
  const cambios = capas
    .map((capa) => {
      const c = cambioDeSensacion({ valores: valoresPorSemana({ capa, semanas, sesionesPorLunes }), lunes, lunesAntes });
      if (!c) return null;
      const { min, max } = escalaDe(capa.pregunta);
      return { capa, ...c, max, peso: Math.abs(c.cambio) / (max - min || 1) };
    })
    .filter((c) => c && Math.round(Math.abs(c.cambio) * 10) >= 1)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 2);
  for (const c of cambios) {
    const sube = c.cambio > 0;
    const conAntes = esNumero(c.antes);
    cifras.push({
      id: c.capa.id,
      etiqueta: c.capa.nombre,
      valor: d1(conAntes ? c.valor : c.final),
      unidad: `/${c.max}`,
      compara: conAntes ? `antes ${d1(c.antes)}` : `al principio ${d1(c.principio)}`,
      nota: c.desdeLunes ? `${sube ? 'sube' : 'baja'} desde ${nombreDe(c.desdeLunes)}` : sube ? 'sube' : 'baja',
    });
  }
  return cifras;
};
