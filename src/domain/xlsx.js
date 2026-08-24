/**
 * Leer un `.xlsx` sin dependencias.
 *
 * ══ Por qué se puede sin librería ══════════════════════════════════════════
 *
 * Un `.xlsx` es un ZIP con XML dentro, y el navegador ya trae las dos piezas que
 * hacen falta: `DecompressionStream('deflate-raw')` para descomprimir cada
 * entrada y expresiones regulares para sacar las celdas. La alternativa era
 * SheetJS —cientos de kilobytes al paquete, y su versión al día ya no se publica
 * en npm— para obtener exactamente esto.
 *
 * ══ Las dos trampas, que no son el ZIP ═════════════════════════════════════
 *
 * **1. Excel convierte los rangos en fechas.** Una celda que enseña «8-10» no
 * contiene «8-10»: contiene `46244`, que es el 8 de octubre, porque Excel lo
 * autoconvirtió al escribirlo. Se ve como «8-10» únicamente porque lleva el
 * formato `m-d`. Sin volver a aplicar ese formato, los objetivos de repeticiones
 * de media profesión llegan aquí como números de cinco cifras — y lo peor es que
 * `46244` es un número perfectamente creíble para quien no sepa qué mira.
 *
 * Por eso esto lee `styles.xml` y repinta las fechas. No es un lujo: es la
 * diferencia entre importar la rutina y importar basura con buena pinta.
 *
 * **2. Las celdas vacías vienen autocerradas** (`<c r="A1" s="1"/>`). Una
 * expresión que busque pareja `<c…>…</c>` salta por encima de ella y se lleva el
 * contenido de la celda siguiente, atribuyéndoselo a la anterior. Desplaza media
 * hoja en silencio.
 *
 * ══ Lo que NO cubre, dicho aquí y no en un error del navegador ═════════════
 *
 *   · `.xls` de antes de 2007: es otro formato, binario, y no se parece en nada.
 *   · Ficheros con contraseña.
 *   · ZIP64 (más de 65.535 entradas o 4 GB). Una hoja de rutina no llega.
 *
 * ══ Por qué devuelve rejillas y no texto ═══════════════════════════════════
 *
 * Porque `routineSheet` sabe leer una rejilla, y pasar por un TSV intermedio
 * obligaría a escapar tabuladores que perfectamente puede haber dentro de una
 * nota. Se entrega ya troceado, que además es lo que la hoja era.
 */

const SIN_SOPORTE =
  'Este navegador no puede abrir ficheros .xlsx. Prueba a pegar la rutina, o ábrela en tu hoja de cálculo y guárdala como CSV.';
const NO_ES_XLSX =
  'Ese fichero no es un .xlsx. Si es un .xls antiguo, ábrelo y guárdalo como .xlsx; si es otra cosa, pega la rutina directamente.';

const FIN_DIRECTORIO = 0x06054b50;
const ENTRADA_CENTRAL = 0x02014b50;

/* ── El ZIP ──────────────────────────────────────────────────────────────── */

/**
 * Las entradas del directorio central.
 *
 * Se lee por el FINAL y no por el principio: el directorio central es el único
 * índice fiable de un ZIP —las cabeceras locales pueden mentir sobre el tamaño
 * cuando el fichero se escribió en streaming— y vive al final, detrás de un
 * marcador que hay que buscar hacia atrás porque le puede seguir un comentario.
 */
const leerDirectorio = (dv, bytes) => {
  let fin = -1;
  const limite = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= limite; i -= 1) {
    if (dv.getUint32(i, true) === FIN_DIRECTORIO) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error(NO_ES_XLSX);

  const total = dv.getUint16(fin + 10, true);
  const entradas = new Map();
  let p = dv.getUint32(fin + 16, true);

  for (let i = 0; i < total; i += 1) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== ENTRADA_CENTRAL) throw new Error(NO_ES_XLSX);
    const nombreLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const comentarioLen = dv.getUint16(p + 32, true);
    entradas.set(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nombreLen)), {
      metodo: dv.getUint16(p + 10, true),
      comprimido: dv.getUint32(p + 20, true),
      offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nombreLen + extraLen + comentarioLen;
  }
  return entradas;
};

/** El contenido de una entrada, ya en texto. */
const extraer = async (dv, bytes, entrada) => {
  if (!entrada) return '';
  /* El nombre y los extras se vuelven a medir en la cabecera LOCAL: sus
     longitudes no tienen por qué coincidir con las del directorio central. */
  const desde =
    entrada.offset + 30 + dv.getUint16(entrada.offset + 26, true) + dv.getUint16(entrada.offset + 28, true);
  const crudo = bytes.subarray(desde, desde + entrada.comprimido);

  if (entrada.metodo === 0) return new TextDecoder().decode(crudo);
  if (entrada.metodo !== 8) throw new Error(NO_ES_XLSX);
  if (typeof DecompressionStream === 'undefined') throw new Error(SIN_SOPORTE);

  const flujo = new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flujo).text();
};

/* ── El XML ──────────────────────────────────────────────────────────────── */

