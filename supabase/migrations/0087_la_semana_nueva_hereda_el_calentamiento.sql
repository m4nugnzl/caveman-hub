-- ============================================================================
-- La semana nueva hereda el calentamiento y la indicación de cada día
-- ----------------------------------------------------------------------------
-- REEMPLAZA `continue_program(uuid, jsonb)` con la MISMA firma y el mismo
-- retorno: no hay que borrar nada ni coordinar con el despliegue. Requiere la
-- 0085.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Al continuar el programa, la 0085 construía cada día nuevo con dos claves
-- —`dayName` y `exercises`— y tiraba el resto: el calentamiento propio del
-- día (`mobilityDrills`) y la indicación del entrenador (`coachNote`). Alex
-- tenía calentamiento en la sesión 1 y ninguno en la 2: no lo borró nadie, es
-- que la semana nueva nunca lo heredó.
--
-- Y el calentamiento ES de cada día: es lo que se hace antes de ESE entreno.
-- Copiar la estructura de la semana es copiarlo también.
--
-- ══ La solución ════════════════════════════════════════════════════════════
--
-- El día nuevo parte del día anterior ENTERO menos sus ejercicios, y encima se
-- ponen los ejercicios en blanco: `(day - 'exercises') || jsonb_build_object(
-- 'exercises', …)`. Así hereda todo lo que sea del día —hoy el nombre, el
-- calentamiento y la indicación; mañana lo que se añada— sin que haya que
-- volver a tocar esta función cada vez. Los ejercicios y sus series se
-- construyen exactamente igual que en la 0085.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.continue_program(
  p_client uuid,
  p_ids    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data      jsonb;
  v_last      jsonb;
  v_next      integer;
  v_days      jsonb;
  v_micro     jsonb;
  v_existente jsonb;
  v_micro_id  text;
  v_prop      jsonb;
  v_ids       text[];
  v_adopta    boolean := false;
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  SELECT microcycles INTO v_data FROM public.workout_data WHERE client_id = p_client FOR UPDATE;
  IF v_data IS NULL OR jsonb_array_length(v_data) = 0 THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_ids) = 'object' THEN
    v_micro_id := p_ids ->> 'id';
    v_prop     := p_ids -> 'days';
  END IF;

  -- El reintento, antes que nada (ver 0085).
  IF v_micro_id IS NOT NULL THEN
    SELECT elem INTO v_existente
    FROM jsonb_array_elements(v_data) AS t(elem)
    WHERE elem ->> 'id' = v_micro_id
    LIMIT 1;

    IF v_existente IS NOT NULL THEN
      RETURN v_existente;
    END IF;
  END IF;

  SELECT elem INTO v_last
  FROM jsonb_array_elements(v_data) AS t(elem)
  ORDER BY (elem ->> 'weekNumber')::integer DESC
  LIMIT 1;

  SELECT MAX((elem ->> 'weekNumber')::integer) + 1 INTO v_next
  FROM jsonb_array_elements(v_data) AS t(elem);

  IF v_next > 200 THEN
    RAISE EXCEPTION 'El programa ya tiene demasiadas semanas';
  END IF;

  -- ¿Encaja la propuesta de ids con la semana que se va a construir? (ver 0085)
  v_adopta := COALESCE(
    v_micro_id IS NOT NULL
      AND v_micro_id ~ '^[A-Za-z0-9_-]{3,64}$'
      AND jsonb_typeof(v_prop) = 'array'
      AND jsonb_array_length(v_prop) = jsonb_array_length(COALESCE(v_last -> 'days', '[]'::jsonb)),
    false
  );

  IF v_adopta THEN
    SELECT COALESCE(bool_and(
             v_prop -> (idx - 1)::int ->> 'dayName' IS NOT DISTINCT FROM day ->> 'dayName'
             AND jsonb_typeof(v_prop -> (idx - 1)::int -> 'exerciseIds') = 'array'
             AND jsonb_array_length(v_prop -> (idx - 1)::int -> 'exerciseIds')
                 = jsonb_array_length(COALESCE(day -> 'exercises', '[]'::jsonb))
           ), true)
      INTO v_adopta
    FROM jsonb_array_elements(COALESCE(v_last -> 'days', '[]'::jsonb)) WITH ORDINALITY AS d(day, idx);
  END IF;

  IF v_adopta THEN
    SELECT COALESCE(array_agg(x), '{}'::text[]) INTO v_ids
    FROM jsonb_array_elements(v_prop) AS d(day),
         jsonb_array_elements_text(COALESCE(day -> 'exerciseIds', '[]'::jsonb)) AS t(x);

    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS u(x) WHERE x !~ '^[A-Za-z0-9_-]{3,64}$') THEN
      v_adopta := false;
    ELSIF (SELECT count(DISTINCT x) FROM unnest(v_ids) AS u(x)) <> cardinality(v_ids) THEN
      v_adopta := false;
    ELSIF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_data) AS m(micro),
           jsonb_array_elements(COALESCE(micro -> 'days', '[]'::jsonb)) AS d(day),
           jsonb_array_elements(COALESCE(day -> 'exercises', '[]'::jsonb)) AS e(ex)
      WHERE ex ->> 'id' = ANY (v_ids)
    ) THEN
      v_adopta := false;
    END IF;
  END IF;

  /*
    Los días: el día anterior ENTERO menos sus ejercicios —nombre, calentamiento,
    indicación y lo que venga—, con los ejercicios en blanco encima.
  */
  SELECT COALESCE(jsonb_agg(
    (day - 'exercises') || jsonb_build_object(
      'exercises', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', CASE
                      WHEN v_adopta
                        THEN v_prop -> (d_idx - 1)::int -> 'exerciseIds' ->> (e_idx - 1)::int
                      ELSE 'ex_' || replace(gen_random_uuid()::text, '-', '')
                    END,
              'name',   ex ->> 'name',
              'muscle', ex ->> 'muscle',
              'sets', COALESCE(
                (
                  SELECT jsonb_agg(jsonb_build_object(
                    'kg', '', 'reps', '', 'rir', '',
                    'targetReps', COALESCE(st ->> 'targetReps', ''),
                    'targetRir',  COALESCE(st ->> 'targetRir', '')
                  ) ORDER BY s_idx)
                  FROM jsonb_array_elements(COALESCE(ex -> 'sets', '[]'::jsonb))
                       WITH ORDINALITY AS s(st, s_idx)
                ),
                '[]'::jsonb
              )
            ) ORDER BY e_idx
          )
          FROM jsonb_array_elements(COALESCE(day -> 'exercises', '[]'::jsonb))
               WITH ORDINALITY AS e(ex, e_idx)
        ),
        '[]'::jsonb
      )
    ) ORDER BY d_idx
  ), '[]'::jsonb) INTO v_days
  FROM jsonb_array_elements(COALESCE(v_last -> 'days', '[]'::jsonb)) WITH ORDINALITY AS d(day, d_idx);

  v_micro := jsonb_build_object(
    'id', CASE WHEN v_adopta THEN v_micro_id
               ELSE 'mc_' || replace(gen_random_uuid()::text, '-', '') END,
    'weekNumber', v_next,
    'sessionNumber', v_next,
    'date', current_date,
    'days', v_days,
    'sessions', '[]'::jsonb
  );

  UPDATE public.workout_data
  SET microcycles = v_data || jsonb_build_array(v_micro),
      updated_at = now()
  WHERE client_id = p_client;

  RETURN v_micro;
END;
$$;

REVOKE ALL ON FUNCTION public.continue_program(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.continue_program(uuid, jsonb) TO authenticated;

COMMIT;
