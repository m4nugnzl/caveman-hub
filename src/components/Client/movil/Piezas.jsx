import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, User } from 'lucide-react';

/**
 * LAS PIEZAS DEL PORTAL EN EL TELÉFONO — el vocabulario de los frames de Figma
 * del 18 de septiembre de 2026 (`327:8` y hermanos).
 *
 * ══ La gramática, que es una sola ══════════════════════════════════════════
 *
 * Lienzo blanco, y lo que separa una cosa de otra es un FILETE a todo lo ancho,
 * no una tarjeta con sombra. Cada tramo lleva su rótulo en versalitas de 11 px y
 * 24 px de aire. Las cajas con canto son la excepción y dicen algo: «esto se
 * pulsa entero» (la próxima sesión, la lista de sesiones, la comida abierta).
 * Es la misma gramática que la web del entrenador desde el rediseño de Figma:
 * el canto separa, el lienzo no se tiñe.
 *
 * ── Lo que NO se copia del dibujo, y por qué ──────────────────────────────
 * El verde de acción de los frames es aquí el azul de la casa (`--accent`): el
 * dueño lo eligió así el 18 sep, porque el verde es el del semáforo («hecho»,
 * «va bien») y con letra blanca no llegaba a contraste. El verde se queda
 * donde de verdad dice «hecho». Ver `figma-movil-del-cliente` en la memoria.
 *
 * Los iconos son los de `lucide`, que es de donde salen los del dibujo (house,
 * dumbbell, utensils, clipboard-check…): la misma familia que la barra lateral
 * de la web.
 */

/**
 * LA CABECERA de un destino: el titular y un dato debajo.
 *
 * Con `perfil`, la puerta a «Tú» arriba a la derecha: desde el 18 sep la barra
 * lleva «Revisión» y la persona sale de ella. Con `atras`, la flecha de una
 * pantalla empujada (el registro de peso, la hoja antes de empezar); con
 * `disco`, esa flecha en su disco de 40 px, como la dibuja el cuestionario.
 */
export const Cabecera = ({ titulo, sub, perfil, atras, grande = false, disco = false }) => (
  <header
    className={`tel-cab${atras ? ' tel-cab-atras' : ''}${grande ? ' tel-cab-grande' : ''}${disco ? ' tel-cab-disco' : ''}`}
  >
    <div className="tel-cab-linea">
      {atras ? <Atras {...atras} /> : null}
      <h1 className="tel-cab-tit">{titulo}</h1>
      {perfil ? (
        <Link className="tel-cab-perfil" to={perfil} aria-label="Tu perfil">
          <User size={15} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
    {sub ? <p className="tel-cab-sub">{sub}</p> : null}
  </header>
);

const Atras = ({ to, onClick, etiqueta = 'Volver' }) =>
  to ? (
    <Link className="tel-atras" to={to} aria-label={etiqueta}>
      <ArrowLeft size={20} aria-hidden="true" />
    </Link>
  ) : (
    <button type="button" className="tel-atras" onClick={onClick} aria-label={etiqueta}>
      <ArrowLeft size={20} aria-hidden="true" />
    </button>
  );

/**
 * UN TRAMO: 24 px de aire y un filete encima. Es la unidad de la pantalla.
 * `rotulo` es la versalita de arriba; `accion`, el verbo callado a su derecha.
 */
export const Tramo = ({ rotulo, accion, className = '', children, ...resto }) => (
  <section className={`tel-seccion ${className}`.trim()} {...resto}>
    {rotulo || accion ? (
      <div className="tel-rotulo">
        {rotulo ? <span>{rotulo}</span> : null}
        {accion || null}
      </div>
    ) : null}
    {children}
  </section>
);

/** El botón: la píldora de 48 px, en azul. `callado`, en gris y sin fuerza. */
export const Boton = ({ callado, to, onClick, children, className = '', ...resto }) => {
  const clase = `tel-boton${callado ? ' tel-callado' : ''} ${className}`.trim();
  return to ? (
    <Link className={clase} to={to} {...resto}>
      {children}
    </Link>
  ) : (
    <button type="button" className={clase} onClick={onClick} {...resto}>
      {children}
    </button>
  );
};

/**
 * EL ANILLO de lo que llevas: «16/19» dentro, el arco alrededor.
 *
 * Es cuánto llevas de ESTA sesión, no un juicio: por eso va en azul, el color
 * de «dónde estás», y no en el verde del dibujo.
 */
export const Anillo = ({ hechas, total, tam = 56 }) => {
  const r = tam / 2 - 4;
  const c = 2 * Math.PI * r;
  const parte = total > 0 ? Math.min(1, hechas / total) : 0;
  return (
    <span
      className="tel-anillo"
      style={{ width: tam, height: tam }}
      role="img"
      aria-label={`${hechas} de ${total} series`}
    >
      <svg viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle className="tel-anillo-fondo" cx={tam / 2} cy={tam / 2} r={r} />
        <circle
          className="tel-anillo-arco"
          cx={tam / 2}
          cy={tam / 2}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - parte)}
        />
      </svg>
      <span className="tel-anillo-n">
        {hechas}/{total}
      </span>
    </span>
  );
};

/**
 * La chapa: un dato pequeño con su canto («Espalda», «Objetivo: 8-10»). Con
 * la mayúscula de un nombre: el grupo muscular llega en minúscula del catálogo
 * («pecho») y en el dibujo es una etiqueta («Pecho»).
 */
