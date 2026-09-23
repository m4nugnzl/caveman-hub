import { describe, expect, it } from 'vitest';

import { cardioActividad, cardioCorto, llegadaTexto, ritmoTexto, semanasDelPlan, situacionDelPlan } from './semanasDelPlan';

/**
 * ══ Las semanas del plan (R1 §6, R2) ═══════════════════════════════════════
 *
 * Lo que protege este archivo:
 *
 *   1. **La semana es NATURAL.** Cada fila es un lunes, y la fase se decide por
 *      su jueves. Si esto se cambiara por la semana de programa, la tabla
 *      heredaría el desfase de `weekStartOfProgramWeek`.
 *   2. **Las filas sin fase existen.** Un hueco entre dos fases es información
 *      y tiene sus filas, no se salta.
 *   3. **El cruce no tiene semanas**: sus caminos son borradores sin fechas
 *      propias hasta que se elige uno.
 *   4. **Nada se sugiere.** La fila dice si se PUEDE igualar; no hay campo que
 *      diga si se DEBERÍA.
 */

const HOY = '2026-11-12';

const volumen = { id: 'vol', title: 'Volumen', direction: 'bulk', ratePct: 0.25, startsOn: '2026-07-13', endsOn: '2026-09-06' };
const definicion = {
  id: 'def',
  title: 'Definición',
  direction: 'cut',
  ratePct: 0.6,
  startsOn: '2026-09-07',
  endsOn: '2026-12-27',
  replanteos: [{ semana: '2026-10-19', pesoBase: 74.9, ratePct: 0.7 }],
  nextOptions: [
    { title: 'Transición', direction: 'maintain', ratePct: 0, weeks: 4, when: 'Si llega con margen' },
    { title: 'Seguir definiendo', direction: 'cut', ratePct: 0.5, weeks: 5, when: 'Si le sobra' },
  ],
};
const destino = { id: 'n', kind: 'race', title: 'Nacional AEFN', date: '2027-01-31', ancla: true };

/* Un pesaje cada dos días, con la semana del 5 oct vacía. */
const history = [];
for (let t = Date.parse('2026-07-11'); t <= Date.parse(HOY); t += 2 * 86400000) {
  const date = new Date(t).toISOString().slice(0, 10);
  if (date >= '2026-10-05' && date <= '2026-10-11') continue;
  history.push({ date, weight: 75 + (date < '2026-09-07' ? 0.5 : -0.5) });
}

const reviews = [
  { weekStart: '2026-07-13', snapshot: { kcals: 3100, steps: 8000 } },
  { weekStart: '2026-09-07', snapshot: { kcals: 2600, steps: 9000 } },
  { weekStart: '2026-09-28', snapshot: { kcals: 2600, steps: 9000 } },
  { weekStart: '2026-10-12', snapshot: { kcals: 2450, steps: 9000 } },
];

const program = {
  cycleType: 'weekly',
  blocks: [
    { id: 'b1', name: 'Acumulación', fromWeek: 1, toWeek: 8 },
    { id: 'b2', name: 'Intensificación', fromWeek: 9, toWeek: null, plannedWeeks: 8 },
  ],
  microcycles: Array.from({ length: 12 }, (_, i) => ({
    weekNumber: i + 1,
    date: new Date(Date.parse('2026-07-13') + i * 7 * 86400000).toISOString().slice(0, 10),
    days: [],
  })),
};

const hechos = [
  { id: 'r', kind: 'refeed', title: 'Refeed', date: '2026-10-31', hasta: '2026-11-01', kcal: 3400 },
  { id: 'x', kind: 'race', title: 'Regional de otoño', date: '2026-11-08' },
  { id: 'v', kind: 'rest', title: 'Vacaciones', date: '2026-12-07', hasta: '2026-12-13' },
  { id: 'c', kind: 'appointment', title: 'Cita', date: '2026-11-10' },
];

