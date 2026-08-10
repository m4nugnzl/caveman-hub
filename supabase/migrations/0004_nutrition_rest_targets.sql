-- ============================================================================
-- Objetivo nutricional de los días de descanso en columnas propias
-- ----------------------------------------------------------------------------
-- Recomendada, no imprescindible: la aplicación ya funciona sin ella.
--
-- ── El problema ─────────────────────────────────────────────────────────────
-- Cuando un cliente tiene dieta de entreno y dieta de descanso hacen falta DOS
-- objetivos de calorías y macros: en un día de descanso cambian las kcal y el
-- reparto, que es justo el motivo de separar las dos dietas. La tabla solo tiene
-- un juego de columnas (`target_kcals`, `protein_grams`, `carbs_grams`,
-- `fats_grams`).
--
-- ── Cómo funciona ahora ─────────────────────────────────────────────────────
-- Las columnas existentes guardan el objetivo de los días de ENTRENO (o el
-- único, si no hay variantes), y el de descanso va como JSON dentro de `meals`,
-- una columna jsonb heredada de una versión anterior que la aplicación no usa
-- para nada más:
--
--     meals = { "restTargets": { "targetKcals": 2200, "proteinGrams": 180, … } }
--
-- Funciona y está contenido en `src/lib/mappers.js`, pero mezcla dos cosas en
-- una columna con un nombre que no las describe.
--
-- ── Qué hace esta migración ─────────────────────────────────────────────────
-- Saca esos cuatro valores a columnas propias y convierte los datos existentes.
-- `meals` se conserva intacta por si acaso.
--
-- Después de aplicarla hay que actualizar `mapNutritionFromDb` y
-- `mapNutritionToDb` para leer y escribir las columnas nuevas en lugar de
-- `meals`. Búscalas por el comentario que cita este archivo.
-- ============================================================================

BEGIN;

ALTER TABLE public.nutrition_plans
  ADD COLUMN IF NOT EXISTS rest_target_kcals numeric,
  ADD COLUMN IF NOT EXISTS rest_protein_grams numeric,
  ADD COLUMN IF NOT EXISTS rest_carbs_grams numeric,
  ADD COLUMN IF NOT EXISTS rest_fats_grams numeric;

-- Conversión de las filas que ya guardan el objetivo de descanso en `meals`.
UPDATE public.nutrition_plans
SET rest_target_kcals  = COALESCE(rest_target_kcals,  (meals -> 'restTargets' ->> 'targetKcals')::numeric),
    rest_protein_grams = COALESCE(rest_protein_grams, (meals -> 'restTargets' ->> 'proteinGrams')::numeric),
    rest_carbs_grams   = COALESCE(rest_carbs_grams,   (meals -> 'restTargets' ->> 'carbsGrams')::numeric),
    rest_fats_grams    = COALESCE(rest_fats_grams,    (meals -> 'restTargets' ->> 'fatsGrams')::numeric)
WHERE jsonb_typeof(meals) = 'object'
  AND meals ? 'restTargets';

COMMIT;
