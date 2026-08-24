/**
 * Una dieta escrita fuera de aquí, leída.
 *
 * ══ La tesis, la misma que en `routineSheet.js` ════════════════════════════
 *
 * No hay dos hojas de dieta iguales —ni siquiera dos formatos de fichero: hay
 * quien la monta en Excel y quien la escribe en un Word que exporta a PDF— y un
 * lector que las entienda todas no se termina nunca. Pero por debajo de la
 * maquetación solo hay **tres cosas que una dieta puede decir**, y las tres
 * aparecen siempre igual:
 *
 *   EL OBJETIVO      Kilocalorías y reparto de macros. «3000kcals · 140g P ·
 *                    452g H · 70g G», o «135g Proteína, 60g Grasas y 355g
 *                    Hidratos 2500kcal». Cambia el orden y cambian las palabras;
 *                    no cambia que cada cifra lleva pegada su etiqueta.
 *
 *   LAS COMIDAS      Un título («COMIDA 1», «DESAYUNO / PRE ENTRENO») y debajo
 *                    varias OPCIONES intercambiables, cada una con sus alimentos
 *                    y sus gramos. En una hoja las opciones son bloques de
 *                    columnas repetidos; en un PDF son párrafos seguidos.
 *
 *   LAS PAUTAS       Todo lo demás escrito en prosa: los pasos, el cardio, «pesa
 *                    siempre en crudo», la nota de una comida concreta.
 *
 * Y hay dos formas de dieta que hay que distinguir sin preguntar: **por macros**
 * —solo el objetivo, el cliente reparte— y **cerrada** —el menú entero—. La
 * diferencia es si se han encontrado comidas, y no lo que diga el título: una de
 * las hojas reales se titula «Plan Completo / Dieta Cerrada» y no trae ni una
 * comida, solo las cifras.
 *
 * ══ Lo que se propone y NUNCA se decide aquí ═══════════════════════════════
 *
 * **Los macros de cada alimento.** La hoja dice «Avena 100g» y no dice cuánta
 * proteína tiene la avena; eso lo pone la biblioteca (ver `foodMatch.js`). Lo
 * que no se reconoce se marca y se pregunta, porque un alimento importado con
 * cero macros es una comida que no suma y una dieta que miente en silencio.
 *
 * **Qué día es cuál.** Dos hojas «Día Low» y «Día High» son, casi siempre, el
 * día de descanso y el de entreno. Casi. Se propone y se enseña.
 */

import { toGrid, trimGrid, hasWords } from './sheet';
import { buildFoodEntry, buildMeal, buildOption } from './nutrition';
import { claveDeNombre } from './foodMatch';
import { norm } from '@/lib/texto';

/* ══ El vocabulario ════════════════════════════════════════════════════════
   En castellano y en inglés. Se compara contra la celda ENTERA salvo donde se
   diga: «COMIDA 1» y «Media mañana» son títulos de comida, pero «comida sana»
   dentro de una pauta no lo es, y por subcadena serían lo mismo. */

/** Abre una comida. Basta con que EMPIECE así: «DESAYUNO / PRE ENTRENO». */
const RE_COMIDA =
  /^(comida|desayuno|almuerzo|cena|merienda|media\s*ma[ñn]ana|media\s*tarde|snack|tentempi[eé]|recena|resopon|pre\s*-?\s*entreno|post\s*-?\s*entreno|intra\s*-?\s*entreno|batido|colaci[oó]n|toma|ingesta|meal|breakfast|lunch|dinner)\b/i;

/** Abre una alternativa dentro de una comida. */
const RE_OPCION = /^(opci[oó]n|opc\.?|men[uú]|option|alternativa|variante)\s*\d*\s*:?$/i;

/** La columna del nombre del alimento, cuando la hoja la rotula. */
const RE_ALIMENTO = /^(alimentos?|ingredientes?|productos?|food|item)$/i;

/** La columna de la cantidad. */
const RE_CANTIDAD = /^(gramos?|grs?|g|cantidad|cant\.?|peso|medida|raci[oó]n|porci[oó]n|qty|quantity|amount)$/i;

/** La columna —o el bloque— de notas. El emoji viene de las plantillas reales. */
const RE_NOTAS = /^(💡\s*)?(notas?|observaciones|comentarios?|indicaciones?|pautas?|notes?)\s*:?$/i;

/** Una fila de totales: es la que lleva el objetivo de la comida. */
const RE_TOTAL = /^(totales?|total|suma|resumen|objetivo|macros)\b/i;

/** Los pasos y el cardio, que se prescriben aparte del plato. */
const RE_PASOS = /^(pasos|steps|actividad|neat)\b/i;
const RE_CARDIO = /^(cardio|aer[oó]bico|conditioning)\b/i;

/** Una etiqueta suelta que solo anuncia lo que viene debajo. No es contenido. */
const RE_ETIQUETA = /^(macros?|dieta|men[uú]|plan|notas?|pautas?|indicaciones?|kcal|calor[ií]as?)\s*:?$/i;

/** El título del documento, que no es una pauta por mucho que sea la primera línea. */
const RE_TITULO_DOC = /^(plan|dieta|men[uú]|pauta)\b.*$/i;

/* ══ Cifras ════════════════════════════════════════════════════════════════ */

