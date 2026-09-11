/**
 * Equivalencias de alimentos: cambiar uno por otro de su grupo sin descuadrar.
 *
 * ══ Qué es una equivalencia aquí ═══════════════════════════════════════════
 *
 * La de toda la vida en consulta: «150 g de plátano ≈ 250 g de fresas». Cada
 * grupo de alimentos tiene UN macro que lo define —la fruta son hidratos, la
 * carne es proteína, el aceite es grasa— y dos alimentos del mismo grupo son
 * equivalentes cuando aportan los mismos gramos de ESE macro. La cuenta es una
 * regla de tres sobre los macros por 100 g que la dieta ya guarda:
 *
 *     gramos_B = gramos_A × macroPor100_A / macroPor100_B
 *
 * ══ Igualar el macro CLAVADO descuadraba el día ════════════════════════════
 *
 * Esa regla de tres da el macro exacto y deja las kcal donde caigan, y ahí es
 * donde se rompía: 500 g de leche (17 g de proteína, 232 kcal) proponían queso
 * curado a +29 kcal, mozzarella a −45 y queso de untar a +55. Cada cambio suelto
 * parece inofensivo; dos seguidos mueven el día cien calorías, y el cliente que
 * los usa no tiene forma de saberlo.
 *
 * Nadie necesita 17,0 g de proteína: necesita ESA proteína sin que el día se le
 * vaya. Así que la ración no se clava al macro, se BUSCA — dentro de un margen
 * del 10 % sobre el macro del grupo— la que menos se desvía de las dos cosas a
 * la vez, con el macro pesando el doble que las kcal. El macro sigue mandando;
 * lo que se hace es gastar su holgura en cuadrar las calorías.
 *
 * Lo que quede de diferencia se enseña: no se puede igualar todo a la vez, y
 * esa diferencia es información, no un error.
 *
 * ══ De dónde sale el grupo de un alimento ══════════════════════════════════
 *
 * Del catálogo común, que es el único sitio con categorías. La entrada de una
 * dieta es una foto sin categoría, así que se resuelve POR NOMBRE con
 * `matchFood`, el mismo comparador que ya ata los nombres de una hoja
 * importada: «Plátano mediano» cae en el plátano y por tanto en la fruta. Si el
 * nombre no cae en ningún alimento del catálogo, no hay equivalencias — mejor
 * ninguna que las de un grupo adivinado.
 *
 * ══ El macro lo decide el GRUPO, no el alimento ════════════════════════════
 *
 * Se probó derivarlo de cada alimento (el macro que más kcal aporta) y rompe
 * los lácteos: la leche entera es «de grasas» y la desnatada «de hidratos», así
 * que dejarían de ser intercambiables entre sí, que es absurdo. El grupo dice
 * qué papel juega el alimento en la dieta, y ese papel es el que se conserva.
 *
 * ══ El filtro de cordura por kcal ══════════════════════════════════════════
 *
 * Igualar un solo macro puede disparar los otros dos: 150 g de plátano y el
 * aguacate comparten grupo, pero igualar sus hidratos son ~350 g de aguacate y
 * el cuádruple de kcal. Una equivalencia que multiplica las calorías no es una
 * equivalencia, así que lo que se sale del margen no se ofrece.
 *
 * ══ Y el filtro de cordura por NOMBRE ══════════════════════════════════════
 *
 * El otro despropósito no era de cuentas sino de catálogo: «Arroz blanco»
 * ofrecía «Arroz blanco (crudo)» y «Arroz blanco (cocido)», y «Huevo entero
 * fresco», otros cuatro huevos. Cambiar un alimento por sí mismo no es un
 * intercambio, aunque los gramos cuadren clavados —y con el arroz cocido lo que
 * salía era la conversión de peso al cocerlo, que es otra cosa—. Así que el
 * alimento de partida no se ofrece a sí mismo bajo ningún nombre, y los
 * candidatos que son el mismo alimento se juntan en una fila.
 *
 * **Pero el nombre no basta para decidirlo, y creerlo costaba lo contrario:**
 * «Mayonesa» perdía la mayonesa light y «Pasta (cruda)» la integral, que son
 * los intercambios que esas dos filas tienen. Por el nombre solo se sabe que
 * los nombra el mismo sustantivo; si la palabra de más cambia el alimento lo
 * dice la DENSIDAD del macro que se conserva, que es lo que el intercambio
 * mira y ya está en la tabla. Eso es `laMismaFila`, y se aplica con la misma
 * vara a la fuente y a los candidatos.
 */

