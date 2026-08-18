-- ============================================================================
-- El cuestionario del check-in
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql`. Añade UNA columna y un parámetro
-- opcional a `submit_check_in`.
--
-- ══ Qué falta hoy ══════════════════════════════════════════════════════════
--
-- Un check-in entrega peso, medidas y fotos. Todo lo que se puede MEDIR, y nada
-- de lo que hay que PREGUNTAR: si ha podido seguir la dieta, si ha pasado hambre,
-- cómo ha dormido, si le apetece entrenar. Eso es la mitad de la información con
-- la que se decide un ajuste, y hoy vive en WhatsApp o no vive.
--
-- La aplicación ya sabe hacer esto: `domain/protocol.js` modela «preguntas con
-- respuesta» y las guarda en el feedback de una sesión (migración 0016). Su
-- propia cabecera dice que el cuestionario del check-in es exactamente lo mismo
-- con otra frecuencia — pero solo se llegó a construir el de la sesión.
--
-- ══ Por qué `jsonb` y no una tabla de respuestas ═══════════════════════════
--
-- Porque las preguntas las elige el entrenador y cambian cuando quiere. Una tabla
-- normalizada `respuestas(check_in, pregunta, valor)` obligaría a tener las
-- preguntas en otra tabla, con su clave ajena, y a migrar cada vez que alguien
-- añade una propia. Lo que se guarda aquí es `{ "hambre": "4", "nota": "…" }`:
-- un mapa de id → texto, exactamente igual que `sessions[].feedback` en
-- `workout_data`, que lleva funcionando desde la 0016.
--
-- Y todos los valores son TEXTO, incluidas las escalas. Es la misma decisión que
-- toma el proyecto con los kilos y las repeticiones (ver `src/types.d.ts`): el
-- vacío significa «no contestó», y `Number('')` es cero. Confundir «no contestó»
-- con «contestó cero» falsearía toda serie que salga de aquí.
--
-- ══ Por qué la firma de la función cambia ══════════════════════════════════
--
-- Porque el cliente no puede hacer un UPDATE sobre su check-in ya entregado —esa
-- es toda la razón de que `submit_check_in` exista (ver la 0009)—. Si las
-- respuestas se escribieran por otro camino, habría que abrirle la fila, y con
-- ella `reviewed_at`.
--
-- Como en la 0042, la versión anterior se ELIMINA en vez de dejarla convivir:
-- `CREATE OR REPLACE` no sustituye una firma distinta, así que quedarían dos
-- funciones y PostgREST elegiría por los argumentos que reciba. Dos caminos para
-- lo mismo y solo uno guardando las respuestas es cómo se pierden datos sin
-- enterarse.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `check_ins`.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS answers jsonb;

CREATE OR REPLACE FUNCTION public.submit_check_in(
  target       uuid,
  week         date,
  program_week integer DEFAULT NULL,
  weight_kg    numeric DEFAULT NULL,
  client_notes text    DEFAULT NULL,
  answers      jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result uuid;
BEGIN
  IF NOT (public.app_is_client(target) OR public.app_can_write_client(target)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  -- Siempre el lunes: dos entregas de la misma semana tienen que caer en la
  -- misma fila, y el cliente puede mandar cualquier día de esa semana.
  week := date_trunc('week', week)::date;

  IF weight_kg IS NOT NULL AND (weight_kg <= 0 OR weight_kg > 400) THEN
    RAISE EXCEPTION 'El peso % no es un valor razonable', weight_kg;
  END IF;

  /*
    Las respuestas se comprueban aquí y no solo en el navegador, por el mismo
    motivo que la foto del plan en la 0042: esta función es invocable con la
    anon key, así que no puede confiar en que quien la llama mande algo sensato.

    4 KB: un cuestionario completo con ocho escalas y dos respuestas de texto
    largas ronda 1 KB. El resto es margen, y el tope impide que alguien engorde
    la fila hasta hacer lenta la carga del portal.
  */
  IF answers IS NOT NULL THEN
    IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
    END IF;
    IF pg_column_size(answers) > 4096 THEN
      RAISE EXCEPTION 'El cuestionario es demasiado largo';
    END IF;
  END IF;

  INSERT INTO public.check_ins
    (client_id, week_start, program_week, weight, notes, answers, submitted_at)
  VALUES
    (target, week, program_week, weight_kg, client_notes, answers, now())
  ON CONFLICT (client_id, week_start) DO UPDATE
  SET program_week  = COALESCE(EXCLUDED.program_week, public.check_ins.program_week),
      weight        = COALESCE(EXCLUDED.weight, public.check_ins.weight),
      notes         = COALESCE(EXCLUDED.notes, public.check_ins.notes),
      -- Calificado con el nombre de la función: `answers` es a la vez parámetro y
      -- columna de esta tabla. Sin esto Postgres aborta con «column reference is
      -- ambiguous», que es el fallo que arregló la 0041.
      answers       = COALESCE(submit_check_in.answers, public.check_ins.answers),
      -- Reentregar no reabre la revisión: si el entrenador ya lo vio, sigue visto.
      submitted_at  = COALESCE(public.check_ins.submitted_at, now()),
      updated_at    = now()
  RETURNING id INTO result;

  RETURN result;
END;
$$;

DROP FUNCTION IF EXISTS public.submit_check_in(uuid, date, integer, numeric, text);

/*
  El REVOKE a `anon` es explícito y no solo a `public`.

  Una función recién creada nace con EXECUTE concedido a `anon` de forma
  explícita (`ALTER DEFAULT PRIVILEGES` del esquema de Supabase), y
  `REVOKE ... FROM public` no retira ese permiso — lo documenta la migración
  0047. La función se defiende sola porque `app_is_client` es falso sin sesión,
  pero eso es la segunda línea, no la primera.
*/
REVOKE ALL ON FUNCTION public.submit_check_in(uuid, date, integer, numeric, text, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_check_in(uuid, date, integer, numeric, text, jsonb)
  TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Que solo queda UNA versión de la función (una sola fila):
--
--   SELECT pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'submit_check_in';
--
-- Que anon no puede llamarla (tiene que dar `f`):
--
--   SELECT has_function_privilege('anon',
--     'public.submit_check_in(uuid, date, integer, numeric, text, jsonb)', 'EXECUTE');
--
-- Y las respuestas guardadas:
--
--   SELECT week_start, weight, answers FROM public.check_ins
--   WHERE answers IS NOT NULL ORDER BY week_start DESC LIMIT 5;
--
-- Desde la APLICACIÓN: Ajustes → Protocolo → añadir preguntas en «Qué le
-- preguntas en el check-in». Entrar como cliente, «Entregar mi semana», llegar
-- al último paso del asistente, contestar y terminar. El entrenador tiene que
-- verlas en su cola de revisiones y en el histórico de esa semana.
--
-- ── Los check-ins anteriores ────────────────────────────────────────────────
-- Se quedan con `answers` a NULL: entonces no se preguntaba nada. La aplicación
-- no enseña un cuestionario vacío, simplemente no enseña nada.
-- ============================================================================
