import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
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

  /*
    ── Por qué `onClose` va por referencia y NO en las dependencias ───────────
    El efecto de abajo TOMA EL FOCO al entrar y lo DEVUELVE al salir. Eso solo
    puede pasar una vez por apertura. Con `onClose` en las dependencias pasaba
    en cada render, porque los 43 sitios de llamada lo pasan como una flecha en
    línea —`onClose={() => setResumen(false)}`— y esa función es nueva cada vez.

    El síntoma era del cliente escribiendo en el móvil: cada tecla en «Algo que
    quieras contarme» o en «Tu cuaderno» guardaba, guardar cambiaba el estado,
    el estado renderizaba, el render traía un `onClose` distinto y el efecto se
    rehacía: la limpieza devolvía el foco al botón que abrió el diálogo y el
    teclado en pantalla se cerraba. Una letra por apertura del teclado.

    La `ref` mantiene viva la última versión sin que su identidad cuente para
    nada, así que el efecto cuelga solo de `mounted`: una toma de foco al abrir,
    una devolución al cerrar.
  */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
        onCloseRef.current?.();
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
  }, [mounted]);

  if (!mounted) return null;

  /*
    ══ Por qué se pinta en la RAÍZ del documento y no donde se declara ═════════

    Porque `position: fixed` no siempre se mide contra la ventana: cualquier
    antepasado con `transform`, `filter` o `backdrop-filter` se convierte en su
    marco de referencia. La barra lateral lleva `backdrop-filter: blur(20px)`
    —es el cristal del chasis—, así que un diálogo abierto desde dentro de ella
    —el de tu nombre, en el menú de cuenta— no salía centrado en la pantalla:
    salía centrado DENTRO de la barra, en una columna de 256 px, con el velo
    tapando solo esa columna.

    No es una rareza de esa pantalla: le pasaría a cualquier diálogo que se abra
    desde cualquier sitio con cristal, y el fallo se ve tarde porque el diálogo
    *funciona*, solo que en el rincón equivocado. Con el portal, el marco de
    referencia es siempre el mismo —la raíz— y deja de depender de dónde se
    declare.

    El árbol de React no cambia: los eventos siguen burbujeando hasta quien lo
    montó, las refs siguen valiendo y el foco atrapado sigue funcionando igual.
  */
  const contenido = (
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

  /* Sin documento no hay dónde portar: el build prerenderiza la portada con
     `renderToStaticMarkup` (ver `scripts/prerender.mjs`) y ahí `createPortal`
     revienta. En el servidor el diálogo se queda donde se declara, que es
     exactamente lo que hacía antes de esto y no cambia ni un byte del HTML
     generado, porque en la portada no hay ninguno abierto. */
  return typeof document === 'undefined' ? contenido : createPortal(contenido, document.body);
};
