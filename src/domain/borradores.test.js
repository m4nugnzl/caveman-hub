import { describe, expect, it } from 'vitest';

import { mapWorkoutFromDb, mapWorkoutToDb } from '@/lib/mappers';
import { blocksOf, currentBlock, openNextBlock } from './blocks';
import {
  anadirBorrador,
  borradoresDe,
  cambiarBorrador,
  datosParaEmpezar,
  devolverBorrador,
  diasDelBorrador,
  moverBorrador,
  quitarBorrador,
  referenciasSaneadas,
  sePuedeEmpezar,
  sinBorrador,
} from './borradores';
import { mismoPlan } from './deshacer';

/* ══════════════════════════════════════════════════════════════════════════
   LOS BLOQUES EN BORRADOR (0133): la previsión opcional detrás del abierto.
   Viven en `draftBlocks`, no en `blocks`; rellenarlos no los empieza, y
   empezar uno lo pasa a bloque con su id en una sola escritura.
   ══════════════════════════════════════════════════════════════════════════ */

const hoja = (dayName) => ({ dayName, exercises: [{ id: `e-${dayName}`, name: 'Press banca', sets: [] }] });

const programa = (draftBlocks) => ({
  weeklySplit: {},
  mobilityDrills: [],
  notes: '',
  microcycles: [
    { id: 'm1', weekNumber: 1, date: '2026-09-07', days: [], sessions: [] },
    { id: 'm2', weekNumber: 2, date: '2026-09-14', days: [], sessions: [] },
  ],
  blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null, sessions: [hoja('Torso')] }],
  ...(draftBlocks ? { draftBlocks } : {}),
});

const conDos = () => {
  const a = anadirBorrador(programa(), { name: 'Fuerza', plannedWeeks: 4, intent: 'intensificacion', sessions: [hoja('Pierna')] });
  const b = anadirBorrador(a.program, { plannedWeeks: 1, intent: 'descarga' });
  return { p: b.program, fuerza: a.borrador, descarga: b.borrador };
};

describe('el alta', () => {
  it('sin duración no se añade: un borrador tiene que caer en algún sitio', () => {
    const p = programa();
    expect(anadirBorrador(p, { name: 'Sin fecha' })).toEqual({ program: p, borrador: null });
    expect(anadirBorrador(p, { plannedWeeks: 0 }).borrador).toBeNull();
  });

  it('va al final, con un id de bloque, y sin guardar lo vacío', () => {
    const { p, fuerza, descarga } = conDos();
    expect(borradoresDe(p).map((b) => b.name)).toEqual(['Fuerza', 'Bloque 3']);
    expect(fuerza.id).toMatch(/^b_/);
    expect(descarga).toEqual({ id: descarga.id, name: 'Bloque 3', plannedWeeks: 1, intent: 'descarga' });
    /* Los bloques no se tocan: el abierto sigue siendo el último. */
    expect(blocksOf(p)).toEqual(programa().blocks);
    expect(currentBlock(p).id).toBe('b_1');
  });

  it('las referencias se guardan con nombre, sin repetir, y con su id si lo hay', () => {
    expect(
      referenciasSaneadas([
        { ejercicioId: 'x1', nombre: ' Sentadilla ' },
        { nombre: 'sentadilla' },
        { nombre: '' },
        { ejercicioId: 7, nombre: 'Press banca' },
      ])
    ).toEqual([{ ejercicioId: 'x1', nombre: 'Sentadilla' }, { nombre: 'Press banca' }]);
  });
});

describe('rellenar y cambiar', () => {
  it('rellenar no lo empieza: cambian sus hojas y sigue siendo borrador', () => {
    const { p, descarga } = conDos();
    const q = cambiarBorrador(p, descarga.id, { sessions: [hoja('Full body')], microciclo: { tipo: 'rotativo', dias: [{ hoja: 'Full body' }, { descanso: true }] } });
    expect(borradoresDe(q)[1].sessions.map((s) => s.dayName)).toEqual(['Full body']);
    expect(borradoresDe(q)[1].microciclo.tipo).toBe('rotativo');
    expect(blocksOf(q)).toHaveLength(1);
  });

  it('una duración que no vale no se aplica; quitar la intención sí', () => {
    const { p, fuerza } = conDos();
    const q = cambiarBorrador(p, fuerza.id, { plannedWeeks: 'mucho', intent: null });
    expect(borradoresDe(q)[0].plannedWeeks).toBe(4);
    expect(borradoresDe(q)[0]).not.toHaveProperty('intent');
  });

  it('sin cambio, o sin ese borrador, el mismo programa', () => {
    const { p, fuerza } = conDos();
    expect(cambiarBorrador(p, fuerza.id, { name: 'Fuerza' })).toBe(p);
    expect(cambiarBorrador(p, 'b_otro', { name: 'X' })).toBe(p);
  });
});

