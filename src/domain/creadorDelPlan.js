/**
 * EL CREADOR DEL PLAN, sin React: lo que dibuja la pestaña Plan de «El plan».
 *
 * ══ Qué es ═════════════════════════════════════════════════════════════════
 *
 * La temporada como una barra segmentada, una columna por SEMANA NATURAL (el
 * boceto aprobado el 22 sep 2026, «El plan en barras»):
 *
 *   · Fases, una barra gruesa del color de su dirección. Lo de una semana lo
 *     decide su JUEVES (`phaseAt`), igual que en la portada de Revisiones.
 *   · Bloques debajo, POR DÍAS: un microciclo semanal puede empezar en
 *     miércoles, y un rotativo dura lo que dure su vuelta. Un corte por
 *     microciclo. Los borradores van detrás del abierto, sin fechas propias.
 *   · Los hechos (refeed, vacaciones…) sobre su semana, y el destino y el
 *     cruce al final.
 *
 * Es una vista DERIVADA: no guarda nada. Lo único que se escribe desde el
 * creador son las duraciones —el final de una fase, `plannedWeeks` de un bloque
 * o de un borrador— y el ritmo de una fase.
 *
 * ══ Los pesos de los extremos son LECTURAS ═════════════════════════════════
 *
 * Decisión del dueño (22 sep): no hay «peso de entrada» ni «peso de salida»
 * guardados en una fase. Se leen:
 *
 *   · Entrada: el real si la fase ya empezó —la base de su expectativa, el
 *     mismo número del que sale la recta de lo esperado (`expectativasDelPlan`)—;
 *     si es futura, el esperado al acabar la anterior.
 *   · Salida: entrada + ritmo × semanas. Si la fase se igualó, la vigente, con
 *     la original aparte.
 *
 * Se guarda el RITMO. El atajo de escribir el peso de salida recalcula el ritmo
 * (`ritmoParaSalida`) y la pantalla lo enseña antes de aceptar.
 *
 * ══ Lo que NO hace ═════════════════════════════════════════════════════════
 *
 * No propone duraciones, no reparte un hueco hasta el destino y no avisa de
 * nada. Dibuja y mide; decide el entrenador.
 */

import { addDays, daysBetween, todayISO, toISODate, weekStart } from '@/lib/dates';
import { round, toNum } from '@/lib/num';
import { latestWeight } from './anthropometry';
import { blockTraits, blocksOf, microcicloDelBloque, microciclosDeLaSemana, tramoDelBloque, weeksOfBlock } from './blocks';
import { borradoresDe, diasDelBorrador } from './borradores';
import { forkState, optionToPhaseDraft } from './fork';
import { directionById, targetRateKg } from './goals';
import { esperadoEn, expectativasDelPlan, phaseAt, sortPhases, temporadas, valorDelTramo } from './roadmap';
import { HECHO_KINDS } from './semanasDelPlan';
import { duracionDe, normalizaMicrociclo } from './training';

/** Una tira no pasa de medio año: más larga, las semanas no se distinguen. */
export const MAX_POR_TIRA = 26;

/** Lo más estrecha que puede ser una semana antes de partir la tira. */
export const COLUMNA_MINIMA = 14;

/** Y lo más ancha: con pocas semanas, la barra no se estira a lo loco. */
export const COLUMNA_MAXIMA = 44;

/** Hasta dónde se mira hacia atrás: dos años, como `semanasDelPlan`. */
const TOPE_ATRAS = 7 * 104;

/** El tope de `plannedWeeks` (`blockTraits`): un bloque de un año no es un bloque. */
export const MAX_MICROCICLOS = 52;

const iso = (v) => toISODate(v);
const mayor = (a, b) => (!a ? b : !b ? a : a > b ? a : b);
const menor = (a, b) => (!a ? b : !b ? a : a < b ? a : b);

