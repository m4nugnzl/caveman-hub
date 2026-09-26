import { describe, expect, it } from 'vitest';

import { generarSecuencia } from './training';
import { nombreCortoDelSplit, nombreDelSplit, tipoDeHoja } from './split';

/* Una hoja con series: `{ Pecho: 6, Tríceps: 4 }`. */
const hoja = (dayName, reparto = {}) => ({
  dayName,
  exercises: Object.entries(reparto).map(([muscle, n]) => ({ muscle, sets: Array.from({ length: n }, () => ({})) })),
});

const semanal = (...dias) => ({ tipo: 'semanal', dias: dias.map((h) => (h ? { hoja: h } : { descanso: true })) });
const rotativo = (cadena, nombres) => ({ tipo: 'rotativo', dias: generarSecuencia(cadena, nombres) });

describe('nombreDelSplit', () => {
  it('Torso / Pierna, cuatro días a la semana', () => {
    const hojas = [hoja('Torso A'), hoja('Pierna A'), hoja('Torso B'), hoja('Pierna B')];
    const bloque = { microciclo: semanal('Torso A', 'Pierna A', null, 'Torso B', 'Pierna B', null, null) };
    expect(nombreDelSplit(bloque, hojas)).toBe('Torso / Pierna · 4 días');
    expect(nombreCortoDelSplit(bloque, hojas)).toBe('T/P · 4d');
  });

  it('Push Pull Legs rotativo 2-1', () => {
    const nombres = ['Push', 'Pull', 'Legs'];
    const bloque = { microciclo: rotativo('2-1', nombres) };
    expect(nombreDelSplit(bloque, nombres.map((n) => hoja(n)))).toBe('Push Pull Legs 2-1');
    expect(nombreCortoDelSplit(bloque, nombres.map((n) => hoja(n)))).toBe('PPL 2-1');
  });

  it('Torso / Pierna rotativo 3-1, con los nombres en inglés', () => {
    const nombres = ['Upper', 'Lower'];
    /* U L U · L U L ·: dos tandas iguales. */
    const bloque = { microciclo: rotativo('3-1 3-1', nombres) };
    expect(nombreDelSplit(bloque, nombres.map((n) => hoja(n)))).toBe('Torso / Pierna 3-1');
    /* Y la tanda que el generador deja corta al final no cambia el ritmo. */
    const cuatro = ['Upper A', 'Lower A', 'Upper B', 'Lower B'];
    expect(nombreDelSplit({ microciclo: rotativo('3-1', cuatro) }, cuatro.map((n) => hoja(n)))).toBe('Torso / Pierna 3-1');
  });

  it('un rotativo de tandas distintas cuenta sus días, no deletrea la cadena', () => {
    const nombres = ['Push', 'Pull', 'Pierna'];
    const bloque = { microciclo: rotativo('2-1 2-1 3-1', nombres) };
    expect(nombreDelSplit(bloque, nombres.map((n) => hoja(n)))).toBe('Push Pull Legs · 7 de cada 10 días');
    expect(nombreCortoDelSplit(bloque, nombres.map((n) => hoja(n)))).toBe('PPL · 7/10d');
  });

  it('los bloques de Lucía: Torso / Pierna con un Full de más, limpio y sin cadena', () => {
    /* Tal cual están guardados (b1…b7 semanales, b8 rotativo «2-1 2-1 3-1»). */
    const hojas = [hoja('Torso'), hoja('Pierna'), hoja('Full')];
    const b1 = { microciclo: semanal('Torso', 'Pierna', null, 'Torso', 'Pierna', 'Full', null) };
    const b8 = {
      microciclo: {
        tipo: 'rotativo',
        dias: ['Torso', 'Pierna', null, 'Torso', 'Pierna', null, 'Full', 'Torso', 'Pierna', null].map((h) => (h ? { hoja: h } : { descanso: true })),
      },
    };
    expect(nombreDelSplit(b1, hojas)).toBe('Torso / Pierna + Full body · 5 días');
    expect(nombreDelSplit(b8, hojas)).toBe('Torso / Pierna + Full body · 7 de cada 10 días');
    expect(nombreCortoDelSplit(b1, hojas)).toBe('T/P · 5d');
    expect(nombreCortoDelSplit(b8, hojas)).toBe('T/P · 7/10d');
    /* Ninguna palabra sale dos veces. */
    for (const n of [nombreDelSplit(b1, hojas), nombreDelSplit(b8, hojas)]) {
      const palabras = n.split(/[\s/+·]+/).filter((p) => /\p{L}/u.test(p));
      expect(new Set(palabras).size).toBe(palabras.length);
    }
  });

  it('Torso / Brazo / Pierna, en orden de aparición', () => {
    const hojas = [hoja('Torso'), hoja('Brazos'), hoja('Pierna')];
    const bloque = { microciclo: semanal('Torso', 'Brazos', null, 'Pierna', null, null, null) };
    expect(nombreDelSplit(bloque, hojas)).toBe('Torso / Brazo / Pierna · 3 días');
  });

  it('Full body', () => {
    const hojas = [hoja('Full body A'), hoja('Fullbody B'), hoja('Cuerpo completo C')];
    const bloque = { microciclo: semanal('Full body A', null, 'Fullbody B', null, 'Cuerpo completo C', null, null) };
    expect(nombreDelSplit(bloque, hojas)).toBe('Full body · 3 días');
  });

  it('PPL mezclado con Torso / Pierna', () => {
    const hojas = [hoja('Push'), hoja('Pull'), hoja('Pierna A'), hoja('Torso'), hoja('Pierna B')];
    const bloque = { microciclo: semanal('Push', 'Pull', 'Pierna A', null, 'Torso', 'Pierna B', null) };
    expect(nombreDelSplit(bloque, hojas)).toBe('PPL + Torso / Pierna · 5 días');
  });

  it('hojas «Día 1…3» se clasifican por sus músculos', () => {
    const hojas = [
      hoja('Día 1', { Pecho: 8, 'Deltoides Lateral': 4, Tríceps: 4 }),
      hoja('Día 2', { Dorsal: 8, 'Espalda Alta': 4, Bíceps: 4 }),
      hoja('Día 3', { Cuádriceps: 8, Isquiotibiales: 6, Gemelo: 4, Abdominales: 4 }),
    ];
    const bloque = { microciclo: semanal('Día 1', null, 'Día 2', null, 'Día 3', null, null) };
    expect(hojas.map(tipoDeHoja)).toEqual(['Push', 'Pull', 'Pierna']);
    expect(nombreDelSplit(bloque, hojas)).toBe('Push Pull Legs · 3 días');
  });

  it('por músculos: torso, full body y brazo', () => {
    expect(tipoDeHoja(hoja('A', { Pecho: 6, Dorsal: 6, 'Deltoides Lateral': 2 }))).toBe('Torso');
    expect(tipoDeHoja(hoja('B', { Cuádriceps: 6, Pecho: 4, Dorsal: 4 }))).toBe('Full body');
    /* Más tríceps que bíceps y aun así es de brazo, no de empuje. */
    expect(tipoDeHoja(hoja('C', { Tríceps: 8, Bíceps: 4, 'Deltoides Lateral': 2 }))).toBe('Brazo');
  });

  it('el nombre manda sobre los músculos', () => {
    expect(tipoDeHoja(hoja('Pierna', { Pecho: 10 }))).toBe('Pierna');
  });

  it('sin hojas o sin series, solo los días', () => {
    const bloque = { microciclo: semanal('Día 1', null, 'Día 2', null, null, null, null) };
    expect(nombreDelSplit(bloque, [hoja('Día 1'), hoja('Día 2')])).toBe('2 días');
    expect(nombreDelSplit({ microciclo: rotativo('2-1', []) }, [])).toBe('2 días');
    expect(nombreDelSplit({ microciclo: semanal(null, null, null, null, null, null, null) }, [])).toBeNull();
  });

  it('el nombre del entrenador manda', () => {
    const hojas = [hoja('Torso'), hoja('Brazo'), hoja('Pierna')];
    const bloque = {
      split: 'Torso / Brazo density',
      microciclo: semanal('Torso', 'Brazo', null, 'Pierna', null, null, null),
    };
    expect(nombreDelSplit(bloque, hojas)).toBe('Torso / Brazo density');
    expect(nombreCortoDelSplit(bloque, hojas)).toBe('Torso / Brazo density');
  });

  it('acepta el microciclo aparte, para los bloques que no lo guardan', () => {
    const hojas = [hoja('Torso A'), hoja('Pierna A')];
    expect(nombreDelSplit({}, hojas, semanal('Torso A', null, 'Pierna A', null, null, null, null))).toBe(
      'Torso / Pierna · 2 días'
    );
  });
});
