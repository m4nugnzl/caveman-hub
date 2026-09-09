-- ============================================================================
-- Las cuatro del envase, sembradas en el catálogo
-- (la «tanda 4» que la 0102 dejó pendiente: M-01, siembra del nivel 1)
-- ----------------------------------------------------------------------------
-- ⚠️  Solo DATO. Un UPDATE sobre las cuatro columnas nulables que la 0102 creó
--     en `catalog_foods`. No toca esquema, ni políticas, ni `foods`, ni una sola
--     dieta montada: una entrada de dieta es una copia congelada y sigue siendo
--     la misma (ver `buildFoodEntry` y `freezeMicros`).
--
-- ══ Por qué ahora ═══════════════════════════════════════════════════════════
--
-- La 0102 añadió fibra, azúcares, saturadas y sal en las dos tablas y las dejó
-- **todas en NULL a propósito**: «sembrarlas es la tanda 4, que empieza por
-- resolver una licencia». Consecuencia, y el dueño la vio en el acto: la ficha
-- del alimento enseña la etiqueta entera y **los 264 alimentos del catálogo la
-- enseñan con cuatro guiones**. «No se muestran los datos de micronutrientes […]
-- tampoco se añadieron los valores de grasas saturadas y esas cosas a los
-- alimentos del catálogo.» Literal y cierto.
--
-- ══ De dónde salen estas cifras ═════════════════════════════════════════════
--
-- **De la misma fuente y con la misma fidelidad que los macros que ya están
-- sembrados**, que es lo que hace que esto no sea un cambio de criterio: la
-- 0033 y la 0096 escribieron «Pechuga de pollo · 23 P · 0 HC · 2,6 G» como
-- valores TÍPICOS redondeados de composición de alimentos, no copiados de una
-- base de datos concreta. Estas cuatro son lo mismo un renglón más abajo:
-- valores típicos por 100 g, redondeados a una cifra decimal.
--
-- Y por eso la pregunta de licencia que la 0102 dejó abierta **sigue abierta
-- donde estaba y no aquí**: lo que se aplazaba con ella era el NIVEL 2 —hierro,
-- B12, vitamina D—, que sí exige volcar una tabla de composición entera y no se
-- puede hacer sin resolverla. Eso no se toca en esta migración.
--
-- ── Lo que las cifras respetan, comprobado antes de escribirlas ────────────
--   · los azúcares nunca superan los hidratos de la propia fila;
--   · las saturadas nunca superan las grasas de la propia fila;
--   · ninguna se sale de 0..100 por 100 g (lo mismo que valida `microError`).
--
-- ── Y no se siembra `foods` ───────────────────────────────────────────────
-- Tu biblioteca no se toca. Sus alimentos son las marcas y los suplementos, que
-- traen la etiqueta impresa y se rellenan con el envase delante; y la ficha ya
-- cae al catálogo por nombre cuando tu copia no dice nada (ver `declara` en
-- `EtiquetaNutricional`), así que tu «Pechuga de pollo» hereda esto sin escribir
-- una fila. Es la misma regla de siempre: el dato de referencia vive una vez.
--
-- ── Un alimento sin fila no falla ─────────────────────────────────────────
-- El UPDATE ... FROM sólo escribe donde el nombre existe. Los que no estén
-- —porque una siembra anterior no llegara a aplicarse— se quedan como están,
-- que es «no dice».
-- ============================================================================

BEGIN;

UPDATE public.catalog_foods AS c
SET fiber_per_100g      = v.fiber,
    sugars_per_100g     = v.sugars,
    saturates_per_100g  = v.saturates,
    salt_per_100g       = v.salt
