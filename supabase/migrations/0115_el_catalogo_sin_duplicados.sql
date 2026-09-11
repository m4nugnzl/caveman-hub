-- ============================================================================
-- El catálogo, sin el mismo alimento dos veces
-- ----------------------------------------------------------------------------
-- ⚠️  Solo dato: dieciséis filas menos en `catalog_foods`, y lo que esas filas
--     declaraban de más traspasado antes a la que se queda. No toca ninguna
--     biblioteca, ninguna dieta y ningún esquema.
--
-- ⚠️  Se puede desplegar en cualquier orden respecto al código. Lo que quita
--     son filas que la lista de equivalencias ya tapaba (`laMismaFila`, en
--     `domain/foodEquiv`), así que ahí se ve lo mismo antes y después. Lo que
--     cambia es dónde está la corrección — y el buscador, que sí las ofrecía.
--
-- ══ Qué pasaba ═════════════════════════════════════════════════════════════
--
-- La 0096 («la despensa española») añadió sus filas sobre las de la 0033 con
-- `ON CONFLICT (name) DO NOTHING`. Esa red recoge el nombre repetido CLAVADO
-- —y recogió 42— y no recoge nada más: «Uvas» no colisiona con «Uva», ni
-- «Skyr natural» con «Skyr», ni «Harina de avena sabor neutro» con «Harina de
-- avena». Así entraron dieciséis alimentos que ya estaban, con otro nombre y a
-- veces con otros números:
--
--     Higo    0.8 / 19 / 0.3        Uva   0.6 / 17 / 0.2
--     Higos   0.8 / 16 / 0.3        Uvas  0.6 / 16 / 0.3
--
-- No son dos alternativas entre las que elegir: es el mismo higo escrito dos
-- veces, y que los números no cuadren es la prueba, no la información.
--
-- ══ Por qué se quita del dato y no solo del código ═════════════════════════
--
-- Porque el código ya lo tapaba, y eso es una corrección que hay que pagar en
-- cada sitio que lea la tabla. La lista de equivalencias las junta, sí — pero
-- el buscador de alimentos las ofrece las dos, la biblioteca se copia la que
-- elijas y quien monta una dieta escoge entre «Higo» y «Higos» sin ninguna
-- forma de acertar. Una regla que tapa un error de dato deja el error puesto
-- para el siguiente que lo lea.
--
-- ══ Qué NO se quita, y por qué ═════════════════════════════════════════════
--
-- Lo que se parece pero no es lo mismo, aunque los números casi cuadren:
--
--   · **«Pulpo» y «Pulpo cocido»**, como el arroz o las lentejas: el ESTADO es
--     una entrada distinta a propósito, porque se pesa distinto.
--   · **«Mejillones» y «Mejillones al natural (lata)»**, 12 g de proteína
--     contra 18: el fresco y el de lata son dos compras.
--   · **«Espárragos» y «Espárragos verdes»**: los trigueros no son los
--     blancos de bote.
--   · **«Crema de cacahuete» y «Crema de cacahuete Hacendado»**, o los panes
--     de molde de marca: una marca con los números de su etiqueta es justo lo
--     que el catálogo quiere tener.
--   · **«Sardinas en lata» y «Sardinas en aceite (lata, escurridas)»**: el
--     segundo nombre declara una presentación que el primero no.
--
-- El criterio es corto: se va la fila cuyo nombre NO dice nada que la otra no
-- diga —el plural, el «natural» de algo que ya lo es, el «sabor neutro», el
-- «fresco»—. En la duda se queda, que es el lado barato del error: una fila de
-- más se elige, una fila de menos no se echa en falta.
--
-- Se conserva la de la 0033, que es la que el buscador ya venía dando (en las
-- 42 colisiones exactas `ON CONFLICT` la dejó ganar) y la que trae mejor
-- unidad: «higo 50 g» y «dátil 8 g» frente a «unidad».
--
-- ══ Y lo que la fila que se va sí declaraba: se traspasa ═══════════════════
--
-- Aquí estaba la trampa, y no es teórica. Las etiquetas de alérgeno de la 0033
-- las pone la 0094 por PATRÓN DEL NOMBRE, y dos de las supervivientes no
-- encajan en ninguno:
--
--     Skyr              →  no dice «leche», ni «queso», ni «yogur»…  sin `lactosa`
--     Surimi (palitos)  →  no dice «cangrejo»…        sin `pescado, gluten, huevo`
--
-- Sus duplicados de la 0096 sí traían esas etiquetas escritas a mano. Borrar
-- primero y mirar después habría dejado el catálogo sin un solo skyr marcado
-- con lactosa, y en silencio — que es como se pierden estas cosas.
--
-- Así que la unión se hace ANTES del borrado, y para las dieciséis, no solo
-- para las dos que aparecieron: etiquetas, los cuatro del envase y la unidad,
-- allí donde la que se queda no dice nada. La lista de pares es UNA, y de ella
-- salen tanto el traspaso como el borrado: así no pueden divergir.
-- ============================================================================


BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalog_foods') IS NULL THEN
    RAISE EXCEPTION 'Falta 0033_catalog.sql: no existe `catalog_foods`.';
  END IF;
END $$;

