/**
 * ¿Hay red? Un solo sitio lo sabe, y todo el mundo le pregunta a él.
 *
 * ══ Por qué no basta con `navigator.onLine` ═════════════════════════════════
 *
 * `navigator.onLine` contesta «¿tiene este aparato una interfaz de red levantada?»,
 * que NO es la pregunta. Un móvil con una raya de cobertura en un sótano, un wifi
 * de gimnasio que pide contraseña en un portal cautivo o un túnel caído dan todos
 * `true`: hay interfaz, no hay servidor. Fiarse solo de eso deja la nube sin tachar
 * mientras nada se guarda, que es peor que no tener nube.
 *
 * Así que hay DOS fuentes y esto las junta:
 *
 *   1. `navigator.onLine` y sus eventos — instantáneo y gratis, pero optimista.
 *   2. Lo que de verdad pasa al hablar con Supabase — `lib/supabaseClient` ya
 *      envuelve el `fetch` de todas las llamadas (no hay forma de hablar con el
 *      servidor que no pase por ahí), así que avisa aquí cuando una petición se
 *      queda SIN RESPUESTA y cuando vuelve a haberla.
 *
 * La regla: se está fuera si el navegador lo dice, o si la última llamada al
 * servidor se quedó sin respuesta. Se vuelve a estar dentro en cuanto una
 * cualquiera contesta —da igual qué conteste, un 403 también es señal de que hay
 * servidor al otro lado—.
 *
 * ── Por qué un módulo y no un contexto ──────────────────────────────────────
 * Porque quien más lo necesita no es un componente: es la cola de guardado
 * (`lib/saveQueue`), que decide si mandar o esperar y no vive dentro de React.
 * Los componentes lo leen con `useConexion`, que es `useSyncExternalStore` sobre
 * este mismo estado — una sola verdad para los dos mundos.
 */

import { useSyncExternalStore } from 'react';

/** Lo que dice el navegador. En SSR y en el prerender no hay `navigator`. */
const navegadorEnLinea = () =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

/*
  La sospecha: la última llamada al servidor se quedó sin respuesta.

  Se guarda aparte de `navigator.onLine` porque son dos hechos distintos y el
  falso positivo va en direcciones opuestas: el navegador se equivoca diciendo
  que sí, y una petición suelta que falla podría equivocarse diciendo que no
  (un servidor caído no es lo mismo que estar sin cobertura). Como el efecto en
  la aplicación es EL MISMO —esperar y reenviar en vez de dar por perdido—, se
  tratan igual y no hace falta distinguirlos.
*/
let servidorMudo = false;

const oyentes = new Set();

const avisar = () => {
  for (const oyente of oyentes) oyente();
};

/** ¿Se puede hablar con el servidor ahora mismo? */
export const hayRed = () => navegadorEnLinea() && !servidorMudo;

/**
 * Una llamada al servidor se quedó sin respuesta.
 *
 * Lo llama el `fetch` de `lib/supabaseClient` desde su `catch`, que es el punto
 * por el que pasa toda la conversación con Supabase.
 */
export const apuntarSilencio = () => {
  if (servidorMudo) return;
  servidorMudo = true;
  avisar();
};

/**
 * El servidor ha contestado. Cualquier respuesta vale, incluido un error suyo:
 * lo que se estaba comprobando es que hay alguien al otro lado.
 */
export const apuntarRespuesta = () => {
  if (!servidorMudo) return;
  servidorMudo = false;
  avisar();
};

/**
 * Avisa cuando el estado cambia. Devuelve la función de baja.
 *
 * Los eventos del navegador se enganchan UNA vez, en el módulo, y no por
 * suscriptor: son globales y engancharlos por componente solo multiplica el
 * mismo aviso.
 */
export const escucharConexion = (oyente) => {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    /* Volver a tener interfaz no demuestra que el servidor conteste, pero sí
       invalida la sospecha anterior: merece un intento. Si sigue mudo, la
       primera llamada que falle lo volverá a apuntar. */
    servidorMudo = false;
    avisar();
  });
  window.addEventListener('offline', avisar);
}

/** El mismo estado, para un componente. */
export const useConexion = () =>
  useSyncExternalStore(
    escucharConexion,
    hayRed,
    /* En el prerender no hay red que consultar y tampoco nada que guardar: se
       pinta como si la hubiera para que la portada no salga con la nube
       tachada. */
    () => true
  );
