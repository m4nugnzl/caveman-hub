import { describe, expect, it } from 'vitest';

import { ordenar } from './tabla';

/**
 * Ordenar una tabla es de las cosas que parecen triviales y tienen cuatro
 * trampas. Las cuatro están abajo, y las cuatro salieron de datos reales de la
 * radiografía.
 */

const VALORES = {
  nombre: (f) => f.nombre,
  dias: (f) => f.dias,
};

const filas = [
  { nombre: 'Ana', dias: 9 },
  { nombre: 'Óscar', dias: null },
  { nombre: 'luis', dias: 10 },
  { nombre: 'Zoe', dias: 2 },
];

const nombres = (r) => r.map((f) => f.nombre);

describe('ordenar', () => {
  it('sin campo elegido no toca nada: manda el orden del dominio', () => {
    /* Cada tabla llega ordenada por lo que su análisis considera importante
       —los fallos por cuentas afectadas y no por veces—. Ordenar por defecto
       por algo nuestro taparía ese criterio siempre. */
    expect(ordenar(filas, { campo: null, sentido: 'asc' }, VALORES)).toBe(filas);
  });

  it('no muta el array que recibe', () => {
    const copia = [...filas];
    ordenar(filas, { campo: 'dias', sentido: 'asc' }, VALORES);
    expect(filas).toEqual(copia);
  });

  it('los huecos van al final, se ordene como se ordene', () => {
    /* Una cuenta que no ha entrado NUNCA no es una que entró hace cero días. Y
       si el sentido moviera los huecos, invertir el orden llenaría la primera
       pantalla de filas vacías. */
    const asc = ordenar(filas, { campo: 'dias', sentido: 'asc' }, VALORES);
    const desc = ordenar(filas, { campo: 'dias', sentido: 'desc' }, VALORES);
    expect(nombres(asc).at(-1)).toBe('Óscar');
    expect(nombres(desc).at(-1)).toBe('Óscar');
  });

  it('las cifras se ordenan como cifras, no como texto', () => {
    /* Es la trampa de «última entrada»: como texto, «10» va antes que «9». */
    expect(nombres(ordenar(filas, { campo: 'dias', sentido: 'asc' }, VALORES))).toEqual([
      'Zoe',
      'Ana',
      'luis',
      'Óscar',
    ]);
  });

  it('el texto se ordena como lo buscaría una persona: sin importar mayúsculas ni tildes', () => {
    /* Media cartera se llama Núñez o Peña. Con un `<` a secas, «luis» se iría
       detrás de «Zoe» porque las minúsculas van después en la tabla ASCII. */
    expect(nombres(ordenar(filas, { campo: 'nombre', sentido: 'asc' }, VALORES))).toEqual([
      'Ana',
      'luis',
      'Óscar',
      'Zoe',
    ]);
  });

  it('un campo que no está en el mapa se ignora en vez de reventar', () => {
    expect(ordenar(filas, { campo: 'inventado', sentido: 'asc' }, VALORES)).toBe(filas);
  });
});
