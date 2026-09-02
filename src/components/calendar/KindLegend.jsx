/* Aquí vivió `WeekBoard`, el tablero de la semana en siete columnas. Sus dos
   pantallas lo cambiaron por «Lo próximo» —la lista con fecha y nombre— porque
   su caso normal era una fila de cajas punteadas de «Libre» encima de un mes
   que ya enseña esa misma semana. Un patrón sin consumidores no se queda de
   recuerdo; la leyenda de colores, que sí se usa, se queda con archivo propio. */

/**
 * Qué significa cada color, en fila.
 *
 * Va en la cabecera de su panel y no debajo: es la clave para leer lo que hay
 * en pantalla, y una leyenda que aparece después de lo que explica llega tarde.
 */
export const KindLegend = ({ kinds }) => (
  <span className="cal-key" aria-hidden="true">
    {kinds.map((k) => (
      <span className="cal-key-item" key={k.id}>
        <span className="cal-dot" style={{ background: k.color }} />
        {k.label}
      </span>
    ))}
  </span>
);
