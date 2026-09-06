import { useLayoutEffect, useRef } from 'react';

/**
 * ══ LA MARCA DE «ESTÁS AQUÍ», DESLIZÁNDOSE ══════════════════════════════════
 *
 * `chasis.css` tenía escrito lo contrario: «deslizarla entre destinos exigiría
 * medir cajas desde JS (FLIP); no lo vale para una raya de 3 px». El argumento
 * era bueno cuando la marca era una raya. Dejó de serlo cuando pasó a ser la
 * píldora entera del carril: una píldora que se teletransporta de un destino a
 * otro es el único gesto de la aplicación en el que no se ve de dónde vienes.
 *
 * Y la medida no es cara: hay DOS carriles en todo el producto (el del cliente
 * en el panel y el del portal), con cinco destinos cada uno.
 *
 * ── Cómo funciona ───────────────────────────────────────────────────────────
 * No se anima la píldora activa: se anima UNA marca suelta, hermana de los
 * destinos, colocada con `--marca-x` y `--marca-w` sobre el carril. Los
 * destinos solo cambian de color. Así no hay dos cajas compitiendo por el mismo
 * relleno mientras dura el viaje.
 *
 * `offsetLeft` es relativo al carril (que es `position: relative`), así que un
 * carril desplazado a lo ancho —cabe hacerlo, lleva `overflow-x: auto`— no
 * descoloca la marca: se desplaza con su contenido.
 *
 * ── Por qué no se ve el primer viaje ────────────────────────────────────────
 * La primera vez la marca aparece YA colocada: sin `sin-viaje` saldría desde el
 * origen del carril y todas las pantallas se abrirían con un barrido de
 * izquierda a derecha que nadie ha pedido. El `offsetWidth` de en medio fuerza
 * el reflujo; sin él, el navegador funde los dos estados en uno y la clase no
 * llega a tener efecto.
 */
export const useMarcaDeslizante = () => {
  const carril = useRef(null);
  const colocada = useRef(false);

  /* Antes de pintar, no después: con `useEffect` la marca se ve un fotograma en
     su sitio anterior cada vez que se cambia de destino. */
  useLayoutEffect(() => {
    const nav = carril.current;
    if (!nav) return undefined;

    const medir = () => {
      const activa = nav.querySelector('.tab.active, .tab[aria-selected="true"]');
      /* Sin destino marcado —o con el carril escondido, que mide cero— la marca
         se retira en vez de quedarse encallada en el último sitio que tuvo. */
      if (!activa || !activa.offsetWidth) {
        nav.classList.remove('con-marca');
        colocada.current = false;
        return;
      }
      if (!colocada.current) nav.classList.add('sin-viaje');
      nav.style.setProperty('--marca-x', `${activa.offsetLeft}px`);
      nav.style.setProperty('--marca-w', `${activa.offsetWidth}px`);
      nav.classList.add('con-marca');
      if (!colocada.current) {
        void nav.offsetWidth;
        nav.classList.remove('sin-viaje');
        colocada.current = true;
      }
    };

    medir();

    /* Los destinos cambian de ancho sin que el carril se vuelva a montar: al
       cargar la tipografía, al traducirse un rótulo, al aparecer una sección
       que este cliente sí tiene. Sin esto la marca se queda del ancho viejo.
       En jsdom no existe, y ahí basta con la medida de arriba. */
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ojo = new ResizeObserver(medir);
    ojo.observe(nav);
    Array.from(nav.children).forEach((destino) => ojo.observe(destino));
    return () => ojo.disconnect();
  });

  return carril;
};
