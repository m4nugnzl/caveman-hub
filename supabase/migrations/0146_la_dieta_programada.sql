-- ============================================================================
-- La dieta programada: una dieta entera que empieza otro día
-- ----------------------------------------------------------------------------
-- Requiere 0124 (versiones de la dieta, `dia_de_quien_escribe`,
-- `versiones_en_pausa`) y 0143 (`client_interventions`). Se para sola si falta.
--
-- ⚠️  Crea UNA tabla (`nutrition_plan_programadas`), UNA columna
--     (`clients.zona_horaria`) y tres funciones, y reescribe UNA
--     (`dia_de_quien_escribe`) con una condición más al principio. No toca
--     ninguna fila existente. Sin el código nuevo no pasa nada: la tabla está
--     vacía y nadie la escribe.
--
-- ══ Qué es (letra e, E1) ═══════════════════════════════════════════════════
--
-- El entrenador prepara la dieta del 1 de octubre con el MISMO editor
-- (`useEditorDeDieta` sobre la copia), y el cliente no la ve hasta ese día.
-- Una fila por cambio: el cliente, el día que empieza y la dieta ENTERA como
-- quedará (las columnas de `nutrition_plans`, en jsonb).
--
-- ══ El día es el del CLIENTE ═══════════════════════════════════════════════
--
-- «Empieza el 1 de octubre» es el 1 de octubre donde vive él. Su zona se
-- guarda en `clients.zona_horaria` la primera vez que abre la aplicación (la
-- cabecera `x-zona-horaria`, 0124) y se actualiza si cambia. Hasta entonces,
-- la de Madrid, que es la del producto. `dia_del_cliente(id)` la lee; con ella
-- se decide qué es «mañana» al programar, qué toca aplicar y desde cuándo un
-- cambio a mano cuenta como posterior.
--
-- ══ Cómo se aplica ════════════════════════════════════════════════════════
--
-- `aplicar_dietas_programadas(p_client)` copia la dieta programada encima de
-- la de ahora el día que toca. La llaman dos:
--   · el latido de las 07:00 UTC (función edge `latido`), para todos;
--   · la aplicación al abrir un cliente —el entrenador o el propio cliente—,
--     solo para ese cliente. Si el latido falla, o el día del cliente aún no
--     había empezado a esa hora, se aplica en cuanto alguien abre la aplicación.
--
-- Se FECHA en su día aunque se aplique tarde: `dia_de_quien_escribe()` lee
-- `app.dia_de_la_pauta` si está puesto (solo dentro de esta función, con
-- `set_config(…, true)`: se va con la transacción), así que la versión de la
-- pauta (0124) queda el 1 de octubre y no el 3.
--
-- ══ Lo que NO pisa, y lo que sí ═══════════════════════════════════════════
--
-- Si la PAUTA de ahora (kcal, macros, tipos de día y su reparto, pasos,
-- cardio: `pauta_de_la_dieta`, 0124) se cambió a mano desde el día en que
-- empieza la programada, no se aplica: queda «no_aplicada» con el porqué.
-- Aplicarla borraría una decisión más nueva que ella. Se sabe sin mirar la
-- fila: ese cambio dejó una versión fechada ese día o después.
--
-- Si solo se tocaron menús (o notas) en ese tiempo, se aplica igual y la fila
-- guarda cuándo fue ese retoque (`retoque_del`): la tarjeta lo dice.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.dia_de_quien_escribe()') IS NULL
     OR to_regprocedure('public.versiones_en_pausa()') IS NULL
     OR to_regclass('public.nutrition_plan_versions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0124_la_dieta_se_fecha_al_guardarla.sql.';
  END IF;
  IF to_regclass('public.client_interventions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0143 (client_interventions).';
  END IF;
END $$;

BEGIN;

-- ── 1. La zona del cliente ──────────────────────────────────────────────────

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS zona_horaria text;

COMMENT ON COLUMN public.clients.zona_horaria IS
  'Zona IANA del cliente (la de su navegador, al abrir la aplicación). Nula = Europe/Madrid. Ver 0146.';

/* Hoy, donde vive el cliente. Una zona rota cae en la de Madrid. */
CREATE OR REPLACE FUNCTION public.dia_del_cliente(p_client uuid)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  zona text;
BEGIN
  SELECT c.zona_horaria INTO zona FROM public.clients c WHERE c.id = p_client;
  RETURN (now() AT TIME ZONE coalesce(nullif(zona, ''), 'Europe/Madrid'))::date;
EXCEPTION WHEN OTHERS THEN
  RETURN (now() AT TIME ZONE 'Europe/Madrid')::date;
END;
$$;

/* Cuándo empieza un día del cliente, como instante. */
CREATE OR REPLACE FUNCTION public.inicio_del_dia_del_cliente(p_client uuid, p_dia date)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  zona text;
BEGIN
  SELECT c.zona_horaria INTO zona FROM public.clients c WHERE c.id = p_client;
  RETURN p_dia::timestamp AT TIME ZONE coalesce(nullif(zona, ''), 'Europe/Madrid');
EXCEPTION WHEN OTHERS THEN
  RETURN p_dia::timestamp AT TIME ZONE 'Europe/Madrid';
END;
$$;

-- ── 2. La tabla ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nutrition_plan_programadas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  empieza      date NOT NULL,
  -- La dieta entera como quedará: las columnas de `nutrition_plans` (sin id,
  -- client_id ni updated_at). La escribe el editor; la lee `aplicar…`.
  dieta        jsonb NOT NULL CHECK (jsonb_typeof(dieta) = 'object'),
  motivo       text CHECK (motivo IS NULL OR char_length(btrim(motivo)) BETWEEN 1 AND 280),

  estado       text NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'aplicada', 'no_aplicada')),
  aplicada_el  timestamptz,
  por_que_no   text,
  -- Aplicada encima de un retoque de menú hecho después de que empezara.
  retoque_del  timestamptz,

  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nutrition_plan_programadas_un_cambio_por_dia UNIQUE (client_id, empieza),
  CONSTRAINT nutrition_plan_programadas_aplicada CHECK ((estado = 'aplicada') = (aplicada_el IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS nutrition_plan_programadas_pendientes
  ON public.nutrition_plan_programadas (empieza) WHERE estado = 'pendiente';

-- ── 3. Las reglas al escribir ───────────────────────────────────────────────
--
--   · Solo se prepara para MAÑANA o después (del cliente): para hoy, se
--     cambia la dieta.
--   · Solo se cambia lo pendiente: lo aplicado ya es historia (la versión).
--   · Doce pendientes por cliente como mucho.
--   · El estado no lo escribe la aplicación: solo `aplicar…`.
-- Restaurando una copia (`versiones_en_pausa`) nada de esto aplica.

CREATE OR REPLACE FUNCTION public.tg_dieta_programada()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.versiones_en_pausa() OR current_setting('app.aplicando_programadas', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado <> 'pendiente' THEN
      RAISE EXCEPTION 'Este cambio ya se aplicó (o no se pudo aplicar): ya no se edita.';
    END IF;
    NEW.id := OLD.id;
    NEW.client_id := OLD.client_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_by := auth.uid();
    NEW.created_at := now();
    IF (SELECT count(*) FROM public.nutrition_plan_programadas
         WHERE client_id = NEW.client_id AND estado = 'pendiente') >= 12 THEN
      RAISE EXCEPTION 'Ya hay 12 cambios de dieta programados para este cliente.';
    END IF;
  END IF;
  IF NEW.estado <> 'pendiente' OR NEW.aplicada_el IS NOT NULL
     OR NEW.por_que_no IS NOT NULL OR NEW.retoque_del IS NOT NULL THEN
    RAISE EXCEPTION 'El estado de un cambio programado no se escribe a mano.';
  END IF;
  IF NEW.empieza <= public.dia_del_cliente(NEW.client_id) THEN
    RAISE EXCEPTION 'Un cambio programado empieza mañana o después; para hoy, cambia la dieta.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_dieta_programada ON public.nutrition_plan_programadas;
CREATE TRIGGER tg_dieta_programada
  BEFORE INSERT OR UPDATE ON public.nutrition_plan_programadas
  FOR EACH ROW EXECUTE FUNCTION public.tg_dieta_programada();

-- ── 4. RLS: el equipo sí, el cliente no ─────────────────────────────────────
-- Lo que aún no ha empezado no es suyo todavía: `app_can_read_client` no
-- incluye al cliente (como `client_interventions`).

ALTER TABLE public.nutrition_plan_programadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programadas_read" ON public.nutrition_plan_programadas;
CREATE POLICY "programadas_read" ON public.nutrition_plan_programadas
  FOR SELECT TO authenticated USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "programadas_insert" ON public.nutrition_plan_programadas;
CREATE POLICY "programadas_insert" ON public.nutrition_plan_programadas
  FOR INSERT TO authenticated WITH CHECK (public.app_can_write_client(client_id));

DROP POLICY IF EXISTS "programadas_update" ON public.nutrition_plan_programadas;
CREATE POLICY "programadas_update" ON public.nutrition_plan_programadas
  FOR UPDATE TO authenticated
  USING (public.app_can_write_client(client_id) AND estado = 'pendiente')
  WITH CHECK (public.app_can_write_client(client_id));

DROP POLICY IF EXISTS "programadas_delete" ON public.nutrition_plan_programadas;
CREATE POLICY "programadas_delete" ON public.nutrition_plan_programadas
  FOR DELETE TO authenticated USING (public.app_can_write_client(client_id) AND estado = 'pendiente');

-- Sin GRANT las políticas no llegan a evaluarse (el 403 invisible, 0089).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_programadas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_programadas TO service_role;

-- ── 5. El día de la pauta, si alguien lo fija ───────────────────────────────

CREATE OR REPLACE FUNCTION public.dia_de_quien_escribe()
RETURNS date
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  zona text;
  fijado text;
BEGIN
  -- Una dieta programada se fecha en su día aunque se aplique tarde (0146).
  fijado := nullif(current_setting('app.dia_de_la_pauta', true), '');
  IF fijado IS NOT NULL THEN
    RETURN fijado::date;
  END IF;
  zona := nullif(current_setting('request.headers', true), '')::json ->> 'x-zona-horaria';
  RETURN (now() AT TIME ZONE coalesce(nullif(zona, ''), 'Europe/Madrid'))::date;
EXCEPTION WHEN OTHERS THEN
  RETURN (now() AT TIME ZONE 'Europe/Madrid')::date;
END;
$$;

-- ── 6. Aplicarlas ───────────────────────────────────────────────────────────
--
-- `p_client` nulo = todos (el latido, con la clave de servicio). Con un
-- cliente, quien llama tiene que poder leerlo: el entrenador o el propio
-- cliente al abrir su dieta. Solo aplica lo que YA toca (empieza <= hoy del
-- cliente) y nada más: no hay forma de adelantar un cambio desde aquí.
--
-- Cuando llama el propio cliente, de paso se apunta su zona (sección 1).
--
-- Cada cambio en su subtransacción: uno roto no para a los demás. Varios
-- vencidos del mismo cliente se aplican en orden, cada uno fechado en su día.

CREATE OR REPLACE FUNCTION public.aplicar_dietas_programadas(p_client uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p        public.nutrition_plan_programadas;
  v_actual   public.nutrition_plans;
  v_nueva    public.nutrition_plans;
  v_inicio   timestamptz;
  v_a_mano   date;
  v_retoque  timestamptz;
  v_zona     text;
  v_hechas   integer := 0;
  -- La clave de servicio o la consola. NO `current_user`: dentro de una
  -- función SECURITY DEFINER es su dueño (postgres) para cualquiera que llame.
  -- La consola es una sesión de postgres sin JWT; por la API la sesión es
  -- siempre `authenticator`.
  v_admin    boolean := coalesce(auth.role(), '') = 'service_role'
                        OR (coalesce(auth.role(), '') = '' AND session_user IN ('postgres', 'supabase_admin'));
BEGIN
  IF p_client IS NULL THEN
    IF NOT v_admin THEN
      RAISE EXCEPTION 'Sin permiso.';
    END IF;
  ELSIF v_admin THEN
    NULL;
  ELSIF public.app_is_client(p_client) THEN
    -- Su zona, la de su navegador. Solo una que Postgres conozca.
    BEGIN
      v_zona := nullif(current_setting('request.headers', true), '')::json ->> 'x-zona-horaria';
      IF v_zona IS NOT NULL AND v_zona <> '' AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_zona) THEN
        UPDATE public.clients SET zona_horaria = v_zona
        WHERE id = p_client AND zona_horaria IS DISTINCT FROM v_zona;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'aplicar_dietas_programadas: zona de %: %', p_client, SQLERRM;
    END;
  ELSIF NOT public.app_can_read_client(p_client) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente.';
  END IF;

  FOR v_p IN
    SELECT * FROM public.nutrition_plan_programadas p
    WHERE p.estado = 'pendiente'
      AND (p_client IS NULL OR p.client_id = p_client)
      AND p.empieza <= public.dia_del_cliente(p.client_id)
    ORDER BY p.client_id, p.empieza
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM set_config('app.aplicando_programadas', 'on', true);
      SELECT * INTO v_actual FROM public.nutrition_plans WHERE client_id = v_p.client_id FOR UPDATE;
      v_inicio := public.inicio_del_dia_del_cliente(v_p.client_id, v_p.empieza);

      -- La pauta se cambió a mano desde su día: no se pisa. Ese cambio dejó
      -- una versión fechada ese día o después (las de programadas anteriores
      -- llevan SU día, que es antes).
      SELECT min(v.dia) INTO v_a_mano
      FROM public.nutrition_plan_versions v
      WHERE v.client_id = v_p.client_id AND v.dia >= v_p.empieza;

      IF v_a_mano IS NOT NULL THEN
        UPDATE public.nutrition_plan_programadas
        SET estado = 'no_aplicada',
            por_que_no = 'La pauta se cambió a mano el ' || to_char(v_a_mano, 'DD/MM')
                         || ', después de que empezara este cambio.'
        WHERE id = v_p.id;
        CONTINUE;
      END IF;

      -- Solo menús (o notas) desde su día: se aplica, y se dice.
      v_retoque := NULL;
      IF v_actual.id IS NOT NULL AND v_actual.updated_at >= v_inicio
         AND NOT EXISTS (
           SELECT 1 FROM public.nutrition_plan_programadas o
           WHERE o.client_id = v_p.client_id AND o.estado = 'aplicada'
             AND o.aplicada_el >= v_actual.updated_at
         ) THEN
        v_retoque := v_actual.updated_at;
      END IF;

      PERFORM set_config('app.dia_de_la_pauta', v_p.empieza::text, true);

      -- Sin dieta todavía: se le crea la fila y se sigue como si la tuviera.
      IF v_actual.id IS NULL THEN
        INSERT INTO public.nutrition_plans (client_id) VALUES (v_p.client_id) RETURNING * INTO v_actual;
      END IF;

      -- La dieta nueva: la de la fila programada sobre la de ahora (lo que la
      -- programada no traiga, se queda como estaba).
      v_nueva := jsonb_populate_record(v_actual, v_p.dieta - 'id' - 'client_id' - 'updated_at');

      UPDATE public.nutrition_plans n
      SET (meals, type, target_kcals, protein_grams, carbs_grams, fats_grams, steps_goal,
             habits_notes, closed_meals, has_day_variants, closed_meals_training, closed_meals_rest,
             rest_target_kcals, rest_protein_grams, rest_carbs_grams, rest_fats_grams,
             cardio_goal, days, week, updated_at)
          = (v_nueva.meals, v_nueva.type, v_nueva.target_kcals, v_nueva.protein_grams,
             v_nueva.carbs_grams, v_nueva.fats_grams, v_nueva.steps_goal, v_nueva.habits_notes,
             v_nueva.closed_meals, v_nueva.has_day_variants, v_nueva.closed_meals_training,
             v_nueva.closed_meals_rest, v_nueva.rest_target_kcals, v_nueva.rest_protein_grams,
             v_nueva.rest_carbs_grams, v_nueva.rest_fats_grams, v_nueva.cardio_goal,
             v_nueva.days, v_nueva.week, now())
        WHERE n.id = v_actual.id;
      PERFORM set_config('app.dia_de_la_pauta', '', true);

      -- El motivo, a la versión de ese día (si la pauta cambió y la hay).
      IF v_p.motivo IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.nutrition_plan_versions
        WHERE client_id = v_p.client_id AND dia = v_p.empieza
      ) THEN
        INSERT INTO public.client_interventions (client_id, dieta_dia, motivo, created_by)
        VALUES (v_p.client_id, v_p.empieza, v_p.motivo, v_p.created_by)
        ON CONFLICT (client_id, dieta_dia) DO UPDATE
          SET motivo = coalesce(public.client_interventions.motivo, EXCLUDED.motivo);
      END IF;

      UPDATE public.nutrition_plan_programadas
      SET estado = 'aplicada', aplicada_el = now(), retoque_del = v_retoque
      WHERE id = v_p.id;
      v_hechas := v_hechas + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'aplicar_dietas_programadas(%): %', v_p.id, SQLERRM;
    END;
  END LOOP;

  PERFORM set_config('app.aplicando_programadas', '', true);
  PERFORM set_config('app.dia_de_la_pauta', '', true);
  RETURN v_hechas;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_dietas_programadas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_dietas_programadas(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tg_dieta_programada() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.dia_del_cliente(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dia_del_cliente(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.inicio_del_dia_del_cliente(uuid, date) FROM public, anon, authenticated;

COMMENT ON TABLE public.nutrition_plan_programadas IS
  'Dietas enteras que empiezan otro día. Las aplica aplicar_dietas_programadas (latido y app). Ver 0146.';

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT has_table_privilege('authenticated', 'public.nutrition_plan_programadas', 'INSERT');
--   -- true (y la política deja solo al equipo)
--
--   -- Una programada vencida se aplica y se fecha en su día:
--   SELECT public.aplicar_dietas_programadas(NULL);
--   SELECT dia FROM public.nutrition_plan_versions WHERE client_id = '<cliente>' ORDER BY dia DESC LIMIT 1;
--
-- Para deshacer:
--   DROP FUNCTION public.aplicar_dietas_programadas(uuid);
--   DROP TABLE public.nutrition_plan_programadas;   -- se lleva su disparador
--   DROP FUNCTION public.tg_dieta_programada();
--   DROP FUNCTION public.inicio_del_dia_del_cliente(uuid, date);
--   DROP FUNCTION public.dia_del_cliente(uuid);
--   ALTER TABLE public.clients DROP COLUMN zona_horaria;
--   y volver a correr `dia_de_quien_escribe` de la 0124.
-- ============================================================================
