/**
 * EL SIGNO DE LAS EQUIVALENCIAS: las flechas del intercambio.
 *
 * ── Cuarto glifo, y lo pide el dueño ────────────────────────────────────────
 * Empezó siendo el ⇄ de lucide (`ArrowRightLeft`) y lo tiró el 15 sep: ese
 * dibujo dice «cambiar de sitio», el mismo que lleva un conversor de divisas.
 * Entró el ≈ del frame y también lo tiró (17 sep) — y con razón por debajo del
 * gusto: ≈ significa APROXIMADAMENTE IGUAL, y una equivalencia de esta
 * aplicación no es una aproximación, está calculada. Entró ≡ —«vale por», el
 * signo de la equivalencia desde la escuela— y tampoco: a 13 px, macizo y en
 * blanco sobre azul, tres barras se leen como el botón de un menú.
 *
 * Así que vuelven las flechas, y esta vez porque las pide él: *«un icono de
 * flechas como de intercambio»*. Es la decisión del dueño y es defendible —
 * lo que el mando HACE es cambiar un alimento por otro, y esa es la señal que
 * todo el mundo tiene aprendida para eso—.
 *
 * Dibujado a mano y no traído de la librería, con la geometría del resto de
 * iconos de la casa: caja de 24, trazo 2,25 y puntas redondas, para que al lado
 * del lápiz no se lea como una pieza de otra familia. Las dos astas van más
 * cortas que el ancho de la caja y más juntas que en el ⇄ original (9 y 15 en
 * vez de 7 y 17): a 13 px dentro de una chapa, dos rayas separadas por media
 * caja se leen como dos cosas y no como un signo.
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
    <path d="M4 9h16" />
    <path d="m16 5 4 4-4 4" />
    <path d="M20 15H4" />
    <path d="m8 11-4 4 4 4" />
  </svg>
);
