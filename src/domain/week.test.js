import { describe, expect, it } from 'vitest';

import {
  clientWeek,
  exerciseHistory,
  exerciseTrack,
  exerciseTrend,
  latestActiveWeek,
  nextPrescription,
  weightMove,
} from './week';
import { weekTonnage } from './training';

/* El alta cae en LUNES a propósito: la semana de programa se ancla al lunes del
   alta (ver `auditoria.md` 1.2), así que con un lunes los dos ejes coinciden sin
   desfase y las pruebas dicen lo que parece que dicen. */
const ALTA = '2026-07-27';

/* Series REGISTRADAS: llevan repeticiones. */
const hechas = (n) => Array.from({ length: n }, () => ({ kg: '100', reps: '5', rir: '2' }));

/*
  Series PROGRAMADAS: solo el objetivo, sin repeticiones.

  La distinción no es cosmética. `executedSessions` deriva una sesión «heredada»
  de cualquier día del PLAN que tenga repeticiones dentro —es la compatibilidad
  con los registros antiguos de `auditoria.md` 1.1—, así que un día programado
  con repeticiones puestas cuenta como entrenado. Con el fixture equivocado,
  estas pruebas daban por hecha una semana que solo estaba montada.
*/
const programadas = (n) => Array.from({ length: n }, () => ({ kg: '', reps: '', rir: '', targetReps: '8-10' }));

const micro = (weekNumber, { dias = [], sesiones = [] } = {}) => ({
  id: `m${weekNumber}`,
  weekNumber,
  days: dias,
  sessions: sesiones,
});

const dia = (dayName, sets = 4) => ({
  dayName,
  exercises: [{ id: 'e1', name: 'Press banca', muscle: 'Pecho', sets: programadas(sets) }],
});

const sesion = (dayName, date, { sets = 4, clientNote = null } = {}) => ({
  id: `s-${dayName}-${date}`,
  dayName,
  date,
  clientNote,
  entries: [{ exerciseId: 'e1', name: 'Press banca', muscle: 'Pecho', sets: hechas(sets) }],
});

describe('clientWeek', () => {
  it('cuenta las sesiones hechas sobre las programadas', () => {
    const microcycles = [
      micro(1, {
        dias: [dia('Push'), dia('Pull'), dia('Legs')],
        sesiones: [sesion('Push', '2026-07-27'), sesion('Pull', '2026-07-29')],
      }),
    ];

    const semana = clientWeek({ microcycles, startDate: ALTA, weekNumber: 1 });

    expect(semana.sessions).toEqual({ done: 2, planned: 3 });
    expect(semana.days.map((d) => d.done)).toEqual([true, true, false]);
  });

  it('suma TODAS las sesiones de un mismo día, no solo la primera', () => {
    /* Repetir un «Push» en la misma semana es legítimo —recuperar un día
       perdido— y quedarse con la primera contaba la mitad de sus kilos. */
    const microcycles = [
      micro(1, {
        dias: [dia('Push')],
        sesiones: [sesion('Push', '2026-07-27'), sesion('Push', '2026-07-30')],
      }),
    ];

    const semana = clientWeek({ microcycles, startDate: ALTA, weekNumber: 1 });

    expect(semana.days[0].loggedSets).toBe(8);
    /* Y el total de la semana sigue siendo el que calcula `training.js`: esta
       pantalla reúne cifras, no las recalcula. */
    expect(semana.tonnage).toBe(weekTonnage(microcycles, 1));
  });

  it('recoge la nota que escribió el cliente al terminar, con su día delante', () => {
    const microcycles = [
      micro(1, {
        dias: [dia('Push'), dia('Pull')],
        sesiones: [sesion('Pull', '2026-07-29', { clientNote: 'El aductor a 55 no me salía' })],
      }),
    ];

    expect(clientWeek({ microcycles, startDate: ALTA, weekNumber: 1 }).notes).toEqual([
      { dayName: 'Pull', note: 'El aductor a 55 no me salía' },
    ]);
  });

  it('casa los pesajes de la semana natural con la semana de programa', () => {
    const microcycles = [micro(2, { dias: [dia('Push')] })];
    const history = [
      /* La semana 2 empieza el 3 de agosto: estos dos cuentan… */
      { id: 'a', date: '2026-08-03', weight: '80' },
      { id: 'b', date: '2026-08-05', weight: '81' },
      /* …y este es de la semana 1, así que no. */
      { id: 'c', date: '2026-07-28', weight: '90' },
    ];

    const semana = clientWeek({ microcycles, history, startDate: ALTA, weekNumber: 2 });

    expect(semana.weekStart).toBe('2026-08-03');
    expect(semana.checkIn.count).toBe(2);
    expect(semana.checkIn.average).toBe(80.5);
  });

  it('no revienta sin programa, sin alta ni sin semana', () => {
    const vacia = clientWeek();
    expect(vacia.sessions).toEqual({ done: 0, planned: 0 });
    expect(vacia.days).toEqual([]);
    expect(vacia.checkIn).toBeNull();
    expect(vacia.photos).toEqual([]);
  });
});

