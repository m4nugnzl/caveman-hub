import { describe, expect, it } from 'vitest';

import {
  DIA_MS,
  SEMANA_MS,
  acotar,
  aDia,
  aMs,
  ampliar,
  anchoDelEje,
  atajoDe,
  crearEscala,
  desplazar,
  limitesDe,
  marcasDelEje,
  mesesDeLaVista,
  nivelDelEje,
  nivelDe,
  rotuloQueCabe,
  vistaAParams,
  vistaDeFranja,
  vistaDelAtajo,
  vistaDeParams,
  vistaDeSemana,
} from './escalaDeTiempo';

const limites = { inicio: aMs('2026-03-02'), fin: aMs('2026-11-30') };

describe('la vista', () => {
  it('no es más estrecha que una semana ni más ancha que la temporada', () => {
    const estrecha = acotar({ inicio: aMs('2026-06-01'), fin: aMs('2026-06-03') }, limites);
    expect(estrecha.fin - estrecha.inicio).toBe(SEMANA_MS);
    const ancha = acotar({ inicio: aMs('2025-01-01'), fin: aMs('2027-12-31') }, limites);
    expect(ancha).toEqual(limites);
  });

  it('no se sale por los lados al desplazarla', () => {
    const v = vistaDeSemana('2026-11-23');
    const movida = desplazar(v, 30 * DIA_MS, limites);
    expect(movida.fin).toBe(limites.fin);
    expect(movida.fin - movida.inicio).toBe(SEMANA_MS);
  });

  it('acercar deja quieto el instante que está bajo el dedo', () => {
    const v = { inicio: aMs('2026-04-06'), fin: aMs('2026-08-03') };
    const ancla = aMs('2026-05-18');
    const t = (ancla - v.inicio) / (v.fin - v.inicio);
    const cerca = ampliar(v, 2, ancla, limites);
    expect((ancla - cerca.inicio) / (cerca.fin - cerca.inicio)).toBeCloseTo(t, 6);
    expect(cerca.fin - cerca.inicio).toBeCloseTo((v.fin - v.inicio) / 2, 0);
  });

  it('el nivel sale del ancho de la vista', () => {
    expect(nivelDe(limites, limites)).toBe('temporada');
    expect(nivelDe(vistaDeSemana('2026-06-01'), limites)).toBe('rango');
    expect(nivelDe({ inicio: aMs('2026-06-01'), fin: aMs('2026-08-03') }, limites)).toBe('rango');
  });
});

describe('los límites de la temporada', () => {
  const plan = { rango: { desde: '2026-03-02', hasta: '2026-09-28' }, destino: { date: '2026-10-17' }, hoy: '2026-09-24' };

  it('llevan el destino con dos semanas detrás, en lunes', () => {
    const l = limitesDe({ plan });
    expect(aDia(l.inicio)).toBe('2026-02-23');
    expect(aDia(l.fin) >= '2026-10-31').toBe(true);
    expect(new Date(l.fin).getUTCDay()).toBe(1);
  });

  it('empiezan en la primera fase de la temporada, con una semana de aire', () => {
    const conTemporada = { ...plan, temporada: { desde: '2026-04-13' } };
    expect(aDia(limitesDe({ plan: conTemporada }).inicio)).toBe('2026-04-06');
  });

  it('llegan al punto de decisión si cae después del destino', () => {
    const conCruce = { ...plan, cruce: { decide: '2026-12-27', caminos: [{ fin: '2027-06-13' }] } };
    const fin = aDia(limitesDe({ plan: conCruce }).fin);
    expect(fin >= '2027-01-10').toBe(true);
    /* Los caminos no la estiran: medio año de opciones no es plan. */
    expect(fin < '2027-02-01').toBe(true);
  });

  it('una fase después del destino sin decisión no la estira', () => {
    const fases = [{ startsOn: '2026-10-18', endsOn: '2026-11-29' }];
    expect(aDia(limitesDe({ plan, fases }).fin) < '2026-11-16').toBe(true);
  });

  it('hoy siempre queda dentro', () => {
    const tarde = { ...plan, hoy: '2027-01-20' };
    expect(aDia(limitesDe({ plan: tarde }).fin) > '2027-01-20').toBe(true);
  });
});

describe('la escala', () => {
  it('pone el primer día en 0 y el final de la vista en el ancho', () => {
    const e = crearEscala(vistaDeSemana('2026-06-01'), 700);
    expect(e.x('2026-06-01')).toBe(0);
    expect(e.x('2026-06-08')).toBe(700);
    expect(e.pxPorDia).toBe(100);
    expect(e.ultimoDia).toBe('2026-06-07');
    expect(aDia(e.tDe(350))).toBe('2026-06-04');
  });
});

