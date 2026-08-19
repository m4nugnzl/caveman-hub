-- ============================================================================
-- Las integraciones, de los planes de arriba
-- ----------------------------------------------------------------------------
-- El segundo de los tres capados de `docs/monetizacion.md` §7.4. Es lo que quiere
-- un entrenador con un negocio detrás y le da exactamente igual a uno que
-- empieza, que es el único criterio que hace que un capado no estorbe.
--
--      Gratis · Solo          no
--      Pro · Equipo           sí
--      Las tarifas retiradas  sí  (ver punto 3)
--
-- ══ 1. Una columna en `plan_limits`, no una lista de planes en el código ═══
--
-- La comprobación podría ser `IF plan IN ('pro','equipo')`. Sería más corta y
-- estaría mal por lo mismo que ya avisó la 0064: **los nombres de los planes
-- cambian**. Esta misma semana `solo` pasó a significar diez clientes en vez de
-- treinta, y una condición escrita con nombres dentro de una función de Postgres
-- envejece donde nadie la relee.
--
-- Con `has_integrations` en la tabla, decidir que Solo también las lleve es un
-- `UPDATE`. Es la misma razón por la que `plan_limits` es una tabla y no un
-- `CASE` (0019).
--
-- ══ 2. Disparador y no una política, por el mensaje ════════════════════════
--
-- Aquí sí bastaría con añadir la condición al `WITH CHECK` de `integrations_own`.
-- Se hace con disparador porque **RLS rechaza la fila sin decir por qué**: el
-- error que llega es un 42501 pelado, y ya costó una tarde una vez —la §3.4 del
-- documento cuenta cómo un guardado bloqueado por política se anunciaba como
-- «alguien ha cambiado estos datos mientras editabas»—. Un capado comercial
-- tiene que explicarse solo: quien se topa con él es exactamente quien podría
-- pagar por quitarlo.
--
-- ══ 3. A quien ya la tenía no se le quita ══════════════════════════════════
--
-- Dos decisiones, y las dos van en la misma dirección:
--
--   · `BEFORE INSERT` y no también `UPDATE`: una integración que ya existe sigue
--     funcionando y editándose. Solo se bloquea crear una nueva.
--   · Las tarifas retiradas (`solo_2026`, `equipo_2026`) y `fundador` entran con
--     `true`. Esa gente contrató cuando no había nada capado, y empezar a aplicar
--     una regla no puede quitarle algo a quien ya lo estaba usando.
--
-- **Ojo con esto al subir a alguien de tarifa.** Pasar a un cliente de
-- `solo_2026` al `solo` de hoy le quita las integraciones, y eso no lo dice
-- ninguna pantalla. La consulta para mirarlo antes está al final.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.integrations') IS NULL THEN
    RAISE EXCEPTION 'Falta 0010_integrations.sql.';
  END IF;
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql.';
  END IF;
END;
$$;

BEGIN;

ALTER TABLE public.plan_limits
  -- `false` por defecto a propósito: un plan nuevo que nadie configure NO trae
  -- integraciones. Si el defecto fuera `true`, el olvido regalaría la función.
  ADD COLUMN IF NOT EXISTS has_integrations boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.plan_limits.has_integrations IS
  'Si este plan puede crear integraciones (0010). Lo aplica `enforce_integration_plan`.';

UPDATE public.plan_limits SET has_integrations = true
 WHERE plan IN ('pro', 'equipo', 'solo_2026', 'equipo_2026', 'fundador');

/*
  La portada lo va a enseñar en la lista de cada plan, y lee sin sesión. La 0049
  concedió COLUMNAS y no la tabla, así que una columna nueva no se ve hasta que
  se concede — y no da error: simplemente llega vacía (la 0062 tropezó con esto).
*/
GRANT SELECT (has_integrations) ON public.plan_limits TO anon;

CREATE OR REPLACE FUNCTION public.enforce_integration_plan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_team  uuid;
  v_ok    boolean;
  v_label text;
BEGIN
  /*
    La integración cuelga de una persona (`owner_id`) y el plan cuelga del equipo,
    así que hay que ir de una a otro. `team_id` viene relleno cuando la crea la
    aplicación; si falta, se busca el equipo de esa persona.
  */
  v_team := COALESCE(
    NEW.team_id,
    (SELECT m.team_id FROM public.team_members m
      WHERE m.profile_id = NEW.owner_id
      ORDER BY (m.role = 'owner') DESC
      LIMIT 1)
  );

  SELECT l.has_integrations, l.label INTO v_ok, v_label
    FROM public.plan_limits l
   WHERE l.plan = COALESCE(
           (SELECT s.plan FROM public.team_subscriptions s WHERE s.team_id = v_team),
           'prueba'
         );

  -- Sin fila de plan no se regala la función: se lee como el plan de partida, que
  -- es lo que hace el COALESCE de arriba. Si aun así no hay nada, `v_ok` es NULL
  -- y `COALESCE` lo convierte en «no», que es el lado seguro del error.
  IF COALESCE(v_ok, false) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'El plan % no incluye integraciones. Cambia de plan para conectar Notion.',
    COALESCE(v_label, 'actual')
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS integrations_plan_limit ON public.integrations;
CREATE TRIGGER integrations_plan_limit
  BEFORE INSERT ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_integration_plan();

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Qué plan lleva integraciones:
--
--   SELECT sort, plan, label, has_integrations FROM public.plan_limits ORDER BY sort;
--
-- ANTES de subirle la tarifa a nadie: si esa persona tiene integraciones y su
-- plan nuevo no las lleva, la que ya tiene le seguirá funcionando (punto 3) pero
-- no podrá crear otra. Conviene saberlo antes y no después:
--
--   SELECT p.email, ts.plan, i.provider, i.status
--     FROM public.integrations i
--     JOIN public.profiles p ON p.id = i.owner_id
--     LEFT JOIN public.team_members m ON m.profile_id = i.owner_id
--     LEFT JOIN public.team_subscriptions ts ON ts.team_id = m.team_id;
--
-- Y que el tope se aplica: desde una cuenta gratuita, Ajustes → Integraciones →
-- conectar Notion tiene que contestar «El plan Gratis no incluye integraciones».
-- ============================================================================
