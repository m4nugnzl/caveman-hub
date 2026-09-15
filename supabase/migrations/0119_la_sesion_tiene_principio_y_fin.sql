-- ============================================================================
-- La sesión tiene principio y fin, y el cliente anota por ejercicio
-- ----------------------------------------------------------------------------
-- ⚠️  No toca ninguna tabla, ninguna política y ningún dato. Reemplaza una
--     función con SU MISMA FIRMA y añade tres nuevas. Lo que cambia en los
--     datos ya guardados: nada. Lo que cambia en los que se escriban desde
--     ahora: una sesión nueva nace con `startedAt`.
--
-- ⚠️  Se despliega ANTES que el código. Sin ella, la barra de la sesión sigue
--     funcionando —el descanso y la regla son del navegador— pero «Terminar»
--     no puede cerrar nada, «Descartar» no borra y la nota del ejercicio da
--     error de guardado con su botón de reintentar. Con ella y sin el código
--     nuevo, no pasa absolutamente nada: nadie llama a las tres funciones.
--
-- ══ Qué faltaba ════════════════════════════════════════════════════════════
--
-- Una sesión de entrenamiento era una FECHA con series dentro. Eso deja tres
-- cosas sin poder decirse, y las tres se piden en `docs/replanteamiento-movil.md`
-- (tanda 2):
--
--   1. **Cuánto ha costado.** El cronómetro se retiró de la barra a propósito
--      —un número que sube solo delante de alguien que descansa presiona, no
--      informa— pero la cuenta sigue existiendo y se dice UNA vez, al acabar:
--      «te ha costado 52 min». Sin un sello de principio y otro de fin, ese
--      dato no está en ninguna parte.
--
--   2. **Que la dejaste a medias.** Cuatro series escritas y nada más es hoy
--      una sesión idéntica a una terminada: existe en los datos y no existe
--      para la persona, que solo la reencuentra si vuelve a esa hoja por su
--      cuenta. Con `endedAt`, «a medias» es una pregunta que se puede hacer.
--
--   3. **Por qué bajaste el peso.** La única nota del cliente era la del final
--      de la sesión (`clientNote`, la 0016). El «dormí fatal y el hombro iba
--      justo» de la tercera serie de press inclinado acababa ahí o en WhatsApp,
--      y en los dos sitios SE DESPEGA del número que explica.
--
-- ══ Las cuatro piezas ══════════════════════════════════════════════════════
--
--   · `log_session_set`     — estampa `startedAt` al CREAR la sesión.
--   · `log_session_close`   — estampa `endedAt`. Es «Terminar».
--   · `log_session_discard` — borra una sesión SIN cerrar. Es «Descartar».
--   · `log_exercise_note`   — la nota del cliente en un ejercicio de la sesión.
--
-- ══ Por qué son funciones y no un UPDATE ═══════════════════════════════════
--
-- El mismo reparto que la 0014 y la 0016, y por el mismo motivo: la fila de
-- `workout_data` contiene el programa ENTERO en un jsonb. Darle UPDATE al
-- cliente para que pueda escribir «he terminado» le alcanzaría para borrarse
-- el bloque. El entrenador sí reescribe el jsonb —es suyo—, así que el código
-- elige camino por el rol y estas funciones son la vía del cliente.
--
-- Son `SECURITY DEFINER` y autorizan igual que sus hermanas: el propio cliente
-- o su entrenador. Los dos, porque los dos registran entrenos.
-- ============================================================================


BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workout_data') IS NULL THEN
    RAISE EXCEPTION 'Falta el esquema base: no existe `workout_data`.';
  END IF;
  IF to_regprocedure('public.is_me(uuid)') IS NULL
     OR to_regprocedure('public.is_my_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan `is_me` / `is_my_client` (migraciones 0013-0014).';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════
-- 1. El principio
-- --------------------------------------------------------------------------
-- La función de la 0107, con UNA línea más. Se reescribe entera porque
-- `CREATE OR REPLACE` no admite parches: o está el cuerpo completo, o no está.
-- La firma, el retorno y los permisos son exactamente los de antes, así que
-- ningún navegador se entera de este despliegue.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_session_set(
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
      /*
        ── EL PRINCIPIO, y lo estampa el servidor ────────────────────────────
        Es el único cambio de esta función, y el sello lo pone `now()` y no el
        navegador: un reloj de teléfono mal puesto —o adelantado a mano—
        produciría duraciones imposibles, y la duración se le va a decir a una
        persona («te ha costado 52 min»). La FECHA del entreno sigue siendo
        `p_date`, la del cliente: ese es el día que dice haber entrenado y ahí
        manda él.

        Solo al crear. Una sesión que ya existe no vuelve a empezar, y escribir
        esto en cada serie borraría el principio con la última.
      */
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


-- ══════════════════════════════════════════════════════════════════════════
-- 2. El fin — «Terminar»
-- --------------------------------------------------------------------------
-- Estampa `endedAt`. Nada más: no valida contenido, no crea nada y no puede
-- tocar una sesión que no exista.
--
-- ── Por qué sobrescribe si ya estaba cerrada ──────────────────────────────
-- Porque cerrar dos veces es lo que pasa de verdad: se termina, se cae en la
-- cuenta de que faltaba la última serie, se anota y se vuelve a terminar. El
-- fin es CUÁNDO SE DEJÓ DE ENTRENAR, así que manda el último. Lo que no se
-- toca nunca es `startedAt`: eso ya pasó.
--
-- ── Y no hace falta que haya nada escrito ─────────────────────────────────
-- La sesión solo existe si alguien anotó una serie: `log_session_set` es lo
-- único que las crea, y la 0016 explica por qué no las crea ella. Llegar aquí
-- ya implica un entreno empezado.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_session_close(
  p_client     uuid,
  p_week       integer,
  p_session_id text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data      jsonb;
  v_micro_idx integer;
  v_micro     jsonb;
  v_sessions  jsonb;
  v_sess_idx  integer;
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
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

  SELECT idx - 1 INTO v_sess_idx
  FROM jsonb_array_elements(v_sessions) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'id' = p_session_id
  LIMIT 1;

  IF v_sess_idx IS NULL THEN
    RAISE EXCEPTION 'No hay ninguna sesión registrada con ese identificador';
  END IF;

  v_sessions := jsonb_set(v_sessions, ARRAY[v_sess_idx::text, 'endedAt'], to_jsonb(now()));
  v_micro    := jsonb_set(v_micro, '{sessions}', v_sessions);

  UPDATE public.workout_data
  SET microcycles = jsonb_set(v_data, ARRAY[v_micro_idx::text], v_micro),
      updated_at  = now()
  WHERE client_id = p_client;

  RETURN p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_session_close(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_session_close(uuid, integer, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 3. «Descartar» — y borra de verdad
-- --------------------------------------------------------------------------
-- La portada ofrece dos verbos sobre una sesión a medias: seguir y descartar.
-- Descartar BORRA la sesión, y es una decisión, no un descuido:
--
--   · El motivo por el que esa sesión se anuncia en la portada es que
--     «contamina el histórico» — se quedó con la fecha de anteayer y con
--     cuatro series de catorce. Marcarla de alguna manera y dejarla dentro
--     sería conservar exactamente lo que se vino a quitar, y además obligaría
--     a que cada cuenta del producto —adherencia, tonelaje, la última vez que
--     hizo este ejercicio— se acordase de la marca. Una regla que tapa un dato
--     malo lo deja puesto para el siguiente que lo lea.
--
--   · Y quien entrena es la autoridad sobre si ese entreno existió.
--
-- ── El cerrojo: solo una sesión SIN CERRAR ────────────────────────────────
-- Con `endedAt` puesto, alguien dijo «esto ha pasado», y entonces ya no es un
-- descuido que se limpia: es histórico, y de ahí no se borra. Eso acota el
-- daño posible de esta función a lo que está abierto ahora mismo.
--
-- ── Lo que NO se hace ─────────────────────────────────────────────────────
-- No se borra el microciclo aunque se quede sin sesiones, ni se toca el PLAN.
-- El plan es del entrenador; esto es del que entrena.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_session_discard(
  p_client     uuid,
  p_week       integer,
  p_session_id text
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
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
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

  IF (v_session -> 'endedAt') IS NOT NULL THEN
    RAISE EXCEPTION 'Esa sesión ya está cerrada: no se puede descartar';
  END IF;

  v_sessions := v_sessions - v_sess_idx;
  v_micro    := jsonb_set(v_micro, '{sessions}', v_sessions);

  UPDATE public.workout_data
  SET microcycles = jsonb_set(v_data, ARRAY[v_micro_idx::text], v_micro),
      updated_at  = now()
  WHERE client_id = p_client;

  RETURN p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_session_discard(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_session_discard(uuid, integer, text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- 4. La nota del cliente, pegada a SU ejercicio
-- --------------------------------------------------------------------------
-- Cuelga de la entrada de la sesión (`entries[].clientNote`) y no del plan.
-- Esa distinción es la que hace que la nota sirva:
--
--   · En el PLAN vive `coachNote`, que es del entrenador. Si el cliente
--     pudiera escribir ahí, podría fabricarse indicaciones que parecen suyas
--     —es el mismo motivo por el que la 0016 no le deja tocar `coachNote`—.
--   · Y en la sesión la nota queda FECHADA con el entreno, que es lo que la
--     convierte en la explicación de esos kilos y no en una nota general sobre
--     el ejercicio.
--
-- ── Los mismos topes que la nota del final ────────────────────────────────
-- 2.000 caracteres (la 0016). Y el ejercicio tiene que existir YA en la
-- sesión: de eso se encarga `log_session_set`, que es quien crea las entradas
-- y quien las pone al día con el plan (la 0101). Aceptar un id cualquiera
-- dejaría meter entradas fantasma en el jsonb del programa.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_exercise_note(
  p_client      uuid,
  p_week        integer,
  p_session_id  text,
  p_exercise_id text,
  p_note        text
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
  v_entries   jsonb;
  v_entry_idx integer;
BEGIN
  IF NOT (public.is_me(p_client) OR public.is_my_client(p_client)) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cliente';
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
  WHERE elem ->> 'id' = p_session_id
  LIMIT 1;

  IF v_sess_idx IS NULL THEN
    RAISE EXCEPTION 'No hay ninguna sesión registrada con ese identificador';
  END IF;

  v_entries := COALESCE(v_session -> 'entries', '[]'::jsonb);

  SELECT idx - 1 INTO v_entry_idx
  FROM jsonb_array_elements(v_entries) WITH ORDINALITY AS t(elem, idx)
  WHERE elem ->> 'exerciseId' = p_exercise_id
  LIMIT 1;

  IF v_entry_idx IS NULL THEN
    RAISE EXCEPTION 'Ese ejercicio no está en esta sesión';
  END IF;

  v_entries  := jsonb_set(v_entries, ARRAY[v_entry_idx::text, 'clientNote'], to_jsonb(p_note));
  v_session  := jsonb_set(v_session, '{entries}', v_entries);
  v_sessions := jsonb_set(v_sessions, ARRAY[v_sess_idx::text], v_session);
  v_micro    := jsonb_set(v_micro, '{sessions}', v_sessions);

  UPDATE public.workout_data
  SET microcycles = jsonb_set(v_data, ARRAY[v_micro_idx::text], v_micro),
      updated_at  = now()
  WHERE client_id = p_client;

  RETURN p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_exercise_note(uuid, integer, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_exercise_note(uuid, integer, text, text, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Las tres nuevas están y con su permiso (el GRANT de una función es tan
-- necesario como el de una tabla: sin él, el 403 es invisible):
--
--   SELECT p.proname,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS puede
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('log_session_close', 'log_session_discard',
--                        'log_exercise_note', 'log_session_set');
--
-- Y que `log_session_set` sigue siendo UNA sola, con sus diez argumentos:
--
--   SELECT count(*) FROM pg_proc WHERE proname = 'log_session_set';  -- 1
--
-- En la aplicación: entrar en la rutina del cliente, anotar una serie y mirar
-- la sesión — tiene `startedAt`. Pulsar «Terminar» y mirarla otra vez: tiene
-- `endedAt`, y el resumen dice cuánto ha costado.
-- ============================================================================
