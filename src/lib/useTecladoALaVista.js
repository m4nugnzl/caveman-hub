import { useEffect, useState } from 'react';

/**
 * CUÁNTO DE LA PANTALLA SE HA COMIDO EL TECLADO, en píxeles.
 *
 * ══ Por qué hace falta una API para esto ═══════════════════════════════════
 *
 * Porque el teclado del sistema **no cambia el tamaño de la página**. En un
 * teléfono, el `layout viewport` —lo que miden `innerHeight`, `100vh` y
 * cualquier `position: fixed`— sigue siendo el mismo con el teclado abierto: lo
 * que cambia es el `visual viewport`, la parte que de verdad se ve. Así que una
 * barra pegada al borde de abajo con `bottom: 0` se queda DEBAJO del teclado,
 * que es donde no sirve para nada.
 *
 * `window.visualViewport` da el alto que queda, y sus eventos `resize` y
 * `scroll` avisan cuando cambia. Es la misma técnica de cualquier web que no se
 * siente prestada, y es lo que permite anclar la pastilla del pulgar justo
 * encima de las teclas.
 *
 * ══ Devuelve 0 cuando no hay teclado ═══════════════════════════════════════
 *
 * Y también donde la API no existe (escritorio antiguo, y los tests). Quien lo
 * use tiene que poder sumar el valor sin preguntar nada: `bottom: alto` con
 * cero es el borde de abajo de siempre.
 *
 * ── El umbral de 120 px, y por qué no es cero ────────────────────────────
 * En iOS, la barra de direcciones de Safari al retraerse cambia el visual
 * viewport unos pocos píxeles, y en Android cualquier gesto lo mueve. Sin
 * umbral, la pastilla flotaría veinte píxeles por encima del borde sin que haya
 * ningún teclado. Un teclado de teléfono nunca mide menos de 200 px; 120 es
 * holgado en los dos sentidos.
 */
export const useTecladoALaVista = () => {
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;

    const medir = () => {
      /* `offsetTop` cuenta porque el visual viewport se DESPLAZA además de
         encogerse: al enfocar un campo bajo, el navegador sube la vista. */
      const tapado = window.innerHeight - vv.height - vv.offsetTop;
      setAlto(tapado > 120 ? Math.round(tapado) : 0);
    };

    medir();
    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
    };
  }, []);

  return alto;
};
