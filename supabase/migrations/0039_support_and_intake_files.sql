-- ============================================================================
-- Adjuntar archivos: en un ticket de soporte y en un paso del alta
-- ----------------------------------------------------------------------------
-- Requiere `0007_storage_policies.sql` (el bucket y sus políticas) y
-- `0034_support.sql` (los tickets). Añade UNA columna, UNA función y DOS
-- políticas. No toca nada de lo que ya existe.
--
-- ══ Las dos cosas que faltaban ═════════════════════════════════════════════
--
-- 1. **Un ticket de soporte no admite una captura.** El formulario recoge la
--    ruta, el navegador y los últimos fallos —que es más de lo que suele traer
--    un soporte— y aun así el 80 % de las conversaciones empieza igual:
--    «¿puedes mandarme una captura?». Un día de ida y vuelta por algo que quien
--    escribe ya tenía en la pantalla.
--
-- 2. **Un paso del alta solo admite un ENLACE.** Sirve para el vídeo de
--    bienvenida —que está en YouTube o en Loom— y no sirve para lo que no vive
--    en ninguna parte: la anamnesis en PDF, la hoja de la primera medición, el
--    análisis postural escrito. Para eso había que subirlo antes a Drive, hacerlo
--    público y pegar aquí ese enlace: tres pasos fuera de la aplicación y un
--    archivo con los datos de salud de alguien colgado de un enlace sin caducidad.
--
-- ══ Por qué van juntas ═════════════════════════════════════════════════════
--
-- Porque son el mismo trabajo visto dos veces: subir un archivo a `client-media`
-- y firmar su URL al leerlo. Lo único que cambia es quién puede llegar a él, y
-- eso se decide por la RUTA.
--
-- ── El alta no necesita ni una línea de política ────────────────────────────
-- Sus archivos van a `<clientId>/intake/<archivo>`, y las políticas de la 0007
-- acotan por el PRIMER segmento de la ruta: el entrenador dueño del cliente
-- escribe y lee, el propio cliente lee. Que es exactamente lo que hace falta.
-- Es el mismo truco por el que las revisiones en vídeo funcionaron sin tocar
-- nada. Aquí solo se anota para que no se busque lo que no hay.
--
-- ── El soporte sí, porque no cuelga de ningún cliente ───────────────────────
-- Un ticket lo abre un ENTRENADOR sobre la aplicación, no sobre una persona a la
-- que entrena. Su ruta es `support/<ticketId>/<archivo>`, cuyo primer segmento
-- no es el id de ningún cliente, así que las cuatro políticas de la 0007 no
-- coinciden con ella y —hasta esta migración— la subida se rechazaba.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.support_messages') IS NULL THEN
    RAISE EXCEPTION 'Falta 0034_support.sql: no existe `support_messages`.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'client-media') THEN
    RAISE EXCEPTION 'Falta 0007_storage_policies.sql: el bucket `client-media` no existe.';
  END IF;
END $$;


-- ============================================================================
-- 1. El bucket admite documentos
-- ----------------------------------------------------------------------------
-- Hasta ahora: imágenes (0007) y vídeo (0038). Falta el PDF, que es la mitad de
-- lo que se entrega en un alta —anamnesis, analítica, hoja de mediciones— y lo
-- que se adjunta a un soporte cuando la captura no basta.
--
-- Se AÑADE a la lista en vez de reescribirla. Volver a escribir los ocho tipos
-- aquí significaría que quien toque la 0038 mañana deje esta desincronizada sin
-- enterarse, y el síntoma sería «el vídeo dejó de subir» en un archivo que no
-- habla de vídeo.
-- ============================================================================

BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = (
      SELECT array_agg(DISTINCT tipo)
      FROM unnest(allowed_mime_types || ARRAY['application/pdf']) AS tipo
    )
WHERE id = 'client-media'
  AND NOT ('application/pdf' = ANY (allowed_mime_types));

COMMIT;


