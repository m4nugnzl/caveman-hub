-- ============================================================================
-- Equipos: un negocio con varios entrenadores
-- ----------------------------------------------------------------------------
-- ⚠️  CAMBIA QUIÉN VE Y ESCRIBE QUÉ. Léelo antes de ejecutarlo.
--
--    La aplicación YA está preparada: mientras estas tablas no existan funciona
--    exactamente como antes (un entrenador, sus clientes) y la pestaña «Equipo»
--    avisa de que falta la migración. En cuanto se aplica, aparecen los miembros,
--    los roles y el reparto de clientes.
--
--    Se puede aplicar sin prisa y sin ventana de mantenimiento: el backfill deja
--    a cada entrenador actual como dueño de su propio equipo con sus clientes
--    asignados, así que para él nada cambia.
--
-- Lee `docs/modelo-de-equipo.md`: explica por qué el modelo es este y no otro, y
-- qué implica en cada pantalla.
--
-- ── Resumen ─────────────────────────────────────────────────────────────────
-- Hoy `clients.coach_id` significa dos cosas: de quién ES el cliente y quién lo
-- LLEVA. Con un entrenador solo coinciden; con un equipo, no. Se separan:
--
--     clients.team_id      → el equipo dueño (negocio, facturación, bibliotecas)
--     clients.assigned_to  → el entrenador responsable
--
-- `coach_id` se conserva durante la transición para no romper nada.
-- ============================================================================

BEGIN;

-- ── 1. Tablas nuevas ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  team_id    uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'trainer'
             CHECK (role IN ('owner', 'admin', 'trainer', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, profile_id)
);

CREATE INDEX IF NOT EXISTS team_members_profile_idx ON public.team_members (profile_id);

-- ── 2. Columnas nuevas ──────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_team_idx ON public.clients (team_id);
CREATE INDEX IF NOT EXISTS clients_assigned_idx ON public.clients (assigned_to);

-- Las bibliotecas pasan a ser del equipo: en un equipo de cuatro, cuatro
-- bibliotecas separadas significan cuatro formas de escribir «Press banca».
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams (id) ON DELETE CASCADE;
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams (id) ON DELETE CASCADE;

-- ── 3. Backfill: un equipo por entrenador existente ─────────────────────────
-- Cada entrenador actual se convierte en dueño de su propio equipo, con sus
-- clientes asignados a él. Después de esto, para él nada cambia.

INSERT INTO public.teams (name, owner_id)
SELECT COALESCE(NULLIF(p.full_name, ''), 'Mi equipo'), p.id
FROM public.profiles p
WHERE p.role = 'coach'
  AND NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.owner_id = p.id);

INSERT INTO public.team_members (team_id, profile_id, role)
SELECT t.id, t.owner_id, 'owner'
FROM public.teams t
ON CONFLICT (team_id, profile_id) DO NOTHING;

UPDATE public.clients c
SET team_id     = t.id,
    assigned_to = COALESCE(c.assigned_to, c.coach_id)
FROM public.teams t
WHERE t.owner_id = c.coach_id
  AND c.team_id IS NULL;

UPDATE public.exercises e SET team_id = t.id
FROM public.teams t WHERE t.owner_id = e.coach_id AND e.team_id IS NULL;

UPDATE public.foods f SET team_id = t.id
FROM public.teams t WHERE t.owner_id = f.coach_id AND f.team_id IS NULL;

COMMIT;


-- ============================================================================
-- 4. RLS
-- ----------------------------------------------------------------------------
-- ⚠️  ESTE BLOQUE CAMBIA QUIÉN PUEDE VER Y ESCRIBIR QUÉ. Revísalo entero.
--
-- ── El error que hay que evitar ──────────────────────────────────────────────
-- Una política de `clients` que consulte `team_members` mientras `team_members`
-- tiene una política que consulta `clients` produce
-- «infinite recursion detected in policy» y TODA consulta falla.
--
-- Dos reglas:
--   1. Las funciones auxiliares son SECURITY DEFINER con search_path fijado, de
--      modo que saltan RLS al mirar la pertenencia.
--   2. Las políticas de `team_members` no consultan `clients` jamás.
-- ============================================================================

BEGIN;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Equipos a los que pertenece el usuario conectado.
CREATE OR REPLACE FUNCTION public.my_team_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT team_id FROM public.team_members WHERE profile_id = auth.uid();
$$;

