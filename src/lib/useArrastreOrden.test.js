import { describe, expect, it } from 'vitest';

import { desplazamientoDe } from './useArrastreOrden';

/**
 * ══ Qué se prueba aquí y qué no ═════════════════════════════════════════════
 *
 * El gancho es eventos de puntero, y eso no se prueba sin un navegador de
 * verdad —el proyecto no monta jsdom a propósito—. Lo que sí es lógica pura es
 * la geometría: QUÉ piezas se apartan para dejar el hueco y CUÁNTO.
 *
 * Es además donde vive el error clásico: el tramo que se desplaza es abierto por
 * un lado y cerrado por el otro, y al revés según se arrastre hacia delante o
 * hacia atrás. Equivocarse en un extremo no rompe nada — solo hace que una
 * pastilla se quede quieta cuando debería apartarse, que es de esas cosas que
 * se ven raras sin saber por qué.
 */

/** Cinco pastillas de 100 px con 10 de hueco, todas en la misma línea. */
const enLinea = (n = 5, top = 0) =>
  Array.from({ length: n }, (_, i) => ({
    left: i * 110,
    right: i * 110 + 100,
    top,
    bottom: top + 28,
    width: 100,
  }));

const gesto = (rects, paso = 110) => ({ rects, paso });

describe('el hueco que se abre al arrastrar', () => {
  const g = gesto(enLinea());

  it('el que viaja no se aparta de sí mismo', () => {
    expect(desplazamientoDe(1, 1, 3, g)).toBe(0);
  });

  /* Llevando el 1 al 3: el 2 y el 3 corren a la izquierda para dejarle sitio;
     el 0 y el 4 están fuera del tramo y no se enteran. */
  it('hacia delante se aparta el tramo (origen, destino]', () => {
    expect(desplazamientoDe(0, 1, 3, g)).toBe(0);
    expect(desplazamientoDe(2, 1, 3, g)).toBe(-110);
    expect(desplazamientoDe(3, 1, 3, g)).toBe(-110);
    expect(desplazamientoDe(4, 1, 3, g)).toBe(0);
  });

  /* Y al revés, llevando el 3 al 1: el 1 y el 2 corren a la derecha. */
  it('hacia atrás se aparta el tramo [destino, origen)', () => {
    expect(desplazamientoDe(0, 3, 1, g)).toBe(0);
    expect(desplazamientoDe(1, 3, 1, g)).toBe(110);
    expect(desplazamientoDe(2, 3, 1, g)).toBe(110);
    expect(desplazamientoDe(4, 3, 1, g)).toBe(0);
  });

  it('soltándolo donde estaba no se mueve nadie', () => {
    expect([0, 1, 2, 3, 4].map((i) => desplazamientoDe(i, 2, 2, g))).toEqual([0, 0, 0, 0, 0]);
  });

  /* El carril envuelve cuando hay muchos días. Correr una pastilla de la fila de
     abajo porque el hueco se abre arriba no describe nada: ahí manda el canto
     que marca el destino. */
  it('las de otra línea no se apartan', () => {
    const dosFilas = [...enLinea(3, 0), ...enLinea(3, 40)];
    const gDos = gesto(dosFilas);
    expect(desplazamientoDe(1, 0, 4, gDos)).toBe(-110); // misma fila que el origen
    expect(desplazamientoDe(4, 0, 4, gDos)).toBe(0); // fila de abajo
  });

  /* La hoja de series: las piezas van apiladas y son de altos distintos —un
     ejercicio de cuatro series mide más que uno de tres—, pero el hueco que se
     abre es siempre el del QUE VIAJA, no el de la pieza que se aparta. Por eso
     el paso es uno solo y no uno por fila. */
  describe('apiladas (eje y)', () => {
    const enColumna = (alturas, left = 0) => {
      let y = 0;
      return alturas.map((h) => {
        const r = { left, right: left + 600, top: y, bottom: y + h, width: 600, height: h };
        y += h + 10;
        return r;
      });
    };
    const gY = { rects: enColumna([250, 190, 320, 190]), paso: 260, eje: 'y' };

    it('hacia abajo se aparta el tramo (origen, destino]', () => {
      expect(desplazamientoDe(0, 0, 2, gY)).toBe(0);
      expect(desplazamientoDe(1, 0, 2, gY)).toBe(-260);
      expect(desplazamientoDe(2, 0, 2, gY)).toBe(-260);
      expect(desplazamientoDe(3, 0, 2, gY)).toBe(0);
    });

    it('hacia arriba se aparta el tramo [destino, origen)', () => {
      expect(desplazamientoDe(0, 2, 0, gY)).toBe(260);
      expect(desplazamientoDe(1, 2, 0, gY)).toBe(260);
      expect(desplazamientoDe(3, 2, 0, gY)).toBe(0);
    });

    /* Apiladas, «otra línea» es «otra columna»: con el eje puesto, lo que no se
       aparta es lo que no comparte el canto izquierdo. Sin esta rama, la
       comprobación de los carriles —misma `top`— descartaría TODAS las filas de
       una lista vertical y no se apartaría ninguna. */
    it('las de otra columna no se apartan', () => {
      const dos = { ...gY, rects: [...enColumna([250, 190]), ...enColumna([250, 190], 700)] };
      expect(desplazamientoDe(1, 0, 3, dos)).toBe(-260);
      expect(desplazamientoDe(3, 0, 3, dos)).toBe(0);
    });
  });

  it('sin medidas todavía, nadie se mueve', () => {
    expect(desplazamientoDe(1, 0, 2, null)).toBe(0);
    expect(desplazamientoDe(1, 0, null, g)).toBe(0);
  });
});
