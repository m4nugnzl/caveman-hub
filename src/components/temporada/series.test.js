import { describe, expect, it } from 'vitest';

import { agruparHechos, etiquetaDeGrupo, mediaMovil } from './series';

describe('las marcas que se pisan', () => {
  const hechos = [
    { id: 'a', kind: 'rest', date: '2026-07-01', hasta: '2026-07-07' },
    { id: 'b', kind: 'rest', date: '2026-07-09' },
    { id: 'c', kind: 'illness', date: '2026-10-01' },
  ];

  it('en la temporada van juntas; de cerca, sueltas', () => {
    const lejos = agruparHechos(hechos, 2);
    expect(lejos.map((h) => h.grupo.map((e) => e.id))).toEqual([['a', 'b'], ['c']]);
    expect(lejos[0].hasta).toBe('2026-07-09');
    expect(agruparHechos(hechos, 20)).toHaveLength(3);
  });

  it('el grupo dice qué junta', () => {
    expect(etiquetaDeGrupo([{ kind: 'refeed' }])).toBe('Refeed');
    expect(etiquetaDeGrupo([{ kind: 'refeed' }, { kind: 'refeed' }, { kind: 'refeed' }])).toBe('3 refeeds');
    expect(etiquetaDeGrupo([{ kind: 'refeed' }, { kind: 'refeed' }, { kind: 'diet_break' }])).toBe('2 refeeds y 1 diet break');
    expect(etiquetaDeGrupo([{ kind: 'rest' }, { kind: 'rest' }])).toBe('2 vacaciones');
  });
});

describe('la tendencia del peso', () => {
  const pesajes = [
    { date: '2026-09-01', weight: 80 },
    { date: '2026-09-03', weight: 79 },
    { date: '2026-09-03', weight: 79.4 },
    { date: '2026-09-05', weight: 78.6 },
    { date: '2026-09-20', weight: 77 },
  ];
  const t = mediaMovil(pesajes);

  it('mira los siete días que acaban en cada uno', () => {
    expect(t[0]).toMatchObject({ fecha: '2026-09-03', n: 2 });
    expect(t[0].valor).toBeCloseTo((80 + 79.2) / 2);
    const dia7 = t.find((x) => x.fecha === '2026-09-07');
    expect(dia7.n).toBe(3);
    expect(dia7.valor).toBeCloseTo((80 + 79.2 + 78.6) / 3);
  });

  it('con menos de dos pesajes en la ventana, se corta', () => {
    expect(t.find((x) => x.fecha === '2026-09-01')).toBeUndefined();
    expect(t.find((x) => x.fecha === '2026-09-12')).toBeUndefined();
    expect(t.find((x) => x.fecha === '2026-09-20')).toBeUndefined();
    expect(t[t.length - 1].fecha).toBe('2026-09-09');
  });

  it('sin pesajes, nada', () => {
    expect(mediaMovil([])).toEqual([]);
    expect(mediaMovil([{ date: '2026-09-01', weight: null }])).toEqual([]);
  });
});
