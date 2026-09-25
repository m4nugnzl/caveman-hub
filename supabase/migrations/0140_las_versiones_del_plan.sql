-- ============================================================================
-- Las versiones del plan
-- ----------------------------------------------------------------------------
-- Requiere `0009_checkins_calendar.sql` (los permisos `app_*`), `0028` (las
-- fases), `0073` (`next_options`/`next_question`), `0122` (el destino) y
-- `0123` (`replanteos`). Se para sola si falta alguna.
--
-- ⚠️  Crea UNA tabla y tres disparadores que la llenan. No cambia ninguna fila
--     de ninguna otra tabla. Al aplicarla, cada cliente con plan recibe su
--     plan de ese momento como versión original. Se puede aplicar antes que
--     el código: nadie lee la tabla hasta la fase 6 de la línea de tiempo.
--
-- ══ Qué es una versión (24 sep 2026) ═══════════════════════════════════════
--
-- La FOTO del plan tal y como quedó después de una tanda de cambios: sus fases
-- y su destino. La línea de tiempo (`components/temporada/`) dibuja la primera
-- —el plan original— como una sombra debajo del vigente, para que se vea qué
-- se movió sin que nadie lo cuente.
--
--   · La guarda la BASE, no la aplicación: un disparador en cada sitio donde
--     vive el plan (las fases, el evento ancla y el peso objetivo). Así cuenta
--     cualquier camino que lo edite —la línea, el creador del plan, la ficha,
--     `estirar_fase`— sin que cada uno tenga que acordarse.
--   · Nadie la edita a mano: no hay política de UPDATE.
--
-- ── Las ediciones seguidas son UNA versión ─────────────────────────────────
-- Un arrastre que empuja cuatro fases son cuatro escrituras; montar un plan
-- son veinte. Si la última versión del cliente la dejó el MISMO entrenador y
-- la tocó hace menos de 15 minutos, la foto nueva la sustituye en vez de
-- sumar otra (`tocada_en` avanza con cada cambio: la ventana cuenta desde el
-- último, no desde el primero). Quien toque el plan después de 15 minutos de
-- silencio, o sea otra persona, abre versión nueva.
--
-- ── El ORIGINAL es la más antigua, y no se borra ──────────────────────────
-- No hay columna que lo diga: sería una segunda forma de decir lo mismo.
--   · Nadie la puede borrar a mano (el disparador de borrado lo impide).
--   · El tope de 200 versiones por cliente poda las más antiguas DESPUÉS del
--     original, nunca a él.
--   · La agrupación sí puede reescribir el original en sus primeros 15
--     minutos: montar un plan en diez cambios deja como original el plan
--     montado, no su primera fase suelta.
--   · Borrar el cliente se lo lleva todo, original incluido (CASCADE).
--
-- ── Por qué una foto en jsonb y no filas de fase copiadas ─────────────────
-- Porque una versión no es un plan vivo: no la lee `phaseAt`, no juzga ninguna
-- semana y no tiene que cumplir el EXCLUDE de solapes de la 0028. Copiarla en
-- filas obligaría a todo lo que lee `client_phases` a aprender a saltársela.
--
-- ── El destino va dentro ───────────────────────────────────────────────────
-- Fecha, título y peso objetivo. Mover la competición o cambiar el peso al que
-- se llega es cambiar el plan tanto como estirar una fase. El destino es la
-- primera ancla de hoy en adelante (o la última, si ya pasaron todas), como en
-- `anclaSiguiente`. El peso objetivo se COPIA de
-- `clients.preferences.goal.targetWeightKg`: si mañana cambia, la foto sigue
-- diciendo el de entonces.
--
--   fases:   [{ "id", "title", "direction", "ratePct", "startsOn", "endsOn",
--               "note", "nextOptions", "nextQuestion", "replanteos" }]
--   destino: { "fecha": "2026-11-15", "titulo": "Campeonato de España",
--              "kind": "race", "pesoObjetivoKg": 79.5 }  |  null
--
-- ══ Quién hace qué ═════════════════════════════════════════════════════════
--
--   · Leer, poner nota y borrar (menos el original): el entrenador o su
--     equipo (`app_can_read_client`, `app_can_write_client`).
--   · El cliente no la lee: su vista del roadmap (`TuRoadmap`) no cambia en
--     esta tanda, y una versión vieja no es asunto suyo.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_can_read_client(uuid)') IS NULL
     OR to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Faltan los permisos app_* de 0009.';
  END IF;
  IF to_regclass('public.client_phases') IS NULL THEN
    RAISE EXCEPTION 'Falta 0028_client_roadmap.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_events' AND column_name = 'ancla'
  ) THEN
    RAISE EXCEPTION 'Falta 0122_el_plan_apunta_a_una_fecha.sql.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_phases' AND column_name = 'replanteos'
  ) THEN
    RAISE EXCEPTION 'Falta 0123_el_replanteo_y_las_intervenciones.sql.';
  END IF;
END $$;

BEGIN;

