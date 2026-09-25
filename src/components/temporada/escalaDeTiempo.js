/**
 * LA ESCALA DE TIEMPO DE LA TEMPORADA, sin React.
 *
 * ══ Un eje, una vista ══════════════════════════════════════════════════════
 *
 * Toda la herramienta dibuja sobre UN eje de tiempo real. Lo que se ve es una
 * vista `{ inicio, fin }` —dos instantes en milisegundos UTC, no dos lunes—
 * porque el pellizco y el desplazamiento son continuos: una vista que solo
 * pudiera caer en lunes saltaría a cada movimiento del dedo. Lo que sí cae en
 * semanas es lo que se ELIGE: la franja que se arrastra (`vistaDeFranja`) y
 * los atajos (`vistaDelAtajo`).
 *
 * Cada carril recibe la misma escala (`crearEscala`) y no sabe nada de los
 * demás: si dos carriles tuvieran su propia cuenta de «qué píxel es el 3 de
 * marzo», una fase y su peso acabarían desalineados en algún zoom.
 *
 * ══ Dos niveles, que se deducen ════════════════════════════════════════════
 *
 *   · Temporada — la vista enseña (casi) toda la temporada: columnas de
 *     semana.
 *   · Rango     — cualquier cosa más cerca, hasta una semana: por días en
 *     cuanto un día tiene sitio. Lo que se ve es el rango: no hay otra
 *     selección (25 sep).
 *
 * Una semana ya no es un nivel de la gráfica: se lee en su hoja.
 *
 * El nivel no se guarda aparte: sale del ancho de la vista (`nivelDe`). Así los
 * atajos y el pellizco no pueden contradecirse.
 */

import { addDays, daysBetween, weekStart } from '@/lib/dates';
import { MONTH_NAMES } from '@/domain/calendar';

export const DIA_MS = 86400000;
export const SEMANA_MS = 7 * DIA_MS;

/** De un día ISO a su medianoche UTC en milisegundos. */
export const aMs = (dia) => Date.parse(`${dia}T00:00:00Z`);
/** Y de vuelta: el día ISO de un instante. */
export const aDia = (t) => new Date(t).toISOString().slice(0, 10);

/** El aire a cada lado de la temporada: una semana antes, dos después. */
const AIRE_ANTES = 7;
const AIRE_DESPUES = 14;

/**
 * Los límites de la temporada: de dónde a dónde se puede mover la vista.
 *
 * Desde el inicio de su primera fase hasta lo más lejano entre el DESTINO y el
 * PUNTO DE DECISIÓN (el final de la última fase, donde se elige camino), con
 * aire a los dos lados. Hoy, siempre dentro.
 *
 * Los caminos del punto de decisión NO la estiran: son opciones, no plan. Antes
 * sí, y un camino de seis meses dejaba medio año en blanco detrás de la
 * decisión. Tampoco un año fijo: la temporada mide lo que mide su plan.
 *
 * Sin fases ni destino, el rango del plan (las últimas semanas con pesajes).
 */
export const limitesDe = ({ plan, fases = [] }) => {
  const { rango, destino, cruce, temporada, hoy } = plan;
  const conFechas = fases.filter((f) => f?.startsOn);
  const primera = temporada?.desde || conFechas[0]?.startsOn || rango.desde;

  /* El final: el destino o la decisión, lo que caiga más lejos. Sin ninguno
     de los dos, el final de la última fase de la temporada. */
  let final = null;
  if (destino?.date) final = destino.date;
  if (cruce?.decide && (!final || cruce.decide > final)) final = cruce.decide;
  if (!final) {
    for (const f of conFechas) {
      if (temporada?.desde && f.startsOn < temporada.desde) continue;
      const fin = f.endsOn || hoy;
      if (!final || fin > final) final = fin;
    }
  }
  if (!final) final = rango.hasta;

  let desde = addDays(primera, -AIRE_ANTES);
  let hasta = addDays(final, AIRE_DESPUES);
  if (hoy < desde) desde = addDays(hoy, -AIRE_ANTES);
  if (hoy > hasta) hasta = addDays(hoy, AIRE_ANTES);
  return { inicio: aMs(weekStart(desde)), fin: aMs(weekStart(addDays(hasta, 6))) };
};

