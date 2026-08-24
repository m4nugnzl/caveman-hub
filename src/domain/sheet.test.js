import { describe, expect, it } from 'vitest';

import {
  bestColumn,
  detectSeparator,
  hasWords,
  headerIndexes,
  headerPeriod,
  toGrid,
  trimGrid,
} from './sheet';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * El recorte, sobre todo. Una hoja de cálculo real pegada trae diez veces más
 * columnas vacías que llenas —márgenes, celdas combinadas, huecos entre
 * bloques—, y mientras estén ahí, cualquier cosa que dependa de la posición de
 * una columna depende de cómo maquetó la hoja quien la hizo. Recortadas, dos
 * hojas muy distintas se parecen; sin recortar, no se parecen dos copias de la
 * misma.
 */

describe('detectSeparator', () => {
  it('el tabulador gana en cuanto aparece: es lo que pone el portapapeles', () => {
    expect(detectSeparator('a\tb,c,d')).toBe('\t');
  });

  it('sin tabuladores decide quién sale más veces', () => {
    expect(detectSeparator('a;b;c')).toBe(';');
    expect(detectSeparator('a,b,c')).toBe(',');
  });

  it('sin ninguno, tabulador: una columna es una columna', () => {
    expect(detectSeparator('Press banca')).toBe('\t');
  });
});

describe('trimGrid', () => {
  it('quita las columnas vacías del todo y conserva las que tienen algo', () => {
    expect(trimGrid([
      ['', 'Press banca', '', '4', ''],
      ['', 'Remo', '', '3', ''],
    ])).toEqual([['Press banca', '4'], ['Remo', '3']]);
  });

  it('quita las filas vacías, incluidas las de en medio', () => {
    expect(trimGrid([['a'], ['', ''], ['b']])).toEqual([['a'], ['b']]);
  });

  it('una columna con un solo valor no se pierde', () => {
    expect(trimGrid([['', 'x'], ['', ''], ['y', '']])).toEqual([['', 'x'], ['y', '']]);
  });

  it('con todo vacío no queda nada', () => {
    expect(trimGrid([['', ''], ['', '']])).toEqual([]);
    expect(trimGrid([])).toEqual([]);
  });
});

describe('toGrid', () => {
  it('trocea, recorta espacios y quita lo vacío de una sola pasada', () => {
    expect(toGrid('  Ejercicio \t Series \n Press banca \t 4 ')).toEqual([
      ['Ejercicio', 'Series'],
      ['Press banca', '4'],
    ]);
  });

  it('le da igual el salto de línea de Windows', () => {
    expect(toGrid('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('respeta las comillas de un CSV', () => {
    expect(toGrid('Nombre;Nota\nPress;"Pausa abajo; sin rebote"')).toEqual([
      ['Nombre', 'Nota'],
      ['Press', 'Pausa abajo; sin rebote'],
    ]);
  });

  it('una comilla escapada dentro de un campo es una comilla', () => {
    expect(toGrid('a,"di ""hola"" luego"')).toEqual([['a', 'di "hola" luego']]);
  });

  it('el texto vacío no es una rejilla vacía de una fila: no es nada', () => {
    expect(toGrid('')).toEqual([]);
    expect(toGrid('   \n  ')).toEqual([]);
  });
});

describe('hasWords', () => {
  it('distingue un nombre de un número, un guion o una celda de relleno', () => {
    expect(hasWords('Press banca')).toBe(true);
    expect(hasWords('4')).toBe(false);
    expect(hasWords('-')).toBe(false);
    expect(hasWords('')).toBe(false);
    /* Una sola letra tampoco: las columnas «A» / «B» de una plantilla no son nombres. */
    expect(hasWords('A')).toBe(false);
  });
});

describe('headerIndexes', () => {
  it('encuentra todas las columnas que encajan, que es como se detecta un bloque repetido', () => {
    expect(headerIndexes(['Ej', 'KG', 'Reps', 'KG', 'Reps'], /^kg$/i)).toEqual([1, 3]);
  });
});

describe('headerPeriod', () => {
  /*
    Es lo que separa el plan del registro sin nombrar ni una sola palabra. La
    versión anterior de esa decisión buscaba «PESO», y eso es exactamente lo que
    no puede hacer un lector que quiere valer para hojas que no ha visto: la
    misma hoja en inglés dejaba de funcionar.
  */
  it('encuentra dónde arranca el bloque que se repite', () => {
    const cabecera = ['Ejercicio', 'Series', 'Reps', 'Peso', 'Hechas', 'Peso', 'Hechas', 'Peso', 'Hechas'];
    expect(headerPeriod(cabecera)).toEqual({ start: 3, period: 2 });
  });

  it('le da igual el idioma: es la forma, no las palabras', () => {
    const cabecera = ['Exercise', 'Sets', 'Load', 'Done', 'Load', 'Done', 'Load', 'Done'];
    expect(headerPeriod(cabecera)?.start).toBe(2);
  });

  it('con dos repeticiones no basta', () => {
    /* Dos ejercicios puestos uno al lado del otro son una maquetación legítima,
       y tomarlos por registro se llevaría media tabla. */
    expect(headerPeriod(['Ej', 'Series', 'Ej', 'Series'])).toBeNull();
  });

  it('las columnas vacías no cuentan como repetición', () => {
    expect(headerPeriod(['', '', '', '', '', '', '', ''])).toBeNull();
  });

  it('una fila que no se repite no tiene periodo', () => {
    expect(headerPeriod(['Ejercicio', 'Series', 'Reps', 'RIR', 'Notas'])).toBeNull();
  });
});

describe('bestColumn', () => {
  const filas = [
    ['Press banca', 'Pecho', '4'],
    ['Remo', 'Dorsal', '3'],
    ['Curl', 'Bíceps', '3'],
  ];

  it('encuentra la columna por lo que contiene, sin mirar ninguna cabecera', () => {
    expect(bestColumn(filas, (v) => ['Pecho', 'Dorsal', 'Bíceps'].includes(v))).toBe(1);
  });

  it('no elige nada cuando ninguna columna llega al listón', () => {
    expect(bestColumn(filas, (v) => v === 'Glúteos')).toBe(-1);
  });

  it('respeta las columnas excluidas aunque encajen', () => {
    expect(bestColumn(filas, (v) => /^\d$/.test(v), { exclude: [2] })).toBe(-1);
  });

  it('una columna con un solo valor no cuenta: con uno no hay patrón', () => {
    expect(bestColumn([['x', 'Pecho'], ['y', ''], ['z', '']], (v) => v === 'Pecho')).toBe(-1);
  });
});