const numero = (v) => {
  const n = Number.parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Los macros que hay escritos en un texto, vengan en el orden que vengan.
 *
 * ══ Por qué se lee «número + unidad + etiqueta» y no cada macro por su lado ══
 *
 * Porque la unidad y una de las etiquetas son la MISMA LETRA. En «70g G» la
 * primera `g` son gramos y la segunda son grasas, y una expresión que busque
 * «un número seguido de g» encuentra las grasas en «140g P» —que es la
 * proteína— y las da por buenas. Leyendo la unidad y la etiqueta como dos
 * piezas distintas del mismo token, «140g P» solo puede ser proteína.
 *
 * ══ Y por qué exige dos etiquetas o kilocalorías ═══════════════════════════
 *
 * Porque `h` son hidratos y también es la hora: en una pauta real —«dejar sobre
 * 1:30-2h entre la cena y el irse a la cama»— hay un «2h» que leído solo diría
 * que esa dieta lleva dos gramos de hidratos. Con dos cifras encontradas eso no
 * pasa, y una línea de macros de verdad nunca trae una sola.
 */
export const macrosDeTexto = (texto) => {
  const out = { kcals: null, protein: null, carbs: null, fats: null };
  if (!texto) return null;

  const re =
    /(\d+(?:[.,]\d+)?)\s*(gramos|grs?|g)?\s*(?:de\s+)?(kilocalor[ií]as?|calor[ií]as?|kcals?|cals?|prote[ií]nas?|proteins?|prote|prot|p|hidratos(?:\s+de\s+carbono)?|carbohidratos?|carbohydrates?|carbos?|carbs?|hc|ch|h|grasas?|fats?|gr|g)\b/gi;

  let encontrados = 0;
  /* Cuánto del renglón es la propia cifra, y si alguna etiqueta venía escrita
     con todas sus letras. Los dos, para el caso de una sola cifra: ver el final
     de la función. */
  let cubierto = 0;
  let sinAbreviar = false;

  for (const m of String(texto).matchAll(re)) {
    const valor = numero(m[1]);
    const etiqueta = norm(m[3]);
    if (valor === null) continue;

    /*
      ══ Una «g» sola detrás de un número son gramos, no grasas ══════════════

      «70g G» son setenta gramos de grasa: la primera es la unidad y la segunda
      la etiqueta. Pero «Proteína: 135 g» trae una sola, y es la unidad — leerla
      como etiqueta convierte la proteína en grasa sin que nada lo diga. Así que
      la etiqueta `g` solo vale si el número ya traía SU unidad delante.
    */
    if (/^(g|gr)$/.test(etiqueta) && !m[2]) continue;

    /* La primera de cada clase gana: en «Total: 600 Kcal | 25g P …» lo que viene
       después son los macros de esa misma línea, pero en una hoja que repite el
       resumen dos veces la de arriba es la buena. */
    const clave = claveDeMacro(etiqueta);
    if (!clave) continue;
    if (out[clave] === null) out[clave] = valor;

    encontrados += 1;
    cubierto += m[0].length;
    if (!/^(p|h|g|gr|hc|ch)$/.test(etiqueta)) sinAbreviar = true;
  }

  /*
    Y la misma frase al revés: «Kcal: 2500», «Proteína 135 g». Va después porque
    la forma de arriba es más específica —lleva la unidad entre el número y la
    etiqueta— y porque solo se rellena lo que la primera no haya encontrado.
  */
  const alReves =
    /(kilocalor[ií]as?|calor[ií]as?|kcals?|prote[ií]nas?|proteins?|hidratos(?:\s+de\s+carbono)?|carbohidratos?|carbos?|carbs?|grasas?|fats?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:gramos|grs?|g)?\b/gi;

  for (const m of String(texto).matchAll(alReves)) {
    const valor = numero(m[2]);
    const clave = claveDeMacro(norm(m[1]));
    if (valor === null || !clave || out[clave] !== null) continue;
    out[clave] = valor;
    encontrados += 1;
    cubierto += m[0].length;
    sinAbreviar = true;
  }

  if (!encontrados) return null;
  const macros = [out.protein, out.carbs, out.fats].filter((v) => v !== null).length;
  if (out.kcals !== null || macros >= 2) return out;

  /*
    ══ Una sola cifra: cuándo vale y cuándo no ═══════════════════════════════

    Hay quien escribe el objetivo en cuatro renglones —«Proteína: 135 g»— y cada
    uno trae un macro solo. Rechazarlos deja la dieta sin objetivo; aceptarlos a
    ciegas convierte «come 40 gramos de proteína en cada comida» —una PAUTA— en
    el objetivo del día, y de paso se la come de las pautas.

    La diferencia es que el renglón de una cifra ES la cifra: la palabra escrita
    entera y casi nada más. Una frase que la menciona de pasada la lleva rodeada
    de texto.
  */
  const largo = String(texto).trim().length;
  return sinAbreviar && largo > 0 && cubierto / largo >= 0.6 ? out : null;
};

/**
 * Dos lecturas de macros, en una.
 *
 * ══ Por qué la primera no puede ganar entera ═══════════════════════════════
 *
 * Porque una hoja escribe el objetivo en cuatro renglones —«Kcal 2500»,
 * «Proteína 135»…— y cada uno por su cuenta es una lectura válida con tres
 * huecos. Quedándose con la primera que valga, la dieta entra con las
 * kilocalorías y sin un solo macro; y el resto de las cifras están ahí, escritas
 * en la línea de debajo. Se rellena lo que falte y no se pisa lo que ya haya:
 * quien lo dijo primero lo dijo mejor.
 */
const fundirMacros = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return {
    kcals: a.kcals ?? b.kcals,
    protein: a.protein ?? b.protein,
    carbs: a.carbs ?? b.carbs,
    fats: a.fats ?? b.fats,
  };
};

/** ¿Están las cuatro cifras? Lo que decide si hay que seguir buscando. */
const macrosCompletos = (m) =>
  Boolean(m) && [m.kcals, m.protein, m.carbs, m.fats].every((v) => v !== null && v !== undefined);

/** A cuál de los cuatro se refiere una etiqueta ya normalizada. */
const claveDeMacro = (etiqueta) => {
  if (/^(kilocalor|calor|kcal|cal)/.test(etiqueta)) return 'kcals';
  if (/^(prote|prot|p$)/.test(etiqueta)) return 'protein';
  if (/^(hidratos|carbohidrato|carbohydrate|carbo|carb|hc|ch|h$)/.test(etiqueta)) return 'carbs';
  if (/^(grasa|fat|gr$|g$)/.test(etiqueta)) return 'fats';
  return null;
};

/* Una celda que es SOLO el rótulo de un macro: «KCAL», «Proteína», «G». */
const RE_ROTULO_MACRO = /^(kcals?|kilocalor[ií]as?|calor[ií]as?|energ[ií]a|prote[ií]nas?|proteins?|prot\.?|p|hidratos(\s*de\s*carbono)?|carbohidratos?|carbos?|carbs?|hc|ch|h|grasas?|fats?|g)\s*:?$/i;

/** Un número suelto, con la unidad pegada si la lleva: «2500», «135 g». */
const soloNumero = (celda) => {
  const m = /^(\d+(?:[.,]\d+)?)\s*(gramos|grs?|g|kcals?|kilocalor[ií]as?)?\.?$/i.exec(
    String(celda ?? '').trim()
  );
  return m ? numero(m[1]) : null;
};

/**
 * Los macros escritos como TABLA: el rótulo en una celda y la cifra en otra.
 *
 * ══ Por qué hace falta además de `macrosDeTexto` ═══════════════════════════
 *
 * Porque en una hoja de cálculo lo normal es no escribir «140g P» en una celda,
 * sino poner los rótulos en una fila y las cifras debajo —o los rótulos en una
 * columna y las cifras al lado—:
 *
 *     KCAL │ PROTEÍNA │ HIDRATOS │ GRASAS        Kcal      │ 2500
 *     2500 │   135    │   355    │   60          Proteína  │  135
 *
 * Leyendo la fila entera de corrido, la primera dice «KCAL PROTEÍNA HIDRATOS
 * GRASAS» —ninguna cifra— y la segunda «2500 135 355 60» —ninguna etiqueta—, así
 * que ninguna de las dos parece una línea de macros y la dieta entra sin
 * objetivo. Es exactamente lo que pasaba: el diálogo decía «objetivo de macros»
 * porque había encontrado las pautas, y el objetivo no llegaba.
 *
 * Se mira a la derecha y debajo, en ese orden, y se exige lo mismo que siempre:
 * kilocalorías, o dos macros. Una «G» suelta con un número al lado no es una
 * dieta.
 */
