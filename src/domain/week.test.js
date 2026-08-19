import { describe, expect, it } from 'vitest';

import { clientWeek, latestActiveWeek, weightMove } from './week';
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
