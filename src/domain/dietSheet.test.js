import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  alimentosDeLinea,
  asPlan,
  dietSummary,
  foodNames,
  macrosDeTexto,
  mergeDietReadings,
  parseCantidad,
  parseDietSheet,
  toMealDrafts,
  varianteDeTexto,
} from './dietSheet';
import { parseRoutineSheet } from './routineSheet';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que cuatro dietas reales de tres entrenadores distintos —dos hojas de cálculo
 * con maquetaciones que no se parecen en nada, una que solo trae cifras y un PDF
 * escrito en párrafos— se lean con las comidas, las opciones, los gramos y los
 * objetivos que ponen.
 *
 * Y sobre todo, los dos fallos que no se ven:
 *
 *   · **Una hoja de RUTINA leída como dieta.** «1 serie 12.5kg» tiene la misma
 *     forma que «1 Plátano mediano», y por ahí un mesociclo entero entraba como
 *     una comida de noventa alimentos. No hay error, no hay aviso: aparece una
 *     dieta que nadie ha escrito.
 *   · **Los macros leídos al revés.** En «70g G» la primera `g` son gramos y la
 *     segunda son grasas; en «140g P» la misma letra es la unidad de la
 *     proteína. Un lector que busque «un número seguido de g» acierta el número
 *     y se equivoca de macro, que es la clase de dato que nadie recalcula.
 *
 * Las hojas van en `__fixtures__` en TSV, que es lo que entrega el portapapeles
 * y lo que produce `xlsx.js`: probar contra el `.xlsx` binario probaría el
 * lector de ZIP, que tiene sus propias pruebas.
 */

const hoja = (nombre) =>
  readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url), 'utf8');

const leer = (nombre) => parseDietSheet(hoja(nombre));

/* ══ Los macros, vengan como vengan ═══════════════════════════════════════ */

describe('macrosDeTexto', () => {
  it('lee la línea de una hoja, con la unidad pegada a cada cifra', () => {
    expect(macrosDeTexto('3000kcals 140g P 452g H 70g G')).toEqual({
      kcals: 3000,
      protein: 140,
      carbs: 452,
      fats: 70,
    });
  });

  it('no confunde los gramos de la proteína con las grasas', () => {
    /* «140g P» son 140 de proteína y CERO noticias sobre las grasas. */
    expect(macrosDeTexto('600 Kcal | 25g P | 90g H')).toEqual({
      kcals: 600,
      protein: 25,
      carbs: 90,
      fats: null,
    });
  });

  it('da igual el orden y da igual la palabra', () => {
    expect(macrosDeTexto('135g Proteína, 60g Grasas y 355g Hidratos 2500kcal')).toEqual({
      kcals: 2500,
      protein: 135,
      carbs: 355,
      fats: 60,
    });
    expect(macrosDeTexto('775 kilocalorías (40g proteína, 120g hidratos y 15g grasas)')).toEqual({
      kcals: 775,
      protein: 40,
      carbs: 120,
      fats: 15,
    });
  });

  it('una sola cifra suelta no es una línea de macros', () => {
    /* «dejar sobre 1:30-2h entre la cena y la cama» lleva un «2h» que, leído
       solo, diría que esa dieta tiene dos gramos de hidratos. */
    expect(macrosDeTexto('tratar de dejar sobre 1:30-2h entre la cena y el irse a la cama')).toBeNull();
    expect(macrosDeTexto('10k pasos aprox, bici a 110-120 bpm (30min)')).toBeNull();
  });

  it('una sola cifra SÍ vale si el renglón es esa cifra y nada más', () => {
    /* Hay quien escribe el objetivo en cuatro renglones. Aceptarlos es la
       diferencia entre importar el objetivo y no importarlo. */
    expect(macrosDeTexto('Proteína: 135 g')).toMatchObject({ protein: 135 });
    expect(macrosDeTexto('Kcal 2500')).toMatchObject({ kcals: 2500 });
    /* Y una pauta que menciona una cifra de pasada sigue siendo una pauta. */
    expect(macrosDeTexto('come 40 gramos de proteína en cada comida')).toBeNull();
  });

  it('«135 g» son gramos de algo, no 135 de grasa', () => {
    /* La `g` es etiqueta solo cuando el número ya traía su unidad («70g G»).
       Sin esta regla, «Proteína: 135 g» entraba como 135 g de grasa. */
    expect(macrosDeTexto('Proteína: 135 g').fats).toBeNull();
    expect(macrosDeTexto('2500 kcal 135 g P 60 g G')).toMatchObject({ protein: 135, fats: 60 });
  });
});

