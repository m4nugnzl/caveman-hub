import { describe, expect, it } from 'vitest';

import { latestWeight } from './anthropometry';

/**
 * El último peso, que antes era una columna que nadie actualizaba.
 *
 * ══ Qué se está fijando aquí ════════════════════════════════════════════════
 *
 * `clients.current_weight` se pintaba en el portal del cliente bajo la etiqueta
 * «Peso actual» y en el roadmap, y **no la escribía nadie**: ni la aplicación ni
 * ninguna migración. Enseñaba el valor que tuviera el día que se dejó de
 * rellenar, presentado como el de hoy.
 *
 * Un dato viejo con etiqueta de actual es peor que un hueco: el hueco se
 * pregunta, la cifra se cree. Y la cree quien está ajustando su dieta con ella.
 *
 * Ahora sale del histórico de pesajes. Lo que se prueba es lo que hace falta para
 * poder fiarse: que coge el ÚLTIMO por fecha y no el último de la lista, que
 * ignora los registros sin peso, y que sin datos dice que no hay —en vez de
 * inventarse un cero, que en una báscula significa algo muy distinto—.
 */
describe('latestWeight', () => {
  it('coge el más reciente por FECHA, no el último del array', () => {
    /* El histórico llega sin ordenar de la base de datos, y ordenar por posición
       daría el peso de hace tres semanas en cuanto alguien rellene un hueco. */
    const history = [
      { date: '2026-08-01', weight: 80 },
      { date: '2026-08-15', weight: 78 },
      { date: '2026-08-08', weight: 79 },
    ];
    expect(latestWeight(history)).toBe(78);
  });

  it('ignora los registros que no traen peso', () => {
    /* Un pesaje puede registrar solo pliegues o solo perímetros. Contarlo como
       peso daría `null` como cifra actual teniendo una buena dos días antes. */
    const history = [
      { date: '2026-08-01', weight: 80 },
      { date: '2026-08-15', weight: '' },
      { date: '2026-08-20', folds: { abdomen: 12 } },
    ];
    expect(latestWeight(history)).toBe(80);
  });

  it('entiende la coma decimal', () => {
    /* El teclado numérico de Android en configuración española produce coma, y
       el peso se guarda como texto tal cual se teclea (`lib/num.js`). */
    expect(latestWeight([{ date: '2026-08-15', weight: '77,4' }])).toBe(77.4);
  });

  it('sin datos dice que no hay, no cero', () => {
    /* Cero kilos no es «no lo sé»: en una báscula es una lectura, y la pantalla
       lo pintaría como tal. */
    expect(latestWeight([])).toBeNull();
    expect(latestWeight(null)).toBeNull();
    expect(latestWeight(undefined)).toBeNull();
    expect(latestWeight([{ date: '2026-08-01' }])).toBeNull();
  });

  it('aguanta registros rotos sin reventar', () => {
    /* El histórico es un jsonb y ha pasado por varias formas. Una fila sin fecha
       no puede tumbar la pantalla de inicio del cliente. */
    expect(latestWeight([null, { weight: 70 }, { date: '2026-08-01', weight: 75 }])).toBe(75);
  });
});
