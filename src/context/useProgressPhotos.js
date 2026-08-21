import { useCallback } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { useMirroredState } from '@/lib/useMirroredState';
import { mapPhotoFromDb, mapPhotoToDb } from '@/lib/mappers';
import { buildPhotoPath, validatePhotoFile } from '@/domain/photos';
import { shrinkImage } from '@/lib/shrinkImage';
import { traduceStorageError } from '@/lib/dbErrors';
import { toNum } from '@/lib/num';
import { track } from '@/lib/analytics';
import { BUCKET, SIGNED_URL_TTL_SECONDS } from '@/context/media';

/*
  ══ Las fotos de progreso, fuera de AppContext ═══════════════════════════════

  Con la convención de `useRoadmap.js` y la variante de `useCheckIns.js`: el
  arranque siembra `progressPhotos` (las filas, SIN firmar — ver el comentario
  de `loadForUser`) con el setter que este gancho devuelve. El estado va en
  `useMirroredState` porque las acciones leen el valor de siempre sin arrastrar
  a nadie en sus dependencias.

  Recibe `clientsRef` (el nombre del cliente viaja con la foto) e `isCoachRef`
  (la cuota de la 0067 se explica distinto según quién sube).
*/

export const useProgressPhotos = ({ clientsRef, isCoachRef }) => {
  const [progressPhotos, setProgressPhotos, photosRef] = useMirroredState([]);

  const resolvePhotoUrls = useCallback(async (photos) => {
    const paths = photos.filter((p) => p.path && !p.url).map((p) => p.path);
    if (paths.length === 0) return photos;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error('No se pudieron firmar las URLs de las fotos:', error.message);
      return photos;
    }

    const byPath = new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    return photos.map((p) => (p.path && byPath.has(p.path) ? { ...p, url: byPath.get(p.path) } : p));
  }, []);

  /**
   * Firma las fotos de UN cliente que todavía no tengan enlace.
   *
   * Lo llama la pantalla que va a enseñarlas. Si ya están firmadas no hace nada,
   * así que se puede llamar en cada render sin pensarlo.
   */
  const ensurePhotoUrls = useCallback(
    async (clientId) => {
      const pending = photosRef.current.filter((p) => p.clientId === clientId && p.path && !p.url);
      if (pending.length === 0) return;

      const resolved = await resolvePhotoUrls(pending);
      const byId = new Map(resolved.map((p) => [p.id, p.url]));

      setProgressPhotos((prev) =>
        prev.map((p) => (byId.has(p.id) && byId.get(p.id) ? { ...p, url: byId.get(p.id) } : p))
      );
    },
    [photosRef, resolvePhotoUrls, setProgressPhotos]
  );

  /**
   * Sube una foto real a Storage y crea su fila. Devuelve `{ ok, error }` en
   * vez de tragarse el fallo: quien llama tiene que poder informar al usuario.
   */
  const uploadProgressPhoto = useCallback(
    async ({ clientId, file, week, angle, weight, notes }) => {
      const invalid = validatePhotoFile(file);
      if (invalid) return { ok: false, error: invalid };

      /*
        Se reduce ANTES de subir, y se valida antes de reducir.

        El orden importa: validar el original es lo que deja rechazar un archivo
        que no es una foto sin haber gastado nada, y reducir después es lo que
        evita subir doce megas de los que se ven trescientos kilos.

        `shrinkImage` devuelve el mismo archivo si no puede con él, así que aquí
        no hay caso de error que atender: o llega reducido o llega tal cual.
      */
      const subida = await shrinkImage(file);
      const path = buildPhotoPath({ clientId, week, angle, fileName: subida.name });

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, subida, { contentType: subida.type || undefined, upsert: false });

      if (uploadErr) {
        /*
          La cuota de la 0067 llega como «database error, code: 23514»: la API de
          Storage no reenvía el texto del disparador, así que la frase la pone
          `traduceStorageError` — distinta según quién sube, que aquí se sabe.
        */
        const capado = traduceStorageError(uploadErr, { cliente: !isCoachRef.current });
        return { ok: false, error: capado || `No se pudo subir la imagen: ${uploadErr.message}` };
      }

      const { data, error } = await supabase
        .from('progress_photos')
        .insert(mapPhotoToDb({ clientId, path, angle, weight: toNum(weight), notes }))
        .select()
        .single();

      if (error) {
        // La fila no se creó: se limpia el objeto huérfano para no dejar basura.
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, error: `No se pudo registrar la foto: ${error.message}` };
      }

      const clientName = clientsRef.current.find((c) => c.id === clientId)?.name;
      const [withUrl] = await resolvePhotoUrls([mapPhotoFromDb(data, clientName)]);
      setProgressPhotos([withUrl, ...photosRef.current]);
      /* Solo cuenta cuando la sube el ENTRENADOR: `track` no apunta nada desde el
         portal, así que las del cliente no entran. Es intencionado y hay que
         leerlo así — esta cifra mide uso del panel, no fotos subidas. */
      track('foto_subida');
      return { ok: true, photo: withUrl };
    },
    [clientsRef, isCoachRef, photosRef, resolvePhotoUrls, setProgressPhotos]
  );

  const deleteProgressPhoto = useCallback(
    async (photo) => {
      const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id);
      if (error) return { ok: false, error: error.message };

      if (photo.path) {
        const { error: storageErr } = await supabase.storage.from(BUCKET).remove([photo.path]);
        // La fila ya no existe: un objeto huérfano es molesto, no grave.
        if (storageErr) console.warn('No se pudo borrar el archivo:', storageErr.message);
      }

      setProgressPhotos(photosRef.current.filter((p) => p.id !== photo.id));
      return { ok: true };
    },
    [photosRef, setProgressPhotos]
  );

  /**
   * Edita los metadatos de una foto. Ángulo, peso y notas viven juntos dentro de
   * `tag`, así que hay que reescribirlo completo a partir del estado ya
   * fusionado (no se puede actualizar un campo suelto).
   */
  const updateProgressPhoto = useCallback(
    async (photoId, fields) => {
      const current = photosRef.current.find((p) => p.id === photoId);
      if (!current) return { ok: false, error: 'La foto ya no existe.' };

      const merged = {
        ...current,
        ...fields,
        weight: 'weight' in fields ? toNum(fields.weight) : current.weight,
      };

      const { error } = await supabase
        .from('progress_photos')
        .update({ tag: mapPhotoToDb(merged).tag })
        .eq('id', photoId);

      if (error) return { ok: false, error: error.message };

      setProgressPhotos(photosRef.current.map((p) => (p.id === photoId ? merged : p)));
      return { ok: true };
    },
    [photosRef, setProgressPhotos]
  );

  /** Vuelve a firmar las URLs (por si alguna expiró durante la sesión). */
  const refreshPhotoUrls = useCallback(async () => {
    const cleared = photosRef.current.map((p) => (p.path ? { ...p, url: null } : p));
    const refreshed = await resolvePhotoUrls(cleared);
    setProgressPhotos(refreshed);
  }, [photosRef, resolvePhotoUrls, setProgressPhotos]);

  return {
    progressPhotos,
    setProgressPhotos,
    ensurePhotoUrls,
    uploadProgressPhoto,
    deleteProgressPhoto,
    updateProgressPhoto,
    refreshPhotoUrls,
  };
};