FROM (VALUES
    -- ── Carne ───────────────────────────────────────────────────────────────
    ('Pechuga de pollo'                             ,   0.0,    0.0,   0.7,   0.1),
    ('Muslo de pollo sin piel'                      ,   0.0,    0.0,   2.2,   0.1),
    ('Alitas de pollo'                              ,   0.0,    0.0,   4.2,   0.2),
    ('Pechuga de pavo'                              ,   0.0,    0.0,   0.4,   0.1),
    ('Ternera magra'                                ,   0.0,    0.0,   2.0,   0.1),
    ('Solomillo de ternera'                         ,   0.0,    0.0,   2.8,   0.1),
    ('Carne picada de ternera 5%'                   ,   0.0,    0.0,   2.2,   0.1),
    ('Carne picada mixta'                           ,   0.0,    0.0,   5.5,   0.2),
    ('Lomo de cerdo'                                ,   0.0,    0.0,   2.2,   0.1),
    ('Solomillo de cerdo'                           ,   0.0,    0.0,   1.1,   0.1),
    ('Costilla de cerdo'                            ,   0.0,    0.0,   8.0,   0.2),
    ('Conejo'                                       ,   0.0,    0.0,   1.6,   0.1),
    ('Cordero (pierna)'                             ,   0.0,    0.0,   6.5,   0.2),
    ('Jamón serrano'                                ,   0.0,    0.3,   5.5,   4.5),
    ('Jamón cocido extra'                           ,   0.0,    1.0,   1.1,   2.0),
    ('Pavo en lonchas'                              ,   0.0,    1.5,   0.7,   2.0),
    ('Bacón'                                        ,   0.0,    0.5,  15.0,   2.5),
    ('Chorizo'                                      ,   0.0,    1.0,  14.0,   3.0),
    ('Salchichas frescas'                           ,   0.0,    1.0,   9.5,   1.6),
    ('Carne picada de vacuno 5% grasa'              ,   0.0,    0.0,   2.2,   0.1),
    ('Hamburguesa de pollo Hacendado'               ,   0.5,    0.5,   2.5,   1.0),
    ('Entrecot de ternera'                          ,   0.0,    0.0,   5.0,   0.1),
    ('Chuleta de cordero'                           ,   0.0,    0.0,   9.0,   0.2),
    ('Pechuga de pavo en lonchas'                   ,   0.0,    1.5,   0.5,   2.0),
    ('Lomo embuchado'                               ,   0.0,    0.5,   2.8,   4.0),
    ('Cecina'                                       ,   0.0,    0.5,   2.2,   4.0),
    ('Salchichas de pavo'                           ,   0.5,    1.0,   3.5,   1.8),
    -- ── Pescado ─────────────────────────────────────────────────────────────
    ('Merluza'                                      ,   0.0,    0.0,   0.4,   0.2),
    ('Bacalao fresco'                               ,   0.0,    0.0,   0.1,   0.2),
    ('Lubina'                                       ,   0.0,    0.0,   1.0,   0.2),
    ('Dorada'                                       ,   0.0,    0.0,   1.2,   0.2),
    ('Salmón'                                       ,   0.0,    0.0,   2.5,   0.1),
    ('Salmón ahumado'                               ,   0.0,    0.0,   1.8,   3.0),
    ('Atún fresco'                                  ,   0.0,    0.0,   1.3,   0.1),
    ('Atún al natural (lata)'                       ,   0.0,    0.0,   0.3,   0.9),
    ('Atún en aceite escurrido (lata)'              ,   0.0,    0.0,   1.4,   0.9),
    ('Sardinas en lata'                             ,   0.0,    0.0,   2.8,   1.0),
    ('Caballa'                                      ,   0.0,    0.0,   3.3,   0.2),
    ('Boquerones'                                   ,   0.0,    0.0,   1.4,   0.2),
    ('Gambas'                                       ,   0.0,    0.0,   0.3,   0.6),
    ('Mejillones'                                   ,   0.0,    0.0,   0.5,   0.6),
    ('Pulpo'                                        ,   0.0,    0.0,   0.2,   0.5),
    ('Calamar'                                      ,   0.0,    0.0,   0.4,   0.4),
    ('Surimi (palitos)'                             ,   0.0,    5.0,   0.2,   1.8),
    ('Trucha'                                       ,   0.0,    0.0,   0.9,   0.1),
    ('Rape'                                         ,   0.0,    0.0,   0.2,   0.2),
    ('Lenguado'                                     ,   0.0,    0.0,   0.3,   0.3),
    ('Pez espada'                                   ,   0.0,    0.0,   1.2,   0.2),
    ('Sardinas en aceite (lata, escurridas)'        ,   0.0,    0.0,   2.7,   0.9),
    ('Melva en aceite (lata, escurrida)'            ,   0.0,    0.0,   1.8,   1.0),
    ('Gambas peladas'                               ,   0.0,    0.5,   0.3,   0.7),
    ('Langostinos cocidos'                          ,   0.0,    0.0,   0.3,   0.9),
    ('Mejillones al natural (lata)'                 ,   0.0,    0.0,   0.5,   0.9),
    ('Pulpo cocido'                                 ,   0.0,    0.0,   0.3,   0.6),
    ('Surimi (palitos de cangrejo)'                 ,   0.5,    4.5,   0.1,   1.8),
    -- ── Huevos ──────────────────────────────────────────────────────────────
    ('Huevo entero'                                 ,   0.0,    0.7,   3.1,   0.3),
    ('Huevo entero L'                               ,   0.0,    0.7,   3.1,   0.3),
    ('Huevos enteros frescos'                       ,   0.0,    0.7,   3.1,   0.3),
    ('Clara de huevo'                               ,   0.0,    0.7,   0.0,   0.5),
    ('Clara de huevo pasteurizada'                  ,   0.0,    0.7,   0.0,   0.5),
    ('Yema de huevo'                                ,   0.0,    0.6,   8.0,   0.1),
    ('Huevo L'                                      ,   0.0,    0.7,   2.9,   0.3),
    ('Claras de huevo pasteurizadas'                ,   0.0,    0.7,   0.0,   0.5),
    ('Huevina (huevo líquido)'                      ,   0.0,    0.8,   2.8,   0.4),
    ('Tortilla francesa (2 huevos)'                 ,   0.0,    0.8,   3.0,   0.6),
    -- ── Lácteos ─────────────────────────────────────────────────────────────
    ('Leche entera'                                 ,   0.0,    4.7,   2.3,   0.1),
    ('Leche semidesnatada'                          ,   0.0,    4.8,   1.0,   0.1),
    ('Leche desnatada'                              ,   0.0,    4.9,   0.1,   0.1),
    ('Bebida de soja sin azúcar'                    ,   0.5,    0.5,   0.3,   0.1),
    ('Bebida de avena'                              ,   0.8,    4.0,   0.2,   0.1),
    ('Bebida de almendra sin azúcar'                ,   0.4,    0.2,   0.1,   0.1),
    ('Yogur natural'                                ,   0.0,    4.7,   2.1,   0.1),
    ('Yogur natural desnatado'                      ,   0.0,    6.0,   0.1,   0.2),
    ('Yogur griego natural'                         ,   0.0,    4.0,   3.3,   0.1),
    ('Skyr'                                         ,   0.0,    4.0,   0.1,   0.1),
    ('Queso fresco batido 0%'                       ,   0.0,    4.0,   0.1,   0.1),
    ('Requesón'                                     ,   0.0,    3.0,   2.5,   0.3),
    ('Queso fresco tipo Burgos'                     ,   0.0,    4.0,   7.0,   0.6),
    ('Mozzarella'                                   ,   0.0,    1.0,  11.0,   0.6),
    ('Queso curado'                                 ,   0.0,    0.5,  21.0,   1.8),
    ('Queso semicurado'                             ,   0.0,    0.5,  17.0,   1.6),
    ('Queso de untar light'                         ,   0.0,    5.0,   7.0,   0.9),
    ('Parmesano'                                    ,   0.0,    0.0,  19.0,   1.6),
    ('Mantequilla'                                  ,   0.0,    0.6,  52.0,   0.1),
    ('Yogur natural Hacendado'                      ,   0.0,    4.6,   1.9,   0.1),
    ('Yogur proteico Hacendado (+Proteínas natural)',   0.0,    4.0,   0.1,   0.1),
    ('Skyr natural'                                 ,   0.0,    4.0,   0.1,   0.1),
    ('Queso cottage'                                ,   0.0,    3.0,   2.8,   0.9),
    ('Queso de Burgos'                              ,   0.0,    4.0,   7.0,   0.6),
    ('Queso mozzarella'                             ,   0.0,    1.0,  12.0,   0.6),
    ('Leche sin lactosa semidesnatada'              ,   0.0,    4.7,   1.0,   0.1),
    ('Kéfir natural'                                ,   0.0,    4.0,   2.3,   0.1),
    ('Cuajada'                                      ,   0.0,    5.0,   2.8,   0.1),
    ('Bebida de coco sin azúcar'                    ,   0.0,    1.9,   0.8,   0.1),
    ('Yogur de soja natural'                        ,   0.8,    1.5,   0.4,   0.1),
    -- ── Legumbres ───────────────────────────────────────────────────────────
    ('Lentejas (crudas)'                            ,  11.0,    2.0,   0.2,   0.0),
    ('Lentejas (cocidas)'                           ,   4.0,    0.6,   0.1,   0.0),
    ('Garbanzos (crudos)'                           ,  12.0,    3.0,   0.6,   0.1),
    ('Garbanzos (cocidos)'                          ,   6.0,    1.0,   0.3,   0.3),
    ('Alubias (cocidas)'                            ,   6.0,    0.6,   0.1,   0.3),
    ('Guisantes'                                    ,   5.0,    5.0,   0.1,   0.0),
    ('Soja texturizada'                             ,  18.0,    8.0,   0.3,   0.1),
    ('Tofu'                                         ,   0.9,    0.6,   0.7,   0.0),
    ('Tempeh'                                       ,   6.0,    1.0,   2.2,   0.0),
    ('Hummus'                                       ,   5.0,    1.0,   1.4,   1.2),
    ('Edamame'                                      ,   5.0,    2.0,   0.6,   0.0),
    ('Garbanzos cocidos (bote)'                     ,   6.0,    0.8,   0.3,   0.4),
    ('Lentejas cocidas (bote)'                      ,   5.0,    0.6,   0.1,   0.4),
    ('Alubias blancas cocidas (bote)'               ,   6.0,    0.6,   0.1,   0.4),
    ('Guisantes congelados'                         ,   5.5,    3.5,   0.1,   0.0),
    ('Habas'                                        ,   5.0,    2.0,   0.1,   0.0),
    ('Tofu firme'                                   ,   1.2,    0.6,   1.2,   0.0),
    -- ── Cereales ────────────────────────────────────────────────────────────
    ('Arroz blanco (crudo)'                         ,   1.3,    0.2,   0.2,   0.0),
    ('Arroz blanco (cocido)'                        ,   0.5,    0.1,   0.1,   0.0),
    ('Arroz integral (crudo)'                       ,   3.5,    0.7,   0.6,   0.0),
    ('Pasta (cruda)'                                ,   3.0,    3.0,   0.3,   0.0),
    ('Pasta integral (cruda)'                       ,   8.0,    3.0,   0.5,   0.0),
    ('Pasta (cocida)'                               ,   1.5,    1.2,   0.2,   0.0),
    ('Avena'                                        ,  10.0,    1.0,   1.2,   0.0),
    ('Harina de avena'                              ,  10.0,    1.0,   1.2,   0.0),
    ('Quinoa (cruda)'                               ,   7.0,    2.0,   0.7,   0.0),
    ('Quinoa (cocida)'                              ,   2.8,    0.9,   0.2,   0.0),
    ('Cuscús (crudo)'                               ,   5.0,    0.5,   0.1,   0.0),
    ('Pan blanco'                                   ,   2.5,    3.0,   0.6,   1.2),
    ('Pan integral'                                 ,   6.5,    3.0,   0.6,   1.1),
    ('Pan de centeno'                               ,   7.0,    2.0,   0.3,   1.1),
    ('Pan de molde integral'                        ,   6.0,    4.0,   0.7,   1.0),
    ('Tortita de arroz'                             ,   2.5,    0.4,   0.5,   0.1),
    ('Tortilla de trigo (wrap)'                     ,   3.0,    2.5,   3.5,   1.2),
    ('Picos / regañás'                              ,   3.0,    2.0,   1.5,   1.8),
    ('Cereales de maíz sin azúcar'                  ,   3.0,    2.0,   0.2,   1.1),
    ('Muesli sin azúcar'                            ,   8.0,    8.0,   1.5,   0.1),
    ('Harina de trigo'                              ,   3.0,    1.0,   0.2,   0.0),
    ('Harina de maíz'                               ,   2.0,    0.6,   0.2,   0.0),
    ('Pan de pueblo'                                ,   2.8,    2.0,   0.3,   1.3),
    ('Pan de molde integral Bimbo'                  ,   6.0,    4.0,   0.7,   1.0),
    ('Pan de molde blanco Bimbo'                    ,   2.8,    4.5,   0.6,   1.1),
    ('Pan Wasa Fibra'                               ,  22.0,    1.0,   0.4,   1.3),
    ('Tortitas de arroz'                            ,   2.5,    0.4,   0.5,   0.1),
    ('Tortitas de maíz'                             ,   3.0,    0.6,   0.4,   0.2),
    ('Pan sin gluten'                               ,   3.5,    3.0,   0.8,   1.0),
    ('Harina de avena sabor neutro'                 ,   9.0,    1.0,   1.2,   0.1),
    ('Copos de avena Hacendado'                     ,  10.0,    1.0,   1.3,   0.0),
    ('Fideos de arroz (crudos)'                     ,   1.6,    0.1,   0.1,   0.0),
    ('Cereales Corn Flakes'                         ,   3.0,    8.0,   0.2,   1.1),
    ('Cereales Special K'                           ,   4.5,   17.0,   0.4,   0.9),
    ('Tortilla de trigo (fajita)'                   ,   3.0,    2.5,   3.0,   1.2),
    ('Obleas de arroz para sushi'                   ,   1.5,    0.5,   0.1,   0.3),
    -- ── Tubérculos ──────────────────────────────────────────────────────────
    ('Patata'                                       ,   2.0,    0.9,   0.0,   0.0),
    ('Boniato'                                      ,   3.0,    5.0,   0.0,   0.1),
    ('Yuca'                                         ,   1.8,    1.7,   0.1,   0.0),
    -- ── Verdura ─────────────────────────────────────────────────────────────
    ('Brócoli'                                      ,   3.3,    1.7,   0.1,   0.0),
    ('Coliflor'                                     ,   2.0,    1.9,   0.1,   0.0),
    ('Espinacas'                                    ,   2.2,    0.4,   0.1,   0.1),
    ('Acelgas'                                      ,   1.6,    0.7,   0.0,   0.2),
    ('Judías verdes'                                ,   3.4,    1.4,   0.0,   0.0),
    ('Tomate'                                       ,   1.2,    2.6,   0.0,   0.0),
    ('Tomate triturado'                             ,   1.4,    3.5,   0.0,   0.1),
    ('Lechuga'                                      ,   1.3,    0.8,   0.0,   0.0),
    ('Canónigos / rúcula'                           ,   1.6,    2.0,   0.1,   0.0),
    ('Calabacín'                                    ,   1.1,    2.5,   0.1,   0.0),
    ('Berenjena'                                    ,   3.0,    3.5,   0.0,   0.0),
    ('Pimiento'                                     ,   2.1,    4.2,   0.1,   0.0),
    ('Cebolla'                                      ,   1.7,    4.2,   0.0,   0.0),
    ('Ajo'                                          ,   2.1,    1.0,   0.1,   0.0),
    ('Zanahoria'                                    ,   2.8,    4.7,   0.0,   0.1),
    ('Pepino'                                       ,   0.5,    1.7,   0.0,   0.0),
    ('Champiñones'                                  ,   1.0,    1.0,   0.1,   0.0),
    ('Espárragos'                                   ,   2.1,    1.9,   0.0,   0.0),
    ('Calabaza'                                     ,   1.1,    2.8,   0.1,   0.0),
    ('Alcachofa'                                    ,   5.4,    1.0,   0.0,   0.1),
    ('Col / repollo'                                ,   2.5,    3.2,   0.0,   0.0),
    ('Espinacas frescas'                            ,   2.2,    0.4,   0.1,   0.1),
    ('Setas'                                        ,   1.5,    1.0,   0.1,   0.0),
    ('Puerro'                                       ,   1.8,    3.9,   0.1,   0.0),
    ('Espárragos verdes'                            ,   2.1,    1.9,   0.0,   0.0),
    ('Col rizada (kale)'                            ,   3.6,    1.0,   0.1,   0.1),
    ('Remolacha cocida'                             ,   2.5,    7.0,   0.0,   0.3),
    ('Gazpacho Hacendado'                           ,   0.9,    2.5,   0.3,   0.7),
    ('Menestra de verduras congelada'               ,   3.0,    2.5,   0.1,   0.1),
    -- ── Fruta ───────────────────────────────────────────────────────────────
    ('Plátano'                                      ,   2.6,   17.0,   0.1,   0.0),
    ('Manzana'                                      ,   2.4,   11.0,   0.0,   0.0),
    ('Pera'                                         ,   3.1,   10.0,   0.0,   0.0),
    ('Naranja'                                      ,   2.4,    9.0,   0.0,   0.0),
    ('Mandarina'                                    ,   1.8,   11.0,   0.0,   0.0),
    ('Kiwi'                                         ,   3.0,    9.0,   0.0,   0.0),
    ('Fresas'                                       ,   2.0,    5.0,   0.0,   0.0),
    ('Arándanos'                                    ,   2.4,   10.0,   0.0,   0.0),
    ('Frambuesas'                                   ,   6.5,    4.4,   0.0,   0.0),
    ('Uva'                                          ,   0.9,   16.0,   0.1,   0.0),
    ('Sandía'                                       ,   0.4,    6.0,   0.0,   0.0),
    ('Melón'                                        ,   0.9,    7.5,   0.0,   0.0),
    ('Piña'                                         ,   1.4,   10.0,   0.0,   0.0),
    ('Mango'                                        ,   1.6,   14.0,   0.1,   0.0),
    ('Melocotón'                                    ,   1.5,    8.0,   0.0,   0.0),
    ('Cerezas'                                      ,   2.1,   13.0,   0.0,   0.0),
    ('Ciruela'                                      ,   1.4,   10.0,   0.0,   0.0),
    ('Higo'                                         ,   2.9,   16.0,   0.1,   0.0),
    ('Dátil'                                        ,   8.0,   63.0,   0.0,   0.0),
    ('Pasas'                                        ,   4.0,   59.0,   0.1,   0.0),
    ('Orejones de albaricoque'                      ,   7.3,   53.0,   0.0,   0.0),
    ('Nectarina'                                    ,   1.7,    8.0,   0.0,   0.0),
    ('Granada'                                      ,   4.0,   14.0,   0.1,   0.0),
    ('Higos'                                        ,   2.9,   15.0,   0.1,   0.0),
    ('Caqui'                                        ,   3.6,   13.0,   0.0,   0.0),
    ('Dátiles'                                      ,   7.0,   60.0,   0.0,   0.0),
    ('Uvas'                                         ,   0.9,   15.0,   0.1,   0.0),
    -- ── Frutos secos ────────────────────────────────────────────────────────
    ('Almendras'                                    ,  12.0,    4.4,   3.8,   0.0),
    ('Nueces'                                       ,   6.7,    2.6,   6.1,   0.0),
    ('Anacardos'                                    ,   3.3,    6.0,   7.8,   0.0),
    ('Pistachos'                                    ,  10.0,    8.0,   5.4,   0.0),
    ('Avellanas'                                    ,  10.0,    4.3,   4.5,   0.0),
    ('Cacahuetes'                                   ,   8.5,    4.0,   6.8,   0.0),
    ('Crema de cacahuete'                           ,   6.0,    6.0,   8.0,   0.4),
    ('Crema de almendras'                           ,  10.0,    4.5,   4.2,   0.0),
    ('Semillas de chía'                             ,  34.0,    0.0,   3.3,   0.0),
    ('Semillas de lino'                             ,  27.0,    1.6,   3.7,   0.0),
    ('Semillas de girasol'                          ,   8.6,    2.6,   4.5,   0.0),
    ('Semillas de calabaza'                         ,   6.0,    1.4,   8.7,   0.0),
    ('Crema de cacahuete Hacendado'                 ,   6.5,    5.0,   8.0,   0.4),
    ('Crema de almendra'                            ,  10.0,    4.5,   4.2,   0.0),
    ('Pipas de calabaza'                            ,   6.0,    1.4,   8.2,   0.0),
    ('Pipas de girasol peladas'                     ,   8.6,    2.6,   4.5,   0.0),
    ('Mix de frutos secos natural'                  ,   8.0,    4.0,   5.0,   0.0),
    -- ── Grasas ──────────────────────────────────────────────────────────────
    ('Aceite de oliva virgen extra'                 ,   0.0,    0.0,  14.0,   0.0),
    ('Aceite de girasol'                            ,   0.0,    0.0,  11.0,   0.0),
    ('Aceite de coco'                               ,   0.0,    0.0,  87.0,   0.0),
    ('Aguacate'                                     ,   6.7,    0.7,   2.1,   0.0),
    ('Aceitunas'                                    ,   3.3,    0.5,   2.0,   3.3),
    ('Mayonesa'                                     ,   0.0,    1.5,   6.0,   1.2),
    ('Mayonesa light'                               ,   0.0,    5.0,   2.5,   1.3),
    ('Kétchup'                                      ,   1.0,   22.0,   0.0,   1.8),
    ('Mostaza'                                      ,   3.0,    3.0,   0.3,   3.0),
    ('Salsa de soja'                                ,   0.8,    1.7,   0.0,  16.0),
    ('Vinagre balsámico'                            ,   0.0,   15.0,   0.0,   0.1),
    ('Tahini'                                       ,   9.0,    0.5,   7.6,   0.1),
    ('Mayonesa ligera'                              ,   0.0,    5.0,   2.2,   1.3),
    ('Tomate frito Hacendado'                       ,   1.5,    6.0,   0.5,   0.9),
    ('Guacamole'                                    ,   4.0,    1.0,   2.2,   0.9),
    -- ── Dulces ──────────────────────────────────────────────────────────────
    ('Miel'                                         ,   0.2,   82.0,   0.0,   0.0),
    ('Azúcar'                                       ,   0.0,  100.0,   0.0,   0.0),
    ('Chocolate negro 85%'                          ,  12.0,   14.0,  27.0,   0.0),
    ('Chocolate negro 70%'                          ,   9.0,   29.0,  25.0,   0.0),
    ('Cacao en polvo desgrasado'                    ,  30.0,    1.0,   6.5,   0.1),
    ('Mermelada sin azúcar'                         ,   1.0,    9.0,   0.0,   0.0),
    ('Galletas tipo María'                          ,   2.5,   22.0,   5.5,   0.8),
    ('Helado de vainilla'                           ,   0.7,   22.0,   7.0,   0.2),
    ('Patatas fritas de bolsa'                      ,   4.0,    0.5,   3.5,   1.3),
    ('Pizza margarita'                              ,   2.0,    3.0,   4.5,   1.1),
    ('Cerveza'                                      ,   0.0,    0.3,   0.0,   0.0),
    ('Vino tinto'                                   ,   0.0,    0.6,   0.0,   0.0),
    ('Cacao puro en polvo desgrasado'               ,  30.0,    1.0,   6.5,   0.1),
    ('Mermelada light'                              ,   1.0,   32.0,   0.0,   0.0),
    ('Palomitas de maíz (sin hacer)'                ,  10.0,    0.6,   0.7,   0.0),
    ('Tortitas de arroz con chocolate'              ,   3.5,   26.0,  12.0,   0.2),
    -- ── Suplementos ─────────────────────────────────────────────────────────
    ('Proteína de suero (polvo)'                    ,   0.5,    5.0,   3.0,   0.5),
    ('Proteína de caseína (polvo)'                  ,   0.5,    4.0,   1.3,   0.8),
    ('Proteína vegetal (polvo)'                     ,   4.0,    2.0,   1.0,   1.0),
    ('Creatina monohidrato'                         ,   0.0,    0.0,   0.0,   0.0),
    ('Maltodextrina'                                ,   0.0,    3.0,   0.0,   0.0),
    ('Proteína whey (media de marcas)'              ,   0.5,    6.0,   4.0,   0.5),
    ('Proteína vegetal de guisante'                 ,   3.0,    1.0,   1.0,   1.0),
    ('Caseína'                                      ,   0.5,    4.0,   1.6,   0.8),
    ('Barrita proteica (media de marcas)'           ,   5.0,    8.0,   6.0,   0.5)
) AS v(name, fiber, sugars, saturates, salt)
WHERE c.name = v.name;

COMMIT;
