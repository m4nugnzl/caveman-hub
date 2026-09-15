import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { RepartoComparado, comidaIgual, diferencia } from './RepartoComparado';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * La mesa comparada existe para que comparar sea mirar y no leer cifras. Lo que
 * se fija aquí son las reglas que quitan tinta, que es lo que se rompería sin
 * que ningún número saliera mal:
 *
 *   1. **Una comida igual en todos los días es UN renglón («Todos»)**, y una
 *      que cambia, uno por día.
 *   2. **Lo igual al primer día va marcado como igual** (sin caja, en gris).
 *   3. **La diferencia corta habla de kcal**; si las kcal no cambian pero un
 *      macro sí, lo dice («mismas kcal») en vez de decir «igual».
 *   4. **Un día sin esa comida lo dice**, y no se inventa cifras.
 *
 * Corre en Node y sin jsdom, como el resto de las pruebas de componente.
 */

const comida = (id, name, kcals, protein, carbs, fats, extra = {}) => ({
  id,
  name,
  target: { kcals, protein, carbs, fats },
  options: [],
  ...extra,
});

const dias = () => [
  {
    id: 'e',
    name: 'Entreno',
    targets: { targetKcals: 2600, proteinGrams: 160, carbsGrams: 320, fatsGrams: 75 },
    meals: [comida('e1', 'Desayuno', 550, 35, 70, 15), comida('e2', 'Comida', 800, 45, 100, 24)],
  },
  {
    id: 'd',
    name: 'Descanso',
    targets: { targetKcals: 2200, proteinGrams: 160, carbsGrams: 220, fatsGrams: 75 },
    meals: [comida('d1', 'Desayuno', '550', '35', '70', '15'), comida('d2', 'Merienda', 700, 45, 75, 24)],
  },
];

const pinta = (d = dias()) => renderToStaticMarkup(<RepartoComparado dias={d} onTarget={() => {}} onFijar={() => {}} />);

describe('RepartoComparado', () => {
  it('compara las cifras como números: «550» escrito y 550 son la misma comida', () => {
    expect(comidaIgual(dias(), 0)).toBe(true);
    expect(comidaIgual(dias(), 1)).toBe(false);
  });

  it('una comida igual es un renglón «Todos»; una distinta, uno por día', () => {
    const html = pinta();
    expect(html.match(/>Todos</g)).toHaveLength(1);
    expect(html).toContain('igual en los dos días');
    expect(html).toContain('Separar');
  });

  it('marca como igual la cifra que no cambia respecto al primer día', () => {
    const html = pinta();
    /* Comida de descanso: 45 P y 24 G son las de entreno; 700 y 75, no. */
    expect(html.match(/hoja-celda is-igual/g)).toHaveLength(2);
  });

  it('dice los dos nombres cuando no coinciden', () => {
    expect(pinta()).toContain('en descanso: Merienda');
  });

  it('la diferencia corta habla de kcal, y la entera de todo lo que cambia', () => {
    const [e, d] = dias();
    expect(diferencia(e.meals[1], d.meals[1])).toMatchObject({ corta: '−100 kcal', entera: '−100 kcal · −25 C' });
    const soloMacros = comida('x', 'Comida', 800, 50, 100, 24);
    expect(diferencia(e.meals[1], soloMacros).corta).toBe('mismas kcal');
    expect(diferencia(e.meals[0], d.meals[0])).toMatchObject({ corta: 'igual', igual: true });
  });

  it('un día sin esa comida lo dice y no pinta casillas', () => {
    const d = dias();
    d[1].meals = d[1].meals.slice(0, 1);
    const html = pinta(d);
    expect(html).toContain('Sin esta comida');
  });

  it('los hidratos en blanco son el resto: se comparan resueltos y se ofrecen en la casilla', () => {
    /* 900 kcal, 40 P, 20 G → (900 − 160 − 180) / 4 = 140 C. */
    const d = dias();
    d[0].meals[0] = comida('e1', 'Desayuno', 900, 40, '', 20);
    d[1].meals[0] = comida('d1', 'Desayuno', 900, 40, 140, 20);
    expect(comidaIgual(d, 0)).toBe(true);
    d[1].meals[0] = comida('d1', 'Desayuno', 900, 40, 120, 20);
    expect(diferencia(d[0].meals[0], d[1].meals[0]).entera).toBe('−20 C');
    const html = pinta(d);
    expect(html).toContain('placeholder="140"');
  });

  it('una comida sin reparto no es una comida a cero: no resta y enseña su menú', () => {
    const d = dias();
    /* 100 g de 10 P / 50 C / 10 G → 330 kcal. */
    const menu = { id: 'o', foods: [{ id: 'f', name: 'Arroz', grams: 100, proteinPer100: 10, carbsPer100: 50, fatsPer100: 10 }] };
    d[1].meals = d[1].meals.map((m) => ({ ...m, target: null, options: [menu] }));
    expect(diferencia(d[0].meals[1], d[1].meals[1]).corta).toBe('sin repartir');
    const html = pinta(d);
    expect(html).not.toContain('−800 kcal');
    expect(html).toContain('sin repartir');
    expect(html).toContain('hoja-celda is-menu');
    expect(html).toContain('placeholder="330"');
    /* Y «El día» no se juzga: gris, sin semáforo. */
    expect(html).toContain('reparto-cmp-suma is-menu');
  });

  it('«El día» juzga lo repartido contra el objetivo de cada día', () => {
    const html = pinta();
    expect(html).toContain('de 2600 kcal');
    expect(html).toContain('de 2200 kcal');
    expect(html).toMatch(/reparto-cmp-suma is-(ok|over|under)/);
  });
});
