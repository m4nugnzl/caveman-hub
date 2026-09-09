import { useCallback, useMemo, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { resolvedMicrocycles } from '@/domain/blocks';
import { findByName } from '@/domain/catalog';
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
    sheetOf,
    catalogExercises,
  } = useApp();
  const [preferredWeek, setPreferredWeek] = useState(null);

  /**
   * LA FICHA DE UN EJERCICIO, YA UNIDA: lo de su entrenador y lo del catálogo.
   *
   * ══ Por qué se compone aquí y no en la vista ═══════════════════════════════
   *
   * Porque son DOS fuentes con dos permisos distintos —el vídeo y las pautas
   * llegan por la función `exercise_sheets` (0100), y el músculo, el material y
   * la descripción salen de `catalog_exercises`, que cualquiera puede leer
   * (0033)— y unirlas es justo el trabajo de este envoltorio: aquí es donde
   * este portal conecta el contexto con las vistas. La ficha viaja como una
   * función y no como dos listas, así que ninguna pieza de la rutina tiene que
   * saber de dónde salió cada mitad.
   *
   * ── Devuelve `null` si no lo ha puesto su entrenador ──────────────────────
   * Y ese `null` es lo que decide que el renglón NO lleve marca. La condición es
   * que haya vídeo o pautas: la descripción del catálogo, sola, no abre ficha.
   * Es la regla de la 0098 —«si no lo pone el entrenador, no existe»— y evita
   * que trescientos ejercicios aparezcan de repente con una marca que solo lleva
   * texto genérico detrás.
   */
  const fichaDe = useCallback(
    (name) => {
      const suyo = sheetOf(name);
      if (!suyo) return null;

      const general = findByName(catalogExercises, name);
      return {
        videoUrl: suyo.videoUrl,
        cue: suyo.cue,
        muscle: general?.muscle ?? null,
        equipment: general?.equipment ?? null,
        description: general?.description ?? null,
      };
    },
    [sheetOf, catalogExercises]
  );

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

  /*
    El programa CON EL PLAN PUESTO: el plan es del bloque y cada microciclo lleva
    encima sus excepciones (`resolvedMicrocycles`). Se resuelve aquí, en la
    frontera, y no en la vista: así el cliente ve la rutina que le toca sin que
    ninguna de sus piezas tenga que saber que existen los bloques —que además es
    vocabulario del entrenador, no suyo—.

    Mientras ningún bloque tenga su plan dentro devuelve los mismos objetos, así
    que el portal se comporta exactamente igual hasta que se migre.
  */
  const guardado = workoutData[activeClient.id];
  const program = useMemo(
    () => (guardado ? { ...guardado, microcycles: resolvedMicrocycles(guardado) } : guardado),
    [guardado]
  );
  /* Solo para elegir la semana abierta: la lista de semanas ya no viaja a la
     vista, que las saca del programa tramo a tramo (ver `LineaDeBloques`). */
  const weeks = (program?.microcycles || []).map((m) => m.weekNumber);
  // Derivado, no almacenado: no puede quedar una semana rancia seleccionada.
  const activeWeek = weeks.includes(preferredWeek) ? preferredWeek : weeks[weeks.length - 1] ?? null;

  return (
    <div className="stack">
      <PageHead title="Mi rutina" sub="Lo que toca este microciclo, y dónde apuntas lo que levantas." />
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
        /* La ficha de cada ejercicio, ya unida. Ver `fichaDe` arriba. */
        fichaDe={fichaDe}
        save={saveStatus('workout', activeClient.id)}
        onRetry={() => retrySave('workout', activeClient.id)}
      />
    </div>
  );
};
