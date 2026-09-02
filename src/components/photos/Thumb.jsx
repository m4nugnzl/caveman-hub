import { useEffect, useState } from 'react';

import { thumbnailUrl } from '@/domain/photos';

/**
 * Una miniatura de foto de progreso.
 *
 * ══ Por qué es un componente y no un `<img>` ════════════════════════════════
 *
 * Por el respaldo. Pide la versión redimensionada —ver `thumbnailUrl`— y si esa
 * no carga, vuelve a la original. Sin eso, la optimización sería una apuesta: si
 * el proyecto de Supabase no tiene la transformación de imágenes disponible, o
 * si la ruta cambia, el entrenador se encontraría una biblioteca de cuadros
 * rotos en lugar de una biblioteca lenta.
 *
 * El peor caso pasa a ser exactamente el comportamiento de antes: descargar el
 * original. El mejor, 240 px en vez de 3 MB.
 *
 * `key` sobre la URL en el `useEffect` y no en el padre: cambiar de cliente
 * reemplaza la lista entera y hay que volver a intentar la miniatura, no
 * quedarse con el respaldo que se decidió para otra foto.
 */
/*
  El último respaldo es una pieza diseñada, no el glifo roto del navegador.

  Cuando ni la miniatura ni la original cargan, antes se quedaba el icono de
  imagen rota del sistema — en mitad de la revisión, tres cuadros rotos. Ahora
  el `img` pasa a una silueta neutra embebida: sigue siendo un `img`, así que
  los diez sitios que estilan `.algo img` (tamaño, radio, filtros) no se
  enteran. Los grises van fijos y traslúcidos para leerse igual sobre papel y
  sobre noche; el `alt` sigue diciendo qué foto era.
*/
const RESPALDO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">' +
      '<rect width="300" height="400" fill="#7e8695" opacity="0.16"/>' +
      '<g fill="none" stroke="#7e8695" stroke-width="10" opacity="0.55">' +
      '<circle cx="150" cy="150" r="46"/>' +
      '<path d="M62 330c14-64 46-96 88-96s74 32 88 96"/>' +
      '</g></svg>'
  );

export const Thumb = ({ url, alt, width = 240, className }) => {
  const [src, setSrc] = useState(() => thumbnailUrl(url, width));

  useEffect(() => {
    setSrc(thumbnailUrl(url, width));
  }, [url, width]);

  if (!url) return null;

  const roto = src === RESPALDO;
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      /* `data-roto` deja que cada contexto vista el respaldo (marco, sin velos)
         sin dejar de ser un `img`: los diez sitios que estilan `img` siguen
         sin enterarse. */
      data-roto={roto ? '' : undefined}
      title={roto ? 'La foto no cargó · pulsa para reintentar' : undefined}
      loading="lazy"
      decoding="async"
      /* Reintentar es pulsar la propia pieza: se vuelve a pedir la miniatura y,
         si sigue sin llegar, el onError la devuelve al respaldo. El clic sube
         igualmente a quien envuelva la foto (elegir la semana, abrir el visor):
         esto no roba el gesto, lo aprovecha. */
      onClick={roto ? () => setSrc(thumbnailUrl(url, width)) : undefined}
      onError={() => {
        // Dos intentos y a la pieza de respaldo: reintentar en bucle no lo
        // arregla, y el glifo roto del sistema no se enseña en esta casa.
        if (roto) return;
        setSrc(src !== url ? url : RESPALDO);
      }}
    />
  );
};
