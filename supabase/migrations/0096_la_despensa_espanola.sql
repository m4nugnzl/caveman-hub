-- ============================================================================
-- La despensa española: más alimentos, con marcas y etiquetas (C11 · C12, dato)
-- ----------------------------------------------------------------------------
-- ⚠️  Solo dato: un INSERT con ON CONFLICT DO NOTHING sobre `catalog_foods`
--     (0033/0094). No toca esquema, permisos, bibliotecas ni dietas.
--
-- ══ El criterio de la tanda ═════════════════════════════════════════════════
--
-- Lo que de verdad aparece en una dieta escrita en España y el catálogo aún no
-- tenía: básicos de tabla de composición (estilo BEDCA) y productos DE MARCA
-- del supermercado español — el pan de molde concreto, el yogur concreto, la
-- lata concreta. La marca importa porque es lo que el cliente compra: «pan
-- integral» genérico y el de su marca difieren en 40 kcal, y la dieta se monta
-- con el suyo. Los macros de marca salen de la etiqueta del producto y por eso
-- lo que se copia a tu biblioteca es editable: la receta del fabricante cambia.
--
-- Las ETIQUETAS (`tags`, 0094) llevan hechos del alimento —gluten, lactosa,
-- huevo, pescado, marisco, frutos-de-cascara, soja, carne— para que el buscador
-- pueda AVISAR contra las restricciones del cliente. Información, nunca filtro:
-- la regla vive en `domain/catalog.js`.
--
-- El catálogo sigue creciendo por tandas: este INSERT es aditivo y revisable.
-- ============================================================================

BEGIN;

