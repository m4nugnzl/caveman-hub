import { describe, expect, it } from 'vitest';

import { ALTO_MINIMO, conY, marcasDe, porFase, porVentana, pxPorKilo } from './escalaDePeso';

const semana = (media, esperado = null, pesajes = []) => ({
  media,
  esperado,
  pesajes: pesajes.map((weight) => ({ weight })),
});

describe('modo ventana', () => {
  it('dos pesos casi iguales no aplanan el eje: el rango nunca baja de dos kilos', () => {
    const e = porVentana([78.3, 78.4]);
    expect(e.hi - e.lo).toBeGreaterThanOrEqual(2);
    expect((e.hi + e.lo) / 2).toBeCloseTo(78.35, 5);
  });

  it('sin ningún valor no hay escala', () => {
    expect(porVentana([null, undefined, NaN])).toBeNull();
  });
});

describe('modo fase: la proporción, no el rango', () => {
  it('todas las fases usan los mismos px por kilo, y la de más recorrido manda', () => {
    const larga = [semana(84), semana(82), semana(80)];
    const corta = [semana(80.2), semana(80)];
    const ppk = pxPorKilo([larga, corta]);
    expect(ppk).toBeCloseTo(260 / 4.7, 5);
    const a = porFase(larga, ppk);
    expect(a.alto).toBe(260);
    const b = porFase(corta, ppk);
    /* La corta sube al mínimo, pero con la misma proporción. */
    expect(b.alto).toBe(ALTO_MINIMO);
    expect(b.alto / (b.hi - b.lo)).toBeCloseTo(ppk, 5);
  });

  it('cuenta los pesajes y el esperado, no solo las medias', () => {
    const ppk = pxPorKilo([[semana(80, 79, [81.5])]]);
    expect(ppk).toBeCloseTo(260 / (2.5 + 0.7), 5);
  });
});

describe('las dos escalas se leen igual', () => {
  /*
    Es la razón de que este módulo exista: la gráfica de la temporada y las
    tiras de la portada le piden la misma forma al eje, así que el trazo del
    peso puede ser un solo dibujo.
  */
  it('las dos dan `lo`, `hi` y una `y` de kilos a píxeles', () => {
    const semanas = [semana(84), semana(80)];
    const a = conY(porVentana([84, 80]), 0, 200);
    const b = conY(porFase(semanas, 55));
    for (const e of [a, b]) {
      expect(e.lo).toBeLessThan(80);
      expect(e.hi).toBeGreaterThan(84);
      expect(e.y(e.hi)).toBeCloseTo(0, 5);
      expect(e.y(e.lo)).toBeCloseTo(e.alto, 5);
    }
  });

  it('las marcas del eje caen dentro de la escala', () => {
    const e = porFase([semana(84), semana(80)], 55);
    const marcas = marcasDe(e);
    expect(marcas.length).toBeGreaterThan(2);
    expect(Math.min(...marcas)).toBeGreaterThanOrEqual(e.lo);
    expect(Math.max(...marcas)).toBeLessThanOrEqual(e.hi);
  });
});
