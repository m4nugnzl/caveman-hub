/**
 * Una rutina escrita fuera de aquí, leída.
 *
 * ══ La tesis: el formato varía entre entrenadores, no dentro de uno ═════════
 *
 * No hay dos hojas de rutina iguales, y escribir un lector que entienda «todos
 * los formatos» no termina nunca. Pero al mirar hojas reales aparece algo que sí
 * se puede aprovechar: por debajo de la maquetación —que es donde está toda la
 * variedad— solo hay **dos maneras de decir cuántas series lleva un ejercicio**.
 *
 *   FAMILIA «series»   Una columna que se llama SERIES con un número dentro.
 *                      El registro de cada semana va a la DERECHA del plan.
 *
 *                        GRUPO MUSCULAR │ EJERCICIO │ SERIES │ RANGO │ RIR │ …
 *                        BÍCEPS         │ Curl      │   3    │  8-10 │  0  │ …
 *
 *   FAMILIA «bloques»  No hay columna de series: hay un bloque de columnas por
 *                      serie, repetido, y las series son cuántos bloques traen
 *                      objetivo. Aquí plan y registro van ENTRELAZADOS.
 *
 *                        Nº │ Ejercicio │ Músculo │ KGs REPS RIR Rango │ KGs REPS RIR Rango │ …
 *                         1 │ Curl      │ Bíceps  │  20   8   0   6-8  │  18   9   0  8-10  │ …
 *
 * Distinguirlas es una línea: si existe una columna llamada SERIES, gana esa.
 * Un recuento explícito vale más que cualquier deducción — y esa regla salió de
 * equivocarse: una hoja con veinte semanas de registro repite las cabeceras
 * `PESO / SERIE 1..4` tantas veces que parece de la familia «bloques», y se leía
 * con una serie por ejercicio en vez de tres.
 *
 * Hay una tercera entrada, «texto», para lo que no es una tabla: la rutina
 * pegada de un Word o escrita a mano, `Press banca 4x8-10 RIR2`.
 *
 * ══ Qué se trae y qué no ═══════════════════════════════════════════════════
 *
 * Se trae el PLAN: nombre, músculo, cuántas series, el objetivo de repeticiones
 * de cada una, el RIR objetivo y la indicación del entrenador. **No se traen los
 * kilos ni las repeticiones registradas**, aunque estén ahí y aunque sean la
 * mitad del fichero. Es la misma regla que `cloneExerciseAsTemplate`: importar
 * un registro con fecha fabricaría entrenamientos que en esta aplicación no
 * ocurrieron, y la progresión de fuerza —que es lo que mira el entrenador—
 * quedaría contando sesiones que no existen.
 *
 * ══ Por qué esto nunca decide del todo ═════════════════════════════════════
 *
 * Cada cosa que se deduce viene marcada: el músculo que no se supo traducir, el
 * día que no se supo nombrar, y las DOS columnas de objetivo cuando la hoja trae
 * dos (pasa: «8-10» para las primeras semanas y «10-12» para las últimas, bajo
 * una cabecera combinada). Nada de eso se resuelve aquí a la brava, porque quien
 * está importando lo sabe y esto no. Se propone, se enseña y se deja corregir.
 */

import { newId } from '@/lib/ids';
import {
  bestColumn,
  columnValues,
  hasWords,
  headerIndex,
  headerIndexes,
  headerPeriod,
  toGrid,
  trimGrid,
} from './sheet';
import { emptySet, normalizeMuscle } from './training';

/* ══ El vocabulario de las cabeceras ═══════════════════════════════════════
   En castellano y en inglés, porque media profesión usa plantillas traducidas a
   medias. Se comparan contra la celda ENTERA y no como subcadena: «Nº SERIES»
   es la columna de series, pero «SERIES TOTALES» —el resumen de arriba de la
   hoja— no lo es, y por subcadena serían la misma. */
const RE_NOMBRE = /^(ejercicios?|ejerc\.?|ej\.?|movimientos?|exercises?)$/i;
const RE_SERIES = /^(n[.ºo°]?\s*)?(series?|sets?)$/i;
const RE_RANGO = /^(rango\s*(de\s*)?(reps?|repeticiones)?|objetivo|rep\s*range|target)$/i;
const RE_REPS = /^(reps?|repeticiones)$/i;
const RE_RIR = /^(rir|rpe)(\s*objetivo)?$/i;
const RE_MUSCULO = /^(grupo\s*muscular|m[uú]sculo|grupo|muscle(\s*group)?)$/i;
const RE_NOTA =
  /^(especificaciones|notas?|observaciones|comentarios?|t[eé]cnica|indicaciones?|notes?|tips?|consejos?|claves?|cues?|tipo\s*(de\s*)?serie|m[eé]todo|set\s*type)$/i;

/* Lo que una columna de «técnica» o «tipo de serie» dice cuando no dice nada:
   que la serie es normal. Traerlo como nota llenaría cada ejercicio de la misma
   frase y escondería las indicaciones que sí importan. */
const RE_NOTA_VACIA = /^(serie\s*)?(recta|lineal|normal|est[aá]ndar|straight(\s*sets?)?|[-–—.]+)$/i;
const RE_DIA_COLUMNA = /^(d[ií]a|sesi[oó]n|day|jornada)$/i;

/**
 * Las filas de recuento que una hoja deja al final de la tabla.
 *
 * «TOTAL SERIES │ 7» tiene nombre y tiene un número donde van las series, así
 * que por forma es indistinguible de un ejercicio y entra como uno llamado
 * «TOTAL SERIES». Una de las dos plantillas reales se libraba por casualidad
 * —su celda de nombre trae un `0` y no una palabra—, que es justo la clase de
 * suerte con la que no se puede contar.
 *
 * Es una lista corta y a propósito: no pretende reconocer todos los resúmenes
 * del mundo, solo los que se llaman como se llaman siempre. Lo que se escape se
 * ve en la previsualización y se quita antes de crear nada.
 */
const RE_RESUMEN = /^(totales?|total\s|suma|sumatorio|resumen|tonelaje|volumen\s+total|totals?|sum)\b/i;

/* La etiqueta que precede al nombre de un día dentro de la hoja. Sin dos puntos
   obligatorios: unos escriben «ENFOQUE:» y otros «ENTRENAMIENTO». */
const RE_ETIQUETA_DIA = /^(enfoque|d[ií]a|sesi[oó]n|entrenamiento|rutina|split|bloque)\s*:?\s*$/i;

/* Nombres de día que se reconocen solos, sin etiqueta delante. */
const RE_DIA_SUELTO =
  /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|push|pull|legs?|piernas?|pierna\s*[ab]|torso|empuje|tir[oó]n|full\s*body|upper|lower|arms|brazos|d[ií]a\s*\d+|sesi[oó]n\s*\d+)\b/i;

/* ══ Formas de valor ═══════════════════════════════════════════════════════ */

