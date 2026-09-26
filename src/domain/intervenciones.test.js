import { describe, expect, it } from 'vitest';

import {
  cambiosDeDieta,
  cifraClaveDe,
  estadoDe,
  historialDeIntervenciones,
  impactoDe,
  intervencionesDelCliente,
  kcalDelCambio,
  pesoDeLaVentana,
  recuentoDeIntervenciones,
  ventanasDe,
} from './intervenciones';

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

describe('los cambios de dieta programados (0146)', () => {
  const foto = (kcals, extra = {}) => ({ kcals, protein: 180, carbs: 300, fats: 70, steps: 10000, cardio: null, ...extra });
  const prog = (id, empieza, estado, kcals, extra = {}) => ({ id, empieza, estado, snapshot: foto(kcals), ...extra });

  it('una pendiente es un cambio previsto contra la dieta de ahora, y la siguiente contra la anterior', () => {
    const todas = intervencionesDelCliente({
      versiones: [version('2026-09-01', 2600)],
      programadas: [prog('p2', '2026-10-15', 'pendiente', 2200), prog('p1', '2026-10-01', 'pendiente', 2400)],
      actual: foto(2600),
      hoy: '2026-09-25',
    });
    const [a, b] = todas.filter((x) => x.programada);
    expect(a).toMatchObject({ id: 'p:p1', tipo: 'dieta', desde: '2026-10-01', prevista: true, fuente: null });
    expect(a.cambios).toEqual([{ clave: 'kcals', antes: 2600, despues: 2400 }]);
    expect(b.cambios).toEqual([{ clave: 'kcals', antes: 2400, despues: 2200 }]);
  });

  it('una aplicada se cuelga de la versión de su día; una no aplicada no sale', () => {
    const aplicada = prog('p1', '2026-09-20', 'aplicada', 2400, { retoqueDel: '2026-09-21T10:00:00Z' });
    const todas = intervencionesDelCliente({
      versiones: [version('2026-09-01', 2600), version('2026-09-20', 2400)],
      programadas: [aplicada, prog('p2', '2026-09-22', 'no_aplicada', 2000)],
      hoy: '2026-09-25',
    });
    expect(todas.map((x) => x.id)).toEqual(['d:2026-09-20']);
    expect(todas[0].programada).toBe(aplicada);
    expect(todas[0].fuente).toEqual({ dietaDia: '2026-09-20' });
  });

  it('una aplicada sin versión anterior con la que compararse sale sola, para decir cómo entró', () => {
    const aplicada = prog('p1', '2026-09-20', 'aplicada', 2400);
    const [x] = intervencionesDelCliente({ versiones: [version('2026-09-20', 2400)], programadas: [aplicada], hoy: '2026-09-25' });
    expect(x).toMatchObject({ id: 'p:p1', cambios: [], programada: aplicada, fuente: { dietaDia: '2026-09-20' } });
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

  it('se recortan solo por la fase; las otras intervenciones no recortan, coinciden', () => {
    const fases = [{ startsOn: '2026-09-07', endsOn: '2026-09-17' }];
    const antes = { id: 'd:x', desde: '2026-08-25', hasta: '2026-09-05' };
    const luego = { id: 'e:r2', desde: '2026-09-16', hasta: '2026-09-16' };
    const v = ventanasDe(x, { todas: [antes, x, luego], fases });
    expect(v.antes).toEqual({ desde: '2026-09-07', hasta: '2026-09-10' });
    expect(v.despues).toEqual({ desde: '2026-09-14', hasta: '2026-09-17' });
    /* La de antes acaba el 5, fuera de sus ventanas; la de luego cae dentro. */
    expect(v.coinciden.map((o) => o.id)).toEqual(['e:r2']);
    /* Una que se pisa con ella tampoco la deja sin antes: coincide. */
    const pisada = { id: 'd:y', desde: '2026-09-05', hasta: '2026-09-11' };
    const p = ventanasDe(x, { todas: [pisada, x] });
    expect(p.antes).toEqual({ desde: '2026-09-04', hasta: '2026-09-10' });
    expect(p.coinciden.map((o) => o.id)).toEqual(['d:y']);
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

describe('el historial', () => {
  const todas = intervencionesDelCliente({
    hechos: [
      refeed,
      { id: 'r2', kind: 'refeed', date: '2026-08-20', kcal: 3200 },
      { id: 'r3', kind: 'refeed', date: '2026-10-02', kcal: 3200 },
      { id: 'db', kind: 'diet_break', date: '2026-07-20', hasta: '2026-08-02', kcal: 2600 },
    ],
    versiones: [version('2026-07-01', 2600), version('2026-09-01', 2400)],
    capa: [
      { id: 'c1', eventId: 'r1', valoracion: 'funciono' },
      { id: 'c2', eventId: 'r2', valoracion: 'dudoso' },
    ],
    hoy: '2026-09-15',
  });
  /* Un pesaje al día, bajando 0,1 kg. */
  const pesajes = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 20 + i));
    return { date: d.toISOString().slice(0, 10), weight: 80 - i * 0.1 };
  });
  const historial = historialDeIntervenciones({ todas, pesajes, hoy: '2026-09-15', pautaDelDia: () => ({ kcals: 2500 }) });

  it('de la más reciente a la más antigua, con su estado y la tendencia antes y después', () => {
    expect(historial.map((e) => e.x.id)).toEqual(['e:r3', 'e:r1', 'd:2026-09-01', 'e:r2', 'e:db']);
    const r1 = historial.find((e) => e.x.id === 'e:r1');
    /* Su después (14–20 sep) no ha terminado el 15. */
    expect(r1.estado).toBe('en_curso');
    expect(r1.clave.tipo).toBe('peso');
    expect(r1.clave.antes.ritmo).toBeLessThan(0);
    expect(r1.clave.despues.pesajes).toBe(2);
    expect(historial[0].estado).toBe('prevista');
    expect(historial.find((e) => e.x.tipo === 'dieta').kcal).toEqual({ antes: 2500, despues: 2500 });
  });

  it('la cifra clave de un bloque: la media de sus referencias contra antes y la fatiga', () => {
    const impacto = {
      filas: [
        { id: 'ritmo', grupo: 'peso', celdas: [{ ritmo: -0.5, pesajes: 5 }, null, null] },
        { id: 'r:Sentadilla', grupo: 'rendimiento', celdas: [0, 0.01, 0.04] },
        { id: 'r:Press', grupo: 'rendimiento', celdas: [0, null, 0.02] },
        { id: 'r:Remo', grupo: 'rendimiento', celdas: [null, null, null] },
        { id: 's:se:fatigue', grupo: 'sensacion', max: 10, celdas: [6, 7, 5.5] },
      ],
    };
    const c = cifraClaveDe({ tipo: 'bloque' }, impacto);
    expect(c.rendimiento).toBeCloseTo(0.03, 5);
    expect(c.referencias).toBe(2);
    expect(c.fatiga).toEqual({ antes: 6, despues: 5.5, max: 10 });
    /* El resto de tipos, la tendencia del peso. */
    expect(cifraClaveDe({ tipo: 'refeed' }, impacto)).toEqual({ tipo: 'peso', antes: { ritmo: -0.5, pesajes: 5 }, despues: null });
    expect(cifraClaveDe({ tipo: 'bloque' }, { filas: [] })).toEqual({ tipo: 'bloque', rendimiento: null, referencias: 0, fatiga: null });
  });

  it('cuenta por tipo y por valoración, sin concluir nada', () => {
    expect(recuentoDeIntervenciones(historial)).toEqual([
      { tipo: 'refeed', plural: 'Refeeds', n: 3, funciono: 1, no_funciono: 0, dudoso: 1, sinValorar: 0, previstas: 1 },
      { tipo: 'diet_break', plural: 'Diet breaks', n: 1, funciono: 0, no_funciono: 0, dudoso: 0, sinValorar: 1, previstas: 0 },
      { tipo: 'dieta', plural: 'Cambios de dieta', n: 1, funciono: 0, no_funciono: 0, dudoso: 0, sinValorar: 1, previstas: 0 },
    ]);
  });
});
