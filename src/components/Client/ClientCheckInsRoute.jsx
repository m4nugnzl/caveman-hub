import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { clientCycleSlots } from '@/domain/blocks';
import { currentCheckInPeriod } from '@/domain/calendar';
import { cycleFoto } from '@/domain/nutrition';
import { todayISO, weekStart } from '@/lib/dates';
import { PageHead } from '@/components/ui/primitives';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { ClientWeek } from './ClientWeek';
import { useOculto } from './Oculto';

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
    checkIns,
    workoutData,
    addAnthropometryLog,
    removeAnthropometryLog,
    uploadProgressPhoto,
    submitCheckIn,
    saveStatus,
    retrySave,
  } = useApp();


  /*
    LA FOTO DEL PLAN que se guarda con el pesaje. Se arma aquí y no dentro del
    panel porque hace falta el CICLO de esta persona —sus casillas— para poder
    ponderar la media, y eso es lo que sabe la pantalla: hasta hoy se le pasaba
    el plan crudo y se guardaba `targetKcals`, que es el primer día del plan.
    En un alto/bajo, siempre el alto y sin decirlo. Ver `cycleFoto`.
  */
  const fotoDelPlan = useMemo(
    () => cycleFoto(nutrition[activeClient.id], clientCycleSlots(activeClient, workoutData?.[activeClient.id])),
    [nutrition, workoutData, activeClient]
  );

  /* El subtítulo nombraba el peso, que es justo lo que aquí ya no sale para
     quien lo tiene oculto: lo que se entrega sigue siendo la semana. */
  const oculto = useOculto();

  const location = useLocation();
  const navigate = useNavigate();
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

  /*
    ══ Quien llega pidiendo hacer el check-in, lo empieza ══════════════════════

    «Hacer mi check-in» —en sus fotos— y «Entregar mi revisión» —en su
    calendario— traían aquí y no abrían nada: el cliente aterrizaba en la hoja de
    la revisión, veía sus pesajes y daba por hecho que no le dejaba. El gesto
    seguía existiendo, pero en OTRO botón de esta misma pantalla, y nadie le
    decía que ese era el bueno.

    Así que la intención viaja con la navegación (`state.abrirCheckIn`) y la
    pantalla la cumple. Pero solo si la semana está por entregar: reabrir el
    asistente con la semana ya entregada la REENVÍA, y una reentrega borra la
    respuesta que el entrenador ya había escrito —ver `AnthropometryPanel`—.
    Entregada, aquí se aterriza y punto, que es donde lo dice.
  */
  const entrega = checkIns?.[activeClient.id];
  const porEntregar = !(entrega?.weekStart >= semana && (entrega.submittedAt || entrega.reviewedAt));

  useEffect(() => {
    if (!location.state?.abrirCheckIn) return;
    /* La intención se consume al llegar: si se quedara en el historial, volver
       atrás desde cualquier otra pantalla reabriría el asistente sin que nadie
       lo haya pedido. */
    navigate(location.pathname, { replace: true, state: null });
    if (porEntregar) setAsistente(true);
  }, [location.state, location.pathname, navigate, porEntregar]);

  return (
    <div className="stack">
      <PageHead
        title="Mi check-in"
        sub={
          oculto.weight
            ? 'Lo que entregas cada semana, y lo que te contesta tu entrenador.'
            : 'Tu peso de la semana, y lo que te contesta tu entrenador.'
        }
      />

      {/* Entregar la semana y leer lo que te ha contestado tu entrenador: el
          mismo gesto que pesarse, así que el mismo sitio. Ver `ClientWeek`. */}
      <ClientWeek client={activeClient} onDeliver={() => setAsistente(true)} />

      <AnthropometryPanel
        client={activeClient}
        anthropometry={anthropometry[activeClient.id]}
        nutritionFoto={fotoDelPlan}
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
