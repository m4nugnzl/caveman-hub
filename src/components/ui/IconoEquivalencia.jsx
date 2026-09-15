/**
 * EL SIGNO DE LAS EQUIVALENCIAS: ≈, «vale por».
 *
 * Era el ⇄ de lucide (`ArrowRightLeft`), y ese glifo dice otra cosa: «cambiar
 * de sitio», «intercambiar dos columnas», el mismo que lleva un conversor de
 * divisas. Una equivalencia no mueve nada — dice que 175 g de clara valen por
 * 150 g de huevo, y ese verbo tiene signo propio desde la escuela. El dueño lo
 * pidió así el 15 sep 2026: «no me gusta el icono».
 *
 * Dibujado a mano porque la versión de lucide del repositorio (0.400) no trae
 * `EqualApproximately`, y con la misma geometría que el resto de iconos de la
 * casa: caja de 24, trazo 2 y puntas redondas, para que al lado del lápiz no
 * se lea como una pieza de otra familia.
 */
export const IconoEquivalencia = ({ size = 13, className, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={className}
    {...rest}
  >
    <path d="M4 9.5c2.7-2.6 5.3-2.6 8 0s5.3 2.6 8 0" />
    <path d="M4 15.5c2.7-2.6 5.3-2.6 8 0s5.3 2.6 8 0" />
  </svg>
);
