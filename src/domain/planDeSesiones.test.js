import { describe, expect, it } from 'vitest';

import { buildPortfolio, colasDeInicio, portfolioInbox } from './portfolio';

import {
  casillaParaLaDieta,
  diasAtrasados,
  diasDelCalendario,
  entrenaElDia,
  fechaDeLaCasilla,
  lineaDeAtrasos,
  lineasDeAtrasos,
  marcaDelDia,
  microciclosDelPlan,
  movidasDeAtrasar,
  planesConMovidas,
  puedeAtrasarDesde,
  resumenDelMicrociclo,
  sesionesDelPlan,
  sesionesSinDia,
} from './planDeSesiones';

/* Un día con una serie pautada, y una sesión con `series` anotadas. */
const hoja = (dayName) => ({
  dayName,
  exercises: [{ id: `e-${dayName}`, name: 'Press', sets: [{ kg: '', reps: '', rir: '' }] }],
});
const sesion = (dayName, fecha, series = 1) => ({
  id: `s-${dayName}-${fecha}`,
  dayName,
  date: fecha,
  entries: [{ exerciseId: `e-${dayName}`, name: 'Press', sets: Array.from({ length: series }, () => ({ kg: 60, reps: 8 })) }],
});
const micro = (weekNumber, date, hojas, sessions = []) => ({ weekNumber, id: `m${weekNumber}`, date, days: hojas.map(hoja), sessions });

/* ── Semanal: Push lunes y jueves, Pull martes, Legs viernes ─────────────── */

const SPLIT = {
  Lunes: 'Push',
  Martes: 'Pull',
  Miércoles: 'Descanso',
  Jueves: 'Push',
  Viernes: 'Legs',
  Sábado: 'Descanso',
  Domingo: 'Descanso',
};
const SEMANAL = { cycleType: 'weekly' };
const semanal = (micros) => ({ weeklySplit: SPLIT, mobilityDrills: [], microcycles: micros });

/* ── Rotativo: D1 A, D2 B, D3 descanso, D4 C, D5 descanso ─────────────────── */

const ROTATIVO = { cycleType: 'rotating', cyclePattern: { train: 2, rest: 1 } };
const rotativo = (micros) => ({
  weeklySplit: {},
  mobilityDrills: [],
  microcycles: micros,
  blocks: [
    {
      id: 'b1',
      name: 'Bloque 1',
      fromWeek: 1,
      toWeek: null,
      microciclo: { tipo: 'rotativo', dias: [{ hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'C' }, { descanso: true }] },
    },
  ],
});

describe('la fecha que da el patrón', () => {
  it('semanal: el día de la semana dentro de sus siete; rotativo: la posición', () => {
    expect(fechaDeLaCasilla({ tipo: 'semanal' }, 3, '2026-09-21')).toBe('2026-09-24');
    /* Un semanal que empieza en miércoles: el lunes es el de la semana siguiente. */
    expect(fechaDeLaCasilla({ tipo: 'semanal' }, 0, '2026-09-23')).toBe('2026-09-28');
    expect(fechaDeLaCasilla({ tipo: 'rotativo' }, 3, '2026-09-21')).toBe('2026-09-24');
    expect(fechaDeLaCasilla({ tipo: 'rotativo' }, null, '2026-09-21')).toBeNull();
  });

  it('en curso es el último que ha empezado, no el último escrito', () => {
    const micros = [micro(1, '2026-09-14', []), micro(2, '2026-09-21', []), micro(3, '2026-09-28', [])];
    const { actual, siguiente } = microciclosDelPlan(micros, '2026-09-23');
    expect(actual.weekNumber).toBe(2);
    expect(siguiente.weekNumber).toBe(3);
  });
});