/** «8-10», «8/10/12», «12», «AMRAP». Lo que un entrenador escribe como objetivo. */
const esRango = (v) =>
  /^\d{1,3}\s*(?:[-–/a]\s*\d{1,3}\s*)+$/i.test(v) ||
  /^(amrap|fallo|al\s*fallo|m[aá]x(imo)?)$/i.test(v);

/** Igual, pero admitiendo un número suelto: solo vale donde la cabecera ya dijo que es un rango. */
const esRangoODigito = (v) => esRango(v) || /^\d{1,3}$/.test(v);

/** Un recuento de series creíble. Doce es mucho; más de doce es otra cosa mal leída. */
const esNumeroDeSeries = (v) => {
  const n = Number.parseInt(String(v).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 12;
};

/** ¿Esta celda es un grupo muscular reconocible? Para localizar su columna sin cabecera. */
const esMusculo = (v) => Boolean(normalizeMuscle(v)?.sure);

/** «4x8», «4 x 8-10»: series y objetivo en una sola celda. */
const RE_NXM = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–/]\s*\d{1,3})?)/i;

/* ══ Series que no son todas iguales ═══════════════════════════════════════

   Un top set y sus back-offs, una pirámide, una serie de 6-8 y dos de 8-10: el
   plan pide cosas DISTINTAS a cada serie, y quien lo escribe lo dice de una de
   tres maneras.

     En una celda      «1 x 6-8 / 2 x 8-10», «Top set 1x6-8 + back off 2x8-10»
     En columnas       REPETICIONES │ RIR │ REPETICIONES │ RIR … — una por serie
     En renglones      el nombre, y debajo «Serie 1: 6-8», «Serie 2: 8-10»

   Las tres acaban en lo mismo: una lista con un objetivo por serie. Aplanarla a
   uno solo —que es lo que se hacía— se quedaba con el primero y perdía el
   resto; y leer cada columna como una ALTERNATIVA entera convertía un top set
   con dos back-offs en seis «columnas de objetivo» entre las que elegir. */

/* Lo que puede preceder a un tramo sin cambiar lo que dice: «Top set», «BO»,
   «Serie 1», «2ª serie». Se come y se olvida; el orden ya lo dice todo. */
const RE_ETIQUETA_TRAMO =
  /^(?:top\s*-?\s*sets?|back\s*-?\s*offs?|bo|ts|serie\s*(?:de\s*)?(?:trabajo|efectiva)?|series|s\s*\d+|serie\s*\d+|\d+\s*[ªº°]\s*serie|sets?\s*\d*)\s*[:.\-–]?\s*/i;

/* Un tramo: cuántas series, con qué objetivo y —si lo dice— con qué RIR. */
const RE_TRAMO =
  /^(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?|amrap|fallo|al\s*fallo)\s*(?:reps?|repeticiones)?\s*(?:(?:@|rir|rpe)\s*[:=]?\s*(\d{1,2}(?:[.,]\d)?(?:\s*-\s*\d{1,2})?))?$/i;

/* Lo que separa tramos: «/», «+», «;», «·», la palabra «y» o una coma seguida
   de espacio — sin espacio es un decimal: «@1,5». */
const RE_ENTRE_TRAMOS = /\s*(?:[/+;·]|,\s|\by\b|\band\b)\s*/i;

/**
 * Un esquema de series escrito en una celda, desplegado serie a serie.
 *
 * «1 x 6-8 / 2 x 8-10» → dos tramos → `[{6-8}, {8-10}, {8-10}]`. Se exige que
 * TODOS los trozos sean tramos: si uno no lo es, la celda dice otra cosa (un
 * registro, «12,5x8/10x10», o una nota) y no se toca. Un «3x8-10» solo también
 * vale: es el esquema de un tramo, el caso de siempre.
 *
 * @returns `[{ target, rir }]` una entrada por serie, o `null`.
 */
export const esquemaDeSeries = (celda) => {
  const texto = String(celda ?? '').trim();
  if (!texto || !/\d\s*[x×]\s*\d|\d\s*[x×]\s*(amrap|fallo)/i.test(texto)) return null;

  const tramos = texto.split(RE_ENTRE_TRAMOS).filter(Boolean);
  const series = [];
  for (const trozo of tramos) {
    const m = RE_TRAMO.exec(trozo.replace(RE_ETIQUETA_TRAMO, '').trim());
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    if (n < 1) return null;
    const target = m[2].replace(/\s+/g, '').replace('–', '-');
    const rir = (m[3] || '').replace(',', '.').replace(/\s+/g, '');
    for (let i = 0; i < n; i += 1) series.push({ target, rir });
  }
  return series.length >= 1 && series.length <= 12 ? series : null;
};

/**
 * «12/10/8» con tres series: una pirámide, un objetivo por serie.
 *
 * Solo con TRES trozos o más y cuando cuadran con las series. «8/10» con dos
 * series es ambiguo —mucha gente escribe así el rango de 8 a 10— y se queda
 * como está.
 */
const piramide = (celda, series) => {
  const trozos = String(celda ?? '').split('/').map((t) => t.trim());
  if (trozos.length < 3 || trozos.length !== series) return null;
  return trozos.every((t) => /^\d{1,3}(\s*[-–]\s*\d{1,3})?$/.test(t)) ? trozos : null;
};

/**
 * Una lista con un valor por serie, del largo pedido.
 *
 * Un hueco toma el valor de la serie de antes: «8-10» en la columna de la
 * primera serie y nada en la de la segunda es «las dos a 8-10», que es como lo
 * escribe quien no repite lo obvio. Lo que viene detrás de la última serie se
 * ignora: manda el recuento.
 */
const arrastrar = (valores, largo) => {
  const out = [];
  for (let i = 0; i < largo; i += 1) {
    const v = String(valores[i] ?? '').trim();
    out.push(v || (i > 0 ? out[i - 1] : ''));
  }
  return out;
};

/** Un RIR escrito: «0», «1,5», «1-2». */
const esRir = (v) => /^\d{1,2}([.,]\d)?(\s*-\s*\d{1,2})?$/.test(String(v ?? '').trim());

/**
 * Una lista por serie, dicha corta: «8-10» si todas piden lo mismo, y si no
 * «2×7-9 · 10-12» —las repetidas seguidas se agrupan—.
 *
 * Es la forma en que la revisión enseña el objetivo, y a la vez una forma que
 * `leerPorSerie` sabe volver a desplegar: lo que se ve se puede editar.
 */
export const seriesVisibles = (lista = []) => {
  const valores = lista.map((v) => String(v ?? '').trim());
  if (!valores.length) return '';
  if (valores.every((v) => v === valores[0])) return valores[0];

  const grupos = [];
  for (const v of valores) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.v === v) ultimo.n += 1;
    else grupos.push({ v, n: 1 });
  }
  return grupos.map(({ v, n }) => (n > 1 ? `${n}×${v || '—'}` : v || '—')).join(' · ');
};

