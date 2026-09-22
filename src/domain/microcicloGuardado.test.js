import { describe, expect, it } from 'vitest';

import { migrateBlockPlans } from './blocksMigration';
import {
  addBlockSessionIn,
  blocksOf,
  conCicloDelCliente,
  conRepartoDelAbierto,
  cadenaQueLaGenera,
  materializarMicrociclos,
  microcicloDelBloque,
  moveBlockSessionIn,
  openNextBlock,
  ponerDiaSemanal,
  proyectarPlanEnDias,
  removeBlockSessionFrom,
  renameBlockSessionIn,
  seguirALasHojas,
} from './blocks';

/* ══════════════════════════════════════════════════════════════════════════
   F2b DEL MICROCICLO COMO SECUENCIA: la secuencia se GUARDA al escribir.

   La prueba que manda es la de equivalencia: la misma escritura, hecha como
   antes (derivando en cada lectura) y como ahora (guardando), se lee igual en
   todos los bloques. Ver `docs/estudio-microciclo-secuencia.md` §7.
   ══════════════════════════════════════════════════════════════════════════ */

const SEMANAL = { cycleType: 'weekly', cyclePattern: { train: 2, rest: 1 } };
const ROTATIVO = { cycleType: 'rotating', cyclePattern: { train: 2, rest: 1 } };

const hoja = (dayName) => ({ dayName, exercises: [{ id: `e-${dayName}`, name: 'Press', sets: [{ kg: '', reps: '8', rir: '' }] }] });

const programa = (hojas, weeklySplit = {}) => ({
  weeklySplit,
  mobilityDrills: [],
  microcycles: [{ id: 'm1', weekNumber: 1, date: '2026-09-14', days: hojas.map(hoja), sessions: [] }],
  blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null, sessions: hojas.map(hoja) }],
});

/** Lo de antes: `applyPlan` sin guardar la secuencia. */
const comoAntes = (program, updater) => proyectarPlanEnDias(updater(migrateBlockPlans(program).program));

/** Lo de ahora: `applyPlan` y la copia de `applyWorkout`. */
const comoAhora = (client) => (program, updater) => {
  const antes = materializarMicrociclos(migrateBlockPlans(program).program, client);
  return conRepartoDelAbierto(proyectarPlanEnDias(seguirALasHojas(antes, updater(antes), client)));
};

const lectura = (program, client) => ({
  bloques: blocksOf(program).map((b) => microcicloDelBloque(program, b, client)),
  reparto: program.weeklySplit,
});

/** Cada paso por los dos caminos; después de cada uno se leen igual. */
const recorrer = (inicio, client, pasos) => {
  let viejo = inicio;
  let nuevo = inicio;
  const ahora = comoAhora(client);
  for (const paso of pasos) {
    viejo = comoAntes(viejo, paso);
    nuevo = ahora(nuevo, paso);
    expect(lectura(nuevo, client).bloques).toEqual(lectura(viejo, client).bloques);
    expect(blocksOf(nuevo).every((b) => b.microciclo)).toBe(true);
  }
  return nuevo;
};

const abrirBloque = (weeklySplit, hojas) => (p) => {
  const { program, block } = openNextBlock(
    { ...p, microcycles: [...p.microcycles, { ...p.microcycles[0], id: 'm2', weekNumber: 2, date: '2026-09-21' }] },
    {}
  );
  return {
    ...program,
    ...(weeklySplit ? { weeklySplit } : {}),
    blocks: program.blocks.map((b) => (b.id === block.id ? { ...b, sessions: hojas.map(hoja) } : b)),
  };
};

describe('guardada, se lee igual que derivada', () => {
  it('rotativo: añadir, quitar, renombrar y mover hojas regeneran la secuencia', () => {
    const final = recorrer(programa(['A', 'B', 'C']), ROTATIVO, [
      (p) => addBlockSessionIn(p, 'b_1', 'D'),
      (p) => removeBlockSessionFrom(p, 'b_1', 'B'),
      (p) => renameBlockSessionIn(p, 'b_1', 'C', 'Pierna'),
      (p) => moveBlockSessionIn(p, 'b_1', 0, 2),
    ]);
    expect(blocksOf(final)[0].microciclo).toEqual({
      tipo: 'rotativo',
      dias: [{ hoja: 'Pierna' }, { hoja: 'D' }, { descanso: true }, { hoja: 'A' }, { descanso: true }],
    });
  });

  it('rotativo: el bloque que abre el Compositor guarda la suya, y el cerrado no se mueve', () => {
    const final = recorrer(programa(['A', 'B', 'C']), ROTATIVO, [abrirBloque(null, ['X', 'Y'])]);
    expect(blocksOf(final).map((b) => b.microciclo.dias.length)).toEqual([5, 3]);
  });

  it('semanal: las hojas no mueven los días; el reparto del Compositor, sí', () => {
    const split = { Lunes: 'A', Martes: 'Descanso', Miércoles: 'B', Jueves: '', Viernes: 'C', Sábado: 'Descanso', Domingo: 'Descanso' };
    const final = recorrer(programa(['A', 'B', 'C'], split), SEMANAL, [
      (p) => addBlockSessionIn(p, 'b_1', 'D'),
      (p) => renameBlockSessionIn(p, 'b_1', 'A', 'Torso'),
      abrirBloque({ ...split, Martes: 'Pull' }, ['Push', 'Pull']),
    ]);
    const [cerrado, abierto] = blocksOf(final);
    expect(cerrado.microciclo.dias[1]).toEqual({ descanso: true });
    expect(abierto.microciclo.dias[1]).toEqual({ hoja: 'Pull' });
    expect(final.weeklySplit.Martes).toBe('Pull');
  });

  it('rotativo sin hojas: la forma del ciclo, y en cuanto llega una hoja, la hoja', () => {
    recorrer({ ...programa([]), blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null }] }, ROTATIVO, [
      (p) => addBlockSessionIn(p, 'b_1', 'A'),
    ]);
  });
});

