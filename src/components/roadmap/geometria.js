/**
 * LA GEOMETRÍA DE LA LÍNEA DEL PLAN, sin React.
 *
 * Aparte del dibujo para poder probarla sin navegador: repartir rótulos en
 * renglones y elegir la ventana de cada zoom son cuentas que se rompen sin que
 * nadie lo vea hasta que dos cifras aparecen una encima de otra.
 */

import { addDays, daysBetween, weekStart } from '@/lib/dates';
import { porVentana } from './escalaDePeso';

const DIA = 86400000;

/** Milisegundos de un día ISO, en UTC. */
export const ms = (dia) => Date.parse(`${dia}T00:00:00Z`);

/** La escala de fechas: de `[desde, hasta)` a `[x0, x1]`. */
export const escalaX = ([desde, hasta], x0, x1) => {
  const a = ms(desde);
  const b = ms(hasta);
  const ancho = Math.max(1, b - a);
  return (dia) => x0 + ((ms(dia) - a) / ancho) * (x1 - x0);
};

/**
 * LA OTRA MANERA DE COLOCAR UN DÍA: por columnas.
 *
 * Las tiras de la portada no reparten el ancho por tiempo, sino por SEMANAS:
 * cada una ocupa una columna igual, y dentro de ella cada día su séptimo. Es lo
 * que hace que las casillas de debajo caigan a plomo bajo su punto.
 *
 * Devuelve lo mismo que `escalaX` —un día y un píxel— para que el trazo del
 * peso sea el mismo dibujo en los dos sitios y no dos copias que divergen. El
 * jueves de una semana cae justo en el centro de su columna, que es donde la
 * portada pinta la media desde el primer día.
 *
 * @param primerLunes el lunes de la primera columna.
 * @param x0          el píxel donde empieza esa columna (el canal del eje).
 * @param col         el ancho de una columna.
 */
export const escalaPorColumnas = (primerLunes, x0, col) => (dia) => {
  const l = weekStart(dia) || primerLunes;
  const semana = (daysBetween(primerLunes, l) ?? 0) / 7;
  const d = Math.max(0, Math.min(6, daysBetween(l, dia) ?? 0));
  return x0 + col * (semana + (d + 0.5) / 7);
};

/** El número de días de una ventana. */
export const diasDe = ([desde, hasta]) => daysBetween(desde, hasta) ?? 0;

/**
 * La escala del peso de una ventana. Vive en `escalaDePeso` con la de las
 * tiras: son los dos modos del MISMO eje y tienen que poder compararse.
 */
export const escalaPeso = porVentana;

/**
 * Coloca rótulos en renglones: cada uno en el primer renglón donde no toque a
 * ninguno de los ya puestos. Un rótulo que se sale por la derecha se mete hacia
 * dentro; uno que no cabe en `maxFilas` se queda sin renglón (`fila: null`) y
 * su dato sigue en el libro.
 *
 * @param items `[{ x, texto, px? }]`: `x` es donde quiere empezar.
 * @returns los mismos items con `fila` y `xt`, y el número de renglones usados.
 */
export const enRenglones = (items, x1, maxFilas = 9, aire = 8) => {
  const filas = [];
  const colocados = items.map((it) => {
    const w = anchoTexto(it.texto, it.px);
    let x = it.x;
    if (x + w > x1) x = Math.max(it.xMin ?? -Infinity, x1 - w);
    for (let r = 0; r < maxFilas; r += 1) {
      filas[r] = filas[r] || [];
      if (!filas[r].some(([a, b]) => x < b + aire && x + w > a - aire)) {
        filas[r].push([x, x + w]);
        return { ...it, fila: r, xt: x, w };
      }
    }
    return { ...it, fila: null, xt: x, w };
  });
  return { items: colocados, filas: filas.filter((f) => f.length > 0).length };
};

/*
  El ancho de un texto a 11 px de Geist, estimado POR ARRIBA: pasarse deja
  aire de más y quedarse corto deja dos rótulos pisados.
*/
export const anchoTexto = (texto, px = 6.2) => String(texto).length * px;

/**
 * La ventana de cada zoom.
 *
 *   · Temporada — el rango del plan con una semana de margen a la izquierda y
 *                 dos a la derecha, para que quepa el rótulo del destino.
 *   · Fase      — la fase de la semana elegida (o la de hoy), con el cruce si
 *                 cuelga de ella.
 *   · Semana    — la semana elegida con dos por delante y dos por detrás: lo
 *                 bastante cerca para leer cada pesaje.
 */
export const ventanaDe = ({ zoom, plan, lunes }) => {
  const { rango, grupos = [], cruce, destino, hoy } = plan;
  const inicio = rango.desde;
  const final = addDays(rango.hasta, 7);
  if (zoom === 'semana') {
    const l = lunes || weekStart(hoy);
    return [addDays(l, -14), addDays(l, 21)];
  }
  if (zoom === 'fase') {
    const l = lunes || weekStart(hoy);
    const grupo = grupos.find((g) => g.desde <= l && g.hasta >= l) || grupos.find((g) => g.fase) || null;
    if (grupo) {
      let hasta = addDays(grupo.hasta, 22);
      if (cruce && grupo.fase && cruce.fase.id === grupo.fase.id) {
        for (const c of cruce.caminos) hasta = hasta > addDays(c.fin, 8) ? hasta : addDays(c.fin, 8);
      }
      return [addDays(grupo.desde, -7), hasta];
    }
  }
  let hasta = addDays(final, 7);
  if (destino?.date && addDays(destino.date, 7) > hasta) hasta = addDays(destino.date, 7);
  return [addDays(inicio, -7), hasta];
};

/** Las semanas que tocan una ventana. */
export const semanasVisibles = (semanas, [desde, hasta]) =>
  semanas.filter((s) => s.domingo >= desde && s.lunes < hasta);

/** Cuántos píxeles mide una semana en una escala. */
export const pxPorSemana = (X, lunes) => X(addDays(lunes, 7)) - X(lunes);

export { DIA };
