import { describe, expect, it } from 'vitest';

import { proximaDelMicrociclo } from '@/components/Client/hoy';
import {
  blockSummary,
  cicloPorAbrir,
  currentBlock,
  microcicloDeLaSemana,
  tramoDelBloque,
  vecesDeLaHoja,
} from './blocks';
import { vecesDeCadaHoja } from './training';

/* ══════════════════════════════════════════════════════════════════════════
   F2a DEL MICROCICLO COMO SECUENCIA: se cuentan APARICIONES.

   Una hoja que cae dos días del microciclo pide dos sesiones. Antes se contaba
   como conjunto: con Push el lunes y el jueves, hacer Push una vez daba el
   microciclo por cerrado. Ver `docs/estudio-microciclo-secuencia.md` §5.
   ══════════════════════════════════════════════════════════════════════════ */

const dia = (dayName) => ({
  dayName,
  exercises: [{ id: `e-${dayName}`, name: 'Press', sets: [{ kg: '', reps: '', rir: '' }, { kg: '', reps: '', rir: '' }] }],
});

/** Una sesión terminada con `series` series anotadas. */
const sesion = (dayName, fecha, series = 2) => ({
  id: `s-${dayName}-${fecha}`,
  dayName,
  date: fecha,
  endedAt: `${fecha}T11:00:00Z`,
  entries: [{ exerciseId: `e-${dayName}`, name: 'Press', sets: Array.from({ length: series }, () => ({ kg: 60, reps: 8 })) }],
});

const micro = (weekNumber, date, hojas, sessions = []) => ({
  weekNumber,
  id: `m${weekNumber}`,
  date,
  days: hojas.map(dia),
  sessions,
});

/* ── Semanal: Push el lunes y el jueves ───────────────────────────────────── */

const SPLIT = {
  Lunes: 'Push',
  Martes: 'Pull',
  Miércoles: 'Descanso',
  Jueves: 'Push',
  Viernes: 'Legs',
  Sábado: 'Descanso',
  Domingo: 'Descanso',
};
const SEMANAL = { cycleType: 'weekly', cyclePattern: { train: 2, rest: 1 } };
const HOJAS = ['Push', 'Pull', 'Legs'];

const semanal = (sessions) => ({
  weeklySplit: SPLIT,
  mobilityDrills: [],
  microcycles: [micro(1, '2026-09-14', HOJAS, sessions)],
});

