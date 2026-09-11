import { describe, expect, it } from 'vitest';

import { norm } from '@/lib/texto';
import { candidatosDeGrupo, equivalencesFor, foodCategory, SWAP_MACRO } from './foodEquiv';

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
    // Clavar los 30 g de hidratos son 428,6 g de fresas y 144 kcal contra las
    // 131 del plátano. Gastando parte del margen del macro se queda en 410 g:
    // 29 g de hidratos y 137 kcal, más cerca de las dos cosas a la vez.
    expect(fresas.grams).toBe(410);
  });

  /*
    ── La holgura del macro se gasta en cuadrar las kcal ────────────────────
    El caso que lo motivó: la ternera clavaba la proteína de la pechuga en 165 g
    y se iba a +40 kcal (+23 %). Dos cambios así seguidos mueven el día. La
    ración baja a 150 g —proteína dentro de su margen del 10 %— y las kcal se
    quedan en +12 %.
  */
  it('la carne se iguala por proteína, cediendo lo justo para no descuadrar las kcal', () => {
    const pechuga = { name: 'Pechuga de pollo', grams: 150, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2.6 };
    const eq = equivalencesFor(pechuga, catalogo);

    expect(eq.macro).toBe('protein');
    expect(eq.macroGrams).toBe(35); // 34,5 g de proteína en la pechuga.

    const ternera = eq.items.find((i) => i.food.name === 'Ternera magra');
    expect(ternera.grams).toBe(150);

    // El macro se mueve, pero nunca más del 10 % de lo pautado…
    expect(Math.abs(ternera.macroGrams - 34.5)).toBeLessThanOrEqual(3.45);
    // …y las kcal quedan mejor que clavando la proteína (que daba +40).
    expect(Math.abs(ternera.kcalDiff)).toBeLessThan(30);
  });

  it('cuando el macro y las kcal ya cuadran juntos, la ración no se toca', () => {
    // 20 g de azúcar son 20 g de hidratos y 80 kcal; 25 g de miel son ambas
    // cosas a la vez, así que no hay holgura que gastar.
    const azucar = { name: 'Azúcar', grams: 20, proteinPer100: 0, carbsPer100: 100, fatsPer100: 0 };
    const miel = equivalencesFor(azucar, catalogo).items.find((i) => i.food.name === 'Miel');

    expect(miel.grams).toBe(25);
    expect(miel.macroDiff).toBe(0);
    expect(Math.abs(miel.kcalDiff)).toBeLessThanOrEqual(3);
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

/**
 * ══ Y con un grupo TUYO puesto ═════════════════════════════════════════════
 *
 * «El grupo manda y el cálculo sigue siendo el suelo»: lo que cambia es QUIÉN
 * sale en la lista, nunca cómo se calcula la ración. Lo que estas pruebas
 * fijan es dónde para cada cosa:
 *
 *   · el filtro de cordura por kcal se apaga —lo pusiste tú—;
 *   · la familia del catálogo deja de filtrar, así que un grupo puede cruzar
 *     familias y rescatar lo que vive en «Otros»;
 *   · los dos suelos de aritmética siguen en pie, porque no son criterio.
 */
describe('equivalencesFor con un grupo tuyo', () => {
  const misFrutas = { id: 'g1', name: 'Mis frutas', macro: 'carbs', foods: ['Plátano', 'Manzana'] };

  it('la lista son los que marcaste y ninguno más', () => {
    const eq = equivalencesFor(platano, catalogo, [], { grupo: misFrutas });

    expect(eq.items.map((i) => i.food.name)).toEqual(['Manzana']);
    expect(eq.grupo).toEqual({ id: 'g1', name: 'Mis frutas' });
    /* La familia se queda fuera del resultado: con grupo no ha pintado nada. */
    expect(eq.category).toBeNull();
    // Y la ración es la misma de siempre: 30 g de hidratos / 12 por 100 = 250 g.
    expect(eq.items[0].grams).toBe(250);
  });

  it('si tú dices que el aguacate vale por el plátano, sale — con su diferencia', () => {
    /* Sin grupo lo tapa el filtro de cordura: mismos hidratos, cuatro veces las
       kcal. Con grupo sale, y lo que se paga va escrito al lado. */
    const conAguacate = { ...misFrutas, foods: ['Plátano', 'Aguacate'] };
    const eq = equivalencesFor(platano, catalogo, [], { grupo: conAguacate });

    const aguacate = eq.items.find((i) => i.food.name === 'Aguacate');
    expect(aguacate).toBeTruthy();
    expect(aguacate.kcalDiff).toBeGreaterThan(300);
    expect(equivalencesFor(platano, catalogo).items.find((i) => i.food.name === 'Aguacate')).toBeUndefined();
  });

  it('cruza familias, y rescata lo que vive en «Otros»', () => {
    const pechuga = { name: 'Pechuga de pollo', grams: 150, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2.6 };
    const magra = { id: 'g2', name: 'Mi proteína magra', macro: 'protein', foods: ['Pechuga de pollo', 'Proteína de suero'] };

    // Sin grupo, el suero está en «Otros» y no participa de nada.
    expect(equivalencesFor(pechuga, catalogo).items.map((i) => i.food.name)).toEqual(['Ternera magra']);

    const eq = equivalencesFor(pechuga, catalogo, [], { grupo: magra });
    expect(eq.macro).toBe('protein');
    expect(eq.items.map((i) => i.food.name)).toEqual(['Proteína de suero']);
  });

  it('un miembro que ya no está en ningún sitio se cae, no se inventa', () => {
    const conFantasma = { ...misFrutas, foods: ['Plátano', 'Manzana', 'Papaya deshidratada'] };
    const eq = equivalencesFor(platano, catalogo, [], { grupo: conFantasma });
    expect(eq.items.map((i) => i.food.name)).toEqual(['Manzana']);
  });

  it('tu biblioteca sigue mandando sobre los números del catálogo', () => {
    const biblioteca = [{ name: 'Manzana', carbsPer100: 15, proteinPer100: 0.3, fatsPer100: 0.2 }];
    const eq = equivalencesFor(platano, catalogo, biblioteca, { grupo: misFrutas });
    /* 30 g de hidratos / 15 por 100 son 200 g clavados, y no los 250 del
       catálogo. Salen 205 porque la ración también cuadra las kcal: 200 g se
       quedan a −5 kcal del plátano y 205 g, a −1,5 con 0,75 g de hidratos de
       más. Es la misma holgura del 10 % que se gasta sin grupo. */
    expect(eq.items[0].grams).toBe(205);
  });

  it('no levanta los suelos de aritmética: una ración de condimento sigue sin lista', () => {
    const cacao = { name: 'Cacao puro en polvo', grams: 10, proteinPer100: 20, carbsPer100: 12, fatsPer100: 11 };
    const dulces = { id: 'g3', name: 'Mis dulces', macro: 'carbs', foods: ['Cacao puro en polvo', 'Miel'] };
    // 1,2 g de hidratos: lo que iguale eso es una miga de cualquier cosa.
    expect(equivalencesFor(cacao, catalogo, [], { grupo: dulces })).toBeNull();
  });
});

describe('candidatosDeGrupo', () => {
  it('la lista de marcar es más ancha: la familia entera y sin filtro de cordura', () => {
    const todos = candidatosDeGrupo(platano, catalogo).items.map((i) => i.food.name);
    expect(todos).toContain('Aguacate');
    expect(todos).toContain('Manzana');
    expect(todos).toContain('Fresas');
  });

  it('lo que ya está en el grupo sale aunque viva en otra familia, y sin repetirse', () => {
    const pechuga = { name: 'Pechuga de pollo', grams: 150, proteinPer100: 23, carbsPer100: 0, fatsPer100: 2.6 };
    const nombres = candidatosDeGrupo(pechuga, catalogo, [], {
      incluir: ['Proteína de suero', 'Ternera magra'],
      macro: 'protein',
    }).items.map((i) => i.food.name);

    expect(nombres).toContain('Proteína de suero');
    expect(nombres.filter((n) => n === 'Ternera magra')).toHaveLength(1);
  });
});

/**
 * ══ Ni el mismo alimento ni la misma fila dos veces ════════════════════════
 *
 * Los dos despropósitos que se veían en pantalla, con los nombres del catálogo
 * real: «Arroz blanco» ofrecía «Arroz blanco (crudo)» y «Arroz blanco
 * (cocido)» —la conversión de peso al cocerlo, disfrazada de equivalencia— y
 * «Huevo entero fresco» ofrecía otros cuatro huevos indistinguibles.
 */
describe('equivalencesFor: el mismo alimento no es una equivalencia', () => {
  const despensa = [
    { id: 'a1', name: 'Arroz blanco (crudo)', category: 'Cereales', proteinPer100: 7, carbsPer100: 78, fatsPer100: 0.6 },
    { id: 'a2', name: 'Arroz blanco (cocido)', category: 'Cereales', proteinPer100: 2.4, carbsPer100: 28, fatsPer100: 0.2 },
    { id: 'a3', name: 'Arroz integral (crudo)', category: 'Cereales', proteinPer100: 7.5, carbsPer100: 76, fatsPer100: 2.7 },
    { id: 'a4', name: 'Tortita de arroz', category: 'Cereales', proteinPer100: 8, carbsPer100: 81, fatsPer100: 3 },
    { id: 'a5', name: 'Tortitas de arroz', category: 'Cereales', proteinPer100: 8, carbsPer100: 80, fatsPer100: 3 },
    { id: 'h1', name: 'Huevo entero', category: 'Huevos', proteinPer100: 13, carbsPer100: 1, fatsPer100: 11, unitLabel: 'huevo', unitGrams: 55 },
    { id: 'h2', name: 'Huevo entero L', category: 'Huevos', proteinPer100: 13, carbsPer100: 1, fatsPer100: 11, unitLabel: 'huevo', unitGrams: 63 },
    { id: 'h3', name: 'Huevos enteros frescos', category: 'Huevos', proteinPer100: 13, carbsPer100: 1, fatsPer100: 11, unitLabel: 'huevo', unitGrams: 55 },
    { id: 'h4', name: 'Huevo L', category: 'Huevos', proteinPer100: 12.5, carbsPer100: 0.7, fatsPer100: 10, unitLabel: 'unidad', unitGrams: 60 },
    { id: 'h5', name: 'Huevina (huevo líquido)', category: 'Huevos', proteinPer100: 12, carbsPer100: 0.8, fatsPer100: 9.5 },
    { id: 'l1', name: 'Lentejas (cocidas)', category: 'Legumbres', proteinPer100: 9, carbsPer100: 16, fatsPer100: 0.5 },
    { id: 'l2', name: 'Garbanzos (cocidos)', category: 'Legumbres', proteinPer100: 8, carbsPer100: 27, fatsPer100: 2.6 },
    { id: 'l3', name: 'Garbanzos (crudos)', category: 'Legumbres', proteinPer100: 19, carbsPer100: 55, fatsPer100: 6 },
  ];

  const arroz = { name: 'Arroz blanco', grams: 200, proteinPer100: 7, carbsPer100: 78, fatsPer100: 0.6 };
  const huevo = { name: 'Huevo entero fresco', grams: 165, proteinPer100: 12.6, carbsPer100: 0.7, fatsPer100: 9.5, unitLabel: 'huevo', unitGrams: 55 };

  it('el arroz no se ofrece a sí mismo, ni crudo ni cocido', () => {
    const nombres = equivalencesFor(arroz, despensa).items.map((i) => i.food.name);

    expect(nombres).not.toContain('Arroz blanco (crudo)');
    expect(nombres).not.toContain('Arroz blanco (cocido)');
    // El integral sí: es otro arroz, y esa es la diferencia.
    expect(nombres).toContain('Arroz integral (crudo)');
  });

  it('la tortita y las tortitas son una sola fila', () => {
    const nombres = equivalencesFor(arroz, despensa).items.map((i) => i.food.name);
    expect(nombres.filter((n) => n.startsWith('Tortita'))).toHaveLength(1);
  });

  it('los cuatro huevos del catálogo no son cuatro equivalencias', () => {
    const nombres = equivalencesFor(huevo, despensa).items.map((i) => i.food.name);

    expect(nombres).not.toContain('Huevo entero');
    expect(nombres).not.toContain('Huevo entero L');
    expect(nombres).not.toContain('Huevos enteros frescos');
    expect(nombres).not.toContain('Huevo L');
    // Lo que queda es lo que de verdad es otra cosa.
    expect(nombres).toEqual(['Huevina (huevo líquido)']);
  });

  it('en peso cocido se ofrece lo cocido, aunque lo crudo cuadre mejor', () => {
    const lentejas = { name: 'Lentejas (cocidas)', grams: 250, proteinPer100: 9, carbsPer100: 16, fatsPer100: 0.5 };
    const nombres = equivalencesFor(lentejas, despensa).items.map((i) => i.food.name);

    expect(nombres).toContain('Garbanzos (cocidos)');
    expect(nombres).not.toContain('Garbanzos (crudos)');
    expect(nombres).not.toContain('Lentejas (crudas)');
  });

  it('un grupo tuyo se enseña entero: si metiste dos parecidos, tus razones tendrás', () => {
    const misHuevos = {
      id: 'g9',
      name: 'Mis huevos',
      macro: 'protein',
      foods: ['Huevo entero fresco', 'Huevo entero', 'Huevo entero L'],
    };
    const nombres = equivalencesFor(huevo, despensa, [], { grupo: misHuevos }).items.map(
      (i) => i.food.name
    );

    expect(nombres).toEqual(['Huevo entero', 'Huevo entero L']);
  });

  it('y la lista de marcar tampoco se poda: ahí eliges tú', () => {
    const nombres = candidatosDeGrupo(huevo, despensa).items.map((i) => i.food.name);

    expect(nombres).toContain('Huevo entero L');
    expect(nombres).toContain('Huevos enteros frescos');
  });
});

describe('equivalencesFor: una palabra de más no es el mismo alimento', () => {
  /*
    El otro lado de la regla, y el que costaba filas: por el nombre no se
    distingue «Mayonesa light» de «Mayonesa Hacendado», y por la ración sí. Lo
    que se tapa es lo que no añade una decisión; lo que propone otra cantidad
    es justamente el intercambio.
  */
  const despensa = [
    { id: 'g1', name: 'Mayonesa', category: 'Grasas', proteinPer100: 1, carbsPer100: 1.5, fatsPer100: 75 },
    { id: 'g2', name: 'Mayonesa light', category: 'Grasas', proteinPer100: 1, carbsPer100: 6, fatsPer100: 30 },
    { id: 'g3', name: 'Mayonesa Hacendado', category: 'Grasas', proteinPer100: 1, carbsPer100: 1.6, fatsPer100: 74 },
    { id: 'c1', name: 'Pasta (cruda)', category: 'Cereales', proteinPer100: 12, carbsPer100: 71, fatsPer100: 1.5 },
    { id: 'c2', name: 'Pasta (cocida)', category: 'Cereales', proteinPer100: 5, carbsPer100: 30, fatsPer100: 0.9 },
    { id: 'c3', name: 'Arroz blanco (cocido)', category: 'Cereales', proteinPer100: 2.4, carbsPer100: 28, fatsPer100: 0.2 },
  ];

  it('la mayonesa light es el intercambio de la mayonesa: la misma grasa en otra cantidad', () => {
    const mayonesa = { name: 'Mayonesa', grams: 30, proteinPer100: 1, carbsPer100: 1.5, fatsPer100: 75 };
    const nombres = equivalencesFor(mayonesa, despensa).items.map((i) => i.food.name);

    expect(nombres).toContain('Mayonesa light');
    // La marca, en cambio, propone la misma ración: es la misma fila.
    expect(nombres).not.toContain('Mayonesa Hacendado');
  });

  it('la misma vara mide a la fuente y a los candidatos', () => {
    /* Partiendo del aceite, las tres mayonesas son candidatas entre sí y la
       cuenta tiene que salir igual que partiendo de la mayonesa: una sola fila
       de mayonesa —la de siempre y la de marca son la misma— y la light aparte.
       Si no, la lista cambiaría según de dónde se abra. */
    const aceite = { name: 'Aceite de oliva', grams: 10, proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 };
    const catalogo = [...despensa, { id: 'g0', name: 'Aceite de oliva', category: 'Grasas', proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 }];
    const nombres = equivalencesFor(aceite, catalogo).items.map((i) => i.food.name);

    expect(nombres.filter((n) => n === 'Mayonesa' || n === 'Mayonesa Hacendado')).toHaveLength(1);
    expect(nombres).toContain('Mayonesa light');
  });

  it('en peso cocido se ofrece lo crudo de OTRO alimento, que es un cambio de verdad', () => {
    /* Lo que no se ofrece es el mismo alimento en el otro estado —eso es la
       conversión de peso al cocerlo—. Entre alimentos distintos, el estado no
       descarta nada: la ración ya viene con los gramos que hay que pesar. */
    const pasta = { name: 'Pasta (cocida)', grams: 200, proteinPer100: 5, carbsPer100: 30, fatsPer100: 0.9 };
    const nombres = equivalencesFor(pasta, despensa).items.map((i) => i.food.name);

    expect(nombres).not.toContain('Pasta (cruda)');
    expect(nombres).toContain('Arroz blanco (cocido)');
  });
});
