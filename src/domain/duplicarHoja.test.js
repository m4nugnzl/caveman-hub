import { describe, expect, it } from 'vitest';

import {
  blockSessionOf,
  blocksOf,
  duplicateBlockSessionIn,
  planOfDay,
  proyectarPlanEnDias,
  renameBlockExerciseIn,
  renameBlockSessionIn,
  setBlockExerciseSetsIn,
  setBlockExerciseTargetIn,
} from './blocks';
import { migrateBlockPlans } from './blocksMigration';
import { copiaDeLaHoja } from './training';

/*
  «Copia de "Pull A"»: montar Pull B a partir de Pull A cambiando ejercicios y
  parámetros. La copia tiene que ser una hoja NORMAL —del plan, con sus ids,
  editable como cualquier otra— y llevarse TODO lo que es plan, en una sola
  escritura.
*/

const serie = (extra = {}) => ({ kg: '', reps: '', rir: '', targetKg: '', targetReps: '8-10', targetRir: '2', ...extra });

const pullA = () => ({
  dayName: 'Pull A',
  coachNote: 'Espalda primero, sin prisa',
  mobilityDrills: [{ id: 'd1', name: 'Colgarse de la barra', prescription: '2 × 30 s' }],
  exercises: [
    {
      id: 'ex_dominada',
      name: 'Dominadas',
      muscle: 'Espalda',
      coachNote: 'Escápulas abajo antes de tirar',
      restSeconds: 150,
      sets: [
        serie({ targetKg: '10', kg: '12', reps: '7', rir: '1' }),
        serie({ targetKg: '10' }),
        serie({ targetKg: '10', tecnica: { id: 'rest-pause', veces: 2, pausa: 15 } }),
      ],
    },
    {
      id: 'ex_remo',
      name: 'Remo con barra',
      muscle: 'Espalda',
      sets: [serie(), serie()],
    },
    {
      id: 'ex_face',
      name: 'Face pull',
      muscle: 'Hombro',
      enlazado: true,
      sets: [serie({ targetReps: '15' }), serie({ targetReps: '15' })],
    },
  ],
});

const programa = () => ({
  weeklySplit: {},
  mobilityDrills: [],
  blocks: [{ id: 'b1', name: 'Fuerza', fromWeek: 1, toWeek: null, sessions: [pullA(), { dayName: 'Pierna', exercises: [] }] }],
  microcycles: [
    { weekNumber: 1, days: [] },
    { weekNumber: 2, days: [] },
  ],
});

const hoja = (p, dayName) => blockSessionOf(blocksOf(p).find((b) => b.id === 'b1'), dayName);

describe('copiaDeLaHoja: todo lo que es plan, nada de lo registrado', () => {
  const copia = copiaDeLaHoja(pullA(), 'Pull B');

  it('se llama como le dicen y conserva la indicación y el calentamiento de la hoja', () => {
    expect(copia.dayName).toBe('Pull B');
    expect(copia.coachNote).toBe('Espalda primero, sin prisa');
    expect(copia.mobilityDrills).toEqual(pullA().mobilityDrills);
  });

  it('los ejercicios: mismos nombres, series y pauta, pero ids NUEVOS', () => {
    const origen = pullA().exercises;
    expect(copia.exercises.map((e) => e.name)).toEqual(origen.map((e) => e.name));
    expect(copia.exercises.map((e) => e.sets.length)).toEqual([3, 2, 2]);
    for (const [i, ex] of copia.exercises.entries()) expect(ex.id).not.toBe(origen[i].id);
    expect(new Set(copia.exercises.map((e) => e.id)).size).toBe(3);
  });

  it('reps, kg y RIR pautados, remates por serie, descanso, superserie y la nota del ejercicio', () => {
    const [dominadas, , face] = copia.exercises;
    expect(dominadas.sets.map((s) => s.targetKg)).toEqual(['10', '10', '10']);
    expect(dominadas.sets.map((s) => s.targetRir)).toEqual(['2', '2', '2']);
    expect(dominadas.sets[2].tecnica).toEqual({ id: 'rest-pause', veces: 2, pausa: 15 });
    expect(dominadas.restSeconds).toBe(150);
    expect(dominadas.coachNote).toBe('Escápulas abajo antes de tirar');
    expect(face.enlazado).toBe(true);
    expect(face.sets.map((s) => s.targetReps)).toEqual(['15', '15']);
  });

  it('lo levantado se queda en el original', () => {
    const [dominadas] = copia.exercises;
    expect(dominadas.sets[0]).toMatchObject({ kg: '', reps: '', rir: '' });
  });

  it('sin indicación ni calentamiento propio, no inventa claves', () => {
    const limpia = copiaDeLaHoja({ dayName: 'X', exercises: [] }, 'Y');
    expect('coachNote' in limpia).toBe(false);
    expect('mobilityDrills' in limpia).toBe(false);
  });

  it('un calentamiento propio VACÍO también es una decisión, y viaja', () => {
    expect(copiaDeLaHoja({ dayName: 'X', exercises: [], mobilityDrills: [] }, 'Y').mobilityDrills).toEqual([]);
  });
});

