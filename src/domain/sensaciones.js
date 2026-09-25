/**
 * LAS SENSACIONES: lo que el cliente cuenta de cómo va, leído para compararlo
 * (24 sep 2026).
 *
 * ══ De dónde salen ═════════════════════════════════════════════════════════
 *
 *   · Del CHECK-IN semanal (`check_ins.answers`): hambre, sueño, estrés…, una
 *     vez por semana (o por quincena).
 *   · Del PARTE DE CADA SESIÓN (`sessions[].feedback`): esfuerzo, fatiga,
 *     sueño de anoche…, solo los días que entrena.
 *
 * Las respuestas se guardan como texto, sin la escala con la que se dieron.
 * Las preguntas (y su escala) son las del protocolo de HOY.
 *
 * ══ Reglas ═════════════════════════════════════════════════════════════════
 *
 *   · Cada pregunta en SU escala (0–10, 1–5, estrellas…): nada se normaliza.
 *   · Una respuesta que no se entiende como número dentro de su escala se
 *     descarta sin romper nada.
 *   · Solo se compara una fila si hay respuesta a los dos lados. Una
 *     respuesta fuera de la escala de hoy dice que la pregunta cambió: se
 *     descarta, y con ella la comparación.
 *   · El SENTIDO (si más es peor o mejor) sirve para ordenar y para marcar
 *     el extremo de la escala. En la ficha, sin colores de bien o mal; en las
 *     tiras de la línea de tiempo, solo los extremos llevan un tono suave
 *     (`tonoDeSensacion`, lo pidió el dueño el 24 sep).
 */

import { esSerie } from './protocol';

/**
 * Si más es peor o mejor, pregunta a pregunta. Lo decidió el dueño (24 sep):
 * hambre, estrés, dolor, fatiga y agujetas, más es peor; sueño, energía,
 * adherencia, digestiones, ganas de seguir y sensaciones generales, más es
 * mejor. El esfuerzo y los entrenos completados no tienen sentido.
 */
const SENTIDO = {
  hunger: 'peor',
  week_stress: 'peor',
  stress: 'peor',
  week_pain: 'peor',
  pain: 'peor',
  fatigue: 'peor',
  soreness: 'peor',
  week_sleep: 'mejor',
  sleep: 'mejor',
  week_energy: 'mejor',
  energy: 'mejor',
  adherence: 'mejor',
  digestion: 'mejor',
  motivation: 'mejor',
  mood: 'mejor',
};

/** `'peor'` (más es peor), `'mejor'` (más es mejor) o `null`. */
export const sentidoDe = (q) => {
  if (!q) return null;
  if (q.id in SENTIDO) return SENTIDO[q.id];
  if (q.neutral) return null;
  return q.lowerIsBetter ? 'peor' : null;
};

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const minDe = (q) => (esNumero(q?.min) ? q.min : 1);
const maxDe = (q) => (esNumero(q?.max) ? q.max : 10);

/**
 * La respuesta como número de su escala, o `null`.
 *
 * Acepta `7`, `"7"`, `" 7,5 "`, `"7/10"`. Un texto sin número, un número
 * fuera de la escala de la pregunta o cualquier otra cosa, `null`.
 */
export const valorDeRespuesta = (v, q) => {
  let n = null;
  if (esNumero(v)) n = v;
  else if (typeof v === 'string') {
    const m = v.trim().match(/^-?\d+(?:[.,]\d+)?/);
    if (m) n = Number(m[0].replace(',', '.'));
  }
  if (!esNumero(n)) return null;
  return n >= minDe(q) && n <= maxDe(q) ? n : null;
};

/** ¿Está en el extremo de la escala que el sentido llama peor? */
export const enElExtremo = (valor, q) => {
  if (!esNumero(valor)) return false;
  const s = sentidoDe(q);
  if (s === 'peor') return valor === maxDe(q);
  if (s === 'mejor') return valor === minDe(q);
  return false;
};

const ORDEN = { peor: 0, mejor: 1 };
/** Las de «más es peor» primero, luego las de «más es mejor», luego el resto; estable. */
const ordenar = (filas) =>
  filas
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (ORDEN[a.f.sentido] ?? 2) - (ORDEN[b.f.sentido] ?? 2) || a.i - b.i)
    .map((x) => x.f);