describe('cliente semanal', () => {
  const program = semanal([
    micro(1, '2026-09-14', ['Push', 'Pull', 'Legs'], [sesion('Push', '2026-09-14')]),
    micro(2, '2026-09-21', ['Push', 'Pull', 'Legs'], [sesion('Push', '2026-09-21')]),
    micro(3, '2026-09-28', ['Push', 'Pull', 'Legs']),
  ]);
  const hoy = '2026-09-23';
  const items = sesionesDelPlan({ program, client: SEMANAL, hoy });

  it('da el plan por defecto al microciclo en curso y al siguiente, y a ninguno más', () => {
    expect(new Set(items.map((i) => i.weekNumber))).toEqual(new Set([2, 3]));
    const m2 = items.filter((i) => i.weekNumber === 2);
    expect(m2.map((i) => [i.hoja, i.vez, i.fecha, i.estado])).toEqual([
      ['Push', 0, '2026-09-21', 'hecha'],
      ['Pull', 0, '2026-09-22', 'pendiente'],
      ['Push', 1, '2026-09-24', 'planificada'],
      ['Legs', 0, '2026-09-25', 'planificada'],
    ]);
  });

  it('el resumen cuenta solo el microciclo en curso', () => {
    expect(resumenDelMicrociclo(items).texto).toBe('1 de 4 hechas · 3 por hacer');
  });

  it('lo guardado manda sobre lo que da el patrón', () => {
    const conPlan = sesionesDelPlan({
      program,
      client: SEMANAL,
      hoy,
      plans: [{ week_number: 2, hoja: 'Legs', vez: 0, planned_date: '2026-09-27' }],
    });
    const legs = conPlan.find((i) => i.weekNumber === 2 && i.hoja === 'Legs');
    expect(legs.fechaPlan).toBe('2026-09-27');
    expect(legs.fechaPorDefecto).toBe('2026-09-25');
  });

  it('hecha es tener al menos una serie, aunque esté a medias', () => {
    const aMedias = semanal([micro(2, '2026-09-21', ['Push', 'Pull', 'Legs'], [sesion('Pull', '2026-09-23', 1)])]);
    const pull = sesionesDelPlan({ program: aMedias, client: SEMANAL, hoy }).find((i) => i.hoja === 'Pull');
    expect(pull.estado).toBe('hecha');
    expect(pull.fecha).toBe('2026-09-23');
  });

  it('el calendario pinta el historial entero y lo que falta del plan', () => {
    const dias = diasDelCalendario({ items, micros: program.microcycles });
    expect(marcaDelDia(dias.get('2026-09-14'))).toBe('hecha');
    expect(marcaDelDia(dias.get('2026-09-22'))).toBe('pendiente');
    expect(marcaDelDia(dias.get('2026-09-24'))).toBe('planificada');
    expect(dias.get('2026-09-23')).toBeUndefined();
  });
});

describe('cliente rotativo (D1…Dn)', () => {
  const program = rotativo([micro(1, '2026-09-21', ['A', 'B', 'C'], [sesion('A', '2026-09-21')])]);
  const hoy = '2026-09-23';
  const items = sesionesDelPlan({ program, client: ROTATIVO, hoy });

  it('las sesiones caen en su posición de la vuelta, descansos incluidos', () => {
    expect(items.map((i) => [i.hoja, i.fecha, i.estado])).toEqual([
      ['A', '2026-09-21', 'hecha'],
      ['B', '2026-09-22', 'pendiente'],
      ['C', '2026-09-24', 'planificada'],
    ]);
  });
});

