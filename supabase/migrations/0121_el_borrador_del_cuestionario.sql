-- ============================================================================
-- El borrador del cuestionario
-- ----------------------------------------------------------------------------
-- Requiere `0060_cuestionario_checkin.sql`. Añade UNA función y nada más.
--
-- ══ Qué cambia ═════════════════════════════════════════════════════════════
--
-- Hasta aquí las respuestas del cuestionario semanal solo llegaban a la base
-- DENTRO de la entrega (`submit_check_in`): el asistente las tenía en memoria y
-- terminarlo era entregar. Desde el rediseño del teléfono del 18 de septiembre
-- de 2026 (frames `328:111` y `128:195`) la revisión es una lista de pasos que
-- se hacen por separado —el peso un día, las fotos otro, el cuestionario el
-- domingo— y se entrega al final con un solo botón. Las fotos ya se guardaban
-- al subirlas; las respuestas no tenían dónde esperar.
--
-- ══ Por qué una función y no abrirle la fila ═══════════════════════════════
--
-- Por lo mismo que la 0009 y la 0089: RLS filtra filas y no columnas, y con
-- permiso de UPDATE sobre su check-in el cliente podría tocarse `reviewed_at`.
-- Esta función escribe `answers` y ninguna otra columna:
--
--   · NO pone `submitted_at`. Guardar respuestas no es entregar: el entrenador
--     no recibe nada hasta que el cliente pulsa «Entregar mi semana».
--   · Si la semana ya está entregada y sin revisar, corrige las respuestas de
--     esa entrega. Es lo mismo que ya permite «Volver a entregar» (0060).
--   · Si ya está REVISADA, se niega: cambiar lo que su entrenador ya contestó
--     sería contestar a algo que nadie va a volver a leer.
--
-- Las respuestas SUSTITUYEN a las anteriores, no se mezclan: lo que llega es
-- el cuestionario entero tal como está en la pantalla, y una pregunta que se
-- ha dejado en blanco tiene que quedar en blanco.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'answers'
  ) THEN
    RAISE EXCEPTION 'Falta 0060_cuestionario_checkin.sql: `check_ins` no tiene `answers`.';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.save_check_in_answers(
  target  uuid,
  week    date,
  answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result uuid;
  limpias jsonb;
BEGIN
  IF NOT (public.app_is_client(target) OR public.app_can_write_client(target)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  -- Siempre el lunes, como `submit_check_in`: el borrador y la entrega tienen
  -- que caer en la misma fila.
  week := date_trunc('week', week)::date;

  -- Las mismas comprobaciones que la entrega (0060), y por lo mismo: esta
  -- función se puede llamar sin pasar por el navegador.
  IF answers IS NOT NULL THEN
    IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
    END IF;
    IF pg_column_size(answers) > 4096 THEN
      RAISE EXCEPTION 'El cuestionario es demasiado largo';
    END IF;
  END IF;

  -- Un cuestionario vacío es «sin contestar», no un objeto vacío guardado.
  limpias := NULLIF(answers, '{}'::jsonb);

  INSERT INTO public.check_ins (client_id, week_start, answers)
  VALUES (target, week, limpias)
  ON CONFLICT (client_id, week_start) DO UPDATE
  SET answers    = EXCLUDED.answers,
      updated_at = now()
  WHERE public.check_ins.reviewed_at IS NULL
  RETURNING id INTO result;

  -- El `WHERE` del conflicto no actualiza nada si ya estaba revisada, y
  -- entonces no hay `id` que devolver.
  IF result IS NULL THEN
    RAISE EXCEPTION 'Esa semana ya está revisada';
  END IF;

  RETURN result;
END;
$$;

-- El REVOKE a `anon` explícito, como en la 0047 y la 0060.
REVOKE ALL ON FUNCTION public.save_check_in_answers(uuid, date, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_check_in_answers(uuid, date, jsonb) TO authenticated;

COMMIT;