const macrosPorRotulos = (grid, saltar = new Set()) => {
  const out = { kcals: null, protein: null, carbs: null, fats: null };
  let encontrados = 0;

  for (let r = 0; r < grid.length; r += 1) {
    if (saltar.has(r)) continue;
    const fila = grid[r];

    for (let c = 0; c < fila.length; c += 1) {
      if (!RE_ROTULO_MACRO.test(fila[c] || '')) continue;

      const clave = claveDeMacro(norm(fila[c].replace(/:$/, '')));
      if (!clave || out[clave] !== null) continue;

      const derecha = soloNumero(fila.slice(c + 1).find((v) => v !== ''));
      const abajo = soloNumero(grid[r + 1]?.[c]);
      const valor = derecha ?? abajo;
      if (valor === null) continue;

      out[clave] = valor;
      encontrados += 1;
    }
  }

  const macros = [out.protein, out.carbs, out.fats].filter((v) => v !== null).length;
  if (!encontrados || (out.kcals === null && macros < 2)) return null;
  return out;
};

/** «100g», «1ud», «400ml», «2 loncha». Lo que una hoja escribe en la columna de cantidad. */
const RE_CANTIDAD_VALOR =
  /^(\d+(?:[.,]\d+)?)\s*(kg|gramos|grs?|gr|g|ml|mL|cl|l|uds?|unidades?|unidad|piezas?|pieza|lonchas?|rebanadas?|cucharadas?|cucharaditas?|vasos?|latas?|puñados?|servicios?|scoops?)?\.?$/i;

/**
 * Una cantidad, en gramos si se puede saberlo.
 *
 * ── Los mililitros entran como gramos ───────────────────────────────────────
 * Y no es una aproximación cómoda: la leche, las claras y las bebidas vegetales
 * —que es donde aparece el mililitro en una dieta— rondan el gramo por
 * mililitro, y la alternativa sería no importar la mitad de los desayunos. Se
 * marca (`deMl`) para poder decirlo en la previsualización.
 *
 * ── Un número sin unidad son UNIDADES, no gramos ────────────────────────────
 * «2» en la columna de un huevo son dos huevos. Nadie escribe dos gramos de
 * huevo, y equivocarse hacia el gramo convierte un desayuno en nada.
 */
export const parseCantidad = (celda) => {
  const bruto = String(celda ?? '').trim();
  if (!bruto) return null;

  const m = RE_CANTIDAD_VALOR.exec(bruto);
  if (!m) return null;

  const valor = numero(m[1]);
  if (valor === null) return null;

  const unidad = norm(m[2] || '');

  if (/^(g|gr|grs|gramos)$/.test(unidad)) return { grams: valor };
  if (unidad === 'kg') return { grams: valor * 1000 };
  if (unidad === 'ml') return { grams: valor, deMl: true };
  if (unidad === 'cl') return { grams: valor * 10, deMl: true };
  if (unidad === 'l') return { grams: valor * 1000, deMl: true };
  if (!unidad || /^(ud|uds|unidad|unidades|pieza|piezas)$/.test(unidad)) return { units: valor };

  /* «2 loncha», «1 cucharada»: la unidad la nombra la hoja, y esa palabra es la
     que hay que conservar —es la etiqueta con la que el cliente lo va a leer—. */
  return { units: valor, unitLabel: bruto.replace(/^[\d.,\s]+/, '').replace(/s$/i, '').toLowerCase() };
};

const esCantidad = (v) => Boolean(parseCantidad(v));

/**
 * Una cantidad que DICE su unidad: «100g», «2ud», «400ml».
 *
 * ── Por qué no vale el número a secas cuando no hay cabecera ────────────────
 * Porque una hoja de RUTINA también es una columna de nombres con una columna
 * de números al lado —el ejercicio y sus series— y sin esta exigencia se lee
 * como una comida con cinco alimentos llamados «Press banca». Es un fallo
 * silencioso y de los caros: aparece una dieta que nadie ha escrito.
 *
 * Con cabecera de opciones («OPCIÓN 1 … GRAMOS») no hace falta: la hoja ya ha
 * dicho lo que es, y ahí un «2» suelto son dos huevos.
 */
const esCantidadConUnidad = (v) => /^\d+(?:[.,]\d+)?\s*[a-zA-Zñ]/.test(String(v || '').trim()) && esCantidad(v);

/* ══ La rejilla ════════════════════════════════════════════════════════════ */

/**
 * Quita las columnas vacías del todo y CONSERVA las filas vacías.
 *
 * `trimGrid` quita las dos cosas, y para una rutina está bien. Aquí no: una hoja
 * de dieta separa las comidas con filas en blanco, y esa fila en blanco es la
 * única frontera que hay cuando la hoja no rotula «COMIDA 1». Tirarla es
 * quedarse sin saber dónde acaba el desayuno.
 */
const recortarColumnas = (rows) => {
  if (!rows.length) return [];
  const ancho = Math.max(...rows.map((r) => r.length));
  const conContenido = [];
  for (let c = 0; c < ancho; c += 1) {
    if (rows.some((r) => (r[c] || '') !== '')) conContenido.push(c);
  }
  return rows.map((r) => conContenido.map((c) => (r[c] || '').trim()));
};

const filaVacia = (fila) => !fila.some((c) => c !== '');
const textoDeFila = (fila) => fila.filter((c) => c !== '').join(' ');
const primeraCelda = (fila) => fila.find((c) => c !== '') || '';

/* ══ Dónde está cada opción ════════════════════════════════════════════════ */

/**
 * El reparto en columnas de una fila de cabecera de opciones.
 *
 * Las dos plantillas reales lo dicen de dos maneras y las dos hay que
 * entenderlas:
 *
 *   OPCIÓN 1 │ ⌷ │ GRAMOS │ OPCIÓN 2 │ ⌷ │ GRAMOS │ …   ← todo en una fila
 *
 *   MENÚ 1   │ ⌷ │ ⌷      │ ⌷ │ MENÚ 2 │ …              ← y la cantidad, debajo
 *   ALIMENTO │ ⌷ │ GRAMOS │ ⌷ │ ALIMENTO │ …
 *
 * De ahí que la fila de cantidades se busque en la misma fila y, si no está, en
 * las dos de debajo. Y de ahí que el bloque de cada opción llegue hasta donde
 * empieza la siguiente: lo que haya en medio es suyo, se llame como se llame.
 */
