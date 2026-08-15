import { describe, expect, it } from 'vitest';

import { mergePlanWithSession, previousSetKey, previousSetsBefore } from './sessions';

describe('mergePlanWithSession — los dos objetivos vienen del plan', () => {
  /*
    El fallo que esto evita: el cliente escribía su RIR sin ver nunca el que se
    le había pedido, porque la fusión traía `targetReps` y se dejaba `targetRir`.
    Con el módulo de RIR encendido, la comparación quedaba siempre vacía.
  */
  const day = {
    dayName: 'Día 1',
    exercises: [
      {
        id: 'e1',
        name: 'Press',
        muscle: 'Pecho',
        sets: [{ targetReps: '8-10', targetRir: '2' }],
      },
    ],
  };

  it('trae targetReps y targetRir del plan', () => {
    const [set] = mergePlanWithSession(day, null)[0].sets;
    expect(set.targetReps).toBe('8-10');
    expect(set.targetRir).toBe('2');
  });

  it('lo ejecutado sigue viniendo de la sesión, no del plan', () => {
    const session = {
      entries: [{ exerciseId: 'e1', sets: [{ kg: '100', reps: '8', rir: '1' }] }],
    };
    const [set] = mergePlanWithSession(day, session)[0].sets;
    expect(set.kg).toBe('100');
    expect(set.rir).toBe('1');
    expect(set.targetRir).toBe('2');
  });
});

describe('previousSetsBefore — lo que se levantó la vez anterior', () => {
  /** Un microciclo con una sesión de un solo ejercicio y sus series. */
  const semana = (weekNumber, date, sets) => ({
    id: `m${weekNumber}`,
    weekNumber,
    date,
    days: [{ dayName: 'Día 1', exercises: [] }],
    sessions: [
      {
        id: `s${weekNumber}`,
        date,
        dayName: 'Día 1',
        entries: [{ exerciseId: `e${weekNumber}`, name: 'Press', muscle: 'Pecho', sets }],
      },
    ],
  });

  const micros = [
    semana(1, '2026-03-02', [{ kg: '80', reps: '8', rir: '2' }]),
    semana(2, '2026-03-09', [{ kg: '85', reps: '8', rir: '2' }]),
    semana(3, '2026-03-16', [{ kg: '90', reps: '7', rir: '1' }]),
  ];

  it('devuelve la última semana anterior, no la primera', () => {
    const previo = previousSetsBefore(micros, 3).get(previousSetKey('Press', 0));
    expect(previo.kg).toBe('85');
    expect(previo.weekNumber).toBe(2);
  });

  it('no mira la semana que se está registrando ni las posteriores', () => {
    expect(previousSetsBefore(micros, 1).size).toBe(0);
    // Registrando la 2, la referencia es la 1 — nunca la 3.
    expect(previousSetsBefore(micros, 2).get(previousSetKey('Press', 0)).kg).toBe('80');
  });

  it('empareja por nombre, porque al clonar una semana cambian los ids', () => {
    // Los tres microciclos usan un `exerciseId` distinto a propósito.
    expect(previousSetsBefore(micros, 3).get(previousSetKey('Press', 0))).toBeTruthy();
  });

  it('ignora las series sin registrar: una serie en blanco no es una referencia', () => {
    const conHueco = [semana(1, '2026-03-02', [{ kg: '', reps: '', rir: '' }])];
    expect(previousSetsBefore(conHueco, 2).size).toBe(0);
  });

  it('una sesión sin fecha no se cuela como la más reciente', () => {
    const sinFecha = [
      semana(1, null, [{ kg: '60', reps: '10', rir: '2' }]),
      semana(2, '2026-03-09', [{ kg: '85', reps: '8', rir: '2' }]),
    ];
    expect(previousSetsBefore(sinFecha, 3).get(previousSetKey('Press', 0)).kg).toBe('85');
  });

  it('cada serie tiene su propia referencia', () => {
    const piramide = [
      semana(1, '2026-03-02', [
        { kg: '100', reps: '6', rir: '1' },
        { kg: '90', reps: '8', rir: '2' },
      ]),
    ];
    const mapa = previousSetsBefore(piramide, 2);
    expect(mapa.get(previousSetKey('Press', 0)).kg).toBe('100');
    expect(mapa.get(previousSetKey('Press', 1)).kg).toBe('90');
  });
});
