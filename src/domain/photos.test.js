import { describe, expect, it } from 'vitest';

import { photoCoverage, thumbnailUrl } from './photos';

describe('thumbnailUrl', () => {
  it('cambia la ruta del objeto por la de transformación y añade el ancho', () => {
    const signed = 'https://x.supabase.co/storage/v1/object/sign/client-media/c1/photos/week-3/a.jpg?token=abc';
    const thumb = thumbnailUrl(signed, 180);

    expect(thumb).toContain('/render/image/sign/');
    expect(thumb).not.toContain('/object/sign/');
    expect(thumb).toContain('token=abc');
    expect(thumb).toContain('width=180');
  });

  it('devuelve la original si la URL no tiene la forma esperada', () => {
    /*
      La optimización tiene que fallar hacia el lado bueno: si la URL no es una
      firmada de Supabase —una externa antigua, o un formato que cambie— se
      devuelve tal cual. El peor caso es descargar el original, nunca una foto
      rota.
    */
    expect(thumbnailUrl('https://ejemplo.com/foto.jpg')).toBe('https://ejemplo.com/foto.jpg');
    expect(thumbnailUrl(null)).toBe(null);
    expect(thumbnailUrl(undefined)).toBe(undefined);
  });
});

const START = '2026-01-05'; // un lunes

/** Una foto de la semana `week` con el ángulo indicado. */
const photo = (week, angle) => ({
  angle,
  // `photoWeek` cae en la semana del programa a partir de la fecha.
  date: new Date(Date.parse(`${START}T00:00:00Z`) + (week - 1) * 7 * 86400000)
    .toISOString()
    .slice(0, 10),
});

describe('photoCoverage', () => {
  it('devuelve TODAS las semanas del rango, también las que no tienen fotos', () => {
    /*
      Es la razón de existir de la pieza. Una semana sin fotos no aparecía en
      ninguna parte —la biblioteca agrupa lo que hay— así que el hueco solo se
      descubría al ir a comparar y no encontrar con qué.
    */
    const coverage = photoCoverage({
      photos: [photo(1, 'front'), photo(4, 'front')],
      startDate: START,
      angles: ['front'],
    });

    expect(coverage.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(coverage.filter((w) => w.empty).map((w) => w.week)).toEqual([2, 3]);
  });

  it('marca a medias la semana a la que le falta un ángulo que el cliente sí usa', () => {
    const coverage = photoCoverage({
      photos: [photo(1, 'front'), photo(1, 'back'), photo(2, 'front')],
      startDate: START,
      angles: ['front', 'back'],
    });

    expect(coverage[0].complete).toBe(true);
    expect(coverage[1].complete).toBe(false);
    expect(coverage[1].empty).toBe(false);
  });

  it('no marca como incompleta una semana por un ángulo que ese cliente no se hace', () => {
    /*
      Comprobar siempre los tres ángulos del catálogo llenaría la pantalla de
      avisos para quien solo se fotografía de frente, y un aviso que siempre está
      encendido deja de mirarse.
    */
    const coverage = photoCoverage({
      photos: [photo(1, 'front'), photo(2, 'front')],
      startDate: START,
      angles: ['front'],
    });

    expect(coverage.every((w) => w.complete)).toBe(true);
  });

  it('sin fotos no hay historial que enseñar', () => {
    expect(photoCoverage({ photos: [], startDate: START })).toEqual([]);
  });
});
