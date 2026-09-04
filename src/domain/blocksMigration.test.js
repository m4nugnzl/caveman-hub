import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { applyOverrides, blockSessionOf, blocksOf, overridesAt, planOfDay, planOfWeek } from './blocks';
import { compareBlockPlans, migrateBlockPlans, overridesDeLaHoja, remapSessionEntries } from './blocksMigration';

/* ── Andamio ───────────────────────────────────────────────────────────────
   Los ejercicios se escriben cortos: `ej('Press banca', 3, '8-10')`. Cada
   microciclo lleva SU copia con SU id, que es justo la forma que tenían los
   datos antes de esta migración. */

const ej = (name, series, targetReps, { id = null, muscle = 'Pecho', kg = null } = {}) => ({
  id: id || `ex_${name.replace(/\s+/g, '')}_${series}_${Math.random().toString(36).slice(2, 7)}`,
  name,
  muscle,
  sets: Array.from({ length: series }, () => ({
    kg: kg ?? '',
    reps: kg ? '8' : '',
    rir: '',
    targetReps,
    targetRir: '',
  })),
});

const dia = (dayName, exercises) => ({ dayName, exercises });

const programa = (microcycles, blocks = null) => ({
  weeklySplit: { Lunes: 'Push' },
  mobilityDrills: [],
  microcycles,
  ...(blocks ? { blocks } : {}),
});