describe('quitar, devolver y mover', () => {
  it('quitar dice dónde estaba, y devolver lo pone en su sitio', () => {
    const { p, fuerza } = conDos();
    const { program, quitado, posicion } = quitarBorrador(p, fuerza.id);
    expect(posicion).toBe(0);
    expect(borradoresDe(program).map((b) => b.name)).toEqual(['Bloque 3']);
    expect(borradoresDe(devolverBorrador(program, quitado, posicion)).map((b) => b.name)).toEqual(['Fuerza', 'Bloque 3']);
    /* Devolver dos veces no lo duplica. */
    const devuelto = devolverBorrador(program, quitado, posicion);
    expect(devolverBorrador(devuelto, quitado, posicion)).toBe(devuelto);
  });

  it('quitar el último deja la lista vacía, y eso SÍ se guarda', () => {
    const uno = anadirBorrador(programa(), { plannedWeeks: 2 });
    const vacio = quitarBorrador(uno.program, uno.borrador.id).program;
    expect(vacio.draftBlocks).toEqual([]);
    expect(mapWorkoutToDb('c1', vacio).draft_blocks).toEqual([]);
  });

  it('mover cambia el orden en el tiempo', () => {
    const { p, descarga } = conDos();
    expect(borradoresDe(moverBorrador(p, descarga.id, 0)).map((b) => b.name)).toEqual(['Bloque 3', 'Fuerza']);
    expect(moverBorrador(p, descarga.id, 1)).toBe(p);
  });
});

describe('empezar', () => {
  it('solo el primero, con hojas y con un programa que cerrar', () => {
    const { p, fuerza, descarga } = conDos();
    expect(sePuedeEmpezar(p, fuerza.id)).toBe(true);
    expect(sePuedeEmpezar(p, descarga.id)).toBe(false);
    const sinHojas = anadirBorrador(programa(), { plannedWeeks: 3 });
    expect(sePuedeEmpezar(sinHojas.program, sinHojas.borrador.id)).toBe(false);
  });

  it('el bloque que nace conserva el id, y el borrador sale en el mismo paso', () => {
    const { p, fuerza } = conDos();
    const datos = datosParaEmpezar(fuerza);
    const { program, block } = openNextBlock(p, { name: datos.name, id: datos.id });
    const despues = sinBorrador(program, datos.id);
    expect(block.id).toBe(fuerza.id);
    expect(currentBlock(despues)).toMatchObject({ id: fuerza.id, name: 'Fuerza', fromWeek: 3, toWeek: null });
    expect(blocksOf(despues)[0].toWeek).toBe(2);
    expect(borradoresDe(despues).map((b) => b.name)).toEqual(['Bloque 3']);
    expect(datos).toMatchObject({ plannedWeeks: 4, intent: 'intensificacion' });
    expect(datos.sessions.map((s) => s.dayName)).toEqual(['Pierna']);
  });

  it('un id que ya lleva otro bloque no se repite', () => {
    expect(openNextBlock(programa(), { id: 'b_1' }).block.id).not.toBe('b_1');
  });
});

describe('lo que dura', () => {
  it('semanal, o sin secuencia todavía: 7 días por microciclo', () => {
    expect(diasDelBorrador({ plannedWeeks: 4 })).toBe(28);
    expect(diasDelBorrador({ plannedWeeks: 2, microciclo: { tipo: 'semanal', dias: [] } })).toBe(14);
  });

  it('rotativo: lo que mide su cadena, por cada microciclo', () => {
    const diez = { tipo: 'rotativo', dias: [{ hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'A' }, { hoja: 'B' }, { hoja: 'C' }, { descanso: true }] };
    expect(diasDelBorrador({ plannedWeeks: 3, microciclo: diez })).toBe(30);
  });
});

describe('la frontera con la base', () => {
  it('sin la columna (antes de la 0133) el programa no lleva la clave y no se manda', () => {
    const leido = mapWorkoutFromDb({ microcycles: [], blocks: [] });
    expect(leido).not.toHaveProperty('draftBlocks');
    expect(mapWorkoutToDb('c1', leido)).not.toHaveProperty('draft_blocks');
  });

  it('con la columna, ida y vuelta', () => {
    const { p } = conDos();
    const fila = mapWorkoutToDb('c1', p);
    expect(mapWorkoutFromDb(fila).draftBlocks).toEqual(p.draftBlocks);
  });
});

describe('deshacer', () => {
  it('un cambio en un borrador es un cambio del plan: se puede deshacer', () => {
    const { p, fuerza } = conDos();
    expect(mismoPlan(p, cambiarBorrador(p, fuerza.id, { plannedWeeks: 6 }))).toBe(false);
    expect(mismoPlan(p, { ...p })).toBe(true);
  });
});
