import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseRoutineSheet } from '@/domain/routineSheet';
import { asPlan, parseDietSheet } from '@/domain/dietSheet';
import { matchFoodNames, pendingMatches } from '@/domain/foodMatch';
import { foodNames } from '@/domain/dietSheet';
import { RoutinePreview, toEditableDays } from './RoutinePreview';
import { DietPreview, FoodMatchList, aPlanDeDieta, resolverCon, toEditableDiet } from './DietPreview';
import { SheetPicker } from './PastePlanDialog';
import { ACCEPT, porQueNoSeLee } from './useSheetSource';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que lo que se enseña antes de importar sea lo que se va a importar, y que se
 * pueda corregir. Los lectores tienen sus pruebas y son buenas; lo que ninguna
 * de ellas ve es la tabla, que es donde una errata no la detecta ni el linter ni
 * el compilador: una columna cambiada de sitio, un objetivo que se pinta siempre
 * el de la primera serie o unos gramos que se enseñan y no se guardan pasan
 * `npm run check` sin despeinarse y convierten la previsualización en un adorno
 * que miente.
 *
 * Con `renderToString` y sin jsdom, igual que `AppContext.test.jsx`: aquí no
 * hace falta pulsar nada, solo comprobar qué sale pintado.
 */

const hoja = (nombre) =>
  readFileSync(new URL(`../../../domain/__fixtures__/${nombre}`, import.meta.url), 'utf8');

/*
  React intercala `<!-- -->` entre trozos de texto para poder reconstruirlos al
  hidratar. Es ruido del renderizador, no del componente, y buscar frases con él
  dentro haría que estas pruebas fallaran por dónde parte React una cadena.
*/
const pintar = (dias) =>
  renderToString(
    <RoutinePreview
      days={dias}
      onRenameDay={() => {}}
      onRemoveDay={() => {}}
      onChangeExercise={() => {}}
      onRemoveExercise={() => {}}
    />
  ).replaceAll('<!-- -->', '');

const leer = (nombre, targetIndex = 0) =>
  toEditableDays(parseRoutineSheet(hoja(nombre)).days, targetIndex);

describe('RoutinePreview', () => {
  const dias = leer('rutina-mesociclo-5-dias.tsv');

  it('pinta los cinco días con su nombre editable', () => {
    const html = pintar(dias);
    for (const nombre of ['TIRÓN', 'EMPUJE', 'PIERNA A', 'TORSO', 'PIERNA B']) {
      expect(html).toContain(`value="${nombre}"`);
    }
    expect(html).toContain('Día 1 de 5');
    expect(html).toContain('Día 5 de 5');
  });

  it('cada día dice cuánto trae, que es lo que hace legible el botón de crear', () => {
    /* Sin esto, un botón que dice «Crear 5 días» después de elegir cuatro hojas
       parece un error; con el recuento por día se ve que una hoja traía dos. */
    const html = pintar(dias);
    expect(html).toContain('6 ejercicios · 14 series');
    expect(html).toContain('7 ejercicios · 16 series');
  });

  it('pinta cada ejercicio con sus series, su objetivo y su RIR, y todo editable', () => {
    const html = pintar(dias);
    expect(html).toContain('CURL DE BÍCEPS EN POLEA CON BARRA');
    expect(html).toContain('value="8-10"');
    expect(html).toContain('value="3"');
    /* La indicación del entrenador viaja hasta la tabla. */
    expect(html).toContain('Rir 1 primera serie');
  });

  it('la columna de objetivo obedece a la que se haya elegido', () => {
    expect(pintar(leer('rutina-mesociclo-5-dias.tsv', 0))).toContain('value="8-10"');
    expect(pintar(leer('rutina-mesociclo-5-dias.tsv', 1))).toContain('value="10-12"');
  });

  it('el músculo sale seleccionado', () => {
    const html = pintar(dias);
    /* React marca la opción elegida de un `select` controlado en el servidor. */
    expect(html).toContain('value="Bíceps" selected=""');
    expect(html).toContain('value="Dorsal" selected=""');
  });

  it('un objetivo distinto por serie se dice entero y sin repetirse', () => {
    const html = pintar(leer('rutina-sesiones-apiladas.tsv'));
    expect(html).toContain('value="6-8 · 8-10"');
    expect(html).toContain('Deltoides Posterior Polea');
  });

  it('todo lo que se puede quitar tiene su botón', () => {
    const html = pintar(dias);
    expect(html.match(/Quitar día/g)).toHaveLength(5);
    expect(html).toContain('aria-label="Quitar CURL DE BÍCEPS EN POLEA CON BARRA"');
  });

  it('avisa de lo que la hoja decía cuando el músculo no se ha podido traducir', () => {
    const dudosos = toEditableDays(
      parseRoutineSheet('Grupo muscular\tEjercicio\tSeries\tReps\nHombros\tPress militar\t4\t8-10').days
    );
    expect(pintar(dudosos)).toContain('tu hoja decía «Hombros»');
  });

  it('sin días no pinta nada, y no revienta', () => {
    expect(pintar([])).toBe('');
  });
});