/* ══════════════════════════════════════════════════════════════════════════
   LAS TIRAS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Parte `total` semanas en tiras iguales de `MAX_POR_TIRA` como mucho, y más
 * cortas si a ese ancho no caben. Nunca desplazamiento lateral: si no cabe, se
 * parte antes.
 *
 * @returns `{ tiras: [{ a, b }], col }` — `[a, b)` en semanas; `col` el ancho de
 *   una semana en píxeles.
 */
export const partirEnTiras = (total, ancho, { maxPorTira = MAX_POR_TIRA, minCol = COLUMNA_MINIMA, maxCol = COLUMNA_MAXIMA } = {}) => {
  const n0 = Math.max(0, Math.trunc(total) || 0);
  if (n0 === 0) return { tiras: [], col: maxCol };
  const caben = Math.max(1, Math.floor(Math.max(0, ancho) / minCol));
  const cuantas = Math.max(1, Math.ceil(n0 / Math.min(maxPorTira, caben)));
  const por = Math.ceil(n0 / cuantas);
  const tiras = [];
  for (let a = 0; a < n0; a += por) tiras.push({ a, b: Math.min(n0, a + por) });
  return { tiras, col: Math.min(maxCol, Math.max(1, ancho) / por) };
};

/* ══════════════════════════════════════════════════════════════════════════
   LOS PESOS DE LOS EXTREMOS
   ══════════════════════════════════════════════════════════════════════════ */

/** Los días de una fase, contando los dos extremos. `null` si está abierta. */
const diasDe = (fase) => {
  const d = daysBetween(iso(fase?.startsOn), iso(fase?.endsOn));
  return d === null ? null : d + 1;
};

/** Lo esperado un día dentro de una fase FUTURA: la recta desde su entrada. */
const rectaFutura = ({ direction, ratePct }, entrada, inicio) => {
  const kgSemana = targetRateKg({ direction, ratePct }, entrada) ?? 0;
  return (dia) => entrada + (kgSemana * (daysBetween(inicio, dia) ?? 0)) / 7;
};

/**
 * La entrada, la salida y la recta de cada fase, en orden.
 *
 * @returns una lista paralela a `fases`: `{ entrada, real, salida,
 *   salidaOriginal, esperado(dia) }`. Cualquiera puede ser `null`: sin pesajes
 *   no hay entrada, y una fase abierta no tiene salida.
 */
export const pesosDeLasFases = (fases, history = [], hoy = todayISO()) => {
  const ultimo = latestWeight(history);
  const expectativas = expectativasDelPlan(fases, history, hoy);
  let salidaAnterior = null;
  return fases.map((f) => {
    const inicio = iso(f.startsOn);
    const fin = iso(f.endsOn);
    const empezo = Boolean(inicio && inicio <= hoy);
    let entrada = null;
    let salida = null;
    let salidaOriginal = null;
    let esperado = () => null;

    const exp = expectativas.get(f.id);
    if (exp) {
      entrada = exp.original.base;
      esperado = (dia) => esperadoEn(exp, dia);
      if (fin) {
        const dia = addDays(fin, 1);
        salida = esperadoEn(exp, dia);
        if (exp.tramos.length > 1) salidaOriginal = valorDelTramo(exp.original, dia);
      }
    } else if (!empezo) {
      /* Una fase futura sin dirección: sale con lo que entra. */
      entrada = salidaAnterior ?? ultimo ?? null;
      if (entrada !== null) {
        esperado = rectaFutura(f, entrada, inicio);
        if (fin) salida = esperado(addDays(fin, 1));
      }
    }

    /* Detrás de una fase abierta o sin pesajes se sigue desde lo último que se
       sabe: su entrada. Mejor eso que dejar sin peso todo lo de después. */
    salidaAnterior = salida ?? entrada ?? salidaAnterior;
    return { entrada, real: empezo && entrada !== null, salida, salidaOriginal, esperado };
  });
};

/**
 * EL ATAJO: el entrenador escribe a qué peso quiere que salga y se le calcula
 * el ritmo. No se guarda el peso: se guarda el ritmo que lo produce.
 *
 * @param dias los de la fase, los dos extremos incluidos.
 * @returns `{ ratePct, kgSemana }`, o `{ error }` con el motivo en castellano.
 */
