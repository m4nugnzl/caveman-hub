/**
 * EL GLOBO DE UNA GRÁFICA: lo que dice una semana cuando la señalas.
 *
 * ══ Por qué es una pieza ═══════════════════════════════════════════════════
 *
 * Nació en la gráfica del Resumen y la vista de temporada necesita el mismo:
 * la misma caja, el mismo sitio, la misma manera de volcarse al otro lado
 * cuando no cabe. Copiarlo habría bastado para que a los dos meses una tuviera
 * la cifra en negrita y la otra no.
 *
 * ══ Es una LECTURA, no un mando ════════════════════════════════════════════
 *
 * No lleva a ningún sitio y no cambia nada: sale al pasar por un punto, dice lo
 * de esa semana y se va. Por eso va `aria-hidden`: lo que cuenta ya está en el
 * `aria-label` de lo que se está señalando, y un lector de pantalla no tiene
 * que oírlo dos veces.
 *
 * ── Una caja, no dos ───────────────────────────────────────────────────────
 * Un globo por serie serían dos cajas diciendo cada una media semana, y habría
 * que mirar a dos sitios para cruzar lo único que hay que cruzar.
 */

export const ANCHO_GLOBO = 190;
/* Lo que mide un globo lleno. Se usa para que no se salga por abajo. */
export const ALTO_GLOBO = 124;

const dentro = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Dónde se pone el globo: al lado del punto, y al otro lado si no cabe.
 *
 * @param x,y  el punto señalado, en píxeles del dibujo.
 * @param W,H  el dibujo.
 * @returns `{ left, top }` para el estilo.
 */
export const sitioDelGlobo = ({ x, y, W, H, ancho = ANCHO_GLOBO, alto = ALTO_GLOBO, aire = 14 }) => ({
  left: x + aire + ancho <= W ? x + aire : x - aire - ancho,
  top: dentro(y - 40, 0, Math.max(0, H - alto)),
});

export const Globo = ({ left, top, ancho = ANCHO_GLOBO, cab, marca, children }) => (
  <div className="progreso-globo" style={{ left, top, width: ancho }} aria-hidden="true">
    <span className="progreso-globo-cab">
      {cab}
      {marca && <span className="progreso-globo-marca">{marca}</span>}
    </span>
    {children}
  </div>
);

/** La cifra gorda: el dato por el que se abre el globo. */
export const GloboCifra = ({ color, unidad, children }) => (
  <b style={color ? { color } : undefined}>
    {children}
    {unidad && <small> {unidad}</small>}
  </b>
);

/** Una línea de las de debajo, con la muestra del trazo del que habla. */
export const GloboLinea = ({ muestra = null, color = null, children }) => (
  <span className="progreso-globo-linea">
    {muestra && (
      <i
        className={`is-${muestra}`}
        style={muestra === 'fondo' ? { background: color } : color ? { borderColor: color } : undefined}
      />
    )}
    {children}
  </span>
);

/** Cuando esa semana no tiene el dato. Se dice; no se deja el hueco. */
export const GloboNada = ({ children }) => <span className="progreso-globo-nada">{children}</span>;
