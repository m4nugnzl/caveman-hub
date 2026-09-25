-- ============================================================================
-- Atrasar las sesiones: la fecha planificada y el aviso al entrenador
-- ----------------------------------------------------------------------------
-- Requiere `0105_lo_mandado_es_una_accion.sql` (los permisos `app_*`) y
-- `0135_el_dia_de_la_sesion.sql` (`fecha_del_jsonb`).
--
-- ⚠️  Crea DOS tablas y cuatro funciones; no toca `workout_data` ni sus datos.
--     Se puede aplicar antes que el código. Sin ella y con el código nuevo, el
--     calendario del cliente enseña el plan por defecto y «Atrasar» falla con
--     su aviso; nada más se rompe.
--
-- ══ Qué es la fecha planificada (23 sep 2026) ══════════════════════════════
--
-- Cada sesión del microciclo (hoja × aparición) tiene dos fechas:
--
--   · La REAL, la de la sesión registrada en `workout_data` (0135). Solo existe
--     cuando se apunta la primera serie.
--   · La PLANIFICADA, que sale del patrón del bloque (Lun…Dom o D1…Dn) desde la
--     fecha del microciclo. Esa cuenta vive en la aplicación
--     (`domain/planDeSesiones.js`) y NO se guarda: aquí solo se guarda lo que
--     se aparta de ella, que es lo que ha atrasado el cliente.
--
-- Una sesión sin hacer no es ningún objeto del jsonb, así que su fecha
-- planificada no puede vivir dentro: vive en `session_plans`, con la clave de
-- la aparición (`hoja`, `vez`), que es la misma con la que la aplicación casa
-- cada sesión con su casilla (`aparicionesDelMicrociclo`).
--
-- ══ Qué puede hacer el cliente, y nada más ═════════════════════════════════
--
-- ATRASAR: desde un día de hoy en adelante que tiene una sesión sin hacer,
-- corre esa sesión y todas las siguientes sin hacer N días hacia delante. El
-- patrón lo define el entrenador; el cliente no lo rediseña, solo lo retrasa.
-- Cada atraso es UNA fila de `session_delays`, y esa fila es a la vez:
--
--   · el aviso al entrenador (su bandeja la lee con `seen_at` vacío, como lo
--     contestado de la 0108);
--   · lo que permite deshacerlo (`movidas` guarda cómo estaba cada fila);
--   · la marca «Atrasado por el cliente» en su Entreno.
--
-- DESHACER solo el último, y poco después: devuelve las fechas y BORRA la fila.
-- Como el entrenador no recibe nada en tiempo real, lo deshecho no le llega.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_is_client(uuid)') IS NULL
     OR to_regprocedure('public.app_can_read_client(uuid)') IS NULL
     OR to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan los permisos app_* de 0009.';
  END IF;
  IF to_regprocedure('public.fecha_del_jsonb(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0135_el_dia_de_la_sesion.sql.';
  END IF;
END $$;

BEGIN;

-- ── 1. Las fechas que se apartan del plan ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_plans (
  client_id    uuid    NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  week_number  integer NOT NULL,
  -- La hoja por su nombre, como la sesión (`dayName`): no hay id de hoja.
  -- Renombrarla se lleva la fila (ver el disparador de abajo).
  hoja         text    NOT NULL,
  -- Qué aparición de la hoja en el microciclo: una hoja puede caer dos días.
  vez          integer NOT NULL DEFAULT 0 CHECK (vez >= 0),
  planned_date date    NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, week_number, hoja, vez)
);

-- ── 2. Cada atraso, una fila ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_delays (
  -- Lo pone la aplicación: el «Deshacer» del aviso lo necesita antes de que
  -- vuelva la respuesta.
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  -- El día que queda libre, y cuántos se corre todo.
  desde       date NOT NULL,
  dias        integer NOT NULL CHECK (dias BETWEEN 1 AND 60),
  -- [{ semana, hoja, vez, antes, despues, previa }]. `previa` es la fila de
  -- `session_plans` de antes (null si iba por defecto): es lo que se devuelve.
  movidas     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Cuándo lo vio el entrenador: al abrir su Entreno o al descartarlo.
  seen_at     timestamptz
);