describe('los rótulos', () => {
  it('eligen el más largo que cabe, y ninguno si no cabe ni el corto', () => {
    const opciones = ['Definición · −0,6 %/sem', 'Definición', 'D'];
    expect(rotuloQueCabe(opciones, 400)).toBe(opciones[0]);
    expect(rotuloQueCabe(opciones, 90)).toBe('Definición');
    expect(rotuloQueCabe(opciones, 5)).toBeNull();
  });

  it('las marcas del eje nunca se pisan, en ningún zoom', () => {
    for (const [inicio, fin, ancho] of [
      ['2026-03-02', '2026-11-30', 320],
      ['2026-03-02', '2026-11-30', 1200],
      ['2026-06-01', '2026-08-03', 600],
      ['2026-06-01', '2026-06-08', 360],
    ]) {
      for (const nivel of ['semanas', 'numeros', 'meses']) {
        const marcas = marcasDelEje(crearEscala({ inicio: aMs(inicio), fin: aMs(fin) }, ancho), nivel);
        if (nivel !== 'meses') expect(marcas.length).toBeGreaterThan(0);
        for (let i = 1; i < marcas.length; i += 1) {
          expect(marcas[i].x).toBeGreaterThanOrEqual(marcas[i - 1].x + anchoDelEje(marcas[i - 1].texto));
        }
      }
    }
  });

  it('los lunes con el mes cuando cambia; si no caben, solo los meses', () => {
    const cerca = marcasDelEje(crearEscala({ inicio: aMs('2026-06-22'), fin: aMs('2026-07-20') }, 700));
    expect(cerca.map((m) => m.texto)).toEqual(['22 jun', '29', '6 jul', '13']);
    expect(cerca[2]).toMatchObject({ numero: '6', mes: 'jul', fuerte: true });
    const temporada = marcasDelEje(crearEscala(limites, 900), 'numeros');
    expect(temporada.map((m) => m.texto)).toContain('jun');
  });

  it('el eje elige su detalle por el ancho de una semana', () => {
    expect(nivelDelEje(60)).toBe('semanas');
    expect(nivelDelEje(30)).toBe('numeros');
    expect(nivelDelEje(18)).toBe('numeros');
    expect(nivelDelEje(17.9)).toBe('meses');
  });

  it('en el nivel de meses, debajo solo va el año donde cambia', () => {
    const escala = crearEscala({ inicio: aMs('2026-08-03'), fin: aMs('2027-03-01') }, 300);
    expect(marcasDelEje(escala, 'meses').map((m) => m.texto)).toEqual(['2027']);
    const meses = mesesDeLaVista(escala);
    expect(meses.map((m) => m.nombre)).toEqual(['ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb']);
    expect(meses.find((m) => m.nombre === 'ene').cambiaAnio).toBe(true);
    /* Cada mes, del ancho de sus días: septiembre (30) más estrecho que octubre (31). */
    expect(meses[1].w).toBeLessThan(meses[2].w);
  });
});

describe('lo que se ve es el rango', () => {
  it('una franja larga se ajusta a semanas enteras', () => {
    const v = vistaDeFranja(aMs('2026-06-10') + 5e6, aMs('2026-07-02'));
    expect(aDia(v.inicio)).toBe('2026-06-08');
    expect(aDia(v.fin)).toBe('2026-07-06');
  });

  it('una franja corta se ajusta a días, y nunca a menos de una semana', () => {
    const v = vistaDeFranja(aMs('2026-06-18'), aMs('2026-06-10') + 3e6);
    expect([aDia(v.inicio), aDia(v.fin)]).toEqual(['2026-06-10', '2026-06-19']);
    const corta = vistaDeFranja(aMs('2026-06-10'), aMs('2026-06-11'));
    expect(corta.fin - corta.inicio).toBe(SEMANA_MS);
  });

  it('los atajos se centran en hoy y se reconocen por su ancho', () => {
    const tres = vistaDelAtajo('3m', '2026-07-01', limites);
    expect(aDia(tres.inicio)).toBe('2026-05-18');
    expect((tres.fin - tres.inicio) / SEMANA_MS).toBe(13);
    expect(atajoDe(tres, limites)).toBe('3m');
    const cuatro = vistaDelAtajo('4s', '2026-07-01', limites);
    expect(aDia(cuatro.inicio)).toBe('2026-06-15');
    expect(atajoDe(cuatro, limites)).toBe('4s');
    expect(atajoDe(limites, limites)).toBe('temporada');
    expect(atajoDe(vistaDeSemana('2026-07-06'), limites)).toBeNull();
  });

  it('la vista va y vuelve de la dirección', () => {
    const v = vistaDeFranja(aMs('2026-06-10'), aMs('2026-07-02'));
    const p = vistaAParams(v);
    expect(p).toEqual({ desde: '2026-06-08', hasta: '2026-07-05' });
    expect(vistaDeParams(p.desde, p.hasta)).toEqual(v);
    expect(vistaDeParams('2026-07-05', '2026-06-08')).toBeNull();
    expect(vistaDeParams('ayer', null)).toBeNull();
  });
});