describe('seguirALasHojas', () => {
  it('una secuencia retocada no se regenera', () => {
    /* Fuera del orden de las hojas: ninguna cadena la da. */
    const retocada = { tipo: 'rotativo', dias: [{ hoja: 'B' }, { descanso: true }, { hoja: 'A' }, { hoja: 'C' }, { descanso: true }] };
    const p = { ...programa(['A', 'B', 'C']), blocks: [{ ...programa(['A', 'B', 'C']).blocks[0], microciclo: retocada }] };
    expect(cadenaQueLaGenera(retocada, ['A', 'B', 'C'], ROTATIVO)).toBeNull();
    const despues = seguirALasHojas(p, addBlockSessionIn(p, 'b_1', 'D'), ROTATIVO);
    expect(blocksOf(despues)[0].microciclo).toBe(retocada);
  });

  it('una secuencia que la propia escritura ha cambiado se queda como la ha dejado', () => {
    const p = materializarMicrociclos(programa(['A', 'B']), ROTATIVO);
    const escrita = { tipo: 'rotativo', dias: [{ hoja: 'B' }, { hoja: 'A' }, { hoja: 'C' }, { descanso: true }] };
    const despues = seguirALasHojas(p, {
      ...addBlockSessionIn(p, 'b_1', 'C'),
      blocks: blocksOf(addBlockSessionIn(p, 'b_1', 'C')).map((b) => ({ ...b, microciclo: escrita })),
    }, ROTATIVO);
    expect(blocksOf(despues)[0].microciclo).toBe(escrita);
  });

  it('sin cambios devuelve el mismo programa', () => {
    const p = materializarMicrociclos(programa(['A', 'B']), ROTATIVO);
    expect(seguirALasHojas(p, p, ROTATIVO)).toBe(p);
  });
});

describe('«Cae el …» y la copia de weekly_split', () => {
  const SPLIT = { Lunes: 'A', Martes: '', Miércoles: 'B', Jueves: 'Descanso', Viernes: 'A', Sábado: 'Descanso', Domingo: 'Descanso' };

  it('el día se escribe en la secuencia y el reparto la copia', () => {
    const p = materializarMicrociclos(programa(['A', 'B'], SPLIT), SEMANAL);
    const q = conRepartoDelAbierto(ponerDiaSemanal(p, 'Jueves', 'B'));
    expect(blocksOf(q)[0].microciclo.dias[3]).toEqual({ hoja: 'B' });
    expect(q.weeklySplit).toEqual({ ...SPLIT, Jueves: 'B' });
    /* El «» del martes se queda: ya decía descanso. */
    expect(q.weeklySplit.Martes).toBe('');
  });

  it('si el reparto ya dice lo mismo, no se toca', () => {
    const p = materializarMicrociclos(programa(['A', 'B'], SPLIT), SEMANAL);
    expect(conRepartoDelAbierto(p)).toBe(p);
    expect(conRepartoDelAbierto(materializarMicrociclos(programa(['A']), SEMANAL))).toEqual(
      materializarMicrociclos(programa(['A']), SEMANAL)
    );
  });

  it('en un rotativo no hay día que poner, y el reparto no se copia', () => {
    const p = materializarMicrociclos(programa(['A', 'B'], SPLIT), ROTATIVO);
    expect(ponerDiaSemanal(p, 'Jueves', 'B')).toBeNull();
    expect(conRepartoDelAbierto(p)).toBe(p);
  });
});

describe('el ciclo de la ficha cambia el bloque abierto', () => {
  it('semanal → rotativo: el abierto se lee como se derivaría; el cerrado se queda', () => {
    const base = abrirBloque(null, ['X', 'Y', 'Z'])(programa(['A', 'B'], { Lunes: 'A', Jueves: 'B' }));
    const p = materializarMicrociclos(base, SEMANAL);
    const q = conCicloDelCliente(p, ROTATIVO);
    const [cerrado, abierto] = blocksOf(q);
    expect(cerrado.microciclo).toBe(blocksOf(p)[0].microciclo);
    expect(abierto.microciclo).toEqual(microcicloDelBloque(base, blocksOf(base)[1], ROTATIVO));
  });

  it('otro patrón: 2-1 → 3-1', () => {
    const p = materializarMicrociclos(programa(['A', 'B', 'C']), ROTATIVO);
    const q = conCicloDelCliente(p, { ...ROTATIVO, cyclePattern: { train: 3, rest: 1 } });
    expect(blocksOf(q)[0].microciclo.dias).toHaveLength(4);
    expect(conCicloDelCliente(q, { ...ROTATIVO, cyclePattern: { train: 3, rest: 1 } })).toBe(q);
  });
});
