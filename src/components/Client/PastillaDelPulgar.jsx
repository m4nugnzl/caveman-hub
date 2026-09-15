import { createPortal } from 'react-dom';

import { useTecladoALaVista } from '@/lib/useTecladoALaVista';

/**
 * LA PASTILLA DEL PULGAR: lo que separa una web de una aplicación. (`M-07`)
 *
 * ══ Qué es ═════════════════════════════════════════════════════════════════
 *
 * Al tocar un campo de una serie sale el teclado numérico y, **encima de las
 * teclas**, una pastilla con dos botones y «Siguiente». Los dos botones dicen
 * lo mismo de dos maneras:
 *
 *   · **Como el plan · 80** — lo que te pautó tu entrenador en esa serie.
 *   · **La vez pasada · 80 × 8** — lo que hiciste la última vez.
 *
 * Un toque, sin mirar, para el caso que es el 90 % de las series. Y ninguna de
 * las dos cifras es nueva: las dos se estaban enseñando ya, en gris, dentro del
 * campo y en el renglón de debajo. La pastilla solo las saca a un botón.
 *
 * ══ Lo que NO ofrece, y es una decisión ════════════════════════════════════
 *
 * **No hay −2,5 / +2,5.** Los tuvo, pensados como un mando manual con el paso
 * real de la máquina. En la pantalla, un signo delante de una carga se lee como
 * una recomendación —«hoy te toca subir»— por mucho que quien lo puso lo
 * pensara de otra forma. Y esta aplicación no receta: resalta información y el
 * criterio es del entrenador.
 *
 * Quien quiera 82,5 lo escribe; el teclado está justo debajo. Eso es
 * exactamente lo que tiene que costar un cambio de carga.
 *
 * ══ Y si una cifra no existe, su botón no está ═════════════════════════════
 *
 * Un mando vacío es mobiliario. Sin peso pautado no hay «Como el plan», y en la
 * primera semana de un bloque no hay «La vez pasada». Con las dos vacías la
 * pastilla se queda solo con «Siguiente», que sigue siendo el ahorro de tener
 * que apuntar con el dedo al campo de al lado.
 *
 * ── Por qué se pinta en la raíz del documento ─────────────────────────────
 * Por lo mismo que la hoja: cualquier antepasado con `transform` se convierte
 * en el marco de referencia de un `position: fixed`, y la cinta de hojas del
 * teléfono se mueve con `transform`. Portada al `body`, la pastilla se ancla a
 * la pantalla y no a la hoja que esté deslizándose.
 *
 * @param campo  `{ etiqueta, plan, antes, antesDice }` o `null`. Lo publica la
 *   serie que tiene el foco; `null` cierra la pastilla.
 * @param onEscribir `(valor)` — escribe en el campo con el foco.
 * @param onSiguiente Salta al campo siguiente, como la tecla «Siguiente».
 */
export const PastillaDelPulgar = ({ campo, onEscribir, onSiguiente }) => {
  const teclado = useTecladoALaVista();

  if (!campo) return null;

  const contenido = (
    <div
      className="pastilla-pulgar"
      style={{ bottom: `calc(${teclado}px + var(--safe-b))` }}
      /*
        `mousedown`/`touchstart` con `preventDefault` es lo que impide que tocar
        la pastilla le quite el foco al campo. Sin esto, el teclado se cierra al
        pulsar, la pastilla se va con él y el toque no llega a ningún sitio: el
        botón parecería estar roto.
      */
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      {campo.plan && (
        <button type="button" className="pastilla-igual" onClick={() => onEscribir(campo.plan)}>
          Como el plan
          <b>{campo.plan}</b>
        </button>
      )}
      {campo.antes && (
        <button type="button" className="pastilla-igual" onClick={() => onEscribir(campo.antes)}>
          La vez pasada
          <b>{campo.antesDice || campo.antes}</b>
        </button>
      )}
      <button type="button" className="pastilla-sig" onClick={onSiguiente}>
        Siguiente
      </button>
    </div>
  );

  return typeof document === 'undefined' ? contenido : createPortal(contenido, document.body);
};
