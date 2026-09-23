/**
 * EL DÍA EN QUE SE HIZO UNA FOTO, si lo trae dentro (EXIF).
 *
 * ══ Para qué, y para qué NO ════════════════════════════════════════════════
 *
 * Al completar una revisión pasada, el cliente sube fotos que hizo a tiempo y
 * no subió. La fecha de la cámara se le ENSEÑA al lado de la foto —«hecha el 9
 * sept»— para que vea si ha elegido la buena. No decide nada: la foto va a la
 * semana desde la que se sube (regla del dueño, 23 sep 2026), y muchas fotos
 * llegan sin fecha —capturas, fotos reenviadas por mensajería, HEIC que el
 * navegador no convierte—, así que bloquear por ella sería castigar al que no
 * tiene la culpa.
 *
 * ── Por qué a mano y no con una librería ──────────────────────────────────
 * Solo hace falta UNA etiqueta de un formato (JPEG): `DateTimeOriginal`, o
 * `DateTime` si no está. Una librería de EXIF entera para esto pesaría más que
 * la pantalla que la usa. Se lee antes de reducir la imagen: `shrinkImage` la
 * repinta en un canvas y el EXIF se pierde por el camino.
 *
 * Nunca lanza: cualquier cosa rara devuelve `null`.
 */

const DATE_TIME_ORIGINAL = 0x9003;
const DATE_TIME = 0x0132;
const EXIF_IFD = 0x8769;

/** «2026:09:09 08:14:03» → «2026-09-09», o `null`. */
const aISO = (texto) => {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(texto || '');
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};

/**
 * Busca la fecha en los bytes de un JPEG. Exportada para las pruebas.
 * @param {ArrayBuffer} buffer
 */
export const fechaDeLosBytes = (buffer) => {
  try {
    const v = new DataView(buffer);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;

    let p = 2;
    while (p + 4 <= v.byteLength) {
      const marca = v.getUint16(p);
      const largo = v.getUint16(p + 2);
      /* APP1 con «Exif\0\0» delante: ahí viven las etiquetas. */
      if (marca === 0xffe1 && v.getUint32(p + 4) === 0x45786966) {
        return leerExif(v, p + 10);
      }
      if ((marca & 0xff00) !== 0xff00 || largo < 2) return null;
      p += 2 + largo;
    }
    return null;
  } catch {
    /* Un archivo cortado o raro no tiene fecha que leer: `null` es la
       respuesta, no un error que enseñar. */
    return null;
  }
};

const leerExif = (v, tiff) => {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(o, le);
  const u32 = (o) => v.getUint32(o, le);

  const etiquetas = (ifd) => {
    const salida = new Map();
    const n = u16(ifd);
    for (let i = 0; i < n; i += 1) {
      const e = ifd + 2 + i * 12;
      salida.set(u16(e), { tipo: u16(e + 2), cuenta: u32(e + 4), valor: e + 8 });
    }
    return salida;
  };

  const texto = (etq) => {
    if (!etq || etq.tipo !== 2) return null;
    const desde = etq.cuenta > 4 ? tiff + u32(etq.valor) : etq.valor;
    let s = '';
    for (let i = 0; i < etq.cuenta - 1 && desde + i < v.byteLength; i += 1) {
      s += String.fromCharCode(v.getUint8(desde + i));
    }
    return s;
  };

  const ifd0 = etiquetas(tiff + u32(tiff + 4));
  const puntero = ifd0.get(EXIF_IFD);
  if (puntero) {
    const exif = etiquetas(tiff + u32(puntero.valor));
    const original = aISO(texto(exif.get(DATE_TIME_ORIGINAL)));
    if (original) return original;
  }
  return aISO(texto(ifd0.get(DATE_TIME)));
};

/**
 * La fecha de un `File` de imagen, o `null`. Solo lee el principio: el EXIF
 * va delante, y leer doce megas para veinte bytes no tiene sentido.
 */
export const fechaDeLaFoto = async (file) => {
  if (!file || !/jpe?g/i.test(file.type || file.name || '')) return null;
  try {
    const trozo = await file.slice(0, 256 * 1024).arrayBuffer();
    return fechaDeLosBytes(trozo);
  } catch {
    return null;
  }
};
