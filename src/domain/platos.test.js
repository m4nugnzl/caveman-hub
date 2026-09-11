import { describe, expect, it } from 'vitest';

import { TIPO } from '@/lib/portapapeles';
import {
  MAX_PLATOS,
  buildPlato,
  freePlatoName,
  piezaDePlato,
  platoFoods,
  platoKcals,
  platoSummary,
  platosOf,
  scalePlatoTo,
} from './platos';

/* Una opción de comida tal como la guarda una dieta: entradas congeladas, con
   sus ids, su forma de contarse y —desde la 0102— lo que declaren del envase. */
const desayuno = [
  {
    id: 'food_1',
    name: 'Avena',
    grams: 80,
    proteinPer100: 13,
    carbsPer100: 66,
    fatsPer100: 7,
    unitLabel: null,
    unitGrams: null,
    showAs: 'grams',
    fiberPer100: 10,
    equivHidden: true,
  },
  {
    id: 'food_2',
    name: 'Plátano',
    grams: 120,
    proteinPer100: 1,
    carbsPer100: 21,
    fatsPer100: 0,
    unitLabel: 'plátano',
    unitGrams: 120,
    showAs: 'units',
  },
];

describe('buildPlato', () => {
  it('guarda la ración y deja fuera lo que era de aquella dieta', () => {
    const plato = buildPlato({ name: '  Desayuno de definición ', foods: desayuno, savedAt: '2026-09-08' });

    expect(plato.name).toBe('Desayuno de definición');
    expect(plato.savedAt).toBe('2026-09-08');
    expect(plato.foods).toHaveLength(2);

    const avena = plato.foods[0];
    // Ni el id de la entrada de la que salió ni la decisión sobre lo que ve un
    // cliente concreto.
    expect(avena.id).toBeUndefined();
    expect(avena.equivHidden).toBeUndefined();
    // Lo que describe la ración sí viaja, micros incluidos.
    expect(avena.grams).toBe(80);
    expect(avena.carbsPer100).toBe(66);
    expect(avena.fiberPer100).toBe(10);
    // Y lo que no se declara sigue sin decirse.
    expect(plato.foods[1].fiberPer100).toBeUndefined();
    expect(plato.foods[1].showAs).toBe('units');
  });

  it('tira los alimentos sin nombre', () => {
    const plato = buildPlato({ name: 'Roto', foods: [...desayuno, { grams: 50 }, null] });
    expect(plato.foods).toHaveLength(2);
  });
});

describe('platoMacros y su resumen', () => {
  it('cuenta como una opción de comida, porque lo es', () => {
    const plato = buildPlato({ name: 'Desayuno', foods: desayuno });
    // 80 g de avena: 10,4 P · 52,8 C · 5,6 G → 303,2 kcal
    // 120 g de plátano: 1,2 P · 25,2 C · 0 G → 105,6 kcal
    expect(platoKcals(plato)).toBe(409);
    expect(platoSummary(plato)).toBe('2 alimentos · 409 kcal');
  });
});

describe('platosOf', () => {
  it('lee la sección y tira lo que no es un plato', () => {
    const bueno = buildPlato({ name: 'Desayuno', foods: desayuno });
    const prefs = {
      platos: {
        items: [
          bueno,
          { id: 'p2', name: '', foods: desayuno },
          { id: 'p3', name: 'Sin nada', foods: [] },
          { name: 'Sin id', foods: desayuno },
          null,
        ],
      },
    };
    expect(platosOf(prefs).map((p) => p.name)).toEqual(['Desayuno']);
  });

  it('sin sección devuelve la lista vacía', () => {
    expect(platosOf({})).toEqual([]);
    expect(platosOf(null)).toEqual([]);
  });

  it('el tope existe y es mayor que el de las piezas', () => {
    expect(MAX_PLATOS).toBe(40);
  });
});

