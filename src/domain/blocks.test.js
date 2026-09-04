import { describe, expect, it } from 'vitest';

import {
  BLOCK_CHANGE,
  blockChangeLog,
  blockOfWeek,
  blocksAfterInsertingWeek,
  blocksAfterRemovingWeek,
  blockChanges,
  blockPlan,
  blockPlannedVolume,
  blockSummary,
  blocksOf,
  currentBlock,
  deleteBlockFrom,
  describeBlockChange,
  fillableWeeksOfDay,
  logBlockChange,
  openNextBlock,
  programAfterRemovingWeek,
  renameBlockIn,
  structureOfBlock,
  weekInBlock,
  untrainedWeeksOfDay,
  weekChangesOfBlock,
  weekLabel,
  horizonteDeBloque,
  weeksAheadOfBlock,
  weeksOfBlock,
  blockSessionOf,
  blockSessionsOf,
  buildOverride,
  describeOverride,
  hasBlockPlan,
  blockOverridesOf,
  overrideSpan,
  setOverrideSpanIn,
  planOfDay,
  planOfWeek,
  promoteOverrideIn,
  removeOverrideIn,
  setBlockSessionsIn,
  updateBlockSessionIn,
  resolvedMicrocycles,
  addBlockSessionIn,
  removeBlockSessionFrom,
  renameBlockSessionIn,
  moveBlockSessionIn,
  addBlockExerciseIn,
  removeBlockExerciseIn,
  restoreBlockExerciseIn,
  moveBlockExerciseIn,
  setBlockExerciseSetsIn,
  setBlockExerciseTargetIn,
} from './blocks';

const programa = (semanas, extra = {}) => ({
  weeklySplit: { Lunes: 'Push' },
  mobilityDrills: [{ id: 'd1', name: 'Reach' }],
  microcycles: semanas.map((weekNumber) => ({ weekNumber, days: [] })),
  ...extra,
});

describe('un programa sin bloques', () => {
  it('es el bloque 1 desde la semana 1', () => {
    const lista = blocksOf(programa([1, 2, 3]));
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ name: 'Bloque 1', fromWeek: 1, toWeek: null });
    expect(currentBlock(programa([1, 2, 3])).id).toBe(lista[0].id);
  });

  it('usa la estructura y el calentamiento del programa', () => {
    const p = programa([1]);
    expect(structureOfBlock(p, currentBlock(p))).toEqual({
      weeklySplit: { Lunes: 'Push' },
      mobilityDrills: [{ id: 'd1', name: 'Reach' }],
    });
  });
});

describe('abrir el siguiente bloque', () => {
  it('cierra el abierto en la última semana montada y congela su estructura', () => {
    const { program, block } = openNextBlock(programa([1, 2, 3]), { name: 'Fuerza' });
    expect(program.blocks).toHaveLength(2);
    expect(program.blocks[0]).toMatchObject({
      toWeek: 3,
      weeklySplit: { Lunes: 'Push' },
      mobilityDrills: [{ id: 'd1', name: 'Reach' }],
    });
    expect(block).toMatchObject({ name: 'Fuerza', fromWeek: 4, toWeek: null });
    expect(currentBlock(program).id).toBe(block.id);
  });

  it('no cierra nada si el bloque abierto no tiene semanas', () => {
    const p = programa([]);
    const { program, block } = openNextBlock(p);
    expect(program).toBe(p);
    expect(block.fromWeek).toBe(1);
  });

  it('el cerrado conserva su copia aunque el programa cambie después', () => {
    const { program } = openNextBlock(programa([1, 2]));
    const cambiado = { ...program, weeklySplit: { Lunes: 'Legs' }, mobilityDrills: [] };
    const [cerrado, abierto] = blocksOf(cambiado);
    expect(structureOfBlock(cambiado, cerrado).weeklySplit).toEqual({ Lunes: 'Push' });
    expect(structureOfBlock(cambiado, abierto).weeklySplit).toEqual({ Lunes: 'Legs' });
  });
});

describe('semanas y bloques', () => {
  it('cada semana sabe de qué bloque es', () => {
    const { program } = openNextBlock(programa([1, 2, 3]));
    const conMas = { ...program, microcycles: [...program.microcycles, { weekNumber: 4 }, { weekNumber: 5 }] };
    const [b1, b2] = blocksOf(conMas);
    expect(blockOfWeek(conMas, 2).id).toBe(b1.id);
    expect(blockOfWeek(conMas, 5).id).toBe(b2.id);
    expect(weeksOfBlock(conMas, b1)).toEqual([1, 2, 3]);
    expect(weeksOfBlock(conMas, b2)).toEqual([4, 5]);
  });

  it('quitar un bloque pasa sus semanas al anterior, sin borrar ninguna', () => {
    const { program } = openNextBlock(programa([1, 2, 3]));
    const conMas = { ...program, microcycles: [...program.microcycles, { weekNumber: 4 }, { weekNumber: 5 }] };
    const [, b2] = blocksOf(conMas);
    const sinB2 = deleteBlockFrom(conMas, b2.id);

    expect(blocksOf(sinB2)).toHaveLength(1);
    expect(sinB2.microcycles).toHaveLength(5);
    expect(weeksOfBlock(sinB2, blocksOf(sinB2)[0])).toEqual([1, 2, 3, 4, 5]);
    /* Era el abierto: el anterior se reabre y suelta su copia congelada. */
    expect(blocksOf(sinB2)[0]).toMatchObject({ toWeek: null });
    expect(blocksOf(sinB2)[0].weeklySplit).toBeUndefined();
  });

  it('quitar el primero deja sus semanas en el siguiente', () => {
    const { program } = openNextBlock(programa([1, 2, 3]));
    const conMas = { ...program, microcycles: [...program.microcycles, { weekNumber: 4 }] };
    const [b1] = blocksOf(conMas);
    const sinB1 = deleteBlockFrom(conMas, b1.id);

    expect(blocksOf(sinB1)).toHaveLength(1);
    expect(blocksOf(sinB1)[0]).toMatchObject({ fromWeek: 1, toWeek: null });
    expect(weeksOfBlock(sinB1, blocksOf(sinB1)[0])).toEqual([1, 2, 3, 4]);
  });

  it('quitar uno de en medio lo funde con el anterior y junta su bitácora', () => {
    const blocks = [
      { id: 'a', name: 'A', fromWeek: 1, toWeek: 3, log: [{ id: 'l1', at: '2026-01-01' }] },
      { id: 'b', name: 'B', fromWeek: 4, toWeek: 6, log: [{ id: 'l2', at: '2026-02-01' }] },
      { id: 'c', name: 'C', fromWeek: 7, toWeek: null },
    ];
    const p = deleteBlockFrom(programa([1, 2, 3, 4, 5, 6, 7], { blocks }), 'b');

    expect(p.blocks.map((b) => b.id)).toEqual(['a', 'c']);
    expect(p.blocks[0]).toMatchObject({ fromWeek: 1, toWeek: 6 });
    expect(p.blocks[0].log.map((e) => e.id)).toEqual(['l1', 'l2']);
    expect(blockOfWeek(p, 5).id).toBe('a');
  });

  it('con un solo bloque no hay nada que quitar', () => {
    const p = programa([1, 2]);
    expect(deleteBlockFrom(p, blocksOf(p)[0].id)).toBe(p);
    expect(deleteBlockFrom(p, 'no-existe')).toBe(p);
  });

  it('se renombra sin tocar lo demás', () => {
    const p = programa([1]);
    const renombrado = renameBlockIn(p, blocksOf(p)[0].id, '  Hipertrofia ');
    expect(blocksOf(renombrado)[0].name).toBe('Hipertrofia');
    expect(renameBlockIn(p, blocksOf(p)[0].id, '   ').blocks[0].name).toBe('Bloque 1');
  });
});

