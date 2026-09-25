-- ============================================================================
-- Estirar una fase y empujar las de detrás
-- ----------------------------------------------------------------------------
-- Requiere `0028` (client_phases y su exclusión de solapes) y `0122`
-- (`shift_future_phases`, de la que copia la manera de mover).
--
-- ⚠️  No toca ninguna tabla, ninguna política y ningún dato: añade UNA función.
--     Se aplica ANTES que el código. Sin ella, el código nuevo enseña el error
--     de la base al soltar el asa de una fase y no mueve nada: nada se pierde.
--
-- ══ Qué cambia ═════════════════════════════════════════════════════════════
--
-- El creador del plan (pestaña Plan de «El plan», 23 sep 2026) deja arrastrar
-- el final de una fase. Alargarla empuja las siguientes; acortarla las trae.
-- Son varias filas que tienen que moverse a la vez, y con el EXCLUDE de la 0028
-- el orden importa: al alargar se mueven primero las de detrás (de la última a
-- la primera) y después se alarga la fase; al acortar, al revés. Hecho desde el
-- navegador serían varias llamadas sin transacción, y un fallo a mitad dejaría
-- el plan con un hueco o un solape que nadie pidió. Aquí es todo o nada.
--
-- `shift_future_phases` no sirve para esto: mueve TODAS las que empiezan
-- después de hoy, y eso incluye la propia fase si todavía no ha empezado.
--
-- ══ Las reglas, las mismas que la pantalla (`estirarFases`) ════════════════
--
--   · Se mueven todas las fases que empiezan DESPUÉS del final de esta. Las de
--     antes no se tocan. El destino (el ancla) y los bloques tampoco.
--   · Una fase que ya acabó no se estira: cambiaría cómo se juzgó cada semana
--     vivida (`WeekReview`, `phaseAt` sobre la semana).
--   · Una fase en curso no puede acabar antes de hoy.
--   · Ninguna fase dura menos de una semana (`MIN_PHASE_DAYS`).
--   · Una fase abierta (sin final) no tiene nada que estirar.
--
-- SECURITY INVOKER: decide RLS, con las políticas de la 0028. Quien no puede
-- escribir las fases de ese cliente no mueve nada, y la suscripción caducada
-- tampoco (`can_write_client_active`).
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.shift_future_phases(uuid, integer, date)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0122_el_plan_apunta_a_una_fecha.sql.';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.estirar_fase(
  p_fase uuid,
  p_dias integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_cliente uuid;
  v_inicio  date;
  v_fin     date;
  v_nuevo   date;
  fila      record;
  movidas   integer := 0;
BEGIN
  IF p_dias IS NULL OR p_dias = 0 THEN
    RETURN 0;
  END IF;

  SELECT client_id, starts_on, ends_on INTO v_cliente, v_inicio, v_fin
  FROM public.client_phases
  WHERE id = p_fase
  FOR UPDATE;

  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'No existe esa fase, o no es de un cliente tuyo.';
  END IF;
  IF v_fin IS NULL THEN
    RAISE EXCEPTION 'Esa fase no tiene final: primero dale una duración.';
  END IF;
  IF v_fin < CURRENT_DATE THEN
    RAISE EXCEPTION 'Esa fase ya acabó: cambiarla movería cómo se juzgaron sus semanas.';
  END IF;

  v_nuevo := v_fin + p_dias;
  IF v_nuevo < v_inicio + 6 THEN
    RAISE EXCEPTION 'Una fase dura al menos una semana.';
  END IF;
  IF v_inicio <= CURRENT_DATE AND v_nuevo < CURRENT_DATE THEN
    RAISE EXCEPTION 'Una fase en curso no puede acabar antes de hoy.';
  END IF;

  -- Al acortar, primero la fase: así las de detrás tienen sitio al venirse.
  IF p_dias < 0 THEN
    UPDATE public.client_phases SET ends_on = v_nuevo, updated_at = now() WHERE id = p_fase;
  END IF;

  FOR fila IN
    SELECT id
    FROM public.client_phases
    WHERE client_id = v_cliente
      AND id <> p_fase
      AND starts_on > v_fin
    ORDER BY
      CASE WHEN p_dias > 0 THEN starts_on END DESC,
      CASE WHEN p_dias < 0 THEN starts_on END ASC
  LOOP
    UPDATE public.client_phases
    SET starts_on  = starts_on + p_dias,
        ends_on    = ends_on + p_dias,
        updated_at = now()
    WHERE id = fila.id;

    IF FOUND THEN
      movidas := movidas + 1;
    END IF;
  END LOOP;

  -- Al alargar, la fase al final: las de detrás ya se han apartado.
  IF p_dias > 0 THEN
    UPDATE public.client_phases SET ends_on = v_nuevo, updated_at = now() WHERE id = p_fase;
  END IF;

  RETURN movidas;
END;
$$;

REVOKE ALL ON FUNCTION public.estirar_fase(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.estirar_fase(uuid, integer) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT proname FROM pg_proc WHERE proname = 'estirar_fase';
--
-- Con la sesión del entrenador, alargar dos semanas una fase que no ha acabado
-- (devuelve cuántas de detrás se movieron):
--
--   SELECT public.estirar_fase('<fase>', 14);
--
-- Y deshacerlo:
--
--   SELECT public.estirar_fase('<fase>', -14);
-- ============================================================================