import { norm } from '@/lib/texto';
import { toNum0 } from '@/lib/num';
import { diceLoMismo, estadoDe, matchFood, mismoAlimento } from './foodMatch';
import { foodMacros, hasUnits, unitsLabel } from './nutrition';

/**
 * El macro que define cada grupo del catálogo (las categorías de la 0033).
 *
 * «Otros» no está a propósito: es el cajón de lo que no tiene grupo, y ofrecer
 * intercambios dentro de él sería equiparar cosas que solo comparten no tener
 * sitio. Los dulces sí: se prescriben como hidratos (el arroz inflado, la
 * mermelada) y cambiarlos entre sí por hidratos es exactamente lo que se hace.
 */
export const SWAP_MACRO = {
  Carne: 'protein',
  Pescado: 'protein',
  Huevos: 'protein',
  Lácteos: 'protein',
  Suplementos: 'protein',
  Fruta: 'carbs',
  Verdura: 'carbs',
  Cereales: 'carbs',
  Legumbres: 'carbs',
  Tubérculos: 'carbs',
  Dulces: 'carbs',
  'Frutos secos': 'fats',
  Grasas: 'fats',
};

const PER100 = { protein: 'proteinPer100', carbs: 'carbsPer100', fats: 'fatsPer100' };

/**
 * Por debajo de esto, el alimento apenas lleva el macro del grupo y la regla de
 * tres dispara raciones absurdas: igualar por hidratos contra la lechuga
 * (1,5 g/100 g) propone medio kilo de lechuga. Un alimento así no es un
 * intercambio del grupo aunque viva en él.
 */
const MIN_PER100 = 2;

/**
 * El margen del filtro de kcal. En proporción para las raciones normales, y
 * absoluto para las minúsculas: entre verduras de 15 y 25 kcal la proporción
 * es un 66 % «de error» y la diferencia real es la mitad de una zanahoria.
 *
 * El absoluto es PEQUEÑO a propósito. Empezó en 60 kcal y con eso una ración
 * chica lo pasaba todo: 10 g de cacao (37 kcal) daban por buenas equivalencias
 * de 7 a 90 kcal — la pantalla entera de despropósitos. 15 kcal cubren el caso
 * de las verduras, que es para lo que existe, y nada más.
 */
const KCAL_RATIO = 1.2;
const KCAL_SLACK = 15;

/**
 * La holgura que se le da al macro del grupo para poder cuadrar las kcal, y
 * cuánto pesa cada cosa al buscar la ración.
 *
 * El 10 % es lo que una ración se desvía sola: la tabla de composición, la pieza
 * concreta, el redondeo a múltiplos de 5 g de la báscula. Gastarlo en acercar
 * las calorías no empeora el intercambio —el macro sigue dentro de su ruido— y
 * evita que dos cambios seguidos muevan el día.
 *
 * El macro pesa el doble porque es la RAZÓN del intercambio: cuando las dos
 * cosas no se pueden tener, se conserva el papel que el alimento juega en la
 * dieta y se cede en las kcal, no al revés.
 */
const MACRO_TOL = 0.1;
const PESO_MACRO = 1.5;
const PESO_KCAL = 1;

/**
 * Por debajo de esto no hay intercambio que hacer: 10 g de cacao llevan ~1 g de
 * hidratos, y «lo que iguala 1 g de hidratos» es cualquier miga de cualquier
 * cosa —0,7 galletas, 5 g de pizza—. Es una ración de CONDIMENTO, no una ración
 * del grupo, y la respuesta honesta es no ofrecer lista. El umbral son ~20 kcal
 * del macro: por debajo, la equivalencia importa menos que el redondeo.
 */
const MIN_MACRO_GRAMS = 5;

/* A un múltiplo de 5 g: «163 g de manzana» es una precisión que ninguna báscula
   de cocina se toma en serio, y el macro igualado se desvía menos de lo que ya
   se desvía la manzana de la tabla. */
const round5 = (grams) => Math.max(5, Math.round(grams / 5) * 5);

