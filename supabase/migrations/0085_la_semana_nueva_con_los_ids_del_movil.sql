-- ============================================================================
-- La semana nueva se construye con los identificadores del móvil
-- ----------------------------------------------------------------------------
-- ⚠️  REEMPLAZA `continue_program`, y le cambia la FIRMA y el TIPO DE RETORNO:
--     de `(uuid) RETURNS integer` a `(uuid, jsonb) RETURNS jsonb`. Hay que
--     borrar la anterior, así que se aplica junto con el despliegue del código
--     —entre las dos, el botón de «añadir semana» del cliente falla con
--     PGRST202 y `dbErrors` lo dice: falta aplicar la 0085—.
--     No toca tablas, ni políticas, ni datos. Requiere la 0014.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- Un cliente pulsa «Semana 5», entrena, anota sus kilos y todos y cada uno de
-- ellos se rechazan con esto en pantalla:
--
--     No se guardó: El ejercicio ex_cf2bc4c5-5072-47d7-bc9a-188e124ce489
--     no está programado en EMPUJES
--
-- El ejercicio SÍ está programado en EMPUJES —lo está viendo—, pero con otro
-- identificador. Porque la semana se construye DOS VECES:
--
--   · en el navegador, con `blankDays()`, que pasa por `reidExercises()` y le
--     da a cada ejercicio un `crypto.randomUUID()`;
--   · aquí, con `gen_random_uuid()`.
--
-- Son dos semanas idénticas salvo en lo único que `log_session_set` mira para
-- localizar el ejercicio. La pantalla enseña los ids del móvil, la base de
-- datos guarda los suyos, y hasta la siguiente recarga completa **nada de lo
-- que esa persona anote en la semana que acaba de crear se llega a guardar**.
--
-- El comentario que había en `useWorkout.js` daba la divergencia por inocua
-- —«se recolocan en la próxima carga»— y lo es para la estructura. No para lo
-- que se escriba entre medias, que es un entrenamiento entero.
--
-- ── Y no se cura solo ───────────────────────────────────────────────────────
-- El registro rechazado queda apuntado en el navegador (`lib/pendingSaves`) y se
-- reenvía en CADA arranque. Como el rechazo es permanente, esa persona arrastra
-- «Cambios sin confirmar» y «No se guardó · Reintentar» para siempre, por un
-- ejercicio que después de recargar ya no existe en ninguna parte.
--
-- ══ La solución, y por qué esta y no otra ══════════════════════════════════
--
-- La alternativa era quitarle al navegador la construcción de la semana: llamar,
-- esperar y recargar. Más simple, y se descartó a propósito: **añadir la semana
-- sin conexión es una función del producto**, no un accidente. El gimnasio con
-- una barra de cobertura es el sitio donde esto se usa.
--
-- Así que el reparto se mantiene —el navegador la pinta al instante, el servidor
-- la construye de verdad— y lo que se arregla es que construyan LA MISMA. Los
-- identificadores los propone el móvil en `p_ids` y esta función los adopta si
-- encajan. Lo que NO se acepta sigue siendo lo de antes: la estructura. Los días,
-- los ejercicios, los nombres y el número de series se copian AQUÍ desde la
-- última semana, igual que hasta ahora. Un id es una etiqueta opaca sobre una
-- estructura que sigue decidiendo el servidor; «guárdame este programa» sigue sin
-- concederse.
--
-- ── Cuándo se rechaza la propuesta ─────────────────────────────────────────
-- Cuando no describe la misma semana que el servidor va a construir: distinto
-- número de días, distinto nombre de día, distinto número de ejercicios, un id
-- con formato raro, dos ids iguales, o un id que ya está en uso en otra semana de
-- esa misma persona. Eso pasa cuando la copia del navegador está vieja —el
-- entrenador cambió la rutina y el móvil aún no lo sabe—. Entonces se generan
-- aquí, como siempre, y la función DEVUELVE el microciclo que ha escrito para que
-- el navegador se quede con ese y no con el suyo.
--
-- Devolver el microciclo entero, y no el número de semana, es lo que cierra el
-- agujero por los dos lados: si los ids se aceptan la respuesta confirma lo que ya
-- había, y si no, lo corrige sin esperar a ninguna recarga.
--
-- ══ De regalo, deja de duplicar semanas ════════════════════════════════════
--
-- Con el id del microciclo puesto por quien llama, un reintento se reconoce: si
-- ese id ya está dentro, se devuelve tal cual y no se añade nada. Antes, una
-- petición que llegaba al servidor y cuya respuesta se perdía —el caso normal del
-- móvil con mala cobertura, y ahora también el del reenvío de lo que quedó
-- pendiente— añadía una semana vacía más en cada reintento.
--
-- ══ Y el RIR objetivo deja de perderse ═════════════════════════════════════
--
-- La copia de la 0014 conservaba `targetReps` y olvidaba `targetRir`. Los dos son
-- plan —el rango y el esfuerzo que puso el entrenador—, así que el que se olvidaba
-- desaparecía de la semana siguiente en la primera recarga, sin aviso.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.continue_program(uuid);