export const ritmoParaSalida = ({ direction, entrada, salida, dias }) => {
  const meta = directionById(direction);
  const de = toNum(entrada);
  const a = toNum(salida);
  const semanas = (toNum(dias) ?? 0) / 7;
  if (!meta || meta.sign === 0) return { error: 'Una fase de mantenimiento no tiene ritmo: sale con lo que entra.' };
  if (de === null || de <= 0) return { error: 'Sin un peso de entrada no se puede calcular el ritmo.' };
  if (a === null || a < 30 || a > 300) return { error: 'Escribe un peso en kilos.' };
  if (semanas <= 0) return { error: 'La fase no tiene final: primero dale una duración.' };
  const pct = ((a - de) * meta.sign * 100) / (de * semanas);
  if (pct < 0) {
    return {
      error:
        meta.sign > 0
          ? 'Un volumen no puede acabar por debajo de donde empieza. Para eso, otra dirección.'
          : 'Una definición no puede acabar por encima de donde empieza. Para eso, otra dirección.',
    };
  }
  if (pct > 2) return { error: 'Saldría a más del 2 % por semana. Alarga la fase o cambia el peso.' };
  const ratePct = round(pct, 2);
  return { ratePct, kgSemana: targetRateKg({ direction: meta.id, ratePct }, de) };
};

/* ══════════════════════════════════════════════════════════════════════════
   ESTIRAR UNA FASE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Lo que hace `estirar_fase` (0136), en memoria: la vista previa del arrastre
 * y la prueba de que la regla es la misma en los dos sitios.
 *
 * La fase acaba `dias` días más tarde (o antes, en negativo) y TODAS las que
 * empiezan detrás se mueven lo mismo. El destino, los bloques y las fases de
 * antes no se mueven.
 */
export const estirarFases = (phases, faseId, dias) => {
  const fase = (phases || []).find((f) => f.id === faseId);
  const fin = iso(fase?.endsOn);
  if (!fase || !fin || !dias) return phases;
  return phases.map((f) => {
    if (f.id === faseId) return { ...f, endsOn: addDays(fin, dias) };
    if (iso(f.startsOn) > fin) {
      return { ...f, startsOn: addDays(iso(f.startsOn), dias), endsOn: f.endsOn ? addDays(iso(f.endsOn), dias) : f.endsOn };
    }
    return f;
  });
};

/**
 * Cuántas semanas se puede acortar una fase: nunca por debajo de una semana y,
 * si ya empezó, nunca antes de hoy (lo vivido se juzgó con esa fase). Devuelve
 * el paso más negativo permitido, en semanas (0 si no se puede acortar).
 */
export const acortableFase = (fase, hoy = todayISO()) => {
  const inicio = iso(fase?.startsOn);
  const fin = iso(fase?.endsOn);
  if (!inicio || !fin) return 0;
  const suelo = inicio <= hoy ? mayor(addDays(inicio, 6), hoy) : addDays(inicio, 6);
  const margen = daysBetween(suelo, fin) ?? 0;
  const semanas = Math.floor(Math.max(0, margen) / 7);
  return semanas > 0 ? -semanas : 0;
};

/* ══════════════════════════════════════════════════════════════════════════
   LA LÍNEA DEL CREADOR
   ══════════════════════════════════════════════════════════════════════════ */

/** El índice de la semana de un día, contando desde el primer lunes. */
const semanaDe = (lunes0, dia) => Math.floor((daysBetween(lunes0, weekStart(dia)) ?? 0) / 7);

