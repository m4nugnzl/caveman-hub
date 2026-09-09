-- ============================================================================
-- La ficha del ejercicio y las etiquetas del alimento (C12 · C13, esquema)
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y sin riesgo: tres columnas nuevas en las dos tablas del catálogo
--     común (0033) y unos UPDATE conservadores sobre lo ya sembrado. No toca
--     permisos, ni bibliotecas, ni dietas.
--
-- ══ 1 · La ficha del ejercicio ══════════════════════════════════════════════
--
-- El ejercicio era `{name, muscle_group}`: un nombre que no sabe nada de sí
-- mismo. Sin saber QUÉ NECESITA (equipamiento) no puede cruzarse con el álbum
-- del gimnasio del cliente, y sin saber CÓMO SE HACE (descripción) el portal no
-- tiene nada que enseñar a quien está delante de la máquina.
--
--   · `equipment`   qué hace falta para hacerlo. Texto y no un enum: es
--                   vocabulario («Barra», «Mancuernas», «Polea»…), no un
--                   catálogo cerrado — mismo criterio que las etiquetas de
--                   cliente (0093). NULL significa «no dice», que es la verdad
--                   de las filas viejas.
--   · `description` la técnica en una o dos frases. Referencia, no doctrina.
--
-- La biblioteca del entrenador NO gana columnas: la ficha es del catálogo, y
-- quien quiera leerla para un ejercicio suyo la busca por nombre
-- (`findByName(catalogExercises, …)`). Copiarla a cada biblioteca sería
-- repartir mil copias de un dato de referencia — el error que la 0033 evitó.
--
-- ══ 2 · Las etiquetas del alimento ══════════════════════════════════════════
--
-- «Contiene gluten» al lado de un cliente celíaco es información; hoy la tiene
-- que recordar el entrenador de memoria. `tags` lleva HECHOS del alimento
-- (gluten, lactosa, huevo, pescado, marisco, frutos-de-cascara, soja, carne):
-- lo que contiene, nunca a quién se lo puede comer. El cruce con las
-- restricciones del cliente es regla de producto y vive en la aplicación
-- (`domain/catalog.js`), que es quien conoce sus condicionantes — la base no
-- opina de dietas. Y el aviso resultante es PASIVO: resalta, nunca filtra.
--
-- ══ Los UPDATE de abajo, y su límite ════════════════════════════════════════
--
-- Completan lo sembrado por la 0033 SOLO donde el nombre no deja duda («…con
-- barra» lleva barra; la leche lleva lactosa). Lo dudoso se queda en NULL / sin
-- etiqueta, que significa «no dice» — inventar un dato con toda la pinta de ser
-- correcto es peor que callar. Son revisables: filas de catálogo, sin dueño.
-- ============================================================================

BEGIN;

ALTER TABLE public.catalog_exercises
  ADD COLUMN IF NOT EXISTS equipment text;

ALTER TABLE public.catalog_exercises
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.catalog_foods
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMIT;


BEGIN;

/* ── El equipamiento que el propio nombre declara ─────────────────────────── */

UPDATE public.catalog_exercises SET equipment = 'Barra'
  WHERE equipment IS NULL AND lower(name) ~ '(con barra|barra libre|peso muerto|sentadilla trasera|sentadilla frontal|press banca|press militar|remo pendlay|hip thrust)';

UPDATE public.catalog_exercises SET equipment = 'Mancuernas'
  WHERE equipment IS NULL AND lower(name) ~ 'mancuerna';

UPDATE public.catalog_exercises SET equipment = 'Polea'
  WHERE equipment IS NULL AND lower(name) ~ '(polea|jal[oó]n|cruce de cables|face pull|pushdown)';

UPDATE public.catalog_exercises SET equipment = 'Máquina'
  WHERE equipment IS NULL AND lower(name) ~ '(m[aá]quina|prensa|hack|multipower|contractor|extensi[oó]n de cu[aá]driceps|curl femoral)';

