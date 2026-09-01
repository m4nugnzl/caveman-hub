import { useState } from 'react';

/**
 * Soltar ficheros encima de una zona de la pantalla.
 *
 * ══ Por qué es un gancho y no está escrito en cada pantalla ═════════════════
 *
 * Porque son tres sitios —traer un plan de fuera, las fotos de una revisión y
 * las máquinas de un gimnasio— y las trampas del arrastre de HTML5 son siempre
 * las mismas tres. Copiarlas es garantizar que una de las tres se olvide de
 * alguna, y las tres se notan:
 *
 *   · **Sin `preventDefault` en `dragover` no hay `drop`.** El navegador no deja
 *     soltar nada en una zona que no ha dicho que lo acepta, así que sin esa
 *     línea el fichero se abre en otra pestaña y se lleva por delante lo que
 *     hubiera a medias.
 *   · **`dragleave` salta al pasar de un hijo a otro.** Sin comprobar a dónde va
 *     el cursor, la zona parpadea mientras se la recorre.
 *   · **No todo lo que se arrastra es un fichero.** Seleccionar unas celdas y
 *     arrastrarlas no es traer nada: encender la zona ahí prometería algo que no
 *     va a pasar. `types` lo distingue, y ese arrastre sigue cayendo donde
 *     corresponde —en el cuadro de texto que tenga debajo, si lo hay—.
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 * Validar. Lo que se suelte se entrega tal cual a `onFicheros`, que es quien ya
 * sabe qué acepta —`usePhotoBatch` mira tipo y tamaño; `useSheetSource` intenta
 * leerlo—. Un gancho que además decidiera qué es válido tendría que conocer a
 * sus tres consumidores.
 *
 * ── Y en táctil no existe ───────────────────────────────────────────────────
 * En un teléfono no hay arrastre de ficheros, así que esto no aporta nada allí:
 * es un ATAJO para quien tiene ratón, nunca la única puerta. Toda zona que lo
 * use tiene que ser además un botón que abra el buscador de archivos.
 *
 * ── Cómo se usa ─────────────────────────────────────────────────────────────
 *
 *     const soltar = useArrastreDeFicheros(lote.addFiles, !lote.busy);
 *     <div {...soltar.props}>
 *       <ZonaDeSoltar encima={soltar.encima} … />
 *     </div>
 *
 * `props` va en el envoltorio y no en la zona a propósito: quien arrastra apunta
 * a la ventana, no a un rectángulo, y soltar dos píxeles fuera no puede
 * significar «no ha pasado nada».
 */
export const useArrastreDeFicheros = (onFicheros, activo = true) => {
  const [encima, setEncima] = useState(false);

  const traeFicheros = (e) => activo && [...(e.dataTransfer?.types || [])].includes('Files');

  return {
    encima,
    props: {
      onDragOver: (e) => {
        if (!traeFicheros(e)) return;
        e.preventDefault();
        if (!encima) setEncima(true);
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setEncima(false);
      },
      onDrop: (e) => {
        if (!traeFicheros(e)) return;
        e.preventDefault();
        setEncima(false);
        onFicheros(e.dataTransfer.files);
      },
    },
  };
};
