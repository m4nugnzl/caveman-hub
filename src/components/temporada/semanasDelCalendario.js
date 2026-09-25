/**
 * EL CALENDARIO DE LA TEMPORADA, sin React (25 sep 2026).
 *
 * La gráfica cuenta la historia; el calendario enseña el mismo plan día a día:
 * qué se pautó y qué pasó cada fecha. No hay cuentas nuevas: cada dato sale de
 * donde ya salía para la gráfica y el inspector.
 *
 *   · La pauta de un día vivido, `pautaDeLosDias` (tipos de día, refeeds
 *     escalonados incluidos). La de un día que aún no ha llegado solo se sabe
 *     si un refeed o un diet break lo cubre: la dieta no se proyecta.
 *   · Las sesiones, `entrenoDeLasSemanas`: lo que pedía cada día y lo hecho.
 *   · El peso, los pesajes y la media de `semanasDelPlan`; lo esperado de una
 *     semana futura, de la cuenta encadenada de sus fases.
 *   · Las sensaciones, las celdas de las tiras de la gráfica (`capas.js`).
 *
 * Se lee sin leer números: el peso medio de cada semana y su cambio, el tinte
 * de los días distintos y el punto de cada sesión (hueco si se pidió y no se
 * hizo).
 * Las cifras de detalle (kcal de cada tipo, entrenos, sensaciones) van en la
 * ficha de la semana; aquí, solo lo que se ve de un vistazo.
 *
 * Aquí se decide QUÉ se escribe en cada sitio y cuánto mide cada semana, para
 * que la vista pueda pintar solo lo que se ve sin medir el DOM.
 */

import { kindMeta } from '@/domain/calendar';
import { directionById } from '@/domain/goals';
import { intervencionDelDia, pautaDeIntervencion } from '@/domain/pautaDelDia';
import { addDays } from '@/lib/dates';
import { entero, kg, nombreDeFase, nombreDeHecho } from './lectura';
import { cambioKg } from './PiezasDelInspector';
import { tintaDeIntervencion } from './series';

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Lo que dice el estado de la revisión de una semana, en palabras. */
export const ESTADO_DE_REVISION = {
  revisada: 'revisada',
  pendiente: 'pendiente',
  curso: 'en curso',
  sin: 'sin check-in',
  futura: 'prevista',
};

const colorDeFase = (fase) => directionById(fase?.direction)?.color || 'var(--text-secondary)';

/**
 * La sesión de un día, en una palabra: `hecha`, `falta` (se pedía y no se
 * hizo; también la de hoy mientras no se haga) o `prevista`; `null` si no
 * había. Los nombres, para la ficha y el rótulo al pasar.
 */
const sesionDelDia = (dia, hoy) => {
  if (!dia) return { sesion: null, sesiones: [] };
  if (dia.hechas?.length) return { sesion: 'hecha', sesiones: dia.hechas.map((x) => x.dayName || 'Entreno') };
  if (!dia.pedida) return { sesion: null, sesiones: [] };
  return { sesion: dia.fecha > hoy ? 'prevista' : 'falta', sesiones: [dia.pedida] };
};

/**
 * Las barras de los hechos de periodo (vacaciones, enfermedad) en una semana,
 * en carriles para que dos que se pisan no se tapen. El nombre, una vez: en
 * el tramo donde empieza.
 *
 * @returns `[{ evento, desde, hasta, carril, nombre, color, prevista }]`, con
 *   `desde` y `hasta` en columnas (0 = lunes).
 */
