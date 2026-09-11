import { describe, expect, it } from 'vitest';

import {
  bestSetsBefore,
  isRecord,
  mergePlanWithSession,
  previousSetKey,
  previousSetsBefore,
  resumenDeEntrada,
  trainingSummary,
  ultimaSesionDeHoja,
} from './sessions';

import { mapTrainingSummaryFromDb } from '@/lib/mappers';

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

describe('bestSetsBefore / isRecord — el listón de cada ejercicio', () => {
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
    semana(1, '2026-03-02', [{ kg: '80', reps: '8' }, { kg: '80', reps: '8' }]),
    semana(2, '2026-03-09', [{ kg: '90', reps: '5' }]),
    semana(3, '2026-03-16', [{ kg: '100', reps: '3' }]),
  ];

  it('se queda con la mejor serie por 1RM estimado, no con la más reciente', () => {
    const best = bestSetsBefore(micros, 3).get('Press');
    // 80×8 → 101,3 ; 90×5 → 105
    expect(best.kg).toBe('90');
    expect(best.weekNumber).toBe(2);
  });

  it('no mira la semana en curso ni las siguientes', () => {
    expect(bestSetsBefore(micros, 1).size).toBe(0);
    expect(bestSetsBefore(micros, 2).get('Press').kg).toBe('80');
  });

  it('una serie es récord solo si supera el listón', () => {
    const best = bestSetsBefore(micros, 3).get('Press');
    expect(isRecord({ kg: '92.5', reps: '5' }, best)).toBe(true);
    expect(isRecord({ kg: '90', reps: '5' }, best)).toBe(false);
    expect(isRecord({ kg: '', reps: '5' }, best)).toBe(false);
    expect(isRecord({ kg: '100', reps: '5' }, null)).toBe(false);
  });
});

describe('ultimaSesionDeHoja / resumenDeEntrada — la hoja veraz', () => {
  const semana = (weekNumber, date, sets, dayName = 'Push') => ({
    id: `m${weekNumber}`,
    weekNumber,
    date,
    days: [{ dayName, exercises: [] }],
    sessions: [
      {
        id: `s${weekNumber}`,
        date,
        dayName,
        entries: [{ exerciseId: `e${weekNumber}`, name: 'Press', muscle: 'Pecho', sets }],
      },
    ],
  });

  const micros = [
    semana(1, '2026-03-02', [{ kg: '80', reps: '8' }, { kg: '80', reps: '7' }]),
    semana(2, '2026-03-09', [{ kg: '85', reps: '8' }, { kg: '82,5', reps: '8' }]),
    semana(3, '2026-03-16', [{ kg: '', reps: '' }]),
  ];

  it('encuentra la última ejecutada dentro de las semanas pedidas', () => {
    expect(ultimaSesionDeHoja(micros, [1, 2], 'Push').weekNumber).toBe(2);
    expect(ultimaSesionDeHoja(micros, [1], 'Push').weekNumber).toBe(1);
  });

  it('ni otra hoja ni semanas fuera del rango cuentan', () => {
    expect(ultimaSesionDeHoja(micros, [1, 2], 'Pull')).toBeNull();
    expect(ultimaSesionDeHoja(micros, [], 'Push')).toBeNull();
  });

  it('resume un ejercicio con su mayor peso y sus repeticiones', () => {
    const s = ultimaSesionDeHoja(micros, [1, 2], 'Push');
    expect(resumenDeEntrada(s, 'Press')).toEqual({ kg: 85, reps: [8, 8], series: 2 });
  });

  it('sin nada registrado no hay resumen', () => {
    const vacia = ultimaSesionDeHoja(micros, [3], 'Push');
    /* La semana 3 existe pero sus series están en blanco: la sesión cuenta como
       ejecutada solo si `executedSessions` la devuelve; el resumen, no. */
    expect(vacia === null || resumenDeEntrada(vacia, 'Press') === null).toBe(true);
    expect(resumenDeEntrada(null, 'Press')).toBeNull();
  });
});

/*
  ══ El índice del programa, y por qué los DOS orígenes tienen que coincidir ══

  El resumen se produce en dos sitios —esta función, con el programa cargado, y
  `training_summaries()` en el servidor, para veinte a la vez— y la cartera los
  mezcla sin saber cuál es cuál. El índice tiene que salir igual de los dos
  caminos, o una ficha cambiaría de aspecto solo por haberla abierto.
*/
describe('trainingSummary — el índice del programa', () => {
  const program = {
    microcycles: [
      { weekNumber: 1, days: [], sessions: [] },
      { weekNumber: 2, days: [], sessions: [] },
    ],
    blocks: [
      { id: 'a', name: 'Acumulación', fromWeek: 1, toWeek: null, plannedWeeks: 4, sessions: [{ dayName: 'Push' }] },
    ],
  };

  it('lleva las semanas escritas y los bloques', () => {
    const { indice } = trainingSummary(program, { today: '2026-09-10' });
    expect(indice.microcycles).toEqual([{ weekNumber: 1 }, { weekNumber: 2 }]);
    expect(indice.blocks[0].plannedWeeks).toBe(4);
  });

  it('los bloques van SIN sus hojas: la gracia es no descargar el plan', () => {
    const { indice } = trainingSummary(program, { today: '2026-09-10' });
    expect(indice.blocks[0].sessions).toBeUndefined();
  });

  it('sale igual del servidor que del programa cargado', () => {
    const delServidor = mapTrainingSummaryFromDb({
      client_id: 'c1',
      last_training: null,
      session_count: 0,
      microcycle_count: 2,
      recent_sessions: [],
      microcycle_weeks: [1, 2],
      blocks: [{ id: 'a', name: 'Acumulación', fromWeek: 1, toWeek: null, plannedWeeks: 4 }],
    });
    expect(delServidor.indice).toEqual(trainingSummary(program, { today: '2026-09-10' }).indice);
  });

  it('sin la 0110 aplicada, el índice queda vacío y nadie inventa un horizonte', () => {
    const viejo = mapTrainingSummaryFromDb({ client_id: 'c1', microcycle_count: 2, recent_sessions: [] });
    expect(viejo.indice).toEqual({ microcycles: [], blocks: [] });
    expect(viejo.weekNumber).toBeNull();
  });
});
