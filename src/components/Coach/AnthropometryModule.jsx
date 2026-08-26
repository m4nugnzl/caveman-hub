import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { Notice, PageHead } from '@/components/ui/primitives';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { ReviewHistory } from '@/components/ReviewHistory';
import { useReviewRows } from '@/components/review/useReviewRows';

/**
 * Los check-ins del cliente activo, vistos por el entrenador.
 *
 * Es el MISMO panel que usa el cliente. Quien hace el check-in es él —se pesa
 * varios días y sube sus fotos— pero el entrenador conserva la posibilidad de
 * añadir y corregir registros, porque los pliegues se miden a veces en persona y
 * porque a veces hay que arreglar un dato mal metido.
 */
export const AnthropometryModule = () => {
  const {
    activeClient,
    anthropometry,
    nutrition,
    progressPhotos,
    addAnthropometryLog,
    removeAnthropometryLog,
    uploadProgressPhoto,
    saveStatus,
    retrySave,
    updateClient,
  } = useApp();

  /* El historial de revisiones lo carga la pantalla y no el panel: es lo mismo
     que hacen «Su semana» y el portal desde que dos piezas de la misma pantalla
     lo necesitaban a la vez. Ver `useReviewRows`. */
  const { rows: revisiones, recargar } = useReviewRows(activeClient?.id);

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient.id),
    [progressPhotos, activeClient.id]
  );

  return (
    <div className="stack">
      {/* El subtítulo va sin pronombre: la ficha no sabe el género de esta
          persona, y un «él» fijo debajo del nombre de una clienta se lee como
          un descuido. */}
      <PageHead
        title="Check-in"
        sub={`El peso de la semana de ${activeClient.name} y sus medidas. Lo normal es que lo entregue desde su portal.`}
      />

      {/* Lo que se decidió en las revisiones anteriores, antes que el formulario:
          para decidir esta semana hace falta saber qué se hizo la pasada. */}
      <ReviewHistory
        client={activeClient}
        audience="coach"
        rows={revisiones}
        recargar={recargar}
      />

      <Notice tone="info">
        Un check-in son dos cosas: los pesajes de la semana —que se promedian para filtrar la
        variación diaria— y las fotos, siempre en las mismas condiciones. Lo normal es que lo haga el
        cliente desde su portal; desde aquí puedes completarlo o corregirlo.
      </Notice>

      <AnthropometryPanel
        client={activeClient}
        anthropometry={anthropometry[activeClient.id]}
        nutritionPlan={nutrition[activeClient.id]}
        audience="coach"
        save={saveStatus('anthro', activeClient.id)}
        onRetry={() => retrySave('anthro', activeClient.id)}
        onAdd={(log) => addAnthropometryLog(activeClient.id, log)}
        onRemove={(logId) => removeAnthropometryLog(activeClient.id, logId)}
        photos={photos}
        onUploadPhoto={uploadProgressPhoto}
        onSetGender={(gender) => updateClient(activeClient.id, { gender })}
      />
    </div>
  );
};
