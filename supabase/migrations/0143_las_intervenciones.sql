-- ============================================================================
-- Las intervenciones: el refeed escalonado y lo que el entrenador piensa de ella
-- ----------------------------------------------------------------------------
-- Requiere 0124 (nutrition_plan_versions), 0133 (draft_blocks) y 0142 (macros
-- y nota del refeed). Se para sola si falta alguna.
--
-- ⚠️  Aditiva: una columna que nace nula, un CHECK, un disparador ampliado y una
--     tabla nueva solo del entrenador. No reescribe ninguna fila.
--
-- ══ Una intervención no es una tabla de hechos nueva ═══════════════════════
--
-- Los hechos ya existen con fecha:
--   · refeed / diet break → client_events (0123, 0142)
--   · cambio de kcal, macros, pasos o cardio → nutrition_plan_versions (0124)
--   · cambio de split → un bloque de workout_data.blocks (o draft_blocks, lo
--     previsto; al empezarlo pasa a blocks CON EL MISMO id)
-- La lista de intervenciones se DERIVA de esas tres fuentes al leer
-- (`domain/intervenciones.js`). Lo que faltaba es:
--   1. la pauta día a día de un refeed escalonado;
--   2. la capa del entrenador: el motivo, la valoración y las ventanas que ha
--      movido a mano. Es privada: el cliente lee sus client_events, así que
--      nada de esto puede vivir ahí.
-- Prevista o hecha NO se guarda: sale de la fecha contra hoy.
--
-- ══ Dos textos distintos ═══════════════════════════════════════════════════
--
--   client_events.nota (0142)          → «Indicación para el cliente»: la ve él
--                                         («mete los carbos alrededor del entreno»).
--   client_interventions.motivo (aquí) → «Motivo (solo tú)»: el porqué.
--
-- ══ Integridad: una referencia que apunta a tres sitios ════════════════════
--
-- Una columna por fuente y un CHECK que exige exactamente una:
--   · event_id   → FK a client_events ON DELETE CASCADE.
--   · dieta_dia  → FK compuesta (client_id, dieta_dia) a nutrition_plan_versions
--                  ON DELETE CASCADE. Si el disparador de 0124 borra la versión
--                  («lo deshecho no deja rastro»), la fila se va con ella. Varias
--                  escrituras del mismo día son UNA versión (su clave es el día):
--                  la fila sigue apuntando a la última.
--   · bloque_id  → vive en un jsonb: no admite FK. Dos disparadores hacen su
--                  papel: al escribir la fila, el bloque tiene que existir en
--                  blocks o draft_blocks; al reescribir workout_data (o
--                  borrarla), las filas cuyo bloque ya no está en ninguna de
--                  las dos listas se borran.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.nutrition_plan_versions') IS NULL THEN
    RAISE EXCEPTION 'Falta 0124 (nutrition_plan_versions).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_data' AND column_name = 'draft_blocks'
  ) THEN
    RAISE EXCEPTION 'Falta 0133_los_bloques_en_borrador.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'proteina_g'
  ) THEN
    RAISE EXCEPTION 'Falta 0142_la_pauta_del_refeed.sql.';
  END IF;
END $$;

BEGIN;

-- ── 1. El refeed escalonado ────────────────────────────────────────────────
-- Un elemento por día, desde `date` hasta `hasta`, en orden:
--   [{ "kcal": 3000, "p": 180, "c": 420, "g": 60 }, { "kcal": 3400, … }]
-- O pauta única (kcal y macros en sus columnas, como hasta ahora) o por días:
-- nunca las dos, para que un martes no tenga dos cifras.
ALTER TABLE public.client_events
  ADD COLUMN IF NOT EXISTS pauta_dias jsonb;

ALTER TABLE public.client_events DROP CONSTRAINT IF EXISTS client_events_pauta_dias;
ALTER TABLE public.client_events
  ADD CONSTRAINT client_events_pauta_dias CHECK (
    pauta_dias IS NULL OR (
      kind IN ('refeed', 'diet_break')
      AND hasta IS NOT NULL
      AND jsonb_typeof(pauta_dias) = 'array'
      AND jsonb_array_length(pauta_dias) = (hasta - date) + 1
      AND jsonb_array_length(pauta_dias) BETWEEN 2 AND 28
      AND num_nonnulls(kcal, proteina_g, carbohidratos_g, grasa_g) = 0
    )
  );

