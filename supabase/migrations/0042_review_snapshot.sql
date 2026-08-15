-- ============================================================================
-- Qué había en el plan cada vez que se revisó
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql` y `0041_fix_review_check_in.sql`. Añade
-- UNA columna y un parámetro opcional. La aplicación puede seguir llamando a la
-- función como antes.
--
-- ══ Qué falta hoy ══════════════════════════════════════════════════════════
--
-- Las revisiones se cierran y no dejan rastro de lo que se decidió. La nota dice
-- «te bajo un poco los hidratos» y dentro de dos meses nadie —ni el entrenador ni
-- el cliente— puede contestar cuánto era «un poco», ni desde qué cifra.
--
-- El plan actual está en `nutrition_plans` y `workout_data`, pero esas tablas
-- guardan el ESTADO, no la historia: al cambiar las calorías, las anteriores
-- desaparecen. Así que la pregunta «¿qué le cambié en agosto?» no tiene respuesta
-- en ninguna parte.
--
-- ══ La solución, y por qué es una foto y no un registro de cambios ═════════
--
-- Se guarda una FOTO del plan en el momento de cerrar cada revisión. Con eso, el
-- cambio se calcula comparando dos revisiones consecutivas: 2400 → 2200 kcal.
--
-- Un registro de cambios —una fila por cada cosa que se toca— parece más
-- completo y es peor aquí: la dieta se guarda sola a cada tecla, así que
-- registraría cuarenta cambios por tarde, la mayoría intermedios y ninguno
-- interesante. La foto solo conserva lo que quedó DECIDIDO, que es lo que se
-- consulta después.
--
-- ── Por qué `jsonb` abierto y no columnas ───────────────────────────────────
-- Porque lo que interesa guardar aquí va a cambiar —hoy calorías, macros y
-- semanas; mañana quizá los pasos o el RIR objetivo— y cada cambio sería una
-- migración y una columna más en una tabla que ya tiene doce. Lo que no cambia
-- es la forma de leerlo: la aplicación ignora las claves que no conoce.
--
-- Y es pequeño a propósito: cuatro cifras y un par de números. No es una copia
-- del plan, es lo que se mira al comparar dos semanas.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: no existe `check_ins`.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS snapshot jsonb;

/*
  Un tope de tamaño, por el mismo motivo que en `set_client_preferences`: la
  función es invocable con la anon key, así que no puede confiar en que la
  aplicación mande algo razonable.

  8 KB: además de las cifras del objetivo, la foto lleva la ESTRUCTURA —los
  nombres de las comidas con sus calorías y los días con sus ejercicios—, que es
  lo que permite decir «quitaste la Prensa y metiste Hack» en vez de solo «cambió
  algo». Un programa de seis días con ocho ejercicios ronda 1,5 KB; el resto es
  margen. Sigue siendo un resumen, no una copia del plan.

  ── Si ya aplicaste esta migración ─────────────────────────────────────────
  Vuelve a ejecutarla entera. Es idempotente: la columna se añade solo si falta y
  la función se redefine sobre sí misma.
*/
CREATE OR REPLACE FUNCTION public.review_check_in(
  check_in uuid,
  notes    text  DEFAULT NULL,
  snapshot jsonb DEFAULT NULL
)
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

  IF snapshot IS NOT NULL THEN
    IF jsonb_typeof(snapshot) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'La foto del plan tiene que ser un objeto JSON';
    END IF;
    IF pg_column_size(snapshot) > 8192 THEN
      RAISE EXCEPTION 'La foto del plan es demasiado grande';
    END IF;
  END IF;

  UPDATE public.check_ins
  SET reviewed_at = now(),
      reviewed_by = auth.uid(),
      -- Calificados con el nombre de la función: `notes` y `snapshot` son a la
      -- vez parámetros y columnas de esta tabla. Sin esto, Postgres aborta con
      -- «column reference is ambiguous» — el fallo que arregló la 0041 y que
      -- volvería a aparecer con la columna nueva.
      coach_notes = COALESCE(review_check_in.notes, public.check_ins.coach_notes),
      snapshot    = COALESCE(review_check_in.snapshot, public.check_ins.snapshot),
      updated_at  = now()
  WHERE id = check_in;
END;
$$;

/*
  La versión de DOS argumentos se retira: `CREATE OR REPLACE` no la sustituye
  —una firma distinta es otra función— y quedarían las dos, con PostgREST
  eligiendo por los argumentos que reciba. Dos caminos para lo mismo y solo uno
  guardando la foto es exactamente cómo se pierden datos sin enterarse.
*/
DROP FUNCTION IF EXISTS public.review_check_in(uuid, text);

REVOKE ALL ON FUNCTION public.review_check_in(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.review_check_in(uuid, text, jsonb) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT week_start, reviewed_at, coach_notes, snapshot
--   FROM public.check_ins
--   WHERE reviewed_at IS NOT NULL
--   ORDER BY week_start DESC LIMIT 5;
--
-- Que solo queda una versión de la función (una fila):
--
--   SELECT pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'review_check_in';
--
-- Y desde la APLICACIÓN: revisar a alguien, cambiarle las calorías, revisar la
-- semana siguiente. En el histórico de sus revisiones tiene que aparecer el
-- cambio «2400 → 2200 kcal» entre las dos.
--
-- ── Las revisiones anteriores no tienen foto ────────────────────────────────
-- Y no se puede reconstruir: el plan de entonces ya no existe en ninguna parte.
-- Salen sin cambios listados, que es lo cierto — no que no cambiara nada, sino
-- que no se guardó. La aplicación lo dice así en vez de enseñar un hueco.
-- ============================================================================
