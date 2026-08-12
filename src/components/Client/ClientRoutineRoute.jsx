import { useCallback, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { ClientRoutine } from './ClientRoutine';

/**
 * Ruta `/mi/rutina`: conecta el contexto con la vista.
 *
 * Estos envoltorios existen porque las vistas del cliente reciben sus datos por
 * props —lo que las hace fáciles de leer y de probar— y las rutas no reciben
 * nada. Antes esta conexión estaba dentro de un `ClientPortal` de 200 líneas que
 * cableaba las seis secciones a la vez, tuvieras abierta la que tuvieras.
 */
export const ClientRoutineRoute = () => {
  const {
    activeClient,
    workoutData,
    logSessionSet,
    continueProgram,
    saveStatus,
    retrySave,
  } = useApp();
  const [preferredWeek, setPreferredWeek] = useState(null);

  /**
   * El cliente registra sus series en una SESIÓN CON FECHA, igual que el
   * entrenador. Antes escribía dentro del plan, y sus kilos desaparecían de la
   * analítica en cuanto el entrenador abría una sesión del mismo día.
   *
   * Ya no hay `startOnly`: existía para el botón «Registrar hoy», que se ha
   * retirado porque `logSessionSet` ya crea la sesión al escribir el primer valor.
   * El cliente no tiene que anunciar que va a entrenar; le basta con anotar.
   */
  const logClientSet = useCallback(
    ({ clientId, weekNumber, sessionId, date, dayName, exercise, setIndex, field, value }) =>
      logSessionSet(clientId, weekNumber, sessionId, date, dayName, exercise, setIndex, field, value),
    [logSessionSet]
  );

  const program = workoutData[activeClient.id];
  const weeks = (program?.microcycles || []).map((m) => m.weekNumber);
  // Derivado, no almacenado: no puede quedar una semana rancia seleccionada.
  const activeWeek = weeks.includes(preferredWeek) ? preferredWeek : weeks[weeks.length - 1] ?? null;

  return (
    <ClientRoutine
      client={activeClient}
      program={program}
      weeks={weeks}
      activeWeek={activeWeek}
      onSelectWeek={setPreferredWeek}
      onLogSet={logClientSet}
      // Al continuar, se salta a la semana nueva: si no, el cliente la crea y se
      // queda mirando la anterior sin ver que ha pasado algo.
      onContinue={() => {
        const week = continueProgram(activeClient.id);
        if (week) setPreferredWeek(week);
      }}
      save={saveStatus('workout', activeClient.id)}
      onRetry={() => retrySave('workout', activeClient.id)}
    />
  );
};
