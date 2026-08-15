/**
 * Reducir una foto antes de subirla.
 *
 * ══ Por qué ════════════════════════════════════════════════════════════════
 *
 * Hasta ahora se subía **el archivo tal y como sale del móvil**: tres o cuatro
 * megas, a veces doce. Y lo que se hace con esa foto es mirarla en una columna de
 * 400 px al lado de otra. Se estaba pagando —y haciendo pagar los datos del
 * cliente— por unos píxeles que nadie ve nunca.
 *
 * Reducida a 1600 px de lado mayor son unos 300 KB: **diez veces menos**, y en
 * pantalla no se distingue.
 *
 * ── Y esto arregla un fallo, no solo una factura ────────────────────────────
 * Una foto de doce megas subiendo por datos móviles tarda una eternidad y a veces
 * se corta. Ese fallo no se ve en el escritorio de nadie, se ve en el vestuario
 * de un gimnasio — y es de los que hacen que un cliente deje de mandar fotos.
 * Reduciéndola antes, la subida es instantánea.
 *
 * ══ Cuándo NO se toca la foto ══════════════════════════════════════════════
 *
 * Si algo falla —un formato que este navegador no sabe decodificar, un HEIC de
 * iPhone en un navegador que no lo abre, un lienzo que no da imagen— se devuelve
 * **el archivo original**. Nunca se impide subir una foto por no haber podido
 * comprimirla: es preferible pagar unos megas de más que perder el registro de
 * una semana.
 */

/** Lado mayor al que se reduce. Por encima de esto no se gana nada visible. */
const MAX_SIDE = 1600;

/**
 * 0,82 es el punto donde el archivo deja de bajar de forma apreciable y todavía
 * no aparecen los bloques del JPEG en la piel — que es justo el detalle que se
 * mira en una foto de progreso.
 */
const QUALITY = 0.82;

/** Por debajo de esto no compensa: el trabajo no ahorra nada. */
const MIN_BYTES = 400 * 1024;

const loadBitmap = async (file) => {
  // `createImageBitmap` decodifica fuera del hilo principal y respeta la
  // orientación EXIF, que es lo que hace que una foto vertical no salga tumbada.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* Formato que este navegador no decodifica —HEIC en Chrome, por ejemplo—:
         se sigue por el camino del elemento <img>, que a veces sí puede. */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('no decodifica'));
    };
    img.src = url;
  });
};

/**
 * Devuelve un `File` reducido, o el mismo que se le pasó si no hace falta —o no
 * se ha podido—. Quien llama no tiene que distinguir los casos.
 */
export const shrinkImage = async (file) => {
  if (!file || file.size <= MIN_BYTES) return file;

  try {
    const bitmap = await loadBitmap(file);
    const ancho = bitmap.width || bitmap.naturalWidth;
    const alto = bitmap.height || bitmap.naturalHeight;
    if (!ancho || !alto) return file;

    const escala = Math.min(1, MAX_SIDE / Math.max(ancho, alto));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(ancho * escala);
    canvas.height = Math.round(alto * escala);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    /*
      WebP, no JPEG: pesa entre un 25 % y un 30 % menos con la misma calidad
      aparente, lo admiten todos los navegadores que puede usar esta aplicación y
      el bucket lo acepta desde la 0007. El nombre del archivo cambia de extensión
      para que la ruta no mienta sobre lo que hay dentro.
    */
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    if (!blob) return file;

    /* Si la «reducción» ha salido más grande —pasa con capturas de pantalla ya
       optimizadas— se manda el original. Comprimir dos veces no mejora nada. */
    if (blob.size >= file.size) return file;

    const nombre = file.name.replace(/\.[a-z0-9]+$/i, '') || 'foto';
    return new File([blob], `${nombre}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
};