describe('semanal con Push el lunes y el jueves', () => {
  it('Push pide dos sesiones; lo que no cae en ningún día, una', () => {
    const p = semanal([]);
    expect(vecesDeCadaHoja(microcicloDeLaSemana(p, 1, SEMANAL))).toEqual(
      new Map([['Push', 2], ['Pull', 1], ['Legs', 1]])
    );
    const veces = vecesDeLaHoja(p, 1, SEMANAL);
    expect(veces('Push')).toBe(2);
    expect(veces('Brazos')).toBe(1);
  });

  it('cicloPorAbrir: con un solo Push el microciclo no está cerrado', () => {
    const uno = semanal([sesion('Push', '2026-09-14'), sesion('Pull', '2026-09-15'), sesion('Legs', '2026-09-18')]);
    expect(cicloPorAbrir(uno, SEMANAL)).toBeNull();

    const dos = semanal([
      sesion('Push', '2026-09-14'),
      sesion('Pull', '2026-09-15'),
      sesion('Push', '2026-09-17'),
      sesion('Legs', '2026-09-18'),
    ]);
    expect(cicloPorAbrir(dos, SEMANAL)).toBe(2);
  });

  it('blockSummary: cuatro planificadas, y un tercer Push no sube la adherencia', () => {
    const tres = semanal([sesion('Push', '2026-09-14'), sesion('Pull', '2026-09-15'), sesion('Legs', '2026-09-18')]);
    const r = blockSummary(tres, currentBlock(tres), SEMANAL);
    expect(r.planificadas).toBe(4);
    expect(r.hechas).toBe(3);
    expect(r.adherencia).toBe(75);
    expect(r.microciclos).toEqual([{ semana: 1, hechas: 3, planificadas: 4, extra: 0 }]);

    const demas = semanal([
      sesion('Push', '2026-09-14'),
      sesion('Push', '2026-09-15'),
      sesion('Push', '2026-09-17'),
      sesion('Legs', '2026-09-18'),
    ]);
    expect(blockSummary(demas, currentBlock(demas), SEMANAL)).toMatchObject({ hechas: 3, planificadas: 4, adherencia: 75 });
  });

  it('las sesiones de una hoja que no está en el plan van a «extra», no a «hechas»', () => {
    const p = semanal([sesion('Push', '2026-09-14'), sesion('Brazos', '2026-09-16')]);
    expect(blockSummary(p, currentBlock(p), SEMANAL)).toMatchObject({ hechas: 1, extra: 1, planificadas: 4, adherencia: 25 });
  });

  it('proximaDelMicrociclo: el segundo Push toca aunque el primero esté hecho', () => {
    const p = semanal([sesion('Push', '2026-09-14'), sesion('Pull', '2026-09-15')]);
    const secuencia = microcicloDeLaSemana(p, 1, SEMANAL);
    expect(proximaDelMicrociclo(p.microcycles, secuencia)).toMatchObject({ dayName: 'Push', hechas: 0, series: 2 });
    /* Sin la secuencia, el orden de las hojas: lo de antes. */
    expect(proximaDelMicrociclo(p.microcycles)).toMatchObject({ dayName: 'Legs' });
  });

  it('proximaDelMicrociclo: sigue el orden de los días, no el de las hojas', () => {
    const split = { ...SPLIT, Lunes: 'Legs', Viernes: 'Push' };
    const p = { ...semanal([]), weeklySplit: split };
    expect(proximaDelMicrociclo(p.microcycles, microcicloDeLaSemana(p, 1, SEMANAL))).toMatchObject({
      dayName: 'Legs',
    });
  });

  it('proximaDelMicrociclo: la i-ésima sesión por fecha cubre la i-ésima aparición', () => {
    /* El jueves a medias: el primer Push está entero, el segundo lleva una serie. */
    const p = semanal([sesion('Push', '2026-09-14'), sesion('Pull', '2026-09-15'), sesion('Push', '2026-09-17', 1)]);
    expect(proximaDelMicrociclo(p.microcycles, microcicloDeLaSemana(p, 1, SEMANAL))).toMatchObject({
      dayName: 'Push',
      hechas: 1,
    });
  });

  it('con una sola aparición manda la mejor de sus sesiones, como antes', () => {
    const p = semanal([
      sesion('Push', '2026-09-14', 0),
      sesion('Push', '2026-09-15'),
      sesion('Push', '2026-09-17'),
      sesion('Pull', '2026-09-16'),
    ]);
    const unaVez = { ...p, weeklySplit: { ...SPLIT, Jueves: 'Descanso' } };
    expect(proximaDelMicrociclo(unaVez.microcycles, microcicloDeLaSemana(unaVez, 1, SEMANAL))).toMatchObject({
      dayName: 'Legs',
    });
  });

  it('sin días asignados cada hoja cuenta una vez: nada cambia', () => {
    const p = { ...semanal([sesion('Push', '2026-09-14'), sesion('Pull', '2026-09-15'), sesion('Legs', '2026-09-16')]), weeklySplit: {} };
    expect(cicloPorAbrir(p, SEMANAL)).toBe(2);
    expect(blockSummary(p, currentBlock(p), SEMANAL)).toMatchObject({ hechas: 3, planificadas: 3, adherencia: 100 });
  });
});

/* ── Rotativo ──────────────────────────────────────────────────────────────── */

const ROTATIVO = { cycleType: 'rotating', cyclePattern: { train: 2, rest: 1 } };
const TRES = ['A', 'B', 'C'];

/** Tres hojas y una secuencia guardada «2-1 2-1» que repite A: A B · C A ·. */
const rotativo = (sessions, microciclo) => ({
  weeklySplit: {},
  mobilityDrills: [],
  microcycles: [micro(1, '2026-09-14', TRES, sessions)],
  blocks: [
    {
      id: 'b_1',
      name: 'Bloque 1',
      fromWeek: 1,
      toWeek: null,
      sessions: TRES.map(dia),
      ...(microciclo ? { microciclo } : {}),
    },
  ],
});
const A_B_C_A = {
  tipo: 'rotativo',
  dias: [{ hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'C' }, { hoja: 'A' }, { descanso: true }],
};

describe('rotativo', () => {
  it('derivado del patrón cada hoja sale una vez: nada cambia', () => {
    const p = rotativo([sesion('A', '2026-09-14'), sesion('B', '2026-09-15'), sesion('C', '2026-09-17')]);
    expect(cicloPorAbrir(p, ROTATIVO)).toBe(2);
    expect(blockSummary(p, currentBlock(p), ROTATIVO)).toMatchObject({ hechas: 3, planificadas: 3 });
  });

  it('con A dos veces en la secuencia, hacen falta dos A', () => {
    const una = rotativo([sesion('A', '2026-09-14'), sesion('B', '2026-09-15'), sesion('C', '2026-09-17')], A_B_C_A);
    expect(cicloPorAbrir(una, ROTATIVO)).toBeNull();
    expect(blockSummary(una, currentBlock(una), ROTATIVO)).toMatchObject({ hechas: 3, planificadas: 4, adherencia: 75 });

    const dos = rotativo(
      [sesion('A', '2026-09-14'), sesion('B', '2026-09-15'), sesion('C', '2026-09-17'), sesion('A', '2026-09-18')],
      A_B_C_A
    );
    expect(cicloPorAbrir(dos, ROTATIVO)).toBe(2);
    expect(blockSummary(dos, currentBlock(dos), ROTATIVO)).toMatchObject({ hechas: 4, planificadas: 4, adherencia: 100 });
  });

  it('proximaDelMicrociclo recorre la secuencia: A B C A', () => {
    const p = rotativo([sesion('A', '2026-09-14'), sesion('B', '2026-09-15'), sesion('C', '2026-09-17')], A_B_C_A);
    expect(proximaDelMicrociclo(p.microcycles, microcicloDeLaSemana(p, 1, ROTATIVO))).toMatchObject({
      dayName: 'A',
      hechas: 0,
    });
  });
});

