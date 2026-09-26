import { addDays } from '@/lib/dates';

/*
  ══ LA DIETA PROGRAMADA (letra e, 0146) ═════════════════════════════════════

  Una dieta ENTERA que empieza otro día. Se prepara con el mismo editor sobre
  una copia (`useEditorDeDieta` con `?programada=`), el cliente no la ve, y la
  base la pone en vigor su día (`aplicar_dietas_programadas`: el latido o
  quien abra al cliente).

  Aquí, lo que se dice de ella sin tocar la base: qué fechas valen, cuál es la
  siguiente, y las frases de su estado. Las reglas de verdad las pone la base
  (mañana o después, doce como mucho, lo aplicado no se edita); esto las
  adelanta para no dejar pulsar lo que se va a rechazar.
*/

/** Tantas pendientes por cliente, como mucho. La misma cifra que la 0146. */
export const MAX_PENDIENTES = 12;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «1 oct» de un ISO de día, sin pasar por la zona del aparato. */
export const diaCorto = (iso) => {
  if (!iso) return '';
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
};

/** «3 oct» de un instante, en el reloj de quien lo mira. */
export const instanteCorto = (ts) => {
  if (!ts) return '';
  const f = new Date(ts);
  return Number.isNaN(f.getTime()) ? '' : `${f.getDate()} ${MESES[f.getMonth()]}`;
};

/** El primer día que se puede programar: mañana. */
export const primerDiaProgramable = (hoy) => addDays(hoy, 1);

/**
 * Lo que impide programar ese día, o `null` si vale.
 * @param ocupados los `empieza` de las otras pendientes del cliente.
 */
export const problemaDelDia = (empieza, { hoy, ocupados = [] }) => {
  if (!empieza) return 'Elige el día en que empieza.';
  if (empieza <= hoy) return 'Empieza mañana o después. Para hoy, cambia la dieta.';
  if (ocupados.includes(empieza)) return `Ya hay un cambio programado para el ${diaCorto(empieza)}.`;
  return null;
};

/** Las pendientes, de la más cercana a la más lejana. */
export const pendientes = (programadas = []) =>
  programadas.filter((p) => p.estado === 'pendiente').sort((a, b) => a.empieza.localeCompare(b.empieza));

/** La próxima que sustituirá la dieta de ahora, o `null`. */
export const proximaProgramada = (programadas = []) => pendientes(programadas)[0] || null;

/**
 * La última que NO se aplicó en las dos últimas semanas, o `null`: el editor
 * lo dice, porque un cambio que no entró solo lo buscaría quien ya lo sabe.
 */
export const noAplicadaReciente = (programadas = [], hoy) =>
  programadas
    .filter((p) => p.estado === 'no_aplicada' && p.empieza >= addDays(hoy, -14))
    .sort((a, b) => b.empieza.localeCompare(a.empieza))[0] || null;

/**
 * Cómo quedó una que ya no está pendiente. Lo dice la tarjeta de la temporada.
 *   · «Se aplicó el 3 oct; sustituyó un retoque de menú del 2 oct»
 *   · «Se aplicó el 1 oct»
 *   · «No se aplicó: la pauta se cambió a mano el 02/10, …»
 */
export const estadoDeLaProgramada = (p) => {
  if (!p) return null;
  if (p.estado === 'pendiente') return `Cambio programado para el ${diaCorto(p.empieza)} · el cliente no lo ve`;
  if (p.estado === 'aplicada') {
    const cuando = `Se aplicó el ${instanteCorto(p.aplicadaEl)}`;
    return p.retoqueDel ? `${cuando}; sustituyó un retoque de menú del ${instanteCorto(p.retoqueDel)}` : cuando;
  }
  const porque = String(p.porQueNo || '').trim();
  return porque ? `No se aplicó: ${porque.charAt(0).toLowerCase()}${porque.slice(1)}` : 'No se aplicó.';
};