describe('los rangos siguen a las semanas', () => {
  const dos = [
    { id: 'a', name: 'A', fromWeek: 1, toWeek: 3 },
    { id: 'b', name: 'B', fromWeek: 4, toWeek: null },
  ];

  it('borrar una semana de un bloque cerrado acorta ese bloque y corre el siguiente', () => {
    expect(blocksAfterRemovingWeek(dos, 2)).toEqual([
      { id: 'a', name: 'A', fromWeek: 1, toWeek: 2 },
      { id: 'b', name: 'B', fromWeek: 3, toWeek: null },
    ]);
  });

  it('borrar una semana del abierto no toca los rangos anteriores', () => {
    expect(blocksAfterRemovingWeek(dos, 5)).toEqual(dos);
  });

  it('un cerrado que se queda vacío desaparece', () => {
    const uno = [{ id: 'a', name: 'A', fromWeek: 1, toWeek: 1 }, { id: 'b', name: 'B', fromWeek: 2, toWeek: null }];
    expect(blocksAfterRemovingWeek(uno, 1)).toEqual([{ id: 'b', name: 'B', fromWeek: 1, toWeek: null }]);
  });

  it('deshacer la borrada devuelve los rangos de antes', () => {
    expect(blocksAfterInsertingWeek(blocksAfterRemovingWeek(dos, 2), 2)).toEqual(dos);
    expect(blocksAfterInsertingWeek(blocksAfterRemovingWeek(dos, 4), 4)).toEqual(dos);
  });

  it('con el último bloque cerrado, el abierto que se inventa tiene un id estable', () => {
    const p = { blocks: [{ id: 'a', name: 'A', fromWeek: 1, toWeek: 2 }], microcycles: [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }] };
    expect(blocksOf(p)[1].id).toBe(blocksOf(p)[1].id);
    expect(currentBlock(p).id).toBe(blocksOf(p)[1].id);
  });
});

describe('borrar la única semana del bloque abierto', () => {
  const con = (semanas, blocks) =>
    programa(semanas, {
      weeklySplit: { Lunes: 'Otro' },
      mobilityDrills: [],
      blocks,
    });

  it('quita el bloque fantasma y reabre el anterior con su estructura', () => {
    const p = con([1, 2, 3], [
      { id: 'a', name: 'A', fromWeek: 1, toWeek: 2, weeklySplit: { Lunes: 'Push' }, mobilityDrills: [{ id: 'd1', name: 'Reach' }] },
      { id: 'b', name: 'B', fromWeek: 3, toWeek: null },
    ]);
    const r = programAfterRemovingWeek(p, 3);
    expect(r.blocks).toEqual([{ id: 'a', name: 'A', fromWeek: 1, toWeek: null }]);
    expect(r.weeklySplit).toEqual({ Lunes: 'Push' });
    expect(r.mobilityDrills).toEqual([{ id: 'd1', name: 'Reach' }]);
  });

  it('si el abierto conserva semanas, solo corre los rangos', () => {
    const p = con([1, 2, 3, 4], [
      { id: 'a', name: 'A', fromWeek: 1, toWeek: 2, weeklySplit: { Lunes: 'Push' } },
      { id: 'b', name: 'B', fromWeek: 3, toWeek: null },
    ]);
    const r = programAfterRemovingWeek(p, 3);
    expect(r.blocks[1]).toEqual({ id: 'b', name: 'B', fromWeek: 3, toWeek: null });
    expect(r.weeklySplit).toEqual({ Lunes: 'Otro' });
  });

  it('el primer bloque nunca desaparece', () => {
    const r = programAfterRemovingWeek(programa([1]), 1);
    expect(r.blocks).toEqual([]);
  });
});

describe('los cambios de bloque', () => {
  it('son donde empieza cada bloque menos el primero', () => {
    const p = programa([1, 2, 3, 4], { blocks: [
      { id: 'a', name: 'Fuerza', fromWeek: 1, toWeek: 2 },
      { id: 'b', name: 'Volumen', fromWeek: 3, toWeek: null },
    ] });
    expect(blockChanges(p)).toEqual([{ week: 3, name: 'Volumen', id: 'b' }]);
    expect(blockChanges(programa([1, 2]))).toEqual([]);
  });
});

describe('la semana dentro de su bloque', () => {
  const p = programa([1, 2, 3, 4], { blocks: [
    { id: 'a', name: 'A', fromWeek: 1, toWeek: 2 },
    { id: 'b', name: 'B', fromWeek: 3, toWeek: null },
  ] });
  it('vuelve a empezar por la 1 en cada bloque', () => {
    expect(weekInBlock(p, 3).n).toBe(1);
    expect(weekInBlock(p, 4)).toMatchObject({ n: 2, index: 1 });
    expect(weekInBlock(programa([1, 2]), 2).n).toBe(2);
  });
  it('se etiqueta con el bloque solo cuando hay más de uno', () => {
    expect(weekLabel(p, 4)).toBe('B2·S2');
    expect(weekLabel(programa([1, 2]), 2)).toBe('S2');
  });
});