/* ══ El objetivo escrito como tabla ═══════════════════════════════════════ */

describe('los macros de una hoja de cálculo de verdad', () => {
  /*
    Ninguna de estas dos formas la veía el lector, y son las dos MÁS comunes en
    una hoja: nadie escribe «140g P» dentro de una celda, se pone el rótulo en
    una celda y la cifra en otra. El resultado era que la dieta entraba sin
    objetivo mientras el diálogo decía que lo traía.
  */
  it('rótulos en una fila y cifras debajo', () => {
    const hoja = 'KCAL\tPROTEÍNA\tHIDRATOS\tGRASAS\n2500\t135\t355\t60';
    expect(parseDietSheet(hoja).targets).toEqual({
      kcals: 2500,
      protein: 135,
      carbs: 355,
      fats: 60,
    });
  });

  it('rótulos en una columna y cifras al lado', () => {
    const hoja = 'Kcal\t2500\nProteína\t135\nHidratos\t355\nGrasas\t60';
    expect(parseDietSheet(hoja).targets).toEqual({
      kcals: 2500,
      protein: 135,
      carbs: 355,
      fats: 60,
    });
  });

  it('las cifras se completan entre renglones en vez de quedarse con el primero', () => {
    /* La lectura de «Kcal 2500» es válida y tiene tres huecos; los otros tres
       renglones los rellenan. Quedándose con la primera, la dieta entraba con
       las kilocalorías y sin un solo macro. */
    const texto = 'Kcal: 2500\nProteína: 135 g\nHidratos: 355 g\nGrasas: 60 g';
    expect(parseDietSheet(texto).targets).toEqual({
      kcals: 2500,
      protein: 135,
      carbs: 355,
      fats: 60,
    });
  });

  it('una tabla de gramos no es un objetivo de macros', () => {
    /* Una columna «GRAMOS» con números debajo no dice nada de las grasas. */
    expect(parseDietSheet('ALIMENTO\tGRAMOS\nAvena\t100\nPlátano\t120').targets).toBeNull();
  });
});

/* ══ Las cantidades ═══════════════════════════════════════════════════════ */

describe('parseCantidad', () => {
  it('gramos, kilos y mililitros acaban en gramos', () => {
    expect(parseCantidad('100g')).toEqual({ grams: 100 });
    expect(parseCantidad('1kg')).toEqual({ grams: 1000 });
    /* La leche y las claras rondan el gramo por mililitro; se marca para poder
       decirlo en la revisión. */
    expect(parseCantidad('400ml')).toEqual({ grams: 400, deMl: true });
  });

  it('un número sin unidad son piezas, no gramos', () => {
    /* Nadie escribe dos gramos de huevo. */
    expect(parseCantidad('2')).toEqual({ units: 2 });
    expect(parseCantidad('1ud')).toEqual({ units: 1 });
  });

  it('conserva la unidad que nombra la hoja', () => {
    expect(parseCantidad('2 loncha')).toEqual({ units: 2, unitLabel: 'loncha' });
  });

  it('lo que no es una cantidad no lo es', () => {
    expect(parseCantidad('Avena')).toBeNull();
    expect(parseCantidad('')).toBeNull();
  });
});

/* ══ Las hojas de cálculo ═════════════════════════════════════════════════ */

