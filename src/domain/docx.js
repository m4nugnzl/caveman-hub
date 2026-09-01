import { abrirZip, desescapar, finDeBloque } from './zip';

/**
 * Leer un `.docx`, sin dependencias.
 *
 * ══ Por qué hay que leer el Word ═══════════════════════════════════════════
 *
 * Porque una parte de la profesión no programa en Excel: escribe la rutina en
 * una tabla de Word y la dieta en una lista, y manda el `.docx`. Mientras hubo
 * un cuadro de pegar, esos planes entraban copiando y pegando —mal, pero
 * entraban—. Al cerrar ese camino, o se lee el fichero o esa gente se queda
 * fuera con un «no sé leer este tipo de fichero» que es verdad y no sirve.
 *
 * Y es barato: un `.docx` es la MISMA caja que un `.xlsx` —un ZIP con XML— y esa
 * caja ya estaba escrita (`domain/zip.js`). Lo único nuevo es qué se busca
 * dentro.
 *
 * ══ Un documento son VARIAS hojas ══════════════════════════════════════════
 *
 * Un Word con la rutina trae normalmente una tabla por día, o una tabla y unas
 * líneas sueltas encima. Devolver un solo bloque de texto obligaría a que el
 * lector de rutinas adivinara dónde termina una tabla y empieza la siguiente, y
 * lo perdería: en texto plano, las columnas de dos tablas distintas se mezclan.
 *
 * Así que cada tabla sale como una REJILLA con su nombre, igual que una pestaña
 * de Excel, y el texto de fuera sale como una hoja más. Quien importa las ve
 * listadas y marca las que son el plan — el mismo mecanismo que ya existía para
 * un libro de quince pestañas.
 *
 * ══ La trampa: las celdas combinadas ═══════════════════════════════════════
 *
 * `<w:gridSpan w:val="3">` es una celda que ocupa tres columnas, y es lo normal
 * en la fila de título de una tabla de Word. Leída como una sola, todo lo que va
 * debajo se desplaza dos columnas a la izquierda y las series acaban en la
 * columna de las repeticiones. Aquí ocupa las tres que dice, con el texto en la
 * primera. Es el mismo fallo silencioso que las celdas autocerradas del `.xlsx`.
 *
 * ══ Lo que NO se lee ═══════════════════════════════════════════════════════
 *
 *   · `.doc` de antes de 2007: es binario, no un ZIP, y no se parece en nada.
 *   · Cuadros de texto, encabezados y pies. Un plan no vive ahí.
 *   · Las tablas anidadas salen dentro de la celda que las contiene, aplanadas.
 */

/*
  Terminan la frase de quien las pinta —«Plan Ana.docx: no es un .docx por
  dentro…»—, así que empiezan en minúscula y sin sujeto.
*/
const SIN_SOPORTE =
  'este navegador no sabe abrir ficheros .docx. Guárdalo en PDF desde Word y tráelo así.';
const NO_ES_DOCX =
  'no es un .docx por dentro, aunque su nombre lo diga. Ábrelo en Word y vuelve a guardarlo.';
const VACIO = 'no tiene texto que pueda leer. ¿Es un documento de solo imágenes?';

/**
 * El texto de un trozo de documento.
 *
 * Se recogen las tres cosas que producen texto y en el orden en que aparecen:
 * `<w:t>` (lo escrito), `<w:tab/>` y `<w:br/>`. Coger solo los `<w:t>` juntaría
 * «4x8-10» con «RIR2» sin nada en medio, porque en Word el tabulador NO es texto
 * dentro de un `<w:t>`: es un elemento hermano.
 *
 * `<w:t/>` vacío y autocerrado no casa con nada y no aporta: correcto.
 */
const PIEZA = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;

const textoDe = (xml) => {
  let salida = '';
  for (const m of xml.matchAll(PIEZA)) {
    if (m[1] !== undefined) salida += desescapar(m[1]);
    else if (m[0].startsWith('<w:tab')) salida += '\t';
    else salida += '\n';
  }
  return salida;
};

/**
 * Los bloques de primer nivel del cuerpo, en orden.
 *
 * Se recorre a mano en vez de con dos expresiones sueltas porque los párrafos de
 * dentro de una tabla NO son bloques del cuerpo: hay que saltar la tabla entera
 * de una vez. `finDeBloque` cuenta los anidados, así que una tabla dentro de una
 * celda no parte a la de fuera por la mitad.
 *
 * `<w:pPr>` y `<w:tblPr>` —las propiedades— empiezan igual que sus bloques y no
 * son ninguno: por eso la etiqueta tiene que terminar en `>` o en un espacio.
 */