/* ── Lo previsto de un bloque ──────────────────────────────────────────────── */

describe('previstoHasta mide cada semana que falta con la secuencia entera', () => {
  const SEIS = ['Legs A', 'Push A', 'Pull A', 'Legs B', 'Push B', 'Pull B'];
  const cuatro = [0, 9, 18, 27].map((d, i) =>
    micro(i + 1, new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10), SEIS)
  );

  it('rotativo 2-1 con seis hojas: nueve días por semana, no tres', () => {
    const p = {
      weeklySplit: {},
      mobilityDrills: [],
      microcycles: cuatro,
      blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null, plannedWeeks: 6, sessions: SEIS.map(dia) }],
    };
    const tramo = tramoDelBloque(p, currentBlock(p), ROTATIVO);
    expect(tramo.hasta).toBe('2026-09-05');
    expect(tramo.previstoHasta).toBe('2026-09-23'); // 5 sep + 2 × 9; antes, 11 sep
  });

  it('semanal: siete días por semana, como antes', () => {
    const p = {
      weeklySplit: SPLIT,
      mobilityDrills: [],
      microcycles: [micro(1, '2026-09-14', HOJAS), micro(2, '2026-09-21', HOJAS)],
      blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null, plannedWeeks: 4 }],
    };
    const tramo = tramoDelBloque(p, currentBlock(p), SEMANAL);
    expect(tramo.hasta).toBe('2026-09-27');
    expect(tramo.previstoHasta).toBe('2026-10-11');
  });
});

/* ── La adherencia no pasa del 100 % (22 sep) ──────────────────────────────
   Casos de la copia del 22 sep: las sesiones de hojas que ya no están en el
   plan sumaban a «hechas» sin sumar a «planificadas». */

/** Un bloque con plan, un microciclo por cada lista de sesiones. */
const conPlan = (hojas, semanas) => ({
  weeklySplit: {},
  mobilityDrills: [],
  microcycles: semanas.map((ses, i) => micro(i + 1, `2026-08-${String(3 + 7 * i).padStart(2, '0')}`, hojas, ses)),
  blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null, sessions: hojas.map(dia) }],
});

describe('adherencia con hojas fuera del plan', () => {
  it('Gustavo Dueñas: le quitaron tres hojas ya entrenadas; 4 de 1 (400 %) pasa a 1 de 1 y 3 extra', () => {
    const cuatro = (f) => ['Torso A', 'Pierna A', 'Torso B', 'Pierna B'].map((h, i) => sesion(h, `2026-08-0${f + i}`));
    const p = conPlan(['Pierna B'], [cuatro(3)]);
    const r = blockSummary(p, currentBlock(p));
    expect(r).toMatchObject({ hechas: 1, extra: 3, planificadas: 1, adherencia: 100 });
    expect(r.microciclos).toEqual([{ semana: 1, hechas: 1, planificadas: 1, extra: 3 }]);
  });

  it('Javier Bolaños: hojas renombradas; 5 de 4 (125 %) pasa a 2 de 4 y 3 extra', () => {
    const ses = ['TORSO', 'PIERNA B', 'EMPUJE', 'TIRÓN', 'PIERNA A'].map((h, i) => sesion(h, `2026-08-0${3 + i}`));
    const p = conPlan(['TORSO A', 'PIERNA A', 'TORSO B', 'PIERNA B'], [ses]);
    expect(blockSummary(p, currentBlock(p))).toMatchObject({ hechas: 2, extra: 3, planificadas: 4, adherencia: 50 });
  });

  it('ningún microciclo pasa de lo planificado', () => {
    const ses = ['A', 'B', 'X', 'Y', 'Z'].map((h, i) => sesion(h, `2026-08-0${3 + i}`));
    const p = conPlan(['A', 'B'], [ses, ses]);
    const r = blockSummary(p, currentBlock(p));
    for (const m of r.microciclos) expect(m.hechas).toBeLessThanOrEqual(m.planificadas);
    expect(r.adherencia).toBe(100);
    expect(r.extra).toBe(6);
  });
});
