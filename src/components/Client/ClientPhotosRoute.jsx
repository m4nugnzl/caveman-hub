import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { ClientPhotos } from './ClientPhotos';

/** Nivel «Fotos» de `/mi/evolucion`: su galería de progreso. */
export const ClientPhotosRoute = () => {
  const { activeClient, progressPhotos, anthropometry, ensurePhotoUrls } = useApp();
  const navigate = useNavigate();

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
      /* Subir vive en el nivel de al lado, que es donde toca hacerlo: con el
         peso de la semana y la misma fecha. Aquí solo se mira. */
      onGoToCheckIn={() => navigate('/mi/evolucion')}
    />
  );
};