/**
 * Lo mal que cuadra una ración: cuánto se desvía del macro del grupo y de las
 * kcal, en proporción y al cuadrado —desviarse el doble molesta cuatro veces
 * más, que es como se siente— y con el macro pesando más.
 */
const desajuste = (macro, macroObjetivo, kcal, kcalObjetivo) =>
  PESO_MACRO * ((macro - macroObjetivo) / macroObjetivo) ** 2 +
  (kcalObjetivo > 0 ? PESO_KCAL * ((kcal - kcalObjetivo) / kcalObjetivo) ** 2 : 0);

/**
 * La ración que menos se desvía del macro del grupo Y de las kcal a la vez.
 *
 * Se prueban todas las raciones posibles: los múltiplos de 5 g —el paso de una
 * báscula de cocina— que quedan dentro del margen del macro, y gana la de menor
 * desajuste. Son unas pocas decenas de cuentas por candidato y así el resultado
 * es el mejor de verdad sobre los gramos que se pueden servir, no el óptimo
 * teórico redondeado —que no es lo mismo: para el queso curado, 65 g clava la
 * proteína pero se va +27 kcal, y 60 g pierde 1,5 g de proteína para quedarse
 * en +7. La segunda es mejor ración, y por cercanía en gramos habría perdido.
 *
 * Si el margen es más estrecho que el paso de la báscula —raciones minúsculas—,
 * manda el macro y las kcal caen donde caigan, que es lo que se hacía siempre.
 */
const racionEquilibrada = (macroPor100, kcalPor100, macroObjetivo, kcalObjetivo) => {
  const exacta = (macroObjetivo * 100) / macroPor100;
  if (!(kcalPor100 > 0) || !(kcalObjetivo > 0)) return round5(exacta);

  const min = Math.max(5, exacta * (1 - MACRO_TOL));
  const max = exacta * (1 + MACRO_TOL);

  let mejor = null;
  let mejorCoste = Infinity;
  for (let g = Math.ceil(min / 5) * 5; g <= max + 1e-9; g += 5) {
    const coste = desajuste((g * macroPor100) / 100, macroObjetivo, (g * kcalPor100) / 100, kcalObjetivo);
    if (coste < mejorCoste) {
      mejorCoste = coste;
      mejor = g;
    }
  }

  return mejor ?? round5(exacta);
};

/** El grupo de un nombre, resuelto contra el catálogo. `null` si no cae. */
export const foodCategory = (name, catalog = []) =>
  matchFood(name, catalog).food?.category ?? null;

/**
 * La ración de un equivalente, en las palabras del alimento.
 *
 * Si se cuenta en piezas, la pieza va delante y los gramos detrás entre
 * paréntesis —«1,5 manzanas (250 g)»—: es como se va a servir, y los gramos
 * quedan para quien pesa.
 *
 * Vivía dentro de la ventana de equivalencias. Sale aquí porque desde que la
 * lista también se lee DEBAJO del alimento, en la propia comida, la escribían
 * dos piezas — y dos formas de decir «250 g» son dos formas de leer la misma
 * dieta. `corta` deja la pieza sola («1,5 manzanas»), que es lo que cabe en la
 * columna de cantidad de la tabla.
 */
export const racionDe = ({ food, grams }, { corta = false } = {}) => {
  const pseudo = { grams, unitLabel: food?.unitLabel ?? null, unitGrams: food?.unitGrams ?? null };
  if (!hasUnits(pseudo)) return `${grams} g`;
  return corta ? unitsLabel(pseudo) : `${unitsLabel(pseudo)} (${grams} g)`;
};

/* ══ DE DÓNDE SALEN LOS CANDIDATOS ═════════════════════════════════════════

   Dos procedencias y una sola cuenta. Por defecto, los del catálogo que
   comparten familia —lo que hace esta pantalla desde que existe—; y si el
   alimento está en un GRUPO TUYO (`domain/gruposEquiv`), los que tú escribiste
   y ninguno más.

   ⚠️ Dos cosas se llaman «grupo» a un palmo de distancia y no son la misma: la
   FAMILIA del catálogo (`category`, la que decide el macro) y TU GRUPO (el
   criterio que guardaste con nombre). En el código son `category` y `grupo`; en
   la prosa de aquí abajo, «la familia» y «tu grupo». */

