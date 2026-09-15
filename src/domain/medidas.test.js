import { describe, expect, it } from 'vitest';

import {
  MAX_MEDIDAS,
  MEDIDAS_DE_FABRICA,
  MEDIDAS_FIJAS,
  buildMedida,
  coachMedidas,
  compactMedidas,
  deltaDe,
  esFija,
  medidasToPreferences,
  problemaDeMedida,
  sanitizeMedida,
  serieDe,
  ultimaDe,
  valorDeMedida,
} from './medidas';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * La distinción entera: **una pregunta es una opinión con forma de número; una
 * medida es un número con unidad que alguien ha tomado con un aparato**. El
 * saneado del cuestionario capa a enteros de 0 a 10 sin unidad, y ahí no cabe ni
 * una temperatura basal ni una glucosa. Lo que se fija aquí es que una medida
 * conserve su unidad, sus decimales y su rango, y que **el rango no interprete
 * nada**: es un filtro de dedazos, no un diagnóstico.
 */

describe('el catálogo', () => {
  it('las de fábrica están siempre, aunque la columna esté vacía', () => {
    const lista = coachMedidas({});
    for (const fija of MEDIDAS_FIJAS) {
      expect(lista.some((m) => m.id === fija.id)).toBe(true);
    }
  });

  /* El encargo del dueño: temperatura y glucosa vienen DISEÑADAS DE BASE, como
     los perímetros y los pliegues. Si cada entrenador las define, cada uno las
     define distinto y dos clientes acaban con «Glucosa» y «glucemia» en dos
     series que no se pueden comparar. */
  it('glucosa y temperatura vienen de fábrica, con su unidad y sus decimales', () => {
    const glucosa = MEDIDAS_DE_FABRICA.find((m) => m.id === 'glucose');
    expect(glucosa.unit).toBe('mg/dL');
    expect(glucosa.decimals).toBe(0);

    const temperatura = MEDIDAS_DE_FABRICA.find((m) => m.id === 'temperature');
    expect(temperatura.unit).toBe('°C');
    /* Un decimal: 36,4 °C. Con cero, la medida entera no significaría nada. */
    expect(temperatura.decimals).toBe(1);
  });

  it('pliegues y perímetros son medidas de GRUPO, con sus casillas', () => {
    const folds = MEDIDAS_FIJAS.find((m) => m.id === 'folds');
    expect(Object.keys(folds.campos).length).toBe(6);
    const perimeters = MEDIDAS_FIJAS.find((m) => m.id === 'perimeters');
    expect(Object.keys(perimeters.campos).length).toBe(9);
  });

  it('las propias se acotan al tope y las rotas se caen', () => {
    const items = [
      ...Array.from({ length: MAX_MEDIDAS + 4 }, (_, i) =>
        buildMedida({ label: `Medida ${i}`, unit: 'x' })
      ),
      { id: 'sin-nombre' },
      { label: 'sin id' },
    ];
    const lista = coachMedidas({ medidas: { items } });
    expect(lista).toHaveLength(MEDIDAS_FIJAS.length + MAX_MEDIDAS);
  });

  /* Una definición escrita a mano en la columna no puede convertir los pliegues
     en otra cosa: el formulario del check-in está escrito contra sus seis
     casillas concretas. */
  it('una fija no se puede redefinir desde la columna', () => {
    const lista = coachMedidas({
      medidas: { items: [{ id: 'folds', label: 'Pliegues míos', unit: 'km', decimals: 2 }] },
    });
    const folds = lista.find((m) => m.id === 'folds');
    expect(folds.unit).toBe('mm');
    expect(folds.campos).toBeDefined();
    expect(esFija('folds')).toBe(true);
  });

  it('guardar y volver a leer no pierde ni duplica', () => {
    const mia = buildMedida({ label: 'Glucosa postprandial', unit: 'mg/dL', max: 600 });
    const lista = coachMedidas({ medidas: { items: [mia] } });
    const vuelta = coachMedidas({ medidas: medidasToPreferences(lista) });
    expect(vuelta).toHaveLength(MEDIDAS_FIJAS.length + 1);
    expect(vuelta.find((m) => m.id === mia.id).label).toBe('Glucosa postprandial');
  });

  it('el id sale del nombre: la misma medida escrita dos veces es una', () => {
    expect(buildMedida({ label: 'Glucosa en ayunas' }).id).toBe(
      buildMedida({ label: 'Glucosa  EN  Ayunas' }).id
    );
  });

  it('los decimales se acotan a dos: por debajo no distingue ningún aparato', () => {
    expect(sanitizeMedida({ id: 'x', label: 'X', decimals: 9 }).decimals).toBe(2);
    expect(sanitizeMedida({ id: 'x', label: 'X', decimals: -1 }).decimals).toBe(0);
  });
});

describe('lo medido', () => {
  const glucosa = MEDIDAS_DE_FABRICA.find((m) => m.id === 'glucose');
  const temperatura = MEDIDAS_DE_FABRICA.find((m) => m.id === 'temperature');

  /* ══ LA LEY DE LA CASA ══════════════════════════════════════════════════
     El rango es un filtro de DEDAZOS, no un diagnóstico: rechaza un 950 de
     glucosa escrito con un dedo de más, y no dice nada de una glucosa alta. */
  it('el rango filtra dedazos y no juzga el valor', () => {
    expect(problemaDeMedida(glucosa, 180)).toBeNull();
    expect(problemaDeMedida(glucosa, 45)).toBeNull();
    expect(problemaDeMedida(glucosa, 950)).toMatch(/entre 20 y 600/);
  });

  it('vacío es «no medido», y eso es legítimo', () => {
    expect(problemaDeMedida(glucosa, '')).toBeNull();
    expect(problemaDeMedida(glucosa, null)).toBeNull();
  });

  it('el valor se redondea a los decimales de SU medida', () => {
    expect(valorDeMedida(glucosa, '95,4')).toBe(95);
    expect(valorDeMedida(temperatura, '36,47')).toBe(36.5);
  });

  /* Un cero no es «no medido», y en una glucosa esa diferencia no es un matiz:
     es la diferencia entre un hueco y una hipoglucemia. */
  it('lo que no se rellenó no entra, y un cero SÍ entra', () => {
    expect(compactMedidas([glucosa, temperatura], {})).toBeUndefined();
    expect(compactMedidas([glucosa, temperatura], { glucose: '', temperature: '36,5' })).toEqual({
      temperature: 36.5,
    });
    expect(compactMedidas([glucosa], { glucose: '0' })).toEqual({ glucose: 0 });
  });
});

describe('las series', () => {
  const history = [
    { date: '2026-09-01', weight: 80, medidas: { glucose: 92 } },
    { date: '2026-09-08', weight: 79.5 },
    { date: '2026-09-15', weight: 79, medidas: { glucose: 88 } },
  ];

  it('una serie son sus puntos, en orden y sin huecos', () => {
    expect(serieDe(history, 'glucose')).toEqual([
      { date: '2026-09-01', value: 92 },
      { date: '2026-09-15', value: 88 },
    ]);
  });

  it('la última es la última, y con una sola no hay variación que contar', () => {
    expect(ultimaDe(history, 'glucose')).toEqual({ date: '2026-09-15', value: 88 });
    expect(deltaDe(history, 'glucose')).toEqual({ from: 92, to: 88, delta: -4 });
    expect(deltaDe([history[0]], 'glucose')).toBeNull();
    expect(deltaDe(history, 'temperature')).toBeNull();
  });
});
