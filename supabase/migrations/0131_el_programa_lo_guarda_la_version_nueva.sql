-- ============================================================================
-- El programa lo guarda la versión nueva
-- ----------------------------------------------------------------------------
-- Requiere `0130_quien_escribio_el_programa.sql` Y la versión de la app que
-- rellena `escrito_por` YA PUBLICADA. Aplicada antes, ningún entrenador podría
-- guardar su plan: toda escritura llegaría sin firma nueva.
--
-- ══ Qué hace ═══════════════════════════════════════════════════════════════
--
-- Rechaza un UPDATE de `workout_data` hecho directamente desde la app (rol
-- `authenticated`) que cambia el PLAN —`blocks` o `weekly_split`— y deja
-- `escrito_por` como estaba. Eso es lo que manda una versión de la app que no
-- conoce la columna: una pestaña o una PWA abierta desde antes de publicar,
-- guardando el programa entero con sus reglas de entonces.
--
-- Lo que NO para:
--
--   · Las series, notas y semanas del cliente. Van por funciones SECURITY
--     DEFINER (`log_session_set`, `log_session_feedback`, `continue_program`…),
--     que corren con el rol de su dueño y solo tocan `microcycles`.
--   · Una versión vieja que guarda sin tocar el plan (anotar un kilo desde el
--     PC). No reescribe reglas del plan, y la guardia de `updated_at` de la
--     app sigue protegiendo de pisar lo que otro escribió.
--   · Los scripts con `service_role` (restaurar una copia, reparar ids) y el
--     editor SQL: no son la app.
--   · Los INSERT: la primera fila de un cliente no pisa nada.
--
-- ══ Orden de despliegue (22 sep 2026) ══════════════════════════════════════
--
--   1. Aplicar la 0130 (solo añade la columna). Las versiones que ya están
--      abiertas siguen funcionando: no la conocen y no la necesitan.
--   2. Publicar la app con F2b y `lib/version.js`. Desde aquí cada guardado del
--      programa firma, y las pestañas viejas que vuelven al primer plano ven
--      «Hay una versión nueva» (solo las que ya tengan ese código; las de hoy
--      no lo tienen, por eso existe esta migración).
--   3. Comprobar que la versión publicada firma: guardar un cambio del plan y
--      mirar que `escrito_por` de esa fila ya no es NULL y empieza por el id
--      de `/version.json`.
--   4. Aplicar ESTA migración cuando ya no escriba ninguna pestaña de antes
--      del paso 2: `select count(*) from workout_data where updated_at >
--      '<hora del paso 2>' and escrito_por is null` a 0 durante uno o dos
--      días. Desde aquí, una versión anterior recibe un error al guardar el
--      plan y no lo pisa, y su nota sobrevive para reaplicarla (ver el
--      ERRCODE, más abajo).
--
--   La lista completa —qué commits entran y dónde va la 0132— está en
--   docs/estudio-microciclo-secuencia.md, §7 «Publicar».
--
-- Para deshacer: `DROP TRIGGER workout_data_plan_firmado ON public.workout_data;`
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_data' AND column_name = 'escrito_por'
  ) THEN
    RAISE EXCEPTION 'Falta 0130_quien_escribio_el_programa.sql: `workout_data` no tiene `escrito_por`.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.workout_data_plan_firmado()
RETURNS trigger
LANGUAGE plpgsql
-- INVOKER a propósito: `current_user` tiene que ser quien escribe, no el dueño.
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (NEW.blocks IS DISTINCT FROM OLD.blocks OR NEW.weekly_split IS DISTINCT FROM OLD.weekly_split)
     AND NEW.escrito_por IS NOT DISTINCT FROM OLD.escrito_por THEN
    /* 55000 (object_not_in_prerequisite_state) y NO P0001, a propósito: la
       versión que hay publicada hoy trata P0001 como rechazo definitivo
       (`esRechazoDefinitivo`) y BORRA la nota del navegador, así que recargar
       —lo que dice este mensaje— perdía lo editado. Con otro código la nota
       sobrevive, y al recargar la versión nueva la vuelve a aplicar
       preguntando antes (`porReaplicarRef` en AppContext, sin `base`). */
    RAISE EXCEPTION 'Hay una versión nueva de la aplicación. Recarga la página para guardar el programa.'
      USING ERRCODE = '55000',
            HINT = 'La escritura no trae una firma nueva en escrito_por (ver 0131).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_data_plan_firmado ON public.workout_data;

CREATE TRIGGER workout_data_plan_firmado
  BEFORE UPDATE ON public.workout_data
  FOR EACH ROW
  EXECUTE FUNCTION public.workout_data_plan_firmado();
