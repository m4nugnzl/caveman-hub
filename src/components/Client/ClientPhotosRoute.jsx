import { useEffect, useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { ClientPhotos } from './ClientPhotos';

/** Ruta `/mi/fotos`. */
export const ClientPhotosRoute = () => {
  const { activeClient, progressPhotos, anthropometry, uploadProgressPhoto, ensurePhotoUrls } =
    useApp();

  /* Las fotos se cargan sin enlace firmado —ver `loadForUser`— y se firman en la
     pantalla que las va a enseñar. Si ya lo están, esto no hace nada. */
  useEffect(() => {
    ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient.id]);

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
