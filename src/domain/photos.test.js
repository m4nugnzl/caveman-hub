import { describe, expect, it } from 'vitest';

import { photoCoverage, thumbnailUrl, weekFromStart, weekStartOfProgramWeek } from './photos';
import { weekStart } from '@/lib/dates';

/**
 * Los dos ejes de semana, que hasta ahora no encajaban.
 *
 * Las fotos van por semana de programa y los check-ins por semana natural.
 * `auditoria.md` §1.2 los llamaba dos calendarios incompatibles, y lo eran
 * porque `weekFromStart` contaba desde la fecha cruda de alta: quien empezaba en
 * miércoles tenía semanas de miércoles a martes.
 *
 * Lo que se fija aquí es la propiedad que lo arregla: **la semana de programa es
 * una semana natural**, así que las dos son la misma partición del tiempo con
 * distinta etiqueta y la conversión es exacta en los dos sentidos.
 */
describe('los dos ejes de semana', () => {
  /* El caso que no encajaba. Miércoles 7 de enero de 2026; su lunes es el 5. */
  const MIERCOLES = '2026-01-07';

  it('la semana 1 de quien empieza en miércoles es su semana natural entera', () => {
    // Del lunes anterior al domingo siguiente, todo es semana 1.
    for (const dia of ['2026-01-05', '2026-01-07', '2026-01-11']) {
      expect(weekFromStart(MIERCOLES, dia)).toBe(1);
    }
    // Y el lunes siguiente ya es la 2, no el miércoles siguiente.
    expect(weekFromStart(MIERCOLES, '2026-01-12')).toBe(2);
    expect(weekFromStart(MIERCOLES, '2026-01-14')).toBe(2);
  });

  it('una semana de programa nunca se parte entre dos semanas naturales', () => {
    /*
      La propiedad que hace conmensurables los dos ejes: todos los días con el
      mismo número de semana de programa comparten el mismo lunes. Antes esto era
      falso para cualquier alta que no cayera en lunes.
    */
    const dias = [];
    for (let i = 0; i < 42; i += 1) {
      dias.push(new Date(Date.parse('2026-01-05T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));
    }

    const lunesPorSemana = new Map();
    for (const dia of dias) {
      const semana = weekFromStart(MIERCOLES, dia);
      const lunes = weekStart(dia);
      if (!lunesPorSemana.has(semana)) lunesPorSemana.set(semana, new Set());
      lunesPorSemana.get(semana).add(lunes);
    }

    for (const [, lunes] of lunesPorSemana) expect(lunes.size).toBe(1);
  });

  it('la conversión es exacta en los dos sentidos', () => {
    for (const alta of [MIERCOLES, '2026-01-05', '2026-03-29']) {
      for (const semana of [1, 2, 7, 30]) {
        const lunes = weekStartOfProgramWeek(alta, semana);
        expect(weekFromStart(alta, lunes)).toBe(semana);
      }
    }
  });

  it('un check-in cae siempre en la semana de programa de su lunes', () => {
    /* Es la pregunta que no se podía contestar: dado el `weekStart` de un
       check-in, ¿de qué semana son sus fotos? */
    const checkIn = '2026-02-16'; // un lunes
    const semana = weekFromStart(MIERCOLES, checkIn);
    expect(weekStartOfProgramWeek(MIERCOLES, semana)).toBe(checkIn);
  });

  it('sin fecha no se inventa una semana', () => {
    expect(weekFromStart(null, '2026-01-07')).toBeNull();
    expect(weekFromStart(MIERCOLES, 'no es una fecha')).toBeNull();
    expect(weekStartOfProgramWeek(null, 3)).toBeNull();
  });

  it('nunca hay semana cero ni negativa', () => {
    // Una foto anterior al alta —pasa al mover la fecha de inicio hacia delante—.
    expect(weekFromStart(MIERCOLES, '2025-11-03')).toBe(1);
  });
});

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
