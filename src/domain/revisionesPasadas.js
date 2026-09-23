/**
 * LAS REVISIONES PASADAS: en qué punto está cada una y si el cliente todavía
 * puede completarla.
 *
 * ══ Qué contesta ═══════════════════════════════════════════════════════════
 *
 * Para UNA revisión —un periodo de la pauta del cliente, que con cadencia
 * quincenal son dos semanas—:
 *
 *   · `estado`   pendiente · sin entregar · entregada · cerrada
 *       - pendiente     la del camino normal: la semana abierta o la que
 *                       todavía está en su ventana de gracia
 *                       (`periodoAEntregar`), sin entregar.
 *       - sin entregar  pasó su ventana y no la mandó.
 *       - entregada     la mandó; su entrenador aún no la ha revisado.
 *       - cerrada       su entrenador la revisó (`reviewedAt`), la hubiera
 *                       entregado o no.
 *   · `editable` si el cliente puede tocar lo que cuenta para ella ahora.
 *   · `motivo`   por qué no, en una línea, cuando no puede.
 *   · `hasta`    el último día en que puede, cuando es una pasada.
 *   · `tarde`    si la entrega llegó después de su día, y cómo.
 *
 * Ningún estado se guarda: salen de la fila de `check_ins`, la pauta y la
 * fecha. Es la decisión de la migración 0134.
 *
 * ══ Las dos fronteras (23 sep 2026) ════════════════════════════════════════
 *
 *   · **Revisada, cerrada.** Sin excepciones, también dentro del margen. Lo
 *     corrige su entrenador, o la reabre con «Deshacer revisión».
 *   · **Cuatro semanas de margen** (`MARGEN_SEMANAS`). Más atrás, fuera de
 *     plazo, salvo que su entrenador la reabra hasta una fecha
 *     (`abiertaHasta`).
 *
 * El periodo EN CURSO no entra en ninguna: pesarse es diario y no depende de la
 * entrega. Revisada o no, en la semana de hoy se sigue apuntando.
 *
 * ── La misma cuenta está en la base ────────────────────────────────────────
 * `semana_cerrada_al_cliente` (0134) decide lo mismo en el servidor, un poco
 * más ancha a propósito. Si cambia el margen, cambia en los dos.
 */

import { addDays, daysBetween, toISODate, todayISO, weekStart } from '@/lib/dates';
import {
  checkInSchedule,
  currentCheckInPeriod,
  periodoAEntregar,
  periodoQueEmpieza,
  periodStartOf,
} from './calendar';

/** Cuántas semanas hacia atrás se puede completar una revisión sin entregar. */
export const MARGEN_SEMANAS = 4;

/** Cuánto dura una reapertura si el entrenador no elige otra fecha. */
export const DIAS_DE_REAPERTURA = 7;

/** La fila más reciente: la que `checkIns` del contexto tendría cargada. */
const ultimaDe = (entregas) =>
  entregas.reduce((a, b) => (!a || (b?.weekStart || '') > (a.weekStart || '') ? b : a), null);

/**
 * La fila de `check_ins` de un periodo. Con cadencia quincenal se archiva en
 * el lunes del periodo, pero una fila de su segunda semana —la del cierre del
 * entrenador, de antes de que existiera el periodo— también es suya.
 */
const filaDelPeriodo = (entregas, inicio, semanas) => {
  const fin = addDays(inicio, semanas * 7);
  const suyas = entregas.filter((c) => c?.weekStart >= inicio && c.weekStart < fin);
  return (
    suyas.find((c) => c.reviewedAt) ||
    suyas.find((c) => c.submittedAt) ||
    suyas.find((c) => c.weekStart === inicio) ||
    suyas[0] ||
    null
  );
};

/**
 * CÓMO LLEGÓ UNA ENTREGA: a tiempo (`null`), en la ventana de gracia —«2 días
 * tarde»— o recuperada después, cuando la ventana ya se había cerrado.
 *
 * La ventana se cierra el día de la revisión siguiente, que es cuando
 * `periodoAEntregar` deja de ofrecer la anterior.
 */
