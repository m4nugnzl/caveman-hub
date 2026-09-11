import { describe, expect, it } from 'vitest';

import { kcalSteps } from './anthropometry';
import {
  dietLog,
  nutritionTrack,
  reviewTimeline,
  timelineSummary,
  windowFrom,
  windowSize,
} from './timeline';

/* El alta cae en LUNES a propósito: la semana de programa se ancla al lunes del
   alta, así que con un lunes los dos ejes coinciden sin desfase y las pruebas
   dicen lo que parece que dicen. Mismo criterio que `week.test.js`. */
const ALTA = '2026-07-27';

/** El lunes de la semana de programa `n`, para escribir los fixtures. */
const lunes = (n) =>
  new Date(Date.parse(`${ALTA}T00:00:00Z`) + (n - 1) * 7 * 86400000).toISOString().slice(0, 10);

describe('reviewTimeline', () => {
  it('devuelve una fila por semana, en orden, sin recortar nada', () => {
    const filas = reviewTimeline({ weeks: [3, 1, 2], startDate: ALTA });

    expect(filas.map((f) => f.week)).toEqual([1, 2, 3]);
    expect(filas[0].weekStart).toBe(lunes(1));
    expect(filas[2].weekStart).toBe(lunes(3));
  });

  /* La regresión que motiva todo esto: con doce semanas se veían diez, y a
     partir de ahí el arranque del cliente desaparecía de la pantalla. */
  it('conserva la primera semana aunque haya muchas', () => {
    const weeks = Array.from({ length: 40 }, (_, i) => i + 1);
    const filas = reviewTimeline({ weeks, startDate: ALTA });

    expect(filas).toHaveLength(40);
    expect(filas[0].week).toBe(1);
  });

  it('cruza el peso por el lunes de cada semana de programa', () => {
    const filas = reviewTimeline({
      weeks: [1, 2],
      startDate: ALTA,
      series: [{ week: lunes(2), weight: 81.4 }],
    });

    expect(filas[0].weight).toBe(null);
    expect(filas[1].weight).toBe(81.4);
  });

  it('rellena las calorías con la foto del plan cuando no hay foto de nutrición', () => {
    const filas = reviewTimeline({
      weeks: [1, 2],
      startDate: ALTA,
      series: [{ week: lunes(1), kcals: 2300 }],
      reviews: [{ weekStart: lunes(2), snapshot: { kcals: 2150 } }],
    });

    expect(filas[0].kcals).toBe(2300);
    expect(filas[1].kcals).toBe(2150);
  });

  it('el dato medido manda sobre el de la revisión cuando están los dos', () => {
    const filas = reviewTimeline({
      weeks: [1],
      startDate: ALTA,
      series: [{ week: lunes(1), kcals: 2300 }],
      reviews: [{ weekStart: lunes(1), snapshot: { kcals: 2150 } }],
    });

    expect(filas[0].kcals).toBe(2300);
  });

  it('marca las semanas que ya tienen respuesta', () => {
    const filas = reviewTimeline({
      weeks: [1, 2],
      startDate: ALTA,
      reviews: [{ weekStart: lunes(1), snapshot: null }],
    });

    expect(filas[0].reviewed).toBe(true);
    expect(filas[1].reviewed).toBe(false);
  });

  /* La tira es una escala, no un álbum: una foto por semana, y la que tenga
     enlace firmado — sin él `Thumb` no pinta nada y la columna saldría vacía. */
  it('se queda con una sola foto por semana, y con una que tenga url', () => {
    const filas = reviewTimeline({
      weeks: [1],
      startDate: ALTA,
      photoGroups: [
        {
          week: 1,
          photos: [
            { id: 'a', url: null },
            { id: 'b', url: 'https://x/b.jpg' },
            { id: 'c', url: 'https://x/c.jpg' },
          ],
        },
      ],
    });

    expect(filas[0].photo.id).toBe('b');
  });

  it('sin alta no hay eje, así que no hay línea', () => {
    expect(reviewTimeline({ weeks: [1, 2], startDate: null })).toEqual([]);
    expect(reviewTimeline({ weeks: [], startDate: ALTA })).toEqual([]);
  });
});

describe('windowSize', () => {
  it('crece con el ancho, entre un mínimo y un máximo', () => {
    expect(windowSize(0)).toBe(5);
    expect(windowSize(360)).toBe(5);
    expect(windowSize(560)).toBe(9);
    expect(windowSize(1200)).toBe(12);
  });
});

