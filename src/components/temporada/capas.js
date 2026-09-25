import { esSerie } from '@/domain/protocol';
import { tonoDeSensacion, valorDeRespuesta } from '@/domain/sensaciones';
import { weekStart } from '@/lib/dates';

/**
 * LAS FILAS DE LA LÍNEA DE TIEMPO (24 sep 2026).
 *
 * La gráfica es el control: cada fila lleva su nombre a la izquierda y, al
 * pasar el ratón (o con una pulsación larga), subir, bajar y quitar. Al pie,
 * «+ Añadir fila» con lo que no se ve y tiene datos. El peso siempre está.
 *
 * Una fila se nombra por un id estable, que es lo que se guarda en las vistas
 * del entrenador (`profiles.preferences.temporada.vistas`):
 *
 *   peso · kcal · pasos · split · entrenos
 *   ci:<pregunta>   una sensación del check-in (una celda por semana; por
 *                   días, la de la sesión si también la pregunta)
 *   se:<pregunta>   una que solo pregunta la sesión (media de la semana, o
 *                   una celda por sesión al ir por días)
 *
 * Una vista que nombra una fila que este cliente no tiene la salta sin más:
 * las vistas son del entrenador y sirven para todos sus clientes.
 */

export const GRUPOS = ['Pauta', 'Sensaciones', 'Entreno'];

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const media = (vs) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null);

/** La escala de una pregunta: `{ min, max }`, 1–10 si no la dice. */
export const escalaDe = (q) => ({ min: esNumero(q?.min) ? q.min : 1, max: esNumero(q?.max) ? q.max : 10 });

/** El valor de una sesión, o `null`. */
const valorDeSesion = (x, pregunta) => valorDeRespuesta(x.feedback?.[pregunta.id], pregunta);

/** Los check-ins de las semanas, cada uno una vez (con cadencia quincenal, es del periodo). */
const entregasUnicas = (semanas) => {
  const vistas = new Set();
  return semanas.filter((s) => {
    if (!s.entrega?.answers || vistas.has(s.entrega)) return false;
    vistas.add(s.entrega);
    return true;
  });
};

/* El nombre corto de una pregunta, para reconocer el mismo concepto en el
   check-in y en la sesión («Sueño», «Energía», «Estrés», «Dolor»). */
const concepto = (q) =>
  String(q.short || q.label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/* Los entrenamientos completados del check-in: los cuenta ya «Entrenos hechos». */
const YA_CONTADAS = new Set(['training_done']);

/**
 * LAS FILAS QUE PUEDE TENER ESTE CLIENTE: las que tienen datos.
 *
 * Un concepto que se pregunta en el check-in y en la sesión (sueño, energía,
 * estrés, dolor) es UNA fila: la del check-in, semanal, en Temporada; la de
 * la sesión, día a día, al acercar (`sesion`). Las que solo pregunta la
 * sesión (RPE, fatiga, agujetas, ánimo) van con el entreno.
 *
 * @param preguntasCheckin las del check-in de hoy.
 * @param preguntasSesion  las del parte de la sesión de hoy.
 * @param semanas  filas del plan con `entrega`.
 * @param sesiones las sesiones con fecha (`{ date, feedback }`).
 * @param hay      `{ kcal, pasos, split, entrenos }`: si hay de cada una.
 * @returns `[{ id, grupo, nombre, fija, pregunta, sesion, origen, respuestas }]`.
 */
export const capasDisponibles = ({ preguntasCheckin = [], preguntasSesion = [], semanas = [], sesiones = [], hay = {} }) => {
  const capas = [{ id: 'peso', grupo: null, nombre: 'Peso', fija: true }];
  if (hay.kcal) capas.push({ id: 'kcal', grupo: 'Pauta', nombre: 'Kcal' });
  if (hay.pasos) capas.push({ id: 'pasos', grupo: 'Pauta', nombre: 'Pasos' });

  const entregas = entregasUnicas(semanas);
  const deSesion = preguntasSesion
    .filter(esSerie)
    .map((q) => ({ q, respuestas: sesiones.filter((x) => valorDeSesion(x, q) !== null).length }));
  const checkin = preguntasCheckin.filter((q) => esSerie(q) && !(YA_CONTADAS.has(q.id) && hay.entrenos));
  const conceptos = new Set(checkin.map(concepto));
  const unidas = new Set();

  for (const q of checkin) {
    const respuestas = entregas.filter((s) => valorDeRespuesta(s.entrega.answers[q.id], q) !== null).length;
    const par = deSesion.find((x) => x.respuestas > 0 && concepto(x.q) === concepto(q)) || null;
    if (respuestas > 0) {
      if (par) unidas.add(par.q.id);
      capas.push({ id: `ci:${q.id}`, grupo: 'Sensaciones', nombre: q.short || q.label, pregunta: q, sesion: par?.q || null, origen: 'checkin', respuestas });
    }
  }
  /* Lo de la sesión que no se ha unido: con las sensaciones si el check-in
     pregunta lo mismo (pero aún no lo ha contestado); si no, con el entreno. */
  const soloSesion = deSesion
    .filter((x) => x.respuestas > 0 && !unidas.has(x.q.id))
    .map(({ q, respuestas }) => ({
      id: `se:${q.id}`,
      grupo: conceptos.has(concepto(q)) ? 'Sensaciones' : 'Entreno',
      nombre: q.short || q.label,
      pregunta: q,
      origen: 'sesion',
      respuestas,
    }));
  capas.push(...soloSesion.filter((c) => c.grupo === 'Sensaciones'));

  if (hay.split) capas.push({ id: 'split', grupo: 'Entreno', nombre: 'Split' });
  if (hay.entrenos) capas.push({ id: 'entrenos', grupo: 'Entreno', nombre: 'Entrenos hechos' });
  capas.push(...soloSesion.filter((c) => c.grupo === 'Entreno'));
  return capas;
};

/**
 * LA VISTA POR DEFECTO, sin ninguna guardada: el peso, las kcal y las dos
 * sensaciones del check-in con más respuestas.
 */
export const vistaPorDefecto = (disponibles) => {
  const sensaciones = disponibles
    .filter((c) => c.origen === 'checkin')
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.respuestas - a.c.respuestas || a.i - b.i)
    .slice(0, 2)
    .map(({ c }) => c.id);
  return ['peso', ...(disponibles.some((c) => c.id === 'kcal') ? ['kcal'] : []), ...sensaciones];
};

