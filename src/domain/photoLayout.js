/**
 * Geometría del montaje de fotos. Todo son funciones puras que devuelven
 * rectángulos: no dibujan nada. El renderizador (renderComposition.js) consume
 * estos rectángulos, y así la parte difícil —encajar imágenes de proporciones
 * distintas en un lienzo de proporción fija— se puede razonar y testear sola.
 *
 * Sistema de coordenadas: píxeles del lienzo de exportación. La vista previa
 * dibuja el mismo lienzo escalado, por lo que lo que se ve es exactamente lo
 * que se descarga.
 */

export const LAYOUTS = [
  { id: 'pair', label: 'Antes / Después', slots: 2, fixedSlots: true },
  /*
    Matriz semanas × ángulos: una columna por semana, una fila por ángulo.
    ------------------------------------------------------------------------
    Es el montaje que de verdad se quiere para ver una evolución: el frontal de
    las semanas 1, 6 y 12 en una fila y el de espaldas justo debajo. Con los
    layouts de dos huecos había que montar tres collages y pegarlos a mano.

    Sus huecos NO se eligen a mano: los calcula `weekAngleMatrix` a partir de las
    semanas y los ángulos marcados, y se conservan los huecos vacíos para que las
    columnas no se descoloquen cuando a una semana le falta un ángulo.
  */
  { id: 'matrix', label: 'Semanas × ángulos', slots: null, fixedSlots: true, derived: true },
  { id: 'grid', label: 'Rejilla libre', slots: null, fixedSlots: false },
  { id: 'slider', label: 'Deslizador', slots: 2, fixedSlots: true },
];

export const isDerivedLayout = (id) => Boolean(LAYOUTS.find((l) => l.id === id)?.derived);

export const ASPECT_RATIOS = [
  { id: 'native', label: 'Automático', value: null },
  { id: '1:1', label: 'Cuadrado 1:1', value: 1 },
  { id: '4:5', label: 'Vertical 4:5', value: 4 / 5 },
  { id: '9:16', label: 'Story 9:16', value: 9 / 16 },
  { id: '16:9', label: 'Horizontal 16:9', value: 16 / 9 },
];

/** Las fotos de progreso son verticales; 3:4 es la proporción de referencia. */
const SLOT_ASPECT = 3 / 4;

/** Ancho de exportación. 1600 px da calidad de sobra para móvil e impresión. */
export const EXPORT_WIDTH = 1600;

/** Rejilla lo más cuadrada posible para N fotos. */
export const gridDims = (count) => {
  const n = Math.max(1, count);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
};

/** Proporción "natural" del lienzo para un layout, si no se fuerza otra. */
export const nativeAspect = (layout, count, dims = null) => {
  if (layout === 'slider') return SLOT_ASPECT;
  if (layout === 'pair') return (2 * SLOT_ASPECT) / 1;
  // La matriz impone sus propias dimensiones: no se puede deducir del número de
  // huecos, porque 6 huecos pueden ser 3×2 o 2×3 y no son lo mismo.
  const { cols, rows } = layout === 'matrix' && dims ? dims : gridDims(count);
  return (cols * SLOT_ASPECT) / Math.max(1, rows);
};

/** Tamaño del lienzo en píxeles a partir del ratio elegido. */
export const canvasSize = ({ layout, count, ratio = 'native', width = EXPORT_WIDTH, dims = null }) => {
  const preset = ASPECT_RATIOS.find((r) => r.id === ratio);
  const aspect = preset?.value ?? nativeAspect(layout, count, dims);
  return { width: Math.round(width), height: Math.round(width / aspect) };
};

/** Espaciados proporcionales al lienzo, para que escalen con el tamaño. */
export const spacing = ({ width, height, showCaptions }) => {
  const base = Math.min(width, height);
  return {
    pad: Math.round(base * 0.025),
    gap: Math.round(base * 0.02),
    caption: showCaptions ? Math.round(base * 0.075) : 0,
  };
};

