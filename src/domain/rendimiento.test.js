import { describe, expect, it } from 'vitest';

import { e1rm } from './sessions';
import {
  cambioEnElBloque,
  cambioMedio,
  cargaIndexada,
  direccionConRuido,
  frenados,
  indiceMedio,
  lecturaDelBloque,
  lineaDeRendimiento,
  mejorSerie,
  rendimientoDeLaTemporada,
  rendimientoDeSerie,
  rendimientoDelBloque,
  rendimientoPorGrupo,
  rendimientoPorHoja,
  ruidoDelEjercicio,
  seriesDelMicrociclo,
  seriesPorSemana,
  variacionDelCambio,
  variacionTexto,
} from './rendimiento';
import { strengthByExercise, strengthTrend } from './reading';
import { cercaDelFallo, esSerieEfectiva } from './sessions';

const semana = (lunes, bloque) => ({
  lunes,
  jueves: new Date(Date.parse(`${lunes}T00:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10),
  domingo: new Date(Date.parse(`${lunes}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10),
  bloque: bloque ? { id: bloque, nombre: bloque } : null,
});

const sesion = (date, entries) => ({ id: `s-${date}`, date, dayName: 'Día A', entries });
const programa = ({ sesiones, blocks }) => ({
  microcycles: [{ weekNumber: 1, date: '2026-09-07', days: [], sessions: sesiones }],
  blocks,
});

describe('e1rm — la única copia de Epley', () => {
  it('compara series de rangos distintos', () => {
    expect(e1rm(90, 8)).toBeCloseTo(114);
    expect(e1rm(100, 1)).toBe(100);
  });
  it('con tope, no mide lo que pasa de él', () => {
    expect(e1rm(60, 15, { hasta: 12 })).toBe(0);
    expect(e1rm(60, 12, { hasta: 12 })).toBeCloseTo(84);
  });
});

describe('qué serie cuenta', () => {
  it('sin RIR cuenta; con RIR, solo cerca del fallo', () => {
    expect(cercaDelFallo({ rir: '' })).toBe(true);
    expect(cercaDelFallo({ rir: '2' })).toBe(true);
    expect(cercaDelFallo({ rir: '5' })).toBe(false);
    expect(esSerieEfectiva({ reps: '10', rir: '1' })).toBe(true);
    expect(esSerieEfectiva({ reps: '10', rir: '4' })).toBe(false);
    expect(esSerieEfectiva({ reps: '', rir: '' })).toBe(false);
  });
});

describe('rendimientoDeLaTemporada', () => {
  const semanas = [semana('2026-09-07', 'b1'), semana('2026-09-14', 'b1'), semana('2026-09-21', 'b2')];

  it('mide cada referencia contra su primera semana del bloque, y reinicia en el siguiente', () => {
    const program = programa({
      blocks: [
        { id: 'b1', name: 'B1', fromWeek: 1, toWeek: 1, referencias: [{ nombre: 'Press inclinado' }] },
        { id: 'b2', name: 'B2', fromWeek: 2, toWeek: null, referencias: [{ nombre: 'Press inclinado' }] },
      ],
      sesiones: [
        sesion('2026-09-08', [{ name: 'Press inclinado', sets: [{ kg: '80', reps: '10', rir: '1' }] }]),
        /* La de 90 × 10 va a RIR 5: no cuenta. La mejor que cuenta es 82 × 10. */
        sesion('2026-09-15', [
          {
            name: 'Press inclinado',
            sets: [
              { kg: '90', reps: '10', rir: '5' },
              { kg: '82', reps: '10', rir: '2' },
            ],
          },
        ]),
        sesion('2026-09-22', [{ name: 'Press inclinado', sets: [{ kg: '70', reps: '12', rir: '' }] }]),
      ],
    });
    const { bloques } = rendimientoDeLaTemporada({ program, semanas });
    expect(bloques.map((b) => b.id)).toEqual(['b1', 'b2']);
    const [p1] = bloques[0].referencias;
    expect(p1.puntos.map((p) => Math.round(p.pct * 1000) / 1000)).toEqual([0, 0.025]);
    expect(p1.puntos[1].serie).toEqual({ kg: 82, reps: 10, rir: 2 });
    /* El bloque nuevo empieza en cero aunque el peso baje. */
    expect(bloques[1].referencias[0].puntos[0].pct).toBe(0);
  });

  it('las series de más de 12 repeticiones no comparan', () => {
    const program = programa({
      blocks: [{ id: 'b1', name: 'B1', fromWeek: 1, toWeek: null, referencias: [{ nombre: 'Curl' }] }],
      sesiones: [
        sesion('2026-09-08', [{ name: 'Curl', sets: [{ kg: '20', reps: '10' }] }]),
        sesion('2026-09-15', [{ name: 'Curl', sets: [{ kg: '20', reps: '20' }] }]),
      ],
    });
    const { bloques } = rendimientoDeLaTemporada({ program, semanas: semanas.slice(0, 2) });
    expect(bloques[0].referencias[0].puntos).toHaveLength(1);
  });

  it('sin referencias, la más registrada', () => {
    const program = programa({
      blocks: [{ id: 'b1', name: 'B1', fromWeek: 1, toWeek: null }],
      sesiones: [
        sesion('2026-09-08', [
          { name: 'Sentadilla', sets: [{ kg: '100', reps: '8' }] },
          { name: 'Prensa', sets: [{ kg: '200', reps: '10' }, { kg: '200', reps: '10' }] },
        ]),
      ],
    });
    const { bloques } = rendimientoDeLaTemporada({ program, semanas: semanas.slice(0, 1) });
    expect(bloques[0].propias).toBe(false);
    expect(bloques[0].referencias.map((r) => r.nombre)).toEqual(['Prensa']);
  });

  it('cuenta las series efectivas de cada semana', () => {
    const program = programa({
      blocks: [{ id: 'b1', name: 'B1', fromWeek: 1, toWeek: null }],
      sesiones: [
        sesion('2026-09-08', [
          { name: 'Remo', sets: [{ kg: '60', reps: '10', rir: '2' }, { kg: '60', reps: '10', rir: '4' }, { kg: '', reps: '' }] },
        ]),
      ],
    });
    const { semanas: porSemana } = rendimientoDeLaTemporada({ program, semanas: semanas.slice(0, 2) });
    expect(porSemana.get('2026-09-07').efectivas).toBe(1);
    expect(porSemana.get('2026-09-14').efectivas).toBe(0);
  });
});

describe('variacionTexto', () => {
  it('solo la variación, entera y con signo tipográfico', () => {
    expect(variacionTexto(-0.021)).toBe('−2 %');
    expect(variacionTexto(0.04)).toBe('+4 %');
    expect(variacionTexto(0.001)).toBe('±0 %');
  });
});

/* ══ El rendimiento de una sesión ═════════════════════════════════════════ */

/* Un microciclo con una sesión de un ejercicio: `[kg, reps, rir?]` por serie;
   `null` es un microciclo programado y sin registrar. */
const micro = (weekNumber, series, nombre = 'Press inclinado') => ({
  weekNumber,
  days: [{ dayName: 'Día A', exercises: [{ name: nombre }] }],
  sessions: series
    ? [
        {
          id: `s${weekNumber}-${nombre}`,
          dayName: 'Día A',
          date: `2026-09-${String(weekNumber).padStart(2, '0')}`,
          entries: [
            {
              name: nombre,
              sets: series.map(([kg, reps, rir = '']) => ({ kg: String(kg), reps: String(reps), rir: String(rir) })),
            },
          ],
        },
      ]
    : [],
});

const PRESS = 'Press inclinado';

describe('rendimientoDeSerie', () => {
  it('es Epley con el RIR sumado a las repeticiones, sin redondear', () => {
    expect(rendimientoDeSerie({ kg: 32, reps: 7 })).toBeCloseTo(32 * (1 + 7 / 30), 10);
    expect(rendimientoDeSerie({ kg: '34', reps: '8', rir: '2' })).toBeCloseTo(34 * (1 + 10 / 30), 10);
    /* 12 kg: de 10 a 11 repeticiones son 0,4 — redondeado al kilo se perdía. */
    expect(rendimientoDeSerie({ kg: 12, reps: 11 }) - rendimientoDeSerie({ kg: 12, reps: 10 })).toBeCloseTo(0.4, 10);
  });
  it('mide también por encima de 12 repeticiones', () => {
    expect(rendimientoDeSerie({ kg: 20, reps: 15 })).toBeCloseTo(30, 10);
  });
  it('sin kilos o sin repeticiones no hay número', () => {
    expect(rendimientoDeSerie({ kg: '', reps: 10 })).toBeNull();
    expect(rendimientoDeSerie({ kg: 0, reps: 10 })).toBeNull();
    expect(rendimientoDeSerie({ kg: 40, reps: '' })).toBeNull();
    expect(rendimientoDeSerie({})).toBeNull();
  });
});

describe('mejorSerie', () => {
  it('la de más rendimiento, no la de más kilos: 34 × 8 le gana a 36 × 4', () => {
    const sesion = micro(1, [[36, 4], [34, 8]]).sessions[0];
    expect(mejorSerie(sesion, PRESS)).toMatchObject({ kg: 34, reps: 8, rir: null });
  });
  it('el RIR decide cuál es la mejor: 34 × 8 a RIR 3 rinde más que 36 × 8 al fallo', () => {
    /* 34 × (1 + 11/30) = 46,47 contra 36 × (1 + 8/30) = 45,6. */
    const sesion = micro(1, [[36, 8, 0], [34, 8, 3]]).sessions[0];
    expect(mejorSerie(sesion, PRESS)).toMatchObject({ kg: 34, reps: 8, rir: 3 });
  });
  it('solo series efectivas: una a RIR 5 no cuenta', () => {
    const sesion = micro(1, [[40, 10, 5], [34, 8, 1]]).sessions[0];
    expect(mejorSerie(sesion, PRESS)).toMatchObject({ kg: 34, reps: 8, rir: 1 });
  });
  it('null si no hizo el ejercicio', () => {
    expect(mejorSerie(micro(1, [[34, 8]]).sessions[0], 'Remo')).toBeNull();
  });
});

describe('lineaDeRendimiento y cambioEnElBloque', () => {
  it('el índice es cada microciclo contra el primero, en base 100', () => {
    const secuencia = [[32, 7], [32, 8], [34, 5], [34, 7], [34, 8], [36, 6], [36, 7], [36, 8]];
    const linea = lineaDeRendimiento(secuencia.map((s, i) => micro(i + 1, [s])), PRESS);
    /* A ±0,1: 34 × 7 da 106,25 y 36 × 6 da 109,46, que redondeados son 106,3 y 109,5. */
    const esperado = [100, 102.7, 100.5, 106.2, 109.1, 109.4, 112.5, 115.5];
    linea.forEach((p, i) => expect(Math.abs(p.indice - esperado[i])).toBeLessThan(0.1));
    expect(linea[0]).toMatchObject({ semana: 1, kg: 32, reps: 7, rir: null });
    expect(cambioEnElBloque(linea)).toMatchObject({ pct: 15.5, dir: 'sube', desde: '32 × 7', hasta: '36 × 8' });
    expect(cambioEnElBloque(linea).indice).toBeCloseTo(115.54, 2);
  });

  it('un microciclo sin registro es un hueco, no un cero, y la base es el primero con dato', () => {
    const linea = lineaDeRendimiento([micro(1, null), micro(2, [[32, 7]]), micro(3, null), micro(4, [[32, 8]])], PRESS);
    expect(linea[0]).toEqual({ semana: 1, kg: null, reps: null, rir: null, valor: null, indice: null });
    expect(linea.map((p) => p.valor === null)).toEqual([true, false, true, false]);
    expect(linea[1].indice).toBe(100);
    expect(cambioEnElBloque(linea).pct).toBe(2.7);
  });

  it('el RIR cambia el resultado: más kilos y peor rendimiento', () => {
    /* Por kilos, 34 × 8 → 36 × 6 sería una subida. Pero la primera iba a
       RIR 3: 34 × (1 + 11/30) = 46,47 contra 36 × (1 + 6/30) = 43,2. */
    const cambio = cambioEnElBloque(lineaDeRendimiento([micro(1, [[34, 8, 3]]), micro(2, [[36, 6, 0]])], PRESS));
    expect(cambio).toMatchObject({ pct: -7, dir: 'baja', desde: '34 × 8', hasta: '36 × 6' });
  });

  it('dentro de ±1 % es igual', () => {
    const cambio = (b) => cambioEnElBloque(lineaDeRendimiento([micro(1, [[100, 8]]), micro(2, [b])], PRESS));
    /* 100 × 8 = 126,67 → 101 × 7 = 124,57: −1,7 %. */
    expect(cambio([101, 7]).dir).toBe('baja');
    expect(cambio([100.5, 8])).toMatchObject({ pct: 0.5, dir: 'igual', hasta: '100,5 × 8' });
  });

  it('sin ningún dato no hay cambio', () => {
    expect(cambioEnElBloque(lineaDeRendimiento([micro(1, null)], PRESS))).toBeNull();
  });
});

describe('rendimientoDelBloque', () => {
  it('cada ejercicio del bloque, medido desde la primera semana del bloque, y el recuento', () => {
    const conRemo = (w, press, remo) => ({
      ...micro(w, press),
      sessions: [...micro(w, press).sessions, ...micro(w, remo, 'Remo').sessions],
    });
    const program = {
      blocks: [
        { id: 'b1', name: 'B1', fromWeek: 1, toWeek: 2 },
        { id: 'b2', name: 'B2', fromWeek: 3, toWeek: null },
      ],
      microcycles: [
        micro(1, [[20, 10]]),
        micro(2, [[30, 10]]),
        /* El bloque 2 empieza en 100 aunque venga de más kilos. */
        conRemo(3, [[28, 10]], [[60, 8]]),
        conRemo(4, [[30, 10]], [[55, 8]]),
      ],
    };
    const { ejercicios, recuento } = rendimientoDelBloque(program, program.blocks[1]);
    expect(ejercicios.map((e) => e.nombre)).toEqual([PRESS, 'Remo']);
    expect(ejercicios[0].linea.map((p) => p.semana)).toEqual([3, 4]);
    expect(ejercicios[0].cambio).toMatchObject({ dir: 'sube', desde: '28 × 10', hasta: '30 × 10' });
    expect(ejercicios[1].cambio.dir).toBe('baja');
    expect(recuento).toEqual({ suben: 1, igual: 0, bajan: 1 });
  });

  it('el grupo es el músculo con el que está programado; sin programar, null', () => {
    const program = {
      blocks: [{ id: 'b1', name: 'B1', fromWeek: 1, toWeek: null }],
      microcycles: [
        { ...micro(1, [[20, 10]]), days: [{ name: 'Día A', exercises: [{ name: PRESS, muscle: 'Pecho' }] }] },
        micro(2, [[22, 10]], 'Remo'),
      ],
    };
    const { ejercicios } = rendimientoDelBloque(program, program.blocks[0]);
    expect(ejercicios.find((e) => e.nombre === PRESS).grupo).toBe('Pecho');
    expect(ejercicios.find((e) => e.nombre === 'Remo').grupo).toBeNull();
  });
});

describe('strengthByExercise y strengthTrend, con el rendimiento', () => {
  it('un ejercicio a 12-15 repeticiones ya tiene dato, y sube', () => {
    const micros = [micro(1, [[20, 13]]), micro(2, [[20, 14]]), micro(3, [[20, 15]])];
    expect(strengthByExercise(micros)[0]).toMatchObject({
      name: PRESS,
      weeks: 3,
      dir: 'up',
      pct: 4.7,
      desde: '20 × 13',
      hasta: '20 × 15',
    });
    expect(strengthTrend(micros)).toMatchObject({ tracked: 1, up: 1, rising: [PRESS] });
  });

  it('una mejora que el 1RM redondeado al kilo se comía', () => {
    const micros = [micro(1, [[12, 10]]), micro(2, [[12, 11]]), micro(3, [[12, 12]])];
    expect(strengthByExercise(micros)[0].dir).toBe('up');
  });

  it('dentro de ±1 % es plano, y con menos de tres microciclos con dato calla', () => {
    const planos = [micro(1, [[100, 8]]), micro(2, [[100, 8]]), micro(3, [[100.5, 8]])];
    expect(strengthByExercise(planos)[0].dir).toBe('flat');
    expect(strengthByExercise(planos.slice(0, 2))).toEqual([]);
  });
});

describe('variacionDelCambio', () => {
  it('redondea una sola vez, desde el índice: 115,46 es «+15 %» como el 115 de la gráfica', () => {
    expect(variacionDelCambio({ pct: 15.5, indice: 115.46 })).toBe('+15 %');
    expect(variacionDelCambio({ pct: -8.2, indice: 91.8 })).toBe('−8 %');
  });
});

/* ══ El rendimiento de un conjunto ═══════════════════════════════════════ */

describe('indiceMedio', () => {
  it('la media de los que tienen dato cada microciclo; sin ninguno, un hueco', () => {
    const a = [{ semana: 1, indice: 100 }, { semana: 2, indice: 110 }, { semana: 3, indice: null }];
    const b = [{ semana: 1, indice: 100 }, { semana: 2, indice: null }, { semana: 3, indice: null }];
    expect(indiceMedio([a, b])).toEqual([
      { semana: 1, indice: 100, ejercicios: 2 },
      { semana: 2, indice: 110, ejercicios: 1 },
      { semana: 3, indice: null, ejercicios: 0 },
    ]);
    expect(indiceMedio([])).toEqual([]);
  });
});

describe('rendimientoPorHoja y rendimientoPorGrupo', () => {
  /* Dos hojas y un ejercicio registrado fuera de ellas. El press sube un 10 %
     (20 × 10 → 22 × 10) y el remo baja un 10 % (60 × 10 → 54 × 10). */
  const sesion2 = (w, press, remo, curl) => ({
    weekNumber: w,
    days: [],
    sessions: [
      {
        id: `s${w}`,
        dayName: 'Push',
        date: `2026-09-0${w}`,
        entries: [
          { name: PRESS, sets: [{ kg: String(press), reps: '10', rir: '' }] },
          { name: 'Remo', sets: [{ kg: String(remo), reps: '10', rir: '' }] },
          ...(curl ? [{ name: 'Curl', sets: [{ kg: String(curl), reps: '10', rir: '' }] }] : []),
        ],
      },
    ],
  });
  const program = {
    blocks: [
      {
        id: 'b1',
        name: 'B1',
        fromWeek: 1,
        toWeek: null,
        sessions: [
          { dayName: 'Push', exercises: [{ name: PRESS, muscle: 'Pecho' }] },
          { dayName: 'Pull', exercises: [{ name: 'Remo', muscle: 'Espalda' }] },
        ],
      },
    ],
    microcycles: [sesion2(1, 20, 60, 10), sesion2(2, 22, 54, null)],
  };

  it('una hoja es la media de sus ejercicios; lo de fuera, al final', () => {
    const hojas = rendimientoPorHoja(program, program.blocks[0]);
    expect(hojas.map((h) => h.nombre)).toEqual(['Push', 'Pull', 'Fuera de las hojas']);
    expect(hojas[0].pct).toBeCloseTo(10, 5);
    expect(hojas[1].pct).toBeCloseTo(-10, 5);
    expect(hojas[0].linea.map((p) => Math.round(p.indice))).toEqual([100, 110]);
    /* El curl solo tiene un registro: 100, sin cambio. */
    expect(hojas[2]).toMatchObject({ pct: 0, linea: [{ indice: 100 }, { indice: null }] });
  });

  it('el grupo sale de las hojas del bloque; sin grupo, al final', () => {
    const grupos = rendimientoPorGrupo(program, program.blocks[0]);
    expect(grupos.map((g) => g.nombre)).toEqual(['Espalda', 'Pecho', 'Sin grupo']);
    expect(grupos[1].ejercicios.map((e) => e.nombre)).toEqual([PRESS]);
  });

  it('el cambio medio es la media de lo que cambia cada uno', () => {
    const { ejercicios } = rendimientoDelBloque(program, program.blocks[0]);
    expect(cambioMedio(ejercicios)).toBeCloseTo(0, 5);
    expect(cambioMedio([])).toBeNull();
  });
});

describe('cargaIndexada', () => {
  it('los kilos de la mejor serie contra los del primer registro', () => {
    const linea = lineaDeRendimiento([micro(1, null), micro(2, [[32, 7]]), micro(3, [[32, 9]]), micro(4, [[36, 8]])], PRESS);
    expect(cargaIndexada(linea)).toEqual([null, 100, 100, 112.5]);
  });
});

describe('seriesDelMicrociclo', () => {
  it('todas las series, y cuál es la que cuenta', () => {
    const m = micro(1, [[30, 10, 1], [34, 8, 5], [32, 9, 0]]);
    /* 34 × 8 a RIR 5 no es efectiva; 32 × 9 al fallo (41,6) le gana a 30 × 10 a RIR 1 (41). */
    expect(seriesDelMicrociclo(m, PRESS)).toEqual({
      fecha: '2026-09-01',
      series: [
        { kg: 30, reps: 10, rir: 1 },
        { kg: 34, reps: 8, rir: 5 },
        { kg: 32, reps: 9, rir: 0 },
      ],
      cuenta: 2,
    });
    expect(seriesDelMicrociclo(micro(1, null), PRESS)).toBeNull();
  });
});

describe('el umbral con ruido (propuesta, sin cablear)', () => {
  const linea = (indices) => indices.map((indice, i) => ({ semana: i + 1, indice, kg: 1, reps: 1 }));
  it('una progresión limpia no baila y sigue subiendo', () => {
    expect(ruidoDelEjercicio(linea([100, 103, 106, 109]))).toBeCloseTo(0, 5);
    expect(direccionConRuido(linea([100, 103, 106, 109]))).toBe('sube');
  });
  it('un +2 al final de una línea que baila cinco puntos es igual', () => {
    const l = linea([100, 105, 101, 104, 102]);
    expect(ruidoDelEjercicio(l)).toBeGreaterThan(2);
    expect(direccionConRuido(l)).toBe('igual');
    expect(cambioEnElBloque(l).dir).toBe('sube');
  });
  it('con menos de dos saltos se queda en ±1 %', () => {
    expect(ruidoDelEjercicio(linea([100, 102]))).toBe(0);
    expect(direccionConRuido(linea([100, 102]))).toBe('sube');
    expect(direccionConRuido([])).toBeNull();
  });
});

describe('seriesPorSemana', () => {
  it('la media de las series efectivas de los microciclos en que lo hizo', () => {
    const micros = [micro(1, [[30, 10], [30, 9], [30, 8]]), micro(2, null), micro(3, [[32, 10], [32, 9, 5]])];
    /* 3 en M1; M3 tiene una a RIR 5, que no es efectiva: 1. M2 no entra. */
    expect(seriesPorSemana(micros, PRESS)).toBe(2);
    expect(seriesPorSemana(micros, 'Remo')).toBeNull();
  });
});

describe('lecturaDelBloque', () => {
  const items = (pcts) => pcts.map((pct, i) => ({ nombre: `E${i + 1}`, pct }));

  it('separa por la mediana y la MAD: lo que se sale, arriba o abajo', () => {
    const l = lecturaDelBloque(items([10, 12, 14, 15, 16, 40, -8]));
    expect(l.separa).toBe(true);
    expect(l.mediana).toBe(14);
    expect(l.encima.map((i) => i.nombre)).toEqual(['E6']);
    expect(l.debajo.map((i) => i.nombre)).toEqual(['E7']);
    expect(l.media.map((i) => i.nombre)).toEqual(['E5', 'E4', 'E3', 'E2', 'E1']);
    expect(l.encima[0].diferencia).toBe(26);
  });

  it('un disparado no ensancha el umbral de los demás', () => {
    const l = lecturaDelBloque(items([10, 11, 12, 13, 14, 300]));
    expect(l.umbral).toBeLessThan(5);
    expect(l.encima.map((i) => i.nombre)).toEqual(['E6']);
  });

  it('con la MAD a cero, el umbral no baja de ±1 %', () => {
    const l = lecturaDelBloque(items([10, 10, 10, 10, 10.5, 12]));
    expect(l.umbral).toBe(1);
    expect(l.encima.map((i) => i.nombre)).toEqual(['E6']);
    expect(l.media).toHaveLength(5);
  });

  it('con menos de cinco no separa nada', () => {
    const l = lecturaDelBloque(items([5, 50, -20, null]));
    expect(l.separa).toBe(false);
    expect(l.media.map((i) => i.pct)).toEqual([50, 5, -20]);
    expect(l.encima).toEqual([]);
    expect(lecturaDelBloque([]).mediana).toBeNull();
  });
});

describe('frenados', () => {
  const linea = (indices) =>
    indices.map((indice, i) => ({ semana: i + 1, indice, kg: indice === null ? null : 30 + i, reps: 10, rir: 2 }));

  it('tres microciclos con registro sin superar su mejor marca', () => {
    const [f] = frenados([{ nombre: 'Press', linea: linea([100, 106, 105, null, 106.5, 104]) }]);
    expect(f).toMatchObject({ nombre: 'Press', desde: 2, microciclos: 3, serie: { kg: 35, reps: 10, rir: 2 } });
  });

  it('el que sigue mejorando, o lleva menos de tres, no sale', () => {
    expect(frenados([{ nombre: 'A', linea: linea([100, 102, 104, 106, 108]) }])).toEqual([]);
    expect(frenados([{ nombre: 'B', linea: linea([100, 108, 107, 107]) }])).toEqual([]);
    expect(frenados([{ nombre: 'C', linea: linea([100, 100, 100]) }])).toEqual([]);
  });

  it('los que más llevan, primero', () => {
    const r = frenados([
      { nombre: 'A', linea: linea([100, 103, 103, 103, 103]) },
      { nombre: 'B', linea: linea([110, 100, 100, 100, 100]) },
    ]);
    expect(r.map((f) => [f.nombre, f.microciclos, f.desde])).toEqual([
      ['B', 4, 1],
      ['A', 3, 2],
    ]);
  });
});