/** Tu biblioteca tapa al catálogo por nombre: los números son los tuyos. */
const tusNumeros = (library) => {
  const propios = new Map();
  for (const food of library) {
    const clave = norm(food?.name || '');
    if (clave && !propios.has(clave)) propios.set(clave, food);
  }
  return propios;
};

/**
 * Los del catálogo que comparten familia, con tus números si los tienes.
 *
 * Aquí solo se cae el nombre exacto. **Quién más es «el mismo alimento» no se
 * decide aquí sino abajo, con los macros delante** (`laMismaFila`): por el
 * nombre no se distingue la mayonesa de la mayonesa light, y por la densidad
 * sí —75 g de grasa por 100 contra 30—.
 */
const deLaFamilia = (category, yo, catalog, propios) => {
  const fuera = [];
  for (const candidato of catalog) {
    if (!category || candidato?.category !== category) continue;
    const clave = norm(candidato.name || '');
    if (!clave || clave === yo) continue;
    fuera.push(propios.get(clave) || candidato);
  }
  return fuera;
};

/**
 * Cuánto se pueden parecer dos filas y seguir siendo la misma.
 *
 * ══ Se mira la DENSIDAD, no la ración ══════════════════════════════════════
 *
 * Lo primero que se probó fue comparar las dos raciones —si mandan pesar lo
 * mismo, sobra una—, y no sirve: la ración sale de una regla de tres, de una
 * búsqueda dentro de la holgura del macro y de un redondeo a 5 g, y esas tres
 * cosas mueven los gramos por su cuenta. El mismo huevo con los datos de dos
 * tablas de composición (12,6 g de proteína y 9,5 de grasa contra 13 y 11)
 * pide pesar un 9 % menos; «Pasta integral (cruda)» frente a la pasta blanca
 * pide un 10 % más. Un 9 % que es el mismo alimento y un 10 % que es otro: por
 * ahí no se puede cortar, y cualquier umbral que tape el huevo tapa la pasta.
 *
 * Lo que sí los separa es la DENSIDAD del macro que se conserva —sus gramos
 * por 100 g—, que es lo que define el intercambio y no depende de la ración
 * que se tenga delante:
 *
 *     el mismo huevo                12,6 g  contra  13 g de proteína      3 %
 *     el pan de molde y el de barra   41 g  contra  40 g de hidratos      2 %
 *     la crema de cacahuete de marca  50 g  contra  49 g de grasa         2 %
 *     ────────────────────────────────────────────────────────────────────────
 *     la pasta y la integral          71 g  contra  64 g de hidratos     10 %
 *     la pechuga y el fiambre de pavo 22 g  contra  19 g de proteína     14 %
 *     la mayonesa y la light          75 g  contra  30 g de grasa        60 %
 *
 * El corte cae en el 8 %. Medida la diferencia de densidad de los 25 pares del
 * catálogo que llevan el mismo sustantivo, por debajo están los panes de molde
 * (2 %), el tomate triturado (2,5 %), el tofu firme (5 %) y la leche sin
 * lactosa (6 %) —escrituras del mismo dato—; por encima, la pasta integral
 * (10 %), el yogur desnatado y el de soja (12,5 %), el salmón ahumado (13 %) y
 * el fiambre de pavo (14 %), que son compras distintas. En medio queda un solo
 * par, las dos latas de sardinas (8,3 %), y se queda FUERA a propósito: cuando
 * la medida no decide, manda la ley de la casa —una fila de más se elige, una
 * fila de menos no se echa en falta—. Si de verdad sobra una lata, eso se
 * arregla en el catálogo y no apretando esta regla.
 *
 * Las kcal de la ración siguen mirándose, con el 10 % de siempre, como
 * cinturón: dos filas con la misma densidad del macro pero muy distintas en
 * todo lo demás —la misma proteína con el triple de grasa— no son la misma
 * fila por mucho que el macro coincida.
 */
const GEMELO_TOL = 0.08;
const GEMELO_KCAL_TOL = 0.1;

/* En absoluto para lo que apenas lleva del macro: entre 0,5 y 0,7 g por 100 la
   proporción es un 40 % y la diferencia real no existe. */
const GEMELO_SLACK = 1;

/**
 * Si dos filas valen por lo mismo: la misma densidad del macro que se conserva
 * y, de propina, unas kcal parecidas en la ración que proponen.
 */
