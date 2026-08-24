/**
 * Los nombres de una dieta importada, atados a los alimentos que ya existen.
 *
 * ══ Por qué esto es la mitad del problema ══════════════════════════════════
 *
 * Una hoja de dieta dice «Avena 100g» y no dice cuánta proteína tiene la avena:
 * eso lo sabe la biblioteca del entrenador y el catálogo común. Sin este paso,
 * una dieta importada es una lista de nombres con cero calorías — una pantalla
 * que suma 0 kcal donde el cliente esperaba 3000, que es peor que no importar.
 *
 * ══ Las tres respuestas, y por qué hay tres y no dos ═══════════════════════
 *
 *   SEGURO      El nombre es el mismo, o el de la hoja está contenido entero en
 *               uno solo de la biblioteca: «Crema Cacahuete» → «Crema de
 *               cacahuete». No hay nada que preguntar.
 *
 *   DUDOSO      Encaja con VARIOS: «Garbanzos» son los crudos y los cocidos, y
 *               entre unos y otros hay ciento cincuenta kilocalorías cada cien
 *               gramos. «Huevo» son tres entradas distintas. Aquí acertar por
 *               sorteo es exactamente lo que no se puede hacer: se propone el
 *               mejor y se enseñan los demás.
 *
 *   DESCONOCIDO «Papilla de bebé», «Cornflakes», «Hígado de ternera». No están,
 *               y no hay forma de inventarles los macros. Se preguntan una vez
 *               —por NOMBRE, no por cada vez que aparecen— y lo que se conteste
 *               se queda en la biblioteca para la siguiente dieta que entre.
 *
 * ══ Cómo se comparan dos nombres escritos por personas distintas ═══════════
 *
 * Sin tildes ni mayúsculas (`norm`), sin las palabras de relleno —«de», «la»,
 * «con»— y en singular, porque en una hoja se escribe «Manzanas» y en el
 * catálogo «Manzana». El singular se hace quitando la terminación, no con un
 * diccionario: como se aplica A LOS DOS LADOS, «nueces» y «Nueces» acaban en la
 * misma palabra aunque esa palabra no exista.
 */

import { norm } from '@/lib/texto';

/* Palabras que no distinguen un alimento de otro. «Natural» y «entero» NO están
   aquí a propósito: distinguen el yogur natural del de sabores y el huevo entero
   de la clara. */
const RELLENO = new Set(['de', 'del', 'la', 'lo', 'el', 'al', 'con', 'sin', 'en', 'tipo', 'para']);

/**
 * La raíz de una palabra: sin la «s» del plural y sin la «e» final.
 *
 * Lo segundo parece de más y es justo lo que hace que funcione: «tomates» sin la
 * «s» es «tomate», pero «dátiles» sin la «s» es «dátile» y el catálogo dice
 * «dátil». Quitando también la «e» los dos lados caen en la misma raíz —«tomat»,
 * «datil»— aunque ninguna de las dos sea una palabra. Como se aplica a la hoja y
 * al catálogo por igual, lo único que importa es que coincidan.
 */
const raiz = (palabra) => {
  const sinPlural = palabra.endsWith('s') ? palabra.slice(0, -1) : palabra;
  return sinPlural.length > 4 && sinPlural.endsWith('e') ? sinPlural.slice(0, -1) : sinPlural;
};

/**
 * Las abreviaturas que media profesión escribe y ningún catálogo lleva.
 *
 * Es una lista corta a propósito, y no el principio de un diccionario: son
 * palabras que NO son el nombre del alimento sino su apodo —«AOVE» no se parece
 * a «aceite de oliva» en ninguna letra— así que ninguna comparación por
 * parecido puede encontrarlas jamás. Lo que sí se parece pero no coincide se
 * queda donde debe, en la lista de lo que hay que revisar.
 */
const APODOS = new Map([
  ['aove', 'aceite de oliva virgen extra'],
  ['whey', 'proteína de suero'],
  ['cornflakes', 'cereales de maíz sin azúcar'],
  ['copos de avena', 'avena'],
  ['clara de huevo liquida', 'clara de huevo pasteurizada'],
]);

/**
 * Las palabras que de verdad nombran un alimento.
 *
 * Los paréntesis NO se tiran: «(crudo)» y «(cocido)» son la diferencia entre
 * 350 y 120 kilocalorías, y tirarlos convertiría dos entradas distintas en la
 * misma. Se quedan como una palabra más, que es lo que hace que «Garbanzos»
 * encaje con las dos y salga marcado como dudoso.
 */
export const tokens = (nombre) => {
  const limpio = norm(nombre).trim();
  return norm(APODOS.get(limpio) ?? limpio)
    .replace(/[()[\],.;:/+%]/g, ' ')
    .split(/\s+/)
    .map((p) => raiz(p.trim()))
    .filter((p) => p.length > 1 && !RELLENO.has(p));
};

/** La clave con la que dos nombres son «el mismo». */
export const claveDeAlimento = (nombre) => tokens(nombre).sort().join(' ');