describe('una hoja con las opciones en columnas', () => {
  const lectura = leer('dieta-low.tsv');

  it('trae las tres comidas con sus cinco opciones', () => {
    expect(lectura.format).toBe('tabla');
    expect(dietSummary(lectura)).toEqual({ meals: 3, options: 15, foods: 69 });
  });

  it('cada opción trae sus alimentos con su cantidad', () => {
    const [desayuno] = lectura.meals;
    expect(desayuno.name).toBe('COMIDA 1');
    expect(desayuno.options[0].foods.map((f) => f.name)).toEqual([
      'Avena',
      'Plátano',
      'Leche semidesnatada',
    ]);
    expect(desayuno.options[0].foods[0]).toMatchObject({ name: 'Avena', grams: 100 });
    expect(desayuno.options[0].foods[1]).toMatchObject({ name: 'Plátano', units: 1 });
  });

  it('la fila de totales es el objetivo de esa comida', () => {
    expect(lectura.meals[0].target).toEqual({ kcals: 600, protein: 25, carbs: 90, fats: 15 });
    expect(lectura.meals[2].target).toEqual({ kcals: 1100, protein: 45, carbs: 185, fats: 20 });
  });

  it('la columna de notas es de la comida y no un alimento más', () => {
    /* Sin esto, «5g grasa 15 prote» —que vive a la derecha del último bloque—
       entraría como el nombre de un alimento de la quinta opción. */
    expect(lectura.meals[2].note).toBe('5g grasa 15 prote');
    const nombres = lectura.meals[2].options.flatMap((o) => o.foods.map((f) => f.name));
    expect(nombres).not.toContain('5g grasa 15 prote');
  });

  it('propone qué día es, y con qué palabra lo ha pensado', () => {
    expect(lectura.variant).toBe('rest');
    expect(lectura.variantRaw).toBe('Día Low');
    expect(leer('dieta-high.tsv').variant).toBe('training');
  });

  it('no se inventa una comida con la cabecera de la hoja', () => {
    /* El nombre del cliente y «Plan Medio / DIETA UNIFICADA» están encima de la
       primera comida y no son alimentos de nadie. */
    expect(lectura.meals.map((m) => m.name)).toEqual(['COMIDA 1', 'COMIDA 2', 'COMIDA 3']);
  });
});

describe('una hoja con menús numerados y su fila de ALIMENTO / GRAMOS', () => {
  const lectura = leer('dieta-menus.tsv');

  it('lee los seis menús de cada comida', () => {
    expect(dietSummary(lectura)).toEqual({ meals: 4, options: 24, foods: 93 });
  });

  it('la cantidad sale de la columna que la hoja rotula, no de la de al lado', () => {
    const menu5 = lectura.meals[0].options[4];
    expect(menu5.foods.map((f) => f.name)).toEqual([
      'Pan blanco',
      'Pechuga Pavo',
      'Queso Havarti Light',
    ]);
    expect(menu5.foods[2]).toMatchObject({ units: 2, unitLabel: 'loncha' });
  });

  it('«NOTA:» es la pauta de esa comida', () => {
    expect(lectura.meals[2].note).toContain('puedes añadir verdura al gusto');
  });

  it('dos comidas rotuladas igual siguen siendo dos comidas', () => {
    /* La hoja real numera dos veces «COMIDA 3». Fundirlas por el nombre dejaría
       al cliente sin cenar. */
    expect(lectura.meals.map((m) => m.name)).toEqual([
      'COMIDA 1',
      'COMIDA 2',
      'COMIDA 3',
      'COMIDA 3',
    ]);
  });
});

describe('una hoja que solo trae las cifras', () => {
  const lectura = leer('dieta-solo-macros.tsv');

  it('se lee como objetivo y no como menú vacío', () => {
    expect(lectura.format).toBe('macros');
    expect(lectura.meals).toHaveLength(0);
    expect(lectura.targets).toEqual({ kcals: 3000, protein: 140, carbs: 452, fats: 70 });
  });

  it('los pasos y las pautas también son parte del plan', () => {
    expect(lectura.steps).toContain('10k pasos');
    expect(lectura.notes[0].body).toContain('crononutrirse');
  });
});

/* ══ El PDF, o cualquier dieta escrita en párrafos ════════════════════════ */

