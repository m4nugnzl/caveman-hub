import { useCallback, useEffect, useRef } from 'react';

import { prefiereMenosMovimiento } from '@/lib/motion';

/**
 * DESLIZAR CON EL DEDO PARA CAMBIAR DE DESTINO.
 *
 * ══ Por qué ════════════════════════════════════════════════════════════════
 *
 * El portal tiene cuatro destinos y una barra abajo para saltar entre ellos. La
 * barra está bien y se queda: es la que DICE dónde estás y cuántos sitios hay.
 * Lo que no había es el otro gesto, el que hace que una pantalla se sienta de un
 * teléfono y no de una web estrecha: **empujar la página a un lado**.
 *
 * No es adorno. Un pulgar que ya está en la pantalla cambia de sección sin
 * bajar a apuntar a un objetivo de 78 px del borde inferior, y sobre todo
 * aprende la FORMA de la aplicación: los cuatro destinos están en fila, y eso
 * no se puede leer en una barra de iconos, solo se puede sentir.
 *
 * ══ Por qué NO se usa `touch-action` ═══════════════════════════════════════
 *
 * Es la trampa de este gesto y cuesta una tarde encontrarla. Lo natural sería
 * poner `touch-action: pan-y` en el contenedor —«el navegador se queda lo
 * vertical, yo me quedo lo horizontal»— y escuchar con eventos de puntero.
 *
 * Pero `touch-action` **se interseca por la cadena de antepasados**: un hijo con
 * `pan-x` (la cinta de días, el carril de comidas, cualquier tabla que se
 * desplaza) dentro de un padre con `pan-y` da `none`, y esas tiras dejan de
 * desplazarse. El gesto nuevo se llevaría por delante a los que ya existen.
 *
 * Así que se escucha `touchstart`/`touchmove` **sin `passive`** y se decide a
 * mano: mientras el gesto no sea nuestro, el navegador hace lo suyo con total
 * normalidad; en cuanto lo es, `preventDefault` y lo conducimos nosotros.
 *
 * ══ Las cuatro reglas del arbitraje ════════════════════════════════════════
 *
 *  1. **Lo vertical gana siempre.** Es lo que se hace el 95 % del tiempo. Basta
 *     con que el dedo salga con más componente vertical que horizontal para que
 *     el gesto deje de ser candidato, y no se reconsidera: cambiar de opinión a
 *     mitad de un desplazamiento es lo que produce las páginas que «se van
 *     solas».
 *  2. **Una tira que todavía puede desplazarse se queda el gesto.** Si el dedo
 *     sale de dentro de un carril horizontal y ese carril aún tiene recorrido
 *     hacia donde empuja, es suyo. Solo cuando el carril está tocando su tope
 *     —y en el borde, con 1 px de margen por los redondeos del zoom— el gesto
 *     sube al contenedor. Es el comportamiento de cualquier carrusel nativo.
 *  3. **Los mandos que se arrastran no se tocan.** Un `input[type=range]` —la
 *     regla del peso— y cualquier cosa con `data-sin-deslizar` quedan fuera. Su
 *     gesto ES horizontal y sería exactamente el mismo.
 *  4. **Solo dedo.** `pointerType` de ratón no entra: arrastrar con el ratón es
 *     seleccionar texto, y robárselo rompe algo que la gente sí usa en la
 *     tableta con teclado.
 *
 * ══ Y los topes ════════════════════════════════════════════════════════════
 *
 * En el primer destino no hay nada a la izquierda y en el último no hay nada a
 * la derecha. El dedo no se bloquea —eso se siente roto— sino que la página
 * cede con resistencia y vuelve: es la goma de toda la vida, y dice «hasta aquí»
 * mejor que cualquier aviso.
 *
 * ══ Movimiento reducido ════════════════════════════════════════════════════
 *
 * El seguimiento del dedo SE QUEDA: `prefers-reduced-motion` habla de animación
 * decorativa, no de manipulación directa — quitarlo no respeta una preferencia,
 * rompe un mando. Lo que se salta es el rebote de vuelta cuando el gesto no
 * llega y la entrada de la pantalla nueva. Misma regla que
 * `useArrastrarParaCerrar`.
 *
 * @param {object}   opciones
 * @param {number}   opciones.indice   En qué destino se está, de 0 a n-1.
 * @param {number}   opciones.total    Cuántos destinos hay.
 * @param {Function} opciones.alIr     `(indiceNuevo, sentido) => void`.
 * @param {boolean}  [opciones.activo] Falso lo apaga del todo (escritorio, sesión).
 */
