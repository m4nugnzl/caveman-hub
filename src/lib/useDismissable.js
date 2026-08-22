import { useEffect, useRef, useState } from 'react';

import { prefiereMenosMovimiento } from '@/lib/motion';

/**
 * Cerrar con salida, no con corte.
 *
 * ══ El hueco que tapa ═══════════════════════════════════════════════════════
 *
 * Todos los overlays de la aplicación se montaban con `{open && <X/>}`: entrada
 * animada (los keyframes `fade`, `sheet`, `pop`…) y salida por desmonte, es
 * decir, ninguna. Un diálogo que aparece con cuidado y desaparece de un tijeretazo
 * se siente roto justo en el gesto de terminar, que es el que más se repite.
 *
 * React no puede animar lo que ya no está en el árbol, así que el truco es el de
 * siempre: retrasar el desmonte lo que dura la animación de salida.
 *
 * ══ Cómo se usa ═════════════════════════════════════════════════════════════
 *
 *     const { mounted, closing, ref } = useDismissable(open);
 *     if (!mounted) return null;
 *     return <div ref={ref} data-state={closing ? 'closing' : 'open'} …>
 *
 * El `ref` va en la RAÍZ del overlay (el backdrop): es el elemento cuyo
 * `animationend` marca el final de la salida. El CSS cuelga las animaciones del
 * atributo — `.modal-backdrop[data-state='closing'] { animation: fade-sale … }` —
 * y por eso volver a abrir en plena salida no necesita remontar nada: cambiar el
 * atributo a `open` cambia la propiedad `animation`, y eso reinicia la entrada.
 *
 * ══ Los bordes ══════════════════════════════════════════════════════════════
 *
 *  · `animationend` burbujea desde los hijos (el modal anima a la vez que su
 *    backdrop), así que se filtra por `event.target === ref.current`.
 *  · Si la animación no llega a disparar —`display: none`, un keyframe mal
 *    escrito que verify-styles no puede ver— un temporizador desmonta igual:
 *    quedarse con un overlay fantasma bloqueando la pantalla es el único fallo
 *    que no se puede permitir.
 *  · Con menos movimiento pedido (`prefiereMenosMovimiento`), el desmonte es
 *    inmediato. La regla global de CSS ya colapsa la animación a 0.01 ms y el
 *    `animationend` llegaría igual, pero saltarse el rodeo mantiene además la
 *    devolución del foco pegada al gesto.
 */
export const useDismissable = (open, { fallbackMs = 400 } = {}) => {
  const [mounted, setMounted] = useState(Boolean(open));
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;

    if (prefiereMenosMovimiento()) {
      setMounted(false);
      setClosing(false);
      return undefined;
    }

    setClosing(true);
    const el = ref.current;
    const finish = () => {
      setMounted(false);
      setClosing(false);
    };
    const timer = setTimeout(finish, fallbackMs);
    const onEnd = (event) => {
      if (event.target !== el) return;
      finish();
    };
    el?.addEventListener('animationend', onEnd);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener('animationend', onEnd);
    };
  }, [open, mounted, fallbackMs]);

  return { mounted, closing, ref };
};
