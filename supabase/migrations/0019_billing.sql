-- ============================================================================
-- Suscripción del equipo: planes, prueba y límites
-- ----------------------------------------------------------------------------
-- ⚠️  Requiere `0006_teams.sql`. Se para sola si no está.
--
--     Aditiva y sin ventana de mantenimiento: **todos los equipos que ya existen
--     quedan en un plan sin límites**. Nadie se encuentra la aplicación capada de
--     un día para otro por aplicar esto. Ver «El injerto» más abajo.
--
-- ══ Qué resuelve ═══════════════════════════════════════════════════════════
--
-- Hoy cualquiera se registra y usa todo, ilimitado y gratis. Esto es la mitad de
-- servidor del modelo A de `docs/monetizacion.md`: dónde vive la suscripción, qué
-- da derecho a qué, y quién impone el límite.
--
-- Lo que NO trae: cobrar. Eso son las funciones `billing-checkout` y
-- `billing-webhook`, que van aparte. Hasta que existan, esta migración solo puede
-- describir el estado —y por eso todo el mundo entra en un plan sin límites: un
-- límite sin forma de pagar es una jaula sin puerta.
--
-- ══ Por qué la suscripción cuelga del EQUIPO ═══════════════════════════════
--
-- Ya estaba decidido en `docs/modelo-de-equipo.md`: «la suscripción y la
-- facturación son del equipo, no de una persona». Si colgara de `profiles`, un
-- equipo de cuatro tendría cuatro suscripciones sin relación entre sí, y el día
-- que el dueño cambia de cuenta el negocio se iría con él.
--
-- ══ Por qué el límite lo impone Postgres y no React ════════════════════════
--
-- Es el error clásico de todo esto, y es de seguridad, no de estilo. Esconder un
-- botón con `if (plan === 'pro')` no limita nada: la `anon key` está en el
-- navegador y el INSERT se puede hacer a mano en treinta segundos. El límite vive
-- en un disparador porque es el único sitio por el que pasan TODAS las altas,
-- vengan de donde vengan.
--
-- La interfaz explica el límite. Quien lo aplica es la base de datos. Es el mismo
-- principio que ya sostiene el resto del proyecto: RLS como única frontera de
-- autorización, sin lógica de permisos duplicada en JavaScript.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE EXCEPTION
      'Falta 0006_teams.sql. La suscripción cuelga del equipo, así que sin equipos no hay dónde ponerla.';
  END IF;
END $$;

BEGIN;

-- ── Los planes y lo que dan ────────────────────────────────────────────────
/*
  Los límites son una TABLA y no un `CASE` dentro de una función por dos motivos:

  · Cambiar un límite pasa a ser un UPDATE, no una migración. El día que «Solo»
    tenga que subir de 30 a 40 clientes, eso no debería requerir desplegar nada.
  · La aplicación lee la misma fila que impone el disparador. Si la pantalla
    dijera «30 clientes» desde una constante de JavaScript y la base comprobara
    otra cosa, tarde o temprano dirían cosas distintas.

  Los PRECIOS no están aquí a propósito: viven en Stripe, que es quien cobra.
  Tener el precio en dos sitios es tenerlo mal en uno de los dos.
*/
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan        text PRIMARY KEY,
  label       text NOT NULL,
  -- NULL es «sin límite», no «cero». Un cero significaría un plan que no deja
  -- tener ni un cliente, que no es ningún plan.
  max_clients integer,
  max_seats   integer,
  sort        integer NOT NULL DEFAULT 0
);

INSERT INTO public.plan_limits (plan, label, max_clients, max_seats, sort) VALUES
  ('prueba',   'Prueba',   3,    1,    0),
  ('solo',     'Solo',     30,   1,    1),
  ('equipo',   'Equipo',   NULL, NULL, 2),
  -- Para los que ya estaban. No se vende ni aparece en ninguna lista de precios.
  ('fundador', 'Fundador', NULL, NULL, 9)
ON CONFLICT (plan) DO NOTHING;

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

-- Los planes los lee todo el mundo: la pantalla que explica el límite los
-- necesita. No hay nada sensible en «Solo llega a 30 clientes».
DROP POLICY IF EXISTS "plans_read" ON public.plan_limits;
CREATE POLICY "plans_read" ON public.plan_limits FOR SELECT TO authenticated USING (true);