export const useDeslizarEntreDestinos = ({ indice, total, alIr, activo = true }) => {
  const ref = useRef(null);
  /* El gesto vivo. En una `ref` y no en estado: son sesenta eventos por segundo
     y ninguno cambia nada que haya que volver a pintar. */
  const gesto = useRef(null);
  /* Lo que necesitan los manejadores y cambia entre renders. Los oyentes se
     montan UNA vez —con `passive: false` no se pueden remontar cada vez sin
     perder gestos a medias—, así que leen de aquí. */
  const vivo = useRef({ indice, total, alIr, activo });
  vivo.current = { indice, total, alIr, activo };

  /**
   * El antepasado que se desplaza en horizontal, si lo hay, hasta el contenedor.
   * Devuelve también sus topes, que es lo que decide quién se queda el gesto.
   */
  const carrilDe = useCallback((desde) => {
    const tope = ref.current;
    let nodo = desde instanceof Element ? desde : null;
    while (nodo && nodo !== tope) {
      if (nodo.scrollWidth - nodo.clientWidth > 1) {
        const estilo = getComputedStyle(nodo).overflowX;
        if (estilo === 'auto' || estilo === 'scroll') return nodo;
      }
      nodo = nodo.parentElement;
    }
    return null;
  }, []);

  useEffect(() => {
    const caja = ref.current;
    if (!caja) return undefined;

    const pintar = (dx) => {
      caja.style.transform = dx ? `translate3d(${dx}px,0,0)` : '';
    };

    const limpiar = (conVuelta) => {
      if (conVuelta && !prefiereMenosMovimiento()) {
        caja.style.transition = 'transform 0.24s var(--ease)';
        caja.addEventListener(
          'transitionend',
          () => {
            caja.style.transition = '';
          },
          { once: true }
        );
      }
      pintar(0);
      if (!conVuelta) caja.style.transition = '';
    };

    const onStart = (event) => {
      gesto.current = null;
      if (!vivo.current.activo || vivo.current.total < 2) return;
      if (event.touches.length !== 1) return;

      const t = event.touches[0];
      const destino = t.target;
      /* Regla 3: los mandos que ya usan el eje horizontal. */
      if (destino instanceof Element) {
        if (destino.closest('input[type="range"], [data-sin-deslizar], [contenteditable="true"]')) return;
      }

      gesto.current = {
        x0: t.clientX,
        y0: t.clientY,
        t0: event.timeStamp,
        dx: 0,
        decidido: false,
        nuestro: false,
        carril: carrilDe(destino),
      };
      caja.style.transition = 'none';
    };

    const onMove = (event) => {
      const g = gesto.current;
      if (!g || event.touches.length !== 1) return;
      const t = event.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;

      if (!g.decidido) {
        /* Nada se decide hasta que hay un movimiento que merezca el nombre: por
           debajo de 8 px es un toque con pulso, no un arrastre. */
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.decidido = true;

        /* Regla 1: lo vertical gana, y no se reconsidera. El 1,3 es holgura para
           el arco natural del pulgar, que no traza una recta. */
        if (Math.abs(dy) * 1.3 >= Math.abs(dx)) {
          gesto.current = null;
          limpiar(false);
          return;
        }

        /* Regla 2: ¿puede la tira de dentro seguir desplazándose hacia allí? */
        if (g.carril) {
          const margen = 1;
          const puede =
            dx < 0
              ? g.carril.scrollLeft < g.carril.scrollWidth - g.carril.clientWidth - margen
              : g.carril.scrollLeft > margen;
          if (puede) {
            gesto.current = null;
            limpiar(false);
            return;
          }
        }

        g.nuestro = true;
      }

      if (!g.nuestro) return;

      /* El gesto es nuestro: el navegador ya no desplaza nada con él. */
      event.preventDefault();

      const { indice: i, total: n } = vivo.current;
      /* La goma de los extremos: el primero no tiene izquierda y el último no
         tiene derecha, así que el dedo avanza a un tercio. */
      const contra = (dx > 0 && i === 0) || (dx < 0 && i === n - 1);
      g.dx = contra ? dx / 3 : dx;
      g.t1 = event.timeStamp;
      pintar(g.dx);
    };

    const onEnd = (event) => {
      const g = gesto.current;
      gesto.current = null;
      if (!g?.nuestro) return;

      const { indice: i, total: n, alIr } = vivo.current;
      const ancho = caja.clientWidth || 1;
      const ms = Math.max(1, (g.t1 || event.timeStamp) - g.t0);
      const velocidad = Math.abs(g.dx) / ms;

      /* Pasa por distancia O por velocidad, como la hoja: un golpe corto y seco
         con el pulgar es tan intencionado como un arrastre lento y largo. */
      const pasa = Math.abs(g.dx) > ancho * 0.28 || velocidad > 0.45;
      const sentido = g.dx < 0 ? 1 : -1;
      const siguiente = i + sentido;

      if (pasa && siguiente >= 0 && siguiente < n) {
        /* Sin vuelta animada: lo que sigue es la pantalla nueva entrando desde
           el lado contrario (`data-entra`), y devolver esta a cero antes sería
           un salto en dirección opuesta justo antes del cambio. */
        limpiar(false);
        alIr?.(siguiente, sentido);
        return;
      }
      limpiar(true);
    };

    /* `passive: false` en los dos que pueden llamar a `preventDefault`. El
       `start` puede ser pasivo: no lo llama nunca. */
    caja.addEventListener('touchstart', onStart, { passive: true });
    caja.addEventListener('touchmove', onMove, { passive: false });
    caja.addEventListener('touchend', onEnd, { passive: true });
    caja.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      caja.removeEventListener('touchstart', onStart);
      caja.removeEventListener('touchmove', onMove);
      caja.removeEventListener('touchend', onEnd);
      caja.removeEventListener('touchcancel', onEnd);
    };
  }, [carrilDe]);

  return ref;
};