describe('una dieta escrita, no tabulada', () => {
  const lectura = leer('dieta-pdf-texto.txt');

  it('lee las comidas por sus títulos y las opciones por los suyos', () => {
    expect(lectura.format).toBe('texto');
    expect(lectura.meals.map((m) => m.name)).toEqual([
      'DESAYUNO / PRE ENTRENO',
      'COMIDA / POST ENTRENO',
      'CENA',
    ]);
    expect(lectura.meals[2].options).toHaveLength(5);
  });

  it('el objetivo del día y el de cada comida no se confunden', () => {
    expect(lectura.targets).toEqual({ kcals: 2500, protein: 135, carbs: 355, fats: 60 });
    expect(lectura.meals[0].target).toEqual({ kcals: 775, protein: 40, carbs: 120, fats: 15 });
  });

  it('las pautas de arriba se agrupan bajo su título', () => {
    expect(lectura.notes).toHaveLength(1);
    expect(lectura.notes[0].title).toBe('Pequeñas pautas antes de empezar con la propia dieta y comidas');
    expect(lectura.notes[0].body).toContain('pesarlos siempre en CRUDO');
    /* El título del documento no es una pauta. */
    expect(lectura.notes[0].body).not.toContain('Plan Alimenticio');
  });

  it('la prosa de dentro de una comida es su pauta', () => {
    expect(lectura.meals[0].note).toContain('entre 90 y 120');
  });

  it('el renglón que el papel partió se vuelve a juntar', () => {
    /*
      En un PDF, un renglón acaba donde acaba la hoja:

        - 130g Pasta integral / … / 550g Patata / 470g
        Boniato

      Leídos por separado, la última alternativa se queda en «470g» —una
      cantidad sin nada que contar, que se tira— y «Boniato» acaba de pauta de
      la comida. El alimento está escrito y se perdía.
    */
    const texto = 'CENA\n- 130g Pasta integral / 550g Patata / 470g\nBoniato\n- 200g Brócoli';
    const [cena] = parseDietSheet(texto).meals;

    expect(cena.options[0].foods[0].alternatives).toEqual(['550g Patata', '470g Boniato']);
    expect(cena.options[0].foods.map((f) => f.name)).toEqual(['Pasta integral', 'Brócoli']);
    expect(cena.note).toBe('');
  });

  it('un título no se pega a la línea de debajo', () => {
    /* La otra cara de lo mismo: «DESAYUNO» y lo que viene después son dos cosas
       distintas, y juntarlas se lleva por delante el nombre de la comida. */
    const texto = 'DESAYUNO\nProcura consumirlo 90 antes\n- 100g Avena';
    const [desayuno] = parseDietSheet(texto).meals;

    expect(desayuno.name).toBe('DESAYUNO');
    expect(desayuno.note).toBe('Procura consumirlo 90 antes');
  });
});

describe('alimentosDeLinea', () => {
  it('un alimento con su cantidad delante', () => {
    expect(alimentosDeLinea('- 100g Copos de avena')).toMatchObject([
      { name: 'Copos de avena', grams: 100 },
    ]);
  });

  it('«y» son dos alimentos; «/» y «o» son el mismo con alternativas', () => {
    /* Confundirlos mete tres desayunos en uno, o deja un melón sin gramos. */
    expect(alimentosDeLinea('2 Huevos y 150mL Claras de huevo').map((f) => f.name)).toEqual([
      'Huevos',
      'Claras de huevo',
    ]);

    const [pasta] = alimentosDeLinea('130g Pasta integral / 130g Arroz integral / 220g Pan integral');
    expect(pasta.name).toBe('Pasta integral');
    expect(pasta.alternatives).toEqual(['130g Arroz integral', '220g Pan integral']);

    const [gallo] = alimentosDeLinea('200g Gallo o 180g Merluza');
    expect(gallo).toMatchObject({ name: 'Gallo', grams: 200 });
    expect(gallo.alternatives).toEqual(['180g Merluza']);
  });

  it('una «o» sin cantidad detrás es parte del nombre', () => {
    expect(alimentosDeLinea('200g Sandía o melón')).toMatchObject([
      { name: 'Sandía o melón', grams: 200 },
    ]);
  });

  it('una línea de registro de entrenamiento no es comida', () => {
    /* El fallo que estuvo a punto de colarse: mismo aspecto, otro mundo. */
    expect(alimentosDeLinea('1 serie 12.5kg, 2 serie 11.3kg')).toEqual([]);
    expect(alimentosDeLinea('Bebe todo lo que necesites para no sentir sed')).toEqual([]);
  });
});

/* ══ Que una rutina no acabe siendo una dieta ═════════════════════════════ */

describe('lo que NO es una dieta', () => {
  it('un mesociclo de cinco días no trae ni una comida', () => {
    const rutina = hoja('rutina-mesociclo-5-dias.tsv');
    expect(parseRoutineSheet(rutina).days).toHaveLength(5);
    expect(parseDietSheet(rutina).meals).toHaveLength(0);
    expect(parseDietSheet(rutina).format).toBeNull();
  });

  it('una tabla de nombres y números pelados tampoco', () => {
    /* Sin unidad no hay cantidad: «Press banca 4» es un ejercicio con cuatro
       series, no cuatro gramos de nada. */
    const tabla = 'Ejercicio\tSeries\nPress banca\t4\nRemo\t4\nCurl\t3';
    expect(parseDietSheet(tabla).meals).toHaveLength(0);
  });
});

