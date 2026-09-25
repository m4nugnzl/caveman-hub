-- ============================================================================
-- La pauta del refeed: macros y nota
-- ----------------------------------------------------------------------------
-- Requiere `0123_el_replanteo_y_las_intervenciones.sql` (la columna `kcal` y el
-- CHECK que la acota) y `0141_la_enfermedad.sql` (el último CHECK de `kind`).
-- Se para sola si falta alguna.
--
-- ⚠️  Aditiva: cuatro columnas que nacen nulas, tres CHECK y un disparador que
--     solo actúa cuando alguien escribe macros. No reescribe ninguna fila ni
--     ninguna política: los refeeds y diet breaks que ya existen conservan sus
--     kcal escritas a mano.
--
-- ══ Por qué aquí y no en la dieta ══════════════════════════════════════════
--
-- Un refeed o un diet break es PAUTA de unos días concretos. La dieta solo se
-- fecha «desde hoy» (0124), así que corregir un refeed pasado reescribiría su
-- historia. El evento ya tiene su fecha, su «hasta», sus kcal, sus permisos
-- (solo el entrenador, 0123) y su sitio en el calendario. La pauta de un día la
-- decide `pautaDelDia` (`domain/pautaDelDia.js`): si lo cubre un refeed o un
-- diet break, la suya; si no, el día que toque de la dieta.
--
-- ══ Kcal y macros nunca se contradicen ═════════════════════════════════════
--
-- Con macros, las kcal SE CALCULAN (4/4/9) y lo que se escriba en `kcal` se
-- descarta: lo hace el disparador, así que ni un cliente viejo ni una consulta
-- a mano pueden dejar kcal y macros incoherentes. Sin macros, las kcal se
-- escriben a mano como hasta ahora. Las macros van las tres o ninguna: con una
-- sola no hay kcal que calcular.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'kcal'
  ) THEN
    RAISE EXCEPTION 'Falta 0123_el_replanteo_y_las_intervenciones.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_events_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%illness%'
  ) THEN
    RAISE EXCEPTION 'Falta 0141_la_enfermedad.sql.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS proteina_g smallint,
  ADD COLUMN IF NOT EXISTS carbohidratos_g smallint,
  ADD COLUMN IF NOT EXISTS grasa_g smallint,
  ADD COLUMN IF NOT EXISTS nota text;

/*
  Solo en lo que es pauta, las tres o ninguna, y en gramos humanos. Con
  1000 g de cada una el techo de kcal (8000, 0123) salta antes, que es lo que
  debe mandar. `num_nonnulls` y no los BETWEEN solos: un CHECK que da NULL
  pasa, y con una macro vacía los BETWEEN dan NULL.
*/
ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_macros_intervencion;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_macros_intervencion CHECK (
    num_nonnulls(proteina_g, carbohidratos_g, grasa_g) = 0
    OR (
      num_nonnulls(proteina_g, carbohidratos_g, grasa_g) = 3
      AND kind IN ('refeed', 'diet_break')
      AND proteina_g BETWEEN 0 AND 1000
      AND carbohidratos_g BETWEEN 0 AND 1000
      AND grasa_g BETWEEN 0 AND 1000
    )
  );

/*
  Con macros, `kcal` es exactamente su cuenta. El disparador de abajo la
  escribe; este CHECK es la garantía de que nada la ha tocado después.
*/
ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_kcal_de_las_macros;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_kcal_de_las_macros CHECK (
    proteina_g IS NULL
    OR kcal IS NOT DISTINCT FROM 4 * proteina_g + 4 * carbohidratos_g + 9 * grasa_g
  );

/*
  La nota: el porqué, en cualquier hecho («boda del hermano», «tras la
  competición»). Nula si no hay, nunca cadena vacía.
*/
ALTER TABLE public.client_events
  DROP CONSTRAINT IF EXISTS client_events_nota_corta;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_nota_corta CHECK (
    nota IS NULL OR char_length(nota) BETWEEN 1 AND 280
  );

CREATE OR REPLACE FUNCTION public.tg_kcal_de_las_macros()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.proteina_g IS NOT NULL
     AND NEW.carbohidratos_g IS NOT NULL
     AND NEW.grasa_g IS NOT NULL THEN
    NEW.kcal := 4 * NEW.proteina_g + 4 * NEW.carbohidratos_g + 9 * NEW.grasa_g;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_events_kcal_de_las_macros ON public.client_events;
CREATE TRIGGER client_events_kcal_de_las_macros
  BEFORE INSERT OR UPDATE OF proteina_g, carbohidratos_g, grasa_g, kcal ON public.client_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_kcal_de_las_macros();

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que todo nació vacío (debe dar 0):
--
--   SELECT count(*) FROM public.client_events
--   WHERE proteina_g IS NOT NULL OR nota IS NOT NULL;
--
-- 2) Con macros, las kcal se calculan aunque se escriban otras (da 2997):
--
--   UPDATE public.client_events
--   SET proteina_g = 180, carbohidratos_g = 450, grasa_g = 53, kcal = 1
--   WHERE id = '<un refeed>' RETURNING kcal;   -- 4·180 + 4·450 + 9·53 = 2997
--
-- 3) Una sola macro falla:
--
--   UPDATE public.client_events SET proteina_g = 180 WHERE id = '<un refeed>';
--   -- ERROR: violates check constraint "client_events_macros_intervencion"
--
-- Para deshacer:
--
--   DROP TRIGGER client_events_kcal_de_las_macros ON public.client_events;
--   DROP FUNCTION public.tg_kcal_de_las_macros();
--   ALTER TABLE public.client_events
--     DROP COLUMN proteina_g, DROP COLUMN carbohidratos_g,
--     DROP COLUMN grasa_g, DROP COLUMN nota;
--   -- (los CHECK se van con sus columnas)
-- ============================================================================
