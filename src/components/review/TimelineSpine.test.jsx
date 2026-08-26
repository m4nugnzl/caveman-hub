import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TimelineSpine } from './TimelineSpine';
import { reviewTimeline } from '@/domain/timeline';

/**
 * La espina: el proceso entero del cliente, y el salto largo, y van aquí por un motivo
 * concreto.
 *
 * ══ Qué venían a atrapar ════════════════════════════════════════════════════
 *
 * La revisión reventaba al abrirse: `Coach/WeekReview.jsx` construía la línea de
 * tiempo en un `useMemo` que leía las fotos agrupadas cien líneas antes de que
 * se declararan, o sea un `ReferenceError` en cada render. No lo vieron el
 * `eslint`, ni `tsc`, ni el build —los tres miran el archivo, y el archivo es
 * válido— porque solo aparece cuando alguien lo ejecuta.
 *
 * Mil trescientas pruebas de dominio y ninguna que montara un componente. Éstas
 * lo montan.
 *
 * ── Con `renderToStaticMarkup` y no con un DOM ─────────────────────────────
 * Sin dependencias nuevas: `react-dom` ya está, y `jsdom` o `testing-library`
 * serían dos paquetes y una configuración para lo que aquí hace falta, que es
 * comprobar que el árbol se construye. Lo que no se puede probar así son los
 * efectos ni los gestos —el ancho medido, el arrastre, las flechas—, y por eso
 * las reglas que deciden qué se ve viven en `domain/timeline.js`, donde sí se
 * prueban de verdad (`timeline.test.js`).
 */

const ALTA = '2026-07-27';

const lineaDe = (n) => {
  const weeks = Array.from({ length: n }, (_, i) => i + 1);
  return reviewTimeline({
    weeks,
    startDate: ALTA,
    series: weeks.map((w) => ({
      week: new Date(Date.parse(`${ALTA}T00:00:00Z`) + (w - 1) * 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      weight: 84 - w * 0.1,
      kcals: 2400 - w * 5,
    })),
  });
};

describe('TimelineSpine', () => {
  /* La regresión que motiva el rediseño: el proceso entero, sin recortes. */
  it('dibuja las cuarenta semanas y nombra los dos extremos', () => {
    const html = renderToStaticMarkup(
      <TimelineSpine weeks={lineaDe(40)} selected={30} desde={20} hasta={30} />
    );
    expect(html).toContain('de la semana 1 a la 40');
    expect(html).toContain('>S1<');
    expect(html).toContain('>S40<');
    /* La banda de la ventana, que es lo que ata la espina al apartado. */
    expect(html).toContain('espina-ventana');
  });

  it('sin recorte no pinta banda: no señalaría nada', () => {
    const html = renderToStaticMarkup(
      <TimelineSpine weeks={lineaDe(6)} selected={3} desde={0} hasta={6} />
    );
    expect(html).not.toContain('espina-ventana');
  });

  it('sin semanas no pinta nada', () => {
    expect(renderToStaticMarkup(<TimelineSpine weeks={[]} selected={null} />)).toBe('');
  });
});