export const comoLlego = ({ entrega, periodo, siguiente }) => {
  const el = toISODate(entrega?.submittedAt);
  if (!el || !periodo?.dueOn || el <= periodo.dueOn) return null;
  if (siguiente?.dueOn && el < siguiente.dueOn) {
    return { tipo: 'gracia', dias: daysBetween(periodo.dueOn, el), el };
  }
  return { tipo: 'recuperada', dias: daysBetween(periodo.dueOn, el), el };
};

/**
 * EL ESTADO DE LA REVISIÓN a la que pertenece `lunes` (cualquier lunes de su
 * periodo).
 *
 * @param {{
 *   lunes: string,
 *   entregas?: object[],   todas las filas de `check_ins` del cliente
 *   preferences?: object,  su pauta de revisión
 *   startDate?: string|null,
 *   hoy?: string,
 * }} datos
 * @returns `null` sin día de revisión elegido o antes de su alta: ahí no hay
 *   ninguna revisión que completar.
 */
export const estadoDeRevision = ({ lunes, entregas = [], preferences, startDate = null, hoy = todayISO() }) => {
  const pauta = checkInSchedule(preferences);
  if (pauta.weekday === null || !lunes) return null;

  const cada = pauta.everyWeeks;
  const ancla = weekStart(startDate) || weekStart(hoy);
  const inicio = periodStartOf(weekStart(lunes), ancla, cada);
  if (!inicio) return null;

  const periodo = periodoQueEmpieza(preferences, inicio, hoy);
  const siguiente = periodoQueEmpieza(preferences, addDays(inicio, cada * 7), hoy);
  const entrega = filaDelPeriodo(entregas, inicio, cada);

  const actual = currentCheckInPeriod(preferences, startDate, hoy);
  const abierto = periodoAEntregar({ preferences, startDate, entrega: ultimaDe(entregas), today: hoy });
  /* El camino normal —la semana abierta o la de la ventana de gracia— y lo que
     venga. Ésas se entregan desde la revisión de siempre, no desde aquí. */
  const enCurso = Boolean(abierto?.start) && inicio >= abierto.start;
  const delPeriodoDeHoy = Boolean(actual?.start) && inicio >= actual.start;

  const cerrada = Boolean(entrega?.reviewedAt);
  const estado = cerrada
    ? 'cerrada'
    : entrega?.submittedAt
      ? 'entregada'
      : enCurso
        ? 'pendiente'
        : 'sin entregar';

  const limite = addDays(weekStart(hoy), -MARGEN_SEMANAS * 7);
  const reabiertaHasta = entrega?.abiertaHasta && entrega.abiertaHasta >= hoy ? entrega.abiertaHasta : null;
  /* El último día dentro del margen: el domingo antes de que el lunes de hoy
     lo deje atrás. */
  const finDelMargen = inicio >= limite ? addDays(inicio, MARGEN_SEMANAS * 7 + 6) : null;

  let editable;
  let motivo = null;
  if (delPeriodoDeHoy) {
    editable = true;
  } else if (cerrada) {
    editable = false;
    motivo = entrega.submittedAt ? 'Revisada por tu entrenador' : 'Cerrada por tu entrenador';
  } else if (enCurso || finDelMargen || reabiertaHasta) {
    editable = true;
  } else {
    editable = false;
    motivo = 'Fuera de plazo';
  }

  const pasada = !enCurso;
  const hasta =
    pasada && editable
      ? [finDelMargen, reabiertaHasta].filter(Boolean).sort().pop() || null
      : null;

  return {
    lunes: inicio,
    semanas: cada,
    dueOn: periodo?.dueOn || null,
    estado,
    entrega,
    enCurso,
    pasada,
    editable,
    /* Completar = una PASADA que todavía se puede entregar o corregir. */
    completable: pasada && editable,
    motivo,
    hasta,
    reabiertaHasta,
    tarde: comoLlego({ entrega, periodo, siguiente }),
  };
};

/**
 * ¿Puede el cliente tocar lo que cuenta para la semana de `fecha`? La misma
 * pregunta que la base (`semana_cerrada_al_cliente`), para no ofrecer en la
 * pantalla un gesto que el servidor va a rechazar: un rechazo deja todo el
 * historial sin guardar hasta recargar.
 *
 * Sin pauta de revisión solo cuenta el margen, como en la base.
 */
