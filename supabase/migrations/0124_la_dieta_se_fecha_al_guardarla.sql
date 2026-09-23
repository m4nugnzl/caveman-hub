-- ============================================================================
-- La dieta se fecha al guardarla
-- ----------------------------------------------------------------------------
-- Requiere `0059_cardio_goal.sql` y `0111_los_dias_de_la_dieta.sql` (las
-- columnas de la pauta que aquí se leen). Se para sola si falta alguna.
--
-- ⚠️  Aditiva: una tabla nueva, dos funciones, un disparador sobre
--     `nutrition_plans` y su lectura. No toca ni una fila de las que ya hay ni
--     ninguna política existente. Sin esta migración la aplicación sigue igual:
--     la escalera de kcal sale de las revisiones cerradas, como hasta hoy.
--
-- ══ Qué resuelve ════════════════════════════════════════════════════════════
--
-- Hasta hoy, la única constancia de qué dieta llevaba alguien en una semana
-- pasada era la foto del plan que se guarda al CERRAR una revisión
-- (`check_ins.snapshot`, 0042). Un cambio de pauta hecho entre dos revisiones
-- caía en la semana de la revisión siguiente, y si entre las dos pasaban tres
-- semanas, el escalón de la escalera y su hilo en el roadmap se dibujaban con
-- hasta tres semanas de error. El roadmap lo marca con «≈» (R2).
--
-- Con esto, cada día en que cambia alguna cifra de la pauta queda una versión
-- con su fecha. La escalera deja de depender de cuándo se revisa.
--
-- ══ Por qué un DISPARADOR y no código de la aplicación ══════════════════════
--
-- La dieta se escribe por al menos cinco caminos: el autoguardado del editor,
-- copiar la de otro cliente, mandarla a varios, restaurar una copia de la ficha
-- y el importador. Fechar desde la aplicación exigiría acordarse en los cinco, y
-- en el sexto que venga. Desde la base se cubren todos, y es imposible que uno
-- se olvide.
--
-- ══ Qué se guarda, y qué NO ════════════════════════════════════════════════
--
-- Las CIFRAS de la pauta: kcal y macros de cada día, el reparto del ciclo, los
-- pasos y el cardio. Las comidas NO: son el grueso de la fila, cambian con cada
-- ajuste fino y no hacen falta para saber qué objetivo estaba puesto. Menos de
-- 1 KB por versión.
--
-- La media del ciclo (`cycleFoto`) NO se calcula aquí: depende de los días de
-- entreno del cliente, que viven en su programa y se leen en JavaScript. Se
-- calcula al leer, con la misma función que usa la foto de la revisión.
--
-- ══ Las tres reglas del día ═════════════════════════════════════════════════
--
--   1. EL DÍA ES EL DEL ENTRENADOR. La aplicación manda su zona horaria en la
--      cabecera `x-zona-horaria` (`lib/supabaseClient.js`). Sin ella —un
--      guion, la consola— vale la de Madrid, que es la del producto. Guardar
--      un lunes a las 00:30 en Madrid es lunes, no domingo en UTC.
--   2. GANA EL ÚLTIMO DEL DÍA. Una versión por cliente y día: los guardados
--      intermedios de una misma tarde no son decisiones, son tecleo.
--   3. LO DESHECHO NO DEJA RASTRO. Si al acabar el día la pauta vuelve a ser la
--      de la versión anterior, la de hoy se borra: no hubo cambio.
--
-- ══ Cuándo NO actúa: la restauración y la siembra ═══════════════════════════
--
-- Restaurar una copia reescribe `nutrition_plans`, y para el disparador eso es
-- un cambio de pauta hecho HOY: un escalón con su hilo que nadie decidió. Lo
-- mismo al sembrar la demo. Por eso se pone en pausa de dos formas:
--
--   · En una sesión de SQL:           SET app.sin_versiones = 'on';
--   · Por la API, con la clave de servicio, la cabecera `x-sin-versiones: 1`.
--     `scripts/restore.mjs`, `scripts/demo.mjs` y `scripts/sembrar-cliente.mjs`
--     la mandan. Solo cuenta con la clave de servicio: un entrenador no puede
--     escribirse una dieta sin fecha mandando una cabecera.
--
-- Y la restauración trae las versiones de la copia: se restauran ANTES que
-- `nutrition_plans` (ver `ORDEN` en `restore.mjs`).
--
-- ══ Lo que NO recupera ══════════════════════════════════════════════════════
--
-- El pasado. `audit_log` (0017) guarda quién y cuándo, no los valores, así que
-- no hay de dónde sacar las versiones de antes de hoy. La fecha exacta empieza
-- el día en que se aplica esta migración; lo anterior sigue saliendo de las
-- revisiones, con su «≈».
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nutrition_plans' AND column_name = 'cardio_goal'
  ) THEN
    RAISE EXCEPTION 'Falta 0059_cardio_goal.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nutrition_plans' AND column_name = 'days'
  ) THEN
    RAISE EXCEPTION 'Falta 0111_los_dias_de_la_dieta.sql.';
  END IF;
