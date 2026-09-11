import { describe, expect, it } from 'vitest';

import { crc32, crearZip } from './zip';

const bytes = (texto) => new TextEncoder().encode(texto);

describe('crc32', () => {
  /*
    Los dos vectores canónicos del CRC-32. Están aquí porque es lo ÚNICO que un
    ZIP sin comprimir puede tener mal de una forma que no se nota: el archivo
    abre, se ve el listado, y falla al extraer.
  */
  it('da el valor canónico de «123456789»', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('da el valor canónico de la frase del zorro', () => {
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('el vacío es cero', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('crearZip', () => {
  const leer = async (blob) => new Uint8Array(await blob.arrayBuffer());
  const u32 = (b, i) => new DataView(b.buffer, b.byteOffset).getUint32(i, true);
  const u16 = (b, i) => new DataView(b.buffer, b.byteOffset).getUint16(i, true);

  it('escribe una cabecera local por archivo y un índice al final', async () => {
    const zip = await crearZip([
      { nombre: 'semana-01/frontal.jpg', datos: bytes('uno'), fecha: new Date('2026-03-02T10:00:00') },
      { nombre: 'semana-02/frontal.jpg', datos: bytes('dos mil'), fecha: new Date('2026-03-09T10:00:00') },
    ]);

    const b = await leer(zip);

    expect(zip.type).toBe('application/zip');
    expect(u32(b, 0)).toBe(0x04034b50); // arranca con una cabecera local

    /* El fin del índice central es lo último, y dice cuántas entradas hay. */
    const fin = b.length - 22;
    expect(u32(b, fin)).toBe(0x06054b50);
    expect(u16(b, fin + 8)).toBe(2);
    expect(u16(b, fin + 10)).toBe(2);

    /* Y dónde empieza el índice: ahí tiene que haber una cabecera central. */
    const inicioIndice = u32(b, fin + 16);
    expect(u32(b, inicioIndice)).toBe(0x02014b50);
    expect(u32(b, fin + 12)).toBe(b.length - 22 - inicioIndice);
  });

  it('guarda el CRC y el tamaño reales de cada archivo', async () => {
    const contenido = bytes('The quick brown fox jumps over the lazy dog');
    const zip = await crearZip([{ nombre: 'zorro.txt', datos: contenido }]);
    const b = await leer(zip);

    expect(u32(b, 14)).toBe(0x414fa339);
    expect(u32(b, 18)).toBe(contenido.length); // comprimido
    expect(u32(b, 22)).toBe(contenido.length); // original: no se comprime
    expect(u16(b, 8)).toBe(0); // método «crudo»
  });

  it('escribe el nombre en UTF-8 y lo anuncia en las banderas', async () => {
    const zip = await crearZip([{ nombre: 'josé-señal.jpg', datos: bytes('x') }]);
    const b = await leer(zip);

    const largo = u16(b, 26);
    const nombre = new TextDecoder().decode(b.slice(30, 30 + largo));
    expect(nombre).toBe('josé-señal.jpg');
    expect(u16(b, 6) & 0x0800).toBe(0x0800);
  });

  it('acepta un Blob sin leerlo dos veces', async () => {
    const zip = await crearZip([{ nombre: 'a.bin', datos: new Blob([bytes('hola')]) }]);
    const b = await leer(zip);
    expect(u32(b, 22)).toBe(4);
  });

  it('avisa del progreso una vez por archivo', async () => {
    const pasos = [];
    await crearZip(
      [
        { nombre: 'a', datos: bytes('a') },
        { nombre: 'b', datos: bytes('b') },
      ],
      (hechas, total) => pasos.push([hechas, total])
    );
    expect(pasos).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('un ZIP sin archivos sigue siendo un ZIP válido', async () => {
    const zip = await crearZip([]);
    const b = await leer(zip);
    expect(b.length).toBe(22);
    expect(u32(b, 0)).toBe(0x06054b50);
  });
});