const plan = () =>
  semanasDelPlan({
    phases: [definicion, volumen],
    anchors: [destino],
    hechos,
    history,
    program,
    reviews,
    plan: { kcals: 2300, steps: 11000 },
    hoy: HOY,
  });

describe('semanasDelPlan', () => {
  it('arranca antes de la temporada si se le pide (la primera semana de la revisión)', () => {
    const { rango, semanas, grupos } = semanasDelPlan({
      phases: [definicion, volumen],
      anchors: [destino],
      history,
      desde: '2026-06-24',
      hoy: HOY,
    });
    expect(rango.desde).toBe('2026-06-22');
    expect(semanas[0].lunes).toBe('2026-06-22');
    /* Lo de antes de la primera fase es un grupo sin fase. */
    expect(grupos[0].fase).toBeNull();
  });

  it('va por lunes, de la primera fase de la temporada a su destino', () => {
    const { semanas, rango } = plan();

    expect(rango).toEqual({ desde: '2026-07-13', hasta: '2027-01-25' });
    expect(semanas.every((s) => new Date(`${s.lunes}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(semanas.find((s) => s.lunes === '2026-11-09').estado).toBe('hoy');
  });

  it('la fase de cada semana es la de su jueves', () => {
    const { semanas } = plan();
    const de = (l) => semanas.find((s) => s.lunes === l);

    expect(de('2026-08-31').fase.id).toBe('vol');
    expect(de('2026-09-07').fase.id).toBe('def');
    expect(de('2026-09-07').semanaFase).toBe(1);
    expect(de('2026-09-07').totalFase).toBe(16);
  });

  it('una semana sin pesajes no tiene media, y la de hoy no pasa por futura', () => {
    const { semanas } = plan();
    const de = (l) => semanas.find((s) => s.lunes === l);

    expect(de('2026-10-05').media).toBeNull();
    expect(de('2026-10-05').pesajes).toEqual([]);
    expect(de('2026-11-09').media).not.toBeNull();
    expect(de('2026-11-16').media).toBeNull();
  });

  it('la semana igualada lleva su replanteo y desde ahí hay fantasma', () => {
    const { semanas } = plan();
    const de = (l) => semanas.find((s) => s.lunes === l);

    expect(de('2026-10-19').replanteo).toMatchObject({ pesoBase: 74.9, ratePct: 0.7 });
    expect(de('2026-10-19').esperado).toBeCloseTo(74.9, 6);
    expect(de('2026-10-12').original).toBeNull();
    expect(de('2026-10-26').original).not.toBeNull();
  });

  it('los cambios de pauta, con ≈ cuando la revisión anterior quedaba lejos', () => {
    const { semanas } = plan();
    const de = (l) => semanas.find((s) => s.lunes === l);

    expect(de('2026-09-07').cambios.map((c) => c.k)).toEqual(['kcals', 'steps']);
    expect(de('2026-09-07').aprox).toEqual({ desde: '2026-07-13', hasta: '2026-09-07' });
    /* 28 sep → 12 oct: dos semanas, así que la fecha del cambio es aproximada. */
    expect(de('2026-10-12').aprox).toEqual({ desde: '2026-09-28', hasta: '2026-10-12' });
    /* Y el plan de hoy entra después de la última revisión, no más allá de hoy. */
    expect(de('2026-10-19').pauta.kcals).toBe(2300);
    expect(de('2026-11-16').pauta).toBeNull();
  });

  it('el bloque cambia solo la semana en que empieza', () => {
    const { semanas } = plan();
    const nombres = semanas.slice(6, 10).map((s) => [s.bloque?.nombre, s.bloque?.cambia]);

    expect(nombres).toEqual([
      ['Acumulación', false],
      ['Acumulación', false],
      ['Intensificación', true],
      ['Intensificación', false],
    ]);
  });

  it('los hechos tocan cada semana que cubren, y una cita no es un hecho', () => {
    const { semanas } = plan();
    const de = (l) => semanas.find((s) => s.lunes === l);

    expect(de('2026-10-26').hechos.map((e) => e.id)).toEqual(['r']);
    expect(de('2026-11-02').hechos.map((e) => e.id)).toEqual(['x']);
    expect(de('2026-11-09').hechos).toEqual([]);
    expect(de('2026-12-07').hechos.map((e) => e.id)).toEqual(['v']);
  });

  it('el cruce se mide y sus semanas no son filas del libro', () => {
    const { cruce, grupos, semanas } = plan();

    expect(cruce.decide).toBe('2026-12-27');
    expect(cruce.caminos.map((c) => [c.titulo, c.fin, c.llegada])).toEqual([
      ['Transición', '2027-01-24', { estado: 'hueco', dias: 6 }],
      ['Seguir definiendo', '2027-01-31', { estado: 'llega', dias: 0 }],
    ]);
    expect(semanas.filter((s) => s.enCruce).length).toBeGreaterThan(0);
    expect(grupos.map((g) => g.clave)).toEqual(['vol', 'def']);
  });

  it('el resumen de una fase igualada da los dos objetivos', () => {
    const { grupos } = plan();
    const def = grupos.find((g) => g.clave === 'def').resumen;

    expect(def.objetivoOriginal.ratePct).toBe(0.6);
    expect(def.vigente).toMatchObject({ ratePct: 0.7, desde: '2026-10-19', fecha: '2026-12-27' });
    expect(def.vigente.peso).not.toBeCloseTo(def.objetivoOriginal.peso, 1);
    expect(grupos.find((g) => g.clave === 'vol').resumen.vigente).toBeNull();
  });

  it('se puede igualar una semana pasada con media dentro de una fase; nada más', () => {
    const { semanas } = plan();
    const de = (l) => semanas.find((s) => s.lunes === l);

    expect(de('2026-10-26').igualable).toBe(true);
    expect(de('2026-10-05').igualable).toBe(false); // sin pesajes
    expect(de('2026-11-23').igualable).toBe(false); // futura
    expect(Object.keys(de('2026-10-26'))).not.toContain('sugerencia');
  });
});

describe('los estados que tiene que aguantar', () => {
  it('sin fases: las últimas semanas con pesajes, sin esperado y en un solo grupo', () => {
    const { semanas, grupos, cruce } = semanasDelPlan({ history, hoy: HOY });

    expect(semanas[semanas.length - 1].lunes).toBe('2026-11-09');
    expect(semanas.length).toBe(16);
    expect(semanas.every((s) => s.esperado === null)).toBe(true);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].fase).toBeNull();
    expect(cruce).toBeNull();
  });

  it('un hueco entre fases tiene sus filas, en un grupo sin fase', () => {
    const otra = { ...definicion, id: 'def2', startsOn: '2026-09-21', replanteos: null, nextOptions: null };
    const { grupos } = semanasDelPlan({ phases: [volumen, otra], history, hoy: HOY });

    expect(grupos.map((g) => g.clave)).toEqual(['vol', null, 'def2']);
    expect(grupos[1].semanas.map((s) => s.lunes)).toEqual(['2026-09-07', '2026-09-14']);
  });

  it('tres semanas de historia: todo lo que hay, sin inventar más', () => {
    const corta = history.filter((h) => h.date >= '2026-10-22');
    const { semanas } = semanasDelPlan({ history: corta, hoy: HOY });

    expect(semanas.map((s) => s.lunes)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
  });

  it('un plan de dos años llega a su destino', () => {
    const larga = { ...volumen, id: 'larga', startsOn: '2026-09-07', endsOn: '2028-08-27' };
    const lejos = { ...destino, date: '2028-09-10' };
    const { rango } = semanasDelPlan({ phases: [larga], anchors: [lejos], history, hoy: HOY });

    expect(rango).toEqual({ desde: '2026-09-07', hasta: '2028-09-04' });
  });
});

describe('la cabecera, en piezas', () => {
  it('dónde está, a dónde va y qué se decide, por separado', () => {
    const s = situacionDelPlan(plan());

    expect(s.ahora).toMatchObject({ semana: 10, total: 16, deEstaSemana: true });
    expect(s.ahora.fase.id).toBe('def');
    expect(s.destino).toMatchObject({ titulo: 'Nacional AEFN', fecha: '2027-01-31' });
    expect(s.destino.cuenta.texto).toBe('faltan 12 semanas');
    expect(s.cruce.caminos.map((c) => `${c.titulo} ${llegadaTexto(c.llegada)}`)).toEqual([
      'Transición deja 6 días sin plan',
      'Seguir definiendo llega',
    ]);
  });

  it('los ritmos se escriben con su signo, y el mantenimiento sin cifra', () => {
    expect(ritmoTexto('cut', 0.6)).toBe('−0,6 %/sem');
    expect(ritmoTexto('bulk', 0.25)).toBe('+0,25 %/sem');
    expect(ritmoTexto('maintain', 0)).toBe('mantener');
  });
});

describe('los datos que no pueden engañar', () => {
  it('sin pesajes recientes, la cabecera lo sabe antes que la cifra', () => {
    const viejo = history.filter((h) => h.date <= '2026-10-24');
    const s = situacionDelPlan(semanasDelPlan({ phases: [definicion, volumen], history: viejo, hoy: HOY }));
    expect(s.ahora.reciente).toBe(false);
    expect(s.ahora.ultimoPesaje).toBe(viejo[viejo.length - 1].date);

    const al = situacionDelPlan(plan());
    expect(al.ahora.reciente).toBe(true);
  });

  it('el bloque de una semana lo decide su jueves, y al acabarse se dice', () => {
    /* Microciclos que empiezan en domingo: la semana de antes solo toca su
       primer día y no es del bloque. */
    const domingos = {
      ...program,
      microcycles: program.microcycles.map((m) => ({
        ...m,
        date: new Date(Date.parse(m.date) - 86400000).toISOString().slice(0, 10),
      })),
    };
    const { semanas, hayBloques } = semanasDelPlan({ phases: [definicion, volumen], history, program: domingos, hoy: HOY });
    const de = (l) => semanas.find((s) => s.lunes === l);
    expect(hayBloques).toBe(true);
    expect(de('2026-07-13').bloque.nombre).toBe('Acumulación');
    expect(de('2026-09-07').bloque).toMatchObject({ nombre: 'Intensificación', cambia: true });
    /* 12 microciclos con 8 semanas previstas desde la 9: acaba en la 16. */
    expect(de('2026-10-26').bloque.nombre).toBe('Intensificación');
    expect(de('2026-11-02').bloque).toBeNull();
    expect(de('2026-11-02').finDeBloque).toBe(true);
    expect(de('2026-11-09').finDeBloque).toBe(false);
  });

  it('el cruce lleva su pregunta y los días que faltan', () => {
    const conPregunta = { ...definicion, nextQuestion: '¿Llega al Nacional con margen?' };
    const { cruce } = semanasDelPlan({ phases: [conPregunta, volumen], anchors: [destino], history, hoy: HOY });
    expect(cruce.pregunta).toBe('¿Llega al Nacional con margen?');
    expect(cruce.dias).toBe(45);
    expect(plan().cruce.pregunta).toBe('');
  });

  it('el cardio: la dosis en la celda y la actividad aparte', () => {
    expect(cardioCorto('3 × 35′ elíptica')).toBe('3×35′');
    expect(cardioCorto('2x20 min')).toBe('2×20′');
    expect(cardioCorto('30′ bici')).toBe('30′');
    expect(cardioCorto('Caminar después de cenar')).toBe('Caminar después de cenar');
    expect(cardioCorto('')).toBeNull();
    expect(cardioActividad('3 × 35′ elíptica')).toBe('elíptica');
    expect(cardioActividad('30 min de bici')).toBe('bici');
    expect(cardioActividad('2 × 20′')).toBeNull();
    expect(cardioActividad('Caminar')).toBeNull();
  });
});
