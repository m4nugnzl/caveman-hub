-- ============================================================================
-- La semana nueva hereda la indicación del ejercicio (y su superserie, su
-- remate, su descanso y el kilo pautado)
-- ----------------------------------------------------------------------------
-- REEMPLAZA `continue_program(uuid, jsonb)` con la MISMA firma y el mismo
-- retorno: no hay que borrar nada ni coordinar con el despliegue. Requiere la
-- 0097, de la que sale palabra por palabra salvo el trozo que se dice abajo.
--
-- ══ El fallo, y es el MISMO que arregló la 0087 un piso más arriba ══════════
--
-- La 0087 encontró que el día nuevo se construía con dos claves —`dayName` y
-- `exercises`— y tiraba el calentamiento y la indicación del día. Lo arregló
-- partiendo del día entero: `(day - 'exercises') || …`.
--
-- El EJERCICIO se quedó como estaba. Se sigue construyendo con una lista blanca
-- de cuatro claves —`id`, `name`, `muscle`, `sets`— y todo lo demás que cuelgue
-- de él desaparece al continuar el programa:
--
--   notes         la indicación del entrenador para ESE ejercicio.
--   enlazado      que va en superserie con el anterior.
--   tecnica       cómo se remata la última serie (bajada, rest-pause, myo-reps).
--   restSeconds   el descanso entre series.
--   alternatives  las alternativas si no tiene la máquina.
--   targetOptions lo que se pauta de él.
--
-- Y en la serie faltaba `targetKg`: se copiaban `targetReps` y `targetRir`, que
-- son las otras dos pautas, y el kilo pautado no. Vacío significa «a criterio
-- del cliente» y esa es la norma, pero cuando el entrenador SÍ lo escribe es
-- una pauta como las otras dos y tiene que viajar igual.
--
-- ══ Por qué importa más de lo que parece ═══════════════════════════════════
--
-- Continuar el programa no es un gesto raro del entrenador: es lo que hace EL
-- CLIENTE cada siete días, y hasta que no lo hace no tiene dónde apuntar. Así
-- que «Controla la bajada, 3 segundos» se escribía una vez y se borraba sola a
-- la semana siguiente, sin que nadie lo tocara y sin ningún aviso — el mismo
-- silencio del que hablaba la 0087.
--
-- Probado contra la base de datos local antes de escribir esto: llamando a la
-- función tal como estaba, el ejercicio de la semana nueva volvía con
-- `id, name, sets, muscle` y sin `notes`, y la serie sin `targetKg`.
--
-- ══ La solución ════════════════════════════════════════════════════════════
--
-- La de la 0087, aplicada al ejercicio y a la serie: partir del original ENTERO
-- y poner encima solo lo que de verdad cambia.
--
--   (ex - 'sets') || jsonb_build_object('id', …, 'sets', …)
--   (st - 'kg' - 'reps' - 'rir') || jsonb_build_object('kg','', 'reps','', 'rir','')
--
-- Así hereda todo lo que sea del ejercicio —hoy la indicación, la superserie, el
-- remate, el descanso; mañana lo que se añada— sin tener que volver a tocar esta
-- función cada vez que el modelo crezca. Lo que se vacía sigue siendo
-- exactamente lo mismo que antes: los números de lo que se levantó.
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
  v_blocks    jsonb;
  v_last      jsonb;
  v_next      integer;
  v_days      jsonb;
  v_micro     jsonb;
  v_existente jsonb;
  v_micro_id  text;
  v_prop      jsonb;
  v_ids       text[];
  v_adopta    boolean := false;
  v_con_plan  boolean := false;
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  SELECT microcycles, blocks INTO v_data, v_blocks
  FROM public.workout_data WHERE client_id = p_client FOR UPDATE;

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

  /*
    ── ¿El bloque de la semana nueva lleva su plan dentro? ──────────────────
    Es lo que decide si los ids se comparten entre semanas o son de cada una.
    Un bloque abierto no tiene `toWeek`, y entonces cubre todo lo que venga.
  */
  SELECT COALESCE(bool_or(jsonb_typeof(b -> 'sessions') = 'array'), false)
    INTO v_con_plan
  FROM jsonb_array_elements(COALESCE(v_blocks, '[]'::jsonb)) AS t(b)
  WHERE COALESCE((b ->> 'fromWeek')::integer, 1) <= v_next
    AND (b ->> 'toWeek' IS NULL OR (b ->> 'toWeek')::integer >= v_next);

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
      v_adopta := false;                                     -- formato
    ELSIF (SELECT count(DISTINCT x) FROM unnest(v_ids) AS u(x)) <> cardinality(v_ids) THEN
      v_adopta := false;                                     -- repetidos ENTRE SÍ
    ELSIF NOT v_con_plan AND EXISTS (
      /*
        Repetidos con OTRA semana. Solo invalida la propuesta cuando el plan es
        de cada microciclo: entonces un id repetido delata una copia rancia del
        navegador. Con el plan en el bloque, repetirse es justo lo correcto.
      */
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

    El id sale, por este orden: del ejercicio del que se está copiando cuando el
    plan es del bloque —el mismo ejercicio en todas sus semanas, el mismo id—;
    de la propuesta del navegador si se adoptó; y si no, de uno nuevo.

    Con plan, la propuesta ni se mira: el navegador desplegado hoy reasigna los
    ids y adoptarlos es exactamente lo que rompe la semana.

    ── Y el EJERCICIO entero menos sus series (0109) ────────────────────────
    Igual que el día. Lo que se pone encima es solo el id —que puede cambiar— y
    las series en blanco; el nombre, el músculo, la indicación, la superserie, el
    remate y el descanso viajan porque estaban ahí. Antes esto era una lista
    blanca de cuatro claves y todo lo demás se perdía en silencio.
  */
  SELECT COALESCE(jsonb_agg(
    (day - 'exercises') || jsonb_build_object(
      'exercises', COALESCE(
        (
          SELECT jsonb_agg(
            (ex - 'sets') || jsonb_build_object(
              'id', CASE
                      WHEN v_con_plan
                        THEN ex ->> 'id'
                      WHEN v_adopta
                        THEN v_prop -> (d_idx - 1)::int -> 'exerciseIds' ->> (e_idx - 1)::int
                      ELSE 'ex_' || replace(gen_random_uuid()::text, '-', '')
                    END,
              /*
                La serie ENTERA menos lo que se levantó. Así `targetKg` —y lo que
                se pacte mañana— viaja con `targetReps` y `targetRir`, que es lo
                que son las tres: pauta, no registro.
              */
              'sets', COALESCE(
                (
                  SELECT jsonb_agg(
                    (st - 'kg' - 'reps' - 'rir')
                      || jsonb_build_object('kg', '', 'reps', '', 'rir', '')
                    ORDER BY s_idx)
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
