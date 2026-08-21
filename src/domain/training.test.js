import { describe, expect, it } from 'vitest';

import {
  blankDays,
  buildMicrocycle,
  cloneDays,
  cloneExerciseAsTemplate,
  cycleLengthDays,
  dayHasOwnDrills,
  dayMuscleVolume,
  dayPlannedSets,
  drillsForDay,
  dayPlannedVolume,
  exerciseProgression,
  firstCycleDate,
  indexAfterMove,
  nextCycleDate,
  today,
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


describe('el plan sobrevive a vaciar la semana', () => {
  /*
    `blankDays` borra lo EJECUTADO y conserva lo PROGRAMADO. El RIR objetivo es
    plan, igual que el rango de repeticiones: si se perdiera, cada semana nueva
    habría que volver a escribir el esfuerzo de todas las series.
  */
  it('blankDays conserva targetReps y targetRir, y borra kg, reps y rir', () => {
    const days = [
      {
        dayName: 'Día 1',
        exercises: [
          {
            id: 'e1',
            name: 'Press',
            muscle: 'Pecho',
            sets: [{ kg: '100', reps: '8', rir: '1', targetReps: '8-10', targetRir: '2' }],
          },
        ],
      },
    ];
    const [set] = blankDays(days)[0].exercises[0].sets;

    expect(set.targetReps).toBe('8-10');
    expect(set.targetRir).toBe('2');
    expect(set.kg).toBe('');
    expect(set.reps).toBe('');
    expect(set.rir).toBe('');
  });
});

describe('volumen planificado — lo que le pones, no lo que ha hecho', () => {
  const day = {
    dayName: 'Torso',
    exercises: [
      { id: 'e1', name: 'Press', muscle: 'Pecho', sets: [{}, {}, {}] },
      { id: 'e2', name: 'Aperturas', muscle: 'Pecho', sets: [{}, {}] },
      { id: 'e3', name: 'Remo', muscle: 'Dorsal', sets: [{}, {}, {}, {}] },
    ],
  };

  it('suma las series por músculo aunque no haya nada registrado', () => {
    expect(dayPlannedVolume(day)).toEqual({ Pecho: 5, Dorsal: 4 });
  });

  /*
    El motivo de que exista: `dayMuscleVolume` cuenta series EFECTIVAS y devuelve
    un objeto vacío mientras se programa, que es justo cuando hace falta ver el
    reparto.
  */
  it('donde el volumen efectivo da vacío, el planificado da el reparto', () => {
    expect(dayMuscleVolume(day)).toEqual({});
    expect(dayPlannedSets(day)).toBe(9);
  });

  it('un ejercicio sin músculo cae en Otros y uno sin series no cuenta', () => {
    const raro = { exercises: [{ id: 'x', sets: [{}] }, { id: 'y', muscle: 'Pecho', sets: [] }] };
    expect(dayPlannedVolume(raro)).toEqual({ Otros: 1 });
  });

  it('un día vacío no explota', () => {
    expect(dayPlannedVolume(undefined)).toEqual({});
    expect(dayPlannedSets(null)).toBe(0);
  });
});

describe('drillsForDay — el calentamiento del programa o el del día', () => {
  const programa = { mobilityDrills: [{ id: 'a', name: 'Movilidad de cadera' }] };

  it('sin nada propio, el día hereda el del programa', () => {
    expect(drillsForDay(programa, { dayName: 'Empuje' })).toEqual(programa.mobilityDrills);
    expect(drillsForDay(programa, { dayName: 'Empuje', mobilityDrills: null })).toEqual(
      programa.mobilityDrills
    );
  });

  it('con el suyo, manda el del día', () => {
    const propio = [{ id: 'b', name: 'Movilidad de tobillo' }];
    expect(drillsForDay(programa, { mobilityDrills: propio })).toEqual(propio);
  });

  it('una lista VACÍA es una decisión, no un hueco', () => {
    /*
      «Este día no se calienta» tiene que poder decirse. Si `[]` cayera al del
      programa, quitar el calentamiento de un día lo haría reaparecer — y el
      entrenador no tendría forma de expresar lo que acaba de decidir.
    */
    expect(drillsForDay(programa, { mobilityDrills: [] })).toEqual([]);
  });

  it('sin programa y sin día, no hay calentamiento', () => {
    expect(drillsForDay(null, null)).toEqual([]);
    expect(drillsForDay({}, {})).toEqual([]);
  });

  it('dayHasOwnDrills distingue heredar de haber decidido', () => {
    expect(dayHasOwnDrills({})).toBe(false);
    expect(dayHasOwnDrills({ mobilityDrills: null })).toBe(false);
    expect(dayHasOwnDrills({ mobilityDrills: [] })).toBe(true);
    expect(dayHasOwnDrills({ mobilityDrills: [{ id: 'a' }] })).toBe(true);
  });
});

/*
  ══ Reordenar días sin perder de vista el que estás editando ════════════════

  El carril de días se arrastra y el editor de abajo abre uno POR ÍNDICE, así que
  mover cualquier otro día corre ese índice. El fallo que esto impide no se ve:
  no rompe la pantalla, te deja escribiendo series en el día de al lado.

  Se prueba con la lista real —mover de verdad y buscar dónde acabó cada uno—
  para que la aritmética no se compruebe contra sí misma.
*/
describe('indexAfterMove', () => {
  const dias = ['Upper A', 'Lower A', 'Upper B', 'Lower B'];

  /** Dónde acaba cada día moviendo `from` a `to`, moviéndolo de verdad. */
  const deVerdad = (from, to) => {
    const next = [...dias];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return dias.map((nombre) => next.indexOf(nombre));
  };

  it.each([
    [3, 2, 'Lower B una posición a la izquierda'],
    [0, 3, 'el primero al final'],
    [3, 0, 'el último al principio'],
    [1, 2, 'un salto corto hacia la derecha'],
    [2, 1, 'un salto corto hacia la izquierda'],
    [2, 2, 'soltarlo donde estaba'],
  ])('%s → %s: %s', (from, to) => {
    const esperado = deVerdad(from, to);
    expect(dias.map((_, i) => indexAfterMove(i, from, to))).toEqual(esperado);
  });

  it('el que se mueve acaba justo en el destino', () => {
    expect(indexAfterMove(3, 3, 1)).toBe(1);
  });

  it('los que quedan fuera del tramo no se enteran', () => {
    // Mover el 2 al 3 no toca al 0 ni al 1.
    expect(indexAfterMove(0, 2, 3)).toBe(0);
    expect(indexAfterMove(1, 2, 3)).toBe(1);
  });
});

/*
  ══ Cuándo empieza cada ciclo ═══════════════════════════════════════════════

  Todos los microciclos nacían con la fecha de HOY, la de crearlos. Se veía en
  dos sitios: la rutina que se monta en agosto para quien empieza en septiembre
  quedaba fechada en agosto, y programar cuatro semanas de una sentada las fechaba
  las cuatro el mismo día —con lo que la analítica, que agrupa por `micro.date`,
  las metía todas en el mismo cubo—.

  Se prueban aquí porque son la regla, no la pantalla: la casilla de la fecha se
  puede rediseñar sin que esto cambie.
*/
describe('fechas de los ciclos', () => {
  const hoy = today();

  describe('cycleLengthDays', () => {
    it('el semanal dura siete días, tenga el patrón que tenga', () => {
      expect(cycleLengthDays('weekly', { train: 3, rest: 1 })).toBe(7);
      expect(cycleLengthDays(undefined, undefined)).toBe(7);
    });

    it('el rotativo dura lo que suma su patrón', () => {
      expect(cycleLengthDays('rotating', { train: 2, rest: 1 })).toBe(3);
      expect(cycleLengthDays('rotating', { train: 3, rest: 1 })).toBe(4);
      // Sin descanso es un patrón válido: se entrena todos los días.
      expect(cycleLengthDays('rotating', { train: 1, rest: 0 })).toBe(1);
    });

    it('un patrón corrupto no devuelve un ciclo de cero días', () => {
      // Cero días de ciclo dejaría todas las semanas en la misma fecha, que es
      // justo el fallo que esto viene a arreglar.
      expect(cycleLengthDays('rotating', { train: 0, rest: 0 })).toBe(1);
      expect(cycleLengthDays('rotating', {})).toBe(3);
      expect(cycleLengthDays('rotating', { train: 'x', rest: null })).toBe(3);
    });
  });

  describe('firstCycleDate', () => {
    it('respeta una fecha de inicio que todavía está por llegar', () => {
      expect(firstCycleDate('2099-09-01')).toBe('2099-09-01');
    });

    it('con una fecha de inicio pasada empieza hoy', () => {
      // Un programa nuevo en el mes seis de una asesoría empieza hoy: fecharlo
      // el día que esa persona entró desordenaría toda la analítica.
      expect(firstCycleDate('2020-01-01')).toBe(hoy);
    });

    it('sin fecha de inicio, hoy', () => {
      expect(firstCycleDate(null)).toBe(hoy);
      expect(firstCycleDate(undefined)).toBe(hoy);
      expect(firstCycleDate('')).toBe(hoy);
    });
  });

  describe('nextCycleDate', () => {
    it('el siguiente semanal cae siete días después del anterior', () => {
      expect(nextCycleDate({ date: '2026-09-07' }, 'weekly')).toBe('2026-09-14');
    });

    it('el siguiente rotativo cae al acabar el patrón', () => {
      expect(nextCycleDate({ date: '2026-09-07' }, 'rotating', { train: 3, rest: 1 })).toBe(
        '2026-09-11'
      );
    });

    it('cruza el fin de mes y el cambio de hora sin desviarse un día', () => {
      expect(nextCycleDate({ date: '2026-10-25' }, 'weekly')).toBe('2026-11-01');
    });

    it('sin fecha anterior de la que partir, hoy', () => {
      // Microciclos de antes de que la fecha se heredara.
      expect(nextCycleDate({}, 'weekly')).toBe(hoy);
      expect(nextCycleDate(null, 'weekly')).toBe(hoy);
    });
  });
});

describe('cloneExerciseAsTemplate', () => {
  const original = {
    id: 'ex_ajeno',
    name: 'Sentadilla',
    muscle: 'Pierna',
    coachNote: 'nota para OTRA persona',
    sets: [
      { kg: '120', reps: '5', rir: '2', targetReps: '4-6', targetRir: '2' },
      { kg: '125', reps: '4', rir: '1', targetReps: '4-6', targetRir: '' },
    ],
  };

  it('conserva el programa: series, objetivos y músculo', () => {
    const copia = cloneExerciseAsTemplate(original);
    expect(copia.name).toBe('Sentadilla');
    expect(copia.muscle).toBe('Pierna');
    expect(copia.sets).toHaveLength(2);
    expect(copia.sets.map((s) => s.targetReps)).toEqual(['4-6', '4-6']);
    expect(copia.sets.map((s) => s.targetRir)).toEqual(['2', '']);
  });

  it('deja fuera lo que era de la otra persona', () => {
    const copia = cloneExerciseAsTemplate(original);
    expect(copia.id).not.toBe('ex_ajeno');
    expect(copia.coachNote).toBeUndefined();
    // Sus kilos y repeticiones no viajan: esto es una plantilla, no un registro.
    expect(copia.sets.every((s) => s.kg === '' && s.reps === '' && s.rir === '')).toBe(true);
  });
});
