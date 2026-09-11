import { useEffect, useRef } from 'react';

/**
 * ⌘Z Y ⌘⇧Z SOBRE EL PLAN QUE LA PANTALLA TIENE DELANTE.
 *
 * Mismo patrón que `useAtajosDeCopia`, del que es hermano: la pantalla dice qué
 * se deshace y qué se rehace, y esto pone el oyente. El ref se vacía al
 * principio de cada render y lo rellena quien lo usa al final, cuando ya sabe
 * si hay algo que deshacer; `null` en cualquiera de los dos es «aquí ese atajo
 * no hace nada», y entonces manda el navegador.
 *
 * ══ Por qué no va DENTRO de `useAtajosDeCopia` ══════════════════════════════
 * Comparten la guarda del campo de texto, pero no las demás: copiar tiene que
 * mirar si hay texto seleccionado —«copia esto» contra «copia el ejercicio»— y
 * deshacer tiene que atender a ⇧ y a un segundo atajo. Juntarlos en un solo
 * oyente con dos juegos de reglas es más difícil de leer que dos oyentes, y
 * fundirlos obligaría a tocar las tres pantallas que ya copian y pegan.
 *
 * ══ LA GUARDA QUE NO SE PUEDE QUITAR ════════════════════════════════════════
 * Dentro de un campo, manda el navegador. Media pantalla son casillas de
 * kilos, gramos y repeticiones: quien pulsa ⌘Z con el cursor dentro de una
 * casilla quiere recuperar lo que acababa de escribir, no retirar el
 * ejercicio que puso hace un minuto. Robarle ese ⌘Z sería cambiarle una
 * función que ya funciona por otra que no pidió — y encima destructiva.
 *
 * ── Y ⌘Y, porque en Windows es el rehacer de todo el mundo ──────────────────
 * ⌘⇧Z es el rehacer del Mac y de los navegadores; Ctrl+Y es el de Windows, que
 * es donde se monta la rutina. Los dos valen: no compiten con nada.
 *
 * @returns el ref con `{ deshacer, rehacer }`.
 */
export const useAtajoDeDeshacer = () => {
  const atajos = useRef({ deshacer: null, rehacer: null });
  atajos.current = { deshacer: null, rehacer: null };

  useEffect(() => {
    const alPulsar = (evento) => {
      if (!(evento.metaKey || evento.ctrlKey) || evento.altKey) return;
      const tecla = evento.key.toLowerCase();
      if (tecla !== 'z' && tecla !== 'y') return;
      if (evento.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      const verbo = tecla === 'y' || evento.shiftKey ? 'rehacer' : 'deshacer';
      if (!atajos.current[verbo]) return;
      evento.preventDefault();
      atajos.current[verbo]();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  return atajos;
};