describe('atrasar', () => {
  const program = semanal([
    micro(2, '2026-09-21', ['Push', 'Pull', 'Legs'], [sesion('Push', '2026-09-21')]),
    micro(3, '2026-09-28', ['Push', 'Pull', 'Legs']),
  ]);
  const hoy = '2026-09-24';
  const items = sesionesDelPlan({ program, client: SEMANAL, hoy });

  it('solo desde hoy en adelante y desde un día con algo por hacer', () => {
    expect(puedeAtrasarDesde(items, '2026-09-24', hoy)).toBe(true);
    expect(puedeAtrasarDesde(items, '2026-09-22', hoy)).toBe(false);
    expect(puedeAtrasarDesde(items, '2026-09-26', hoy)).toBe(false);
    expect(movidasDeAtrasar(items, '2026-09-26', 1, hoy).ok).toBe(false);
    expect(movidasDeAtrasar(items, '2026-09-24', 0, hoy).ok).toBe(false);
  });

  it('corre esa y todas las siguientes sin hacer, las del siguiente también', () => {
    const { movidas } = movidasDeAtrasar(items, '2026-09-24', 2, hoy);
    expect(movidas.map((m) => [m.semana, m.hoja, m.vez, m.antes, m.despues])).toEqual([
      [2, 'Push', 1, '2026-09-24', '2026-09-26'],
      [2, 'Legs', 0, '2026-09-25', '2026-09-27'],
      [3, 'Push', 0, '2026-09-28', '2026-09-30'],
      [3, 'Pull', 0, '2026-09-29', '2026-10-01'],
      [3, 'Push', 1, '2026-10-01', '2026-10-03'],
      [3, 'Legs', 0, '2026-10-02', '2026-10-04'],
    ]);
    /* Lo pendiente de antes (el Pull del martes) no se toca. */
    expect(movidas.some((m) => m.semana === 2 && m.hoja === 'Pull')).toBe(false);
  });

  it('las sesiones siguen en su microciclo; solo cambia la fecha', () => {
    const { movidas } = movidasDeAtrasar(items, '2026-09-24', 7, hoy);
    const plans = planesConMovidas([], 'c1', movidas);
    const despues = sesionesDelPlan({ program, client: SEMANAL, hoy, plans });
    const legs = despues.find((i) => i.weekNumber === 2 && i.hoja === 'Legs');
    expect(legs.fechaPlan).toBe('2026-10-02');
    expect(legs.actual).toBe(true);
    expect(resumenDelMicrociclo(despues).texto).toBe('1 de 4 hechas · 3 por hacer');
  });
});

describe('la dieta sigue al plan', () => {
  const program = semanal([micro(2, '2026-09-21', ['Push', 'Pull', 'Legs'], [sesion('Push', '2026-09-21')])]);
  const hoy = '2026-09-24';
  const items = sesionesDelPlan({ program, client: SEMANAL, hoy });
  const micros = program.microcycles;

  it('pasado: la fecha real; de hoy en adelante: la planificada', () => {
    expect(entrenaElDia('2026-09-21', { items, micros, hoy })).toBe(true);
    /* El Pull del martes no se hizo: ese día fue de descanso. */
    expect(entrenaElDia('2026-09-22', { items, micros, hoy })).toBe(false);
    expect(entrenaElDia('2026-09-24', { items, micros, hoy })).toBe(true);
    expect(entrenaElDia('2026-09-26', { items, micros, hoy })).toBe(null);

    const { movidas } = movidasDeAtrasar(items, '2026-09-24', 1, hoy);
    const atrasado = sesionesDelPlan({ program, client: SEMANAL, hoy, plans: planesConMovidas([], 'c1', movidas) });
    expect(entrenaElDia('2026-09-24', { items: atrasado, micros, hoy })).toBe(false);
    expect(entrenaElDia('2026-09-26', { items: atrasado, micros, hoy })).toBe(true);
  });

  it('cambia de casilla solo si la de siempre es de la otra clase', () => {
    const slots = [
      { key: 'Lunes', rest: false },
      { key: 'Martes', rest: false },
      { key: 'Miércoles', rest: true },
      { key: 'Jueves', rest: false },
    ];
    const nutrition = {
      days: [{ id: 'alta', name: 'Alta' }, { id: 'baja', name: 'Baja' }],
      week: { Lunes: 'alta', Martes: 'alta', Miércoles: 'baja', Jueves: 'alta' },
    };
    expect(casillaParaLaDieta(nutrition, slots, 'Jueves', false)).toBe('Miércoles');
    expect(casillaParaLaDieta(nutrition, slots, 'Miércoles', true)).toBe('Lunes');
    expect(casillaParaLaDieta(nutrition, slots, 'Martes', true)).toBe('Martes');
    expect(casillaParaLaDieta(nutrition, slots, 'Martes', null)).toBe('Martes');
  });
});

