-- ============================================================================
-- El grabador de revisiones nunca pudo subir nada: el bucket solo admite imágenes
-- ----------------------------------------------------------------------------
-- Requiere `0007_storage_policies.sql`. Solo cambia la CONFIGURACIÓN del bucket.
-- No toca políticas, ni tablas, ni archivos ya subidos.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- La `0007` creó `client-media` con esta lista:
--
--     allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp',
--                                'image/heic','image/heif']
--     file_size_limit    = 15728640                      -- 15 MB
--
-- Y era correcta: en ese momento el bucket solo guardaba fotos de progreso.
--
-- Después llegó el grabador de revisiones (`lib/useReviewRecorder`, el estudio de
-- fotos) que sube `video/webm` —o `video/mp4` en Safari— por `uploadReview`, al
-- MISMO bucket. Nadie amplió la lista.
--
-- Consecuencia: **toda grabación se rechaza en el servidor**. Storage devuelve
-- `mime type video/webm is not supported`, y como el grabador enseña el error de
-- Supabase tal cual, el síntoma que llega es «no me deja guardar el vídeo».
--
-- Y una segunda barrera detrás de la primera: 15 MB no da ni para tres minutos de
-- pantalla más cámara. Aunque el tipo pasara, la subida seguiría fallando en
-- cuanto la revisión durase algo.
--
-- ── Por qué no se detectó antes ─────────────────────────────────────────────
-- Porque el límite de tipos es del BUCKET y no de las políticas: `pg_policies`
-- sale correcto, los permisos salen correctos y la fila de `review_links` se
-- llega a crear. Lo único que falla es el archivo, y falla en una capa que no se
-- mira cuando se depura un problema de permisos.
--
-- ══ El arreglo ═════════════════════════════════════════════════════════════
--
-- Se añaden los tipos de vídeo que produce `MediaRecorder` en los navegadores
-- que soportamos y se sube el tope a 120 MB.
--
--     webm  → Chrome, Edge, Firefox (vp9/vp8 + opus)
--     mp4   → Safari, que no graba webm
--     quicktime → lo que sale de un iPhone si algún día se permite adjuntar
--
-- ── El compromiso, dicho en voz alta ────────────────────────────────────────
-- El tope de tamaño es POR BUCKET, no por carpeta. Subirlo a 120 MB significa
-- que una foto de progreso también puede pesar 120 MB, y las fotos las sube el
-- CLIENTE. Eso no abre ningún agujero de permisos —las políticas de la 0007
-- siguen decidiendo quién escribe en la carpeta de quién— pero sí permite llenar
-- la cuota más deprisa.
--
-- La alternativa era un segundo bucket solo para vídeo, con su tope y sus cuatro
-- políticas duplicadas. Se descarta por ahora: duplicar políticas de seguridad es
-- exactamente la clase de cosa que acaba divergiendo, y una de las dos copias
-- quedándose sin arreglar es peor que este compromiso. Si el gasto de
-- almacenamiento llega a ser un problema, ESE es el momento de separarlos.
--
-- 120 MB da para unos 40 minutos de revisión. Una revisión de 40 minutos es un
-- problema distinto.
--
-- ── Qué hay que reparar ─────────────────────────────────────────────────────
-- Nada. Los rechazos no dejaron archivos a medias: Storage no escribe nada
-- cuando rechaza por tipo o tamaño. Puede haber filas huérfanas en `review_links`
-- si alguna vez se creó el enlace antes que el archivo — la consulta del final
-- las encuentra.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'client-media') THEN
    RAISE EXCEPTION 'Falta 0007_storage_policies.sql: el bucket `client-media` no existe.';
  END IF;
END $$;

BEGIN;

UPDATE storage.buckets
SET
  -- Sigue siendo privado. La aplicación firma URLs con caducidad; en un bucket
  -- público cualquiera con el enlace vería el vídeo para siempre.
  public = false,
  file_size_limit = 125829120,                                        -- 120 MB
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/webm',
    'video/mp4',
    'video/quicktime'
  ]
WHERE id = 'client-media';

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que el bucket admite vídeo y sigue siendo privado:
--
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'client-media';
--
-- Y después, desde la APLICACIÓN: estudio de fotos → grabar una revisión de diez
-- segundos y guardarla. Antes de esto devolvía «mime type video/webm is not
-- supported»; ahora tiene que aparecer en la lista de revisiones del cliente y,
-- con ella, en el desplegable de «Enlazar» de los pasos del alta.
--
-- Enlaces de revisión cuyo archivo no llegó a subirse (los rechazos de antes):
--
--   SELECT l.id, l.title, l.storage_path, l.created_at
--   FROM public.review_links l
--   WHERE NOT EXISTS (
--     SELECT 1 FROM storage.objects o
--     WHERE o.bucket_id = 'client-media' AND o.name = l.storage_path
--   );
--
-- Si sale alguno, es un enlace que lleva a un archivo que no existe. Se borran:
--
--   DELETE FROM public.review_links l
--   WHERE NOT EXISTS (
--     SELECT 1 FROM storage.objects o
--     WHERE o.bucket_id = 'client-media' AND o.name = l.storage_path
--   );
-- ============================================================================