/*
  Todo en UNA sentencia, y no por elegancia.

  La lista vivía antes en una tabla temporal, y una tabla temporal solo existe
  mientras dure la sesión que la creó. Por el pooler en modo transacción —el
  editor SQL del panel de Supabase entra por ahí— cada sentencia puede caer en
  una conexión distinta, y la siguiente ya no encuentra la tabla:

      ERROR: 42P01: relation "duplicados" does not exist

  Con un CTE la lista sigue estando escrita una sola vez, pero viaja dentro de
  la sentencia que la usa, así que no depende de dónde aterrice.

  El traspaso va en un CTE que MODIFICA, y esos se ejecutan siempre, aunque
  nadie lea su resultado. Las dos partes ven la MISMA foto de la tabla, de modo
  que el borrado no puede adelantar a la unión: el `UPDATE` lee las filas que
  se van tal y como estaban al empezar, borradas o no. Y no se pisan, porque
  ninguna fila está en las dos columnas: se toca la que se queda, se borra la
  que se va.
*/
WITH duplicados (se_queda, se_va) AS (
  VALUES
    -- El mismo, en plural (la 0033 tiene el singular, y con mejor unidad)
    ('Uva'::text,                   'Uvas'::text),
    ('Higo',                        'Higos'),
    ('Dátil',                       'Dátiles'),
    ('Tortita de arroz',            'Tortitas de arroz'),
    ('Crema de almendras',          'Crema de almendra'),            -- aquí sobra el singular
    ('Clara de huevo pasteurizada', 'Claras de huevo pasteurizadas'),
    -- El mismo, con una palabra que no añade nada
    ('Skyr',                        'Skyr natural'),                 -- el skyr es natural
    ('Queso fresco tipo Burgos',    'Queso de Burgos'),              -- iguales hasta el decimal
    ('Harina de avena',             'Harina de avena sabor neutro'), -- iguales hasta el decimal
    ('Gambas',                      'Gambas peladas'),               -- se pesan peladas igual
    ('Guisantes',                   'Guisantes congelados'),         -- y así es como se compran
    ('Espinacas',                   'Espinacas frescas'),
    ('Surimi (palitos)',            'Surimi (palitos de cangrejo)'),
    ('Cacao en polvo desgrasado',   'Cacao puro en polvo desgrasado'),
    -- El mismo huevo con tres nombres: las tres filas de la 0033 son 13/1/11
    ('Huevo entero',                'Huevos enteros frescos'),       -- misma unidad, 55 g
    ('Huevo entero L',              'Huevo L')                       -- 63 g contra 60 g
),
/*
  1. Lo que la fila que se va declara y la otra no.

  Las etiquetas se UNEN —nunca se sustituyen: son el mismo alimento, así que
  una etiqueta cierta en cualquiera de las dos lo es para las dos—. Los cuatro
  del envase y la unidad solo rellenan el hueco, con `COALESCE`: donde la que
  se queda ya dice algo, manda ella.
*/
traspaso AS (
  UPDATE public.catalog_foods AS q
     SET tags = ARRAY(SELECT DISTINCT unnest(q.tags || v.tags) ORDER BY 1),
         fiber_per_100g     = COALESCE(q.fiber_per_100g,     v.fiber_per_100g),
         sugars_per_100g    = COALESCE(q.sugars_per_100g,    v.sugars_per_100g),
         saturates_per_100g = COALESCE(q.saturates_per_100g, v.saturates_per_100g),
         salt_per_100g      = COALESCE(q.salt_per_100g,      v.salt_per_100g),
         /* La unidad viaja entera o no viaja: una etiqueta sin gramos no se
            puede servir, y unos gramos sin etiqueta no se pueden leer. */
         unit_label = CASE WHEN q.unit_label IS NULL THEN v.unit_label ELSE q.unit_label END,
         unit_grams = CASE WHEN q.unit_label IS NULL THEN v.unit_grams ELSE q.unit_grams END
    FROM duplicados d
    JOIN public.catalog_foods v ON v.name = d.se_va
   WHERE q.name = d.se_queda
  RETURNING q.name
)
-- 2. Y ahora sí.
--
-- No hay clave ajena que apunte aquí: el catálogo se COPIA a tu biblioteca, no
-- se referencia (0033, decisión 3). Quien ya tenga «Uvas» copiadas las
-- conserva con sus números; lo que deja de pasar es que le lleguen nuevas.
DELETE FROM public.catalog_foods
 WHERE name IN (SELECT se_va FROM duplicados);

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT count(*) FROM public.catalog_foods;                  -- 248, eran 264
--   SELECT name FROM public.catalog_foods WHERE name IN ('Uva', 'Uvas');  -- solo «Uva»
--   SELECT name, tags FROM public.catalog_foods
--    WHERE name IN ('Skyr', 'Surimi (palitos)');
--   -- Skyr {lactosa} · Surimi (palitos) {gluten,huevo,pescado}
--
-- Repetirla no hace nada: la segunda vez no existe ninguna `se_va`.
--
-- Y en la aplicación: abrir las equivalencias de un huevo. Antes salían cuatro
-- huevos; ahora sale lo que de verdad es otra cosa.
-- ============================================================================
