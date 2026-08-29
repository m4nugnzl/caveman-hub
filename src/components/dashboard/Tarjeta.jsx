/**
 * UNA TARJETA DEL MOSAICO.
 *
 * ══ Por qué el panel es un mosaico de doce columnas ════════════════════════
 *
 * Se probaron tres formas antes: diez cajas apiladas sin jerarquía, una hoja
 * con tramos, y dos hojas en pestañas. Y una cuarta —tres bloques a todo el
 * ancho— que era mejor y seguía sin funcionar: cada bloque medía metro y medio
 * y dentro cabía de todo, así que el panel se leía de arriba abajo como un
 * informe y no de un vistazo como un cuadro de mandos.
 *
 * Un mosaico de verdad tiene tarjetas de DISTINTO TAMAÑO y de UN SOLO ASUNTO
 * cada una: la que manda ocupa dos tercios, lo que se mira de reojo un tercio,
 * y una fila de tres cuartos iguales para lo que se compara entre sí. Es la
 * forma de cualquier panel que dé gusto mirar, y la de la referencia.
 *
 * ══ La gramática de una tarjeta, y no hay otra ═════════════════════════════
 *
 *     ┌──────────────────────────────────────────┐
 *     │ RÓTULO TROQUELADO              acción →  │
 *     │                                          │
 *     │  UNA cosa: una forma y su cifra          │
 *     └──────────────────────────────────────────┘
 *
 * · El rótulo dice de qué va, en troquelada. Nunca dos títulos.
 * · La acción, si la hay, abre su ventana o despliega. A la derecha, como texto.
 * · Dentro, UNA cosa. Una tarjeta que enseña dos gráficos es dos tarjetas.
 *
 * ── Y por qué no lleva icono ────────────────────────────────────────────────
 * Porque el interés visual de este panel tiene que venir del DATO —la
 * trayectoria de la fase, el anillo de la semana, la escalera bajo el peso, las
 * barras de lo subjetivo, la tabla de la rutina—, no de una fila de iconos
 * decorativos delante de cada rótulo. Con icono, nueve tarjetas se leen como un
 * menú; sin él, como nueve medidas.
 *
 * @param span     Columnas de doce que ocupa: 12, 8, 6 o 4. Lo que lleva una
 *   serie temporal o una tabla pide 8: a un tercio de ancho, un eje de doce
 *   semanas no cabe.
 * @param abierta  Desplegada «a fondo»: pasa a ocupar el ancho entero, porque
 *   lo que despliega —tablas semana a semana— no cabe en su sitio.
 * @param vacia    Sin dato que enseñar. Centra el contenido y lo apaga, para que
 *   un panel a medio llenar no parezca un panel roto.
 */
export const Tarjeta = ({
  rotulo,
  accion = null,
  span = 4,
  abierta = false,
  vacia = false,
  className = '',
  children,
}) => (
  <section
    className={['tarjeta', `is-${span}`, abierta && 'is-abierta', vacia && 'is-vacia', className]
      .filter(Boolean)
      .join(' ')}
  >
    <header className="tarjeta-cab">
      <span className="section-label">{rotulo}</span>
      {accion}
    </header>
    <div className="tarjeta-cuerpo">{children}</div>
  </section>
);

/**
 * Lo que se pinta cuando una tarjeta no tiene nada que enseñar.
 *
 * ── Por qué no es una frase gris en una esquina ─────────────────────────────
 * Porque así era, y con dos tarjetas sin dato el panel entero parecía roto: dos
 * medias columnas en blanco con una línea de texto arriba a la izquierda. Un
 * vacío tiene que decir DE QUÉ está vacío y DÓNDE se llena; puesto en el centro
 * y con su enlace, se lee como una tarjeta que todavía no ha empezado en vez de
 * como una que ha fallado.
 */
export const TarjetaVacia = ({ children, accion = null }) => (
  <div className="tarjeta-hueco">
    <p>{children}</p>
    {accion}
  </div>
);

/** El botón de desplegar «a fondo» de una tarjeta, con su chincheta de aviso. */
export const AccionAFondo = ({ abierto, aviso = null, onClick }) => (
  <button type="button" className="cab-accion" aria-expanded={abierto} onClick={onClick}>
    {aviso && !abierto && <span className={`ev-dot is-${aviso}`} aria-label="tiene avisos" />}
    {abierto ? 'Ver menos ↑' : 'Ver a fondo ↓'}
  </button>
);