CREATE INDEX IF NOT EXISTS session_delays_client_idx
  ON public.session_delays (client_id, created_at DESC);

-- ── 3. RLS: leer los dos; escribir, solo por las funciones ──────────────────

ALTER TABLE public.session_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_delays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_plans_read" ON public.session_plans;
CREATE POLICY "session_plans_read" ON public.session_plans
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

DROP POLICY IF EXISTS "session_delays_read" ON public.session_delays;
CREATE POLICY "session_delays_read" ON public.session_delays
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

-- Sin política de escritura: nadie escribe estas tablas a mano. El cliente
-- solo atrasa o deshace, y el entrenador solo marca como visto.
GRANT SELECT ON public.session_plans  TO authenticated;
GRANT SELECT ON public.session_delays TO authenticated;

-- ── 4. ¿Está hecha esa aparición? ───────────────────────────────────────────
--
-- La i-ésima sesión de una hoja, por fecha, es su i-ésima aparición. Una
-- sesión solo existe si se apuntó alguna serie, así que «hecha» es que haya más
-- sesiones de la hoja en esa semana que la `vez` que se pregunta.
CREATE OR REPLACE FUNCTION public.aparicion_hecha(p_data jsonb, p_week integer, p_hoja text, p_vez integer)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT count(*) > p_vez
  FROM jsonb_array_elements(COALESCE(p_data, '[]'::jsonb)) AS t(m),
       jsonb_array_elements(COALESCE(m -> 'sessions', '[]'::jsonb)) AS u(s)
  WHERE (m ->> 'weekNumber')::integer = p_week
    AND s ->> 'dayName' = p_hoja;
$$;

-- ── 5. Atrasar ──────────────────────────────────────────────────────────────
--
-- Las movidas las calcula la aplicación (el plan por defecto sale del patrón
-- del bloque, que vive allí) y aquí se comprueba cada una:
--   · solo el propio cliente;
--   · desde hoy en adelante, nunca sobre días pasados (un día de holgura por
--     los husos, como la 0135);
--   · solo hacia delante, y todas los mismos días;
--   · solo apariciones sin hacer, de semanas que existen.
CREATE OR REPLACE FUNCTION public.atrasar_sesiones(
  p_id      uuid,
  p_client  uuid,
  p_desde   date,
  p_dias    integer,
  p_movidas jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data    jsonb;
  v_mov     jsonb;
  v_semana  integer;
  v_hoja    text;
  v_vez     integer;
  v_antes   date;
  v_despues date;
  v_previa  date;
  v_guardar jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.app_is_client(p_client) THEN
    RAISE EXCEPTION 'Solo puedes atrasar tus propias sesiones.';
  END IF;
  IF p_id IS NULL OR p_desde IS NULL OR p_dias IS NULL THEN
    RAISE EXCEPTION 'Falta el día o cuántos días atrasar.';
  END IF;
  IF p_dias < 1 OR p_dias > 60 THEN
    RAISE EXCEPTION 'Se puede atrasar entre 1 y 60 días.';
  END IF;
  IF p_desde < current_date - 1 THEN
    RAISE EXCEPTION 'Ese día ya ha pasado.';
  END IF;
  IF jsonb_typeof(p_movidas) <> 'array' OR jsonb_array_length(p_movidas) = 0 THEN
    RAISE EXCEPTION 'No hay ninguna sesión que atrasar desde ese día.';
  END IF;
  IF jsonb_array_length(p_movidas) > 60 THEN
    RAISE EXCEPTION 'Demasiadas sesiones de una vez.';
  END IF;

  SELECT microcycles INTO v_data FROM public.workout_data WHERE client_id = p_client FOR UPDATE;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'No tienes programa.';
  END IF;

  FOR v_mov IN SELECT * FROM jsonb_array_elements(p_movidas) LOOP
    v_semana  := (v_mov ->> 'semana')::integer;
    v_hoja    := v_mov ->> 'hoja';
    v_vez     := COALESCE((v_mov ->> 'vez')::integer, 0);
    v_antes   := (v_mov ->> 'antes')::date;
    v_despues := (v_mov ->> 'despues')::date;

    IF v_semana IS NULL OR v_hoja IS NULL OR v_antes IS NULL OR v_despues IS NULL THEN
      RAISE EXCEPTION 'Una de las sesiones viene incompleta.';
    END IF;
    IF v_antes < p_desde OR v_despues <> v_antes + p_dias THEN
      RAISE EXCEPTION 'Solo se atrasa hacia delante, desde ese día y todo lo mismo.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_data) AS t(m) WHERE (m ->> 'weekNumber')::integer = v_semana
    ) THEN
      RAISE EXCEPTION 'No existe la semana %.', v_semana;
    END IF;
    IF public.aparicion_hecha(v_data, v_semana, v_hoja, v_vez) THEN
      RAISE EXCEPTION 'La sesión % ya está hecha: no se atrasa.', v_hoja;
    END IF;

    SELECT planned_date INTO v_previa FROM public.session_plans
    WHERE client_id = p_client AND week_number = v_semana AND hoja = v_hoja AND vez = v_vez;

    INSERT INTO public.session_plans (client_id, week_number, hoja, vez, planned_date, updated_at)
    VALUES (p_client, v_semana, v_hoja, v_vez, v_despues, now())
    ON CONFLICT (client_id, week_number, hoja, vez)
    DO UPDATE SET planned_date = EXCLUDED.planned_date, updated_at = now();

    v_guardar := v_guardar || jsonb_build_array(jsonb_build_object(
      'semana', v_semana, 'hoja', v_hoja, 'vez', v_vez,
      'antes', v_antes, 'despues', v_despues, 'previa', v_previa
    ));
  END LOOP;

  INSERT INTO public.session_delays (id, client_id, desde, dias, movidas)
  VALUES (p_id, p_client, p_desde, p_dias, v_guardar);

  RETURN p_id;
