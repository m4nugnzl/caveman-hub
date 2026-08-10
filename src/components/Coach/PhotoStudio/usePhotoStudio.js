import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defaultAdjustments, defaultTransform } from '@/domain/photoLayout';
import { newId } from '@/lib/ids';
import { availableAngles, availableWeeks, suggestPair, weekAngleMatrix } from '@/domain/photos';

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
export function usePhotoStudio({ photos, clientId, startDate }) {
  const [layout, setLayout] = useState('pair');
  const [ratio, setRatio] = useState('native');
  const [slots, setSlots] = useState([emptySlot(), emptySlot()]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [sliderPos, setSliderPos] = useState(0.5);
  const [showCaptions, setShowCaptions] = useState(true);
  const [annotations, setAnnotations] = useState([]);
  const [tool, setTool] = useState('pan');
  const [color, setColor] = useState('#10b981');

  /*
    Selección de la matriz: qué semanas y qué ángulos entran en el montaje.
    ------------------------------------------------------------------------
    Vive aquí y no en los huecos porque en el layout de matriz los huecos son
    DERIVADOS: se recalculan solos cada vez que se marca o desmarca una semana, y
    conservan las celdas vacías para que las columnas queden alineadas.
  */
  const [pickedWeeks, setPickedWeeks] = useState([]);
  const [pickedAngles, setPickedAngles] = useState(['frontal']);

  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const photoOf = useCallback((id) => photoById.get(id) || null, [photoById]);

  const weeks = useMemo(() => availableWeeks(photos, startDate), [photos, startDate]);
  const angles = useMemo(() => availableAngles(photos), [photos]);

  /** Huecos y dimensiones de la matriz, a partir de lo marcado. */
  const matrix = useMemo(
    () =>
      weekAngleMatrix({
        photos,
        weeks: pickedWeeks.filter((w) => weeks.includes(w)),
        angles: pickedAngles.filter((a) => angles.includes(a)),
        startDate,
      }),
    [photos, pickedWeeks, pickedAngles, weeks, angles, startDate]
  );

  const toggleWeek = useCallback((week) => {
    setPickedWeeks((prev) =>
      prev.includes(week) ? prev.filter((w) => w !== week) : [...prev, week].sort((a, b) => a - b)
    );
  }, []);

  /*
    Espejo síncrono del layout y de las celdas.
    ------------------------------------------------------------------------
    `writeSlot` corre dentro de un actualizador de estado y necesita saber en qué
    layout está y qué foto hay en cada celda. Leer esos valores del closure daría
    los de la renderización anterior; una `ref` da siempre el valor actual sin
    volver a crear las funciones en cada cambio de selección.
  */
  const matrixRef = useRef({ layout: 'pair', cells: [] });

  /** Espejo de los huecos, por el mismo motivo que `matrixRef`. */
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const toggleAngle = useCallback((angle) => {
    setPickedAngles((prev) => {
      // Al menos un ángulo: con cero, la matriz se queda sin filas y el lienzo
      // en blanco, que parece un error y no una elección.
      if (prev.includes(angle)) return prev.length === 1 ? prev : prev.filter((a) => a !== angle);
      return [...prev, angle];
    });
  }, []);

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
    setPickedWeeks([]);
    setPickedAngles(['frontal']);
    // Solo al cambiar de cliente: si dependiera de `photos`, cada subida
    // reiniciaría el montaje que el coach está preparando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Los layouts de dos huecos se recortan a dos; la rejilla admite más.
  const changeLayout = useCallback((next) => {
    setLayout(next);
    if (next === 'matrix') return; // sus huecos los calcula la matriz
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

  /**
   * Escribe en el hueco `index` sea cual sea el layout.
   *
   * ── Por qué hace falta esta indirección ─────────────────────────────────────
   * En los layouts normales el índice del hueco ES la posición en `slots`. En la
   * matriz no: los huecos se derivan de las celdas, y escribir por índice movería
   * el encuadre a la foto equivocada en cuanto se añade o quita una semana. Ahí la
   * identidad del hueco es la FOTO que contiene, así que se busca su entrada en
   * `slots` —o se crea— y se escribe sobre ella.
   */
  const writeSlot = useCallback(
    (index, apply) => {
      const photoId = matrixRef.current.layout === 'matrix' ? matrixRef.current.cells[index]?.photoId : null;

      setSlots((prev) => {
        if (matrixRef.current.layout !== 'matrix') {
          return prev.map((slot, i) => (i === index ? apply(slot) : slot));
        }
        if (!photoId) return prev;

        const at = prev.findIndex((s) => s.photoId === photoId);
        if (at >= 0) return prev.map((slot, i) => (i === at ? apply(slot) : slot));
        return [...prev, apply(slotWith(photoId))];
      });
    },
    []
  );

  const updateSlot = useCallback(
    (index, patch) =>
      writeSlot(index, (slot) => ({
        ...slot,
        transform: { ...slot.transform, ...(patch.transform || {}) },
        adjustments: { ...slot.adjustments, ...(patch.adjustments || {}) },
      })),
    [writeSlot]
  );

  const nudgeSlot = useCallback(
    (index, dx, dy) =>
      writeSlot(index, (slot) => ({
        ...slot,
        transform: {
          ...slot.transform,
          offsetX: Math.max(-1, Math.min(1, slot.transform.offsetX + dx)),
          offsetY: Math.max(-1, Math.min(1, slot.transform.offsetY + dy)),
        },
      })),
    [writeSlot]
  );

  const resetSlot = useCallback(
    (index) => writeSlot(index, (slot) => ({ ...emptySlot(), photoId: slot.photoId })),
    [writeSlot]
  );

  const addGridSlot = useCallback(() => {
    setSlots((prev) => (prev.length < MAX_GRID_SLOTS ? [...prev, emptySlot()] : prev));
  }, []);

  const removeSlot = useCallback((index) => {
    setSlots((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
    setActiveSlot((prev) => Math.max(0, prev - (index <= prev ? 1 : 0)));
  }, []);

  /**
   * Copia el encuadre y los ajustes del hueco activo al resto.
   *
   * Es la función más útil del estudio: iguala la escala y la luz de todas las
   * fotos de golpe, que es lo que hace que una comparación no engañe. En la matriz
   * tiene que alcanzar a TODAS las fotos de la selección, no solo a las que ya
   * tuvieran una entrada propia en `slots`.
   */
  const applyToAll = useCallback(() => {
    const { layout: current, cells } = matrixRef.current;

    setSlots((prev) => {
      if (current !== 'matrix') {
        const source = prev[activeSlot];
        if (!source) return prev;
        return prev.map((slot) => ({
          ...slot,
          transform: { ...source.transform },
          adjustments: { ...source.adjustments },
        }));
      }

      const sourceId = cells[activeSlot]?.photoId;
      const source = prev.find((s) => s.photoId === sourceId);
      if (!source) return prev;

      const ids = cells.map((c) => c.photoId).filter(Boolean);
      return ids.map((photoId) => ({
        photoId,
        transform: { ...source.transform },
        adjustments: { ...source.adjustments },
      }));
    });
  }, [activeSlot]);

  /**
   * Intercambia el orden de los huecos.
   *
   * Con dos, es el «antes» y el «después» al revés — y no había forma de
   * corregirlo: si la sugerencia automática colocaba la foto reciente a la
   * izquierda había que reasignar las dos a mano desde la biblioteca. Con más de
   * dos (rejilla) invierte la secuencia completa, que es lo que se espera de
   * «invertir el orden».
   *
   * En la matriz no aplica: allí el orden lo dan las semanas, y ya salen de la más
   * antigua a la más reciente.
   */
  const swapSlots = useCallback(() => {
    setSlots((prev) => [...prev].reverse());
    setActiveSlot((prev) => {
      const last = slotsRef.current.length - 1;
      return last < 0 ? 0 : last - prev;
    });
  }, []);

  const addAnnotation = useCallback((annotation) => {
    setAnnotations((prev) => [...prev, { id: newId('ann'), ...annotation }]);
  }, []);

  const undoAnnotation = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
  }, []);

  const clearAnnotations = useCallback(() => setAnnotations([]), []);

  matrixRef.current = { layout, cells: matrix.cells };

  /*
    Los huecos efectivos. En la matriz se derivan de las semanas y ángulos
    marcados, conservando el encuadre y los ajustes que ya tuviera cada foto: si
    el entrenador ha igualado la escala de un frontal y luego añade una semana, no
    debe perder ese trabajo.
  */
  const effectiveSlots = useMemo(() => {
    if (layout !== 'matrix') return slots;
    const byPhoto = new Map(slots.filter((s) => s.photoId).map((s) => [s.photoId, s]));
    return matrix.cells.map((cell) =>
      cell.photoId ? byPhoto.get(cell.photoId) || slotWith(cell.photoId) : emptySlot()
    );
  }, [layout, slots, matrix]);

  const state = useMemo(
    () => ({
      layout,
      ratio,
      slots: effectiveSlots,
      activeSlot: Math.min(activeSlot, Math.max(0, effectiveSlots.length - 1)),
      sliderPos,
      showCaptions,
      annotations,
      tool,
      color,
      dims: layout === 'matrix' ? { cols: matrix.cols, rows: matrix.rows } : null,
    }),
    [layout, ratio, effectiveSlots, activeSlot, sliderPos, showCaptions, annotations, tool, color, matrix]
  );

  const usedPhotoIds = useMemo(
    () => new Set(effectiveSlots.map((s) => s.photoId).filter(Boolean)),
    [effectiveSlots]
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
    swapSlots,

    // Matriz de semanas x ángulos
    weeks,
    angles,
    pickedWeeks,
    pickedAngles,
    toggleWeek,
    toggleAngle,
    matrix,
  };
}
