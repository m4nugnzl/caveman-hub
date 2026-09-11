import { describe, expect, it } from 'vitest';

import { buildStrip, buildTape, tramoDeHojas } from './hojas';

/*
  ══ La cinta de hojas del teléfono ═══════════════════════════════════════════

  Lo que tiene que ser cierto no es que una función devuelva un array: es que el
  cliente pueda recorrer su programa con el dedo sin que se le pierda nada por
  el camino. Tres cosas, y las tres han fallado alguna vez en esta pantalla:

  · Las sesiones salen en el orden en que se ENTRENAN, cruzando microciclos.
  · Cada microciclo se ordena con el reparto de días que tenía ENTONCES, no con
    el de hoy: un bloque cerrado se lleva el suyo congelado.
  · El «hoy» es de un solo microciclo. Marcarlo en todos pondría la marca de
    esta semana en el jueves de hace dos meses.
*/

const dia = (dayName, series = 2) => ({
  dayName,
  exercises: [{ id: `${dayName}-1`, name: 'Sentadilla', sets: Array.from({ length: series }, () => ({})) }],
});

const micro = (weekNumber, dias) => ({ weekNumber, days: dias, sessions: [] });

const PROGRAMA = [micro(1, [dia('Empuje'), dia('Tirón')]), micro(2, [dia('Empuje'), dia('Tirón')])];

describe('buildTape', () => {
  it('pone el programa entero en fila, microciclo a microciclo', () => {
    const hojas = buildTape({ microcycles: PROGRAMA, splitDe: () => ({}), cycleType: 'weekly' });

    expect(hojas.map((h) => h.clave)).toEqual(['1:Empuje', '1:Tirón', '2:Empuje', '2:Tirón']);
    expect(hojas.every((h) => h.tipo === 'sesion')).toBe(true);
  });

  it('ordena cada microciclo con el reparto de días de SU bloque', () => {
    /* El bloque viejo entrenaba el tirón primero; el abierto, el empuje. */
    const splitDe = (semana) =>
      semana === 1
        ? { Lunes: 'Tirón', Miércoles: 'Empuje' }
        : { Lunes: 'Empuje', Miércoles: 'Tirón' };

    const hojas = buildTape({ microcycles: PROGRAMA, splitDe, cycleType: 'weekly' });

    expect(hojas.map((h) => h.clave)).toEqual(['1:Tirón', '1:Empuje', '2:Empuje', '2:Tirón']);
  });

  it('marca «hoy» solo en el último microciclo', () => {
    /* Con reparto por días, `buildStrip` mira el día de la semana. Sea cual sea
       el día en que corra la prueba, la marca no puede aparecer dos veces. */
    const split = Object.fromEntries(
      ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => [d, 'Empuje'])
    );
    const hojas = buildTape({
      microcycles: PROGRAMA,
      splitDe: () => split,
      cycleType: 'weekly',
    });

    const conHoy = hojas.filter((h) => h.entry.isToday);
    expect(conHoy).toHaveLength(1);
    expect(conHoy[0].weekNumber).toBe(2);
  });

  it('cierra la cinta con la hoja del microciclo que aún no existe', () => {
    const hojas = buildTape({
      microcycles: PROGRAMA,
      splitDe: () => ({}),
      cycleType: 'weekly',
      conNueva: true,
    });

    expect(hojas[hojas.length - 1]).toMatchObject({ tipo: 'nueva', weekNumber: 3 });
  });

  it('sin un solo microciclo no hay nada que continuar', () => {
    expect(buildTape({ microcycles: [], splitDe: () => ({}), cycleType: 'weekly', conNueva: true })).toEqual([]);
  });
});

describe('tramoDeHojas', () => {
  const hojas = buildTape({
    microcycles: PROGRAMA,
    splitDe: () => ({}),
    cycleType: 'weekly',
    conNueva: true,
  });

  it('da las sesiones del microciclo abierto y sus dos vecinas de fuera', () => {
    /* Abierta la primera del microciclo 2: dentro, sus dos sesiones; a la
       izquierda, la última del 1; a la derecha, la hoja del que viene. */
    expect(tramoDeHojas(hojas, 2)).toEqual({ desde: 2, hasta: 3, anterior: 1, siguiente: 4 });
  });

  it('en el primer microciclo no hay nada a la izquierda', () => {
    expect(tramoDeHojas(hojas, 0)).toMatchObject({ desde: 0, hasta: 1, anterior: -1 });
  });

  it('mirando la hoja nueva se sigue enseñando el último microciclo', () => {
    /* La hoja del microciclo que aún no existe no es de ninguno: mientras se
       mira, la tira no puede quedarse vacía. */
    expect(tramoDeHojas(hojas, 4)).toEqual({ desde: 2, hasta: 3, anterior: 1, siguiente: 4 });
  });

  it('fuera de la cinta se cae al último tramo, nunca a la nada', () => {
    expect(tramoDeHojas(hojas, 99)).toEqual(tramoDeHojas(hojas, hojas.length - 1));
  });
});

describe('buildStrip', () => {
  it('sin reparto por días, la tira son las sesiones en el orden en que están', () => {
    const { entries } = buildStrip({
      days: [dia('Empuje'), dia('Tirón')],
      weeklySplit: {},
      cycleType: 'weekly',
      microcycle: PROGRAMA[0],
    });

    expect(entries.map((e) => e.name)).toEqual(['Empuje', 'Tirón']);
    expect(entries.every((e) => e.isToday)).toBe(false);
  });

  it('cuenta las series planificadas de cada sesión', () => {
    const { entries } = buildStrip({
      days: [dia('Empuje', 3)],
      weeklySplit: {},
      cycleType: 'weekly',
      microcycle: PROGRAMA[0],
    });

    expect(entries[0]).toMatchObject({ planned: 3, logged: 0 });
  });
});

describe('un microciclo sin días', () => {
  it('no deja la cinta sin salida: enseña el último tramo', () => {
    const hojas = buildTape({ microcycles: PROGRAMA, splitDe: () => ({}), cycleType: 'weekly' });

    /* -1 es «la hoja abierta no está en la cinta»: el microciclo que se está
       mirando no tiene ni un día puesto, así que no tiene ninguna hoja. */
    expect(tramoDeHojas(hojas, -1)).toEqual(tramoDeHojas(hojas, hojas.length - 1));
  });

  it('sin ninguna hoja no hay nada que enseñar', () => {
    expect(tramoDeHojas([], -1)).toEqual({ desde: 0, hasta: -1, anterior: -1, siguiente: -1 });
  });
});
