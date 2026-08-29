import { describe, expect, it } from 'vitest';

import {
  blockOfWeek,
  blocksAfterInsertingWeek,
  blocksAfterRemovingWeek,
  blockChanges,
  blockPlannedVolume,
  blocksOf,
  currentBlock,
  openNextBlock,
  programAfterRemovingWeek,
  renameBlockIn,
  structureOfBlock,
  weekInBlock,
  weekLabel,
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
