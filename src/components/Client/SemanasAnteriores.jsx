import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { clientCycleSlots } from '@/domain/blocks';
import { cycleFoto } from '@/domain/nutrition';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { ReviewHistory } from '@/components/ReviewHistory';
import { useReviewRows } from '@/components/review/useReviewRows';
import { ClientReviews } from './ClientReviews';

/**
 * LAS SEMANAS ANTERIORES: la báscula, las medidas y lo que te fue contestando.
 *
 * ══ Por qué es una pieza y no una pantalla ═════════════════════════════════
 *
 * Porque se monta en DOS sitios, y hasta el 14 de septiembre de 2026 eran dos
 * sitios con dos implementaciones distintas del mismo trabajo. El dueño lo
 * encontró tirando del hilo desde el monitor:
 *
 *   *«Revisión es feo […] semanas anteriores te lleva a una pantalla que ya
 *   estaba construida que es similar a lo que tenemos pero hecho de otra
 *   forma.»*
 *
 * Y era literal. La Revisión nueva del monitor traía su propia báscula
 * —`pc/PantallaRevision · Bascula`, un tercer duplicado de `PesoDeHoy`— y un
 * botón «Semanas anteriores» que empujaba a `/mi/evolucion/medidas`, que es
 * esto: el mismo peso, las mismas medidas y el mismo historial, con otro
 * mueble. Dos pantallas para una pregunta.
 *
 * Ahora la pregunta se contesta una vez y se monta donde haga falta:
 *
 *   · **En el monitor**, al pie de la Revisión. Ahí abajo hay sitio y el
 *     recorrido es el natural: apunto lo de hoy, entrego, y si quiero miro
 *     atrás. Sin cambiar de pantalla.
 *   · **En el teléfono**, detrás de su fila, como pantalla empujada
 *     (`ClientCheckInsRoute`). En 390 px no se pueden apilar las dos cosas sin
 *     que la de arriba —que es la que hay que hacer— se pierda arriba del todo.
 *
 * ══ Se lee del contexto y no recibe props ══════════════════════════════════
 *
 * A propósito: son cinco cosas (la antropometría, la foto del plan, las fotos,
 * el estado de guardado y las revisiones cerradas) y las dos pantallas que la
 * montan tendrían que cablearlas igual. Cableadas dos veces, el día que el
 * panel pida una sexta solo se enteraría una. Lo único que hace falta saber
 * fuera es que existe.
 */
export const SemanasAnteriores = () => {
  const {
    activeClient,
    anthropometry,
    nutrition,
    progressPhotos,
    workoutData,
    addAnthropometryLog,
    removeAnthropometryLog,
    apuntarMedida,
    saveStatus,
    retrySave,
  } = useApp();

  /*
    LA FOTO DEL PLAN que se guarda con el pesaje. Se arma aquí y no dentro del
    panel porque hace falta el CICLO de esta persona —sus casillas— para poder
    ponderar la media: con el plan crudo se guardaba `targetKcals`, que en un
    alto/bajo es siempre el alto y sin decirlo. Ver `cycleFoto`.
  */
  const fotoDelPlan = useMemo(
    () =>
      activeClient
        ? cycleFoto(
            nutrition[activeClient.id],
            clientCycleSlots(activeClient, workoutData?.[activeClient.id])
          )
        : null,
    [nutrition, workoutData, activeClient]
  );

  /* Sus revisiones cerradas, con los cambios de plan de cada una. */
  const { rows: revisiones, recargar } = useReviewRows(activeClient?.id);

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient?.id),
    [progressPhotos, activeClient?.id]
  );

  if (!activeClient) return null;

  return (
    <>
      {/*
        ══ LA BÁSCULA ════════════════════════════════════════════════════════

        Sin `open`/`onOpenChange`: el asistente de la revisión se abre desde la
        lista de pasos, que está arriba, y montarlo también aquí dejaría otra
        vez dos puertas al mismo gesto. Este panel es lo que es para el
        entrenador —anotar y corregir— y por eso no recibe ni `onSubmitWeek` ni
        `weekStart`.
      */}
      <AnthropometryPanel
        client={activeClient}
        anthropometry={anthropometry[activeClient.id]}
        nutritionFoto={fotoDelPlan}
        audience="client"
        save={saveStatus('anthro', activeClient.id)}
        onRetry={() => retrySave('anthro', activeClient.id)}
        onAdd={(log) => addAnthropometryLog(activeClient.id, log)}
        onRemove={(logId) => removeAnthropometryLog(activeClient.id, logId)}
        /* La casilla diaria de una medida: se funde con lo que haya de ese día
           en vez de sustituirlo. Ver `apuntarMedida`. */
        onApuntarMedida={(date, id, valor) => apuntarMedida(activeClient.id, date, id, valor)}
        photos={photos}
      />

      {/* Sus revisiones en vídeo y lo que le fue diciendo su entrenador semana
          a semana. Aquí abajo, que es donde se consulta el rastro: la respuesta
          de ESTA semana se lee arriba, con la entrega. */}
      <ClientReviews client={activeClient} />
      <ReviewHistory client={activeClient} audience="client" rows={revisiones} recargar={recargar} />
    </>
  );
};