/**
 * Lo contrario de `seriesVisibles`: el texto de la revisión, serie a serie.
 *
 * `null` cuando el texto es UN solo valor —«8-10»—, que es lo que se escribe
 * para que todas las series pidan lo mismo.
 */
export const leerPorSerie = (texto) => {
  const trozos = String(texto ?? '')
    .split('·')
    .map((t) => t.trim())
    .filter(Boolean);
  if (trozos.length < 2) return null;

  const out = [];
  for (const trozo of trozos) {
    const m = /^(\d{1,2})\s*[x×]\s*(.+)$/.exec(trozo);
    const n = m ? Number.parseInt(m[1], 10) : 1;
    const v = (m ? m[2] : trozo).trim();
    for (let i = 0; i < n; i += 1) out.push(v === '—' ? '' : v);
  }
  return out.length <= 12 ? out : null;
};

/* ══ Celdas combinadas ═════════════════════════════════════════════════════ */

/**
 * Hasta dónde llega una cabecera.
 *
 * Excel exporta una celda combinada como el valor en la primera columna y vacío
 * en las demás. Así que «RANGO DE REPETICIONES» ocupando dos columnas llega como
 * un rótulo y una columna anónima a su derecha — y esa columna anónima tiene
 * datos. Sin esto, la mitad de las hojas pierden su segunda columna de objetivo
 * sin que nada lo diga.
 *
 * El tramo de una cabecera va desde ella hasta la siguiente cabecera con texto.
 */
const tramoDeCabecera = (cabecera, index) => {
  let fin = index + 1;
  while (fin < cabecera.length && (cabecera[fin] || '') === '') fin += 1;
  return [index, fin];
};

/** El primer valor con contenido dentro del tramo de una cabecera. */
const valorEnTramo = (fila, cabecera, index) => {
  if (index < 0) return '';
  const [desde, hasta] = tramoDeCabecera(cabecera, index);
  for (let c = desde; c < hasta; c += 1) if ((fila[c] || '') !== '') return fila[c];
  return '';
};

/* ══ El nombre del día ═════════════════════════════════════════════════════ */

/**
 * Cómo se llama el bloque que empieza en esta fila, buscando hacia arriba.
 *
 * Seis filas de margen y no más: por encima de eso lo que hay es la cabecera de
 * la hoja —el nombre del mesociclo, el gráfico de volumen— y cogerla de ahí
 * llamaría «PLAN DE ENTRENAMIENTO» a los cinco días.
 *
 * `hasta` es donde acaba el plan. A su derecha la misma fila puede traer el
 * encabezado del registro —«DIARIO DE ENTRENAMIENTO SEMANA 1», «SESIÓN A
 * REALIZAR PULL A», una vez por semana—, y con eso la fila que dice «PULL A»
 * dejaba de ser una fila de una sola celda y el día se quedaba sin nombre.
 */
const nombreDelDiaArriba = (grid, filaCabecera, hasta = Number.POSITIVE_INFINITY) => {
  for (let r = filaCabecera - 1; r >= Math.max(0, filaCabecera - 6); r -= 1) {
    const fila = grid[r].slice(0, hasta);

    const etiqueta = headerIndex(fila, RE_ETIQUETA_DIA);
    if (etiqueta >= 0) {
      const valor = fila.slice(etiqueta + 1).find((c) => c !== '');
      if (valor) return valor;
    }

    /* Una fila con una sola celda que ya suena a día: «TORSO», «Pierna A». */
    const conTexto = fila.filter((c) => c !== '');
    if (conTexto.length === 1 && RE_DIA_SUELTO.test(conTexto[0])) return conTexto[0];
  }
  return null;
};

/** El nombre de día que hay en una línea suelta de texto, o `null`. */
const nombreDelDiaEnLinea = (linea) => {
  const limpia = String(linea).replace(/^[\s\-–•*·]+/, '').replace(/[:.\s]+$/, '').trim();
  if (!limpia || !hasWords(limpia)) return null;
  if (limpia.length > 48) return null;

  /* Los separadores se comen enteros: «Día 1 · Push», «Día 2 - Pull» y
     «Sesión 3: Pierna» son la misma frase con distinta puntuación. */
  const conEtiqueta = /^(?:d[ií]a|sesi[oó]n|day)\s*(\d+)?\s*[:.\-–—·|]*\s*(.*)$/i.exec(limpia);
  if (conEtiqueta) {
    const resto = (conEtiqueta[2] || '').trim();
    return resto || limpia;
  }
  return RE_DIA_SUELTO.test(limpia) ? limpia : null;
};

/* ══ Modo texto: una rutina escrita, no tabulada ═══════════════════════════ */

/**
 * Una línea de rutina, en trozos.
 *
 * Se extraen los TOKENS en cualquier orden y lo que sobra es el nombre. Es lo
 * contrario de reconocer la línea entera con una expresión por formato: de esas
 * hacen falta infinitas, porque cada uno pone el RIR delante, detrás o entre
 * paréntesis. De tokens hay media docena y son independientes.
 */
/*
  Un esquema de varios tramos DENTRO de una línea: «Press 1x6-8 / 2x8-10 RIR1».
  Se busca antes que nada porque sus trozos, cogidos de uno en uno, son justo lo
  que los demás tokens se comerían mal: el primer «1x6-8» como el ejercicio
  entero y el resto pegado al nombre.
*/
const RE_ESQUEMA_EN_LINEA = new RegExp(
  String.raw`(?:(?:top\s*-?\s*sets?|back\s*-?\s*offs?|bo|ts)\s*:?\s*)?\d{1,2}\s*[x×]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?(?:\s*(?:@|rir|rpe)\s*\d{1,2})?` +
    String.raw`(?:\s*(?:[/+;·]|,\s|\by\b)\s*(?:(?:top\s*-?\s*sets?|back\s*-?\s*offs?|bo|ts)\s*:?\s*)?\d{1,2}\s*[x×]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?(?:\s*(?:@|rir|rpe)\s*\d{1,2})?)+`,
  'i'
);

/*
  Una línea de REGISTRO, no de plan: «12,5x8 10x10», «55x8* 50x9*». Kilos por
  repeticiones, una detrás de otra. Leída como rutina da un ejercicio de 55
  series; se reconoce por los decimales o por tener dos o más «NxM» sueltos.
*/
const esLineaDeRegistro = (linea) =>
  /\d[.,]\d+\s*[x×]\s*\d/.test(linea) || (linea.match(/\d+\s*[x×]\s*\d+\*?/g) || []).length >= 2;