describe('subir el plan al bloque', () => {
  it('lo lee del último microciclo escrito y lo deja en el bloque', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
      { weekNumber: 2, days: [dia('Push', [ej('Press banca', 4, '6-8')])] },
    ]);

    const { program, report } = migrateBlockPlans(antes);
    const bloque = blocksOf(program)[0];

    expect(report.bloques).toBe(1);
    expect(bloque.sessions).toHaveLength(1);
    expect(bloque.sessions[0].dayName).toBe('Push');
    expect(bloque.sessions[0].exercises[0].name).toBe('Press banca');
    /* Del ÚLTIMO escrito: 4 series, no 3. */
    expect(bloque.sessions[0].exercises[0].sets).toHaveLength(4);
  });

  it('la referencia es el último ESCRITO, no el último a secas', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
      { weekNumber: 2, days: [dia('Push', [])] },
    ]);

    const { program } = migrateBlockPlans(antes);
    expect(blocksOf(program)[0].sessions[0].exercises).toHaveLength(1);
  });

  it('el plan del bloque no lleva dentro lo que alguien levantó', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 2, '8-10', { kg: '80' })])] },
    ]);

    const { program } = migrateBlockPlans(antes);
    const sets = blocksOf(program)[0].sessions[0].exercises[0].sets;
    expect(sets.every((s) => s.kg === '' && s.reps === '')).toBe(true);
    /* Pero el objetivo sí, que es plan. */
    expect(sets[0].targetReps).toBe('8-10');
  });

  it('no toca los días del microciclo: son la red de seguridad', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10', { kg: '80' })])] },
    ]);
    const copia = JSON.parse(JSON.stringify(antes.microcycles));

    const { program } = migrateBlockPlans(antes);
    expect(program.microcycles.map((m) => m.days)).toEqual(copia.map((m) => m.days));
  });

  it('es idempotente: un bloque que ya tiene su plan no se vuelve a tocar', () => {
    const antes = programa([{ weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')])] }]);
    const una = migrateBlockPlans(antes);
    const dos = migrateBlockPlans(una.program);

    expect(dos.report.bloques).toBe(0);
    expect(dos.program).toBe(una.program);
  });

  it('un bloque sin nada escrito conserva sus hojas', () => {
    const antes = programa([{ weekNumber: 1, days: [dia('Push', []), dia('Pull', [])] }]);
    const { program, report } = migrateBlockPlans(antes);

    expect(blocksOf(program)[0].sessions.map((s) => s.dayName)).toEqual(['Push', 'Pull']);
    expect(report.bloquesVacios).toEqual(['Bloque 1']);
  });
});

describe('lo que un microciclo tenía distinto pasa a ser excepción', () => {
  const conDiferencias = () =>
    programa([
      {
        weekNumber: 1,
        days: [dia('Push', [ej('Press banca', 3, '8-10'), ej('Fondos', 3, '10')])],
      },
      {
        weekNumber: 2,
        /* Aquí: el banca a 4 series, los fondos fuera, y un face pull de más. */
        days: [dia('Push', [ej('Press banca', 4, '8-10'), ej('Face pull', 3, '15')])],
      },
      {
        weekNumber: 3,
        days: [dia('Push', [ej('Press banca', 3, '8-10'), ej('Fondos', 3, '10')])],
      },
    ]);

  it('el microciclo que coincide con la referencia no genera ninguna', () => {
    const { program } = migrateBlockPlans(conDiferencias());
    expect(overridesAt(blocksOf(program)[0], 1, 'Push')).toHaveLength(0);
  });

  it('el que se aparta genera una por cada cosa que cambió', () => {
    const { program, report } = migrateBlockPlans(conDiferencias());
    /* Los cambios son del BLOQUE, y los de la migración valen SOLO en su
       microciclo: `fromWeek === toWeek`. */
    const suyos = overridesAt(blocksOf(program)[0], 2, 'Push');

    expect(suyos).toHaveLength(3);
    expect(report.excepciones).toBe(3);
    expect(suyos.every((o) => o.fromWeek === 2 && o.toWeek === 2)).toBe(true);

    const baja = suyos.find((o) => o.exercise === null);
    expect(baja.sobre).toBe('Fondos');

    const alta = suyos.find((o) => o.targetId === null);
    expect(alta.exercise.name).toBe('Face pull');

    const cambio = suyos.find((o) => o.targetId && o.exercise);
    expect(cambio.sobre).toBe('Press banca');
    expect(cambio.exercise.sets).toHaveLength(4);
  });

  it('aplicarlas devuelve EXACTAMENTE lo que tenía el microciclo', () => {
    const antes = conDiferencias();
    const { program } = migrateBlockPlans(antes);

    const suyo = planOfDay(program, 2, 'Push');
    const original = antes.microcycles.find((m) => m.weekNumber === 2).days[0];

    expect(suyo.exercises.map((e) => e.name)).toEqual(original.exercises.map((e) => e.name));
    expect(suyo.exercises.map((e) => e.sets.length)).toEqual(original.exercises.map((e) => e.sets.length));
  });

  it('un microciclo con la hoja en blanco no se aparta de nada: es un hueco', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
      { weekNumber: 2, days: [dia('Push', [])] },
    ]);

    const { program } = migrateBlockPlans(antes);
    expect(overridesAt(blocksOf(program)[0], 2)).toHaveLength(0);
    /* Y ahora la hoja en blanco tiene el plan del bloque dentro. */
    expect(planOfDay(program, 2, 'Push').exercises).toHaveLength(1);
  });

  it('una hoja que el microciclo no tenía se la da el bloque', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')]), dia('Pull', [ej('Remo', 4, '10')])] },
      { weekNumber: 2, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
    ]);

    const { program } = migrateBlockPlans(antes);
    expect(planOfWeek(program, 2).map((d) => d.dayName)).toEqual(['Push', 'Pull']);
    expect(overridesAt(blocksOf(program)[0], 2)).toHaveLength(0);
  });
});

