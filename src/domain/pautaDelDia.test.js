import { describe, expect, it } from 'vitest';

import { splitDelBloque } from './blocks';
import { pasosDelDia, setDayTargets, tiposDelCiclo } from './nutrition';
import {
  gPorKg,
  intervencionDelDia,
  intervencionesEntre,
  kcalDeMacros,
  pautaDeLosDias,
  pautaEspecialDelDia,
  tiposDeLaSemana,
} from './pautaDelDia';
import { fotoDeVersion } from './reviews';
import { WEEK_DAYS } from './training';

/* Un alto/bajo: alta de lunes a viernes, baja el fin de semana. */
const dieta = {
  stepsGoal: '9000',
  days: [
    { id: 'alta', name: 'alta', targets: { targetKcals: 3000, proteinGrams: 180, carbsGrams: 400, fatsGrams: 75 } },
    { id: 'baja', name: 'baja', targets: { targetKcals: 2800, proteinGrams: 180, carbsGrams: 350, fatsGrams: 78, steps: 12000 } },
  ],
  week: Object.fromEntries(WEEK_DAYS.map((d, i) => [d, i < 5 ? 'alta' : 'baja'])),
};
const slots = WEEK_DAYS.map((key) => ({ key }));
const casillas = new Map(WEEK_DAYS.map((key, i) => [`2026-09-${String(21 + i).padStart(2, '0')}`, key]));

describe('los pasos de cada día de la dieta', () => {
  it('un día con los suyos los usa; sin ellos, los del plan', () => {
    expect(pasosDelDia(dieta, 'baja')).toBe(12000);
    expect(pasosDelDia(dieta, 'alta')).toBe(9000);
  });

  it('se guardan en su día y vaciarlos vuelve a los del plan', () => {
    const con = setDayTargets(dieta, 'alta', { steps: '11000' });
    expect(pasosDelDia(con, 'alta')).toBe(11000);
    const sin = setDayTargets(con, 'alta', { steps: '' });
    expect(pasosDelDia(sin, 'alta')).toBe(9000);
  });
});

describe('los tipos de día de una dieta', () => {
  it('con sus cifras, sus pasos y sus casillas', () => {
    const tipos = tiposDelCiclo(dieta, slots);
    expect(tipos.map((t) => [t.n, t.kcals, t.steps, t.casillas.length])).toEqual([
      ['alta', 3000, 9000, 5],
      ['baja', 2800, 12000, 2],
    ]);
  });

  it('la versión fechada los trae, y sus pasos son la media de la semana', () => {
    const foto = fotoDeVersion({ nutrition: dieta, program: { cycleType: 'weekly' }, client: { cycleType: 'weekly' } });
    expect(foto.tipos).toHaveLength(2);
    expect(foto.steps).toBe(Math.round((9000 * 5 + 12000 * 2) / 7));
  });
});

describe('la pauta de cada día', () => {
  const tipos = tiposDelCiclo(dieta, slots);
  const semana = { lunes: '2026-09-21', media: 80, pauta: { kcals: 2943, steps: 9857, tipos, soloMedia: false } };
  const refeed = { id: 'r', kind: 'refeed', date: '2026-09-26', kcal: 3600, proteina: 180, carbohidratos: 600, grasa: 40 };

  it('cada fecha con su tipo de día', () => {
    const dias = pautaDeLosDias({ semana, casillas });
    expect(dias.map((d) => [d.tipo, d.kcals])).toEqual([
      ['alta', 3000],
      ['alta', 3000],
      ['alta', 3000],
      ['alta', 3000],
      ['alta', 3000],
      ['baja', 2800],
      ['baja', 2800],
    ]);
    expect(dias.every((d) => d.exacto)).toBe(true);
  });

  it('un refeed manda sobre la dieta ese día, sin tocar los pasos', () => {
    const dias = pautaDeLosDias({ semana, casillas, hechos: [refeed] });
    const sabado = dias[5];
    expect(sabado.intervencion.id).toBe('r');
    expect(sabado.kcals).toBe(3600);
    expect(sabado.carbs).toBe(600);
    expect(sabado.steps).toBe(12000);
  });

  it('una semana que solo guarda la media no se inventa los días', () => {
    const vieja = { lunes: '2026-03-02', pauta: { kcals: 2900, steps: 9000, tipos: null, soloMedia: true } };
    const dias = pautaDeLosDias({ semana: vieja, casillas: new Map() });
    expect(dias.every((d) => d.kcals === 2900 && d.tipo === null && !d.exacto)).toBe(true);
  });

  it('por tipo de día: cuántos días de ESA semana le tocan', () => {
    expect(tiposDeLaSemana({ semana, casillas }).map((t) => [t.n, t.kcals, t.dias])).toEqual([
      ['alta', 3000, 5],
      ['baja', 2800, 2],
    ]);
  });
});