const parsearLineaDeTexto = (linea) => {
  let resto = ` ${linea} `;
  let series = null;
  let objetivo = '';
  let rir = '';
  let porSerie = null;

  const comer = (re, alEncontrar) => {
    const m = re.exec(resto);
    if (!m) return;
    alEncontrar(m);
    resto = resto.replace(m[0], ' ');
  };

  comer(RE_ESQUEMA_EN_LINEA, (m) => {
    porSerie = esquemaDeSeries(m[0]);
  });
  if (!porSerie && esLineaDeRegistro(linea)) return null;

  /* El RIR primero: «@2» y «RIR 2» llevan números que los demás tokens
     confundirían con series o repeticiones. */
  comer(/\b(?:rir|rpe)\s*[:=]?\s*(\d{1,2})\b/i, (m) => { rir = m[1]; });
  comer(/@\s*(\d{1,2})\b/, (m) => { if (!rir) rir = m[1]; });

  if (porSerie) {
    series = porSerie.length;
    objetivo = porSerie[0].target;
  }
  comer(RE_NXM, (m) => {
    if (series !== null) return;
    series = Number.parseInt(m[1], 10);
    objetivo = m[2].replace(/\s+/g, '');
  });
  comer(/\b(\d{1,2})\s*(?:series?|sets?)\b/i, (m) => { series = series ?? Number.parseInt(m[1], 10); });
  comer(/\b(\d{1,3}(?:\s*[-–/]\s*\d{1,3})?)\s*(?:reps?|repeticiones)\b/i, (m) => {
    if (!objetivo) objetivo = m[1].replace(/\s+/g, '');
  });
  /* Los kilos se reconocen para QUITARLOS del nombre, no para guardarlos. */
  comer(/\b\d+(?:[.,]\d+)?\s*(?:kgs?|lbs?)\b/i, () => {});
  comer(/\b(?:de|x)?\s*(\d{1,3}\s*[-–/]\s*\d{1,3})\s*$/i, (m) => {
    if (!objetivo) objetivo = m[1].replace(/\s+/g, '');
  });

  const nombre = resto
    .replace(/^[\s\-–•*·\d.)]+/, '')
    .replace(/[\s:,.\-–]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  /* Doce series es mucho; más es un número de otra cosa leído como series. */
  if (!hasWords(nombre) || series === null || !esNumeroDeSeries(series)) return null;
  if (RE_RESUMEN.test(nombre)) return null;

  const rirDe = (s) => s.rir || rir;
  return {
    nombre,
    series,
    objetivos: porSerie ? porSerie.map((s) => s.target) : Array.from({ length: series }, () => objetivo),
    rirs: porSerie ? porSerie.map(rirDe) : null,
    rir,
  };
};

/* ══ Una serie por renglón ═════════════════════════════════════════════════

   Así escribe la rutina quien la pasa a Word:

       Press banca
       Top set: 1 x 6-8 @1
       Back off: 2 x 8-10

   El nombre en su renglón no trae series —no es un ejercicio por sí solo— y los
   renglones de debajo no traen nombre —tampoco—. Por separado ninguno se leía y
   el ejercicio desaparecía entero. Juntos son uno. */

/* El calentamiento no es una serie del plan: se nombra para saltarlo. */
const RE_APROXIMACION = /^(aproximaci[oó]n(es)?|calentamiento|warm\s*-?\s*ups?|approach(es)?|activaci[oó]n)\b/i;

/* Lo que queda de un renglón de serie después de quitarle las cifras: palabras
   que no son un nombre de ejercicio. */
const RE_PALABRAS_DE_SERIE =
  /\b(top|back|off|set|sets|serie|series|de|trabajo|efectiva|reps?|repeticiones|rir|rpe|bo|ts|x|a|al|fallo|amrap|s\d+|\d+[ªº°])\b/gi;

/**
 * Si el renglón es UNA o varias series sin nombre, cuáles.
 *
 * @returns `{ series: [{ target, rir }] }`, `{ saltar: true }` para el
 *          calentamiento, o `null` si el renglón es otra cosa.
 */
const renglonDeSerie = (linea) => {
  const limpia = String(linea).replace(/^[\s\-–•*·]+/, '').trim();
  if (!limpia || limpia.length > 60) return null;
  if (RE_APROXIMACION.test(limpia)) return { saltar: true };

  /* «1 x 6-8 / 2 x 8-10», «Top set 1x6-8», «3x10 @2» */
  const esquema = esquemaDeSeries(limpia);
  if (esquema) return { series: esquema };

  /* «Serie 1: 6-8 reps @2», «S2 8-10», «2ª serie 8-10 RIR 1» */
  const conEtiqueta = /^(?:serie\s*\d+|s\d+|\d+\s*[ªº°]\s*serie|top\s*-?\s*set|back\s*-?\s*off)\s*[:.\-–]?\s*(.+)$/i.exec(limpia);
  if (conEtiqueta) {
    const resto = conEtiqueta[1];
    const objetivo = /(\d{1,3}(?:\s*[-–]\s*\d{1,3})?|amrap|al\s*fallo|fallo)/i.exec(resto)?.[1];
    if (!objetivo) return null;
    const rir = /(?:@|rir|rpe)\s*[:=]?\s*(\d{1,2}(?:[.,]\d)?)/i.exec(resto)?.[1] || '';
    const sobra = resto.replace(objetivo, ' ').replace(RE_PALABRAS_DE_SERIE, ' ').replace(/[\d@:=.,()\s-]/g, '');
    if (sobra.length > 0) return null;
    return { series: [{ target: objetivo.replace(/\s+/g, ''), rir: rir.replace(',', '.') }] };
  }
  return null;
};

/** ¿Puede este renglón ser el nombre de un ejercicio que se escribe debajo? */
const puedeSerNombre = (linea) => {
  const limpia = String(linea).replace(/^[\s\-–•*·\d.)]+/, '').trim();
  /* Una frase que acaba en punto es una indicación, no un nombre. */
  return hasWords(limpia) && limpia.length <= 60 && limpia.split(/\s+/).length <= 9 && !/\.$/.test(limpia);
};

const nuevoEjercicioDeTexto = (nombre, objetivos, rirs, rir = '') => ({
  name: nombre,
  muscle: 'Otros',
  muscleRaw: '',
  muscleSure: false,
  sets: objetivos.length,
  targetOptions: [objetivos],
  rir: rirs?.find(Boolean) || rir,
  ...(rirs?.some(Boolean) ? { rirs } : {}),
  note: '',
});