-- ============================================================================
-- 2. El archivo adjunto de un mensaje de soporte
-- ----------------------------------------------------------------------------
-- ── Por qué una columna y no una tabla ──────────────────────────────────────
-- Una tabla `support_attachments` daría varios archivos por mensaje y costaría
-- sus dos políticas, su índice y su borrado en cascada. No compensa: lo que se
-- adjunta a un soporte es UNA captura de la pantalla donde pasa la cosa, y quien
-- necesite mandar dos manda dos mensajes — que además se leen mejor, porque cada
-- captura va con la frase que la explica.
--
-- Es la ruta del objeto, no una URL: el bucket es privado y las URLs caducan.
-- Guardar una URL firmada sería guardar algo que deja de funcionar en ocho horas.
-- ============================================================================

BEGIN;

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS attachment_path text;

COMMIT;


-- ============================================================================
-- 3. Quién puede subir y leer un adjunto de soporte
-- ----------------------------------------------------------------------------
-- LEER  → el dueño del ticket y quien atiende la plataforma. Leer es lo que hace
--         falta para FIRMAR la URL: `createSignedUrl` exige SELECT.
-- SUBIR → los mismos, y solo dentro de la carpeta de ese ticket.
--
-- No hay política de BORRAR ni de ACTUALIZAR, igual que en la 0007: la aplicación
-- sube con `upsert: false` y nunca borra un adjunto. Quitar un archivo que ya se
-- ha citado en una conversación deja el hilo hablando de algo que no está.
-- ============================================================================

BEGIN;

/*
  Recibe TEXTO y no uuid, por el mismo motivo que los ayudantes de la 0007:
  `'basura'::uuid` lanza una excepción, y una excepción dentro de una política
  aborta la consulta entera. Comparando `id::text = ticket`, una ruta con un
  segundo segmento que no sea un uuid simplemente no coincide con nada.

  SECURITY DEFINER para que no dependa de las políticas de `support_tickets`, y
  sin riesgo de recursión: ninguna política de esa tabla mira `storage.objects`.
*/
CREATE OR REPLACE FUNCTION public.ticket_is_mine(ticket text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id::text = ticket AND t.profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.ticket_is_mine(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ticket_is_mine(text) TO authenticated;

DROP POLICY IF EXISTS "support_files_read" ON storage.objects;
CREATE POLICY "support_files_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = 'support'
    AND (
      public.is_platform_admin()
      OR public.ticket_is_mine((storage.foldername(name))[2])
    )
  );

DROP POLICY IF EXISTS "support_files_insert" ON storage.objects;
CREATE POLICY "support_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = 'support'
    AND (
      public.is_platform_admin()
      OR public.ticket_is_mine((storage.foldername(name))[2])
    )
  );

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que el bucket admite PDF sin haber perdido lo de antes (tienen que salir los
-- nueve tipos: cinco de imagen, tres de vídeo y el PDF):
--
--   SELECT allowed_mime_types FROM storage.buckets WHERE id = 'client-media';
--
-- Que las políticas nuevas están (dos filas):
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND policyname LIKE 'support_files%';
--
-- Y después, desde la APLICACIÓN, que es donde se ve de verdad:
--
--   · Ajustes › Ayuda → escribir un ticket con una captura adjunta. Tiene que
--     verse en el hilo, y llegar como enlace en el aviso de Telegram o correo.
--   · Ficha de un cliente → Alta → «Subir archivo» en un paso. Tiene que
--     aparecer en el portal del cliente, en «De tu entrenador».
--
-- Adjuntos cuyo archivo no llegó a subirse (si alguna subida falló a medias):
--
--   SELECT m.id, m.ticket_id, m.attachment_path, m.created_at
--   FROM public.support_messages m
--   WHERE m.attachment_path IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM storage.objects o
--       WHERE o.bucket_id = 'client-media' AND o.name = m.attachment_path
--     );
--
-- Si sale alguno, el mensaje está bien y solo sobra la referencia:
--
--   UPDATE public.support_messages SET attachment_path = NULL WHERE id = '<id>';
-- ============================================================================
