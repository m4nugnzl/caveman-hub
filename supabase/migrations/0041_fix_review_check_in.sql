-- ============================================================================
-- `review_check_in` no ha funcionado nunca: «column reference "notes" is ambiguous»
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql`. Solo redefine UNA función. No toca
-- datos, ni políticas, ni la firma: la aplicación sigue llamándola igual.
--
-- ══ El fallo ═══════════════════════════════════════════════════════════════
--
-- La función de la 0009 se declaró así:
--
--     CREATE FUNCTION public.review_check_in(check_in uuid, notes text ...)
--     ...
--     UPDATE public.check_ins
--     SET coach_notes = COALESCE(notes, coach_notes)
--
-- Y `public.check_ins` **tiene una columna llamada `notes`** —las notas que
-- escribe el cliente al entregar—. Dentro de PL/pgSQL, un parámetro que se llama
-- igual que una columna de la tabla que se está tocando no se resuelve por
-- ninguna regla de precedencia: Postgres aborta con
--
--     column reference "notes" is ambiguous
--
-- Y como está en el `UPDATE`, salta SIEMPRE, se pasen notas o no.
--
-- ── Lo que eso significa, dicho claro ───────────────────────────────────────
-- **Marcar un check-in como revisado no ha funcionado desde que existe.** La
-- tarea «Responder check-ins» del tablero, el botón de revisar de «Hoy» y el
-- «Todo ok» de la barra de revisión llamaban todos a esta función y todos
-- recibían el mismo error. Como ninguno miraba el resultado, el síntoma era el
-- peor posible: parecía que el botón no hacía nada.
--
-- ══ El arreglo ═════════════════════════════════════════════════════════════
--
-- Calificar el parámetro con el nombre de la función —`review_check_in.notes`—,
-- que es la forma que da Postgres para deshacer exactamente esta ambigüedad.
--
-- Se prefiere a las alternativas:
--
--   · Renombrar el parámetro a `p_notes` cambiaría la firma, y PostgREST llama
--     por NOMBRE de argumento: habría que tocar la aplicación a la vez que la
--     base, y cualquier versión antigua abierta en una pestaña dejaría de
--     funcionar en ese momento.
--   · `#variable_conflict use_variable` arregla este caso y esconde el
--     siguiente: convierte en silenciosa cualquier colisión futura de esta
--     función, que es justo lo que no se quiere en algo que escribe.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `check_ins`.';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.review_check_in(check_in uuid, notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT client_id INTO owner FROM public.check_ins WHERE id = check_in;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Ese check-in no existe';
  END IF;
  IF NOT public.app_can_write_client(owner) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  UPDATE public.check_ins
  SET reviewed_at = now(),
      reviewed_by = auth.uid(),
      -- `review_check_in.notes` es EL PARÁMETRO; `coach_notes` es la columna.
      -- Sin calificar, `notes` podía ser el parámetro o la columna del cliente.
      coach_notes = COALESCE(review_check_in.notes, public.check_ins.coach_notes),
      updated_at  = now()
  WHERE id = check_in;
END;
$$;

REVOKE ALL ON FUNCTION public.review_check_in(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.review_check_in(uuid, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Con un check-in entregado y sin revisar, desde la aplicación con sesión de
-- entrenador:
--
--   SELECT id, week_start, submitted_at, reviewed_at, coach_notes
--   FROM public.check_ins ORDER BY week_start DESC LIMIT 5;
--
--   -- y con uno de esos identificadores:
--   SELECT public.review_check_in('<id>', 'probando');
--
-- Antes devolvía «column reference "notes" is ambiguous». Ahora no devuelve
-- nada —es `void`— y la fila tiene que quedar con `reviewed_at` puesto y
-- `coach_notes = 'probando'`.
--
-- Y desde la APLICACIÓN: «Hoy» → una revisión pendiente → «Revisar» → «Todo ok».
-- El cliente tiene que desaparecer de la cola, y en su portal debe salirle
-- «Tu entrenador ha revisado tu semana».
--
-- ── Check-ins que se quedaron sin revisar por este fallo ────────────────────
-- Los que se intentaron marcar y no se pudieron siguen como entregados. No hay
-- forma de saber cuáles se intentaron, así que no se arregla nada
-- automáticamente: aparecerán en la cola de revisiones para atenderlos ahora que
-- se puede.
--
--   SELECT c.week_start, cl.name
--   FROM public.check_ins c
--   JOIN public.clients cl ON cl.id = c.client_id
--   WHERE c.submitted_at IS NOT NULL AND c.reviewed_at IS NULL
--   ORDER BY c.week_start;
-- ============================================================================
