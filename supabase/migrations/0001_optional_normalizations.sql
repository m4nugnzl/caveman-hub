-- ============================================================================
-- Normalizaciones OPCIONALES
-- ----------------------------------------------------------------------------
-- La aplicación FUNCIONA SIN EJECUTAR ESTO. Son dos mejoras que eliminan
-- soluciones de compromiso que hoy vive el código, no requisitos.
--
-- Ejecútalo cuando quieras; es aditivo e idempotente. Después de aplicarlo,
-- busca en el código los comentarios que citan este archivo para simplificar
-- las dos partes afectadas.
-- ============================================================================

BEGIN;

-- ── 1. UNIQUE (coach_id, name) en las bibliotecas del coach ─────────────────
--
-- Sin esta constraint no se puede hacer `upsert ... on conflict (coach_id, name)`,
-- así que `upsertByName` en src/context/AppContext.jsx tiene que consultar
-- primero y luego decidir entre INSERT y UPDATE: dos peticiones en vez de una.
--
-- Además, hoy nada impide dos ejercicios con el mismo nombre para el mismo
-- entrenador, lo que ensucia el autocompletado.
--
-- Los DELETE de abajo eliminan duplicados previos (conservando el más antiguo),
-- porque crear la constraint fallaría si existen.

DELETE FROM public.exercises e
USING public.exercises dup
WHERE e.coach_id = dup.coach_id
  AND e.name = dup.name
  AND e.ctid > dup.ctid;

DELETE FROM public.foods f
USING public.foods dup
WHERE f.coach_id = dup.coach_id
  AND f.name = dup.name
  AND f.ctid > dup.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS exercises_coach_name_key
  ON public.exercises (coach_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS foods_coach_name_key
  ON public.foods (coach_id, name);


-- ── 2. Metadatos de las fotos de progreso en columnas propias ───────────────
--
-- `progress_photos` solo tiene `photo_url`, `tag` y `created_at`. El ángulo, el
-- peso y las notas se guardan hoy como un pequeño JSON dentro de `tag` (ver
-- src/lib/mappers.js). Funciona, pero impide filtrar u ordenar por esos campos
-- desde SQL.
--
-- Estas columnas los sacan a la luz. La conversión de las filas existentes se
-- hace más abajo, y `tag` se conserva intacto para no perder nada.

ALTER TABLE public.progress_photos
  ADD COLUMN IF NOT EXISTS angle    text,
  ADD COLUMN IF NOT EXISTS weight   numeric,
  ADD COLUMN IF NOT EXISTS notes    text,
  ADD COLUMN IF NOT EXISTS taken_on date;

-- Filas cuyo `tag` es el JSON que escribe la aplicación.
UPDATE public.progress_photos
SET angle  = COALESCE(angle,  tag::jsonb ->> 'angle'),
    weight = COALESCE(weight, (tag::jsonb ->> 'weight')::numeric),
    notes  = COALESCE(notes,  tag::jsonb ->> 'notes')
WHERE tag LIKE '{%'
  AND tag IS NOT NULL;

-- Filas antiguas cuyo `tag` era texto plano con el ángulo.
UPDATE public.progress_photos
SET angle = COALESCE(angle, tag)
WHERE tag IS NOT NULL
  AND tag NOT LIKE '{%';

-- La fecha de la foto era hasta ahora la de creación de la fila.
UPDATE public.progress_photos
SET taken_on = COALESCE(taken_on, created_at::date);

COMMIT;
