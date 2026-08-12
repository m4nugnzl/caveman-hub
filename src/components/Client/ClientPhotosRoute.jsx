import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { ClientPhotos } from './ClientPhotos';

/** Ruta `/mi/fotos`. */
export const ClientPhotosRoute = () => {
  const { activeClient, progressPhotos, anthropometry, uploadProgressPhoto } = useApp();

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient.id),
    [progressPhotos, activeClient.id]
  );

  return (
    <ClientPhotos
      client={activeClient}
      photos={photos}
      history={anthropometry[activeClient.id]?.history || []}
      onUpload={uploadProgressPhoto}
    />
  );
};
