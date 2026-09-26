-- ============================================================================
-- Restaurar una versión del plan
-- ----------------------------------------------------------------------------
-- Requiere 0140 (`client_plan_versions`, `foto_del_plan`), 0124 y 0145 (la
-- llave de pausa, `versiones_en_pausa`, y que la foto automática la respete)
-- y 0027 (`can_write_client_active`). Se para sola si falta alguna.
--
-- ⚠️  Añade UNA función y UNA columna (`client_plan_versions.cerrada`, falsa
--     en todas las que ya hay), y reescribe `guardar_version_del_plan` (0145)
--     con una condición más. No cambia ninguna fila al aplicarla.
--
-- ══ Qué hace (26 sep 2026, letra f de la línea de tiempo) ══════════════════
--
-- `restaurar_version_del_plan(p_version, p_nota)` deja el plan del cliente
-- como estaba en esa versión, en UNA transacción:
--
--   · Las fases: se quitan las de ahora y vuelven las de la versión, con sus
--     mismos id (nada apunta a una fase por clave ajena; el EXCLUDE de solapes
--     de la 0028 se cumple porque la versión ya lo cumplía).
--   · El destino (fecha, título y tipo): si la versión tenía y ahora hay uno,
--     se le ponen los suyos; si ahora no hay, se crea. Si la versión NO tenía
--     destino, el de ahora se queda: quitarlo sería borrar un evento del
--     calendario (una competición, una boda) que no es solo del plan.
--   · El peso objetivo, si la versión tenía destino: solo esa clave
--     (`preferences.goal.targetWeightKg`), sin tocar el resto. La app guarda
--     las preferencias enteras por su cola y sin guarda de versión, así que
--     justo después escribe el mismo número en las suyas: su siguiente
--     guardado lleva ya el peso restaurado y no lo pisa. Ese guardado no
--     cambia el número, así que no dispara ninguna foto.
--
-- Las fotos automáticas (0140) se paran mientras escribe —serían tres o
-- cuatro versiones a medias— y al terminar se guarda UNA, la del plan
-- restaurado, con la nota que manda la app («Restaurada la del 12 sep»).
-- Siempre nueva, nunca agrupada con la anterior: restaurar es un cambio con
-- nombre propio. El plan de antes ya era una versión (la última), así que
-- restaurar se deshace restaurando esa.
--
-- Y CERRADA: el siguiente cambio, aunque llegue dentro de los 15 minutos de
-- la tanda, abre una versión nueva con su propio motivo en vez de meterse en
-- la restaurada y heredar su nota. `guardar_version_del_plan` es la de la
-- 0145 con esa condición más.
--
-- ══ Quién ══════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER porque la versión nueva la escribe la base (nadie tiene
-- INSERT sobre la tabla). Por eso comprueba a mano lo mismo que las políticas
-- de las fases: `can_write_client_active`, que incluye la suscripción.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_plan_versions') IS NULL
     OR to_regprocedure('public.foto_del_plan(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0140_las_versiones_del_plan.sql.';
  END IF;
  IF to_regprocedure('public.versiones_en_pausa()') IS NULL THEN
    RAISE EXCEPTION 'Falta 0124_la_dieta_se_fecha_al_guardarla.sql.';
  END IF;
  IF to_regprocedure('public.can_write_client_active(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta can_write_client_active (0027).';
  END IF;
END $$;

BEGIN;

-- ── 1. Una versión cerrada no absorbe más cambios ──────────────────────────

ALTER TABLE public.client_plan_versions
  ADD COLUMN IF NOT EXISTS cerrada boolean NOT NULL DEFAULT false;

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

  -- La misma persona, seguida: la tanda sigue abierta. Salvo que la última
  -- sea una restauración: esa se queda como se restauró.
  IF v_ultima.id IS NOT NULL
     AND v_quien IS NOT NULL
     AND v_ultima.created_by = v_quien
     AND NOT v_ultima.cerrada
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

-- ── 2. Restaurar ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restaurar_version_del_plan(p_version uuid, p_nota text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quien    uuid := auth.uid();
  v_version  public.client_plan_versions;
  v_cliente  uuid;
  v_antes    jsonb;
  v_ancla    public.client_events;
  v_destino  jsonb;
  v_pausa    text := current_setting('app.sin_versiones', true);
  v_foto     record;
  v_nueva    uuid;
BEGIN
  SELECT * INTO v_version FROM public.client_plan_versions WHERE id = p_version;
  v_cliente := v_version.client_id;
  IF v_cliente IS NULL OR v_quien IS NULL OR NOT public.can_write_client_active(v_cliente) THEN
    RAISE EXCEPTION 'No existe esa versión, o no puedes cambiar el plan de este cliente.';
  END IF;

  -- Una restauración a la vez por cliente: la segunda espera a la primera.
  PERFORM 1 FROM public.clients WHERE id = v_cliente FOR UPDATE;

  PERFORM set_config('app.sin_versiones', 'on', true);

  -- ── Las fases ──────────────────────────────────────────────────────────────
  -- Quién y cuándo creó cada una, para las que vuelven con el mismo id.
  SELECT coalesce(jsonb_object_agg(id::text, jsonb_build_object('by', created_by, 'at', created_at)), '{}'::jsonb)
    INTO v_antes
  FROM public.client_phases WHERE client_id = v_cliente;

  DELETE FROM public.client_phases WHERE client_id = v_cliente;

  INSERT INTO public.client_phases (
    id, client_id, title, direction, rate_pct, starts_on, ends_on, note,
    next_options, next_question, replanteos, created_by, created_at, updated_at
  )
  SELECT
    (f ->> 'id')::uuid,
    v_cliente,
    f ->> 'title',
    f ->> 'direction',
    coalesce((f ->> 'ratePct')::numeric, 0),
    (f ->> 'startsOn')::date,
    (f ->> 'endsOn')::date,
    coalesce(f ->> 'note', ''),
    CASE WHEN jsonb_typeof(f -> 'nextOptions') = 'array' THEN f -> 'nextOptions' END,
    f ->> 'nextQuestion',
    CASE WHEN jsonb_typeof(f -> 'replanteos') = 'array' THEN f -> 'replanteos' END,
    coalesce((v_antes -> (f ->> 'id') ->> 'by')::uuid, v_quien),
    coalesce((v_antes -> (f ->> 'id') ->> 'at')::timestamptz, now()),
    now()
  FROM jsonb_array_elements(v_version.fases) AS f;

  -- ── El destino ─────────────────────────────────────────────────────────────
  v_destino := v_version.destino;
  IF v_destino IS NOT NULL THEN
    -- El de ahora, elegido como lo elige `foto_del_plan`.
    SELECT * INTO v_ancla FROM public.client_events e
    WHERE e.client_id = v_cliente AND e.ancla
    ORDER BY (e.date < current_date), CASE WHEN e.date >= current_date THEN e.date END, e.date DESC
    LIMIT 1
    FOR UPDATE;

    IF v_ancla.id IS NOT NULL THEN
      UPDATE public.client_events
      SET date  = (v_destino ->> 'fecha')::date,
          title = coalesce(nullif(btrim(v_destino ->> 'titulo'), ''), title),
          kind  = coalesce(v_destino ->> 'kind', kind)
      WHERE id = v_ancla.id;
    ELSE
      INSERT INTO public.client_events (client_id, created_by, date, kind, title, ancla, privada)
      VALUES (
        v_cliente, v_quien, (v_destino ->> 'fecha')::date,
        coalesce(v_destino ->> 'kind', 'race'),
        coalesce(nullif(btrim(v_destino ->> 'titulo'), ''), 'Destino'),
        true, false
      );
    END IF;

    -- El peso objetivo: solo esa clave (la app escribe el mismo después).
    UPDATE public.clients
    SET preferences = jsonb_set(
          coalesce(preferences, '{}'::jsonb),
          '{goal}',
          CASE WHEN jsonb_typeof(preferences -> 'goal') = 'object' THEN preferences -> 'goal' ELSE '{}'::jsonb END
            || jsonb_build_object('targetWeightKg', coalesce(v_destino -> 'pesoObjetivoKg', 'null'::jsonb))
        )
    WHERE id = v_cliente;
  END IF;

  -- ── Una versión, la del plan restaurado, cerrada ───────────────────────────
  PERFORM set_config('app.sin_versiones', coalesce(v_pausa, ''), true);

  SELECT * INTO v_foto FROM public.foto_del_plan(v_cliente);
  INSERT INTO public.client_plan_versions (client_id, created_by, fases, destino, nota, cerrada)
  VALUES (v_cliente, v_quien, v_foto.fases, v_foto.destino, NULLIF(left(btrim(coalesce(p_nota, '')), 280), ''), true)
  RETURNING id INTO v_nueva;

  -- El tope de la 0140: 200 por cliente, sin tocar el original.
  DELETE FROM public.client_plan_versions
  WHERE id IN (
    SELECT id FROM public.client_plan_versions
    WHERE client_id = v_cliente
    ORDER BY created_at, id
    OFFSET 1
    LIMIT greatest(0, (SELECT count(*) FROM public.client_plan_versions WHERE client_id = v_cliente) - 200)
  );

  RETURN v_nueva;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_version_del_plan(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_version_del_plan(uuid, text) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT has_function_privilege('anon',
--     'public.restaurar_version_del_plan(uuid, text)', 'execute');
--   -- false
--
--   -- Con la sesión de un entrenador (la prueba de la base lo hace así):
--   SELECT public.restaurar_version_del_plan('<versión>', 'Restaurada la del 12 sep');
--   -- las fases del cliente son las de la versión, y hay UNA versión más,
--   -- con `cerrada = true`
--
-- Para deshacer:
--   DROP FUNCTION public.restaurar_version_del_plan(uuid, text);
--   -- volver a aplicar 0145 (su `guardar_version_del_plan`), y después:
--   ALTER TABLE public.client_plan_versions DROP COLUMN cerrada;
-- ============================================================================
