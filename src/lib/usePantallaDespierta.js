import { useEffect } from 'react';

/**
 * LA PANTALLA NO SE APAGA mientras dura lo que se está haciendo. (`W-03`)
 *
 * ══ El problema, medido en el gimnasio ═════════════════════════════════════
 *
 * Entre serie y serie pasan dos minutos, y el teléfono se bloquea solo en uno.
 * Volver cuesta la cara, el código o la huella —con las manos con magnesio— y
 * después encontrar otra vez la serie por la que ibas. Buscado en todo el
 * repositorio antes de escribir esto: cero referencias a `wakeLock`.
 *
 * ══ Por qué se puede hacer en una pestaña ══════════════════════════════════
 *
 * `navigator.wakeLock.request('screen')` es una API del NAVEGADOR: no hace
 * falta instalar nada, que es la decisión D-1 del replanteamiento («móvil en
 * internet, no app»). No está en todas partes —Safari en iOS la trae desde la
 * 16.4— y donde no está, esto no hace nada y nadie se enrera: no hay mensaje,
 * porque no hay nada que la persona pueda arreglar.
 *
 * ══ Las dos cosas que hay que hacer bien ═══════════════════════════════════
 *
 *   · **Soltarlo.** Un cerrojo que se queda puesto es la batería de alguien.
 *     Se suelta al terminar la sesión y al desmontar, sin excepción.
 *
 *   · **Volver a pedirlo al volver a la pestaña.** El sistema lo REVOCA solo
 *     al minimizar el navegador o al bloquear la pantalla a mano, y no lo
 *     devuelve. Sin el `visibilitychange`, mirar un mensaje de WhatsApp a
 *     mitad de descanso deja el resto de la sesión sin cerrojo — y eso es
 *     justo lo que pasa de verdad en un gimnasio.
 *
 * @param {boolean} activo Mientras sea cierto, la pantalla se mantiene viva.
 */
export const usePantallaDespierta = (activo) => {
  useEffect(() => {
    if (!activo) return undefined;
    if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined;

    let cerrojo = null;
    let vivo = true;

    const pedir = async () => {
      if (!vivo || cerrojo || document.visibilityState !== 'visible') return;
      try {
        cerrojo = await navigator.wakeLock.request('screen');
        /* El propio sistema lo suelta al minimizar o al bloquear a mano. Con
           esto se sabe, y se puede volver a pedir al regresar. */
        cerrojo.addEventListener?.('release', () => {
          cerrojo = null;
        });
      } catch {
        /*
          Sin cerrojo la pantalla se apagará: es una comodidad que no se puede
          garantizar, no un fallo del entreno. Falla cuando el sistema lo niega
          —batería baja, ahorro de energía— y no hay nada que decirle a nadie
          sobre eso. Lo que NO se hace es reintentar en bucle: eso sí gastaría
          batería de verdad.
        */
      }
    };

    const alVolver = () => {
      if (document.visibilityState === 'visible') pedir();
    };

    pedir();
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
      cerrojo?.release?.().catch(() => {
        /* Soltar algo que el sistema ya soltó no es un problema. */
      });
      cerrojo = null;
    };
  }, [activo]);
};