-- ── La suscripción ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_subscriptions (
  team_id                uuid PRIMARY KEY REFERENCES public.teams (id) ON DELETE CASCADE,

  plan                   text NOT NULL DEFAULT 'prueba' REFERENCES public.plan_limits (plan),

  -- El vocabulario es el de Stripe, y no uno propio: así el webhook copia el
  -- estado tal cual en vez de traducirlo, y una traducción es un sitio donde
  -- perder un caso.
  --   trialing | active | past_due | canceled | incomplete
  status                 text NOT NULL DEFAULT 'trialing',

  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text UNIQUE,

  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_subscriptions ENABLE ROW LEVEL SECURITY;

/*
  Se lee desde dentro del equipo y no se escribe desde ninguna parte.

  Sin política de INSERT/UPDATE/DELETE, la única forma de cambiar de plan es el
  webhook de Stripe, que entra con la `service_role key` y salta RLS. Es
  deliberado: si el dueño de un equipo pudiera escribir su propia fila, cambiar de
  plan sería un `update` desde la consola del navegador.
*/
DROP POLICY IF EXISTS "subscription_read" ON public.team_subscriptions;
CREATE POLICY "subscription_read" ON public.team_subscriptions
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.my_team_ids()));


-- ── El injerto: los que ya estaban ─────────────────────────────────────────
/*
  Todos los equipos existentes entran en `fundador`, activo y sin límites.

  La alternativa —meterlos en una prueba de catorce días— convertiría aplicar una
  migración en cortarle la aplicación a quien ya la estaba usando, con dos semanas
  de aviso que nadie ha pedido. Un producto que empieza a cobrar no se lo cobra
  retroactivamente a quien ya estaba dentro; se lo cobra a quien llega después.

  Pasarlos a un plan de pago, si algún día toca, es un UPDATE hablado con cada uno.
*/
INSERT INTO public.team_subscriptions (team_id, plan, status)
SELECT id, 'fundador', 'active' FROM public.teams
ON CONFLICT (team_id) DO NOTHING;

COMMIT;


BEGIN;

-- ── Qué plan tengo ─────────────────────────────────────────────────────────

/**
 * El estado del plan del equipo de quien pregunta.
 *
 * Devuelve TAMBIÉN el recuento de clientes y el límite, porque la pantalla que
 * dice «llevas 28 de 30» necesita las tres cosas y pedirlas por separado abre la
 * puerta a enseñar un recuento y un límite de momentos distintos.
 *
 * `activo` es la respuesta a «¿puede este equipo seguir trabajando?», ya resuelta
 * aquí: si la calculara cada pantalla, cada pantalla tendría su propia idea de qué
 * cuenta como prueba caducada.
 */
