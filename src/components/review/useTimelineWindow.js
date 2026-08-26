import { useMemo, useState } from 'react';

import { windowFrom, windowSize } from '@/domain/timeline';

/**
 * LA VENTANA de la línea de tiempo: qué trozo se está mirando de cerca.
 *
 * ══ Por qué es un gancho y no estado de un componente ═══════════════════════
 *
 * Porque la línea son DOS piezas que tienen que decir lo mismo: la espina de
 * arriba —el proceso entero— dibuja una banda sobre el trozo que se está
 * mirando, y la ventana de abajo dibuja ese trozo. Si cada una guardara su
 * cuenta, la banda señalaría un sitio y el detalle enseñaría otro.
 *
 * Y ahora hay una razón más: la espina vive FUERA de los apartados —es el
 * selector de toda la pantalla— y la ventana vive DENTRO de dos de ellos. Estado
 * compartido por piezas que no se contienen: eso es un gancho.
 *
 * ── Y se deriva en cada render, sin efectos ────────────────────────────────
 * `windowFrom` es pura y de movimiento mínimo, así que recalcularla desde la
 * última posición anclada da siempre el mismo sitio. Un efecto persiguiendo a
 * `selected` es de donde salen los saltos de un fotograma.
 *
 * @param ancho  El ancho real en píxeles donde se va a dibujar. Lo mide la
 *   pantalla y no este gancho: la ventana se enseña en dos apartados distintos
 *   y uno de ellos puede estar oculto —midiendo cero— cuando el otro se ve.
 */
export const useTimelineWindow = ({ weeks = [], selected = null, ancho = 0 } = {}) => {
  const [anclada, setAnclada] = useState(null);

  const total = weeks.length;
  const tamano = Math.max(1, Math.min(total || 1, windowSize(ancho)));
  const indice = Math.max(
    0,
    weeks.findIndex((s) => s.week === selected)
  );

  const desde = windowFrom({ from: anclada, index: indice, size: tamano, total });
  const hasta = Math.min(total, desde + tamano);
  const visibles = useMemo(() => weeks.slice(desde, hasta), [weeks, desde, hasta]);

  /**
   * Elegir una semana. Ancla la ventana ANTES de avisar hacia arriba para que el
   * render que trae la semana nueva ya traiga la ventana correcta: hacerlo al
   * revés pinta un fotograma con la banda en el sitio de antes.
   */
  const elegir = (week, onSelect) => {
    const i = weeks.findIndex((s) => s.week === week);
    if (i >= 0) setAnclada(windowFrom({ from: anclada, index: i, size: tamano, total }));
    onSelect?.(week);
  };

  /** La semana de al lado, para las flechas. `null` si no hay. */
  const vecina = (paso) => weeks[indice + paso]?.week ?? null;

  return { total, tamano, indice, desde, hasta, visibles, elegir, vecina };
};
