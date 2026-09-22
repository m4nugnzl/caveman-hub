import { describe, expect, it } from 'vitest';

import { proximaDelMicrociclo } from '@/components/Client/hoy';
import {
  blockSummary,
  cicloPorAbrir,
  currentBlock,
  microcicloDeLaSemana,
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
    expect(r.microciclos).toEqual([{ semana: 1, hechas: 3, planificadas: 4 }]);

    const demas = semanal([
      sesion('Push', '2026-09-14'),
      sesion('Push', '2026-09-15'),
      sesion('Push', '2026-09-17'),
      sesion('Legs', '2026-09-18'),
    ]);
    expect(blockSummary(demas, currentBlock(demas), SEMANAL)).toMatchObject({ hechas: 3, planificadas: 4, adherencia: 75 });
  });

  it('las sesiones de una hoja que ya no está en el plan cuentan como antes', () => {
    const p = semanal([sesion('Push', '2026-09-14'), sesion('Brazos', '2026-09-16')]);
    expect(blockSummary(p, currentBlock(p), SEMANAL)).toMatchObject({ hechas: 2, planificadas: 4 });
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