const media = (vs) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null);
const redondear = (v) => (esNumero(v) ? Math.round(v * 10) / 10 : null);

/**
 * LAS SENSACIONES DE UNA SEMANA, con su cambio.
 *
 * @param preguntas las del check-in de hoy (`checkinQuestions`).
 * @param answers   las respuestas de esta semana (`entrega.answers`).
 * @param anteriores las de la semana (o el periodo) de antes, o `null`.
 * @param deLaFase  las de las semanas anteriores de su fase: `[answers]`.
 * @returns `[{ id, nombre, etiqueta, min, max, instrumento, sentido, valor,
 *   anterior, vsAnterior, mediaFase, vsFase, extremo }]`, en orden.
 */
export const sensacionesDeLaSemana = ({ preguntas = [], answers = null, anteriores = null, deLaFase = [] }) => {
  if (!answers) return [];
  const filas = preguntas.filter(esSerie).flatMap((q) => {
    const valor = valorDeRespuesta(answers[q.id], q);
    if (valor === null) return [];
    const anterior = anteriores ? valorDeRespuesta(anteriores[q.id], q) : null;
    const previas = deLaFase.map((a) => valorDeRespuesta(a?.[q.id], q)).filter(esNumero);
    const mediaFase = previas.length ? redondear(media(previas)) : null;
    return [
      {
        id: q.id,
        nombre: q.short || q.label,
        etiqueta: q.label,
        min: minDe(q),
        max: maxDe(q),
        instrumento: q.instrumento || null,
        sentido: sentidoDe(q),
        valor,
        anterior,
        vsAnterior: anterior !== null ? redondear(valor - anterior) : null,
        mediaFase,
        vsFase: mediaFase !== null ? redondear(valor - mediaFase) : null,
        extremo: enElExtremo(valor, q),
      },
    ];
  });
  return ordenar(filas);
};

/**
 * Lo que escribió con palabras en el check-in (obstáculos, nota de la semana):
 * `[{ id, etiqueta, texto }]`.
 */
export const textosDeLaSemana = ({ preguntas = [], answers = null }) =>
  answers
    ? preguntas
        .filter((q) => q.kind === 'text')
        .map((q) => ({ id: q.id, etiqueta: q.short || q.label, texto: String(answers[q.id] ?? '').trim() }))
        .filter((t) => t.texto)
    : [];

/**
 * LAS SENSACIONES DE UNA SESIÓN: su parte, en su escala.
 *
 * @param preguntas las de la sesión de hoy (`activeQuestions`).
 * @param feedback  `session.feedback`.
 * @returns `{ filas: [{ id, nombre, etiqueta, min, max, instrumento, sentido,
 *   valor, extremo }], nota }`.
 */
export const sensacionesDeLaSesion = ({ preguntas = [], feedback = null }) => {
  const f = feedback && typeof feedback === 'object' ? feedback : {};
  const filas = preguntas.filter(esSerie).flatMap((q) => {
    const valor = valorDeRespuesta(f[q.id], q);
    return valor === null
      ? []
      : [
          {
            id: q.id,
            nombre: q.short || q.label,
            etiqueta: q.label,
            min: minDe(q),
            max: maxDe(q),
            instrumento: q.instrumento || null,
            sentido: sentidoDe(q),
            valor,
            extremo: enElExtremo(valor, q),
          },
        ];
  });
  const nota = String(f.note ?? '').trim() || null;
  return { filas: ordenar(filas), nota };
};

/**
 * EL TONO DE UNA RESPUESTA en las tiras de la línea de tiempo: solo los
 * extremos de su escala llevan color, según su sentido. El quinto de arriba o
 * el de abajo: en 1–5, el 1 y el 5; en 0–10, del 0 al 2 y del 8 al 10.
 *
 * @returns `'malo'`, `'bueno'` o `null` (lo del medio, o sin sentido).
 */
export const tonoDeSensacion = (valor, q) => {
  const s = sentidoDe(q);
  if (!esNumero(valor) || !s) return null;
  const p = (valor - minDe(q)) / (maxDe(q) - minDe(q) || 1);
  const alto = p >= 0.8 - 1e-9;
  const bajo = p <= 0.2 + 1e-9;
  if (!alto && !bajo) return null;
  return alto === (s === 'peor') ? 'malo' : 'bueno';
};