describe('refeeds y diet breaks', () => {
  const eventos = [
    { id: 'a', kind: 'diet_break', date: '2026-09-14', hasta: '2026-09-27', kcal: 2600 },
    { id: 'b', kind: 'refeed', date: '2026-09-20', kcal: 3400 },
    { id: 'c', kind: 'rest', date: '2026-09-20' },
  ];

  it('el que cubre el día; si se pisan, el más concreto', () => {
    expect(intervencionDelDia(eventos, '2026-09-19').id).toBe('a');
    expect(intervencionDelDia(eventos, '2026-09-20').id).toBe('b');
    expect(intervencionDelDia(eventos, '2026-09-28')).toBeNull();
  });

  it('unas vacaciones no son pauta', () => {
    expect(intervencionesEntre(eventos, '2026-09-20', '2026-09-20').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('las kcal de las macros son 4/4/9, como en la base', () => {
    expect(kcalDeMacros({ protein: 180, carbs: 450, fats: 53 })).toBe(2997);
    expect(kcalDeMacros({ protein: 180, carbs: 450 })).toBeNull();
  });

  it('lo que le toca hoy al cliente: el escalón de su día y la indicación', () => {
    const escalonado = {
      kind: 'refeed',
      date: '2026-09-11',
      hasta: '2026-09-13',
      nota: ' Los hidratos, alrededor del entreno ',
      pautaDias: [{ kcal: 3000 }, { kcal: 3300 }, { kcal: 3740, proteina: 180, carbohidratos: 560, grasa: 60 }],
    };
    expect(pautaEspecialDelDia([escalonado], '2026-09-12')).toMatchObject({ nombre: 'Refeed', dia: 2, dias: 3, kcals: 3300, macros: false, nota: 'Los hidratos, alrededor del entreno' });
    expect(pautaEspecialDelDia([escalonado], '2026-09-13')).toMatchObject({ dia: 3, kcals: 3740, protein: 180, macros: true });
    expect(pautaEspecialDelDia(eventos, '2026-09-16')).toMatchObject({ nombre: 'Diet break', dia: 3, dias: 14, kcals: 2600, nota: null });
    expect(pautaEspecialDelDia(eventos, '2026-09-28')).toBeNull();
  });

  it('va con sus fechas y no con la dieta: otro día de la misma dieta es el de siempre', () => {
    const refeed = { kind: 'refeed', date: '2026-09-24', hasta: '2026-09-26', kcal: 2600 };
    /* El 24 y el 29 abren la misma dieta (alta); solo el 24 es refeed. */
    expect(dieta.week.Jueves).toBe(dieta.week.Martes);
    expect(pautaEspecialDelDia([refeed], '2026-09-24')).toMatchObject({ dia: 1, kcals: 2600 });
    expect(pautaEspecialDelDia([refeed], '2026-09-29')).toBeNull();
    /* Una dieta elegida sin día (el monitor) tampoco lo es. */
    expect(pautaEspecialDelDia([refeed], null)).toBeNull();
  });

  it('los g/kg con el peso real', () => {
    expect(gPorKg(180, 80)).toBeCloseTo(2.25, 5);
    expect(gPorKg(180, null)).toBeNull();
  });
});

describe('el split del bloque', () => {
  const bloque = {
    id: 'b1',
    name: 'Bloque 2',
    fromWeek: 1,
    toWeek: null,
    microciclo: {
      tipo: 'semanal',
      dias: [{ hoja: 'Torso A' }, { hoja: 'Pierna A' }, { descanso: true }, { hoja: 'Torso B' }, { hoja: 'Pierna B' }, { descanso: true }, { descanso: true }],
    },
  };

  it('por defecto, el deducido de sus hojas', () => {
    const s = splitDelBloque({}, bloque);
    expect(s.texto).toBe('Torso / Pierna · 4 días');
    expect(s.corto).toBe('T/P · 4d');
    expect(s.datos).toBe('4 días · Torso A, Pierna A, Torso B, Pierna B');
  });

  it('con nombre del entrenador, el suyo', () => {
    const s = splitDelBloque({}, { ...bloque, split: 'Torso-pierna' });
    expect(s.texto).toBe('Torso-pierna');
    expect(s.deducido).toBe('Torso / Pierna · 4 días');
    expect(s.datos).toBe('4 días · Torso A, Pierna A, Torso B, Pierna B');
  });

  it('un rotativo dice su cadena', () => {
    const rot = { ...bloque, microciclo: { tipo: 'rotativo', dias: [{ hoja: 'Empuje' }, { hoja: 'Tirón' }, { descanso: true }] } };
    expect(splitDelBloque({}, rot).texto).toBe('Push / Pull 2-1');
    expect(splitDelBloque({}, rot).datos).toBe('2 de cada 3 días · Empuje, Tirón');
  });
});