describe('latestActiveWeek', () => {
  it('entra por la última semana CON actividad, no por la última montada', () => {
    /* El caso real: el entrenador deja montada la 3 para dentro de quince días.
       Entrar por ahí enseña una semana vacía y parece que el cliente no ha hecho
       nada. */
    const microcycles = [
      micro(1, { dias: [dia('Push')], sesiones: [sesion('Push', '2026-07-27')] }),
      micro(2, { dias: [dia('Push')], sesiones: [sesion('Push', '2026-08-03')] }),
      micro(3, { dias: [dia('Push')] }),
    ];

    expect(latestActiveWeek({ microcycles, startDate: ALTA })).toBe(2);
  });

  it('un pesaje también cuenta como actividad', () => {
    const microcycles = [micro(1, { dias: [dia('Push')] }), micro(2, { dias: [dia('Push')] })];
    const history = [{ id: 'a', date: '2026-08-04', weight: '80' }];

    expect(latestActiveWeek({ microcycles, history, startDate: ALTA })).toBe(2);
  });

  /*
    El caso que hacía que dos pantallas del mismo cliente hablaran de semanas
    distintas: sube sus fotos el domingo y todavía no ha registrado el entreno.
    La revisión entraba por la 2 y el estudio de fotos enseñaba la 3.
  */
  it('una foto también cuenta como actividad', () => {
    const microcycles = [micro(1, { dias: [dia('Push')] }), micro(2, { dias: [dia('Push')] })];
    const photos = [{ id: 'f', week: 2, angle: 'frontal', date: '2026-08-09' }];

    expect(latestActiveWeek({ microcycles, photos, startDate: ALTA })).toBe(2);
  });

  it('sin nada registrado, cae en la última montada', () => {
    const microcycles = [micro(1, { dias: [dia('Push')] }), micro(2, { dias: [dia('Push')] })];
    expect(latestActiveWeek({ microcycles, startDate: ALTA })).toBe(2);
  });

  it('sin programa no hay semana', () => {
    expect(latestActiveWeek()).toBeNull();
  });
});

describe('weightMove', () => {
  it('compara el promedio de esta semana con el de la anterior', () => {
    const history = [
      { id: 'a', date: '2026-07-27', weight: '81' },
      { id: 'b', date: '2026-07-29', weight: '81' },
      { id: 'c', date: '2026-08-03', weight: '80' },
      { id: 'd', date: '2026-08-05', weight: '80' },
    ];

    expect(weightMove({ history, startDate: ALTA, weekNumber: 2 })).toEqual({
      delta: -1,
      from: 81,
      to: 80,
    });
  });

  it('no inventa una comparación en la primera semana ni sin datos', () => {
    const history = [{ id: 'a', date: '2026-08-03', weight: '80' }];
    expect(weightMove({ history, startDate: ALTA, weekNumber: 1 })).toBeNull();
    expect(weightMove({ history, startDate: ALTA, weekNumber: 2 })).toBeNull();
  });
});

