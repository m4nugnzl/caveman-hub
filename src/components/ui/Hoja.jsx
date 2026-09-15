import { createPortal } from 'react-dom';

import { useArrastrarParaCerrar } from '@/lib/useArrastrarParaCerrar';
import { useCapaModal } from '@/lib/useCapaModal';
import { useDismissable } from '@/lib/useDismissable';

/**
 * LA HOJA: la superficie que sube desde el borde de abajo.
 *
 * ══ Por qué es una pieza y no un trozo de la barra ═════════════════════════
 * Existía, y vivía DENTRO de `BottomNav`: era el desplegable de «Más» y nada
 * más. Como resultado, la única superficie del producto pensada para el pulgar
 * no la podía usar ninguna otra pantalla, y cada vez que hacía falta enseñar
 * algo en el móvil se abría un diálogo centrado —con su velo tapando justo
 * aquello con lo que se compara— o se navegaba a otra ruta y se perdía el
 * sitio.
 *
 * Aquí abajo está el borde que alcanza el pulgar sin recolocar la mano. Eso es
 * lo que la hace la superficie del teléfono, y por eso es una pieza.
 *
 * ══ Qué añade sobre lo que había ═══════════════════════════════════════════
 *  · **Foco atrapado y Escape**, que la hoja de «Más» no tenía: se tabulaba
 *    fuera de ella hacia la página de detrás, que sigue ahí y es inerte.
 *  · **Arrastre para cerrar** desde la agarradera (`useArrastrarParaCerrar`).
 *    La agarradera estaba dibujada y no hacía nada: era la promesa sin el
 *    gesto.
 *  · **Salida animada**, que ya traía por `useDismissable`, y el fondo quieto.
 *
 * ══ Por qué las clases se siguen llamando `.sheet` ═════════════════════════
 * Porque `.hoja` YA ES OTRA COSA en esta casa: `.hoja-nota`, `.hoja-mas`,
 * `.hoja-contexto`, `.hoja-barra-acciones` son la hoja de Entreno —el documento
 * del día—, y `--hoja` es además un token de superficie. Dos vocabularios
 * distintos compartiendo prefijo es exactamente el fallo del que se viene, y
 * renombrar el de Entreno para que esta pieza estrene nombre sería mover
 * cuarenta reglas para ganar simetría.
 *
 * Así que el componente se llama como lo que es en la conversación del producto
 * —la hoja— y sus clases conservan el nombre con el que están escritas. Si
 * alguna vez hay que tocarlo, se toca entero y a la vez.
 *
 * ══ Cómo se usa ════════════════════════════════════════════════════════════
 *
 *     <Hoja abierta={abierto} onCerrar={() => setAbierto(false)} etiqueta="Más secciones">
 *       …
 *     </Hoja>
 *
 * Solo se ve por debajo del corte del chasis (1024 px): por encima navega la
 * barra lateral y una hoja no pinta nada. Eso lo decide el CSS, no esto.
 */
export const Hoja = ({ abierta, onCerrar, children, etiqueta }) => {
  const { mounted, closing, ref } = useDismissable(abierta);
  const { hojaRef, asaProps } = useArrastrarParaCerrar(onCerrar);
  useCapaModal({ montada: mounted, onClose: onCerrar, cajaRef: hojaRef });

  if (!mounted) return null;

  const contenido = (
    <div
      ref={ref}
      className="sheet-backdrop"
      data-state={closing ? 'closing' : 'open'}
      /* `mousedown` y no `click`: con `click`, soltar el dedo fuera después de
         arrastrar la hoja contaba como pulsar el fondo. */
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()}
    >
      <div
        ref={hojaRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        tabIndex={-1}
      >
        {/*
          La agarradera es el ASA, no un adorno: es lo que recibe el arrastre.
          `aria-hidden` porque para quien no la ve no dice nada — el cierre por
          teclado es Escape y el cierre por lector de pantalla es salir de la
          capa, que ya están.
        */}
        <span className="sheet-grip" aria-hidden="true" {...asaProps} />
        {children}
      </div>
    </div>
  );

  /* Se pinta en la raíz por lo mismo que el diálogo: cualquier antepasado con
     `transform`, `filter` o `backdrop-filter` —y el chasis lleva cristal— se
     convierte en el marco de referencia de un `position: fixed`, y entonces la
     hoja sube desde el borde de la barra en vez de desde el de la pantalla.
     Sin documento no hay dónde portar: el build prerenderiza la portada. */
  return typeof document === 'undefined' ? contenido : createPortal(contenido, document.body);
};
