import { describe, expect, it } from 'vitest';

import {
  blankDays,
  buildMicrocycle,
  cloneDays,
  exerciseProgression,
  trainedMuscles,
  weekMuscleVolume,
  weekTonnage,
} from './training';
import { buildSessionFromPlan, withSessionSet } from './sessions';
import { weekAdherence } from './analytics';

/**
 * ══ Por qué estas pruebas y no otras ═══════════════════════════════════════
 *
 * El bloque de «lo ejecutado» existe por un fallo concreto: cuando el registro de
 * series pasó del plan a las sesiones, estas cuatro funciones se quedaron leyendo
 * el plan. La analítica mostró tonelaje 0, volumen vacío y adherencia 0 % durante
 * semanas, con los datos correctamente guardados al lado, y nadie se enteró porque
 * un cero es indistinguible de «este cliente no ha entrenado».
 *
 * Es exactamente el fallo que una prueba caza en el momento de hacer el cambio.
 */

/** Un día con un ejercicio de `n` series vacías. */
const plannedDay = (dayName, exName, muscle, n) => ({
  dayName,
  exercises: [
    {
      id: `ex_${exName}`,
      name: exName,
      muscle,
      sets: Array.from({ length: n }, () => ({ kg: '', reps: '', rir: '', targetReps: '6-8' })),
    },
  ],
});

/** Registra las mismas kg×reps en todas las series, por el camino real. */
const logAll = (day, date, kg, reps) => {
  let session = buildSessionFromPlan(day, date);
  const exercise = day.exercises[0];
  for (let i = 0; i < exercise.sets.length; i += 1) {
    session = withSessionSet(session, exercise, i, 'kg', String(kg));
    session = withSessionSet(session, exercise, i, 'reps', String(reps));
  }
  return session;
};

describe('la analítica lee lo EJECUTADO, no el plan', () => {
  it('ve las series registradas en sesiones', () => {
    const day = plannedDay('Push', 'Press banca', 'Pecho', 3);
    const mcs = [
      { ...buildMicrocycle({ weekNumber: 1, days: [day] }), sessions: [logAll(day, '2026-08-10', 100, 8)] },
    ];

    expect(weekTonnage(mcs, 1)).toBe(2400);
    expect(weekMuscleVolume(mcs, 1)).toEqual({ Pecho: 3 });
    expect(weekAdherence(mcs, 1)).toEqual({ planned: 3, logged: 3, pct: 100 });
    expect(trainedMuscles(mcs)).toEqual(['Pecho']);
    // Epley: 100 × (1 + 8/30) = 126,7
    expect(exerciseProgression(mcs, 'Press banca')[0].e1rm).toBe(127);
  });

  it('sigue viendo los kilos antiguos incrustados en el plan', () => {
    const day = plannedDay('Push', 'Press banca', 'Pecho', 3);
    day.exercises[0].sets = day.exercises[0].sets.map(() => ({
      kg: '90',
      reps: '8',
      rir: '2',
      targetReps: '6-8',
    }));
    const mcs = [buildMicrocycle({ weekNumber: 1, days: [day] })];

    // Sin esto, aplicar el arreglo habría borrado de la vista todo el histórico
    // anterior a la separación de plan y ejecución.
    expect(weekTonnage(mcs, 1)).toBe(2160);
    expect(weekMuscleVolume(mcs, 1)).toEqual({ Pecho: 3 });
    expect(weekAdherence(mcs, 1).pct).toBe(100);
  });

  it('no cuenta doble cuando hay sesión Y kilos en el plan', () => {
    const day = plannedDay('Push', 'Press banca', 'Pecho', 3);
    day.exercises[0].sets = day.exercises[0].sets.map(() => ({
      kg: '90',
      reps: '8',
      rir: '',
      targetReps: '6-8',
    }));
    const mcs = [
      { ...buildMicrocycle({ weekNumber: 1, days: [day] }), sessions: [logAll(day, '2026-08-10', 100, 8)] },
    ];

    // La sesión real manda; la versión heredada del mismo día se descarta.
    expect(weekTonnage(mcs, 1)).toBe(2400);
    expect(weekMuscleVolume(mcs, 1)).toEqual({ Pecho: 3 });
  });

  it('una semana programada y no entrenada da cero, no un hueco', () => {
    const mcs = [buildMicrocycle({ weekNumber: 1, days: [plannedDay('Push', 'Press banca', 'Pecho', 3)] })];

    expect(weekTonnage(mcs, 1)).toBe(0);
    expect(weekMuscleVolume(mcs, 1)).toEqual({});
    expect(weekAdherence(mcs, 1)).toEqual({ planned: 3, logged: 0, pct: 0 });
    // La fila existe igualmente: una semana planificada tiene que aparecer en el
    // eje con un hueco, no desaparecer del gráfico.
    expect(exerciseProgression(mcs, 'Press banca')).toHaveLength(1);
    expect(exerciseProgression(mcs, 'Press banca')[0].e1rm).toBeNull();
  });

  it('dos sesiones del mismo día suman volumen pero la adherencia no pasa de 100', () => {
    const day = plannedDay('Push', 'Press banca', 'Pecho', 3);
    const mcs = [
      {
        ...buildMicrocycle({ weekNumber: 1, days: [day] }),
        sessions: [logAll(day, '2026-08-10', 100, 8), logAll(day, '2026-08-12', 95, 10)],
      },
    ];

    expect(weekMuscleVolume(mcs, 1)).toEqual({ Pecho: 6 });
    // Repetir un día es legítimo; «120 % de adherencia» no significa nada.
    expect(weekAdherence(mcs, 1).pct).toBe(100);
  });
});

