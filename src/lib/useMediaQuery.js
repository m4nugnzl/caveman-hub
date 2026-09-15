import { useEffect, useState } from 'react';

/**
 * ¿Se cumple esta media query AHORA? Con suscripción: cambia en vivo si la
 * ventana cruza el corte.
 *
 * Hasta aquí toda decisión responsive era CSS puro (las dos geometrías montan
 * y la hoja de estilos elige cuál se ve — ver EL CHASIS en index.css). Este
 * gancho existe para el caso que el CSS no puede resolver: cuando las dos
 * geometrías son ÁRBOLES DISTINTOS, como el editor de rutina, que en el
 * teléfono es un índice con hoja por ejercicio y en escritorio un carril con
 * todo abierto. Montar los dos árboles y esconder uno duplicaría cada input
 * controlado de la pantalla.
 *
 * La guarda de `matchMedia` es la misma que en `lib/motion.js`: en los tests
 * no hay ventana de verdad y ahí la respuesta es «no» (geometría de
 * escritorio, que es la que los tests conocen).
 */
export const useMediaQuery = (query) => {
  const disponible = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() => (disponible ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!disponible) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query, disponible]);

  return matches;
};

/**
 * El corte del TELÉFONO, el primero de los cuatro anchos de la casa (la tabla
 * está en `styles/tokens.css`, «LOS CUATRO ANCHOS»). Es el mismo valor que usa
 * la hoja de estilos para la hoja inferior del modal y el repliegue de las
 * tablas, y por eso se escribe igual: 639,98 y no 640, que se solapa con el
 * `min-width: 640px` complementario.
 *
 * No confundir con el corte del CHASIS (1024): una tableta lleva barra del
 * pulgar pero le cabe la geometría ancha del editor.
 */
export const useEsTelefono = () => useMediaQuery('(max-width: 639.98px)');