/** Las filas de una vista que este cliente tiene, una vez cada una y con el peso siempre. */
export const capasDeLaVista = (ids, disponibles) => {
  const hay = new Set(disponibles.map((c) => c.id));
  const salida = [...new Set(ids || [])].filter((id) => hay.has(id));
  return salida.includes('peso') ? salida : ['peso', ...salida];
};

/** Una fila un puesto arriba (`-1`) o abajo (`1`). */
export const moverCapa = (ids, id, paso) => {
  const i = ids.indexOf(id);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const salida = [...ids];
  [salida[i], salida[j]] = [salida[j], salida[i]];
  return salida;
};

/** Quitar una fila: el peso no se quita. */
export const quitarCapa = (ids, id) => (id === 'peso' ? ids : ids.filter((x) => x !== id));

/** Si dos listas de filas dicen lo mismo, en el mismo orden. */
export const mismasCapas = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* ── Las celdas de las tiras ──────────────────────────────────────────── */

const celda = (desde, hasta, valor, pregunta) => ({
  clave: desde,
  desde,
  hasta,
  valor,
  tono: pregunta && valor !== null ? tonoDeSensacion(valor, pregunta) : null,
});

/**
 * UNA SENSACIÓN DEL CHECK-IN: una celda por check-in, de lunes a domingo (con
 * cadencia quincenal, las dos semanas de su periodo). Una semana vivida sin
 * check-in, celda vacía: no se inventa. Antes del primer check-in no hay
 * nada: entonces aún no se le pedía. La semana en curso sin él no sale
 * todavía, y lo que viene tampoco.
 *
 * @returns `[{ clave, desde, hasta, valor, tono }]`, `valor` `null` si falta.
 */
export const celdasDeCheckin = ({ semanas = [], pregunta, hoy }) => {
  const lunesDeHoy = weekStart(hoy);
  const salida = [];
  let previa = null;
  const primera = semanas.find((s) => s.entrega?.answers)?.lunes;
  if (!primera) return salida;
  for (const s of semanas) {
    if (s.lunes < primera) continue;
    if (s.lunes > lunesDeHoy) break;
    const e = s.entrega;
    if (e?.answers && previa?.entrega === e) {
      previa.celda.hasta = s.domingo;
      continue;
    }
    if (!e?.answers && s.lunes === lunesDeHoy) continue;
    const c = celda(s.lunes, s.domingo, e?.answers ? valorDeRespuesta(e.answers[pregunta.id], pregunta) : null, pregunta);
    salida.push(c);
    previa = { entrega: e?.answers ? e : null, celda: c };
  }
  return salida;
};