describe('blankDays', () => {
  const source = () => [
    {
      dayName: 'Push',
      note: 'ojo hombro',
      exercises: [
        {
          id: 'ex_a',
          name: 'Press banca',
          muscle: 'Pecho',
          rest: 120,
          sets: [
            { kg: '80', reps: '8', rir: '2', targetReps: '6-8' },
            { kg: '75', reps: '8', rir: '0', targetReps: '8-10' },
          ],
        },
      ],
    },
    { dayName: 'Descanso', exercises: [] },
  ];

  it('conserva la estructura completa', () => {
    const out = blankDays(source());

    expect(out).toHaveLength(2);
    expect(out[0].dayName).toBe('Push');
    expect(out[0].note).toBe('ojo hombro');
    expect(out[0].exercises[0].name).toBe('Press banca');
    expect(out[0].exercises[0].muscle).toBe('Pecho');
    expect(out[0].exercises[0].rest).toBe(120);
    expect(out[0].exercises[0].sets).toHaveLength(2);
  });

  it('conserva el objetivo de repeticiones, que es plan y no registro', () => {
    const out = blankDays(source());
    expect(out[0].exercises[0].sets.map((s) => s.targetReps)).toEqual(['6-8', '8-10']);
  });

  it('no deja pasar ningún número ejecutado', () => {
    const out = blankDays(source());

    // Si se colaran, la analítica contaría como entrenada una semana que no se ha
    // hecho y la adherencia daría 100 % con cero series reales.
    for (const set of out[0].exercises[0].sets) {
      expect(set.kg).toBe('');
      expect(set.reps).toBe('');
      expect(set.rir).toBe('');
    }
  });

  it('reasigna los ids y no muta el original', () => {
    const original = source();
    const out = blankDays(original);

    expect(out[0].exercises[0].id).not.toBe('ex_a');
    expect(original[0].exercises[0].sets[0].kg).toBe('80');
  });

  it('se diferencia de cloneDays, que sí arrastra los kilos', () => {
    // La distinción es el motivo de que exista: duplicar una semana (entrenador)
    // y continuar el programa (cliente) NO son la misma operación.
    expect(cloneDays(source())[0].exercises[0].sets[0].kg).toBe('80');
    expect(blankDays(source())[0].exercises[0].sets[0].kg).toBe('');
  });
});
