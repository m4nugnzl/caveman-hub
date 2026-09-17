import { describe, expect, it } from 'vitest';

import {
  contraQueTeMides,
  objetivoDeSerie,
  pasoDelCampo,
  porEjercicio,
  recordsDeLaSesion,
  serieEnCorto,
  siguientePorHacer,
} from './sesion';
import { tiraDeLaSemana } from './hoy';

/*
  ══ Las cuentas del modo entreno ═════════════════════════════════════════════

  Lo que tiene que ser cierto no es que salga un número: es que quien entrena
  con el pulso a 160 no se encuentre la pantalla haciendo algo que no ha pedido.
  Tres cosas, cada una con su avería posible:

  · El «+» de un campo vacío parte de lo que levantó la última vez, no de cero.
  · Cerrar una serie lleva a la que TOCA, dando la vuelta si se saltó alguna.
  · Un récord es superar el listón de ANTES; la primera vez no se celebra.
*/

describe('pasoDelCampo', () => {
  it('el primer toque en un campo vacío pone lo de la vez anterior', () => {
    expect(pasoDelCampo({ valor: '', previo: '80', campo: 'kg', dir: 1 })).toBe('80');
    /* Y da igual el sentido: el vacío se llena con la referencia, no se resta de ella. */
    expect(pasoDelCampo({ valor: '', previo: '80', campo: 'kg', dir: -1 })).toBe('80');
  });

  it('sin vez anterior arranca en un paso, y restar en vacío no inventa nada', () => {
    expect(pasoDelCampo({ valor: '', campo: 'kg', dir: 1 })).toBe('2.5');
    expect(pasoDelCampo({ valor: '', campo: 'reps', dir: 1 })).toBe('1');
    expect(pasoDelCampo({ valor: '', campo: 'kg', dir: -1 })).toBe('');
  });

  it('con valor, mueve un paso del gimnasio y no baja de cero', () => {
    expect(pasoDelCampo({ valor: '80', campo: 'kg', dir: 1 })).toBe('82.5');
    expect(pasoDelCampo({ valor: '8', campo: 'reps', dir: -1 })).toBe('7');
    expect(pasoDelCampo({ valor: '1', campo: 'kg', dir: -1 })).toBe('0');
    /* La coma que escribe un teclado español también vale. */
    expect(pasoDelCampo({ valor: '42,5', campo: 'kg', dir: 1 })).toBe('45');
  });

  it('en el RIR el cero es una respuesta, no un hueco', () => {
    expect(pasoDelCampo({ valor: '', previo: '0', campo: 'rir', dir: 1 })).toBe('0');
    expect(pasoDelCampo({ valor: '', campo: 'rir', dir: -1 })).toBe('0');
  });
});

describe('siguientePorHacer', () => {
  const s = (...hechas) => hechas.map((hecha) => ({ hecha }));

  it('desde el principio, la primera sin hacer', () => {
    expect(siguientePorHacer(s(true, false, false))).toBe(1);
  });

  it('al cerrar una, la siguiente — y da la vuelta a la que se saltó', () => {
    /* Hizo la 1 y la 3 saltándose la 2: al cerrar la 3 vuelve a la 2. */
    expect(siguientePorHacer(s(true, false, true), 2)).toBe(1);
    expect(siguientePorHacer(s(false, true, false), 0)).toBe(2);
  });

  it('con todas hechas no hay a dónde ir', () => {
    expect(siguientePorHacer(s(true, true), 1)).toBe(-1);
    expect(siguientePorHacer([], -1)).toBe(-1);
  });
});

describe('serieEnCorto', () => {
  it('dice kilos y repeticiones, o solo repeticiones si no hay carga', () => {
    expect(serieEnCorto({ kg: '82.5', reps: '8' })).toBe('82,5 kg · 8');
    expect(serieEnCorto({ kg: '', reps: '12' })).toBe('12 reps');
    expect(serieEnCorto({ kg: '80', reps: '' })).toBe('—');
  });
});

describe('objetivoDeSerie', () => {
  it('dice el RIR pautado, que es lo que no le llegaba al cliente', () => {
    expect(objetivoDeSerie({ pideKg: '80', pideReps: '8-10', pideRir: '2' })).toBe(
      '80 kg × 8-10 · RIR 2'
    );
    /* Y «RIR 0» es una pauta —al fallo—, no un campo vacío. */
    expect(objetivoDeSerie({ pideReps: '5', pideRir: '0' })).toBe('5 · RIR 0');
  });

  it('en corto se calla los kilos y no el RIR', () => {
    expect(objetivoDeSerie({ pideKg: '80', pideReps: '8-10', pideRir: '2' }, { conKg: false })).toBe(
      '8-10 · RIR 2'
    );
  });

  it('sin nada pautado no hay objetivo que decir', () => {
    expect(objetivoDeSerie({ pideKg: null, pideReps: null, pideRir: null })).toBeNull();
    expect(objetivoDeSerie(undefined)).toBeNull();
  });
});