const parsearTexto = (lineas) => {
  const dias = [];
  let actual = null;
  /* El renglón con pinta de nombre que espera sus series, y el ejercicio que
     se ha abierto con él cuando han llegado. */
  let pendiente = null;
  let abierto = null;

  const diaActual = () => {
    if (!actual) {
      actual = { name: null, exercises: [] };
      dias.push(actual);
    }
    return actual;
  };

  const siguienteConTexto = (i) => lineas.slice(i + 1).find((l) => l.trim());

  lineas.forEach((linea, i) => {
    if (!linea.trim()) return;

    const serie = renglonDeSerie(linea);
    if (serie && (abierto || pendiente)) {
      if (serie.saltar) return;
      if (!abierto) {
        abierto = nuevoEjercicioDeTexto(pendiente, [], []);
        diaActual().exercises.push(abierto);
        pendiente = null;
      }
      const objetivos = [...abierto.targetOptions[0], ...serie.series.map((s) => s.target)].slice(0, 12);
      const rirs = [...(abierto.rirs || []), ...serie.series.map((s) => s.rir)].slice(0, 12);
      Object.assign(abierto, nuevoEjercicioDeTexto(abierto.name, objetivos, rirs));
      return;
    }
    if (serie) return;

    abierto = null;

    const ejercicio = parsearLineaDeTexto(linea);
    if (ejercicio) {
      pendiente = null;
      diaActual().exercises.push(
        nuevoEjercicioDeTexto(ejercicio.nombre, ejercicio.objetivos, ejercicio.rirs, ejercicio.rir)
      );
      return;
    }

    /* No es un ejercicio. Si suena a día, abre uno —salvo que lo de debajo sean
       sus series: «Pull over» suena a «Pull» y es un ejercicio—. Si no, puede
       ser el nombre de uno que se escribe en renglones; y si tampoco, se
       ignora: son los títulos, las notas sueltas y las líneas de adorno. */
    const siguiente = siguienteConTexto(i);
    const tieneSeriesDebajo = Boolean(siguiente && renglonDeSerie(siguiente)?.series);
    const nombre = tieneSeriesDebajo ? null : nombreDelDiaEnLinea(linea);
    if (nombre) {
      actual = { name: nombre, exercises: [] };
      dias.push(actual);
      pendiente = null;
      return;
    }

    pendiente = puedeSerNombre(linea)
      ? String(linea).replace(/^[\s\-–•*·\d.)]+/, '').replace(/[\s:,\-–]+$/, '').trim()
      : null;
  });

  return dias.filter((d) => d.exercises.length > 0);
};

/* ══ Modo tabla ════════════════════════════════════════════════════════════ */

/** Las filas de cabecera de la hoja: cada una abre un bloque. */
const filasDeCabecera = (grid) =>
  grid.map((f, i) => (headerIndex(f, RE_NOMBRE) >= 0 ? i : -1)).filter((i) => i >= 0);

/**
 * Dónde empieza el registro semanal, para no leerlo como si fuera plan.
 *
 * En la familia «series» el plan está a la IZQUIERDA y las semanas registradas
 * se van añadiendo a la derecha, que es como crece una hoja. Sin este corte, el
 * RIR objetivo de una hoja de veinte semanas se lee del primer bloque de
 * registro en lugar de la columna del plan.
 *
 * ══ Qué se corrigió aquí, y por qué importa ════════════════════════════════
 *
 * La primera versión buscaba la palabra «PESO» y cortaba en su primera
 * aparición si salía más de una vez. Funcionaba con la hoja que teníamos
 * delante y no garantizaba nada más: bastaba una hoja en inglés, o una que
 * llamara a esa columna «Carga usada», para que el corte no ocurriera.
 *
 * Ahora el corte lo decide `headerPeriod`, que busca **dónde la fila empieza a
 * repetirse**. Es la misma idea dicha sin vocabulario: un registro semanal es
 * un bloque de columnas repetido, se llame como se llame y esté en el idioma
 * que esté. La palabra «PESO» ya no aparece en esta decisión.
 *
 * ══ Dónde NO se puede usar, y por qué ══════════════════════════════════════
 *
 * El principio de un tramo repetido es ambiguo por construcción. Si el plan
 * termina en `RIR` y cada semana registrada empieza por `Peso … RIR`, la fila
 * dice `RIR Peso S1 S2 S3 RIR Peso S1 S2 S3 …`: se repite igual empezando por el
 * `RIR` del plan que por el primer `Peso`, y no hay forma de saber cuál de los
 * dos es el borde de verdad. Cortar por el primero se lleva el RIR objetivo.
 *
 * Por eso este corte NO decide dónde está cada columna del plan. Para eso vale
 * algo más simple y que no puede equivocarse: **la primera aparición de cada
 * rótulo**, que es la del plan porque el registro se añade a la derecha. El
 * corte queda solo para lo que de verdad lo necesita — el respaldo que busca
 * columnas de repeticiones sin que ningún rótulo diga «rango», que sin él
 * recoge las veinte semanas de registro.
 */
const limiteDelPlan = (cabecera) => headerPeriod(cabecera)?.start ?? Number.POSITIVE_INFINITY;

/*
  Cómo se llama la primera columna del registro: «SERIE 1 (CARGA/REPS)», «W1»,
  «SEMANA 1», «PESO», «RENDIMIENTO». Es el otro corte, el que no necesita que el
  bloque se repita tres veces —una hoja recortada, o con una sola semana
  apuntada, no se repite—, y el que impide que la columna «NOTAS» de la semana
  1, donde escribe el CLIENTE, se lea como la indicación del entrenador.
*/
const RE_REGISTRO =
  /^(serie\s*\d+|s\d+|set\s*\d+|semana\s*\d+|week\s*\d+|w\d+|peso|kgs?|carga|rendimiento|registro|training\s*log|diario)\b/i;

/** Dónde empieza el registro, mirando a la derecha de las columnas del plan. */
const inicioDelRegistro = (cabecera, desde) => {
  const porRotulo = cabecera.findIndex((c, i) => i > desde && RE_REGISTRO.test(c));
  return Math.min(limiteDelPlan(cabecera), porRotulo >= 0 ? porRotulo : Number.POSITIVE_INFINITY);
};

/** Las columnas de objetivo de repeticiones, con las que trae una cabecera combinada. */
const columnasDeObjetivo = (grid, filaCabecera, cuerpo, familia) => {
  const cabecera = grid[filaCabecera];

  /* La palabra «rango» es la señal más fiable de que una columna es OBJETIVO y
     no registro, así que se busca primero — y también en las filas de encima,
     porque en la familia «bloques» el rótulo vive en la fila de «Serie 1». */
  let raices = headerIndexes(cabecera, RE_RANGO);
  if (!raices.length && familia === 'bloques') {
    for (let r = filaCabecera - 1; r >= Math.max(0, filaCabecera - 3); r -= 1) {
      const arriba = headerIndexes(grid[r], RE_RANGO);
      if (arriba.length) {
        raices = arriba;
        break;
      }
    }
  }
  /* El respaldo: ninguna columna dice «rango», así que valen las que dicen
     «reps». Es el único sitio donde hace falta el corte del registro: `REPS` se
     repite una vez por semana, y sin él entrarían las veinte. */
  if (!raices.length) {
    const limite = limiteDelPlan(cabecera);
    raices = headerIndexes(cabecera, RE_REPS).filter((i) => i < limite);
  }
  if (!raices.length) return [];

  /* De cada rótulo salen todas las columnas de su tramo que de verdad traen
     rangos: así se recupera la segunda columna de una cabecera combinada. */
  const columnas = [];
  for (const raiz of raices) {
    const [desde, hasta] = tramoDeCabecera(cabecera, raiz);
    for (let c = desde; c < hasta; c += 1) {
      const valores = columnValues(cuerpo, c);
      if (valores.length && valores.some((v) => esRangoODigito(v) || esquemaDeSeries(v))) columnas.push(c);
    }
  }
  return columnas;
};

