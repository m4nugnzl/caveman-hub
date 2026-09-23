import { describe, expect, it } from 'vitest';

import { migrateBlockPlans } from './blocksMigration';
import {
  addBlockSessionIn,
  blocksOf,
  conRepartoDelAbierto,
  materializarMicrociclos,
  microcicloDelBloque,
  moveBlockSessionIn,
  openNextBlock,
  ponerMicrociclo,
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

  it('semanal: añadir una hoja no mueve los días; el reparto del Compositor, sí', () => {
    const split = { Lunes: 'A', Martes: 'Descanso', Miércoles: 'B', Jueves: '', Viernes: 'C', Sábado: 'Descanso', Domingo: 'Descanso' };
    const final = recorrer(programa(['A', 'B', 'C'], split), SEMANAL, [
      (p) => addBlockSessionIn(p, 'b_1', 'D'),
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

describe('la tira escribe la secuencia y weekly_split la copia', () => {
  const SPLIT = { Lunes: 'A', Martes: '', Miércoles: 'B', Jueves: 'Descanso', Viernes: 'A', Sábado: 'Descanso', Domingo: 'Descanso' };
  const semanalCon = (p, cambio) => {
    const dias = blocksOf(p)[0].microciclo.dias.map((d, i) => (i in cambio ? cambio[i] : d));
    return ponerMicrociclo(p, 'b_1', { tipo: 'semanal', dias });
  };

  it('el día se escribe en la secuencia y el reparto la copia', () => {
    const p = materializarMicrociclos(programa(['A', 'B'], SPLIT), SEMANAL);
    const q = conRepartoDelAbierto(semanalCon(p, { 3: { hoja: 'B' } }));
    expect(blocksOf(q)[0].microciclo.dias[3]).toEqual({ hoja: 'B' });
    expect(q.weeklySplit).toEqual({ ...SPLIT, Jueves: 'B' });
    /* El «» del martes se queda: ya decía descanso. */
    expect(q.weeklySplit.Martes).toBe('');
  });

  it('si no cambia nada, el mismo programa', () => {
    const p = materializarMicrociclos(programa(['A', 'B'], SPLIT), SEMANAL);
    expect(semanalCon(p, {})).toBe(p);
    expect(conRepartoDelAbierto(p)).toBe(p);
    expect(ponerMicrociclo(p, 'b_1', { tipo: 'raro', dias: [] })).toBe(p);
  });

  it('en un rotativo el reparto no se copia', () => {
    const p = materializarMicrociclos(programa(['A', 'B'], SPLIT), ROTATIVO);
    expect(conRepartoDelAbierto(p)).toBe(p);
  });
});

describe('la secuencia sigue al plan (§5)', () => {
  const SPLIT = { Lunes: 'A', Martes: 'B', Miércoles: 'Descanso', Jueves: 'C', Viernes: 'A', Sábado: 'Descanso', Domingo: 'Descanso' };
  const escribir = (client) => (program, updater) => {
    const antes = materializarMicrociclos(migrateBlockPlans(program).program, client);
    return conRepartoDelAbierto(proyectarPlanEnDias(seguirALasHojas(antes, updater(antes), client)));
  };

  it('semanal: renombrar cambia el nombre en sus días; quitar deja descanso', () => {
    const w = escribir(SEMANAL);
    const renombrado = w(programa(['A', 'B', 'C'], SPLIT), (p) => renameBlockSessionIn(p, 'b_1', 'A', 'Torso'));
    expect(renombrado.weeklySplit).toMatchObject({ Lunes: 'Torso', Viernes: 'Torso' });
    const quitado = w(renombrado, (p) => removeBlockSessionFrom(p, 'b_1', 'B'));
    expect(blocksOf(quitado)[0].microciclo.dias[1]).toEqual({ descanso: true });
    expect(quitado.weeklySplit.Martes).toBe('Descanso');
  });

  it('semanal: una hoja nueva no entra en ningún día', () => {
    const q = escribir(SEMANAL)(programa(['A', 'B', 'C'], SPLIT), (p) => addBlockSessionIn(p, 'b_1', 'D'));
    expect(blocksOf(q)[0].microciclo.dias.some((d) => d.hoja === 'D')).toBe(false);
  });

  it('rotativo retocado: quitar deja descanso y la longitud no cambia', () => {
    const retocada = { tipo: 'rotativo', dias: [{ hoja: 'B' }, { descanso: true }, { hoja: 'A' }, { hoja: 'C' }, { descanso: true }] };
    const p = { ...programa(['A', 'B', 'C']), blocks: [{ ...programa(['A', 'B', 'C']).blocks[0], microciclo: retocada }] };
    const q = escribir(ROTATIVO)(p, (x) => removeBlockSessionFrom(x, 'b_1', 'A'));
    expect(blocksOf(q)[0].microciclo.dias).toEqual([{ hoja: 'B' }, { descanso: true }, { descanso: true }, { hoja: 'C' }, { descanso: true }]);
  });

  it('rotativo de varias tandas, sin retocar: se regenera con las hojas nuevas', () => {
    const cadena = [{ hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'C' }, { descanso: true }, { hoja: 'A' }, { hoja: 'B' }, { hoja: 'C' }, { descanso: true }];
    const p = { ...programa(['A', 'B', 'C']), blocks: [{ ...programa(['A', 'B', 'C']).blocks[0], microciclo: { tipo: 'rotativo', dias: cadena } }] };
    const q = escribir(ROTATIVO)(p, (x) => moveBlockSessionIn(x, 'b_1', 0, 2));
    expect(blocksOf(q)[0].microciclo.dias.filter((d) => d.hoja).map((d) => d.hoja)).toEqual(['B', 'C', 'A', 'B', 'C', 'A']);
  });
});
