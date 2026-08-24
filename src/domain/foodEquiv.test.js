import { describe, expect, it } from 'vitest';

import { norm } from '@/lib/texto';
import { equivalencesFor, foodCategory, SWAP_MACRO } from './foodEquiv';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que una equivalencia sea la de consulta: mismo grupo, mismos gramos del macro
 * que define al grupo, y sin sorpresas calóricas. Los tres fallos que caza:
 *
 *   1. Proponer aguacate por plátano: comparten grupo e hidratos, pero igualar
 *      los hidratos cuadruplica las kcal. El filtro de cordura existe para esto.
 *   2. Calcular con los números del catálogo cuando el entrenador tiene los
 *      suyos: su biblioteca manda, como en todos los buscadores.
 *   3. Adivinar el grupo: un nombre que no cae en el catálogo no tiene
 *      equivalencias, no unas inventadas.
 */

const catalogo = [
  { id: 'c1', name: 'Plátano', category: 'Fruta', proteinPer100: 1.1, carbsPer100: 20, fatsPer100: 0.3 },
  { id: 'c2', name: 'Manzana', category: 'Fruta', proteinPer100: 0.3, carbsPer100: 12, fatsPer100: 0.2, unitLabel: 'manzana', unitGrams: 150 },
  { id: 'c3', name: 'Fresas', category: 'Fruta', proteinPer100: 0.7, carbsPer100: 7, fatsPer100: 0.3 },
  { id: 'c4', name: 'Aguacate', category: 'Fruta', proteinPer100: 2, carbsPer100: 8.5, fatsPer100: 15 },
  { id: 'c5', name: 'Pechuga de pollo', category: 'Carne', proteinPer100: 23, carbsPer100: 0, fatsPer100: 2.6 },
  { id: 'c6', name: 'Ternera magra', category: 'Carne', proteinPer100: 21, carbsPer100: 0, fatsPer100: 5 },
  { id: 'c7', name: 'Tomate', category: 'Verdura', proteinPer100: 0.9, carbsPer100: 3.5, fatsPer100: 0.2 },
  { id: 'c8', name: 'Calabacín', category: 'Verdura', proteinPer100: 1.3, carbsPer100: 2.2, fatsPer100: 0.2 },
  { id: 'c9', name: 'Lechuga', category: 'Verdura', proteinPer100: 1.4, carbsPer100: 1.5, fatsPer100: 0.2 },
  { id: 'c10', name: 'Proteína de suero', category: 'Otros', proteinPer100: 80, carbsPer100: 8, fatsPer100: 7 },
  // Dulces: el grupo más heterogéneo del catálogo, donde el filtro se la juega.
  { id: 'c11', name: 'Cacao puro en polvo', category: 'Dulces', proteinPer100: 20, carbsPer100: 12, fatsPer100: 11 },
  { id: 'c12', name: 'Azúcar', category: 'Dulces', proteinPer100: 0, carbsPer100: 100, fatsPer100: 0 },
  { id: 'c13', name: 'Miel', category: 'Dulces', proteinPer100: 0.4, carbsPer100: 80, fatsPer100: 0 },
  { id: 'c14', name: 'Pizza margarita', category: 'Dulces', proteinPer100: 11, carbsPer100: 25, fatsPer100: 9 },
];

const platano = { name: 'Plátano', grams: 150, proteinPer100: 1.1, carbsPer100: 20, fatsPer100: 0.3 };

describe('foodCategory', () => {
  it('resuelve el grupo por nombre, también con palabras de más', () => {
    expect(foodCategory('Plátano', catalogo)).toBe('Fruta');
    expect(foodCategory('Plátano mediano', catalogo)).toBe('Fruta');
  });

  it('lo que no cae en el catálogo no tiene grupo', () => {
    expect(foodCategory('Sopa de piedras', catalogo)).toBeNull();
  });
});