/**
 * Una columna POR SERIE, dicha en la fila de debajo de la cabecera.
 *
 *     SERIES │ RANGO DE REPETICIONES ──────────────────────────────── │
 *            │ REPETICIONES │ RIR │ REPETICIONES │ RIR │ REPETICIONES │ RIR
 *       3    │     7-9      │  0  │     7-9      │  0  │    10-12     │  0
 *
 * Eso es un top set y dos back-offs —o tres series iguales si las tres dicen
 * lo mismo—, y NO tres objetivos alternativos entre los que elegir. La señal es
 * la sub-cabecera: el mismo rótulo de repeticiones repetido, cada uno con su
 * RIR al lado. Sin ella no se puede distinguir de una hoja que pone «8-10» para
 * las primeras semanas y «10-12» para las últimas, y ese caso sigue
 * preguntándose.
 *
 * @returns `{ reps: [col], rir: [col | -1] }` en el orden de las series, o `null`.
 */
const columnasPorSerie = (grid, filaCabecera, colNombre) => {
  const cabecera = grid[filaCabecera];
  const sub = grid[filaCabecera + 1];
  if (!sub) return null;
  /* Si la fila de debajo tiene nombre, es el primer ejercicio y no una sub-cabecera. */
  if (hasWords(valorEnTramo(sub, cabecera, colNombre))) return null;

  /* Dentro del tramo del rótulo de objetivo, si lo hay: a la derecha la misma
     fila puede repetir «REPS» una vez por semana registrada. */
  const raiz = headerIndex(cabecera, RE_RANGO);
  const [desde, hasta] = raiz >= 0 ? tramoDeCabecera(cabecera, raiz) : [0, limiteDelPlan(cabecera)];
  const dentro = (c) => c >= desde && c < hasta;

  const reps = headerIndexes(sub, RE_REPS).filter(dentro);
  if (reps.length < 2) return null;

  const rires = headerIndexes(sub, RE_RIR).filter(dentro);
  const rir = reps.map((c, i) => rires.find((r) => r > c && r < (reps[i + 1] ?? hasta)) ?? -1);
  return { reps, rir };
};

/** Las columnas del plan terminan donde termina la última que se ha reconocido. */
const finDelPlan = (cabecera, columnas) => {
  const conocidas = columnas.filter((c) => c >= 0);
  if (!conocidas.length) return Number.POSITIVE_INFINITY;
  return tramoDeCabecera(cabecera, Math.max(...conocidas))[1];
};

/** Todas las indicaciones de una fila, juntas y sin las que no dicen nada. */
const notaDeFila = (fila, cabecera, columnas) => {
  const partes = columnas
    .map((c) => valorEnTramo(fila, cabecera, c).trim())
    .filter((v) => v && !RE_NOTA_VACIA.test(v));
  return [...new Set(partes)].join(' · ');
};

