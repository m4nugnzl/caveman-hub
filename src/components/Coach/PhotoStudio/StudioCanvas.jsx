import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { canvasSize, normalizePoint, toCanvasPoint } from '@/domain/photoLayout';
import { renderComposition } from './renderComposition';

/**
 * Lienzo del montaje: vista previa interactiva y fuente de la exportación.
 *
 * El lienzo se crea con el tamaño REAL de exportación y el CSS lo escala hacia
 * abajo, así que lo que se ve en pantalla es exactamente el píxel que se
 * descarga; no hay dos rutas de dibujo que puedan divergir.
 *
 * Gestos, según la herramienta activa:
 *  · pan    → arrastrar mueve el encuadre del hueco activo (o el divisor, en
 *             el modo deslizador, que es lo que se espera ahí).
 *  · línea / flecha → arrastrar de un punto a otro, con vista previa en vivo.
 *  · guía   → un clic coloca una línea horizontal a esa altura, para comparar
 *             hombros o cintura entre dos semanas.
 *  · texto  → un clic marca dónde irá la etiqueta.
 */
export const StudioCanvas = ({
  state,
  photoOf,
  imageOf,
  onNudgeSlot,
  onSliderPos,
  onAddAnnotation,
  onPickTextPosition,
  canvasRef,
  imageVersion,
}) => {
  const localRef = useRef(null);
  const ref = canvasRef || localRef;
  const dragRef = useRef(null);
  const [draft, setDraft] = useState(null);

  const size = useMemo(
    () => canvasSize({ layout: state.layout, count: state.slots.length, ratio: state.ratio }),
    [state.layout, state.slots.length, state.ratio]
  );

  // Se redibuja al cambiar el estado del montaje y cuando `imageVersion` avisa
  // de que ha terminado de cargar una imagen nueva.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const drawState = draft ? { ...state, annotations: [...state.annotations, draft] } : state;
    renderComposition({ canvas, state: drawState, size, photoOf, imageOf, preview: true });
  }, [state, draft, size, photoOf, imageOf, ref, imageVersion]);

  const pointAt = useCallback(
    (event) => {
      const canvas = ref.current;
      if (!canvas) return { x: 0, y: 0 };
      return toCanvasPoint({ clientX: event.clientX, clientY: event.clientY, canvasEl: canvas });
    },
    [ref]
  );

  const handlePointerDown = (event) => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.setPointerCapture?.(event.pointerId);

    const point = pointAt(event);

    if (state.tool === 'pan') {
      if (state.layout === 'slider') {
        dragRef.current = { kind: 'slider' };
        onSliderPos(Math.min(1, Math.max(0, point.x / size.width)));
      } else {
        dragRef.current = { kind: 'pan', last: point };
      }
      return;
    }

    if (state.tool === 'hline') {
      onAddAnnotation({
        type: 'hline',
        color: state.color,
        width: 3,
        points: [normalizePoint(point, size)],
      });
      return;
    }

    if (state.tool === 'text') {
      onPickTextPosition(normalizePoint(point, size));
      return;
    }

    // línea o flecha
    dragRef.current = { kind: 'draw', from: point };
    setDraft({
      id: 'draft',
      type: state.tool,
      color: state.color,
      width: 3,
      points: [normalizePoint(point, size), normalizePoint(point, size)],
    });
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointAt(event);

    if (drag.kind === 'slider') {
      onSliderPos(Math.min(1, Math.max(0, point.x / size.width)));
    } else if (drag.kind === 'pan') {
      const dx = (point.x - drag.last.x) / size.width;
      const dy = (point.y - drag.last.y) / size.height;
      drag.last = point;
      onNudgeSlot(state.activeSlot, dx, dy);
    } else if (drag.kind === 'draw') {
      setDraft((prev) =>
        prev ? { ...prev, points: [prev.points[0], normalizePoint(point, size)] } : prev
      );
    }
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    ref.current?.releasePointerCapture?.(event.pointerId);

    if (drag?.kind === 'draw' && draft) {
      const [a, b] = draft.points;
      const far = Math.hypot((b.x - a.x) * size.width, (b.y - a.y) * size.height) > 12;
      if (far) onAddAnnotation({ type: draft.type, color: draft.color, width: draft.width, points: draft.points });
    }
    setDraft(null);
  };

  const modeClass =
    state.tool === 'pan' ? (state.layout === 'slider' ? 'mode-slider' : 'mode-pan') : 'mode-draw';

  return (
    <div className="studio-canvas-wrap">
      <canvas
        ref={ref}
        className={`studio-canvas ${modeClass}`}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="img"
        aria-label="Vista previa del montaje de fotos"
      />
    </div>
  );
};