END;
$$;

-- ── 6. Deshacer el último ───────────────────────────────────────────────────
--
-- Idempotente: si el atraso no llegó a guardarse (o ya se deshizo), no hay
-- nada que hacer y devuelve false. Solo el último del cliente y de las últimas
-- doce horas: es el «Deshacer» del aviso, no un historial que se rebobina.
CREATE OR REPLACE FUNCTION public.deshacer_atraso(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fila public.session_delays;
  v_mov  jsonb;
BEGIN
  SELECT * INTO v_fila FROM public.session_delays WHERE id = p_id FOR UPDATE;
  IF v_fila.id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.app_is_client(v_fila.client_id) THEN
    RAISE EXCEPTION 'Solo puedes deshacer tus propios atrasos.';
  END IF;
  IF v_fila.created_at < now() - interval '12 hours' THEN
    RAISE EXCEPTION 'Ese atraso ya no se puede deshacer.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.session_delays
    WHERE client_id = v_fila.client_id AND created_at > v_fila.created_at
  ) THEN
    RAISE EXCEPTION 'Solo se puede deshacer el último atraso.';
  END IF;

  FOR v_mov IN SELECT * FROM jsonb_array_elements(v_fila.movidas) LOOP
    IF v_mov ->> 'previa' IS NULL THEN
      DELETE FROM public.session_plans
      WHERE client_id = v_fila.client_id
        AND week_number = (v_mov ->> 'semana')::integer
        AND hoja = v_mov ->> 'hoja'
        AND vez = (v_mov ->> 'vez')::integer;
    ELSE
      UPDATE public.session_plans
      SET planned_date = (v_mov ->> 'previa')::date, updated_at = now()
      WHERE client_id = v_fila.client_id
        AND week_number = (v_mov ->> 'semana')::integer
        AND hoja = v_mov ->> 'hoja'
        AND vez = (v_mov ->> 'vez')::integer;
    END IF;
  END LOOP;

  DELETE FROM public.session_delays WHERE id = p_id;
  RETURN true;
END;
$$;

