-- ============================================================================
-- Los bloques en borrador
-- ----------------------------------------------------------------------------
-- Añade UNA columna a `workout_data`: `draft_blocks`, la lista de bloques
-- previstos detrás del abierto. La forma y las reglas viven en
-- `src/domain/borradores.js`; aquí solo se garantiza que es una lista.
--
-- ══ Por qué una columna aparte y no dentro de `blocks` ══════════════════════
--
-- `continue_program` (0109), `training_summaries` (0110) y todo el cliente
-- suponen que el último elemento de `blocks` es el bloque ABIERTO. Un borrador
-- ahí dentro pasaría por el bloque en curso. Aparte, nadie que no lo pida lo
-- lee: el portal del cliente no los pinta (la fila sí es legible por él, como
-- el resto de `workout_data`; ver la nota en `docs/roadmap-replanteo.md`).
--
-- ══ Despliegue ══════════════════════════════════════════════════════════════
--
-- ANTES de publicar la versión que escribe borradores. Una versión anterior no
-- conoce la columna y no la manda nunca, así que ni la pisa ni la necesita. La
-- versión nueva solo la manda si la leyó (`mapWorkoutFromDb`), de modo que
-- publicarla antes tampoco rompe los guardados: solo no habría borradores.
--
-- No toca el disparador de la 0131: una versión vieja no puede cambiar esta
-- columna, porque no la conoce. Los permisos son los de la tabla (0046).
--
-- Para deshacer: `ALTER TABLE public.workout_data DROP COLUMN draft_blocks;`
-- (se pierden los borradores; copiar antes con `npm run backup`).
-- ============================================================================

ALTER TABLE public.workout_data
  ADD COLUMN IF NOT EXISTS draft_blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_data_draft_blocks_es_lista'
  ) THEN
    ALTER TABLE public.workout_data
      ADD CONSTRAINT workout_data_draft_blocks_es_lista CHECK (jsonb_typeof(draft_blocks) = 'array');
  END IF;
END
$$;

COMMENT ON COLUMN public.workout_data.draft_blocks IS
  'Bloques en borrador detrás del abierto, en orden. Ver src/domain/borradores.js. Empezar uno lo pasa a blocks con el mismo id.';
