import { describe, expect, it } from 'vitest';

import { enRenglones, escalaPeso, escalaPorColumnas, escalaX, ventanaDe } from './geometria';

/* Lo que protege: que dos rótulos no se pisen nunca, que el eje del peso no
   convierta 100 g en un despeñadero y que cada zoom mire donde dice. */
describe('la geometría de la línea del plan', () => {
  it('coloca los rótulos en el primer renglón libre y nunca uno encima de otro', () => {
    const { items, filas } = enRenglones(
      [
        { x: 0, texto: '2.600 kcal −300' },
        { x: 20, texto: '2.450' },
        { x: 400, texto: 'cardio' },
      ],
      1000
    );
    expect(items.map((i) => i.fila)).toEqual([0, 1, 0]);
    expect(filas).toBe(2);
  });

  it('lo que no cabe en los renglones que hay se queda sin renglón', () => {
    const { items } = enRenglones([{ x: 0, texto: 'Refeed' }, { x: 0, texto: 'Regional' }], 1000, 1);
    expect(items[1].fila).toBeNull();
  });

  it('un rótulo que se sale por la derecha se mete hacia dentro', () => {
    const { items } = enRenglones([{ x: 990, texto: 'Vacaciones' }], 1000);
    expect(items[0].xt + items[0].w).toBeLessThanOrEqual(1000);
  });

  it('el eje del peso no baja de dos kilos', () => {
    const e = escalaPeso([78.3, 78.4]);
    expect(e.hi - e.lo).toBeGreaterThanOrEqual(2);
  });

  it('la escala de fechas va de borde a borde', () => {
    const X = escalaX(['2026-09-07', '2026-09-21'], 0, 140);
    expect(X('2026-09-14')).toBe(70);
  });

  /*
    Lo que protege esto: que las tiras de la portada sigan colocando el pesaje
    donde lo colocaban antes de compartir el dibujo con la temporada. Son las
    dos cuentas que estaban escritas a mano dentro de `PortadaDeSemanas` y que
    ahora salen de aquí.
  */
  describe('la escala por columnas', () => {
    const CANAL = 40;
    const COL = 80;
    const X = escalaPorColumnas('2026-09-07', CANAL, COL);

    it('pone el jueves en el centro de su columna: ahí va la media', () => {
      expect(X('2026-09-10')).toBe(CANAL + COL * 0.5);
      expect(X('2026-09-17')).toBe(CANAL + COL * 1.5);
    });

    it('reparte los días dentro de la columna, cada uno en su séptimo', () => {
      expect(X('2026-09-07')).toBeCloseTo(CANAL + (COL * 0.5) / 7, 10);
      expect(X('2026-09-13')).toBeCloseTo(CANAL + (COL * 6.5) / 7, 10);
    });

    it('una semana de antes de la primera sale a la izquierda del canal', () => {
      expect(X('2026-09-03')).toBeLessThan(CANAL);
    });
  });

  it('cada zoom mira donde dice', () => {
    const plan = {
      hoy: '2026-09-21',
      rango: { desde: '2026-07-13', hasta: '2027-01-25' },
      destino: { date: '2027-01-31' },
      cruce: null,
      grupos: [{ fase: { id: 'def' }, desde: '2026-09-07', hasta: '2026-12-27' }],
    };
    expect(ventanaDe({ zoom: 'temporada', plan })).toEqual(['2026-07-06', '2027-02-08']);
    expect(ventanaDe({ zoom: 'fase', plan })).toEqual(['2026-08-31', '2027-01-18']);
    expect(ventanaDe({ zoom: 'semana', plan, lunes: '2026-09-14' })).toEqual(['2026-08-31', '2026-10-05']);
  });
});
