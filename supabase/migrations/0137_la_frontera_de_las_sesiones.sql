-- ============================================================================
-- La frontera de las revisiones, también en las sesiones
-- ----------------------------------------------------------------------------
-- Requiere `0134_completar_revisiones_pasadas.sql` (`escribe_el_cliente` y
-- `semana_cerrada_al_cliente`) y `0135_el_dia_de_la_sesion.sql`
-- (`fecha_del_jsonb`). Si falta alguna, se para ANTES de tocar nada.
--
-- ⚠️  No toca ninguna tabla, ninguna política y ningún dato: añade UNA función
--     y UN disparador. Se quita con
--       DROP TRIGGER workout_data_frontera_del_cliente ON public.workout_data;
--
-- ══ Qué cambia ═════════════════════════════════════════════════════════════
--
-- Desde la 0134 el cliente no toca lo que su entrenador ya ha revisado, ni lo
-- que queda fuera de plazo: pesajes, medidas, fotos, el cuestionario. Las
-- SESIONES se quedaron fuera. `log_session_set` no mira ninguna frontera, así
-- que el cliente podía reescribir las series de una semana ya revisada —desde
-- el modo entreno, entrando por una sesión a medias—, y su entrenador ya había
-- escrito su revisión sobre otros números.
--
-- El 23 sep 2026 el dueño lo aplica igual que en las revisiones: el cliente
-- corrige hasta que su entrenador revisa esa semana, y después queda cerrada.
-- Es lo que hace posible el registro suelto (apuntar un ejercicio a
-- posteriori, desde el papel) sin que «a posteriori» signifique «siempre».
--
-- ══ Por qué un disparador y no cinco funciones reescritas ══════════════════
--
-- Porque el cliente escribe sus sesiones por CINCO caminos, todos SECURITY
-- DEFINER sobre la misma fila (`log_session_set`, `log_exercise_note`,
-- `log_session_feedback`, `log_session_close`, `log_session_discard`), y el
-- sexto, `log_session_date`, ya lo comprueba (0135). Reescribir cinco funciones
-- para añadir la misma guarda sería copiar doscientas líneas de
-- `log_session_set` para cambiar una, y la próxima función que escriba en una
-- sesión se olvidaría. Un disparador sobre `workout_data` los cubre a todos, y
-- es la misma forma que la 0134 le dio a la antropometría.
--
-- ══ Qué compara ════════════════════════════════════════════════════════════
--
-- Las sesiones de antes y las de después, por su `id`. Una sesión que el
-- CLIENTE añade, cambia o quita tiene que caer, con su fecha de antes y con la
-- de después, en una semana que puede tocar (`semana_cerrada_al_cliente`: el
-- periodo en curso siempre; revisada nunca; cuatro semanas de margen; o
-- reabierta por su entrenador). Si no, el guardado entero se rechaza con la
-- frase de esa función, que la cola de guardado enseña tal cual.
--
-- Lo que NO mira: el plan (días, ejercicios, pautas), que el cliente no escribe
-- por aquí, y las sesiones que no cambian, por viejas que sean. Así un
-- guardado del cliente en la semana de hoy nunca tropieza con una sesión vieja.
--
-- Una sesión sin `id` (datos de antes de los ids) se reconoce por su contenido
-- entero: si no cambia, es la misma.
--
-- El entrenador no pasa por este filtro (`escribe_el_cliente` es falso para él).
--
-- ══ Orden ══════════════════════════════════════════════════════════════════
--
-- Se puede aplicar antes o después de publicar la app nueva, y no rompe nada:
-- la app nueva ya no deja escribir en una semana cerrada, y la vieja, si lo
-- intenta, ve «no se ha guardado» con la frase de por qué, y esa serie queda en
-- «las series que no se guardaron» de su entrenador (0132). Lo cómodo es
-- aplicarla con la app nueva publicada, para que nadie vea el rechazo.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.semana_cerrada_al_cliente(uuid, date)') IS NULL
     OR to_regprocedure('public.escribe_el_cliente(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0134_completar_revisiones_pasadas.sql.';
  END IF;
  IF to_regprocedure('public.fecha_del_jsonb(text)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0135_el_dia_de_la_sesion.sql.';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.workout_data_frontera_del_cliente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fila   record;
  v_motivo text;
BEGIN
  IF NOT public.escribe_el_cliente(NEW.client_id) THEN
    RETURN NEW;
  END IF;

  FOR v_fila IN
    WITH antes AS (
      SELECT COALESCE(s ->> 'id', 'sin-id:' || md5(s::text)) AS clave, s
      FROM jsonb_array_elements(COALESCE(OLD.microcycles, '[]'::jsonb)) AS m(elem),
           jsonb_array_elements(COALESCE(elem -> 'sessions', '[]'::jsonb)) AS t(s)
    ),
    despues AS (
      SELECT COALESCE(s ->> 'id', 'sin-id:' || md5(s::text)) AS clave, s
      FROM jsonb_array_elements(COALESCE(NEW.microcycles, '[]'::jsonb)) AS m(elem),
           jsonb_array_elements(COALESCE(elem -> 'sessions', '[]'::jsonb)) AS t(s)
    )
    SELECT a.s AS vieja, d.s AS nueva
    FROM antes a
    FULL JOIN despues d ON d.clave = a.clave
    WHERE a.s IS DISTINCT FROM d.s
  LOOP
    v_motivo := public.semana_cerrada_al_cliente(NEW.client_id, public.fecha_del_jsonb(v_fila.vieja ->> 'date'));
    IF v_motivo IS NULL THEN
      v_motivo := public.semana_cerrada_al_cliente(NEW.client_id, public.fecha_del_jsonb(v_fila.nueva ->> 'date'));
    END IF;
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', v_motivo;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.workout_data_frontera_del_cliente() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS workout_data_frontera_del_cliente ON public.workout_data;
CREATE TRIGGER workout_data_frontera_del_cliente
  BEFORE UPDATE ON public.workout_data
  FOR EACH ROW
  WHEN (OLD.microcycles IS DISTINCT FROM NEW.microcycles)
  EXECUTE FUNCTION public.workout_data_frontera_del_cliente();

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.workout_data'::regclass AND NOT tgisinternal;
--   -- debe salir `workout_data_frontera_del_cliente`
--
-- Desde la aplicación, entrando como cliente: una sesión de una semana ya
-- revisada se ve con sus series apagadas y la frase «Tu entrenador ya ha
-- revisado esta semana…». Las pruebas: `supabase/tests/frontera-de-las-sesiones.test.js`.
-- ============================================================================
