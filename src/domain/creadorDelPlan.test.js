import { describe, expect, it } from 'vitest';

import { microciclosDeLaSemana } from './blocks';
import {
  MAX_POR_TIRA,
  acortableFase,
  estirarFases,
  lineaDelCreador,
  loQueDiceLaSemana,
  microTexto,
  partirEnTiras,
  pesosDeLasFases,
  ritmoParaSalida,
} from './creadorDelPlan';

/*
  Lo que protegen estas pruebas, en el orden en que se rompería sin avisar:

    1. Que una tira no pase de 26 semanas ni obligue a desplazarse de lado.
    2. Que estirar una fase empuje SOLO las de detrás, igual que `estirar_fase`
       (0136), y que lo ya vivido no se pueda acortar.
    3. Que los pesos de los extremos sean lecturas encadenadas: la entrada de
       una fase futura es la salida esperada de la anterior.
    4. Que los borradores vayan detrás de lo previsto para el abierto.
    5. Que la semana nombre el microciclo del JUEVES en un semanal, y todos
       los que toca en un rotativo.
*/

const HOY = '2026-09-23'; // miércoles

const volumen = {
  id: 'v',
  title: 'Volumen',
  direction: 'bulk',
  ratePct: 0.25,
  startsOn: '2026-03-02',
  endsOn: '2027-02-28', // 52 semanas
  note: '',
};
const minicut = {
  id: 'm',
  title: 'Minicut',
  direction: 'cut',
  ratePct: 0.8,
  startsOn: '2027-03-01',
  endsOn: '2027-04-25', // 8 semanas
  note: '',
  nextOptions: [
    { when: 'Sí, con margen', title: 'Mantenimiento', direction: 'maintain', ratePct: 0, weeks: 4 },
    { when: 'No, le sobra', title: 'Definición', direction: 'cut', ratePct: 0.6, weeks: 4 },
  ],
  nextQuestion: '¿Llega a 82 kg con margen?',
};
const historia = [
  { date: '2026-02-28', weight: 76 },
  { date: '2026-09-21', weight: 80.1 },
];

describe('las tiras', () => {
  it('nunca pasan de 26 semanas y se reparten iguales', () => {
    const { tiras, col } = partirEnTiras(64, 830);
    expect(tiras).toHaveLength(3);
    expect(tiras.every((t) => t.b - t.a <= MAX_POR_TIRA)).toBe(true);
    expect(tiras.map((t) => t.b - t.a)).toEqual([22, 22, 20]);
    expect(col).toBeCloseTo(830 / 22);
  });

  it('en un teléfono se parten antes para que una semana no baje de 14 px', () => {
    const { tiras, col } = partirEnTiras(64, 358);
    expect(col).toBeGreaterThanOrEqual(14);
    expect(tiras[0].b * col).toBeLessThanOrEqual(358 + 0.01);
  });

  it('con pocas semanas la columna no se estira más de la cuenta', () => {
    expect(partirEnTiras(4, 830).col).toBe(44);
    expect(partirEnTiras(0, 830).tiras).toEqual([]);
  });
});

describe('estirar una fase', () => {
  const fases = [volumen, minicut];

  it('alargarla empuja las de detrás y no toca las de delante', () => {
    const r = estirarFases(fases, 'v', 14);
    expect(r[0].endsOn).toBe('2027-03-14');
    expect(r[1].startsOn).toBe('2027-03-15');
    expect(r[1].endsOn).toBe('2027-05-09');
    expect(estirarFases(fases, 'm', 7)[0]).toBe(volumen);
  });

  it('acortarla tira de las de detrás hacia atrás', () => {
    const r = estirarFases(fases, 'v', -7);
    expect(r[0].endsOn).toBe('2027-02-21');
    expect(r[1].startsOn).toBe('2027-02-22');
  });

  it('una fase en curso no puede acabar antes de hoy', () => {
    const enCurso = { ...volumen, endsOn: '2026-10-11' };
    expect(acortableFase(enCurso, HOY)).toBe(-2);
    expect(acortableFase({ ...volumen, endsOn: '2026-09-27' }, HOY)).toBe(0);
  });

  it('una futura puede quedarse en una semana, no en menos', () => {
    expect(acortableFase(minicut, HOY)).toBe(-7);
  });
});

describe('los pesos de los extremos', () => {
  it('la que ya empezó entra con su peso real, y la futura con lo esperado de la anterior', () => {
    const [v, m] = pesosDeLasFases([volumen, minicut], historia, HOY);
    expect(v.real).toBe(true);
    expect(v.entrada).toBe(76);
    // 76 + 0,19 kg/sem × 52 semanas
    expect(v.salida).toBeCloseTo(76 + 0.19 * 52, 5);
    expect(m.real).toBe(false);
    expect(m.entrada).toBeCloseTo(v.salida, 5);
    expect(m.salida).toBeLessThan(m.entrada);
  });

  it('el atajo: escribir la salida da el ritmo que la produce', () => {
    const r = ritmoParaSalida({ direction: 'bulk', entrada: 76, salida: 86.4, dias: 364 });
    expect(r.ratePct).toBeCloseTo(0.26, 2);
    expect(r.kgSemana).toBeGreaterThan(0);
  });

  it('y dice por qué no, sin inventar un ritmo', () => {
    expect(ritmoParaSalida({ direction: 'bulk', entrada: 76, salida: 70, dias: 364 }).error).toMatch(/volumen/i);
    expect(ritmoParaSalida({ direction: 'cut', entrada: 80, salida: 60, dias: 14 }).error).toMatch(/2 %/);
    expect(ritmoParaSalida({ direction: 'maintain', entrada: 80, salida: 80, dias: 28 }).error).toBeTruthy();
  });
});