describe('toEditableDays', () => {
  it('le pone nombre al día que no lo traía', () => {
    const dias = toEditableDays(parseRoutineSheet('Ejercicio\tSeries\nPress banca\t4').days);
    expect(dias[0].name).toBe('Día 1');
  });

  it('da identidad propia a cada día y a cada ejercicio', () => {
    /*
      Es lo que hace que quitar el segundo día no corra las correcciones del
      tercero: sin identidad, las ediciones se guardaban por posición y al borrar
      algo pasaban a aplicarse a quien ocupara ese sitio.
    */
    const dias = leer('rutina-mesociclo-5-dias.tsv');
    const ids = [...dias.map((d) => d.id), ...dias.flatMap((d) => d.exercises.map((e) => e.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('conserva el objetivo por serie en vez de aplanarlo', () => {
    const dias = leer('rutina-sesiones-apiladas.tsv');
    expect(dias[0].exercises[0].targets).toEqual(['6-8', '8-10']);
  });
});

describe('SheetPicker', () => {
  /*
    Un libro de entrenamiento real trae quince pestañas y solo una o cuatro son
    la rutina. Si la lista no dice qué hay dentro de cada una, hay que abrirlas
    de una en una para averiguarlo — que es exactamente el trabajo que esto
    viene a quitar.
  */
  const comoHoja = (texto) => ({
    rutina: parseRoutineSheet(texto),
    dieta: parseDietSheet(texto),
  });

  const hojas = [
    { name: 'Panel de Control', ...comoHoja('') },
    { name: 'Día 1', ...comoHoja('Ejercicio\tSeries\tReps\nPress banca\t4\t8-10') },
    { name: 'Plan de 5 días', ...comoHoja(hoja('rutina-mesociclo-5-dias.tsv')) },
    { name: 'Dieta', ...comoHoja(hoja('dieta-low.tsv')) },
    { name: 'Plan viejo', hidden: true, ...comoHoja('Ejercicio\tSeries\tReps\nSentadilla\t5\t5') },
  ];

  const html = renderToString(
    <SheetPicker hojas={hojas} elegidas={[1, 2, 3]} onToggle={() => {}} />
  ).replaceAll('<!-- -->', '');

  it('dice de cada pestaña qué trae dentro', () => {
    expect(html).toContain('Panel de Control');
    expect(html).toContain('nada que sepa leer');
    expect(html).toContain('1 día · 1 ejercicios');
    expect(html).toContain('5 días · 33 ejercicios');
  });

  it('una pestaña de dieta se reconoce como tal, con lo que trae', () => {
    /* Es lo que hace posible subir el libro entero de una vez: sin decir cuál es
       la dieta, elegirla obligaría a abrir las quince pestañas a mano. */
    expect(html).toContain('3 comidas · 69 alimentos');
  });

  it('una hoja oculta se ofrece igual, diciendo que lo está', () => {
    /* En un libro real nueve de quince están ocultas, y una se llama «Plan de
       Entrenamiento». Esconderlas aquí también dejaría sin forma de traerla. */
    expect(html).toContain('Plan viejo');
    expect(html).toContain('oculta en Excel');
  });

  it('deja marcar varias, y no deja marcar las que no traen nada', () => {
    /* Tres marcadas y la vacía deshabilitada. */
    expect(html.match(/checked=""/g)).toHaveLength(3);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});

/* ══ La dieta ══════════════════════════════════════════════════════════════ */

const BIBLIOTECA = [
  { id: 'f1', name: 'Avena', proteinPer100: 13, carbsPer100: 60, fatsPer100: 7 },
  { id: 'f2', name: 'Plátano', proteinPer100: 1, carbsPer100: 21, fatsPer100: 0, unitLabel: 'unidad', unitGrams: 120 },
  { id: 'f3', name: 'Leche semidesnatada', proteinPer100: 3, carbsPer100: 5, fatsPer100: 2 },
  { id: 'f4', name: 'Garbanzos (crudos)', proteinPer100: 19, carbsPer100: 55, fatsPer100: 6 },
  { id: 'f5', name: 'Garbanzos (cocidos)', proteinPer100: 8, carbsPer100: 20, fatsPer100: 3 },
];

const planDe = (fichero) => asPlan(parseDietSheet(hoja(fichero)));

const pintarDieta = (variants, props = {}) =>
  renderToString(
    <DietPreview
      variants={variants}
      onSetVariant={() => {}}
      onRenameMeal={() => {}}
      onRemoveMeal={() => {}}
      onRemoveFood={() => {}}
      {...props}
    />
  ).replaceAll('<!-- -->', '');

describe('DietPreview', () => {
  const variants = toEditableDiet(planDe('dieta-low.tsv'));

  it('pinta cada comida con su nombre editable y su objetivo', () => {
    const html = pintarDieta(variants);
    expect(html).toContain('value="COMIDA 1"');
    expect(html).toContain('Comida 1 de 3');
    expect(html).toContain('600 kcal · 25 P · 90 H · 15 G');
  });

  it('cada opción enseña sus alimentos con la cantidad que decía la hoja', () => {
    const html = pintarDieta(variants);
    expect(html).toContain('Avena');
    expect(html).toContain('100 g');
    /* Los mililitros no se convierten a la fuerza: se dicen como venían. */
    expect(html).toContain('400 ml');
    /* Y las piezas, en piezas: «1 ud» y no «100 g». */
    expect(html).toContain('1 ud');
  });

  it('la nota de la comida viaja hasta la revisión', () => {
    expect(pintarDieta(variants)).toContain('5g grasa 15 prote');
  });

  it('con dos dietas pregunta cuál es cuál, y con una no pregunta nada', () => {
    /* «Low» y «High» son hidratos, no días: la equivalencia se propone y se
       enseña. Con una sola dieta y un cliente sin variantes esa pregunta no
       existe. */
    const dos = [...variants, { ...variants[0], id: 'otra', label: 'Día High', variant: 'training' }];
    expect(pintarDieta(dos)).toContain('Días de entreno');
    expect(pintarDieta(variants)).not.toContain('Días de entreno');
  });

  it('si el CLIENTE ya tiene dos dietas, pregunta a cuál va —y ofrece las dos', () => {
    /* Sin esto, subir una dieta sola a alguien con entreno y descanso la metía
       en un día a dedo y el otro se quedaba como estaba sin decir nada. */
    const html = pintarDieta(variants, { preguntarVariante: true });
    expect(html).toContain('Días de entreno');
    expect(html).toContain('Días de descanso');
    expect(html).toContain('Las dos');
  });

  it('todo lo que se puede quitar tiene su botón', () => {
    const html = pintarDieta(variants);
    expect(html.match(/Quitar comida/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Quitar Avena"');
  });

  it('sin variantes no pinta nada, y no revienta', () => {
    expect(pintarDieta([])).toBe('');
  });
});

describe('FoodMatchList', () => {
  const plan = planDe('dieta-low.tsv');
  const encontrados = matchFoodNames(foodNames(plan.variants), BIBLIOTECA);
  const pendientes = pendingMatches(encontrados);
  const valores = Object.fromEntries(
    [...encontrados].map(([clave, m]) => [
      clave,
      { name: m.name, unitLabel: m.unitLabel, food: m.food, texto: m.food?.name ?? '', macros: {} },
    ])
  );

  const html = renderToString(
    <FoodMatchList pendientes={pendientes} foods={BIBLIOTECA} valores={valores} onChange={() => {}} />
  ).replaceAll('<!-- -->', '');

  it('pregunta por los que encajan con varios, con la propuesta puesta', () => {
    /* El caso que da nombre a todo esto: entre los garbanzos crudos y los
       cocidos hay 150 kcal por cada 100 g, y la hoja no dice cuáles son. */
    expect(html).toContain('Garbanzos');
    expect(html).toContain('Encaja con 2 alimentos');
    expect(html).toContain('value="Garbanzos (crudos)"');
  });

  it('los que no están se pueden escribir, con sus macros', () => {
    expect(html).toContain('Papilla de bebé');
    expect(html).toContain('No lo tengo');
    expect(html).toContain('P /100g');
  });

  it('no pregunta por los que ha reconocido sin dudar', () => {
    /* «Avena» está tal cual en la biblioteca: preguntarlo sería trabajo
       inventado, y con cuarenta alimentos la lista dejaría de leerse. */
    const nombres = pendientes.map((p) => p.name);
    expect(nombres).not.toContain('Avena');
    expect(nombres).toContain('Papilla de bebé');
  });
});

describe('lo que se guarda es lo que se ha revisado', () => {
  const plan = planDe('dieta-low.tsv');
  const variants = toEditableDiet(plan);
  const encontrados = matchFoodNames(foodNames(plan.variants), BIBLIOTECA);
  const valores = Object.fromEntries(
    [...encontrados].map(([clave, m]) => [
      clave,
      { name: m.name, unitLabel: m.unitLabel, food: m.food, texto: '', macros: {} },
    ])
  );

  const guardado = aPlanDeDieta(variants, resolverCon(valores), plan);
  const primera = guardado.variants[0].meals[0];

  it('los gramos de la hoja llegan tal cual', () => {
    expect(primera.options[0].foods[0].name).toBe('Avena');
    expect(primera.options[0].foods[0].grams).toBe(100);
  });

  it('las piezas se convierten con lo que pesa una, no con cien gramos', () => {
    /* «1 ud» de plátano son 120 g porque la biblioteca dice lo que pesa uno.
       Sin esto, la comida entera sale con las calorías de un plátano y cuarto. */
    const platano = primera.options[0].foods.find((f) => f.name === 'Plátano');
    expect(platano.grams).toBe(120);
    expect(platano.showAs).toBe('units');
  });

  it('un alimento que no se ha resuelto entra igual, sin inventarle macros', () => {
    /* Entra a cero y se ve: es la diferencia entre una dieta a la que le falta
       un dato y una dieta que miente. */
    const papilla = guardado.variants[0].meals[0].options[2].foods[0];
    expect(papilla.name).toBe('Papilla de bebé');
    expect(papilla.proteinPer100).toBe(0);
  });

  it('el objetivo de cada comida llega con ella', () => {
    expect(primera.target).toEqual({ kcals: 600, protein: 25, carbs: 90, fats: 15 });
  });

  it('«las dos» monta las comidas dos veces, no la misma lista compartida', () => {
    /* Compartir los objetos haría que editar la cena del día de entreno cambiara
       también la del de descanso, que es un fallo imposible de explicar. */
    const aLasDos = aPlanDeDieta(
      [{ ...variants[0], variant: 'both' }],
      resolverCon(valores),
      plan
    );
    expect(aLasDos.variants.map((v) => v.variant)).toEqual(['training', 'rest']);
    expect(aLasDos.variants[0].meals[0].id).not.toBe(aLasDos.variants[1].meals[0].id);
    expect(aLasDos.variants[0].meals[0].options[0].foods[0].id).not.toBe(
      aLasDos.variants[1].meals[0].options[0].foods[0].id
    );
  });

  it('cada comida y cada alimento nacen con identidad propia', () => {
    const ids = guardado.variants
      .flatMap((v) => v.meals)
      .flatMap((m) => [m.id, ...m.options.flatMap((o) => [o.id, ...o.foods.map((f) => f.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * ══ Por qué esto se prueba ═════════════════════════════════════════════════
 *
 * Porque es el único sitio de la importación donde el acierto ES la frase. Un
 * `.xls` no reventaba: se leía como texto, salía ruido binario y el aviso
 * hablaba de filas de cabecera. La prueba fija que cada caso diga lo suyo, y
 * sobre todo que `.xlsx` —que termina en `xls` más una equis— no acabe nunca
 * en el mensaje del formato viejo.
 */
describe('porQueNoSeLee', () => {
  it('deja pasar lo que sabe abrir', () => {
    const buenos = ['rutina.xlsx', 'RUTINA.XLSX', 'plan.docx', 'plan.csv', 'plan.tsv', 'dieta.pdf', 'a.txt'];
    for (const nombre of buenos) expect(porQueNoSeLee(nombre)).toBe(null);
  });

  it('a los formatos de antes de 2007 les dice qué hacer, no que no funcionan', () => {
    /* Y cada uno con SU programa: mandar a Word a quien trae un .xls es un
       consejo que no se puede seguir. */
    expect(porQueNoSeLee('rutina.xls')).toContain('.xlsx');
    expect(porQueNoSeLee('rutina.xls')).toContain('Excel');
    expect(porQueNoSeLee('dieta.doc')).toContain('.docx');
    expect(porQueNoSeLee('dieta.doc')).toContain('Word');
  });

  it('reconoce las hojas y documentos de los otros programas', () => {
    expect(porQueNoSeLee('plan.numbers')).toContain('Expórtalo');
    expect(porQueNoSeLee('plan.pages')).toContain('Expórtalo');
    expect(porQueNoSeLee('plan.ods')).toContain('Expórtalo');
  });

  it('y de lo demás dice qué sí vale', () => {
    expect(porQueNoSeLee('foto.png')).toContain('un Excel, un Word, un PDF');
    expect(porQueNoSeLee('rutina')).toContain('un Excel, un Word, un PDF');
  });

  it('los formatos viejos entran en el selector: se eligen y se explican, en vez de salir en gris', () => {
    expect(ACCEPT).toContain('.xls,');
    expect(ACCEPT).toContain('.doc,');
    expect(ACCEPT).toContain('.docx,');
  });
});
