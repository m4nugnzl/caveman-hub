import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { dayMacros, repartoAlObjetivo, rescaleMeals } from '@/domain/nutrition';
import { PlanDia } from './PlanDia';
import { RepartoDelAjuste } from './RepartoDelAjuste';
import { ReajusteDelMenu, useReajuste } from './ReajusteDelMenu';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * El paso del reparto nació de una avería que se veía en la pantalla y no en
 * ningún sitio más: el día pedía 2.250 kcal, las cuatro comidas seguían
 * pidiendo 600 cada una porque se escribieron cuando el día valía 2.400, y el
 * menú aterrizaba clavado en la cifra vieja. La cuenta está probada en el
 * dominio (`repartoAlObjetivo`); lo que se fija aquí es lo que solo se ve
 * mirando lo que sale escrito:
 *
 *   1. **La cifra vieja y la nueva salen las dos**, que es lo que convierte
 *      dos columnas de números en un antes y un después.
 *   2. **Una comida con candado lo dice con la palabra**, no con un «600 → 600»
 *      que se lee como un cambio que no ha pasado.
 *   3. **Apagado el interruptor, se dice la consecuencia**: el menú se ajustará
 *      a las comidas viejas y no al objetivo.
 *   4. **El candado solo existe donde el reparto se edita.** La misma tabla la
 *      lee el cliente en su portal, y allí no hay nada que clavar.
 *
 * Corre en Node y sin jsdom, como el resto de las pruebas de componente de la
 * casa.
 */

const comida = (name, target, extra = {}) => ({
  id: name,
  name,
  target,
  options: [{ id: `${name}-1`, foods: [] }],
  ...extra,
});

const cuatro = () => [
  comida('Comida 1', { kcals: 600, protein: 30, carbs: 86, fats: 15 }),
  comida('Comida 2', { kcals: 600, protein: 30, carbs: 86, fats: 15 }),
  comida('Comida 3', { kcals: 600, protein: 30, carbs: 98, fats: 10 }),
  comida('Comida 4', { kcals: 600, protein: 30, carbs: 84, fats: 15 }),
];

const DIA = { kcals: 2250, protein: 115, carbs: 324, fats: 55 };

const pinta = (meals, extra = {}) =>
  renderToStaticMarkup(
    <RepartoDelAjuste
      meals={meals}
      objetivo={DIA}
      reparto={repartoAlObjetivo(meals, DIA)}
      seguir
      onSeguir={() => {}}
      {...extra}
    />
  );

describe('el paso del reparto', () => {
  it('dice lo que había repartido y lo que pide el día', () => {
    const html = pinta(cuatro());
    expect(html).toContain('2400 kcal');
    expect(html).toContain('el día pide 2250');
  });

  it('cada comida enseña su cifra vieja y la nueva', () => {
    const html = pinta(cuatro());
    expect(html).toContain('600 kcal');
    expect(html).toContain('563 kcal');
  });

  /* Un «600 → 600» se lee como un cambio que no ha pasado: la que no se mueve
     lo dice con la palabra. Ver `.reparto-fila.es-igual`. */
  it('la comida con candado lo dice con la palabra y no repitiendo su cifra', () => {
    const meals = cuatro();
    meals[0].fijo = true;
    const html = pinta(meals);
    expect(html).toContain('fija');
    expect(html).toContain('la que lleva candado se queda');
  });

  it('apagado, dice adónde se queda el reparto y qué le pasa al menú', () => {
    const html = pinta(cuatro(), { seguir: false, reparto: null });
    expect(html).toContain('El reparto se queda en 2400 kcal');
    expect(html).toContain('no al objetivo del día');
    /* Y no pinta la tabla de un cambio que no se va a hacer. */
    expect(html).not.toContain('Repartidas');
  });
});

