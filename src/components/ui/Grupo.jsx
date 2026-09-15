import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * UN GRUPO DE FILAS: la primitiva de bloque del teléfono.
 *
 * ══ Por qué existe, si ya está `Panel` ═════════════════════════════════════
 *
 * Porque `Panel` es una primitiva de ESCRITORIO: sirve para recortar una columna
 * dentro de un ancho de 1440 px. En 390 px el ancho de la pantalla ya es el
 * contenedor, así que cada caja solo añade dos filetes, dos radios y el relleno
 * lateral que le quita al contenido — y cuando hay caja dentro de caja dentro de
 * caja, como tenía la dieta del cliente, lo que queda del texto es una columna de
 * 280 px con tres cantos alrededor.
 *
 * El teléfono no apila paneles: **empuja**. Todo lo secundario deja de ser un
 * panel más abajo y pasa a ser una FILA que abre su propia pantalla. Esta es esa
 * fila, y el grupo que las junta.
 *
 * Ver `docs/replanteamiento-movil-el-aparato.md`, Ley 2.
 *
 * ══ No es una lista nueva: es `.list` ══════════════════════════════════════
 *
 * El traje sale de `.list` / `.list-row`, que es la lista agrupada que el
 * producto ya tenía —misma superficie, mismo filete sangrado entre filas, mismo
 * radio—. Lo único que añade es el modificador `es-puerta`: la fila entera se
 * pulsa y termina en chevron.
 *
 * ── Y el chevron está permitido, aunque no haya flechas ────────────────────
 * La ley de los gestos dice que no hay flechas en el producto y deja viva una
 * excepción escrita: «el chevron de `.task-row`, que cierra una fila entera
 * pulsable en vez de rotular un verbo». Esto es exactamente ese caso. Lo que no
 * se hace es colgarle un adorno a una palabra.
 */
export const Grupo = ({ title, className = '', children, ...rest }) => (
  <div className={`grupo-filas${className ? ` ${className}` : ''}`} {...rest}>
    {/* El rótulo va FUERA de la superficie, encima. Dentro sería una cabecera de
        panel, que es justo la caja que este grupo viene a quitar. */}
    {title && <span className="grupo-filas-rotulo">{title}</span>}
    <div className="list">{children}</div>
  </div>
);

/**
 * Una fila que lleva a otro sitio.
 *
 * @param to     Ruta interna: se pinta como `Link`.
 * @param href   Enlace externo: se pinta como `<a>` y sale con `target="_blank"`.
 * @param onClick Sin `to` ni `href`, se pinta como `<button>`.
 * @param icono  El dibujo de la fila, en su tesela gris (`.list-icon`). Es lo
 *   que deja recorrer una lista de seis puertas sin leerse las seis: se
 *   reconoce por el dibujo y por el sitio. **Gris, siempre**: las pastillas de
 *   colores de Ajustes de iOS son color por categoría y la ley del color lo
 *   prohíbe. Lo pone la pantalla y no la fila porque el dibujo dice de qué es
 *   ESTA puerta, y eso solo lo sabe quien la escribe.
 * @param title  Lo que es. Una sola línea.
 * @param sub    Qué hay dentro, o en qué estado está. Opcional.
 * @param valor  La cifra o el recuento de la derecha. Opcional.
 * @param avisa  El punto de acento: aquí hay algo esperándote.
 * @param verbo  Esta fila no dice cómo vas: dice qué tienes que hacer. Va en
 *   azul —nombre y tesela—, que es la ley de los gestos de la casa. Una por
 *   lista como mucho: dos verbos en azul seguidos no distinguen nada.
 *
 * ── Sin ninguno de los tres destinos, la fila es un DATO ───────────────────
 * Y entonces no lleva chevron ni se enciende. Hace falta porque en el mismo
 * grupo conviven las dos cosas —«Pautas de tu entrenador ›» abre una capa,
 * «Pasos · 11.000» no abre nada— y un chevron colgado de algo que no se pulsa
 * es la promesa rota más barata que hay. La alternativa, sacar el dato a otro
 * sitio, sería partir en dos lo que el cliente lee como una lista: lo que le han
 * pautado además del menú.
 */
export const Fila = ({
  to = null,
  href = null,
  onClick = null,
  icono: Icono = null,
  title,
  sub = null,
  valor = null,
  avisa = false,
  verbo = false,
  disabled = false,
  ...rest
}) => {
  const abre = Boolean(to || href || onClick);

  const dentro = (
    <>
      {/* El punto va DELANTE y es estructural, no estado: qué espera lo dice el
          texto de al lado. Es el mismo punto que lleva la cola del entrenador. */}
      {avisa && <span className="fila-punto" aria-hidden="true" />}
      {/* La tesela va detrás del punto: el punto es lo primero que se lee de la
          lista entera —quién espera— y el dibujo es de esta fila. */}
      {Icono && (
        <span className="list-icon" aria-hidden="true">
          <Icono size={15} />
        </span>
      )}
      <span className="list-row-label">
        <span className="title">{title}</span>
        {sub && <span className="sub">{sub}</span>}
      </span>
      {valor !== null && valor !== undefined && <span className="row-meta">{valor}</span>}
      {abre && <ChevronRight className="chevron" size={15} aria-hidden="true" />}
    </>
  );

  const clase = `list-row${abre ? ' es-puerta' : ''}${verbo ? ' es-verbo' : ''}`;

  if (href) {
    return (
      <a className={clase} href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {dentro}
      </a>
    );
  }
  if (to) {
    return (
      <Link className={clase} to={to} {...rest}>
        {dentro}
      </Link>
    );
  }
  if (!abre) {
    return (
      <div className={clase} {...rest}>
        {dentro}
      </div>
    );
  }
  return (
    <button type="button" className={clase} onClick={onClick} disabled={disabled} {...rest}>
      {dentro}
    </button>
  );
};
