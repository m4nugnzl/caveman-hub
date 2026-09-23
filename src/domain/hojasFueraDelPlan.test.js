import { describe, expect, it } from 'vitest';

import { migrateBlockPlans } from './blocksMigration';
import {
  addBlockExerciseIn,
  addBlockSessionIn,
  blockSummary,
  blocksOf,
  currentBlock,
  removeBlockSessionFrom,
  renameBlockSessionIn,
  proyectarPlanEnDias,
  sesionEnCursoDeLaHoja,
} from './blocks';
import { soltarHojaSinEntrenar } from './hojasFuera';

/* ══════════════════════════════════════════════════════════════════════════
   HOJAS QUE SE QUEDABAN EN EL MICROCICLO SIN ESTAR EN EL PLAN.

   Caso real (22 sep): el M1 de un cliente llevaba «PULL A 2» y «BRAZO 2»,
   fuera del plan de su bloque y sin forma de editarlas. No venía de duplicar:
   quitar o renombrar una hoja la dejaba como «retirada» en los días de TODOS
   los microciclos del bloque, entrenada o no. Ahora el GESTO de quitarla la
   suelta de los microciclos donde no se entrenó (`quitar`, lo que hace
   `removeBlockSheet`); ninguna otra escritura quita nada (nada automático,
   decisión del dueño del 22 sep) y las que ya hay se quedan donde están.

   `aplicar` es lo que hace `applyPlan` en `useWorkout`, escritura a escritura.
   Encadenar varias en el mismo gesto es seguro: `useMirroredState` pone el ref
   al día en el acto, así que cada una parte de la anterior.
   ══════════════════════════════════════════════════════════════════════════ */

const aplicar = (program, updater) => proyectarPlanEnDias(updater(migrateBlockPlans(program).program));

const ej = (n, kg = '') => ({ id: `e${n}`, name: `Ejercicio ${n}`, sets: [{ kg, reps: kg ? '8' : '', rir: '' }] });
const nombres = (lista) => (lista || []).map((h) => h.dayName);

const programa = (sesiones = []) =>
  aplicar(
    {
      weeklySplit: {},
      mobilityDrills: [],
      microcycles: [
        { id: 'm1', weekNumber: 1, date: '2026-09-07', days: [{ dayName: 'Pull A', exercises: [ej(1), ej(2)] }], sessions: sesiones },
        { id: 'm2', weekNumber: 2, date: '2026-09-14', days: [{ dayName: 'Pull A', exercises: [] }], sessions: [] },
      ],
      blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null }],
    },
    (p) => p
  );

/** Lo que hace `duplicarHojaDelBloque`: una hoja y luego un alta por ejercicio. */
const duplicar = (p, de, nombre) => {
  const origen = blocksOf(p)[0].sessions.find((s) => s.dayName === de);
  let q = aplicar(p, (x) => addBlockSessionIn(x, 'b_1', nombre));
  for (const e of origen.exercises) q = aplicar(q, (x) => addBlockExerciseIn(x, 'b_1', nombre, { ...e, id: `${e.id}-copia` }));
  return q;
};

const sesion = { id: 's1', dayName: 'Pull A', date: '2026-09-07', entries: [] };

/** Quitar una hoja del bloque, como `removeBlockSheet`: del plan y, en el mismo
    paso, de los microciclos donde no se entrenó. */
const quitar = (x, nombre) => soltarHojaSinEntrenar(removeBlockSessionFrom(x, 'b_1', nombre), 'b_1', nombre);

