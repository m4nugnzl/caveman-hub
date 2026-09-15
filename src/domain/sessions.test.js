import { describe, expect, it } from 'vitest';

import {
  bestSetsBefore,
  historialDeEjercicio,
  isRecord,
  marcasDeEjercicio,
  minutosDeSesion,
  mergePlanWithSession,
  previousSetKey,
  previousSetsBefore,
  resumenDeEntrada,
  sesionAMedias,
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

/*
  ══ EL PRINCIPIO, EL FIN Y LO QUE QUEDÓ A MEDIAS (0119, tanda 2 del móvil) ══

  Lo que se prueba aquí no es aritmética: son las veces que estas funciones se
  NIEGAN a contestar. Una duración inventada se le enseña a una persona («te ha
  costado 52 min»), y una sesión ofrecida como «a medias» cuando no lo está le
  propone seguir un entreno que ya cerró.
*/
describe('minutosDeSesion — antes de decir una cifra, se calla', () => {
  const sesion = (extra) => ({ id: 's', date: '2026-09-11', dayName: 'Empuje A', ...extra });

  it('dice los minutos entre los dos sellos, redondeados', () => {
    expect(
      minutosDeSesion(
        sesion({ startedAt: '2026-09-11T19:26:00Z', endedAt: '2026-09-11T20:18:40Z' })
      )
    ).toBe(53);
  });

  it('sin uno de los dos sellos no hay duración', () => {
    expect(minutosDeSesion(sesion({ startedAt: '2026-09-11T19:26:00Z' }))).toBeNull();
    expect(minutosDeSesion(sesion({ endedAt: '2026-09-11T20:18:00Z' }))).toBeNull();
    /* Todo lo registrado antes de la 0119 está en este caso, y son la mayoría
       de las sesiones guardadas: el resumen simplemente no dice el tiempo. */
    expect(minutosDeSesion(sesion())).toBeNull();
  });

  it('un fin anterior al principio no es una duración negativa: es nada', () => {
    expect(
      minutosDeSesion(
        sesion({ startedAt: '2026-09-11T20:00:00Z', endedAt: '2026-09-11T19:00:00Z' })
      )
    ).toBeNull();
  });

  it('y por encima de seis horas tampoco, porque eso es una sesión olvidada', () => {
    /* El caso real: se entrena el martes, no se pulsa «Terminar», y el jueves
       se abre otra vez y se cierra. Nadie ha medido esas 48 horas. */
    expect(
      minutosDeSesion(
        sesion({ startedAt: '2026-09-09T19:00:00Z', endedAt: '2026-09-11T20:00:00Z' })
      )
    ).toBeNull();
  });
});

describe('sesionAMedias — la que hay que ofrecer, y solo esa', () => {
  const serie = (kg, reps) => ({ kg: String(kg), reps: String(reps), rir: '' });
  const vacia = () => ({ kg: '', reps: '', rir: '' });

  const micro = (weekNumber, sessions) => ({ id: `mc${weekNumber}`, weekNumber, days: [], sessions });

  const abierta = {
    id: 's-abierta',
    date: '2026-09-10',
    dayName: 'Empuje A',
    startedAt: '2026-09-10T19:12:00Z',
    entries: [
      { exerciseId: 'e1', name: 'Press banca', sets: [serie(80, 8), vacia(), vacia()] },
      { exerciseId: 'e2', name: 'Fondos', sets: [vacia(), vacia()] },
    ],
  };

  it('la encuentra y cuenta lo que llevas', () => {
    const media = sesionAMedias([micro(3, [abierta])]);
    expect(media.dayName).toBe('Empuje A');
    expect(media.weekNumber).toBe(3);
    expect(media.hechas).toBe(1);
    expect(media.series).toBe(5);
    expect(media.ejercicios).toBe(2);
    expect(media.conAlgo).toBe(1);
  });

  it('una sesión CERRADA no está a medias, aunque le falten series', () => {
    const cerrada = { ...abierta, endedAt: '2026-09-10T20:04:00Z' };
    expect(sesionAMedias([micro(3, [cerrada])])).toBeNull();
  });

  it('y una sin nada anotado tampoco: abrir la hoja no es entrenar', () => {
    const enBlanco = {
      ...abierta,
      entries: [{ exerciseId: 'e1', name: 'Press banca', sets: [vacia(), vacia()] }],
    };
    expect(sesionAMedias([micro(3, [enBlanco])])).toBeNull();
  });

  it('con dos abiertas ofrece UNA: la más reciente', () => {
    const vieja = { ...abierta, id: 's-vieja', startedAt: '2026-09-03T19:00:00Z', date: '2026-09-03' };
    const media = sesionAMedias([micro(2, [vieja]), micro(3, [abierta])]);
    expect(media.session.id).toBe('s-abierta');
  });

  it('lo heredado del plan no se ofrece: no hay sesión que seguir', () => {
    /* `legacySession` reconstruye los kilos que quedaron dentro del plan, y no
       tiene id real ni se puede cerrar. Ofrecerlo sería un botón que falla. */
    const heredada = { ...abierta, isLegacy: true };
    expect(sesionAMedias([micro(3, [heredada])])).toBeNull();
  });
});

describe('historialDeEjercicio y marcasDeEjercicio — la puerta de `M-03`', () => {
  const serie = (kg, reps) => ({ kg: String(kg), reps: String(reps), rir: '' });

  const programa = [
    {
      id: 'mc1',
      weekNumber: 1,
      days: [],
      sessions: [
        {
          id: 's1',
          date: '2026-08-28',
          dayName: 'Empuje A',
          entries: [
            { exerciseId: 'x1', name: 'Press inclinado', sets: [serie(28, 10), serie(28, 8)] },
            { exerciseId: 'x2', name: 'Fondos', sets: [serie(0, 9)] },
          ],
        },
      ],
    },
    {
      id: 'mc2',
      weekNumber: 2,
      days: [],
      sessions: [
        {
          id: 's2',
          date: '2026-09-04',
          dayName: 'Empuje A',
          /* El id del ejercicio CAMBIA al clonar la semana (`reidExercises`):
             si esto se buscara por id, el histórico se cortaría cada semana. */
          entries: [
            {
              exerciseId: 'z9',
              name: 'Press inclinado',
              sets: [serie(30, 10), serie(32, 9), { kg: '', reps: '', rir: '' }],
              clientNote: 'El hombro derecho iba justo.',
            },
          ],
        },
      ],
    },
  ];

  it('de hoy hacia atrás, con las series anotadas y su nota', () => {
    const historial = historialDeEjercicio(programa, 'Press inclinado');
    expect(historial.map((d) => d.date)).toEqual(['2026-09-04', '2026-08-28']);
    /* La serie en blanco no cuenta: no es un día flojo, es una serie que no se
       hizo. */
    expect(historial[0].sets).toEqual([
      { kg: '30', reps: '10' },
      { kg: '32', reps: '9' },
    ]);
    expect(historial[0].nota).toBe('El hombro derecho iba justo.');
    expect(historial[1].nota).toBe('');
  });

  it('un ejercicio que no ha hecho nunca no tiene histórico, y no revienta', () => {
    expect(historialDeEjercicio(programa, 'Peso muerto')).toEqual([]);
    expect(historialDeEjercicio(programa, '')).toEqual([]);
    expect(historialDeEjercicio(undefined, 'Press inclinado')).toEqual([]);
  });

  it('la marca son tres hechos, no una fórmula', () => {
    const marcas = marcasDeEjercicio(historialDeEjercicio(programa, 'Press inclinado'));
    expect(marcas.maxKg).toBe(32);
    /* El máximo de repeticiones es el de CUALQUIER serie, no el de la serie del
       peso máximo (que fueron 9). */
    expect(marcas.maxReps).toBe(10);
    expect(marcas.tonelaje).toBe(28 * 10 + 28 * 8 + 30 * 10 + 32 * 9);
  });

  it('sin nada anotado la marca no inventa ceros', () => {
    expect(marcasDeEjercicio([])).toEqual({ maxKg: null, maxReps: null, tonelaje: 0 });
  });
});
