/**
 * EL REPARTO A LO ANCHO DE LA PORTADA DE REVISIONES, sin React.
 *
 * Cada fase es una TIRA: la gráfica de peso arriba y sus casillas debajo, una
 * columna por semana. Aquí solo se decide el ancho, con la regla aprobada en
 * los bocetos (21 sep 2026): la columna sale de lo que cabe en la casilla. La
 * completa (número, fecha, «81,5 kg», «2.300 kcal») pide 80 px; la compacta
 * (número, «81,5», «2300») pide 52. Si no caben 52, la tira se parte antes:
 * nunca hay desplazamiento lateral. Hasta 26 semanas por tira; en el teléfono,
 * de 5 en 5.
 *
 * ── Dónde está lo demás ────────────────────────────────────────────────────
 * El eje de kilos —la otra regla, «se comparte la proporción, no el rango»— se
 * mudó a `roadmap/escalaDePeso`, donde vive con el de la gráfica de la
 * temporada: son los dos modos del mismo eje. Y el día a píxel, a
 * `roadmap/geometria` (`escalaPorColumnas`), con el de las fechas.
 */

export const COL_COMPLETA = 80;
export const COL_COMPACTA = 52;
/* Más ancha no gana nada: una fase de cuatro semanas no se estira a lo ancho
   de la pantalla, se queda con el paso de las demás. */
export const COL_MAXIMA = 96;
export const TOPE_POR_TIRA = 26;
export const POR_FILA_TELEFONO = 5;
/* El canal del eje del peso, a la izquierda. Fijo, como en la gráfica del
   Resumen: con uno que se ajustara a la cifra, cada tira empezaría en un sitio. */
export const CANAL = 40;

/**
 * El ancho de columna, cuántas semanas caben por tira y si la casilla va
 * compacta. Una sola medida para todas las tiras del cliente.
 *
 * @param ancho    el ancho disponible, canal incluido.
 * @param mayor    las semanas de la fase más larga.
 */
export const medirColumnas = ({ ancho, mayor, telefono = false }) => {
  const util = Math.max(0, ancho - CANAL);
  const n = Math.max(1, Math.min(TOPE_POR_TIRA, mayor));
  let porTira;
  let col;
  if (telefono) {
    porTira = POR_FILA_TELEFONO;
    col = util / porTira;
  } else {
    col = util / n;
    porTira = n;
    if (col < COL_COMPACTA) {
      porTira = Math.max(1, Math.floor(util / COL_COMPACTA));
      col = util / porTira;
    }
  }
  col = Math.min(col, COL_MAXIMA);
  return { col, porTira, compacta: col < COL_COMPLETA };
};

/** Parte una lista en tramos de como mucho `porTira`, lo más iguales posible. */
export const partir = (lista, porTira) => {
  if (lista.length <= porTira) return [lista];
  const k = Math.ceil(lista.length / porTira);
  const talla = Math.ceil(lista.length / k);
  const tramos = [];
  for (let i = 0; i < lista.length; i += talla) tramos.push(lista.slice(i, i + talla));
  return tramos;
};