export const puedeTocarLaSemana = ({ fecha, entregas = [], preferences, startDate = null, hoy = todayISO() }) => {
  if (!fecha) return true;
  if (fecha > hoy) return false;
  const estado = estadoDeRevision({ lunes: fecha, entregas, preferences, startDate, hoy });
  if (estado) return estado.editable;
  return weekStart(fecha) >= addDays(weekStart(hoy), -MARGEN_SEMANAS * 7);
};

/**
 * LAS REVISIONES QUE SE LE DEBEN O SE PUEDEN MIRAR, de la más reciente a la
 * más antigua: todas las pasadas desde su alta hasta el margen, más las más
 * viejas que tengan fila (entregadas, cerradas o reabiertas).
 *
 * Es lo que «Tus semanas» necesita para ofrecer también las semanas en las que
 * no apuntó NADA: se le olvidó entrar, pero tiene los pesos en su báscula.
 */
export const revisionesPasadas = ({ entregas = [], preferences, startDate = null, hoy = todayISO() }) => {
  const pauta = checkInSchedule(preferences);
  const actual = currentCheckInPeriod(preferences, startDate, hoy);
  if (pauta.weekday === null || !actual) return [];

  const ancla = weekStart(startDate) || weekStart(hoy);
  const cada = pauta.everyWeeks;
  const vistas = new Set();
  const salida = [];

  const poner = (lunes) => {
    const e = estadoDeRevision({ lunes, entregas, preferences, startDate, hoy });
    if (!e || vistas.has(e.lunes) || !e.pasada) return;
    vistas.add(e.lunes);
    salida.push(e);
  };

  const limite = addDays(weekStart(hoy), -MARGEN_SEMANAS * 7);
  for (let lunes = addDays(actual.start, -cada * 7); lunes && lunes >= ancla && lunes >= limite; lunes = addDays(lunes, -cada * 7)) {
    poner(lunes);
  }
  for (const c of entregas) {
    if (c?.weekStart && c.weekStart < actual.start) poner(c.weekStart);
  }

  return salida.sort((a, b) => b.lunes.localeCompare(a.lunes));
};

/**
 * LO QUE LLEGÓ DESPUÉS: los registros de una revisión apuntados cuando su
 * ventana ya se había cerrado, o después de entregarla.
 *
 * Lo apuntado dentro de la semana y hasta entregar es lo normal y no sale. La
 * hora es la del SERVIDOR (`apuntadoEl`, la pone la 0134), así que un reloj de
 * teléfono atrasado no esconde nada. Los registros de antes de la 0134 no la
 * llevan y se leen como a tiempo; de las fotos se usa su `creadaEl`.
 *
 * @param revision `estadoDeRevision(...)`.
 * @param history  la antropometría del cliente.
 * @param fotos    sus fotos, cada una con la semana a la que pertenece
 *   (`lunes`) ya calculada.
 * @param finDeVentana el día en que se cerró su ventana de gracia.
 */
export const anadidoDespues = ({ revision, history = [], fotos = [], finDeVentana = null, semanaDe }) => {
  if (!revision) return [];
  const inicio = revision.lunes;
  const fin = addDays(inicio, revision.semanas * 7);
  const entregadaEl = revision.entrega?.submittedAt || null;
  const dentro = (lunes) => Boolean(lunes) && lunes >= inicio && lunes < fin;

  const despues = (cuando) => {
    if (!cuando) return null;
    if (entregadaEl && cuando > entregadaEl) return 'tras entregar';
    if (finDeVentana && toISODate(cuando) >= finDeVentana) return 'fuera de plazo';
    return null;
  };

  const lista = [];
  for (const h of history) {
    if (!dentro(semanaDe(h))) continue;
    const porque = despues(h.apuntadoEl);
    if (!porque) continue;
    const tienePeso = h.weight !== null && h.weight !== undefined && h.weight !== '';
    lista.push({
      id: `h-${h.id || h.date}`,
      que: tienePeso ? 'Pesaje' : 'Medidas',
      del: h.date,
      cuando: h.apuntadoEl,
      porque,
    });
  }
  for (const f of fotos) {
    if (!dentro(f.lunes)) continue;
    const porque = despues(f.creadaEl);
    if (!porque) continue;
    lista.push({ id: `f-${f.id}`, que: 'Foto', del: null, cuando: f.creadaEl, porque, angulo: f.angle });
  }
  return lista.sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
};