/** Los bloques escritos, con su tramo en el calendario y lo que dura su vuelta. */
const bloquesEnElCalendario = (program, client) => {
  const opciones = {
    cycleType: client?.cycleType,
    cyclePattern: client?.cyclePattern,
    startDate: client?.startDate,
  };
  return blocksOf(program)
    .map((b) => {
      const t = tramoDelBloque(program, b, opciones);
      if (!t) return null;
      const micro = microcicloDelBloque(program, b, { cycleType: client?.cycleType, cyclePattern: client?.cyclePattern });
      const vuelta = duracionDe(micro) || 7;
      const abierto = b.toWeek === null || b.toWeek === undefined;
      const { intent, plannedWeeks } = blockTraits(b);
      const escritos = weeksOfBlock(program, b).length;
      const hasta = t.previstoHasta || t.hasta;
      return {
        id: b.id,
        nombre: b.name || 'Bloque',
        intent,
        tipo: abierto ? 'abierto' : 'hecho',
        desde: t.desde,
        hasta,
        vuelta,
        rotativo: micro?.tipo === 'rotativo',
        /* Cuántos microciclos se dibujan: los previstos si pasan de los
           escritos; si no, los que hay (uno cerrado puede tener huecos entre
           fechas: se cuenta por su largo). */
        microciclos: abierto
          ? Math.max(escritos, plannedWeeks || 0)
          : Math.max(escritos, Math.round(((daysBetween(t.desde, hasta) ?? 0) + 1) / vuelta)),
        escritos,
        plannedWeeks,
        estimado: t.estimado,
      };
    })
    .filter(Boolean);
};

/**
 * Los borradores, puestos en el calendario: el primero empieza el día después
 * de lo previsto para el abierto (`fechaDelCicloSiguiente`), y cada uno dura
 * sus microciclos de lo que mida su secuencia.
 */
const borradoresEnElCalendario = (program, desde) => {
  let cursor = desde;
  return borradoresDe(program).map((b) => {
    const dias = Math.max(1, diasDelBorrador(b));
    const { intent, plannedWeeks } = blockTraits(b);
    const tramo = {
      id: b.id,
      nombre: b.name || 'Bloque',
      intent,
      tipo: 'borrador',
      desde: cursor,
      hasta: addDays(cursor, dias - 1),
      vuelta: duracionDe(normalizaMicrociclo(b.microciclo)) || 7,
      rotativo: normalizaMicrociclo(b.microciclo)?.tipo === 'rotativo',
      microciclos: plannedWeeks || 1,
      escritos: 0,
      plannedWeeks,
      estimado: false,
    };
    cursor = addDays(tramo.hasta, 1);
    return tramo;
  });
};

/**
 * Todo lo que dibuja el creador, en semanas.
 *
 * @returns `{ lunes, hoy, hoyIdx, hoyFraccion, destino, llegada, fases, cruce,
 *   bloques, hechos, esperado }`:
 *   · `lunes`   la lista de semanas, en orden.
 *   · `fases`   `{ fase, a, b, estado, entrada, real, salida, salidaOriginal,
 *               asa, acortable, color }` con `[a, b)` en semanas.
 *   · `bloques` `{ …, asa }` con `desde`/`hasta` en DÍAS (incluidos).
 *   · `cruce`   `{ fase, a, pregunta, decide, caminos: [{ titulo, direccion,
 *               a, b }] }`.
 *   · `hechos`  `{ evento, i }`.
 *   · `esperado` una lista paralela a `lunes` con lo esperado el jueves.
 */