describe('el volumen pautado de un bloque', () => {
  /* Dos días por semana: Push con 6 series de pecho, Pull con 4 de espalda. */
  const dia = (nombre, musculo, series) => ({
    dayName: nombre,
    exercises: [{ id: `e_${nombre}`, name: nombre, muscle: musculo, sets: Array.from({ length: series }, () => ({})) }],
  });
  const conDias = (semanas, extra = {}) => ({
    weeklySplit: { Lunes: 'Push' },
    microcycles: semanas.map((weekNumber) => ({
      weekNumber,
      days: [dia('Push', 'Pecho', 6), dia('Pull', 'Espalda', 4)],
    })),
    ...extra,
  });

  it('suma las series escritas de todas sus semanas', () => {
    const p = conDias([1, 2, 3]);
    const v = blockPlannedVolume(p, currentBlock(p));

    expect(v.semanas).toBe(3);
    expect(v.total).toBe(30); // (6 + 4) × 3
    expect(v.porMusculo.Pecho.total).toBe(18);
    expect(v.porMusculo.Espalda.total).toBe(12);
  });

  it('da la media por semana, que es lo comparable', () => {
    const p = conDias([1, 2, 3]);
    const v = blockPlannedVolume(p, currentBlock(p));

    expect(v.media).toBe(10);
    expect(v.porMusculo.Pecho.media).toBe(6);
  });

  it('solo cuenta las semanas de SU bloque', () => {
    const p = conDias([1, 2, 3, 4], {
      blocks: [
        { id: 'b1', name: 'Bloque 1', fromWeek: 1, toWeek: 2 },
        { id: 'b2', name: 'Bloque 2', fromWeek: 3, toWeek: null },
      ],
    });

    expect(blockPlannedVolume(p, blocksOf(p)[0]).total).toBe(20);
    expect(blockPlannedVolume(p, blocksOf(p)[1]).total).toBe(20);
  });

  it('sin semanas montadas no inventa una media de cero', () => {
    const p = conDias([], { blocks: [{ id: 'b1', name: 'Bloque 1', fromWeek: 1, toWeek: null }] });
    const v = blockPlannedVolume(p, currentBlock(p));

    expect(v.semanas).toBe(0);
    expect(v.total).toBe(0);
    expect(v.media).toBeNull();
  });
});

describe('la plantilla del bloque', () => {
  /* Un ejercicio con `series` series, todas pidiendo las mismas reps. */
  const ej = (name, muscle, series, targetReps = '8-10') => ({
    id: `e_${name}`,
    name,
    muscle,
    sets: Array.from({ length: series }, () => ({ targetReps })),
  });
  const semana = (weekNumber, days, sessions = []) => ({ weekNumber, days, sessions });
  const push = (series = 3) => ({ dayName: 'Push', exercises: [ej('Press banca', 'Pecho', series)] });
  const pull = () => ({ dayName: 'Pull', exercises: [ej('Remo', 'Espalda', 4)] });

  it('se lee de la ÚLTIMA semana del bloque, con sus series y sus reps', () => {
    const p = { microcycles: [semana(1, [push()]), semana(2, [push(5)])] };
    const plan = blockPlan(p, currentBlock(p));

    expect(plan.reference).toBe(2);
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0]).toMatchObject({ dayName: 'Push', series: 5 });
    expect(plan.sessions[0].exercises[0]).toMatchObject({
      name: 'Press banca',
      muscle: 'Pecho',
      series: 5,
      targetReps: '8-10',
    });
  });

  it('dice qué semanas se salen de la plantilla', () => {
    const p = { microcycles: [semana(1, [push(3)]), semana(2, [push(4)]), semana(3, [push(4)])] };

    // La 3 es la referencia; la 2 coincide con ella y la 1 no.
    expect(blockPlan(p, currentBlock(p)).sessions[0].difieren).toEqual([1]);
  });

  it('separa la semana VACÍA de la que se tocó a mano', () => {
    const p = { microcycles: [semana(1, [pull()]), semana(2, [push(), pull()])] };
    const plan = blockPlan(p, currentBlock(p));
    const dePush = plan.sessions.find((s) => s.dayName === 'Push');

    // A la 1 le falta el día entero: está por rellenar, no discrepa.
    expect(dePush.vacias).toEqual([1]);
    expect(dePush.difieren).toEqual([]);
    expect(plan.sessions.find((s) => s.dayName === 'Pull').vacias).toEqual([]);
  });

  it('la referencia es la última semana ESCRITA, no una recién creada en blanco', () => {
    /* Es lo que deja «+ semana»: los mismos días, sin ejercicios. */
    const p = { microcycles: [semana(1, [push(4)]), semana(2, [{ dayName: 'Push', exercises: [] }])] };
    const plan = blockPlan(p, currentBlock(p));

    expect(plan.reference).toBe(1);
    expect(plan.sessions[0].series).toBe(4);
    expect(plan.sessions[0].vacias).toEqual([2]);
  });

  it('con reps distintas entre series no inventa una sola', () => {
    const mixto = {
      dayName: 'Push',
      exercises: [{ id: 'e1', name: 'Press', muscle: 'Pecho', sets: [{ targetReps: '8' }, { targetReps: '12' }] }],
    };

    expect(blockPlan({ microcycles: [semana(1, [mixto])] }, currentBlock({})).sessions[0].exercises[0].targetReps).toBeNull();
  });

  it('sin semanas montadas no tiene sesiones', () => {
    const plan = blockPlan({ microcycles: [] }, currentBlock({ microcycles: [] }));

    expect(plan.reference).toBeNull();
    expect(plan.sessions).toEqual([]);
  });

  it('solo mira las semanas de SU bloque', () => {
    const p = {
      microcycles: [semana(1, [push()]), semana(2, [pull()])],
      blocks: [
        { id: 'b1', name: 'Bloque 1', fromWeek: 1, toWeek: 1 },
        { id: 'b2', name: 'Bloque 2', fromWeek: 2, toWeek: null },
      ],
    };

    expect(blockPlan(p, blocksOf(p)[0]).sessions.map((s) => s.dayName)).toEqual(['Push']);
    expect(blockPlan(p, blocksOf(p)[1]).sessions.map((s) => s.dayName)).toEqual(['Pull']);
  });
});

