-- ============================================================================
-- Restaurar una copia no deja rastro de hoy
-- ----------------------------------------------------------------------------
-- Requiere 0124 (`versiones_en_pausa`), 0139 (`exercise_settings`) y 0140
-- (`guardar_version_del_plan`). Se para sola si falta alguna.
--
-- ⚠️  Reescribe DOS funciones con una condición más (`guardar_version_del_plan`
--     y `exercise_settings_sello`) y añade una (`crear_originales_del_plan`),
--     que solo puede llamar la clave de servicio. No toca ninguna tabla, fila,
--     disparador ni política.
--
--   1. Las versiones del plan se paran durante la restauración.
--   2. Los ajustes por ejercicio restaurados conservan sus fechas.
--   3. Al terminar, cada cliente con plan y sin versiones recibe su original.
--
-- ══ Por qué (25 sep 2026) ══════════════════════════════════════════════════
--
-- `scripts/restore.mjs` escribe primero las versiones de la copia, después
-- los eventos y después las fases. Cada escritura dispara la foto del plan
-- (0140). Entre los eventos y las fases el plan no coincide con ninguna
-- versión de la copia, y quedaba guardada una versión intermedia sin autor y
-- con fecha de hoy que nadie decidió.
--
-- La dieta ya se para con la misma llave (0124): `SET app.sin_versiones =
-- 'on'` en una sesión de SQL, o la cabecera `x-sin-versiones: 1` con la clave
-- de servicio. Aquí se reutiliza `versiones_en_pausa()` tal cual: una sola
-- llave para las dos clases de versiones. Un entrenador no puede usarla
-- (solo cuenta con la clave de servicio).
--
-- Quién manda la cabecera hoy: `restore.mjs`, `demo.mjs` y
-- `sembrar-cliente.mjs`. Los dos últimos tampoco dejarán versión del plan al
-- sembrar: el plan sembrado no es un cambio de nadie.
--
-- ══ 2. Las fechas de los ajustes por ejercicio (25 sep 2026) ════════════════
--
-- `exercise_settings_sello` (0139) pone `created_at` y `updated_at` a
-- ahora en cada escritura, para que el cliente no pueda fecharlos a mano. Al
-- restaurar, eso fechaba hoy cada ajuste de la copia. Con la misma llave, las
-- fechas que trae la fila se respetan; sin ella, todo sigue igual.
--
-- ══ 3. El original tras restaurar (25 sep 2026) ═══════════════════════════════
--
-- Con las versiones en pausa, un cliente cuya copia no traía versiones del
-- plan (una copia anterior a 0140) se quedaba sin original hasta su primer
-- cambio. `restore.mjs` llama a `crear_originales_del_plan` al terminar: a
-- cada cliente con fases o destino y sin ninguna versión le guarda la foto del
-- plan restaurado, con la nota que le pasa el script («Original tras
-- restaurar la copia del …»). A quien ya tiene versiones no le toca nada.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.versiones_en_pausa()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0124_la_dieta_se_fecha_al_guardarla.sql.';
  END IF;
  IF to_regclass('public.client_plan_versions') IS NULL
     OR to_regprocedure('public.foto_del_plan(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0140_las_versiones_del_plan.sql.';
  END IF;
  IF to_regprocedure('public.exercise_settings_sello()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0139 (exercise_settings).';
  END IF;
END $$;

BEGIN;

CREATE OR REPLACE FUNCTION public.guardar_version_del_plan(p_client uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quien   uuid := auth.uid();
  v_foto    record;
  v_ultima  public.client_plan_versions;
  v_sobran  integer;
BEGIN
  -- Restaurando una copia (o sembrando la demo): no es un cambio de nadie.
  IF public.versiones_en_pausa() THEN
    RETURN;
  END IF;

  -- Borrar el cliente arrastra sus fases y sus eventos: no hay nada que guardar.
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client) THEN
    RETURN;
  END IF;

  SELECT * INTO v_foto FROM public.foto_del_plan(p_client);

  SELECT * INTO v_ultima FROM public.client_plan_versions
  WHERE client_id = p_client
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  -- Nada cambió de verdad (un guardado idéntico, un UPDATE sin cambios).
  IF v_ultima.id IS NOT NULL
     AND v_ultima.fases = v_foto.fases
     AND v_ultima.destino IS NOT DISTINCT FROM v_foto.destino THEN
    RETURN;
  END IF;

  -- La misma persona, seguida: la tanda sigue abierta.
  IF v_ultima.id IS NOT NULL
     AND v_quien IS NOT NULL
     AND v_ultima.created_by = v_quien
     AND v_ultima.tocada_en > now() - interval '15 minutes' THEN
    UPDATE public.client_plan_versions
    SET fases = v_foto.fases, destino = v_foto.destino, tocada_en = now()
    WHERE id = v_ultima.id;
    RETURN;
  END IF;

  INSERT INTO public.client_plan_versions (client_id, created_by, fases, destino)
  VALUES (p_client, v_quien, v_foto.fases, v_foto.destino);

  -- El tope: 200 por cliente. Se van las más antiguas DESPUÉS del original.
  SELECT count(*) - 200 INTO v_sobran FROM public.client_plan_versions WHERE client_id = p_client;
  IF v_sobran > 0 THEN
    DELETE FROM public.client_plan_versions
    WHERE id IN (
      SELECT id FROM public.client_plan_versions
      WHERE client_id = p_client
      ORDER BY created_at, id
      OFFSET 1
      LIMIT v_sobran
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_version_del_plan(uuid) FROM public, anon, authenticated;

-- ── 2. Los ajustes por ejercicio, con sus fechas ────────────────────────────

CREATE OR REPLACE FUNCTION public.exercise_settings_sello()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  -- Restaurando una copia: las fechas de la fila son las de verdad.
  v_restaurando boolean := public.versiones_en_pausa();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id           := OLD.id;
    NEW.client_id    := OLD.client_id;
    NEW.exercise_key := OLD.exercise_key;
    IF NOT v_restaurando THEN
      NEW.created_at := OLD.created_at;
      NEW.updated_at := now();
    END IF;
  ELSE
    IF NOT v_restaurando OR NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;
    IF NOT v_restaurando OR NEW.updated_at IS NULL THEN
      NEW.updated_at := now();
    END IF;
    -- Un tope por ejercicio: son etiquetas al lado de un nombre. Sin él, una
    -- consola podría llenar la tabla.
    IF (SELECT count(*) FROM public.exercise_settings
         WHERE client_id = NEW.client_id AND exercise_key = NEW.exercise_key) >= 12 THEN
      RAISE EXCEPTION 'Este ejercicio ya tiene 12 ajustes. Quita alguno antes de fijar otro.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. El original de quien se ha restaurado sin versiones ──────────────────

CREATE OR REPLACE FUNCTION public.crear_originales_del_plan(p_nota text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creados integer;
BEGIN
  INSERT INTO public.client_plan_versions (client_id, created_by, fases, destino, nota)
  SELECT c.id, NULL, f.fases, f.destino, NULLIF(left(btrim(p_nota), 280), '')
  FROM public.clients c
  CROSS JOIN LATERAL public.foto_del_plan(c.id) AS f
  WHERE (jsonb_array_length(f.fases) > 0 OR f.destino IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.client_plan_versions v WHERE v.client_id = c.id);
  GET DIAGNOSTICS v_creados = ROW_COUNT;
  RETURN v_creados;
END;
$$;

-- Solo la clave de servicio: es de la restauración, no de la app.
REVOKE ALL ON FUNCTION public.crear_originales_del_plan(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_originales_del_plan(text) TO service_role;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   BEGIN;
--   SET LOCAL app.sin_versiones = 'on';
--   UPDATE public.client_phases SET note = 'x' WHERE id = '<id>';
--   SELECT count(*) FROM public.client_plan_versions WHERE client_id = '<cliente>';
--   -- el mismo número que antes
--   ROLLBACK;
--
--   SELECT has_function_privilege('authenticated',
--     'public.crear_originales_del_plan(text)', 'execute');
--   -- false
--
-- Para deshacer: volver a correr la sección 3 de 0140 y la 1 de 0139, y
--   DROP FUNCTION public.crear_originales_del_plan(text);
-- ============================================================================
