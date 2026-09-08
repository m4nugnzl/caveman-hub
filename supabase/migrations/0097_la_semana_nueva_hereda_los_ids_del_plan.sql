-- ============================================================================
-- La semana nueva hereda los identificadores del plan del bloque
-- ----------------------------------------------------------------------------
-- REEMPLAZA `continue_program(uuid, jsonb)` con la MISMA firma y el mismo
-- retorno: no hay que borrar nada ni coordinar con el despliegue. Requiere la
-- 0086 (la columna `blocks`) y la 0087.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Antonio pulsa la semana siguiente, entrena, anota el primer peso y le sale
-- esto, igual que en la 0085:
--
--     El ejercicio ex_cbe0c96e-ca00-442b-8692-8d48d0196708
--     no está programado en Lower A
--
-- Y como entonces, el ejercicio SÍ está ahí —lo está viendo— pero con otro
-- identificador. Lo que ha cambiado es de dónde sale cada uno.
--
-- Desde que el plan vive en el bloque (0086), la pantalla del cliente no lee
-- `microcycles[].days[]`: lee las hojas del bloque con las excepciones de su
-- semana puestas (`resolvedMicrocycles`). En ese modelo el ejercicio es UNO
-- para todas las semanas del bloque, y su id es el mismo en todas.
--
-- `log_session_set` (0014), en cambio, sigue buscándolo en `days`. Y esta
-- función construía cada semana nueva con ids recién generados —aquí o
-- adoptados de los que proponía el navegador, que también los reasignaba—, o
-- sea con ids que no son los del plan y que por tanto no están en ninguna parte
-- que el cliente pueda nombrar. **Toda semana añadida después de migrar el plan
-- nacía imposible de registrar**, desde el primer número.
--
-- ── Y la regla que lo garantizaba era la que antes protegía ────────────────
-- La 0085 rechaza la propuesta del navegador cuando alguno de sus ids «ya está
-- en uso en otra semana». Era la comprobación correcta cuando cada semana tenía
-- su copia del plan: un id repetido solo podía venir de una copia rancia.
--
-- Con el plan en el bloque significa lo contrario. Los ids CORRECTOS son
-- exactamente los que ya están en uso en las otras semanas del bloque, así que
-- esa regla rechazaba siempre la propuesta buena y mandaba a generar ids
-- nuevos. La regla no era el arreglo: era el cerrojo.
--
-- ══ La solución ════════════════════════════════════════════════════════════
--
-- Se mira si el bloque que cubre la semana nueva tiene su plan dentro
-- (`blocks[].sessions`). Cuando lo tiene:
--
--   · los ids de ejercicio NO se generan NI se adoptan del navegador: se copian
--     del ejercicio correspondiente de la última semana, que es de donde ya se
--     copia la estructura entera. Como esa semana lleva los ids del plan, la
--     nueva los hereda;
--   · y un id repetido deja de invalidar la propuesta —repetirse es lo que
--     toca—, para que el id del MICROCICLO sí se siga adoptando.
--
-- ── Por qué el navegador deja de decidir esto, y no solo «además» ──────────
-- Porque esta migración tiene que arreglarlo **con el código que hay hoy
-- desplegado**, que reasigna los ids al montar la semana (`blankDays`). Si la
-- función siguiera adoptando lo que le propongan, una pestaña antigua —o una
-- que quedó abierta— volvería a escribir una semana imposible de registrar, y
-- el arreglo dependería de que todo el mundo recargue. La copia manda; la
-- propuesta ya no puede empeorar nada.
--
-- El id del MICROCICLO sí se sigue adoptando: es lo que reconoce un reenvío de
-- una llamada que llegó y cuya respuesta se perdió, y sin eso cada reintento
-- añadiría otra semana vacía (0085).
--
-- Ya no hay ningún camino por el que esta función escriba una semana con ids
-- que la pantalla no vaya a usar. Sin plan en el bloque no cambia nada: se
-- adoptan o se generan como siempre, y la comprobación de repetidos sigue en
-- pie.
--
-- ══ Lo que esto NO arregla ═════════════════════════════════════════════════
--
-- Las semanas que ya nacieron rotas. Eso son datos, no código, y se reparan con
-- `npm run reparar:ids` (`scripts/reparar-ids-del-plan.mjs`), que deja los
-- `days` de cada semana diciendo lo mismo que el plan de su bloque.
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
  */
  SELECT COALESCE(jsonb_agg(
    (day - 'exercises') || jsonb_build_object(
      'exercises', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', CASE
                      WHEN v_con_plan
                        THEN ex ->> 'id'
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
