-- ============================================================================
-- Corregir una nota no es volver a revisar
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Añade UNA función nueva. No cambia `review_check_in`, que se
--     sigue usando para cerrar revisiones y funciona bien.
--
-- ══ El fallo ════════════════════════════════════════════════════════════════
--
-- El histórico de revisiones deja corregir la nota de una que ya se cerró —una
-- errata, una frase a medias—, y para eso reutilizaba `review_check_in`, que es
-- la función de CERRAR una revisión. Esa función hace, sin condiciones:
--
--     UPDATE public.check_ins
--     SET reviewed_at = now(),
--         reviewed_by = auth.uid(), …
--
-- Así que arreglar una errata en una nota de hace dos semanas tenía tres efectos
-- que nadie pidió:
--
--   1. **La fecha de la revisión pasaba a ser hoy.** El propio panel escribe
--      «revisada el {fecha}», así que el histórico —que existe justamente para
--      poder mirar hacia atrás— empezaba a mentir en la línea de al lado.
--
--   2. **El autor pasaba a ser quien corrige.** En un equipo de varios
--      entrenadores, Luis arreglando una coma en la nota de Ana quedaba como
--      autor de la revisión que hizo Ana. Es la integridad de auditoría que la
--      0042 se propuso proteger, perdida por el camino más tonto.
--
--   3. **Al cliente le volvía a saltar la novedad** «tu entrenador ha revisado tu
--      semana», por una edición cosmética de un texto que ya había leído. Una
--      novedad que describe algo que no ha cambiado enseña a ignorar las
--      novedades.
--
-- ══ La decisión ════════════════════════════════════════════════════════════
--
-- Dos operaciones distintas, dos funciones. `review_check_in` CIERRA una revisión
-- —y por eso sella quién y cuándo—; esta solo cambia el texto.
--
-- Se prefiere una función nueva a un parámetro `edit_only` en la de siempre
-- porque la que ya está desplegada no cambia de firma, y porque un booleano que
-- apaga la mitad del comportamiento de una función es la clase de bandera que
-- alguien acaba pasando al revés.
-- ============================================================================

BEGIN;

/**
 * Corregir la nota de una revisión ya cerrada.
 *
 * No toca `reviewed_at` ni `reviewed_by`: lo que pasó, pasó. Tampoco toca
 * `snapshot`, que es la foto del plan en el momento de revisar y volver a
 * tomarla ahora daría una foto de otro día.
 *
 * `SECURITY DEFINER` con la comprobación de permiso escrita a mano, igual que el
 * resto de las escrituras sobre fichas ajenas: `app_can_write_client` es quien
 * decide, y con `anon` eso es nulo y levanta excepción.
 */
CREATE OR REPLACE FUNCTION public.update_check_in_notes(check_in uuid, notes text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client uuid;
BEGIN
  SELECT client_id INTO v_client FROM public.check_ins WHERE id = check_in;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Esa revisión no existe';
  END IF;

  IF NOT public.app_can_write_client(v_client) THEN
    RAISE EXCEPTION 'No puedes editar las revisiones de este cliente';
  END IF;

  /*
    Solo si YA estaba revisada. Editar la nota de una que nadie ha revisado
    todavía sería cerrarla por la puerta de atrás, sin sellar quién ni cuándo —
    que es justo el agujero que esta migración viene a tapar.
  */
  UPDATE public.check_ins
  SET coach_notes = notes,
      updated_at  = now()
  WHERE id = check_in
    AND reviewed_at IS NOT NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_check_in_notes(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.update_check_in_notes(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_check_in_notes(uuid, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Sobre una revisión cerrada, corregir la nota NO mueve el sello:
--
--   SELECT reviewed_at, reviewed_by, coach_notes FROM public.check_ins WHERE id = '<id>';
--   SELECT public.update_check_in_notes('<id>', 'Texto corregido');
--   SELECT reviewed_at, reviewed_by, coach_notes FROM public.check_ins WHERE id = '<id>';
--   -- coach_notes cambia; reviewed_at y reviewed_by, no.
--
-- Y sobre una sin revisar no hace nada (devuelve false):
--
--   SELECT public.update_check_in_notes('<id-sin-revisar>', 'x');  -- false
-- ============================================================================