describe('exerciseHistory', () => {
  const conCarga = (kg, reps, n = 2) =>
    Array.from({ length: n }, () => ({ kg: String(kg), reps: String(reps), rir: '2' }));

  const plan = [
    {
      dayName: 'Push',
      exercises: [
        { id: 'e1', name: 'Press banca', muscle: 'Pecho', sets: programadas(2) },
        { id: 'e2', name: 'Press militar', muscle: 'Hombro', sets: programadas(2) },
      ],
    },
  ];

  const semana = (weekNumber, entradas) =>
    micro(weekNumber, {
      dias: plan,
      sesiones: entradas
        ? [{ id: `s${weekNumber}`, dayName: 'Push', date: '2026-08-05', entries: entradas }]
        : [],
    });

  const banca = (kg, reps, n) => [
    { exerciseId: 'e1', name: 'Press banca', muscle: 'Pecho', sets: conCarga(kg, reps, n) },
  ];

  it('devuelve las series tal cual, de la más reciente hacia atrás', () => {
    const filas = exerciseHistory({
      microcycles: [semana(1, banca(95, 8)), semana(2, banca(100, 8))],
      weekNumber: 2,
    });

    const press = filas.find((f) => f.name === 'Press banca');
    expect(press.sessions.map((s) => s.week)).toEqual([2, 1]);
    expect(press.sessions[0].sets).toEqual([
      { kg: 100, reps: 8, rir: 2 },
      { kg: 100, reps: 8, rir: 2 },
    ]);
  });

  /* Más kilos, o los mismos kilos con más repeticiones. Nada más: sin fórmulas
     de 1RM que decidan por el entrenador. */
  /* Con su DÍA delante: un entrenamiento se lee por sesiones, no como una
     lista suelta de ejercicios. */
  it('cada ejercicio sabe de qué día es', () => {
    const filas = exerciseHistory({ microcycles: [semana(1, banca(95, 8))], weekNumber: 1 });
    expect(filas[0].dayName).toBe('Push');
  });

  it('sube con más kilos', () => {
    const filas = exerciseHistory({
      microcycles: [semana(1, banca(95, 8)), semana(2, banca(100, 8))],
      weekNumber: 2,
    });
    expect(filas.find((f) => f.name === 'Press banca').trend).toBe('up');
  });

  it('sube con los mismos kilos y más repeticiones', () => {
    const filas = exerciseHistory({
      microcycles: [semana(1, banca(100, 8)), semana(2, banca(100, 10))],
      weekNumber: 2,
    });
    expect(filas.find((f) => f.name === 'Press banca').trend).toBe('up');
  });

  it('igual es igual, y no un hueco', () => {
    const filas = exerciseHistory({
      microcycles: [semana(1, banca(100, 8)), semana(2, banca(100, 8))],
      weekNumber: 2,
    });
    expect(filas.find((f) => f.name === 'Press banca').trend).toBe('same');
  });

  /* Se buscan las últimas sesiones CON registro, no las últimas semanas: una
     descarga por el medio dejaría el historial vacío justo donde hay que
     comparar. */
  it('salta las semanas sin registro al mirar atrás', () => {
    const filas = exerciseHistory({
      microcycles: [semana(1, banca(95, 8)), semana(2, null), semana(3, banca(105, 8))],
      weekNumber: 3,
    });
    const press = filas.find((f) => f.name === 'Press banca');
    expect(press.sessions.map((s) => s.week)).toEqual([3, 1]);
    expect(press.trend).toBe('up');
  });

  /*
    Programado y no hecho SÍ sale, con su historial de antes: que se lo saltara
    es media revisión, y lo de semanas anteriores explica desde cuándo. Pero sin
    flecha, porque no hay nada de esta semana que comparar.
  */
  it('el que estaba programado y no hizo sale, sin flecha', () => {
    const filas = exerciseHistory({
      microcycles: [semana(1, banca(95, 8)), semana(2, null)],
      weekNumber: 2,
    });
    const press = filas.find((f) => f.name === 'Press banca');
    expect(press).toMatchObject({ done: false, trend: null });
    expect(press.sessions.map((s) => s.week)).toEqual([1]);
  });

  /* Un ejercicio programado que no se ha hecho nunca es una línea del plan, y
     eso ya se ve en la rutina. */
  it('el que no se ha hecho nunca no genera fila', () => {
    const filas = exerciseHistory({ microcycles: [semana(1, banca(95, 8))], weekNumber: 1 });
    expect(filas.map((f) => f.name)).toEqual(['Press banca']);
  });

  it('sin microciclo de esa semana no inventa nada', () => {
    expect(exerciseHistory({ microcycles: [semana(1, banca(95, 8))], weekNumber: 9 })).toEqual([]);
    expect(exerciseHistory({ microcycles: [], weekNumber: null })).toEqual([]);
  });
});