END $$;

BEGIN;

/*
  Una fila por cliente y día. La clave es natural (cliente, día) porque es la
  regla: una versión por día. Sin `id`, como `client_folders` y
  `platform_snapshots`, y por eso `restore.mjs` la declara en `CLAVE`.

  `pauta` lleva los nombres de las columnas de `nutrition_plans`, así que se
  lee con el mismo traductor que la dieta (`mapNutritionFromDb`) y no hay una
  segunda forma que mantener.

  Con cascada: si se borra la ficha, sus versiones se van con ella. Es la única
  forma de que el «bórrame todo» las alcance, porque nadie puede borrarlas por
  la API (no hay política de escritura).
*/
CREATE TABLE IF NOT EXISTS public.nutrition_plan_versions (
  client_id  uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  dia        date        NOT NULL,
  pauta      jsonb       NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_plan_versions_pkey PRIMARY KEY (client_id, dia)
);

COMMENT ON TABLE public.nutrition_plan_versions IS
  'La pauta de la dieta (sin comidas) el día en que cambió. La escribe solo el '
  'disparador de nutrition_plans. Ver la cabecera de la migración 0124.';

COMMIT;


-- ============================================================================
-- La pauta de un plan, y la pausa
-- ============================================================================

BEGIN;

/*
  Las cifras de un plan, sin comidas. Es lo que se compara para saber si hubo
  cambio y lo que se guarda si lo hubo.

  · `meals` solo si es un objeto: ahí viven los objetivos del día de descanso
    (0004). Una lista es un menú heredado, y el menú no es pauta.
  · De cada día de `days` se quita su menú (`meals`) y se quedan su id, su
    nombre y sus cifras.
*/
CREATE OR REPLACE FUNCTION public.pauta_de_la_dieta(p public.nutrition_plans)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'target_kcals',     p.target_kcals,
    'protein_grams',    p.protein_grams,
    'carbs_grams',      p.carbs_grams,
    'fats_grams',       p.fats_grams,
    'has_day_variants', p.has_day_variants,
    'meals',            CASE WHEN jsonb_typeof(p.meals) = 'object' THEN p.meals END,
    'days',             (
                          SELECT coalesce(
                            jsonb_agg(
                              CASE WHEN jsonb_typeof(d) = 'object' THEN d - 'meals' ELSE d END
                              ORDER BY i
                            ),
                            '[]'::jsonb
                          )
                          FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(p.days) = 'array' THEN p.days ELSE '[]'::jsonb END
                          ) WITH ORDINALITY AS t(d, i)
                        ),
    'week',             coalesce(p.week, '{}'::jsonb),
    'steps_goal',       p.steps_goal,
    'cardio_goal',      p.cardio_goal
  );
$$;

/*
  ¿Está en pausa? Ver «Cuándo NO actúa» en la cabecera.

  Cualquier error leyendo las variables —una cabecera que no es JSON— cuenta
  como «no está en pausa»: ante la duda se fecha, porque una versión de más se
  ve y una que falta no.
*/
CREATE OR REPLACE FUNCTION public.versiones_en_pausa()
RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.sin_versiones', true), '') = 'on' THEN
    RETURN true;
  END IF;
  RETURN coalesce(auth.role(), '') = 'service_role'
     AND coalesce(
           nullif(current_setting('request.headers', true), '')::json ->> 'x-sin-versiones',
           ''
         ) = '1';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

/*
  El día de hoy en la zona de quien escribe. Una zona que no existe cae en la de
  Madrid en vez de tumbar el guardado.
*/
CREATE OR REPLACE FUNCTION public.dia_de_quien_escribe()
RETURNS date
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  zona text;
BEGIN
  zona := nullif(current_setting('request.headers', true), '')::json ->> 'x-zona-horaria';
  RETURN (now() AT TIME ZONE coalesce(nullif(zona, ''), 'Europe/Madrid'))::date;
