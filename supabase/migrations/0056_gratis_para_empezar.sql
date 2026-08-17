-- ============================================================================
-- Tres clientes gratis, sin fecha. Y a partir de ahí, se paga.
-- ----------------------------------------------------------------------------
-- ⚠️  CAMBIA EL EMPAQUETADO. Requiere `0019_billing.sql` y `0037`. Se para sola
--     si falta alguna. No borra ningún dato: solo cambia el plan de partida y
--     saca de la cuenta atrás a quien esté dentro de ella.
--
-- ══ El cambio de modelo ═════════════════════════════════════════════════════
--
-- Hasta ahora: **catorce días con tres clientes**, y al vencer la aplicación se
-- queda en solo lectura (0027).
--
-- A partir de aquí: **tres clientes, gratis y sin fecha**. Se paga al querer el
-- cuarto.
--
-- El motivo es la etapa en la que está el producto. Una prueba de dos semanas le
-- pide a alguien que decida sobre una herramienta de seguimiento **antes de
-- haber visto un solo ciclo de seguimiento**: el check-in es semanal y el
-- progreso de un cliente se mide en meses, así que catorce días no enseñan lo
-- que esto hace. Con tres clientes sin plazo, el entrenador se trae a los que
-- lleva, trabaja con ellos de verdad, y el día que quiere meter al cuarto ya
-- tiene aquí dentro meses de trabajo que no piensa rehacer en otro sitio.
--
-- El límite deja de ser un cronómetro y pasa a ser el crecimiento de su negocio,
-- que es cuando pagar tiene sentido para él y no solo para nosotros.
--
-- ══ Por qué la clave del plan SIGUE llamándose `prueba` ═════════════════════
--
-- Porque no es solo una fila de `plan_limits`: la cadena `'prueba'` está escrita
-- en cinco sitios más, y uno de ellos **se despliega aparte**:
--
--   · `ensure_my_team()` (0037) y `enforce_client_limit()` (0019) — se arreglan
--     aquí abajo.
--   · La política de planes públicos (0049): `USING (purchasable OR plan = 'prueba')`.
--   · `supabase/functions/billing-webhook/index.ts`, que al recibir
--     `customer.subscription.deleted` escribe `patch.plan = 'prueba'`.
--
-- Ese último es una Edge Function. Si se renombrara la clave y alguien olvidara
-- redesplegarla, la primera cancelación de Stripe intentaría escribir un plan que
-- ya no existe: violación de clave foránea, webhook fallido y una suscripción que
-- se queda en el estado equivocado sin que nadie se entere hasta que el cliente
-- se queja.
--
-- Renombrar cuesta un redespliegue y una migración de la clave primaria; no
-- renombrar cuesta una línea de documentación. Lo que SÍ cambia es la etiqueta
-- **visible**, que es lo que lee una persona y lo único que causó el problema del
-- plan `fundador` — que se lee «el fundador» y significa «ya estabas dentro».
--
--     clave interna : prueba      (histórica, no se enseña en ninguna pantalla)
--     etiqueta       : Gratis      (lo que ve el entrenador)
--
-- `my_team_plan()` (0026) ya devuelve la etiqueta y no la clave, así que las
-- pantallas dicen «Gratis» sin tocar una línea de JavaScript.
--
-- ══ Lo que NO hace falta cambiar, y conviene saber por qué ═════════════════
--
-- El mecanismo ya soportaba esto entero:
--
--   · `team_write_allowed` (0027) permite escribir con
--     `status IN ('active','trialing','past_due')` y, si es `trialing`, solo
--     mientras `trial_ends_at` no haya pasado. Un plan `active` sin
--     `trial_ends_at` **nunca caduca**. No se toca una línea.
--   · `enforce_client_limit` (0019) aplica `plan_limits.max_clients` sin mirar el
--     estado, así que el tope de tres sigue aplicándose igual — ahora para
--     siempre en vez de durante dos semanas.
--
-- ══ Qué pasa con quien ya estaba ═══════════════════════════════════════════
--
-- Los que están en `prueba/trialing` salen de la cuenta atrás: pasan a `active`
-- sin fecha. Es el mismo trato que van a tener los nuevos, y quitarle a alguien
-- un plazo que ya tenía encima nunca puede empeorarle la situación.
--
-- Los `fundador` NO se tocan. Son ilimitados y son una conversación con cada
-- persona, no un `UPDATE` masivo: el procedimiento está en
-- `docs/monetizacion.md` §3.7 y `npm run radiografia` los señala uno a uno.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql: sin planes no hay empaquetado que cambiar.';
  END IF;
  IF to_regprocedure('public.ensure_my_team()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019/0037: `ensure_my_team` es lo que esta migración corrige.';
  END IF;
END;
$$;

BEGIN;

-- ── 1. El plan deja de ser una prueba ──────────────────────────────────────
--
-- `max_clients` ya valía 3 y se repite a propósito: esta migración tiene que
-- poder leerse sola dentro de dos años sin abrir la 0019 para saber cuántos son.
UPDATE public.plan_limits SET
  label       = 'Gratis',
  max_clients = 3,
  max_seats   = 1,
  blurb       = 'Tres clientes, sin límite de tiempo. Para empezar de verdad.',
  purchasable = false
WHERE plan = 'prueba';

-- ── 2. Los equipos nuevos nacen en él, sin cuenta atrás ────────────────────
--
-- Se reescribe entera y no solo la línea del INSERT: `CREATE OR REPLACE` no
-- parchea, sustituye. El resto del cuerpo es el de la 0037 tal cual —incluida su
-- corrección de idempotencia, que no se puede perder aquí— y lo único que cambia
-- son las tres últimas líneas del alta de la suscripción.
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
    El disparador `teams_owner_membership` (0029) ya ha escrito esta fila —los
    AFTER ROW terminan antes de la sentencia siguiente—, así que esta inserción
    llega segunda. Se deja igualmente para que la función siga siendo correcta en
    una base sin la 0029, y `DO NOTHING` la vuelve inofensiva. (0037)
  */
  INSERT INTO public.team_members (team_id, profile_id, role)
  VALUES (v_team, auth.uid(), 'owner')
  ON CONFLICT (team_id, profile_id) DO NOTHING;

  /*
    Sin `trial_ends_at`: el plan de partida ya no caduca. `team_write_allowed`
    deja escribir mientras el estado sea `active`, y el tope de tres clientes lo
    sigue aplicando `enforce_client_limit`.
  */
  INSERT INTO public.team_subscriptions (team_id, plan, status, trial_ends_at)
  VALUES (v_team, 'prueba', 'active', NULL)
  ON CONFLICT (team_id) DO NOTHING;

  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_team() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_my_team() TO authenticated;

COMMIT;


-- ============================================================================
-- 3. El otro sitio que abre suscripciones
-- ----------------------------------------------------------------------------
-- `enforce_client_limit` (0019) crea una suscripción cuando el equipo no tiene
-- ninguna —«el hueco de los equipos que no cuentan para nada es por donde se
-- acaba colando todo el mundo»—, y lo hacía con la misma cuenta atrás.
--
-- Se parchea con `regexp_replace` sobre su propio código en vez de reescribirla
-- entera, y es deliberado: el cuerpo de esa función tiene la lógica del tope de
-- clientes, que NO se está cambiando aquí. Copiarla para tocar una línea sería
-- crear una segunda versión que se desincroniza con la 0019 en cuanto alguien
-- toque cualquiera de las dos.
--
-- Si el texto no coincide, no se toca nada y se avisa: fallar en voz alta es
-- mejor que dejar la mitad del modelo cambiada.
-- ============================================================================

DO $$
DECLARE
  v_src  text;
  v_nuevo text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'enforce_client_limit';

  IF v_src IS NULL THEN
    RAISE WARNING 'No existe enforce_client_limit: nada que parchear.';
    RETURN;
  END IF;

  v_nuevo := replace(
    v_src,
    'VALUES (NEW.team_id, ''prueba'', ''trialing'', now() + interval ''14 days'')',
    'VALUES (NEW.team_id, ''prueba'', ''active'', NULL)'
  );

  IF v_nuevo = v_src THEN
    RAISE WARNING
      'enforce_client_limit no contiene el alta con cuenta atrás que esta migración esperaba. '
      'Compruébala a mano: si abre suscripciones con trial_ends_at, el modelo nuevo queda a medias.';
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.enforce_client_limit() RETURNS trigger '
    'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_nuevo
  );
