import { useCallback, useRef } from 'react';

import { prefiereMenosMovimiento } from '@/lib/motion';

/**
 * Arrastrar la hoja hacia abajo para cerrarla.
 *
 * ══ Por qué ════════════════════════════════════════════════════════════════
 * Una hoja que sube desde el borde de abajo promete que se puede empujar de
 * vuelta. Si no se puede, el gesto no falla: no pasa nada, que es peor — la
 * persona repite, duda y acaba buscando el aspa con la otra mano. Es el mismo
 * motivo por el que la hoja tiene agarradera: la agarradera es la promesa y
 * esto es lo que la cumple.
 *
 * ══ Solo desde la agarradera, y esto es una decisión ═══════════════════════
 * Los manejadores se ponen en el ASA, nunca en el cuerpo de la hoja. Poniéndolos
 * en el cuerpo hay que arbitrar cada gesto entre «cerrar» y «desplazar la lista
 * de dentro», y ese arbitraje es el que hace que las hojas de media aplicación
 * se cierren solas al intentar leerlas. Con el asa no hay nada que arbitrar: lo
 * que se arrastra es la barra de arriba, y el contenido se desplaza como el
 * contenido de cualquier caja.
 *
 * ══ Los detalles que hacen que se sienta bien ══════════════════════════════
 *  · **Solo hacia abajo.** Tirar hacia arriba no abre nada, así que el dedo se
 *    queda pegado al canto en vez de despegar la hoja de su sitio.
 *  · **Cierra por distancia O por velocidad.** Un empujón corto y rápido cierra
 *    igual que un arrastre largo y lento: los dos son «fuera». Sin la velocidad,
 *    el gesto natural —un golpe seco con el pulgar— no hace nada.
 *  · **El transform va al elemento, no al estado de React.** Un `setState` por
 *    cada `pointermove` son sesenta renders por segundo de un árbol que no ha
 *    cambiado. Aquí el dedo mueve un solo nodo.
 *  · **Con menos movimiento pedido, el arrastre SIGUE.** `prefers-reduced-motion`
 *    es sobre animación decorativa, no sobre manipulación directa: quitar el
 *    seguimiento del dedo no es respetar una preferencia, es romper un mando.
 *    Lo que sí se salta es el rebote de vuelta cuando el gesto no llega.
 */
export const useArrastrarParaCerrar = (onCerrar, { umbral = 72, velocidad = 0.5 } = {}) => {
  const hojaRef = useRef(null);
  const gesto = useRef(null);

  const onPointerDown = useCallback((event) => {
    const hoja = hojaRef.current;
    // `button > 0` es el botón derecho o el central: no arrastran nada.
    if (!hoja || event.button > 0) return;
    gesto.current = { y0: event.clientY, t0: event.timeStamp, dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    hoja.style.transition = 'none';
  }, []);

  const onPointerMove = useCallback((event) => {
    const g = gesto.current;
    const hoja = hojaRef.current;
    if (!g || !hoja) return;
    g.dy = Math.max(0, event.clientY - g.y0);
    g.t1 = event.timeStamp;
    hoja.style.transform = `translateY(${g.dy}px)`;
  }, []);

  const soltar = useCallback(
    (event) => {
      const g = gesto.current;
      const hoja = hojaRef.current;
      gesto.current = null;
      if (!g || !hoja) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      const ms = Math.max(1, (g.t1 || event.timeStamp) - g.t0);
      const limpia = () => {
        hoja.style.transition = '';
        hoja.style.transform = '';
      };

      if (g.dy > umbral || g.dy / ms > velocidad) {
        /* No se deshace el transform: la hoja se queda donde la dejó el dedo y
           desde ahí arranca su animación de salida. Devolverla a cero primero
           sería un salto hacia arriba justo antes de irse hacia abajo. */
        hoja.style.transition = '';
        onCerrar?.();
        return;
      }

      if (prefiereMenosMovimiento()) {
        limpia();
        return;
      }
      hoja.style.transition = 'transform 0.22s var(--ease)';
      hoja.style.transform = 'translateY(0)';
      hoja.addEventListener('transitionend', limpia, { once: true });
    },
    [onCerrar, umbral, velocidad],
  );

  return {
    hojaRef,
    /* Al asa. Lleva `touch-action: none` en su CSS: sin eso el navegador se
       queda el gesto vertical para desplazar la página y `pointermove` no
       llega — el arrastre no falla, simplemente no existe. */
    asaProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: soltar,
      onPointerCancel: soltar,
    },
  };
};