const disposicionDesdeCabecera = (grid, fila) => {
  const cabecera = grid[fila] || [];
  const inicios = cabecera.map((c, i) => (RE_OPCION.test(c) ? i : -1)).filter((i) => i >= 0);
  if (inicios.length < 1) return null;

  /* La columna de notas corta el último bloque: sin esto, la nota de la comida
     —que vive a la derecha del todo— se leería como el nombre de un alimento de
     la última opción. */
  const notaCol = cabecera.findIndex((c) => RE_NOTAS.test(c));

  /* La fila que dice qué es cada columna dentro del bloque. Puede ser la misma
     cabecera (lleva ya los «GRAMOS») o una de las de debajo. */
  let filaColumnas = cabecera;
  if (!cabecera.some((c) => RE_CANTIDAD.test(c))) {
    for (let r = fila + 1; r <= fila + 2 && r < grid.length; r += 1) {
      if ((grid[r] || []).some((c) => RE_CANTIDAD.test(c))) {
        filaColumnas = grid[r];
        break;
      }
    }
  }

  const ancho = Math.max(cabecera.length, filaColumnas.length);
  const opciones = inicios.map((inicio, i) => {
    let fin = inicios[i + 1] ?? ancho;
    if (notaCol > inicio && notaCol < fin) fin = notaCol;

    /* El nombre va donde la fila de columnas diga «ALIMENTO», y si no lo dice,
       donde empieza el bloque: es lo que hacen las dos plantillas. */
    let colNombre = inicio;
    let colCantidad = -1;
    for (let c = inicio; c < fin; c += 1) {
      if (RE_ALIMENTO.test(filaColumnas[c] || '')) colNombre = c;
      if (colCantidad < 0 && RE_CANTIDAD.test(filaColumnas[c] || '')) colCantidad = c;
    }
    if (colCantidad < 0) colCantidad = Math.min(colNombre + 1, fin - 1);

    return { etiqueta: cabecera[inicio], inicio, fin, colNombre, colCantidad };
  });

  return { opciones, notaCol, filaColumnas: filaColumnas === cabecera ? fila : fila + 1 };
};

/**
 * El reparto deducido del CONTENIDO, para la hoja que no rotula sus opciones.
 *
 * Es la red de seguridad: una tabla de dos columnas —alimento y gramos— es una
 * dieta perfectamente válida y no tiene por qué llamar «OPCIÓN 1» a nada. Se
 * buscan las columnas que casi siempre traen cantidades y se les asigna la
 * columna de texto que tienen a la izquierda.
 */
const disposicionPorContenido = (rows) => {
  const ancho = Math.max(0, ...rows.map((r) => r.length));
  const opciones = [];

  for (let c = 1; c < ancho; c += 1) {
    const valores = rows.map((r) => r[c] || '').filter((v) => v !== '');
    if (valores.length < 3) continue;
    if (valores.filter(esCantidadConUnidad).length / valores.length < 0.7) continue;

    /* La columna del nombre es la primera con palabras a su izquierda. */
    let colNombre = -1;
    for (let n = c - 1; n >= 0; n -= 1) {
      const nombres = rows.map((r) => r[n] || '').filter((v) => v !== '');
      if (nombres.length && nombres.filter(hasWords).length / nombres.length >= 0.6) {
        colNombre = n;
        break;
      }
    }
    if (colNombre < 0) continue;
    if (opciones.some((o) => o.colNombre === colNombre)) continue;

    opciones.push({ etiqueta: null, inicio: colNombre, fin: c + 1, colNombre, colCantidad: c });
  }

  return opciones.length ? { opciones, notaCol: -1, filaColumnas: -1 } : null;
};

/* ══ Las comidas de una hoja ═══════════════════════════════════════════════ */

const esFilaDeComida = (fila) => {
  const celdas = fila.filter((c) => c !== '');
  if (celdas.length !== 1) return false;
  return RE_COMIDA.test(celdas[0]);
};

const nuevoAlimento = (name, cantidad, columna) => ({
  name,
  grams: cantidad?.grams ?? null,
  units: cantidad?.units ?? null,
  unitLabel: cantidad?.unitLabel ?? null,
  deMl: Boolean(cantidad?.deMl),
  /* Lo que la hoja ofrecía además de esto. Ver `alternativasDeLinea`. */
  alternatives: [],
  columna,
});

/**
 * Una hoja entera, en comidas.
 *
 * Recorre las filas una vez. La cabecera de opciones se HEREDA hacia abajo
 * porque las plantillas la repiten en cada comida pero no todas lo hacen, y una
 * comida sin cabecera propia es la misma tabla de la de arriba.
 */
const comidasDeRejilla = (grid) => {
  const comidas = [];
  const notasSueltas = [];
  let actual = null;

  /*
    ══ La deducción por contenido es el ÚLTIMO recurso, no el primero ═══════

    Se usaba siempre, y el resultado era que las filas de arriba de la hoja —el
    nombre del cliente, «Plan Medio», el peso corporal— entraban como los
    alimentos de una comida fantasma antes de llegar a la primera de verdad. Con
    una fila de «OPCIÓN 1 … OPCIÓN 5» en la hoja no hay nada que deducir: las
    columnas están dichas, y lo que quede fuera de ellas no es comida.
  */
  const hayCabeceras = grid.some((_, r) => disposicionDesdeCabecera(grid, r));
  let disposicion = hayCabeceras ? null : disposicionPorContenido(grid.filter((f) => !filaVacia(f)));
  const porContenido = !hayCabeceras;

  const abrirComida = (nombre) => {
    actual = { name: nombre, note: '', target: null, options: [] };
    comidas.push(actual);
  };

  const alimentosDe = (comida, i) => {
    while (comida.options.length <= i) comida.options.push({ foods: [] });
    return comida.options[i].foods;
  };

  for (let r = 0; r < grid.length; r += 1) {
    const fila = grid[r];
    if (filaVacia(fila)) continue;

    const nueva = disposicionDesdeCabecera(grid, r);
    if (nueva) {
      disposicion = nueva;
      continue;
    }
    /* La fila que solo dice ALIMENTO / GRAMOS ya se ha leído con su cabecera. */
    if (disposicion && r === disposicion.filaColumnas) continue;

    if (esFilaDeComida(fila)) {
      abrirComida(primeraCelda(fila));
      continue;
    }

    const texto = textoDeFila(fila);

    /* El resumen de la comida: es de donde sale su objetivo. */
    if (RE_TOTAL.test(primeraCelda(fila))) {
      const macros = macrosDeTexto(texto);
      if (macros && actual) actual.target = macros;
      continue;
    }

    if (RE_NOTAS.test(primeraCelda(fila)) || /^nota\s*:/i.test(primeraCelda(fila))) {
      const cuerpo = texto.replace(/^(💡\s*)?(notas?|observaciones|comentarios?)\s*:?\s*/i, '').trim();
      if (!cuerpo) continue;
      if (actual) actual.note = [actual.note, cuerpo].filter(Boolean).join('\n');
      else notasSueltas.push(cuerpo);
      continue;
    }

    if (!disposicion) continue;

    /* Lo que hay en la columna de notas es de la comida, no un alimento. */
    if (disposicion.notaCol >= 0) {
      const nota = fila[disposicion.notaCol] || '';
      if (nota && actual && !RE_NOTAS.test(nota)) {
        actual.note = [actual.note, nota].filter(Boolean).join('\n');
      }
    }

    let algo = false;
    disposicion.opciones.forEach((opcion, i) => {
      const name = (fila[opcion.colNombre] || '').trim();
      if (!hasWords(name) || RE_TOTAL.test(name) || RE_ETIQUETA.test(name)) return;

      const cantidad = parseCantidad(fila[opcion.colCantidad] || '');
      /* Sin cabecera que lo respalde, un nombre sin cantidad al lado no es un
         alimento: es el título de la hoja o el nombre del cliente. */
      if (porContenido && !cantidad) return;
      if (!actual) abrirComida(`Comida ${comidas.length + 1}`);
      alimentosDe(actual, i).push(nuevoAlimento(name, cantidad, opcion.etiqueta));
      algo = true;
    });

    /* Una fila con texto que no ha entrado por ninguna columna dentro de una
       comida es una pauta suya escrita a pelo. */
    if (!algo && actual && hasWords(texto) && !RE_ETIQUETA.test(texto)) {
      const macros = macrosDeTexto(texto);
      if (macros && !actual.target) actual.target = macros;
    }
  }

  return { comidas: comidas.filter((c) => c.options.some((o) => o.foods.length)), notasSueltas };
};

