-- ============================================================================
-- El entrenador nuevo se quedaba sin equipo: `ensure_my_team` chocaba consigo misma
-- ----------------------------------------------------------------------------
-- Requiere `0019_billing.sql`. Solo reemplaza una función. No toca tablas, ni
-- políticas, ni datos.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Dar de alta un cliente falla con:
--
--     duplicate key value violates unique constraint "team_members_pkey"
--
-- Y no lo provoca el cliente: lo provoca crear el EQUIPO, un paso antes.
--
-- ── Cómo se cierra el círculo ───────────────────────────────────────────────
--
-- La `0029` añadió un disparador para que el dueño de un equipo entre siempre
-- como miembro de su equipo:
--
--     CREATE TRIGGER teams_owner_membership AFTER INSERT ON public.teams …
--
-- Y `ensure_my_team` (0019) ya insertaba esa misma fila por su cuenta:
--
--     INSERT INTO public.teams (name, owner_id) VALUES (…) RETURNING id INTO v_team;
--     INSERT INTO public.team_members (team_id, profile_id, role) VALUES (v_team, auth.uid(), 'owner');
--
-- Un disparador AFTER ROW termina **antes de que empiece la siguiente sentencia
-- de la función**. Así que el orden real es: el disparador escribe la fila de
-- pertenencia, y la línea siguiente de `ensure_my_team` intenta escribir la misma
-- —mismo `team_id`, mismo `profile_id`, que son la clave primaria— y revienta.
--
-- La `0029` vio venir el choque y puso el `ON CONFLICT DO NOTHING` en el lado
-- equivocado: en el disparador, «porque `ensure_my_team` inserta la pertenencia
-- por su cuenta justo después». Justo después es precisamente el problema — el
-- que llega segundo, y por tanto el que choca, es el de la función.
--
-- ── Por qué se queda sin equipo, y no solo sin cliente ──────────────────────
--
-- La excepción aborta la función entera, así que el `INSERT` en `teams` se
-- deshace con ella. No queda un equipo a medias ni una fila huérfana: queda lo
-- mismo que había antes, es decir, nada. Y como la aplicación vuelve a llamar a
-- `ensure_my_team` en cada arranque, el resultado es el mismo cada vez.
--
-- Por eso el síntoma es «no puedo dar de alta a un cliente» y no «no puedo crear
-- mi equipo»: crear el equipo pasa en silencio (`AppContext` ignora ese error) y
-- lo primero que se rompe a la vista es el alta.
--
-- ── A quién le pasa ─────────────────────────────────────────────────────────
--
-- A todo el que **todavía no tuviera equipo** cuando se aplicó la `0029`: en la
-- práctica, a quien se registró después. Los que ya lo tenían no vuelven a entrar
-- nunca por esa rama —`ensure_my_team` devuelve el equipo existente en su primera
-- consulta— y por eso el fallo no se vio antes.
--
-- ══ El arreglo ═════════════════════════════════════════════════════════════
--
-- La misma función, con la inserción de la pertenencia hecha idempotente. Es el
-- mismo `ON CONFLICT (team_id, profile_id) DO NOTHING` que ya llevan el backfill
-- de la `0006`, el de la `0029` y su disparador: cuatro sitios escriben esa fila
-- y la regla es la misma en todos —que exista, no quién la puso—.
--
-- No cambia nada más: ni el nombre, ni la firma, ni los permisos, ni el resto del
-- cuerpo. Y sigue funcionando en bases sin la `0029`, donde no hay disparador y
-- el `ON CONFLICT` simplemente no se activa nunca.
--
-- ── Qué hay que reparar ─────────────────────────────────────────────────────
--
-- Nada. Como cada intento se deshacía entero, no hay datos a medio escribir que
-- arreglar. En cuanto esta migración esté aplicada, el siguiente arranque de la
-- aplicación crea el equipo que faltaba y el alta funciona.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.ensure_my_team()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql: `ensure_my_team` es lo que esta migración corrige.';
  END IF;
END $$;

BEGIN;

/**
 * Devuelve el equipo del entrenador, creándolo si hace falta.
 *
 * Idempotente en los dos sentidos: llamarla mil veces deja un equipo, y la fila
 * de pertenencia del dueño da igual quién la escriba —ella o el disparador
 * `teams_owner_membership` (0029)—.
 */
CREATE OR REPLACE FUNCTION public.ensure_my_team()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión';
  END IF;

  SELECT team_id INTO v_team FROM public.team_members
  WHERE profile_id = auth.uid() LIMIT 1;
  IF v_team IS NOT NULL THEN
    RETURN v_team;
  END IF;

  -- Un cliente no tiene equipo propio: pertenece a la cartera de su entrenador.
  -- Crearle uno le convertiría en dueño de un negocio vacío.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), 'Mi equipo') INTO v_name
  FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.teams (name, owner_id) VALUES (COALESCE(v_name, 'Mi equipo'), auth.uid())
  RETURNING id INTO v_team;

  /*
    Aquí estaba el fallo. El disparador `teams_owner_membership` (0029) ya ha
    escrito esta fila —los AFTER ROW terminan antes de la sentencia siguiente—,
    así que esta inserción llega segunda y chocaba contra la clave primaria.

    Se deja igualmente, y no se borra confiando en el disparador, porque esta
    función tiene que seguir siendo correcta en una base sin la 0029 aplicada.
    Que la escriban los dos es exactamente lo que `DO NOTHING` vuelve inofensivo.
  */
  INSERT INTO public.team_members (team_id, profile_id, role)
  VALUES (v_team, auth.uid(), 'owner')
  ON CONFLICT (team_id, profile_id) DO NOTHING;

  -- La prueba empieza al crear el equipo, no al registrarse: es cuando de verdad
  -- empieza a usarse esto.
  INSERT INTO public.team_subscriptions (team_id, plan, status, trial_ends_at)
  VALUES (v_team, 'prueba', 'trialing', now() + interval '14 days')
  -- Por el mismo motivo que arriba: el día que otra pieza abra la suscripción del
  -- equipo nuevo, esto no puede ser lo que rompa el alta.
  ON CONFLICT (team_id) DO NOTHING;

  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_team() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_my_team() TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Quién se ha quedado sin equipo (antes de aplicar esto, el que abrió el ticket
-- tiene que salir aquí):
--
--   SELECT p.id, p.email, p.role
--   FROM public.profiles p
--   WHERE p.role IS DISTINCT FROM 'client'
--     AND NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.profile_id = p.id);
--
-- Y después, desde la APLICACIÓN y con sesión iniciada (en el editor SQL
-- `auth.uid()` es NULL y solo saldría «Hay que iniciar sesión»):
--
--   await supabase.rpc('ensure_my_team')     // devuelve un uuid, no un error
--   await supabase.rpc('create_client', { p_name: 'Prueba', p_fields: {} })
--
-- Que el equipo ha quedado bien montado —una fila, rol `owner`, con suscripción—:
--
--   SELECT t.name, m.role, s.plan, s.status
--   FROM public.teams t
--   JOIN public.team_members m ON m.team_id = t.id AND m.profile_id = t.owner_id
--   LEFT JOIN public.team_subscriptions s ON s.team_id = t.id;
--
-- Borrar la prueba después:
--
--   DELETE FROM public.clients WHERE name = 'Prueba';
-- ============================================================================
