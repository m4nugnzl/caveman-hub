-- ============================================================================
-- La dieta deja de tener dos días con el nombre puesto en el esquema
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva: dos columnas nuevas con valor por defecto. No borra nada, no
--     cambia permisos y no toca ni un dato de los que ya hay. Las columnas
--     viejas se quedan EXACTAMENTE como están.
--
-- ══ Qué había ══════════════════════════════════════════════════════════════
--
-- Un plan de nutrición tenía dos días, y con el nombre escrito en el esquema:
--
--     has_day_variants        boolean   ← ¿son dos?
--     closed_meals            jsonb     ← el menú, si es uno
--     closed_meals_training   jsonb     ← el de entreno
--     closed_meals_rest       jsonb     ← el de descanso
--     target_kcals, protein_grams…      ← el objetivo de entreno (o el único)
--     meals                   jsonb     ← el objetivo de descanso (ver 0004)
--
-- No había un tercero posible. Un alto/medio/bajo no cabía, y un ciclado de
-- hidratos de siete días, tampoco. Y como no había reparto semanal, la
-- aplicación —que YA SABE qué días entrena cada persona, por el `weekly_split`
-- del programa— le pedía al cliente que eligiera a mano qué dieta le tocaba hoy.
--
-- ══ Qué añade ══════════════════════════════════════════════════════════════
--
--     days  jsonb  [{ id, name, targets: { targetKcals, … }, meals: [ … ] }]
--     week  jsonb  { casilla: dayId|null }
--
-- Las claves de `week` son LAS CASILLAS DEL CICLO de esa persona, que las pone
-- `cycleSlots` (`domain/training.js`):
--
--   · Ciclo semanal   → "Lunes" … "Domingo", las mismas que usa el
--                       `weekly_split` del programa: un solo vocabulario.
--   · Ciclo rotativo  → "1", "2", "3"…, la posición dentro del microciclo,
--                       descansos incluidos. Un 2/1 con cuatro sesiones son
--                       seis casillas y ningún martes.
--
-- Al nacer esta columna eran solo los siete días de la semana, y eso dejaba sin
-- poder repartir la dieta a quien entrena por ciclos rotativos —que es la mitad
-- de quien hace un ciclado de hidratos—. Se corrigió sin tocar el esquema: es
-- jsonb, y una clave es una clave. Ver el bloque «EL REPARTO DEL CICLO» en
-- `domain/nutrition.js`.
--
-- ══ Y por qué NO convierte los datos ═══════════════════════════════════════
--
-- Porque no hace falta y porque convertir es lo único que podría romper algo.
-- `planDays()` deriva los días de las columnas de siempre cuando `days` está
-- vacío —una dieta única es un día, `has_day_variants` son dos—, así que:
--
--   · Un plan que nunca pase de dos días nunca escribe aquí. Sigue viviendo en
--     sus columnas, y una versión anterior de la aplicación lo lee entero.
--   · El primero que añada un tercer día, lo renombre o reparta la semana
--     materializa la lista en ese momento, con lo que ya tenía dentro.
--
-- Rellenar `days` de golpe para 300 clientes sería reescribir 300 planes para
-- que digan lo mismo que ya dicen, y dejar a los que no hayan actualizado
-- todavía leyendo unas columnas que ya no son la verdad.
--
-- ── El reflejo, que es la otra mitad del trato ──────────────────────────────
-- Con `days` escrito, `mapNutritionToDb` sigue rellenando las columnas viejas
-- con los DOS PRIMEROS días. Un plan de cuatro se ve incompleto desde fuera,
-- pero no vacío ni falso — que es lo que importa para la copia de seguridad, la
-- radiografía y el portal de quien no haya recargado.
--
-- ⚠️  ORDEN DE DESPLIEGUE: esta migración va ANTES que el código. Sin ella,
--     añadir un día devuelve un error de la base de datos al guardar (columna
--     inexistente) y el cambio no llega a escribirse. Lo que ya existe —planes
--     de uno o dos días— no manda estas columnas y no se entera.
-- ============================================================================

BEGIN;

ALTER TABLE public.nutrition_plans
  ADD COLUMN IF NOT EXISTS days jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS week jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.nutrition_plans.days IS
  'Los días de la dieta cuando son más de los que caben en closed_meals*. Vacío = el plan vive en las columnas de siempre. Ver domain/nutrition.js.';
COMMENT ON COLUMN public.nutrition_plans.week IS
  'Reparto del ciclo: casilla → id de un día de `days`. La casilla es el día de la semana (Lunes…Domingo) en ciclo natural, o la posición dentro del microciclo ("1", "2"…) en ciclo rotativo; las pone cycleSlots() en domain/training.js. Vacío = sin reparto, y entonces el cliente los ve todos.';

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT c.name,
--          jsonb_array_length(n.days)                         AS dias,
--          (SELECT count(*) FROM jsonb_each(n.week) e
--            WHERE e.value <> 'null'::jsonb)                   AS repartidos,
--          n.has_day_variants
--   FROM public.nutrition_plans n
--   JOIN public.clients c ON c.id = n.client_id
--   ORDER BY dias DESC, c.name;
--
-- Nada más aplicarla, `dias` sale 0 para todo el mundo: es lo correcto. La
-- columna se rellena cliente a cliente, el día que a ese cliente le hagan
-- falta. Y `has_day_variants` sigue siendo verdad en los planes de dos días,
-- porque el reflejo lo mantiene.
-- ============================================================================