describe('el candado en la mesa del reparto', () => {
  const targets = { targetKcals: 2250, proteinGrams: 115, carbsGrams: 324, fatsGrams: 55 };

  it('se puede poner donde el reparto se edita', () => {
    const html = renderToStaticMarkup(
      <PlanDia meals={cuatro()} targets={targets} onTarget={() => {}} onFijar={() => {}} />
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Dejar «Comida 1» fija al cambiar el objetivo');
  });

  it('puesto, queda dicho que esa comida no se mueve', () => {
    const meals = cuatro();
    meals[2].fijo = true;
    const html = renderToStaticMarkup(
      <PlanDia meals={meals} targets={targets} onTarget={() => {}} onFijar={() => {}} />
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('«Comida 3» no se mueve al cambiar el objetivo');
  });

  /* La misma tabla la lee el cliente en su portal, donde el reparto es lo que
     le han pautado y no algo que él decida. */
  it('sin el verbo no se dibuja: en el portal no hay nada que clavar', () => {
    const html = renderToStaticMarkup(<PlanDia meals={cuatro()} targets={targets} />);
    expect(html).not.toContain('plan-dia-candado');
  });
});


/**
 * ══ Y EL MENÚ SIGUE AL REPARTO ═════════════════════════════════════════════
 *
 * La segunda mitad de la misma avería, vista en la dieta de la que salió: con
 * el reparto ya corregido, el costado decía «objetivos 2.250» y las comidas
 * seguían sumando 2.400. El paso del menú miraba solo si alguien había TECLEADO
 * algo —la ley del reposo—, así que una dieta que LLEGA descuadrada no tenía
 * ninguna puerta por la que arreglarse: la ventana se abría, no decía nada y
 * guardaba lo mismo que había.
 *
 * Lo que se fija aquí son las tres respuestas del gancho, que es donde se
 * decide si ese paso existe:
 *
 *   1. **Un menú que cuadra no propone nada.** Reposo es no tocar lo que
 *      cuadra; sin esto la ventana sería una máquina de mover gramajes.
 *   2. **Un menú que no cuadra, sí** — aunque nadie haya tecleado una tecla.
 *   3. **Y el reparto moviéndose también**, aunque el día entero cuadre: la
 *      portería de cada comida es la que manda un piso más abajo.
 */
const alimento = (name, grams, protein, carbs, fats) => ({
  name,
  grams,
  proteinPer100: protein,
  carbsPer100: carbs,
  fatsPer100: fats,
});

/* Una comida con la forma del día: el arroz pone los hidratos, el pollo la
   proteína y el aceite la grasa. `escala` la agranda o la encoge sin cambiarla
   de forma, que es lo que permite repartir mal un día que sí cuadra. */
const conComida = (n, target, escala = 1) => ({
  id: `m${n}`,
  name: `Comida ${n}`,
  target,
  options: [
    {
      id: `m${n}-1`,
      foods: [
        alimento('Arroz', Math.round(101 * escala), 7, 80, 1),
        alimento('Pollo', Math.round(94 * escala), 23, 0, 2),
        alimento('Aceite', Math.round(11 * escala), 0, 0, 100),
      ],
    },
  ],
});

/* El reparto YA corregido: 2.250 entre cuatro. Es el estado en el que quedó
   la dieta de la avería después de arreglar el piso de en medio, y el que deja
   ver lo del piso de abajo — objetivos en 2.250 y comidas en 2.400. */
const REPARTIDO = { kcals: 563, protein: 29, carbs: 81, fats: 14 };

/* Cuatro de estas suman 2.252 · 115 P · 323 C · 56 G: el día de la prueba
   clavado, así que lo que se mide aquí es el reajuste y no el redondeo. */
const cuadrado = () => [1, 2, 3, 4].map((n) => conComida(n, REPARTIDO));

const SEIS = { kcals: 600, protein: 30, carbs: 86, fats: 15 };

/* El gancho se mira por lo que pinta, como el resto de las pruebas de la casa. */
const Reajuste = (props) => {
  const datos = useReajuste(props);
  return <span>{(datos?.filas || []).length}</span>;
};

const filasDe = (props) =>
  Number(renderToStaticMarkup(<Reajuste catalog={[]} {...props} />).replace(/<[^>]+>/g, ''));

describe('el menú sigue al reparto', () => {
  const macros = { protein: 115, carbs: 324, fats: 55 };
  /* Nadie ha tecleado nada: el día ya estaba en 2.250 al abrir la ventana. */
  const enReposo = { antes: macros, despues: macros, kcals: { antes: 2250, ahora: 2250 } };

  it('un menú que ya cuadra no propone nada', () => {
    const meals = cuadrado();
    expect(filasDe({ meals, ...enReposo })).toBe(0);
  });

  /* La avería, tal cual: objetivos en 2.250 y comidas en 2.400. */
  it('un menú que no cuadra se reajusta aunque no se haya tecleado nada', () => {
    /* El mismo día un 7 % por encima: la dieta que se creó en 2.400 y se bajó
       a 2.250 sin que el menú se enterara. */
    const meals = [1, 2, 3, 4].map((n) => conComida(n, REPARTIDO, 1.07));
    expect(Math.round(dayMacros(meals).kcal)).toBeGreaterThan(2400);
    expect(filasDe({ meals, ...enReposo })).toBeGreaterThan(0);
  });

  /* Y aterriza en lo pautado, que es lo que convierte el paso en un arreglo y
     no en una lista de gramajes movidos. */
  it('y el día acaba sumando lo que pide', () => {
    const meals = [1, 2, 3, 4].map((n) => conComida(n, SEIS, 1.07));
    const reparto = repartoAlObjetivo(meals, DIA);
    const res = rescaleMeals(reparto.meals, { catalog: [], objetivo: macros });
    const kcal = Math.round(dayMacros(res.meals).kcal);
    expect(Math.abs(kcal - DIA.kcals)).toBeLessThan(DIA.kcals * 0.05);
  });

  /* El día cuadra —2.250 repartidos mal— y aun así hay algo que hacer: el
     reparto acaba de igualar las cuatro comidas y el menú tiene que seguirlo. */
  it('movido el reparto, el menú lo sigue aunque el día entero cuadre', () => {
    const meals = [
      conComida(1, SEIS, 1.35),
      conComida(2, SEIS, 1.05),
      conComida(3, SEIS, 0.85),
      conComida(4, SEIS, 0.75),
    ];
    expect(Math.abs(Math.round(dayMacros(meals).kcal) - DIA.kcals)).toBeLessThan(DIA.kcals * 0.05);

    const reparto = repartoAlObjetivo(meals, DIA);
    expect(filasDe({ meals: reparto.meals, ...enReposo, repartoMovido: true })).toBeGreaterThan(0);
  });
});

/**
 * ══ Y LA FILA QUE SE PROPONE QUITAR ════════════════════════════════════════
 *
 * El dominio ya sabe quitarla (`rescaleMeals`, «quitar una fila»). Lo que se
 * fija aquí es lo único que no se ve desde allí: que el renglón dice QUITAR y
 * no «a 0 g» —que se leería como un gramaje— y que el resumen la cuenta aparte,
 * porque quitar un alimento cambia la comida y mover un gramo solo su tamaño.
 */
describe('la fila que se quita', () => {
  const comer = (name, grams, p, c, g, extra = {}) => ({
    id: name,
    name,
    grams,
    proteinPer100: (p / grams) * 100,
    carbsPer100: (c / grams) * 100,
    fatsPer100: (g / grams) * 100,
    ...extra,
  });

  /* La comida 4 de la avería: tres huevos que no se tocan ponen 16 g de grasa
     sobre 15 pautados, así que ningún gramaje cuadra la opción. */
  const laDeAntonio = () => [
    {
      id: 'm4',
      name: 'Comida 4',
      target: { kcals: 562, protein: 28, carbs: 79, fats: 15 },
      options: [
        {
          id: 'o1',
          foods: [
            comer('Patata', 375, 8, 64, 0),
            comer('Huevo', 165, 21, 1, 16, { showAs: 'units', unitLabel: 'ud', unitGrams: 55 }),
            comer('Brócoli', 100, 3, 4, 0),
            comer('Aguacate', 120, 2, 10, 18),
          ],
        },
      ],
    },
  ];

  const UNA = { protein: 28, carbs: 79, fats: 15 };
  const Lista = (props) => {
    const datos = useReajuste({ catalog: [], ...props });
    return <ReajusteDelMenu datos={datos} onApartar={() => {}} onGramos={() => {}} onTodas={() => {}} />;
  };
  const pintada = () =>
    renderToStaticMarkup(
      <Lista
        meals={laDeAntonio()}
        antes={UNA}
        despues={UNA}
        kcals={{ antes: 562, ahora: 562 }}
      />
    );

  it('el renglón dice «quitar», no un gramaje', () => {
    const html = pintada();
    expect(html).toContain('placeholder="quitar"');
    /* Y la fila que se va se distingue de las que se mueven. */
    expect(html).toContain('es-quitar');
  });

  it('el resumen la cuenta aparte de los gramajes', () => {
    expect(pintada()).toContain('1 alimento fuera');
  });

  it('y explica la regla solo cuando hay alguna', () => {
    expect(pintada()).toContain('Un alimento sale de la opción');
    /* Un menú que cuadra no enseña esa explicación: sería contar una regla que
       hoy no se ha aplicado. */
    const html = renderToStaticMarkup(
      <Lista meals={cuadrado()} antes={{ protein: 115, carbs: 324, fats: 55 }} despues={{ protein: 115, carbs: 300, fats: 55 }} kcals={{ antes: 2250, ahora: 2150 }} />
    );
    expect(html).not.toContain('Un alimento sale de la opción');
  });
});