describe('exerciseTrack', () => {
  /* Series con peso y repeticiones concretas, para poder afirmar sobre ellas. */
  const conCarga = (kg, reps, n = 3) =>
    Array.from({ length: n }, () => ({ kg: String(kg), reps: String(reps), rir: '2' }));

  const semanaDe = (weekNumber, kg, reps = 8) =>
    micro(weekNumber, {
      dias: [dia('Push')],
      sesiones: [
        {
          id: `s${weekNumber}`,
          dayName: 'Push',
          date: `2026-08-0${weekNumber}`,
          entries: [{ exerciseId: 'e1', name: 'Press banca', sets: conCarga(kg, reps) }],
        },
      ],
    });

  it('devuelve una fila por semana en la que lo hizo, en orden', () => {
    const microcycles = [semanaDe(1, 95), semanaDe(2, 97.5), semanaDe(3, 100)];
    const track = exerciseTrack({ microcycles, name: 'Press banca', weekNumber: 3 });

    expect(track.map((f) => f.week)).toEqual([1, 2, 3]);
    expect(track.map((f) => f.topKg)).toEqual([95, 97.5, 100]);
  });

  /* Lo que decide si progresa, y la razón de que las series vayan en crudo. */
  it('marca la tendencia contra la ÚLTIMA VEZ que lo hizo, no contra la semana anterior', () => {
    const microcycles = [
      semanaDe(1, 100),
      /* En la 2 entrenó otra cosa: no abre fila. */
      micro(2, { dias: [dia('Push')], sesiones: [] }),
      semanaDe(3, 102.5),
    ];
    const track = exerciseTrack({ microcycles, name: 'Press banca', weekNumber: 3 });

    expect(track.map((f) => f.week)).toEqual([1, 3]);
    expect(track[1].trend).toBe('up');
  });

  it('mismos kilos con más repeticiones también es subir', () => {
    const microcycles = [semanaDe(1, 100, 6), semanaDe(2, 100, 8)];
    const track = exerciseTrack({ microcycles, name: 'Press banca', weekNumber: 2 });

    expect(track[1].trend).toBe('up');
    expect(track[1].reps).toBe(24);
  });

  it('conserva el RIR de cada serie: es la mitad de la información', () => {
    const track = exerciseTrack({
      microcycles: [semanaDe(1, 100)],
      name: 'Press banca',
      weekNumber: 1,
    });

    expect(track[0].sets[0]).toEqual({ kg: 100, reps: 8, rir: 2 });
  });

  /* Igual que `exerciseHistory`: lo que viene después todavía no ha pasado para
     quien revisa, y una fila del futuro se lee como un récord que aún no existe. */
  it('no enseña las semanas posteriores a la que se revisa', () => {
    const microcycles = [semanaDe(1, 95), semanaDe(2, 100), semanaDe(3, 105)];
    const track = exerciseTrack({ microcycles, name: 'Press banca', weekNumber: 2 });

    expect(track.map((f) => f.week)).toEqual([1, 2]);
  });

  it('sin nombre no hay seguimiento', () => {
    expect(exerciseTrack({ microcycles: [semanaDe(1, 95)], name: '' })).toEqual([]);
  });
});

