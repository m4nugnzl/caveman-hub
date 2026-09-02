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
