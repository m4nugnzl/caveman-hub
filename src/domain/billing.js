/**
 * El cobro de un cliente: cuánto, cada cuánto y en qué estado está.
 *
 * ══ Por qué esto es un módulo y no cuatro condiciones repartidas ════════════
 *
 * «¿Está pendiente de pago?» se contestaba en tres sitios con tres criterios
 * distintos:
 *
 *   · La cartera (`domain/portfolio.js`) miraba la FECHA: solo reclamaba lo
 *     vencido, y hacía bien.
 *   · La cabecera de las siete secciones del cliente miraba solo
 *     `payment_status`, así que pintaba «Pago pendiente» en rojo desde el día 1
 *     del ciclo. Veintinueve días avisando de algo que no había que hacer.
 *   · La bandeja de «Hoy» mezclaba las dos.
 *
 * Tres respuestas distintas a la misma pregunta en la misma pantalla es peor que
 * no tener ninguna: enseña a no fiarse de ninguna de las tres. Aquí está el
 * criterio, una vez, y todos preguntan.
 *
 * ══ La regla ═══════════════════════════════════════════════════════════════
 *
 * **Un cobro cuya fecha no ha llegado no está pendiente.** `payment_status` se
 * pone en `pending` en cuanto empieza un ciclo nuevo, así que por sí solo no
 * dice si hay algo que hacer: lo dice la fecha. El estado marca si ESE cobro ya
 * entró; la fecha marca si ya tocaba.
 *
 * ── Por qué la periodicidad vive aquí y no en la ficha ──────────────────────
 * Porque es lo que convierte «marcar como pagado» en un gesto completo. Sin
 * ella hay que acordarse de mover la fecha a mano, y la ficha del mes que viene
 * miente. Con ella, marcar cobrado adelanta el ciclo — que es lo que acaba de
 * pasar de verdad.
 */

import { addMonths, daysBetween, shortDate, todayISO } from '@/lib/dates';
import { toNum } from '@/lib/num';

/**
 * Cada cuánto se cobra.
 *
 * `months` es lo único que hace falta para calcular la siguiente fecha. `once`
 * lo tiene a `null` y eso NO es un cero: «no se repite» y «cada 0 meses» son
 * cosas distintas, y la segunda no significa nada.
 *
 * Los identificadores son los que acepta el CHECK de la migración 0058. Añadir
 * uno aquí sin añadirlo allí hace que el guardado falle en el servidor.
 */
export const BILLING_PERIODS = [
  { id: 'monthly', label: 'Mensual', short: 'mes', months: 1 },
  { id: 'bimonthly', label: 'Cada 2 meses', short: '2 meses', months: 2 },
  { id: 'quarterly', label: 'Trimestral', short: 'trimestre', months: 3 },
  { id: 'biannual', label: 'Semestral', short: 'semestre', months: 6 },
  { id: 'annual', label: 'Anual', short: 'año', months: 12 },
  { id: 'once', label: 'Pago único', short: 'único', months: null },
];

export const billingPeriod = (id) => BILLING_PERIODS.find((p) => p.id === id) || null;

/**
 * Cuándo toca el cobro siguiente al de esta fecha.
 *
 * `null` cuando no se puede saber: sin fecha de partida, sin periodicidad, o con
 * un pago único —que por definición no tiene siguiente—. Quien lo llama tiene que
 * distinguir «no hay siguiente» de «no lo sé», y por eso no se devuelve la misma
 * fecha de entrada como respaldo: dejaría la ficha con un cobro que ya venció y
 * pareciendo al día.
 */
export const nextPaymentAfter = (date, periodId) => {
  const periodo = billingPeriod(periodId);
  if (!date || !periodo || periodo.months === null) return null;
  return addMonths(date, periodo.months);
};

/**
 * La tarifa escrita: «60 € / mes». Cadena vacía si no se ha anotado.
 *
 * Sin periodicidad se escribe solo el importe. Es un dato a medias, pero un
 * importe suelto sigue siendo mejor que nada — y decir «60 € / mes» de alguien
 * que no ha dicho cada cuánto sería inventárselo.
 */
