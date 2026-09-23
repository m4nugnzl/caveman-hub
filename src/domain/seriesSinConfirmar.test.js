import { describe, expect, it } from 'vitest';

import { conSeriesSinConfirmar, diaDeLaSerie } from './seriesSinConfirmar';

const remo = { id: 'ex_remo', name: 'Remo', muscle: 'espalda', sets: [{ targetReps: '8' }, { targetReps: '8' }] };
const programa = () => ({
  microcycles: [
    {
      weekNumber: 3,
      days: [{ dayName: 'Pull A', exercises: [remo] }],
      sessions: [],
    },
  ],
});
const serie = (extra = {}) => ({
  weekNumber: 3,
  sessionId: 'ses_1',
  date: '2026-09-22',
  dayName: 'Pull A',
  exercise: remo,
  setIndex: 1,
  field: 'kg',
  value: '60',
  sub: null,
  ...extra,
});

describe('conSeriesSinConfirmar', () => {
  it('crea la sesión con el id que mandó el teléfono y pone la serie', () => {
    const p = conSeriesSinConfirmar(programa(), [serie(), serie({ field: 'reps', value: '8' })]);
    const [ses] = p.microcycles[0].sessions;
    expect(ses.id).toBe('ses_1');
    expect(ses.dayName).toBe('Pull A');
    expect(ses.entries[0].sets[1]).toMatchObject({ kg: '60', reps: '8' });
  });

  it('escribe en la sesión que ya existe sin tocar lo demás', () => {
    const base = conSeriesSinConfirmar(programa(), [serie({ setIndex: 0, field: 'reps', value: '10' })]);
    const p = conSeriesSinConfirmar(base, [serie()]);
    expect(p.microcycles[0].sessions).toHaveLength(1);
    expect(p.microcycles[0].sessions[0].entries[0].sets[0].reps).toBe('10');
    expect(p.microcycles[0].sessions[0].entries[0].sets[1].kg).toBe('60');
  });

  it('una serie cuyo día ya no está no se inventa un día', () => {
    const p0 = programa();
    const p = conSeriesSinConfirmar(p0, [serie({ dayName: 'Hoja quitada' })]);
    expect(p).toBe(p0);
  });

  it('sin nada que poner devuelve el mismo programa', () => {
    const p0 = programa();
    expect(conSeriesSinConfirmar(p0, [])).toBe(p0);
    expect(conSeriesSinConfirmar(undefined, [serie()])).toBe(undefined);
  });
});

describe('diaDeLaSerie', () => {
  const conDias = (dias, sesiones = []) => ({ microcycles: [{ weekNumber: 3, days: dias, sessions: sesiones }] });

  it('con su sesión existente, manda la sesión', () => {
    const p = conDias([{ dayName: 'Tirón', exercises: [remo] }], [{ id: 'ses_1', dayName: 'Tirón', entries: [] }]);
    expect(diaDeLaSerie(p, serie())).toBe('Tirón');
  });

  it('sin sesión, el único día de esa semana que tiene el ejercicio', () => {
    const p = conDias([{ dayName: 'Empuje', exercises: [] }, { dayName: 'Tirón', exercises: [remo] }]);
    expect(diaDeLaSerie(p, serie())).toBe('Tirón');
  });

  it('con dos días que lo tienen no adivina', () => {
    const p = conDias([{ dayName: 'Tirón', exercises: [remo] }, { dayName: 'Tirón B', exercises: [remo] }]);
    expect(diaDeLaSerie(p, serie())).toBeNull();
  });

  it('si el día de su sesión ya no tiene el ejercicio, no hay sitio', () => {
    const p = conDias([{ dayName: 'Tirón', exercises: [] }], [{ id: 'ses_1', dayName: 'Tirón', entries: [] }]);
    expect(diaDeLaSerie(p, serie())).toBeNull();
  });
});