/* `&amp;` el último: al revés, `&amp;lt;` se convertiría en `<`. */
const desescapar = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/**
 * Formatos de fecha que Excel trae de fábrica y no declara en `styles.xml`.
 *
 * Solo los de fecha y hora: son los únicos que cambian lo que se lee. Un
 * `0.00` o un porcentaje pueden salir con más decimales de los que se ven, y eso
 * no rompe nada porque de esa columna no sale ningún dato del plan.
 */
const FORMATOS_DE_FABRICA = {
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm', 19: 'h:mm:ss', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm',
  45: 'mm:ss', 46: 'h:mm:ss', 47: 'mm:ss',
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El formato de cada estilo, por su índice en `cellXfs`. */
const leerFormatos = (styles) => {
  if (!styles) return [];

  const propios = {};
  for (const m of styles.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    propios[m[1]] = desescapar(m[2]);
  }

  const bloque = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] || '';
  return [...bloque.matchAll(/<xf\b([^>]*)>/g)].map((m) => {
    const id = /numFmtId="(\d+)"/.exec(m[1])?.[1];
    if (id == null) return '';
    return propios[id] ?? FORMATOS_DE_FABRICA[Number(id)] ?? '';
  });
};

/** ¿Este formato pinta una fecha? Lleva d/m/y y no lleva marcas de número. */
const esFormatoDeFecha = (fmt) => Boolean(fmt) && /[dmy]/i.test(fmt) && !/[#0%]/.test(fmt);

const dosDigitos = (n) => String(n).padStart(2, '0');

/**
 * Una fecha de Excel, escrita como la enseña Excel.
 *
 * El día 25569 es el 1 de enero de 1970, que es lo que convierte una serie en un
 * instante. Todo en UTC: con la hora local, un `46244` en un huso al oeste de
 * Greenwich retrocede un día y «8-10» se lee «7-10».
 *
 * El orden de los reemplazos importa —los literales entrecomillados primero,
 * después lo largo (`yyyy`, `mmm`) y al final lo corto— porque si no, la `m` de
 * `mmm` se sustituiría dentro de su propia palabra.
 */
const pintarFecha = (serie, fmt) => {
  const fecha = new Date(Math.round((serie - 25569) * 86400000));
  if (Number.isNaN(fecha.getTime())) return String(serie);

  const dia = fecha.getUTCDate();
  const mes = fecha.getUTCMonth() + 1;
  const anio = fecha.getUTCFullYear();

  return fmt
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/yyyy/gi, String(anio))
    .replace(/yy/gi, dosDigitos(anio % 100))
    .replace(/mmmm|mmm/gi, MESES[mes - 1])
    .replace(/dddd|ddd/gi, '')
    .replace(/dd/g, dosDigitos(dia))
    .replace(/mm/g, dosDigitos(mes))
    .replace(/d/g, String(dia))
    .replace(/m/g, String(mes))
    .replace(/\s+/g, ' ')
    .trim();
};

/** Un número de celda, escrito como se ve. */
const pintarNumero = (crudo, fmt) => {
  const n = Number(crudo);
  if (!Number.isFinite(n)) return String(crudo);
  if (n > 0 && esFormatoDeFecha(fmt)) return pintarFecha(n, fmt);
  /* Un `3` guardado por una fórmula puede volver como `3.0000000001`. Se recorta
     a lo que enseña la hoja, sin arrastrar la basura del coma flotante. */
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
};

/** `B7` → 1. La letra es base 26 sin cero: A=1, Z=26, AA=27. */
const indiceDeColumna = (ref) => {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
};

/*
  La alternancia `\/>|>…<\/c>` es lo que impide que una celda autocerrada se
  trague a la siguiente. Es el fallo silencioso del que habla la cabecera.
*/
const FILA = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELDA = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

