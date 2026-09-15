import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { Hoja } from './Hoja';

/**
 * LA HOJA, en lo que promete por fuera.
 *
 * ══ Por qué esto se prueba ══════════════════════════════════════════════════
 *
 * Porque esta pieza nació de sacar la hoja de «Más» de dentro de `BottomNav`, y
 * en esa mudanza se le añadió justo lo que le faltaba: el papel de diálogo, la
 * etiqueta que lee un lector de pantalla y el ASA. Las tres son invisibles para
 * quien mira la pantalla —la hoja se ve igual con ellas y sin ellas— así que
 * son exactamente las que se pierden en el siguiente retoque sin que nadie lo
 * note hasta que alguien navega con teclado.
 *
 * El asa además NO es decoración: es el nodo que recibe el arrastre para
 * cerrar. Si desaparece del marcado, el gesto deja de existir en silencio y la
 * hoja vuelve a ser una caja que solo se cierra con el aspa.
 *
 * Aquí solo hay `renderToStaticMarkup`, como en el resto de la casa, así que lo
 * que se comprueba es el marcado: el comportamiento con efectos —el foco
 * atrapado, Escape, el fondo quieto— vive en `lib/useCapaModal` y es el mismo
 * que lleva el diálogo desde hace meses.
 */
const pinta = (props) =>
  renderToStaticMarkup(
    <Hoja etiqueta="Más secciones" onCerrar={() => {}} {...props}>
      <a href="/mi/dieta">Mi dieta</a>
    </Hoja>,
  );

describe('Hoja', () => {
  it('cerrada no monta nada: una capa fantasma bloquea la pantalla entera', () => {
    expect(pinta({ abierta: false })).toBe('');
  });

  it('abierta es un diálogo con nombre, no una caja anónima', () => {
    const html = pinta({ abierta: true });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Más secciones"');
  });

  it('lleva el asa, que es lo que recibe el arrastre para cerrar', () => {
    expect(pinta({ abierta: true })).toContain('class="sheet-grip"');
  });

  it('el velo y la hoja conservan sus clases: el CSS cuelga de ellas', () => {
    const html = pinta({ abierta: true });
    expect(html).toContain('class="sheet-backdrop"');
    expect(html).toContain('class="sheet"');
    // `data-state` es de lo que cuelga la animación de salida (`useDismissable`).
    expect(html).toContain('data-state="open"');
  });

  it('pinta dentro lo que se le da', () => {
    expect(pinta({ abierta: true })).toContain('Mi dieta');
  });
});
