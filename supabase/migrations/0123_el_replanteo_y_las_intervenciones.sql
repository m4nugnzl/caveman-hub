-- ============================================================================
-- El replanteo y las intervenciones
-- ----------------------------------------------------------------------------
-- Requiere `0028_client_roadmap.sql` (las fases), `0073_el_roadmap_se_bifurca.sql` (el
-- precedente de una lista jsonb en la fase) y `0122_el_plan_apunta_a_una_fecha.sql`
-- (las políticas de eventos que aquí se reescriben). Se para sola si falta alguna.
--
-- ⚠️  Aditiva: tres columnas que nacen nulas, cuatro CHECK, el CHECK de `kind`
--     sustituido por otro que acepta todo lo anterior y las cuatro políticas de
--     eventos reescritas con una condición más. No reescribe ninguna fila. Hasta
--     que alguien iguale o apunte un refeed, la aplicación se comporta igual.
--
-- El razonamiento entero está en `docs/roadmap-replanteo.md`. Aquí, lo que
-- sostiene cada pieza.
--
-- ══ El límite ═══════════════════════════════════════════════════════════════
--
-- El sistema enseña la desviación; no sugiere replanteos, no reajusta solo, no
-- avisa. Nada de lo que hay aquí se escribe solo: un replanteo lo hace el
-- entrenador sobre una semana, y una intervención no mueve la recta esperada.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_phases') IS NULL THEN
    RAISE EXCEPTION 'Falta 0028_client_roadmap.sql: el replanteo es un dato de la fase.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_phases' AND column_name = 'next_options'
  ) THEN
    RAISE EXCEPTION 'Falta 0073_el_roadmap_se_bifurca.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'ancla'
  ) THEN
    RAISE EXCEPTION 'Falta 0122_el_plan_apunta_a_una_fecha.sql: sus políticas son las que aquí se reescriben.';
  END IF;
END $$;

BEGIN;

/*
  Los replanteos de una fase: el entrenador toma la media real de una semana
  como base nueva y sigue desde ahí, con el mismo ritmo o con otro.

  La forma vive en `domain/roadmap.js`:

    [{ "semana": "2026-09-14", "pesoBase": 75.9, "ratePct": 0.6,
       "nota": "", "creadoEl": "2026-09-21T10:12:00Z" }]

  `semana` es el lunes de la semana cuya media se toma. `pesoBase` es un número
  y no una referencia: un pesaje atrasado no mueve la base. El original no se
  guarda porque no hace falta: sale de la fase, como siempre, y se dibuja como
  fantasma.

  Es el razonamiento de `next_options` (0073): una lista en la fase no necesita
  políticas nuevas (heredan las de la 0028: escribe el entrenador, lee el
  cliente), llega con las fases sin join y se va con su fase. La base solo exige
  un array con tope; que la semana caiga dentro de la fase y no sea futura
  depende de la fase y se valida en el dominio. Un replanteo que se queda fuera
  al acortar la fase se ignora al leer, no se borra.

  NULL si no hay ninguno, nunca `[]`: una sola forma de decir «no hay».
*/
ALTER TABLE public.client_phases
  ADD COLUMN IF NOT EXISTS replanteos jsonb;

ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_replanteos_shape;
ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_replanteos_shape CHECK (
    replanteos IS NULL OR (
      jsonb_typeof(replanteos) = 'array'
      AND jsonb_array_length(replanteos) BETWEEN 1 AND 52
    )
  );

/*
  Las intervenciones son eventos del calendario, no una tabla: tienen fecha y se
  enlazan con la fase por fecha, como todo. Una tabla aparte duplicaría el
  calendario.

  Dos tipos nuevos. Las vacaciones ya eran `rest`; la descarga es la intención
  `descarga` del bloque, y no se duplica aquí.
*/
ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_kind_check;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_kind_check CHECK (
    kind IN ('checkin', 'note', 'appointment', 'goal', 'rest', 'race', 'refeed', 'diet_break')
  );

