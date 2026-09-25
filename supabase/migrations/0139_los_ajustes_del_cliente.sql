-- ============================================================================
-- Los ajustes del cliente y su nota de sesión, solo suyos
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql` (los permisos `app_*`),
-- `0013/0014` (`is_me`) y `0119_la_sesion_tiene_principio_y_fin.sql`
-- (`log_exercise_note`, que aquí se reemplaza). Si falta algo, se para ANTES
-- de tocar nada.
--
-- ⚠️  Crea UNA tabla y reemplaza UNA función. No toca ningún dato.
--     La función cambia de firma (dos parámetros NUEVOS, con valor por
--     defecto), así que la app vieja —que la llama con los cinco de siempre—
--     sigue funcionando igual. Se puede aplicar antes que el código.
--
-- ══ Qué es un ajuste (24 sep 2026) ═════════════════════════════════════════
--
-- El logbook del cliente tiene dos clases de nota por ejercicio:
--
--   · La NOTA DE SESIÓN («hoy el hombro iba justo»), que ya existía:
--     `entries[].clientNote` dentro del jsonb. Es de ESE entreno y no se
--     arrastra; el siguiente entreno con ese ejercicio la enseña en «La última
--     vez».
--   · El AJUSTE («banco al 3», «multipower»): lo que vale para ese ejercicio
--     siempre, en cualquier microciclo y en cualquier rutina. Es esta tabla.
--
-- ── Por qué el ejercicio va por su NOMBRE y no por un id ──────────────────
-- Porque en el programa no hay id de ejercicio que dure: al añadirlo a una
-- hoja se copia el nombre y el músculo de la librería o del catálogo, sin id,
-- y el `exerciseId` de las sesiones es el del hueco en la hoja, que cambia al
-- clonar un microciclo. Toda la app ya cruza el historial por nombre. La
-- clave es ese nombre normalizado (`claveDeEjercicio` en `domain/sessions.js`:
-- sin espacios de más y en minúsculas).
-- FASE FUTURA: guardar en cada ejercicio del plan el id de la librería o del
-- catálogo y migrar esta clave a ese id. Hasta entonces, renombrar un
-- ejercicio deja sus ajustes con el nombre viejo.
--
-- ══ Quién hace qué ═════════════════════════════════════════════════════════
--
--   · Crear y editar un ajuste: SOLO el propio cliente.
--   · Leerlo: el cliente y su entrenador (o su equipo, `app_can_read_client`).
--   · Borrarlo: el cliente, y su entrenador (`app_can_write_client`).
--   · La nota de sesión: SOLO el propio cliente. Hasta ahora
--     `log_exercise_note` dejaba escribir también al entrenador.
--
-- ── Y la nota ya no exige una serie ───────────────────────────────────────
-- La 0119 rechazaba la nota si el ejercicio no estaba aún en la sesión, y la
-- sesión solo nacía con la primera serie: lo escrito antes de empezar se
-- perdía. Ahora, con el día y la fecha (los dos parámetros nuevos), la función
-- crea la sesión y la entrada igual que `log_session_set`.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_is_client(uuid)') IS NULL
     OR to_regprocedure('public.app_can_read_client(uuid)') IS NULL
     OR to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan los permisos app_* de 0009.';
  END IF;
  IF to_regprocedure('public.is_me(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta `is_me` (migraciones 0013-0014).';
  END IF;
  IF to_regprocedure('public.log_exercise_note(uuid, integer, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0119_la_sesion_tiene_principio_y_fin.sql.';
  END IF;
END $$;

BEGIN;

-- ── 1. Los ajustes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exercise_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  -- El nombre del ejercicio normalizado. Ver la cabecera.
  exercise_key text NOT NULL
    CHECK (length(exercise_key) BETWEEN 1 AND 200 AND exercise_key = btrim(exercise_key)),
  -- Una etiqueta, no un texto: se pinta al lado del nombre.
  text         text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 80),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_settings_client_key
  ON public.exercise_settings (client_id, exercise_key);

-- `updated_at` lo pone la base, y lo que identifica la fila no se mueve.
CREATE OR REPLACE FUNCTION public.exercise_settings_sello()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id           := OLD.id;
    NEW.client_id    := OLD.client_id;
    NEW.exercise_key := OLD.exercise_key;
    NEW.created_at   := OLD.created_at;
    NEW.updated_at   := now();
  ELSE
    NEW.created_at := now();
    NEW.updated_at := now();
    -- Un tope por ejercicio: son etiquetas al lado de un nombre. Sin él, una
    -- consola podría llenar la tabla.
    IF (SELECT count(*) FROM public.exercise_settings
         WHERE client_id = NEW.client_id AND exercise_key = NEW.exercise_key) >= 12 THEN
      RAISE EXCEPTION 'Este ejercicio ya tiene 12 ajustes. Quita alguno antes de fijar otro.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exercise_settings_sello ON public.exercise_settings;
CREATE TRIGGER exercise_settings_sello
  BEFORE INSERT OR UPDATE ON public.exercise_settings
  FOR EACH ROW EXECUTE FUNCTION public.exercise_settings_sello();

-- ── 2. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.exercise_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_settings_read" ON public.exercise_settings;
CREATE POLICY "exercise_settings_read" ON public.exercise_settings
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

DROP POLICY IF EXISTS "exercise_settings_insert" ON public.exercise_settings;
CREATE POLICY "exercise_settings_insert" ON public.exercise_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_client(client_id));

DROP POLICY IF EXISTS "exercise_settings_update" ON public.exercise_settings;
CREATE POLICY "exercise_settings_update" ON public.exercise_settings
  FOR UPDATE TO authenticated
  USING (public.app_is_client(client_id))
  WITH CHECK (public.app_is_client(client_id));

DROP POLICY IF EXISTS "exercise_settings_delete" ON public.exercise_settings;
CREATE POLICY "exercise_settings_delete" ON public.exercise_settings
  FOR DELETE TO authenticated
  USING (public.app_is_client(client_id) OR public.app_can_write_client(client_id));

-- Sin GRANT, las políticas no bastan: el 403 sale y no se ve.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_settings TO authenticated;


-- ── 3. La nota de sesión: solo el cliente, y sin esperar a la primera serie ─
--
-- Cambia la firma (dos parámetros al final, con valor por defecto), y
-- `CREATE OR REPLACE` no puede cambiar una firma: se quita la de cinco y se
-- crea la de siete. Una llamada con los cinco nombres de siempre encuentra la
-- nueva.

DROP FUNCTION IF EXISTS public.log_exercise_note(uuid, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.log_exercise_note(
  p_client      uuid,
  p_week        integer,
  p_session_id  text,
  p_exercise_id text,
  p_note        text,
  p_date        date DEFAULT NULL,
  p_day_name    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data       jsonb;
  v_micro_idx  integer;
  v_micro      jsonb;
  v_day        jsonb;
  v_plan_ex    jsonb;
  v_sessions   jsonb;
  v_session    jsonb;
  v_sess_idx   integer;
  v_entries    jsonb;
  v_entry_idx  integer;
  v_session_id text := p_session_id;
BEGIN
  -- Solo el propio cliente. Su entrenador la lee, no la escribe.
  IF NOT public.is_me(p_client) THEN
    RAISE EXCEPTION 'Solo el cliente escribe su nota';
  END IF;

  IF p_note IS NULL THEN
    RAISE EXCEPTION 'No hay nada que guardar';
  END IF;

  IF length(p_note) > 2000 THEN
    RAISE EXCEPTION 'La nota es demasiado larga';
  END IF;

  SELECT microcycles INTO v_data FROM public.workout_data WHERE client_id = p_client FOR UPDATE;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Este cliente no tiene programa';
  END IF;

  SELECT idx - 1 INTO v_micro_idx
  FROM jsonb_array_elements(v_data) WITH ORDINALITY AS t(elem, idx)
  WHERE (elem ->> 'weekNumber')::integer = p_week
  LIMIT 1;

  IF v_micro_idx IS NULL THEN
    RAISE EXCEPTION 'No existe la semana %', p_week;
  END IF;

  v_micro    := v_data -> v_micro_idx;
  v_sessions := COALESCE(v_micro -> 'sessions', '[]'::jsonb);

  SELECT idx - 1, elem INTO v_sess_idx, v_session
  FROM jsonb_array_elements(v_sessions) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'id' = v_session_id
  LIMIT 1;

  -- El día del plan: el de la sesión si ya existe, el que llega si no. Que
  -- tenga que existir en el plan impide inventarse un día.
  SELECT elem INTO v_day
  FROM jsonb_array_elements(COALESCE(v_micro -> 'days', '[]'::jsonb)) AS t(elem)
  WHERE elem ->> 'dayName' = COALESCE(v_session ->> 'dayName', p_day_name)
  LIMIT 1;

  IF v_sess_idx IS NULL THEN
    /*
      Sin sesión todavía: se crea como la crea `log_session_set` (0119), con el
      id que llega —el navegador ya la está enseñando con él— y el día y la
      fecha de la pantalla. La app vieja no manda el día: para ella sigue
      siendo el error de siempre.
    */
    IF p_day_name IS NULL OR v_day IS NULL THEN
      RAISE EXCEPTION 'No hay ninguna sesión registrada con ese identificador';
    END IF;

    IF v_session_id IS NULL OR v_session_id !~ '^[A-Za-z0-9_-]{3,64}$' THEN
      RAISE EXCEPTION 'Identificador de sesión no válido';
    END IF;

    v_session := jsonb_build_object(
      'id', v_session_id,
      'date', COALESCE(p_date, current_date),
      'dayName', p_day_name,
      'startedAt', to_jsonb(now()),
      'notes', '',
      'entries', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'exerciseId', ex ->> 'id',
              'name',       ex ->> 'name',
              'muscle',     ex ->> 'muscle',
              'sets', COALESCE(
                (
                  SELECT jsonb_agg(jsonb_build_object('kg', '', 'reps', '', 'rir', ''))
                  FROM jsonb_array_elements(COALESCE(ex -> 'sets', '[]'::jsonb))
                ),
                '[]'::jsonb
              )
            )
          )
          FROM jsonb_array_elements(COALESCE(v_day -> 'exercises', '[]'::jsonb)) AS t(ex)
        ),
        '[]'::jsonb
      )
    );
    v_sessions := v_sessions || jsonb_build_array(v_session);
    v_sess_idx := jsonb_array_length(v_sessions) - 1;
  END IF;

  v_entries := COALESCE(v_session -> 'entries', '[]'::jsonb);

  SELECT idx - 1 INTO v_entry_idx
  FROM jsonb_array_elements(v_entries) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'exerciseId' = p_exercise_id
  LIMIT 1;

  IF v_entry_idx IS NULL THEN
    /* La sesión se creó antes de que el plan tuviera este ejercicio. Se añade
       si está programado ese día, con sus series en blanco: lo mismo que hace
       `log_session_set`. Un id cualquiera no entra. */
    SELECT elem INTO v_plan_ex
    FROM jsonb_array_elements(COALESCE(v_day -> 'exercises', '[]'::jsonb)) AS t(elem)
    WHERE elem ->> 'id' = p_exercise_id
    LIMIT 1;

    IF v_plan_ex IS NULL THEN
      RAISE EXCEPTION 'Ese ejercicio no está en esta sesión';
    END IF;

    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'exerciseId', p_exercise_id,
      'name',       v_plan_ex ->> 'name',
      'muscle',     v_plan_ex ->> 'muscle',
      'sets', COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object('kg', '', 'reps', '', 'rir', ''))
          FROM jsonb_array_elements(COALESCE(v_plan_ex -> 'sets', '[]'::jsonb))
        ),
        '[]'::jsonb
      )
    ));
    v_entry_idx := jsonb_array_length(v_entries) - 1;
  END IF;

  v_entries  := jsonb_set(v_entries, ARRAY[v_entry_idx::text, 'clientNote'], to_jsonb(p_note));
  v_session  := jsonb_set(v_session, '{entries}', v_entries);
  v_sessions := jsonb_set(v_sessions, ARRAY[v_sess_idx::text], v_session);
  v_micro    := jsonb_set(v_micro, '{sessions}', v_sessions);

  -- La frontera de las revisiones la pone el disparador de la 0137.
  UPDATE public.workout_data
  SET microcycles = jsonb_set(v_data, ARRAY[v_micro_idx::text], v_micro),
      updated_at  = now()
  WHERE client_id = p_client;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_exercise_note(uuid, integer, text, text, text, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_exercise_note(uuid, integer, text, text, text, date, text) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'exercise_settings';
--   -- cuatro: read, insert, update, delete
--
--   SELECT has_table_privilege('authenticated', 'public.exercise_settings', 'INSERT');
--   SELECT has_function_privilege('authenticated',
--     'public.log_exercise_note(uuid, integer, text, text, text, date, text)', 'EXECUTE');
--
-- Desde la app: entrando como entrenador, un INSERT en `exercise_settings`
-- devuelve un error de RLS; un DELETE de un ajuste de su cliente, no.
-- ============================================================================
