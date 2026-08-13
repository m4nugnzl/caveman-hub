-- ============================================================================
-- El catálogo común: alimentos y ejercicios que ya existen para todos
-- ----------------------------------------------------------------------------
-- Dos tablas nuevas, globales y de solo lectura. No toca ninguna biblioteca ni
-- ninguna dieta.
--
-- ══ Qué problema resuelve ══════════════════════════════════════════════════
--
-- Hoy cada equipo empieza con 46 ejercicios y 46 alimentos que `seed_team_library`
-- (0022) le COPIA dentro. Eso está bien para el primer día y no escala a lo que
-- hace falta: nadie quiere ochocientos alimentos volcados en su biblioteca, y sin
-- embargo los quiere disponibles cuando escribe «lentejas».
--
-- Un catálogo separa las dos cosas: **está todo, y tuyo es solo lo que has usado.**
--
-- ══ Las tres decisiones ════════════════════════════════════════════════════
--
-- **1. Global y sin dueño.** Sin `team_id` ni `coach_id`. Son datos de
-- referencia —la pechuga de pollo tiene los mismos macros en todas las
-- bibliotecas del mundo—, así que duplicarlos por equipo es guardar mil veces lo
-- mismo para que mil personas lo editen por separado y acaben con mil versiones
-- de «Arroz blanco».
--
-- **2. Nadie escribe desde el navegador.** Ni siquiera el dueño de un equipo. Es
-- una tabla que leen todos: una escritura mal puesta la vería toda la aplicación.
-- Se llena por migración, que es el único camino revisable.
--
-- **3. Se COPIA a tu biblioteca, no se referencia.** Es lo importante y va contra
-- la intuición de no duplicar:
--
--   · Tu biblioteca ya es editable, y tiene que seguir siéndolo. Si ajustas los
--     macros a los de la marca de pan que compras, el catálogo no puede
--     pisártelos en la próxima actualización.
--   · Una dieta montada apunta a alimentos con macros congelados. Si el catálogo
--     fuera la fuente, corregir un dato aquí recalcularía dietas ajenas que
--     alguien ya dio por buenas.
--
-- El catálogo es de dónde vienen las cosas, no dónde viven.
--
-- ══ Cómo se usa desde la aplicación ════════════════════════════════════════
--
-- No hay pantalla de catálogo y es a propósito. El buscador de alimentos y el de
-- ejercicios ya existen; ahora buscan también aquí. Escribes «lentejas», sale
-- aunque no la tengas, la eliges y en ese momento se copia a tu biblioteca.
--
-- Una pantalla aparte obligaría a ir a «importar» antes de poder trabajar, que es
-- justo el paso que nadie da.
-- ============================================================================

BEGIN;

-- ── Alimentos ──────────────────────────────────────────────────────────────
--
-- Macros por 100 g de producto CRUDO salvo donde se indique. Son valores de
-- referencia de tablas de composición: cada marca trae los suyos en la etiqueta,
-- y por eso lo que se copia a tu biblioteca es editable.