/*
  El disparador de 0142, ampliado: la misma regla día a día. Con las tres
  macros, las kcal SE CALCULAN (4/4/9); sin ninguna, kcal a mano; con una o
  dos, error. Cada día entre 800 y 8000, como la pauta única (0123).
*/
CREATE OR REPLACE FUNCTION public.tg_kcal_de_las_macros()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dia   jsonb;
  dias  jsonb := '[]'::jsonb;
  p     numeric;
  c     numeric;
  g     numeric;
  kcal  numeric;
  n     int;
BEGIN
  IF NEW.proteina_g IS NOT NULL
     AND NEW.carbohidratos_g IS NOT NULL
     AND NEW.grasa_g IS NOT NULL THEN
    NEW.kcal := 4 * NEW.proteina_g + 4 * NEW.carbohidratos_g + 9 * NEW.grasa_g;
  END IF;

  IF NEW.pauta_dias IS NOT NULL AND jsonb_typeof(NEW.pauta_dias) = 'array' THEN
    FOR dia IN SELECT value FROM jsonb_array_elements(NEW.pauta_dias) LOOP
      IF jsonb_typeof(dia) <> 'object' THEN
        RAISE EXCEPTION 'pauta_dias: cada día es un objeto {kcal, p, c, g}';
      END IF;
      p := (dia->>'p')::numeric;
      c := (dia->>'c')::numeric;
      g := (dia->>'g')::numeric;
      n := num_nonnulls(p, c, g);
      IF n = 3 THEN
        IF p < 0 OR c < 0 OR g < 0 OR p > 1000 OR c > 1000 OR g > 1000 THEN
          RAISE EXCEPTION 'pauta_dias: macros entre 0 y 1000 g';
        END IF;
        kcal := 4 * p + 4 * c + 9 * g;
        dia := jsonb_build_object('kcal', kcal, 'p', p, 'c', c, 'g', g);
      ELSIF n = 0 THEN
        kcal := (dia->>'kcal')::numeric;
        dia := jsonb_build_object('kcal', kcal);
      ELSE
        RAISE EXCEPTION 'pauta_dias: las tres macros o ninguna';
      END IF;
      IF kcal IS NULL OR kcal < 800 OR kcal > 8000 THEN
        RAISE EXCEPTION 'pauta_dias: cada día entre 800 y 8000 kcal';
      END IF;
      dias := dias || jsonb_build_array(dia);
    END LOOP;
    NEW.pauta_dias := dias;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_events_kcal_de_las_macros ON public.client_events;
CREATE TRIGGER client_events_kcal_de_las_macros
  BEFORE INSERT OR UPDATE OF proteina_g, carbohidratos_g, grasa_g, kcal, pauta_dias ON public.client_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_kcal_de_las_macros();

-- ── 2. La capa del entrenador ──────────────────────────────────────────────
-- Una fila SOLO cuando el entrenador escribe algo (motivo, valoración o
-- ventanas). No se sincroniza con nada.
CREATE TABLE IF NOT EXISTS public.client_interventions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  -- De qué intervención habla: una y solo una fuente.
  event_id        uuid REFERENCES public.client_events (id) ON DELETE CASCADE,
  dieta_dia       date,   -- con client_id, la versión de la dieta de ese día
  bloque_id       text,   -- el id del bloque en workout_data (jsonb: sin FK)

  motivo          text CHECK (motivo IS NULL OR char_length(btrim(motivo)) BETWEEN 1 AND 280),
  valoracion      text CHECK (valoracion IN ('funciono', 'no_funciono', 'dudoso')),
  valoracion_nota text CHECK (valoracion_nota IS NULL OR char_length(btrim(valoracion_nota)) BETWEEN 1 AND 280),
  valorada_el     timestamptz,

  -- Las ventanas movidas a mano; nulas = 7 días, recortados por fases y otras
  -- intervenciones. Se calculan al leer, y una ventana que ya no cuadra con
  -- las fechas de la intervención (se movió el refeed) se ignora.
  antes_desde     date,
  despues_hasta   date,

  created_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_interventions_una_fuente CHECK (num_nonnulls(event_id, dieta_dia, bloque_id) = 1),
  CONSTRAINT client_interventions_nota_con_valoracion CHECK (valoracion IS NOT NULL OR valoracion_nota IS NULL),
  CONSTRAINT client_interventions_dieta FOREIGN KEY (client_id, dieta_dia)
    REFERENCES public.nutrition_plan_versions (client_id, dia) ON DELETE CASCADE,
  CONSTRAINT client_interventions_evento_unico UNIQUE (event_id),
  CONSTRAINT client_interventions_dieta_unica UNIQUE (client_id, dieta_dia),
  CONSTRAINT client_interventions_bloque_unico UNIQUE (client_id, bloque_id)
);

