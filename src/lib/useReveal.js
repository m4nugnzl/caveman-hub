import { useEffect, useRef, useState } from 'react';

import { prefiereMenosMovimiento } from '@/lib/motion';

/**
 * ¿Ha llegado esto a la vista alguna vez?
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * Para la portada pública, que es larga y se recorre de arriba abajo de una
 * sentada. Un bloque que aparece al llegar hace dos cosas que un bloque quieto no
 * hace: marca dónde empieza cada argumento —el ojo se para en lo que se acaba de
 * mover— y da la sensación de que la página responde a lo que haces.
 *
 * ── Por qué se desconecta al primer cruce ──────────────────────────────────
 * Porque esto no es un carrusel: cada sección aparece UNA vez. Si el observador
 * siguiera vivo, subir y bajar volvería a animarlo todo, y una página que
 * parpadea cada vez que la recorres cansa a la segunda pasada. Además, un
 * observador por sección que no se desconecta son quince observadores vivos
 * mientras se lee.
 *
 * ══ Y quien ha pedido menos movimiento ═════════════════════════════════════
 *
 * Empieza VISIBLE, no oculto. El orden importa: si el estado inicial fuera
 * «oculto» y el efecto lo corrigiera después, habría un fotograma en blanco
 * incluso para quien pidió que no hubiera movimiento.
 *
 * Y hay un segundo cinturón, en CSS: la regla `.lp-reveal` se anula entera bajo
 * `prefers-reduced-motion`. Así, aunque este gancho no llegara a ejecutarse
 * —JavaScript que falla, un navegador sin `IntersectionObserver`—, el contenido
 * NUNCA se queda invisible. Una animación de entrada que falla no puede costar
 * la página: es la única de la portada que puede esconder texto.
 */
/**
 * @param observa  Opciones del `IntersectionObserver`, para quien necesite
 *   disparar MÁS TARDE que el resto. El caso que lo trajo: las tarjetas de
 *   plan entran con su asentamiento y con el margen de siempre la animación
 *   ocurría pegada al canto de abajo de la pantalla —donde nadie está
 *   mirando— y al llegar a ellas ya estaban puestas. Se pasa el objeto entero
 *   y no un «modo»: es la firma del observador, no un vocabulario nuevo.
 *   OJO: tiene que ser un valor estable (un literal fuera del componente o
 *   memoizado); el efecto no lo vigila, lee el del primer render.
 */
export const useReveal = (observa) => {
  const ref = useRef(null);
  const [dentro, setDentro] = useState(() => prefiereMenosMovimiento());
  const opciones = useRef(observa);

  useEffect(() => {
    if (prefiereMenosMovimiento() || typeof IntersectionObserver !== 'function') {
      setDentro(true);
      return undefined;
    }

    const nodo = ref.current;
    if (!nodo) return undefined;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        setDentro(true);
        observador.disconnect();
      },
      /*
        El margen negativo abajo retrasa el disparo hasta que la pieza está
        entrando de verdad. Sin él, con `threshold: 0`, una sección alta se marca
        como visible cuando asoma un píxel y la animación termina antes de que se
        vea nada.
      */
      opciones.current ?? { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return [ref, dentro];
};
