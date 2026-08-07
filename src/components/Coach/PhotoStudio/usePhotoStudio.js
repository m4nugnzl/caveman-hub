import { useCallback, useEffect, useMemo, useState } from 'react';

import { defaultAdjustments, defaultTransform } from '@/domain/photoLayout';
import { newId } from '@/lib/ids';
import { suggestPair } from '@/domain/photos';

const MAX_GRID_SLOTS = 9;

const emptySlot = () => ({
  photoId: null,
  transform: defaultTransform(),
  adjustments: defaultAdjustments(),
});

const slotWith = (photoId) => ({ ...emptySlot(), photoId });

/**
 * Estado del Photo Studio: qué fotos van en qué hueco, cómo está encuadrada
 * cada una, sus ajustes de luz y las anotaciones sobre el montaje.
 *
 * Los ajustes son NO DESTRUCTIVOS: se guardan aquí como parámetros de
 * renderizado y la foto original en Storage no se toca nunca.
 */
export function usePhotoStudio({ photos, clientId }) {
  const [layout, setLayout] = useState('pair');
  const [ratio, setRatio] = useState('native');
  const [slots, setSlots] = useState([emptySlot(), emptySlot()]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [sliderPos, setSliderPos] = useState(0.5);
  const [showCaptions, setShowCaptions] = useState(true);
  const [annotations, setAnnotations] = useState([]);
  const [tool, setTool] = useState('pan');
  const [color, setColor] = useState('#10b981');

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const photoOf = useCallback((id) => photoById.get(id) || null, [photoById]);

  /**
   * Al abrir un cliente se propone el par más útil: la foto más antigua contra
   * la más reciente DEL MISMO ÁNGULO. Comparar un frontal con un lateral no
   * dice nada.
   */
  useEffect(() => {
    const { before, after } = suggestPair(photos);
    setSlots([
      before ? slotWith(before.id) : emptySlot(),
      after && after.id !== before?.id ? slotWith(after.id) : emptySlot(),
    ]);
    setAnnotations([]);
    setActiveSlot(0);
    setLayout('pair');
    setSliderPos(0.5);
    // Solo al cambiar de cliente: si dependiera de `photos`, cada subida
    // reiniciaría el montaje que el coach está preparando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Los layouts de dos huecos se recortan a dos; la rejilla admite más.
  const changeLayout = useCallback((next) => {
    setLayout(next);
    setSlots((prev) => {
      if (next === 'grid') return prev.length >= 2 ? prev : [...prev, emptySlot()];
      const two = prev.slice(0, 2);
      while (two.length < 2) two.push(emptySlot());
      return two;
    });
    setActiveSlot((prev) => (next === 'grid' ? prev : Math.min(prev, 1)));
  }, []);

  /** Asigna una foto: al hueco activo, o a un hueco nuevo en la rejilla. */
  const assignPhoto = useCallback(
    (photoId) => {
      setSlots((prev) => {
        const existing = prev.findIndex((s) => s.photoId === photoId);
        if (existing >= 0) {
          // Segunda pulsación sobre la misma foto: la quita.
          const next = [...prev];
          next[existing] = emptySlot();
          return next;
        }

        const emptyIndex = prev.findIndex((s) => !s.photoId);
        if (layout === 'grid' && emptyIndex === -1 && prev.length < MAX_GRID_SLOTS) {
          return [...prev, slotWith(photoId)];
        }

        const target = prev[activeSlot]?.photoId ? (emptyIndex === -1 ? activeSlot : emptyIndex) : activeSlot;
        const next = [...prev];
        next[target] = slotWith(photoId);
        return next;
      });
    },
    [activeSlot, layout]
  );

  const updateSlot = useCallback((index, patch) => {
    setSlots((prev) =>
      prev.map((slot, i) =>
        i !== index
          ? slot
          : {
              ...slot,
              transform: { ...slot.transform, ...(patch.transform || {}) },
              adjustments: { ...slot.adjustments, ...(patch.adjustments || {}) },
            }
      )
    );
  }, []);

  const nudgeSlot = useCallback((index, dx, dy) => {
    setSlots((prev) =>
      prev.map((slot, i) =>
        i !== index
          ? slot
          : {
              ...slot,
              transform: {
                ...slot.transform,
                offsetX: Math.max(-1, Math.min(1, slot.transform.offsetX + dx)),
                offsetY: Math.max(-1, Math.min(1, slot.transform.offsetY + dy)),
              },
            }
      )
    );
  }, []);

  const resetSlot = useCallback((index) => {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...emptySlot(), photoId: slot.photoId } : slot)));
  }, []);

  const addGridSlot = useCallback(() => {
    setSlots((prev) => (prev.length < MAX_GRID_SLOTS ? [...prev, emptySlot()] : prev));
  }, []);

  const removeSlot = useCallback((index) => {
    setSlots((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
    setActiveSlot((prev) => Math.max(0, prev - (index <= prev ? 1 : 0)));
  }, []);

  /** Copia el encuadre y los ajustes del hueco activo al resto. */
  const applyToAll = useCallback(() => {
    setSlots((prev) => {
      const source = prev[activeSlot];
      if (!source) return prev;
      return prev.map((slot) => ({
        ...slot,
        transform: { ...source.transform },
        adjustments: { ...source.adjustments },
      }));
    });
  }, [activeSlot]);

  const addAnnotation = useCallback((annotation) => {
    setAnnotations((prev) => [...prev, { id: newId('ann'), ...annotation }]);
  }, []);

  const undoAnnotation = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
  }, []);

  const clearAnnotations = useCallback(() => setAnnotations([]), []);

  const state = useMemo(
    () => ({ layout, ratio, slots, activeSlot, sliderPos, showCaptions, annotations, tool, color }),
    [layout, ratio, slots, activeSlot, sliderPos, showCaptions, annotations, tool, color]
  );

  const usedPhotoIds = useMemo(
    () => new Set(slots.map((s) => s.photoId).filter(Boolean)),
    [slots]
  );

  return {
    state,
    photoOf,
    usedPhotoIds,
    maxGridSlots: MAX_GRID_SLOTS,
    setLayout: changeLayout,
    setRatio,
    setActiveSlot,
    setSliderPos,
    setShowCaptions,
    setTool,
    setColor,
    assignPhoto,
    updateSlot,
    nudgeSlot,
    resetSlot,
    addGridSlot,
    removeSlot,
    applyToAll,
    addAnnotation,
    undoAnnotation,
    clearAnnotations,
  };
}
