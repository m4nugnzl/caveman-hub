/**
 * Geometría de la grabación con cámara.
 *
 * Todo son funciones puras que devuelven rectángulos: no dibujan nada y no tocan
 * el DOM. El compositor (`lib/useReviewRecorder.js`) las consume, igual que
 * `photoLayout.js` alimenta al montaje de fotos. La parte que se equivoca en
 * silencio —encajar una cámara 16:9 en un recuadro cuadrado sin deformar la cara—
 * queda así aislada y se puede comprobar caso por caso.
 */

/** Formas de la cámara. El círculo es lo que se espera de un vídeo tipo Loom. */
export const CAMERA_SHAPES = [
  { id: 'circle', label: 'Círculo' },
  { id: 'rounded', label: 'Redondeado' },
  { id: 'square', label: 'Cuadrado' },
];

/**
 * Anclajes. Se guardan como fracciones del lienzo (0..1) y no en píxeles, para
 * que la posición elegida en la vista previa —que está escalada— siga valiendo en
 * la grabación a resolución completa.
 */
export const CAMERA_ANCHORS = [
  { id: 'br', label: 'Abajo dcha.', x: 1, y: 1 },
  { id: 'bl', label: 'Abajo izda.', x: 0, y: 1 },
  { id: 'tr', label: 'Arriba dcha.', x: 1, y: 0 },
  { id: 'tl', label: 'Arriba izda.', x: 0, y: 0 },
];

export const CAMERA_SIZES = [
  { id: 'sm', label: 'Pequeña', value: 0.16 },
  { id: 'md', label: 'Mediana', value: 0.24 },
  { id: 'lg', label: 'Grande', value: 0.34 },
];

export const defaultCamera = () => ({
  enabled: false,
  shape: 'circle',
  // Posición del CENTRO de la cámara, en fracciones del lienzo.
  x: 0.86,
  y: 0.82,
  size: 0.24,
  mirror: true,
});

/** Posición del centro para un anclaje, respetando un margen proporcional. */
export const anchorPosition = (anchorId, size, margin = 0.03) => {
  const anchor = CAMERA_ANCHORS.find((a) => a.id === anchorId) || CAMERA_ANCHORS[0];
  const half = size / 2;
  return {
    x: anchor.x === 1 ? 1 - half - margin : half + margin,
    y: anchor.y === 1 ? 1 - half - margin : half + margin,
  };
};

/**
 * Recuadro de la cámara en píxeles del lienzo.
 *
 * El tamaño se mide sobre el lado MENOR del lienzo. Si se midiera sobre el ancho,
 * la misma cámara «mediana» sería enorme en un vídeo 16:9 horizontal y minúscula
 * en uno vertical de móvil.
 *
 * El centro se recorta para que el recuadro no salga nunca del lienzo: al
 * arrastrar hasta el borde, se queda pegado en vez de desaparecer a medias.
 */
export const cameraBox = ({ width, height, camera }) => {
  const base = Math.min(width, height);
  const side = Math.max(24, Math.round(base * camera.size));
  const half = side / 2;

  const cx = Math.min(width - half, Math.max(half, camera.x * width));
  const cy = Math.min(height - half, Math.max(half, camera.y * height));

  return { x: Math.round(cx - half), y: Math.round(cy - half), size: side, radius: radiusFor(camera.shape, side) };
};

const radiusFor = (shape, side) => {
  if (shape === 'circle') return side / 2;
  if (shape === 'rounded') return Math.round(side * 0.18);
  return 0;
};

/**
 * Encaje «cover» de la cámara en su recuadro: llena el cuadrado sin deformar.
 *
 * Una webcam da 16:9 y el recuadro es cuadrado. Estirar la imagen para que quepa
 * ensancha la cara —el error clásico— así que se recorta por los lados.
 */
export const cameraFit = ({ videoWidth, videoHeight, box }) => {
  if (!videoWidth || !videoHeight) return null;
  const scale = Math.max(box.size / videoWidth, box.size / videoHeight);
  const drawW = videoWidth * scale;
  const drawH = videoHeight * scale;
  return {
    drawW,
    drawH,
    dx: box.x + (box.size - drawW) / 2,
    dy: box.y + (box.size - drawH) / 2,
  };
};

/** Encaje «contain» de la fuente: se ve entera, con banda si hace falta. */
export const sourceFit = ({ videoWidth, videoHeight, width, height }) => {
  if (!videoWidth || !videoHeight) return null;
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const drawW = videoWidth * scale;
  const drawH = videoHeight * scale;
  return { drawW, drawH, dx: (width - drawW) / 2, dy: (height - drawH) / 2 };
};

/** ¿Cae un punto del lienzo dentro del recuadro de la cámara? Para arrastrarla. */
export const hitsCamera = ({ x, y, box }) =>
  x >= box.x && x <= box.x + box.size && y >= box.y && y <= box.y + box.size;

/** Resolución de salida a partir de la fuente, con techo para no grabar en 4K. */
export const outputSize = ({ videoWidth, videoHeight, max = 1600 }) => {
  if (!videoWidth || !videoHeight) return { width: 1280, height: 720 };
  const scale = Math.min(1, max / Math.max(videoWidth, videoHeight));
  // Par: algunos codificadores rechazan dimensiones impares.
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(videoWidth), height: even(videoHeight) };
};