/*
  Al escribir: la marca de tiempo, que el evento sea de este cliente y sea una
  intervención (no una cita ni unas vacaciones), y que el bloque exista.
*/
CREATE OR REPLACE FUNCTION public.tg_client_interventions_antes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM client_events e
    WHERE e.id = NEW.event_id AND e.client_id = NEW.client_id
      AND e.kind IN ('refeed', 'diet_break')
  ) THEN
    RAISE EXCEPTION 'La intervención apunta a un evento que no es un refeed ni un diet break de este cliente';
  END IF;
  IF NEW.bloque_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workout_data w,
      jsonb_array_elements(coalesce(w.blocks, '[]'::jsonb) || coalesce(w.draft_blocks, '[]'::jsonb)) b
    WHERE w.client_id = NEW.client_id AND b->>'id' = NEW.bloque_id
  ) THEN
    RAISE EXCEPTION 'La intervención apunta a un bloque que no existe';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_interventions_antes ON public.client_interventions;
CREATE TRIGGER client_interventions_antes
  BEFORE INSERT OR UPDATE ON public.client_interventions
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_interventions_antes();

/*
  El ON DELETE CASCADE de los bloques: al reescribir la lista (o borrar la
  fila del programa), fuera las filas de los bloques que ya no están ni
  empezados ni en borrador. Empezar un borrador conserva el id: no borra nada.
*/
CREATE OR REPLACE FUNCTION public.tg_intervenciones_sin_bloque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM client_interventions
    WHERE client_id = OLD.client_id AND bloque_id IS NOT NULL;
    RETURN NULL;
  END IF;
  DELETE FROM client_interventions i
  WHERE i.client_id = NEW.client_id
    AND i.bloque_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(NEW.blocks, '[]'::jsonb) || coalesce(NEW.draft_blocks, '[]'::jsonb)) b
      WHERE b->>'id' = i.bloque_id
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS workout_data_intervenciones_sin_bloque ON public.workout_data;
CREATE TRIGGER workout_data_intervenciones_sin_bloque
  AFTER UPDATE OF blocks, draft_blocks OR DELETE ON public.workout_data
  FOR EACH ROW EXECUTE FUNCTION public.tg_intervenciones_sin_bloque();

-- Solo el equipo (app_can_read_client no incluye al cliente; eso es
-- app_is_client): el cliente no ve ni el motivo ni la valoración.
ALTER TABLE public.client_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interventions_read" ON public.client_interventions;
CREATE POLICY "interventions_read" ON public.client_interventions
  FOR SELECT TO authenticated USING (public.app_can_read_client(client_id));
DROP POLICY IF EXISTS "interventions_insert" ON public.client_interventions;
CREATE POLICY "interventions_insert" ON public.client_interventions
  FOR INSERT TO authenticated
  WITH CHECK (public.app_can_write_client(client_id) AND created_by = auth.uid());
DROP POLICY IF EXISTS "interventions_update" ON public.client_interventions;
CREATE POLICY "interventions_update" ON public.client_interventions
  FOR UPDATE TO authenticated
  USING (public.app_can_write_client(client_id)) WITH CHECK (public.app_can_write_client(client_id));
DROP POLICY IF EXISTS "interventions_delete" ON public.client_interventions;
CREATE POLICY "interventions_delete" ON public.client_interventions
  FOR DELETE TO authenticated USING (public.app_can_write_client(client_id));

-- Sin GRANT, RLS da un 403 que no se ve.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_interventions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_interventions TO service_role;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Refeed escalonado: las kcal de cada día se calculan (da 2997 y 3400):
--
--   UPDATE public.client_events SET kcal = NULL, proteina_g = NULL,
--     carbohidratos_g = NULL, grasa_g = NULL,
--     pauta_dias = '[{"p":180,"c":450,"g":53},{"kcal":3400}]'
--   WHERE id = '<un refeed de dos días>' RETURNING pauta_dias;
--
-- 2) Borrar el refeed borra su fila de client_interventions (cascada).
-- 3) Quitar un bloque de workout_data.blocks borra la suya (disparador).
--
-- Para deshacer:
--   DROP TRIGGER workout_data_intervenciones_sin_bloque ON public.workout_data;
--   DROP FUNCTION public.tg_intervenciones_sin_bloque();
--   DROP TABLE public.client_interventions;
--   DROP FUNCTION public.tg_client_interventions_antes();
--   ALTER TABLE public.client_events DROP COLUMN pauta_dias;  -- (su CHECK se va con ella)
--   y devolver tg_kcal_de_las_macros y su disparador a la versión de la 0142.
-- ============================================================================