describe('dónde escribe la plantilla', () => {
  const dia = (dayName) => ({ dayName, exercises: [] });
  const p = {
    microcycles: [
      {
        weekNumber: 1,
        days: [dia('Push'), dia('Pull')],
        sessions: [{ id: 's1', dayName: 'Push', sets: [{ kg: '60', reps: '8' }] }],
      },
      { weekNumber: 2, days: [dia('Push'), dia('Pull')], sessions: [] },
      { weekNumber: 3, days: [dia('Push')], sessions: [] },
    ],
  };

  it('no toca las semanas donde esa sesión ya se entrenó', () => {
    expect(untrainedWeeksOfDay(p, currentBlock(p), 'Push')).toEqual([2, 3]);
  });

  it('ni las semanas donde ese día no existe', () => {
    expect(untrainedWeeksOfDay(p, currentBlock(p), 'Pull')).toEqual([1, 2]);
  });

  it('una sesión nueva entra de la semana en curso en adelante', () => {
    expect(weeksAheadOfBlock(p, currentBlock(p), 2)).toEqual([2, 3]);
  });

  it('y en todas si el bloque todavía no ha empezado', () => {
    expect(weeksAheadOfBlock(p, currentBlock(p), null)).toEqual([1, 2, 3]);
  });

  it('en la última si la semana en curso ya pasó del bloque', () => {
    expect(weeksAheadOfBlock(p, currentBlock(p), 9)).toEqual([3]);
  });
});

describe('dónde se puede poner la plantilla', () => {
  const conEj = (dayName) => ({ dayName, exercises: [{ id: 'e1', name: 'Press', muscle: 'Pecho', sets: [{}] }] });
  const vacio = (dayName) => ({ dayName, exercises: [] });
  const p = {
    microcycles: [
      { weekNumber: 1, days: [conEj('Push')], sessions: [] },
      { weekNumber: 2, days: [vacio('Push')], sessions: [] },
      { weekNumber: 3, days: [], sessions: [] },
      { weekNumber: 4, days: [vacio('Push')], sessions: [{ id: 's', dayName: 'Push', sets: [{ kg: '60', reps: '8' }] }] },
    ],
  };

  it('cuenta la semana vacía Y aquella a la que le falta el día entero', () => {
    expect(fillableWeeksOfDay(p, currentBlock(p), 'Push')).toEqual([2, 3]);
  });

  it('no cuenta la que ya tiene ejercicios ni la que ya se entrenó', () => {
    const semanas = fillableWeeksOfDay(p, currentBlock(p), 'Push');
    expect(semanas).not.toContain(1);
    expect(semanas).not.toContain(4);
  });
});

describe('la bitácora del bloque', () => {
  const base = { microcycles: [{ weekNumber: 1, days: [], sessions: [] }] };
  const apunte = (extra = {}) => ({ id: 'l1', at: '2026-08-29T10:00:00.000Z', kind: BLOCK_CHANGE.EJERCICIO_MAS, hoja: 'Push A', alcance: 'bloque', que: 'Face pull', ...extra });

  it('se guarda DENTRO de su bloque, sin columna nueva', () => {
    const p = logBlockChange(base, currentBlock(base).id, apunte());

    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].log).toHaveLength(1);
    expect(p.blocks[0].log[0]).toMatchObject({ hoja: 'Push A', que: 'Face pull' });
    // Y no toca los microciclos: la bitácora es del bloque, no del plan.
    expect(p.microcycles).toBe(base.microcycles);
  });

  it('materializa el bloque 1 implícito en vez de perder el apunte', () => {
    // `base` no tiene `blocks`: es el bloque 1 sintetizado por `blocksOf`.
    expect(base.blocks).toBeUndefined();
    expect(logBlockChange(base, 'b_1', apunte()).blocks[0].id).toBe('b_1');
  });

  it('los devuelve del más reciente al más viejo', () => {
    let p = logBlockChange(base, 'b_1', apunte({ id: 'l1', que: 'Uno' }));
    p = logBlockChange(p, 'b_1', apunte({ id: 'l2', que: 'Dos' }));

    expect(blockChangeLog(blocksOf(p)[0]).map((e) => e.que)).toEqual(['Dos', 'Uno']);
  });

  it('separa lo que se tocó en UNA semana de lo que fue a todo el bloque', () => {
    let p = logBlockChange(base, 'b_1', apunte({ id: 'l1', alcance: 'bloque', semanas: [1, 2, 3] }));
    p = logBlockChange(p, 'b_1', apunte({ id: 'l2', alcance: 'semana', semanas: [3], que: 'Remo' }));

    const solo3 = weekChangesOfBlock(blocksOf(p)[0], 3);
    expect(solo3).toHaveLength(1);
    expect(solo3[0].que).toBe('Remo');
    expect(weekChangesOfBlock(blocksOf(p)[0], 2)).toHaveLength(0);
  });

  it('no crece sin fin: se queda con los últimos', () => {
    let p = base;
    for (let i = 0; i < 260; i += 1) p = logBlockChange(p, 'b_1', apunte({ id: `l${i}`, que: `Ej ${i}` }));

    const log = blocksOf(p)[0].log;
    expect(log).toHaveLength(200);
    expect(log[log.length - 1].que).toBe('Ej 259');
  });

  it('cuenta el cambio en una línea', () => {
    expect(describeBlockChange(apunte())).toBe('+ Face pull');
    expect(describeBlockChange(apunte({ kind: BLOCK_CHANGE.SERIES, que: 'Sentadilla', de: 3, a: 4 }))).toBe('Sentadilla: 3 → 4 series');
    expect(describeBlockChange(apunte({ kind: BLOCK_CHANGE.HOJA_MENOS, que: 'Legs B' }))).toBe('hoja «Legs B» quitada');
    expect(describeBlockChange(apunte({ kind: BLOCK_CHANGE.PLANTILLA, que: 'S5, S6' }))).toBe('plantilla puesta');
  });
});

