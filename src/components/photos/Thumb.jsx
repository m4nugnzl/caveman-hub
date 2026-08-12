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
export const Thumb = ({ url, alt, width = 240, className }) => {
  const [src, setSrc] = useState(() => thumbnailUrl(url, width));

  useEffect(() => {
    setSrc(thumbnailUrl(url, width));
  }, [url, width]);

  if (!url) return null;

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        // Solo una vez: si la original tampoco carga, el navegador enseña su
        // icono de imagen rota y reintentar en bucle no lo arregla.
        if (src !== url) setSrc(url);
      }}
    />
  );
};
