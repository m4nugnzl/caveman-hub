import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: rol de diálogo, cierre con Escape, foco atrapado
 * dentro y scroll del fondo bloqueado.
 *
 * Sustituye a `alert()` / `window.prompt()`, que se usaban como interfaz en
 * cuatro sitios (subir foto pedía ángulo y peso con dos prompts seguidos).
 */
export const Modal = ({ title, onClose, children, footer, size = 'md', labelledBy }) => {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // El primer control del diálogo recibe el foco al abrirse.
    const first = dialogRef.current?.querySelector(FOCUSABLE);
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
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={dialogRef}
        className={`modal${size === 'lg' ? ' modal-lg' : ''}`}
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