describe('windowFrom', () => {
  it('no recorta cuando la línea entera cabe', () => {
    expect(windowFrom({ from: null, index: 7, size: 10, total: 8 })).toBe(0);
  });

  it('al abrir se centra en la semana elegida', () => {
    expect(windowFrom({ from: null, index: 20, size: 10, total: 40 })).toBe(15);
  });

  /* Lo que hace que la comparación sea posible: elegir otra semana de la misma
     ventana no mueve el fondo. */
  it('no se mueve mientras la elegida está dentro', () => {
    expect(windowFrom({ from: 15, index: 15, size: 10, total: 40 })).toBe(15);
    expect(windowFrom({ from: 15, index: 24, size: 10, total: 40 })).toBe(15);
  });

  it('se corre lo mínimo cuando la elegida se sale', () => {
    expect(windowFrom({ from: 15, index: 25, size: 10, total: 40 })).toBe(16);
    expect(windowFrom({ from: 15, index: 14, size: 10, total: 40 })).toBe(14);
  });

  it('nunca se sale de la línea', () => {
    expect(windowFrom({ from: 0, index: 0, size: 10, total: 40 })).toBe(0);
    expect(windowFrom({ from: 38, index: 39, size: 10, total: 40 })).toBe(30);
    expect(windowFrom({ from: -5, index: 39, size: 10, total: 40 })).toBe(30);
  });
});

describe('timelineSummary', () => {
  const linea = (pesos) =>
    pesos.map((weight, i) => ({ week: i + 1, weekStart: lunes(i + 1), weight, kcals: null }));

  it('resume el peso, lo que se movió y lo acumulado', () => {
    const r = timelineSummary(linea([84, 83.2, 82.5]), 3);

    expect(r.weight).toBe(82.5);
    expect(r.delta).toBe(-0.7);
    expect(r.sinceStart).toBe(-1.5);
    expect(r.from).toBe(1);
  });

  /* La razón de que «anterior» no sea «la semana de antes»: si no se pesó,
     comparar contra un hueco daría «sin cambio» en alguien que lleva bajando. */
  it('compara contra el último pesaje, saltándose las semanas sin dato', () => {
    const r = timelineSummary(linea([84, null, null, 82]), 4);

    expect(r.delta).toBe(-2);
  });

  it('en la primera semana con datos no inventa un acumulado', () => {
    const r = timelineSummary(linea([84, 83]), 1);

    expect(r.sinceStart).toBe(null);
    expect(r.from).toBe(null);
    expect(r.delta).toBe(null);
  });

  it('el punto de partida es el primer pesaje que haya, no la semana uno', () => {
    const r = timelineSummary(linea([null, null, 90, 88]), 4);

    expect(r.sinceStart).toBe(-2);
    expect(r.from).toBe(3);
  });

  it('una semana que no está en la línea no tiene resumen', () => {
    expect(timelineSummary(linea([84]), 9)).toBe(null);
  });
});