-- Rol del usuario en un equipo, o NULL si no pertenece.
CREATE OR REPLACE FUNCTION public.my_team_role(target_team uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM public.team_members
  WHERE team_id = target_team AND profile_id = auth.uid();
$$;

-- ¿Puede el usuario LEER la ficha de este cliente?
-- owner/admin/viewer: cualquiera del equipo. trainer: solo los suyos.
CREATE OR REPLACE FUNCTION public.can_read_client(target uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.team_members m ON m.team_id = c.team_id AND m.profile_id = auth.uid()
    WHERE c.id = target
      AND (m.role IN ('owner', 'admin', 'viewer') OR c.assigned_to = auth.uid())
  );
$$;

-- ¿Puede ESCRIBIR? Igual, pero `viewer` queda fuera.
CREATE OR REPLACE FUNCTION public.can_write_client(target uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.team_members m ON m.team_id = c.team_id AND m.profile_id = auth.uid()
    WHERE c.id = target
      AND (m.role IN ('owner', 'admin') OR (m.role = 'trainer' AND c.assigned_to = auth.uid()))
  );
$$;


-- ── teams y team_members ────────────────────────────────────────────────────
-- Sin referencias a `clients`: es lo que evita la recursión.

DROP POLICY IF EXISTS "teams_read" ON public.teams;
CREATE POLICY "teams_read" ON public.teams
  FOR SELECT TO authenticated USING (id IN (SELECT public.my_team_ids()));

DROP POLICY IF EXISTS "teams_owner_write" ON public.teams;
CREATE POLICY "teams_owner_write" ON public.teams
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "members_read" ON public.team_members;
CREATE POLICY "members_read" ON public.team_members
  FOR SELECT TO authenticated USING (team_id IN (SELECT public.my_team_ids()));

DROP POLICY IF EXISTS "members_owner_write" ON public.team_members;
CREATE POLICY "members_owner_write" ON public.team_members
  FOR ALL TO authenticated
  USING (public.my_team_role(team_id) = 'owner')
  WITH CHECK (public.my_team_role(team_id) = 'owner');


-- ── profiles: los del equipo se ven entre ellos ─────────────────────────────
-- Hace falta para poder ESCRIBIR EL NOMBRE de un entrenador en la interfaz. Con
-- la política actual (`auth.uid() = id`) cada uno solo ve su propio perfil, así
-- que la lista de miembros saldría con identificadores en lugar de personas.

CREATE OR REPLACE FUNCTION public.shares_team_with(other uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members mine
    JOIN public.team_members theirs ON theirs.team_id = mine.team_id
    WHERE mine.profile_id = auth.uid() AND theirs.profile_id = other
  );
$$;

DROP POLICY IF EXISTS "profiles_team_read" ON public.profiles;
CREATE POLICY "profiles_team_read" ON public.profiles
  FOR SELECT TO authenticated USING (public.shares_team_with(id));


-- ── Invitar a un entrenador ─────────────────────────────────────────────────
-- No se puede hacer con un INSERT desde el cliente: para añadir a alguien hay que
-- localizar su perfil por email, y `profiles` no permite buscar por email a quien
-- todavía no comparte equipo contigo —justo el caso de una invitación—. Una
-- función `SECURITY DEFINER` resuelve la búsqueda sin abrir la tabla.

CREATE OR REPLACE FUNCTION public.invite_team_member(
  target_team uuid,
  member_email text,
  member_role text DEFAULT 'trainer'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  found uuid;
BEGIN
  IF public.my_team_role(target_team) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Solo quien creó el equipo puede añadir miembros';
  END IF;

  IF member_role NOT IN ('admin', 'trainer', 'viewer') THEN
    RAISE EXCEPTION 'Rol no válido: %', member_role;
  END IF;

  SELECT id INTO found FROM public.profiles
  WHERE lower(email) = lower(trim(member_email));

  IF found IS NULL THEN
    RAISE EXCEPTION 'No hay ninguna cuenta con el email %. Pídele que se registre primero.', member_email;
  END IF;

  INSERT INTO public.team_members (team_id, profile_id, role)
  VALUES (target_team, found, member_role)
  ON CONFLICT (team_id, profile_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_team_member(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid, text, text) TO authenticated;


-- ── clients ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Acceso a clientes" ON public.clients;
DROP POLICY IF EXISTS "clients_coach_all" ON public.clients;
DROP POLICY IF EXISTS "clients_client_read" ON public.clients;

CREATE POLICY "clients_team_read" ON public.clients
  FOR SELECT TO authenticated USING (public.can_read_client(id));

CREATE POLICY "clients_team_write" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.can_write_client(id))
  WITH CHECK (public.can_write_client(id));

-- Dar de alta: cualquier miembro que no sea `viewer`, dentro de SU equipo.
CREATE POLICY "clients_team_insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.my_team_role(team_id) IN ('owner', 'admin', 'trainer'));

-- Borrar un cliente es irreversible: solo el dueño o un admin.
CREATE POLICY "clients_team_delete" ON public.clients
  FOR DELETE TO authenticated
  USING (public.my_team_role(team_id) IN ('owner', 'admin'));

-- El cliente sigue leyendo su propia ficha.
CREATE POLICY "clients_self_read" ON public.clients
  FOR SELECT TO authenticated USING (client_profile_id = auth.uid());

-- Y guardando sus preferencias del panel (ver 0005).
CREATE POLICY "clients_self_prefs" ON public.clients
  FOR UPDATE TO authenticated
  USING (client_profile_id = auth.uid())
  WITH CHECK (client_profile_id = auth.uid());


-- ── Bloques por cliente ─────────────────────────────────────────────────────
-- El mismo patrón para las cuatro tablas: el equipo según su rol, y el cliente
-- solo lo que el producto le pide aportar (sus series, su peso, sus fotos).

DROP POLICY IF EXISTS "workout_coach_all" ON public.workout_data;
DROP POLICY IF EXISTS "Acceso a workout_data" ON public.workout_data;
CREATE POLICY "workout_team_read" ON public.workout_data
  FOR SELECT TO authenticated USING (public.can_read_client(client_id));
CREATE POLICY "workout_team_write" ON public.workout_data
  FOR ALL TO authenticated
  USING (public.can_write_client(client_id))
  WITH CHECK (public.can_write_client(client_id));

DROP POLICY IF EXISTS "anthro_coach_all" ON public.anthropometry;
DROP POLICY IF EXISTS "Acceso a antropometria" ON public.anthropometry;
CREATE POLICY "anthro_team_read" ON public.anthropometry
  FOR SELECT TO authenticated USING (public.can_read_client(client_id));
CREATE POLICY "anthro_team_write" ON public.anthropometry
  FOR ALL TO authenticated
  USING (public.can_write_client(client_id))
  WITH CHECK (public.can_write_client(client_id));

DROP POLICY IF EXISTS "nutrition_coach_all" ON public.nutrition_plans;
DROP POLICY IF EXISTS "Acceso a nutricion" ON public.nutrition_plans;
CREATE POLICY "nutrition_team_read" ON public.nutrition_plans
  FOR SELECT TO authenticated USING (public.can_read_client(client_id));
CREATE POLICY "nutrition_team_write" ON public.nutrition_plans
  FOR ALL TO authenticated
  USING (public.can_write_client(client_id))
  WITH CHECK (public.can_write_client(client_id));

DROP POLICY IF EXISTS "photos_coach_all" ON public.progress_photos;
DROP POLICY IF EXISTS "Acceso a fotos de progreso" ON public.progress_photos;
CREATE POLICY "photos_team_read" ON public.progress_photos
  FOR SELECT TO authenticated USING (public.can_read_client(client_id));
CREATE POLICY "photos_team_write" ON public.progress_photos
  FOR ALL TO authenticated
  USING (public.can_write_client(client_id))
  WITH CHECK (public.can_write_client(client_id));

-- Las políticas del CLIENTE sobre sus propios datos son las de
-- `0002_rls_hardening.sql` y no cambian: se apoyan en `is_me(client_id)`, que
-- sigue siendo correcto. Si no has aplicado 0002, cópialas de allí.


-- ── Bibliotecas del equipo ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "exercises_coach_all" ON public.exercises;
DROP POLICY IF EXISTS "coach manages own exercises" ON public.exercises;
CREATE POLICY "exercises_team_all" ON public.exercises
  FOR ALL TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()))
  WITH CHECK (team_id IN (SELECT public.my_team_ids()));