UPDATE public.catalog_exercises SET equipment = 'Peso corporal'
  WHERE equipment IS NULL AND lower(name) ~ '(dominada|fondos|flexi[oó]n|plancha|muscle.?up|pino|zancada sin peso)';

/* ── Las etiquetas que el propio nombre declara ───────────────────────────── */

UPDATE public.catalog_foods SET tags = array_append(tags, 'gluten')
  WHERE NOT ('gluten' = ANY(tags))
    AND lower(name) ~ '(^pan|pan |pasta|espagueti|macarr[oó]n|cusc[uú]s|harina de trigo|avena|cebada|centeno|galleta|cereales|tortilla de trigo|seit[aá]n|cerveza)';

/* Sin mirada hacia delante: `~` es POSIX y no la admite. La «leche de» vegetal
   se excluye con un segundo patrón, que dice lo mismo y sí compila. */
UPDATE public.catalog_foods SET tags = array_append(tags, 'lactosa')
  WHERE NOT ('lactosa' = ANY(tags))
    AND lower(name) ~ '(leche|queso|yogur|k[eé]fir|nata|mantequilla|reques[oó]n|cuajada)'
    AND lower(name) !~ 'leche de (almendra|avena|arroz|coco|soja)';

UPDATE public.catalog_foods SET tags = array_append(tags, 'huevo')
  WHERE NOT ('huevo' = ANY(tags)) AND lower(name) ~ '(huevo|clara de huevo|tortilla francesa)';

UPDATE public.catalog_foods SET tags = array_append(tags, 'pescado')
  WHERE NOT ('pescado' = ANY(tags))
    AND lower(name) ~ '(at[uú]n|salm[oó]n|merluza|bacalao|sardina|boquer[oó]n|caballa|lubina|dorada|trucha|lenguado|rape|pez espada|anchoa)';

UPDATE public.catalog_foods SET tags = array_append(tags, 'marisco')
  WHERE NOT ('marisco' = ANY(tags))
    AND lower(name) ~ '(gamba|langostino|mejill[oó]n|calamar|sepia|pulpo|almeja|berberecho|cangrejo|marisco)';

UPDATE public.catalog_foods SET tags = array_append(tags, 'frutos-de-cascara')
  WHERE NOT ('frutos-de-cascara' = ANY(tags))
    AND lower(name) ~ '(nuez|nueces|almendra|avellana|anacardo|pistacho|cacahuete|crema de cacahuete|mantequilla de cacahuete)';

UPDATE public.catalog_foods SET tags = array_append(tags, 'soja')
  WHERE NOT ('soja' = ANY(tags)) AND lower(name) ~ '(soja|tofu|tempeh|edamame)';

UPDATE public.catalog_foods SET tags = array_append(tags, 'carne')
  WHERE NOT ('carne' = ANY(tags))
    AND lower(name) ~ '(pollo|pavo|ternera|cerdo|cordero|conejo|jam[oó]n|lomo|solomillo|chuleta|alitas|carne picada|hamburguesa de (vacuno|ternera|pollo|pavo)|bacon|beicon|chorizo|salchich)';

COMMIT;

-- ============================================================================
-- Lo que NO cambia, y conviene saberlo
-- ----------------------------------------------------------------------------
-- · **Los permisos.** Las dos tablas siguen siendo de solo lectura para todo el
--   mundo con sesión: nadie escribe desde el navegador, se llenan por migración
--   (la regla de la 0033, intacta).
--
-- · **Las bibliotecas.** Ni `exercises` ni `foods` ganan columnas: lo tuyo
--   sigue siendo tuyo y editable; la ficha y las etiquetas son del catálogo y
--   se leen de él por nombre.
--
-- · **Las dietas montadas.** Guardan su foto de macros y no miran `tags`:
--   etiquetar un alimento hoy no recalcula ni avisa sobre nada que ya se dio
--   por bueno.
-- ============================================================================