/* ══ El objetivo, los pasos y las pautas de la hoja ════════════════════════ */

/**
 * Lo que la hoja dice del día entero: cifras, actividad y pautas.
 *
 * Se busca en TODA la rejilla y no en una zona concreta porque no hay tal zona:
 * en una plantilla el objetivo está en la fila 10 y en otra al lado del peso
 * corporal. Lo que sí se puede afirmar es que la línea de macros de la hoja
 * lleva sus etiquetas pegadas, y eso se reconoce esté donde esté.
 */
const cabeceraDeRejilla = (grid, filasDeComida) => {
  let targets = null;
  let steps = '';
  let cardio = '';
  const notas = [];

  for (let r = 0; r < grid.length; r += 1) {
    if (filasDeComida.has(r)) continue;
    const fila = grid[r];
    if (filaVacia(fila)) continue;

    const texto = textoDeFila(fila);
    const primera = primeraCelda(fila);

    if (!macrosCompletos(targets) && !RE_TOTAL.test(primera)) {
      const macros = macrosDeTexto(texto);
      if (macros) {
        targets = fundirMacros(targets, macros);
        continue;
      }
    }

    /* «PASOS» como rótulo: lo que vale es la fila de debajo. Y «10k pasos
       aprox…» escrito de una vez: vale la fila entera. */
    if (RE_PASOS.test(primera)) {
      const propio = texto.replace(/^(pasos|steps|actividad|neat)\s*:?\s*/i, '').trim();
      if (propio) steps = steps || propio;
      else {
        const siguiente = grid.slice(r + 1, r + 4).find((f) => !filaVacia(f));
        if (siguiente) steps = steps || textoDeFila(siguiente);
      }
      continue;
    }
    if (RE_CARDIO.test(primera)) {
      const propio = texto.replace(/^(cardio|aer[oó]bico|conditioning)\s*:?\s*/i, '').trim();
      if (propio) cardio = cardio || propio;
      else {
        const siguiente = grid.slice(r + 1, r + 4).find((f) => !filaVacia(f));
        if (siguiente) cardio = cardio || textoDeFila(siguiente);
      }
      continue;
    }

    if (RE_NOTAS.test(primera)) {
      /* El rótulo «NOTAS» y, debajo, el párrafo. Puede estar en cualquier
         columna: se coge lo primero con texto de las filas siguientes. */
      for (let s = r + 1; s < Math.min(grid.length, r + 6); s += 1) {
        const cuerpo = textoDeFila(grid[s] || []);
        if (cuerpo && hasWords(cuerpo)) {
          notas.push(cuerpo);
          break;
        }
      }
    }
  }

  /* Y lo que siga faltando se busca por los rótulos, que es como se escribe el
     objetivo en una hoja de cálculo de verdad. */
  return {
    targets: macrosCompletos(targets)
      ? targets
      : fundirMacros(targets, macrosPorRotulos(grid, filasDeComida)),
    steps,
    cardio,
    notas,
  };
};

/* ══ La variante: entreno o descanso ═══════════════════════════════════════ */

/*
  Se exige la palabra ENTERA y en su forma de etiqueta: «entreno», «Día High»,
  «descanso». Sin eso, «Si entrenas algún día en un horario no habitual» —una
  pauta de una dieta real, en la primera página— marcaría el plan entero como el
  día de entrenar.
*/
const RE_ENTRENO = /\b(d[ií]as?\s*high|entrenos?|entrenamientos?|training|high\s*carb|high)\b/i;
const RE_DESCANSO = /\b(d[ií]as?\s*low|descansos?|rest\s*days?|low\s*carb|low)\b/i;

/**
 * Si la hoja dice a qué tipo de día pertenece, cuál es y con qué palabra lo dice.
 *
 * «Día Low» y «Día High» son la forma más común de escribirlo y **no dicen
 * entreno ni descanso**: dicen hidratos. La equivalencia —alto el día que
 * entrenas, bajo el que no— es la práctica habitual y aquí se propone como tal,
 * marcada y con la palabra que la ha hecho pensarlo, para que se pueda cambiar
 * antes de crear nada. Acertar en silencio y equivocarse en silencio se parecen
 * demasiado.
 */
export const varianteDeTexto = (texto) => {
  const t = String(texto || '');
  const descanso = RE_DESCANSO.exec(t);
  if (descanso) return { variant: 'rest', label: descanso[0] };
  const entreno = RE_ENTRENO.exec(t);
  if (entreno) return { variant: 'training', label: entreno[0] };
  return { variant: null, label: null };
};

/* ══ Modo texto: la dieta escrita, no tabulada ════════════════════════════ */

/** «- 100g Copos de avena» → la línea sin su viñeta. */
const sinVinieta = (linea) => String(linea).replace(/^[\s\-–—•*·]+/, '').trim();

/**
 * Los alimentos que hay en una línea escrita.
 *
 * ── Tres cosas caben en un renglón, y las tres pasan ────────────────────────
 *
 *   «100g Copos de avena»                        un alimento
 *   «2 Huevos y 150mL Claras de huevo»           dos, unidos por una «y»
 *   «130g Pasta / 130g Arroz / 220g Pan»         uno, con alternativas
 *   «200g Gallo o 180g Merluza»                  uno, con alternativa
 *
 * La diferencia entre las tres últimas es lo que separa: con «y» son cosas que
 * se comen JUNTAS, con «/» y con «o» es la misma cosa dicha de varias maneras.
 * Escrito así por todo el mundo, y si se confunden se acaba metiendo tres
 * desayunos en uno.
 *
 * La «o» solo separa cuando detrás viene otra CANTIDAD. Sin ella —«200g Sandía
 * o melón»— la disyuntiva es parte del nombre del alimento, y partirla dejaría
 * un «melón» sin gramos.
 *
 * De las alternativas se importa la primera y las demás se conservan escritas:
 * en esta aplicación las alternativas son de la comida entera, no de un alimento
 * suelto, y fabricar una opción por combinación multiplicaría cinco alimentos
 * con tres alternativas en doscientas cuarenta y tres opciones.
 */
