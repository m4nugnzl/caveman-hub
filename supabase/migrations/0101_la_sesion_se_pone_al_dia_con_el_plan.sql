-- ============================================================================
-- La sesión se pone al día con el plan
-- ----------------------------------------------------------------------------
-- REEMPLAZA `log_session_set(...)` con la MISMA firma y el mismo retorno: no
-- hay que borrar nada ni coordinar con el despliegue. No toca tablas, ni
-- políticas, ni datos.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Un cliente anota 40 kg, ve que se ha equivocado, escribe 35 — y al recargar
-- vuelve a poner 40. Otro no consigue anotar nada en el ejercicio que su
-- entrenador le añadió el martes. Los dos síntomas son el mismo hecho:
--
--   **una sesión es una foto del plan del día que se sacó al crearla, y el plan
--   cambia por debajo.**
--
-- Desde que el plan vive en el bloque (`0086`) cambia además para TODAS las
-- semanas a la vez: el entrenador añade un ejercicio o una serie a la hoja y con
-- ese gesto toca también las semanas que su cliente ya tiene empezadas.
--
-- Esta función exigía que la sesión tuviera ya la entrada del ejercicio y que la
-- serie estuviera dentro de las que esa entrada trajo:
--
--     La sesión no tiene entrada para el ejercicio ex_…
--     La serie 3 no existe (hay 3)
--
-- El navegador, en cambio, crea la entrada que falte y alarga las series (ver
-- `withSessionSet` en `src/domain/sessions.js`). Así que el número aparece en
-- pantalla, no se guarda, y a la siguiente carga vuelve el valor viejo. Y como
-- el rechazo es `P0001` —definitivo— ni se reintenta ni se apunta: se pierde sin
-- ruido, exactamente igual que en la `0085` y la `0097`.
--
-- En el proyecto real, al escribir esto: seis clientes con sesiones a las que el
-- plan les ha añadido un ejercicio o una serie después de crearlas.
--
-- ══ El arreglo ═════════════════════════════════════════════════════════════
--
-- La sesión se pone al día con el plan al escribir, que es justo lo que hace el
-- navegador:
--
--   · si el ejercicio está en el plan del día y la sesión no tiene su entrada,
--     se añade con sus series en blanco;
--   · si la entrada trae menos series que el plan, se alarga hasta las del plan;
--   · y el nombre y el músculo se refrescan desde el plan, para que renombrar un
--     ejercicio no deje el nombre viejo en la analítica.
--
-- Lo anotado no se toca nunca: solo se AÑADE lo que el plan dice y la sesión
-- todavía no tenía.
--
-- ── Lo que sigue prohibido, que es lo que esta función viene a hacer ───────
-- El ejercicio tiene que estar en el plan de ese día, la serie tiene que caber
-- en las que el plan programa, el campo sigue siendo uno de los tres de
-- ejecución y el valor sigue siendo numérico o vacío. La guardia del índice
-- pasa a mirar el PLAN en vez de la foto: es la misma regla —«no te inventes una
-- quinta serie»— dicha contra la fuente que manda.
--
-- ══ Lo que esto NO arregla ═════════════════════════════════════════════════
--
-- Las entradas HUÉRFANAS: kilos anotados bajo el id de un ejercicio que el plan
-- ya no nombra (porque se cambió por otro, o porque su id cambió al migrar el
-- plan al bloque). Siguen guardadas y siguen sin verse en la hoja de ese día.
-- Eso son datos, no código, y se repara aparte.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.log_session_set(
  p_client      uuid,
  p_week        integer,
  p_session_id  text,
  p_date        date,
  p_day_name    text,
  p_exercise_id text,
  p_set_index   integer,
  p_field       text,
  p_value       text
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

  -- Un valor numérico o vacío. Sin esto, el jsonb aceptaría cualquier cadena y la
  -- analítica se encontraría texto donde espera números.
  IF p_value <> '' AND p_value !~ '^[0-9]+([.,][0-9]+)?$' THEN
    RAISE EXCEPTION 'Valor no numérico: %', p_value;
  END IF;

  IF p_set_index < 0 OR p_set_index > 50 THEN
    RAISE EXCEPTION 'Índice de serie fuera de rango: %', p_set_index;
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
    Antes esto era una excepción, y significaba que a un cliente con la sesión
    empezada no había forma de anotarle el ejercicio nuevo.
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

  -- Un solo campo de una sola serie. Es toda la escritura que concede la función.
  v_sets := jsonb_set(v_sets, ARRAY[p_set_index::text, p_field], to_jsonb(p_value));
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

REVOKE ALL ON FUNCTION public.log_session_set(uuid, integer, text, date, text, text, integer, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_session_set(uuid, integer, text, date, text, text, integer, text, text) TO authenticated;

COMMIT;