describe('lo que ve el entrenador', () => {
  it('una línea por cliente, resumida si hay varios atrasos', () => {
    expect(lineaDeAtrasos([{ desde: '2026-09-24', dias: 2 }], { conDieta: true })).toBe('Desde el jue 24 · 2 días · dieta ajustada');
    expect(lineaDeAtrasos([{ desde: '2026-09-24', dias: 1 }])).toBe('Desde el jue 24 · 1 día');
    expect(
      lineaDeAtrasos([
        { desde: '2026-09-26', dias: 1 },
        { desde: '2026-09-24', dias: 1 },
        { desde: '2026-09-30', dias: 3 },
      ])
    ).toBe('3 atrasos · desde el jue 24');
  });

  it('marca los días que quedaron libres', () => {
    const dias = diasAtrasados([{ id: 'x', desde: '2026-09-24', dias: 2 }]);
    expect([...dias.keys()]).toEqual(['2026-09-24', '2026-09-25']);
  });
});

describe('el aviso llega a la bandeja, una línea por cliente', () => {
  const filas = [
    { id: 'a1', client_id: 'c1', desde: '2026-09-24', dias: 2, seen_at: null },
    { id: 'a2', client_id: 'c1', desde: '2026-09-27', dias: 1, seen_at: null },
    { id: 'a3', client_id: 'c2', desde: '2026-09-25', dias: 1, seen_at: null },
    { id: 'a4', client_id: 'c2', desde: '2026-09-20', dias: 1, seen_at: '2026-09-21T10:00:00Z' },
  ];
  const nutrition = { c2: { days: [{ id: 'alta' }, { id: 'baja' }] } };

  it('resume a quien atrasó varias veces y dice lo de la dieta solo si es verdad', () => {
    expect(lineasDeAtrasos(filas, nutrition)).toEqual({
      c1: '2 atrasos · desde el jue 24',
      c2: 'Desde el vie 25 · 1 día · dieta ajustada',
    });
  });

  it('sale en su tarea y en la cola de Hoy, al lado de «Sin leer»', () => {
    const clients = [
      { id: 'c1', name: 'Ana', paymentStatus: 'paid', onboardingComplete: true, clientProfileId: 'u1' },
      { id: 'c2', name: 'Beto', paymentStatus: 'paid', onboardingComplete: true, clientProfileId: 'u2' },
    ];
    const rows = buildPortfolio({ clients, atrasoLineas: lineasDeAtrasos(filas, nutrition) }, '2026-09-24');
    const tarea = portfolioInbox(rows).tasks.find((t) => t.id === 'atrasado');
    expect(tarea.rows.map((r) => [r.client.id, r.why])).toEqual([
      ['c1', '2 atrasos · desde el jue 24'],
      ['c2', 'Desde el vie 25 · 1 día · dieta ajustada'],
    ]);
    const colas = colasDeInicio(rows, '2026-09-24').map((c) => c.id);
    expect(colas.indexOf('atrasos')).toBe(colas.indexOf('leer') + 1);
    expect(colasDeInicio(rows, '2026-09-24').find((c) => c.id === 'atrasos').n).toBe(2);
  });
});

/* ── Semanal sin días asignados: todas las hojas van «Sin día» ───────────── */

describe('un plan sin días', () => {
  const SIN_DIAS = Object.fromEntries(Object.keys(SPLIT).map((d) => [d, 'Descanso']));
  const program = {
    weeklySplit: SIN_DIAS,
    mobilityDrills: [],
    microcycles: [micro(2, '2026-09-10', ['Push', 'Pull', 'Legs'], [sesion('Push', '2026-09-10'), sesion('Pull', '2026-09-21', 0)])],
  };
  const items = sesionesDelPlan({ program, client: SEMANAL, hoy: '2026-09-23' });

  it('no inventa fechas: lo que falta queda sin día, y el resumen lo dice', () => {
    expect(items.filter((i) => !i.hecha).every((i) => i.estado === 'sin_planificar')).toBe(true);
    expect(resumenDelMicrociclo(items).texto).toBe('1 de 3 hechas · 2 sin día');
    expect(sesionesSinDia(items).map((s) => s.hoja)).toEqual(['Pull', 'Legs']);
  });
});
