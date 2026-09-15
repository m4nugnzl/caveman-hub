import { Link } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';

/**
 * LAS PIEZAS DEL PORTAL EN EL MONITOR — el vocabulario de «Cajas».
 *
 * Cinco piezas y ninguna más: la tesela, la caja, la fila, la píldora y el
 * botón. Todo lo que se pinta en las siete pantallas del monitor se compone con
 * estas. El traje vive en `styles/portal-pc.css` y el porqué de cada decisión
 * está allí — aquí solo está la forma.
 *
 * ── Por qué no se reutilizan `ui/Grupo` y `ui/primitives` ──────────────────
 * Porque el lenguaje es otro a propósito. `Grupo`/`Fila` son la lista del
 * producto de siempre —papel cálido, sin canto, escala de lectura a 16 px— y
 * lo que el dueño pidió aquí es justo lo contrario: panel de 13-14 px, caja con
 * canto sobre lienzo frío. Vestir las piezas viejas con clases nuevas habría
 * dejado dos trajes peleándose por especificidad en cada pantalla.
 *
 * Lo que sí se comparte, y es lo que importa: los tokens del acento, del verde
 * y del ámbar. La ley del color no se toca.
 */

/* ── La tesela: rótulo · cifra · delta ─────────────────────────────────────
   Abría las siete pantallas del monitor; hoy abre las dos que quedan de este
   lenguaje —«Hoy» y «Tú»—. Deja de exportarse suelta: solo la monta `Teselas`,
   y una exportación que nadie importa es una puerta que no lleva a ningún sitio
   (la usaban las cinco pantallas que se han ido a las piezas de la casa). */
const Tesela = ({ rot, icono: Icono, val, uni, delta, pie }) => (
  <div className="pc-tesela">
    <div className="pc-rot">
      {Icono ? <Icono size={13} /> : null}
      {rot}
    </div>
    <div className="pc-val">
      {val}
      {uni ? <small>{uni}</small> : null}
      {delta ? <span className={`pc-delta pc-${delta.tono}`}>{delta.texto}</span> : null}
    </div>
    {pie ? <div className="pc-pie">{pie}</div> : null}
  </div>
);

/** La tira. Tres o cuatro; con tres se ciñe para no hacer teselas de 430 px. */
export const Teselas = ({ items }) => (
  <div className={`pc-teselas${items.length === 3 ? ' pc-de-3' : ''}`}>
    {items.map((t) => (
      <Tesela key={t.rot} {...t} />
    ))}
  </div>
);

/**
 * LA CAJA. Cabecera con filete, cuerpo y pie donde vive el verbo.
 *
 * `sinRelleno` es para cuando el cuerpo trae su propio relleno —una tabla, una
 * lista de filas—: meterlas dentro de otros 18 px las despega del canto.
 */
export const Caja = ({ tit, meta, enlace, pie, sinRelleno, className = '', children }) => (
  <div className={`pc-caja ${className}`.trim()}>
    {tit ? (
      <div className="pc-caja-cab">
        <h3>{tit}</h3>
        {enlace || (meta ? <span className="pc-meta">{meta}</span> : null)}
      </div>
    ) : null}
    {sinRelleno ? children : <div className="pc-caja-cuerpo">{children}</div>}
    {pie ? <div className="pc-caja-pie">{pie}</div> : null}
  </div>
);

