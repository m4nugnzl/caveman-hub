/**
 * ¿HAY UNA VERSIÓN NUEVA DE LA APLICACIÓN?
 *
 * ══ El fallo que cierra ═════════════════════════════════════════════════════
 *
 * Una pestaña abierta —o la PWA del teléfono, que vive días en memoria— sigue
 * ejecutando el bundle que cargó aunque se haya publicado otro. Y el
 * entrenador guarda el programa ENTERO en cada escritura: una versión vieja
 * lo reescribía con sus reglas, encima de lo que había dejado la nueva. El
 * service worker no lo evita: sirve el HTML con la red primero, pero solo a
 * quien vuelve a cargar la página.
 *
 * ══ Cómo ════════════════════════════════════════════════════════════════════
 *
 * El build lleva su id (`scripts/version.mjs`) y lo deja también en
 * `/version.json`, sin caché. Al volver a la pestaña, y cada cuarto de hora con
 * ella delante, se comparan los dos. Si no coinciden:
 *
 *   · la franja de `ui/EstadoDeRed` dice «Hay una versión nueva» con «Recargar»;
 *   · y el programa deja de MANDARSE (`persist`, en `AppContext`) hasta
 *     recargar. No se pierde: se queda en la nota del navegador con la versión
 *     del servidor sobre la que se hizo, y la versión nueva lo vuelve a aplicar
 *     al arrancar —o pregunta, si alguien ha escrito encima—. Las series del
 *     cliente sí siguen: van campo a campo por `log_session_set` y no pisan el
 *     plan.
 *
 * En desarrollo no hay id ni `version.json`, y esto no dice nada nunca.
 */

import { useSyncExternalStore } from 'react';

/** El id de ESTE bundle, o `null` fuera de un build. */
export const BUILD = import.meta.env.VITE_BUILD || null;

let nueva = false;
const oyentes = new Set();

const avisar = () => {
  for (const oyente of oyentes) oyente();
};

/** ¿Se ha publicado otra versión desde que se cargó esta? */
export const hayVersionNueva = () => nueva;

/**
 * Pregunta al servidor qué versión hay publicada. Sin red, o sin
 * `version.json`, no concluye nada: callar es lo seguro, porque avisar en falso
 * dejaría a alguien sin poder guardar.
 */
export const comprobarVersion = async () => {
  if (!BUILD || nueva) return nueva;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { build } = await res.json();
    if (build && build !== BUILD) {
      nueva = true;
      avisar();
    }
  } catch (e) {
    /* Sin red o con una respuesta que no es JSON: se vuelve a mirar la próxima
       vez. No es un fallo de nadie. */
    console.warn('No se pudo comprobar la versión publicada:', e);
  }
  return nueva;
};

/** Cada cuánto se mira con la pestaña delante: la del PC vive todo el día. */
const CADA_MS = 15 * 60 * 1000;

/** Empieza a vigilar. Devuelve la función que lo para. */
export const vigilarVersion = () => {
  if (!BUILD) return () => {};
  const alVolver = () => {
    if (document.visibilityState === 'visible') comprobarVersion();
  };
  document.addEventListener('visibilitychange', alVolver);
  const reloj = setInterval(alVolver, CADA_MS);
  comprobarVersion();
  return () => {
    document.removeEventListener('visibilitychange', alVolver);
    clearInterval(reloj);
  };
};

/** Lo mismo, para pintar. */
export const useVersionNueva = () =>
  useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    hayVersionNueva,
    () => false
  );

/**
 * La firma de UNA escritura del programa: el build y algo que no se repite.
 *
 * Va a `workout_data.escrito_por` en cada guardado del entrenador. Tiene que
 * cambiar SIEMPRE: el trigger de la 0131 rechaza un cambio del plan que deja
 * la columna como estaba, que es lo que hace una versión que no la conoce.
 */
export const firmaDeEscritura = () => `${BUILD || 'dev'}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Solo para las pruebas: vuelve al estado de recién cargada. */
export const _reiniciarVersion = () => {
  nueva = false;
};
