import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { ANGLES, fotosPorAngulo, photoWeek } from '@/domain/photos';
import { clientProtocol } from '@/domain/protocol';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { shortDate } from '@/lib/dates';
import { useSemanaDeEntrega } from './useSemanaDeEntrega';
import { PantallaFotosDeLaSemana } from './movil/PantallaFotosDeLaSemana';

/**
 * `/mi/evolucion/fotos-de-la-semana` — LAS FOTOS DE ESTA SEMANA en el teléfono
 * (frame `328:518`, 18 sep 2026).
 *
 * Era un paso del asistente de la revisión. Desde el rediseño del teléfono la
 * revisión es una lista de pasos sueltos, y éste tiene su pantalla: un hueco
 * por ángulo, y se guardan al pulsar «Guardar fotos» sin entregar nada. La
 * entrega es otro gesto, en la lista.
 *
 * `/mi/evolucion/fotos` sigue siendo el ARCHIVO —todas, por semana—; ésta es
 * la de hacer las de ahora.
 *
 * ── Es del teléfono ───────────────────────────────────────────────────────
 * En el monitor las fotos se suben en el asistente, donde terminar es
 * entregar. Quien llega aquí con una pantalla ancha va a su revisión. Y si su
 * entrenador no le pide fotos, esta pantalla no existe (`askPhotos`).
 */
export const ClientFotosDeLaSemanaRoute = () => {
  const { activeClient, progressPhotos, uploadProgressPhoto, deleteProgressPhoto, ensurePhotoUrls } = useApp();
  const navigate = useNavigate();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  const { semanaFoto, semana: lunes, cerrada, revision } = useSemanaDeEntrega();

  const protocol = useMemo(
    () => (activeClient ? clientProtocol(activeClient.preferences) : null),
    [activeClient]
  );
  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient?.id),
    [progressPhotos, activeClient?.id]
  );

  /* Se firman aquí, que es la pantalla que las enseña (ver `loadForUser`). */
  useEffect(() => {
    if (activeClient?.id) ensurePhotoUrls(activeClient.id);
  }, [ensurePhotoUrls, activeClient?.id]);

  if (!activeClient) return null;
  if (enMonitor || protocol?.askPhotos === false) return <Navigate to="/mi/evolucion" replace />;

  /* Sin fecha de inicio no hay semana que contar: van a la 1, como en el
     asistente. */
  const semana = semanaFoto ?? 1;
  const { ahora, antes } = fotosPorAngulo(photos, semana, activeClient.startDate);

  const datos = {
    semana,
    angulos: ANGLES.map((a) => {
      const previa = antes.get(a.id) || null;
      return {
        id: a.id,
        label: a.label,
        ahora: ahora.get(a.id) || null,
        antes: previa ? { url: previa.url, semana: photoWeek(previa, activeClient.startDate) } : null,
      };
    }),
    clientId: activeClient.id,
    onSubir: uploadProgressPhoto,
    /* Una revisión PASADA: cuál es, para decirlo arriba. */
    pasada: revision ? `semana del ${shortDate(lunes)}` : null,
    /* Revisada, o una pasada fuera de plazo: las fotos se miran y no se tocan
       (0134). Mientras no, una foto equivocada se quita desde aquí. */
    soloLectura: cerrada,
    onQuitar: cerrada ? null : (foto) => deleteProgressPhoto(foto),
    onVolver: () => (window.history.length > 1 ? navigate(-1) : navigate('/mi/evolucion')),
  };

  return <PantallaFotosDeLaSemana datos={datos} />;
};
