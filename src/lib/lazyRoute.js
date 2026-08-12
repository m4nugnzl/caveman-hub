import { lazy } from 'react';

/**
 * Carga diferida de una ruta, a prueba de despliegues.
 *
 * ══ El problema que resuelve ════════════════════════════════════════════════
 *
 * «Failed to fetch dynamically imported module: /assets/CalendarPanel-EM8W….js»
 *
 * No es un fallo de red ni un error de programación: es la consecuencia
 * inevitable de dividir el código. Los fragmentos llevan el hash del contenido en
 * el nombre, y al desplegar una versión nueva los del despliegue anterior
 * DESAPARECEN. Una pestaña que lleva abierta desde antes conserva el `index.html`
 * viejo, con las referencias viejas, y en cuanto navegas a una pantalla que
 * todavía no había cargado pide un archivo que ya no existe.
 *
 * Le pasa a cualquiera que tuviera la aplicación abierta cuando desplegaste. No
 * se arregla con cabeceras de caché: el HTML ya está en memoria de esa pestaña.
 *
 * ══ La solución ═════════════════════════════════════════════════════════════
 *
 * Recargar. La página vuelve a pedir el `index.html`, obtiene las referencias
 * nuevas y sigue donde estaba —la ruta está en la URL, así que no se pierde el
 * sitio—.
 *
 * ── El seguro contra el bucle ───────────────────────────────────────────────
 * Recargar a ciegas ante un fallo de importación es peligroso: si el archivo no
 * existe por otro motivo —un despliegue a medias, un CDN roto, un bloqueador—,
 * la página entraría en un bucle de recargas que no arregla nada y que además
 * borra cualquier intento de leer el error.
 *
 * Por eso se recarga UNA sola vez por sesión de pestaña. Si tras recargar vuelve
 * a fallar, el error se propaga y lo recoge `ErrorBoundary`, que ya sabe
 * enseñarlo con su botón. Es la diferencia entre recuperarse de lo previsible y
 * esconder lo que no lo es.
 */

const FLAG = 'caveman-chunk-reload';

const alreadyReloaded = () => {
  try {
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    // Modo privado o almacenamiento bloqueado: sin seguro, mejor no recargar.
    return true;
  }
};

const markReloaded = () => {
  try {
    sessionStorage.setItem(FLAG, '1');
  } catch {
    // Si no se puede marcar, no se recarga: ver `alreadyReloaded`.
  }
};

const clearFlag = () => {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    // Da igual: sin almacenamiento, el seguro ya estaba puesto.
  }
};

/**
 * El envoltorio de reintento, separado de `lazy` para poder probarlo.
 *
 * `lazy()` no llama al cargador hasta que React renderiza el componente, así que
 * con todo junto no habría forma de ejercitar el camino del fallo sin montar un
 * árbol de React. Aquí es una función que devuelve una promesa: se llama y se
 * comprueba.
 *
 * `reload` entra por parámetro por lo mismo: una prueba no puede recargar la
 * página de verdad.
 */
export const withChunkRetry = (loader, reload = () => window.location.reload()) => () =>
  loader()
      .then((module) => {
        /*
          ── Dónde se rearma el seguro, y por qué AQUÍ ────────────────────────
          Al cargar bien un fragmento, y no al arrancar la aplicación.

          Rearmarlo en el arranque sería el bucle: fallo → recarga → arranque →
          seguro quitado → mismo fallo → recarga, para siempre. Un fragmento que
          se descarga bien es la única prueba de que el despliegue nuevo está
          entero, y es entonces cuando se puede volver a confiar.
        */
        clearFlag();
        return module;
      })
      .catch((error) => {
        if (alreadyReloaded()) throw error;

        markReloaded();
        reload();

        /*
          Una promesa que no se resuelve nunca. La página se está recargando, así
          que no hay ningún estado que valga la pena calcular; devolver un
          componente vacío haría parpadear una pantalla rota justo antes de que
          desaparezca.
        */
        return new Promise(() => {});
      });

/** La ruta diferida lista para usar en el mapa de rutas. */
export const lazyRoute = (loader) => lazy(withChunkRetry(loader));
