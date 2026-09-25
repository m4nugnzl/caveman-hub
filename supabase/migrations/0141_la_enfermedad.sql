-- ============================================================================
-- La enfermedad, con su «hasta»
-- ----------------------------------------------------------------------------
-- Requiere `0123_el_replanteo_y_las_intervenciones.sql` (el CHECK de `kind` y
-- la columna `hasta`, que aquí se amplían). Se para sola si falta.
--
-- ⚠️  Aditiva: dos CHECK sustituidos por otros que aceptan todo lo anterior
--     más `illness`. No reescribe ninguna fila ni ninguna política. Se aplica
--     ANTES que el código que la escriba: sin ella, guardar una enfermedad da
--     el error de la base y no se pierde nada.
--
-- ══ Por qué un tipo y no una nota ══════════════════════════════════════════
--
-- Porque explica semanas enteras: un resfriado mueve la báscula, se salta
-- entrenos y baja los pasos. Como nota se pierde entre las demás; como hecho
-- sale en el carril de Hechos de la línea de tiempo con su principio y su
-- final, al lado de lo que explica. No mueve la recta esperada ni cambia cómo
-- se juzga la semana: es contexto, como unas vacaciones.
--
-- ══ Quién la escribe ═══════════════════════════════════════════════════════
--
-- Los dos, como `rest`: quien está enfermo es el cliente, y es quien primero lo
-- sabe. Las políticas de la 0123 solo le cierran `refeed` y `diet_break`, así
-- que no hay que tocarlas. Sin kcal: el CHECK de la 0123 ya lo impide.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'hasta'
  ) THEN
    RAISE EXCEPTION 'Falta 0123_el_replanteo_y_las_intervenciones.sql.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_kind_check;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_kind_check CHECK (
    kind IN ('checkin', 'note', 'appointment', 'goal', 'rest', 'race', 'refeed', 'diet_break', 'illness')
  );

ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_hasta_ordenada;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_hasta_ordenada CHECK (
    hasta IS NULL OR (hasta >= date AND kind IN ('rest', 'refeed', 'diet_break', 'illness'))
  );

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   INSERT INTO public.client_events (client_id, date, hasta, kind, title, created_by)
--   VALUES ('<id>', CURRENT_DATE, CURRENT_DATE + 4, 'illness', 'Gripe', auth.uid());
--   -- entra
--
--   UPDATE public.client_events SET kcal = 2000 WHERE kind = 'illness';
--   -- ERROR: violates check constraint "client_events_kcal_intervencion"
--
-- Para deshacer: volver a poner los dos CHECK de la 0123 (fallará si ya hay
-- alguna fila `illness`; borrarlas antes).
-- ============================================================================
