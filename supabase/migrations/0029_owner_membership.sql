-- ============================================================================
-- El dueño de un equipo es miembro de su equipo, con rol de dueño
-- ----------------------------------------------------------------------------
-- Requiere `0006_teams.sql`. Repara datos y añade un disparador para que no
-- vuelva a romperse. No borra nada.
--
-- ══ El fallo que corrige ═══════════════════════════════════════════════════
--
-- Dar de alta un cliente fallaba con:
--
--     new row violates row-level security policy for table "clients"
--
-- La política `clients_team_insert` (0006) exige que quien inserta tenga rol
-- `owner`, `admin` o `trainer` **en el equipo de la ficha**:
--
--     WITH CHECK (public.my_team_role(team_id) IN ('owner', 'admin', 'trainer'))
--
-- Y `my_team_role` lee `team_members`. Si ahí no hay fila, devuelve NULL; si la
-- hay con rol `viewer`, devuelve `viewer`. Los dos casos caen fuera de la lista y
-- la fila se rechaza.
--
-- ── Por qué el resto de la aplicación seguía funcionando ────────────────────
-- Porque `teams` guarda `owner_id` y `team_members` guarda la pertenencia, y son
-- dos sitios distintos. Ser dueño y ser miembro NO eran lo mismo, así que se
-- podía ser lo primero sin lo segundo. Todo lo que mira `owner_id` —el nombre del
-- equipo, la propiedad— seguía bien, y solo se caía lo que pasa por `my_team_role`.
--
-- Un fallo así no se encuentra leyendo el error: dice la verdad («una política ha
-- rechazado la fila») y no menciona el motivo, porque RLS no explica sus rechazos
-- a propósito — explicarlos sería filtrar información sobre lo que no ves.
--
-- ── Cómo se pudo llegar aquí ────────────────────────────────────────────────
-- El backfill de la 0006 solo creaba equipo para `profiles.role = 'coach'`, y la
-- aplicación trata como entrenador a todo el que NO sea `'client'`. Un perfil con
-- el rol vacío o con otro valor cae en ese hueco: la aplicación le deja entrar
-- como entrenador y el backfill nunca le dio pertenencia.
--
-- No importa cuál de los caminos fue: el invariante es el mismo por todos.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE EXCEPTION 'Falta 0006_teams.sql: sin equipos no hay pertenencia que reparar.';
  END IF;
END $$;

BEGIN;

-- ── 1. La pertenencia que falta ────────────────────────────────────────────
INSERT INTO public.team_members (team_id, profile_id, role)
SELECT t.id, t.owner_id, 'owner'
FROM public.teams t
WHERE t.owner_id IS NOT NULL
ON CONFLICT (team_id, profile_id) DO NOTHING;

/*
  ── 2. La pertenencia que está, con el rol equivocado ──────────────────────

  Se corrige solo al DUEÑO, y solo hacia `owner`. Un `viewer` cualquiera se queda
  como está: puede ser exactamente lo que su dueño quiso, y esta migración no
  tiene forma de distinguir un permiso deliberado de un error.

  Con el dueño no hay ambigüedad posible: un dueño que no puede escribir en su
  propio equipo no es una decisión, es un dato roto.
*/
UPDATE public.team_members m
SET role = 'owner'
FROM public.teams t
WHERE t.id = m.team_id
  AND t.owner_id = m.profile_id
  AND m.role IS DISTINCT FROM 'owner';

COMMIT;


BEGIN;

/**
 * Que no vuelva a pasar: al crear un equipo, su dueño entra como miembro.
 *
 * ── Por qué un disparador y no confiar en quien inserta ─────────────────────
 * Porque hay tres caminos que crean equipos —el backfill de la 0006,
 * `ensure_my_team` (0019) y un INSERT a mano desde el panel— y cada uno tenía que
 * acordarse de escribir la fila de pertenencia. Dos se acordaban. Ese es
 * exactamente el tipo de regla que no se sostiene repitiéndola en cada sitio.
 *
 * AFTER INSERT y no BEFORE: la fila de `team_members` referencia `teams.id`, que
 * todavía no existe cuando corre un BEFORE.
 */
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, profile_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    -- `ensure_my_team` inserta la pertenencia por su cuenta justo después de
    -- crear el equipo. Sin esto, esa segunda inserción chocaría y rompería el
    -- alta entera.
    ON CONFLICT (team_id, profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_owner_membership ON public.teams;
CREATE TRIGGER teams_owner_membership
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

COMMIT;


BEGIN;

/**
 * ¿Por qué no puedo escribir?
 *
 * Devuelve, para el usuario que llama, lo que de verdad deciden las políticas:
 * su equipo, su rol y el estado de la suscripción. Existe porque el diagnóstico
 * de este fallo costó ir a mano tabla por tabla, y la próxima vez —a mí o a un
 * entrenador que escriba a soporte— tiene que costar una línea.
 *
 * No expone nada nuevo: los tres datos ya son legibles por su dueño a través de
 * las políticas de `team_members`, `teams` y `team_subscriptions`. Lo único que
 * añade es tenerlos juntos.
 */
CREATE OR REPLACE FUNCTION public.my_access_check()
RETURNS TABLE (
  team_id        uuid,
  team_name      text,
  soy_dueno      boolean,
  rol            text,
  puedo_dar_alta boolean,
  plan           text,
  status         text,
  puedo_escribir boolean
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    t.id,
    t.name,
    t.owner_id = auth.uid(),
    m.role,
    m.role IN ('owner', 'admin', 'trainer'),
    s.plan,
    s.status,
    public.team_write_allowed(t.id)
  FROM public.team_members m
  JOIN public.teams t ON t.id = m.team_id
  LEFT JOIN public.team_subscriptions s ON s.team_id = t.id
  WHERE m.profile_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_access_check() FROM public;
GRANT EXECUTE ON FUNCTION public.my_access_check() TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Desde el editor SQL no hay sesión, así que `auth.uid()` es NULL y
-- `my_access_check()` sale vacía. Ahí se mira directamente:
--
--   SELECT p.email, t.name, m.role, (t.owner_id = p.id) AS es_dueno
--   FROM public.profiles p
--   JOIN public.team_members m ON m.profile_id = p.id
--   JOIN public.teams t ON t.id = m.team_id;
--
-- Que no queda ningún dueño sin su fila —esto tiene que salir vacío—:
--
--   SELECT t.id, t.name FROM public.teams t
--   WHERE t.owner_id IS NOT NULL AND NOT EXISTS (
--     SELECT 1 FROM public.team_members m
--     WHERE m.team_id = t.id AND m.profile_id = t.owner_id AND m.role = 'owner'
--   );
--
-- Y desde la aplicación, con sesión iniciada:
--
--   SELECT * FROM public.my_access_check();
-- ============================================================================
