import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { Mando } from '@/components/ui/Mando';
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
      {/* Una línea, sin titular —la miga ya dice «Check-in»— y sin pronombre: la
          ficha no sabe el género de esta persona. Lo que era un aviso de tres
          líneas explicando qué es un check-in cabe aquí: los pesajes se
          promedian, las fotos en las mismas condiciones, y lo normal es que lo
          entregue desde su portal. */}
      <Mando contexto="Los pesajes de la semana se promedian. Lo normal es que lo entregue desde su portal; aquí lo completas o lo corriges." />

      {/* Lo que se decidió en las revisiones anteriores, antes que el formulario:
          para decidir esta semana hace falta saber qué se hizo la pasada. */}
      <ReviewHistory
        client={activeClient}
        audience="coach"
        rows={revisiones}
        recargar={recargar}
      />

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