END;
$$;


-- ============================================================================
-- 4. Los que ya estaban en la cuenta atrás salen de ella
-- ----------------------------------------------------------------------------
-- Mismo trato que los nuevos. Quitarle a alguien un plazo que ya tenía encima no
-- puede empeorarle la situación, así que no hace falta avisar antes — al revés
-- que el movimiento contrario, que sí lo necesita (`monetizacion.md` §3.7).
--
-- Solo `trialing`: quien esté en `past_due` o `canceled` tiene un problema de
-- cobro y no un plazo, y regalarle el plan gratis por esta vía sería perdonarle
-- una deuda por accidente.
-- ============================================================================

BEGIN;

UPDATE public.team_subscriptions
SET status = 'active', trial_ends_at = NULL
WHERE plan = 'prueba' AND status = 'trialing';

COMMIT;


-- ============================================================================
-- Lo que queda FUERA de esta migración, y hay que hacer a mano
-- ----------------------------------------------------------------------------
-- 1. LA LANDING. Dice «14 días con tres clientes. Sin tarjeta.» en dos sitios
--    (`src/components/marketing/LandingPage.jsx`). Mientras no se cambie, el
--    producto promete una cosa y hace otra — y la que hace es mejor.
--
-- 2. EL WEBHOOK, opcional. `billing-webhook` escribe `plan = 'prueba'` al
--    cancelarse una suscripción, que ahora significa «vuelve al plan gratuito»:
--    es justo lo que se quiere. Pero deja `status` como lo mande Stripe, así que
--    conviene comprobar que una cancelación real acaba en `active` y no en
--    `canceled` — con `canceled`, `team_write_allowed` bloquea la escritura y el
--    entrenador se queda en solo lectura en vez de caer al plan gratis.
--
-- 3. LOS `fundador`. Ilimitados y gratis por el injerto de la 0019. Ver
--    `docs/monetizacion.md` §3.7: es una conversación con cada persona.
--
-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT plan, label, max_clients, purchasable FROM public.plan_limits ORDER BY sort;
--   -- prueba/Gratis/3/false · solo/Solo/30/true · equipo/Equipo/∞/true · fundador/…
--
--   SELECT plan, status, trial_ends_at, count(*) FROM public.team_subscriptions
--   GROUP BY 1,2,3 ORDER BY 1;
--   -- ninguna fila con plan='prueba' y status='trialing'
--
-- Que un equipo nuevo nace sin cuenta atrás (con una sesión de entrenador):
--   SELECT public.ensure_my_team();
--   SELECT status, trial_ends_at FROM public.team_subscriptions
--   WHERE team_id = public.ensure_my_team();   -- active · NULL
-- ============================================================================