export const alimentosDeLinea = (linea) => {
  const limpia = sinVinieta(linea);
  if (!limpia) return [];

  const salida = [];
  for (const trozo of limpia.split(/\s+y\s+(?=\d)/i)) {
    const alternativas = trozo
      .split(/\s*\/\s*|\s+o\s+(?=\d)/i)
      .map((s) => s.trim())
      .filter(Boolean);
    const principal = alternativas[0];

    const leido = alimentoDeTrozo(principal);
    if (!leido) continue;

    leido.alternatives = alternativas.slice(1).filter((a) => hasWords(a));
    salida.push(leido);
  }
  return salida;
};

/** «100g Copos de avena» o «Copos de avena 100g»: la cantidad puede ir delante o detrás. */
const alimentoDeTrozo = (trozo) => {
  const texto = String(trozo || '').trim();
  if (!texto) return null;

  const delante = /^(\d+(?:[.,]\d+)?\s*(?:kg|gramos|grs?|gr|g|ml|cl|l|uds?|unidades?|unidad|piezas?|lonchas?|rebanadas?|cucharadas?|vasos?|latas?|scoops?)?)\s+(.+)$/i.exec(texto);
  const detras = /^(.+?)\s+(\d+(?:[.,]\d+)?\s*(?:kg|gramos|grs?|gr|g|ml|cl|l|uds?|unidades?|unidad|piezas?|lonchas?|rebanadas?|cucharadas?|vasos?|latas?|scoops?))$/i.exec(texto);

  let cantidad = null;
  let nombre = texto;

  if (delante && parseCantidad(delante[1])) {
    cantidad = parseCantidad(delante[1]);
    nombre = delante[2];
  } else if (detras && parseCantidad(detras[2])) {
    cantidad = parseCantidad(detras[2]);
    nombre = detras[1];
  } else {
    return null;
  }

  nombre = nombre.replace(/[\s.,;:]+$/, '').trim();
  if (!hasWords(nombre)) return null;

  /*
    ══ Un número suelto delante NO basta para que algo sea comida ════════════

    «100g Avena» lleva su unidad y no hay duda. «1 Plátano mediano» no la lleva
    —y es correcto, es una pieza—, pero exactamente la misma forma tiene «1
    serie 12.5kg, 2 serie 11.3kg» de una hoja de RUTINA leída como texto: un
    número, un espacio y palabras. Sin esta condición, un mesociclo de cinco
    días se lee como una comida con noventa alimentos.

    Así que a la pieza sin unidad se le exige lo que de verdad la distingue: que
    lo que viene detrás sea un NOMBRE —corto y sin cifras dentro—. Un registro de
    entrenamiento siempre las lleva.
  */
  if (cantidad.units != null && !cantidad.unitLabel && !/\bud|unidad/i.test(texto)) {
    if (/\d/.test(nombre) || nombre.length > 48) return null;
  }

  return nuevoAlimento(nombre, cantidad, null);
};

/**
 * Vuelve a juntar los renglones que un documento partió por el ancho de la hoja.
 *
 * ══ Por qué hace falta ═════════════════════════════════════════════════════
 *
 * En un PDF, un renglón acaba donde acaba el papel, no donde acaba la frase:
 *
 *     - 130g Pasta integral / 130g Arroz integral / … / 550g Patata / 470g
 *     Boniato
 *
 * Leídos por separado, la última alternativa se queda en «470g» —una cantidad
 * sin nada que contar, que se tira— y «Boniato» pasa a ser una frase suelta que
 * acaba de pauta de la comida. El alimento existe, está escrito, y se pierde.
 *
 * ══ Qué NO se junta, que es lo que hace que esto sea seguro ════════════════
 *
 * Nada que empiece por viñeta —es otro alimento— y nada que venga detrás de un
 * TÍTULO o de una línea de cifras: «DESAYUNO / PRE ENTRENO» seguido de «Procura
 * consumirlo…» son dos cosas distintas, y pegarlas se lleva por delante el
 * nombre de la comida. Y solo se junta cuando la línea de arriba se ha quedado a
 * medias: sin punto, sin dos puntos y sin cerrar.
 */
const unirRenglonesPartidos = (lineas) => {
  const out = [];

  for (const cruda of lineas) {
    const linea = String(cruda || '').trim();
    if (!linea) continue;

    const anterior = out[out.length - 1];
    const empiezaAlgo =
      /^[\s\-–—•*·]/.test(cruda) ||
      /:\s*$/.test(linea) ||
      RE_COMIDA.test(linea) ||
      RE_OPCION.test(linea) ||
      RE_ETIQUETA.test(linea) ||
      RE_PASOS.test(linea) ||
      RE_CARDIO.test(linea) ||
      Boolean(macrosDeTexto(linea)) ||
      Boolean(alimentoDeTrozo(linea));

    const anteriorAbierta =
      anterior &&
      !/[.:;!?]$/.test(anterior) &&
      !RE_COMIDA.test(anterior) &&
      !RE_OPCION.test(anterior) &&
      !RE_ETIQUETA.test(anterior) &&
      !macrosDeTexto(anterior);

    if (!empiezaAlgo && anteriorAbierta) out[out.length - 1] = `${anterior} ${linea}`;
    else out.push(linea);
  }

  return out;
};

/**
 * Una dieta escrita en párrafos: la del PDF, la del Word, la del WhatsApp.
 *
 * Cada línea es una de cinco cosas y se preguntan en este orden, que no es
 * casual: «775 kilocalorías (40g proteína…)» empieza por un número igual que un
 * alimento, así que las cifras se descartan antes de buscar comida.
 */
