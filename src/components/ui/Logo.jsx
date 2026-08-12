/**
 * Marca de Caveman Hub.
 *
 * La pesita anterior era el cliché de cualquier app de gimnasio y no decía nada
 * del producto, que va de seguir una progresión en el tiempo. Este mark son tres
 * monolitos ascendentes: leen a la vez como piedras —el "caveman"— y como una
 * progresión creciente. Y encaja en el formato de icono de app: contenedor
 * redondeado con degradado y glifo blanco, sin detalle fino, legible a 16 px.
 */

const MONOLITHS = [
  { x: 7, h: 12 },
  { x: 14.5, h: 18 },
  { x: 22, h: 25 },
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
    <defs>
      {/*
        Verde mineral, de claro a profundo. Antes iba de esmeralda a azul cielo:
        el azul no pertenecía a la paleta de marca —no aparecía en ningún otro
        sitio salvo aquí— y con el acento nuevo el salto de tinta cantaba. Un
        degradado dentro de una sola tinta lee más firme y deja que el volumen lo
        dé la luz, no el cambio de color.
      */}
      <linearGradient id="cm-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#35b98d" />
        <stop offset="100%" stopColor="#14795c" />
      </linearGradient>
    </defs>

    {rounded && <rect width="34" height="34" rx="9.5" fill="url(#cm-bg)" />}

    {MONOLITHS.map(({ x, h }) => (
      <rect
        key={x}
        x={x}
        y={29 - h}
        width="5"
        height={h}
        rx="2.5"
        fill={rounded ? '#04150f' : 'currentColor'}
        opacity={rounded ? 0.82 : 1}
      />
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