describe('hojas fuera del plan', () => {
  it('duplicar: la copia entra en el plan y en los días, con sus ejercicios', () => {
    const p = duplicar(programa(), 'Pull A', 'Pull A 2');
    expect(nombres(blocksOf(p)[0].sessions)).toEqual(['Pull A', 'Pull A 2']);
    expect(blocksOf(p)[0].sessions[1].exercises).toHaveLength(2);
    expect(nombres(p.microcycles[0].days)).toEqual(['Pull A', 'Pull A 2']);
  });

  it('quitar una hoja sin entrenar la saca de los días de todos los microciclos', () => {
    const p = aplicar(duplicar(programa(), 'Pull A', 'Pull A 2'), (x) => quitar(x, 'Pull A 2'));
    expect(nombres(blocksOf(p)[0].sessions)).toEqual(['Pull A']);
    expect(nombres(p.microcycles[0].days)).toEqual(['Pull A']);
    expect(nombres(p.microcycles[1].days)).toEqual(['Pull A']);
  });

  it('quitar una hoja con sesiones: se queda en el microciclo donde se entrenó, y solo ahí', () => {
    const p = aplicar(duplicar(programa([sesion]), 'Pull A', 'Pull B'), (x) => quitar(x, 'Pull A'));
    expect(nombres(p.microcycles[0].days)).toEqual(['Pull B', 'Pull A']);
    expect(nombres(p.microcycles[1].days)).toEqual(['Pull B']);
    expect(p.microcycles[0].sessions).toHaveLength(1);
  });

  it('los kilos heredados dentro del día cuentan como entrenado', () => {
    const base = programa();
    const conKilos = {
      ...base,
      microcycles: base.microcycles.map((m, i) => (i === 0 ? { ...m, days: [{ dayName: 'Pull A', exercises: [ej(1, '60')] }] } : m)),
    };
    const p = aplicar(conKilos, (x) => quitar(x, 'Pull A'));
    expect(nombres(p.microcycles[0].days)).toEqual(['Pull A']);
    expect(p.microcycles[0].days[0].exercises[0].sets[0].kg).toBe('60');
    expect(nombres(p.microcycles[1].days)).toEqual([]);
  });

  it('renombrar sin sesiones: el día cambia de nombre y no queda el viejo', () => {
    const p = aplicar(programa(), (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));
    expect(nombres(blocksOf(p)[0].sessions)).toEqual(['Tirón']);
    expect(nombres(p.microcycles[0].days)).toEqual(['Tirón']);
    expect(nombres(p.microcycles[1].days)).toEqual(['Tirón']);
  });

  it('renombrar con sesiones: las sesiones pasan al nombre nuevo y el historial no se parte', () => {
    const p = aplicar(programa([sesion]), (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));
    expect(nombres(p.microcycles[0].days)).toEqual(['Tirón']);
    expect(nombres(p.microcycles[1].days)).toEqual(['Tirón']);
    expect(p.microcycles[0].sessions).toMatchObject([{ id: 's1', dayName: 'Tirón' }]);
    expect(blockSummary(p, currentBlock(p))).toMatchObject({ hechas: 1, extra: 0 });
  });

  it('renombrar se lleva los kilos heredados del día', () => {
    const base = programa();
    const conKilos = {
      ...base,
      microcycles: base.microcycles.map((m, i) => (i === 0 ? { ...m, days: [{ dayName: 'Pull A', exercises: [ej(1, '60')] }] } : m)),
    };
    const p = aplicar(conKilos, (x) => renameBlockSessionIn(x, 'b_1', 'Pull A', 'Tirón'));
    expect(nombres(p.microcycles[0].days)).toEqual(['Tirón']);
    expect(p.microcycles[0].days[0].exercises[0].sets[0].kg).toBe('60');
  });

  it('renombrar no toca las sesiones de otro bloque con el mismo nombre', () => {
    const base = programa([sesion]);
    const dos = {
      ...base,
      microcycles: [
        ...base.microcycles,
        { id: 'm3', weekNumber: 3, date: '2026-09-21', days: [{ dayName: 'Pull A', exercises: [] }], sessions: [{ ...sesion, id: 's3', date: '2026-09-21' }] },
      ],
      blocks: [
        { ...blocksOf(base)[0], toWeek: 2 },
        { id: 'b_2', name: 'Bloque 2', fromWeek: 3, toWeek: null, sessions: [{ dayName: 'Pull A', exercises: [ej(1)] }] },
      ],
    };
    const p = aplicar(dos, (x) => renameBlockSessionIn(x, 'b_2', 'Pull A', 'Tirón'));
    expect(p.microcycles[0].sessions[0].dayName).toBe('Pull A');
    expect(p.microcycles[2].sessions[0].dayName).toBe('Tirón');
    expect(nombres(blocksOf(p)[0].sessions)).toEqual(['Pull A']);
  });

  it('un fantasma que ya está guardado NO se va solo: la siguiente escritura lo deja', () => {
    const base = programa();
    const fantasma = { dayName: 'PULL A 2', exercises: [ej(7)] };
    const guardado = { ...base, microcycles: base.microcycles.map((m) => ({ ...m, days: [...m.days, fantasma] })) };
    const p = aplicar(guardado, (x) => addBlockExerciseIn(x, 'b_1', 'Pull A', ej(3)));
    expect(p.microcycles.map((m) => nombres(m.days))).toEqual([['Pull A', 'PULL A 2'], ['Pull A', 'PULL A 2']]);
  });

  it('quitar del plan una hoja con otro nombre no toca las demás fuera del plan', () => {
    const base = programa();
    const fantasma = { dayName: 'PULL A 2', exercises: [ej(7)] };
    const guardado = { ...base, microcycles: base.microcycles.map((m) => ({ ...m, days: [...m.days, fantasma] })) };
    const p = aplicar(duplicar(guardado, 'Pull A', 'Brazos'), (x) => quitar(x, 'Brazos'));
    expect(p.microcycles.map((m) => nombres(m.days))).toEqual([['Pull A', 'PULL A 2'], ['Pull A', 'PULL A 2']]);
  });
});

