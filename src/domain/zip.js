/**
 * Abrir un ZIP y sacar sus entradas, sin dependencias.
 *
 * ══ Por qué existe separado ════════════════════════════════════════════════
 *
 * Porque un `.xlsx` y un `.docx` son la MISMA caja: un ZIP con XML dentro, del
 * mismo consorcio y con el mismo formato de contenedor. Esto vivía dentro de
 * `xlsx.js` —que fue quien lo necesitó primero— y al llegar el Word había dos
 * caminos: importar el lector de hojas de cálculo para leer un documento de
 * texto, o copiar setenta líneas de aritmética de desplazamientos. El segundo
 * se paga solo la primera vez que alguien arregla un ZIP raro en una copia y no
 * en la otra.
 *
 * El navegador ya trae la pieza difícil —`DecompressionStream('deflate-raw')`—,
 * así que lo que queda aquí es leer el índice y cortar por los sitios buenos.
 *
 * ══ Lo que NO cubre ════════════════════════════════════════════════════════
 *
 *   · ZIP64 (más de 65.535 entradas o 4 GB). Ni una rutina ni una dieta llegan.
 *   · Ficheros con contraseña.
 *   · El CRC no se comprueba. Lo que llega aquí lo ha escrito Excel o Word, y
 *     un fichero corrupto de verdad falla igualmente al descomprimir.
 */

const FIN_DIRECTORIO = 0x06054b50;
const ENTRADA_CENTRAL = 0x02014b50;

/**
 * Las entradas del directorio central.
 *
 * Se lee por el FINAL y no por el principio: el directorio central es el único
 * índice fiable de un ZIP —las cabeceras locales pueden mentir sobre el tamaño
 * cuando el fichero se escribió en streaming— y vive al final, detrás de un
 * marcador que hay que buscar hacia atrás porque le puede seguir un comentario.
 */
const leerDirectorio = (dv, bytes, roto) => {
  let fin = -1;
  const limite = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= limite; i -= 1) {
    if (dv.getUint32(i, true) === FIN_DIRECTORIO) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error(roto);

  const total = dv.getUint16(fin + 10, true);
  const entradas = new Map();
  let p = dv.getUint32(fin + 16, true);

  for (let i = 0; i < total; i += 1) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== ENTRADA_CENTRAL) throw new Error(roto);
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
const extraer = async (dv, bytes, entrada, mensajes) => {
  if (!entrada) return '';
  /* El nombre y los extras se vuelven a medir en la cabecera LOCAL: sus
     longitudes no tienen por qué coincidir con las del directorio central. */
  const desde =
    entrada.offset + 30 + dv.getUint16(entrada.offset + 26, true) + dv.getUint16(entrada.offset + 28, true);
  const crudo = bytes.subarray(desde, desde + entrada.comprimido);

  if (entrada.metodo === 0) return new TextDecoder().decode(crudo);
  if (entrada.metodo !== 8) throw new Error(mensajes.roto);
  if (typeof DecompressionStream === 'undefined') throw new Error(mensajes.sinSoporte);

  const flujo = new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flujo).text();
};

/**
 * Abre el ZIP y devuelve con qué pedirle una entrada por su ruta.
 *
 * Los mensajes los pone quien llama porque el error lo lee un entrenador, no un
 * programador: «esto no es un .xlsx» y «esto no es un .docx» se arreglan de
 * maneras distintas, y aquí dentro no hay forma de saber cuál de las dos tocaba.
 * Una ruta que no está en el ZIP devuelve cadena vacía, no un error: hay partes
 * opcionales —los estilos de un libro sin formatos— cuya ausencia es normal.
 *
 * @param {ArrayBuffer} buffer
 * @param {{ roto: string, sinSoporte: string }} mensajes
 * @returns {(ruta: string) => Promise<string>}
 */
export const abrirZip = (buffer, mensajes) => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(mensajes.roto);

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entradas = leerDirectorio(dv, bytes, mensajes.roto);

  return (ruta) => extraer(dv, bytes, entradas.get(ruta), mensajes);
};

/* `&amp;` el último: al revés, `&amp;lt;` se convertiría en `<`. */
export const desescapar = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/**
 * Dónde termina el bloque que empieza en `inicio`, contando los anidados.
 *
 * Hace falta porque en un `.docx` una tabla puede tener otra tabla dentro de una
 * celda, y una expresión no ávida cortaría en el primer cierre —que es el de la
 * tabla interior—, partiendo la de fuera por la mitad. Lo mismo con las filas.
 *
 * Devuelve la posición SIGUIENTE al cierre, para poder seguir escaneando desde
 * ahí. Un bloque sin cerrar se da por terminado al final del texto, que es lo
 * que deja que un documento truncado se lea a medias en vez de no leerse.
 */
export const finDeBloque = (xml, inicio, etiqueta) => {
  const re = new RegExp(`<${etiqueta}(?:\\s[^>]*)?>|</${etiqueta}>`, 'g');
  re.lastIndex = inicio;
  let nivel = 0;
  let m = re.exec(xml);

  while (m) {
    if (m[0][1] === '/') {
      nivel -= 1;
      if (nivel <= 0) return re.lastIndex;
    } else {
      nivel += 1;
    }
    m = re.exec(xml);
  }
  return xml.length;
};
