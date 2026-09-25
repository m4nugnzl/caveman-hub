/**
 * LAS SEMANAS DEL PLAN: el roadmap semana a semana.
 *
 * ══ Qué es ═════════════════════════════════════════════════════════════════
 *
 * Una fila por SEMANA NATURAL (el lunes) en el rango de la temporada en curso,
 * pasadas y futuras. Es lo que dibujan la portada de semanas de Revisiones
 * (`review/PortadaDeSemanas`) y la línea del roadmap del cliente
 * (`review/TimelineSpine`): las dos leen las mismas filas.
 *
 * No es un dato nuevo: es una vista derivada. Cada columna sale de donde ya
 * vivía (`docs/roadmap-replanteo.md` §6):
 *
 *   · Fase      `phaseAt(jueves)`.
 *   · Peso      la media de la semana (`buildWeeklySeries`) y sus pesajes.
 *   · Esperado  `expectativasDelPlan`, el tramo vigente; y el fantasma original
 *               desde el primer replanteo. Las fases futuras, encadenadas.
 *   · Dieta     `nutritionTrack`, la misma fuente que la Revisión y el Resumen.
 *               Las semanas futuras van vacías: el plan de hoy no se proyecta.
 *   · Bloque    `tramosDeLosBloques`: la fecha de sus microciclos, NUNCA
 *               `weekStartOfProgramWeek`.
 *   · Hechos    los eventos `race`, `rest`, `refeed` y `diet_break` que tocan
 *               la semana, con su duración (`hasta`, 0123).
 *
 * ══ Por qué semana NATURAL ═════════════════════════════════════════════════
 *
 * Porque la semana de programa llega al calendario por
 * `weekStartOfProgramWeek`, que en la demo se desvía entre 3 y 21 semanas. Por
 * eso esto no se construye con `reviewTimeline`.
 *
 * ══ Lo que NO hace ═════════════════════════════════════════════════════════
 *
 * No destaca ninguna semana, no marca «llevas tres semanas por encima» y no
 * colorea la desviación. El sistema enseña la desviación; no sugiere
 * replanteos, no reajusta solo, no avisa.
 */

import { addDays, daysBetween, shortDate, todayISO, toISODate, weekStart } from '@/lib/dates';
import { round, toNum } from '@/lib/num';
import { buildWeeklySeries } from './analytics';
import { blockTraits, intentLabel, tramosDeLosBloques } from './blocks';
import { forkState, optionToPhaseDraft } from './fork';
import { directionById, targetRateKg } from './goals';
import {
  cuentaAtras,
  esperadoEn,
  esperadoOriginalEn,
  expectativaDeFase,
  expectativasDelPlan,
  phaseAt,
  replanteosDe,
  sortPhases,
  temporadas,
  validarReplanteo,
  valorDelTramo,
} from './roadmap';
import { nutritionTrack } from './timeline';

/** Los tipos de evento que son HECHOS del plan. El destino va aparte. */
export const HECHO_KINDS = ['race', 'rest', 'refeed', 'diet_break', 'illness'];

/** Cuántos días puede tener el último pesaje para que la media sea «de ahora». */
export const PESAJE_RECIENTE = 7;

/** Hasta dónde se mira hacia atrás sin destino: dos años. */
const TOPE_ATRAS = 7 * 104;
/** Sin fases, la historia que se enseña: las últimas dieciséis semanas. */
const SIN_FASES_ATRAS = 7 * 15;

const iso = (v) => toISODate(v);
const menor = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const mayor = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/** Cuántas semanas hay entre dos lunes, contando las dos. */
const semanasEntre = (a, b) => Math.floor((daysBetween(a, b) ?? 0) / 7) + 1;

/**
 * El rango del plan: de qué lunes a qué lunes.
 *
 * La temporada en curso, desde el inicio de su primera fase hasta su destino
 * (§4). Sin destino, desde la primera fase hasta el final de la última, o hasta
 * hoy si la última está abierta. Sin fases, las últimas semanas con pesajes. En
 * todos los casos, hoy dentro, y el final del cruce si lo hay.
 */
