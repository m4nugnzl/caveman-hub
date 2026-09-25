import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { lunesDelRango, rangoAParam, rangoDeParam, resumenDelRango } from './resumenDelRango';

const definicion = { id: 'def', title: 'Definición', direction: 'cut', ratePct: 0.5 };
const volumen = { id: 'vol', title: 'Volumen', direction: 'bulk', ratePct: 0.25 };

/* Seis semanas desde el 6 jul: tres de definición y tres de volumen. */
const fila = (i, extra = {}) => {
  const lunes = addDays('2026-07-06', i * 7);
  return {
    lunes,
    jueves: addDays(lunes, 3),
    domingo: addDays(lunes, 6),
    fase: i < 3 ? definicion : volumen,
    media: null,
    esperado: null,
    pauta: null,
    hechos: [],
    revision5: 'revisada',
    ...extra,
  };
};

const semanas = [
  fila(0, { media: 80, esperado: 80, pauta: { kcals: 2200, steps: 9000, protein: 160, carbs: 220, fats: 70 } }),
  fila(1, {
    media: 79.5,
    esperado: 79.6,
    pauta: {
      kcals: 2200,
      steps: 9000,
      protein: 160,
      carbs: 220,
      fats: 70,
      tipos: [
        { n: 'alta', kcals: 2400 },
        { n: 'baja', kcals: 2000 },
      ],
    },
    hechos: [
      { id: 'r', kind: 'refeed', date: '2026-07-15' },
      { id: 'v', kind: 'rest', date: '2026-07-16', hasta: '2026-07-22' },
    ],
  }),
  fila(2, {
    media: 79,
    esperado: 79.2,
    pauta: { kcals: 2000, steps: 10000, soloMedia: true },
    hechos: [
      { id: 'r', kind: 'refeed', date: '2026-07-15' },
      { id: 'v', kind: 'rest', date: '2026-07-16', hasta: '2026-07-22' },
    ],
  }),
  fila(3, { media: 79.2, esperado: 79, pauta: { kcals: 2600, steps: 8000 } }),
  fila(4, { media: 79.6, esperado: 79.2, revision5: 'pendiente', pauta: { kcals: 2600, steps: 8000 } }),
  fila(5, { revision5: 'futura', pauta: { kcals: 2600, steps: 8000 } }),
];

describe('resumenDelRango', () => {
  const r = resumenDelRango({ semanas, desde: '2026-07-06', hasta: '2026-08-10', hoy: '2026-08-05' });

  it('parte el peso por fases, con lo real y lo esperado en las mismas semanas', () => {
    expect(r.peso).toHaveLength(2);
    const [a, b] = r.peso;
    expect(a.fase.id).toBe('def');
    expect(a.real).toBeCloseTo(-1, 5);
    expect(a.esperado).toBeCloseTo(-0.8, 5);
    expect(a.ritmoReal).toBeCloseTo((-1 / 80 / 2) * 100, 5);
    expect(b.fase.id).toBe('vol');
    expect(b.real).toBeCloseTo(0.4, 5);
  });

  it('la dieta pautada solo cuenta las semanas vividas', () => {
    /* La futura (2600) no entra: cinco semanas. */
    expect(r.kcals.semanas).toBe(5);
    expect(r.kcals.media).toBeCloseTo((2200 + 2200 + 2000 + 2600 + 2600) / 5, 5);
    expect(r.kcals.min).toBe(2000);
    expect(r.pasos.max).toBe(10000);
  });

  it('un hecho de dos semanas sale una vez', () => {
    expect(r.hechos.map((h) => h.id)).toEqual(['v']);
  });

  it('los refeeds van con la dieta, no con los hechos', () => {
    expect(r.intervenciones.map((h) => h.id)).toEqual(['r']);
  });

  it('las macros medias, en g y en g/kg con el peso real de cada semana', () => {
    expect(r.macros.protein.g).toBe(160);
    expect(r.macros.protein.gkg).toBeCloseTo((160 / 80 + 160 / 79.5) / 2, 5);
    expect(r.macros.fats.semanasConPeso).toBe(2);
  });

  it('las kcal por tipo de día y las semanas que solo guardan la media', () => {
    expect(r.tipos.map((t) => [t.n, t.kcals])).toEqual([
      ['alta', 2400],
      ['baja', 2000],
    ]);
    expect(r.soloMedia).toBe(1);
  });

  it('cuenta las semanas por estado de revisión', () => {
    expect(r.revisiones).toEqual({ revisada: 4, pendiente: 1, futura: 1 });
    expect(r.semanas).toBe(6);
    expect(r.primeraRevisable).toBe('2026-07-06');
  });

  it('una fase con una sola semana pesada no inventa ritmo', () => {
    const solo = resumenDelRango({ semanas, desde: '2026-08-03', hasta: '2026-08-09', hoy: '2026-08-05' });
    expect(solo.peso[0].real).toBeNull();
    expect(solo.peso[0].ritmoReal).toBeNull();
  });

  it('las referencias se miden desde la primera semana DEL RANGO', () => {
    const rendimiento = {
      bloques: [
        {
          id: 'b',
          nombre: 'Bloque 1',
          desde: '2026-07-06',
          hasta: '2026-08-16',
          referencias: [
            {
              nombre: 'Press inclinado',
              puntos: [
                { lunes: '2026-07-06', pct: 0 },
                { lunes: '2026-07-13', pct: 0.05 },
                { lunes: '2026-07-20', pct: 0.1 },
              ],
            },
          ],
        },
      ],
      semanas: new Map([['2026-07-13', { efectivas: 12 }], ['2026-07-20', { efectivas: 14 }]]),
    };
    const entreno = new Map([
      ['2026-07-13', { hechas: 3, pedidos: 4 }],
      ['2026-07-20', { hechas: 4, pedidos: 4 }],
    ]);
    const x = resumenDelRango({ semanas, desde: '2026-07-13', hasta: '2026-07-26', hoy: '2026-08-05', rendimiento, entreno });
    expect(x.referencias).toHaveLength(1);
    expect(x.referencias[0].pct).toBeCloseTo(1.1 / 1.05 - 1, 5);
    expect(x.sesiones).toEqual({ hechas: 7, pedidos: 8 });
    /* Las series efectivas, por bloque y solo dentro del rango. */
    expect(x.bloques).toEqual([{ nombre: 'Bloque 1', efectivas: 26, semanas: 2, referencias: x.referencias }]);
  });
});

describe('el rango en la URL', () => {
  it('va y vuelve', () => {
    const rango = { desde: '2026-06-15', hasta: '2026-08-23' };
    expect(rangoDeParam(rangoAParam(rango))).toEqual(rango);
  });

  it('rechaza lo que no es un rango', () => {
    expect(rangoDeParam('2026-08-23..2026-06-15')).toBeNull();
    expect(rangoDeParam('ayer')).toBeNull();
    expect(rangoDeParam(null)).toBeNull();
  });

  it('da sus lunes', () => {
    expect(lunesDelRango({ desde: '2026-06-15', hasta: '2026-06-28' })).toEqual(['2026-06-15', '2026-06-22']);
  });
});
