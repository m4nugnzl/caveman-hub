import { useCallback, useEffect, useMemo, useState } from 'react';
import { findMicrocycle } from '@/domain/training';

/**
 * Navegación por semana y día del programa.
 *
 * ── Los dos bugs que resuelve ───────────────────────────────────────────────
 * 1. `activeWeek` se inicializaba UNA sola vez con `useState(...)`. Al cambiar
 *    de cliente el valor se mantenía, y si el nuevo cliente no tenía esa
 *    semana se caía en silencio a `microcycles[0]`: el coach creía estar
 *    editando la semana 8 y estaba escribiendo en la 1.
 * 2. `activeDayIdx` podía quedar fuera de rango al borrar un día, y se
 *    corregía con un `useEffect` que llegaba un render tarde (un render con la
 *    vista en blanco).
 *
 * La solución es no almacenar el valor efectivo, sino DERIVARLO: el estado
 * guarda la preferencia del usuario y el valor válido se calcula en cada
 * render contra los datos actuales. Así no hay estado que pueda quedar rancio.
 */
export function useProgramNavigation(clientId, microcycles) {
  const [preferredWeek, setPreferredWeek] = useState(null);
  const [preferredDayIdx, setPreferredDayIdx] = useState(0);

  // Al cambiar de cliente se olvida la preferencia y se vuelve a su última semana.
  useEffect(() => {
    setPreferredWeek(null);
    setPreferredDayIdx(0);
  }, [clientId]);

  const weeks = useMemo(() => microcycles.map((m) => m.weekNumber), [microcycles]);

  // Semana válida: la preferida si sigue existiendo, si no la última.
  const week = useMemo(() => {
    if (preferredWeek !== null && weeks.includes(preferredWeek)) return preferredWeek;
    return weeks.length > 0 ? weeks[weeks.length - 1] : null;
  }, [preferredWeek, weeks]);

  const microcycle = useMemo(() => findMicrocycle(microcycles, week), [microcycles, week]);
  const days = microcycle?.days || [];

  const dayIndex = days.length === 0 ? -1 : Math.min(preferredDayIdx, days.length - 1);
  const day = dayIndex >= 0 ? days[dayIndex] : null;

  const weekIndex = weeks.indexOf(week);
  const goPrevWeek = useCallback(() => {
    if (weekIndex > 0) setPreferredWeek(weeks[weekIndex - 1]);
  }, [weekIndex, weeks]);
  const goNextWeek = useCallback(() => {
    if (weekIndex >= 0 && weekIndex < weeks.length - 1) setPreferredWeek(weeks[weekIndex + 1]);
  }, [weekIndex, weeks]);

  /** Se llama tras crear o clonar una semana para navegar a ella. */
  const selectWeek = useCallback((value) => {
    setPreferredWeek(value);
    setPreferredDayIdx(0);
  }, []);

  return {
    weeks,
    week,
    microcycle,
    days,
    day,
    dayIndex,
    selectWeek,
    selectDay: setPreferredDayIdx,
    goPrevWeek,
    goNextWeek,
    canGoPrev: weekIndex > 0,
    canGoNext: weekIndex >= 0 && weekIndex < weeks.length - 1,
  };
}