export const lineaDelCreador = ({
  phases = [],
  anchors = [],
  hechos = [],
  history = [],
  program = null,
  client = null,
  hoy = todayISO(),
} = {}) => {
  const todas = sortPhases(phases).filter((f) => iso(f.startsOn));
  const { tramos } = temporadas(todas, anchors, hoy);
  const temporada = tramos.find((t) => t.enCurso) || null;
  const destino = temporada?.ancla || null;

  /* Las fases que se ven: las de la temporada en curso; sin destino, todas. */
  const fases = temporada ? temporada.fases : todas;

  const bloques = bloquesEnElCalendario(program, client);
  const abierto = bloques.find((b) => b.tipo === 'abierto') || bloques[bloques.length - 1] || null;
  const borradores = borradoresEnElCalendario(program, abierto ? addDays(abierto.hasta, 1) : weekStart(hoy));
  const todosLosBloques = [...bloques, ...borradores];

  /* El cruce: los caminos de la ÚLTIMA fase, si es de las que se ven. */
  const fork = forkState(todas, hoy);
  const caminos =
    fork && fases.some((f) => f.id === fork.phase.id)
      ? fork.options.map((o) => ({ option: o, draft: optionToPhaseDraft(fork.phase, o) })).filter((c) => c.draft)
      : [];

  /* ── El rango ─────────────────────────────────────────────────────────── */
  let desde = iso(temporada?.desde) || iso(fases[0]?.startsOn) || null;
  if (!desde) desde = todosLosBloques[0]?.desde || hoy;
  desde = mayor(menor(desde, hoy), addDays(hoy, -TOPE_ATRAS));
  let hasta = hoy;
  hasta = mayor(hasta, iso(destino?.date));
  for (const f of fases) hasta = mayor(hasta, iso(f.endsOn));
  for (const c of caminos) hasta = mayor(hasta, iso(c.draft.endsOn));
  for (const b of todosLosBloques) if (b.hasta >= desde) hasta = mayor(hasta, b.hasta);

  const lunes0 = weekStart(desde);
  const lunes = [];
  for (let l = lunes0; l <= weekStart(hasta); l = addDays(l, 7)) lunes.push(l);
  const hoyIdx = semanaDe(lunes0, hoy);
  const hoyFraccion = ((daysBetween(weekStart(hoy), hoy) ?? 0) + 1) / 7;

  /* ── Las fases, por el jueves de cada semana ──────────────────────────── */
  const pesos = pesosDeLasFases(fases, history, hoy);
  const porFase = new Map();
  const esperado = lunes.map((l, i) => {
    const jueves = addDays(l, 3);
    const f = phaseAt(fases, jueves);
    if (!f) return null;
    const hueco = porFase.get(f.id);
    if (hueco) hueco.b = i + 1;
    else porFase.set(f.id, { a: i, b: i + 1 });
    const p = pesos[fases.indexOf(f)];
    const v = p?.esperado(jueves);
    return v === null || v === undefined || Number.isNaN(v) ? null : v;
  });

  const lasFases = fases
    .map((fase, k) => {
      const sitio = porFase.get(fase.id);
      if (!sitio) return null;
      const inicio = iso(fase.startsOn);
      const fin = iso(fase.endsOn);
      const estado = fin && fin < hoy ? 'hecha' : inicio <= hoy ? 'actual' : 'futura';
      return {
        fase,
        ...sitio,
        estado,
        ...pesos[k],
        dias: diasDe(fase),
        color: directionById(fase.direction)?.color || null,
        /* Solo se estira lo que tiene final y no ha acabado. */
        asa: Boolean(fin) && estado !== 'hecha',
        acortable: acortableFase(fase, hoy),
      };
    })
    .filter(Boolean);

  const cruce =
    caminos.length > 0
      ? {
          fase: fork.phase,
          pregunta: fork.pregunta,
          decide: fork.decidesOn,
          a: semanaDe(lunes0, addDays(iso(fork.phase.endsOn), 1)),
          caminos: caminos.map(({ option, draft }) => ({
            titulo: draft.title,
            direccion: draft.direction,
            color: directionById(draft.direction)?.color || null,
            semanas: toNum(option?.weeks),
            a: semanaDe(lunes0, draft.startsOn),
            b: semanaDe(lunes0, draft.endsOn) + 1,
          })),
        }
      : null;

  /* ── Los bloques: solo los que tocan el rango ─────────────────────────── */
  const ultimoDia = addDays(lunes[lunes.length - 1], 6);
  const losBloques = todosLosBloques
    .filter((b) => b.hasta >= lunes0 && b.desde <= ultimoDia)
    .map((b) => ({
      ...b,
      descarga: b.intent === 'descarga',
      /* El abierto y los borradores se estiran; lo cerrado es historia. */
      asa: b.tipo !== 'hecho',
      /* Menos no se puede: los microciclos ya escritos existen. */
      minimo: b.tipo === 'abierto' ? Math.max(1, b.escritos) : 1,
    }));

  const losHechos = (hechos || [])
    .filter((e) => HECHO_KINDS.includes(e?.kind) && !e.ancla && iso(e.date))
    .map((e) => ({ evento: e, i: semanaDe(lunes0, iso(e.date)) }))
    .filter((h) => h.i >= 0 && h.i < lunes.length)
    .sort((x, y) => x.i - y.i);

  const destinoDicho = destino
    ? { evento: destino, fecha: iso(destino.date), i: semanaDe(lunes0, iso(destino.date)) }
    : null;

  return {
    lunes,
    hoy,
    hoyIdx,
    hoyFraccion,
    destino: destinoDicho,
    /* Cómo acaban las fases (y los caminos del cruce) contra el destino. */
    llegada: temporada?.llegada || null,
    fases: lasFases,
    cruce,
    bloques: losBloques,
    hechos: losHechos,
    esperado,
  };
};