describe('nutritionTrack', () => {
  const filas = (n) =>
    Array.from({ length: n }, (_, i) => ({
      week: i + 1,
      weekStart: lunes(i + 1),
      weight: 84 - i * 0.2,
    }));

  const revision = (semana, kcals, extra = {}) => ({
    weekStart: lunes(semana),
    snapshot: { kcals, ...extra },
  });

  /* La forma verdadera de un objetivo: tramos planos y escalones donde tocaste
     algo. Lo que estuvo en vigor entre dos revisiones es el plan anterior. */
  it('arrastra el plan hasta la revisión que lo cambia', () => {
    const t = nutritionTrack({
      rows: filas(6),
      reviews: [revision(1, 2400), revision(4, 2200)],
    });

    expect(t.map((f) => f.kcals)).toEqual([2400, 2400, 2400, 2200, 2200, 2200]);
  });

  it('marca el escalón solo en la semana en la que cambió', () => {
    const t = nutritionTrack({
      rows: filas(6),
      reviews: [revision(1, 2400), revision(4, 2200)],
    });

    expect(t.map((f) => f.changed)).toEqual([false, false, false, true, false, false]);
  });

  /* Una revisión que no toca las calorías no es un escalón: es un tramo llano
     que sigue. Marcarla pintaría un cambio donde no lo hubo. */
  it('una revisión que deja las mismas calorías no es un escalón', () => {
    const t = nutritionTrack({
      rows: filas(4),
      reviews: [revision(1, 2400), revision(3, 2400)],
    });

    expect(t.every((f) => f.changed === false)).toBe(true);
  });

  it('antes de la primera revisión no hay plan que enseñar', () => {
    const t = nutritionTrack({ rows: filas(4), reviews: [revision(3, 2400)] });

    expect(t.map((f) => f.kcals)).toEqual([null, null, 2400, 2400]);
  });

  it('lleva los macros y los pasos del plan en vigor', () => {
    const t = nutritionTrack({
      rows: filas(2),
      reviews: [revision(1, 2400, { protein: 180, carbs: 280, fats: 70, steps: 10000 })],
    });

    expect(t[1]).toMatchObject({ protein: 180, carbs: 280, fats: 70, steps: 10000 });
  });

  /*
    Y las semanas posteriores a la última revisión llevan el plan de HOY: sin
    esto, la semana que estás revisando sale con las calorías de hace un mes.
  */
  it('las semanas sin revisión posterior llevan el plan actual', () => {
    const t = nutritionTrack({
      rows: filas(5),
      reviews: [revision(1, 2400)],
      plan: { kcals: 2100, protein: 190 },
    });

    expect(t.map((f) => f.kcals)).toEqual([2400, 2100, 2100, 2100, 2100]);
    expect(t[1].changed).toBe(true);
    expect(t[2].changed).toBe(false);
    expect(t[4].protein).toBe(190);
  });

  it('sin filas no hay línea', () => {
    expect(nutritionTrack({ rows: [], reviews: [] })).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   dietLog
   --------------------------------------------------------------------------
   La avería que cierra: la evolución de la dieta leía solo la foto que se
   guarda al REGISTRAR UN PESAJE, y la pantalla de revisión leía la que queda al
   CERRAR UNA REVISIÓN. Un cliente que se pesa desde el portal casi nunca tiene
   la primera, así que su escalera de kcal salía plana en una pantalla y entera
   en la otra — y la que se cree es la que está al lado de la dieta.
   ══════════════════════════════════════════════════════════════════════════ */
describe('dietLog', () => {
  const pesaje = (date, weight, kcals = null) => ({
    id: `log-${date}`,
    date,
    weight,
    ...(kcals === null ? {} : { nutrition: { kcals, protein: 180, carbs: 300, fats: 70 } }),
  });

  it('junta las dos fuentes y las devuelve en orden', () => {
    const filas = dietLog({
      history: [pesaje('2026-08-10', 80), pesaje('2026-07-06', 82)],
      reviews: [{ weekStart: '2026-07-20', snapshot: { kcals: 2400 } }],
    });

    expect(filas.map((f) => f.date)).toEqual(['2026-07-06', '2026-07-20', '2026-08-10']);
    expect(filas[1].nutrition.kcals).toBe(2400);
    /* La foto de una revisión no es un pesaje: no trae peso ni lo inventa. */
    expect(filas[1].weight).toBeNull();
  });

  it('sin ninguna foto en los pesajes, la escalera sale de las revisiones', () => {
    /* El caso REAL de la avería: 52 pesajes sin `nutrition` y cuatro cambios de
       kcal que solo constaban en las revisiones cerradas. */
    const filas = dietLog({
      history: [pesaje('2026-07-06', 82), pesaje('2026-08-10', 80)],
      reviews: [
        { weekStart: '2026-07-13', snapshot: { kcals: 2600 } },
        { weekStart: '2026-08-03', snapshot: { kcals: 2400 } },
      ],
    });

    expect(kcalSteps(filas)).toHaveLength(1);
    expect(kcalSteps(filas)[0].delta).toBe(-200);
    expect(kcalSteps(filas)[0].date).toBe('2026-08-03');
  });

  it('con las dos fuentes en la misma fecha gana la del pesaje', () => {
    /* La misma regla que `reviewTimeline`: la del pesaje se tomó midiendo. Y
       escrita una sola vez, o las dos pantallas acabarían discrepando otra vez. */
    const filas = dietLog({
      history: [pesaje('2026-07-06', 82, 2800)],
      reviews: [{ weekStart: '2026-07-06', snapshot: { kcals: 2400 } }],
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].nutrition.kcals).toBe(2800);
  });

  it('una revisión sin foto del plan no añade nada', () => {
    const filas = dietLog({
      history: [pesaje('2026-07-06', 82)],
      reviews: [{ weekStart: '2026-07-20', snapshot: null }],
    });
    expect(filas).toHaveLength(1);
  });

  it('sin nada, nada', () => {
    expect(dietLog()).toEqual([]);
  });
});