describe('renombrar con una sesión en curso', () => {
  const ahora = Date.parse('2026-09-07T18:30:00Z');
  const abierta = (startedAt, extra = {}) => ({
    id: 's1',
    dayName: 'Pull A',
    date: '2026-09-07',
    startedAt,
    entries: [{ exerciseId: 'e1', name: 'Ejercicio 1', sets: [{ kg: 60, reps: 8 }] }],
    ...extra,
  });

  it('una sesión abierta de hoy bloquea el renombrado de esa hoja', () => {
    const p = programa([abierta('2026-09-07T18:00:00Z')]);
    expect(sesionEnCursoDeLaHoja(p, 'b_1', 'Pull A', ahora)).toMatchObject({ id: 's1' });
    expect(sesionEnCursoDeLaHoja(p, 'b_1', 'Pull B', ahora)).toBeNull();
  });

  it('cerrada, vacía o dejada a medias hace días, no bloquea', () => {
    const con = (extra, startedAt = '2026-09-07T18:00:00Z') => programa([abierta(startedAt, extra)]);
    expect(sesionEnCursoDeLaHoja(con({ endedAt: '2026-09-07T18:20:00Z' }), 'b_1', 'Pull A', ahora)).toBeNull();
    expect(sesionEnCursoDeLaHoja(con({ entries: [] }), 'b_1', 'Pull A', ahora)).toBeNull();
    expect(sesionEnCursoDeLaHoja(con({}, '2026-09-04T18:00:00Z'), 'b_1', 'Pull A', ahora)).toBeNull();
  });
});

describe('soltar una hoja donde no se entrenó', () => {
  /* EMPUJE sale en los dos microciclos, entrenada en el primero; TORSO A 2 en
     los dos, sin entrenar; TIRÓN solo donde se entrenó. Es la regla que usa
     quitar una hoja (`quitar`), y solo ese gesto: las que ya están fuera del
     plan no se avisan ni se limpian (decisión del dueño, 22 sep). */
  const conFueras = () => {
    const base = programa();
    const dia = (dayName) => ({ dayName, exercises: [ej(9, '')] });
    const ses = (id, dayName) => ({ id, dayName, date: '2026-09-07', entries: [] });
    return {
      ...base,
      microcycles: [
        { ...base.microcycles[0], days: [...base.microcycles[0].days, dia('EMPUJE'), dia('TORSO A 2'), dia('TIRÓN')], sessions: [ses('s1', 'EMPUJE'), ses('s2', 'TIRÓN')] },
        { ...base.microcycles[1], days: [...base.microcycles[1].days, dia('EMPUJE'), dia('TORSO A 2')] },
      ],
    };
  };

  it('se queda solo donde se entrenó; sin registros sale de todos', () => {
    const p = conFueras();
    const una = aplicar(p, (x) => soltarHojaSinEntrenar(x, 'b_1', 'EMPUJE'));
    expect(una.microcycles.map((m) => nombres(m.days))).toEqual([
      ['Pull A', 'EMPUJE', 'TORSO A 2', 'TIRÓN'],
      ['Pull A', 'TORSO A 2'],
    ]);
    const dos = aplicar(una, (x) => soltarHojaSinEntrenar(x, 'b_1', 'TORSO A 2'));
    expect(dos.microcycles.map((m) => nombres(m.days))).toEqual([['Pull A', 'EMPUJE', 'TIRÓN'], ['Pull A']]);
    expect(dos.microcycles[0].sessions).toHaveLength(2);
  });

  it('no toca una hoja que está en el plan', () => {
    const p = conFueras();
    expect(soltarHojaSinEntrenar(p, 'b_1', 'Pull A')).toBe(p);
  });
});
