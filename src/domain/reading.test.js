import { describe, expect, it } from 'vitest';

import { buildWeeklySeries } from './analytics';
import { readingHeadline, sortedReading, weeklyReading, weightTrend } from './reading';

/** Pesajes semanales con ruido diario, para las pruebas de tendencia. */
const history = ({ start = 80, perWeek = 0, weeks = 8, weekJitter = null }) => {
  const out = [];
  const monday = Date.parse('2026-06-08');
  const dayNoise = [0.6, -0.5, 0.1]; // se cancela al promediar la semana
  for (let w = 0; w < weeks; w += 1) {
    for (let i = 0; i < 3; i += 1) {
      const date = new Date(monday + (w * 7 + i * 2) * 86400000).toISOString().slice(0, 10);
      const value = start + perWeek * w + dayNoise[i] + (weekJitter ? weekJitter[w] : 0);
      out.push({ id: `a${w}${i}`, date, weight: value.toFixed(1) });
    }
  }
  return out;
};

const seriesOf = (h) => buildWeeklySeries({ microcycles: [], history: h, gender: 'Hombre' });

const read = (h, goalDirection, today = '2026-07-27') =>
  weeklyReading({
    client: goalDirection
      ? { preferences: { goal: { direction: goalDirection, ratePct: goalDirection === 'cut' ? 0.6 : 0.25 } } }
      : { preferences: {} },
    series: seriesOf(h),
    microcycles: [],
    history: h,
    today,
  });

const ids = (findings) => findings.map((f) => f.id);

describe('weightTrend', () => {
  it('no calcula tendencia con menos de cuatro semanas', () => {
    // Con dos puntos la recta es siempre perfecta y no significa nada.
    const t = weightTrend(seriesOf(history({ perWeek: -0.5, weeks: 2 })));
    expect(t.ok).toBe(false);
    expect(t.weeks).toBe(2);
    expect(t.needed).toBe(4);
  });

  it('filtra el ruido diario: el promedio semanal deja la pendiente limpia', () => {
    const t = weightTrend(seriesOf(history({ perWeek: -0.5 })));
    expect(t.ok).toBe(true);
    expect(t.perWeek).toBe(-0.5);
    expect(t.weak).toBe(false);
  });

  it('marca como poco fiable una serie con los promedios dispersos', () => {
    // Este es el caso que `weekOverWeek` no podía distinguir de una tendencia
    // buena: restaba dos puntos y devolvía una cifra con la misma seguridad.
    const t = weightTrend(seriesOf(history({ perWeek: -0.4, weekJitter: [0, 2.2, -1.8, 1.5, -2.4, 0.9, -1.1, 2] })));
    expect(t.ok).toBe(true);
    expect(t.weak).toBe(true);
    expect(t.r2).toBeLessThan(0.4);
  });
});

describe('weeklyReading', () => {
  it('sin objetivo declarado, lo primero que dice es que falta el objetivo', () => {
    // Sin él ninguna cifra se puede leer como buena o mala, y decirlo es más útil
    // que enseñar una tendencia sin referencia.
    const findings = read(history({ perWeek: -0.5 }), null);
    expect(ids(findings)).toContain('no-goal');
    expect(readingHeadline(findings).tone).toBe('unknown');
  });

  it('juzga el mismo dato al revés según el objetivo', () => {
    const bajando = history({ perWeek: -0.5 });

    // −0,5 kg/semana: en rumbo si define, dirección contraria si busca volumen.
    expect(readingHeadline(read(bajando, 'cut')).tone).toBe('good');
    expect(readingHeadline(read(bajando, 'bulk')).tone).toBe('bad');
  });

  it('avisa de la poca fiabilidad además de dar la tendencia', () => {
    const findings = read(
      history({ perWeek: -0.4, weekJitter: [0, 2.2, -1.8, 1.5, -2.4, 0.9, -1.1, 2] }),
      'cut'
    );
    // Las dos cosas a la vez: cuál es la pendiente y que no hay que confiarse.
    expect(ids(findings)).toContain('rate');
    expect(ids(findings)).toContain('noisy');
  });

  it('cuenta los pesajes de la semana en curso, no del histórico entero', () => {
    // El histórico acaba cinco semanas antes del «hoy» de la consulta.
    const findings = read(history({ perWeek: -0.5, weeks: 5 }), 'cut');
    const weighIns = findings.find((f) => f.id === 'weigh-ins');
    expect(weighIns).toBeDefined();
    expect(weighIns.tone).toBe('bad');
  });

  it('con tres pesajes esta semana no se queja', () => {
    // La última semana generada contiene el «hoy» que se pasa.
    const h = history({ perWeek: -0.5, weeks: 8 });
    const findings = read(h, 'cut', h[h.length - 1].date);
    expect(ids(findings)).not.toContain('weigh-ins');
  });

  it('ordena por gravedad: lo que hay que mirar, primero', () => {
    const findings = read(history({ perWeek: -0.5, weeks: 2 }), 'cut');
    expect(sortedReading(findings)[0].tone).toBe('bad');
  });
});
