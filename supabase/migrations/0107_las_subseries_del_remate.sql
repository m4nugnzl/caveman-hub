-- ============================================================================
-- Las subseries de un remate
-- ----------------------------------------------------------------------------
-- Una bajada doble son dos tandas más colgando de la última serie, y cada una
-- tiene sus kilos y sus repeticiones. Hasta ahora un remate era UNA PALABRA en
-- el plan —`tecnica: 'bajada'`, sin un solo número— así que no había nada que
-- registrar y esta función no necesitaba saber de ellas.
--
-- Desde que la técnica lleva sus cifras (`TECNICAS` en `src/domain/training.js`)
-- el plan dice «bajada ×2, −20 %», y quien entrena tiene dos renglones que
-- rellenar debajo de esa serie. Viven en `sets[i].extras[j]`, con `kg` y `reps`,
-- y esta función necesita poder escribir ahí.
--
-- ══ Por qué NO son series del array ════════════════════════════════════════
--
-- Meterlas en `sets` habría salido gratis aquí —el índice ya existe— y habría
-- salido caro donde importa: una serie con bajada seguiría contando como tres
-- series de volumen, y el volumen por grupo muscular es la cifra con la que se
-- decide el microciclo siguiente. Una bajada es UNA serie con un remate, no
-- tres series.
--
-- ══ Lo que sigue prohibido ═════════════════════════════════════════════════
--
--   · Solo `kg` y `reps`. Una bajada se lleva al fallo: no hay RIR que anotar.
--   · Solo donde el PLAN pauta un remate. Sin `tecnica` en esa serie del plan
--     no hay subseries que registrar, y aceptar el índice sería dejar escribir
--     datos que ninguna pantalla enseña.
--   · Un tope de diez, que es más de lo que cualquier técnica de esta casa
--     produce (`max: 8` en la de myo-reps).
--
-- REEMPLAZA la función: se borra la firma de nueve argumentos y se crea la de
-- diez con el último por defecto en NULL, así que un navegador que todavía
-- llame sin él sigue funcionando y no hay dos funciones que puedan confundirse.
-- No toca tablas, ni políticas, ni datos.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.log_session_set(uuid, integer, text, date, text, text, integer, text, text);