-- ── 1. La tabla ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_plan_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  -- Cuándo empezó la tanda de cambios, y cuándo fue el último que absorbió.
  created_at  timestamptz NOT NULL DEFAULT now(),
  tocada_en   timestamptz NOT NULL DEFAULT now(),
  -- Quién la dejó. NULL = la sembró esta migración o un proceso sin sesión.
  created_by  uuid,

  -- Por qué, si el entrenador lo dice. Un rótulo, no una ficha.
  nota        text CHECK (nota IS NULL OR length(btrim(nota)) BETWEEN 1 AND 280),

  fases       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fases) = 'array'),

  destino     jsonb
    CHECK (
      destino IS NULL OR (
        jsonb_typeof(destino) = 'object'
        AND destino ->> 'fecha' ~ '^\d{4}-\d{2}-\d{2}$'
        AND (
          destino -> 'pesoObjetivoKg' IS NULL
          OR jsonb_typeof(destino -> 'pesoObjetivoKg') = 'null'
          OR (
            jsonb_typeof(destino -> 'pesoObjetivoKg') = 'number'
            AND (destino ->> 'pesoObjetivoKg')::numeric BETWEEN 30 AND 300
          )
        )
      )
    )
);

CREATE INDEX IF NOT EXISTS client_plan_versions_cliente
  ON public.client_plan_versions (client_id, created_at, id);

-- ── 2. La foto del plan de un cliente, ahora ───────────────────────────────

CREATE OR REPLACE FUNCTION public.foto_del_plan(p_client uuid, OUT fases jsonb, OUT destino jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ancla  public.client_events;
  v_peso   numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'direction', p.direction,
           'ratePct', p.rate_pct, 'startsOn', p.starts_on, 'endsOn', p.ends_on,
           'note', p.note, 'nextOptions', p.next_options,
           'nextQuestion', p.next_question, 'replanteos', p.replanteos
         ) ORDER BY p.starts_on), '[]'::jsonb)
    INTO fases
  FROM public.client_phases p
  WHERE p.client_id = p_client;

  SELECT * INTO v_ancla FROM public.client_events e
  WHERE e.client_id = p_client AND e.ancla
  ORDER BY (e.date < current_date), CASE WHEN e.date >= current_date THEN e.date END, e.date DESC
  LIMIT 1;

  IF v_ancla.id IS NULL THEN
    destino := NULL;
  ELSE
    SELECT CASE
             WHEN jsonb_typeof(c.preferences -> 'goal' -> 'targetWeightKg') = 'number'
             THEN (c.preferences -> 'goal' ->> 'targetWeightKg')::numeric
           END
      INTO v_peso
    FROM public.clients c WHERE c.id = p_client;
    -- Un objetivo fuera de lo razonable no rompe la edición del plan: se calla.
    IF v_peso IS NOT NULL AND (v_peso < 30 OR v_peso > 300) THEN
      v_peso := NULL;
    END IF;
    destino := jsonb_build_object(
      'fecha', to_char(v_ancla.date, 'YYYY-MM-DD'),
      'titulo', v_ancla.title,
      'kind', v_ancla.kind,
      'pesoObjetivoKg', v_peso
    );
  END IF;
END;
$$;

