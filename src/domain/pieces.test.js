import { describe, expect, it } from 'vitest';

import { buildPiece, freeSheetName, pieceSummary, piecesOf } from './pieces';

const dia = {
  name: 'Pierna · básicos',
  exercises: [
    {
      id: 'ex_1',
      name: 'Sentadilla',
      muscle: 'Cuádriceps',
      bajada: true,
      restSeconds: 120,
      sets: [
        { kg: '100', reps: '8', rir: '2', targetReps: '6-8', targetRir: '2' },
        { kg: '100', reps: '7', rir: '1', targetReps: '6-8', targetRir: '2' },
      ],
    },
  ],
};

describe('buildPiece', () => {
  it('guarda el programa y nunca el registro', () => {
    const pieza = buildPiece(dia);
    expect(pieza.name).toBe('Pierna · básicos');
    expect(pieza.exercises).toHaveLength(1);
    const ex = pieza.exercises[0];
    expect(ex.id).not.toBe('ex_1');
    expect(ex.sets.map((s) => s.targetReps)).toEqual(['6-8', '6-8']);
    expect(ex.sets.every((s) => s.kg === '' && s.reps === '')).toBe(true);
    // La gramática viaja: es plan. La forma vieja (`bajada: true`) se copia ya
    // como técnica, que es como se escribe ahora.
    expect(ex.tecnica).toBe('bajada');
    expect(ex.restSeconds).toBe(120);
  });
});

describe('piecesOf', () => {
  it('lee la sección y tira lo roto', () => {
    const buenas = buildPiece(dia);
    const prefs = { piezas: { items: [buenas, null, { id: 'pz_x' }, { name: 'sin id', exercises: [] }] } };
    expect(piecesOf(prefs)).toEqual([buenas]);
  });

  it('sin sección, lista vacía', () => {
    expect(piecesOf({})).toEqual([]);
    expect(piecesOf(null)).toEqual([]);
  });
});

describe('pieceSummary', () => {
  it('cuenta ejercicios y series', () => {
    expect(pieceSummary(buildPiece(dia))).toBe('1 ejercicio · 2 series');
  });
});

describe('freeSheetName', () => {
  it('respeta el nombre libre y numera el ocupado', () => {
    expect(freeSheetName('Pierna', ['Push', 'Pull'])).toBe('Pierna');
    expect(freeSheetName('Pierna', ['Pierna'])).toBe('Pierna 2');
    expect(freeSheetName('Pierna', ['Pierna', 'Pierna 2'])).toBe('Pierna 3');
  });
});