INSERT INTO public.catalog_foods (name, category, protein_per_100g, carbs_per_100g, fats_per_100g, unit_label, unit_grams, tags)
VALUES
  -- ── Cereales y panes ─────────────────────────────────────────────────────
  ('Pan de pueblo',                        'Cereales',  8.5, 52.0,  1.2, 'rebanada', 40, '{gluten}'),
  ('Pan de molde integral Bimbo',          'Cereales', 10.0, 41.0,  4.5, 'rebanada', 27, '{gluten}'),
  ('Pan de molde blanco Bimbo',            'Cereales',  8.0, 47.0,  4.0, 'rebanada', 27, '{gluten}'),
  ('Pan Wasa Fibra',                       'Cereales', 12.0, 46.0,  2.0, 'tostada', 12, '{gluten}'),
  ('Tortitas de arroz',                    'Cereales',  8.0, 80.0,  3.0, 'tortita', 8, '{}'),
  ('Tortitas de maíz',                     'Cereales',  8.5, 80.0,  2.5, 'tortita', 7, '{}'),
  ('Pan de centeno',                       'Cereales',  6.5, 45.0,  1.5, 'rebanada', 40, '{gluten}'),
  ('Pan sin gluten',                       'Cereales',  4.0, 48.0,  6.0, 'rebanada', 35, '{}'),
  ('Harina de avena',                      'Cereales', 13.0, 60.0,  7.0, NULL, NULL, '{gluten}'),
  ('Harina de avena sabor neutro',         'Cereales', 13.0, 60.0,  7.0, NULL, NULL, '{gluten}'),
  ('Copos de avena Hacendado',             'Cereales', 12.5, 58.0,  7.5, NULL, NULL, '{gluten}'),
  ('Quinoa (cruda)',                       'Cereales', 14.0, 64.0,  6.0, NULL, NULL, '{}'),
  ('Cuscús (crudo)',                       'Cereales', 12.5, 72.0,  1.5, NULL, NULL, '{gluten}'),
  ('Pasta integral (cruda)',               'Cereales', 13.0, 66.0,  2.5, NULL, NULL, '{gluten}'),
  ('Fideos de arroz (crudos)',             'Cereales',  6.0, 80.0,  0.6, NULL, NULL, '{}'),
  ('Cereales Corn Flakes',                 'Cereales',  7.5, 84.0,  0.9, NULL, NULL, '{gluten}'),
  ('Cereales Special K',                   'Cereales', 14.0, 74.0,  1.5, NULL, NULL, '{gluten}'),
  ('Tortilla de trigo (fajita)',           'Cereales',  8.5, 52.0,  7.0, 'unidad', 42, '{gluten}'),
  ('Obleas de arroz para sushi',           'Cereales',  6.5, 78.0,  0.5, NULL, NULL, '{}'),

  -- ── Carnes y fiambres ────────────────────────────────────────────────────
  ('Solomillo de cerdo',                   'Carne', 21.0,  0.0,  4.5, NULL, NULL, '{carne}'),
  ('Lomo de cerdo',                        'Carne', 21.0,  0.0,  8.0, NULL, NULL, '{carne}'),
  ('Carne picada de vacuno 5% grasa',      'Carne', 21.0,  0.0,  5.0, NULL, NULL, '{carne}'),
  ('Carne picada mixta',                   'Carne', 18.0,  0.5, 15.0, NULL, NULL, '{carne}'),
  ('Hamburguesa de pollo Hacendado',       'Carne', 17.0,  3.0,  9.0, 'unidad', 90, '{carne}'),
  ('Entrecot de ternera',                  'Carne', 20.0,  0.0, 12.0, NULL, NULL, '{carne}'),
  ('Chuleta de cordero',                   'Carne', 17.0,  0.0, 20.0, NULL, NULL, '{carne}'),
  ('Conejo',                               'Carne', 21.0,  0.0,  5.0, NULL, NULL, '{carne}'),
  ('Jamón serrano',                        'Carne', 30.0,  0.5, 12.0, 'loncha', 15, '{carne}'),
  ('Jamón cocido extra',                   'Carne', 19.0,  1.5,  2.5, 'loncha', 20, '{carne}'),
  ('Pechuga de pavo en lonchas',           'Carne', 19.0,  1.5,  1.5, 'loncha', 20, '{carne}'),
  ('Lomo embuchado',                       'Carne', 36.0,  0.5,  8.0, 'loncha', 10, '{carne}'),
  ('Cecina',                               'Carne', 39.0,  0.5,  6.0, 'loncha', 10, '{carne}'),
  ('Chorizo',                              'Carne', 22.0,  2.0, 32.0, NULL, NULL, '{carne}'),
  ('Salchichas de pavo',                   'Carne', 14.0,  2.5, 10.0, 'unidad', 25, '{carne}'),

  -- ── Pescados y marisco ───────────────────────────────────────────────────
  ('Merluza',                              'Pescado', 17.0,  0.0,  2.0, NULL, NULL, '{pescado}'),
  ('Lubina',                               'Pescado', 18.0,  0.0,  2.5, NULL, NULL, '{pescado}'),
  ('Dorada',                               'Pescado', 18.0,  0.0,  3.5, NULL, NULL, '{pescado}'),
  ('Trucha',                               'Pescado', 19.0,  0.0,  4.0, NULL, NULL, '{pescado}'),
  ('Rape',                                 'Pescado', 15.0,  0.0,  0.8, NULL, NULL, '{pescado}'),
  ('Lenguado',                             'Pescado', 16.5,  0.0,  1.3, NULL, NULL, '{pescado}'),
  ('Pez espada',                           'Pescado', 19.0,  0.0,  4.5, NULL, NULL, '{pescado}'),
  ('Sardinas en aceite (lata, escurridas)','Pescado', 24.0,  0.0, 12.0, 'lata', 60, '{pescado}'),
  ('Melva en aceite (lata, escurrida)',    'Pescado', 25.0,  0.0,  8.0, 'lata', 65, '{pescado}'),
  ('Salmón ahumado',                       'Pescado', 22.0,  0.5,  8.0, 'loncha', 20, '{pescado}'),
  ('Gambas peladas',                       'Pescado', 20.0,  0.5,  1.0, NULL, NULL, '{marisco}'),
  ('Langostinos cocidos',                  'Pescado', 21.0,  0.0,  1.0, NULL, NULL, '{marisco}'),
  ('Mejillones al natural (lata)',         'Pescado', 18.0,  2.0,  2.5, 'lata', 65, '{marisco}'),
  ('Calamar',                              'Pescado', 16.0,  1.0,  1.5, NULL, NULL, '{marisco}'),
  ('Pulpo cocido',                         'Pescado', 22.0,  1.0,  1.5, NULL, NULL, '{marisco}'),
  ('Surimi (palitos de cangrejo)',         'Pescado',  8.0, 10.0,  0.5, 'palito', 17, '{pescado,gluten,huevo}'),

  -- ── Lácteos y alternativas ───────────────────────────────────────────────
  ('Yogur natural Hacendado',              'Lácteos',  3.9,  4.6,  2.9, 'unidad', 125, '{lactosa}'),
  ('Yogur griego natural',                 'Lácteos',  5.5,  4.0,  9.5, 'unidad', 120, '{lactosa}'),
  ('Yogur proteico Hacendado (+Proteínas natural)', 'Lácteos', 10.5,  4.0,  0.2, 'unidad', 200, '{lactosa}'),
  ('Skyr natural',                         'Lácteos', 11.0,  4.0,  0.2, 'unidad', 150, '{lactosa}'),
  ('Queso fresco batido 0%',               'Lácteos',  8.0,  4.0,  0.2, NULL, NULL, '{lactosa}'),
  ('Queso cottage',                        'Lácteos', 11.0,  3.5,  4.5, NULL, NULL, '{lactosa}'),
  ('Queso de Burgos',                      'Lácteos', 12.0,  4.0, 11.0, NULL, NULL, '{lactosa}'),
  ('Queso curado',                         'Lácteos', 26.0,  1.0, 33.0, 'cuña', 30, '{lactosa}'),
  ('Queso mozzarella',                     'Lácteos', 18.0,  2.0, 19.0, NULL, NULL, '{lactosa}'),
  ('Leche entera',                         'Lácteos',  3.1,  4.7,  3.6, 'vaso', 200, '{lactosa}'),
  ('Leche semidesnatada',                  'Lácteos',  3.1,  4.7,  1.6, 'vaso', 200, '{lactosa}'),
  ('Leche desnatada',                      'Lácteos',  3.2,  4.7,  0.3, 'vaso', 200, '{lactosa}'),
  ('Leche sin lactosa semidesnatada',      'Lácteos',  3.1,  4.7,  1.6, 'vaso', 200, '{}'),
  ('Kéfir natural',                        'Lácteos',  3.7,  4.0,  3.5, 'vaso', 200, '{lactosa}'),
  ('Cuajada',                              'Lácteos',  4.5,  5.0,  4.3, 'unidad', 125, '{lactosa}'),
  ('Bebida de coco sin azúcar',            'Lácteos',  0.2,  2.7,  0.9, 'vaso', 200, '{}'),
  ('Yogur de soja natural',                'Lácteos',  4.0,  2.5,  2.3, 'unidad', 125, '{soja}'),

  -- ── Huevos y derivados ───────────────────────────────────────────────────
  ('Huevo L',                              'Huevos', 12.5,  0.7, 10.0, 'unidad', 60, '{huevo}'),
  ('Claras de huevo pasteurizadas',        'Huevos', 10.5,  0.7,  0.2, NULL, NULL, '{huevo}'),
  ('Huevina (huevo líquido)',              'Huevos', 12.0,  0.8,  9.5, NULL, NULL, '{huevo}'),
  ('Tortilla francesa (2 huevos)',         'Huevos', 12.0,  0.8, 12.0, 'unidad', 120, '{huevo}'),

  -- ── Legumbres ────────────────────────────────────────────────────────────
  ('Garbanzos cocidos (bote)',             'Legumbres',  8.5, 16.5,  2.5, NULL, NULL, '{}'),
  ('Lentejas cocidas (bote)',              'Legumbres',  8.0, 16.0,  0.5, NULL, NULL, '{}'),
  ('Alubias blancas cocidas (bote)',       'Legumbres',  7.0, 15.0,  0.6, NULL, NULL, '{}'),
  ('Guisantes congelados',                 'Legumbres',  5.5,  9.5,  0.5, NULL, NULL, '{}'),
  ('Habas',                                'Legumbres',  8.0, 12.0,  0.6, NULL, NULL, '{}'),
  ('Soja texturizada',                     'Legumbres', 50.0, 18.0,  4.0, NULL, NULL, '{soja}'),
  ('Tofu firme',                           'Legumbres', 14.0,  2.0,  8.0, NULL, NULL, '{soja}'),
  ('Tempeh',                               'Legumbres', 19.0,  8.0, 10.0, NULL, NULL, '{soja}'),
  ('Edamame',                              'Legumbres', 11.0,  8.0,  5.0, NULL, NULL, '{soja}'),
  ('Hummus',                               'Legumbres',  7.0, 12.0, 18.0, NULL, NULL, '{}'),

  -- ── Verduras ─────────────────────────────────────────────────────────────
  ('Espinacas frescas',                    'Verdura', 2.9, 1.5, 0.4, NULL, NULL, '{}'),
  ('Judías verdes',                        'Verdura', 1.9, 4.5, 0.2, NULL, NULL, '{}'),
  ('Coliflor',                             'Verdura', 2.0, 3.0, 0.3, NULL, NULL, '{}'),
  ('Champiñones',                          'Verdura', 3.1, 3.3, 0.3, NULL, NULL, '{}'),
  ('Setas',                                'Verdura', 2.5, 3.5, 0.4, NULL, NULL, '{}'),
  ('Puerro',                               'Verdura', 1.5, 7.5, 0.3, NULL, NULL, '{}'),
  ('Espárragos verdes',                    'Verdura', 2.2, 2.0, 0.2, NULL, NULL, '{}'),
  ('Col rizada (kale)',                    'Verdura', 4.3, 4.4, 0.9, NULL, NULL, '{}'),
  ('Remolacha cocida',                     'Verdura', 1.7, 8.0, 0.2, NULL, NULL, '{}'),
  ('Gazpacho Hacendado',                   'Verdura', 0.8, 3.5, 2.2, 'vaso', 200, '{}'),
  ('Menestra de verduras congelada',       'Verdura', 2.5, 5.0, 0.4, NULL, NULL, '{}'),

  -- ── Frutas ───────────────────────────────────────────────────────────────
  ('Mandarina',                            'Fruta', 0.8, 11.0, 0.3, 'unidad', 80, '{}'),
  ('Melocotón',                            'Fruta', 0.9,  9.5, 0.2, 'unidad', 150, '{}'),
  ('Nectarina',                            'Fruta', 1.1, 10.5, 0.3, 'unidad', 140, '{}'),
  ('Cerezas',                              'Fruta', 1.0, 14.0, 0.2, NULL, NULL, '{}'),
  ('Granada',                              'Fruta', 1.7, 15.0, 1.2, 'unidad', 200, '{}'),
  ('Melón',                                'Fruta', 0.8,  7.5, 0.2, 'raja', 200, '{}'),
  ('Higos',                                'Fruta', 0.8, 16.0, 0.3, 'unidad', 50, '{}'),
  ('Caqui',                                'Fruta', 0.7, 16.0, 0.2, 'unidad', 170, '{}'),
  ('Dátiles',                              'Fruta', 2.5, 66.0, 0.4, 'unidad', 8, '{}'),
  ('Uvas',                                 'Fruta', 0.6, 16.0, 0.3, NULL, NULL, '{}'),
  ('Frambuesas',                           'Fruta', 1.2,  5.5, 0.6, NULL, NULL, '{}'),

  -- ── Frutos secos y semillas ──────────────────────────────────────────────
  ('Pistachos',                            'Frutos secos', 20.0, 18.0, 45.0, NULL, NULL, '{frutos-de-cascara}'),
  ('Crema de cacahuete Hacendado',         'Frutos secos', 26.0, 12.0, 49.0, 'cucharada', 15, '{frutos-de-cascara}'),
  ('Crema de almendra',                    'Frutos secos', 21.0,  7.0, 55.0, 'cucharada', 15, '{frutos-de-cascara}'),
  ('Semillas de chía',                     'Frutos secos', 17.0,  7.5, 31.0, 'cucharada', 10, '{}'),
  ('Semillas de lino',                     'Frutos secos', 18.0,  4.5, 42.0, 'cucharada', 10, '{}'),
  ('Pipas de calabaza',                    'Frutos secos', 30.0, 11.0, 46.0, NULL, NULL, '{}'),
  ('Pipas de girasol peladas',             'Frutos secos', 21.0, 17.0, 51.0, NULL, NULL, '{}'),
  ('Mix de frutos secos natural',          'Frutos secos', 18.0, 15.0, 50.0, 'puñado', 30, '{frutos-de-cascara}'),

  -- ── Grasas y salsas ──────────────────────────────────────────────────────
  ('Tahini',                               'Grasas', 20.0, 12.0, 54.0, 'cucharada', 15, '{}'),
  ('Mayonesa ligera',                      'Grasas',  0.8,  7.0, 27.0, 'cucharada', 15, '{huevo}'),
  ('Tomate frito Hacendado',               'Grasas',  1.5,  8.0,  3.5, 'cucharada', 20, '{}'),
  ('Salsa de soja',                        'Grasas',  8.0,  6.0,  0.1, 'cucharada', 15, '{soja,gluten}'),
  ('Guacamole',                            'Grasas',  1.8,  6.0, 14.0, 'cucharada', 20, '{}'),

  -- ── Dulces y aperitivos ──────────────────────────────────────────────────
  ('Chocolate negro 85%',                  'Dulces',  9.5, 22.0, 46.0, 'onza', 10, '{}'),
  ('Cacao puro en polvo desgrasado',       'Dulces', 22.0, 11.0, 11.0, 'cucharada', 10, '{}'),
  ('Mermelada light',                      'Dulces',  0.4, 36.0,  0.1, 'cucharada', 20, '{}'),
  ('Miel',                                 'Dulces',  0.4, 80.0,  0.0, 'cucharada', 20, '{}'),
  ('Palomitas de maíz (sin hacer)',        'Dulces', 11.0, 62.0,  4.0, NULL, NULL, '{}'),
  ('Tortitas de arroz con chocolate',      'Dulces',  6.5, 62.0, 20.0, 'tortita', 17, '{lactosa}'),

  -- ── Suplementos ──────────────────────────────────────────────────────────
  ('Proteína whey (media de marcas)',      'Suplementos', 76.0,  8.0,  6.5, 'cazo', 30, '{lactosa}'),
  ('Proteína vegetal de guisante',         'Suplementos', 75.0,  5.5,  6.0, 'cazo', 30, '{}'),
  ('Caseína',                              'Suplementos', 75.0,  6.0,  2.5, 'cazo', 30, '{lactosa}'),
  ('Creatina monohidrato',                 'Suplementos',  0.0,  0.0,  0.0, 'cazo', 5, '{}'),
  ('Barrita proteica (media de marcas)',   'Suplementos', 30.0, 35.0, 12.0, 'unidad', 50, '{lactosa,frutos-de-cascara,gluten}')
ON CONFLICT (name) DO NOTHING;

COMMIT;
