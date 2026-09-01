import { Loader2 } from 'lucide-react';

/**
 * La puerta grande por la que entra un fichero.
 *
 * ══ Por qué es una pieza y no tres botones parecidos ═══════════════════════
 *
 * Porque ya había dos escritas por separado y se habían separado: el hueco de
 * las fotos (`.photo-drop`) era un `btn-secondary` alto con tres líneas dentro,
 * y el de traer un plan era un botón pequeño al pie de un cuadro de texto. La
 * misma pregunta —«dame el archivo»— contestada de dos maneras en el mismo
 * producto, y ninguna de las dos aceptaba que se le soltara nada encima, que es
 * lo que hace todo el mundo que viene de tener sus cosas en carpetas.
 *
 * ── Las tres líneas siempre dicen lo mismo ──────────────────────────────────
 * `titulo` es QUÉ se trae —no el gesto: en un teléfono no hay arrastre y un
 * titular que dice «suelta aquí» ahí es una instrucción imposible—. `sub` es
 * cómo, con los dos gestos y en ese orden. Y `children` es la letra pequeña que
 * solo importa cuando algo no cabe: los formatos, el tamaño máximo.
 *
 * ── `ocupado` en lugar de apagar el bloque ──────────────────────────────────
 * Mientras trabaja no se pulsa, pero tampoco baja al 40 % de opacidad: un bloque
 * medio apagado en mitad de su propio trabajo parece averiado. Es la misma
 * decisión que ya tomó `.btn[data-estado='ocupado']`.
 *
 * El arrastre no está aquí: vive en `lib/useArrastreDeFicheros`, y esta pieza
 * solo recibe `encima` para pintarse. Es lo que permite que el envoltorio entero
 * —con las fotos que ya haya al lado— sea el destino, y no solo el recuadro.
 */
export const ZonaDeSoltar = ({
  icon: Icon,
  titulo,
  sub,
  encima = false,
  ocupado = false,
  disabled = false,
  onClick,
  children,
}) => (
  <button
    type="button"
    className={`soltar${encima ? ' is-encima' : ''}`}
    disabled={disabled || ocupado}
    aria-busy={ocupado}
    onClick={onClick}
  >
    <span className="soltar-icono" aria-hidden="true">
      {ocupado ? <Loader2 size={22} className="spin" /> : <Icon size={22} />}
    </span>
    <span className="soltar-titulo">{titulo}</span>
    {sub && <span className="soltar-sub">{sub}</span>}
    {children}
  </button>
);
