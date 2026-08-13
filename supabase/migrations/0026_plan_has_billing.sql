-- ============================================================================
-- Saber si hay algo que gestionar en Stripe
-- ----------------------------------------------------------------------------
-- ⚠️  Requiere `0019_billing.sql`. Cambia la forma de `my_team_plan()`, así que
--     hay que BORRARLA y recrearla: `CREATE OR REPLACE` no puede cambiar las
--     columnas que devuelve una función. Es una lectura, no hay datos en riesgo.
--
-- ══ El fallo que corrige ═══════════════════════════════════════════════════
--
-- La pantalla de Plan enseñaba «Abrir facturación» a cualquiera que no estuviera
-- en periodo de prueba. Pero el portal de Stripe necesita un CLIENTE de Stripe, y
-- un equipo puede estar activo sin tenerlo: los equipos injertados como
-- `fundador`, y cualquiera cuya suscripción se haya limpiado a mano.
--
-- Resultado: un botón que se ofrece y, al pulsarlo, contesta «todavía no hay
-- ninguna suscripción que gestionar». Un botón que no debería haberse ofrecido es
-- peor que uno que falta: enseña a desconfiar de la pantalla.
--
-- La condición correcta no es «no está en prueba» sino «tiene cliente de Stripe»,
-- y eso solo lo sabe la base de datos —`stripe_customer_id` no se expone, y no
-- debe exponerse: es un identificador de facturación y la pantalla no necesita su
-- valor, solo si existe—.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.my_team_plan();

CREATE FUNCTION public.my_team_plan()
RETURNS TABLE (
  team_id            uuid,
  plan               text,
  label              text,
  status             text,
  activo             boolean,
  clientes           integer,
  max_clientes       integer,
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  -- Si hay relación con Stripe. Booleano y no el identificador: la pantalla solo
  -- necesita saber si el portal tiene algo que abrir.
  con_facturacion    boolean
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    s.team_id,
    s.plan,
    l.label,
    s.status,
    (
      s.status IN ('active', 'trialing')
      -- Una prueba con fecha pasada deja de valer aunque Stripe todavía no haya
      -- dicho nada: el reloj corre aquí, no allí.
      AND (s.status <> 'trialing' OR s.trial_ends_at IS NULL OR s.trial_ends_at > now())
    ),
    (SELECT count(*)::integer FROM public.clients c
      WHERE c.team_id = s.team_id AND c.status IS DISTINCT FROM 'archived'),
    l.max_clients,
    s.trial_ends_at,
    s.current_period_end,
    s.stripe_customer_id IS NOT NULL
  FROM public.team_subscriptions s
  JOIN public.plan_limits l ON l.plan = s.plan
  WHERE s.team_id IN (SELECT public.my_team_ids())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_team_plan() FROM public;
GRANT EXECUTE ON FUNCTION public.my_team_plan() TO authenticated;

COMMIT;

-- ============================================================================
--   SELECT * FROM public.my_team_plan();
-- ============================================================================