describe('el bloque en cifras', () => {
  const ej = (series) => ({ id: 'e1', name: 'Press', muscle: 'Pecho', sets: Array.from({ length: series }, () => ({})) });
  const semana = (weekNumber, date, sessions = []) => ({
    weekNumber,
    date,
    days: [{ dayName: 'Push', exercises: [ej(4)] }, { dayName: 'Pull', exercises: [ej(4)] }],
    sessions,
  });
  /* Una sesión guarda lo ejecutado en `entries[].sets[]`, no en `sets` a
     secas: es donde lo busca `sessionTonnage`. */
  const sesion = (dayName, kg) => ({ id: `s${dayName}`, dayName, entries: [{ sets: [{ kg: String(kg), reps: '10' }] }] });

  const p = {
    microcycles: [
      semana(1, '2026-01-05', [sesion('Push', 100), sesion('Pull', 50)]),
      semana(2, '2026-01-12', [sesion('Push', 100)]),
    ],
  };

  it('junta lo pautado y lo hecho, que son dos preguntas', () => {
    const r = blockSummary(p, currentBlock(p));

    expect(r.semanas).toBe(2);
    expect(r.desde).toBe('2026-01-05');
    expect(r.hasta).toBe('2026-01-12');
    expect(r.series).toBe(8); // 8 series por semana, no 16 en total
    expect(r.kg).toBe(2500); // (100 + 50) × 10 reps en la 1, más 100 × 10 en la 2
    expect(r.hechas).toBe(3);
    expect(r.planificadas).toBe(4);
    expect(r.adherencia).toBe(75);
    expect(r.abierto).toBe(true);
  });

  it('sin nada planificado no inventa una adherencia de cero', () => {
    const vacio = { microcycles: [] };
    const r = blockSummary(vacio, currentBlock(vacio));

    expect(r.adherencia).toBeNull();
    expect(r.series).toBeNull();
    expect(r.desde).toBeNull();
  });

  it('un bloque cerrado se marca como tal', () => {
    const cerrado = { ...p, blocks: [{ id: 'a', name: 'A', fromWeek: 1, toWeek: 2 }, { id: 'b', name: 'B', fromWeek: 3, toWeek: null }] };
    expect(blockSummary(cerrado, blocksOf(cerrado)[0]).abierto).toBe(false);
    expect(blockSummary(cerrado, blocksOf(cerrado)[1]).semanas).toBe(0);
  });
});

describe('el horizonte del bloque', () => {
  const dosBloques = programa([1, 2, 3, 4, 5, 6], {
    blocks: [
      { id: 'a', name: 'Acumulación', fromWeek: 1, toWeek: 4 },
      { id: 'b', name: 'Intensificación', fromWeek: 5, toWeek: null },
    ],
  });

  it('dice cuánto queda y qué viene detrás', () => {
    const h = horizonteDeBloque(dosBloques, 2);
    expect(h.bloque.name).toBe('Acumulación');
    expect(h.restantes).toBe(2);
    expect(h.siguiente.name).toBe('Intensificación');
    expect(h.abierto).toBe(false);
  });

  it('en el bloque abierto no hay siguiente y lo dice', () => {
    const h = horizonteDeBloque(dosBloques, 6);
    expect(h.bloque.name).toBe('Intensificación');
    expect(h.restantes).toBe(0);
    expect(h.siguiente).toBeNull();
    expect(h.abierto).toBe(true);
  });

  it('el bloque sintético del final no cuenta como plan', () => {
    const cerrados = programa([1, 2], { blocks: [{ id: 'a', name: 'A', fromWeek: 1, toWeek: 2 }] });
    const h = horizonteDeBloque(cerrados, 2);
    expect(h.siguiente).toBeNull();
  });

  it('sin semana en curso, o fuera de lo escrito, no hay horizonte', () => {
    expect(horizonteDeBloque(dosBloques, null)).toBeNull();
    expect(horizonteDeBloque(dosBloques, 9)).toBeNull();
    expect(horizonteDeBloque({ microcycles: [] }, 1)).toBeNull();
  });
});

/* ══ EL PLAN DENTRO DEL BLOQUE ═══════════════════════════════════════════ */

const ejercicio = (id, name, series = 3) => ({
  id,
  name,
  muscle: 'Pecho',
  sets: Array.from({ length: series }, () => ({ kg: '', reps: '', rir: '', targetReps: '8-10', targetRir: '' })),
});

const conPlan = (overrides = []) => ({
  weeklySplit: {},
  mobilityDrills: [],
  blocks: [
    {
      id: 'b1',
      name: 'Acumulación',
      fromWeek: 1,
      toWeek: null,
      sessions: [{ dayName: 'Push', exercises: [ejercicio('a', 'Press banca'), ejercicio('b', 'Fondos')] }],
      /* Los cambios son del BLOQUE y llevan su tramo. Los de estas pruebas
         valen solo en el microciclo 2, que es el caso puntual. */
      overrides,
    },
  ],
  microcycles: [
    { weekNumber: 1, days: [{ dayName: 'Push', exercises: [] }] },
    { weekNumber: 2, days: [{ dayName: 'Push', exercises: [] }] },
  ],
});

describe('la convivencia de las dos lecturas', () => {
  it('sin plan en el bloque, manda el día del microciclo', () => {
    const p = {
      microcycles: [{ weekNumber: 1, days: [{ dayName: 'Push', exercises: [ejercicio('x', 'Remo')] }] }],
    };
    expect(hasBlockPlan(blocksOf(p)[0])).toBe(false);
    expect(planOfDay(p, 1, 'Push').exercises[0].name).toBe('Remo');
  });

  it('con plan en el bloque, manda el bloque aunque el microciclo esté en blanco', () => {
    expect(planOfDay(conPlan(), 1, 'Push').exercises.map((e) => e.name)).toEqual(['Press banca', 'Fondos']);
  });

  it('una hoja que el bloque no tiene no se inventa', () => {
    expect(planOfDay(conPlan(), 1, 'Legs')).toBeNull();
  });

  it('planOfWeek devuelve las hojas en el orden del bloque', () => {
    expect(planOfWeek(conPlan(), 2).map((d) => d.dayName)).toEqual(['Push']);
  });
});

