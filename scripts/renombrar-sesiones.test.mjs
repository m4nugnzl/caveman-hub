import { describe, expect, it } from 'vitest';

import { cambiosAjenos, renombrarSesion } from './renombrar-sesiones.mjs';

/* El caso real: Roberto Pérez, M1, una sesión «MARTES» del 25 ago con los ocho
   ejercicios de EMPUJE, de cuando renombrar no se llevaba las sesiones. */
const ex = (id) => ({ id, name: id, sets: [] });
const entrada = (id) => ({ exerciseId: id, sets: [{ kg: '60', reps: '8' }] });
const fila = () => ({
  microcycles: [
    {
      weekNumber: 1,
      days: [
        { dayName: 'TIRÓN', exercises: [ex('t1')] },
        { dayName: 'EMPUJE', exercises: [ex('e1'), ex('e2')] },
      ],
      sessions: [
        { id: 's_viejo', dayName: 'MARTES', date: '2026-08-25', entries: [entrada('e1'), entrada('e2')] },
        { id: 's_bien', dayName: 'EMPUJE', date: '2026-08-30', entries: [entrada('e1')] },
      ],
    },
    { weekNumber: 2, days: [], sessions: [] },
  ],
});
const R = { semana: 1, sesion: 's_viejo', de: 'MARTES', a: 'EMPUJE' };

describe('renombrarSesion', () => {
  it('cambia el nombre de esa sesión y nada más', () => {
    const antes = fila();
    const { microcycles, problemas } = renombrarSesion(antes, R);
    expect(problemas).toEqual([]);
    expect(microcycles[0].sessions.map((s) => s.dayName)).toEqual(['EMPUJE', 'EMPUJE']);
    expect(microcycles[1]).toBe(antes.microcycles[1]);
    expect(cambiosAjenos(antes.microcycles, microcycles)).toEqual([]);
  });

  it('ya reparada: no se toca', () => {
    const { microcycles } = renombrarSesion(fila(), R);
    const otra = renombrarSesion({ microcycles }, R);
    expect(otra.microcycles).toBeNull();
    expect(otra.problemas[0]).toMatch(/se llama «EMPUJE»/);
  });

  it('si un ejercicio de la sesión no está en la hoja nueva, no es la misma hoja', () => {
    const f = fila();
    f.microcycles[0].sessions[0].entries.push(entrada('x9'));
    expect(renombrarSesion(f, R).microcycles).toBeNull();
  });

  it('si el nombre viejo es un día vivo de esa semana, no se toca', () => {
    const f = fila();
    f.microcycles[0].days.push({ dayName: 'MARTES', exercises: [] });
    expect(renombrarSesion(f, R).microcycles).toBeNull();
  });

  it('sin la sesión, sin la semana o sin el día nuevo, no se toca', () => {
    expect(renombrarSesion(fila(), { ...R, sesion: 'otra' }).microcycles).toBeNull();
    expect(renombrarSesion(fila(), { ...R, semana: 9 }).microcycles).toBeNull();
    expect(renombrarSesion(fila(), { ...R, a: 'PUSH' }).microcycles).toBeNull();
  });
});

describe('cambiosAjenos', () => {
  it('ve cualquier cambio fuera del nombre', () => {
    const antes = fila().microcycles;
    const despues = fila().microcycles;
    despues[0].sessions[0].entries[0].sets[0].kg = '65';
    expect(cambiosAjenos(antes, despues)).toEqual(['M1: cambia algo más que el nombre de una sesión']);
  });
});
