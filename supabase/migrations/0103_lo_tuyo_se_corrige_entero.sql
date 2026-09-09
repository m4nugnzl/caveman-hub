-- ============================================================================
-- Lo tuyo se corrige entero: la categoría de TUS alimentos
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin riesgo: una columna nueva y nulable en `foods`. No toca
--     ninguna política, ninguna fila y ningún dato.
--
-- ══ El agujero, dicho por el dueño ══════════════════════════════════════════
--
-- «No se pueden editar ni ejercicios ni alimentos aunque sean tuyos.» Y es
-- verdad en tres sitios a la vez, de los cuales éste es el único que necesita
-- base de datos:
--
--   · el NOMBRE no se podía cambiar nunca (se arregla en el producto: la ficha
--     escribe por `id` en vez de buscar por nombre);
--   · el MÚSCULO del ejercicio sólo se elegía al darlo de alta (íd.);
--   · la CATEGORÍA del alimento **no existía en tu biblioteca**. Sólo la tenía
--     `catalog_foods`, y `AlimentosPanel` la buscaba por nombre. Traducción: un
--     alimento que das de alta tú era «Sin clasificar» para siempre y **no
--     aparecía bajo ninguna categoría del filtro** — el mismo agujero que la
--     0102 le cerró a las etiquetas, sobreviviendo en la columna de al lado.
--
-- ── Nulable, y `NULL` es «sin clasificar» ──────────────────────────────────
-- No hay DEFAULT ni CHECK. El vocabulario (Carne, Cereales, Lácteos…) es el que
-- ya escribe el catálogo y vive en `domain/catalog.js` como `FOOD_CATEGORIES`,
-- que es donde puede crecer sin una migración por categoría nueva. Un CHECK aquí
-- convertiría cada palabra nueva en un despliegue.
--
-- ── Por qué NO se siembra con la del catálogo ──────────────────────────────
-- Porque la copia de un alimento general ya la lee del catálogo por nombre (ver
-- `AlimentosPanel`), y escribirla en tu fila sería repartir copias del mismo
-- hecho — lo que evitaron la 0033 y la 0094. Esta columna es para lo que el
-- catálogo no sabe: tus marcas y tus suplementos.
-- ============================================================================

BEGIN;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.foods.category IS
  'Cómo lo clasificas tú. NULL es «sin clasificar». Vocabulario abierto: FOOD_CATEGORIES en domain/catalog.js.';

COMMIT;
