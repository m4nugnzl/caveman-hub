import { describe, expect, it } from 'vitest';

import { cambiosDeDieta, estadoDe, impactoDe, intervencionesDelCliente, kcalDelCambio, pesoDeLaVentana, ventanasDe } from './intervenciones';

const refeed = { id: 'r1', kind: 'refeed', date: '2026-09-11', hasta: '2026-09-13', pautaDias: [{ kcal: 3000 }, { kcal: 3300 }, { kcal: 3740 }] };
const vacaciones = { id: 'v1', kind: 'rest', date: '2026-08-01', hasta: '2026-08-10' };
const version = (dia, kcals, extra = {}) => ({ dia, snapshot: { kcals, protein: 180, carbs: 300, fats: 70, steps: 10000, cardio: null, ...extra } });

describe('las intervenciones del cliente', () => {
  it('salen de refeeds, cambios de dieta que tocan cifras y bloques nuevos', () => {
    const todas = intervencionesDelCliente({
      hechos: [refeed, vacaciones],
      versiones: [version('2026-08-03', 2600), version('2026-08-20', 2600, { cardio: null }), version('2026-09-24', 2400)],
      bloques: [
        { id: 'b1', nombre: 'Base', desde: '2026-07-01', split: 'Torso-pierna' },
        { id: 'b2', nombre: 'Fuerza', desde: '2026-09-07', split: 'Full body' },
      ],
      capa: [{ id: 'c1', eventId: 'r1', motivo: 'Glucógeno bajo' }],
      hoy: '2026-09-20',
    });
    expect(todas.map((x) => x.id)).toEqual(['b:b2', 'e:r1', 'd:2026-09-24']);
    const r = todas.find((x) => x.id === 'e:r1');
    expect(r).toMatchObject({ tipo: 'refeed', desde: '2026-09-11', hasta: '2026-09-13', prevista: false, fuente: { eventId: 'r1' } });
    expect(r.capa.motivo).toBe('Glucógeno bajo');
    const d = todas.find((x) => x.tipo === 'dieta');
    expect(d.prevista).toBe(true);
    expect(d.hasta).toBe('2026-09-30');
    expect(d.cambios).toEqual([{ clave: 'kcals', antes: 2600, despues: 2400 }]);
  });

  it('las kcal de un cambio de dieta se cuentan día a día, como en la tabla', () => {
    /* Días altos y bajos: la media del ciclo sería otra cifra. */
    const alta = new Set(['2026-09-18', '2026-09-19', '2026-09-26']);
    const pautaDelDia = (f) => ({ kcals: f < '2026-09-24' ? (alta.has(f) ? 3000 : 2600) : alta.has(f) ? 2800 : 2400 });
    const k = kcalDelCambio({ desde: '2026-09-24' }, pautaDelDia);
    expect(k.antes).toBeCloseTo((3000 * 2 + 2600 * 5) / 7, 5);
    expect(k.despues).toBeCloseTo((2800 + 2400 * 6) / 7, 5);
  });

  it('un cambio de dieta que no toca kcal, macros, pasos ni cardio no cuenta', () => {
    expect(cambiosDeDieta({ kcals: 2600.2, cardio: ' ' }, { kcals: 2600, cardio: null })).toEqual([]);
    expect(cambiosDeDieta({ steps: 10000, cardio: null }, { steps: 12000, cardio: 'Bici 30 min' })).toEqual([
      { clave: 'steps', antes: 10000, despues: 12000 },
      { clave: 'cardio', antes: null, despues: 'Bici 30 min' },
    ]);
  });
});

describe('las ventanas', () => {
  const x = { id: 'e:r1', desde: '2026-09-11', hasta: '2026-09-13', capa: null };

  it('siete días a cada lado por defecto', () => {
    const v = ventanasDe(x, { todas: [x] });
    expect(v.antes).toEqual({ desde: '2026-09-04', hasta: '2026-09-10' });
    expect(v.durante).toEqual({ desde: '2026-09-11', hasta: '2026-09-13' });
    expect(v.despues).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
  });

  it('se recortan por la fase y por las otras intervenciones', () => {
    const fases = [{ startsOn: '2026-09-07', endsOn: '2026-09-17' }];
    const antes = { id: 'd:x', desde: '2026-08-25', hasta: '2026-09-05' };
    const luego = { id: 'e:r2', desde: '2026-09-16', hasta: '2026-09-16' };
    const v = ventanasDe(x, { todas: [antes, x, luego], fases });
    expect(v.antes).toEqual({ desde: '2026-09-07', hasta: '2026-09-10' });
    expect(v.despues).toEqual({ desde: '2026-09-14', hasta: '2026-09-15' });
    /* Una que se pisa con ella la deja sin antes. */
    const pisada = { id: 'd:y', desde: '2026-09-05', hasta: '2026-09-11' };
    expect(ventanasDe(x, { todas: [pisada, x] }).antes).toBeNull();
  });

  it('lo movido a mano manda y no se recorta; si ya no cuadra, se ignora', () => {
    const fases = [{ startsOn: '2026-09-07', endsOn: null }];
    const movida = { ...x, capa: { antesDesde: '2026-08-28', despuesHasta: '2026-09-27' } };
    const v = ventanasDe(movida, { todas: [movida], fases });
    expect(v.antes.desde).toBe('2026-08-28');
    expect(v.despues.hasta).toBe('2026-09-27');
    expect(v.movidas).toEqual({ antes: true, despues: true });
    const vieja = { ...x, capa: { antesDesde: '2026-09-12', despuesHasta: '2026-09-12' } };
    expect(ventanasDe(vieja, { todas: [vieja] }).movidas).toEqual({ antes: false, despues: false });
  });

  it('está en curso mientras no termina la ventana de después', () => {
    const v = ventanasDe(x, { todas: [x] });
    expect(estadoDe(x, v, '2026-09-10')).toBe('prevista');
    expect(estadoDe(x, v, '2026-09-20')).toBe('en_curso');
    expect(estadoDe(x, v, '2026-09-21')).toBe('hecha');
  });
});