-- ── 7. El entrenador lo da por visto ────────────────────────────────────────
--
-- Al abrir el Entreno del cliente (todos) o al descartarlo en la bandeja.
-- Solo rellena `seen_at`: la marca en Entreno se queda.
CREATE OR REPLACE FUNCTION public.ver_atrasos(p_client uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.app_can_write_client(p_client) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;
  UPDATE public.session_delays SET seen_at = now()
  WHERE client_id = p_client AND seen_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── 8. Renombrar una hoja se lleva sus fechas ───────────────────────────────
--
-- Renombrar reescribe el bloque entero desde la aplicación, y hay varios
-- caminos que lo hacen. En vez de acordarse en cada uno, la base compara el
-- bloque de antes y el de después: la hoja que estaba en la posición `i` con un
-- nombre que ya no existe, y ahora tiene uno que no existía, es la misma hoja
-- renombrada. Solo en las semanas de ese bloque.
CREATE OR REPLACE FUNCTION public.tg_planes_siguen_a_la_hoja()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nuevo  jsonb;
  v_viejo  jsonb;
  v_desde  integer;
  v_hasta  integer;
  v_antes  text;
  v_ahora  text;
  i        integer;
BEGIN
  IF NEW.blocks IS NOT DISTINCT FROM OLD.blocks
     OR jsonb_typeof(NEW.blocks) <> 'array' OR jsonb_typeof(OLD.blocks) <> 'array' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.session_plans WHERE client_id = NEW.client_id) THEN
    RETURN NEW;
  END IF;

  FOR v_nuevo IN SELECT * FROM jsonb_array_elements(NEW.blocks) LOOP
    SELECT b INTO v_viejo FROM jsonb_array_elements(OLD.blocks) AS t(b)
    WHERE b ->> 'id' = v_nuevo ->> 'id' LIMIT 1;
    CONTINUE WHEN v_viejo IS NULL
      OR jsonb_typeof(v_nuevo -> 'sessions') <> 'array'
      OR jsonb_typeof(v_viejo -> 'sessions') <> 'array';

    v_desde := COALESCE((v_nuevo ->> 'fromWeek')::integer, 1);
    v_hasta := (v_nuevo ->> 'toWeek')::integer;

    FOR i IN 0 .. LEAST(jsonb_array_length(v_nuevo -> 'sessions'), jsonb_array_length(v_viejo -> 'sessions')) - 1 LOOP
      v_antes := v_viejo -> 'sessions' -> i ->> 'dayName';
      v_ahora := v_nuevo -> 'sessions' -> i ->> 'dayName';
      CONTINUE WHEN v_antes IS NULL OR v_ahora IS NULL OR v_antes = v_ahora;
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_nuevo -> 'sessions') AS s WHERE s ->> 'dayName' = v_antes
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_viejo -> 'sessions') AS s WHERE s ->> 'dayName' = v_ahora
      );

      UPDATE public.session_plans
      SET hoja = v_ahora, updated_at = now()
      WHERE client_id = NEW.client_id
        AND hoja = v_antes
        AND week_number >= v_desde
        AND (v_hasta IS NULL OR week_number <= v_hasta);
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_data_planes_siguen_a_la_hoja ON public.workout_data;
CREATE TRIGGER workout_data_planes_siguen_a_la_hoja
  AFTER UPDATE OF blocks ON public.workout_data
  FOR EACH ROW EXECUTE FUNCTION public.tg_planes_siguen_a_la_hoja();

REVOKE ALL ON FUNCTION public.aparicion_hecha(jsonb, integer, text, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.atrasar_sesiones(uuid, uuid, date, integer, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.deshacer_atraso(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.ver_atrasos(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.tg_planes_siguen_a_la_hoja() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aparicion_hecha(jsonb, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atrasar_sesiones(uuid, uuid, date, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_atraso(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ver_atrasos(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT to_regclass('public.session_plans'), to_regclass('public.session_delays');
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('atrasar_sesiones', 'deshacer_atraso', 'ver_atrasos', 'aparicion_hecha');
--
-- Desde la aplicación, como cliente: Hoy → despliega el calendario → un día
-- con sesión sin hacer → «Atrasar». Su entrenador lo ve en Hoy, en la bandeja,
-- y en su Entreno el día libre sale «Atrasado por el cliente».
-- ============================================================================