const rangoDelPlan = ({ fases, temporada, cruce, history, hoy, desdeMinimo = null }) => {
  let desde = null;
  let hasta = null;

  if (temporada) {
    desde = temporada.desde;
    hasta = temporada.hasta;
  } else if (fases.length > 0) {
    desde = iso(fases[0].startsOn);
    for (const f of fases) hasta = mayor(hasta, iso(f.endsOn) || hoy);
  } else {
    const fechas = (history || []).map((h) => iso(h?.date)).filter(Boolean).sort();
    desde = mayor(fechas[0] || hoy, addDays(hoy, -SIN_FASES_ATRAS));
    hasta = hoy;
  }

  for (const c of cruce?.caminos || []) hasta = mayor(hasta, c.fin);
  /* La revisión pide desde su primera semana, aunque sea de antes de la
     temporada: la espina es el selector de todas. */
  desde = menor(desde, iso(desdeMinimo));
  desde = mayor(menor(desde, hoy), addDays(hoy, -TOPE_ATRAS));
  hasta = mayor(hasta, hoy);
  return { desde: weekStart(desde), hasta: weekStart(hasta) };
};

/**
 * El cruce de la última fase, medido: dónde empieza y acaba cada camino, qué
 * peso se espera al final y cómo llega al destino. Es dibujar un dato, no
 * recomendar ninguno.
 */
const cruceMedido = ({ fases, expectativas, history, hoy, temporada }) => {
  const estado = forkState(fases, hoy);
  if (!estado) return null;
  const fase = estado.phase;
  const exp = expectativas.get(fase.id) || expectativaDeFase(fase, history);
  const dia = addDays(iso(fase.endsOn), 1);
  const pesoFin = exp ? esperadoEn(exp, dia) : null;
  const llegadas = temporada?.llegada?.caminos || [];

  const caminos = estado.options
    .map((option, i) => {
      const draft = optionToPhaseDraft(fase, option);
      if (!draft) return null;
      const semanas = semanasEntre(draft.startsOn, weekStart(draft.endsOn));
      const ritmo = targetRateKg({ direction: draft.direction, ratePct: draft.ratePct }, pesoFin);
      const llegada = llegadas.find((l) => l.option === option) || null;
      return {
        indice: i,
        titulo: draft.title,
        direccion: draft.direction,
        ratePct: draft.ratePct,
        semanas: toNum(option?.weeks) ?? semanas,
        cuando: String(option?.when || '').trim(),
        ini: draft.startsOn,
        fin: draft.endsOn,
        pesoFin: pesoFin === null || ritmo === null ? null : pesoFin + ritmo * (toNum(option?.weeks) ?? semanas),
        llegada: llegada ? { estado: llegada.estado, dias: llegada.dias } : null,
      };
    })
    .filter(Boolean);

  return {
    fase,
    decide: iso(fase.endsOn),
    /* Los días hasta decidir, y la pregunta que se decide (0125). */
    dias: estado.daysLeft,
    pregunta: estado.pregunta,
    pesoInicio: pesoFin,
    caminos,
  };
};

/**
 * Lo que dice la cabecera de una fase en el libro: su objetivo (original y
 * vigente si se igualó), lo real hasta hoy y cuántos cambios de pauta hubo.
 */
const resumenDeFase = (fase, exp, filas) => {
  const fin = iso(fase.endsOn);
  const diaFinal = fin ? addDays(fin, 1) : null;
  const replanteos = replanteosDe(fase);
  const ultimo = exp?.tramos[exp.tramos.length - 1] || null;
  const conMedia = filas.filter((s) => s.media !== null);
  const primera = conMedia[0] || null;
  const ultima = conMedia[conMedia.length - 1] || null;
  /* El tipo de actividad del cardio, una vez por fase: en la celda va solo
     la dosis («3×35′»). */
  const actividades = [...new Set(filas.map((s) => cardioActividad(s.pauta?.cardio)).filter(Boolean))];

  return {
    fase,
    semanas: filas.length,
    objetivoOriginal:
      exp && diaFinal ? { ratePct: exp.original.ratePct, peso: valorDelTramo(exp.original, diaFinal), fecha: fin } : null,
    vigente:
      exp && diaFinal && replanteos.length > 0
        ? {
            ratePct: ultimo.ratePct,
            desde: ultimo.replanteo.semana,
            peso: valorDelTramo(ultimo, diaFinal),
            fecha: fin,
          }
        : null,
    real: conMedia.length > 1 ? ultima.media - primera.media : null,
    /* Lo que se esperaba en ese mismo tramo, contra la recta vigente: real
       contra esperado se leen juntos en la cabecera. */
    esperado:
      conMedia.length > 1 && primera.esperado !== null && ultima.esperado !== null
        ? ultima.esperado - primera.esperado
        : null,
    cardio: actividades.join(', ') || null,
    cambiosDePauta: filas.filter((s) => s.cambios.length > 0).length,
  };
};