describe('los registros siguen apuntando a su ejercicio', () => {
  it('reapunta las entradas al ejercicio efectivo de la hoja', () => {
    const banca1 = ej('Press banca', 3, '8-10', { id: 'ex_s1' });
    const banca2 = ej('Press banca', 3, '8-10', { id: 'ex_s2' });

    const antes = programa([
      {
        weekNumber: 1,
        days: [dia('Push', [banca1])],
        sessions: [
          {
            id: 'ses1',
            date: '2026-08-18',
            dayName: 'Push',
            entries: [{ exerciseId: 'ex_s1', name: 'Press banca', sets: [{ kg: '80', reps: '8', rir: '2' }] }],
          },
        ],
      },
      {
        weekNumber: 2,
        days: [dia('Push', [banca2])],
        sessions: [
          {
            id: 'ses2',
            date: '2026-08-25',
            dayName: 'Push',
            entries: [{ exerciseId: 'ex_s2', name: 'Press banca', sets: [{ kg: '82,5', reps: '8', rir: '2' }] }],
          },
        ],
      },
    ]);

    const { program, report } = migrateBlockPlans(antes);
    const efectivo = planOfDay(program, 1, 'Push').exercises[0].id;

    /* Las dos sesiones apuntan ahora al MISMO ejercicio: el del bloque. */
    for (const w of [1, 2]) {
      const micro = program.microcycles.find((m) => m.weekNumber === w);
      expect(micro.sessions[0].entries[0].exerciseId).toBe(efectivo);
    }
    expect(report.sesionesReapuntadas).toBe(1);
    /* Y los kilos no se han movido. */
    expect(program.microcycles[1].sessions[0].entries[0].sets[0].kg).toBe('82,5');
  });

  it('lo que no encuentra pareja conserva su id: no se inventa un destino', () => {
    const sesion = {
      id: 's',
      dayName: 'Push',
      entries: [{ exerciseId: 'ex_viejo', name: 'Aperturas', sets: [] }],
    };
    expect(remapSessionEntries(sesion, [ej('Press banca', 3, '8-10')])).toBe(sesion);
  });

  it('dos ejercicios con el mismo nombre se emparejan en orden', () => {
    const sesion = {
      id: 's',
      dayName: 'Push',
      entries: [
        { exerciseId: 'a', name: 'Press banca', sets: [] },
        { exerciseId: 'b', name: 'Press banca', sets: [] },
      ],
    };
    const remapeada = remapSessionEntries(sesion, [
      ej('Press banca', 3, '8-10', { id: 'nuevo1' }),
      ej('Press banca', 2, '12', { id: 'nuevo2' }),
    ]);
    expect(remapeada.entries.map((e) => e.exerciseId)).toEqual(['nuevo1', 'nuevo2']);
  });
});