describe('las excepciones de un microciclo', () => {
  it('una baja quita el ejercicio solo en su microciclo', () => {
    const o = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'b', exercise: null, sobre: 'Fondos' });
    const p = conPlan([o]);
    expect(planOfDay(p, 2, 'Push').exercises.map((e) => e.name)).toEqual(['Press banca']);
    expect(planOfDay(p, 1, 'Push').exercises).toHaveLength(2);
  });

  it('un cambio sustituye en su sitio', () => {
    const o = buildOverride({
      fromWeek: 2,
      toWeek: 2,
      dayName: 'Push',
      targetId: 'a',
      exercise: ejercicio('a2', 'Press inclinado', 4),
      sobre: 'Press banca',
    });
    const hojas = planOfDay(conPlan([o]), 2, 'Push').exercises;
    expect(hojas.map((e) => e.name)).toEqual(['Press inclinado', 'Fondos']);
    expect(hojas[0].sets).toHaveLength(4);
  });

  it('un alta entra donde se le dice, y sin sitio va al final', () => {
    const enMedio = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', exercise: ejercicio('c', 'Face pull'), index: 1 });
    expect(planOfDay(conPlan([enMedio]), 2, 'Push').exercises.map((e) => e.name)).toEqual([
      'Press banca',
      'Face pull',
      'Fondos',
    ]);

    const alFinal = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', exercise: ejercicio('c', 'Face pull') });
    expect(planOfDay(conPlan([alFinal]), 2, 'Push').exercises.map((e) => e.name)).toEqual([
      'Press banca',
      'Fondos',
      'Face pull',
    ]);
  });

  it('una excepción sobre un ejercicio que ya no está en el bloque se ignora', () => {
    const huerfana = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'no_existe', exercise: null, sobre: 'Aperturas' });
    expect(planOfDay(conPlan([huerfana]), 2, 'Push').exercises).toHaveLength(2);
  });

  it('las de otra hoja no se aplican aquí', () => {
    const deOtra = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Pull', targetId: 'a', exercise: null, sobre: 'Press banca' });
    expect(planOfDay(conPlan([deOtra]), 2, 'Push').exercises).toHaveLength(2);
  });
});

describe('deshacer y ascender una excepción', () => {
  it('quitarla devuelve el microciclo al plan del bloque', () => {
    const o = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'b', exercise: null, sobre: 'Fondos' });
    const p = removeOverrideIn(conPlan([o]), 'b1', o.id);
    expect(planOfDay(p, 2, 'Push').exercises).toHaveLength(2);
    expect(blockOverridesOf(blocksOf(p)[0])).toHaveLength(0);
  });

  it('ascenderla la mete en el bloque y la borra del microciclo', () => {
    const o = buildOverride({
      fromWeek: 2,
      toWeek: 2,
      dayName: 'Push',
      targetId: 'a',
      exercise: ejercicio('a2', 'Press inclinado', 4),
      sobre: 'Press banca',
    });
    const p = promoteOverrideIn(conPlan([o]), 'b1', o.id);

    /* Ahora es el plan: lo ven los DOS microciclos. */
    expect(planOfDay(p, 1, 'Push').exercises.map((e) => e.name)).toEqual(['Press inclinado', 'Fondos']);
    expect(planOfDay(p, 2, 'Push').exercises.map((e) => e.name)).toEqual(['Press inclinado', 'Fondos']);
    expect(blockOverridesOf(blocksOf(p)[0])).toHaveLength(0);
  });

  it('el ejercicio conserva su id al subir: sus registros apuntan ahí', () => {
    const o = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: ejercicio('a2', 'Press inclinado'), sobre: 'Press banca' });
    const p = promoteOverrideIn(conPlan([o]), 'b1', o.id);
    expect(planOfDay(p, 2, 'Push').exercises[0].id).toBe('a2');
  });

  it('sin plan en el bloque no hay nada que ascender', () => {
    const p = { microcycles: [{ weekNumber: 1, days: [], overrides: [] }] };
    expect(promoteOverrideIn(p, 1, 'lo-que-sea')).toBe(p);
  });
});

describe('escribir el plan del bloque', () => {
  it('setBlockSessionsIn pone las hojas', () => {
    const p = setBlockSessionsIn(conPlan(), 'b1', [{ dayName: 'Legs', exercises: [] }]);
    expect(blockSessionsOf(blocksOf(p)[0]).map((s) => s.dayName)).toEqual(['Legs']);
  });

  it('updateBlockSessionIn cambia una hoja y deja las demás', () => {
    const base = setBlockSessionsIn(conPlan(), 'b1', [
      { dayName: 'Push', exercises: [ejercicio('a', 'Press banca')] },
      { dayName: 'Pull', exercises: [ejercicio('z', 'Remo')] },
    ]);
    const p = updateBlockSessionIn(base, 'b1', 'Push', (h) => ({ ...h, exercises: [] }));
    expect(blockSessionOf(blocksOf(p)[0], 'Push').exercises).toHaveLength(0);
    expect(blockSessionOf(blocksOf(p)[0], 'Pull').exercises).toHaveLength(1);
  });
});

describe('cómo se cuenta una excepción', () => {
  it('la baja, el alta y la sustitución se dicen distinto', () => {
    expect(describeOverride(buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: null, sobre: 'Fondos' }))).toBe(
      '− Fondos'
    );
    expect(describeOverride(buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', exercise: ejercicio('c', 'Face pull') }))).toBe(
      '+ Face pull'
    );
    expect(
      describeOverride(
        buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: ejercicio('c', 'Press inclinado'), sobre: 'Press banca' })
      )
    ).toBe('Press inclinado en lugar de Press banca');
  });

  it('un cambio de series se dice por su nombre, que es lo que cambió de sitio', () => {
    expect(
      describeOverride(
        buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: ejercicio('a', 'Press banca', 5), sobre: 'Press banca' })
      )
    ).toBe('Press banca');
  });
});