export const Chapa = ({ children }) => (
  <span className="tel-chapa">
    {typeof children === 'string' ? children.charAt(0).toUpperCase() + children.slice(1) : children}
  </span>
);

/** El estado de una fila: «Hecho» en verde, lo demás en gris. */
export const Estado = ({ tono = 'nada', children }) => (
  <span className={`tel-estado tel-${tono}`}>{children}</span>
);

/**
 * LA LISTA EN CAJA: las filas de las sesiones, del menú de «Tú», de la entrega.
 * Una caja con canto y filetes entre filas.
 */
export const Lista = ({ children, className = '' }) => (
  <div className={`tel-lista-caja ${className}`.trim()}>{children}</div>
);

/**
 * UNA FILA: título, dato debajo, y a la derecha lo que tenga (un estado, una
 * cifra) o el galón. Es enlace, botón o dato según lo que se le dé.
 */
export const Fila = ({ titulo, sub, derecha, delante, to, onClick, galon = true, apagada }) => {
  const dentro = (
    <>
      {delante || null}
      <span className="tel-fila-tx">
        <span className="tel-fila-tit">{titulo}</span>
        {sub ? <span className="tel-fila-sub">{sub}</span> : null}
      </span>
      {derecha || null}
      {galon && (to || onClick) ? <ChevronRight className="tel-galon" size={15} aria-hidden="true" /> : null}
    </>
  );
  const clase = `tel-fila${apagada ? ' tel-apagada' : ''}`;
  if (to) {
    return (
      <Link className={clase} to={to}>
        {dentro}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={clase} onClick={onClick}>
        {dentro}
      </button>
    );
  }
  return <div className={clase}>{dentro}</div>;
};

/**
 * LA LÍNEA DEL PESO: los últimos pesajes, sin ejes. El último punto va marcado.
 *
 * Solo se dibuja con tres puntos o más, y se pinta en tinta: la curva dice
 * hacia dónde va, y hacia dónde DEBE ir no lo sabe la pantalla (bajar no es
 * «bien» para quien está ganando masa).
 */
export const Linea = ({ puntos, ancho = 80, alto = 30, className = '' }) => {
  if (!puntos || puntos.length < 3) return null;
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min || 1;
  const pad = 3;
  const x = (i) => pad + (i * (ancho - pad * 2)) / (puntos.length - 1);
  const y = (v) => alto - pad - ((v - min) / rango) * (alto - pad * 2);
  const d = puntos.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ultimo = puntos.length - 1;
  return (
    <svg
      className={`tel-linea ${className}`.trim()}
      viewBox={`0 0 ${ancho} ${alto}`}
      width={ancho}
      height={alto}
      aria-hidden="true"
    >
      <path d={d} />
      <circle cx={x(ultimo)} cy={y(puntos[ultimo])} r="2.6" />
    </svg>
  );
};

/* ══ Las piezas de antes que siguen vivas ══════════════════════════════════
   «Mi progreso» (`PantallaProgreso`) se abre desde «Tú» y no tiene frame
   propio: se queda con su marcado y viste el traje nuevo a través de estas. */

export const Tarjeta = ({ plana, className = '', children }) => (
  <div className={['tel-tarjeta', plana ? 'tel-plana' : '', className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

export const Titulillo = ({ children, accion }) => (
  <div className="tel-rotulo tel-rotulo-suelto">
    <span>{children}</span>
    {accion || null}
  </div>
);

/** Tres cifras centradas, cada una en su caja: las de tu perfil. */
export const Record = ({ items }) => (
  <div className="tel-record">
    {items.map((c) => (
      <div key={c.k}>
        <div className="tel-v">{c.v}</div>
        <div className="tel-k">{c.k}</div>
      </div>
    ))}
  </div>
);

/**
 * LO QUE VIENE DE SU ENTRENADOR: una novedad o algo que te ha mandado.
 *
 * El aspa tiene que ser hermana del enlace —un botón dentro de un enlace no es
 * HTML válido—, así que la fila es el marco que junta las dos cosas. Lo
 * mandado no lleva aspa: no es un aviso de algo que pasó, es algo que falta
 * por hacer, y desaparece al hacerlo.
 */
export const Aviso = ({ que, cual, to, verbo, onQuitar, etiqueta, onClick }) => {
  const dicho = (
    <>
      <span className="tel-fila-tit">{que}</span>
      {cual ? <span className="tel-fila-sub">{cual}</span> : null}
    </>
  );
  return (
    <div className="tel-aviso">
      <span className="tel-aviso-punto" aria-hidden="true" />
      {to ? (
        <Link className="tel-dicho" to={to}>
          {dicho}
        </Link>
      ) : onClick ? (
        <button type="button" className="tel-dicho" onClick={onClick}>
          {dicho}
        </button>
      ) : (
        <span className="tel-dicho">{dicho}</span>
      )}
      {/* El verbo solo si hay a dónde ir: un aviso del entrenador es una frase,
          y «Abrir» delante de ella prometería una pantalla que no existe. */}
      {to || onClick ? <span className="tel-ir">{verbo || 'Abrir'}</span> : null}
      {onQuitar ? (
        <button type="button" className="tel-aspa" aria-label={etiqueta} onClick={onQuitar}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
};

/** El aire del final, para que lo último no quede debajo de la barra. */
export const Aire = () => <div className="tel-aire" />;