EXCEPTION WHEN OTHERS THEN
  RETURN (now() AT TIME ZONE 'Europe/Madrid')::date;
END;
$$;

COMMIT;


-- ============================================================================
-- El disparador
-- ============================================================================

BEGIN;

/**
 * Fecha la pauta cuando cambia.
 *
 * `SECURITY DEFINER` porque quien escribe la dieta no puede escribir en la
 * tabla de versiones, a propósito: el registro se genera, no se fabrica. Es el
 * mismo trato que `audit_log` (0017).
 *
 * AFTER y devuelve NULL: no toca la fila de la dieta.
 *
 * ── Por qué no falla nunca ──────────────────────────────────────────────────
 * Si fechar diera error, tumbaría el guardado de la dieta. Perder la versión de
 * un día es un escalón con «≈»; perder la dieta es perder trabajo. Se deja un
 * WARNING en el registro de la base, para que el fallo se vea sin romper nada.
 */
CREATE OR REPLACE FUNCTION public.fechar_la_pauta()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  nueva jsonb;
  hoy   date;
BEGIN
  IF public.versiones_en_pausa() THEN
    RETURN NULL;
  END IF;

  nueva := public.pauta_de_la_dieta(NEW);
  IF TG_OP = 'UPDATE' AND nueva = public.pauta_de_la_dieta(OLD) THEN
    RETURN NULL; -- se tocó un menú, una nota o un hábito: no es un cambio de pauta
  END IF;

  BEGIN
    hoy := public.dia_de_quien_escribe();

    INSERT INTO public.nutrition_plan_versions (client_id, dia, pauta, at)
    VALUES (NEW.client_id, hoy, nueva, now())
    ON CONFLICT (client_id, dia) DO UPDATE SET pauta = EXCLUDED.pauta, at = EXCLUDED.at;

    /* Lo deshecho no deja rastro: si hoy acaba igual que la versión anterior,
       hoy no cambió nada. */
    DELETE FROM public.nutrition_plan_versions v
    WHERE v.client_id = NEW.client_id
      AND v.dia = hoy
      AND v.pauta = (
        SELECT a.pauta FROM public.nutrition_plan_versions a
        WHERE a.client_id = NEW.client_id AND a.dia < hoy
        ORDER BY a.dia DESC
        LIMIT 1
      );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fechar_la_pauta(%): %', NEW.client_id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS fechar_la_pauta ON public.nutrition_plans;
CREATE TRIGGER fechar_la_pauta
  AFTER INSERT OR UPDATE ON public.nutrition_plans
  FOR EACH ROW EXECUTE FUNCTION public.fechar_la_pauta();

COMMIT;


-- ============================================================================
-- RLS: se lee como la dieta, no se escribe
-- ----------------------------------------------------------------------------
-- Quien lee la dieta del cliente lee sus versiones: su entrenador y él mismo.
-- Ocultarle las kcal a quien no las ve es cosa de la pantalla (`useOculto`),
-- como en el resto de su dieta.
--
-- Sin política de INSERT, UPDATE ni DELETE: solo escribe el disparador.
--
-- El GRANT va en la misma migración. Sin él, la política no llega a evaluarse
-- y PostgREST contesta 403 sin pista (ver la 0089).
-- ============================================================================

BEGIN;

ALTER TABLE public.nutrition_plan_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "versiones_read" ON public.nutrition_plan_versions;
CREATE POLICY "versiones_read" ON public.nutrition_plan_versions
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

GRANT SELECT ON public.nutrition_plan_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_versions TO service_role;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Que nace vacía (debe dar 0): nada se fecha hacia atrás.
--
--   SELECT count(*) FROM public.nutrition_plan_versions;
--
-- 2) Que un cambio de kcal se fecha y uno de menú no:
--
--   UPDATE public.nutrition_plans SET target_kcals = target_kcals + 50 WHERE client_id = '<id>';
--   UPDATE public.nutrition_plans SET closed_meals = closed_meals WHERE client_id = '<id>';
--   SELECT dia, pauta->>'target_kcals' FROM public.nutrition_plan_versions WHERE client_id = '<id>';
--
-- 3) Que en pausa no se fecha:
--
--   SET app.sin_versiones = 'on';
--   UPDATE public.nutrition_plans SET target_kcals = target_kcals + 50 WHERE client_id = '<id>';
--   RESET app.sin_versiones;
-- ============================================================================