const parseDietText = (lineas) => {
  const comidas = [];
  const notas = [];
  let actual = null;
  let opcion = null;
  let targets = null;
  let steps = '';
  let cardio = '';

  /* Las pautas se acumulan y se cierran juntas: un título que acaba en dos
     puntos y debajo sus viñetas son UNA pauta con encabezado, no ocho sueltas. */
  let pendiente = null;
  const cerrarNota = () => {
    if (pendiente && pendiente.body.length) {
      notas.push({ title: pendiente.title, body: pendiente.body.join('\n') });
    }
    pendiente = null;
  };
  const anotar = (linea) => {
    const limpia = sinVinieta(linea);
    if (!limpia || !hasWords(limpia)) return;
    if (actual) {
      actual.note = [actual.note, limpia].filter(Boolean).join('\n');
      return;
    }
    if (/:\s*$/.test(limpia)) {
      cerrarNota();
      pendiente = { title: limpia.replace(/\s*:\s*$/, '').slice(0, 80), body: [] };
      return;
    }
    if (!pendiente) pendiente = { title: '', body: [] };
    pendiente.body.push(limpia);
  };

  let primera = true;
  for (const cruda of unirRenglonesPartidos(lineas)) {
    const linea = String(cruda || '').trim();
    if (!linea) continue;

    const limpia = sinVinieta(linea);

    /* El título del documento no es una pauta. Es la única línea que se tira
       por ser la primera, y solo si además se llama como se llaman los títulos. */
    if (primera) {
      primera = false;
      if (RE_TITULO_DOC.test(limpia) && !RE_COMIDA.test(limpia)) continue;
    }

    if (RE_COMIDA.test(limpia) && limpia.length <= 60) {
      cerrarNota();
      actual = { name: limpia.replace(/\s*:\s*$/, ''), note: '', target: null, options: [] };
      comidas.push(actual);
      opcion = null;
      continue;
    }

    if (RE_OPCION.test(limpia)) {
      if (!actual) {
        actual = { name: `Comida ${comidas.length + 1}`, note: '', target: null, options: [] };
        comidas.push(actual);
      }
      opcion = { foods: [] };
      actual.options.push(opcion);
      continue;
    }

    const macros = macrosDeTexto(limpia);
    if (macros) {
      /* Se funden en vez de quedarse con la primera: hay quien escribe las
         kilocalorías en un renglón y los macros en el siguiente. */
      if (actual) actual.target = fundirMacros(actual.target, macros);
      else targets = fundirMacros(targets, macros);
      continue;
    }

    if (RE_PASOS.test(limpia)) {
      steps = steps || limpia.replace(/^(pasos|steps|actividad|neat)\s*:?\s*/i, '').trim() || limpia;
      continue;
    }
    if (RE_CARDIO.test(limpia)) {
      cardio = cardio || limpia.replace(/^(cardio|aer[oó]bico|conditioning)\s*:?\s*/i, '').trim() || limpia;
      continue;
    }

    if (RE_ETIQUETA.test(limpia)) continue;

    const alimentos = alimentosDeLinea(linea);
    if (alimentos.length) {
      if (!actual) {
        actual = { name: `Comida ${comidas.length + 1}`, note: '', target: null, options: [] };
        comidas.push(actual);
      }
      if (!opcion) {
        opcion = { foods: [] };
        actual.options.push(opcion);
      }
      opcion.foods.push(...alimentos);
      continue;
    }

    anotar(linea);
  }
  cerrarNota();

  return {
    comidas: comidas.filter((c) => c.options.some((o) => o.foods.length)),
    notas,
    targets,
    steps,
    cardio,
  };
};

/* ══ La entrada ════════════════════════════════════════════════════════════ */

const lecturaVacia = () => ({
  format: null,
  variant: null,
  variantRaw: null,
  targets: null,
  steps: '',
  cardio: '',
  notes: [],
  meals: [],
});

/**
 * Lee una dieta de una rejilla y devuelve lo que ha entendido.
 *
 * `format` dice por dónde ha salido, que es lo que hay que enseñar cuando el
 * resultado no convence: «macros» significa que la hoja no traía menú, y eso
 * explica de golpe por qué no hay comidas.
 */
export const parseDietGrid = (rejilla) => {
  const grid = recortarColumnas(rejilla || []);
  if (!grid.length) return lecturaVacia();

  const { comidas, notasSueltas } = comidasDeRejilla(grid);

  /* Las filas que ya son de una comida no se vuelven a mirar buscando el
     objetivo del día: el «Total: 600 Kcal» del desayuno no es el del día. */
  const filasDeComida = new Set();
  if (comidas.length) {
    let dentro = false;
    for (let r = 0; r < grid.length; r += 1) {
      if (esFilaDeComida(grid[r])) dentro = true;
      if (dentro) filasDeComida.add(r);
    }
  }

  const cabecera = cabeceraDeRejilla(grid, filasDeComida);
  const textoEntero = grid.map(textoDeFila).join(' \n ');

  const notes = [...cabecera.notas, ...notasSueltas].map((body) => ({ title: '', body }));
  /* Solo la cabecera de la hoja decide el tipo de día: una pauta escrita dentro
     de una comida puede nombrar el descanso sin que la hoja sea la del descanso. */
  const { variant, label } = varianteDeTexto(textoEntero.slice(0, 400));

  return {
    format: comidas.length ? 'tabla' : cabecera.targets ? 'macros' : null,
    variant,
    variantRaw: label,
    targets: cabecera.targets,
    steps: cabecera.steps,
    cardio: cabecera.cardio,
    notes,
    meals: comidas,
  };
};

/**
 * Lo mismo, desde texto pegado o desde un PDF.
 *
 * ══ Con tabuladores es una hoja, y punto ═══════════════════════════════════
 *
 * Aquí había un reintento: si por el camino de la hoja no salían comidas, se
 * volvía a leer como prosa. Sonaba prudente y era la puerta por la que se colaba
 * el peor fallo de todos: una hoja de RUTINA no da comidas por el camino de la
 * hoja —correcto— y, leída como prosa, sus líneas de registro («1 serie 12.5kg,
 * 2 serie 11.3kg») se parecen lo justo a «1 Plátano mediano» como para producir
 * una dieta de noventa alimentos que nadie ha escrito.
 *
 * Un texto con tabuladores es una tabla. Si de la tabla no sale una dieta, es
 * que no había dieta, y decirlo es la respuesta correcta.
 */
export const parseDietSheet = (texto) => {
  const limpio = String(texto || '').replace(/\r\n?/g, '\n');
  if (!limpio.trim()) return lecturaVacia();

  if (limpio.includes('\t')) return parseDietGrid(toGrid(limpio));

  const lineas = limpio.split('\n');
  const { comidas, notas, targets, steps, cardio } = parseDietText(lineas);
  if (!comidas.length && !targets) {
    /* Ni comidas ni cifras: puede seguir siendo una tabla sin tabuladores. */
    const porRejilla = parseDietGrid(trimGrid(limpio.split('\n').map((l) => l.split(/\s{2,}/))));
    if (porRejilla.meals.length) return porRejilla;
  }

  const { variant, label } = varianteDeTexto(limpio.slice(0, 400));

  return {
    format: comidas.length ? 'texto' : targets ? 'macros' : null,
    variant,
    variantRaw: label,
    targets,
    steps,
    cardio,
    notes: notas,
    meals: comidas,
  };
};

/* ══ Varias hojas ══════════════════════════════════════════════════════════ */

/**
 * Las hojas elegidas de un libro, unidas en un plan.
 *
 * ══ Por qué esto no las concatena ══════════════════════════════════════════
 *
 * Porque dos hojas de dieta del mismo cliente casi nunca son dos mitades de lo
 * mismo: son **el mismo día contado dos veces**, uno para entrenar y otro para
 * descansar. Pegar la una detrás de la otra daría seis comidas donde hay tres.
 *
 * Así que cada hoja es una VARIANTE, y solo cuando una hoja no trae comidas
 * —la que solo lleva las cifras— se funde con la otra en lugar de ocupar su
 * propio hueco. Ese caso es real: hay quien pone los macros en una pestaña y el
 * menú en otra.
 */
