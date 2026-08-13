-- ============================================================================
-- Dar de alta un cliente pasa a ser una operación, no una fila suelta
-- ----------------------------------------------------------------------------
-- Requiere `0006_teams.sql` y `0019_billing.sql`. No cambia ninguna política: la
-- de `clients_team_insert` se queda exactamente como está.
--
-- ══ El fallo que arrastramos ═══════════════════════════════════════════════
--
-- Dar de alta un cliente falla con:
--
--     new row violates row-level security policy for table "clients"
--
-- La política existe y su `WITH CHECK` es correcto —comprobado leyendo
-- `pg_policies`—, así que lo que falla es lo que devuelve `my_team_role(team_id)`
-- en esa sesión. Y eso RLS **no lo cuenta**: rechaza la fila y calla. No es un
-- defecto, es su diseño —explicar un rechazo sería filtrar información sobre lo
-- que no puedes ver—, pero deja al desarrollador sin nada que leer y al usuario
-- con un callejón sin salida.
--
-- Tres intentos de adivinarlo desde fuera después, el problema real no es cuál de
-- las causas es: es que **una operación de negocio estaba implementada como un
-- INSERT desnudo**, y por eso su única defensa era una política que no habla.
--
-- ══ Qué cambia ═════════════════════════════════════════════════════════════
--
-- Dar de alta un cliente deja de ser «escribe una fila y que RLS opine» y pasa a
-- ser una función que:
--
--   1. **Resuelve el equipo ella misma** con `ensure_my_team()`, en vez de
--      confiar en que el navegador mande el `team_id` correcto.
--   2. **Comprueba el permiso explícitamente** y, si falta, **dice cuál es el rol
--      que tienes** en lugar de rechazar en silencio.
--   3. Inserta con una lista cerrada de columnas.
--
-- No es un patrón nuevo en este proyecto: es el mismo de `claim_client_invite`
-- (0015), `set_client_preferences` (0008) y `log_session_set` (0014). Todas
-- nacieron por la misma razón — RLS filtra FILAS y hay operaciones cuyo permiso
-- no cabe en una condición sobre una fila—.
--
-- ══ Qué NO cambia, y es lo importante ══════════════════════════════════════
--
--   · **La comprobación es la misma.** `owner`, `admin` o `trainer` del equipo
--     de quien llama. Ni un rol más.
--   · **El límite del plan sigue mordiendo.** El trigger `clients_plan_limit`
--     (0019) se dispara igual: los triggers corren con SECURITY DEFINER o sin él.
--   · **La política se queda.** Un INSERT directo desde cualquier otro sitio
--     sigue pasando por ella. Esto añade una puerta, no abre una valla.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.ensure_my_team()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql: `ensure_my_team` es quien resuelve el equipo.';
  END IF;
END $$;

BEGIN;

/**
 * Da de alta un cliente en el equipo de quien llama.
 *
 * `p_fields` es un objeto con las columnas opcionales, en `snake_case` — el mismo
 * que ya produce `mapClientToDb` en el navegador. Se leen de una lista cerrada:
 * lo que no esté aquí se ignora, así que un `client_profile_id` o un `team_id`
 * colados en la petición no llegan a la tabla.
 */
CREATE OR REPLACE FUNCTION public.create_client(
  p_name   text,
  p_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS public.clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team uuid;
  v_role text;
  v_out  public.clients;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión para dar de alta un cliente.';
  END IF;

  IF COALESCE(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'El cliente necesita un nombre.';
  END IF;

  -- El equipo lo decide el servidor. Es la diferencia de fondo con el INSERT
  -- desnudo: allí el `team_id` venía del navegador y podía ser NULL o de otro.
  v_team := public.ensure_my_team();
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Tu cuenta no tiene equipo y no se ha podido crear uno. Si entraste como cliente, no puedes dar de alta clientes.';
  END IF;

  v_role := public.my_team_role(v_team);

  /*
    Aquí está lo que RLS no podía decir. El mensaje nombra el rol y el equipo,
    así que el siguiente informe de este fallo llega con el diagnóstico dentro en
    vez de con la frase de Postgres.
  */
  IF v_role IS NULL THEN
    RAISE EXCEPTION
      'No perteneces al equipo % (tu usuario no tiene fila en team_members). Aplica 0029_owner_membership.sql o pide a quien lo creó que te añada.',
      v_team;
  END IF;

  IF v_role NOT IN ('owner', 'admin', 'trainer') THEN
    RAISE EXCEPTION
      'Tu rol en el equipo es «%», y dar de alta clientes requiere owner, admin o trainer.',
      v_role;
  END IF;

  INSERT INTO public.clients (
    coach_id, team_id, assigned_to,
    name, email, phone, gender, plan, status,
    start_date, current_weight,
    cycle_type, cycle_pattern,
    gym_equipment_link, youtube_explanation_url, avatar
  )
  VALUES (
    v_uid,
    v_team,
    -- Por defecto se asigna a quien lo da de alta: en un equipo, el que crea la
    -- ficha es normalmente quien va a llevarla.
    COALESCE(NULLIF(p_fields ->> 'assigned_to', '')::uuid, v_uid),
    btrim(p_name),
    NULLIF(p_fields ->> 'email', ''),
    NULLIF(p_fields ->> 'phone', ''),
    NULLIF(p_fields ->> 'gender', ''),
    NULLIF(p_fields ->> 'plan', ''),
    COALESCE(NULLIF(p_fields ->> 'status', ''), 'active'),
    COALESCE(NULLIF(p_fields ->> 'start_date', '')::date, CURRENT_DATE),
    NULLIF(p_fields ->> 'current_weight', '')::numeric,
    COALESCE(NULLIF(p_fields ->> 'cycle_type', ''), 'weekly'),
    COALESCE(p_fields -> 'cycle_pattern', '{"train": 2, "rest": 1}'::jsonb),
    NULLIF(p_fields ->> 'gym_equipment_link', ''),
    NULLIF(p_fields ->> 'youtube_explanation_url', ''),
    NULLIF(p_fields ->> 'avatar', '')
  )
  RETURNING * INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_client(text, jsonb) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Desde la APLICACIÓN, con sesión iniciada (en el editor SQL `auth.uid()` es NULL
-- y solo saldría «Hay que iniciar sesión»). En la consola del navegador:
--
--   await supabase.rpc('create_client', { p_name: 'Prueba', p_fields: {} })
--
-- Y lo que hay que leer:
--
--   · Devuelve la fila            → arreglado.
--   · «No perteneces al equipo …» → falta tu fila en team_members. La 0029 no
--                                   llegó porque `teams.owner_id` tampoco te
--                                   apunta: hay que insertarla a mano.
--   · «Tu rol en el equipo es …»  → ahí está el motivo, con su nombre.
--
-- Borrar la prueba después:
--
--   DELETE FROM public.clients WHERE name = 'Prueba';
-- ============================================================================