describe('lo que pasó en cada ventana', () => {
  it('el peso: media y tendencia en %/sem por mínimos cuadrados, desde dos días pesados', () => {
    const v = { desde: '2026-09-01', hasta: '2026-09-07' };
    const pesajes = [
      { date: '2026-09-01', weight: 80 },
      { date: '2026-09-04', weight: 79.7 },
      { date: '2026-09-07', weight: 79.4 },
    ];
    const p = pesoDeLaVentana(pesajes, v, '2026-09-30');
    expect(p.media).toBeCloseTo(79.7, 5);
    expect(p.ritmo).toBeCloseTo((-0.1 * 7 * 100) / 79.7, 5);
    /* Dos días bastan, y dicen cuántos la sostienen; uno solo, no. */
    const dos = pesoDeLaVentana(pesajes.slice(0, 2), v, '2026-09-30');
    expect(dos.ritmo).toBeCloseTo((-0.1 * 7 * 100) / 79.85, 5);
    expect(dos.pesajes).toBe(2);
    expect(pesoDeLaVentana(pesajes.slice(0, 1), v, '2026-09-30').ritmo).toBeNull();
    expect(pesoDeLaVentana([{ date: '2026-09-02', weight: 80 }, { date: '2026-09-02', weight: 79.6 }], v, '2026-09-30')).toMatchObject({ ritmo: null, pesajes: 1 });
    /* Lo de después de hoy no ha pasado. */
    expect(pesoDeLaVentana(pesajes, v, '2026-09-03').pesajes).toBe(1);
  });

  it('la tabla: pauta, sensaciones, entrenos y referencias contra antes', () => {
    const ventanas = {
      antes: { desde: '2026-09-04', hasta: '2026-09-10' },
      durante: { desde: '2026-09-11', hasta: '2026-09-13' },
      despues: { desde: '2026-09-14', hasta: '2026-09-20' },
    };
    const kcal = (f) => ({ kcals: f >= '2026-09-11' && f <= '2026-09-13' ? 3300 : 2600, steps: 10000 });
    const { filas } = impactoDe({
      ventanas,
      hoy: '2026-09-17',
      pautaDelDia: kcal,
      sensaciones: [
        {
          id: 'ci:hambre',
          nombre: 'Hambre',
          max: 10,
          celdas: [
            { desde: '2026-08-31', hasta: '2026-09-06', valor: 9 },
            { desde: '2026-09-07', hasta: '2026-09-13', valor: 7 },
            { desde: '2026-09-14', hasta: '2026-09-20', valor: 4 },
          ],
        },
      ],
      entrenoDelDia: (f) => ({ pedida: ['2026-09-08', '2026-09-09', '2026-09-15'].includes(f) ? 'Torso' : null, hechas: f === '2026-09-08' || f === '2026-09-15' ? [{}] : [] }),
      referencias: [{ nombre: 'Press banca', marca: (a) => (a === '2026-09-04' ? 100 : 103) }],
    });
    const porId = new Map(filas.map((f) => [f.id, f]));
    expect(porId.has('ritmo')).toBe(false);
    expect(porId.get('kcal').celdas).toEqual([2600, 3300, 2600]);
    /* Antes: el check-in de su semana (4 de 7 días dentro); durante (3 días): el de la suya. */
    expect(porId.get('s:ci:hambre').celdas).toEqual([7, 7, 4]);
    expect(porId.get('entrenos').celdas).toEqual([{ hechos: 1, pedidos: 2 }, null, { hechos: 1, pedidos: 1 }]);
    expect(porId.get('r:Press banca').celdas[0]).toBe(0);
    expect(porId.get('r:Press banca').celdas[2]).toBeCloseTo(0.03, 5);
  });
});
