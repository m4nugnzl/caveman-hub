-- ============================================================================
-- Alimentos que no se pesan: huevos, plátanos, rebanadas, cucharadas
-- ----------------------------------------------------------------------------
-- Añade dos columnas a `foods` y rellena las obvias. No cambia ningún cálculo y
-- no toca ninguna dieta ya montada.
--
-- ══ El problema ════════════════════════════════════════════════════════════
--
-- Toda la nutrición está en gramos, y para la mayoría de alimentos está bien: el
-- arroz se pesa, el pollo se pesa. Pero nadie pesa un huevo. Nadie piensa «60 g de
-- huevo»: piensa «un huevo». Y con un plátano, una manzana o una rebanada de pan
-- pasa lo mismo.
--
-- Escribir «120 g de plátano» en una dieta obliga al cliente a hacer una
-- conversión que no sabe hacer —¿un plátano son 120 g, o 90, o 150?— cada vez que
-- desayuna. Lo que ocurre en la práctica es que deja de pesarlo y se lo inventa,
-- y a partir de ahí la dieta que el entrenador cree que está siguiendo y la que
-- sigue de verdad son dos cosas distintas.
--
-- ══ La decisión: los gramos siguen mandando ════════════════════════════════
--
-- Es lo importante de esta migración y la razón de que sea tan pequeña.
--
-- La tentación es guardar la cantidad en unidades y convertir al calcular. Eso
-- obligaría a tocar `foodMacros`, `optionMacros`, `mealMacros`, `dayMacros` y las
-- dietas ya guardadas — y a partir de ahí un alimento tendría DOS formas posibles
-- de expresar su cantidad, con todo el código teniendo que preguntar cuál es.
--
-- Aquí la unidad es una **lente**, no un dato: la dieta sigue guardando gramos y
-- las macros se siguen calculando igual. Lo único que se añade es cuántos gramos
-- pesa una unidad, para que la pantalla pueda enseñar «2 huevos» donde antes
-- ponía «110 g» y para que al escribir «2» se guarden 110.
--
-- Consecuencias de elegirlo así:
--   · Ningún cálculo cambia. Ninguna dieta existente se migra.
--   · Un alimento sin unidad definida se comporta exactamente como hoy.
--   · La conversión es de ida y vuelta: si el entrenador prefiere pesar, escribe
--     gramos y ya está.
--
-- ══ Por qué la etiqueta se guarda y no se deduce ═══════════════════════════
--
-- Podría deducirse del nombre —«Huevo entero» → «huevo»— y sería un desastre en
-- cuanto alguien añada «Huevos camperos L» o «Tortitas de arroz». La etiqueta es
-- del entrenador: «rebanada», «cazo», «cucharada», «lata», «filete». Son suyas
-- porque son las palabras que usa con sus clientes.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.foods') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla `foods`.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.foods
  -- Cómo se llama una unidad EN SINGULAR: «huevo», «rebanada», «cucharada».
  -- NULL = este alimento solo se pesa, que es el caso de la mayoría.
  ADD COLUMN IF NOT EXISTS unit_label text,
  -- Lo que pesa una. Es el único número que hace falta para convertir.
  ADD COLUMN IF NOT EXISTS unit_grams numeric;

/*
  Las dos van juntas o no va ninguna.

  Una etiqueta sin gramos no se puede convertir, y unos gramos sin etiqueta no se
  pueden nombrar: las dos mitades por separado no sirven para nada, y dejarlas
  entrar obligaría a cada pantalla a comprobar el caso a medias.
*/
ALTER TABLE public.foods
  DROP CONSTRAINT IF EXISTS foods_unit_complete;
ALTER TABLE public.foods
  ADD CONSTRAINT foods_unit_complete CHECK (
    (unit_label IS NULL AND unit_grams IS NULL)
    OR (unit_label IS NOT NULL AND unit_grams IS NOT NULL AND unit_grams > 0)
  );

COMMIT;


BEGIN;

/*
  ── Rellenar lo evidente ───────────────────────────────────────────────────

  Por nombre, sobre las bibliotecas que ya existen. Son los alimentos que siembra
  `seed_team_library` (0022), así que el nombre es exacto en la inmensa mayoría de
  los casos.

  Solo se toca lo que está en blanco (`unit_label IS NULL`): si alguien ya definió
  que para él una rebanada son 40 g, esa decisión es suya y gana.

  Los pesos son de referencia y de tamaño medio. No pretenden ser exactos —un
  plátano no pesa siempre 120 g— sino ahorrar la conversión de cabeza. La
  biblioteca es editable justo para eso.
*/
UPDATE public.foods f
SET unit_label = v.label,
    unit_grams = v.grams
