import { describe, expect, it } from 'vitest';

import { fechaDeLosBytes } from './fechaDeLaFoto';

/* Un JPEG mínimo con un APP1 Exif: IFD0 con el puntero al IFD Exif y, dentro,
   `DateTimeOriginal`. `le` elige el orden de bytes (II = little endian). */
const jpegConFecha = (fecha, { le = true, soloDateTime = false } = {}) => {
  const tiff = [];
  const u16 = (n) => (le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n) =>
    le ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const texto = [...`${fecha}`].map((c) => c.charCodeAt(0)).concat(0);

  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  if (soloDateTime) {
    // IFD0 (en 8): una entrada DateTime, texto en 8+2+12+4 = 26.
    tiff.push(...u16(1), ...u16(0x0132), ...u16(2), ...u32(texto.length), ...u32(26), ...u32(0));
    tiff.push(...texto);
  } else {
    // IFD0 (en 8): una entrada con el puntero al IFD Exif, que va en 26.
    tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
    // IFD Exif (en 26): DateTimeOriginal, texto en 26+2+12+4 = 44.
    tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(texto.length), ...u32(44), ...u32(0));
    tiff.push(...texto);
  }

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const largo = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, largo >> 8, largo & 0xff, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
};

describe('fechaDeLosBytes', () => {
  it('lee DateTimeOriginal, en los dos órdenes de bytes', () => {
    expect(fechaDeLosBytes(jpegConFecha('2026:09:09 08:14:03'))).toBe('2026-09-09');
    expect(fechaDeLosBytes(jpegConFecha('2026:09:09 08:14:03', { le: false }))).toBe('2026-09-09');
  });

  it('cae a DateTime si no hay la original', () => {
    expect(fechaDeLosBytes(jpegConFecha('2026:08:30 19:00:00', { soloDateTime: true }))).toBe('2026-08-30');
  });

  it('sin EXIF, o con fecha a ceros, o con basura: null', () => {
    expect(fechaDeLosBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBeNull();
    expect(fechaDeLosBytes(jpegConFecha('0000:00:00 00:00:00'))).toBeNull();
    expect(fechaDeLosBytes(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
  });
});
