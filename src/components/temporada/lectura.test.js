import { describe, expect, it } from 'vitest';

import { lecturaDeSemana, lecturaDelDia, ritmoRealDeFase, sesionDelDia } from './lectura';

const fase = { id: 'f1', title: 'Definición', direction: 'cut', ratePct: 0.5, startsOn: '2026-08-03', endsOn: '2026-10-25' };
const semana = (lunes, extra = {}) => ({
  lunes,
  domingo: lunes.replace(/\d\d$/, (d) => String(Number(d) + 6).padStart(2, '0')),
  estado: 'pasada',
  fase,
  numero: 6,
  media: 78.2,
  esperado: 78.3,
  pesajes: [],
  hechos: [],
  revision5: 'revisada',
  pauta: { kcals: 2450, steps: 12500, cardio: '3 × 35 min de caminata', tipos: [] },
  ...extra,
});

describe('la lectura de una semana', () => {
  it('vivida: peso, cambio, esperado, pauta, refeed, cardio, entrenos y revisión', () => {
    const refeed = { id: 'r', kind: 'refeed', date: '2026-09-12', hasta: '2026-09-13', kcal: 3400 };
    const l = lecturaDeSemana({
      semana: semana('2026-09-07'),
      anterior: { media: 78.6 },
      intervenciones: [refeed],
      entreno: { hechas: 4, pedidos: 4 },
      hoy: '2026-09-24',
    });
    expect(l.titulo).toBe('S6 · 7 sept');
    expect(l.piezas).toEqual([
      '78,2 kg (−0,4)',
      'esperado 78,3',
      '2.450 kcal + refeed 3.400',
      '12.500 pasos',
      'cardio 3×35′',
      '4/4 entrenos',
      'revisión ✓',
    ]);
  });

  it('con días que piden distinto, el tramo', () => {
    const tipos = [
      { n: 'alta', kcals: 2900, steps: 12000 },
      { n: 'baja', kcals: 2600, steps: 9000 },
    ];
    const l = lecturaDeSemana({ semana: semana('2026-09-07', { revision5: 'sin' }), tipos, hoy: '2026-09-24' });
    expect(l.piezas).toContain('2.600–2.900 kcal');
    expect(l.piezas).toContain('9.000–12.000 pasos');
    expect(l.piezas).toContain('sin check-in');
  });

  it('por venir: lo planificado, sin inventar peso', () => {
    const l = lecturaDeSemana({
      semana: semana('2026-10-12', { estado: 'futura', media: null, esperado: 76.1, pauta: null, revision5: null, hechos: [{ kind: 'rest', date: '2026-10-14', title: 'Ibiza' }] }),
      hoy: '2026-09-24',
    });
    expect(l.piezas).toEqual(['Definición −0,5 %/sem', 'esperado 76,1', 'Ibiza']);
  });
});

describe('la lectura de un día', () => {
  it('el refeed con sus macros en g y g/kg, los pasos y la sesión', () => {
    const intervencion = { kind: 'refeed', date: '2026-09-12' };
    const pauta = { fecha: '2026-09-12', kcals: 3400, protein: 180, carbs: 450, fats: 53, steps: 12500, intervencion, exacto: true };
    const l = lecturaDelDia({
      fecha: '2026-09-12',
      pauta,
      semana: semana('2026-09-07', { pesajes: [{ date: '2026-09-12', weight: 78.3 }] }),
      entreno: { fecha: '2026-09-12', pedida: 'Push B', hechas: [] },
      hoy: '2026-09-24',
    });
    expect(l.titulo).toBe('Sáb 12 sept');
    expect(l.piezas).toEqual(['78,3 kg', 'refeed 3.400 kcal', 'P 180 C 450 G 53 (2,3 · 5,7 · 0,7 g/kg)', '12.500 pasos', 'Push B pendiente']);
  });

  it('un día que no ha llegado dice lo planificado', () => {
    const l = lecturaDelDia({ fecha: '2026-10-14', semana: semana('2026-10-12', { estado: 'futura' }), hoy: '2026-09-24' });
    expect(l.piezas).toEqual(['Definición −0,5 %/sem', 'esperado 78,3']);
  });
});

describe('las piezas sueltas', () => {
  it('la sesión de un día, con su estado', () => {
    expect(sesionDelDia({ fecha: '2026-09-10', pedida: 'Torso', hechas: [{ dayName: 'Torso' }] }, '2026-09-24')).toBe('Torso hecha');
    expect(sesionDelDia({ fecha: '2026-09-10', pedida: 'Torso', hechas: [] }, '2026-09-24')).toBe('Torso pendiente');
    expect(sesionDelDia({ fecha: '2026-09-30', pedida: 'Pierna', hechas: [] }, '2026-09-24')).toBe('Pierna prevista');
    expect(sesionDelDia({ fecha: '2026-09-30', pedida: null, hechas: [] }, '2026-09-24')).toBeNull();
  });

  it('el ritmo real de una fase, en % por semana', () => {
    const semanas = [semana('2026-08-03', { media: 80 }), semana('2026-08-10', { media: 79.6 }), semana('2026-08-17', { media: 79.2 })];
    expect(ritmoRealDeFase(semanas, fase)).toBeCloseTo(-0.5, 5);
    expect(ritmoRealDeFase(semanas.slice(0, 1), fase)).toBeNull();
  });
});
