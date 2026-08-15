-- ============================================================================
-- Borrar un check-in
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql`. Añade UNA función. No toca tablas ni
-- políticas.
--
-- ══ Por qué falta ══════════════════════════════════════════════════════════
--
-- Un check-in se entrega y ya no se puede deshacer. Ni el cliente que lo mandó
-- sin querer a mitad de semana, ni el entrenador que lo cerró en el cliente
-- equivocado. `check_ins` tiene políticas de lectura y de inserción, pero
-- ninguna de borrado: la fila se queda para siempre.
--
-- Y no es un caso raro: el «Todo ok» de la barra de revisión CREA la fila si no
-- existía, así que un clic en la persona equivocada deja una revisión inventada
-- en su historial y no hay forma de quitarla.
--
-- ══ Quién puede ═══════════════════════════════════════════════════════════
--
-- Solo quien puede escribir sobre ese cliente, es decir el entrenador. El cliente
-- NO borra: su check-in entregado es lo que su entrenador está mirando, y
-- retirarlo a mitad de revisión —o después de recibir la respuesta— deja el
-- historial contando algo que no pasó. Si se equivocó al entregar, se lo dice y
-- el entrenador lo borra.
--
-- ── Lo que esto NO deshace ──────────────────────────────────────────────────
-- Los cambios que se hicieran en la dieta o en la rutina durante esa revisión.
-- Borrar la fila quita la revisión y su respuesta; el plan se queda como está.
-- Volver atrás el plan es otra cosa —hace falta guardar el contenido anterior
-- entero, no el resumen que guarda `snapshot`— y no se hace aquí.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `check_ins`.';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_check_in(check_in uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT client_id INTO owner FROM public.check_ins WHERE id = check_in;

  /*
    Que no exista no es un error: dos pestañas abiertas borrando lo mismo, o un
    reintento después de un corte de red. Se sale en silencio en vez de romperle
    la pantalla a alguien por haber conseguido justo lo que quería.
  */
  IF owner IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.app_can_write_client(owner) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  DELETE FROM public.check_ins WHERE id = check_in;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_check_in(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_check_in(uuid) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT id, week_start, submitted_at, reviewed_at FROM public.check_ins
--   ORDER BY week_start DESC LIMIT 5;
--
--   SELECT public.delete_check_in('<id>');   -- no devuelve nada
--
-- Y desde la APLICACIÓN: histórico de revisiones → «Eliminar» en una fila. Tiene
-- que desaparecer, y si esa semana era la vigente el cliente vuelve a poder
-- entregarla desde su «Hoy».
-- ============================================================================
