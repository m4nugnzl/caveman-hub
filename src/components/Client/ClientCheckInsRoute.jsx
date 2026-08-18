import { useMemo, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { currentCheckInPeriod } from '@/domain/calendar';
import { todayISO, weekStart } from '@/lib/dates';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { ClientWeek } from './ClientWeek';

/**
 * Nivel «Check-in» de `/mi/evolucion`: pesajes de la semana y revisión completa.
 *
 * ══ Por qué el asistente se abre desde aquí ═════════════════════════════════
 *
 * Porque hasta ahora había DOS formas de entregar la semana en esta pantalla, y
 * ninguna de las dos lo hacía entero:
 *
 *   · «Entregar mi semana» (en `ClientWeek`) creaba el check-in con el promedio
 *     de pesajes. Sin fotos, sin medidas y sin preguntas.
 *   · «Entregar mi revisión» (en `AnthropometryPanel`) abría el asistente, que
 *     guardaba el registro y las fotos… y no entregaba nada. El entrenador no se
 *     enteraba de que había pasado algo.
 *
 * Los dos nombres se parecen y ninguno decía que el otro existía. Quien hacía el
 * asistente completo creía haber mandado su semana; quien pulsaba el botón la
 * mandaba vacía.
 *
 * Ahora hay un solo camino —el asistente— y esta ruta es quien lo abre, porque
 * las dos tarjetas son hermanas suyas y ninguna de las dos puede mandar sobre la
 * otra. Es el mismo patrón que ya usa el modo de revisión del entrenador: el
 * estado vive donde alcanza a las dos piezas.
 */
export const ClientCheckInsRoute = () => {
  const {
    activeClient,
    anthropometry,
    nutrition,
    progressPhotos,
    addAnthropometryLog,
    removeAnthropometryLog,
    uploadProgressPhoto,
    submitCheckIn,
    saveStatus,
    retrySave,
  } = useApp();

  const [asistente, setAsistente] = useState(false);

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient.id),
    [progressPhotos, activeClient.id]
  );

  /*
    El lunes del PERIODO en curso, no el de esta semana.

    Con cadencia quincenal el periodo empezó hace dos semanas, y `check_ins` tiene
    una fila por (cliente, semana): entregar contra el lunes de hoy crearía una
    fila distinta de la que la cola del entrenador está mirando, así que la
    entrega no aparecería por ninguna parte. `ClientWeek` ya calcula el periodo
    para lo suyo; aquí hace falta para decirle al asistente qué semana entrega.
  */
  const periodo = currentCheckInPeriod(
    activeClient?.preferences,
    activeClient?.startDate,
    todayISO()
  );
  const semana = periodo?.start || weekStart(todayISO());
  /* Cuántas semanas naturales abarca. Es la ventana con la que el asistente
     promedia los pesajes para proponer el peso, y tiene que ser la misma con la
     que se entrega: si no, propone el promedio de una y guarda el de otra. */
  const semanasDelPeriodo = periodo?.everyWeeks || 1;

  return (
    <div className="stack">
      {/* Entregar la semana y leer lo que te ha contestado tu entrenador: el
          mismo gesto que pesarse, así que el mismo sitio. Ver `ClientWeek`. */}
      <ClientWeek client={activeClient} onDeliver={() => setAsistente(true)} />

      <AnthropometryPanel
        client={activeClient}
        anthropometry={anthropometry[activeClient.id]}
        nutritionPlan={nutrition[activeClient.id]}
        audience="client"
        save={saveStatus('anthro', activeClient.id)}
        onRetry={() => retrySave('anthro', activeClient.id)}
        onAdd={(log) => addAnthropometryLog(activeClient.id, log)}
        onRemove={(logId) => removeAnthropometryLog(activeClient.id, logId)}
        photos={photos}
        onUploadPhoto={uploadProgressPhoto}
        open={asistente}
        onOpenChange={setAsistente}
        /* Terminar el asistente entrega la semana. Va por aquí y no por dentro
           del panel porque el panel lo comparten cliente y entrenador, y el
           entrenador no entrega la semana de nadie. */
        onSubmitWeek={(datos) => submitCheckIn(activeClient.id, datos)}
        weekStart={semana}
        weeks={semanasDelPeriodo}
      />
    </div>
  );
};
