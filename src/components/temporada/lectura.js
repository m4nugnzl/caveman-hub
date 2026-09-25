import { kindMeta, WEEKDAYS } from '@/domain/calendar';
import { directionById } from '@/domain/goals';
import { esIntervencion, gPorKg, intervencionesEntre, kcalsDeIntervencion } from '@/domain/pautaDelDia';
import { replanteoVigente } from '@/domain/roadmap';
import { cardioCorto, ritmoTexto, situacionDelPlan } from '@/domain/semanasDelPlan';
import { daysBetween, localeNumber, miles, shortDate } from '@/lib/dates';

/**
 * LO QUE SE LEE DE LA TEMPORADA, en palabras (24 sep 2026).
 *
 * La gráfica dibuja; el detalle se lee aquí. Tres sitios lo piden:
 *
 *   · La CABECERA: a dónde va y cómo va (`cabeceraDelPlan`).
 *   · La LÍNEA DE LECTURA, bajo la cabecera: lo de la columna que hay bajo el
 *     cursor —una semana en Temporada, un día en Rango— o, sin cursor, el
 *     resumen de lo que se ve o del rango elegido.
 *   · Las HOJAS de una semana o un día, que reutilizan estas piezas.
 *
 * Sin colores de juicio ni frases: cifras, en el orden en que se lee la
 * gráfica de arriba abajo (peso, pauta, entreno, revisión).
 *
 * Cada lectura es `{ titulo, piezas }`: el titular en negrita y lo demás
 * separado por puntos.
 */

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
/** «2.450», con el punto de los miles siempre. */
export const entero = (v) => miles(Math.round(v));
/** «78,2». */
export const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const g1 = (v) => (v === null ? '–' : localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
/** «−0,4», «+0,2», «±0,0»: el signo de lo que se ve, ya redondeado. */
export const conSigno = (v, formato = kg) => {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${formato(Math.abs(r))}`;
};
/** «−0,5 %/sem», con dos decimales como mucho. */
export const pctSemana = (v) => {
  const r = Math.round(v * 100) / 100;
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${localeNumber(Math.abs(r), { maximumFractionDigits: 2 })} %/sem`;
};

/** «Sáb 12 sep». */
export const diaTexto = (fecha) => `${WEEKDAYS[(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7]} ${shortDate(fecha)}`;

/** «2.900 kcal» o, si la semana pide varias cifras, «2.600–2.900 kcal». */
const cifras = (valores, unidad) => {
  const vs = [...new Set(valores.filter(esNumero))].sort((a, b) => a - b);
  if (vs.length === 0) return null;
  return vs.length === 1 ? `${entero(vs[0])} ${unidad}` : `${entero(vs[0])}–${entero(vs[vs.length - 1])} ${unidad}`;
};

/** El ritmo que manda en una fase en un día: el del último replanteo, o el suyo. */
export const ritmoDeFase = (fase, dia) => {
  const vigente = replanteoVigente(fase, dia);
  return ritmoTexto(fase.direction, vigente ? vigente.ratePct : fase.ratePct);
};

/** El nombre de una fase: su título o el de su dirección. */
export const nombreDeFase = (fase) => fase?.title || directionById(fase?.direction)?.label || 'Fase';

/** «Vacaciones · Ibiza»: el tipo y, si lo tiene, su título. */
export const nombreDeHecho = (h) => {
  const tipo = kindMeta(h.kind).label;
  const suyo = String(h.title || '').trim();
  return suyo && suyo !== tipo ? suyo : tipo;
};

/**
 * El nombre de una intervención (`domain/intervenciones.js`): el del refeed o
 * el diet break, «Cambio de dieta» o el del bloque nuevo.
 */
export const nombreDeIntervencion = (x) =>
  x.evento ? nombreDeHecho(x.evento) : x.tipo === 'dieta' ? 'Cambio de dieta' : x.bloque?.nombre || 'Bloque nuevo';

/** Su nombre corto, el de la marca en la ruta: «Refeed», «Dieta», «Bloque». */
export const nombreCortoDeIntervencion = (x) =>
  x.evento ? kindMeta(x.evento.kind).label : x.tipo === 'dieta' ? 'Dieta' : 'Bloque';

/** «3.000 → 3.300 → 3.600»: las kcal de un refeed o diet break, escalón a escalón. */
export const kcalsTexto = (evento) => {
  const kcals = kcalsDeIntervencion(evento);
  return kcals.length ? kcals.map(entero).join(' → ') : null;
};

/** «refeed 3.400»: los refeeds y diet breaks de unas fechas, con sus kcal. */
const intervencionesTexto = (eventos) => eventos.map((e) => [kindMeta(e.kind).label.toLowerCase(), kcalsTexto(e)].filter(Boolean).join(' '));

/** Lo que dice el estado de la revisión de una semana. Las futuras, nada. */
const REVISION = {
  revisada: 'revisión ✓',
  pendiente: 'por revisar',
  curso: 'en curso',
  sin: 'sin check-in',
};

/** Las macros de un día o de un tipo de día: «P 180 C 450 G 53 (2,3 · 5,7 · 0,7 g/kg)». */
export const macrosTexto = (x, peso = null) => {
  if (![x?.protein, x?.carbs, x?.fats].some(esNumero)) return null;
  const g = `P ${entero(x.protein ?? 0)} C ${entero(x.carbs ?? 0)} G ${entero(x.fats ?? 0)}`;
  if (!peso) return `${g} g`;
  return `${g} (${[gPorKg(x.protein, peso), gPorKg(x.carbs, peso), gPorKg(x.fats, peso)].map(g1).join(' · ')} g/kg)`;
};

/** Lo planificado de una fecha que aún no ha llegado: su fase, su ritmo y lo esperado. */
const loPlanificado = (semana, hoy) => {
  if (!semana?.fase) return ['Sin fase'];
  return [`${nombreDeFase(semana.fase)} ${ritmoDeFase(semana.fase, hoy)}`.trim(), esNumero(semana.esperado) ? `esperado ${kg(semana.esperado)}` : null];
};

/**
 * LA LECTURA DE UNA SEMANA (Temporada).
 *
 * Vivida: «S13 · 7 sep · 78,2 kg (−0,4) · esperado 78,3 · 2.450 kcal +
 * refeed 3.400 · 12.500 pasos · cardio 3×35′ · 4/4 entrenos · revisión ✓».
 * Por venir: su fase, su ritmo, lo esperado y lo que haya apuntado.
 *
 * @param anterior la semana de antes, para el cambio del peso.
 * @param tipos    `tiposDeLaSemana` de esta semana.
 * @param intervenciones los refeeds y diet breaks del cliente.
 * @param entreno  `entrenoDeLasSemanas().get(lunes)`, o `null` sin entreno.
 */
export const lecturaDeSemana = ({ semana: s, anterior = null, tipos = [], intervenciones = [], entreno = null, hoy }) => {
  const titulo = s.numero ? `S${s.numero} · ${shortDate(s.lunes)}` : `Semana del ${shortDate(s.lunes)}`;
  const eventos = intervencionesEntre(intervenciones, s.lunes, s.domingo);
  const hechos = (s.hechos || []).filter((h) => !esIntervencion(h)).map(nombreDeHecho);

  if (s.estado === 'futura') {
    const pedidos = entreno?.pedidos;
    return {
      titulo,
      piezas: [
        ...loPlanificado(s, hoy),
        ...intervencionesTexto(eventos),
        ...hechos,
        esNumero(pedidos) && pedidos > 0 ? `${pedidos} entrenos previstos` : null,
      ].filter(Boolean),
    };
  }

  const peso = esNumero(s.media)
    ? `${kg(s.media)} kg${esNumero(anterior?.media) ? ` (${conSigno(s.media - anterior.media)})` : ''}`
    : 'sin pesajes';
  const p = s.pauta;
  let kcal = null;
  if (p) {
    kcal = p.soloMedia || tipos.length === 0 ? (esNumero(p.kcals) ? `${p.soloMedia ? '≈ ' : ''}${entero(p.kcals)} kcal` : null) : cifras(tipos.map((t) => t.kcals), 'kcal');
  }
  const extra = intervencionesTexto(eventos);
  if (kcal && extra.length) kcal = `${kcal} + ${extra.join(' + ')}`;
  const pasos = p ? (tipos.length ? cifras(tipos.map((t) => t.steps), 'pasos') : esNumero(p.steps) ? `${entero(p.steps)} pasos` : null) : null;
  const cardio = cardioCorto(p?.cardio);
  let entrenos = null;
  if (entreno) {
    if (esNumero(entreno.pedidos)) entrenos = `${entreno.hechas}/${entreno.pedidos} entrenos`;
    else if (entreno.hechas > 0) entrenos = `${entreno.hechas} entrenos`;
  }

  return {
    titulo,
    piezas: [
      peso,
      esNumero(s.esperado) ? `esperado ${kg(s.esperado)}` : null,
      kcal ?? (extra.length ? extra.join(' + ') : null),
      pasos,
      cardio ? `cardio ${cardio}` : null,
      entrenos,
      ...hechos,
      REVISION[s.revision5] ?? null,
    ].filter(Boolean),
  };
};

/**
 * La sesión de un día, con su estado: «Push B hecha», «Torso pendiente»,
 * «Pierna prevista». `null` si ese día no pedía ni se hizo nada.
 *
 * @param dia uno de `entrenoDeLasSemanas().get(lunes).dias`.
 */
export const sesionDelDia = (dia, hoy) => {
  if (!dia) return null;
  if (dia.hechas?.length) return `${dia.hechas.map((x) => x.dayName || 'Entreno').join(' + ')} hecha`;
  if (!dia.pedida) return null;
  return `${dia.pedida} ${dia.fecha > hoy ? 'prevista' : 'pendiente'}`;
};

/**
 * LA LECTURA DE UN DÍA (Rango).
 *
 * «Sáb 12 sep · 78,3 kg · refeed 3.400 kcal · P 180 C 450 G 53 (2,3 · 5,7 ·
 * 0,7 g/kg) · 12.500 pasos · Push B pendiente». Un día que aún no tiene pauta
 * dice lo planificado: su fase, su ritmo, lo esperado y sus hechos.
 *
 * @param pauta   el día de `pautaDeLosDias`, o `null` si su semana no tiene.
 * @param semana  la fila del plan de su semana.
 * @param entreno el día de `entrenoDeLasSemanas`, o `null`.
 * @param peso    el peso con el que se cuentan los g/kg.
 * @param tendencia la media móvil de 7 días de ese día, o `null`.
 */
export const lecturaDelDia = ({ fecha, pauta = null, semana = null, entreno = null, peso = null, tendencia = null, hoy }) => {
  const titulo = diaTexto(fecha);
  const hechos = (semana?.hechos || [])
    .filter((h) => !esIntervencion(h) && h.date <= fecha && (h.hasta || h.date) >= fecha)
    .map(nombreDeHecho);
  const sesion = sesionDelDia(entreno, hoy);
  const pesaje = (semana?.pesajes || []).find((p) => p.date === fecha);
  const pesos = [pesaje ? `${kg(pesaje.weight)} kg` : null, esNumero(tendencia) ? `tendencia ${kg(tendencia)}` : null];

  if (!pauta || (!esNumero(pauta.kcals) && !esNumero(pauta.steps))) {
    return {
      titulo,
      piezas: [...pesos, ...(fecha > hoy ? loPlanificado(semana, hoy) : ['sin pauta']), ...hechos, sesion].filter(Boolean),
    };
  }

  const i = pauta.intervencion;
  const kcal = esNumero(pauta.kcals)
    ? i
      ? `${kindMeta(i.kind).label.toLowerCase()} ${entero(pauta.kcals)} kcal`
      : `${pauta.tipo ? `${pauta.tipo} ` : ''}${pauta.exacto ? '' : '≈ '}${entero(pauta.kcals)} kcal`
    : i
      ? kindMeta(i.kind).label.toLowerCase()
      : null;

  return {
    titulo,
    piezas: [
      ...pesos,
      kcal,
      pauta.exacto ? macrosTexto(pauta, pesaje?.weight ?? peso) : null,
      esNumero(pauta.steps) ? `${entero(pauta.steps)} pasos` : null,
      ...hechos,
      sesion,
    ].filter(Boolean),
  };
};

/**
 * El ritmo real de una fase hasta hoy: de su primera a su última media, en %
 * de peso por semana. `null` con menos de dos semanas pesadas.
 */
export const ritmoRealDeFase = (semanas, fase) => {
  const suyas = semanas.filter((s) => s.fase?.id === fase?.id && s.estado !== 'futura' && esNumero(s.media));
  if (suyas.length < 2) return null;
  const [a, b] = [suyas[0], suyas[suyas.length - 1]];
  const n = (daysBetween(a.lunes, b.lunes) ?? 0) / 7;
  return n > 0 ? ((b.media - a.media) / a.media / n) * 100 : null;
};

/**
 * LA CABECERA: dónde va y cómo va.
 *
 * A la izquierda, el destino con su fecha y su peso objetivo («Autonómico»,
 * «el 16 ene a 74 kg»); sin destino, la fase en curso y en qué semana va. A
 * la derecha, tres cifras con una etiqueta de una palabra debajo: «Faltan»,
 * «Peso» (la media de la última semana pesada) y «Ritmo» (el real de la
 * fase). Lo que precisa cada una, al pasar por encima (`title`).
 *
 * @returns `{ titulo, detalle: [], cifras: [{ valor, dice, title }] }`.
 */
export const cabeceraDelPlan = ({ plan, objetivoKg = null }) => {
  const { ahora, destino, cruce } = situacionDelPlan(plan);
  const hoy = plan.hoy;
  const fase = ahora?.fase || null;

  let titulo;
  let detalle;
  if (destino) {
    titulo = destino.titulo || 'Destino';
    detalle = [`el ${shortDate(destino.fecha)}${esNumero(objetivoKg) ? ` a ${kg(objetivoKg)} kg` : ''}`];
  } else if (fase) {
    titulo = nombreDeFase(fase);
    detalle = [ahora.semana && ahora.total ? `semana ${ahora.semana} de ${ahora.total}` : null];
  } else {
    titulo = 'Sin fase en curso';
    detalle = [];
  }

  /* Lo que falta: hasta el destino; sin él, hasta decidir o hasta que acabe la fase. */
  const hasta = destino?.fecha || cruce?.decide || fase?.endsOn || null;
  const dias = hasta ? daysBetween(hoy, hasta) : null;
  const semanas = dias !== null && dias >= 0 ? Math.ceil(dias / 7) : null;
  const falta =
    semanas !== null
      ? { valor: `${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`, dice: 'Faltan', title: destino ? 'Para llegar al destino' : cruce ? 'Para decidir' : 'Para acabar la fase' }
      : null;

  const peso = esNumero(ahora?.media)
    ? { valor: `${kg(ahora.media)} kg`, dice: 'Peso', title: ahora.deEstaSemana ? 'Media de esta semana' : `Media de la semana del ${shortDate(ahora.lunesDeLaMedia)}` }
    : null;

  let ritmo = null;
  if (fase) {
    const real = ritmoRealDeFase(plan.semanas, fase);
    const previsto = ritmoDeFase(fase, hoy).replace(' %/sem', '');
    if (real !== null) ritmo = { valor: pctSemana(real), dice: 'Ritmo', title: `Real en la fase; previsto ${previsto}` };
    else if (previsto) ritmo = { valor: previsto === 'mantener' ? 'mantener' : `${previsto} %/sem`, dice: 'Ritmo', title: 'Previsto' };
  }

  return { titulo, detalle: detalle.filter(Boolean), cifras: [falta, peso, ritmo].filter(Boolean) };
};

/** Las semanas de una fase, contando la primera y la última. */
export const semanasDeFase = (fase) =>
  fase?.startsOn && fase?.endsOn ? Math.round(((daysBetween(fase.startsOn, fase.endsOn) ?? 0) + 1) / 7) : null;