/** Un bloque de tabla —una cabecera y sus filas— convertido en días. */
const parsearBloque = (grid, filaCabecera, filaFin, nombreHeredado = null) => {
  const cabecera = grid[filaCabecera];
  const colNombre = headerIndex(cabecera, RE_NOMBRE);
  const colSeries = headerIndex(cabecera, RE_SERIES);

  /* Un ejercicio tiene nombre, y un nombre tiene letras. Con eso se caen solas
     las filas de resumen que la propia hoja deja debajo de la tabla
     («SERIES │ 0 │ 0 │ 5 │ …»), sin tener que reconocerlas una a una. */
  const cuerpo = grid.slice(filaCabecera + 1, filaFin).filter((f) => {
    const nombre = valorEnTramo(f, cabecera, colNombre);
    return hasWords(nombre) && !RE_RESUMEN.test(nombre);
  });
  if (!cuerpo.length) return [];

  const familia = colSeries >= 0 ? 'series' : 'bloques';
  /*
    La primera aparición de un rótulo es la del PLAN, porque el registro se
    añade a la derecha. No hace falta saber dónde acaba el plan para eso, y
    saberlo mal —el borde de un tramo repetido es ambiguo, ver `limiteDelPlan`—
    costaba el RIR objetivo en las hojas cuyo plan termina justo en `RIR`.
  */
  const existe = (i) => i >= 0;

  const porSerie = familia === 'series' ? columnasPorSerie(grid, filaCabecera, colNombre) : null;
  const colsObjetivo = porSerie ? porSerie.reps : columnasDeObjetivo(grid, filaCabecera, cuerpo, familia);
  /* Todas las columnas de indicaciones, no solo la primera: «Técnica», «Tipo de
     serie» y «Tips» dicen cosas distintas y una plantilla puede traer las tres. */
  const registro =
    familia === 'series'
      ? inicioDelRegistro(cabecera, Math.max(colNombre, colSeries, ...colsObjetivo))
      : Number.POSITIVE_INFINITY;
  const colsNota = headerIndexes(cabecera, RE_NOTA).filter((c) => c < registro);
  const colDia = headerIndex(cabecera, RE_DIA_COLUMNA);

  /*
    El RIR del plan, y solo el del plan. En la familia «bloques» el RIR vive
    DENTRO de cada bloque de serie junto a los kilos: ahí es lo que el cliente
    anotó, no lo que se le pidió, así que no se trae.
  */
  const colRir = familia === 'series' ? headerIndex(cabecera, RE_RIR) : -1;

  /* La columna del músculo suele no tener rótulo —va pegada al nombre— así que
     cuando la cabecera no la nombra se busca por contenido. */
  const colMusculoRotulada = headerIndex(cabecera, RE_MUSCULO);
  const colMusculo =
    colMusculoRotulada >= 0
      ? colMusculoRotulada
      : bestColumn(cuerpo, esMusculo, { exclude: [colNombre, colSeries, ...colsObjetivo] });

  /*
    ══ El nombre se dice una vez y vale para lo que viene debajo ═════════════

    Una hoja de seguimiento escribe «ENTRENAMIENTO … Torso» arriba del todo y
    repite la tabla veinticinco veces, una por fecha, sin volver a nombrarla.
    Solo el primer bloque encuentra nombre, y sin heredarlo los otros
    veinticuatro serían días distintos «sin nombre» que ya no se pueden juntar
    con el primero.

    El riesgo asumido es el contrario —cinco días distintos de los que solo el
    primero está rotulado acabarían llamándose los cinco igual—, y se asume
    porque es raro (quien tiene cinco días los nombra) y porque se ve: el nombre
    de cada día sale escrito y editable en la previsualización antes de crear
    nada.
  */
  const porDia = new Map();
  const hasta = Math.min(
    registro,
    finDelPlan(cabecera, [colNombre, colSeries, ...colsObjetivo, ...colsNota, colRir, colMusculo])
  );
  const nombreBase = nombreDelDiaArriba(grid, filaCabecera, hasta) ?? nombreHeredado;

  for (const fila of cuerpo) {
    const name = valorEnTramo(fila, cabecera, colNombre).trim();

    /* Cuántas series y con qué objetivo, según la familia. */
    let sets = 0;
    let objetivosPorColumna = [];
    let rirs = null;

    if (familia === 'series') {
      const celda = valorEnTramo(fila, cabecera, colSeries);
      /* «1x6-8 / 2x8-10» también puede venir en la columna de SERIES. */
      const esquemaEnSeries = esquemaDeSeries(celda);
      const nxm = RE_NXM.exec(celda);
      sets = esquemaEnSeries ? esquemaEnSeries.length : nxm ? Number.parseInt(nxm[1], 10) : Number.parseInt(celda, 10);
      if (!esNumeroDeSeries(sets)) continue;

      if (esquemaEnSeries && esquemaEnSeries.length > 1) {
        objetivosPorColumna = [esquemaEnSeries.map((s) => s.target)];
        if (esquemaEnSeries.some((s) => s.rir)) rirs = esquemaEnSeries.map((s) => s.rir);
      } else if (porSerie) {
        /* Una columna por serie: la serie n es la columna n. */
        const reps = porSerie.reps.map((c) => {
          const v = (fila[c] || '').trim();
          return esRangoODigito(v) ? v : '';
        });
        objetivosPorColumna = [arrastrar(reps, sets)];
        const valoresRir = porSerie.rir.map((c) => (c >= 0 && esRir(fila[c]) ? fila[c].trim() : ''));
        if (valoresRir.some(Boolean)) rirs = arrastrar(valoresRir, sets);
      } else {
        const candidatos = [];
        if (nxm) candidatos.push(Array.from({ length: sets }, () => nxm[2].replace(/\s+/g, '')));
        for (const c of colsObjetivo) {
          const v = (fila[c] || '').trim();
          /* «1 x 6-8 / 1 x 8-10» en la columna de repeticiones: el esquema manda
             sobre el recuento, que es donde la hoja se equivoca cuando se
             equivoca — lo que se escribe a mano es el esquema. */
          const esquema = esquemaDeSeries(v);
          if (esquema && esquema.length > 1) {
            sets = esquema.length;
            candidatos.push(esquema.map((s) => s.target));
            if (!rirs && esquema.some((s) => s.rir)) rirs = esquema.map((s) => s.rir);
          } else if (esquema) {
            candidatos.push(Array.from({ length: sets }, () => esquema[0].target));
          } else if (piramide(v, sets)) {
            candidatos.push(piramide(v, sets));
          } else if (esRangoODigito(v)) {
            candidatos.push(Array.from({ length: sets }, () => v));
          }
        }
        objetivosPorColumna = candidatos.length
          ? candidatos.map((lista) => arrastrar(lista, sets))
          : [Array.from({ length: sets }, () => '')];
      }
    } else {
      const porSerie = colsObjetivo.map((c) => fila[c] || '');
      const conValor = porSerie.filter((v) => esRangoODigito(v));
      sets = conValor.length;
      if (!sets) continue;
      objetivosPorColumna = [conValor];
    }

    const crudo = colMusculo >= 0 ? (fila[colMusculo] || '').trim() : '';
    const musculo = normalizeMuscle(crudo);

    const clave = colDia >= 0 ? valorEnTramo(fila, cabecera, colDia).trim() || nombreBase : nombreBase;
    if (!porDia.has(clave)) porDia.set(clave, { name: clave || null, exercises: [] });

    porDia.get(clave).exercises.push({
      name,
      muscle: musculo?.muscle ?? 'Otros',
      muscleRaw: crudo,
      muscleSure: Boolean(musculo?.sure),
      sets,
      targetOptions: objetivosPorColumna,
      rir: existe(colRir) ? (fila[colRir] || '').trim() : rirs?.find(Boolean) || '',
      /* Solo cuando la hoja da un RIR por serie; si no, vale el de arriba para todas. */
      ...(rirs?.some(Boolean) && !existe(colRir) ? { rirs } : {}),
      note: notaDeFila(fila, cabecera, colsNota),
    });
  }

  return [...porDia.values()].filter((d) => d.exercises.length > 0);
};

/**
 * Una tabla sin ninguna cabecera reconocible: se clasifica por contenido.
 *
 * Es la red de seguridad para la hoja que no hemos visto. Con que se acierte la
 * columna del nombre y una de las dos que dicen cuántas series hay, ya se puede
 * proponer algo — y lo que salga mal se corrige en la previsualización, que para
 * eso está.
 */
const parsearSinCabecera = (grid) => {
  const colMusculo = bestColumn(grid, esMusculo);
  const colSeries = bestColumn(grid, esNumeroDeSeries, { min: 0.7, exclude: [colMusculo] });
  const colObjetivo = bestColumn(grid, esRango, { min: 0.5, exclude: [colMusculo, colSeries] });
  const colNombre = bestColumn(
    grid,
    (v) => hasWords(v) && v.length >= 4 && !esMusculo(v) && !esRango(v),
    { min: 0.6, exclude: [colMusculo, colSeries, colObjetivo] }
  );

  if (colNombre < 0 || (colSeries < 0 && colObjetivo < 0)) return [];

  const dias = [];
  let actual = null;

  for (const fila of grid) {
    const name = (fila[colNombre] || '').trim();
    const sets = Number.parseInt(fila[colSeries] || '', 10);

    if (!hasWords(name) || RE_RESUMEN.test(name) || !esNumeroDeSeries(sets)) {
      /* Una fila con una sola celda entre ejercicios es la cabecera de un día. */
      const conTexto = fila.filter((c) => c !== '');
      const nombreDia = conTexto.length === 1 ? nombreDelDiaEnLinea(conTexto[0]) : null;
      if (nombreDia) {
        actual = { name: nombreDia, exercises: [] };
        dias.push(actual);
      }
      continue;
    }

    if (!actual) {
      actual = { name: null, exercises: [] };
      dias.push(actual);
    }

    const crudo = colMusculo >= 0 ? (fila[colMusculo] || '').trim() : '';
    const musculo = normalizeMuscle(crudo);
    const objetivo = colObjetivo >= 0 ? (fila[colObjetivo] || '').trim() : '';

    actual.exercises.push({
      name,
      muscle: musculo?.muscle ?? 'Otros',
      muscleRaw: crudo,
      muscleSure: Boolean(musculo?.sure),
      sets,
      targetOptions: [Array.from({ length: sets }, () => objetivo)],
      rir: '',
      note: '',
    });
  }

  return dias.filter((d) => d.exercises.length > 0);
};

/* ══ Repetidos ═════════════════════════════════════════════════════════════ */

