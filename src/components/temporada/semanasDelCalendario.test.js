import { describe, expect, it } from 'vitest';

import { altoDeSemana, barrasDeLaSemana, cajaDeSemana, MEDIDAS, posiciones, semanasDelCalendario } from './semanasDelCalendario';

const hoy = '2026-09-24';
const fase = { id: 'f1', title: 'Definición', direction: 'cut', startsOn: '2026-09-02', endsOn: '2026-12-31' };
const antes = { id: 'f0', title: 'Volumen', direction: 'bulk', startsOn: '2026-01-05', endsOn: '2026-09-01' };

const semana = (lunes, extra = {}) => ({
  lunes,
  domingo: lunes.replace(/\d\d$/, (d) => String(Number(d) + 6).padStart(2, '0')),
  estado: 'pasada',
  pesajes: [],
  media: null,
  pauta: { kcals: 2450, steps: 10000, cardio: null, tipos: [] },
  ...extra,
});

describe('semanasDelCalendario', () => {
  const semanas = [
    semana('2026-08-24', { numero: 34, media: 85.9, revision5: 'revisada', pesajes: [{ date: '2026-08-24', weight: 85.7 }] }),
    semana('2026-08-31', { numero: 35, media: 85.0, pauta: { kcals: 2450, steps: 12000, cardio: '3x35 min', tipos: [] } }),
    semana('2026-10-05', { numero: 40, estado: 'futura', esperado: 82.2, pauta: null }),
  ];
  const refeed = { id: 'r1', kind: 'refeed', date: '2026-10-10', kcal: 3300, title: 'Refeed' };
  const diasDe = (lunes) =>
    Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-${lunes.slice(5, 8)}${String(Number(lunes.slice(8)) + i).padStart(2, '0')}`, kcals: i === 2 ? 2100 : 2450, tipo: i === 2 ? 'baja' : 'alta', intervencion: null }));
  const cal = semanasDelCalendario({
    semanas,
    hoy,
    diasDe,
    intervenciones: [refeed],
    contexto: [{ id: 'v', kind: 'rest', date: '2026-08-26', hasta: '2026-09-02', title: 'Vacaciones' }],
    fases: [antes, fase],
    entrenoDe: (l) => (l === '2026-08-24' ? { hechas: 4, pedidos: 5, dias: [{ fecha: '2026-08-25', pedida: 'Torso', hechas: [] }] } : null),
  });

  it('el pesaje, el día alto y la sesión que se pidió y no se hizo', () => {
    const [lunes, martes, miercoles] = cal[0].dias;
    expect(lunes.pesaje).toBe('85,7');
    expect(martes.sesion).toBe('falta');
    expect(martes.sesiones).toEqual(['Torso']);
    expect(miercoles.tipo).toBe('baja');
    expect(miercoles.alto).toBe(false);
    expect(lunes.alto).toBe(true);
  });

  it('la columna: la semana, el peso medio y su cambio en palabras; nada más', () => {
    expect(cal[0].columna).toEqual({ peso: '85,9 kg', cambio: null, extremo: null });
    expect(cal[1].columna.cambio).toBe('baja 0,9 kg');
  });

  it('si el peso no cambia, no se escribe nada', () => {
    const [, b] = semanasDelCalendario({ semanas: [semanas[0], { ...semanas[1], media: 85.92 }], hoy });
    expect(b.columna.cambio).toBeNull();
  });

  it('una sensación en un extremo sale en la columna, en su tono', () => {
    const [s] = semanasDelCalendario({
      semanas: [semanas[0]],
      hoy,
      sensaciones: [
        { id: 'sueno', nombre: 'Sueño', max: 10, celdas: [{ desde: '2026-08-24', hasta: '2026-08-30', valor: 6, tono: null }] },
        { id: 'hambre', nombre: 'Hambre', max: 10, celdas: [{ desde: '2026-08-24', hasta: '2026-08-30', valor: 10, tono: 'malo' }] },
      ],
    });
    expect(s.columna.extremo).toEqual({ texto: 'Hambre 10/10', tono: 'malo' });
  });

  it('una semana futura: lo esperado y el refeed previsto con su nombre y su cifra', () => {
    expect(cal[2].columna).toEqual({ peso: '82,2 kg', cambio: 'esperado', extremo: null });
    const sabado = cal[2].dias[5];
    expect(sabado.intervencion).toMatchObject({ nombre: 'Refeed', cifra: '3.300' });
    expect(sabado.futuro).toBe(true);
  });

  it('la fase que empieza a mitad de semana: la franja cambia y se nombra una vez', () => {
    expect(cal[1].franja.map((f) => f.desde)).toEqual([0, 2]);
    expect(cal[1].fase).toMatchObject({ nombre: 'Definición', columna: 2 });
  });

  it('un mes que empieza en lunes lleva su rótulo, y la fila lo mide', () => {
    const [s] = semanasDelCalendario({ semanas: [semana('2027-02-01', { estado: 'futura' })], hoy });
    expect(s.rotulo).toBe('Febrero');
    /* Vacía: el mínimo. */
    expect(altoDeSemana(s)).toBe(MEDIDAS.rotulo + MEDIDAS.minimo);
    expect(cajaDeSemana(s, 'escritorio')).toEqual({ arriba: MEDIDAS.rotulo, abajo: MEDIDAS.rotulo + MEDIDAS.minimo });
  });

  it('la fila mide lo que lleva: la columna de tres líneas manda sobre el refeed', () => {
    const M = MEDIDAS;
    expect(altoDeSemana(cal[2])).toBe(M.aire + M.col + M.linea + M.peso + M.linea);
  });
});

describe('barrasDeLaSemana', () => {
  it('parte un hecho en las semanas que cruza y dice su nombre donde empieza', () => {
    const e = { id: 'v', kind: 'rest', date: '2026-08-26', hasta: '2026-09-02', title: 'Vacaciones' };
    const [a] = barrasDeLaSemana('2026-08-24', [e], hoy);
    const [b] = barrasDeLaSemana('2026-08-31', [e], hoy);
    expect([a.desde, a.hasta, a.nombre]).toEqual([2, 6, 'Vacaciones']);
    expect([b.desde, b.hasta, b.nombre]).toEqual([0, 2, null]);
  });

  it('dos hechos que se pisan van en carriles distintos', () => {
    const barras = barrasDeLaSemana(
      '2026-08-24',
      [
        { id: 'a', kind: 'rest', date: '2026-08-24', hasta: '2026-08-27' },
        { id: 'b', kind: 'illness', date: '2026-08-26', hasta: '2026-08-28' },
      ],
      hoy
    );
    expect(barras.map((b) => b.carril)).toEqual([0, 1]);
  });
});

describe('posiciones', () => {
  it('encuentra la fila que hay en un píxel', () => {
    const { tops, total, indice } = posiciones([100, 50, 200]);
    expect(tops).toEqual([0, 100, 150]);
    expect(total).toBe(350);
    expect(indice(0)).toBe(0);
    expect(indice(120)).toBe(1);
    expect(indice(349)).toBe(2);
  });
});
