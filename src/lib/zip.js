/**
 * Un ZIP, escrito a mano y sin comprimir.
 *
 * ══ Por qué no una dependencia ══════════════════════════════════════════════
 *
 * Porque lo que se mete dentro son FOTOS, y una foto ya viene comprimida: pasar
 * un JPEG por deflate ahorra entre el cero y el dos por ciento y cuesta todo el
 * tiempo de CPU de la descarga. Sin compresión, un ZIP es un formato de
 * empaquetado: cabecera, bytes tal cual, cabecera, bytes tal cual, y un índice
 * al final. Son ochenta líneas y esas ochenta líneas se leen; las cuatrocientas
 * de una librería de compresión que no se usa, no.
 *
 * ── Lo único que hay que hacer bien es el CRC ───────────────────────────────
 * Un ZIP con el CRC mal abre igual y falla al extraer, que es el peor momento
 * posible para enterarse: el entrenador ya cerró la pestaña. Por eso el CRC
 * tiene su prueba con el vector canónico (`zip.test.js`).
 *
 * ══ La memoria: un archivo cada vez ═════════════════════════════════════════
 *
 * «Descargar todas» de un cliente de dos años son cientos de megas, y tenerlos
 * todos en memoria a la vez es lo que tumba la pestaña. Aquí cada entrada entra
 * como `Blob` —que el navegador respalda en disco cuando le conviene— y solo se
 * lee a bytes el rato que dura calcular su CRC. El pico es UNA foto, no todas.
 *
 * ── Sin ZIP64, y dicho a la cara ────────────────────────────────────────────
 * El formato clásico guarda los tamaños en 32 bits: por encima de 4 GB haría
 * falta ZIP64 y no está escrito. `crearZip` corta antes con un error legible en
 * vez de entregar un archivo corrupto.
 */

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;

/** El nombre va en UTF-8, y el bit 11 de las banderas es quien lo anuncia. */
const BANDERA_UTF8 = 0x0800;

/** Sin comprimir: los bytes van tal cual («stored»). */
const METODO_CRUDO = 0;

/** El techo del formato clásico. Ver la cabecera. */
export const MAX_ZIP_BYTES = 4 * 1024 * 1024 * 1024 - 1;

/*
  La tabla del CRC-32 (polinomio 0xEDB88320), calculada una vez al cargar el
  módulo. Son 256 enteros: escribirla a mano en el fuente sería un muro de
  números que nadie puede revisar.
*/
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

/** CRC-32 de una secuencia de bytes, como entero sin signo. */
export const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

/*
  La fecha, en el formato de MS-DOS de 1980, que es lo que el ZIP guarda: la
  hora en 16 bits con los segundos de dos en dos, y el año como distancia desde
  1980. Nada anterior a esa fecha se puede representar, así que se sujeta.
*/
const fechaDos = (d) => {
  const anio = Math.max(1980, d.getFullYear());
  return ((anio - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
};

const horaDos = (d) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);

/** Escritor de campos en orden y en little-endian, que es como el ZIP los pide. */
class Campos {
  constructor(tamano) {
    this.vista = new DataView(new ArrayBuffer(tamano));
    this.bytes = new Uint8Array(this.vista.buffer);
    this.pos = 0;
  }

  u16(valor) {
    this.vista.setUint16(this.pos, valor, true);
    this.pos += 2;
    return this;
  }

  u32(valor) {
    this.vista.setUint32(this.pos, valor >>> 0, true);
    this.pos += 4;
    return this;
  }

  crudo(bytes) {
    this.bytes.set(bytes, this.pos);
    this.pos += bytes.length;
    return this;
  }
}

/**
 * Empaqueta archivos en un `Blob` de tipo ZIP.
 *
 * @param entradas  `[{ nombre, datos, fecha }]`. `nombre` puede llevar barras
 *   —«semana-01/frontal.jpg»— y entonces el descompresor crea la carpeta.
 *   `datos` es un `Blob`, un `ArrayBuffer` o un `Uint8Array`.
 * @param onProgreso  `(hechas, total) => void`, para la barra de quien espera.
 * @returns Un `Blob` listo para descargar.
 */
export const crearZip = async (entradas = [], onProgreso = null) => {
  const codificador = new TextEncoder();
  const partes = [];
  const indice = [];
  let desplazamiento = 0;

  for (let i = 0; i < entradas.length; i += 1) {
    const { nombre, datos, fecha } = entradas[i];
    const nombreBytes = codificador.encode(nombre);

    /*
      Se lee a bytes SOLO para el CRC, y el `Blob` original es lo que se
      empaqueta: así el buffer queda libre para el recolector antes de pasar al
      siguiente archivo. Ver la nota de memoria de la cabecera.
    */
    const blob = datos instanceof Blob ? datos : new Blob([datos]);
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
    const tamano = blob.size;

    if (desplazamiento + tamano > MAX_ZIP_BYTES) {
      throw new Error('Son demasiados archivos para un solo ZIP (el formato no pasa de 4 GB).');
    }

    const cuando = fecha instanceof Date && !Number.isNaN(fecha.valueOf()) ? fecha : new Date();
    const hora = horaDos(cuando);
    const dia = fechaDos(cuando);

    const local = new Campos(30 + nombreBytes.length)
      .u32(FIRMA_LOCAL)
      .u16(20) // versión necesaria para extraer
      .u16(BANDERA_UTF8)
      .u16(METODO_CRUDO)
      .u16(hora)
      .u16(dia)
      .u32(crc)
      .u32(tamano) // comprimido
      .u32(tamano) // original: el mismo, no se comprime
      .u16(nombreBytes.length)
      .u16(0) // sin campo extra
      .crudo(nombreBytes);

    partes.push(local.bytes, blob);
    indice.push({ nombreBytes, crc, tamano, hora, dia, desplazamiento });
    desplazamiento += local.bytes.length + tamano;

    if (onProgreso) onProgreso(i + 1, entradas.length);
  }

  /* El índice central: la copia de cada cabecera más DÓNDE está su archivo. Es
     lo que lee el descompresor para enseñar el contenido sin recorrerlo entero. */
  const inicioIndice = desplazamiento;
  let tamanoIndice = 0;

  for (const e of indice) {
    const central = new Campos(46 + e.nombreBytes.length)
      .u32(FIRMA_CENTRAL)
      .u16(20) // versión del que lo escribió
      .u16(20) // versión necesaria
      .u16(BANDERA_UTF8)
      .u16(METODO_CRUDO)
      .u16(e.hora)
      .u16(e.dia)
      .u32(e.crc)
      .u32(e.tamano)
      .u32(e.tamano)
      .u16(e.nombreBytes.length)
      .u16(0) // extra
      .u16(0) // comentario
      .u16(0) // disco
      .u16(0) // atributos internos
      .u32(0) // atributos externos
      .u32(e.desplazamiento)
      .crudo(e.nombreBytes);

    partes.push(central.bytes);
    tamanoIndice += central.bytes.length;
  }

  const fin = new Campos(22)
    .u32(FIRMA_FIN)
    .u16(0) // este disco
    .u16(0) // disco donde empieza el índice
    .u16(indice.length)
    .u16(indice.length)
    .u32(tamanoIndice)
    .u32(inicioIndice)
    .u16(0); // sin comentario

  partes.push(fin.bytes);

  return new Blob(partes, { type: 'application/zip' });
};