DROP POLICY IF EXISTS "foods_coach_all" ON public.foods;
DROP POLICY IF EXISTS "coach manages own foods" ON public.foods;
CREATE POLICY "foods_team_all" ON public.foods
  FOR ALL TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()))
  WITH CHECK (team_id IN (SELECT public.my_team_ids()));

COMMIT;

-- ============================================================================
-- 5. Después de aplicarlo (fase 1)
-- ----------------------------------------------------------------------------
--   · La carga inicial debe dejar de filtrar en el cliente:
--       .from('clients').select('*').eq('coach_id', user.id)   ← quitar el .eq
--     Con equipos, quién ve a quién depende del rol, y replicar esa regla en
--     JavaScript sería duplicar la autorización donde no se puede confiar en
--     ella. RLS ya devuelve exactamente las filas que tocan.
--   · `addClient` debe rellenar `team_id` y `assigned_to`. OJO: `coach_id` es
--     NOT NULL, así que durante la transición hay que seguir escribiéndolo (con
--     el id del entrenador asignado). Dejar de hacerlo requiere quitarle el NOT
--     NULL primero, y eso va en la migración que retire la columna.
--   · Las bibliotecas se consultan por `team_id`.
--
-- Y cuando ninguna consulta use ya `coach_id`, se puede retirar la columna en una
-- migración aparte. No antes.
--
-- ── Storage sigue pendiente ─────────────────────────────────────────────────
-- El bucket `client-media` tiene sus propias políticas sobre `storage.objects`.
-- Las rutas son `<clientId>/photos/week-<n>/…`, así que la comprobación es
--   public.can_read_client(((storage.foldername(name))[1])::uuid)
-- Para escribirlas hace falta ver primero lo que hay:
--   select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage';
-- ============================================================================