const mismoPapel = (uno, otro) =>
  Math.abs(uno.per100 - otro.per100) <= Math.max(otro.per100 * GEMELO_TOL, GEMELO_SLACK) &&
  Math.abs(uno.kcal - otro.kcal) <= Math.max(otro.kcal * GEMELO_KCAL_TOL, KCAL_SLACK);

/**
 * Si dos filas de la lista son LA MISMA FILA, y no dos cosas entre las que
 * elegir.
 *
 * ══ Por qué el nombre no basta ═════════════════════════════════════════════
 *
 * Porque `mismoAlimento` contesta a otra pregunta. Contesta «¿lo nombra el
 * mismo sustantivo?», y con eso solo se sabe que «Huevo entero» y «Huevo L»
 * son el mismo huevo. Lo que NO se puede saber por el nombre es si la palabra
 * de más cambia el alimento: «light», «griego», «desnatado», «integral», «de
 * soja» y «proteico» son una palabra de más igual que «Hacendado», «fresco»,
 * «L» o «en lonchas» — y las primeras cambian los macros y las segundas no.
 * Con la poda decidida solo por el nombre, «Mayonesa» perdía la mayonesa light
 * —el único intercambio que de verdad tiene ahí— y «Pasta (cruda)» perdía la
 * integral.
 *
 * Distinguirlas con una lista de palabras es lo que este archivo lleva
 * evitando desde que existe, y con razón: la palabra que falte el día que el
 * catálogo crezca vuelve a colar el error. Pero no hace falta ninguna lista,
 * porque el dato ya lo dice y para cuando se comparan ya está calculado:
 *
 *   · **Los dos nombres dicen lo mismo** («Higo» y «Higos», «Arroz blanco» y
 *     «Arroz blanco (cocido)»): es la misma fila del catálogo escrita dos
 *     veces, o la conversión de peso al cocerla. Sobra, con números o sin
 *     ellos.
 *
 *   · **Uno dice una palabra más y propone LA MISMA RACIÓN**: esa palabra no
 *     cambia nada que se pueda pesar, así que la fila no añade una decisión,
 *     añade ruido. «Huevo entero fresco» y «Huevo L», 100 g y 104 g.
 *
 *   · **Uno dice una palabra más y propone OTRA RACIÓN**: ahí hay algo que
 *     elegir, y esconderlo es esconder el intercambio. 100 g de mayonesa son
 *     250 g de mayonesa light.
 *
 * Se exporta para poder AUDITARLA de una pieza: `foodEquivCatalogo.test.js`
 * la pasa por el catálogo entero y tiene escrito lo que tapa, porque una regla
 * que decide qué no se enseña no puede comprobarse mirando la pantalla.
 *
 * La regla del sustantivo sigue mandando en lo suyo —sin ella «clara de huevo»
 * y «yema de huevo» se compararían con el huevo entero, y son otro alimento
 * por mucho que la ración salga distinta—. Lo que cambia es que ya no decide
 * sola.
 */
export const laMismaFila = (uno, otro) =>
  diceLoMismo(uno.name, otro.name) ||
  (mismoAlimento(uno.name, otro.name) && mismoPapel(uno, otro));

/**
 * Una fila de la lista descrita como `laMismaFila` la quiere: el nombre, la
 * densidad del macro que se conserva y las kcal que propone.
 *
 * Sirve igual para un candidato ya calculado y para el alimento de partida, y
 * esa es la gracia: las dos puntas de la comparación se escriben aquí una sola
 * vez, así que no pueden mirarse cosas distintas.
 */
export const comoFila = (food, macro, kcal) => ({
  name: food?.name || '',
  per100: toNum0(food?.[PER100[macro]]),
  kcal: Math.round(kcal),
});