/**
 * Deja una vista dentro de sus límites: ni más estrecha que una semana ni más
 * ancha que la temporada, y sin salirse por ningún lado.
 */
export const acotar = (vista, limites) => {
  const total = limites.fin - limites.inicio;
  const ancho = Math.min(total, Math.max(SEMANA_MS, vista.fin - vista.inicio));
  let inicio = vista.inicio;
  if (inicio < limites.inicio) inicio = limites.inicio;
  if (inicio + ancho > limites.fin) inicio = limites.fin - ancho;
  return { inicio, fin: inicio + ancho };
};

/**
 * Acercar o alejar dejando QUIETO el instante que está bajo el dedo (o bajo el
 * cursor): es lo que hace que el pellizco se sienta pegado a la gráfica.
 *
 * @param factor >1 acerca, <1 aleja.
 * @param ancla  el instante que no se mueve.
 */
export const ampliar = (vista, factor, ancla, limites) => {
  const ancho = vista.fin - vista.inicio;
  const nuevo = ancho / Math.max(0.05, factor);
  const t = (ancla - vista.inicio) / (ancho || 1);
  return acotar({ inicio: ancla - t * nuevo, fin: ancla - t * nuevo + nuevo }, limites);
};

/** Mover la vista sin cambiar su ancho. */
export const desplazar = (vista, delta, limites) =>
  acotar({ inicio: vista.inicio + delta, fin: vista.fin + delta }, limites);

/** El nivel que corresponde a una vista. Ver la cabecera. */
export const nivelDe = (vista, limites) =>
  vista.fin - vista.inicio >= (limites.fin - limites.inicio) * 0.97 ? 'temporada' : 'rango';

/** La vista de una semana: su lunes y los seis días siguientes. */
export const vistaDeSemana = (lunes) => ({ inicio: aMs(lunes), fin: aMs(lunes) + SEMANA_MS });

/** La vista de un tramo de semanas, del lunes del primero al domingo del último. */
export const vistaDeSemanas = (desde, hasta) => ({ inicio: aMs(weekStart(desde)), fin: aMs(weekStart(hasta)) + SEMANA_MS });

/**
 * LA ESCALA: de un día ISO (o un instante) a un píxel dentro de `[0, ancho]`.
 *
 * `x` toma un día y lo pone en su medianoche; el centro de un día es
 * `x(dia) + pxPorDia / 2`.
 */
export const crearEscala = (vista, ancho) => {
  const w = Math.max(1, ancho);
  const span = Math.max(1, vista.fin - vista.inicio);
  const xMs = (t) => ((t - vista.inicio) / span) * w;
  return {
    vista,
    ancho: w,
    pxPorDia: (DIA_MS / span) * w,
    xMs,
    x: (dia) => xMs(aMs(dia)),
    /** De un píxel al instante que hay debajo. */
    tDe: (px) => vista.inicio + (px / w) * span,
    /** Si un tramo de días toca la vista. `hasta` es el último día, incluido. */
    toca: (desde, hasta) => aMs(desde) < vista.fin && aMs(hasta) + DIA_MS > vista.inicio,
    primerDia: aDia(vista.inicio),
    ultimoDia: aDia(vista.fin - 1),
  };
};

/*
  El ancho de un texto de la gráfica, estimado POR ARRIBA: pasarse deja aire
  de más; quedarse corto deja dos rótulos pisados. El mismo criterio que
  `roadmap/geometria.anchoTexto`. Los `px` por letra de quien la llama están
  medidos a 11 px; la gráfica escribe a 13 (`--tl-letra`, 25 sep), y
  `LETRA_13` los lleva a ese tamaño.
*/
const LETRA_13 = 13 / 11;
export const anchoTexto = (texto, px = 6.4) => String(texto).length * px * LETRA_13;

/**
 * El rótulo más largo de una lista que cabe en un ancho. Los rótulos van de
 * más a menos: «Definición · −0,6 %/sem», «Definición», «D». `null` si no cabe
 * ni el último: un rótulo que no cabe no se escribe, nunca se pisa.
 */