CREATE TABLE IF NOT EXISTS public.catalog_foods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  -- Para agrupar en el buscador. No es un ENUM: añadir «Bebidas» es una fila.
  category         text NOT NULL DEFAULT 'Otros',
  protein_per_100g numeric NOT NULL DEFAULT 0,
  carbs_per_100g   numeric NOT NULL DEFAULT 0,
  fats_per_100g    numeric NOT NULL DEFAULT 0,
  -- La unidad viaja con el alimento, que es lo que evita tener que adivinarla
  -- por el nombre. Mismas dos columnas y misma regla que en `foods` (0030).
  unit_label       text,
  unit_grams       numeric,
  CONSTRAINT catalog_foods_unit_complete CHECK (
    (unit_label IS NULL AND unit_grams IS NULL)
    OR (unit_label IS NOT NULL AND unit_grams IS NOT NULL AND unit_grams > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.catalog_exercises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  muscle_group text NOT NULL
);

-- Buscar por nombre sin distinguir mayúsculas ni acentos es lo único que se hace
-- contra estas tablas.
CREATE INDEX IF NOT EXISTS catalog_foods_name_idx ON public.catalog_foods (lower(name));
CREATE INDEX IF NOT EXISTS catalog_exercises_name_idx ON public.catalog_exercises (lower(name));

COMMIT;


BEGIN;

ALTER TABLE public.catalog_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_exercises ENABLE ROW LEVEL SECURITY;

/*
  Leer, todo el mundo con sesión. Escribir, nadie.

  No hay política de escritura, y eso NO es un olvido: sin política, RLS deniega.
  Es la forma de decir «esta tabla es de solo lectura» sin depender de que nadie
  se acuerde de no escribirla. `service_role` la salta, que es como se llena.
*/
DROP POLICY IF EXISTS "catalog_foods_read" ON public.catalog_foods;
CREATE POLICY "catalog_foods_read" ON public.catalog_foods
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "catalog_exercises_read" ON public.catalog_exercises;
CREATE POLICY "catalog_exercises_read" ON public.catalog_exercises
  FOR SELECT TO authenticated USING (true);

COMMIT;


BEGIN;

INSERT INTO public.catalog_foods (name, category, protein_per_100g, carbs_per_100g, fats_per_100g, unit_label, unit_grams)
VALUES
  -- ── Carnes ───────────────────────────────────────────────────────────────
  ('Pechuga de pollo',                'Carne', 23.0,  0.0,  2.6, NULL, NULL),
  ('Muslo de pollo sin piel',         'Carne', 19.0,  0.0,  8.0, NULL, NULL),
  ('Alitas de pollo',                 'Carne', 18.0,  0.0, 15.0, NULL, NULL),
  ('Pechuga de pavo',                 'Carne', 22.0,  0.0,  1.5, NULL, NULL),
  ('Ternera magra',                   'Carne', 21.0,  0.0,  5.0, NULL, NULL),
  ('Solomillo de ternera',            'Carne', 21.0,  0.0,  7.0, NULL, NULL),
  ('Carne picada de ternera 5%',      'Carne', 21.0,  0.0,  5.0, NULL, NULL),
  ('Carne picada mixta',              'Carne', 18.0,  0.0, 14.0, NULL, NULL),
  ('Lomo de cerdo',                   'Carne', 21.0,  0.0,  6.0, NULL, NULL),
  ('Solomillo de cerdo',              'Carne', 20.0,  0.0,  3.0, NULL, NULL),
  ('Costilla de cerdo',               'Carne', 17.0,  0.0, 22.0, NULL, NULL),
  ('Conejo',                          'Carne', 21.0,  0.0,  5.0, NULL, NULL),
  ('Cordero (pierna)',                'Carne', 18.0,  0.0, 15.0, NULL, NULL),
  ('Jamón serrano',                   'Carne', 31.0,  0.3, 16.0, 'loncha', 20),
  ('Jamón cocido extra',              'Carne', 19.0,  1.0,  3.0, 'loncha', 25),
  ('Pavo en lonchas',                 'Carne', 18.0,  1.5,  2.0, 'loncha', 25),
  ('Bacón',                           'Carne', 13.0,  0.5, 40.0, 'loncha', 15),
  ('Chorizo',                         'Carne', 24.0,  2.0, 38.0, NULL, NULL),
  ('Salchichas frescas',              'Carne', 13.0,  2.0, 25.0, 'salchicha', 60),

  -- ── Pescados y mariscos ──────────────────────────────────────────────────
  ('Merluza',                         'Pescado', 17.0,  0.0,  2.0, NULL, NULL),
  ('Bacalao fresco',                  'Pescado', 18.0,  0.0,  0.7, NULL, NULL),
  ('Lubina',                          'Pescado', 20.0,  0.0,  4.0, NULL, NULL),
  ('Dorada',                          'Pescado', 20.0,  0.0,  4.5, NULL, NULL),
  ('Salmón',                          'Pescado', 20.0,  0.0, 13.0, NULL, NULL),
  ('Salmón ahumado',                  'Pescado', 23.0,  0.0,  9.0, 'loncha', 20),
  ('Atún fresco',                     'Pescado', 23.0,  0.0,  5.0, NULL, NULL),
  ('Atún al natural (lata)',          'Pescado', 24.0,  0.0,  1.0, 'lata', 52),
  ('Atún en aceite escurrido (lata)', 'Pescado', 23.0,  0.0,  8.0, 'lata', 52),
  ('Sardinas en lata',                'Pescado', 22.0,  0.0, 11.0, 'lata', 60),
  ('Caballa',                         'Pescado', 19.0,  0.0, 14.0, NULL, NULL),
  ('Boquerones',                      'Pescado', 20.0,  0.0,  6.0, NULL, NULL),
  ('Gambas',                          'Pescado', 20.0,  0.0,  1.0, NULL, NULL),
  ('Mejillones',                      'Pescado', 12.0,  4.0,  2.5, NULL, NULL),
  ('Pulpo',                           'Pescado', 16.0,  2.0,  1.0, NULL, NULL),
  ('Calamar',                         'Pescado', 16.0,  3.0,  1.4, NULL, NULL),
  ('Surimi (palitos)',                'Pescado', 10.0, 12.0,  1.0, 'palito', 17),

  -- ── Huevos ───────────────────────────────────────────────────────────────
  ('Huevo entero',                    'Huevos', 13.0,  1.0, 11.0, 'huevo', 55),
  ('Huevo entero L',                  'Huevos', 13.0,  1.0, 11.0, 'huevo', 63),
  ('Huevos enteros frescos',          'Huevos', 13.0,  1.0, 11.0, 'huevo', 55),
  ('Clara de huevo',                  'Huevos', 11.0,  0.7,  0.2, 'clara', 33),
  ('Clara de huevo pasteurizada',     'Huevos', 11.0,  0.7,  0.2, 'vaso', 250),
  ('Yema de huevo',                   'Huevos', 16.0,  3.6, 27.0, 'yema', 18),

  -- ── Lácteos ──────────────────────────────────────────────────────────────
  ('Leche entera',                    'Lácteos',  3.2,  4.7,  3.6, 'vaso', 250),
  ('Leche semidesnatada',             'Lácteos',  3.3,  4.8,  1.6, 'vaso', 250),
  ('Leche desnatada',                 'Lácteos',  3.4,  4.9,  0.2, 'vaso', 250),
  ('Bebida de soja sin azúcar',       'Lácteos',  3.3,  0.6,  1.8, 'vaso', 250),
  ('Bebida de avena',                 'Lácteos',  0.6,  7.0,  1.3, 'vaso', 250),
  ('Bebida de almendra sin azúcar',   'Lácteos',  0.5,  0.3,  1.1, 'vaso', 250),
  ('Yogur natural',                   'Lácteos',  3.5,  4.7,  3.3, 'yogur', 125),
  ('Yogur natural desnatado',         'Lácteos',  4.0,  6.0,  0.1, 'yogur', 125),
  ('Yogur griego natural',            'Lácteos',  9.0,  4.0,  5.0, 'yogur', 125),
  ('Skyr',                            'Lácteos', 11.0,  4.0,  0.2, 'yogur', 150),
  ('Queso fresco batido 0%',          'Lácteos',  8.0,  4.0,  0.2, NULL, NULL),
  ('Requesón',                        'Lácteos', 11.0,  3.0,  4.0, NULL, NULL),
  ('Queso fresco tipo Burgos',        'Lácteos', 12.0,  4.0, 11.0, NULL, NULL),
  ('Mozzarella',                      'Lácteos', 22.0,  2.0, 17.0, NULL, NULL),
  ('Queso curado',                    'Lácteos', 25.0,  1.3, 33.0, NULL, NULL),
  ('Queso semicurado',                'Lácteos', 24.0,  1.5, 27.0, 'loncha', 20),
  ('Queso de untar light',            'Lácteos',  9.0,  5.0, 11.0, 'cucharada', 15),
  ('Parmesano',                       'Lácteos', 36.0,  0.0, 29.0, 'cucharada', 8),
  ('Mantequilla',                     'Lácteos',  0.6,  0.6, 82.0, 'cucharada', 12),

  -- ── Legumbres ────────────────────────────────────────────────────────────
  ('Lentejas (crudas)',               'Legumbres', 24.0, 52.0,  1.1, NULL, NULL),
  ('Lentejas (cocidas)',              'Legumbres',  9.0, 16.0,  0.4, NULL, NULL),
  ('Garbanzos (crudos)',              'Legumbres', 19.0, 55.0,  6.0, NULL, NULL),
  ('Garbanzos (cocidos)',             'Legumbres',  8.9, 27.0,  2.6, NULL, NULL),
  ('Alubias (cocidas)',               'Legumbres',  8.0, 20.0,  0.5, NULL, NULL),
  ('Guisantes',                       'Legumbres',  5.4, 11.0,  0.4, NULL, NULL),
  ('Soja texturizada',                'Legumbres', 50.0, 30.0,  1.5, NULL, NULL),
  ('Tofu',                            'Legumbres',  8.0,  1.9,  4.8, NULL, NULL),
  ('Tempeh',                          'Legumbres', 19.0,  9.0, 11.0, NULL, NULL),
  ('Hummus',                          'Legumbres',  7.0, 14.0, 10.0, 'cucharada', 25),
  ('Edamame',                         'Legumbres', 11.0,  9.0,  5.0, NULL, NULL),

  -- ── Cereales y derivados ─────────────────────────────────────────────────
  ('Arroz blanco (crudo)',            'Cereales',  7.0, 78.0,  0.6, NULL, NULL),
  ('Arroz blanco (cocido)',           'Cereales',  2.4, 28.0,  0.2, NULL, NULL),
  ('Arroz integral (crudo)',          'Cereales',  7.5, 76.0,  2.7, NULL, NULL),
  ('Pasta (cruda)',                   'Cereales', 12.0, 71.0,  1.5, NULL, NULL),
  ('Pasta integral (cruda)',          'Cereales', 13.0, 64.0,  2.5, NULL, NULL),
  ('Pasta (cocida)',                  'Cereales',  5.0, 30.0,  0.9, NULL, NULL),
  ('Avena',                           'Cereales', 13.0, 60.0,  7.0, 'cucharada', 12),
  ('Harina de avena',                 'Cereales', 13.0, 60.0,  7.0, NULL, NULL),
  ('Quinoa (cruda)',                  'Cereales', 14.0, 64.0,  6.0, NULL, NULL),
  ('Quinoa (cocida)',                 'Cereales',  4.4, 21.0,  1.9, NULL, NULL),
  ('Cuscús (crudo)',                  'Cereales', 13.0, 72.0,  0.6, NULL, NULL),
  ('Pan blanco',                      'Cereales',  8.0, 49.0,  3.0, 'rebanada', 30),
  ('Pan integral',                    'Cereales',  9.0, 41.0,  3.0, 'rebanada', 30),
  ('Pan de centeno',                  'Cereales',  8.0, 45.0,  1.7, 'rebanada', 32),
  ('Pan de molde integral',           'Cereales',  9.0, 40.0,  4.0, 'rebanada', 28),
  ('Tortita de arroz',                'Cereales',  8.0, 81.0,  3.0, 'tortita', 8),
  ('Tortilla de trigo (wrap)',        'Cereales',  8.0, 50.0,  8.0, 'tortilla', 45),
  ('Picos / regañás',                 'Cereales', 10.0, 65.0, 12.0, NULL, NULL),
  ('Cereales de maíz sin azúcar',     'Cereales',  7.0, 84.0,  0.9, NULL, NULL),
  ('Muesli sin azúcar',               'Cereales', 10.0, 60.0,  9.0, NULL, NULL),
  ('Harina de trigo',                 'Cereales', 10.0, 73.0,  1.0, NULL, NULL),
  ('Harina de maíz',                  'Cereales',  7.0, 79.0,  1.0, NULL, NULL),

  -- ── Tubérculos ───────────────────────────────────────────────────────────
  ('Patata',                          'Tubérculos', 2.0, 17.0,  0.1, 'patata', 150),
  ('Boniato',                         'Tubérculos', 1.6, 20.0,  0.1, 'boniato', 130),
  ('Yuca',                            'Tubérculos', 1.4, 38.0,  0.3, NULL, NULL),

  -- ── Frutas ───────────────────────────────────────────────────────────────
  ('Plátano',                         'Fruta', 1.1, 23.0, 0.3, 'plátano', 120),
  ('Manzana',                         'Fruta', 0.3, 14.0, 0.2, 'manzana', 180),
  ('Pera',                            'Fruta', 0.4, 15.0, 0.1, 'pera', 170),
  ('Naranja',                         'Fruta', 0.9, 12.0, 0.1, 'naranja', 180),
  ('Mandarina',                       'Fruta', 0.8, 13.0, 0.3, 'mandarina', 90),
  ('Kiwi',                            'Fruta', 1.1, 15.0, 0.5, 'kiwi', 75),
  ('Fresas',                          'Fruta', 0.7,  8.0, 0.3, NULL, NULL),
  ('Arándanos',                       'Fruta', 0.7, 14.0, 0.3, NULL, NULL),
  ('Frambuesas',                      'Fruta', 1.2, 12.0, 0.7, NULL, NULL),
  ('Uva',                             'Fruta', 0.6, 17.0, 0.2, NULL, NULL),
  ('Sandía',                          'Fruta', 0.6,  8.0, 0.2, NULL, NULL),
  ('Melón',                           'Fruta', 0.8,  8.0, 0.2, NULL, NULL),
  ('Piña',                            'Fruta', 0.5, 13.0, 0.1, NULL, NULL),
  ('Mango',                           'Fruta', 0.8, 15.0, 0.4, NULL, NULL),
  ('Melocotón',                       'Fruta', 0.9, 10.0, 0.3, 'melocotón', 150),
  ('Cerezas',                         'Fruta', 1.1, 16.0, 0.2, NULL, NULL),
  ('Ciruela',                         'Fruta', 0.7, 11.0, 0.3, 'ciruela', 65),
  ('Higo',                            'Fruta', 0.8, 19.0, 0.3, 'higo', 50),
  ('Dátil',                           'Fruta', 2.5, 75.0, 0.4, 'dátil', 8),
  ('Pasas',                           'Fruta', 3.1, 79.0, 0.5, NULL, NULL),
  ('Orejones de albaricoque',         'Fruta', 3.4, 63.0, 0.5, NULL, NULL),

  -- ── Verduras ─────────────────────────────────────────────────────────────
  ('Brócoli',                         'Verdura', 2.8,  7.0, 0.4, NULL, NULL),
  ('Coliflor',                        'Verdura', 1.9,  5.0, 0.3, NULL, NULL),
  ('Espinacas',                       'Verdura', 2.9,  3.6, 0.4, NULL, NULL),
  ('Acelgas',                         'Verdura', 1.8,  4.0, 0.2, NULL, NULL),
  ('Judías verdes',                   'Verdura', 1.8,  7.0, 0.1, NULL, NULL),
  ('Tomate',                          'Verdura', 0.9,  3.9, 0.2, 'tomate', 120),
  ('Tomate triturado',                'Verdura', 1.2,  4.0, 0.2, NULL, NULL),
  ('Lechuga',                         'Verdura', 1.4,  2.9, 0.2, NULL, NULL),
  ('Canónigos / rúcula',              'Verdura', 2.3,  3.7, 0.4, NULL, NULL),
  ('Calabacín',                       'Verdura', 1.2,  3.1, 0.3, 'calabacín', 200),
  ('Berenjena',                       'Verdura', 1.0,  6.0, 0.2, 'berenjena', 250),
  ('Pimiento',                        'Verdura', 1.0,  6.0, 0.3, 'pimiento', 150),
  ('Cebolla',                         'Verdura', 1.1,  9.0, 0.1, 'cebolla', 150),
  ('Ajo',                             'Verdura', 6.4, 33.0, 0.5, 'diente', 4),
  ('Zanahoria',                       'Verdura', 0.9, 10.0, 0.2, 'zanahoria', 80),
  ('Pepino',                          'Verdura', 0.7,  3.6, 0.1, NULL, NULL),
  ('Champiñones',                     'Verdura', 3.1,  3.3, 0.3, NULL, NULL),
  ('Espárragos',                      'Verdura', 2.2,  4.0, 0.1, NULL, NULL),
  ('Calabaza',                        'Verdura', 1.0,  7.0, 0.1, NULL, NULL),
  ('Alcachofa',                       'Verdura', 3.3, 11.0, 0.2, NULL, NULL),
  ('Col / repollo',                   'Verdura', 1.3,  6.0, 0.1, NULL, NULL),

  -- ── Frutos secos y semillas ──────────────────────────────────────────────
  ('Almendras',                       'Frutos secos', 21.0, 22.0, 50.0, 'almendra', 1.2),
  ('Nueces',                          'Frutos secos', 15.0, 14.0, 65.0, 'nuez', 5),
  ('Anacardos',                       'Frutos secos', 18.0, 30.0, 44.0, NULL, NULL),
  ('Pistachos',                       'Frutos secos', 20.0, 28.0, 45.0, NULL, NULL),
  ('Avellanas',                       'Frutos secos', 15.0, 17.0, 61.0, NULL, NULL),
  ('Cacahuetes',                      'Frutos secos', 26.0, 16.0, 49.0, NULL, NULL),
  ('Crema de cacahuete',              'Frutos secos', 25.0, 20.0, 50.0, 'cucharada', 15),
  ('Crema de almendras',              'Frutos secos', 21.0, 19.0, 55.0, 'cucharada', 15),
  ('Semillas de chía',                'Frutos secos', 17.0, 42.0, 31.0, 'cucharada', 12),
  ('Semillas de lino',                'Frutos secos', 18.0, 29.0, 42.0, 'cucharada', 10),
  ('Semillas de girasol',             'Frutos secos', 21.0, 20.0, 51.0, NULL, NULL),
  ('Semillas de calabaza',            'Frutos secos', 30.0, 11.0, 49.0, NULL, NULL),

  -- ── Grasas y salsas ──────────────────────────────────────────────────────
  ('Aceite de oliva virgen extra',    'Grasas', 0.0,  0.0, 100.0, 'cucharada', 10),
  ('Aceite de girasol',               'Grasas', 0.0,  0.0, 100.0, 'cucharada', 10),
  ('Aceite de coco',                  'Grasas', 0.0,  0.0, 100.0, 'cucharada', 10),
  ('Aguacate',                        'Grasas', 2.0,  9.0,  15.0, 'aguacate', 150),
  ('Aceitunas',                       'Grasas', 1.0,  1.0,  15.0, 'aceituna', 4),
  ('Mayonesa',                        'Grasas', 1.0,  1.5,  75.0, 'cucharada', 15),
  ('Mayonesa light',                  'Grasas', 1.0,  6.0,  30.0, 'cucharada', 15),
  ('Kétchup',                         'Grasas', 1.2, 24.0,   0.2, 'cucharada', 15),
  ('Mostaza',                         'Grasas', 4.4,  5.0,   4.0, 'cucharada', 12),
  ('Salsa de soja',                   'Grasas', 8.0,  5.0,   0.1, 'cucharada', 15),
  ('Vinagre balsámico',               'Grasas', 0.5, 17.0,   0.0, 'cucharada', 15),

  -- ── Dulces y ultraprocesados de uso común ────────────────────────────────
  ('Miel',                            'Dulces', 0.3, 82.0,  0.0, 'cucharada', 21),
  ('Azúcar',                          'Dulces', 0.0,100.0,  0.0, 'cucharada', 12),
  ('Chocolate negro 85%',             'Dulces',10.0, 19.0, 46.0, 'onza', 10),
  ('Chocolate negro 70%',             'Dulces', 8.0, 34.0, 42.0, 'onza', 10),
  ('Cacao en polvo desgrasado',       'Dulces',20.0, 15.0, 11.0, 'cucharada', 6),
  ('Mermelada sin azúcar',            'Dulces', 0.5, 10.0,  0.1, 'cucharada', 20),
  ('Galletas tipo María',             'Dulces', 7.0, 72.0, 12.0, 'galleta', 7),
  ('Helado de vainilla',              'Dulces', 3.5, 24.0, 11.0, NULL, NULL),
  ('Patatas fritas de bolsa',         'Dulces', 6.0, 50.0, 34.0, NULL, NULL),
  ('Pizza margarita',                 'Dulces', 11.0, 30.0, 10.0, NULL, NULL),
  ('Cerveza',                         'Dulces', 0.5,  3.6,  0.0, 'tercio', 330),
  ('Vino tinto',                      'Dulces', 0.1,  2.6,  0.0, 'copa', 150),

  -- ── Suplementos ──────────────────────────────────────────────────────────
  ('Proteína de suero (polvo)',       'Suplementos', 80.0,  7.0,  5.0, 'cazo', 30),
  ('Proteína de caseína (polvo)',     'Suplementos', 78.0,  6.0,  2.0, 'cazo', 30),
  ('Proteína vegetal (polvo)',        'Suplementos', 75.0, 10.0,  6.0, 'cazo', 30),
  ('Creatina monohidrato',            'Suplementos',  0.0,  0.0,  0.0, 'cucharadita', 5),
  ('Maltodextrina',                   'Suplementos',  0.0, 95.0,  0.0, 'cazo', 30)
ON CONFLICT (name) DO NOTHING;

COMMIT;


BEGIN;

INSERT INTO public.catalog_exercises (name, muscle_group)
VALUES
  -- Pecho
  ('Press banca',                        'Pectoral'),
  ('Press banca con mancuernas',         'Pectoral'),
  ('Press inclinado con barra',          'Pectoral'),
  ('Press inclinado con mancuernas',     'Pectoral'),
  ('Press declinado',                    'Pectoral'),
  ('Press en máquina',                   'Pectoral'),
  ('Aperturas con mancuernas',           'Pectoral'),
  ('Contractor de pecho (peck deck)',    'Pectoral'),
  ('Cruces en polea alta',               'Pectoral'),
  ('Cruces en polea baja',               'Pectoral'),
  ('Fondos en paralelas',                'Pectoral'),
  ('Flexiones',                          'Pectoral'),
  ('Pullover con mancuerna',             'Pectoral'),

  -- Espalda
  ('Dominadas',                          'Dorsal'),
  ('Dominadas supinas',                  'Dorsal'),
  ('Jalón al pecho',                     'Dorsal'),
  ('Jalón agarre neutro',                'Dorsal'),
  ('Remo con barra',                     'Dorsal'),
  ('Remo con mancuerna',                 'Dorsal'),
  ('Remo en punta (T-bar)',              'Dorsal'),
  ('Remo sentado en polea',              'Dorsal'),
  ('Remo en máquina',                    'Dorsal'),
  ('Pullover en polea',                  'Dorsal'),
  ('Peso muerto convencional',           'Dorsal'),
  ('Encogimientos de hombro',            'Trapecio'),
  ('Face pull',                          'Trapecio'),
  ('Hiperextensiones',                   'Lumbar'),

  -- Hombro
  ('Press militar con barra',            'Deltoides Anterior'),
  ('Press militar con mancuernas',       'Deltoides Anterior'),
  ('Press Arnold',                       'Deltoides Anterior'),
  ('Elevaciones frontales',              'Deltoides Anterior'),
  ('Elevaciones laterales con mancuernas','Deltoides Lateral'),
  ('Elevaciones laterales en polea',     'Deltoides Lateral'),
  ('Elevaciones laterales en máquina',   'Deltoides Lateral'),
  ('Pájaros con mancuernas',             'Deltoides Posterior'),
  ('Reverse pec deck',                   'Deltoides Posterior'),
  ('Cruces invertidos en polea',         'Deltoides Posterior'),

  -- Brazo
  ('Curl con barra',                     'Bíceps'),
  ('Curl con barra Z',                   'Bíceps'),
  ('Curl con mancuernas',                'Bíceps'),
  ('Curl martillo',                      'Bíceps'),
  ('Curl inclinado',                     'Bíceps'),
  ('Curl concentrado',                   'Bíceps'),
  ('Curl predicador',                    'Bíceps'),
  ('Curl en polea',                      'Bíceps'),
  ('Extensión de tríceps en polea',      'Tríceps'),
  ('Extensión de tríceps con cuerda',    'Tríceps'),
  ('Press francés',                      'Tríceps'),
  ('Extensión sobre la cabeza',          'Tríceps'),
  ('Fondos en banco',                    'Tríceps'),
  ('Patada de tríceps',                  'Tríceps'),
  ('Press cerrado',                      'Tríceps'),
  ('Curl de muñeca',                     'Antebrazo'),
  ('Paseo del granjero',                 'Antebrazo'),

  -- Pierna
  ('Sentadilla',                         'Cuádriceps'),
  ('Sentadilla frontal',                 'Cuádriceps'),
  ('Sentadilla en multipower',           'Cuádriceps'),
  ('Sentadilla hack',                    'Cuádriceps'),
  ('Prensa',                             'Cuádriceps'),
  ('Extensión de cuádriceps',            'Cuádriceps'),
  ('Zancadas',                           'Cuádriceps'),
  ('Zancadas caminando',                 'Cuádriceps'),
  ('Sentadilla búlgara',                 'Cuádriceps'),
  ('Step-up al cajón',                   'Cuádriceps'),
  ('Sissy squat',                        'Cuádriceps'),
  ('Peso muerto rumano',                 'Isquiotibiales'),
  ('Peso muerto piernas rígidas',        'Isquiotibiales'),
  ('Curl femoral tumbado',               'Isquiotibiales'),
  ('Curl femoral sentado',               'Isquiotibiales'),
  ('Curl femoral de pie',                'Isquiotibiales'),
  ('Buenos días',                        'Isquiotibiales'),
  ('Hip thrust',                         'Glúteos'),
  ('Puente de glúteo',                   'Glúteos'),
  ('Patada de glúteo en polea',          'Glúteos'),
  ('Abducción en máquina',               'Glúteos'),
  ('Peso muerto sumo',                   'Glúteos'),
  ('Aducción en máquina',                'Aductor'),
  ('Elevación de talones de pie',        'Gemelo'),
  ('Elevación de talones sentado',       'Gemelo'),
  ('Elevación de talones en prensa',     'Gemelo'),

  -- Core
  ('Plancha',                            'Abdominales'),
  ('Plancha lateral',                    'Abdominales'),
  ('Crunch',                             'Abdominales'),
  ('Crunch en polea',                    'Abdominales'),
  ('Elevación de piernas colgado',       'Abdominales'),
  ('Elevación de piernas en banco',      'Abdominales'),
  ('Rueda abdominal',                    'Abdominales'),
  ('Giro ruso',                          'Abdominales'),
  ('Pallof press',                       'Abdominales'),
  ('Dead bug',                           'Abdominales'),
  ('Hollow hold',                        'Abdominales'),

  -- Cardio y otros
  ('Cinta',                              'Otros'),
  ('Bicicleta estática',                 'Otros'),
  ('Elíptica',                           'Otros'),
  ('Remo ergómetro',                     'Otros'),
  ('Escaladora',                         'Otros'),
  ('Cuerda',                             'Otros'),
  ('Sprint',                             'Otros'),
  ('Burpees',                            'Otros'),
  ('Battle ropes',                       'Otros'),
  ('Trineo (sled push)',                 'Otros')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT category, count(*) FROM public.catalog_foods GROUP BY 1 ORDER BY 2 DESC;
--   SELECT muscle_group, count(*) FROM public.catalog_exercises GROUP BY 1;
--
-- Que nadie puede escribirlo desde la aplicación —esto tiene que fallar con
-- sesión de entrenador, en la consola del navegador—:
--
--   await supabase.from('catalog_foods').insert({ name: 'Prueba' })
--   // → new row violates row-level security policy
--
-- Y cómo se añade más: otra migración con más filas. `ON CONFLICT DO NOTHING`
-- hace que volver a aplicarla no duplique nada.
-- ============================================================================
