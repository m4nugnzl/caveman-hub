import { useEffect, useRef } from 'react';

/**
 * ⌘C Y ⌘V SOBRE LA PIEZA QUE LA PANTALLA YA SABE CUÁL ES.
 *
 * El gesto que todo el mundo tiene en los dedos, y sin inventar una selección
 * nueva: cada pantalla dice qué copia y qué pega —el ejercicio en foco en la
 * hoja, la comida en foco en la dieta— y esto pone el oyente.
 *
 * ══ Las tres guardas, y por qué ninguna sobra ═══════════════════════════════
 *
 * 1. DENTRO DE UN CAMPO, MANDA EL NAVEGADOR. Media pantalla son casillas de
 *    kilos, gramos y repeticiones: robarle el ⌘C a quien está copiando un
 *    número sería cambiar una función que funciona por otra que no pidió.
 * 2. CON TEXTO SELECCIONADO, TAMBIÉN. Seleccionar el nombre de un ejercicio
 *    para pegarlo en WhatsApp es un gesto real, y `getSelection` es lo único
 *    que distingue «copia esto» de «copia el ejercicio».
 * 3. Y NO SE TOCA EL PORTAPAPELES DEL SISTEMA. Lo que se copia aquí son objetos
 *    con sus series o sus alimentos, no texto; escribirlos además en el del
 *    sistema le borraría a alguien lo que llevara en la mano.
 *
 * ══ Por qué un ref y no dos manejadores ═════════════════════════════════════
 *
 * El oyente se pone UNA vez —volver a colgarlo en cada tecleo de una casilla es
 * un `addEventListener` por pulsación—, así que no puede cerrar sobre los
 * verbos de este render. El ref se refresca después de cada uno y el oyente lee
 * siempre el último.
 *
 * Y se vacía AQUÍ, al principio de cada render: las pantallas que lo usan tienen
 * retornos tempranos —el programa no ha cargado, no hay dieta— y si esta pasada
 * se va por uno de ellos, el atajo no puede seguir apuntando a la hoja de hace
 * un momento. Quien lo usa solo tiene que rellenarlo al final del render, cuando
 * ya sabe qué hay delante.
 *
 * @returns el ref con `{ copiar, pegar }`. `null` en cualquiera de los dos es
 *          «aquí ese atajo no hace nada», y entonces manda el navegador.
 */
export const useAtajosDeCopia = () => {
  const atajos = useRef({ copiar: null, pegar: null });
  atajos.current = { copiar: null, pegar: null };

  useEffect(() => {
    const alPulsar = (evento) => {
      if (!(evento.metaKey || evento.ctrlKey) || evento.altKey) return;
      const tecla = evento.key.toLowerCase();
      if (tecla !== 'c' && tecla !== 'v') return;
      if (evento.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (tecla === 'c') {
        if (String(window.getSelection?.() || '').length > 0) return;
        if (!atajos.current.copiar) return;
        evento.preventDefault();
        atajos.current.copiar();
        return;
      }
      if (!atajos.current.pegar) return;
      evento.preventDefault();
      atajos.current.pegar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  return atajos;
};