export const feeLabel = ({ feeAmount, billingPeriod: periodId } = {}) => {
  const importe = toNum(feeAmount);
  if (importe === null) return '';

  const cifra = `${Number.isInteger(importe) ? importe : importe.toFixed(2)} €`;
  const periodo = billingPeriod(periodId);
  if (!periodo) return cifra;
  return periodo.months === null ? `${cifra} (único)` : `${cifra} / ${periodo.short}`;
};

/**
 * Con cuántos días de antelación se avisa de una renovación. El mismo umbral que
 * usaba la cartera, y ahora el único.
 */
export const PAYMENT_SOON_DAYS = 5;

/**
 * En qué punto está el cobro de un cliente. Siempre uno de cinco, nunca `null`:
 *
 *   `overdue`  — la fecha pasó y no está cobrado. Es una tarea, y es la única.
 *   `due`      — vence hoy. Tarea de hoy.
 *   `soon`     — quedan pocos días. Es información, no trabajo.
 *   `scheduled`— tiene fecha y está lejos. No se dice nada en rojo.
 *   `no_date`  — no se sabe cuándo toca. Es un dato que falta en la ficha, no
 *                una deuda del cliente.
 *
 * `tone` sale de aquí y no de cada pantalla a propósito: es lo que decide el
 * color, y dos vistas eligiéndolo por su cuenta acabarían pintando el mismo
 * cobro de dos colores. `bad` solo lo lleva lo vencido.
 */
export const paymentState = (client, today = todayISO()) => {
  const fecha = client?.nextPaymentDate || null;
  const cobrado = client?.paymentStatus === 'paid';
  const days = fecha ? daysBetween(today, fecha) : null;

  if (days === null) {
    return {
      state: 'no_date',
      days: null,
      date: null,
      tone: '',
      label: 'Sin fecha de cobro',
      detail: 'No se sabe cuándo le toca renovar, así que no se puede avisar a tiempo.',
    };
  }

  const cuando = shortDate(fecha);

  /* Cobrado y con la fecha ya pasada significa que ese cobro entró y nadie movió
     la fecha al ciclo siguiente. No es una deuda —está pagado— pero tampoco es
     una renovación futura, así que se dice tal cual en vez de anunciar una fecha
     que ya no va a pasar. */
  if (cobrado && days < 0) {
    return {
      state: 'scheduled',
      days,
      date: fecha,
      tone: '',
      label: 'Cobrado',
      detail: `El último cobro fue el ${cuando}. Ponle la fecha del siguiente.`,
    };
  }

  if (!cobrado && days < 0) {
    const n = Math.abs(days);
    return {
      state: 'overdue',
      days,
      date: fecha,
      tone: 'bad',
      label: `Pago vencido hace ${n} ${n === 1 ? 'día' : 'días'}`,
      detail: `Vencía el ${cuando}.`,
    };
  }

  if (!cobrado && days === 0) {
    return { state: 'due', days, date: fecha, tone: 'warn', label: 'Vence hoy', detail: `Le toca renovar hoy.` };
  }

  if (days <= PAYMENT_SOON_DAYS) {
    return {
      state: 'soon',
      days,
      date: fecha,
      tone: '',
      label: days === 0 ? 'Renueva hoy' : `Renueva en ${days} ${days === 1 ? 'día' : 'días'}`,
      detail: `El ${cuando}.`,
    };
  }

  return {
    state: 'scheduled',
    days,
    date: fecha,
    tone: '',
    label: `Renueva el ${cuando}`,
    detail: cobrado ? 'Está al día.' : `El ${cuando}. Todavía no toca.`,
  };
};

/** Si hay algo que cobrar HOY. Es lo que decide que salga en la bandeja. */
export const needsCollecting = (estado) => estado.state === 'overdue' || estado.state === 'due';