export const barrasDeLaSemana = (lunes, hechos, hoy) => {
  const domingo = addDays(lunes, 6);
  const col = (fecha) => Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${lunes}T00:00:00Z`)) / 86400000);
  const carriles = [];
  return hechos
    .filter((e) => e.kind !== 'race' && e.date <= domingo && (e.hasta || e.date) >= lunes)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const desde = Math.max(0, col(e.date));
      const hasta = Math.min(6, col(e.hasta && e.hasta > e.date ? e.hasta : e.date));
      let carril = carriles.findIndex((fin) => fin < desde);
      if (carril < 0) carril = carriles.length;
      carriles[carril] = hasta;
      return {
        evento: e,
        desde,
        hasta,
        carril,
        nombre: e.date >= lunes ? nombreDeHecho(e) : null,
        color: kindMeta(e.kind).color,
        prevista: e.date > hoy,
      };
    });
};

/**
 * El refeed o diet break que cubre un día, con sus kcal de ESE día. Su nombre,
 * solo el primer día; la cifra, ese día y cada vez que cambia (un refeed
 * escalonado dice cada escalón; un diet break largo, una vez).
 */
const intervencionDe = (fecha, pautaDelDia, intervenciones) => {
  const evento = pautaDelDia ? pautaDelDia.intervencion : intervencionDelDia(intervenciones, fecha);
  if (!evento) return null;
  const kcalsDe = (f, p) => (p ? p.kcals : pautaDeIntervencion(evento, f).kcals);
  const kcals = kcalsDe(fecha, pautaDelDia);
  const primero = fecha === evento.date;
  const ayer = primero ? null : kcalsDe(addDays(fecha, -1), null);
  return {
    evento,
    color: tintaDeIntervencion(evento),
    nombre: primero ? kindMeta(evento.kind).label : null,
    cifra: esNumero(kcals) && (primero || kcals !== ayer) ? entero(kcals) : null,
    kcals: esNumero(kcals) ? kcals : null,
  };
};

/**
 * Los días altos de una semana con tipos: los que pasan de las kcal más bajas
 * de la semana. Llevan un tinte suave para que el dibujo de la semana se vea;
 * el nombre y las kcal de cada tipo, en la ficha.
 */
const diasAltos = (pautas) => {
  const conTipo = [...pautas.values()].filter((d) => d.tipo && !d.intervencion && esNumero(d.kcals));
  if (new Set(conTipo.map((d) => d.kcals)).size < 2) return new Set();
  const minimo = Math.min(...conTipo.map((d) => d.kcals));
  return new Set(conTipo.filter((d) => d.kcals > minimo).map((d) => d.fecha));
};

/** La celda de una sensación que cubre un lunes, o `null`. */
const celdaDe = (celdas, lunes) => celdas.find((c) => c.desde <= lunes && c.hasta >= lunes && c.valor !== null) || null;

/**
 * La columna de la semana, tres líneas: la semana con su revisión, el peso
 * medio y su cambio en palabras. Y, solo si una sensación de la vista está en
 * un extremo, esa: «Hambre 10/10».
 */
const columnaDeLaSemana = ({ s, anterior, sensaciones }) => {
  const futura = s.estado === 'futura';
  if (futura) {
    return { peso: esNumero(s.esperado) ? `${kg(s.esperado)} kg` : null, cambio: esNumero(s.esperado) ? 'esperado' : null, extremo: null };
  }
  const peso = esNumero(s.media) ? `${kg(s.media)} kg` : null;
  const cambio = esNumero(s.media) && esNumero(anterior?.media) ? cambioKg(s.media - anterior.media) : null;
  let extremo = null;
  for (const x of sensaciones) {
    const c = celdaDe(x.celdas, s.lunes);
    if (c?.tono) {
      extremo = { texto: `${x.nombre} ${String(c.valor).replace('.', ',')}/${x.max}`, tono: c.tono };
      break;
    }
  }
  return { peso, cambio, extremo };
};

/**
 * LAS SEMANAS DEL CALENDARIO.
 *
 * @param semanas   las filas del plan, con su número y estado de revisión.
 * @param diasDe    `(lunes) => pautaDeLosDias(...)`, vacío si no hay pauta.
 * @param entrenoDe `(lunes) => entrenoDeLasSemanas().get(lunes)`, o `null`.
 * @param intervenciones los refeeds y diet breaks.
 * @param contexto  los hechos de contexto (vacaciones, enfermedad, competiciones).
 * @param destino   el destino de la temporada, o `null`.
 * @param fases     las fases, ordenadas.
 * @param sensaciones `[{ id, nombre, max, celdas }]`, las de la vista, en su orden.
 * @returns una fila por semana: `{ lunes, domingo, numero, futura, estado,
 *   dias, barras, franja, fase, rotulo, columna }`.
 */
export const semanasDelCalendario = ({
  semanas = [],
  hoy,
  diasDe = () => [],
  entrenoDe = () => null,
  intervenciones = [],
  contexto = [],
  destino = null,
  fases = [],
  sensaciones = [],
}) => {
  const carreras = contexto.filter((e) => e.kind === 'race');
  const deFase = contexto.filter((e) => e.kind !== 'race');
  const inicios = new Map(fases.filter((f) => f.startsOn).map((f) => [f.startsOn, f]));
  const faseEn = (fecha) =>
    fases.find((f) => f.startsOn && f.startsOn <= fecha && (!f.endsOn || f.endsOn >= fecha)) || null;

  return semanas.map((s, i) => {
    const futura = s.estado === 'futura';
    const pautas = new Map((futura ? [] : diasDe(s.lunes)).map((d) => [d.fecha, d]));
    const altos = diasAltos(pautas);
    const entreno = entrenoDe(s.lunes);
    const porDia = new Map((entreno?.dias || []).map((d) => [d.fecha, d]));

    const dias = Array.from({ length: 7 }, (_, k) => {
      const fecha = addDays(s.lunes, k);
      const numero = Number(fecha.slice(8, 10));
      const pesaje = (s.pesajes || []).filter((p) => p.date === fecha).pop() || null;
      const fase = inicios.get(fecha) || null;
      const pauta = pautas.get(fecha) || null;
      return {
        fecha,
        numero,
        /* El día 1 dice su mes, destacado. */
        mes: numero === 1 ? MESES[Number(fecha.slice(5, 7)) - 1] : null,
        esHoy: fecha === hoy,
        futuro: fecha > hoy,
        pesaje: pesaje ? kg(pesaje.weight) : null,
        tipo: pauta?.intervencion ? null : pauta?.tipo || null,
        alto: altos.has(fecha),
        intervencion: intervencionDe(fecha, pauta, intervenciones),
        ...sesionDelDia(porDia.get(fecha), hoy),
        faseNueva: fase ? { nombre: nombreDeFase(fase), color: colorDeFase(fase), fase } : null,
        carreras: [
          ...(destino?.date === fecha ? [{ evento: destino, nombre: destino.title || 'Destino', destino: true }] : []),
          ...carreras.filter((e) => e.date === fecha).map((e) => ({ evento: e, nombre: nombreDeHecho(e), destino: false })),
        ],
      };
    });

    /* La franja de la fase: su color en el lunes y, si cambia a mitad de
       semana, el día que cambia. */
    const franja = [];
    for (let k = 0; k < 7; k += 1) {
      const f = faseEn(dias[k].fecha);
      const color = f ? colorDeFase(f) : null;
      if (!franja.length || franja[franja.length - 1].color !== color) franja.push({ desde: k, color });
    }
    const conFase = dias.findIndex((d) => d.faseNueva);

    return {
      lunes: s.lunes,
      domingo: s.domingo,
      numero: s.numero || null,
      futura,
      estado: s.revision5 || (futura ? 'futura' : 'sin'),
      dias,
      barras: barrasDeLaSemana(s.lunes, deFase, hoy),
      franja,
      /* La fase que empieza esta semana, para nombrarla una vez junto a la franja. */
      fase: conFase >= 0 ? { ...dias[conFase].faseNueva, columna: conFase } : null,
      /* Un mes que empieza en lunes: su nombre entre filas. */
      rotulo: dias[0].numero === 1 ? MESES_LARGOS[Number(s.lunes.slice(5, 7)) - 1] : null,
      columna: columnaDeLaSemana({ s, anterior: semanas[i - 1] || null, sensaciones }),
    };
  });
};

/* ── Lo que mide cada fila ────────────────────────────────────────────────
   La vista pinta solo las semanas cercanas a lo que se ve, así que necesita
   saber lo que mide cada una sin montarla: se cuenta aquí, con las mismas
   medidas que usa la hoja de estilos (`calendario` en temporada.css).

   Una fila mide lo que lleva dentro, con un mínimo: una semana vacía es un
   renglón de números; una con pesajes y refeeds, lo que haga falta. */

export const MEDIDAS = {
  minimo: 48, // la fila más baja, con su línea y su aire
  aire: 9, // la línea de arriba (1) y el aire de arriba y abajo (4 + 4)
  dia: 32, // el día con solo su número: su aire (6 + 6) y la cabeza (20)
  pesaje: 24,
  pie: 18, // el nombre y la cifra de un refeed, o una competición
  barra: 14, // un carril de hechos de periodo (vacaciones, enfermedad)
  col: 8, // el aire de la columna de la semana (4 + 4)
  linea: 16, // cada línea de la columna: la semana, el cambio, el extremo
  peso: 24, // la del peso medio, más grande
  rotulo: 28, // la línea del mes o de la fase que empieza, encima de la fila
};

const conRotulo = (sem) => Boolean(sem.rotulo || sem.fase);
const conPie = (d) => Boolean((d.intervencion && (d.intervencion.nombre || d.intervencion.cifra)) || d.carreras.length);

/** Lo que mide la rejilla de una semana en el escritorio, línea y aire incluidos. */
export const celdaDeSemana = (sem, M = MEDIDAS) => {
  const carriles = sem.barras.reduce((n, b) => Math.max(n, b.carril + 1), 0);
  const dia =
    M.dia + (sem.dias.some((d) => d.pesaje) ? M.pesaje : 0) + (sem.dias.some(conPie) ? M.pie : 0) + carriles * M.barra;
  const { peso, cambio, extremo } = sem.columna;
  const col = M.col + M.linea + (peso ? M.peso : 0) + (cambio ? M.linea : 0) + (extremo ? M.linea : 0);
  return Math.max(M.minimo, M.aire + Math.max(dia, col));
};

/** Lo que mide una semana en la cuadrícula del escritorio. */
export const altoDeSemana = (sem, M = MEDIDAS) => (conRotulo(sem) ? M.rotulo : 0) + celdaDeSemana(sem, M);

/* En el teléfono. Mes: el número, el punto de la sesión, el tinte y el pesaje
   si cabe, en filas iguales. Lista: una semana con su peso y sus días en filas. */
export const MES_TELEFONO = { celda: 48, rotulo: 28 };
export const altoEnMes = (sem, M = MES_TELEFONO) => (sem.rotulo ? M.rotulo : 0) + M.celda;

export const LISTA = { cabeza: 40, peso: 32, dia: 40, aire: 10, hueco: 12, rotulo: 32 };
export const altoEnLista = (sem, L = LISTA) =>
  (sem.rotulo ? L.rotulo : 0) + L.cabeza + (sem.columna.peso || sem.columna.extremo ? L.peso : 0) + 7 * L.dia + L.aire * 2 + L.hueco;

/** Dónde empiezan y acaban las celdas (o la tarjeta) de una semana, desde
 *  arriba de su fila: lo que rodea el contorno de un rango. */
export const cajaDeSemana = (sem, tipo) => {
  if (tipo === 'lista') return { arriba: sem.rotulo ? LISTA.rotulo : 0, abajo: altoEnLista(sem) - LISTA.hueco };
  const alto = tipo === 'mes' ? altoEnMes(sem) : altoDeSemana(sem);
  const celda = tipo === 'mes' ? MES_TELEFONO.celda : celdaDeSemana(sem);
  return { arriba: alto - celda, abajo: alto };
};

/**
 * Las posiciones de unas filas de alto conocido y las que tocan una ventana:
 * lo que hace que una temporada entera se desplace sin montar 52 semanas.
 *
 * @returns `{ tops, total, indice(px) }`.
 */
export const posiciones = (altos) => {
  const tops = [];
  let y = 0;
  for (const a of altos) {
    tops.push(y);
    y += a;
  }
  /* La primera fila cuyo final pasa de `px`. */
  const indice = (px) => {
    let lo = 0;
    let hi = altos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid] + altos[mid] <= px) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo);
  };
  return { tops, total: y, indice };
};

/** El mes de una fila, por su jueves: «septiembre 2026». */
export const mesDeLaSemana = (lunes, nombres) => {
  const jueves = addDays(lunes, 3);
  return `${nombres[Number(jueves.slice(5, 7)) - 1]} ${jueves.slice(0, 4)}`;
};
