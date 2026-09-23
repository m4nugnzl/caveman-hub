import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ALTO_LIENZO, GraficaDelProgreso, colocar } from './GraficaDelProgreso';

/**
 * LO QUE ESTA PRUEBA DEFIENDE
 *
 * Dos cosas que solo se ven mirando la pantalla, y que por eso se rompen sin
 * que nadie se entere:
 *
 *   1. Que DOS ANOTACIONES NO SE PISEN. El dibujo lleva cuatro cifras colgadas
 *      de sus puntos, y cuando el peso de hoy y el objetivo casi coinciden
 *      —justo cuando la gráfica está diciendo la mejor noticia— sus dos cajas
 *      caen a la misma altura. El reparto de huecos es pura geometría y se
 *      prueba como tal.
 *   2. Que los CASOS DE BORDE dibujen lo que tienen que dibujar: un cliente
 *      recién empezado con dos pesajes, una serie con semanas sin pesar y una
 *      semana en curso todavía sin báscula.
 */

const caja = (x0, y0, ancho, alto) => ({ x0, x1: x0 + ancho, y0, y1: y0 + alto });

describe('el reparto de huecos de las anotaciones', () => {
  it('deja la primera en el sitio que pide', () => {
    const puesta = colocar({
      candidatos: [{ x0: 100, y0: 40, ancho: 90 }],
      alto: 22,
      duras: [],
    });
    expect(puesta.caja).toEqual(caja(100, 40, 90, 22));
  });

  it('manda la segunda a su alternativa cuando la primera ya ocupa el hueco', () => {
    const ocupada = caja(100, 40, 90, 22);
    const puesta = colocar({
      candidatos: [
        { x0: 110, y0: 44, ancho: 80 },
        { x0: 110, y0: 90, ancho: 80 },
      ],
      alto: 22,
      duras: [ocupada],
    });
    expect(puesta.caja.y0).toBe(90);
  });

  it('la empuja en vertical cuando ninguna de sus posiciones está libre', () => {
    /* Dos cajas ya puestas que tapan las dos alturas que esta pediría: la que
       llega tiene que apartarse sola y seguir dentro del lienzo. */
    const duras = [caja(100, 40, 90, 22), caja(100, 90, 90, 22)];
    const puesta = colocar({
      candidatos: [
        { x0: 110, y0: 44, ancho: 80 },
        { x0: 110, y0: 92, ancho: 80 },
      ],
      alto: 22,
      duras,
    });
    for (const ocupada of duras) {
      const pisa =
        puesta.caja.x0 < ocupada.x1 &&
        ocupada.x0 < puesta.caja.x1 &&
        puesta.caja.y0 < ocupada.y1 &&
        ocupada.y0 < puesta.caja.y1;
      expect(pisa).toBe(false);
    }
    expect(puesta.caja.y0).toBeGreaterThanOrEqual(0);
    expect(puesta.caja.y1).toBeLessThanOrEqual(ALTO_LIENZO);
  });

  it('nunca se sale del lienzo, aunque le pidan un sitio imposible', () => {
    const puesta = colocar({
      candidatos: [{ x0: 10, y0: ALTO_LIENZO + 200, ancho: 60 }],
      alto: 22,
      duras: [],
    });
    expect(puesta.caja.y0).toBeGreaterThanOrEqual(0);
    expect(puesta.caja.y1).toBeLessThanOrEqual(ALTO_LIENZO);
  });

  it('esquiva el recorrido de la curva si tiene otro sitio donde caer', () => {
    /* La curva pasa por la primera posición; la segunda está limpia. */
    const puesta = colocar({
      candidatos: [
        { x0: 100, y0: 40, ancho: 90 },
        { x0: 100, y0: 140, ancho: 90 },
      ],
      alto: 22,
      duras: [],
      curva: () => caja(0, 30, 400, 40),
    });
    expect(puesta.caja.y0).toBe(140);
  });
});

const semana = (week, weight, kcals) => ({
  week,
  weekStart: `2026-01-${String(5 + (week - 1) * 7).padStart(2, '0')}`,
  weight,
  kcals,
  steps: null,
});

const pintar = (props) => renderToStaticMarkup(<GraficaDelProgreso semanas={[]} {...props} />);

describe('lo que dibuja la gráfica del progreso', () => {
  const largas = [
    semana(1, 80.5, 2600),
    semana(2, 80.1, 2600),
    semana(3, 80.9, 2600),
    semana(4, 79.4, 2400),
    semana(5, 78.8, 2400),
    semana(6, 78.2, 2400),
  ];

  it('cuelga sus cuatro cifras del dibujo', () => {
    const html = pintar({ semanas: largas, objetivo: 75 });
    expect(html).toContain('empezó');
    expect(html).toContain('objetivo');
    expect(html).toContain('máx');
    expect(html).toContain('progreso-hoy');
  });

  it('con dos pesajes no inventa máximo ni mínimo', () => {
    const html = pintar({ semanas: [semana(1, 80, 2600), semana(2, 79.5, 2600)] });
    expect(html).toContain('empezó');
    expect(html).not.toContain('>máx<');
    expect(html).not.toContain('>mín<');
  });

  it('parte la línea donde falta un pesaje', () => {
    const conHueco = [semana(1, 80, 2600), semana(2, null, 2600), semana(3, 79, 2400)];
    expect(pintar({ semanas: conHueco })).toContain('progreso-salto');
    expect(pintar({ semanas: largas })).not.toContain('progreso-salto');
  });

  it('no dice «hoy» de un pesaje que no es de esta semana', () => {
    const sinBascula = [...largas.slice(0, 5), { ...semana(6, null, 2400) }];
    const html = pintar({ semanas: sinBascula });
    expect(html).toContain('S5');
    expect(html).not.toContain('>Hoy<');
  });

  it('solo dibuja el fondo cuando el plan tiene un escalón que enseñar', () => {
    const plano = largas.map((f) => ({ ...f, kcals: 2600 }));
    expect(pintar({ semanas: plano })).not.toContain('progreso-fondo');
    expect(pintar({ semanas: largas })).toContain('progreso-fondo');
  });

  it('pone una banda por fase, con su nombre', () => {
    const html = pintar({
      semanas: largas,
      tramos: [
        { desde: 0, hasta: 2, name: 'Definición', id: 'f1' },
        { desde: 3, hasta: 5, name: 'Volumen', id: 'f2' },
      ],
    });
    expect(html).toContain('Definición');
    expect(html).toContain('Volumen');
    /* La banda en curso es la última, y es la única que sube de tinte. */
    expect(html).toContain('progreso-fase is-actual');
  });

  it('explica cada trazo con una muestra dibujada igual que él', () => {
    const html = pintar({ semanas: largas, objetivo: 75 });
    const entradas = html.match(/<li>/g) || [];
    expect(entradas).toHaveLength(3);
    const muestras = html.match(/progreso-muestra/g) || [];
    expect(muestras).toHaveLength(3);
  });
});