describe('los microciclos con su plan puesto', () => {
  it('sin ningún bloque migrado devuelve los MISMOS objetos', () => {
    const p = { microcycles: [{ weekNumber: 1, days: [{ dayName: 'Push', exercises: [] }] }] };
    expect(resolvedMicrocycles(p)).toBe(p.microcycles);
  });

  it('con plan, cada microciclo lleva las hojas del bloque', () => {
    const micros = resolvedMicrocycles(conPlan());
    expect(micros[0].days.map((d) => d.dayName)).toEqual(['Push']);
    expect(micros[0].days[0].exercises.map((e) => e.name)).toEqual(['Press banca', 'Fondos']);
  });

  it('y las excepciones de esa semana, solo en esa semana', () => {
    const o = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'b', exercise: null, sobre: 'Fondos' });
    const micros = resolvedMicrocycles(conPlan([o]));
    expect(micros[0].days[0].exercises).toHaveLength(2);
    expect(micros[1].days[0].exercises).toHaveLength(1);
  });

  it('conserva los kilos que esa semana tuviera escritos dentro del plan', () => {
    /*
      Los datos antiguos guardan la ejecución dentro del plan y `legacySession`
      los saca de ahí. El plan del bloque va limpio —lo comparten todas sus
      semanas—, así que al resolver hay que devolverle a cada una lo suyo o el
      histórico desaparece de la analítica sin decir nada.
    */
    const p = conPlan();
    p.microcycles[0].days = [
      {
        dayName: 'Push',
        exercises: [
          {
            id: 'a',
            name: 'Press banca',
            muscle: 'Pecho',
            sets: [
              { kg: '80', reps: '8', rir: '2', targetReps: '8-10' },
              { kg: '80', reps: '7', rir: '1', targetReps: '8-10' },
              { kg: '', reps: '', rir: '', targetReps: '8-10' },
            ],
          },
        ],
      },
    ];

    const micros = resolvedMicrocycles(p);
    const banca = micros[0].days[0].exercises.find((e) => e.name === 'Press banca');
    expect(banca.sets.map((s) => s.kg)).toEqual(['80', '80', '']);
    expect(banca.sets.map((s) => s.reps)).toEqual(['8', '7', '']);
    /* Y el objetivo sigue siendo el del bloque, que es el plan. */
    expect(banca.sets[0].targetReps).toBe('8-10');
    /* La otra semana no hereda nada. */
    expect(micros[1].days[0].exercises[0].sets.every((s) => s.kg === '')).toBe(true);
  });

  it('empareja por nombre cuando el id ya no es el mismo', () => {
    const p = conPlan();
    p.microcycles[0].days = [
      {
        dayName: 'Push',
        exercises: [
          { id: 'otro_id', name: 'Press banca', muscle: 'Pecho', sets: [{ kg: '60', reps: '10', rir: '', targetReps: '8-10' }] },
        ],
      },
    ];
    expect(resolvedMicrocycles(p)[0].days[0].exercises[0].sets[0].kg).toBe('60');
  });
});

describe('editar el plan del bloque', () => {
  it('añade una hoja al final, y no la duplica', () => {
    const p = addBlockSessionIn(conPlan(), 'b1', 'Legs');
    expect(blockSessionsOf(blocksOf(p)[0]).map((s) => s.dayName)).toEqual(['Push', 'Legs']);
    expect(blockSessionsOf(blocksOf(addBlockSessionIn(p, 'b1', 'Legs'))[0])).toHaveLength(2);
  });

  it('quitar una hoja se lleva sus excepciones y deja las de las demás', () => {
    const suya = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: null, sobre: 'Press banca' });
    const ajena = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Legs', targetId: 'z', exercise: null, sobre: 'Prensa' });
    const base = addBlockSessionIn(conPlan([suya, ajena]), 'b1', 'Legs');

    const p = removeBlockSessionFrom(base, 'b1', 'Push');
    expect(blockSessionsOf(blocksOf(p)[0]).map((s) => s.dayName)).toEqual(['Legs']);
    expect(blockOverridesOf(blocksOf(p)[0]).map((o) => o.dayName)).toEqual(['Legs']);
  });

  it('renombrar una hoja se lleva sus excepciones con ella', () => {
    const o = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: null, sobre: 'Press banca' });
    const p = renameBlockSessionIn(conPlan([o]), 'b1', 'Push', 'Empuje A');

    expect(blockSessionsOf(blocksOf(p)[0])[0].dayName).toBe('Empuje A');
    expect(blockOverridesOf(blocksOf(p)[0])[0].dayName).toBe('Empuje A');
    /* Y sigue resolviéndose: la excepción no se ha quedado colgando. */
    expect(planOfDay(p, 2, 'Empuje A').exercises).toHaveLength(1);
  });

  it('un nombre en blanco no renombra nada', () => {
    const p = conPlan();
    expect(renameBlockSessionIn(p, 'b1', 'Push', '   ')).toBe(p);
  });

  it('mueve una hoja de sitio', () => {
    const base = addBlockSessionIn(addBlockSessionIn(conPlan(), 'b1', 'Pull'), 'b1', 'Legs');
    const p = moveBlockSessionIn(base, 'b1', 2, 0);
    expect(blockSessionsOf(blocksOf(p)[0]).map((s) => s.dayName)).toEqual(['Legs', 'Push', 'Pull']);
  });

  it('un movimiento imposible no toca nada', () => {
    const p = conPlan();
    expect(moveBlockSessionIn(p, 'b1', 0, 9).blocks[0].sessions).toEqual(p.blocks[0].sessions);
  });
});

describe('editar los ejercicios de una hoja del bloque', () => {
  const hoja = (p) => blockSessionOf(blocksOf(p)[0], 'Push').exercises;

  it('un gesto, UNA escritura: el cambio lo ven todos los microciclos', () => {
    const p = addBlockExerciseIn(conPlan(), 'b1', 'Push', ejercicio('c', 'Face pull'));
    expect(planOfDay(p, 1, 'Push').exercises.map((e) => e.name)).toEqual(['Press banca', 'Fondos', 'Face pull']);
    expect(planOfDay(p, 2, 'Push').exercises.map((e) => e.name)).toEqual(['Press banca', 'Fondos', 'Face pull']);
  });

  it('quitar y devolver a su sitio', () => {
    const quitado = removeBlockExerciseIn(conPlan(), 'b1', 'Push', 'a');
    expect(hoja(quitado).map((e) => e.name)).toEqual(['Fondos']);

    const vuelto = restoreBlockExerciseIn(quitado, 'b1', 'Push', ejercicio('a', 'Press banca'), 0);
    expect(hoja(vuelto).map((e) => e.name)).toEqual(['Press banca', 'Fondos']);
  });

  it('mueve un ejercicio dentro de su hoja', () => {
    const p = moveBlockExerciseIn(conPlan(), 'b1', 'Push', 1, 0);
    expect(hoja(p).map((e) => e.name)).toEqual(['Fondos', 'Press banca']);
  });

  it('subir series copia el objetivo de la última, y bajar quita por el final', () => {
    const sube = setBlockExerciseSetsIn(conPlan(), 'b1', 'Push', 'a', 5);
    expect(hoja(sube)[0].sets).toHaveLength(5);
    expect(hoja(sube)[0].sets.every((s) => s.targetReps === '8-10')).toBe(true);

    expect(hoja(setBlockExerciseSetsIn(conPlan(), 'b1', 'Push', 'a', 1))[0].sets).toHaveLength(1);
  });

  it('las series se quedan entre 1 y 12', () => {
    expect(hoja(setBlockExerciseSetsIn(conPlan(), 'b1', 'Push', 'a', 0))[0].sets).toHaveLength(1);
    expect(hoja(setBlockExerciseSetsIn(conPlan(), 'b1', 'Push', 'a', 40))[0].sets).toHaveLength(12);
  });

  it('el objetivo de repeticiones va a todas las series', () => {
    const p = setBlockExerciseTargetIn(conPlan(), 'b1', 'Push', 'a', '5-7');
    expect(hoja(p)[0].sets.every((s) => s.targetReps === '5-7')).toBe(true);
    /* Y solo al suyo. */
    expect(hoja(p)[1].sets.every((s) => s.targetReps === '8-10')).toBe(true);
  });

  it('lo escrito en el bloque NO pisa la excepción de un microciclo', () => {
    const o = buildOverride({ fromWeek: 2, toWeek: 2, dayName: 'Push', targetId: 'a', exercise: ejercicio('a2', 'Press inclinado'), sobre: 'Press banca' });
    const p = setBlockExerciseSetsIn(conPlan([o]), 'b1', 'Push', 'a', 6);

    expect(planOfDay(p, 1, 'Push').exercises[0].sets).toHaveLength(6);
    /* El microciclo 2 sigue con lo suyo: para eso es una excepción. */
    expect(planOfDay(p, 2, 'Push').exercises[0].name).toBe('Press inclinado');
  });
});