export const rotuloQueCabe = (opciones, ancho, px = 6.4, aire = 12) =>
  opciones.find((t) => t && anchoTexto(t, px) + aire <= ancho) ?? null;

/*
  ══ El eje elige su detalle por el ancho de una semana (25 sep) ════════════

    · semanas — ≥ 34 px: «S12» en cada píldora y, debajo, el lunes de cada
      semana con el mes en negrita cuando cambia.
    · numeros — de 18 a 34 px: «12» en cada píldora y, debajo, solo los meses.
    · meses   — menos de 18 px: una píldora por mes, del ancho del mes.
*/
export const PX_SEMANAS = 34;
export const PX_NUMEROS = 18;

/*
  El ancho de un texto del eje, que escribe a 11 px (`--fs-2xs`), estimado
  por arriba con lo medido en Geist: cifras tabulares 6,7 px, letras unos 6
  (la m, 9), mayúsculas 7,5.
*/
export const anchoDelEje = (texto) =>
  [...String(texto)].reduce((n, c) => n + (c === ' ' ? 3.3 : /\d/.test(c) ? 6.8 : /[mw]/.test(c) ? 9.5 : /[A-Z]/.test(c) ? 7.5 : 6.5), 0);

/** El aire mínimo entre dos rótulos de fechas. */
const HUECO_FECHAS = 4;

/**
 * El nivel del eje para un ancho de semana. Con cada lunes escrito debajo,
 * además de los 34 px tiene que caber la fecha más ancha que abre un mes
 * («7 may»): si no cabe, el nivel siguiente.
 */
export const nivelDelEje = (pxSemana) =>
  pxSemana >= Math.max(PX_SEMANAS, anchoDelEje('7 may') + HUECO_FECHAS) ? 'semanas' : pxSemana >= PX_NUMEROS ? 'numeros' : 'meses';

const corto = (mes) => MONTH_NAMES[mes].slice(0, 3).toLowerCase();

/**
 * Los meses que toca la vista, cada uno del día 1 al último: `[{ mes, x, w,
 * nombre, anio, cambiaAnio }]`, recortados a lo que se ve. `cambiaAnio` si su
 * año no es el del mes anterior de la lista.
 */
export const mesesDeLaVista = (escala) => {
  const { primerDia, ultimoDia } = escala;
  const [y, m] = primerDia.split('-').map(Number);
  const meses = [];
  for (let i = 0; i < 60; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10);
    if (d > ultimoDia) break;
    const siguiente = new Date(Date.UTC(y, m + i, 1)).toISOString().slice(0, 10);
    const x = Math.max(0, escala.x(d));
    const xf = Math.min(escala.ancho, escala.x(siguiente));
    const anio = d.slice(0, 4);
    meses.push({
      mes: d.slice(0, 7),
      desde: d,
      hasta: addDays(siguiente, -1),
      x,
      w: xf - x,
      nombre: corto(Number(d.slice(5, 7)) - 1),
      anio,
      cambiaAnio: meses.length > 0 && meses[meses.length - 1].anio !== anio,
    });
  }
  return meses.filter((mm) => mm.w > 0);
};


/**
 * Las fechas del eje, debajo de las píldoras:
 *
 *   · nivel `semanas`: el lunes de cada semana, con el mes (en negrita)
 *     cuando cambia y en la primera que se ve;
 *   · nivel `numeros`: solo los meses, con el año cuando cambia;
 *   · nivel `meses`: solo el año, donde cambia (los meses van en la píldora).
 *
 * Un rótulo que no cabe detrás del anterior se salta: nunca se pisan.
 *
 * @returns `[{ dia, x, texto, numero, mes, fuerte }]`: `texto` es el rótulo
 *   entero; `numero` y `mes`, sus dos trozos.
 */
