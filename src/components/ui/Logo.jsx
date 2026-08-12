/**
 * Marca de Caveman Hub.
 *
 * ── Qué dibuja ──────────────────────────────────────────────────────────────
 * Tres barras ascendentes: leen a la vez como piedras —el «caveman»— y como una
 * progresión creciente, que es de lo que va el producto. Esa idea se conserva;
 * lo que cambia es de qué está hecha.
 *
 * ── Por qué ya no es un degradado verde ─────────────────────────────────────
 * Porque el resto de la aplicación dejó de tener color en el cromo: el acento es
 * tiza, y el color quedó reservado al dato (ver `styles/tokens.css`). Un
 * logotipo con un degradado esmeralda dentro de una interfaz acromática no es
 * una marca, es el resto de otra.
 *
 * Ahora es lo mismo que la interfaz: hierro y tiza. Y lleva UNA sola gota de
 * color, en la barra más alta: el rojo del disco de 25 kg, que es el que se pone
 * cuando la barra va cargada de verdad. Es el único sitio de todo el producto
 * donde el cromo se permite una tinta, y significa algo: hasta dónde ha llegado
 * esto.
 *
 * ── Las tintas van literales, no en tokens ──────────────────────────────────
 * A propósito, y por eso el archivo está en `COLOR_EXCEPTIONS` de
 * `scripts/verify-styles.mjs`: una marca tiene que verse IGUAL en tema claro y
 * oscuro. Si el mark siguiera a los tokens, en claro sería un cuadrado casi
 * blanco con barras casi negras —el negativo de sí mismo— y dejaría de ser
 * reconocible como icono de aplicación. El favicon de `index.html` repite estos
 * mismos valores: si cambian aquí, hay que cambiarlos allí.
 */

const IRON = '#14181c';
const CHALK = '#e8ecf1';
const PLATE_25 = '#e2564a';

/** x, altura y si va cargada. La tercera es la que lleva el disco rojo. */
const BARS = [
  { x: 7, h: 11, loaded: false },
  { x: 14.5, h: 17, loaded: false },
  { x: 22, h: 24, loaded: true },
];

export const LogoMark = ({ size = 34, rounded = true }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 34 34"
    role="img"
    aria-label="Caveman Hub"
    style={{ flexShrink: 0 }}
  >
    {rounded && <rect width="34" height="34" rx="8" fill={IRON} />}

    {BARS.map(({ x, h, loaded }) => (
      /*
        Cada barra es un grupo de dos piezas: el cuerpo en tiza y, en la cargada,
        una banda roja arriba. Se dibuja como un rectángulo aparte y no como un
        borde porque a 16 px un borde de medio píxel desaparece y el icono pierde
        justo lo que lo distingue.

        `rounded={false}` es el uso en línea (dentro de un texto o un botón): ahí
        el mark hereda el color del texto y no lleva disco, porque un punto rojo
        suelto dentro de un párrafo se lee como un error.
      */
      <g key={x}>
        <rect
          x={x}
          y={29 - h}
          width="5"
          height={h}
          rx="1.5"
          fill={rounded ? CHALK : 'currentColor'}
        />
        {loaded && rounded && <rect x={x} y={29 - h} width="5" height="3.5" rx="1.5" fill={PLATE_25} />}
      </g>
    ))}
  </svg>
);

export const Logo = ({ subtitle = 'Entrenamiento y progreso' }) => (
  <div className="brand">
    <LogoMark />
    <div>
      <div className="brand-name">Caveman Hub</div>
      {subtitle && <div className="brand-sub">{subtitle}</div>}
    </div>
  </div>
);