/**
 * UNA SENSACIÓN DE LA SESIÓN, POR SEMANAS: la media de sus sesiones. Una
 * semana vivida sin parte, celda vacía; la que corre, solo si ya tiene.
 *
 * @param sesionesPorLunes `Map<lunes, [sesión]>`.
 */
export const celdasDeSesionPorSemana = ({ semanas = [], sesionesPorLunes, pregunta, hoy }) => {
  const lunesDeHoy = weekStart(hoy);
  /* Desde la primera semana con parte: antes no se pedía. */
  const primera = [...sesionesPorLunes.keys()].filter((l) => (sesionesPorLunes.get(l) || []).some((x) => valorDeSesion(x, pregunta) !== null)).sort()[0];
  if (!primera) return [];
  return semanas
    .filter((s) => s.lunes >= primera && s.lunes <= lunesDeHoy)
    .flatMap((s) => {
      const vs = (sesionesPorLunes.get(s.lunes) || []).map((x) => valorDeSesion(x, pregunta)).filter(esNumero);
      if (vs.length === 0 && s.lunes === lunesDeHoy) return [];
      return [celda(s.lunes, s.domingo, vs.length ? Math.round(media(vs) * 10) / 10 : null, pregunta)];
    });
};

/**
 * UNA SENSACIÓN DE LA SESIÓN, POR DÍAS: una celda por día con parte (dos
 * sesiones el mismo día, su media). Los días sin sesión, nada.
 *
 * @param sesionesPorDia `Map<fecha, [sesión]>`.
 */
export const celdasDeSesionPorDia = ({ sesionesPorDia, pregunta, desde, hasta }) => {
  const salida = [];
  for (const [fecha, xs] of sesionesPorDia) {
    if (fecha < desde || fecha > hasta) continue;
    const vs = xs.map((x) => valorDeSesion(x, pregunta)).filter(esNumero);
    if (vs.length) salida.push(celda(fecha, fecha, Math.round(media(vs) * 10) / 10, pregunta));
  }
  return salida.sort((a, b) => a.desde.localeCompare(b.desde));
};

/**
 * LOS ENTRENOS HECHOS: por semanas, «4/5» (o «4» sin hilera que cuente); por
 * días, una celda llena el día que entrenó y una vacía el día que se pedía y
 * no se hizo. Sin tono: es una cuenta.
 *
 * @param entreno `entrenoDeLasSemanas`.
 */
export const celdasDeEntrenos = ({ semanas = [], entreno, hoy, porDias = false }) => {
  const lunesDeHoy = weekStart(hoy);
  const vividas = semanas.filter((s) => s.lunes <= lunesDeHoy);
  if (!porDias)
    return vividas.flatMap((s) => {
      const e = entreno.get(s.lunes);
      if (!e || (e.hechas === 0 && !e.pedidos)) return [];
      return [{ ...celda(s.lunes, s.domingo, e.hechas, null), texto: esNumero(e.pedidos) ? `${e.hechas}/${e.pedidos}` : String(e.hechas) }];
    });
  return vividas.flatMap((s) =>
    (entreno.get(s.lunes)?.dias || []).flatMap((d) => {
      if (d.hechas.length) return [{ ...celda(d.fecha, d.fecha, d.hechas.length, null), texto: '✓', titulo: d.hechas.map((x) => x.dayName).join(' + ') }];
      if (d.pedida && d.fecha < hoy) return [{ ...celda(d.fecha, d.fecha, null, null), titulo: d.pedida }];
      return [];
    })
  );
};

/**
 * LOS VALORES DE CADA SEMANA de una sensación: lo que compara el resumen del
 * periodo. Del check-in, el de su periodo en su primera semana; de la sesión,
 * la media de la semana.
 *
 * @returns `Map<lunes, valor>`.
 */
export const valoresPorSemana = ({ capa, semanas = [], sesionesPorLunes }) => {
  const m = new Map();
  if (capa.origen === 'checkin') {
    for (const s of entregasUnicas(semanas)) {
      const v = valorDeRespuesta(s.entrega.answers[capa.pregunta.id], capa.pregunta);
      if (v !== null) m.set(s.lunes, v);
    }
  } else if (capa.origen === 'sesion') {
    for (const s of semanas) {
      const vs = (sesionesPorLunes.get(s.lunes) || []).map((x) => valorDeSesion(x, capa.pregunta)).filter(esNumero);
      if (vs.length) m.set(s.lunes, media(vs));
    }
  }
  return m;
};