/* ══ Varias hojas ═════════════════════════════════════════════════════════ */

describe('mergeDietReadings', () => {
  const entradas = [
    { name: 'Día Low', reading: leer('dieta-low.tsv') },
    { name: 'Día High', reading: leer('dieta-high.tsv') },
    { name: 'Macros', reading: leer('dieta-solo-macros.tsv') },
  ];

  it('cada hoja con menú es una VARIANTE, no la continuación de la anterior', () => {
    /* Pegadas una detrás de otra darían seis comidas donde hay tres. */
    const plan = mergeDietReadings(entradas);
    expect(plan.variants).toHaveLength(2);
    expect(plan.variants.map((v) => v.variant)).toEqual(['rest', 'training']);
    expect(plan.variants[0].meals).toHaveLength(3);
  });

  it('la hoja que solo trae cifras se funde con las demás', () => {
    const plan = mergeDietReadings(entradas);
    expect(plan.targets).toEqual({ kcals: 3000, protein: 140, carbs: 452, fats: 70 });
    expect(plan.steps).toContain('10k pasos');
  });

  it('con una sola hoja no hay dos días que distinguir', () => {
    const plan = mergeDietReadings([entradas[0]]);
    expect(plan.variants).toHaveLength(1);
  });

  it('sin nada que traer no inventa variantes', () => {
    expect(mergeDietReadings([]).variants).toEqual([]);
    expect(asPlan(parseDietSheet('')).variants).toEqual([]);
  });
});

describe('varianteDeTexto', () => {
  it('reconoce la etiqueta y no la palabra suelta dentro de una frase', () => {
    expect(varianteDeTexto('Día High').variant).toBe('training');
    expect(varianteDeTexto('Día Low').variant).toBe('rest');
    /* «Si entrenas algún día en un horario no habitual» es una pauta, no una
       etiqueta: marcar el plan entero como día de entreno por eso sería adivinar
       en la primera página. */
    expect(varianteDeTexto('Si entrenas algún día en un horario no habitual').variant).toBeNull();
  });
});

/* ══ De lo leído a lo que se guarda ═══════════════════════════════════════ */

describe('toMealDrafts', () => {
  const lectura = leer('dieta-pdf-texto.txt');
  const biblioteca = {
    'copos de avena': {
      name: 'Avena',
      proteinPer100: 13,
      carbsPer100: 60,
      fatsPer100: 7,
      unitLabel: null,
      unitGrams: null,
    },
  };

  it('los alimentos reconocidos entran con los macros de la biblioteca', () => {
    const [desayuno] = toMealDrafts(lectura.meals, (n) => biblioteca[n.toLowerCase()] || null);
    const avena = desayuno.options[0].foods[0];
    expect(avena).toMatchObject({ name: 'Avena', grams: 100, proteinPer100: 13 });
  });

  it('los que no se reconocen entran a cero en vez de quedarse fuera', () => {
    const [desayuno] = toMealDrafts(lectura.meals, () => null);
    expect(desayuno.options[0].foods[1]).toMatchObject({
      name: 'Yogur griego ligero o desnatado',
      grams: 400,
      proteinPer100: 0,
    });
  });

  it('las alternativas que no caben se escriben en la pauta de la comida', () => {
    /* Son media dieta en los planes que se escriben así: el cliente las necesita
       para poder comer otra cosa el martes. */
    const comidas = toMealDrafts(lectura.meals, () => null);
    expect(comidas[1].note).toContain('Pasta integral: o bien 130g Arroz integral');
  });
});

describe('foodNames', () => {
  it('cada nombre una sola vez, con la unidad que traía', () => {
    const plan = asPlan(leer('dieta-low.tsv'));
    const nombres = foodNames(plan.variants);
    expect(nombres.filter((n) => n.name === 'Avena')).toHaveLength(1);
    expect(nombres.find((n) => n.name === 'Plátano')).toMatchObject({ units: 1 });
  });
});
