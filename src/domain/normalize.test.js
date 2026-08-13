import { describe, expect, it } from 'vitest';

import { allSessions, normalizeMicrocycles, sessionTonnage } from './sessions';

/** Un día del plan con kilos anotados dentro: la forma antigua. */
const diaConKilos = (dayName = 'Empuje') => ({
  dayName,
  exercises: [
    {
      id: 'e1',
      name: 'Press banca',
      muscle: 'Pecho',
      sets: [
        { kg: '80', reps: '8', rir: '2' },
        { kg: '80', reps: '7', rir: '1' },
      ],
    },
  ],
});

const micro = (over = {}) => ({
  id: 'm1',
  weekNumber: 1,
  date: '2026-03-02',
  days: [diaConKilos()],
  sessions: [],
  ...over,
});

describe('normalizeMicrocycles', () => {
  it('convierte los kilos del plan en una sesión con fecha y los saca del plan', () => {
    const { microcycles, converted, skipped } = normalizeMicrocycles([micro()]);

    expect(converted).toBe(1);
    expect(skipped).toBe(0);

    const [m] = microcycles;
    expect(m.sessions).toHaveLength(1);
    expect(m.sessions[0].date).toBe('2026-03-02');
    expect(m.sessions[0].dayName).toBe('Empuje');
    // Deja de ser un apaño: `executedSessions` ya no la trata como heredada.
    expect(m.sessions[0].isLegacy).toBeUndefined();

    // El plan conserva la estructura y pierde los valores.
    expect(m.days[0].exercises[0].sets).toEqual([
      { kg: '', reps: '', rir: '' },
      { kg: '', reps: '', rir: '' },
    ]);
  });

  it('no pierde ni un kilo: el tonelaje es el mismo antes y después', () => {
    /*
      Es la comprobación que de verdad importa. Esto reescribe el programa de todos
      los clientes, así que lo que hay que garantizar no es que la forma sea otra,
      sino que lo entrenado sigue siendo exactamente lo mismo.
    */
    const antes = allSessions([micro()]);
    const después = allSessions(normalizeMicrocycles([micro()]).microcycles);

    expect(después).toHaveLength(antes.length);
    expect(después.map(sessionTonnage)).toEqual(antes.map(sessionTonnage));
    expect(después.map((s) => s.date)).toEqual(antes.map((s) => s.date));
  });

  it('es idempotente: la segunda pasada no encuentra nada', () => {
    const primera = normalizeMicrocycles([micro()]);
    const segunda = normalizeMicrocycles(primera.microcycles);

    expect(segunda.converted).toBe(0);
    expect(segunda.microcycles[0].sessions).toHaveLength(1);
  });

  it('no toca un día que ya tiene sesión real', () => {
    /*
      Sin esto se contarían dos veces los mismos kilos: la sesión real y la copia
      heredada del mismo día. Es el descarte que hace `executedSessions`, y aquí
      tiene que respetarse igual.
    */
    const conSesion = micro({
      sessions: [{ id: 's1', date: '2026-03-04', dayName: 'Empuje', entries: [] }],
    });

    const { converted, microcycles } = normalizeMicrocycles([conSesion]);

    expect(converted).toBe(0);
    expect(microcycles[0].sessions).toHaveLength(1);
    // Y el plan se queda como estaba, con sus kilos: no son suyos, pero
    // borrarlos aquí sería borrar el único sitio donde están.
    expect(microcycles[0].days[0].exercises[0].sets[0].kg).toBe('80');
  });

  it('deja en paz los microciclos sin fecha y los cuenta', () => {
    const sinFecha = micro({ date: null });
    const { converted, skipped, microcycles } = normalizeMicrocycles([sinFecha]);

    expect(converted).toBe(0);
    expect(skipped).toBe(1);
    expect(microcycles[0].sessions).toHaveLength(0);
  });

  it('ignora los días programados y sin registrar', () => {
    const vacio = micro({
      days: [{ dayName: 'Tirón', exercises: [{ id: 'e2', name: 'Remo', muscle: 'Dorsal', sets: [{ kg: '', reps: '', rir: '' }] }] }],
    });

    expect(normalizeMicrocycles([vacio]).converted).toBe(0);
  });
});
