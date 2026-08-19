-- ============================================================================
-- Deshacer una revisión recién cerrada
-- ----------------------------------------------------------------------------
-- Requiere `0042_review_snapshot.sql` (es su espejo). Añade UNA función y nada
-- más: `unreview_check_in` devuelve una fila de `check_ins` al estado de antes
-- de revisarla.
--
-- ══ Para qué existe ═════════════════════════════════════════════════════════
--
-- Para el «Deshacer» de la aplicación. «Seguimos igual» y «Contestar» cierran
-- la semana de una persona EN UN TOQUE, sin confirmación — y así debe ser: una
-- confirmación delante del gesto que se hace veinte veces cada lunes sería
-- fricción pura. Pero un toque en la fila equivocada de una lista densa cierra
-- la semana de OTRA persona con una nota enlatada, y hasta hoy eso no tenía
-- vuelta: la única salida era editar la nota, que no quita el sello.
--
-- La pareja honesta de «sin confirmación» es «con deshacer». La aplicación lo
-- ofrece durante unos segundos en un aviso; esta función es lo que ese botón
-- ejecuta.
--
-- ══ Qué deshace, y qué no puede deshacer ═══════════════════════════════════
--
--   · Limpia `reviewed_at`, `reviewed_by`, `coach_notes` y `snapshot`: los
--     cuatro campos que escribe `review_check_in`. Antes de revisar, los cuatro
--     estaban vacíos —una entrega del cliente no trae nota del entrenador—, así
--     que ponerlos a NULL ES el estado anterior, no una aproximación.
--   · Solo toca filas que están revisadas (`reviewed_at IS NOT NULL`): deshacer
--     dos veces, o sobre una fila que nunca se revisó, no escribe nada.
--   · La NOVEDAD que se le publicó al cliente («tu entrenador ha revisado tu
--     semana») no se retracta: es una marca de tiempo en sus preferencias y
--     retirarla pelearía con su sello de «visto». Es inofensivo: el aviso lleva
--     a su semana, que vuelve a decir —con verdad— que está pendiente.
--
-- La fila que la barra de revisión CREA para poder cerrar a quien no entregó
-- no se deshace por aquí: su inverso es borrarla entera, y para eso ya existe
-- `delete_check_in` (0044). La aplicación elige el inverso según el caso.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `check_ins`.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'snapshot'
  ) THEN
    RAISE EXCEPTION 'Falta 0042_review_snapshot.sql: sin `snapshot` esta función no tendría qué limpiar.';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.unreview_check_in(check_in uuid)
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
  SET reviewed_at = NULL,
      reviewed_by = NULL,
      coach_notes = NULL,
      snapshot    = NULL,
      updated_at  = now()
  WHERE id = check_in
    AND reviewed_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.unreview_check_in(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.unreview_check_in(uuid) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Desde la aplicación: cerrar una revisión con «Seguimos igual», pulsar
-- «Deshacer» en el aviso, y mirar que la fila vuelve a salir en la cola y que
-- en la base los cuatro campos están limpios:
--
--   SELECT week_start, reviewed_at, reviewed_by, coach_notes, snapshot
--   FROM public.check_ins
--   WHERE client_id = '<id>' ORDER BY week_start DESC LIMIT 3;
--
-- Y que deshacer algo ya deshecho no rompe ni escribe: llamarla dos veces
-- seguidas con el mismo id deja la fila exactamente igual.
-- ============================================================================
