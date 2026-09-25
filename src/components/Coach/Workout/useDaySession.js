import { useCallback, useEffect, useMemo, useState } from 'react';

import { allSessionsOfDay, mergePlanWithSession } from '@/domain/sessions';

/**
 * Sesión activa del día que se está viendo.
 *
 * La sesión seleccionada se DERIVA, no se almacena: el estado guarda la
 * preferencia del usuario y en cada render se comprueba contra las sesiones que
 * existen de verdad. Es el mismo criterio que la navegación por semanas, y evita
 * que quede una sesión rancia seleccionada al cambiar de día, de semana o de
 * cliente — que fue justo el bug que hubo con el selector de semana.
 *
 * @param fijada  Qué sesión abrir cuando quien entra ya lo sabe (el cliente
 *   entra por UNA aparición de la hoja, ver `aparicionesDelMicrociclo`): su id,
 *   o `null` para «una nueva», que nace con la primera serie. Sin pasarlo
 *   (`undefined`), la más reciente, como siempre.
 */
export function useDaySession(microcycle, day, fijada) {
  const [preferredId, setPreferredId] = useState(null);

  const sessions = useMemo(
    () => (microcycle && day ? allSessionsOfDay(microcycle, day.dayName) : []),
    [microcycle, day]
  );

  // Al cambiar de día o de semana se olvida la preferencia.
  useEffect(() => {
    setPreferredId(null);
  }, [microcycle?.id, day?.dayName]);

  const activeId = useMemo(() => {
    if (preferredId && sessions.some((s) => s.id === preferredId)) return preferredId;
    if (fijada !== undefined) return fijada && sessions.some((s) => s.id === fijada) ? fijada : null;
    return sessions[0]?.id || null; // la más reciente
  }, [preferredId, sessions, fijada]);

  const session = sessions.find((s) => s.id === activeId) || null;

  /** Ejercicios con el objetivo del plan y los valores de esta sesión. */
  const exercises = useMemo(() => mergePlanWithSession(day, session), [day, session]);

  const select = useCallback((id) => setPreferredId(id), []);

  return { sessions, session, activeId, exercises, select };
}
