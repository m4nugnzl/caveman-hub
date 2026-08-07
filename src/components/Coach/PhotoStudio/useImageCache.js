import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carga y cachea las imágenes que el lienzo necesita.
 *
 * ── Por qué `crossOrigin` importa aquí ──────────────────────────────────────
 * Para poder EXPORTAR el montaje, el navegador exige que todas las imágenes
 * dibujadas en el lienzo se hayan cargado con permiso CORS. Si no, el lienzo
 * queda "contaminado" (tainted) y `toBlob()` lanza SecurityError: se ve el
 * montaje en pantalla pero no se puede descargar.
 *
 * Supabase Storage sirve las URLs firmadas con cabeceras CORS abiertas, así que
 * el primer intento es con `crossOrigin = 'anonymous'`. Si aun así falla (un
 * proxy intermedio que las elimine, por ejemplo), se reintenta sin CORS para
 * que al menos se pueda MIRAR la comparación, y se marca la imagen como
 * contaminada para poder avisar de que la descarga no funcionará.
 */

const cache = new Map(); // url -> { image, tainted }

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const attempt = (withCors) => {
      const image = new Image();
      if (withCors) image.crossOrigin = 'anonymous';
      image.decoding = 'async';

      image.onload = () => resolve({ image, tainted: !withCors });
      image.onerror = () => {
        if (withCors) attempt(false);
        else reject(new Error('No se pudo cargar la imagen.'));
      };
      image.src = url;
    };
    attempt(true);
  });

export function useImageCache(urls) {
  /*
   * `version` sube cada vez que termina de cargar una imagen. Se expone a
   * propósito: el lienzo lo incluye en las dependencias de su efecto de dibujo,
   * porque `get` es estable (la caché vive fuera de React) y sin este contador
   * no habría nada que le indicase que ya hay píxeles nuevos que pintar.
   */
  const [version, bump] = useState(0);
  const [errors, setErrors] = useState({});
  const pendingRef = useRef(new Set());

  const wanted = urls.filter(Boolean);

  useEffect(() => {
    let alive = true;

    wanted.forEach((url) => {
      if (cache.has(url) || pendingRef.current.has(url)) return;
      pendingRef.current.add(url);

      loadImage(url)
        .then((entry) => {
          cache.set(url, entry);
          if (alive) bump((n) => n + 1);
        })
        .catch(() => {
          if (alive) setErrors((prev) => ({ ...prev, [url]: true }));
        })
        .finally(() => {
          pendingRef.current.delete(url);
        });
    });

    return () => {
      alive = false;
    };
    // `wanted` se recrea en cada render; se compara por contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted.join('|')]);

  const get = useCallback((url) => (url ? cache.get(url)?.image ?? null : null), []);

  const isReady = wanted.length > 0 && wanted.every((url) => cache.has(url) || errors[url]);
  const anyTainted = wanted.some((url) => cache.get(url)?.tainted);
  const failed = wanted.filter((url) => errors[url]);

  return { get, version, isReady, anyTainted, failed };
}
