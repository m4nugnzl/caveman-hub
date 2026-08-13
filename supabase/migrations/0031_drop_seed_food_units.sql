-- ============================================================================
-- Fuera la lista de unidades escrita a mano dentro de una función
-- ----------------------------------------------------------------------------
-- Borra `seed_food_units`, que introdujo la 0030. No toca ningún dato.
--
-- ══ Por qué se va ══════════════════════════════════════════════════════════
--
-- La 0030 escribió la misma lista de 19 alimentos DOS veces: una en un UPDATE de
-- relleno y otra dentro de `seed_food_units`, para que los equipos creados
-- después también la recibieran.
--
-- Las dos mitades tienen valor muy distinto:
--
--   · **El UPDATE se queda.** Es un arreglo de datos que corre una vez y no
--     vuelve. Eso es exactamente para lo que existen las migraciones.
--
--   · **La función se va.** Es la misma lista viviendo para siempre dentro del
--     esquema, y con dos defectos que no se arreglan retocándola:
--
--     1. **Casa por nombre exacto.** «Huevo entero» entra; «Huevos enteros
--        frescos», «Huevo campero L» o «Huevos M» no. Y el nombre lo escribe cada
--        entrenador, así que la lista acierta con los suyos y falla con los de
--        todos los demás — que es el caso general.
--
--     2. **Crece por el sitio equivocado.** Añadir un alimento con unidad pasaba
--        por escribir una migración. Un catálogo de alimentos son datos, y los
--        datos no se despliegan: se consultan.
--
-- ══ Qué lo sustituye ═══════════════════════════════════════════════════════
--
-- El catálogo común (`catalog_foods`), donde la unidad es una columna más de cada
-- alimento junto a sus macros. Al copiar un alimento del catálogo a tu biblioteca
-- se copia con su unidad, sin que nadie tenga que adivinar nada a partir del
-- nombre.
--
-- Mientras tanto no se pierde nada: la unidad se puede escribir a mano en
-- cualquier alimento desde el propio formulario de alta, y esa es de hecho la
-- forma buena de hacerlo —el entrenador sabe si para él una rebanada son 30 g o
-- 40, y el catálogo no—.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.seed_food_units(uuid);

COMMIT;

-- ============================================================================
-- Que ya no está:
--
--   SELECT proname FROM pg_proc WHERE proname = 'seed_food_units';
--   -- 0 filas
--
-- Y que las unidades que puso el relleno de la 0030 SIGUEN ahí:
--
--   SELECT count(*) FROM public.foods WHERE unit_label IS NOT NULL;
-- ============================================================================
