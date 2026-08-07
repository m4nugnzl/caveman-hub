-- ============================================================================
-- Endurecimiento de Row Level Security
-- ----------------------------------------------------------------------------
-- ⚠️  ESTO CAMBIA QUIÉN PUEDE ESCRIBIR QUÉ. NO LO EJECUTES SIN LEERLO.
--     Repasa cada bloque y confirma que la regla coincide con lo que quieres
--     antes de aplicarlo. Se puede aplicar por partes.
--
-- ── El problema ─────────────────────────────────────────────────────────────
-- Todas las políticas actuales son `FOR ALL` y conceden el mismo poder al
-- entrenador y al cliente sobre la misma fila. RLS es row-level: si un cliente
-- puede tocar "su" fila, puede tocar CUALQUIER columna de ella. Consecuencias
-- reales hoy, usando solo la API pública con la anon key:
--
--   1. Un cliente puede poner su propio `payment_status` en 'paid', cambiar su
--      `plan`, o reasignarse a otro entrenador escribiendo `coach_id`.
--   2. Un cliente puede cambiar su `profiles.role` a 'coach'. Hoy no filtra
--      datos (ninguna política consulta ese campo), pero es una escalada
--      latente: en cuanto algo confíe en `role`, deja de serlo.
--   3. Un cliente puede reescribir su propio plan de nutrición, o borrar de un
--      DELETE la fila con TODO su programa de entrenamiento.
--
-- La aplicación nunca hace nada de eso; la API lo permite igualmente.
--
-- ── El criterio ─────────────────────────────────────────────────────────────
-- El entrenador mantiene control total. El cliente solo puede escribir aquello
-- que el producto le pide aportar: sus kg/reps/RIR, su peso y sus fotos.
-- Todo lo demás pasa a ser de solo lectura para él.
-- ============================================================================

BEGIN;

-- ── profiles ────────────────────────────────────────────────────────────────
-- Se conserva el acceso a su propio perfil, pero el rol deja de ser
-- autoeditable. Es un privilegio de columna, no una política: RLS no distingue
-- columnas.

DROP POLICY IF EXISTS "Perfil propio" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

REVOKE UPDATE (role) ON public.profiles FROM authenticated;


-- ── clients ─────────────────────────────────────────────────────────────────
-- El entrenador gestiona la ficha. El cliente solo la lee: la aplicación nunca
-- le pide escribir aquí, y es donde viven el estado de pago y la vinculación.

DROP POLICY IF EXISTS "Acceso a clientes" ON public.clients;

CREATE POLICY "clients_coach_all" ON public.clients
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "clients_client_read" ON public.clients
  FOR SELECT TO authenticated
  USING (client_profile_id = auth.uid());


-- ── Helper: ¿esta fila pertenece a un cliente del entrenador conectado? ─────