CREATE FUNCTION public.log_session_set(
  p_client      uuid,
  p_week        integer,
  p_session_id  text,
  p_date        date,
  p_day_name    text,
  p_exercise_id text,
  p_set_index   integer,
  p_field       text,
  p_value       text,
  p_sub_index   integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data       jsonb;
  v_micro_idx  integer;
  v_micro      jsonb;
  v_day        jsonb;
  v_plan_ex    jsonb;
  v_plan_sets  integer;
  v_sessions   jsonb;
  v_session    jsonb;
  v_sess_idx   integer;
  v_entries    jsonb;
  v_entry      jsonb;
  v_entry_idx  integer;
  v_sets       jsonb;
  v_extras     jsonb;
  v_session_id text := p_session_id;
BEGIN
  -- Autorización: el propio cliente o su entrenador. Las dos, porque los dos
  -- registran series y no hay motivo para dos caminos distintos.
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  -- Solo estos tres campos. `targetReps` NO está: es el objetivo que pone el
  -- entrenador, o sea plan, y el cliente no lo decide.
  IF p_field NOT IN ('kg', 'reps', 'rir') THEN
    RAISE EXCEPTION 'Campo no permitido: %', p_field;
  END IF;

  -- En una subserie, además, no hay RIR: se va al fallo.
  IF p_sub_index IS NOT NULL AND p_field NOT IN ('kg', 'reps') THEN
    RAISE EXCEPTION 'Campo no permitido en una subserie: %', p_field;
  END IF;

  -- Un valor numérico o vacío. Sin esto, el jsonb aceptaría cualquier cadena y la
  -- analítica se encontraría texto donde espera números.
  IF p_value <> '' AND p_value !~ '^[0-9]+([.,][0-9]+)?$' THEN
    RAISE EXCEPTION 'Valor no numérico: %', p_value;
  END IF;

  IF p_set_index < 0 OR p_set_index > 50 THEN
    RAISE EXCEPTION 'Índice de serie fuera de rango: %', p_set_index;
  END IF;

  IF p_sub_index IS NOT NULL AND (p_sub_index < 0 OR p_sub_index > 9) THEN
    RAISE EXCEPTION 'Índice de subserie fuera de rango: %', p_sub_index;
  END IF;

  SELECT microcycles INTO v_data FROM public.workout_data WHERE client_id = p_client FOR UPDATE;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Este cliente no tiene programa';
  END IF;

  -- El microciclo, por número de semana.
  SELECT idx - 1 INTO v_micro_idx
  FROM jsonb_array_elements(v_data) WITH ORDINALITY AS t(elem, idx)
  WHERE (elem ->> 'weekNumber')::integer = p_week
  LIMIT 1;

  IF v_micro_idx IS NULL THEN
    RAISE EXCEPTION 'No existe la semana %', p_week;
  END IF;

  v_micro := v_data -> v_micro_idx;

  -- El día, en el PLAN. Que tenga que existir ahí es lo que impide inventarse un
  -- día nuevo pasando un nombre cualquiera.
  SELECT elem INTO v_day
  FROM jsonb_array_elements(COALESCE(v_micro -> 'days', '[]'::jsonb)) AS t(elem)
  WHERE elem ->> 'dayName' = p_day_name
  LIMIT 1;

  IF v_day IS NULL THEN
    RAISE EXCEPTION 'El día % no está en el plan de la semana %', p_day_name, p_week;
  END IF;

  /*
    El ejercicio tiene que estar programado en ese día, con ese id. Y se guarda
    ENTERO, no solo se comprueba: su nombre, su músculo y cuántas series tiene
    son lo que hace falta para poder añadirlo a una sesión que se creó antes de
    que el plan lo tuviera.
  */
  SELECT elem INTO v_plan_ex
  FROM jsonb_array_elements(COALESCE(v_day -> 'exercises', '[]'::jsonb)) AS t(elem)
  WHERE elem ->> 'id' = p_exercise_id
  LIMIT 1;

  IF v_plan_ex IS NULL THEN
    RAISE EXCEPTION 'El ejercicio % no está programado en %', p_exercise_id, p_day_name;
  END IF;

  v_plan_sets := jsonb_array_length(COALESCE(v_plan_ex -> 'sets', '[]'::jsonb));

  /*
    Y una subserie solo existe donde el plan pauta un remate. Es la misma regla
    que impide escribir en la quinta serie de una hoja de cuatro, aplicada un
    nivel más abajo: sin `tecnica` en esa serie del plan, no hay bajada que
    anotar.
  */
  IF p_sub_index IS NOT NULL
     AND (v_plan_ex -> 'sets' -> p_set_index -> 'tecnica') IS NULL THEN
    RAISE EXCEPTION 'La serie % de % no lleva ningún remate pautado', p_set_index, p_exercise_id;
  END IF;

  v_sessions := COALESCE(v_micro -> 'sessions', '[]'::jsonb);

  SELECT idx - 1 INTO v_sess_idx
  FROM jsonb_array_elements(v_sessions) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'id' = v_session_id
  LIMIT 1;

  IF v_sess_idx IS NULL THEN
    /*
      Sesión nueva a partir del plan: mismos ejercicios, mismas series, vacías.

      ── Se respeta el id que llega, y eso evita una carrera ──────────────────
      El cliente genera el id de la sesión en el navegador y lo manda con CADA
      campo que escribe. Si esta función inventara el suyo, escribir «kg» y «reps»
      de la misma serie —dos llamadas casi simultáneas, ninguna de las dos con la
      sesión creada todavía— produciría DOS sesiones del mismo día con la mitad de
      los datos en cada una. La analítica las contaría como dos entrenos.

      Solo se genera uno si no llega ninguno.
    */
    v_session_id := COALESCE(NULLIF(p_session_id, ''), 'ses_' || replace(gen_random_uuid()::text, '-', ''));

    IF v_session_id !~ '^[A-Za-z0-9_-]{3,64}$' THEN
      RAISE EXCEPTION 'Identificador de sesión no válido';
    END IF;

    v_session := jsonb_build_object(
      'id', v_session_id,
      'date', p_date,
      'dayName', p_day_name,
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
  ELSE
    v_session := v_sessions -> v_sess_idx;
  END IF;

  v_entries := COALESCE(v_session -> 'entries', '[]'::jsonb);

  SELECT idx - 1 INTO v_entry_idx
  FROM jsonb_array_elements(v_entries) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'exerciseId' = p_exercise_id
  LIMIT 1;

  /*
    ── La sesión se pone al día con el plan ──────────────────────────────────
    El ejercicio está en el plan de este día —comprobado arriba— y esta sesión
    no lo tiene porque se creó antes de que se lo añadieran. Se añade aquí, con
    sus series en blanco, que es lo mismo que hace el navegador al escribir.
  */
  IF v_entry_idx IS NULL THEN
    v_entry := jsonb_build_object(
      'exerciseId', p_exercise_id,
      'name',       v_plan_ex ->> 'name',
      'muscle',     v_plan_ex ->> 'muscle',
      'sets',       '[]'::jsonb
    );
    v_entries := v_entries || jsonb_build_array(v_entry);
    v_entry_idx := jsonb_array_length(v_entries) - 1;
  ELSE
    v_entry := v_entries -> v_entry_idx;
  END IF;

  v_sets := COALESCE(v_entry -> 'sets', '[]'::jsonb);

  /*
    Y las series que el plan tiene de más. Añadir una cuarta serie a la hoja
    dejaba al cliente con «La serie 3 no existe (hay 3)» para el resto del
    bloque. Solo se AÑADEN vacías al final: lo anotado no se toca.
  */
  WHILE jsonb_array_length(v_sets) < v_plan_sets LOOP
    v_sets := v_sets || jsonb_build_array(jsonb_build_object('kg', '', 'reps', '', 'rir', ''));
  END LOOP;

  -- La serie tiene que caber en las que el plan programa: si la hoja tiene 4
  -- series, no se puede escribir en la quinta.
  IF p_set_index >= jsonb_array_length(v_sets) THEN
    RAISE EXCEPTION 'La serie % no existe (hay %)', p_set_index, jsonb_array_length(v_sets);
  END IF;

  IF p_sub_index IS NULL THEN
    -- Un solo campo de una sola serie. Es toda la escritura que concede la función.
    v_sets := jsonb_set(v_sets, ARRAY[p_set_index::text, p_field], to_jsonb(p_value));
  ELSE
    -- O de una sola SUBSERIE, alargando las que falten hasta ella. Igual que con
    -- las series: solo se añaden vacías, lo anotado no se toca.
    v_extras := COALESCE(v_sets -> p_set_index -> 'extras', '[]'::jsonb);
    WHILE jsonb_array_length(v_extras) <= p_sub_index LOOP
      v_extras := v_extras || jsonb_build_array(jsonb_build_object('kg', '', 'reps', ''));
    END LOOP;
    v_extras := jsonb_set(v_extras, ARRAY[p_sub_index::text, p_field], to_jsonb(p_value));
    v_sets := jsonb_set(v_sets, ARRAY[p_set_index::text, 'extras'], v_extras);
  END IF;

  v_entry := jsonb_set(v_entry, '{sets}', v_sets);

  /* El nombre y el músculo se refrescan desde el plan, igual que en el
     navegador: si el entrenador renombró el ejercicio, la sesión guardaría el
     nombre viejo y la analítica lo contaría como otro distinto. */
  v_entry := v_entry || jsonb_build_object(
    'name',   v_plan_ex ->> 'name',
    'muscle', v_plan_ex ->> 'muscle'
  );

  v_entries := jsonb_set(v_entries, ARRAY[v_entry_idx::text], v_entry);
  v_session := jsonb_set(v_session, '{entries}', v_entries);
  v_sessions := jsonb_set(v_sessions, ARRAY[v_sess_idx::text], v_session);
  v_micro := jsonb_set(v_micro, '{sessions}', v_sessions);

  UPDATE public.workout_data
  SET microcycles = jsonb_set(v_data, ARRAY[v_micro_idx::text], v_micro),
      updated_at = now()
  WHERE client_id = p_client;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_session_set(uuid, integer, text, date, text, text, integer, text, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_session_set(uuid, integer, text, date, text, text, integer, text, text, integer) TO authenticated;

COMMIT;
