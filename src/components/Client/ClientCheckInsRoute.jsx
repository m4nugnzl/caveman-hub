import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';

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
  );
};