describe('exerciseTrend', () => {
  const conCarga = (kg, reps, n = 3) =>
    Array.from({ length: n }, () => ({ kg: String(kg), reps: String(reps), rir: '2' }));

  const semanaDe = (weekNumber, kg, reps = 8) =>
    micro(weekNumber, {
      dias: [dia('Push')],
      sesiones: [
        {
          id: `s${weekNumber}`,
          dayName: 'Push',
          date: `2026-08-${String(weekNumber).padStart(2, '0')}`,
          entries: [{ exerciseId: 'e1', name: 'Press banca', sets: conCarga(kg, reps) }],
        },
      ],
    });

  const trend = (pesos, { reps = 8, hasta = null } = {}) =>
    exerciseTrend({
      microcycles: pesos.map((kg, i) => semanaDe(i + 1, kg, reps)),
      name: 'Press banca',
      weekNumber: hasta ?? pesos.length,
    });

  it('dice que sube cuando sube de verdad', () => {
    const t = trend([90, 92.5, 95, 97.5, 100]);

    expect(t.verdict).toBe('up');
    expect(t.from).toBe(90);
    expect(t.to).toBe(100);
    expect(t.weeks).toBe(5);
    /* Los puntos que se DIBUJAN son kilos, no una cifra derivada. */
    expect(t.points.map((p) => p.value)).toEqual([90, 92.5, 95, 97.5, 100]);
  });

  it('dice que baja cuando baja', () => {
    expect(trend([110, 105, 100, 97.5]).verdict).toBe('down');
  });

  it('la misma carga toda la vida es mantenerse, no progresar', () => {
    expect(trend([100, 100, 100, 100]).verdict).toBe('flat');
  });

  /*
    La razón de clasificar con 1RM estimado y no con kilos: bajar el peso para
    subir las repeticiones es progresar, y con los kilos a secas saldría como un
    desplome. Es la misma regla que usa strengthTrend en la lectura semanal.
  */
  it('subir repeticiones con menos peso no cuenta como bajar', () => {
    const microcycles = [
      semanaDe(1, 100, 3),
      semanaDe(2, 95, 6),
      semanaDe(3, 92.5, 9),
      semanaDe(4, 90, 12),
    ];
    const t = exerciseTrend({ microcycles, name: 'Press banca', weekNumber: 4 });

    expect(t.verdict).not.toBe('down');
  });

  /* Una recta plana sobre diez semanas y tres semanas sin mover un kilo son dos
     cosas distintas, y la segunda es la que se toca el lunes. */
  it('cuenta las sesiones seguidas sin mejorar la mejor marca', () => {
    expect(trend([90, 95, 100, 100, 100]).stalled).toBe(2);
    expect(trend([90, 95, 100, 102.5]).stalled).toBe(0);
  });

  it('con menos de tres sesiones no se inventa una tendencia', () => {
    const t = trend([100, 102.5]);

    expect(t.verdict).toBe(null);
    expect(t.weeks).toBe(2);
  });

  it('un ejercicio que nunca hizo no tiene fila', () => {
    expect(exerciseTrend({ microcycles: [semanaDe(1, 100)], name: 'Sentadilla', weekNumber: 1 })).toBe(
      null
    );
  });

  it('no mira más allá de la semana que se revisa', () => {
    const t = trend([90, 95, 100, 200], { hasta: 3 });

    expect(t.to).toBe(100);
    expect(t.weeks).toBe(3);
  });
});

describe('nextPrescription', () => {
  const micro = (weekNumber, sets, name = 'Sentadilla') => ({
    weekNumber,
    days: [
      {
        dayName: 'Día 1',
        exercises: [
          { id: `e${weekNumber}`, name, sets: Array.from({ length: sets }, () => ({ targetReps: '8-10' })) },
        ],
      },
    ],
  });

  /*
    Lo que hay que hacer imposible: ajustar la semana que se está revisando.
    Escribiría sobre lo que ya entrenó y no cambiaría nada de lo que viene.
  */
  it('no devuelve nada si la última semana es la que se está revisando', () => {
    expect(nextPrescription({ microcycles: [micro(3, 4), micro(4, 4)], name: 'Sentadilla', afterWeek: 4 })).toBe(
      null
    );
  });

  it('devuelve la semana siguiente con sus coordenadas y lo que hay puesto', () => {
    const p = nextPrescription({
      microcycles: [micro(4, 4), micro(5, 3)],
      name: 'Sentadilla',
      afterWeek: 4,
    });

    expect(p).toEqual({ weekNumber: 5, dayName: 'Día 1', id: 'e5', sets: 3, targetReps: '8-10' });
  });

  /* El nombre se compara sin mayúsculas ni espacios de sobra: es lo que teclea
     una persona en dos sitios distintos. */
  it('encuentra el ejercicio aunque se escribiera con otra caja', () => {
    expect(
      nextPrescription({ microcycles: [micro(5, 3, 'sentadilla ')], name: 'Sentadilla', afterWeek: 4 })
        ?.weekNumber
    ).toBe(5);
  });

  /* Un ejercicio que se dejó de programar no tiene dónde ajustarse. */
  it('devuelve null si ya no está en la semana siguiente', () => {
    expect(
      nextPrescription({ microcycles: [micro(5, 3, 'Prensa')], name: 'Sentadilla', afterWeek: 4 })
    ).toBe(null);
  });
});