-- ── 3. Guardar la foto: agrupar, podar ─────────────────────────────────────
--
-- La llaman los tres disparadores de abajo. SECURITY DEFINER porque escribe
-- aunque quien edita el plan no tenga (ni deba tener) UPDATE sobre la tabla;
-- quién puede editar el plan ya lo decidieron las políticas de la tabla que
-- disparó, que se evalúan antes.
CREATE OR REPLACE FUNCTION public.guardar_version_del_plan(p_client uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quien   uuid := auth.uid();
  v_foto    record;
  v_ultima  public.client_plan_versions;
  v_sobran  integer;
BEGIN
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

-- ── 4. Los tres sitios donde vive el plan ──────────────────────────────────

-- Las fases: una vez por SENTENCIA y cliente, no por fila. `estirar_fase`
-- mueve varias filas de una vez y eso es un solo cambio.
CREATE OR REPLACE FUNCTION public.tg_version_por_fases()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR v_cliente IN SELECT DISTINCT client_id FROM nuevas LOOP
      PERFORM public.guardar_version_del_plan(v_cliente);
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR v_cliente IN SELECT client_id FROM nuevas UNION SELECT client_id FROM viejas LOOP
      PERFORM public.guardar_version_del_plan(v_cliente);
    END LOOP;
  ELSE
    FOR v_cliente IN SELECT DISTINCT client_id FROM viejas LOOP
      PERFORM public.guardar_version_del_plan(v_cliente);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS client_phases_version_ins ON public.client_phases;
CREATE TRIGGER client_phases_version_ins
  AFTER INSERT ON public.client_phases
  REFERENCING NEW TABLE AS nuevas
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_version_por_fases();

DROP TRIGGER IF EXISTS client_phases_version_upd ON public.client_phases;
CREATE TRIGGER client_phases_version_upd
  AFTER UPDATE ON public.client_phases
  REFERENCING OLD TABLE AS viejas NEW TABLE AS nuevas
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_version_por_fases();

DROP TRIGGER IF EXISTS client_phases_version_del ON public.client_phases;
CREATE TRIGGER client_phases_version_del
  AFTER DELETE ON public.client_phases
  REFERENCING OLD TABLE AS viejas
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_version_por_fases();

-- El destino: solo los eventos que son o eran ancla.
CREATE OR REPLACE FUNCTION public.tg_version_por_ancla()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.ancla THEN
    PERFORM public.guardar_version_del_plan(OLD.client_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.ancla
     AND (TG_OP = 'INSERT' OR NOT OLD.ancla OR NEW.client_id <> OLD.client_id) THEN
    PERFORM public.guardar_version_del_plan(NEW.client_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS client_events_version ON public.client_events;
CREATE TRIGGER client_events_version
  AFTER INSERT OR UPDATE OR DELETE ON public.client_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_version_por_ancla();

-- El peso objetivo: solo cuando cambia ese número, no con cualquier preferencia.
CREATE OR REPLACE FUNCTION public.tg_version_por_objetivo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.guardar_version_del_plan(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS clients_version_por_objetivo ON public.clients;
CREATE TRIGGER clients_version_por_objetivo
  AFTER UPDATE OF preferences ON public.clients
  FOR EACH ROW
  WHEN (OLD.preferences -> 'goal' -> 'targetWeightKg' IS DISTINCT FROM NEW.preferences -> 'goal' -> 'targetWeightKg')
  EXECUTE FUNCTION public.tg_version_por_objetivo();

-- ── 5. El original no se borra ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_el_original_se_queda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Borrando el cliente (CASCADE) su fila ya no está: entonces sí.
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = OLD.client_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.id = (
    SELECT id FROM public.client_plan_versions
    WHERE client_id = OLD.client_id
    ORDER BY created_at, id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'El plan original no se borra.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS client_plan_versions_original ON public.client_plan_versions;
CREATE TRIGGER client_plan_versions_original
  BEFORE DELETE ON public.client_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_el_original_se_queda();

-- ── 6. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.client_plan_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_versions_read" ON public.client_plan_versions;
CREATE POLICY "plan_versions_read" ON public.client_plan_versions
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "plan_versions_delete" ON public.client_plan_versions;
CREATE POLICY "plan_versions_delete" ON public.client_plan_versions
  FOR DELETE TO authenticated
  USING (public.app_can_write_client(client_id));

-- La nota es lo único que el entrenador escribe a mano, y por aquí.
CREATE OR REPLACE FUNCTION public.anotar_version_del_plan(p_id uuid, p_nota text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente uuid;
BEGIN
  SELECT client_id INTO v_cliente FROM public.client_plan_versions WHERE id = p_id;
  IF v_cliente IS NULL OR NOT public.app_can_write_client(v_cliente) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta versión.';
  END IF;
  UPDATE public.client_plan_versions
  SET nota = NULLIF(btrim(p_nota), '')
  WHERE id = p_id;
END;
$$;

-- Sin GRANT, las políticas no bastan: el 403 sale y no se ve. Sin INSERT ni
-- UPDATE: las fotos las saca la base.
GRANT SELECT, DELETE ON public.client_plan_versions TO authenticated;

REVOKE ALL ON FUNCTION public.foto_del_plan(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_version_del_plan(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_version_por_fases() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_version_por_ancla() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_version_por_objetivo() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_el_original_se_queda() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.anotar_version_del_plan(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anotar_version_del_plan(uuid, text) TO authenticated;

COMMENT ON TABLE public.client_plan_versions IS
  'Fotos del plan (fases + destino). La más antigua es el original y no se borra. Ver components/temporada/.';

-- ── 7. El original de quien ya tiene plan ──────────────────────────────────

INSERT INTO public.client_plan_versions (client_id, created_by, fases, destino)
SELECT c.id, NULL, f.fases, f.destino
FROM public.clients c
CROSS JOIN LATERAL public.foto_del_plan(c.id) AS f
WHERE (jsonb_array_length(f.fases) > 0 OR f.destino IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.client_plan_versions v WHERE v.client_id = c.id);

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT count(*) FROM public.client_plan_versions;
--   -- uno por cliente con fases o destino
--
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'client_plan_versions';
--   -- dos: read, delete
--
--   SELECT has_table_privilege('authenticated', 'public.client_plan_versions', 'UPDATE');
--   -- false
--
-- Borrar el original tiene que fallar:
--   DELETE FROM public.client_plan_versions WHERE id = (
--     SELECT id FROM public.client_plan_versions WHERE client_id = '<id>'
--     ORDER BY created_at, id LIMIT 1);
--   -- ERROR: El plan original no se borra.
--
-- Para deshacer:
--   DROP TRIGGER client_phases_version_ins ON public.client_phases;
--   DROP TRIGGER client_phases_version_upd ON public.client_phases;
--   DROP TRIGGER client_phases_version_del ON public.client_phases;
--   DROP TRIGGER client_events_version ON public.client_events;
--   DROP TRIGGER clients_version_por_objetivo ON public.clients;
--   DROP TABLE public.client_plan_versions;
--   (se pierden las versiones; copiar antes con `npm run backup`).
-- ============================================================================
