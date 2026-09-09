import { describe, expect, it } from 'vitest';

import { reasignarEntradas, seriesAnotadas } from './reasignar-entradas.mjs';

/**
 * La reasignación toca datos reales de personas y no tiene deshacer más allá de
 * la copia que guarda el script. Así que la regla —cuándo SÍ y, sobre todo,
 * cuándo NO— se prueba entera.
 */
const serie = (kg = '', reps = '') => ({ kg, reps, rir: '' });

const programa = (dia, sesion) => ({
  microcycles: [
    {
      weekNumber: 2,
      days: [dia],
      sessions: [sesion],
    },
  ],
});

const dia = (exercises) => ({ dayName: 'Pull A', exercises });
const ex = (id, name, muscle = 'Dorsal') => ({ id, name, muscle, sets: [serie(), serie()] });
const sesion = (entries) => ({ id: 'ses_1', date: '2026-08-29', dayName: 'Pull A', entries });
const entrada = (exerciseId, name, sets) => ({ exerciseId, name, muscle: 'Dorsal', sets });

describe('reasignarEntradas', () => {
  it('reasigna la entrada huérfana al ejercicio del plan que se llama igual', () => {
    const p = programa(
      dia([ex('ex_nuevo', 'Laterales Y')]),
      sesion([entrada('ex_viejo', 'Laterales Y', [serie('12', '15'), serie('12', '14')])])
    );

    const { program, cambios } = reasignarEntradas(p);

    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ name: 'Laterales Y', de: 'ex_viejo', a: 'ex_nuevo', series: 2 });
    const entradas = program.microcycles[0].sessions[0].entries;
    expect(entradas[0].exerciseId).toBe('ex_nuevo');
    expect(entradas[0].sets).toEqual([serie('12', '15'), serie('12', '14')]);
    expect(seriesAnotadas(program)).toBe(seriesAnotadas(p));
  });

  it('no toca una huérfana cuyo nombre no está en el plan de ese día', () => {
    const p = programa(
      dia([ex('ex_nuevo', 'Jalón neutro')]),
      sesion([entrada('ex_viejo', 'Peso muerto rumano', [serie('100', '8')])])
    );

    const { program, cambios } = reasignarEntradas(p);
    expect(cambios).toEqual([]);
    expect(program).toBe(p);
  });

  it('no junta dos entradas: si el ejercicio del plan ya anotó, se queda como está', () => {
    const p = programa(
      dia([ex('ex_nuevo', 'Laterales Y')]),
      sesion([
        entrada('ex_nuevo', 'Laterales Y', [serie('12', '15')]),
        entrada('ex_viejo', 'Laterales Y', [serie('10', '15')]),
      ])
    );

    const { cambios } = reasignarEntradas(p);
    expect(cambios).toEqual([]);
  });

  it('con dos ejercicios del mismo nombre en el día no adivina: no toca nada', () => {
    const p = programa(
      dia([ex('ex_a', 'Laterales Y'), ex('ex_b', 'Laterales Y')]),
      sesion([entrada('ex_viejo', 'Laterales Y', [serie('12', '15')])])
    );

    const { cambios } = reasignarEntradas(p);
    expect(cambios).toEqual([]);
  });

  it('con dos huérfanas del mismo nombre tampoco', () => {
    const p = programa(
      dia([ex('ex_nuevo', 'Laterales Y')]),
      sesion([
        entrada('ex_v1', 'Laterales Y', [serie('12', '15')]),
        entrada('ex_v2', 'Laterales Y', [serie('10', '15')]),
      ])
    );

    const { cambios } = reasignarEntradas(p);
    expect(cambios).toEqual([]);
  });

  it('el nombre se compara sin mayúsculas ni espacios de sobra', () => {
    const p = programa(
      dia([ex('ex_nuevo', 'Laterales Y')]),
      sesion([entrada('ex_viejo', '  laterales y ', [serie('12', '15')])])
    );

    const { cambios, program } = reasignarEntradas(p);
    expect(cambios).toHaveLength(1);
    // Y el nombre queda como lo dice el plan, no como estaba guardado.
    expect(program.microcycles[0].sessions[0].entries[0].name).toBe('Laterales Y');
  });

  it('una sesión de un día que el plan ya no tiene se queda intacta', () => {
    const p = programa(
      dia([ex('ex_nuevo', 'Laterales Y')]),
      { ...sesion([entrada('ex_viejo', 'Laterales Y', [serie('12', '15')])]), dayName: 'Push B' }
    );

    const { cambios, program } = reasignarEntradas(p);
    expect(cambios).toEqual([]);
    expect(program).toBe(p);
  });

  it('un programa sin nada que reasignar se devuelve tal cual', () => {
    const p = programa(
      dia([ex('ex_1', 'Laterales Y')]),
      sesion([entrada('ex_1', 'Laterales Y', [serie('12', '15')])])
    );

    const { program, cambios } = reasignarEntradas(p);
    expect(cambios).toEqual([]);
    expect(program).toBe(p);
  });
});