const INICIO = /<w:(tbl|p)(?:\s[^>]*)?>/g;

const bloquesDe = (cuerpo) => {
  const salida = [];
  INICIO.lastIndex = 0;
  let m = INICIO.exec(cuerpo);

  while (m) {
    const etiqueta = `w:${m[1]}`;
    const fin = finDeBloque(cuerpo, m.index, etiqueta);
    salida.push({ tipo: m[1], xml: cuerpo.slice(m.index, fin) });
    INICIO.lastIndex = fin;
    m = INICIO.exec(cuerpo);
  }
  return salida;
};

/** Cuántas columnas ocupa esta celda. Casi siempre una. */
const anchoDeCelda = (xml) => {
  const n = Number(/<w:gridSpan\b[^>]*w:val="(\d+)"/.exec(xml)?.[1] ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

/** Una tabla, en rejilla rectangular de cadenas. */
const leerTabla = (xml) => {
  const filas = [];
  let ancho = 0;

  let i = 0;
  const abreFila = /<w:tr(?:\s[^>]*)?>/g;
  abreFila.lastIndex = 0;
  let fila = abreFila.exec(xml);

  while (fila) {
    const finFila = finDeBloque(xml, fila.index, 'w:tr');
    const cuerpoFila = xml.slice(fila.index, finFila);

    const celdas = [];
    const abreCelda = /<w:tc(?:\s[^>]*)?>/g;
    let celda = abreCelda.exec(cuerpoFila);

    while (celda) {
      const finCelda = finDeBloque(cuerpoFila, celda.index, 'w:tc');
      const dentro = cuerpoFila.slice(celda.index, finCelda);

      /* Los párrafos de una celda se juntan con un espacio y no con un salto de
         línea: una rejilla se lee por filas, y una celda con un salto dentro
         partiría la fila en dos al pasar por el lector de rutinas. */
      celdas.push(textoDe(dentro).replace(/\s+/g, ' ').trim());
      /* Y el resto del hueco que ocupa, vacío, para que no se desplace nada. */
      for (let k = 1; k < anchoDeCelda(dentro); k += 1) celdas.push('');

      abreCelda.lastIndex = finCelda;
      celda = abreCelda.exec(cuerpoFila);
    }

    filas[i] = celdas;
    if (celdas.length > ancho) ancho = celdas.length;
    i += 1;

    abreFila.lastIndex = finFila;
    fila = abreFila.exec(xml);
  }

  return filas.map((f) => Array.from({ length: ancho }, (_, c) => f?.[c] ?? ''));
};

/**
 * El documento, en hojas: una por tabla, más una con el texto de fuera.
 *
 * La hoja de texto va PRIMERA cuando la hay porque en un Word el encabezamiento
 * —«Semana 1 · Push/Pull», el objetivo de macros— se escribe antes de la tabla,
 * y ese orden es el que se reconoce al mirar la lista.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<({ name: string, rows: string[][] } | { name: string, texto: string })[]>}
 */
export const readDocx = async (buffer) => {
  const dame = abrirZip(buffer, { roto: NO_ES_DOCX, sinSoporte: SIN_SOPORTE });

  const xml = await dame('word/document.xml');
  if (!xml) throw new Error(NO_ES_DOCX);

  const cuerpo = /<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;

  const tablas = [];
  const parrafos = [];

  for (const bloque of bloquesDe(cuerpo)) {
    if (bloque.tipo === 'tbl') tablas.push(leerTabla(bloque.xml));
    else parrafos.push(textoDe(bloque.xml).trim());
  }

  const texto = parrafos.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const hojas = [];

  if (texto) hojas.push({ name: 'Texto del documento', texto });
  tablas.forEach((rows, i) => {
    if (rows.length) hojas.push({ name: `Tabla ${i + 1}`, rows });
  });

  if (!hojas.length) throw new Error(VACIO);
  return hojas;
};

/** ¿Es el Word de ahora? El de antes de 2007 (`.doc`) es binario y no entra. */
export const isWordFile = (fileName) => /\.docx$/i.test(String(fileName || ''));