describe('platoFoods', () => {
  it('devuelve entradas de dieta nuevas, con ids propios', () => {
    const plato = buildPlato({ name: 'Desayuno', foods: desayuno });
    const a = platoFoods(plato);
    const b = platoFoods(plato);

    expect(a).toHaveLength(2);
    expect(a[0].id).toBeTruthy();
    // Dos usos del mismo plato no pueden compartir ids: se cruzarían al editar.
    expect(a[0].id).not.toBe(b[0].id);
    expect(a[0].name).toBe('Avena');
    expect(a[0].grams).toBe(80);
    expect(a[0].fiberPer100).toBe(10);
    // La unidad se conserva: «1 plátano», no 120 g.
    expect(a[1].showAs).toBe('units');
  });
});

describe('freePlatoName', () => {
  it('desempata sin pisar lo que ya se llama así', () => {
    expect(freePlatoName('Desayuno', [])).toBe('Desayuno');
    expect(freePlatoName('Desayuno', ['Desayuno'])).toBe('Desayuno 2');
    expect(freePlatoName('Desayuno', ['Desayuno', 'desayuno 2 '])).toBe('Desayuno 3');
    expect(freePlatoName('   ', [])).toBe('Plato');
  });
});

describe('scalePlatoTo', () => {
  it('cuadra el plato al objetivo sin tocar lo que se cuenta por unidades', () => {
    const plato = buildPlato({ name: 'Desayuno', foods: desayuno });
    const res = scalePlatoTo(platoFoods(plato), 300);

    expect(res).not.toBe(null);
    // El plátano se cuenta en piezas: no se puede pedir 0,8 plátanos.
    const platano = res.foods.find((f) => f.name === 'Plátano');
    expect(platano.grams).toBe(120);
    // La avena sí baja, y redondeada a 5 g.
    const avena = res.foods.find((f) => f.name === 'Avena');
    expect(avena.grams).toBeLessThan(80);
    expect(avena.grams % 5).toBe(0);
    expect(res.cambios.length).toBeGreaterThan(0);
  });

  it('se rinde en voz alta cuando no hay nada que mover', () => {
    const plato = buildPlato({ name: 'Desayuno', foods: desayuno });
    // Al mismo objetivo que ya tiene no hay nada que cuadrar.
    expect(scalePlatoTo(platoFoods(plato), 409)).toBe(null);
    expect(scalePlatoTo([], 500)).toBe(null);
    expect(scalePlatoTo(platoFoods(plato), 0)).toBe(null);
  });
});

describe('un plato hecho pieza del portapapeles', () => {
  it('poda igual que al guardarlo y bautiza la carga', () => {
    const pieza = piezaDePlato({
      name: '  Desayuno de definición  ',
      foods: desayuno,
      origen: { cliente: 'Marta' },
    });

    expect(pieza.tipo).toBe(TIPO.PLATO);
    expect(pieza.titulo).toBe('Desayuno de definición');
    expect(pieza.detalle).toBe(platoSummary({ foods: buildPlato({ foods: desayuno }).foods }));
    expect(pieza.origen).toEqual({ cliente: 'Marta' });

    /* El nombre DENTRO de la carga, en la clave que `alaMano` declara para el
       plato: es lo que lee `pegarPlato` para bautizar la alternativa que entra,
       y lo que un plato devuelto desde la vitrina trae también. Sin esto, un
       plato de la mano y uno de las plantillas se pegarían distinto — la avería
       del `dayName` de la hoja. */
    expect(pieza.carga.name).toBe('Desayuno de definición');

    /* La misma poda que `buildPlato`: fuera el id de la entrada de la que sale
       y fuera `equivHidden`, que es una decisión sobre lo que ve UN cliente. */
    expect(pieza.carga.foods).toEqual(buildPlato({ foods: desayuno }).foods);
    for (const f of pieza.carga.foods) {
      expect(f.id).toBeUndefined();
      expect(f.equivHidden).toBeUndefined();
    }
  });

  it('sin ración no hay pieza, y sin nombre se llama «Plato»', () => {
    expect(piezaDePlato({ name: 'Vacío', foods: [] })).toBe(null);
    expect(piezaDePlato({ name: 'Vacío', foods: [{ name: '  ' }] })).toBe(null);
    expect(piezaDePlato({ foods: desayuno }).titulo).toBe('Plato');
    expect(piezaDePlato({ foods: desayuno }).carga.name).toBe('Plato');
  });
});
