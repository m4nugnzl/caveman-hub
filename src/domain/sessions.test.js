import { describe, expect, it } from 'vitest';

import { mergePlanWithSession } from './sessions';

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