/*
  La duración: el último día, incluido, como `ends_on` en las fases. Nula es un
  día. Solo en lo que dura: una cita o una revisión no tienen «hasta», y así el
  resto del calendario no tiene que aprender a pintar eventos de varios días.
*/
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS hasta date;

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_hasta_ordenada;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_hasta_ordenada CHECK (
    hasta IS NULL OR (hasta >= date AND kind IN ('rest', 'refeed', 'diet_break'))
  );

/*
  Las kcal del refeed o del diet break, opcionales. Acotadas a lo humano, igual
  que el peso en `clientGoal`. Ocultárselas a quien no las ve es cosa de la
  pantalla (`useOculto`), como el resto de su dieta.
*/
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS kcal integer;

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_kcal_intervencion;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_kcal_intervencion CHECK (
    kcal IS NULL OR (kind IN ('refeed', 'diet_break') AND kcal BETWEEN 800 AND 8000)
  );

COMMIT;


-- ============================================================================
-- Quién toca un refeed o un diet break: solo el entrenador
-- ----------------------------------------------------------------------------
-- Son pauta, como el ancla: el cliente los ve en su calendario, pero no se
-- apunta un refeed de 3.000 kcal. Las vacaciones (`rest`) siguen siendo de los
-- dos, como hoy.
--
-- Las cuatro se reescriben enteras, con la forma de la 0122 y una condición más
-- en la rama del cliente.
-- ============================================================================

BEGIN;

-- Leer: sin cambios. El cliente ve sus intervenciones.
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
      OR (
        public.app_is_client(client_id) AND NOT privada AND NOT ancla
        AND kind NOT IN ('refeed', 'diet_break')
      )
    )
    AND created_by = auth.uid()
  );

/*
  `USING` impide tocar un refeed que ya existe; `WITH CHECK` impide convertir
  sus vacaciones en uno. Hacen falta las dos, como en la 0106 y la 0122.
*/
DROP POLICY IF EXISTS "events_update" ON public.client_events;
CREATE POLICY "events_update" ON public.client_events
  FOR UPDATE TO authenticated
  USING (
    public.app_can_write_client(client_id)
    OR (
      public.app_is_client(client_id) AND NOT privada AND NOT ancla
      AND kind NOT IN ('refeed', 'diet_break')
    )
  )
  WITH CHECK (
    public.app_can_write_client(client_id)
    OR (
      public.app_is_client(client_id) AND NOT privada AND NOT ancla
      AND kind NOT IN ('refeed', 'diet_break')
    )
  );

DROP POLICY IF EXISTS "events_delete" ON public.client_events;
CREATE POLICY "events_delete" ON public.client_events
  FOR DELETE TO authenticated
  USING (
    public.app_can_write_client(client_id)
    OR (
      created_by = auth.uid() AND NOT ancla
      AND kind NOT IN ('refeed', 'diet_break')
      AND (NOT privada OR public.app_can_write_client(client_id))
    )
  );

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que todo nació vacío (debe dar 0 y 0):
--
--   SELECT count(*) FROM public.client_phases WHERE replanteos IS NOT NULL;
--   SELECT count(*) FROM public.client_events WHERE hasta IS NOT NULL OR kcal IS NOT NULL;
--
-- 2) Una cita no dura ni lleva kcal — esto tiene que fallar:
--
--   UPDATE public.client_events SET kcal = 3000 WHERE kind = 'appointment';
--   -- ERROR: violates check constraint "client_events_kcal_intervencion"
--
-- 3) Con la sesión de un CLIENTE, apuntarse un refeed falla por RLS:
--
--   INSERT INTO public.client_events (client_id, date, kind, title, created_by)
--   VALUES ('<su id>', CURRENT_DATE, 'refeed', 'Refeed', auth.uid());
-- ============================================================================
