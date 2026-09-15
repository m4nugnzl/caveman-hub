import { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { useArrastrarParaCerrar } from '@/lib/useArrastrarParaCerrar';
import { useCapaModal } from '@/lib/useCapaModal';
import { useDismissable } from '@/lib/useDismissable';
import { useMediaQuery } from '@/lib/useMediaQuery';

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
 * del fondo sigue bloqueado mientras tanto — los dos los lleva `useCapaModal`,
 * que cuelga de `mounted` y es lo que comparten esta ventana y la hoja del
 * móvil (`ui/Hoja`). Ahí están escritas sus tres finuras.
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
/*
  ── Y en el móvil, una ventana ES una hoja ─────────────────────────────────
  Esto ya lo decía la hoja de estilos: por debajo de 640 px cualquier `.modal`
  se ancla al borde de abajo, y `side` lo hace por debajo de 1024. Lo que
  faltaba era la mitad que el CSS no puede poner — la AGARRADERA y el arrastre
  para cerrarla—, y sin ellas la hoja era una ventana colocada abajo: se abría
  como una hoja, se empujaba hacia abajo y no pasaba nada.

  El corte se lee aquí con `useMediaQuery` y no se deduce del `size`, porque
  quien decide si esto es una hoja es el ancho, igual que en el CSS. Los dos
  sitios usan los mismos dos números de la escala (ver `tokens.css`).
*/
export const Modal = ({ open, title, onClose, children, footer, size = 'md', labelledBy }) => {
  const titleId = useId();
  const { mounted, closing, ref } = useDismissable(open === undefined ? true : open);

  const esTelefono = useMediaQuery('(max-width: 639.98px)');
  const esChasisMovil = useMediaQuery('(max-width: 1023.98px)');
  const esHoja = esTelefono || (size === 'side' && esChasisMovil);

  /* La misma caja con dos dueños, y por eso una sola `ref`: `useCapaModal` la
     usa para atrapar el foco dentro y `useArrastrarParaCerrar` para moverla con
     el dedo. Es el elemento con `role="dialog"`, no el velo. */
  const { hojaRef, asaProps } = useArrastrarParaCerrar(onClose);
  useCapaModal({ montada: mounted, onClose, cajaRef: hojaRef });

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
        ref={hojaRef}
        /* `capa` LLEVA `modal-lg` a propósito: es el grande crecido, y las
           reglas que distinguen «ventana ancha» de «ventana estrecha» con
           `:not(.modal-lg)` tienen que contarla como ancha sin enterarse. */
        className={`modal${size === 'lg' || size === 'capa' ? ' modal-lg' : ''}${size === 'capa' ? ' modal-capa' : ''}${size === 'side' ? ' modal-side' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
      >
        {/* Solo cuando de verdad es una hoja: en una ventana centrada el asa
            sería un mando que no hace nada. Lo pinta el CSS con el mismo corte,
            pero sin el nodo no habría nada a lo que agarrarse. */}
        {esHoja && <span className="modal-grip" aria-hidden="true" {...asaProps} />}
        {title && (
          <header className="modal-header">
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar">
              <X size={15} />
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