CREATE OR REPLACE FUNCTION public.is_my_client(target uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = target AND c.coach_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_me(target uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = target AND c.client_profile_id = auth.uid());
$$;


-- ── workout_data ────────────────────────────────────────────────────────────
-- El cliente registra sus series, así que necesita UPDATE. No necesita INSERT
-- (la fila la crea el entrenador al programar) ni DELETE (borraría el programa
-- completo de un golpe).

DROP POLICY IF EXISTS "Acceso a workout_data" ON public.workout_data;
DROP POLICY IF EXISTS "client updates own workout_data" ON public.workout_data;

CREATE POLICY "workout_coach_all" ON public.workout_data
  FOR ALL TO authenticated
  USING (public.is_my_client(client_id))
  WITH CHECK (public.is_my_client(client_id));

CREATE POLICY "workout_client_read" ON public.workout_data
  FOR SELECT TO authenticated USING (public.is_me(client_id));

CREATE POLICY "workout_client_log" ON public.workout_data
  FOR UPDATE TO authenticated
  USING (public.is_me(client_id))
  WITH CHECK (public.is_me(client_id));


-- ── anthropometry ───────────────────────────────────────────────────────────
-- Es el cliente quien registra su peso y sus medidas: necesita INSERT (primera
-- vez) y UPDATE (el historial es un jsonb que se reescribe completo). Sin
-- DELETE: no hay motivo para borrar la fila entera.

DROP POLICY IF EXISTS "Acceso a antropometria" ON public.anthropometry;

CREATE POLICY "anthro_coach_all" ON public.anthropometry
  FOR ALL TO authenticated
  USING (public.is_my_client(client_id))
  WITH CHECK (public.is_my_client(client_id));

CREATE POLICY "anthro_client_read" ON public.anthropometry
  FOR SELECT TO authenticated USING (public.is_me(client_id));

CREATE POLICY "anthro_client_insert" ON public.anthropometry
  FOR INSERT TO authenticated WITH CHECK (public.is_me(client_id));

CREATE POLICY "anthro_client_update" ON public.anthropometry
  FOR UPDATE TO authenticated
  USING (public.is_me(client_id))
  WITH CHECK (public.is_me(client_id));


-- ── nutrition_plans ─────────────────────────────────────────────────────────
-- Artefacto del entrenador. El cliente solo lo consulta.

DROP POLICY IF EXISTS "Acceso a nutricion" ON public.nutrition_plans;

CREATE POLICY "nutrition_coach_all" ON public.nutrition_plans
  FOR ALL TO authenticated
  USING (public.is_my_client(client_id))
  WITH CHECK (public.is_my_client(client_id));

CREATE POLICY "nutrition_client_read" ON public.nutrition_plans
  FOR SELECT TO authenticated USING (public.is_me(client_id));


-- ── progress_photos ─────────────────────────────────────────────────────────
-- El cliente sube fotos (INSERT) y ve las suyas. Borrar queda para el
-- entrenador, que es quien cura el histórico.

DROP POLICY IF EXISTS "Acceso a fotos de progreso" ON public.progress_photos;

CREATE POLICY "photos_coach_all" ON public.progress_photos
  FOR ALL TO authenticated
  USING (public.is_my_client(client_id))
  WITH CHECK (public.is_my_client(client_id));

CREATE POLICY "photos_client_read" ON public.progress_photos
  FOR SELECT TO authenticated USING (public.is_me(client_id));

CREATE POLICY "photos_client_insert" ON public.progress_photos
  FOR INSERT TO authenticated WITH CHECK (public.is_me(client_id));


-- ── exercises y foods ───────────────────────────────────────────────────────
-- Ya estaban bien (coach_id = auth.uid(), con WITH CHECK). Solo se acotan al
-- rol `authenticated` en vez de `public`, por claridad.

DROP POLICY IF EXISTS "coach manages own exercises" ON public.exercises;
CREATE POLICY "exercises_coach_all" ON public.exercises
  FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "coach manages own foods" ON public.foods;
CREATE POLICY "foods_coach_all" ON public.foods
  FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());


-- ── videos ──────────────────────────────────────────────────────────────────
-- Tabla en desuso: la revisión de vídeos se retiró del producto. Se deja la
-- política tal cual para no tocar datos históricos. Si decides eliminar la
-- tabla, hazlo aparte y a conciencia.

COMMIT;

-- ============================================================================
-- PENDIENTE Y APARTE: las políticas de Storage
-- ----------------------------------------------------------------------------
-- Esto NO cubre el bucket `client-media`, que tiene sus propias políticas sobre
-- `storage.objects`. Para que el cliente pueda subir sus fotos necesita INSERT
-- limitado a su propia carpeta. Para ver qué hay ahora:
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'storage';
--
-- La aplicación construye las rutas como `<clientId>/photos/week-<n>/…`, de modo
-- que el primer segmento de la ruta es el id del cliente y sirve para acotar el
-- acceso: (storage.foldername(name))[1] comparado contra los clientes del
-- usuario conectado.
-- ============================================================================
