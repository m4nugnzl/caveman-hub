-- ============================================================================
-- Que el cliente pueda contar cómo le ha ido
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin cambios de permisos: no toca ninguna tabla, ninguna columna
--     ni ninguna política. Solo añade una función.
--
--     La aplicación funciona SIN esta migración, como con la 0009: el entrenador
--     puede dejar sus notas y montar el calentamiento —eso lo escribe él, que
--     tiene UPDATE directo—, pero al cliente le aparece el bloque de feedback
--     deshabilitado con el aviso de que falta esta función. En cuanto se aplica,
--     empieza a poder contestar.
--
-- ══ Por qué hace falta una función, y no basta con dejarle escribir ═════════
--
-- Por lo mismo que la 0014. El cliente NO tiene UPDATE sobre `workout_data`: se
-- le retiró justamente porque la fila contiene su programa entero en un jsonb, y
-- RLS filtra filas y no columnas, así que «poder anotar» significaba «poder
-- borrarse el programa». Anota sus series con `log_session_set`, que escribe un
-- campo de una serie y nada más.
--
-- El feedback de la sesión y su logbook son la segunda cosa que el cliente
-- escribe, así que necesitan el mismo trato: una operación concreta en vez de un
-- permiso amplio.
--
-- ══ Qué concede EXACTAMENTE ═════════════════════════════════════════════════
--
--   · escribe `clientNote` y `feedback` de UNA sesión que ya existe;
--   · no crea sesiones — para eso hay que haber anotado antes una serie;
--   · no toca `days` (el plan es del entrenador), ni `entries` (los kilos, que
--     tienen su propia función y sus propias validaciones), ni `coachNote`;
--   · no crea ni borra microciclos.
--
-- `coachNote` queda fuera a propósito: es lo que el entrenador le dice al
-- cliente, y si el cliente pudiera escribirlo podría fabricarse indicaciones que
-- parecen de su entrenador.
-- ============================================================================

BEGIN;

/**
 * Guarda el feedback de una sesión y la nota del cliente.
 *
 * Los dos parámetros de contenido son opcionales: `NULL` significa «no toques
 * esto». Eso permite que la interfaz guarde la nota mientras se escribe y las
 * respuestas cuando se pulsan, sin que una pise a la otra — que es justo el
 * problema que tendría un «guarda este objeto entero».
 *
 * Devuelve el id de la sesión escrita.
 */
CREATE OR REPLACE FUNCTION public.log_session_feedback(
  p_client     uuid,
  p_week       integer,
  p_session_id text,
  p_note       text  DEFAULT NULL,
  p_feedback   jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data      jsonb;
  v_micro_idx integer;
  v_micro     jsonb;
  v_sessions  jsonb;
  v_session   jsonb;
  v_sess_idx  integer;
  v_key       text;
  v_val       jsonb;
BEGIN
  -- El propio cliente o su entrenador. Los dos, porque el entrenador también
  -- apunta lo que le cuenta el cliente en persona.
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  -- ── Validación del contenido ──────────────────────────────────────────────
  -- La función es invocable con la anon key, así que no puede dar por bueno nada
  -- de lo que llega.

  IF p_note IS NOT NULL AND length(p_note) > 2000 THEN
    RAISE EXCEPTION 'La nota es demasiado larga';
  END IF;

  IF p_feedback IS NOT NULL THEN
    IF jsonb_typeof(p_feedback) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'El feedback tiene que ser un objeto JSON';
    END IF;

    -- Tope de tamaño: sin él, cualquiera podría engordar el jsonb del programa
    -- —que se lee entero en cada carga— hasta donde quisiera.
    IF pg_column_size(p_feedback) > 4096 THEN
      RAISE EXCEPTION 'El feedback es demasiado grande';
    END IF;

    /*
      Cada respuesta es una cadena corta, y se comprueba una a una. El identificador
      de la pregunta tiene su forma porque puede ser del catálogo (`rpe`) o propio
      del entrenador (`q_<uuid sin guiones>`), y aceptar cualquier clave dejaría
      meter basura que después hay que filtrar en cada lectura.
    */
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_feedback) LOOP
      IF v_key !~ '^[A-Za-z0-9_]{1,40}$' THEN
        RAISE EXCEPTION 'Identificador de pregunta no válido: %', v_key;
      END IF;
      IF jsonb_typeof(v_val) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'La respuesta a % tiene que ser texto', v_key;
      END IF;
      IF length(v_val #>> '{}') > 500 THEN
        RAISE EXCEPTION 'La respuesta a % es demasiado larga', v_key;
      END IF;
    END LOOP;
  END IF;

  IF p_note IS NULL AND p_feedback IS NULL THEN
    RAISE EXCEPTION 'No hay nada que guardar';
  END IF;

  -- ── Localizar la sesión ───────────────────────────────────────────────────

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

  SELECT idx - 1 INTO v_sess_idx
  FROM jsonb_array_elements(v_sessions) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'id' = p_session_id
  LIMIT 1;

  /*
    La sesión tiene que existir ya, y esta función NO la crea.

    Podría crearla —`log_session_set` lo hace— pero sería conceder de más: crear
    una sesión es decir «he entrenado este día», y eso se dice anotando una serie.
    Permitirlo desde aquí dejaría fabricar entrenos vacíos con solo contestar un
    formulario, y la adherencia contaría sesiones que no existieron.
  */
  IF v_sess_idx IS NULL THEN
    RAISE EXCEPTION 'No hay ninguna sesión registrada con ese identificador';
  END IF;

  v_session := v_sessions -> v_sess_idx;

  IF p_note IS NOT NULL THEN
    v_session := jsonb_set(v_session, '{clientNote}', to_jsonb(p_note));
  END IF;

  /*
    ── Se FUSIONA, no se reemplaza ─────────────────────────────────────────────
    `||` mezcla las claves nuevas sobre las que ya había. Es lo que permite que la
    aplicación mande UNA respuesta por llamada en vez del objeto entero, y eso no
    es una optimización: es lo que evita perder respuestas.

    Con «manda el objeto completo», dos toques seguidos en dos escalas distintas
    construyen su payload leyendo el estado local, y el segundo se construye antes
    de que el primero haya llegado a ese estado. El segundo pisa al primero y la
    respuesta desaparece sin ningún error. Es el mismo motivo por el que
    `log_session_set` escribe un solo campo de una sola serie.

    Para borrar una respuesta se manda su clave con la cadena vacía, que es lo que
    hace la interfaz al volver a pulsar el valor ya elegido.
  */
  IF p_feedback IS NOT NULL THEN
    v_session := jsonb_set(
      v_session,
      '{feedback}',
      COALESCE(v_session -> 'feedback', '{}'::jsonb) || p_feedback
    );
  END IF;

  v_sessions := jsonb_set(v_sessions, ARRAY[v_sess_idx::text], v_session);
  v_micro    := jsonb_set(v_micro, '{sessions}', v_sessions);

  UPDATE public.workout_data
  SET microcycles = jsonb_set(v_data, ARRAY[v_micro_idx::text], v_micro),
      updated_at  = now()
  WHERE client_id = p_client;

  RETURN p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_session_feedback(uuid, integer, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_session_feedback(uuid, integer, text, text, jsonb) TO authenticated;

COMMIT;