/**
 * Quita los bloques que son el mismo día otra vez.
 *
 * Una hoja de seguimiento repite la MISMA sesión una vez por fecha —veinticinco
 * bloques idénticos, uno por semana— porque cada uno guarda lo que se levantó
 * ese día. Como los kilos no se traen, los veinticinco son el mismo plan, y
 * meterlos todos crearía veinticinco días iguales.
 *
 * La firma es el plan, no el nombre: dos días llamados «Torso» con ejercicios
 * distintos son dos días de verdad y los dos entran.
 */
const quitarRepetidos = (dias) => {
  const vistos = new Map();
  for (const dia of dias) {
    const firma = `${dia.name || ''}¬${dia.exercises.map((e) => `${e.name}|${e.sets}`).join('¬')}`;
    if (!vistos.has(firma)) vistos.set(firma, dia);
  }
  return [...vistos.values()];
};

/* ══ La entrada ════════════════════════════════════════════════════════════ */

/**
 * Lee una rutina pegada y devuelve los días que ha entendido.
 *
 * `format` dice por qué camino ha salido, que es lo que hay que enseñar cuando
 * el resultado no convence: saber que se ha leído como texto y no como tabla
 * explica de golpe por qué faltan los músculos.
 *
 * `targetChoices` es cuántas columnas de objetivo distintas se han encontrado.
 * Más de una significa que la hoja ofrece dos y hay que preguntar cuál vale.
 */
export const parseRoutineGrid = (rejilla, { lineas = null } = {}) => {
  const grid = trimGrid(rejilla || []);
  if (!grid.length) return { format: null, days: [], targetChoices: 0 };

  let format = null;
  let days = [];

  const cabeceras = filasDeCabecera(grid);
  if (cabeceras.length) {
    let heredado = null;
    for (let i = 0; i < cabeceras.length; i += 1) {
      const bloque = parsearBloque(grid, cabeceras[i], cabeceras[i + 1] ?? grid.length, heredado);
      const conNombre = bloque.findLast((d) => d.name);
      if (conNombre) heredado = conNombre.name;
      days.push(...bloque);
    }
    format = 'tabla';
  }

  if (!days.length && grid.some((f) => f.length > 1)) {
    days = parsearSinCabecera(grid);
    if (days.length) format = 'tabla-sin-cabecera';
  }

  if (!days.length) {
    /* Con el texto original si lo hay: partido por comas como si fuera un CSV
       y vuelto a juntar, «12,5x8» llegaba como «12 5x8» —un registro de kilos
       convertido en un ejercicio de cinco series—. */
    days = parsearTexto(lineas || grid.map((f) => f.filter(Boolean).join(' ')));
    if (days.length) format = 'texto';
  }

  days = quitarRepetidos(days);

  return {
    format,
    days,
    targetChoices: Math.max(0, ...days.flatMap((d) => d.exercises.map((e) => e.targetOptions.length))),
  };
};

/**
 * Lo mismo, desde texto pegado.
 *
 * Una hoja de un `.xlsx` llega ya troceada y no pasa por aquí: convertirla a TSV
 * para volver a partirla obligaría a escapar los tabuladores que puede haber
 * dentro de una nota, y ese escape mal hecho parte una fila en dos columnas de
 * más y descoloca todas las de su derecha.
 */
export const parseRoutineSheet = (text) =>
  parseRoutineGrid(toGrid(text), {
    lineas: String(text || '').includes('\t') ? null : String(text || '').split(/\r\n?|\n/),
  });

/**
 * Varias hojas de un mismo libro, unidas en una sola lectura.
 *
 * ══ Por qué una hoja puede ser un día ══════════════════════════════════════
 *
 * Hay quien reparte la rutina en pestañas: «Día 1», «Día 2», «Día 3», «Día 4».
 * Dentro de cada una no hay ninguna fila que diga cómo se llama el día —no hace
 * falta, lo dice la pestaña—, así que leída por su cuenta sale un día sin
 * nombre.
 *
 * Por eso, cuando una hoja trae **exactamente un día y sin nombre**, se llama
 * como la pestaña. Con más de uno no se hace: ahí la hoja es un plan completo
 * («Plan de entrenamiento de 5 días») y ponerle su nombre a los cinco los
 * dejaría a todos llamados igual.
 *
 * @param entradas `[{ name, reading }]`, en el orden en que se quieren pegar.
 */
export const mergeSheetReadings = (entradas = []) => {
  const days = [];
  let targetChoices = 0;

  for (const { name, reading } of entradas) {
    if (!reading?.days?.length) continue;
    targetChoices = Math.max(targetChoices, reading.targetChoices || 0);

    const unaHojaUnDia = reading.days.length === 1 && !reading.days[0].name;
    days.push(...(unaHojaUnDia ? [{ ...reading.days[0], name }] : reading.days));
  }

  return { format: days.length ? 'libro' : null, days, targetChoices };
};

/**
 * Un ejercicio leído, convertido en el que guarda la aplicación.
 *
 * `targetIndex` elige entre las columnas de objetivo que traía la hoja. Las
 * series nacen vacías de kilos y repeticiones a propósito: lo que se importa es
 * el plan, y el registro lo escribe quien entrene.
 */
export const toExerciseDraft = (exercise, { targetIndex = 0 } = {}) => {
  const objetivos =
    exercise.targetOptions?.[targetIndex] || exercise.targetOptions?.[0] || [];
  const rir = String(exercise.rir ?? '').trim();
  /* Un RIR por serie cuando la hoja lo daba —«top set a RIR 0, back-offs a
     RIR 2»—, o el mismo para todas. La revisión lo escribe como el objetivo:
     «0 · 2×2» se despliega igual. */
  const rirs = exercise.rirs || leerPorSerie(rir);

  return {
    id: newId('ex'),
    name: exercise.name.trim(),
    muscle: exercise.muscle || 'Otros',
    sets: Array.from({ length: exercise.sets }, (_, i) => ({
      ...emptySet(objetivos[i] ?? objetivos[objetivos.length - 1] ?? ''),
      targetRir: rirs ? String(rirs[i] ?? rirs[rirs.length - 1] ?? '').trim() : rir,
    })),
    /* Sin nota no hay campo: `Exercise.coachNote` es opcional de verdad, y una
       cadena vacía pintaría un hueco en la ficha del cliente. */
    ...(exercise.note ? { coachNote: exercise.note } : {}),
  };
};

/** Los días leídos, listos para insertar. */
export const toDayDrafts = (days, options) =>
  days.map((day, i) => ({
    dayName: (day.name || `Día ${i + 1}`).trim(),
    exercises: day.exercises.map((e) => toExerciseDraft(e, options)),
  }));

/** Cuántos ejercicios se han quedado sin músculo seguro: lo que hay que revisar. */
export const pendingMuscles = (days) =>
  days.flatMap((d) => d.exercises).filter((e) => !e.muscleSure).length;