describe('la línea del creador', () => {
  const programa = {
    cycleType: 'weekly',
    microcycles: [
      { weekNumber: 1, date: '2026-08-26', days: [], sessions: [] }, // miércoles
      { weekNumber: 2, date: '2026-09-02', days: [], sessions: [] },
      { weekNumber: 3, date: '2026-09-09', days: [], sessions: [] },
      { weekNumber: 4, date: '2026-09-19', days: [], sessions: [] },
    ],
    blocks: [
      { id: 'b1', name: 'Acumulación', intent: 'acumulacion', fromWeek: 1, toWeek: 3 },
      {
        id: 'b2',
        name: 'Intensificación',
        intent: 'intensificacion',
        fromWeek: 4,
        toWeek: null,
        plannedWeeks: 3,
        microciclo: { tipo: 'rotativo', dias: [{ hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'C' }, { hoja: 'D' }, { descanso: true }, { hoja: 'E' }, { descanso: true }, { descanso: true }, { descanso: true }] },
      },
    ],
    draftBlocks: [{ id: 'd1', name: 'Descarga', intent: 'descarga', plannedWeeks: 1 }],
  };
  const linea = lineaDelCreador({
    phases: [minicut, volumen],
    anchors: [{ id: 'n', kind: 'race', title: 'Nacional', date: '2027-05-23', ancla: true }],
    hechos: [{ id: 'r', kind: 'refeed', title: 'Refeed', date: '2027-03-27' }],
    history: historia,
    program: programa,
    client: { cycleType: 'weekly' },
    hoy: HOY,
  });

  it('cada fase ocupa las semanas cuyo jueves cae dentro', () => {
    const [v, m] = linea.fases;
    expect(v.a).toBe(0);
    expect(v.b - v.a).toBe(52);
    expect(m.a).toBe(52);
    expect(m.b - m.a).toBe(8);
    expect(v.estado).toBe('actual');
    expect(m.estado).toBe('futura');
  });

  it('hoy cae en su semana, rellena hasta el miércoles', () => {
    expect(linea.lunes[linea.hoyIdx]).toBe('2026-09-21');
    expect(linea.hoyFraccion).toBeCloseTo(3 / 7);
  });

  it('el cruce va detrás de la última fase, un camino por fila', () => {
    expect(linea.cruce.a).toBe(60);
    expect(linea.cruce.caminos.map((c) => c.b - c.a)).toEqual([4, 4]);
    expect(linea.cruce.pregunta).toMatch(/82/);
  });

  it('el rango llega al destino y al final del cruce', () => {
    expect(linea.lunes[linea.lunes.length - 1]).toBe('2027-05-17');
    expect(linea.destino.i).toBe(63);
  });

  it('el abierto dura lo previsto por vueltas y el borrador empieza al día siguiente', () => {
    const abierto = linea.bloques.find((b) => b.id === 'b2');
    expect(abierto.vuelta).toBe(10);
    expect(abierto.hasta).toBe('2026-10-18'); // 19 sep + 3 vueltas de 10 − 1
    expect(abierto.minimo).toBe(1);
    const borrador = linea.bloques.find((b) => b.id === 'd1');
    expect(borrador.tipo).toBe('borrador');
    expect(borrador.desde).toBe('2026-10-19');
    expect(borrador.descarga).toBe(true);
    expect(linea.bloques.find((b) => b.id === 'b1').asa).toBe(false);
  });

  it('los hechos van en su semana', () => {
    expect(linea.hechos).toHaveLength(1);
    expect(linea.lunes[linea.hechos[0].i]).toBe('2027-03-22');
  });

  it('el globo de una semana nombra fase, bloque y microciclo', () => {
    const s = loQueDiceLaSemana(linea, linea.hoyIdx);
    expect(s.fase.fase.id).toBe('v');
    expect(s.fase.n).toBe(30);
    expect(s.esHoy).toBe(true);
    const rot = s.bloques.find((b) => b.bloque.id === 'b2');
    expect(microTexto(rot.micro)).toBe('M1');
    expect(s.esperado).toBeGreaterThan(76);
  });
});

describe('el microciclo de una semana', () => {
  it('en un semanal, el que contiene el jueves', () => {
    // Microciclos de miércoles a martes: la semana del 21 sep tiene su jueves en el M5.
    const t = { desde: '2026-08-26', vuelta: 7, total: 6 };
    expect(microciclosDeLaSemana(t, '2026-09-21')).toEqual({ primero: 5, ultimo: 5 });
    expect(microciclosDeLaSemana(t, '2026-08-24')).toEqual({ primero: 1, ultimo: 1 });
    expect(microciclosDeLaSemana(t, '2026-08-17')).toBeNull();
  });

  it('en un rotativo, todos los que toca', () => {
    const t = { desde: '2026-09-01', vuelta: 10, total: 5 };
    expect(microTexto(microciclosDeLaSemana(t, '2026-09-07'))).toBe('M1–M2');
    expect(microciclosDeLaSemana(t, '2026-10-19')).toEqual({ primero: 5, ultimo: 5 });
    expect(microciclosDeLaSemana(t, '2026-10-26')).toBeNull();
    expect(microciclosDeLaSemana(t, '2026-11-09')).toBeNull();
  });
});