/** Una hoja, en rejilla rectangular de cadenas. */
const leerHoja = (xml, cadenas, formatos) => {
  const filas = [];
  let ancho = 0;

  for (const fila of xml.matchAll(FILA)) {
    const numero = Number(/\br="(\d+)"/.exec(fila[1])?.[1] ?? 0) - 1;
    if (numero < 0) continue;

    const celdas = [];
    for (const celda of (fila[2] || '').matchAll(CELDA)) {
      const atributos = celda[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(atributos)?.[1];
      if (!ref) continue;

      const cuerpo = celda[2] || '';
      const tipo = /\bt="([^"]+)"/.exec(atributos)?.[1];
      const estilo = Number(/\bs="(\d+)"/.exec(atributos)?.[1] ?? -1);

      let valor = '';
      if (tipo === 's') {
        const i = /<v>(\d+)<\/v>/.exec(cuerpo)?.[1];
        valor = i == null ? '' : cadenas[Number(i)] ?? '';
      } else if (tipo === 'inlineStr') {
        valor = desescapar([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      } else if (tipo === 'str' || tipo === 'e' || tipo === 'b') {
        valor = desescapar(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? '');
      } else {
        const crudo = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
        valor = crudo == null ? '' : pintarNumero(desescapar(crudo), formatos[estilo] || '');
      }

      const columna = indiceDeColumna(ref);
      celdas[columna] = String(valor).trim();
      if (columna + 1 > ancho) ancho = columna + 1;
    }
    filas[numero] = celdas;
  }

  return Array.from({ length: filas.length }, (_, f) =>
    Array.from({ length: ancho }, (_, c) => filas[f]?.[c] ?? '')
  );
};

/* ── La entrada ──────────────────────────────────────────────────────────── */

/**
 * Un libro entero, con sus hojas en el orden en que están en las pestañas.
 *
 * Se leen TODAS de una vez en lugar de bajo demanda: un libro real de
 * entrenamiento —quince hojas, cinco megas— tarda unos 250 ms enteros, y hacerlo
 * perezoso obligaría a que la pantalla supiera esperar en dos momentos distintos
 * a cambio de nada.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ name: string, rows: string[][] }[]>}
 */
export const readWorkbook = async (buffer) => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(NO_ES_XLSX);

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entradas = leerDirectorio(dv, bytes);
  const dame = (nombre) => extraer(dv, bytes, entradas.get(nombre));

  const xmlCadenas = await dame('xl/sharedStrings.xml');
  const cadenas = [...xmlCadenas.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  );

  const formatos = leerFormatos(await dame('xl/styles.xml'));

  /*
    Qué fichero es cada pestaña. El orden y los nombres están en `workbook.xml`,
    pero la RUTA de cada hoja vive en las relaciones: `sheet1.xml` no tiene por
    qué ser la primera pestaña, y en un libro que ha perdido hojas por el camino
    casi nunca lo es.
  */
  /*
    Cada atributo se busca por su cuenta dentro de su etiqueta, nunca los dos con
    un patrón que imponga un orden.

    Aquí había un fallo de los caros: se leía con `Id="…"[^>]*Target="…"`, que
    exige que `Id` vaya ANTES que `Target`. El orden de los atributos de un XML
    no significa nada y cada generador los escribe como quiere; con uno que los
    ponga al revés, ninguna hoja tiene ruta y el libro entero se lee vacío.
  */
  const relaciones = {};
  for (const m of (await dame('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b([^>]*)>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(m[1])?.[1];
    if (id && target) relaciones[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }

  /*
    Las hojas OCULTAS también salen, marcadas.

    Un libro de plantilla esconde de todo: hojas de cálculo auxiliares, planes
    que el entrenador no usa, versiones antiguas. Descartarlas aquí sería lo
    cómodo y en un libro real se llevaría nueve de quince por delante — incluida
    una que se llama «Plan de Entrenamiento». Si la rutina que alguien quiere
    traer está en una de ellas, no habría forma de llegar a ella ni de saber por
    qué no aparece.

    Así que se entregan con `hidden` y es la pantalla la que decide: se enseñan,
    se dice que están ocultas, y no se marcan solas.
  */
  const pestanas = [...(await dame('xl/workbook.xml')).matchAll(/<sheet\b([^>]*)>/g)]
    .map((m) => ({
      name: desescapar(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? ''),
      /*
        El prefijo del espacio de nombres de relaciones casi siempre es `r`, pero
        es libre, así que se acepta cualquiera —y también `id` a secas—.

        El nombre del atributo tiene que empezar donde empieza un atributo, y de
        ahí el espacio de delante: sin él, `sheetId="1"` también acaba en `id="`
        y la hoja se queda con el número de pestaña por relación.
      */
      rel: /(?:^|\s)(?:[\w-]+:)?id="([^"]*)"/i.exec(m[1])?.[1],
      hidden: /state="(hidden|veryHidden)"/i.test(m[1]),
    }))
    .filter((h) => h.name);

  if (!pestanas.length) throw new Error(NO_ES_XLSX);

  const hojas = [];
  for (let i = 0; i < pestanas.length; i += 1) {
    const pestana = pestanas[i];
    /*
      Si la relación no resuelve, se prueba por posición antes de rendirse. Y si
      tampoco, la pestaña SALE IGUAL con la rejilla vacía.

      Callarse una hoja es lo peor que puede hacer esto: quien no la ve en la
      lista no sabe que le falta, se lleva tres días de los cuatro que tenía y da
      el plan por importado. Una pestaña que aparece diciendo que no trae nada se
      puede mirar; una que no aparece, no.
    */
    const ruta = relaciones[pestana.rel] || `worksheets/sheet${i + 1}.xml`;
    const xml = await dame(`xl/${ruta}`);
    hojas.push({
      name: pestana.name,
      hidden: pestana.hidden,
      rows: xml ? leerHoja(xml, cadenas, formatos) : [],
    });
  }
  return hojas;
};

/** Los nombres de fichero que esto sabe abrir, para el `accept` del selector. */
export const SPREADSHEET_ACCEPT = '.xlsx,.csv,.tsv,.txt,text/csv,text/tab-separated-values';

/** ¿Hay que abrirlo como libro, o es texto y se lee tal cual? */
export const isWorkbookFile = (fileName) => /\.xlsx$/i.test(String(fileName || ''));