CREATE OR REPLACE FUNCTION public.my_team_plan()
RETURNS TABLE (
  team_id            uuid,
  plan               text,
  label              text,
  status             text,
  activo             boolean,
  clientes           integer,
  max_clientes       integer,
  trial_ends_at      timestamptz,
  current_period_end timestamptz
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
    s.current_period_end
  FROM public.team_subscriptions s
  JOIN public.plan_limits l ON l.plan = s.plan
  WHERE s.team_id IN (SELECT public.my_team_ids())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_team_plan() FROM public;
GRANT EXECUTE ON FUNCTION public.my_team_plan() TO authenticated;


-- ── El equipo de quien todavía no tiene ────────────────────────────────────

/**
 * Devuelve el equipo del entrenador, creándolo si hace falta.
 *
 * ── El agujero que tapa ─────────────────────────────────────────────────────
 * La `0006` rellenó un equipo para cada entrenador QUE YA EXISTÍA, y nada crea uno
 * para los que se registran después: la aplicación nunca inserta en `teams`. Con
 * la suscripción colgando del equipo, eso significaría que todo el que llegue a
 * partir de ahora —justo la gente que pagaría— no tiene de qué colgarla.
 *
 * ── Por qué aquí y no en `handle_new_user` ──────────────────────────────────
 * Porque ese disparador no está en el repositorio: vive solo en el proyecto de
 * Supabase, escrito a mano en su día. Reemplazarlo desde una migración sin poder
 * leer lo que hace hoy es la forma más rápida de romper el alta de usuarios.
 * Añadir una pieza al lado es reversible; sobrescribir a ciegas, no.
 *
 * Idempotente: llamarla mil veces deja un equipo.
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

  INSERT INTO public.team_members (team_id, profile_id, role) VALUES (v_team, auth.uid(), 'owner');

  -- La prueba empieza al crear el equipo, no al registrarse: es cuando de verdad
  -- empieza a usarse esto.
  INSERT INTO public.team_subscriptions (team_id, plan, status, trial_ends_at)
  VALUES (v_team, 'prueba', 'trialing', now() + interval '14 days');

  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_team() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_my_team() TO authenticated;

COMMIT;


BEGIN;

-- ── El límite ──────────────────────────────────────────────────────────────

/**
 * Antes de dar de alta un cliente: ¿cabe?
 *
 * ── Por qué también rellena `team_id` ───────────────────────────────────────
 * Porque si no, el límite se salta escribiendo `team_id: null` en el INSERT. Un
 * control que se elude omitiendo un campo no es un control. Así que cuando falta,
 * se deduce del equipo de quien inserta, y solo se deja pasar en blanco lo que no
 * viene de una sesión (una carga administrativa con la `service_role key`).
 *
 * ── Qué cuenta como cliente ─────────────────────────────────────────────────
 * Las fichas no archivadas. Hoy nada archiva —`clients.status` existe y la
 * aplicación no lo usa—, así que en la práctica son todas y la única forma de
 * bajar del límite es borrar. Está anotado en `docs/monetizacion.md` como lo
 * primero que hay que resolver antes de que el límite muerda de verdad.
 */
CREATE OR REPLACE FUNCTION public.enforce_client_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan  public.team_subscriptions;
  v_max   integer;
  v_count integer;
  v_label text;
BEGIN
  IF NEW.team_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.team_id := public.ensure_my_team();
  END IF;

  -- Sin equipo y sin sesión: es una carga administrativa. No hay a quién cobrarle
  -- y no hay nada que comprobar.
  IF NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_plan FROM public.team_subscriptions WHERE team_id = NEW.team_id;

  -- Un equipo sin fila de suscripción es un equipo creado por otra vía. Se le
  -- abre una prueba en vez de dejarle entrar sin plan: el hueco de «equipos que
  -- no cuentan para nada» es por donde se acaba colando todo el mundo.
  IF v_plan.team_id IS NULL THEN
    INSERT INTO public.team_subscriptions (team_id, plan, status, trial_ends_at)
    VALUES (NEW.team_id, 'prueba', 'trialing', now() + interval '14 days')
    RETURNING * INTO v_plan;
  END IF;

  IF v_plan.status = 'past_due' THEN
    RAISE EXCEPTION 'Hay un recibo pendiente. Actualiza el pago para volver a dar de alta clientes.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_plan.status NOT IN ('active', 'trialing') THEN
    RAISE EXCEPTION 'La suscripción no está activa. Elige un plan para seguir dando de alta clientes.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_plan.status = 'trialing' AND v_plan.trial_ends_at IS NOT NULL AND v_plan.trial_ends_at <= now() THEN
    RAISE EXCEPTION 'La prueba ha terminado. Elige un plan para seguir dando de alta clientes.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT max_clients, label INTO v_max, v_label FROM public.plan_limits WHERE plan = v_plan.plan;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.clients
  WHERE team_id = NEW.team_id AND status IS DISTINCT FROM 'archived';

  IF v_count >= v_max THEN
    -- El mensaje dice el número y el plan, porque «has alcanzado el límite» sin
    -- decir cuál obliga a ir a buscarlo a otra pantalla.
    RAISE EXCEPTION 'El plan % llega a % clientes y ya tienes %. Cambia de plan para añadir más.',
      v_label, v_max, v_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_plan_limit ON public.clients;
CREATE TRIGGER clients_plan_limit
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_limit();

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT * FROM public.my_team_plan();        -- como usuario, desde la app
--
--   SELECT t.name, s.plan, s.status, s.trial_ends_at,
--          (SELECT count(*) FROM public.clients c WHERE c.team_id = t.id) AS clientes
--   FROM public.teams t JOIN public.team_subscriptions s ON s.team_id = t.id;
--
-- Para probar el límite sin esperar a tener treinta clientes, baja uno a mano:
--
--   UPDATE public.plan_limits SET max_clients = 1 WHERE plan = 'fundador';
--   -- …intenta dar de alta dos clientes…
--   UPDATE public.plan_limits SET max_clients = NULL WHERE plan = 'fundador';
--
-- ── Lo que falta para que esto cobre ───────────────────────────────────────
-- · `billing-checkout` y `billing-webhook`: la cuenta de Stripe de la PLATAFORMA,
--   con su clave en el entorno de la función. No confundir con la integración de
--   Stripe que ya existe, que es de solo lectura y es la del entrenador.
-- · El modo solo lectura al impagar. Hoy `past_due` solo impide dar de alta; que
--   además congele la escritura es tocar las políticas de todas las tablas y va
--   en su propia migración.
-- · Archivar clientes, para que se pueda bajar del límite sin borrar el historial
--   de nadie.
-- ============================================================================
