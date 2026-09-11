import { describe, expect, it } from 'vitest';

import {
  adoptMicrocycle,
  blankDays,
  buildMicrocycle,
  cloneDays,
  cloneExerciseAsTemplate,
  conLaPauta,
  cycleLengthDays,
  dayHasOwnDrills,
  dayMuscleVolume,
  dayPlannedSets,
  drillsForDay,
  dayPlannedVolume,
  dayProgression,
  dayNames,
  exerciseProgression,
  firstCycleDate,
  indexAfterMove,
  isRestDay,
  microcycleIds,
  nextCycleDate,
  nombreDeSubserie,
  normalizaTecnica,
  pesoPautado,
  restLabel,
  rotatingSlots,
  seriesGrammar,
  subseriesDe,
  supersetLabels,
  targetKind,
  TECNICAS,
  tecnicaDeLaSerie,
  tecnicaFrase,
  tecnicaOf,
  tecnicaPorDefecto,
  tecnicaSaid,
  today,
  trainedMuscles,
  trainingDayCount,
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

  it('con `conservarIds` los mantiene, que es lo que pide el plan del bloque', () => {
    /*
      Con el plan en el bloque el ejercicio es UNO para todas sus semanas y su id
      es el mismo en todas: es lo que hace que la pantalla y `log_session_set`
      hablen del mismo ejercicio. Reasignarlo deja la semana nueva imposible de
      registrar desde el primer número.
    */
    const original = source();
    const out = blankDays(original, { conservarIds: true });

    expect(out[0].exercises[0].id).toBe('ex_a');
    expect(out[0].exercises[0].sets[0].kg).toBe(''); // sigue vaciando lo ejecutado
    expect(original[0].exercises[0].sets[0].kg).toBe('80'); // y sin mutar
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

  /*
    El kilo pautado es LA TERCERA pauta y se quedaba fuera. Va vacío por defecto
    —«a criterio del cliente», que es lo normal— pero cuando el entrenador SÍ lo
    escribe se perdía cada vez que alguien continuaba el programa, que es lo que
    hace el cliente cada siete días. El servidor lo perdía por su lado (0109).
  */
  it('blankDays conserva targetKg cuando el entrenador lo ha pautado', () => {
    const days = [
      {
        dayName: 'Día 1',
        exercises: [
          {
            id: 'e1',
            name: 'Press',
            muscle: 'Pecho',
            sets: [
              { kg: '100', reps: '8', rir: '1', targetKg: '95', targetReps: '8-10' },
              { kg: '100', reps: '8', rir: '1', targetReps: '8-10' },
            ],
          },
        ],
      },
    ];
    const [pautada, suya] = blankDays(days)[0].exercises[0].sets;

    expect(pautada.targetKg).toBe('95');
    expect(pautada.kg).toBe('');
    // Y lo que estaba vacío sigue vacío: no se inventa una pauta donde no la hay.
    expect(suya.targetKg).toBe('');
  });

  /*
    Lo que cuelgue del ejercicio viaja entero. Era una lista blanca —aquí y en el
    servidor— y con ella se borraban solas la indicación del entrenador, la
    superserie, el remate y el descanso. Ver la migración 0109.
  */
  it('blankDays conserva la indicación, la superserie, el remate y el descanso', () => {
    const days = [
      {
        dayName: 'Día 1',
        mobilityDrills: ['Gato-camello'],
        exercises: [
          {
            id: 'e1',
            name: 'Press',
            muscle: 'Pecho',
            notes: 'Controla la bajada, 3 segundos.',
            enlazado: true,
            tecnica: 'rest-pause',
            restSeconds: 150,
            sets: [{ kg: '100', reps: '8', rir: '1', targetReps: '8-10' }],
          },
        ],
      },
    ];
    const [dia] = blankDays(days);
    const [ejercicio] = dia.exercises;

    expect(dia.mobilityDrills).toEqual(['Gato-camello']);
    expect(ejercicio.notes).toBe('Controla la bajada, 3 segundos.');
    expect(ejercicio.enlazado).toBe(true);
    expect(ejercicio.tecnica).toBe('rest-pause');
    expect(ejercicio.restSeconds).toBe(150);
    expect(ejercicio.sets[0].kg).toBe('');
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
  ══ El ciclo rotativo, para quien lo entrena ════════════════════════════════

  Esto lo lee el CLIENTE en su panel: es la única forma que tiene de saber
  cuándo descansa, porque su ciclo no está atado a la semana. Que las casillas
  salgan mal no rompe nada — enseña una estructura que no es la suya.
*/
describe('rotatingSlots', () => {
  const dias = (...nombres) => nombres.map((dayName) => ({ dayName }));

  it('la tanda del patrón y su descanso', () => {
    expect(rotatingSlots({ train: 2, rest: 1 }, dias('Empuje', 'Tirón'))).toEqual([
      { key: 't0', lead: 'Día 1', name: 'Empuje', rest: false },
      { key: 't1', lead: 'Día 2', name: 'Tirón', rest: false },
      { key: 'r1-0', lead: 'Día 3', name: 'Descanso', rest: true },
    ]);
  });

  /* El caso que obliga a que los entrenos salgan de los días y no del patrón:
     si mandara el patrón, el cliente vería dos sesiones en su panel y seis en
     su rutina. */
  it('con más días que `train`, se enseñan TODOS: son los que va a entrenar', () => {
    const slots = rotatingSlots({ train: 2, rest: 1 }, dias('A', 'B', 'C', 'D', 'E', 'F'));
    expect(slots.map((s) => s.name)).toEqual([
      'A',
      'B',
      'Descanso',
      'C',
      'D',
      'Descanso',
      'E',
      'F',
      'Descanso',
    ]);
  });

  /* «2 y 1» significa descansar CADA DOS sesiones, no juntar los entrenos y
     descansar al final. Es el ritmo que el cliente lee para saber qué día le
     toca qué. */
  it('el descanso va intercalado, y los días se numeran de corrido', () => {
    const slots = rotatingSlots({ train: 2, rest: 1 }, dias('A', 'B', 'C', 'D'));
    expect(slots.map((s) => s.lead)).toEqual([
      'Día 1',
      'Día 2',
      'Día 3',
      'Día 4',
      'Día 5',
      'Día 6',
    ]);
    expect(slots.filter((s) => s.rest).map((s) => s.lead)).toEqual(['Día 3', 'Día 6']);
  });

  /* Una tanda a medias también cierra descansando: el descanso separa tandas, y
     al repetirse el ciclo detrás viene una tanda nueva. */
  it('la última tanda, aunque quede corta, cierra con su descanso', () => {
    expect(rotatingSlots({ train: 3, rest: 1 }, dias('A', 'B', 'C', 'D')).map((s) => s.name)).toEqual(
      ['A', 'B', 'C', 'Descanso', 'D', 'Descanso']
    );
  });

  it('con un número de sesiones múltiplo del patrón, el descanso no se duplica', () => {
    const slots = rotatingSlots({ train: 2, rest: 1 }, dias('A', 'B'));
    expect(slots.filter((s) => s.rest)).toHaveLength(1);
  });

  it('sin días todavía, la forma del ciclo se ve igual', () => {
    expect(rotatingSlots({ train: 3, rest: 1 }, []).map((s) => s.name)).toEqual([
      'Entreno',
      'Entreno',
      'Entreno',
      'Descanso',
    ]);
  });

  it('sin descanso es un patrón válido: se entrena todos los días', () => {
    expect(rotatingSlots({ train: 1, rest: 0 }, dias('Full body'))).toEqual([
      { key: 't0', lead: 'Día 1', name: 'Full body', rest: false },
    ]);
  });

  it('con dos días de descanso seguidos, los dos se pintan', () => {
    expect(rotatingSlots({ train: 2, rest: 2 }, dias('A', 'B')).map((s) => s.name)).toEqual([
      'A',
      'B',
      'Descanso',
      'Descanso',
    ]);
  });

  it('un patrón corrupto no deja el ciclo vacío', () => {
    expect(rotatingSlots(null, []).map((s) => s.name)).toEqual(['Entreno', 'Entreno', 'Descanso']);
  });
});

describe('la semana natural: qué cuenta como día de entreno', () => {
  it('descanso es descanso, se escriba como se escriba', () => {
    expect(isRestDay('Descanso')).toBe(true);
    expect(isRestDay('  descanso ')).toBe(true);
    expect(isRestDay(undefined)).toBe(true);
  });

  /* El caso que tenían distinto el editor y el tablero: al borrar el texto de un
     día, uno lo pintaba de entreno y el otro lo sumaba. Vacío es descanso. */
  it('una casilla vacía es descanso, no un entreno sin nombre', () => {
    expect(isRestDay('')).toBe(true);
    expect(isRestDay('   ')).toBe(true);
  });

  it('cuenta los días con algo programado', () => {
    expect(trainingDayCount({ Lunes: 'Empuje', Martes: '', Miércoles: 'Tirón' })).toBe(2);
    expect(trainingDayCount({})).toBe(0);
    expect(trainingDayCount(null)).toBe(0);
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

    /*
      El fallo que se veía en la ficha de un cliente real: seis sesiones con un
      patrón 2/1 son tres tandas —NUEVE días—, y el ciclo siguiente nacía tres
      días después del anterior, con el cliente a mitad del primero. Como la
      analítica agrupa por `micro.date`, tres ciclos acababan en el mismo cubo.
    */
    it('cuenta las sesiones que tiene el ciclo, no solo una tanda del patrón', () => {
      const previo = {
        date: '2026-09-07',
        days: ['Legs A', 'Push A', 'Pull A', 'Legs B', 'Push B', 'Pull B'].map((dayName) => ({
          dayName,
        })),
      };
      expect(nextCycleDate(previo, 'rotating', { train: 2, rest: 1 })).toBe('2026-09-16');
    });

    it('con las sesiones justas del patrón, la fecha no cambia', () => {
      const previo = { date: '2026-09-07', days: [{ dayName: 'A' }, { dayName: 'B' }] };
      expect(nextCycleDate(previo, 'rotating', { train: 2, rest: 1 })).toBe('2026-09-10');
    });

    it('el semanal no lo tocan las sesiones: siete días', () => {
      const previo = { date: '2026-09-07', days: [{ dayName: 'A' }, { dayName: 'B' }] };
      expect(nextCycleDate(previo, 'weekly', { train: 2, rest: 1 })).toBe('2026-09-14');
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

  it('la gramática de serie viaja: es programa, no registro', () => {
    /* `bajada: true` es la forma vieja de decir la técnica; la copia la escribe
       ya en la nueva (`tecnica: 'bajada'`) — es lo que hace `tecnicaOf`. */
    const copia = cloneExerciseAsTemplate({ ...original, enlazado: true, bajada: true, restSeconds: 90 });
    expect(copia.enlazado).toBe(true);
    expect(copia.tecnica).toBe('bajada');
    expect(copia.restSeconds).toBe(90);
    // Y sin gramática no aparecen claves en falso: copiar claves vacías a todo sería ruido.
    const limpia = cloneExerciseAsTemplate(original);
    expect('enlazado' in limpia).toBe(false);
    expect('tecnica' in limpia).toBe(false);
    expect('restSeconds' in limpia).toBe(false);
  });
});

describe('conLaPauta — las series de aquel, en esta fila', () => {
  const remo = {
    id: 'ex_remo',
    name: 'Remo con barra',
    muscle: 'Espalda',
    coachNote: 'codos pegados',
    enlazado: true,
    restSeconds: 90,
    sets: [{ kg: '60', reps: '10', rir: '2', targetReps: '10-12', targetRir: '2' }],
  };
  const press = {
    id: 'ex_press',
    name: 'Press banca',
    muscle: 'Pecho',
    coachNote: 'nota del press',
    sets: [
      { kg: '100', reps: '5', rir: '1', targetReps: '4-6', targetRir: '1', targetKg: '95' },
      { kg: '100', reps: '5', rir: '1', targetReps: '4-6', targetRir: '1', tecnica: { id: 'bajada' } },
      { kg: '95', reps: '6', rir: '2', targetReps: '4-6', targetRir: '2' },
    ],
  };

  it('conserva la fila entera y solo cambia las series', () => {
    const puesto = conLaPauta(remo, press);
    expect(puesto.id).toBe('ex_remo');
    expect(puesto.name).toBe('Remo con barra');
    expect(puesto.muscle).toBe('Espalda');
    expect(puesto.coachNote).toBe('codos pegados');
    /* `enlazado` es de la HOJA —dónde está la fila—, no de la pauta. */
    expect(puesto.enlazado).toBe(true);
    expect(puesto.sets).toHaveLength(3);
    expect(puesto.sets.map((s) => s.targetReps)).toEqual(['4-6', '4-6', '4-6']);
    expect(puesto.sets[0].targetKg).toBe('95');
    expect(puesto.sets[1].tecnica).toEqual({ id: 'bajada' });
  });

  it('las series llegan en blanco: lo levantado es de quien lo levantó', () => {
    const puesto = conLaPauta(remo, press);
    expect(puesto.sets.every((s) => s.kg === '' && s.reps === '' && s.rir === '')).toBe(true);
  });

  it('el descanso viaja si el origen lo tiene, y si no se queda el de la fila', () => {
    expect(conLaPauta(remo, { ...press, restSeconds: 180 }).restSeconds).toBe(180);
    expect(conLaPauta(remo, press).restSeconds).toBe(90);
  });

  it('limpia la técnica vieja de la fila: los remates entran con las series', () => {
    const conVieja = { ...remo, tecnica: 'bajada', bajada: true };
    const puesto = conLaPauta(conVieja, press);
    expect(puesto.tecnica).toBeUndefined();
    expect(puesto.bajada).toBeUndefined();
  });
});

/* ══ La gramática de serie: superserie, bajada, descanso, AMRAP y tiempo ═══ */

describe('targetKind — qué pide de verdad el objetivo escrito', () => {
  it('reconoce el AMRAP con las mismas palabras que admite el importador', () => {
    expect(targetKind('AMRAP')).toBe('amrap');
    expect(targetKind('al fallo')).toBe('amrap');
    expect(targetKind('Fallo')).toBe('amrap');
    expect(targetKind('máximo')).toBe('amrap');
  });

  it('reconoce el trabajo por tiempo', () => {
    expect(targetKind('30 s')).toBe('tiempo');
    expect(targetKind('45seg')).toBe('tiempo');
    expect(targetKind('1 min')).toBe('tiempo');
  });

  it('lo demás son repeticiones, el vacío incluido', () => {
    expect(targetKind('8-10')).toBe('reps');
    expect(targetKind('12')).toBe('reps');
    expect(targetKind('')).toBe('reps');
    expect(targetKind(null)).toBe('reps');
  });
});

describe('restLabel', () => {
  it('segundos hasta que los minutos son redondos', () => {
    expect(restLabel(45)).toBe('45 s');
    expect(restLabel(90)).toBe('90 s');
    expect(restLabel(120)).toBe('2 min');
    expect(restLabel(180)).toBe('3 min');
    expect(restLabel(150)).toBe('150 s');
  });

  it('sin descanso pautado no se inventa nada', () => {
    expect(restLabel(null)).toBeNull();
    expect(restLabel(0)).toBeNull();
    expect(restLabel('')).toBeNull();
  });
});

describe('supersetLabels — A1/A2 derivado de la posición', () => {
  const ej = (name, enlazado = false) => ({ name, ...(enlazado ? { enlazado: true } : {}) });

  it('etiqueta las cadenas y deja en paz a los sueltos', () => {
    const labels = supersetLabels([ej('Press'), ej('Remo', true), ej('Curl'), ej('Fondos'), ej('Face pull', true)]);
    expect(labels).toEqual(['A1', 'A2', null, 'B1', 'B2']);
  });

  it('una cadena aguanta más de dos', () => {
    expect(supersetLabels([ej('Uno'), ej('Dos', true), ej('Tres', true)])).toEqual(['A1', 'A2', 'A3']);
  });

  it('un enlazado en el primero no dice nada: no hay anterior', () => {
    expect(supersetLabels([ej('Solo', true), ej('Otro')])).toEqual([null, null]);
  });

  it('sin ejercicios, sin etiquetas', () => {
    expect(supersetLabels([])).toEqual([]);
  });
});

describe('seriesGrammar — lo impreso al lado de la pauta', () => {
  it('dice la bajada y el descanso, en ese orden', () => {
    expect(seriesGrammar({ bajada: true, restSeconds: 90 })).toBe('última con bajada · descanso 90 s');
    expect(seriesGrammar({ bajada: true })).toBe('última con bajada');
    expect(seriesGrammar({ restSeconds: 120 })).toBe('descanso 2 min');
  });

  it('sin gramática, nada: la fila no gana una coletilla vacía', () => {
    expect(seriesGrammar({})).toBeNull();
    expect(seriesGrammar(null)).toBeNull();
  });
});

describe('pesoPautado — el peso de un ejercicio, donde no hay una fila por serie', () => {
  const con = (...kgs) => ({ sets: kgs.map((targetKg) => ({ targetKg })) });

  it('con todas al mismo peso, una cifra; con pesos distintos, los extremos', () => {
    expect(pesoPautado(con('100', '100', '100'))).toBe('100 kg');
    expect(pesoPautado(con('100', '90', '80'))).toBe('100–80 kg');
    /* Y de mayor a menor SIEMPRE, aunque la pirámide suba: es el rango, no el
       recorrido. */
    expect(pesoPautado(con('80', '90', '100'))).toBe('100–80 kg');
  });

  it('las series sin peso no cuentan, y ninguna con peso es `null`', () => {
    /* Vacío significa «a criterio del cliente», así que una serie sin peso no
       puede arrastrar el rango hasta el cero. */
    expect(pesoPautado(con('100', '', ''))).toBe('100 kg');
    expect(pesoPautado(con('', '', ''))).toBeNull();
    expect(pesoPautado({ sets: [] })).toBeNull();
    expect(pesoPautado(null)).toBeNull();
  });
});

/* Aquí se probaba `alternativesOf` —el plan B que dejaba puesto el entrenador—.
   Las alternativas se retiraron del producto el 9 sep 2026; ver `training.js`.
   Lo que sí se sigue probando es que un ejercicio traído como plantilla NO
   arrastre claves que ya no existen: eso lo cubre `cloneExerciseAsTemplate`. */

/**
 * ══ Que la semana que se pinta y la que se guarda sean la misma ════════════
 *
 * Al continuar el programa, la semana nueva se construye aquí —para que aparezca
 * al instante y sin conexión— y también en el servidor, que es quien la escribe.
 * Las dos con la misma regla, pero cada una con sus propios `uuid`, y el id del
 * ejercicio es lo único que `log_session_set` mira para saber dónde anotar.
 *
 * La consecuencia real, y el motivo de estas pruebas: un cliente pulsó «Semana 5»,
 * entrenó, y sus 19 series se rechazaron una a una con «el ejercicio ex_… no está
 * programado en EMPUJES». El ejercicio estaba: con otro id. Ver la migración 0085.
 */
describe('los identificadores viajan con la petición', () => {
  const micro = buildMicrocycle({
    weekNumber: 5,
    days: [
      {
        dayName: 'EMPUJES',
        exercises: [
          { id: 'ex_a', name: 'Press banca', muscle: 'Pecho', sets: [] },
          { id: 'ex_b', name: 'Fondos', muscle: 'Pecho', sets: [] },
        ],
      },
      { dayName: 'TIRONES', exercises: [{ id: 'ex_c', name: 'Remo', muscle: 'Espalda', sets: [] }] },
    ],
  });

  it('describe la semana entera: el microciclo, cada día y cada ejercicio', () => {
    expect(microcycleIds(micro)).toEqual({
      id: micro.id,
      days: [
        { dayName: 'EMPUJES', exerciseIds: ['ex_a', 'ex_b'] },
        { dayName: 'TIRONES', exerciseIds: ['ex_c'] },
      ],
    });
  });

  it('un día sin ejercicios no rompe la propuesta', () => {
    expect(microcycleIds({ id: 'mc_1', days: [{ dayName: 'DESCANSO' }] })).toEqual({
      id: 'mc_1',
      days: [{ dayName: 'DESCANSO', exerciseIds: [] }],
    });
  });
});

describe('adoptMicrocycle', () => {
  const local = buildMicrocycle({ weekNumber: 5, days: [{ dayName: 'EMPUJES', exercises: [] }] });
  const data = { microcycles: [buildMicrocycle({ weekNumber: 4, days: [] }), local] };

  it('el servidor manda: su microciclo sustituye al que se pintó a la espera', () => {
    const server = { id: 'mc_servidor', weekNumber: 5, days: [], sessions: [] };
    const out = adoptMicrocycle(data, local.id, server);

    expect(out.microcycles).toHaveLength(2);
    expect(out.microcycles[1].id).toBe('mc_servidor');
    expect(out.microcycles.map((m) => m.weekNumber)).toEqual([4, 5]);
  });

  it('si adoptó los ids propuestos, la respuesta confirma lo que ya había', () => {
    const server = { ...local, sessions: [] };
    const out = adoptMicrocycle(data, local.id, server);

    expect(out.microcycles).toHaveLength(2);
    expect(out.microcycles[1].id).toBe(local.id);
  });

  /* Se crea la semana sin conexión y se entrena a continuación: esas series van
     por `log_session_set`, así que la respuesta no las trae y no puede borrarlas. */
  it('conserva las sesiones que ya se habían anotado aquí', () => {
    const conSesion = { ...local, sessions: [{ id: 'ses_1', dayName: 'EMPUJES', entries: [] }] };
    const out = adoptMicrocycle(
      { microcycles: [conSesion] },
      local.id,
      { id: 'mc_servidor', weekNumber: 5, days: [], sessions: [] }
    );

    expect(out.microcycles[0].sessions).toHaveLength(1);
  });

  /* El reintento sobre una semana que ya existía: ahí las de verdad son las suyas. */
  it('pero si el servidor manda sesiones, son las suyas', () => {
    const conSesion = { ...local, sessions: [{ id: 'ses_local', dayName: 'EMPUJES', entries: [] }] };
    const out = adoptMicrocycle({ microcycles: [conSesion] }, local.id, {
      ...local,
      sessions: [{ id: 'ses_servidor', dayName: 'EMPUJES', entries: [] }],
    });

    expect(out.microcycles[0].sessions.map((s) => s.id)).toEqual(['ses_servidor']);
  });

  it('sin respuesta utilizable no toca nada', () => {
    expect(adoptMicrocycle(data, local.id, null)).toBe(data);
  });
});

describe('la progresión de una rutina', () => {
  const serie = (kg, reps) => ({ kg, reps });
  const dia = (dayName, ejercicios) => ({
    dayName,
    exercises: ejercicios.map(([name, muscle, n]) => ({
      id: `e_${name}`,
      name,
      muscle,
      sets: Array.from({ length: n }, () => ({})),
    })),
  });

  const programa = [
    {
      weekNumber: 1,
      days: [dia('Push', [['Press', 'Pecho', 4], ['Fondos', 'Tríceps', 3]]), dia('Pull', [['Remo', 'Espalda', 4]])],
      sessions: [
        {
          id: 's1',
          dayName: 'Push',
          date: '2026-01-05',
          entries: [
            { name: 'Press', muscle: 'Pecho', sets: [serie(80, 8), serie(80, 8), serie(80, 6), serie(80, 5)] },
            { name: 'Fondos', muscle: 'Tríceps', sets: [serie(20, 10), serie(20, 10), serie(20, 8)] },
          ],
        },
      ],
    },
    {
      weekNumber: 2,
      days: [dia('Push', [['Press', 'Pecho', 5], ['Fondos', 'Tríceps', 3]])],
      sessions: [
        {
          id: 's2',
          dayName: 'Push',
          date: '2026-01-12',
          entries: [{ name: 'Press', muscle: 'Pecho', sets: [serie(85, 8), serie(85, 8)] }],
        },
      ],
    },
  ];

  it('da lo pautado y lo hecho de ese día, semana a semana', () => {
    const filas = dayProgression(programa, 'Push');

    expect(filas.map((f) => f.week)).toEqual([1, 2]);
    expect(filas[0].planned).toEqual({ Pecho: 4, Tríceps: 3 });
    expect(filas[0].done).toEqual({ Pecho: 4, Tríceps: 3 });
    expect(filas[1].planned).toEqual({ Pecho: 5, Tríceps: 3 });
    expect(filas[1].done).toEqual({ Pecho: 2 });
  });

  it('suma el tonelaje de ESE día y no el de la semana', () => {
    const [s1] = dayProgression(programa, 'Push');
    // 80×8 + 80×8 + 80×6 + 80×5 = 2160 · 20×10 + 20×10 + 20×8 = 560
    expect(s1.tonnage).toBe(2720);
    expect(s1.plannedSets).toBe(7);
    expect(s1.doneSets).toBe(7);
  });

  it('salta las semanas en las que ese día no existe', () => {
    expect(dayProgression(programa, 'Pull').map((f) => f.week)).toEqual([1]);
    expect(dayProgression(programa, 'Piernas')).toEqual([]);
    expect(dayProgression(programa, null)).toEqual([]);
  });

  it('distingue no haber entrenado de haber movido cero', () => {
    const sinSesion = [{ weekNumber: 3, days: [dia('Push', [['Press', 'Pecho', 4]])], sessions: [] }];
    const [fila] = dayProgression(sinSesion, 'Push');

    expect(fila.entrenado).toBe(false);
    expect(fila.doneSets).toBe(0);
  });

  it('lista los días del programa empezando por los de la última semana', () => {
    expect(dayNames(programa)).toEqual(['Push', 'Pull']);
  });
});

describe('las técnicas de intensidad', () => {
  it('lee el vocabulario, y solo el vocabulario', () => {
    expect(tecnicaOf({ tecnica: 'rest-pause' })).toBe('rest-pause');
    expect(tecnicaOf({ tecnica: 'myo-reps' })).toBe('myo-reps');
    /* Inventarse una técnica no la crea: «rp» no está en el vocabulario y el
       plan no puede decir algo que la hoja no sabe imprimir. */
    expect(tecnicaOf({ tecnica: 'rp' })).toBeNull();
    expect(tecnicaOf({})).toBeNull();
    expect(tecnicaOf(null)).toBeNull();
  });

  it('sigue leyendo la forma vieja, y la nueva manda', () => {
    expect(tecnicaOf({ bajada: true })).toBe('bajada');
    expect(tecnicaOf({ bajada: true, tecnica: 'parciales' })).toBe('parciales');
    /* Y mientras la clave vieja siga puesta manda ella, que por eso la hoja la
       retira al escribir: dos verdades sobre lo mismo no pueden convivir. */
    expect(tecnicaOf({ bajada: true, tecnica: null })).toBe('bajada');
  });

  it('cada una se dice distinto, y se imprime con el descanso', () => {
    const dichos = TECNICAS.map((t) => tecnicaSaid(t.id));
    expect(new Set(dichos).size).toBe(TECNICAS.length);
    expect(seriesGrammar({ tecnica: 'rest-pause', restSeconds: 120 })).toBe(
      'última a rest-pause · descanso 2 min'
    );
    expect(seriesGrammar({ tecnica: 'myo-reps' })).toBe('última con myo-reps');
    expect(tecnicaSaid(null)).toBeNull();
  });
});

describe('el remate cuelga de la serie, y lleva sus números', () => {
  const conSets = (n, extra = {}) => ({
    sets: Array.from({ length: n }, () => ({ targetReps: '8-10' })),
    ...extra,
  });

  it('la técnica del ejercicio se sigue leyendo, y en la última', () => {
    const ex = conSets(3, { tecnica: 'bajada' });
    expect(tecnicaDeLaSerie(ex, 0)).toBeNull();
    expect(tecnicaDeLaSerie(ex, 2)).toEqual({ id: 'bajada' });
  });

  it('NO se inventa los números de lo que nadie escribió', () => {
    /* Un `tecnica: 'bajada'` de los de antes no sabe cuántas bajadas eran.
       Rellenarlo con los valores por defecto sería enseñarle al cliente una
       pauta que su entrenador no puso. */
    expect(tecnicaDeLaSerie(conSets(1, { tecnica: 'bajada' }), 0)).toEqual({ id: 'bajada' });
    expect(subseriesDe({ id: 'bajada' })).toBe(0);
    expect(tecnicaFrase({ id: 'bajada' })).toBe('bajada');
  });

  it('elegida en el mando, sale con sus valores por defecto', () => {
    expect(tecnicaPorDefecto('bajada')).toEqual({ id: 'bajada', veces: 1, corte: 20 });
    expect(subseriesDe(tecnicaPorDefecto('bajada'))).toBe(1);
    expect(subseriesDe(tecnicaPorDefecto('myo-reps'))).toBe(4);
    /* Las parciales no cuelgan tandas: son el final de esa misma serie. */
    expect(subseriesDe(tecnicaPorDefecto('parciales'))).toBe(0);
    expect(tecnicaPorDefecto('lo-que-sea')).toBeNull();
  });

  it('la de la serie manda sobre la del ejercicio', () => {
    const ex = {
      tecnica: 'bajada',
      sets: [{ tecnica: { id: 'rest-pause', veces: 3, pausa: 15 } }, {}],
    };
    expect(tecnicaFrase(tecnicaDeLaSerie(ex, 0))).toBe('rest-pause ×3, 15 s');
    expect(tecnicaDeLaSerie(ex, 1)).toEqual({ id: 'bajada' });
  });

  it('los números se sanean contra su ficha', () => {
    expect(normalizaTecnica({ id: 'bajada', veces: 99, corte: 1 })).toEqual({
      id: 'bajada',
      veces: 5,
      corte: 5,
    });
    expect(normalizaTecnica({ id: 'no-existe' })).toBeNull();
    expect(normalizaTecnica(null)).toBeNull();
  });

  it('un remate en el medio se dice por su número', () => {
    const ex = { sets: [{}, { tecnica: { id: 'bajada', veces: 2, corte: 20 } }, {}] };
    expect(seriesGrammar(ex)).toBe('2ª con bajada ×2, −20 %');
  });

  it('y las tandas se nombran una a una', () => {
    const dos = { id: 'bajada', veces: 2, corte: 20 };
    expect(nombreDeSubserie(dos, 0)).toBe('bajada 1');
    expect(nombreDeSubserie(dos, 1)).toBe('bajada 2');
    /* Con una sola no hace falta numerarla. */
    expect(nombreDeSubserie({ id: 'bajada', veces: 1 }, 0)).toBe('bajada');
    expect(nombreDeSubserie({ id: 'rest-pause', veces: 2 }, 1)).toBe('tanda 2');
  });

  it('viaja con la plantilla, y sin los registros', () => {
    const copia = cloneExerciseAsTemplate({
      name: 'Press banca',
      muscle: 'Pecho',
      sets: [{ kg: '100', reps: '8', targetKg: '95', targetReps: '6-8', tecnica: { id: 'bajada', veces: 2 } }],
    });
    expect(copia.sets[0].kg).toBe('');
    expect(copia.sets[0].targetKg).toBe('95');
    expect(copia.sets[0].tecnica).toEqual({ id: 'bajada', veces: 2 });
  });
});