describe('la comprobación contra la lectura vieja', () => {
  it('no encuentra ninguna diferencia después de migrar', () => {
    const antes = programa([
      {
        weekNumber: 1,
        days: [dia('Push', [ej('Press banca', 3, '8-10'), ej('Fondos', 3, '10')]), dia('Pull', [ej('Remo', 4, '10')])],
      },
      { weekNumber: 2, days: [dia('Push', [ej('Press banca', 4, '6-8')]), dia('Pull', [ej('Remo', 4, '10')])] },
      { weekNumber: 3, days: [dia('Push', [ej('Press banca', 3, '8-10'), ej('Fondos', 3, '10')])] },
    ]);

    const { program } = migrateBlockPlans(antes);
    expect(compareBlockPlans(antes, program)).toEqual([]);
  });

  it('canta cuando el plan nuevo no dice lo mismo', () => {
    const antes = programa([
      { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
      { weekNumber: 2, days: [dia('Push', [ej('Press banca', 5, '5')])] },
    ]);

    const { program } = migrateBlockPlans(antes);
    /* Se le quitan las excepciones a mano: el microciclo 2 pasa a leer el plan
       del bloque, que no es lo que tenía. */
    const roto = { ...program, blocks: program.blocks.map((b) => ({ ...b, overrides: [] })) };

    /* El plan del bloque sale del microciclo 2 —el último escrito—, así que el
       que se aparta es el 1: sin su excepción, deja de decir lo que decía. */
    const fallos = compareBlockPlans(antes, roto);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toMatchObject({ week: 1, dayName: 'Push', motivo: 'el plan no coincide' });
  });
});

describe('varios bloques', () => {
  it('cada uno lee su propio plan y sus propias excepciones', () => {
    const antes = programa(
      [
        { weekNumber: 1, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
        { weekNumber: 2, days: [dia('Push', [ej('Press banca', 3, '8-10')])] },
        { weekNumber: 3, days: [dia('Push', [ej('Press inclinado', 4, '6-8')])] },
        { weekNumber: 4, days: [dia('Push', [ej('Press inclinado', 5, '6-8')])] },
      ],
      [
        { id: 'b1', name: 'Acumulación', fromWeek: 1, toWeek: 2 },
        { id: 'b2', name: 'Intensificación', fromWeek: 3, toWeek: null },
      ]
    );

    const { program, report } = migrateBlockPlans(antes);
    expect(report.bloques).toBe(2);

    expect(blockSessionOf(blocksOf(program)[0], 'Push').exercises[0].name).toBe('Press banca');
    expect(blockSessionOf(blocksOf(program)[1], 'Push').exercises[0].name).toBe('Press inclinado');
    /* El bloque 2 lee del microciclo 4, así que el 3 se aparta. */
    expect(overridesAt(blocksOf(program)[1], 3)).toHaveLength(1);
    expect(compareBlockPlans(antes, program)).toEqual([]);
  });
});

describe('el diff de una hoja, por su cuenta', () => {
  const plan = { dayName: 'Push', exercises: [ej('A', 3, '10', { id: 'a' }), ej('B', 3, '10', { id: 'b' })] };

  it('sin diferencias no emite nada', () => {
    const day = dia('Push', [ej('A', 3, '10'), ej('B', 3, '10')]);
    expect(overridesDeLaHoja(plan, day)).toHaveLength(0);
  });

  it('emite bajas, cambios y altas, y aplicarlas reconstruye el día', () => {
    const day = dia('Push', [ej('A', 5, '10'), ej('C', 2, '12')]);
    const os = overridesDeLaHoja(plan, day);
    const resultado = applyOverrides(plan, os);

    expect(resultado.exercises.map((e) => e.name)).toEqual(['A', 'C']);
    expect(resultado.exercises[0].sets).toHaveLength(5);
  });

  it('ignora los ejercicios sin nombre: no son plan', () => {
    const day = dia('Push', [ej('A', 3, '10'), ej('   ', 3, '10'), ej('B', 3, '10')]);
    expect(overridesDeLaHoja(plan, day)).toHaveLength(0);
  });
});

/* ══ SOBRE DATOS REALES ═══════════════════════════════════════════════════
   La copia de un cliente de verdad que ya vive en el repositorio: dos bloques,
   kilos anotados dentro del plan —los datos de antes de separar plan y
   ejecución— y sesiones registradas. Es la prueba que de verdad decide si la
   migración se puede lanzar, porque es la forma que tienen los datos que hay
   guardados y no la que uno se imagina al escribirla. */

describe('sobre el programa real de la copia', () => {
  const real = () =>
    JSON.parse(readFileSync(new URL('../../_copia-javier.json', import.meta.url), 'utf8')).workout_data['0'];

  it('la lectura nueva dice exactamente lo mismo que la vieja', () => {
    const antes = real();
    const { program, report } = migrateBlockPlans(antes);

    expect(report.bloques).toBe(2);
    expect(compareBlockPlans(antes, program)).toEqual([]);
  });

  it('cada registro sigue encontrando su ejercicio en el plan', () => {
    const { program } = migrateBlockPlans(real());

    for (const micro of program.microcycles) {
      for (const sesion of micro.sessions || []) {
        const plan = planOfDay(program, micro.weekNumber, sesion.dayName);
        if (!plan) continue;
        const ids = new Set(plan.exercises.map((e) => e.id));
        const nombres = new Set(plan.exercises.map((e) => String(e.name || '').trim().toLowerCase()));
        /* Toda entrada cuyo ejercicio siga en el plan tiene que apuntar a su
           fila: si no, sus kilos dejan de salir en la hoja, en silencio. */
        for (const e of sesion.entries || []) {
          if (!nombres.has(String(e.name || '').trim().toLowerCase())) continue;
          expect(ids.has(e.exerciseId)).toBe(true);
        }
      }
    }
  });

  it('no se pierde ninguna hoja ni ningún ejercicio del plan', () => {
    const antes = real();
    const { program } = migrateBlockPlans(antes);

    for (const micro of antes.microcycles) {
      for (const day of micro.days || []) {
        const plan = planOfDay(program, micro.weekNumber, day.dayName);
        expect(plan).not.toBeNull();
        if ((day.exercises || []).length === 0) continue;
        expect(plan.exercises).toHaveLength(day.exercises.length);
      }
    }
  });

  it('el plan del bloque no arrastra los kilos que había dentro', () => {
    const { program } = migrateBlockPlans(real());

    for (const bloque of program.blocks) {
      for (const hoja of bloque.sessions || []) {
        for (const ex of hoja.exercises || []) {
          expect(ex.sets.every((s) => s.kg === '' && s.reps === '')).toBe(true);
        }
      }
    }
  });
});
