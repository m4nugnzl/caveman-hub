-- ============================================================================
-- Las variaciones de la dieta: su menú, de qué día parten y sin solapes
-- ----------------------------------------------------------------------------
-- Requiere 0028 (btree_gist) y 0143 (pauta_dias). Se para sola si falta
-- alguna, y también si ya hay dos refeeds o diet breaks que se pisan: los
-- enumera para arreglarlos a mano antes de volver a correrla.
--
-- ⚠️  Aditiva: dos columnas que nacen nulas, dos CHECK y una restricción de
--     exclusión. No reescribe ninguna fila ni ninguna política: el cliente ya
--     lee sus client_events (y con ellos el menú de su refeed), y solo el
--     entrenador escribe refeeds y diet breaks (0123).
--
-- ══ Una variación sigue siendo un client_event ═════════════════════════════
--
-- Un refeed o un diet break es una variación de la dieta de unos días
-- concretos: sus cifras (kcal y macros, 0142; o día a día, 0143), la
-- indicación para el cliente (`nota`, 0142) y el motivo solo del entrenador
-- (`client_interventions`, 0143). Lo que faltaba:
--
--   1. `menu` — SU menú, opcional y DÍA A DÍA: un elemento por día, desde
--      `date` hasta `hasta`, alineado con `pauta_dias` (0143). Cada elemento es
--      la lista `meals` de un día de la dieta (la forma de siempre) o nulo.
--      Un día nulo = sin menú: el cliente ve las cifras de ese día y la
--      indicación, y no el menú de la dieta base (que es de otras cifras).
--      «Añadir menú» copia el del día del que parte a todos sus días y cada
--      uno se edita por separado; «Usar el mismo menú todos los días» es un
--      atajo del formulario que escribe la misma lista en cada elemento.
--
--   2. `parte_de` — el tipo de día del que se copiaron las cifras, CONGELADO
--      al crearla: { "dia_id", "nombre", "kcal", "p", "c", "g" }. Si después
--      cambia la dieta base, la variación se queda como se definió; con esto
--      la app compara las cifras de ese día en las versiones fechadas de la
--      dieta (0124) y avisa: «La dieta base cambió el 2 oct; revisa si la
--      pauta sigue teniendo sentido». Sin él no hay con qué comparar.
--
--   3. Sin solapes — dos variaciones no pueden cubrir el mismo día. La
--      misma herramienta que ya impide que dos fases se pisen (0028): una
--      exclusión por cliente y rango de fechas, solo entre refeeds y diet
--      breaks. El formulario lo impide antes diciendo con cuál choca; esto es
--      la garantía de que ningún otro camino deje dos cifras para un martes.
-- ============================================================================

DO $$
DECLARE
  choques text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
    RAISE EXCEPTION 'Falta btree_gist (0028_client_roadmap.sql).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'pauta_dias'
  ) THEN
    RAISE EXCEPTION 'Falta 0143_las_intervenciones.sql.';
  END IF;

  SELECT string_agg(format('%s: %s…%s y %s…%s', a.client_id, a.date, coalesce(a.hasta, a.date), b.date, coalesce(b.hasta, b.date)), E'\n')
  INTO choques
  FROM public.client_events a
  JOIN public.client_events b
    ON a.client_id = b.client_id AND a.id < b.id
   AND a.kind IN ('refeed', 'diet_break') AND b.kind IN ('refeed', 'diet_break')
   AND a.date <= coalesce(b.hasta, b.date) AND b.date <= coalesce(a.hasta, a.date);
  IF choques IS NOT NULL THEN
    RAISE EXCEPTION E'Hay variaciones que se pisan; arréglalas antes:\n%', choques;
  END IF;
END $$;

BEGIN;

ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS menu jsonb,
  ADD COLUMN IF NOT EXISTS parte_de jsonb;

-- El menú: un elemento por día de la variación (nulo o la lista de comidas
-- de ese día, de 1 a 12) y con techo: un menú de verdad pesa unos pocos KB
-- por día; 512 KB es un error, no un menú.
ALTER TABLE public.client_events DROP CONSTRAINT IF EXISTS client_events_menu;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_menu CHECK (
    menu IS NULL OR (
      kind IN ('refeed', 'diet_break')
      AND jsonb_typeof(menu) = 'array'
      AND jsonb_array_length(menu) = (coalesce(hasta, date) - date) + 1
      AND jsonb_array_length(menu) BETWEEN 1 AND 28
      AND NOT jsonb_path_exists(menu, 'strict $[*] ? (@.type() != "null" && @.type() != "array")')
      AND NOT jsonb_path_exists(menu, 'strict $[*] ? (@.type() == "array" && (@.size() < 1 || @.size() > 12))')
      AND octet_length(menu::text) <= 524288
    )
  );

ALTER TABLE public.client_events DROP CONSTRAINT IF EXISTS client_events_parte_de;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_parte_de CHECK (
    parte_de IS NULL OR (
      kind IN ('refeed', 'diet_break')
      AND jsonb_typeof(parte_de) = 'object'
      AND octet_length(parte_de::text) <= 1024
    )
  );

-- Dos variaciones nunca cubren el mismo día. `[]`: el último día cuenta.
ALTER TABLE public.client_events DROP CONSTRAINT IF EXISTS client_events_variaciones_sin_solape;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_variaciones_sin_solape
  EXCLUDE USING gist (
    client_id WITH =,
    daterange(date, coalesce(hasta, date), '[]') WITH &&
  ) WHERE (kind IN ('refeed', 'diet_break'));

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Un refeed que pisa a otro del mismo cliente falla con 23P01
--    (exclusion_violation), que la app traduce («Choca con …»).
-- 2) Un menú en una cita falla por client_events_menu; también uno que no
--    tiene un elemento por día (cambiar las fechas obliga a reescribirlo).
-- 3) Vacaciones, enfermedad o competición NO entran en la exclusión: pueden
--    coincidir con una variación. Solo refeed contra refeed o diet break.
--
-- Para deshacer:
--   ALTER TABLE public.client_events
--     DROP CONSTRAINT client_events_variaciones_sin_solape,
--     DROP COLUMN menu, DROP COLUMN parte_de;   -- (sus CHECK se van con ellas)
-- ============================================================================