describe('recordsDeLaSesion', () => {
  const mejores = new Map([
    ['Prensa', { kg: '170', reps: '8', e1rm: 170 * (1 + 8 / 30) }],
    ['Aductor', { kg: '50', reps: '8', e1rm: 50 * (1 + 8 / 30) }],
  ]);

  it('uno por ejercicio, el mejor, con lo que mejoró', () => {
    const records = recordsDeLaSesion(
      [
        {
          name: 'Prensa',
          sets: [
            { kg: '180', reps: '8' },
            { kg: '175', reps: '8' },
          ],
        },
        { name: 'Aductor', sets: [{ kg: '50', reps: '10' }] },
      ],
      mejores
    );

    expect(records).toEqual([
      { nombre: 'Prensa', serie: '180 kg · 8', mejora: '+10 kg' },
      { nombre: 'Aductor', serie: '50 kg · 10', mejora: '+2 reps' },
    ]);
  });

  it('la primera vez que se hace un ejercicio no es récord', () => {
    expect(recordsDeLaSesion([{ name: 'Nuevo', sets: [{ kg: '40', reps: '8' }] }], mejores)).toEqual([]);
  });

  it('igualar no es superar', () => {
    expect(recordsDeLaSesion([{ name: 'Prensa', sets: [{ kg: '170', reps: '8' }] }], mejores)).toEqual([]);
  });
});

describe('porEjercicio', () => {
  it('series y kilos de lo que se hizo, y nada de lo que no', () => {
    expect(
      porEjercicio([
        { name: 'Prensa', sets: [{ kg: '100', reps: '10' }, { kg: '', reps: '' }] },
        { name: 'Sin hacer', sets: [{ kg: '', reps: '' }] },
      ])
    ).toEqual([{ nombre: 'Prensa', series: 1, kg: 1000 }]);
  });
});

describe('contraQueTeMides', () => {
  /* Como lo devuelve `historialDeEjercicio`: de la más reciente a la más antigua. */
  const historial = [
    { weekNumber: 8, date: '2026-09-16', sets: [{ kg: '55', reps: '6' }, { kg: '45', reps: '8' }] },
    { weekNumber: 7, date: '2026-09-09', sets: [{ kg: '50', reps: '8' }, { kg: '45', reps: '8' }] },
    { weekNumber: 6, date: '2026-09-02', sets: [{ kg: '50', reps: '6' }] },
  ];

  it('las filas van de la más antigua a la más reciente, que es como se lee una progresión', () => {
    const tabla = contraQueTeMides(historial);
    expect(tabla.filas.map((f) => f.weekNumber)).toEqual([6, 7, 8]);
    expect(tabla.columnas).toBe(2);
    /* La semana 6 hizo una sola serie: el hueco se dice como hueco. */
    expect(tabla.filas[0].celdas[1]).toBeNull();
  });

  it('marca la serie más fuerte y dice cuánto ha cambiado el tonelaje', () => {
    const tabla = contraQueTeMides(historial);
    const picos = tabla.filas.flatMap((f) => f.celdas.filter((c) => c?.pico).map((c) => c.texto));
    /* 55×6 ≈ 66 y 50×8 ≈ 63,3: la marca es la de 55. */
    expect(picos).toEqual(['55 kg · 6']);
    expect(tabla.tonelajes).toEqual([300, 760, 690]);
    expect(tabla.cambio).toBe(130);
  });

  it('se queda con las últimas veces que se pidan', () => {
    expect(contraQueTeMides(historial, 2).filas.map((f) => f.weekNumber)).toEqual([7, 8]);
  });

  it('sin historial no hay nada contra lo que medirse', () => {
    expect(contraQueTeMides([])).toBeNull();
    expect(contraQueTeMides(undefined)).toBeNull();
  });
});

describe('tiraDeLaSemana', () => {
  it('se calla con un ciclo rotativo: ahí «esta semana» no dice qué toca', () => {
    expect(tiraDeLaSemana({ client: { cycleType: 'rotating' }, program: {} })).toBeNull();
  });

  it('y sin programa tampoco inventa siete casillas', () => {
    expect(tiraDeLaSemana({ client: { cycleType: 'weekly' }, program: null })).toBeNull();
  });
});