describe('equivalencesFor', () => {
  it('la fruta se iguala por hidratos: 150 g de plátano son 250 g de manzana', () => {
    const eq = equivalencesFor(platano, catalogo);

    expect(eq.macro).toBe('carbs');
    expect(eq.category).toBe('Fruta');
    expect(eq.macroGrams).toBe(30);

    const manzana = eq.items.find((i) => i.food.name === 'Manzana');
    // 30 g de hidratos / 12 por 100 g = 250 g clavados.
    expect(manzana.grams).toBe(250);
  });

  it('el propio alimento no sale en su lista', () => {
    const eq = equivalencesFor(platano, catalogo);
    expect(eq.items.some((i) => i.food.name === 'Plátano')).toBe(false);
  });

  it('el aguacate no es equivalente del plátano: mismos hidratos, cuatro veces más kcal', () => {
    const eq = equivalencesFor(platano, catalogo);
    expect(eq.items.some((i) => i.food.name === 'Aguacate')).toBe(false);
  });

  it('ordena por parecido calórico: la manzana antes que las fresas', () => {
    const nombres = equivalencesFor(platano, catalogo).items.map((i) => i.food.name);
    expect(nombres).toEqual(['Manzana', 'Fresas']);
  });

  it('los gramos salen en múltiplos de 5, que es lo que una báscula distingue', () => {
    const fresas = equivalencesFor(platano, catalogo).items.find((i) => i.food.name === 'Fresas');
    // 30 / 7 × 100 = 428,6 → 430.
    expect(fresas.grams).toBe(430);
  });

  it('la carne se iguala por proteína, porque lo dice el grupo', () => {
    const pechuga = { name: 'Pechuga de pollo', grams: 150, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2.6 };
    const eq = equivalencesFor(pechuga, catalogo);

    expect(eq.macro).toBe('protein');
    const ternera = eq.items.find((i) => i.food.name === 'Ternera magra');
    // 34,5 g de proteína / 21 por 100 g = 164,3 → 165.
    expect(ternera.grams).toBe(165);
  });

  it('tu biblioteca manda sobre el catálogo al calcular', () => {
    // El entrenador ajustó SU manzana a 10 g de hidratos por 100.
    const biblioteca = [{ id: 'm1', name: 'manzana', proteinPer100: 0.3, carbsPer100: 10, fatsPer100: 0.2 }];
    const manzana = equivalencesFor(platano, catalogo, biblioteca).items.find(
      (i) => norm(i.food.name) === 'manzana'
    );

    expect(manzana.food.id).toBe('m1');
    expect(manzana.grams).toBe(300); // 30 / 10 × 100, con sus números.
  });

  it('un alimento sin apenas macro del grupo no entra: nadie cambia tomate por medio kilo de lechuga', () => {
    const tomate = { name: 'Tomate', grams: 200, proteinPer100: 0.9, carbsPer100: 3.5, fatsPer100: 0.2 };
    const eq = equivalencesFor(tomate, catalogo);

    expect(eq.items.some((i) => i.food.name === 'Lechuga')).toBe(false);
    expect(eq.items.some((i) => i.food.name === 'Calabacín')).toBe(true);
  });

  /*
    El caso que destapó el filtro: 10 g de cacao llevan ~1 g de hidratos, y «lo
    que iguala 1 g de hidratos» es una miga de cualquier cosa — 0,7 galletas,
    5 g de pizza, 0,1 tercios de cerveza. Una ración de condimento no tiene
    intercambio, y la respuesta honesta es no ofrecer lista.
  */
  it('una ración de condimento no tiene equivalencias', () => {
    const cacao = { name: 'Cacao puro en polvo', grams: 10, proteinPer100: 20, carbsPer100: 12, fatsPer100: 11 };
    expect(equivalencesFor(cacao, catalogo)).toBeNull();
  });

  it('dentro de los dulces, el azúcar se cambia por miel pero no por pizza', () => {
    // 20 g de azúcar son 20 g de hidratos y 80 kcal. La miel iguala esos
    // hidratos en 82 kcal; la pizza los iguala en 80 g de pizza y 180 kcal, que
    // no es un intercambio: es otra comida.
    const azucar = { name: 'Azúcar', grams: 20, proteinPer100: 0, carbsPer100: 100, fatsPer100: 0 };
    const nombres = equivalencesFor(azucar, catalogo).items.map((i) => i.food.name);

    expect(nombres).toContain('Miel');
    expect(nombres).not.toContain('Pizza margarita');
  });

  it('sin grupo, sin gramos o en «Otros» no hay equivalencias', () => {
    expect(equivalencesFor({ name: 'Sopa de piedras', grams: 100, carbsPer100: 10 }, catalogo)).toBeNull();
    expect(equivalencesFor({ ...platano, grams: 0 }, catalogo)).toBeNull();
    expect(
      equivalencesFor({ name: 'Proteína de suero', grams: 30, proteinPer100: 80, carbsPer100: 8, fatsPer100: 7 }, catalogo)
    ).toBeNull();
  });

  it('cada grupo del catálogo tiene su macro definido, salvo «Otros»', () => {
    expect(SWAP_MACRO.Fruta).toBe('carbs');
    expect(SWAP_MACRO.Grasas).toBe('fats');
    expect(SWAP_MACRO.Otros).toBeUndefined();
  });
});