/**
 * Añade una semana con la estructura de la última y sin ningún número.
 *
 * `p_ids` es opcional y es una PROPUESTA de identificadores, con esta forma:
 *
 *     {
 *       "id": "mc_…",
 *       "days": [ { "dayName": "EMPUJES", "exerciseIds": ["ex_…", "ex_…"] } ]
 *     }
 *
 * Se adopta solo si describe exactamente la semana que se va a construir. Sin
 * ella —o si no encaja— los identificadores se generan aquí.
 *
 * Devuelve el microciclo escrito, o null si esa persona no tiene programa.
 */
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

  /*
    ── El reintento, antes que nada ──────────────────────────────────────────
    Si el microciclo que se propone YA está dentro, esta llamada es la repetición
    de una que llegó y cuya respuesta se perdió. Se devuelve el que hay: sin esto,
    cada reenvío añadiría otra semana vacía.
  */
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

  -- Un techo, para que nadie llene la fila llamando a esto en un bucle.
  IF v_next > 200 THEN
    RAISE EXCEPTION 'El programa ya tiene demasiadas semanas';
  END IF;

  -- ── ¿Encaja la propuesta con la semana que se va a construir? ────────────
  v_adopta := COALESCE(
    v_micro_id IS NOT NULL
      AND v_micro_id ~ '^[A-Za-z0-9_-]{3,64}$'
      AND jsonb_typeof(v_prop) = 'array'
      AND jsonb_array_length(v_prop) = jsonb_array_length(COALESCE(v_last -> 'days', '[]'::jsonb)),
    false
  );

  -- Día a día: el mismo nombre, en el mismo sitio, con tantos ejercicios como los
  -- que hay. Es lo que impide que una copia vieja del navegador ponga sus ids
  -- sobre una estructura que ya no es la suya.
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
      v_adopta := false;                                     -- repetidos entre sí
    ELSIF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_data) AS m(micro),
           jsonb_array_elements(COALESCE(micro -> 'days', '[]'::jsonb)) AS d(day),
           jsonb_array_elements(COALESCE(day -> 'exercises', '[]'::jsonb)) AS e(ex)
      WHERE ex ->> 'id' = ANY (v_ids)
    ) THEN
      v_adopta := false;                                     -- ya en uso en otra semana
    END IF;
  END IF;

  /*
    Los días, con la misma estructura y las series en blanco.

    `targetReps` y `targetRir` se conservan porque no son registros sino plan: son
    el rango y el esfuerzo que puso el entrenador, y siguen vigentes la semana
    siguiente. Lo que se vacía es lo que levanta la persona.
  */
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'dayName', day ->> 'dayName',
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