/** El enlace de la cabecera de una caja. */
export const Enlace = ({ to, onClick, callado, children }) => {
  const clase = `pc-enlace${callado ? ' pc-callado' : ''}`;
  if (to) {
    return (
      <Link className={clase} to={to}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={clase} onClick={onClick}>
      {children}
    </button>
  );
};

/** La píldora de estado. Sustituye al texto gris de antes (avería E-12). */
export const Pildora = ({ tono = 'nada', children }) => (
  <span className={`pc-pildora pc-${tono}`}>{children}</span>
);

/**
 * La fila de dentro de una caja. Es un enlace, un botón o nada según lleve
 * `to`, `onClick` o ninguno de los dos — y el galón solo se pinta cuando de
 * verdad lleva a algún sitio.
 */
export const Fila = ({ icono: Icono, rotulo, frase, cifra, pildora, to, onClick }) => {
  const dentro = (
    <>
      {Icono ? (
        <span className="pc-icono">
          <Icono size={15} />
        </span>
      ) : null}
      <span className="pc-cuerpo">
        <span className="pc-rotulo">{rotulo}</span>
        {frase ? <span className="pc-frase">{frase}</span> : null}
      </span>
      <span className="pc-fin">
        {cifra ? <span className="pc-cifra">{cifra}</span> : null}
        {pildora ? <Pildora tono={pildora.tono}>{pildora.texto}</Pildora> : null}
        {to || onClick ? (
          <span className="pc-chevron">
            <ChevronRight size={15} />
          </span>
        ) : null}
      </span>
    </>
  );

  if (to) {
    return (
      <Link className="pc-fila pc-tocable" to={to}>
        {dentro}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="pc-fila pc-tocable" onClick={onClick}>
        {dentro}
      </button>
    );
  }
  return <div className="pc-fila">{dentro}</div>;
};

export const Filas = ({ children }) => <div className="pc-filas">{children}</div>;

/**
 * La fila con su aspa: una NOVEDAD, que es lo único de esta casa que se
 * descarta.
 *
 * ── Por qué el aspa no es una bandera de `Fila` ────────────────────────────
 * Porque la fila entera es el enlace, y un botón dentro de un enlace no es HTML
 * válido ni se puede pulsar sin abrir lo de detrás. El aspa tiene que ser
 * HERMANA de la fila, así que lo que hace falta es el marco que las junta.
 *
 * Un pendiente NO lo lleva: no es un aviso de algo que ha pasado, es algo que
 * falta por hacer, y desaparece solo al hacerlo — que es la única forma honesta
 * de quitarlo.
 */
export const Descartable = ({ onQuitar, etiqueta, ...fila }) => (
  <div className="pc-descartable">
    <Fila {...fila} />
    <button type="button" className="pc-aspa" aria-label={etiqueta} onClick={onQuitar}>
      <X size={13} />
    </button>
  </div>
);

/** El botón. Primario en pastilla; secundario en rectángulo redondeado. */
export const Boton = ({
  pri,
  grande,
  ancho,
  menudo,
  to,
  onClick,
  icono: Icono,
  children,
  ...resto
}) => {
  const clase = [
    'pc-btn',
    pri ? 'pc-pri' : '',
    grande ? 'pc-grande' : '',
    ancho ? 'pc-ancho' : '',
    menudo ? 'pc-menudo' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dentro = (
    <>
      {Icono ? <Icono size={15} /> : null}
      {children}
    </>
  );

  if (to) {
    return (
      <Link className={clase} to={to} {...resto}>
        {dentro}
      </Link>
    );
  }
  return (
    <button type="button" className={clase} onClick={onClick} {...resto}>
      {dentro}
    </button>
  );
};

/**
 * La regla de series de una sesión: una muesca por serie, encendidas las
 * anotadas. Con más de sesenta series no se pinta una muesca por serie —serían
 * rayas de un píxel— sino la barra entera con su relleno.
 */
export const Tramos = ({ hechas, total }) => {
  if (!total) return null;
  if (total > 60) {
    return (
      <div className="pc-tramos">
        <i className="pc-hecha" style={{ flex: hechas }} />
        <i style={{ flex: Math.max(0, total - hechas) }} />
      </div>
    );
  }
  return (
    <div className="pc-tramos">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < hechas ? 'pc-hecha' : undefined} />
      ))}
    </div>
  );
};

/**
 * La chispa: la curva del peso en pequeño, dentro de una caja.
 *
 * Hecha a mano y no con una librería por lo mismo que en el resto del producto:
 * son dos decenas de puntos y una polilínea, y traer una dependencia para eso
 * es traer su tamaño y sus decisiones de estilo.
 *
 * Con menos de tres puntos NO se dibuja: una curva de un pesaje es la avería
 * E-08 —un eje de 68,2 a 53,6 para un solo dato—. Quien la use decide qué
 * escribe en su lugar.
 */
export const Chispa = ({ puntos, color = 'var(--pc-trazo)' }) => {
  if (!puntos || puntos.length < 3) return null;
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min || 1;
  const d = puntos
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i * 200) / (puntos.length - 1)).toFixed(1)} ${(
          34 -
          ((v - min) / rango) * 28
        ).toFixed(1)}`
    )
    .join(' ');
  return (
    <svg
      className="pc-grafica"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      style={{ height: '40px' }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/*
 * ── Aquí vivieron `Curva` y `Barras`, y se fueron el 14 sep ───────────────
 *
 * La curva grande del peso y las barras del tonelaje por microciclo, dibujadas
 * a mano con su propio eje y su propia escala. Solo las pintaba
 * `pc/PantallaProgreso`, que ha dejado de existir: el monitor monta ahora el
 * panel del entrenador, con los `BandChart` y `BarBandChart` de `ui/charts`.
 *
 * Dibujar el mismo dato de dos maneras no es duplicar código, es duplicar el
 * DATO: la curva del entrenador lleva banda y media móvil y esta era una
 * polilínea cruda del mismo historial, así que las dos podían contar cosas
 * distintas del mismo peso a dos personas que iban a hablar entre ellas.
 */

/* Aquí estaba `Vacio`, el vacío de una caja de este lenguaje. Se ha ido con
   las cinco pantallas que lo montaban: las de la casa usan `EmptyState`, que es
   el vacío del producto y trae su dibujo, su titular y su verbo. La clase
   `.pc-vacio` se queda porque «Hoy» todavía la escribe. */
