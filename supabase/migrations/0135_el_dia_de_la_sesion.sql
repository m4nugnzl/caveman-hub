-- ============================================================================
-- El día de la sesión, también para el cliente
-- ----------------------------------------------------------------------------
-- Requiere `0119_la_sesion_tiene_principio_y_fin.sql` (las funciones de la
-- sesión del cliente) y `0134_completar_revisiones_pasadas.sql`
-- (`escribe_el_cliente` y `semana_cerrada_al_cliente`).
--
-- ⚠️  No toca ninguna tabla, ninguna política y ningún dato: añade UNA función.
--     Se puede aplicar antes que el código; sin el código nadie la llama. Sin
--     ella y con el código nuevo, el cliente ve su cambio de día como un
--     guardado fallido con su botón de reintentar, y no se pierde nada más.
--
-- ══ Qué cambia ═════════════════════════════════════════════════════════════
--
-- Una sesión nace con la fecha del día en que se apunta su primera serie. Si el
-- cliente entrenó el martes y lo apuntó el miércoles, quedaba en miércoles y
-- solo su entrenador podía corregirlo. Desde el 23 sep 2026 los dos le cambian
-- el día con el mismo calendario (`domain/fechaDeLaSesion.js`).
--
-- El entrenador escribe el jsonb entero, como siempre: el programa es suyo. El
-- cliente no tiene UPDATE sobre `workout_data` —la fila lleva el programa
-- entero, y ese permiso le alcanzaría para borrárselo (ver 0014)—, así que su
-- camino es esta función, igual que el de sus series (`log_session_set`) y sus
-- notas (`log_session_feedback`).
--
-- ══ Las reglas, las mismas que la pantalla ═════════════════════════════════
--
--   · Nunca un día que no ha llegado (con un día de holgura por los husos).
--   · Hacia atrás, ni antes de que empiece su microciclo (`date`) ni antes de
--     la última sesión registrada del microciclo anterior.
--   · Hacia delante SÍ puede pasar del final del microciclo (el cliente vuelve
--     de dos semanas de vacaciones y hace la sesión pendiente, que sigue siendo
--     de ese microciclo), pero no de la primera sesión registrada del
--     siguiente. Así un microciclo nunca queda con fechas anteriores a otro.
--   · Cambiar el día no mueve nada más: ni microciclos ni otras sesiones.
--   · El cliente no toca lo que su entrenador ya ha revisado, ni lo que queda
--     fuera de plazo: `semana_cerrada_al_cliente`, sobre el día de antes y el
--     de después. Es la frontera de las revisiones (0134).
--   · Otra sesión de la misma hoja ese día NO se toca: las dos conviven.
--
-- Y deja dicho quién lo cambió: `fechaPor = 'cliente'`, para que su entrenador
-- lo vea en el selector de sesión. Si lo cambia el entrenador por aquí, la marca
-- se quita.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.log_session_close(uuid, integer, text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0119_la_sesion_tiene_principio_y_fin.sql.';
  END IF;
  IF to_regprocedure('public.semana_cerrada_al_cliente(uuid, date)') IS NULL
     OR to_regprocedure('public.escribe_el_cliente(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0134_completar_revisiones_pasadas.sql.';
  END IF;
END $$;

BEGIN;

-- Una fecha del jsonb, o NULL si no se lee: `micro.date` puede venir como día
-- o como instante, según qué versión lo escribió.
CREATE OR REPLACE FUNCTION public.fecha_del_jsonb(valor text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN left(valor, 10)::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_session_date(
  p_client     uuid,
  p_week       integer,
  p_session_id text,
  p_date       date
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
  v_desde     date;
  v_anterior  date;
  v_siguiente date;
  v_antes     date;
  v_cliente   boolean;
  v_motivo    text;
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Falta el día.';
  END IF;
  IF p_date > current_date + 1 THEN
    RAISE EXCEPTION 'Ese día todavía no ha llegado.';
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
  WHERE elem ->> 'id' = p_session_id
  LIMIT 1;
  IF v_sess_idx IS NULL THEN
    RAISE EXCEPTION 'No hay ninguna sesión registrada con ese identificador';
  END IF;

  -- Hacia atrás: su inicio y lo último del microciclo anterior. Hacia delante:
  -- lo primero del siguiente. Los mismos límites que `limitesDeLaSesion`.
  SELECT max(public.fecha_del_jsonb(s ->> 'date')) INTO v_anterior
  FROM jsonb_array_elements(v_data) AS t(elem),
       jsonb_array_elements(COALESCE(elem -> 'sessions', '[]'::jsonb)) AS u(s)
  WHERE (elem ->> 'weekNumber')::integer = (
    SELECT max((m ->> 'weekNumber')::integer) FROM jsonb_array_elements(v_data) AS x(m)
    WHERE (m ->> 'weekNumber')::integer < p_week
  );
  SELECT min(public.fecha_del_jsonb(s ->> 'date')) INTO v_siguiente
  FROM jsonb_array_elements(v_data) AS t(elem),
       jsonb_array_elements(COALESCE(elem -> 'sessions', '[]'::jsonb)) AS u(s)
  WHERE (elem ->> 'weekNumber')::integer = (
    SELECT min((m ->> 'weekNumber')::integer) FROM jsonb_array_elements(v_data) AS x(m)
    WHERE (m ->> 'weekNumber')::integer > p_week
  );
  -- GREATEST ignora los NULL: sin fecha guardada ni anterior, no limita.
  v_desde := GREATEST(public.fecha_del_jsonb(v_micro ->> 'date'), v_anterior);
  IF v_desde IS NOT NULL AND p_date < v_desde THEN
    RAISE EXCEPTION 'Ese día cae antes de que empiece este microciclo o de lo registrado en el anterior.';
  END IF;
  IF v_siguiente IS NOT NULL AND p_date > v_siguiente THEN
    RAISE EXCEPTION 'Ese día cae después de lo registrado en el microciclo siguiente.';
  END IF;

  -- El cliente, con la frontera de las revisiones: el día de antes y el nuevo.
  v_cliente := public.escribe_el_cliente(p_client);
  IF v_cliente THEN
    v_antes  := public.fecha_del_jsonb(v_session ->> 'date');
    v_motivo := public.semana_cerrada_al_cliente(p_client, v_antes);
    IF v_motivo IS NULL THEN
      v_motivo := public.semana_cerrada_al_cliente(p_client, p_date);
    END IF;
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', v_motivo;
    END IF;
  END IF;

  v_session := (v_session - 'fechaPor') || jsonb_build_object('date', to_char(p_date, 'YYYY-MM-DD'));
  IF v_cliente THEN
    v_session := v_session || jsonb_build_object('fechaPor', 'cliente');
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

REVOKE ALL ON FUNCTION public.log_session_date(uuid, integer, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_session_date(uuid, integer, text, date) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT proname FROM pg_proc WHERE proname = 'log_session_date';
--
-- Desde la aplicación, entrando como cliente: en la sesión, pulsar el día de la
-- cabecera → elegir otro día. El entrenador lo ve en el panel de la sesión
-- con «día puesto por tu cliente». Una semana ya revisada no deja abrir el
-- calendario al cliente.
-- ============================================================================
