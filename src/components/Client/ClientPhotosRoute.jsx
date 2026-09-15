import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { PageHead } from '@/components/ui/primitives';
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
    <div className="stack cascada">
      <PageHead title="Mis fotos" sub="Semana a semana, y el antes y después." />
      <ClientPhotos
        client={activeClient}
        photos={photos}
        history={anthropometry[activeClient.id]?.history || []}
        /* Subir vive dentro del asistente, que es donde toca hacerlo: con el
           peso de la semana y la misma fecha. Aquí solo se mira.

           Y se llega con el asistente ABIERTO: el botón dice «Hacer mi
           check-in», así que dejar al cliente en otra pantalla buscando cuál de
           los botones era es prometer un gesto y entregar un sitio.

           El destino es «Tú» desde el 12 de septiembre: el gesto de entregar
           vive donde está la semana que se entrega. Ver `ClientTu`. */
        onGoToCheckIn={() => navigate('/mi/evolucion', { state: { abrirCheckIn: true } })}
      />
    </div>
  );
};