/**
 * Una fila por alimento: los gemelos se juntan y se queda el que mejor cuadra.
 *
 * El catálogo tiene «Huevo entero», «Huevo entero L» y «Huevos enteros
 * frescos»; «Tortita de arroz» y «Tortitas de arroz»; «Higo» y «Higos». En la
 * lista son la misma línea repetida: se lee como un error de la app, y elegir
 * entre ellas no es una decisión que nadie pueda tomar.
 *
 * Se juntan por dos caminos distintos, y la diferencia importa:
 *
 *   · Si los dos nombres DICEN LO MISMO, sobra el segundo sin más preguntas.
 *     Que «Higo» y «Higos» traigan números distintos es una incoherencia del
 *     catálogo, no dos alternativas.
 *
 *   · Si uno dice una palabra MÁS —«Mayonesa light», «Leche sin lactosa
 *     semidesnatada», «Yogur de soja natural»—, esa palabra suele cambiar lo
 *     que se compra, así que solo se juntan cuando además proponen la misma
 *     ración con las mismas kcal. Si difieren, la fila se queda: ahí sí hay
 *     algo que elegir.
 *
 * Como la lista llega ordenada por lo bien que cuadra, el que sobrevive es el
 * mejor del par. Con tus números por delante, además, el que sobrevive es el
 * tuyo: `deLaFamilia` ya sustituyó los del catálogo por los de tu biblioteca.
 *
 * Con una excepción: si el par solo se diferencia en el ESTADO, manda el del
 * alimento que tienes delante. «Lentejas (cocidas)» cuadra mejor con 75 g de
 * garbanzos crudos que con 150 g de cocidos —los crudos son más densos y el
 * redondeo les favorece—, y sin embargo la fila que sirve es la de los cocidos:
 * la dieta se está escribiendo en peso cocido.
 *
 * ══ Y aquí se cae también el alimento de partida ═══════════════════════════
 *
 * Cambiar un alimento por sí mismo no es un intercambio, aunque los gramos
 * cuadren clavados: «Arroz blanco» ofrecía «Arroz blanco (crudo)» y «Arroz
 * blanco (cocido)». Eso se descartaba antes, al elegir los candidatos, y por
 * el nombre a secas. Se hace ahora y con `laMismaFila` para que la fuente y
 * los candidatos se midan con la MISMA vara: dos varas distintas son «Mayonesa
 * light» tapada cuando parte de la mayonesa y ofrecida cuando parte del
 * aceite, que es la clase de incoherencia que nadie puede explicarse mirando
 * la pantalla.
 */
const sinGemelos = (items, macro, fuente) => {
  const estadoFuente = estadoDe(fuente.name);
  const comoEsta = (item) => comoFila(item.food, macro, item.kcal);
  const fuera = [];

  for (const item of items) {
    if (laMismaFila(comoEsta(item), fuente)) continue;

    const donde = fuera.findIndex((puesto) => laMismaFila(comoEsta(item), comoEsta(puesto)));

    if (donde < 0) {
      fuera.push(item);
      continue;
    }

    const puesto = fuera[donde];
    if (
      estadoFuente &&
      estadoDe(item.food.name) === estadoFuente &&
      estadoDe(puesto.food.name) !== estadoFuente
    ) {
      fuera[donde] = item;
    }
  }

  return fuera;
};

/**
 * Los alimentos de un grupo tuyo, resueltos por nombre.
 *
 * Un grupo guarda nombres y no números (ver `gruposEquiv`), así que aquí se
 * buscan: primero en tu biblioteca, luego en el catálogo. **El que no aparezca
 * en ninguno se cae de la lista**, y es lo correcto: sin macros por 100 g no
 * hay ración que calcular, e inventárselos sería exactamente lo que el catálogo
 * decidió no hacer con los alimentos que no conoce.
 */
const deTuGrupo = (nombres, yo, catalog, propios) => {
  const delCatalogo = new Map();
  for (const food of catalog) {
    const clave = norm(food?.name || '');
    if (clave && !delCatalogo.has(clave)) delCatalogo.set(clave, food);
  }

  const fuera = [];
  for (const nombre of nombres || []) {
    const clave = norm(nombre);
    if (!clave || clave === yo) continue;
    const food = propios.get(clave) || delCatalogo.get(clave);
    if (food) fuera.push(food);
  }
  return fuera;
};

/**
 * La ración de cada candidato, ya cuadrada, y ordenadas por lo bien que cuadran.
 *
 * `filtraKcal` es la cordura del apartado «El filtro de cordura por kcal»:
 * mismo macro pero el triple de kcal no es un intercambio. **Con un grupo tuyo
 * se apaga**, y ese es el sentido de tener grupos: si tú dices que la crema de
 * cacahuete vale por el aguacate, vale — la diferencia se escribe al lado, que
 * es lo que esta pantalla hace con todo lo que no se puede igualar a la vez.
 */
