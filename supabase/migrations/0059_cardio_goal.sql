-- ============================================================================
-- El cardio de alta intensidad, al lado de los pasos
-- ----------------------------------------------------------------------------
-- Una columna en `nutrition_plans`. No toca RLS ni ninguna función.
--
-- ══ Qué falta hoy ══════════════════════════════════════════════════════════
--
-- El plan nutricional puede prescribir los PASOS DIARIOS (`steps_goal`), que son
-- la actividad de base. Pero el gasto de un cliente tiene dos mitades y solo se
-- puede escribir una: el cardio de alta intensidad —los intervalos, el HIIT, los
-- diez minutos de bici al acabar— no existe en ningún campo.
--
-- Así que hoy acaba escrito en las «pautas» como un párrafo suelto, mezclado con
-- «bebe 2 L de agua», o directamente en WhatsApp. Y donde no está es donde se
-- decide: en la pantalla de las calorías.
--
-- ══ Por qué texto libre y no sesiones × minutos ════════════════════════════
--
-- Porque el cardio se prescribe de mil maneras y ninguna cabe en dos números:
-- «2 días, 10 rondas de 30/30 en bici», «15 min en cinta al 80 % después de
-- pierna», «lo que te pida el cuerpo, sin pasar de tres». Partirlo en casillas
-- obligaría a redondear la prescripción de todo el mundo a la forma que la
-- aplicación entiende — que es exactamente lo que hace inútil un campo.
--
-- Es la misma decisión que ya se tomó con `steps_goal`, y por eso es la misma
-- clase de columna. Cuando haga falta comparar cardio entre semanas, se compara
-- como se comparan los pasos: por lo que cambió el texto.
--
-- ── Por qué una columna y no dentro de `meals` ──────────────────────────────
-- `meals` es una columna jsonb heredada que se usó una vez como saco para el
-- objetivo de los días de descanso, y la migración 0004 existe precisamente para
-- deshacer ese apaño: «mezcla dos cosas en una columna con un nombre que no las
-- describe». No se repite.
--
-- ── Es del PLAN, no de la variante ──────────────────────────────────────────
-- Igual que los pasos. Un cliente con dos dietas —entreno y descanso— no tiene
-- dos cardios: tiene el suyo, haga el día que haga. Por eso va en la columna
-- principal y no se duplica en `rest_*`.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.nutrition_plans') IS NULL THEN
    RAISE EXCEPTION 'No existe `nutrition_plans`: falta el esquema base.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.nutrition_plans
  ADD COLUMN IF NOT EXISTS cardio_goal text;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT client_id, steps_goal, cardio_goal FROM public.nutrition_plans;
--
-- Y desde la APLICACIÓN: Nutrición de un cliente → la tarjeta «Cardio de alta
-- intensidad» al lado de la de pasos. Escribir algo y verlo en su portal, en
-- «Mi dieta».
--
-- ── Los planes anteriores ───────────────────────────────────────────────────
-- Se quedan con la columna a NULL. Al cliente no se le enseña la tarjeta vacía
-- —no hay nada que contarle—, exactamente igual que con los pasos sin definir.
-- ============================================================================
