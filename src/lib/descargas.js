import { crearZip } from './zip';

/**
 * Bajarse una foto al ordenador.
 *
 * ══ Por qué esto no es un `<a download>` y ya ═══════════════════════════════
 *
 * Porque las fotos no están en este dominio: son URLs firmadas de Storage, y el
 * atributo `download` de un enlace **el navegador lo ignora cuando el archivo es
 * de otro origen**. Un `<a href={foto.url} download>` abre la foto en otra
 * pestaña, con un nombre de archivo que es un montón de parámetros de firma. Eso
 * parecía funcionar hasta que alguien mira la carpeta de descargas.
 *
 * Así que se baja el archivo y se descarga el `Blob`, que sí es del documento.
 * Cuesta tener la foto en memoria el rato que dura el clic —tres megas— y a
 * cambio el archivo cae con el nombre que le pusimos nosotros.
 *
 * ── Y no sabe nada de Supabase, a propósito ─────────────────────────────────
 * Aquí entra una URL, salga de donde salga. El bucket y la firma son cosa de
 * `context/`, que es quien ya las tiene resueltas en el estado; esto es el
 * mecanismo del navegador y nada más.
 */

/** Cuántas se bajan a la vez al montar un ZIP. Ver `descargarComoZip`. */
const A_LA_VEZ = 4;

/**
 * Le da al navegador un `Blob` con un nombre, y este lo guarda.
 *
 * El objeto URL se suelta después: cada uno retiene su `Blob` en memoria hasta
 * que se revoca, y con «descargar todas» eso serían cientos de megas colgados de
 * la pestaña hasta recargar.
 */
export const descargarBlob = (blob, nombre) => {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  /* Al documento antes de pulsarlo: Firefox no dispara el clic de un elemento
     que no está en el árbol. */
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  /* Un respiro antes de revocar: revocar en el mismo tic cancela la descarga en
     algunos navegadores, que aún no han empezado a leer el objeto. */
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** Baja una URL a `Blob`, diciendo qué pasó si no se pudo. */
const traer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.blob();
};

/**
 * Una foto, con su nombre.
 *
 * @returns `{ ok, error }` — no se traga el fallo: una descarga que no pasa nada
 *   y no dice nada es indistinguible de un botón roto.
 */
export const descargarFoto = async ({ url, nombre }) => {
  if (!url) return { ok: false, error: 'Esa foto no tiene enlace; recarga la página.' };

  try {
    descargarBlob(await traer(url), nombre);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `No se pudo descargar la foto (${err.message}).` };
  }
};

/**
 * Varias fotos, en un ZIP.
 *
 * ══ Por qué un ZIP y no diez descargas ══════════════════════════════════════
 *
 * Porque el navegador no deja. A partir de la décima descarga automática
 * seguida, Chrome y Firefox las bloquean con un aviso —«esta página intenta
 * descargar varios archivos»— y el entrenador se queda con seis fotos de las
 * veinte y sin saber cuáles faltan. Un archivo, un clic, una carpeta.
 *
 * ── Se bajan de cuatro en cuatro ────────────────────────────────────────────
 * De una en una, cien fotos son minutos mirando una barra. Todas a la vez, son
 * cien peticiones simultáneas contra Storage y el navegador las encola igual,
 * pero con todos los bytes en memoria a la vez. Cuatro es el punto donde la red
 * va llena sin que el pico de memoria dependa de cuántas fotos tenga el cliente.
 *
 * ── Lo que no se pudo bajar se DICE ─────────────────────────────────────────
 * Una firma caducada o una foto borrada del bucket no puede tumbar la descarga
 * entera: se entrega el ZIP con lo que sí está y se devuelve la lista de las que
 * faltan, para que quien llame lo cuente. Un ZIP con tres fotos menos y sin
 * avisar es peor que no descargar nada.
 *
 * @param archivos    `[{ url, nombre, fecha }]`. `nombre` puede llevar carpeta.
 * @param nombre      Cómo se llamará el ZIP.
 * @param onProgreso  `(hechas, total) => void`.
 */
export const descargarComoZip = async ({ archivos = [], nombre, onProgreso = null }) => {
  if (archivos.length === 0) return { ok: false, error: 'No hay ninguna foto que descargar.' };

  const traidos = new Array(archivos.length).fill(null);
  const fallos = [];
  let hechas = 0;
  let siguiente = 0;

  /* Cuatro obreros tirando de la misma lista: cada uno coge el siguiente índice
     libre, así que el reparto se ajusta solo si una foto tarda más que otra. */
  const obrero = async () => {
    for (;;) {
      const i = siguiente;
      siguiente += 1;
      if (i >= archivos.length) return;

      try {
        traidos[i] = await traer(archivos[i].url);
      } catch {
        /* No se relanza: el resto del ZIP sigue valiendo. Se apunta cuál. */
        fallos.push(archivos[i].nombre);
      }

      hechas += 1;
      if (onProgreso) onProgreso(hechas, archivos.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, archivos.length) }, obrero));

  const entradas = archivos
    .map((a, i) => (traidos[i] ? { nombre: a.nombre, datos: traidos[i], fecha: a.fecha } : null))
    .filter(Boolean);

  if (entradas.length === 0) {
    return { ok: false, error: 'No se pudo descargar ninguna foto. Recarga la página y prueba otra vez.' };
  }

  try {
    descargarBlob(await crearZip(entradas), nombre);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return { ok: true, fallos };
};