const raciones = ({ candidatos, macro, macroGrams, srcKcal, filtraKcal = true }) => {
  const items = [];

  for (const efectivo of candidatos) {
    const suyo = toNum0(efectivo[PER100[macro]]);
    if (suyo < MIN_PER100) continue;

    const kcalPor100 = foodMacros({ ...efectivo, grams: 100 }).kcal;
    const cuanto = racionEquilibrada(suyo, kcalPor100, macroGrams, srcKcal);
    const kcal = foodMacros({ ...efectivo, grams: cuanto }).kcal;
    const suMacro = (cuanto * suyo) / 100;

    /* La cordura: mismo macro pero el triple de kcal no es un intercambio. */
    if (filtraKcal) {
      const ratio = srcKcal > 0 ? kcal / srcKcal : 1;
      if (Math.abs(kcal - srcKcal) > KCAL_SLACK && (ratio > KCAL_RATIO || ratio < 1 / KCAL_RATIO))
        continue;
    }

    /* Y la ración que iguala las KCAL clavadas: cuando ni gastando la holgura
       del macro se llega a cuadrarlas, el cliente puede elegir qué conservar. */
    const cuantoKcal = kcalPor100 > 0 ? round5((srcKcal * 100) / kcalPor100) : null;
    items.push({
      food: efectivo,
      grams: cuanto,
      kcal: Math.round(kcal),
      kcalDiff: Math.round(kcal - srcKcal),
      macroGrams: Math.round(suMacro),
      /* La diferencia, sobre los gramos YA REDONDEADOS: en pantalla se leen los
         dos —«15 g de proteína −2» debajo de «17 g de proteína» en la cabecera—
         y una diferencia calculada sobre los decimales no cuadra con la resta
         que hace quien la mira. */
      macroDiff: Math.round(suMacro) - Math.round(macroGrams),
      gramsKcal:
        cuantoKcal !== null && cuantoKcal !== cuanto && Math.abs(kcal - srcKcal) > srcKcal * 0.1
          ? cuantoKcal
          : null,
    });
  }

  /* Primero las que mejor cuadran las dos cosas —con el mismo peso con el que se
     eligió la ración—, que son las que de verdad se cambian sin pensar. Las del
     borde del margen quedan al final, a la vista pero lejos. */
  items.sort(
    (a, b) =>
      desajuste(a.macroGrams, macroGrams, a.kcal, srcKcal) -
      desajuste(b.macroGrams, macroGrams, b.kcal, srcKcal)
  );

  return items;
};

/**
 * Lo que hace falta para calcular una ración: el macro que se conserva y cuánto
 * de él lleva lo que tienes delante. `null` cuando no hay con qué.
 *
 * Los dos suelos son de aritmética y no de criterio, así que **un grupo tuyo
 * tampoco los levanta**: por debajo de 2 g por 100 la regla de tres dispara
 * raciones absurdas, y por debajo de 5 g del macro no hay intercambio que hacer
 * —es una ración de condimento—.
 */
const puntoDePartida = (entry, catalog, grupo) => {
  const grams = toNum0(entry?.grams);
  if (!grams || !entry?.name) return null;

  /* Con grupo tuyo, el macro lo dice el grupo y la familia del catálogo deja de
     pintar nada: tu grupo puede cruzar familias —pechuga y claras de huevo— y
     lo que comparten es el PAPEL en la dieta, que es lo que tú escribiste. */
  const category = grupo ? null : foodCategory(entry.name, catalog);
  const macro = grupo ? grupo.macro : SWAP_MACRO[category];
  if (!macro) return null;

  const per100 = toNum0(entry[PER100[macro]]);
  if (per100 < MIN_PER100) return null;

  const macroGrams = (grams * per100) / 100;
  if (macroGrams < MIN_MACRO_GRAMS) return null;

  return { category, macro, macroGrams, srcKcal: foodMacros(entry).kcal };
};

