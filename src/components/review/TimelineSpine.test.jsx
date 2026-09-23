import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TimelineSpine } from './TimelineSpine';
import { semanasDelPlan } from '@/domain/semanasDelPlan';

/**
 * La espina: el roadmap del cliente y el selector de semana de la revisión.
 *
 * ══ Qué vienen a atrapar ════════════════════════════════════════════════════
 *
 * La revisión reventó una vez al abrirse por un `ReferenceError` que no vieron
 * ni `eslint`, ni `tsc`, ni el build: solo aparece cuando alguien monta el
 * componente. Estas lo montan, en sus dos estados.
 *
 * Con `renderToStaticMarkup` y sin DOM: lo que no se prueba así —el ancho
 * medido, el arrastre— lo deciden reglas que viven en `domain/` y en
 * `roadmap/geometria`, donde sí se prueban.
 */

const HOY = '2026-11-12';

const definicion = {
  id: 'def',
  title: 'Definición',
  direction: 'cut',
  ratePct: 0.6,
  startsOn: '2026-09-07',
  endsOn: '2026-12-27',
  replanteos: [{ semana: '2026-10-19', pesoBase: 74.9, ratePct: 0.7 }],
};

const history = [];
for (let t = Date.parse('2026-09-01'); t <= Date.parse(HOY); t += 2 * 86400000) {
  history.push({ date: new Date(t).toISOString().slice(0, 10), weight: 76 - (t - Date.parse('2026-09-01')) / (86400000 * 60) });
}

const plan = semanasDelPlan({
  phases: [definicion],
  history,
  reviews: [{ weekStart: '2026-10-12', snapshot: { kcals: 2450 } }],
  plan: { kcals: 2300 },
  hoy: HOY,
});

const pinta = (props) => renderToStaticMarkup(<TimelineSpine plan={plan} {...props} />);

describe('TimelineSpine', () => {
  it('plegada: la banda, el peso y las marcas, sin fantasmas ni kcal', () => {
    const html = pinta({
      elegida: '2026-10-26',
      pendiente: '2026-11-02',
      marcas: new Set(['2026-10-12']),
      onPlan: () => {},
    });
    expect(html).toContain('is-espina');
    expect(html).toContain('lp-fase');
    /* El peso real lo dibuja `TrazoDelPeso`, el mismo que las tiras. */
    expect(html).toContain('progreso-trazo');
    expect(html).toContain('lp-marca-hecha');
    expect(html).toContain('lp-marca-pendiente');
    /* La banda de las fases abre el plan. */
    expect(html).toContain('lp-golpe-plan');
    expect(html).not.toContain('lp-fantasma');
    expect(html).not.toContain('lp-kcal');
    expect(html).toContain('Desplegar');
  });

  it('desplegada: la línea entera, con su zoom y su leyenda', () => {
    const html = pinta({ abierta: true, elegida: '2026-10-26' });
    expect(html).not.toContain('is-espina');
    /* El replanteo del 19 oct deja la recta de antes como fantasma. */
    expect(html).toContain('lp-fantasma');
    expect(html).toContain('lp-kcal');
    expect(html).toContain('Temporada');
    expect(html).toContain('Media semanal');
    expect(html).toContain('Plegar');
  });

  it('sin plan no pinta nada', () => {
    expect(renderToStaticMarkup(<TimelineSpine plan={null} />)).toBe('');
  });
});
