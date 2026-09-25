import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { alCambiar, cabeEn, sinRepetir, tramosDeDias, tramosDeSemanas, escalaVertical, numerosDeDias, numerosDeSemanas, valorBase } from './escalones';

const semana = (lunes, pauta, extra = {}) => ({ lunes, domingo: addDays(lunes, 6), pauta, media: null, pesajes: [], ...extra });

describe('la escala vertical', () => {
  it('no empieza en cero: 2.600 y 2.900 se ven distintas y el refeed, más alto', () => {
    const e = escalaVertical([2600, 2900, 3570]);
    expect(e.base).toBeGreaterThan(0);
    expect(e.fraccion(2900) - e.fraccion(2600)).toBeGreaterThan(0.15);
    expect(e.fraccion(3570)).toBe(1);
  });
  it('con todo igual, el área se ve; sin valores, no hay escala', () => {
    expect(escalaVertical([2450, 2450]).fraccion(2450)).toBe(1);
    expect(escalaVertical([null])).toBeNull();
  });
});

describe('el valor base de una semana', () => {
  it('lo que vale más días; a igualdad, lo que menos pide', () => {
    expect(valorBase([{ kcals: 2900, dias: 4 }, { kcals: 2600, dias: 3 }], 'kcals')).toBe(2900);
    expect(valorBase([{ kcals: 2900, dias: 2 }, { kcals: 2600, dias: 2 }], 'kcals')).toBe(2600);
  });
});

describe('tramos y números', () => {
  const tipos = [
    { n: 'alta', kcals: 3000, steps: 9000, dias: 5 },
    { n: 'baja', kcals: 2800, steps: 12000, dias: 2 },
  ];
  const tiposDe = (l) => (l >= '2026-09-07' ? tipos : []);
  const semanas = [
    semana('2026-08-31', { kcals: 2900, steps: 9000, soloMedia: true }),
    semana('2026-09-07', { kcals: 2943, steps: 9857 }),
    semana('2026-09-14', { kcals: 2943, steps: 9857 }),
    semana('2026-09-21', { kcals: 2943, steps: 9857 }),
  ];
  const refeed = { id: 'r', kind: 'refeed', date: '2026-09-12', hasta: '2026-09-13', kcal: 3570 };

  it('un tramo por semana con su media, hasta la que corre; el refeed, como marca', () => {
    const b = tramosDeSemanas({ semanas, clave: 'kcals', hoy: '2026-09-17', intervenciones: [refeed] });
    expect(b.map((x) => x.desde)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
    expect(b[0].media).toBe(true);
    expect(b[1].marca.valor).toBe(3570);
    expect(b[2].marca).toBeNull();
  });

  it('el número de la semana: el valor base, «+ refeed», el tramo de pasos, «≈» con solo la media', () => {
    const k = numerosDeSemanas({ semanas, clave: 'kcals', hoy: '2026-09-17', tiposDe, intervenciones: [refeed] });
    expect(k.map((x) => x.opciones[0])).toEqual(['≈ 2.900', '3.000 + refeed', '3.000']);
    const p = numerosDeSemanas({ semanas, clave: 'steps', hoy: '2026-09-17', tiposDe });
    expect(p[1].opciones).toEqual(['9.000–12.000']);
  });

  it('el número solo al cambiar: el primero que se ve y cada cambio', () => {
    const k = numerosDeSemanas({ semanas, clave: 'kcals', hoy: '2026-09-30', tiposDe });
    expect(alCambiar(k).map((x) => [x.desde, x.opciones[0], x.siguiente])).toEqual([
      ['2026-08-31', '≈ 2.900', '2026-09-07'],
      ['2026-09-07', '3.000', null],
    ]);
  });

  it('un tramo por día; el refeed en su tinta y con su evento; los pasos no cambian con él', () => {
    const dia = (fecha, kcals, extra = {}) => ({ fecha, kcals, steps: 9000, tipo: 'alta', intervencion: null, exacto: true, ...extra });
    const dias = [dia('2026-09-10', 3000), dia('2026-09-11', 3000), dia('2026-09-12', 3570, { tipo: null, intervencion: refeed })];
    const kcal = tramosDeDias({ dias, clave: 'kcals', hoy: '2026-09-11' });
    expect(kcal[2].eventos).toEqual([refeed]);
    expect(kcal[2].color).toBe('var(--data-violet)');
    expect(kcal[2].futuro).toBe(true);
    expect(tramosDeDias({ dias, clave: 'steps', hoy: '2026-09-11' })[2].eventos).toBeNull();
    /* Nunca «3.000 3.000»: el segundo día igual no lleva número. */
    expect(alCambiar(numerosDeDias(kcal)).map((x) => x.desde)).toEqual(['2026-09-10', '2026-09-12']);
  });
});

describe('el número de la semana, a su altura', () => {
  it('lleva el valor base: de cerca se escribe sobre él', () => {
    const tipos = [
      { n: 'alta', kcals: 3000, dias: 5 },
      { n: 'baja', kcals: 2800, dias: 2 },
    ];
    const k = numerosDeSemanas({ semanas: [semana('2026-09-07', { kcals: 2943 })], clave: 'kcals', hoy: '2026-09-17', tiposDe: () => tipos });
    expect(k[0].valor).toBe(3000);
  });
});

describe('si un número cabe', () => {
  it('los signos estrechos cuentan medio', () => {
    /* A 13 px (--tl-letra). */
    expect(cabeEn('3.570', 34)).toBe(true);
    expect(cabeEn('3.570', 24)).toBe(false);
    expect(cabeEn('9.000–12.000', 80)).toBe(true);
  });
});

describe('ningún número repetido', () => {
  it('alta y baja alternas se escriben una vez; lo nuevo, sí', () => {
    const n = (desde, cifra) => ({ desde, hasta: desde, opciones: [cifra] });
    const salen = sinRepetir([n('2026-09-01', '2.600'), n('2026-09-02', '2.900'), n('2026-09-03', '2.600'), n('2026-09-04', '3.000')]);
    expect(salen.map((x) => x.opciones[0])).toEqual(['2.600', '2.900', '3.000']);
    expect(salen[1].siguiente).toBe('2026-09-04');
  });
});