describe('duplicateBlockSessionIn: la copia es una hoja más del bloque', () => {
  it('en UNA escritura, al final, con el nombre que se le da', () => {
    const p = duplicateBlockSessionIn(programa(), 'b1', 'Pull A', 'Pull A 2');
    expect(blocksOf(p)[0].sessions.map((s) => s.dayName)).toEqual(['Pull A', 'Pierna', 'Pull A 2']);
    expect(hoja(p, 'Pull A 2').exercises.map((e) => e.name)).toEqual(['Dominadas', 'Remo con barra', 'Face pull']);
  });

  it('el original sale intacto, el mismo objeto', () => {
    const antes = programa();
    const p = duplicateBlockSessionIn(antes, 'b1', 'Pull A', 'Pull A 2');
    expect(hoja(p, 'Pull A')).toBe(hoja(antes, 'Pull A'));
  });

  it('con un nombre ocupado, vacío, o sin origen, no hace nada', () => {
    const p = programa();
    expect(duplicateBlockSessionIn(p, 'b1', 'Pull A', 'Pierna')).toBe(p);
    expect(duplicateBlockSessionIn(p, 'b1', 'Pull A', '   ')).toBe(p);
    expect(duplicateBlockSessionIn(p, 'b1', 'Pull C', 'Pull D')).toBe(p);
    expect(duplicateBlockSessionIn(p, 'b9', 'Pull A', 'Pull D')).toBe(p);
  });

  it('se lee en todos los microciclos, y se proyecta a sus días para poder registrarla', () => {
    const p = proyectarPlanEnDias(duplicateBlockSessionIn(programa(), 'b1', 'Pull A', 'Pull A 2'));
    for (const w of [1, 2]) {
      const copia = planOfDay(p, w, 'Pull A 2');
      expect(copia.exercises).toHaveLength(3);
      const dia = p.microcycles.find((m) => m.weekNumber === w).days.find((d) => d.dayName === 'Pull A 2');
      expect(dia.exercises.map((e) => e.id)).toEqual(copia.exercises.map((e) => e.id));
    }
  });

  /*
    El caso real: Pull B a partir de Pull A. Se renombra, se cambia un ejercicio
    por otro y se tocan series y repeticiones — y Pull A no se entera.
  */
  it('Pull B se edita entera sin tocar Pull A', () => {
    let p = duplicateBlockSessionIn(programa(), 'b1', 'Pull A', 'Pull A 2');
    p = renameBlockSessionIn(p, 'b1', 'Pull A 2', 'Pull B');
    const [dominadas, remo] = hoja(p, 'Pull B').exercises;

    p = renameBlockExerciseIn(p, 'b1', 'Pull B', dominadas.id, 'Jalón al pecho');
    p = setBlockExerciseSetsIn(p, 'b1', 'Pull B', remo.id, 4);
    p = setBlockExerciseTargetIn(p, 'b1', 'Pull B', remo.id, '6-8');

    const b = hoja(p, 'Pull B').exercises;
    expect(b.map((e) => e.name)).toEqual(['Jalón al pecho', 'Remo con barra', 'Face pull']);
    expect(b[1].sets).toHaveLength(4);
    expect(b[1].sets.map((s) => s.targetReps)).toEqual(['6-8', '6-8', '6-8', '6-8']);

    expect(hoja(p, 'Pull A')).toEqual(pullA());
  });

  it('también en un programa que aún tiene el plan en sus microciclos, tras subirlo', () => {
    const viejo = {
      weeklySplit: {},
      mobilityDrills: [],
      microcycles: [{ weekNumber: 1, days: [pullA()] }],
    };
    const migrado = migrateBlockPlans(viejo).program;
    const id = blocksOf(migrado)[0].id;
    const p = duplicateBlockSessionIn(migrado, id, 'Pull A', 'Pull A 2');
    expect(planOfDay(p, 1, 'Pull A 2').exercises.map((e) => e.name)).toEqual(['Dominadas', 'Remo con barra', 'Face pull']);
  });
});
