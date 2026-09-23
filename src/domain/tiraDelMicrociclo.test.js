import { describe, expect, it } from 'vitest';

import {
  anadirDiaDespues,
  arrastrarDia,
  cadenaDe,
  cambiarTipo,
  conTandas,
  diasDeLaHoja,
  hojasSinDia,
  ponerDia,
  quitarDia,
  renombrarEnMicrociclo,
  seguirAlPlan,
} from './training';

/* Los gestos de la tira del microciclo (`EditorDelMicrociclo`), uno a uno. */

const d = (hoja) => (hoja ? { hoja } : { descanso: true });
const semanal = (...h) => ({ tipo: 'semanal', dias: h.map(d) });
const rotativo = (...h) => ({ tipo: 'rotativo', dias: h.map(d) });
const hojas = (mc) => mc.dias.map((x) => x.hoja || '·');

describe('poner una hoja o descanso en un día', () => {
  it('cambia solo ese día', () => {
    const mc = semanal('A', null, 'B', null, null, null, null);
    expect(hojas(ponerDia(mc, 1, 'C'))).toEqual(['A', 'C', 'B', '·', '·', '·', '·']);
    expect(hojas(ponerDia(mc, 0, null))).toEqual(['·', '·', 'B', '·', '·', '·', '·']);
  });

  it('lo mismo que ya había no es un cambio', () => {
    const mc = semanal('A', null, 'B', null, null, null, null);
    expect(ponerDia(mc, 0, 'A')).toBe(mc);
    expect(ponerDia(mc, 1, null)).toBe(mc);
    expect(ponerDia(mc, 9, 'A')).toBe(mc);
  });

  it('una hoja puede caer dos días', () => {
    const mc = ponerDia(semanal('A', null, 'B', null, null, null, null), 3, 'A');
    expect(diasDeLaHoja(mc, 'A')).toEqual([0, 3]);
  });
});

describe('arrastrar', () => {
  it('semanal: intercambia los dos días y no corre los de en medio', () => {
    const mc = semanal('A', 'B', null, 'C', null, null, null);
    expect(hojas(arrastrarDia(mc, 1, 3))).toEqual(['A', 'C', '·', 'B', '·', '·', '·']);
  });

  it('rotativo: mueve el día y corre los de en medio', () => {
    const mc = rotativo('A', 'B', null, 'C', null);
    expect(hojas(arrastrarDia(mc, 0, 3))).toEqual(['B', '·', 'C', 'A', '·']);
    expect(arrastrarDia(mc, 2, 2)).toBe(mc);
  });
});

describe('días de más y de menos (solo rotativo)', () => {
  it('añadir un día después es un descanso ahí', () => {
    const mc = rotativo('A', 'B', null);
    expect(hojas(anadirDiaDespues(mc, 0))).toEqual(['A', '·', 'B', '·']);
    expect(hojas(anadirDiaDespues(mc, 2))).toEqual(['A', 'B', '·', '·']);
  });

  it('quitar un día; el último que queda no se quita', () => {
    expect(hojas(quitarDia(rotativo('A', 'B', null), 1))).toEqual(['A', '·']);
    const uno = rotativo('A');
    expect(quitarDia(uno, 0)).toBe(uno);
  });

  it('el semanal no crece ni mengua', () => {
    const mc = semanal('A', null, null, null, null, null, null);
    expect(anadirDiaDespues(mc, 0)).toBe(mc);
    expect(quitarDia(mc, 0)).toBe(mc);
  });
});

describe('cambiar de tipo', () => {
  it('semanal → rotativo: los mismos siete días', () => {
    const { microciclo, quitados } = cambiarTipo(semanal('A', 'B', null, 'C', null, null, null), 'rotativo');
    expect(microciclo.tipo).toBe('rotativo');
    expect(hojas(microciclo)).toEqual(['A', 'B', '·', 'C', '·', '·', '·']);
    expect(quitados).toBe(0);
  });

  it('rotativo → semanal: los siete primeros, y dice cuántos se caen', () => {
    const diez = rotativo('A', 'B', null, 'C', 'D', null, 'A', 'B', 'C', null);
    const { microciclo, quitados } = cambiarTipo(diez, 'semanal');
    expect(hojas(microciclo)).toEqual(['A', 'B', '·', 'C', 'D', '·', 'A']);
    expect(quitados).toBe(3);
    expect(hojas(cambiarTipo(rotativo('A', null), 'semanal').microciclo)).toEqual(['A', '·', '·', '·', '·', '·', '·']);
  });
});

describe('las tandas', () => {
  it('«2-1 2-1 3-1» con cuatro hojas: diez días, siete entrenos', () => {
    const mc = conTandas(rotativo('A'), '2-1 2-1 3-1', ['Push', 'Pull', 'Legs', 'Upper']);
    expect(hojas(mc)).toEqual(['Push', 'Pull', '·', 'Legs', 'Upper', '·', 'Push', 'Pull', 'Legs', '·']);
    expect(cadenaDe(mc.dias)).toBe('2-1 2-1 3-1');
  });

  it('una cadena que no se lee no cambia nada; en semanal no hay tandas', () => {
    expect(conTandas(rotativo('A'), 'hola', ['A'])).toBeNull();
    expect(conTandas(semanal('A', null, null, null, null, null, null), '2-1', ['A'])).toBeNull();
  });
});

describe('la fila «Sin día» y el nombre de las hojas', () => {
  it('las hojas del plan que no caen en ningún día', () => {
    expect(hojasSinDia(rotativo('A', 'B', null), ['A', 'B', 'Brazos'])).toEqual(['Brazos']);
  });

  it('renombrar cambia todos sus días', () => {
    expect(hojas(renombrarEnMicrociclo(semanal('A', null, 'A', null, null, null, null), 'A', 'Torso'))).toEqual([
      'Torso', '·', 'Torso', '·', '·', '·', '·',
    ]);
  });
});

describe('seguirAlPlan', () => {
  it('rotativo de una tanda, sin retocar: se regenera', () => {
    const mc = rotativo('A', 'B', null, 'C', null);
    expect(hojas(seguirAlPlan(mc, ['A', 'B', 'C'], ['A', 'C']))).toEqual(['A', 'C', '·']);
  });

  it('retocado o semanal: lo quitado pasa a descanso y lo nuevo no entra', () => {
    const mc = semanal('A', 'B', null, 'C', null, null, null);
    expect(hojas(seguirAlPlan(mc, ['A', 'B', 'C'], ['A', 'C', 'D']))).toEqual(['A', '·', '·', 'C', '·', '·', '·']);
    const sinCambio = seguirAlPlan(mc, ['A', 'B', 'C'], ['A', 'B', 'C', 'D']);
    expect(sinCambio).toBe(mc);
  });
});
