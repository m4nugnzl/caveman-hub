import { describe, expect, it } from 'vitest';

import {
  capasDeLaVista,
  capasDisponibles,
  celdasDeCheckin,
  celdasDeSesionPorDia,
  celdasDeSesionPorSemana,
  moverCapa,
  quitarCapa,
  vistaPorDefecto,
} from './capas';
import { cambioDeSensacion } from './periodo';

const hambre = { id: 'hunger', kind: 'scale', short: 'Hambre', min: 1, max: 5 };
const energia = { id: 'week_energy', kind: 'scale', short: 'Energía', min: 1, max: 5 };
const sueno = { id: 'week_sleep', kind: 'scale', short: 'Sueño', min: 1, max: 5 };
const fatiga = { id: 'fatigue', kind: 'scale', short: 'Fatiga', min: 1, max: 10 };
const energiaSesion = { id: 'energy', kind: 'scale', short: 'Energía', min: 1, max: 5 };
const hechos = { id: 'training_done', kind: 'scale', short: 'Entrenos', min: 0, max: 10 };

const semana = (lunes, domingo, entrega = null) => ({ lunes, domingo, entrega });
const quincenal = { answers: { hunger: '5', week_energy: '3' } };
const semanas = [
  semana('2026-08-31', '2026-09-06', { answers: { hunger: '4', week_energy: '4', week_sleep: '4' } }),
  semana('2026-09-07', '2026-09-13', quincenal),
  semana('2026-09-14', '2026-09-20', quincenal),
  semana('2026-09-21', '2026-09-27', null),
  semana('2026-09-28', '2026-10-04', null),
];

describe('las filas', () => {
  const disponibles = capasDisponibles({
    preguntasCheckin: [hambre, energia, sueno, hechos],
    preguntasSesion: [fatiga, energiaSesion],
    semanas: [...semanas.slice(0, 1).map((s) => ({ ...s, entrega: { answers: { ...s.entrega.answers, training_done: '4' } } })), ...semanas.slice(1)],
    sesiones: [{ date: '2026-09-08', feedback: { fatigue: 7, energy: 4 } }],
    hay: { kcal: true, pasos: false, split: true, entrenos: true },
  });

  it('solo las que tienen datos, por grupos; lo exclusivo de la sesión, con el entreno', () => {
    expect(disponibles.map((c) => c.id)).toEqual(['peso', 'kcal', 'ci:hunger', 'ci:week_energy', 'ci:week_sleep', 'split', 'entrenos', 'se:fatigue']);
    expect(disponibles.find((c) => c.id === 'se:fatigue')).toMatchObject({ nombre: 'Fatiga', grupo: 'Entreno' });
  });

  it('lo que se pregunta en el check-in y en la sesión es una sola fila', () => {
    expect(disponibles.find((c) => c.id === 'ci:week_energy').sesion).toBe(energiaSesion);
    expect(disponibles.some((c) => c.id === 'se:energy')).toBe(false);
  });

  it('por defecto: peso, kcal y las dos del check-in más respondidas', () => {
    expect(vistaPorDefecto(disponibles)).toEqual(['peso', 'kcal', 'ci:hunger', 'ci:week_energy']);
  });

  it('una vista salta lo que este cliente no tiene y siempre lleva el peso', () => {
    expect(capasDeLaVista(['ci:hunger', 'ci:estres', 'kcal', 'kcal'], disponibles)).toEqual(['peso', 'ci:hunger', 'kcal']);
  });

  it('subir, bajar y quitar; el peso no se quita', () => {
    const ids = ['peso', 'kcal', 'ci:hunger'];
    expect(moverCapa(ids, 'ci:hunger', -1)).toEqual(['peso', 'ci:hunger', 'kcal']);
    expect(moverCapa(ids, 'peso', -1)).toBe(ids);
    expect(quitarCapa(ids, 'kcal')).toEqual(['peso', 'ci:hunger']);
    expect(quitarCapa(ids, 'peso')).toBe(ids);
  });
});

describe('las celdas', () => {
  it('una por check-in; el quincenal cubre su periodo; sin check-in, vacía; la semana en curso sin él, nada', () => {
    const celdas = celdasDeCheckin({ semanas, pregunta: hambre, hoy: '2026-09-29' });
    expect(celdas.map((c) => [c.desde, c.hasta, c.valor, c.tono])).toEqual([
      ['2026-08-31', '2026-09-06', 4, null],
      ['2026-09-07', '2026-09-20', 5, 'malo'],
      ['2026-09-21', '2026-09-27', null, null],
    ]);
  });

  it('las de la sesión: la media de la semana, o una por día con parte', () => {
    const s1 = { date: '2026-09-01', feedback: { fatigue: 6 } };
    const s2 = { date: '2026-09-03', feedback: { fatigue: '9' } };
    const s3 = { date: '2026-09-03', feedback: { fatigue: 'mucha' } };
    const porLunes = new Map([['2026-08-31', [s1, s2, s3]]]);
    const semanales = celdasDeSesionPorSemana({ semanas: semanas.slice(0, 2), sesionesPorLunes: porLunes, pregunta: fatiga, hoy: '2026-09-29' });
    expect(semanales.map((c) => [c.desde, c.valor])).toEqual([
      ['2026-08-31', 7.5],
      ['2026-09-07', null],
    ]);
    const porDia = new Map([
      ['2026-09-01', [s1]],
      ['2026-09-03', [s2, s3]],
    ]);
    const diarias = celdasDeSesionPorDia({ sesionesPorDia: porDia, pregunta: fatiga, desde: '2026-08-31', hasta: '2026-09-06' });
    expect(diarias.map((c) => [c.desde, c.valor, c.tono])).toEqual([
      ['2026-09-01', 6, null],
      ['2026-09-03', 9, 'malo'],
    ]);
  });
});

describe('el cambio de una sensación en el tramo', () => {
  const valores = new Map([
    ['2026-08-03', 3],
    ['2026-08-10', 3],
    ['2026-08-17', 4],
    ['2026-08-24', 5],
    ['2026-08-31', 5],
  ]);

  it('contra el tramo de antes, y desde cuándo está del otro lado', () => {
    const c = cambioDeSensacion({ valores, lunes: ['2026-08-17', '2026-08-24', '2026-08-31'], lunesAntes: ['2026-08-03', '2026-08-10'] });
    expect(c.antes).toBe(3);
    expect(c.valor).toBeCloseTo(4.67, 2);
    expect(c.desdeLunes).toBe('2026-08-17');
  });

  it('sin tramo de antes, su primer tercio contra el último', () => {
    const c = cambioDeSensacion({ valores, lunes: [...valores.keys()], lunesAntes: [] });
    expect(c.principio).toBe(3);
    expect(c.final).toBe(5);
    expect(c.desdeLunes).toBe('2026-08-17');
  });
});