/**
 * Con qué se identifica un nombre de la hoja de punta a punta.
 *
 * Es más flojo que `claveDeAlimento` a propósito: aquí no se trata de decidir
 * si dos nombres son el mismo alimento, sino de que la respuesta que se dé en
 * la revisión llegue a TODAS las apariciones de ese nombre. Se recorta y se
 * quitan tildes, porque «Avena» y «AVENA » son la misma celda escrita dos veces,
 * y nada más: dos nombres distintos son dos preguntas.
 *
 * Vive aquí y no en cada sitio para que la clave con la que se pregunta y la
 * clave con la que se aplica no puedan divergir nunca.
 */
export const claveDeNombre = (nombre) => norm(nombre).trim();

const contiene = (grandes, pequenos) => pequenos.every((p) => grandes.includes(p));

/**
 * El alimento de la biblioteca que corresponde a un nombre de la hoja.
 *
 * @returns `{ food, sure, candidates }`. `food` es la mejor propuesta y puede
 *   ser `null`; `candidates` son las otras que encajaban, para poder elegir.
 */
export const matchFood = (nombre, foods = []) => {
  const buscado = tokens(nombre);
  if (!buscado.length) return { food: null, sure: false, candidates: [] };

  const clave = buscado.slice().sort().join(' ');

  const exactos = [];
  const amplia = []; // el de la biblioteca dice MÁS: «Huevo» → «Huevo entero»
  const concreta = []; // el de la hoja dice más: «Plátano mediano» → «Plátano»
  const parciales = [];

  for (const food of foods) {
    if (!food?.name) continue;
    const suyos = tokens(food.name);
    if (!suyos.length) continue;

    if (suyos.slice().sort().join(' ') === clave) {
      exactos.push(food);
    } else if (contiene(suyos, buscado)) {
      amplia.push({ food, distancia: suyos.length - buscado.length });
    } else if (contiene(buscado, suyos)) {
      concreta.push({ food, distancia: buscado.length - suyos.length });
    } else {
      const comunes = buscado.filter((p) => suyos.includes(p)).length;
      if (!comunes) continue;
      /* Jaccard, y no «cuántas de las que busco están»: sin castigar las
         palabras que sobran, «Copos de avena» encaja igual de bien con «Avena»
         que con «Bebida de avena», y gana la que esté antes en la lista. */
      const score = comunes / (buscado.length + suyos.length - comunes);
      if (score >= 0.33) parciales.push({ food, score });
    }
  }

  /* Un nombre idéntico gana siempre, y si hay dos idénticos es que la biblioteca
     tiene dos y hay que preguntar cuál. */
  if (exactos.length === 1) return { food: exactos[0], sure: true, candidates: [] };
  if (exactos.length > 1) return { food: exactos[0], sure: false, candidates: exactos };

  if (amplia.length) {
    /* El que menos palabras añade es el más parecido: «Huevo» está antes en
       «Huevo entero» que en «Huevos enteros frescos». */
    amplia.sort((a, b) => a.distancia - b.distancia);
    const mejores = amplia.map((c) => c.food);
    return {
      food: mejores[0],
      sure: amplia.length === 1,
      candidates: amplia.length === 1 ? [] : mejores.slice(0, 6),
    };
  }

  /*
    ══ Lo de aquí abajo se PROPONE, no se da por bueno ═══════════════════════

    «Plátano mediano» solo puede ser el plátano, y «Tomate frito» no es el
    tomate —lleva aceite y azúcar— pero por forma son la misma cosa: el nombre
    de la hoja con una palabra de más. Distinguirlos no se puede, así que los
    dos salen en la lista de revisión con su propuesta puesta: aceptarla es no
    hacer nada y cambiarla es un clic. Dar por buena la del tomate en silencio
    sería meter una salsa donde había una hortaliza y no enterarse nunca.
  */
  const proponer = (lista) => ({
    food: lista[0].food,
    sure: false,
    candidates: lista.slice(0, 6).map((p) => p.food),
  });

  if (concreta.length) {
    concreta.sort((a, b) => a.distancia - b.distancia);
    return proponer(concreta);
  }
  if (parciales.length) {
    parciales.sort((a, b) => b.score - a.score);
    return proponer(parciales);
  }

  return { food: null, sure: false, candidates: [] };
};

/**
 * Todos los nombres de una vez, cada uno resuelto UNA sola vez.
 *
 * «Papilla de bebé» sale cinco veces en la misma hoja y es la misma pregunta las
 * cinco. Se agrupa por nombre normalizado, que es también la clave con la que
 * después se aplica la respuesta a todas sus apariciones.
 */
export const matchFoodNames = (nombres = [], foods = []) => {
  const salida = new Map();
  for (const entrada of nombres) {
    /* Acepta el nombre suelto y el alimento entero —con su unidad—, que es lo
       que entrega `foodNames`: así lo que se pregunta al final lleva pegado
       cómo venía escrito, sin tener que volver a buscarlo. */
    const datos = typeof entrada === 'string' ? { name: entrada } : entrada;
    const clave = claveDeNombre(datos.name);
    if (!clave || salida.has(clave)) continue;
    salida.set(clave, { ...datos, clave, ...matchFood(datos.name, foods) });
  }
  return salida;
};

/** Los que hay que revisar: los dudosos y los que no se han encontrado. */
export const pendingMatches = (matches) => [...matches.values()].filter((m) => !m.sure);
