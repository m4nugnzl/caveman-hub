import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { ClientWeek } from './ClientWeek';

/** Nivel «Check-in» de `/mi/evolucion`: pesajes de la semana y revisión completa. */
export const ClientCheckInsRoute = () => {
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
  } = useApp();

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient.id),
    [progressPhotos, activeClient.id]
  );

  return (
    <div className="stack">
      {/* Entregar la semana y leer lo que te ha contestado tu entrenador: el
          mismo gesto que pesarse, así que el mismo sitio. Ver `ClientWeek`. */}
      <ClientWeek client={activeClient} />

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
      />
    </div>
  );
};