/**
 * Las equivalencias de una entrada de la dieta.
 *
 * @param entry    La entrada tal como vive en la comida (nombre, gramos y
 *                 macros por 100 g).
 * @param catalog  El catálogo común, que aporta familias y candidatos.
 * @param library  La biblioteca del equipo. Manda sobre el catálogo cuando el
 *                 nombre se repite —la misma regla que `mergeCatalog`—: si el
 *                 entrenador ajustó los macros de «Manzana» a su marca, la
 *                 equivalencia se calcula con SUS números, no con los genéricos.
 * @param grupo    Tu grupo, si este alimento está en uno (`grupoDe`). Manda: la
 *                 lista son los que escribiste y ninguno más, entera y sin el
 *                 filtro de cordura. Sin grupo, todo se comporta como antes.
 * @returns `{ macro, category, grupo, macroGrams, items }` o `null` si no hay
 *   familia, cantidad o densidad con los que calcular. Cada item es
 *   `{ food, grams, kcal, kcalDiff, macroGrams, macroDiff, gramsKcal }` con los
 *   gramos ya redondeados y las dos diferencias contra la ración de origen.
 */
export const equivalencesFor = (
  entry,
  catalog = [],
  library = [],
  { max = 12, grupo = null } = {}
) => {
  const punto = puntoDePartida(entry, catalog, grupo);
  if (!punto) return null;

  const { category, macro, macroGrams, srcKcal } = punto;
  const propios = tusNumeros(library);
  const yo = norm(entry.name);

  const calculadas = raciones({
    candidatos: grupo
      ? deTuGrupo(grupo.foods, yo, catalog, propios)
      : deLaFamilia(category, yo, catalog, propios),
    macro,
    macroGrams,
    srcKcal,
    filtraKcal: !grupo,
  });

  /* Los gemelos se juntan solo en la lista que calcula la app. Un grupo tuyo se
     enseña tal como lo escribiste: si metiste dos huevos parecidos, tus razones
     tendrás —igual que el filtro de cordura, que ahí tampoco corre—. */
  const items = grupo
    ? calculadas
    : sinGemelos(calculadas, macro, comoFila(entry, macro, srcKcal));

  if (items.length === 0) return null;

  return {
    macro,
    category,
    grupo: grupo ? { id: grupo.id, name: grupo.name } : null,
    macroGrams: Math.round(macroGrams),
    /* El tope es del catálogo, que ofrece treinta y de los que se leen tres. Un
       grupo tuyo lo escribiste entero: cortarlo por la mitad sería enseñarte
       otra cosa de la que guardaste. */
    items: grupo ? items : items.slice(0, max),
  };
};

/**
 * La lista larga, la de MARCAR: todo lo que se le parece a este alimento.
 *
 * Es lo que se ve montando un grupo, y por eso es más ancha que la de consulta:
 * sale la familia entera del catálogo **sin el filtro de cordura por kcal y sin
 * juntar los gemelos** —descartar por ti lo que estás decidiendo sería
 * decidirlo— y sin tope, más lo que ya esté en el grupo aunque viva en otra
 * familia. Aquí sí salen «Huevo entero L» y «Huevos enteros frescos»: si tu
 * cliente compra los L, ese es el que quieres en tu grupo.
 *
 * @param incluir  Nombres que tienen que salir sí o sí (los del grupo que se
 *                 está editando).
 * @param macro    El macro que se conserva, cuando ya lo dice un grupo. Sin él
 *                 lo pone la familia del catálogo, como siempre.
 */
export const candidatosDeGrupo = (
  entry,
  catalog = [],
  library = [],
  { incluir = [], macro = null } = {}
) => {
  const punto = puntoDePartida(entry, catalog, macro ? { macro } : null);
  if (!punto) return null;

  const propios = tusNumeros(library);
  const yo = norm(entry.name);

  /* La familia primero y lo del grupo después, sin repetir: un miembro que
     además esté en la familia ya salió, y salir dos veces con dos casillas es
     una lista que no se puede marcar. */
  const candidatos = deLaFamilia(
    punto.category ?? foodCategory(entry.name, catalog),
    yo,
    catalog,
    propios
  );
  const vistos = new Set(candidatos.map((f) => norm(f?.name || '')));
  for (const food of deTuGrupo(incluir, yo, catalog, propios)) {
    const clave = norm(food?.name || '');
    if (clave && !vistos.has(clave)) {
      vistos.add(clave);
      candidatos.push(food);
    }
  }

  const items = raciones({
    candidatos,
    macro: punto.macro,
    macroGrams: punto.macroGrams,
    srcKcal: punto.srcKcal,
    filtraKcal: false,
  });
  if (items.length === 0) return null;

  return { macro: punto.macro, macroGrams: Math.round(punto.macroGrams), items };
};
