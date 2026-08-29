import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ReviewChart } from './ReviewChart';

/**
 * La banda de abajo se puede cambiar, y es lo único de esta gráfica que se
 * elige desde fuera. Sin esta prueba, cambiar el campo que dibuja —o el
 * catálogo `BANDAS`— se nota solo mirando la pantalla.
 */
const semanas = [
  { week: 1, weekStart: '2026-01-05', weight: 80, kcals: 2600, steps: 8000 },
  { week: 2, weekStart: '2026-01-12', weight: 79.5, kcals: 2600, steps: 9000 },
  { week: 3, weekStart: '2026-01-19', weight: 79.2, kcals: 2400, steps: 11000 },
];

const pintar = (props) => renderToStaticMarkup(<ReviewChart weeks={semanas} ancho={800} soloLectura {...props} />);

describe('la banda de abajo de la gráfica de la revisión', () => {
  it('dibuja las calorías por defecto', () => {
    const html = pintar({});
    expect(html).toContain('KCAL OBJETIVO');
    expect(html).not.toContain('PASOS AL DÍA');
  });

  it('dibuja los pasos cuando se le piden', () => {
    const html = pintar({ banda: 'steps' });
    expect(html).toContain('PASOS AL DÍA');
    expect(html).not.toContain('KCAL OBJETIVO');
  });

  /* Los peldaños salen de la propia serie y no de `fila.changed`, que solo sabe
     de calorías: con los pasos marcaría los escalones de la otra banda. */
  it('marca un peldaño por cada cambio de la serie que dibuja', () => {
    const conKcal = pintar({});
    const conPasos = pintar({ banda: 'steps' });
    expect((conKcal.match(/banda-escalon/g) || []).length).toBe(1); // 2600 → 2400
    expect((conPasos.match(/banda-escalon/g) || []).length).toBe(2); // 8000 → 9000 → 11000
  });
});