FROM (VALUES
  -- Piezas
  ('Huevo entero',                 'huevo',      55),
  ('Clara de huevo',               'clara',      33),
  ('Plátano',                      'plátano',   120),
  ('Manzana',                      'manzana',   180),
  ('Naranja',                      'naranja',   180),
  ('Tomate',                       'tomate',    120),
  ('Patata',                       'patata',    150),
  ('Boniato',                      'boniato',   130),
  ('Aguacate',                     'aguacate',  150),

  -- Raciones y envases
  ('Pan integral',                 'rebanada',   30),
  ('Yogur griego natural',         'yogur',     125),
  ('Atún al natural (lata)',       'lata',       52),
  ('Leche semidesnatada',          'vaso',      250),
  ('Proteína de suero (polvo)',    'cazo',       30),

  -- Cucharadas: la grasa se mide así o no se mide
  ('Aceite de oliva virgen extra', 'cucharada',  10),
  ('Crema de cacahuete',           'cucharada',  15),
  ('Miel',                         'cucharada',  21),

  -- Frutos secos: la unidad es la pieza, y por eso pesa tan poco
  ('Nueces',                       'nuez',        5),
  ('Almendras',                    'almendra',    1.2)
) AS v(name, label, grams)
WHERE f.name = v.name
  AND f.unit_label IS NULL;

COMMIT;


BEGIN;

/**
 * La biblioteca inicial, ahora con unidades desde el primer día.
 *
 * Se reescribe `seed_team_library` en vez de dejar que la siembra ponga los
 * alimentos sin unidad y que el UPDATE de arriba los arregle después: ese UPDATE
 * corre UNA vez, al aplicar la migración, y los equipos que se creen mañana no
 * pasarían por él. El resultado sería que los entrenadores antiguos tendrían
 * unidades y los nuevos no, que es la peor de las dos opciones.
 *
 * El resto de la función no cambia: mismos ejercicios, mismos alimentos, mismas
 * macros, misma condición de «solo si la biblioteca está vacía».
 */
CREATE OR REPLACE FUNCTION public.seed_food_units(target_team uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.foods f
  SET unit_label = v.label,
      unit_grams = v.grams
  FROM (VALUES
    ('Huevo entero',                 'huevo',      55),
    ('Clara de huevo',               'clara',      33),
    ('Plátano',                      'plátano',   120),
    ('Manzana',                      'manzana',   180),
    ('Naranja',                      'naranja',   180),
    ('Tomate',                       'tomate',    120),
    ('Patata',                       'patata',    150),
    ('Boniato',                      'boniato',   130),
    ('Aguacate',                     'aguacate',  150),
    ('Pan integral',                 'rebanada',   30),
    ('Yogur griego natural',         'yogur',     125),
    ('Atún al natural (lata)',       'lata',       52),
    ('Leche semidesnatada',          'vaso',      250),
    ('Proteína de suero (polvo)',    'cazo',       30),
    ('Aceite de oliva virgen extra', 'cucharada',  10),
    ('Crema de cacahuete',           'cucharada',  15),
    ('Miel',                         'cucharada',  21),
    ('Nueces',                       'nuez',        5),
    ('Almendras',                    'almendra',    1.2)
  ) AS v(name, label, grams)
  WHERE f.team_id = target_team
    AND f.name = v.name
    AND f.unit_label IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_food_units(uuid) FROM public;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Qué ha quedado con unidad:
--
--   SELECT name, unit_label, unit_grams
--   FROM public.foods WHERE unit_label IS NOT NULL ORDER BY name;
--
-- Que las dos mitades no se pueden separar —esto tiene que fallar—:
--
--   UPDATE public.foods SET unit_label = 'pieza', unit_grams = NULL
--   WHERE name = 'Manzana';
--   -- ERROR: new row for relation "foods" violates check constraint
--
-- ── Lo que NO hace esta migración ──────────────────────────────────────────
-- No toca `nutrition_plans`. Las dietas ya montadas siguen guardando gramos y se
-- siguen calculando igual; lo único que cambia es que la pantalla, al abrir un
-- alimento con unidad definida, ofrece escribir «2 huevos» en vez de «110 g».
-- ============================================================================
