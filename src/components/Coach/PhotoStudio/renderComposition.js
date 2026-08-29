/**
 * Dibuja el montaje completo en un lienzo 2D.
 *
 * Es la única parte imperativa del Photo Studio: la geometría vive en
 * `domain/photoLayout.js` (pura y testable) y aquí solo se ejecutan órdenes de
 * dibujo. El lienzo tiene ya el tamaño de exportación y el CSS lo escala para
 * la vista previa, así que lo que se ve en pantalla es exactamente lo que se
 * descarga.
 */

import { coverFit, cssFilter, denormalizePoint, slotRects, spacing } from '@/domain/photoLayout';
import { fmt } from '@/lib/num';
import { angleLabel } from '@/domain/photos';

const BG = '#0b0f19';
const CAPTION_BG = 'rgba(0, 0, 0, 0.62)';
const PLACEHOLDER_BG = '#16203a';

/** Dibuja una imagen recortada al hueco, con zoom, desplazamiento y rotación. */
const drawSlotImage = (ctx, image, rect, slot) => {
  const fit = coverFit({ imgW: image.naturalWidth, imgH: image.naturalHeight, rect, transform: slot.transform });

  ctx.save();
  ctx.beginPath();
  ctx.rect(fit.clip.x, fit.clip.y, fit.clip.w, fit.clip.h);
  ctx.clip();

  ctx.filter = cssFilter(slot.adjustments);
  ctx.translate(fit.cx, fit.cy);
  if (fit.rotation) ctx.rotate((fit.rotation * Math.PI) / 180);
  if (fit.flipH) ctx.scale(-1, 1);
  ctx.drawImage(image, -fit.drawW / 2, -fit.drawH / 2, fit.drawW, fit.drawH);

  ctx.restore();
};

const drawPlaceholder = (ctx, rect, index) => {
  ctx.save();
  ctx.fillStyle = PLACEHOLDER_BG;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);

  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `600 ${Math.round(rect.w * 0.055)}px "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Hueco ${index + 1}`, rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.restore();
};

