import { describe, expect, it } from 'vitest';

import { apuntarFoto, conLoRegistradoDeAhora, mismoPlan, PASOS_DE_DESHACER } from './deshacer';

const micro = (id, weekNumber, { days = [], sessions = [] } = {}) => ({
  id,
  weekNumber,
  sessionNumber: weekNumber,
  date: '2026-09-01',
  days,
  sessions,
});

const programa = (microcycles, blocks = []) => ({
  weeklySplit: {},
  mobilityDrills: [],
  notes: '',
  blocks,
  microcycles,
});

describe('mismoPlan', () => {
  it('lo registrado no es plan: anotar una serie no es un cambio que deshacer', () => {
    const antes = programa([micro('mc1', 1, { days: [{ dayName: 'Push' }] })]);
    const despues = programa([
      micro('mc1', 1, {
        days: antes.microcycles[0].days,
        sessions: [{ id: 's1', dayName: 'Push', entries: [] }],
      }),
    ]);
    expect(mismoPlan(antes, despues)).toBe(true);
  });

  it('tocar el plan de un día sí lo es', () => {
    const antes = programa([micro('mc1', 1, { days: [{ dayName: 'Push', exercises: [] }] })]);
    const despues = programa([
      micro('mc1', 1, { days: [{ dayName: 'Push', exercises: [{ id: 'e1', name: 'Press' }] }] }),
    ]);
    expect(mismoPlan(antes, despues)).toBe(false);
  });

  it('y tocar el plan del bloque también, aunque no cambie ningún microciclo', () => {
    const ciclos = [micro('mc1', 1)];
    const antes = programa(ciclos, [{ id: 'b1', name: 'Bloque 1', sessions: [] }]);
    const despues = programa(ciclos, [{ id: 'b1', name: 'Fuerza', sessions: [] }]);
    expect(mismoPlan(antes, despues)).toBe(false);
  });

  it('quitar o añadir un microciclo es un cambio del plan', () => {
    const antes = programa([micro('mc1', 1), micro('mc2', 2)]);
    expect(mismoPlan(antes, programa([micro('mc1', 1)]))).toBe(false);
  });

  it('el mismo objeto es el mismo plan', () => {
    const p = programa([micro('mc1', 1)]);
    expect(mismoPlan(p, p)).toBe(true);
  });
});

describe('conLoRegistradoDeAhora', () => {
  it('devuelve el plan de la foto y conserva las sesiones de ahora', () => {
    const foto = programa([micro('mc1', 1, { days: [{ dayName: 'Push', exercises: [] }], sessions: [] })]);
    const actual = programa([
      micro('mc1', 1, {
        days: [{ dayName: 'Push', exercises: [{ id: 'e1', name: 'Press' }] }],
        sessions: [{ id: 's1', dayName: 'Push' }],
      }),
    ]);

    const vuelta = conLoRegistradoDeAhora(foto, actual);
    expect(vuelta.microcycles[0].days[0].exercises).toEqual([]);
    expect(vuelta.microcycles[0].sessions).toEqual([{ id: 's1', dayName: 'Push' }]);
  });

  it('un microciclo nacido después de la foto SIN registro se va', () => {
    const foto = programa([micro('mc1', 1)]);
    const actual = programa([micro('mc1', 1), micro('mc2', 2)]);
    expect(conLoRegistradoDeAhora(foto, actual).microcycles.map((m) => m.id)).toEqual(['mc1']);
  });

  it('pero si ya tiene algo entrenado, se queda: deshacer no borra lo que alguien hizo', () => {
    const foto = programa([micro('mc1', 1)]);
    const actual = programa([
      micro('mc1', 1),
      micro('mc2', 2, { sessions: [{ id: 's9', dayName: 'Pierna' }] }),
    ]);

    const vuelta = conLoRegistradoDeAhora(foto, actual);
    expect(vuelta.microcycles.map((m) => m.id)).toEqual(['mc1', 'mc2']);
    expect(vuelta.microcycles[1].sessions).toHaveLength(1);
  });

  it('y los que se quedan salen ordenados por número de microciclo', () => {
    const foto = programa([micro('mc1', 1), micro('mc3', 3)]);
    const actual = programa([
      micro('mc1', 1),
      micro('mc2', 2, { sessions: [{ id: 's9' }] }),
      micro('mc3', 3),
    ]);
    expect(conLoRegistradoDeAhora(foto, actual).microcycles.map((m) => m.weekNumber)).toEqual([1, 2, 3]);
  });
});

describe('apuntarFoto', () => {
  it('apila el pasado y vacía el futuro', () => {
    const pila = { pasado: ['a'], futuro: ['z'] };
    expect(apuntarFoto(pila, 'b')).toEqual({ pasado: ['a', 'b'], futuro: [] });
  });

  it('no crece sin límite: se queda con los últimos pasos', () => {
    let pila = { pasado: [], futuro: [] };
    for (let i = 0; i < PASOS_DE_DESHACER + 10; i += 1) pila = apuntarFoto(pila, i);
    expect(pila.pasado).toHaveLength(PASOS_DE_DESHACER);
    expect(pila.pasado[0]).toBe(10);
  });
});

describe('el camino corto de la comparación', () => {
  it('con solo `sessions` cambiado no serializa nada', () => {
    const days = [{ dayName: 'Push', exercises: [{ id: 'e1', name: 'Press' }] }];
    const antes = programa([micro('mc1', 1, { days })]);
    /* Mismo array de `days` POR REFERENCIA, que es lo que devuelven los
       updaters al anotar una serie. Si el atajo se pierde, esto sigue pasando
       —el JSON coincide— pero pasa serializando; el espía lo delata. */
    const despues = {
      ...antes,
      microcycles: [{ ...antes.microcycles[0], sessions: [{ id: 's1', dayName: 'Push' }] }],
    };

    const original = JSON.stringify;
    let veces = 0;
    JSON.stringify = (...args) => { veces += 1; return original(...args); };
    try {
      expect(mismoPlan(antes, despues)).toBe(true);
    } finally {
      JSON.stringify = original;
    }
    expect(veces).toBe(0);
  });
});
