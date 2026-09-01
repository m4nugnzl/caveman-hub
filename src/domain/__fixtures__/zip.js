/**
 * Un ZIP mínimo, para fabricar los ficheros de las pruebas.
 *
 * ══ Por qué se fabrican y no se guardan ════════════════════════════════════
 *
 * Un libro de entrenamiento real pesa cinco megas y no cabe en un repositorio a
 * cambio de nada: lo que hay que probar son casos concretos —esta fecha, esta
 * celda vacía, esta celda combinada— y en un fichero real están enterrados entre
 * quince hojas. Fabricarlos deja escribir exactamente el caso, incluido el que
 * Word o Excel no producirían nunca.
 *
 * ══ Por qué está aquí y no dentro de una prueba ════════════════════════════
 *
 * Porque lo usan dos: el `.xlsx` y el `.docx` son la misma caja —ver
 * `domain/zip.js`—, así que sus pruebas necesitan el mismo constructor. Copiado
 * en las dos, la primera vez que alguien arregle aquí un desplazamiento mal
 * calculado la otra copia se queda con el fallo, y probando otra cosa.
 */

export const bytes = (s) => new TextEncoder().encode(s);

const deflar = async (datos) =>
  new Uint8Array(
    await new Response(
      new Blob([datos]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    ).arrayBuffer()
  );

/**
 * Escribe un ZIP con las entradas dadas.
 *
 * Sin CRC —va a cero— porque el lector no lo comprueba: un ZIP con CRC malo lo
 * rechazaría Excel, pero aquí lo que se prueba es la lectura, y calcularlo
 * costaría una tabla de 256 entradas que no protege de nada.
 */
export const zip = async (ficheros) => {
  const partes = [];
  const central = [];
  let offset = 0;

  for (const f of ficheros) {
    const crudo = bytes(f.content);
    const datos = f.deflate ? await deflar(crudo) : crudo;
    const metodo = f.deflate ? 8 : 0;
    const nombre = bytes(f.name);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, metodo, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, crudo.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(10, metodo, true);
    cen.setUint32(20, datos.length, true);
    cen.setUint32(24, crudo.length, true);
    cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nombre);

    offset += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((n, p) => n + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, ficheros.length, true);
  fin.setUint16(10, ficheros.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida.buffer;
};