describe('el tramo de un cambio', () => {
  /* Cinco microciclos para que un tramo tenga dónde empezar y dónde acabar. */
  const cinco = (overrides = []) => ({
    weeklySplit: {},
    mobilityDrills: [],
    blocks: [
      {
        id: 'b1',
        name: 'Acumulación',
        fromWeek: 1,
        toWeek: null,
        sessions: [{ dayName: 'Push', exercises: [ejercicio('a', 'Press banca'), ejercicio('b', 'Fondos')] }],
        overrides,
      },
    ],
    microcycles: [1, 2, 3, 4, 5].map((weekNumber) => ({ weekNumber, days: [{ dayName: 'Push', exercises: [] }] })),
  });

  const cambio = (extra) =>
    buildOverride({
      dayName: 'Push',
      targetId: 'a',
      exercise: ejercicio('a2', 'Press inclinado'),
      sobre: 'Press banca',
      ...extra,
    });

  const nombresEn = (p, w) => planOfDay(p, w, 'Push').exercises.map((e) => e.name);

  it('«solo este microciclo» vale en uno y en ninguno más', () => {
    const p = cinco([cambio({ fromWeek: 3, toWeek: 3 })]);
    expect(nombresEn(p, 2)).toEqual(['Press banca', 'Fondos']);
    expect(nombresEn(p, 3)).toEqual(['Press inclinado', 'Fondos']);
    expect(nombresEn(p, 4)).toEqual(['Press banca', 'Fondos']);
  });

  it('«unas semanas» vale en su tramo y se acaba solo', () => {
    /* El caso que faltaba: probar un ejercicio tres microciclos. Antes había
       que escribirlo tres veces, una por microciclo. */
    const p = cinco([cambio({ fromWeek: 2, toWeek: 4 })]);
    expect(nombresEn(p, 1)).toEqual(['Press banca', 'Fondos']);
    for (const w of [2, 3, 4]) expect(nombresEn(p, w)).toEqual(['Press inclinado', 'Fondos']);
    expect(nombresEn(p, 5)).toEqual(['Press banca', 'Fondos']);
  });

  it('«de aquí en adelante» no toca lo anterior, y no se acaba', () => {
    const p = cinco([cambio({ fromWeek: 3, toWeek: null })]);
    expect(nombresEn(p, 2)).toEqual(['Press banca', 'Fondos']);
    for (const w of [3, 4, 5]) expect(nombresEn(p, w)).toEqual(['Press inclinado', 'Fondos']);
  });

  it('alargar la prueba no obliga a reescribir nada', () => {
    const o = cambio({ fromWeek: 3, toWeek: 3 });
    const p = setOverrideSpanIn(cinco([o]), 'b1', o.id, { toWeek: 5 });
    for (const w of [3, 4, 5]) expect(nombresEn(p, w)).toEqual(['Press inclinado', 'Fondos']);
  });

  it('y quitarle el fin lo deja «hasta que lo cambies»', () => {
    const o = cambio({ fromWeek: 2, toWeek: 3 });
    const p = setOverrideSpanIn(cinco([o]), 'b1', o.id, { toWeek: null });
    expect(nombresEn(p, 5)).toEqual(['Press inclinado', 'Fondos']);
  });

  it('dos cambios sobre el mismo ejercicio: manda el último que se hizo', () => {
    const viejo = cambio({ fromWeek: 1, toWeek: null, at: '2026-01-01T00:00:00.000Z' });
    const nuevo = buildOverride({
      dayName: 'Push',
      targetId: 'a',
      exercise: ejercicio('a3', 'Press declinado'),
      sobre: 'Press banca',
      fromWeek: 4,
      toWeek: null,
      at: '2026-02-01T00:00:00.000Z',
    });
    /* A propósito en el orden equivocado dentro del array: lo que ordena es
       `at`, no dónde se guardó. */
    const p = cinco([nuevo, viejo]);
    expect(nombresEn(p, 3)).toEqual(['Press inclinado', 'Fondos']);
    expect(nombresEn(p, 4)).toEqual(['Press declinado', 'Fondos']);
  });

  it('cómo se dice cada tramo', () => {
    expect(overrideSpan(cambio({ fromWeek: 3, toWeek: 3 }))).toBe('solo M3');
    expect(overrideSpan(cambio({ fromWeek: 2, toWeek: 4 }))).toBe('M2–M4');
    expect(overrideSpan(cambio({ fromWeek: 3, toWeek: null }))).toBe('desde M3');
  });

  it('ascender un cambio lo mete en la línea base, y entonces vale para todos', () => {
    const o = cambio({ fromWeek: 4, toWeek: 4 });
    const p = promoteOverrideIn(cinco([o]), 'b1', o.id);
    /* La línea base la ven TODOS sus microciclos, los anteriores incluidos: es
       la única puerta que toca el pasado, y por eso se pide a propósito. */
    for (const w of [1, 3, 5]) expect(nombresEn(p, w)).toEqual(['Press inclinado', 'Fondos']);
    expect(blockOverridesOf(blocksOf(p)[0])).toHaveLength(0);
  });

  it('un cambio de otra hoja no se cuela', () => {
    const p = cinco([buildOverride({ dayName: 'Pull', targetId: 'a', exercise: null, fromWeek: 1, toWeek: null })]);
    expect(nombresEn(p, 3)).toEqual(['Press banca', 'Fondos']);
  });
});
