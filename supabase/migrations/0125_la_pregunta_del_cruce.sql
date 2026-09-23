-- ============================================================================
-- La pregunta del cruce
-- ----------------------------------------------------------------------------
-- Requiere `0073_el_roadmap_se_bifurca.sql` (los caminos). Se para sola si
-- falta.
--
-- ⚠️  Aditiva: una columna que nace nula y dos CHECK que ninguna fila actual
--     incumple. Sin esta migración la aplicación sigue igual: el cruce se lee
--     por la frase de cada camino, como hasta hoy.
--
-- ══ Qué resuelve ════════════════════════════════════════════════════════════
--
-- Un cruce eran dos o tres caminos, cada uno con su «si…». Leído en la tabla
-- del roadmap, eso son dos condiciones sueltas: «Si llega al Nacional con
-- margen» y «Si todavía le sobra». La decisión que se toma el día del cruce es
-- UNA pregunta —«¿Llega al Nacional con margen?»— y los caminos son sus
-- respuestas. Escrita una vez, la pantalla la enseña encima de las ramas y cada
-- rama se lee como lo que es: «Sí → Transición», «No → Seguir definiendo».
--
-- Vive en la fase, al lado de `next_options`, porque es del mismo cruce: se
-- escribe con él, se va con él al elegir o al descartar.
--
-- La frase no se evalúa: la contesta el entrenador. Ver `domain/fork.js`.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_phases' AND column_name = 'next_options'
  ) THEN
    RAISE EXCEPTION 'Falta 0073_el_roadmap_se_bifurca.sql.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.client_phases
  ADD COLUMN IF NOT EXISTS next_question text;

COMMENT ON COLUMN public.client_phases.next_question IS
  'La pregunta que decide el cruce («¿Llega al Nacional con margen?»). '
  'Solo con next_options. Ver la migración 0125.';

/* Una frase, no un documento. */
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_next_question_len;
ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_next_question_len CHECK (
    next_question IS NULL OR char_length(next_question) BETWEEN 1 AND 200
  );

/* Sin caminos no hay pregunta: se escriben y se borran juntos. */
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_question_needs_fork;
ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_question_needs_fork CHECK (
    next_question IS NULL OR next_options IS NOT NULL
  );

COMMIT;

-- ============================================================================
-- Sobre RLS no hay nada que hacer: la columna hereda las políticas de la fase
-- (0028). Escribe el entrenador; lee el cliente.
--
-- Comprobarlo:
--   UPDATE public.client_phases SET next_question = '¿Llega?' WHERE next_options IS NULL;
--   -- debe fallar con client_phases_question_needs_fork
-- ============================================================================
