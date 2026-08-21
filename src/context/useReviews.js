import { useCallback } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { slug as slugify } from '@/domain/photos';
import { traduceStorageError } from '@/lib/dbErrors';
import { track } from '@/lib/analytics';
import { BUCKET } from '@/context/media';

/*
  ══ Las revisiones en vídeo y sus enlaces, fuera de AppContext ═══════════════

  Con la convención de `useRoadmap.js`. Este dominio no tiene estado propio:
  todo son acciones que consultan bajo demanda, así que el gancho solo necesita
  `isCoachRef` — la referencia viva de «¿quién escribe?», que decide cómo se
  traduce el error de cuota (0067) sin volver a preguntárselo a la base.

  `publishUpdate` NO está aquí aunque la fachada lo agrupe con las revisiones:
  escribe en las preferencias del cliente (`stampUpdate`), que es otro dominio.
*/

// ── Vídeos de revisión ───────────────────────────────────────────────────────
//
// Se guardan en el MISMO bucket y con el mismo esquema de rutas que las fotos
// (`<clientId>/…`), así que las políticas de Storage de la migración 0007 ya los
// cubren sin tocar nada: acotan por el primer segmento de la ruta.
//
// Y no hacen falta filas en ninguna tabla: se listan directamente de Storage. Un
// registro en base de datos solo añadiría algo si hubiera que guardar metadatos
// (visto por el cliente, comentarios), y eso todavía no existe.

export const useReviews = ({ isCoachRef }) => {
  const uploadReview = useCallback(
    async ({ clientId, blob, mimeType, label }) => {
      if (!blob || blob.size === 0) return { ok: false, error: 'La grabación está vacía.' };

      const extension = mimeType?.includes('mp4') ? 'mp4' : 'webm';
      const path = `${clientId}/reviews/${Date.now()}-${slugify(label || 'revision')}.${extension}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: mimeType || 'video/webm', upsert: false });

      // El grabador es del entrenador, pero la cuota (0067) también corta aquí y
      // su error llega como un código pelado: se traduce antes de enseñarlo.
      if (error)
        return { ok: false, error: traduceStorageError(error, { cliente: !isCoachRef.current }) || error.message };

      // Se firma más largo que las fotos: un vídeo se manda por WhatsApp y el
      // cliente lo abre cuando puede, no en los siguientes minutos.
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      return { ok: true, path, url: signed.data?.signedUrl || null };
    },
    [isCoachRef]
  );

  const listReviews = useCallback(async (clientId) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(`${clientId}/reviews`, { sortBy: { column: 'name', order: 'desc' } });

    if (error) return { ok: false, error: error.message, reviews: [] };

    const paths = (data || []).filter((f) => f.id).map((f) => `${clientId}/reviews/${f.name}`);
    if (paths.length === 0) return { ok: true, reviews: [] };

    const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24 * 7);
    const urlByPath = new Map((signed.data || []).map((s) => [s.path, s.signedUrl]));

    return {
      ok: true,
      reviews: paths.map((path, index) => ({
        path,
        url: urlByPath.get(path) || null,
        name: data[index].name,
        // El nombre empieza por el timestamp de la subida: es la fecha sin
        // necesitar una tabla.
        createdAt: Number(data[index].name.split('-')[0]) || null,
        size: data[index].metadata?.size ?? null,
      })),
    };
  }, []);

  /**
   * Crea el enlace permanente de un vídeo y devuelve su URL pública.
   *
   * El token lo genera la base de datos (migración 0011), no el navegador: así no
   * depende de la calidad de su generador aleatorio y no se puede forzar uno
   * elegido a mano.
   */
  const createReviewLink = useCallback(async ({ clientId, path, title, weekStart, notes }) => {
    const { data, error } = await supabase.rpc('create_review_link', {
      target: clientId,
      path,
      link_title: title || null,
      week: weekStart || null,
      link_notes: notes || null,
    });
    if (error) return { ok: false, error: error.message };
    /* Grabar y mandar una revisión es la función más cara de construir y la que
       más se usa para justificar el precio. Si nadie la usa, sobra; y eso hay que
       poder saberlo antes de seguir invirtiendo en ella. */
    track('revision_compartida', { origen: 'grabada' });
    return { ok: true, token: data, url: `${window.location.origin}/r/${data}` };
  }, []);

  /**
   * Una revisión que vive fuera: YouTube oculto o Loom (migración 0040).
   *
   * Entra en la MISMA lista que las grabadas aquí, y esa es toda la gracia: para
   * el cliente «la revisión de la semana 7» es una sola cosa, y dónde esté
   * alojado el vídeo es un detalle de infraestructura que no le toca conocer.
   *
   * El dominio lo comprueba la base de datos además de la interfaz: esa URL acaba
   * dentro de un `<iframe>` en la pantalla del cliente.
   */
  const createReviewUrl = useCallback(async ({ clientId, url, title, weekStart, notes }) => {
    const { data, error } = await supabase.rpc('create_review_url', {
      target: clientId,
      url,
      link_title: title || null,
      week: weekStart || null,
      link_notes: notes || null,
    });
    if (error) return { ok: false, error: error.message };
    /* El mismo evento con distinto origen, no un evento distinto: la pregunta es
       «¿se comparten revisiones?», y separarlas obligaría a sumarlas siempre. */
    track('revision_compartida', { origen: 'externa' });
    return { ok: true, token: data };
  }, []);

  /**
   * «Visto», desde el portal del cliente.
   *
   * Las visitas las contaba la función de `/r/<token>`, por donde pasa quien abre
   * el enlace compartido sin sesión. Viendo la revisión DENTRO de su portal ese
   * camino no se usa, así que sin esto el contador del entrenador se quedaría a
   * cero justo cuando el cliente sí la está viendo.
   *
   * Su fallo no se propaga: no haber podido contar una visita no es motivo para
   * estropearle el vídeo a nadie.
   */
  const markReviewViewed = useCallback(async (linkId) => {
    /* Mismo caso que `stampNow`: `rpc()` no trae `.catch`. */
    await Promise.resolve(supabase.rpc('mark_review_viewed', { link: linkId })).catch(() => {});
  }, []);

  /** Enlaces ya creados de un cliente, con sus visitas. */
  const listReviewLinks = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('review_links')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message, links: [] };
    return {
      ok: true,
      links: (data || []).map((row) => ({
        id: row.id,
        token: row.token,
        path: row.storage_path,
        // `null` si la revisión se grabó aquí; la dirección de YouTube o Loom si
        // vive fuera (migración 0040). Nunca las dos: lo impide un CHECK.
        externalUrl: row.external_url ?? null,
        title: row.title,
        weekStart: row.week_start,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
        firstViewedAt: row.first_viewed_at,
        lastViewedAt: row.last_viewed_at,
        viewCount: row.view_count,
        url: `${window.location.origin}/r/${row.token}`,
      })),
    };
  }, []);

  /** Revocar: el enlace deja de servir sin borrar que existió ni sus visitas. */
  const revokeReviewLink = useCallback(async (id) => {
    const { error } = await supabase
      .from('review_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const deleteReview = useCallback(async (path) => {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  return {
    uploadReview,
    listReviews,
    createReviewLink,
    createReviewUrl,
    markReviewViewed,
    listReviewLinks,
    revokeReviewLink,
    deleteReview,
  };
};