/**
 * Lo que dice el globo de una semana: su fase, sus bloques con el microciclo
 * que cae en ella, sus hechos, el destino y lo esperado. Solo datos.
 */
export const loQueDiceLaSemana = (linea, i) => {
  const l = linea?.lunes?.[i];
  if (!l) return null;
  const jueves = addDays(l, 3);
  const domingo = addDays(l, 6);
  const fase = linea.fases.find((f) => i >= f.a && i < f.b) || null;
  const enCruce = linea.cruce && i >= linea.cruce.a ? linea.cruce.caminos.filter((c) => i >= c.a && i < c.b) : [];
  const bloques = linea.bloques
    .filter((b) => b.desde <= domingo && b.hasta >= l)
    .map((b) => ({
      bloque: b,
      micro: microciclosDeLaSemana({ desde: b.desde, vuelta: b.vuelta, total: b.microciclos }, l),
    }));
  return {
    lunes: l,
    domingo,
    esHoy: i === linea.hoyIdx,
    fase: fase ? { ...fase, n: i - fase.a + 1, total: fase.b - fase.a } : null,
    cruce: enCruce,
    bloques,
    hechos: linea.hechos.filter((h) => h.i === i).map((h) => h.evento),
    destino: linea.destino && linea.destino.i === i ? linea.destino : null,
    esperado: linea.esperado[i] ?? null,
    jueves,
  };
};

/** «M3», «M3–M4». */
export const microTexto = (micro) =>
  !micro ? '' : micro.primero === micro.ultimo ? `M${micro.primero}` : `M${micro.primero}–M${micro.ultimo}`;

/**
 * Cómo llega el plan al destino, corto, para la cabecera: «Los dos caminos
 * llegan», «Quedan 13 días sin plan», «Definición se pasa 3 días». Solo el
 * dato; qué hacer con él lo decide el entrenador.
 */
export const llegadaCorta = (llegada, caminos = []) => {
  if (!llegada) return null;
  const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
  if (llegada.caminos?.length > 0) {
    const titulo = (i) => caminos[i]?.titulo || `El camino ${i + 1}`;
    if (llegada.caminos.every((c) => c.estado === 'llega')) {
      return llegada.caminos.length === 2 ? 'Los dos caminos llegan' : 'Todos los caminos llegan';
    }
    return llegada.caminos
      .map((c, i) =>
        c.estado === 'llega'
          ? `${titulo(i)} llega`
          : c.estado === 'hueco'
            ? `${titulo(i)} deja ${dias(c.dias)} sin plan`
            : c.estado === 'exceso'
              ? `${titulo(i)} se pasa ${dias(c.dias)}`
              : null
      )
      .filter(Boolean)
      .join(' · ');
  }
  switch (llegada.estado) {
    case 'llega':
      return 'Las fases llegan justo';
    case 'hueco':
      return `Quedan ${dias(llegada.dias)} sin plan`;
    case 'exceso':
      return `La última fase se pasa ${dias(llegada.dias)}`;
    case 'abierta':
      return 'La última fase no tiene final';
    default:
      return 'Todavía no hay fases hacia él';
  }
};