/** Barra inferior con semana, fecha, ángulo y peso. */
const drawCaption = (ctx, rect, photo, size) => {
  if (!rect.captionH || !photo) return;

  const y = rect.y + rect.h - rect.captionH;
  const padX = Math.round(rect.captionH * 0.28);
  const base = Math.min(size.width, size.height);

  ctx.save();
  ctx.fillStyle = CAPTION_BG;
  ctx.fillRect(rect.x, y, rect.w, rect.captionH);

  const titleSize = Math.round(base * 0.026);
  const metaSize = Math.round(base * 0.019);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // El peso viene del check-in de esa semana (`photoWeight`), no de un campo que
  // el cliente rellenara al subir la foto. `derivedWeight` lo resuelve una sola
  // vez en PhotoStudio, así que el pie, la biblioteca y la tarjeta de variación
  // muestran siempre la misma cifra.
  const weight = photo.derivedWeight ?? photo.weight;
  const title = [
    photo.week != null ? `Semana ${photo.week}` : null,
    weight != null ? `${fmt(weight, { decimals: 1 })} kg` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  ctx.fillText(title || angleLabel(photo.angle), rect.x + padX, y + rect.captionH * 0.18);

  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.font = `600 ${metaSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(
    [photo.date, angleLabel(photo.angle)].filter(Boolean).join('  ·  '),
    rect.x + padX,
    y + rect.captionH * 0.58
  );
  ctx.restore();
};

const drawArrowHead = (ctx, from, to, width) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = width * 4.5;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(angle - Math.PI / 7), to.y - len * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to.x - len * Math.cos(angle + Math.PI / 7), to.y - len * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
};

/** Anotaciones: guías horizontales, líneas, flechas y texto. */
const drawAnnotation = (ctx, annotation, size) => {
  const width = Math.max(2, Math.round((annotation.width || 3) * (size.width / 1600)));
  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';

  if (annotation.type === 'hline' || annotation.type === 'vline') {
    // Regla de referencia a todo lo ancho o a todo lo alto del montaje. Es lo
    // que permite comprobar si dos fotos están a la misma altura de hombro o si
    // la cintura se ha estrechado: sin una recta que cruce las dos, el ojo se
    // engaña con cualquier diferencia de encuadre.
    const p = denormalizePoint(annotation.points[0], size);
    ctx.beginPath();
    if (annotation.type === 'hline') {
      ctx.moveTo(0, p.y);
      ctx.lineTo(size.width, p.y);
    } else {
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, size.height);
    }
    ctx.stroke();
  } else if (annotation.type === 'line' || annotation.type === 'arrow') {
    const [a, b] = annotation.points.map((p) => denormalizePoint(p, size));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (annotation.type === 'arrow') drawArrowHead(ctx, a, b, width);
  } else if (annotation.type === 'text' && annotation.text) {
    const p = denormalizePoint(annotation.points[0], size);
    const fontSize = Math.round(size.width * 0.028);
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textBaseline = 'middle';

    // Fondo semitransparente para que el texto se lea sobre cualquier foto.
    const metrics = ctx.measureText(annotation.text);
    const padding = fontSize * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(
      p.x - padding,
      p.y - fontSize / 2 - padding * 0.6,
      metrics.width + padding * 2,
      fontSize + padding * 1.2
    );
    ctx.fillStyle = annotation.color;
    ctx.fillText(annotation.text, p.x, p.y);
  }

  ctx.restore();
};

/**
 * Punto de entrada.
 *
 * @param canvas  elemento <canvas>
 * @param state   { layout, ratio, slots, sliderPos, showCaptions, annotations }
 * @param photoOf (photoId) => foto | null
 * @param imageOf (url) => HTMLImageElement | null
 */
export function renderComposition({ canvas, state, size, photoOf, imageOf, preview }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }

  ctx.filter = 'none';
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size.width, size.height);

  const rects = slotRects({
    layout: state.layout,
    count: state.slots.length,
    width: size.width,
    height: size.height,
    showCaptions: state.showCaptions,
    dims: state.dims,
  });

  const resolve = (slot) => {
    const photo = slot?.photoId ? photoOf(slot.photoId) : null;
    return { photo, image: photo?.url ? imageOf(photo.url) : null };
  };

  if (state.layout === 'slider') {
    const rect = rects[0];
    const [left, right] = state.slots;
    const a = resolve(left);
    const b = resolve(right);
    const splitX = Math.round(size.width * state.sliderPos);

    if (a.image) drawSlotImage(ctx, a.image, rect, left);
    else drawPlaceholder(ctx, rect, 0);

    // La segunda foto solo se pinta a la derecha del divisor.
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, size.width - splitX, size.height);
    ctx.clip();
    if (b.image) drawSlotImage(ctx, b.image, rect, right);
    else drawPlaceholder(ctx, { ...rect, x: splitX, w: size.width - splitX }, 1);
    ctx.restore();

    // Divisor con tirador.
    ctx.save();
    ctx.filter = 'none';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, size.width * 0.0022);
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, size.height);
    ctx.stroke();

    const r = size.width * 0.019;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(splitX, size.height / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BG;
    ctx.font = `900 ${Math.round(r * 1.2)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⇔', splitX, size.height / 2);
    ctx.restore();

    if (state.showCaptions) {
      const { caption } = spacing({ ...size, showCaptions: true });
      const half = { ...rect, w: splitX, captionH: caption };
      drawCaption(ctx, half, a.photo, size);
      drawCaption(ctx, { ...rect, x: splitX, w: size.width - splitX, captionH: caption }, b.photo, size);
    }
  } else {
    state.slots.forEach((slot, index) => {
      const rect = rects[index];
      if (!rect) return;
      const { photo, image } = resolve(slot);

      if (image) drawSlotImage(ctx, image, rect, slot);
      else drawPlaceholder(ctx, rect, index);

      ctx.filter = 'none';
      drawCaption(ctx, rect, photo, size);

      // Marco del hueco activo, solo en la vista previa (no en la exportación).
      if (preview && index === state.activeSlot && state.slots.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = Math.max(2, size.width * 0.0028);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      }
    });
  }

  ctx.filter = 'none';
  state.annotations.forEach((annotation) => drawAnnotation(ctx, annotation, size));
}
