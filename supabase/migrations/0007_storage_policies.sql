-- ============================================================================
-- Políticas de Storage para el bucket `client-media`
-- ----------------------------------------------------------------------------
-- ── Diagnóstico, ya hecho ───────────────────────────────────────────────────
-- Resultado real del proyecto:
--
--     storage.objects  →  rls_activo = true
--     storage.buckets  →  rls_activo = true
--     select id, name, public from storage.buckets  →  SIN FILAS
--
-- Dos conclusiones:
--
--   1. **El bucket `client-media` NO EXISTE.** Nunca se creó. Toda subida de
--      fotos ha estado fallando con «Bucket not found», y la carga de fotos
--      antiguas solo puede funcionar si alguna fila de `progress_photos` guarda
--      una URL externa completa en vez de una ruta (el código admite los dos
--      formatos, ver `mapPhotoFromDb`).
--
--   2. RLS está activo y no hay ninguna política, así que aunque el bucket
--      existiera nadie podría subir ni firmar URLs con la anon key. Solo
--      `service_role`, que la aplicación no usa nunca (ni debe).
--
-- Lo bueno: **no hay ningún agujero abierto**. El escenario malo era el
-- contrario —RLS desactivado, bucket abierto a cualquiera con la anon key— y no
-- es el caso. Solo falta crear el bucket y darle permisos.
--
-- ── Cómo se acota el acceso ─────────────────────────────────────────────────
-- La aplicación guarda las rutas como `<clientId>/photos/week-<n>/<archivo>`, de
-- modo que el PRIMER segmento de la ruta es el id del cliente. Eso es lo que
-- permite comprobar el permiso sin ninguna tabla extra:
--
--     (storage.foldername(name))[1]  →  '3f2a…'  →  ¿es un cliente mío?
-- ============================================================================

BEGIN;

-- ── Helpers ─────────────────────────────────────────────────────────────────
--
-- Reciben TEXTO, no uuid, a propósito: `'basura'::uuid` lanza una excepción y una
-- excepción dentro de una política aborta la consulta entera. Comparando
-- `c.id::text = folder` una ruta con un primer segmento que no sea un uuid
-- simplemente no coincide con nada, que es el comportamiento correcto.
--
-- Son SECURITY DEFINER para que funcionen sea cual sea el estado de las
-- políticas de `public.clients`. No hay riesgo de recursión: ninguna política de
-- `clients` mira `storage.objects`.

CREATE OR REPLACE FUNCTION public.folder_is_my_client(folder text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = folder AND c.coach_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.folder_is_me(folder text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = folder AND c.client_profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.folder_is_my_client(text) FROM public;
REVOKE ALL ON FUNCTION public.folder_is_me(text) FROM public;
GRANT EXECUTE ON FUNCTION public.folder_is_my_client(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.folder_is_me(text) TO authenticated;

-- ── El bucket ───────────────────────────────────────────────────────────────
-- No existía: esto lo crea. Es lo que hacía que fallara TODA subida de fotos.
--
-- `public = false` es obligatorio, no una preferencia: la aplicación firma URLs
-- con 8 h de caducidad, y en un bucket público cualquiera con la URL vería la
-- foto para siempre, con las políticas de lectura de abajo pintadas.
--
-- Los dos límites son la única barrera contra que un cliente suba un archivo de
-- 2 GB o algo que no sea una imagen: la validación del navegador se salta
-- llamando a la API directamente.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-media',
  'client-media',
  false,
  15728640,                                                    -- 15 MB por foto
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public             = false,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;


-- ============================================================================
-- Políticas
-- ----------------------------------------------------------------------------
-- LEER  → el entrenador dueño del cliente, y el propio cliente.
--         Hace falta para `createSignedUrls`: firmar una URL requiere SELECT.
-- SUBIR → los mismos, y solo dentro de la carpeta de ese cliente.
-- BORRAR→ solo el entrenador. Es quien cura el histórico de fotos; que el
--         cliente pueda borrar las suyas destruiría la comparativa.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "media_coach_read" ON storage.objects;
CREATE POLICY "media_coach_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'client-media' AND public.folder_is_my_client((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "media_client_read" ON storage.objects;
CREATE POLICY "media_client_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'client-media' AND public.folder_is_me((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "media_coach_insert" ON storage.objects;
CREATE POLICY "media_coach_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-media' AND public.folder_is_my_client((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "media_client_insert" ON storage.objects;
CREATE POLICY "media_client_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-media' AND public.folder_is_me((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "media_coach_delete" ON storage.objects;
CREATE POLICY "media_coach_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'client-media' AND public.folder_is_my_client((storage.foldername(name))[1]));

-- Sin política de UPDATE a propósito: la aplicación sube con `upsert: false`, así
-- que nunca sobrescribe un archivo. Si algún día hiciera falta, va aquí.

COMMIT;


-- ============================================================================
-- Comprobación después de aplicarlo
-- ----------------------------------------------------------------------------
-- RLS ya está activo en este proyecto, así que no hay que tocarlo. Verifica:
--
--   select id, public, file_size_limit from storage.buckets;      -- 1 fila
--   select policyname, cmd from pg_policies where schemaname = 'storage';  -- 5
--
-- Y después, en la aplicación: sube una foto desde «Fotos & Evolución» y otra
-- desde el portal del cliente. Si alguna falla, el error sale en la interfaz —no
-- se pierde en silencio— y significaría que la ruta no empieza por el id del
-- cliente.
--
-- Si en algún momento `ALTER TABLE storage.objects …` diera «must be owner of
-- table objects», es porque el dueño es `supabase_storage_admin`: se resuelve con
-- `SET ROLE supabase_storage_admin;` antes, o desde el panel en Storage →
-- Policies.
-- ============================================================================

-- ── Nota para cuando existan equipos (0006) ────────────────────────────────
-- `folder_is_my_client` comprueba `coach_id`. Con equipos hay que cambiarla por
-- la comprobación de rol, y entonces basta editar ESTA función: las cinco
-- políticas de arriba no se tocan.
--
--   SELECT EXISTS (
--     SELECT 1 FROM public.clients c
--     WHERE c.id::text = folder AND public.can_read_client(c.id)
--   );
