/**
 * Archivos que se adjuntan: a un ticket de soporte y a un paso del alta.
 *
 * ══ Por qué un módulo y no dos ═════════════════════════════════════════════
 *
 * Son dos sitios muy distintos de la aplicación —uno es una conversación con
 * soporte y el otro lo que el entrenador le entrega a su cliente— y aun así el
 * archivo es exactamente el mismo problema: qué se admite, cuánto puede pesar y
 * dónde aterriza dentro del bucket.
 *
 * Escrito dos veces, lo que acaba pasando es que uno de los dos acepta un tipo
 * que el bucket rechaza —y el usuario ve un error del servidor en inglés a
 * mitad de subida— porque nadie se acordó de tocar los dos.
 *
 * ══ Qué se admite y por qué ════════════════════════════════════════════════
 *
 * Imágenes y PDF. Las primeras porque casi todo lo que se adjunta es una captura
 * de pantalla o una foto de una hoja; el PDF porque es lo que sale de una
 * analítica, de una anamnesis y de cualquier cosa impresa.
 *
 * NO se admite vídeo, aunque el bucket lo permita desde la 0038: para eso está el
 * grabador de revisiones, que además crea el enlace que se le puede pasar al
 * cliente. Colar un vídeo de 100 MB por aquí sería duplicar esa función por
 * accidente y sin ninguna de sus ventajas.
 *
 * ── El límite es del navegador, y el de verdad es el del bucket ─────────────
 * Estas comprobaciones se saltan llamando a la API directamente; están para dar
 * un mensaje en castellano ANTES de gastar la subida, no para proteger nada. Lo
 * que de verdad acota es `storage.buckets` (migraciones 0007, 0038 y 0039).
 */

import { slug } from './photos';

export const ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

/** Lo que un `<input type="file">` acepta. La misma lista, en su formato. */
export const ATTACHMENT_ACCEPT = 'image/*,application/pdf';

/**
 * 10 MB.
 *
 * Una captura de pantalla pesa menos de uno y un PDF escaneado de diez páginas
 * ronda los cinco. Por encima de esto lo que hay es un vídeo con otro nombre o un
 * archivo que conviene comprimir antes de mandarlo.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** `null` si el archivo vale; si no, la frase que se le enseña a quien lo eligió. */
export const validateAttachment = (file) => {
  if (!file) return 'No se ha seleccionado ningún archivo.';

  // Algunos navegadores no rellenan `type` para HEIC, igual que en las fotos de
  // progreso: se acepta por extensión.
  const porExtension = /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
  if (!ATTACHMENT_TYPES.includes(file.type) && !porExtension) {
    return 'Solo se pueden adjuntar imágenes o PDF.';
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `El archivo pesa ${mb} MB y el máximo son 10 MB.`;
  }
  return null;
};

const extensionOf = (fileName) => {
  const m = /\.([a-z0-9]+)$/i.exec(fileName || '');
  return (m ? m[1] : 'bin').toLowerCase();
};

/**
 * Dónde aterriza el adjunto de un ticket: `support/<ticketId>/<archivo>`.
 *
 * El id del ticket es el SEGUNDO segmento y eso no es casual: es lo que la
 * política de la 0039 comprueba para decidir quién puede subir y leer. Cambiar
 * esta forma sin tocar la política deja de funcionar en el servidor, no aquí.
 */
export const buildSupportPath = ({ ticketId, fileName, timestamp }) =>
  `support/${ticketId}/${timestamp ?? Date.now()}-${slug(baseName(fileName)) || 'adjunto'}.${extensionOf(fileName)}`;

/**
 * Y el de un paso del alta: `<clientId>/intake/<archivo>`.
 *
 * Primer segmento el id del cliente, que es lo que ya acotan las políticas de la
 * 0007 —el entrenador dueño escribe y lee, el propio cliente lee—. Por eso este
 * lado no necesitó ni una política nueva.
 */
export const buildIntakePath = ({ clientId, stepId, fileName, timestamp }) =>
  `${clientId}/intake/${timestamp ?? Date.now()}-${slug(stepId) || 'paso'}-${slug(baseName(fileName)) || 'archivo'}.${extensionOf(fileName)}`;

/** El nombre sin su extensión, para no repetirla dentro de la clave del objeto. */
const baseName = (fileName) => String(fileName || '').replace(/\.[a-z0-9]+$/i, '');

/**
 * El nombre que se le enseña a una persona.
 *
 * De `c1/intake/1738-anamnesis-marta.pdf` sale «anamnesis-marta.pdf»: se quita la
 * carpeta y la marca de tiempo con la que se evitan las colisiones, que no le
 * dicen nada a nadie. Si no encaja el patrón se devuelve el último segmento tal
 * cual, que siempre es mejor que una cadena vacía.
 */
export const attachmentName = (path) => {
  const archivo = String(path || '').split('/').pop() || '';
  return archivo.replace(/^\d{10,}-/, '') || archivo;
};

/** Si lo que hay al otro lado se abre como imagen. Lo demás se ofrece como archivo. */
export const isImagePath = (path) => /\.(jpe?g|png|webp|heic|heif)$/i.test(String(path || ''));
