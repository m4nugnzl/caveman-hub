-- ============================================================================
-- UNIQUE (client_id) en las tablas de un bloque por cliente
-- ----------------------------------------------------------------------------
-- Recomendada, no imprescindible: la aplicación ya funciona sin ella porque
-- guarda con UPDATE-y-si-no-existe-INSERT en vez de `upsert`.
--
-- ── Por qué conviene igualmente ─────────────────────────────────────────────
-- `workout_data`, `anthropometry` y `nutrition_plans` guardan UNA fila por
-- cliente. Hoy nada lo impone: dos escrituras simultáneas (dos pestañas, o el
-- entrenador y el cliente a la vez) pueden crear dos filas para el mismo
-- cliente. A partir de ahí la aplicación lee una y escribe otra, y los datos se
-- parten en dos sin ningún error visible. Es el tipo de fallo que tarda semanas
-- en detectarse.
--
-- `schema.sql` declara estas constraints, pero es una reconstrucción: al menos
-- en `anthropometry` no existen de verdad. Este archivo las crea de forma
-- idempotente, así que es seguro ejecutarlo aunque alguna ya esté.
--
-- OJO: si ya hay filas duplicadas, la creación del índice fallará. Los bloques
-- de limpieza de abajo conservan la fila MÁS RECIENTE de cada cliente (la que
-- tiene el `updated_at` mayor) y borran el resto. Revisa el SELECT de
-- comprobación antes de ejecutar los DELETE.
-- ============================================================================

-- ── Comprobación previa: ¿hay duplicados? Ejecuta esto primero. ─────────────
--
--   select 'workout_data' as tabla, client_id, count(*)
--     from public.workout_data group by client_id having count(*) > 1
--   union all
--   select 'anthropometry', client_id, count(*)
--     from public.anthropometry group by client_id having count(*) > 1
--   union all
--   select 'nutrition_plans', client_id, count(*)
--     from public.nutrition_plans group by client_id having count(*) > 1;
--
-- Si no devuelve nada, puedes saltarte los DELETE.

BEGIN;

-- Conserva la fila más reciente por cliente y descarta las demás.
DELETE FROM public.workout_data w
USING public.workout_data dup
WHERE w.client_id = dup.client_id
  AND (w.updated_at, w.id) < (dup.updated_at, dup.id);

DELETE FROM public.anthropometry a
USING public.anthropometry dup
WHERE a.client_id = dup.client_id
  AND (a.updated_at, a.id) < (dup.updated_at, dup.id);

DELETE FROM public.nutrition_plans n
USING public.nutrition_plans dup
WHERE n.client_id = dup.client_id
  AND (n.updated_at, n.id) < (dup.updated_at, dup.id);

CREATE UNIQUE INDEX IF NOT EXISTS workout_data_client_id_uidx
  ON public.workout_data (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS anthropometry_client_id_uidx
  ON public.anthropometry (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS nutrition_plans_client_id_uidx
  ON public.nutrition_plans (client_id);

COMMIT;
