import { useCallback, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { PageHead } from '@/components/ui/primitives';
import { ClientRoutine } from './ClientRoutine';
import { IntakePrompt } from './IntakePrompt';

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
    updateSessionMeta,
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
  /* Solo para elegir la semana abierta: la lista de semanas ya no viaja a la
     vista, que las saca del programa tramo a tramo (ver `LineaDeBloques`). */
  const weeks = (program?.microcycles || []).map((m) => m.weekNumber);
  // Derivado, no almacenado: no puede quedar una semana rancia seleccionada.
  const activeWeek = weeks.includes(preferredWeek) ? preferredWeek : weeks[weeks.length - 1] ?? null;

  return (
    <div className="stack">
      <PageHead title="Mi rutina" sub="Lo que toca esta semana, y dónde apuntas lo que levantas." />
      {/* Lo que su entrenador espera de él antes de empezar: la rutina es la
          primera pantalla del portal, así que el alta pendiente se pide aquí. */}
      <IntakePrompt client={activeClient} />
      <ClientRoutine
      client={activeClient}
      program={program}
      activeWeek={activeWeek}
      onSelectWeek={setPreferredWeek}
      onLogSet={logClientSet}
      /* Feedback y logbook. El cliente no puede escribir `workout_data`
         directamente, así que esto viaja por `log_session_feedback` (0016); el
         contexto elige el camino según el rol. */
      onMeta={({ weekNumber, sessionId, patch }) =>
        updateSessionMeta(activeClient.id, weekNumber, sessionId, patch)
      }
      // Al continuar, se salta a la semana nueva: si no, el cliente la crea y se
      // queda mirando la anterior sin ver que ha pasado algo.
      onContinue={() => {
        const week = continueProgram(activeClient.id);
        if (week) setPreferredWeek(week);
      }}
        save={saveStatus('workout', activeClient.id)}
        onRetry={() => retrySave('workout', activeClient.id)}
      />
    </div>
  );
};
