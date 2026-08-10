import { useEffect, useRef, useState } from 'react';

/**
 * Ancho real en píxeles de un elemento, observado.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 * Los gráficos se dibujaban con un `viewBox` fijo y `preserveAspectRatio="none"`
 * para que llenasen el ancho disponible a una altura fija. El problema es que ese
 * ajuste escala el SVG de forma NO UNIFORME: estira la geometría en horizontal y
 * la comprime en vertical, y con ella **el texto de los ejes**. De ahí que los
 * números se vieran deformados y los ejes «estirados».
 *
 * La solución correcta es no escalar nada: medir el ancho del contenedor y
 * dibujar el SVG a ese tamaño real, con relación 1:1 entre unidades y píxeles.
 * El texto sale nítido y la rejilla queda a la altura que le corresponde.
 */
export function useElementWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    // Sin ResizeObserver (navegadores antiguos) se mide una vez al montar.
    if (typeof ResizeObserver === 'undefined') {
      setWidth(element.clientWidth || fallback);
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width || 0);
      if (next > 0) setWidth(next);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);

  return [ref, width];
}