/**
 * @param phases   las fases del cliente.
 * @param anchors  sus destinos (`client_events.ancla`).
 * @param hechos   los eventos que son hechos (`HECHO_KINDS`).
 * @param history  `anthropometry.history`.
 * @param program  su programa, para los bloques.
 * @param client   la ficha: el tipo de ciclo y el alta, para los bloques.
 * @param reviews  las revisiones cerradas, con su foto del plan.
 * @param versions la pauta fechada, `[{ dia, snapshot }]`.
 * @param plan     la foto del plan de hoy.
 * @param desde    el primer lunes que tiene que salir aunque caiga antes de la
 *                 temporada (la primera semana de la revisión).
 * @returns `{ semanas, grupos, rango, temporada, destino, cruce, hoy }`.
 */
export const semanasDelPlan = ({
  phases = [],
  anchors = [],
  hechos = [],
  history = [],
  program = null,
  client = null,
  reviews = [],
  versions = [],
  plan = null,
  desde = null,
  hoy = todayISO(),
} = {}) => {
  const fases = sortPhases(phases);
  const { tramos } = temporadas(fases, anchors, hoy);
  const temporada = tramos.find((t) => t.enCurso) || null;
  const destino = temporada?.ancla || null;

  const expectativas = expectativasDelPlan(fases, history, hoy);

  const cruce = cruceMedido({ fases, expectativas, history, hoy, temporada });
  const rango = rangoDelPlan({ fases, temporada, cruce, history, hoy, desdeMinimo: desde });

  const lunes = [];
  for (let l = rango.desde; l && l <= rango.hasta; l = addDays(l, 7)) lunes.push(l);

  /* El peso: la media de la serie de siempre y los pesajes de cada semana. */
  const medias = new Map(buildWeeklySeries({ history }).map((f) => [f.week, toNum(f.weight)]));
  const pesajes = new Map();
  for (const h of history || []) {
    const dia = iso(h?.date);
    const peso = toNum(h?.weight);
    if (!dia || peso === null || dia > hoy) continue;
    const l = weekStart(dia);
    if (!pesajes.has(l)) pesajes.set(l, []);
    pesajes.get(l).push({ date: dia, weight: peso });
  }

  const dieta = nutritionTrack({
    rows: lunes.map((l) => ({ weekStart: l })),
    reviews,
    plan,
    versions,
    hoy,
    cortarEnHoy: true,
  });

  const bloques = tramosDeLosBloques(program, {
    cycleType: client?.cycleType,
    cyclePattern: client?.cyclePattern,
    startDate: client?.startDate,
  });
  const revisiones = new Map((reviews || []).filter((r) => r?.weekStart).map((r) => [String(r.weekStart), r]));
  const suyos = (hechos || []).filter((e) => HECHO_KINDS.includes(e?.kind) && !e.ancla && iso(e.date));

  let bloqueAnterior = null;
  const semanas = lunes.map((l, i) => {
    const jueves = addDays(l, 3);
    const domingo = addDays(l, 6);
    const estado = domingo < hoy ? 'pasada' : l <= hoy ? 'hoy' : 'futura';
    const fase = phaseAt(fases, jueves);
    const exp = fase ? expectativas.get(fase.id) : null;
    const inicioFase = fase ? weekStart(fase.startsOn) : null;
    const finFase = fase?.endsOn ? weekStart(fase.endsOn) : null;

    /* El bloque de una semana es el que cubre su JUEVES, como la fase: los
       microciclos pueden empezar en domingo, y con «toca la semana» la de
       antes se llevaba el bloque por un día. */
    const tb = bloques.find((t) => t.desde <= jueves && (t.previstoHasta || t.hasta) >= jueves) || null;
    const bloque = tb
      ? {
          id: tb.bloque.id,
          nombre: tb.bloque.name,
          intencion: intentLabel(blockTraits(tb.bloque).intent) || null,
          semana: semanasEntre(weekStart(tb.desde), l),
          total: semanasEntre(weekStart(tb.desde), weekStart(tb.previstoHasta || tb.hasta)),
          cambia: bloqueAnterior !== tb.bloque.id,
          previsto: l > tb.hasta,
          estimado: tb.estimado,
        }
      : null;
    /* Una semana sin bloque detrás de uno: el bloque acabó (o acaba lo
       previsto) y no hay otro montado. Se dice, no se deja en blanco. */
    const finDeBloque = !tb && bloqueAnterior !== null;
    bloqueAnterior = tb ? tb.bloque.id : null;

    const media = estado === 'futura' ? null : medias.get(l) ?? null;
    const esperado = exp ? esperadoEn(exp, jueves) : null;
    const original = exp ? esperadoOriginalEn(exp, jueves) : null;
    const replanteo = fase ? replanteosDe(fase).find((r) => r.semana === l) || null : null;

    const d = dieta[i];
    const hayPauta = d && (d.kcals !== null || d.steps !== null || d.cardio);

    return {
      lunes: l,
      jueves,
      domingo,
      estado,
      fase,
      semanaFase: fase ? semanasEntre(inicioFase, l) : null,
      totalFase: finFase ? semanasEntre(inicioFase, finFase) : null,
      /* Un tramo sin fase dentro del cruce: se lee como sus caminos, no como un
         hueco. */
      enCruce: !fase && Boolean(cruce && l > cruce.decide),
      bloque,
      finDeBloque,
      pesajes: (pesajes.get(l) || []).sort((a, b) => a.date.localeCompare(b.date)),
      media,
      esperado,
      original,
      desvio: media !== null && esperado !== null ? media - esperado : null,
      desvioOriginal: media !== null && original !== null ? media - original : null,
      replanteo,
      /* Si se le puede ofrecer «Igualar aquí»: pasada o en curso, con media y
         dentro de una fase. Es una posibilidad, no una sugerencia: la pantalla
         solo la enseña en el detalle de una semana que el entrenador abrió. */
      igualable:
        media !== null && fase !== null && !validarReplanteo(fase, { semana: l, pesoBase: media, ratePct: 0 }, hoy),
      pauta: hayPauta
        ? {
            kcals: d.kcals,
            protein: d.protein,
            carbs: d.carbs,
            fats: d.fats,
            steps: d.steps,
            cardio: d.cardio,
            de: d.de,
            /* Por tipo de día («alta», «baja»), con los nombres del
               entrenador. Con casillas, también se sabe qué día tocaba cada
               fecha (`pautaDelDia`). */
            tipos: d.tipos,
            /* La dieta tenía varios días, pero esta semana solo guarda su
               media (fotos anteriores a las versiones fechadas). */
            soloMedia: d.de === 'media' && !d.tipos?.length,
          }
        : null,
      cambios: hayPauta ? d.cambios : [],
      cambioEl: hayPauta ? d.cambioEl : null,
      aprox: hayPauta ? d.aprox : null,
      hechos: suyos.filter((e) => iso(e.date) <= domingo && (iso(e.hasta) || iso(e.date)) >= l),
      revision: revisiones.get(l) || null,
    };
  });

  /* Los grupos del libro: tramos seguidos con la misma fase, o sin ninguna. Las
     semanas del cruce no hacen grupo: el cruce tiene el suyo, con sus caminos. */
  const grupos = [];
  for (const s of semanas) {
    if (s.enCruce) continue;
    const clave = s.fase ? s.fase.id : null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.semanas.push(s);
    else grupos.push({ clave, fase: s.fase, semanas: [s] });
  }
  for (const g of grupos) {
    g.desde = g.semanas[0].lunes;
    g.hasta = g.semanas[g.semanas.length - 1].domingo;
    g.resumen = g.fase ? resumenDeFase(g.fase, expectativas.get(g.fase.id), g.semanas) : null;
  }

  /* El último pesaje, sea de la semana que sea: la cabecera no puede enseñar
     una media vieja con aspecto de actual. */
  const ultimoPesaje =
    (history || [])
      .map((h) => (toNum(h?.weight) === null ? null : iso(h?.date)))
      .filter((d) => d && d <= hoy)
      .sort()
      .pop() || null;

  return {
    semanas,
    grupos,
    rango,
    temporada,
    destino,
    cruce,
    expectativas,
    hoy,
    hayBloques: bloques.length > 0,
    ultimoPesaje,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   LA SITUACIÓN: lo que dice la cabecera, en piezas
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Las piezas de la cabecera del roadmap. Cortas y separadas: dónde está, a
 * dónde va y qué se decide. Nada de frases largas.
 *
 * @returns `{ ahora, destino, cruce }`, cada una `null` si no aplica.
 */
export const situacionDelPlan = (plan) => {
  const { semanas = [], destino, cruce, hoy, ultimoPesaje = null } = plan || {};
  const actual = semanas.find((s) => s.estado === 'hoy') || null;
  /* La media de esta semana, o la de la última que la tenga: el lunes no
     puede dejar la cabecera sin peso. */
  const conMedia = [...semanas].reverse().find((s) => s.estado !== 'futura' && s.media !== null) || null;

  const ahora = actual
    ? {
        fase: actual.fase,
        semana: actual.semanaFase,
        total: actual.totalFase,
        media: conMedia?.media ?? null,
        esperado: conMedia?.esperado ?? null,
        desvio: conMedia?.desvio ?? null,
        deEstaSemana: conMedia === actual,
        lunesDeLaMedia: conMedia?.lunes ?? null,
        /* Reciente = pesado en los últimos siete días. Si no, la cabecera dice
           «Sin pesajes desde…» antes que ninguna cifra. */
        ultimoPesaje,
        reciente: Boolean(ultimoPesaje && (daysBetween(ultimoPesaje, hoy) ?? 99) <= PESAJE_RECIENTE),
      }
    : null;

  return {
    ahora,
    destino: destino
      ? { titulo: destino.title, fecha: iso(destino.date), cuenta: cuentaAtras(destino, hoy), kind: destino.kind }
      : null,
    cruce: cruce
      ? {
          decide: cruce.decide,
          dias: cruce.dias ?? null,
          pregunta: cruce.pregunta || '',
          caminos: cruce.caminos.map((c) => ({ titulo: c.titulo, direccion: c.direccion, llegada: c.llegada })),
        }
      : null,
  };
};

/** «−0,6 %/sem», «+0,25 %/sem» o «mantener». */
export const ritmoTexto = (direccion, ratePct) => {
  const meta = directionById(direccion);
  if (!meta) return '';
  if (meta.sign === 0) return 'mantener';
  return `${meta.sign < 0 ? '−' : '+'}${String(round(ratePct, 2)).replace('.', ',')} %/sem`;
};

/** «Transición llega», «deja 6 días sin plan», «se pasa 3 días». Sin el título. */
export const llegadaTexto = (llegada) => {
  if (!llegada) return null;
  const n = (d) => `${d} ${d === 1 ? 'día' : 'días'}`;
  if (llegada.estado === 'llega') return 'llega';
  if (llegada.estado === 'hueco') return `deja ${n(llegada.dias)} sin plan`;
  if (llegada.estado === 'exceso') return `se pasa ${n(llegada.dias)}`;
  return null;
};

/** «2–8 nov» o «8 nov». */
export const tramoDeFechas = (desde, hasta) =>
  !hasta || hasta === desde ? shortDate(desde) : `${shortDate(desde)} – ${shortDate(hasta)}`;


/* ══════════════════════════════════════════════════════════════════════════
   EL CARDIO, EN DOS MITADES
   ══════════════════════════════════════════════════════════════════════════
   `cardio_goal` es texto libre: «2 × 20′», «3x35 min elíptica», «30′ bici».
   En la celda del libro va solo la DOSIS, corta y a plomo con las demás
   («3×35′»); la actividad se dice una vez, en la cabecera de la fase o en el
   detalle de la semana. Lo que no se reconoce se enseña entero: mejor largo
   que inventado. */

const DOSIS = /(\d+)\s*[×x*]\s*(\d+)\s*(?:′|'|’|min(?:utos)?\.?)?/i;
const SOLO_MINUTOS = /(\d+)\s*(?:′|'|’|min(?:utos)?\.?)/i;

/** «3×35′», «30′», o el texto tal cual si no se reconoce. `null` sin cardio. */
export const cardioCorto = (texto) => {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const m = t.match(DOSIS);
  if (m) return `${m[1]}×${m[2]}′`;
  const n = t.match(SOLO_MINUTOS);
  if (n) return `${n[1]}′`;
  return t;
};

/** Las sesiones de la semana: el 3 de «3×35′». `null` si el texto no lo dice. */
export const cardioSesiones = (texto) => {
  const m = String(texto ?? '').match(DOSIS);
  const n = m ? Number(m[1]) : null;
  return n && n > 0 && n <= 14 ? n : null;
};

/** «elíptica» de «3×35′ elíptica». `null` si solo hay dosis o no se reconoce. */
export const cardioActividad = (texto) => {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const m = t.match(DOSIS) || t.match(SOLO_MINUTOS);
  if (!m) return null;
  const resto = t
    .replace(m[0], ' ')
    .replace(/^[\s·,;:\-–—]+|[\s·,;:\-–—]+$/g, '')
    .replace(/^de\s+/i, '')
    .trim();
  return resto || null;
};
