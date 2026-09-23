-- ============================================================================
-- El plan apunta a una fecha: el ancla, la competición y el desplazamiento
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql` (los eventos), `0028_client_roadmap.sql`
-- (las fases) y `0106_lo_tuyo_no_lo_ve_el_cliente.sql` (las políticas que aquí
-- se reescriben). Se para sola si falta alguna.
--
-- ⚠️  Aditiva: dos columnas que nacen en `false` y en nulo, tres CHECK, un
--     índice parcial, las cuatro políticas de eventos reescritas con una
--     condición más y una función nueva. No reescribe ninguna fila. Hasta que
--     alguien marque un ancla, la aplicación se comporta exactamente igual.
--
-- El razonamiento entero está en `docs/eje-temporal.md`. Aquí, lo que sostiene
-- cada pieza.
--
-- ══ Qué le falta hoy al roadmap ════════════════════════════════════════════
--
-- Las fases saben hacia dónde va el cuerpo y cuánto dura cada tramo, pero no
-- saben PARA QUÉ. «Doce semanas de definición» no dice nada de si llega a la
-- competición del 4 de abril, y esa es la pregunta que convierte un roadmap en
-- un plan: dónde está, hacia dónde va, qué viene después.
--
-- La competición ya existe: es un evento `race` del calendario (0009). Los
-- objetivos con fecha también (`goal`). Lo que falta es poder decir «el plan
-- apunta aquí», y con eso medir el plan contra la fecha.
--
-- ══ Por qué una marca en el evento y no otra cosa ══════════════════════════
--
--   · En `clients.preferences` NO: `set_client_preferences` (0008) deja al
--     propio cliente reescribir el objeto entero, así que podría mover la meta
--     contra la que se mide un plan que él no puede tocar.
--   · Un `anchor_event_id` en cada fase NO: obliga a etiquetar cada tramo y
--     abre un estado que no significa nada — una fase que apunta a un ancla y
--     acaba después de ella.
--   · Una tabla de temporadas NO: la temporada se deriva. Son las fases entre
--     un ancla y la siguiente (`domain/roadmap.js`, `temporadas`).
--
-- Las fases NO se enlazan con el ancla. Se miden contra ella por fecha: el
-- tramo hacia un ancla son las fases que empiezan antes de ella y después de la
-- anterior. Así la analítica no cambia —`effectiveGoal` no sabe que existen— y
-- la regla de la 0028, que las fases no se solapan, sigue siendo la única.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_events') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: el ancla es una marca en un evento.';
  END IF;
  IF to_regclass('public.client_phases') IS NULL THEN
    RAISE EXCEPTION 'Falta 0028_client_roadmap.sql: sin fases no hay plan que desplazar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'privada'
  ) THEN
    RAISE EXCEPTION 'Falta 0106_lo_tuyo_no_lo_ve_el_cliente.sql: sus políticas son las que aquí se reescriben.';
  END IF;
END $$;

BEGIN;

/*
  El plan apunta a este evento.

  Solo `race` y `goal`: una cita o una semana de descanso no son un sitio al que
  llegar. Y nunca privada: el cliente lee sus fases enteras (0028), así que un
  ancla que él no viera le dejaría un plan que termina en ninguna parte.
*/
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS ancla boolean NOT NULL DEFAULT false;

/*
  Los datos de una competición, cuando el evento es una.

  La forma vive en `domain/calendar.js` (`competicionDe`):

    { "federacion": "…", "categoria": "−83 kg", "sede": "…", "pesoLimiteKg": 83 }

  `jsonb` y no cuatro columnas porque la forma de estos campos no se sabrá hasta
  que haya una fuente real de calendarios: cada federación nombra sus categorías
  y sus sedes a su manera. Es el razonamiento de `next_options` (0073): la base
  solo exige que sea un objeto y que el evento sea una competición; el resto se
  sanea en el dominio, y lo peor que hace uno malformado es pintar un rótulo raro.

  `pesoLimiteKg` es un LÍMITE, no un objetivo: el de la categoría. El objetivo
  sigue siendo uno y del cliente (`preferences.goal.targetWeightKg`).
*/
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS competicion jsonb;

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_ancla_kind;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_ancla_kind CHECK (NOT ancla OR kind IN ('race', 'goal'));

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_ancla_compartida;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_ancla_compartida CHECK (NOT (ancla AND privada));

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_competicion_shape;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_competicion_shape CHECK (
    competicion IS NULL OR (kind = 'race' AND jsonb_typeof(competicion) = 'object')
  );

/*
  «¿A qué apunta el plan de esta persona?» Parcial y diminuto: las anclas son
  una o dos por cliente entre todos sus eventos. Es lo que carga `useRoadmap`
  junto a las fases, sin traerse el calendario entero.
*/
CREATE INDEX IF NOT EXISTS client_events_ancla_idx
  ON public.client_events (client_id, date)
  WHERE ancla;

COMMIT;


-- ============================================================================
-- Quién toca un ancla: solo el entrenador
-- ----------------------------------------------------------------------------
-- El cliente crea, cambia y borra sus eventos compartidos (0009, 0106), y así
-- sigue. Lo que se cierra es lo que mueve el plan: un evento que es ancla. Si
-- pudiera cambiarle la fecha, movería la meta de unas fases que no puede tocar.
--
-- Puede apuntar su carrera, y si su entrenador la marca como ancla, a partir de
-- ahí es del entrenador — también marcarla hecha. Es la decisión 2 del estudio.
--
-- Las cuatro se reescriben enteras, con la misma forma que en la 0106 y una
-- condición más en la rama del cliente.
-- ============================================================================

BEGIN;

-- Leer: sin cambios de fondo. Se reescribe para que las cuatro vivan juntas.
DROP POLICY IF EXISTS "events_read" ON public.client_events;
CREATE POLICY "events_read" ON public.client_events
  FOR SELECT TO authenticated
  USING (
    public.app_can_read_client(client_id)
    OR (public.app_is_client(client_id) AND NOT privada)
  );

DROP POLICY IF EXISTS "events_insert" ON public.client_events;
CREATE POLICY "events_insert" ON public.client_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.app_can_write_client(client_id)
      OR (public.app_is_client(client_id) AND NOT privada AND NOT ancla)
    )
    AND created_by = auth.uid()
  );

/*
  `USING` impide tocar una fila que YA es ancla; `WITH CHECK` impide convertir
  una suya en ancla. Hacen falta las dos, por la misma razón que en la 0106.
*/
DROP POLICY IF EXISTS "events_update" ON public.client_events;
CREATE POLICY "events_update" ON public.client_events
  FOR UPDATE TO authenticated
  USING (
    public.app_can_write_client(client_id)
    OR (public.app_is_client(client_id) AND NOT privada AND NOT ancla)
  )
  WITH CHECK (
    public.app_can_write_client(client_id)
    OR (public.app_is_client(client_id) AND NOT privada AND NOT ancla)
  );

DROP POLICY IF EXISTS "events_delete" ON public.client_events;
CREATE POLICY "events_delete" ON public.client_events
  FOR DELETE TO authenticated
  USING (
    public.app_can_write_client(client_id)
    OR (created_by = auth.uid() AND NOT ancla AND (NOT privada OR public.app_can_write_client(client_id)))
  );

COMMIT;


-- ============================================================================
-- Mover las fases que aún no han empezado
-- ----------------------------------------------------------------------------
-- Cuando la competición cambia de fecha, las fases NO se mueven solas: aparece
-- el hueco o el exceso, dibujado, y el entrenador decide. Esto es lo que corre
-- si decide moverlas —una casilla desmarcada en el diálogo—, nunca por sí solo.
--
-- ══ Por qué una función y no una llamada por fila ══════════════════════════
--
-- El `EXCLUDE` de la 0028 no es diferible: se comprueba fila a fila. Mover tres
-- fases siete días hacia delante empezando por la primera hace que la primera
-- pise a la segunda antes de que la segunda se haya movido, y la base lo
-- rechaza con razón. En el orden correcto —hacia delante, de la última a la
-- primera; hacia atrás, al revés— ninguna pisa a otra en ningún momento.
--
-- Y todo en una transacción: si alguna choca de verdad —con la fase en curso,
-- o con las del tramo siguiente—, no se mueve ninguna. Medio plan movido sería
-- peor que no haber movido nada. El constraint no se toca.
--
-- ══ Qué mueve ══════════════════════════════════════════════════════════════
--
-- Las que empiezan DESPUÉS de hoy y ANTES de `p_hasta` (la siguiente ancla, si
-- la hay: las del tramo siguiente se miden contra otra fecha y no tienen por
-- qué moverse). Las pasadas no, porque cambiaría cómo se juzgó cada semana
-- vivida (`WeekReview`, `phaseAt` sobre la semana). La de hoy tampoco: su
-- inicio ya pasó.
--
-- SECURITY INVOKER: decide RLS, con las políticas de la 0028. Quien no puede
-- escribir las fases de ese cliente no mueve nada, y la suscripción caducada
-- tampoco (`can_write_client_active`).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.shift_future_phases(
  p_client uuid,
  p_days   integer,
  p_hasta  date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  fila   record;
  movidas integer := 0;
BEGIN
  IF p_days IS NULL OR p_days = 0 THEN
    RETURN 0;
  END IF;

  FOR fila IN
    SELECT id
    FROM public.client_phases
    WHERE client_id = p_client
      AND starts_on > CURRENT_DATE
      AND (p_hasta IS NULL OR starts_on < p_hasta)
    ORDER BY
      CASE WHEN p_days > 0 THEN starts_on END DESC,
      CASE WHEN p_days < 0 THEN starts_on END ASC
  LOOP
    UPDATE public.client_phases
    SET starts_on  = starts_on + p_days,
        ends_on    = ends_on + p_days,
        updated_at = now()
    WHERE id = fila.id;

    IF FOUND THEN
      movidas := movidas + 1;
    END IF;
  END LOOP;

  RETURN movidas;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_future_phases(uuid, integer, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_future_phases(uuid, integer, date) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que todo nació sin ancla (debe dar 0):
--
--   SELECT count(*) FROM public.client_events WHERE ancla OR competicion IS NOT NULL;
--
-- 2) Una cita no puede ser ancla — esto tiene que fallar:
--
--   UPDATE public.client_events SET ancla = true WHERE kind = 'appointment';
--   -- ERROR: violates check constraint "client_events_ancla_kind"
--
-- 3) Con la sesión de un CLIENTE, cambiar la fecha de un ancla no toca ninguna
--    fila (UPDATE 0):
--
--   UPDATE public.client_events SET date = date + 7 WHERE ancla;
--
-- 4) Mover dos semanas las fases que aún no han empezado:
--
--   SELECT public.shift_future_phases('<cliente>', 14);
-- ============================================================================
