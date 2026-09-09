-- ============================================================================
-- Tus etiquetas en tus alimentos, y las cuatro cifras del envase
-- (tanda 2 de `docs/replanteamiento-alimentos-y-ejercicios.md`: A-06 y M-01)
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin riesgo: cinco columnas nuevas en `foods`, cuatro en
--     `catalog_foods`. No toca ninguna política, ninguna fila y ningún dato.
--     Nada se recalcula: las dietas montadas siguen con su foto de macros.
--
-- ══ 1 · `foods.tags`: el aviso de alérgeno estaba ciego justo donde importa ══
--
-- La 0094 le puso `tags` a `catalog_foods` —hechos del alimento: gluten,
-- lactosa, huevo…— y `foodConflicts` los cruza con los condicionantes del
-- cliente para avisar al montar la dieta. Funciona, y **solo con el catálogo**.
--
-- La biblioteca del entrenador no tiene la columna, así que `mapLibraryFoodFromDb`
-- entrega la lista vacía y el aviso calla. Y lo que un entrenador da de alta es
-- justo lo que el catálogo no puede tener: **las marcas y los suplementos** —el
-- batido de suero, el pan de su panadería—, que es exactamente donde el alérgeno
-- importa. El aviso funcionaba con la pechuga de pollo y se callaba con lo tuyo.
--
-- Espejo exacto de la 0094: `text[] NOT NULL DEFAULT '{}'`, mismo vocabulario y
-- mismo significado. La lista vacía es «no dice», no «no lleva nada»; y quién
-- puede comérselo lo sigue decidiendo el cruce, que vive en el producto porque
-- es quien conoce los condicionantes.
--
-- ══ 2 · Las cuatro del envase ═══════════════════════════════════════════════
--
-- Fibra, azúcares, saturadas y sal. El criterio de selección **no es «los más
-- importantes»** —discusión sin final— sino la declaración nutricional
-- obligatoria en la UE: es el vocabulario del supermercado, cada número se
-- comprueba contra el producto físico, y —decisivo— **se rellena a mano**.
--
-- Eso último es lo que las hace viables aquí: `foods` no va a tener siembra
-- nunca, y sus alimentos son los de marca, que son los que traen la etiqueta
-- impresa. Cualquier micronutriente que exija una tabla de composición (hierro,
-- B12, vitamina D) es un proyecto de DATO con una licencia por resolver, y va
-- a otra tanda.
--
-- ── Nulables, y esto no es un detalle ──────────────────────────────────────
-- `NULL` es «no dice» y `0` es «no lleva», y confundirlos aquí es peor que no
-- tener la columna: si 12 de 18 alimentos de un día declaran fibra, el total del
-- día **es un suelo, no un total**. Un suelo presentado como total miente. Por
-- eso no hay DEFAULT 0 y por eso la cifra viaja siempre con su cobertura
-- (`sumMicros`, en `domain/micros.js`): «22 g de fibra · 12 de 18 lo declaran».
--
-- Es la misma regla que la 0094 aplicó a las etiquetas —«inventar un dato con
-- toda la pinta de ser correcto es peor que callar»—, y con los micros pasa de
-- prudente a obligatoria.
--
-- ── Y nunca objetivo, ni CDR, ni semáforo ─────────────────────────────────
-- No se guarda ningún objetivo de micro y no lo va a haber: una CDR depende de
-- sexo, edad, embarazo y medicación —datos que la app no tiene o sobre los que
-- no debe razonar— y una chapa roja en un micronutriente **es un diagnóstico**.
-- La app resalta la composición; el criterio es del entrenador.
--
-- ── Por qué en las DOS tablas ──────────────────────────────────────────────
-- `catalog_foods` para que un día se pueda sembrar la referencia, y `foods`
-- porque tu marca no está ni va a estar en el catálogo. Es el mismo reparto que
-- ya tienen los macros, y `mapCatalogFoodFromDb` devuelve la misma forma que
-- `mapLibraryFoodFromDb` justamente para que nadie tenga que traducir nada.
-- Las del catálogo nacen todas en NULL a propósito: sembrarlas es la tanda 4,
-- que empieza por resolver una licencia.
--
-- ── `numeric` y no `real` ──────────────────────────────────────────────────
-- Como los macros que ya están (`protein_per_100g`…). Un `real` guarda 1,1 g de
-- sal como 1,10000002384, y esto se lee copiado de un envase.
-- ============================================================================

BEGIN;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Las cuatro, por 100 g y nulables, en la biblioteca y en el catálogo.
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS fiber_per_100g numeric,
  ADD COLUMN IF NOT EXISTS sugars_per_100g numeric,
  ADD COLUMN IF NOT EXISTS saturates_per_100g numeric,
  ADD COLUMN IF NOT EXISTS salt_per_100g numeric;

ALTER TABLE public.catalog_foods
  ADD COLUMN IF NOT EXISTS fiber_per_100g numeric,
  ADD COLUMN IF NOT EXISTS sugars_per_100g numeric,
  ADD COLUMN IF NOT EXISTS saturates_per_100g numeric,
  ADD COLUMN IF NOT EXISTS salt_per_100g numeric;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   -- Las columnas están y nacen vacías:
--   SELECT name, tags, fiber_per_100g, sugars_per_100g,
--          saturates_per_100g, salt_per_100g
--   FROM public.foods ORDER BY name LIMIT 5;
--
--   -- Y `tags` nace como lista vacía, nunca NULL (el DEFAULT lo garantiza):
--   SELECT count(*) FROM public.foods WHERE tags IS NULL;   -- 0
--
-- Lo que NO cambia:
-- · Las políticas de `foods` y `catalog_foods`. La biblioteca sigue siendo del
--   equipo y el catálogo sigue siendo de lectura para cualquier sesión.
-- · Las dietas montadas. Guardan su copia congelada y no miran estas columnas;
--   etiquetar hoy un alimento no cambia una dieta de ayer (la regla de la 0094).
-- · Los macros. Ni se tocan ni se recalculan.
-- ============================================================================
