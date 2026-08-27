import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

import { useDismissable } from '@/lib/useDismissable';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: rol de diálogo, cierre con Escape, foco atrapado
 * dentro y scroll del fondo bloqueado.
 *
 * Sustituye a `alert()` / `window.prompt()`, que se usaban como interfaz en
 * cuatro sitios (subir foto pedía ángulo y peso con dos prompts seguidos).
 *
 * ── La prop `open` y el cierre animado ──────────────────────────────────────
 * Con `open`, el Modal se monta SIEMPRE y decide él si renderiza:
 *
 *     <Modal open={editando} onClose={…}>          ← entra y SALE animado
 *
 * El desmonte lo retrasa `useDismissable` lo que dura la salida, así que el
 * foco vuelve a su dueño justo cuando el diálogo termina de irse, y el scroll
 * del fondo sigue bloqueado mientras tanto — los dos viven en el efecto de
 * abajo, que cuelga de `mounted`.
 *
 * Sin `open`, el comportamiento es el de siempre (`{editando && <Modal>}`):
 * montado es abierto y el cierre es un corte. Es la puerta de atrás que permite
 * migrar los sitios de llamada uno a uno en vez de todos en la misma tarde.
 */
/*
  ── `size="side"`: el detalle sin salir de la pantalla ─────────────────────
  Un diálogo centrado tapa el trabajo con un velo y dice «esto de aquí ha
  terminado, atiéndeme a mí». Para confirmar un borrado es exactamente lo que
  hace falta. Para MIRAR un detalle —el historial de un ejercicio, una comida,
  una foto— es lo contrario de lo que hace falta: se abre justamente para
  compararlo con lo que hay debajo, y el velo tapa aquello con lo que se compara.

  Ésa es la mitad de la sensación de «saltar entre ventanas»: mirar una cosa te
  saca de donde estabas. Con `side` el panel entra por el canto derecho, el plan
  sigue delante y a la vista, y se cierra igual —con la equis, con Escape o
  pulsando fuera—. Es lo que hace el competidor de referencia con el detalle de
  un ejercicio.

  Sigue siendo el mismo componente y el mismo contrato de accesibilidad
  (`role="dialog"`, foco atrapado, `aria-modal`): lo único que cambia es dónde
  se coloca y cuánto tapa.
*/
export const Modal = ({ open, title, onClose, children, footer, size = 'md', labelledBy }) => {
  const dialogRef = useRef(null);
  const titleId = useId();
  const { mounted, closing, ref } = useDismissable(open === undefined ? true : open);

  useEffect(() => {
    if (!mounted) return undefined;

    const previouslyFocused = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // El primer control del diálogo recibe el foco al abrirse — solo donde hay
    // teclado físico. En táctil, enfocar un campo abre el teclado en pantalla
    // (o la rueda de fecha) encima de la hoja recién abierta, antes de que se
    // haya podido leer qué pide; ahí el foco va al propio diálogo, que es lo
    // que anuncia el lector de pantalla, y el primer toque ya es del usuario.
    const first = window.matchMedia('(hover: hover)').matches
      ? dialogRef.current?.querySelector(FOCUSABLE)
      : null;
    (first || dialogRef.current)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      ref={ref}
      className={`modal-backdrop${size === 'side' ? ' is-side' : ''}`}
      data-state={closing ? 'closing' : 'open'}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={dialogRef}
        className={`modal${size === 'lg' ? ' modal-lg' : ''}${size === 'side' ? ' modal-side' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
      >
        {title && (
          <header className="modal-header">
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar">
              <X size={16} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
};
