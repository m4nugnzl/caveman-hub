-- ============================================================================
-- Que el cliente pueda anotar sus series sin poder reescribir su programa
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva, pero CAMBIA UN PERMISO: retira el UPDATE directo del cliente sobre
--     `workout_data`. Aplicar junto con el despliegue del código que usa la
--     función nueva, o el cliente se queda sin poder registrar nada.
--
-- ══ El problema ═════════════════════════════════════════════════════════════
--
-- El cliente necesita escribir en `workout_data` para anotar sus kilos. La política
-- que se lo permite es esta (migración 0002):
--
--     CREATE POLICY "workout_client_log" ON public.workout_data
--       FOR UPDATE TO authenticated
--       USING (public.is_me(client_id)) WITH CHECK (public.is_me(client_id));
--
-- Y RLS filtra FILAS, no columnas. La fila de `workout_data` contiene UN ÚNICO
-- jsonb `microcycles` con el programa completo: el plan, la estructura de cada día,
-- los ejercicios y las series. Así que ese permiso, que se concedió para «anotar 8
-- repeticiones», alcanza en realidad a:
--
--     UPDATE workout_data SET microcycles = '[]' WHERE client_id = <el suyo>;
--
-- Es decir: **el cliente puede borrar su programa entero desde la consola del
-- navegador**, o cambiarse los ejercicios, o inventarse doce semanas. No hace falta
-- mala intención: una pestaña vieja que guarde su copia en caché encima de la
-- actual produce el mismo resultado sin que nadie se dé cuenta.
--
-- Es el mismo problema exacto que ya se resolvió con `preferences` en la 0008, y por
-- el mismo motivo: guardar un objeto grande en una columna convierte «escribir un
-- campo» en «escribir todo lo que hay dentro».
--
-- ══ La solución ═════════════════════════════════════════════════════════════
--
-- Una función `SECURITY DEFINER` que recibe QUÉ serie y QUÉ valor, y escribe solo
-- eso. El permiso pasa de ser una fila a ser una operación:
--
--     · comprueba quién llama;
--     · no deja tocar `days` (el plan), solo `sessions` (la ejecución);
--     · valida el campo y el valor;
--     · devuelve el id de la sesión afectada.
--
-- El entrenador conserva su UPDATE directo: es su cliente y su programa, y ahí el
-- permiso amplio es el correcto.
-- ============================================================================

BEGIN;

/**
 * Registra un valor de una serie en la sesión de un día.
 *
 * `p_session_id` puede ser null: entonces se crea la sesión a partir del plan de
 * ese día, que es lo que ocurre la primera vez que el cliente escribe algo.
 *
 * ── Qué NO puede hacer, y es el punto ───────────────────────────────────────
 *   · no toca `days`: el plan es del entrenador;
 *   · no crea ni borra microciclos;
 *   · no cambia el número de series ni los ejercicios;
 *   · solo escribe en el microciclo y el día que se le indican.
 */
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

  -- El ejercicio tiene que estar programado en ese día, con ese id.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_day -> 'exercises', '[]'::jsonb)) AS t(elem)
    WHERE elem ->> 'id' = p_exercise_id
  ) THEN
    RAISE EXCEPTION 'El ejercicio % no está programado en %', p_exercise_id, p_day_name;
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

  IF v_entry_idx IS NULL THEN
    RAISE EXCEPTION 'La sesión no tiene entrada para el ejercicio %', p_exercise_id;
  END IF;

  v_entry := v_entries -> v_entry_idx;
  v_sets := COALESCE(v_entry -> 'sets', '[]'::jsonb);

  -- La serie tiene que existir dentro de la sesión: si el plan tiene 4 series, no
  -- se puede escribir en la quinta.
  IF p_set_index >= jsonb_array_length(v_sets) THEN
    RAISE EXCEPTION 'La serie % no existe (hay %)', p_set_index, jsonb_array_length(v_sets);
  END IF;

  -- Un solo campo de una sola serie. Es toda la escritura que concede la función.
  v_sets := jsonb_set(v_sets, ARRAY[p_set_index::text, p_field], to_jsonb(p_value));
  v_entry := jsonb_set(v_entry, '{sets}', v_sets);
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