/**
 * Rectángulos donde va cada foto.
 *
 * - pair   → dos columnas iguales
 * - grid   → cols × rows; la última fila se centra si queda incompleta
 * - slider → un único rectángulo a sangre (las dos fotos se superponen y la
 *            segunda se recorta según la posición del divisor)
 */
export const slotRects = ({ layout, count, width, height, showCaptions = true, dims = null }) => {
  const { pad, gap, caption } = spacing({ width, height, showCaptions });

  if (layout === 'slider') {
    return [{ x: 0, y: 0, w: width, h: height, captionH: caption }];
  }

  const matrix = layout === 'matrix' && dims;
  const cols = layout === 'pair' ? 2 : matrix ? dims.cols : gridDims(count).cols;
  const rows = layout === 'pair' ? 1 : matrix ? dims.rows : gridDims(count).rows;

  const innerW = width - pad * 2 - gap * (cols - 1);
  const innerH = height - pad * 2 - gap * (rows - 1);
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  const rects = [];
  const total = layout === 'pair' ? 2 : matrix ? cols * rows : count;

  for (let i = 0; i < total; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Centrar la última fila cuando está incompleta. En la matriz NO: las
    // columnas son semanas y tienen que quedar alineadas entre filas, aunque a
    // alguna le falte un ángulo.
    const itemsInRow = matrix ? cols : Math.min(cols, total - row * cols);
    const rowOffset = ((cols - itemsInRow) * (cellW + gap)) / 2;

    rects.push({
      x: Math.round(pad + rowOffset + col * (cellW + gap)),
      y: Math.round(pad + row * (cellH + gap)),
      w: Math.round(cellW),
      h: Math.round(cellH),
      captionH: caption,
    });
  }

  return rects;
};

// ── Transformación por foto ────────────────────────────────────────────────

export const defaultTransform = () => ({
  zoom: 1,
  offsetX: 0, // fracción del ancho del hueco: -0.5 … 0.5
  offsetY: 0,
  rotation: 0, // grados
  flipH: false,
});

export const defaultAdjustments = () => ({
  brightness: 100, // %
  contrast: 100,
  saturation: 100,
});

export const isDefaultAdjustments = (a) =>
  a.brightness === 100 && a.contrast === 100 && a.saturation === 100;

/** Filtro CSS/canvas equivalente. `ctx.filter` lo entiende igual que CSS. */
export const cssFilter = (a) =>
  isDefaultAdjustments(a)
    ? 'none'
    : `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`;

/**
 * Encaje "cover" con zoom y desplazamiento del usuario: la imagen cubre todo
 * el hueco sin deformarse, y el usuario puede acercarla y moverla para que dos
 * fotos de semanas distintas queden a la misma escala y altura.
 *
 * Sin esto la comparación engaña: dos fotos tomadas a distinta distancia
 * sugieren un cambio corporal que no existe.
 */
export const coverFit = ({ imgW, imgH, rect, transform }) => {
  const t = { ...defaultTransform(), ...transform };
  const areaH = rect.h - (rect.captionH || 0);
  const base = Math.max(rect.w / imgW, areaH / imgH);
  const scale = base * Math.max(0.2, t.zoom);

  const drawW = imgW * scale;
  const drawH = imgH * scale;

  return {
    drawW,
    drawH,
    // Centro del hueco + desplazamiento expresado en fracción del hueco.
    cx: rect.x + rect.w / 2 + t.offsetX * rect.w,
    cy: rect.y + areaH / 2 + t.offsetY * areaH,
    rotation: t.rotation,
    flipH: t.flipH,
    clip: { x: rect.x, y: rect.y, w: rect.w, h: areaH },
  };
};

/** Convierte coordenadas de pantalla a coordenadas del lienzo. */
export const toCanvasPoint = ({ clientX, clientY, canvasEl }) => {
  const r = canvasEl.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * canvasEl.width,
    y: ((clientY - r.top) / r.height) * canvasEl.height,
  };
};

/** Normaliza un punto del lienzo a 0..1 para guardar anotaciones. */
export const normalizePoint = ({ x, y }, { width, height }) => ({ x: x / width, y: y / height });
export const denormalizePoint = ({ x, y }, { width, height }) => ({ x: x * width, y: y * height });