export const marcasDelEje = (escala, nivel = nivelDelEje(escala.pxPorDia * 7)) => {
  const { primerDia, ultimoDia } = escala;
  const marcas = [];
  if (nivel === 'semanas') {
    let mesPrevio = null;
    for (let l = weekStart(primerDia); l <= ultimoDia; l = addDays(l, 7)) {
      const mes = l.slice(5, 7);
      const numero = String(Number(l.slice(8, 10)));
      /* El mes, cuando cambia y en la primera fecha que se ve. */
      const nombre = mes !== mesPrevio || escala.x(addDays(l, -7)) < 0 ? corto(Number(mes) - 1) : null;
      marcas.push({ dia: l, x: escala.x(l), texto: nombre ? `${numero} ${nombre}` : numero, numero, mes: nombre, fuerte: true });
      mesPrevio = mes;
    }
  } else {
    for (const mm of mesesDeLaVista(escala)) {
      if (nivel === 'meses') {
        if (mm.cambiaAnio) marcas.push({ dia: mm.desde, x: mm.x, texto: mm.anio, numero: null, mes: mm.anio, fuerte: true });
        continue;
      }
      const texto = mm.cambiaAnio ? `${mm.nombre} ${mm.anio}` : mm.nombre;
      marcas.push({ dia: mm.desde, x: mm.x, texto, numero: null, mes: texto, fuerte: mm.cambiaAnio });
    }
  }

  const visibles = [];
  for (const mk of marcas) {
    if (mk.x < 0 || mk.x + anchoDelEje(mk.texto) > escala.ancho + 4) continue;
    const previa = visibles[visibles.length - 1];
    if (previa && mk.x < previa.x + anchoDelEje(previa.texto) + HUECO_FECHAS) continue;
    visibles.push(mk);
  }
  return visibles;
};

/*
  ══ Lo que se ve es el rango (25 sep) ══════════════════════════════════════
  Arrastrar sobre la gráfica dibuja una franja y soltarla acerca la vista a
  ella; la vista va en la dirección. No hay otra selección en la gráfica.
*/

/** Por debajo de dos semanas la franja se ajusta a días; si no, a semanas enteras. */
const FRANJA_EN_DIAS = 14;

/**
 * La vista de una franja arrastrada entre dos instantes (sin ordenar):
 * semanas completas, o días si el tramo es corto. Nunca menos de una semana,
 * centrada en la franja.
 */
export const vistaDeFranja = (a, b) => {
  const [x, y] = a <= b ? [a, b] : [b, a];
  const desde = aDia(x);
  const hasta = aDia(y);
  if ((daysBetween(desde, hasta) ?? 0) + 1 >= FRANJA_EN_DIAS) return vistaDeSemanas(desde, hasta);
  const inicio = aMs(desde);
  const fin = aMs(hasta) + DIA_MS;
  if (fin - inicio >= SEMANA_MS) return { inicio, fin };
  const centro = aMs(aDia((inicio + fin) / 2));
  return { inicio: centro - 3 * DIA_MS, fin: centro + 4 * DIA_MS };
};

/**
 * Los atajos del control de arriba, centrados en hoy: tres meses (trece
 * semanas, seis a cada lado de la de hoy) o cuatro semanas (dos antes, la de
 * hoy y la siguiente).
 */
export const vistaDelAtajo = (atajo, hoy, limites) => {
  const lunes = weekStart(hoy);
  const [antes, despues] = atajo === '3m' ? [6, 6] : [2, 1];
  return acotar(vistaDeSemanas(addDays(lunes, -7 * antes), addDays(lunes, 7 * despues)), limites);
};

/** El atajo que corresponde a una vista (su ancho, con medio día de margen), o `null`. */
export const atajoDe = (vista, limites) => {
  if (nivelDe(vista, limites) === 'temporada') return 'temporada';
  const semanas = (vista.fin - vista.inicio) / SEMANA_MS;
  if (Math.abs(semanas - 13) < 0.08) return '3m';
  if (Math.abs(semanas - 4) < 0.08) return '4s';
  return null;
};

/** La vista en la dirección: `?desde=…&hasta=…`, del primer al último día que se ve. */
export const vistaAParams = (vista) => ({
  desde: aDia(Math.round(vista.inicio / DIA_MS) * DIA_MS),
  hasta: aDia(Math.round(vista.fin / DIA_MS) * DIA_MS - DIA_MS),
});

/** Y de vuelta, o `null` si no son dos días en orden. */
export const vistaDeParams = (desde, hasta) => {
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  if (!dia.test(desde || '') || !dia.test(hasta || '') || desde > hasta) return null;
  return { inicio: aMs(desde), fin: aMs(hasta) + DIA_MS };
};