export const mergeDietReadings = (entradas = []) => {
  const conComidas = [];
  let base = lecturaVacia();
  let hayAlgo = false;

  for (const { name, reading } of entradas) {
    if (!reading || !reading.format) continue;
    hayAlgo = true;

    base = {
      ...base,
      targets: base.targets || reading.targets,
      steps: base.steps || reading.steps,
      cardio: base.cardio || reading.cardio,
      notes: [...base.notes, ...reading.notes],
    };

    if (reading.meals.length) {
      conComidas.push({
        /* El nombre de la pestaña vale como etiqueta cuando la hoja no dice por
           dentro qué día es: «Low» y «High» suelen estar solo ahí. */
        label: reading.variantRaw || name || '',
        variant: reading.variant || varianteDeTexto(name || '').variant,
        reading,
      });
    }
  }

  if (!hayAlgo) return { ...lecturaVacia(), variants: [] };

  const variants = conComidas.map((v, i) => ({
    id: `v${i}`,
    label: v.label || v.reading.variantRaw || `Dieta ${i + 1}`,
    variant: v.variant,
    targets: v.reading.targets || null,
    meals: v.reading.meals,
  }));

  /* Con dos variantes y una sola reconocida, la otra es la contraria: si una
     pestaña dice «High» y la otra no dice nada, la otra es la de descanso. */
  if (variants.length === 2) {
    const [a, b] = variants;
    if (a.variant && !b.variant) b.variant = a.variant === 'training' ? 'rest' : 'training';
    else if (!a.variant && b.variant) a.variant = b.variant === 'training' ? 'rest' : 'training';
    else if (!a.variant && !b.variant) {
      a.variant = 'training';
      b.variant = 'rest';
    }
  } else if (variants.length === 1 && !variants[0].variant) {
    variants[0].variant = 'default';
  }

  return {
    ...base,
    format: variants.length ? 'libro' : base.targets ? 'macros' : null,
    meals: variants[0]?.meals || [],
    variants,
  };
};

/** La lectura de UNA hoja, en la misma forma que devuelve `mergeDietReadings`. */
export const asPlan = (reading) =>
  reading?.meals?.length
    ? {
        ...reading,
        variants: [
          {
            id: 'v0',
            label: reading.variantRaw || 'Dieta',
            variant: reading.variant || 'default',
            targets: reading.targets,
            meals: reading.meals,
          },
        ],
      }
    : { ...reading, variants: [] };

/* ══ Recuentos, para lo que se enseña antes de crear ══════════════════════ */

/** Qué trae una lectura, en números. */
export const dietSummary = (reading) => {
  const meals = reading?.meals || [];
  return {
    meals: meals.length,
    options: meals.reduce((n, m) => n + (m.options?.length || 0), 0),
    foods: meals.reduce(
      (n, m) => n + (m.options || []).reduce((k, o) => k + (o.foods?.length || 0), 0),
      0
    ),
  };
};

/* ══ De lo leído a lo que guarda la aplicación ════════════════════════════ */

/**
 * El objetivo de una lectura, con los nombres de los campos del plan.
 *
 * Lo que no venía en la hoja se queda en `null` y no en cero: cero kilocalorías
 * es un objetivo —imposible, pero un objetivo— y «no lo pone» no lo es.
 */
export const toTargetFields = (targets) => ({
  targetKcals: targets?.kcals ?? null,
  proteinGrams: targets?.protein ?? null,
  carbsGrams: targets?.carbs ?? null,
  fatsGrams: targets?.fats ?? null,
});

const SIN_MACROS = { proteinPer100: 0, carbsPer100: 0, fatsPer100: 0, unitLabel: null, unitGrams: null };

/**
 * Un alimento leído, convertido en la entrada que guarda una dieta.
 *
 * ── Los gramos son la verdad, también aquí ──────────────────────────────────
 * Una hoja que dice «2 ud» no dice gramos, y la dieta guarda gramos (ver
 * `domain/nutrition.js`). La conversión sale del alimento reconocido —un huevo
 * pesa 60 g y dos pesan 120— y solo cuando no se ha reconocido nada se recurre a
 * los cien gramos por unidad, que es una suposición y por eso ese alimento
 * aparece marcado en la revisión.
 */
export const toFoodEntry = (alimento, definicion) => {
  const base = definicion || { name: alimento.name, ...SIN_MACROS };
  const porUnidad = Number(base.unitGrams) || 0;

  const gramos =
    alimento.grams != null
      ? alimento.grams
      : alimento.units != null
        ? Math.round(alimento.units * (porUnidad || 100))
        : null;

  return buildFoodEntry(base, gramos);
};

/**
 * Las comidas de una variante, listas para guardarse.
 *
 * `resolver` traduce un nombre en un alimento con macros; lo que devuelva
 * `null` entra igual, a cero, porque una dieta a la que le falta un alimento
 * sigue siendo mejor que ninguna — y en la pantalla se ve el hueco.
 */
export const toMealDrafts = (meals = [], resolver = () => null) =>
  meals.map((comida) => ({
    ...buildMeal(),
    name: comida.name || 'Comida',
    note: [comida.note, alternativesNote(comida)].filter(Boolean).join('\n\n'),
    target: comida.target
      ? {
          kcals: comida.target.kcals ?? 0,
          protein: comida.target.protein ?? 0,
          carbs: comida.target.carbs ?? 0,
          fats: comida.target.fats ?? 0,
        }
      : null,
    options: (comida.options?.length ? comida.options : [{ foods: [] }]).map((opcion) => ({
      ...buildOption(),
      foods: (opcion.foods || []).map((a) => toFoodEntry(a, resolver(a.name))),
    })),
  }));

/**
 * Las alternativas que una línea traía y aquí no caben, dichas como pauta.
 *
 * En una hoja, «130g Pasta / 130g Arroz / 220g Pan» es un alimento con tres
 * formas. Aquí las alternativas son de la comida entera, así que la primera se
 * importa y las otras se escriben en la nota de la comida en vez de perderse:
 * son media dieta en los planes que se escriben así, y el cliente las necesita
 * para poder comer algo distinto el martes.
 */
export const alternativesNote = (comida) => {
  const lineas = [];
  for (const opcion of comida.options || []) {
    for (const alimento of opcion.foods || []) {
      if (alimento.alternatives?.length) {
        lineas.push(`${alimento.name}: o bien ${alimento.alternatives.join(' / ')}`);
      }
    }
  }
  return lineas.length ? `Puedes cambiar:\n${lineas.join('\n')}` : '';
};

/**
 * Cada alimento distinto de un plan, una sola vez.
 *
 * Con su unidad, si la hoja lo contaba en piezas: es lo que hay que preguntar
 * —«¿cuánto pesa una?»— y solo se sabe mirando cómo venía escrito. Va aquí y no
 * en la pantalla porque recorrer variantes, comidas, opciones y alimentos es
 * exactamente lo que este módulo sabe hacer.
 */
export const foodNames = (variants = []) => {
  const vistos = new Map();
  for (const variante of variants) {
    for (const comida of variante.meals || []) {
      for (const opcion of comida.options || []) {
        for (const alimento of opcion.foods || []) {
          const clave = claveDeNombre(alimento.name);
          if (!vistos.has(clave)) {
            vistos.set(clave, {
              clave,
              name: alimento.name,
              units: alimento.units ?? null,
              unitLabel: alimento.unitLabel ?? null,
            });
          }
        }
      }
    }
  }
  return [...vistos.values()];
};
