import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * El contrato de una capa: foco atrapado, Escape, y el fondo quieto.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 * Esto vivía entero dentro de `Modal`, y era correcto mientras la única capa de
 * la casa fuera el diálogo. Con la hoja del móvil (`ui/Hoja`) pasan a ser dos
 * superficies con el mismo contrato de accesibilidad y distinta forma, y
 * copiarlo garantizaba que dentro de tres meses una de las dos se quedara
 * atrás: la que no se tocara ese día.
 *
 * Es una extracción literal —no cambia ni un comportamiento del diálogo— y por
 * eso conserva sus tres finuras, que se pagaron caras y no son evidentes:
 *
 *  1. `onClose` va por REFERENCIA y no en las dependencias. El efecto TOMA el
 *     foco al entrar y lo DEVUELVE al salir, y eso solo puede pasar una vez por
 *     apertura. Con `onClose` en las dependencias pasaba en cada render, porque
 *     los sitios de llamada lo pasan como una flecha en línea y esa función es
 *     nueva cada vez. El síntoma era del cliente escribiendo en el móvil: cada
 *     tecla guardaba, guardar renderizaba, el render rehacía el efecto, la
 *     limpieza devolvía el foco al botón que abrió la capa y el teclado en
 *     pantalla se cerraba. Una letra por apertura del teclado.
 *
 *  2. El primer control recibe el foco SOLO donde hay teclado físico. En táctil,
 *     enfocar un campo abre el teclado en pantalla (o la rueda de fecha) encima
 *     de la capa recién abierta, antes de que se haya podido leer qué pide. Ahí
 *     el foco va a la propia capa, que es lo que anuncia el lector de pantalla,
 *     y el primer toque ya es del usuario.
 *
 *  3. El `keydown` va en fase de CAPTURA y Escape corta la propagación: con dos
 *     capas abiertas —un diálogo desde una hoja— se cierra la de arriba y solo
 *     la de arriba.
 *
 * ══ Cómo se usa ════════════════════════════════════════════════════════════
 *
 *     const cajaRef = useRef(null);
 *     useCapaModal({ montada, onClose, cajaRef });
 *
 * `cajaRef` apunta al elemento con `role="dialog"` —no al velo—: es el que
 * recibe el foco y dentro del cual se atrapa el tabulador.
 */
export const useCapaModal = ({ montada, onClose, cajaRef }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!montada) return undefined;

    const previouslyFocused = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const first = window.matchMedia('(hover: hover)').matches
      ? cajaRef.current?.querySelector(FOCUSABLE)
      : null;
    (first || cajaRef.current)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = [...(cajaRef.current?.querySelectorAll(FOCUSABLE) || [])];
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
    // `cajaRef` es una ref estable; lo que manda la apertura es `montada`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montada]);
};