REVOKE ALL ON FUNCTION public.log_session_set(uuid, integer, text, date, text, text, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_session_set(uuid, integer, text, date, text, text, integer, text, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Continuar el programa una semana más
-- ----------------------------------------------------------------------------
-- El cliente rellena su programa semana a semana, y al acabar la última necesita
-- otra. Sin esto se quedaría sin sitio donde anotar: o entrena sin registrar, o
-- escribe encima de la semana anterior y borra su propio histórico.
--
-- Es la segunda operación que el cliente hace sobre `workout_data`, y por eso
-- necesita su propia función: al retirarle el UPDATE directo, «añadir una semana»
-- dejaría de funcionar igual que «anotar una serie».
--
-- La estructura se copia AQUÍ, en el servidor, y no se acepta la que mande el
-- cliente. Es la diferencia entre «duplica la última semana en blanco» —que es lo
-- que se le concede— y «guárdame este programa», que es lo que no.
-- ============================================================================

BEGIN;

/**
 * Añade una semana con la estructura de la última y sin ningún número.
 *
 * ── Por qué se vacían los valores ───────────────────────────────────────────
 * Arrastrar los kilos de la semana anterior sería peor que no traer nada: los
 * números aparecerían rellenos sin que nadie los haya levantado, la analítica
 * contaría como entrenada una semana que no se ha hecho, y la adherencia daría
 * 100 % con cero series reales. `targetReps` sí se conserva: es el rango que puso el
 * entrenador, o sea plan, y sigue vigente.
 *
 * Devuelve el número de la semana nueva, o null si no había programa.
 */
CREATE OR REPLACE FUNCTION public.continue_program(p_client uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data     jsonb;
  v_last     jsonb;
  v_next     integer;
  v_days     jsonb;
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  SELECT microcycles INTO v_data FROM public.workout_data WHERE client_id = p_client FOR UPDATE;
  IF v_data IS NULL OR jsonb_array_length(v_data) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT elem INTO v_last
  FROM jsonb_array_elements(v_data) AS t(elem)
  ORDER BY (elem ->> 'weekNumber')::integer DESC
  LIMIT 1;

  SELECT MAX((elem ->> 'weekNumber')::integer) + 1 INTO v_next
  FROM jsonb_array_elements(v_data) AS t(elem);

  -- Un techo, para que nadie llene la fila llamando a esto en un bucle.
  IF v_next > 200 THEN
    RAISE EXCEPTION 'El programa ya tiene demasiadas semanas';
  END IF;

  -- Los días, con la misma estructura y las series en blanco.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'dayName', day ->> 'dayName',
      'exercises', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', 'ex_' || replace(gen_random_uuid()::text, '-', ''),
              'name', ex ->> 'name',
              'muscle', ex ->> 'muscle',
              'sets', COALESCE(
                (
                  SELECT jsonb_agg(jsonb_build_object(
                    'kg', '', 'reps', '', 'rir', '',
                    'targetReps', COALESCE(st ->> 'targetReps', '')
                  ))
                  FROM jsonb_array_elements(COALESCE(ex -> 'sets', '[]'::jsonb)) AS s(st)
                ),
                '[]'::jsonb
              )
            )
          )
          FROM jsonb_array_elements(COALESCE(day -> 'exercises', '[]'::jsonb)) AS e(ex)
        ),
        '[]'::jsonb
      )
    )
  ), '[]'::jsonb) INTO v_days
  FROM jsonb_array_elements(COALESCE(v_last -> 'days', '[]'::jsonb)) AS d(day);

  UPDATE public.workout_data
  SET microcycles = v_data || jsonb_build_array(jsonb_build_object(
        'id', 'mc_' || replace(gen_random_uuid()::text, '-', ''),
        'weekNumber', v_next,
        'sessionNumber', v_next,
        'date', current_date,
        'days', v_days,
        'sessions', '[]'::jsonb
      )),
      updated_at = now()
  WHERE client_id = p_client;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.continue_program(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.continue_program(uuid) TO authenticated;

COMMIT;


-- ============================================================================
-- Control de concurrencia
-- ----------------------------------------------------------------------------
-- `updated_at` se escribía y nadie lo comparaba nunca, así que dos escrituras
-- simultáneas sobre el mismo cliente se pisaban sin dejar rastro: la última en
-- llegar ganaba y la otra desaparecía. Con equipos —dos entrenadores sobre el mismo
-- cliente— o simplemente con dos pestañas abiertas, eso deja de ser improbable.
--
-- El caso concreto que ya podía ocurrir: el entrenador reordena los ejercicios del
-- lunes mientras el cliente anota sus kilos del lunes. Los dos leyeron el mismo
-- jsonb, los dos lo reescriben entero, y el segundo borra el trabajo del primero.
--
-- La función devuelve el `updated_at` que la fila tiene DESPUÉS de escribir, y
-- rechaza la escritura si la fila ha cambiado desde que el cliente la leyó. No es
-- un bloqueo: es detectarlo y poder avisar, que es lo que hoy no pasa.
-- ============================================================================

BEGIN;

/**
 * Guarda `microcycles` solo si nadie lo ha tocado desde `p_seen`.
 *
 * Devuelve el `updated_at` nuevo si se guardó, o `null` si hubo conflicto. El
 * `null` es la señal de «vuelve a leer y reintenta», y es preferible a lanzar
 * excepción: un conflicto es un caso previsto, no un error.
 *
 * `p_seen` a null significa «no me importa» (primera escritura, o una pantalla que
 * todavía no lleva la cuenta): se escribe sin comprobar.
 */
CREATE OR REPLACE FUNCTION public.save_workout_data(
  p_client      uuid,
  p_microcycles jsonb,
  p_seen        timestamptz DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current timestamptz;
  v_new     timestamptz;
BEGIN
  -- Aquí solo el entrenador: reescribir el jsonb completo es exactamente lo que el
  -- cliente NO debe poder hacer. Él usa `log_session_set`.
  IF NOT public.is_my_client(p_client) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  SELECT updated_at INTO v_current FROM public.workout_data WHERE client_id = p_client FOR UPDATE;

  IF v_current IS NOT NULL AND p_seen IS NOT NULL AND v_current > p_seen THEN
    RETURN NULL; -- conflicto: alguien ha escrito en medio
  END IF;

  v_new := now();

  INSERT INTO public.workout_data (client_id, microcycles, updated_at)
  VALUES (p_client, p_microcycles, v_new)
  ON CONFLICT (client_id) DO UPDATE
  SET microcycles = EXCLUDED.microcycles, updated_at = v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.save_workout_data(uuid, jsonb, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.save_workout_data(uuid, jsonb, timestamptz) TO authenticated;

COMMIT;


-- ============================================================================
-- Y ahora sí: se retira el UPDATE directo del cliente
-- ----------------------------------------------------------------------------
-- Este bloque va AL FINAL a propósito. Si se ejecutara antes de que la función
-- exista, el cliente se quedaría sin poder registrar nada entre una cosa y la otra.
--
-- El cliente conserva SELECT: necesita leer su rutina.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "workout_client_log" ON public.workout_data;

COMMENT ON TABLE public.workout_data IS
  'El cliente LEE su programa y escribe sus series con log_session_set() (0014). No '
  'tiene UPDATE directo: la fila contiene el programa completo en un jsonb, y como RLS '
  'filtra filas y no columnas, ese permiso le habría permitido reescribirlo entero.';

COMMIT;
