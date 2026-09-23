-- ============================================================================
-- Completar revisiones pasadas
-- ----------------------------------------------------------------------------
-- Requiere `0121_el_borrador_del_cuestionario.sql` (redefine `submit_check_in`
-- y `save_check_in_answers` con su misma firma) y `0117_lo_que_provoca_el_cliente.sql`
-- (convive con su disparador de `anthropometry`).
--
-- ══ Qué cambia ═════════════════════════════════════════════════════════════
--
-- El cliente puede volver a una revisión que se le quedó sin entregar y subir
-- lo que le faltó: pesajes con su fecha, medidas, fotos, el cuestionario. Con
-- dos fronteras que decidió el dueño el 23 de septiembre de 2026:
--
--   · **Revisada, cerrada.** Una semana con `reviewed_at` no la toca el cliente,
--     sin excepciones. Si hay algo que corregir, lo corrige su entrenador o la
--     reabre con «Deshacer revisión» (0063).
--   · **Cuatro semanas de margen.** Más atrás, fuera de plazo — «no tendría
--     mucho sentido subir la revisión de la semana 1 la semana 15». La excepción
--     es manual: el entrenador reabre UNA revisión hasta una fecha
--     (`abierta_hasta`).
--
-- El periodo EN CURSO no entra en ninguna de las dos: pesarse es diario y no
-- depende de la entrega. Un cliente que revisa el miércoles sigue apuntando su
-- peso del viernes aunque su entrenador ya le haya contestado.
--
-- ══ Por qué en la base y no solo en la pantalla ════════════════════════════
--
-- Porque la antropometría es UN jsonb por cliente (`anthropometry.history`) y
-- el cliente tiene UPDATE sobre la fila entera (0002). Hasta hoy podía reescribir
-- cualquier semana, las revisadas incluidas: las dos reglas de arriba eran de
-- pantalla. El disparador de abajo compara el historial viejo con el nuevo y
-- rechaza el guardado si alguna entrada que el CLIENTE añade, cambia o quita cae
-- en una semana que no puede tocar. El entrenador no pasa por ese filtro.
--
-- La pantalla ya impide llegar aquí: esto es la red de abajo. Y es importante
-- que lo sea, porque un rechazo deja el historial entero sin guardar hasta que
-- se recargue (la cola reenvía el jsonb completo).
--
-- ══ Y lo añadido después, sellado por el servidor ══════════════════════════
--
-- Cada entrada que el cliente añade o cambia lleva `apuntadoEl` con la hora del
-- SERVIDOR. Es lo que deja al entrenador ver qué llegó tarde sin fiarse del reloj
-- de un teléfono. Las entradas sin cambios conservan el suyo aunque la
-- aplicación no lo haya leído todavía: el disparador lo copia del historial
-- viejo, así que un guardado cualquiera no lo borra ni lo renueva.
--
-- ══ Qué NO se guarda ═══════════════════════════════════════════════════════
--
-- Ni el estado de una revisión (pendiente, sin entregar, entregada, cerrada) ni
-- si una entrega fue tarde: los dos se deducen de `submitted_at`, `reviewed_at`
-- y la pauta del cliente, con la misma cuenta que `domain/calendar.js`.
--
-- ══ La cuenta del margen vive en dos sitios ════════════════════════════════
--
-- Aquí y en `domain/revisionesPasadas.js` (`MARGEN_SEMANAS`). Esta versión es a
-- propósito un poco MÁS ancha —mira la semana de cada registro y no el inicio de
-- su periodo, y da un día de holgura por los husos horarios—: la pantalla decide
-- con precisión y la base solo impide lo que ninguna pantalla debería mandar.
-- Si se cambia el número, se cambia en los dos.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'save_check_in_answers'
  ) THEN
    RAISE EXCEPTION 'Falta 0121_el_borrador_del_cuestionario.sql: no existe `save_check_in_answers`.';
  END IF;
  IF to_regclass('public.anthropometry') IS NULL OR to_regclass('public.progress_photos') IS NULL THEN
    RAISE EXCEPTION 'Faltan las tablas base: `anthropometry` o `progress_photos`.';
  END IF;
END $$;

BEGIN;

-- ── 1. La reapertura manual ─────────────────────────────────────────────────
--
-- Una fecha y no un interruptor: «abierta hasta el 30» se cierra sola ese día y
-- los dos lados leen lo mismo. NULL = sin reapertura, que es lo normal.

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS abierta_hasta date;


-- ── 2. Quién escribe ────────────────────────────────────────────────────────
--
-- El cliente, y no un entrenador con permiso sobre su ficha. Las dos cosas a
-- la vez las cumpliría quien se tuviera a sí mismo de cliente, y ése escribe
-- como entrenador.

CREATE OR REPLACE FUNCTION public.escribe_el_cliente(target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_is_client(target) AND NOT public.app_can_write_client(target);
$$;

REVOKE ALL ON FUNCTION public.escribe_el_cliente(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.escribe_el_cliente(uuid) TO authenticated;


-- ── 3. La regla, en UNA función ─────────────────────────────────────────────
--
-- ¿Puede el cliente tocar lo que cuenta para la semana de `dia`? Devuelve NULL
-- si puede, y si no, la frase que va a leer — la cola de guardado enseña el
-- texto de un RAISE tal cual (`lib/dbErrors.js`).
--
-- El periodo en curso sale igual que en `currentCheckInPeriod`: el ancla es el
-- lunes de su alta (o el de hoy, sin alta), y la cadencia `preferences.checkin.
-- everyWeeks`, de 1 a 8.

CREATE OR REPLACE FUNCTION public.semana_cerrada_al_cliente(target uuid, dia date)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefs   jsonb;
  v_alta    date;
  v_cada    integer := 1;
  v_hoy     date := current_date;
  v_lunes   date;
  v_m       date;
  v_ancla   date;
  v_semanas integer;
  v_actual  date;
BEGIN
  IF dia IS NULL THEN
    RETURN NULL;
  END IF;

  v_lunes := date_trunc('week', dia)::date;

  SELECT preferences, start_date INTO v_prefs, v_alta
  FROM public.clients WHERE id = target;

  IF jsonb_typeof(v_prefs -> 'checkin' -> 'everyWeeks') = 'number' THEN
    v_cada := greatest(1, least(8, floor((v_prefs -> 'checkin' ->> 'everyWeeks')::numeric)::integer));
  END IF;

  v_m       := date_trunc('week', v_hoy)::date;
  v_ancla   := date_trunc('week', coalesce(v_alta, v_hoy))::date;
  v_semanas := (v_m - v_ancla) / 7;
  v_actual  := CASE WHEN v_semanas < 0 THEN v_m ELSE v_m - (v_semanas % v_cada) * 7 END;

  -- El periodo en curso (y lo que venga): la báscula es diaria.
  IF v_lunes >= v_actual THEN
    RETURN NULL;
  END IF;

  -- Revisada: cerrada para el cliente, esté donde esté.
  IF EXISTS (
    SELECT 1 FROM public.check_ins c
    WHERE c.client_id = target
      AND c.reviewed_at IS NOT NULL
      AND c.week_start <= v_lunes
      AND v_lunes < c.week_start + v_cada * 7
  ) THEN
    RETURN 'Esa semana ya la ha revisado tu entrenador. Si hay algo que corregir, díselo a él.';
  END IF;

  -- Dentro del margen: cuatro semanas, o el periodo anterior entero si la
  -- cadencia es larga (es la ventana de gracia de `periodoAEntregar`).
  IF v_lunes >= v_m - greatest(28, (2 * v_cada - 1) * 7) THEN
    RETURN NULL;
  END IF;

  -- Reabierta por su entrenador.
  IF EXISTS (
    SELECT 1 FROM public.check_ins c
    WHERE c.client_id = target
      AND c.abierta_hasta >= v_hoy - 1
      AND c.week_start <= v_lunes
      AND v_lunes < c.week_start + v_cada * 7
  ) THEN
    RETURN NULL;
  END IF;

  RETURN 'Esa semana queda fuera de plazo. Si necesitas completarla, pídele a tu entrenador que te la abra.';
END;
$$;

REVOKE ALL ON FUNCTION public.semana_cerrada_al_cliente(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.semana_cerrada_al_cliente(uuid, date) TO authenticated;


-- ── 4. La antropometría ─────────────────────────────────────────────────────
--
-- La semana de una entrada es la de su sello (`semana`, lo apuntado desde la
-- ventana de gracia) o la de su fecha — `semanaDelRegistro` en el dominio. Una
-- fecha ilegible no se juzga: no hay semana que proteger.

CREATE OR REPLACE FUNCTION public.dia_del_registro(entrada jsonb)
RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN coalesce(nullif(entrada ->> 'semana', ''), entrada ->> 'date')::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fecha_del_registro(entrada jsonb)
RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN (entrada ->> 'date')::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_anthro_semanas_del_cliente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente boolean := public.escribe_el_cliente(NEW.client_id);
  v_viejos  jsonb := '{}'::jsonb;
  v_vistos  jsonb := '{}'::jsonb;
  v_salida  jsonb := '[]'::jsonb;
  v_e       jsonb;
  v_viejo   jsonb;
  v_clave   text;
  v_motivo  text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(jsonb_object_agg(s.k, s.e), '{}'::jsonb) INTO v_viejos
    FROM (
      SELECT coalesce(x ->> 'id', 'fecha:' || coalesce(x ->> 'date', '')) AS k, x AS e
      FROM jsonb_array_elements(coalesce(OLD.history, '[]'::jsonb)) x
    ) s;
  END IF;

  FOR v_e IN SELECT x FROM jsonb_array_elements(coalesce(NEW.history, '[]'::jsonb)) x LOOP
    v_clave := coalesce(v_e ->> 'id', 'fecha:' || coalesce(v_e ->> 'date', ''));
    v_viejo := v_viejos -> v_clave;

    IF v_viejo IS NOT NULL AND (v_viejo - 'apuntadoEl') = (v_e - 'apuntadoEl') THEN
      -- Sin cambios: conserva el sello que tuviera, lo sepa la aplicación o no.
      v_e := v_e - 'apuntadoEl';
      IF v_viejo ? 'apuntadoEl' THEN
        v_e := v_e || jsonb_build_object('apuntadoEl', v_viejo -> 'apuntadoEl');
      END IF;
    ELSIF v_cliente THEN
      IF public.fecha_del_registro(v_e) > current_date + 1 THEN
        RAISE EXCEPTION 'No se puede apuntar nada con fecha futura.';
      END IF;
      v_motivo := public.semana_cerrada_al_cliente(NEW.client_id, public.dia_del_registro(v_e));
      IF v_motivo IS NULL AND v_viejo IS NOT NULL THEN
        v_motivo := public.semana_cerrada_al_cliente(NEW.client_id, public.dia_del_registro(v_viejo));
      END IF;
      IF v_motivo IS NOT NULL THEN
        RAISE EXCEPTION '%', v_motivo;
      END IF;
      v_e := (v_e - 'apuntadoEl') || jsonb_build_object('apuntadoEl', to_jsonb(now()));
    ELSE
      -- El entrenador: no sella (no es «añadido tarde por el cliente») y
      -- conserva el sello anterior si lo había.
      v_e := v_e - 'apuntadoEl';
      IF v_viejo ? 'apuntadoEl' THEN
        v_e := v_e || jsonb_build_object('apuntadoEl', v_viejo -> 'apuntadoEl');
      END IF;
    END IF;

    v_vistos := v_vistos || jsonb_build_object(v_clave, true);
    v_salida := v_salida || jsonb_build_array(v_e);
  END LOOP;

  -- Lo que el cliente QUITA también cuenta: borrar un pesaje de una semana
  -- revisada es cambiarla.
  IF v_cliente THEN
    FOR v_clave, v_viejo IN SELECT key, value FROM jsonb_each(v_viejos) LOOP
      CONTINUE WHEN v_vistos ? v_clave;
      v_motivo := public.semana_cerrada_al_cliente(NEW.client_id, public.dia_del_registro(v_viejo));
      IF v_motivo IS NOT NULL THEN
        RAISE EXCEPTION '%', v_motivo;
      END IF;
    END LOOP;
  END IF;

  NEW.history := v_salida;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_anthro_semanas_del_cliente() FROM public, anon;

DROP TRIGGER IF EXISTS anthropometry_semanas_del_cliente ON public.anthropometry;
CREATE TRIGGER anthropometry_semanas_del_cliente
  BEFORE INSERT OR UPDATE OF history ON public.anthropometry
  FOR EACH ROW EXECUTE FUNCTION public.tg_anthro_semanas_del_cliente();


-- ── 5. Las fotos ────────────────────────────────────────────────────────────
--
-- Sin columna nueva: la semana de una foto ya va en su ruta (`…/week-N/…`,
-- `buildPhotoPath`), y es de ahí de donde la lee la aplicación. La semana N se
-- cuenta desde el lunes del alta, como `weekStartOfProgramWeek`.
--
-- Y el cliente puede QUITAR sus fotos, cosa que la 0002 y la 0007 le negaban
-- («destruiría la comparativa»). El dueño lo cambió el 23 sep: mientras su
-- entrenador no la haya revisado, una foto equivocada se quita. Revisada o
-- fuera de plazo, no.

CREATE OR REPLACE FUNCTION public.dia_de_la_foto(target uuid, ruta text)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n    integer;
  v_alta date;
BEGIN
  v_n := (regexp_match(coalesce(ruta, ''), '/week-(\d+)/'))[1]::integer;
  IF v_n IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT start_date INTO v_alta FROM public.clients WHERE id = target;
  IF v_alta IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN date_trunc('week', v_alta)::date + (greatest(v_n, 1) - 1) * 7;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.dia_de_la_foto(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dia_de_la_foto(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_fotos_semanas_del_cliente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fila   public.progress_photos;
  v_motivo text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_fila := OLD;
  ELSE
    v_fila := NEW;
  END IF;
  IF NOT public.escribe_el_cliente(v_fila.client_id) THEN
    RETURN v_fila;
  END IF;

  v_motivo := public.semana_cerrada_al_cliente(
    v_fila.client_id, public.dia_de_la_foto(v_fila.client_id, v_fila.photo_url)
  );
  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION '%', v_motivo;
  END IF;
  RETURN v_fila;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_fotos_semanas_del_cliente() FROM public, anon;

DROP TRIGGER IF EXISTS progress_photos_semanas_del_cliente ON public.progress_photos;
CREATE TRIGGER progress_photos_semanas_del_cliente
  BEFORE INSERT OR DELETE ON public.progress_photos
  FOR EACH ROW EXECUTE FUNCTION public.tg_fotos_semanas_del_cliente();

DROP POLICY IF EXISTS "photos_client_delete" ON public.progress_photos;
CREATE POLICY "photos_client_delete" ON public.progress_photos
  FOR DELETE TO authenticated USING (public.is_me(client_id));

-- El archivo, con la misma regla que la fila. Solo dentro de `photos/`: el
-- resto de su carpeta (adjuntos, vídeos) sigue siendo del entrenador.
CREATE OR REPLACE FUNCTION public.foto_editable_al_cliente(nombre text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente uuid;
BEGIN
  v_cliente := split_part(coalesce(nombre, ''), '/', 1)::uuid;
  RETURN public.app_is_client(v_cliente)
    AND split_part(nombre, '/', 2) = 'photos'
    AND public.semana_cerrada_al_cliente(v_cliente, public.dia_de_la_foto(v_cliente, nombre)) IS NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.foto_editable_al_cliente(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.foto_editable_al_cliente(text) TO authenticated;

DROP POLICY IF EXISTS "media_client_delete_foto" ON storage.objects;
CREATE POLICY "media_client_delete_foto" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'client-media' AND public.foto_editable_al_cliente(name));


-- ── 6. `check_ins`: el cliente no se reabre solo ────────────────────────────
--
-- Las políticas de borrador (0009) le dejan escribir en su fila mientras no
-- esté entregada, y RLS no filtra columnas: sin esto podría ponerse él mismo
-- `abierta_hasta`. Las funciones de abajo no la tocan, así que no chocan.

CREATE OR REPLACE FUNCTION public.tg_check_ins_reapertura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.escribe_el_cliente(NEW.client_id)
     AND NEW.abierta_hasta IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.abierta_hasta END) THEN
    RAISE EXCEPTION 'Solo tu entrenador puede abrirte una semana pasada.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_check_ins_reapertura() FROM public, anon;

DROP TRIGGER IF EXISTS check_ins_reapertura ON public.check_ins;
CREATE TRIGGER check_ins_reapertura
  BEFORE INSERT OR UPDATE ON public.check_ins
  FOR EACH ROW EXECUTE FUNCTION public.tg_check_ins_reapertura();


-- ── 7. Entregar y guardar el cuestionario, con la misma frontera ────────────
--
-- Las dos de siempre (0060, 0121), con la misma firma y una guarda más cuando
-- llama el cliente. `CREATE OR REPLACE` con firma idéntica sustituye sin dejar
-- dos versiones.

CREATE OR REPLACE FUNCTION public.submit_check_in(
  target       uuid,
  week         date,
  program_week integer DEFAULT NULL,
  weight_kg    numeric DEFAULT NULL,
  client_notes text    DEFAULT NULL,
  answers      jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result  uuid;
  motivo  text;
BEGIN
  IF NOT (public.app_is_client(target) OR public.app_can_write_client(target)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  week := date_trunc('week', week)::date;

  IF public.escribe_el_cliente(target) THEN
    IF week > current_date + 1 THEN
      RAISE EXCEPTION 'Esa semana todavía no ha llegado.';
    END IF;
    motivo := public.semana_cerrada_al_cliente(target, week);
    IF motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', motivo;
    END IF;
  END IF;

  IF weight_kg IS NOT NULL AND (weight_kg <= 0 OR weight_kg > 400) THEN
    RAISE EXCEPTION 'El peso % no es un valor razonable', weight_kg;
  END IF;

  IF answers IS NOT NULL THEN
    IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
    END IF;
    IF pg_column_size(answers) > 4096 THEN
      RAISE EXCEPTION 'El cuestionario es demasiado largo';
    END IF;
  END IF;

  INSERT INTO public.check_ins
    (client_id, week_start, program_week, weight, notes, answers, submitted_at)
  VALUES
    (target, week, program_week, weight_kg, client_notes, answers, now())
  ON CONFLICT (client_id, week_start) DO UPDATE
  SET program_week  = COALESCE(EXCLUDED.program_week, public.check_ins.program_week),
      weight        = COALESCE(EXCLUDED.weight, public.check_ins.weight),
      notes         = COALESCE(EXCLUDED.notes, public.check_ins.notes),
      answers       = COALESCE(submit_check_in.answers, public.check_ins.answers),
      -- Reentregar no reabre la revisión ni mueve la primera entrega: es la
      -- fecha con la que se sabe si llegó a tiempo.
      submitted_at  = COALESCE(public.check_ins.submitted_at, now()),
      updated_at    = now()
  RETURNING id INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_check_in_answers(
  target  uuid,
  week    date,
  answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result  uuid;
  limpias jsonb;
  motivo  text;
BEGIN
  IF NOT (public.app_is_client(target) OR public.app_can_write_client(target)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  week := date_trunc('week', week)::date;

  IF public.escribe_el_cliente(target) THEN
    motivo := public.semana_cerrada_al_cliente(target, week);
    IF motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', motivo;
    END IF;
  END IF;

  IF answers IS NOT NULL THEN
    IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Las respuestas tienen que ser un objeto JSON';
    END IF;
    IF pg_column_size(answers) > 4096 THEN
      RAISE EXCEPTION 'El cuestionario es demasiado largo';
    END IF;
  END IF;

  limpias := NULLIF(answers, '{}'::jsonb);

  INSERT INTO public.check_ins (client_id, week_start, answers)
  VALUES (target, week, limpias)
  ON CONFLICT (client_id, week_start) DO UPDATE
  SET answers    = EXCLUDED.answers,
      updated_at = now()
  WHERE public.check_ins.reviewed_at IS NULL
  RETURNING id INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Esa semana ya está revisada';
  END IF;

  RETURN result;
END;
$$;


-- ── 8. Lo que hace el entrenador ────────────────────────────────────────────
--
-- `fila_de_revision`: la fila de una semana SIN entregarla. La usa el cierre de
-- quien no entregó: hasta hoy la creaba `submit_check_in`, que siempre pone
-- `submitted_at`, y el cliente veía «entregada · revisada» en una semana que
-- nunca mandó. Ahora «Cerrada por tu entrenador» se distingue.
--
-- `reabrir_revision`: el margen extra, a mano. `hasta` NULL la vuelve a cerrar.
-- No reabre una revisada: para eso está «Deshacer revisión», que además quita
-- la respuesta escrita con datos incompletos.

CREATE OR REPLACE FUNCTION public.fila_de_revision(target uuid, week date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result uuid;
BEGIN
  IF NOT public.app_can_write_client(target) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  week := date_trunc('week', week)::date;

  INSERT INTO public.check_ins (client_id, week_start)
  VALUES (target, week)
  ON CONFLICT (client_id, week_start) DO NOTHING;

  SELECT id INTO result FROM public.check_ins WHERE client_id = target AND week_start = week;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_revision(target uuid, week date, hasta date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result  uuid;
  revisada timestamptz;
BEGIN
  IF NOT public.app_can_write_client(target) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  week := date_trunc('week', week)::date;

  IF hasta IS NOT NULL AND (hasta < current_date OR hasta > current_date + 60) THEN
    RAISE EXCEPTION 'La fecha tiene que estar entre hoy y dentro de dos meses.';
  END IF;

  SELECT id, reviewed_at INTO result, revisada
  FROM public.check_ins WHERE client_id = target AND week_start = week;

  IF revisada IS NOT NULL THEN
    RAISE EXCEPTION 'Esa semana ya está revisada. Deshaz la revisión si quieres que tu cliente la corrija.';
  END IF;

  IF result IS NULL THEN
    IF hasta IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.check_ins (client_id, week_start, abierta_hasta)
    VALUES (target, week, hasta)
    RETURNING id INTO result;
  ELSE
    UPDATE public.check_ins SET abierta_hasta = hasta, updated_at = now() WHERE id = result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.fila_de_revision(uuid, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.reabrir_revision(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fila_de_revision(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_revision(uuid, date, date) TO authenticated;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- 1) Las piezas (tres disparadores, cuatro funciones nuevas):
--
--   SELECT tgname FROM pg_trigger WHERE tgname IN (
--     'anthropometry_semanas_del_cliente', 'progress_photos_semanas_del_cliente',
--     'check_ins_reapertura');
--   SELECT proname FROM pg_proc WHERE proname IN (
--     'semana_cerrada_al_cliente', 'fila_de_revision', 'reabrir_revision',
--     'foto_editable_al_cliente');
--
-- 2) La regla, para un cliente concreto (NULL = puede; si no, la frase):
--
--   SELECT d::date, public.semana_cerrada_al_cliente('<cliente>', d::date)
--   FROM generate_series(current_date - 56, current_date, interval '7 days') d;
--
-- 3) Desde la APLICACIÓN, entrando como cliente:
--    · Revisión → Semanas anteriores: una semana sin entregar de hace menos de
--      cuatro sale con «Completar»; una revisada, con «Revisada por tu
--      entrenador»; una más vieja, «Fuera de plazo».
--    · «Completar» → apuntar un peso de un día de esa semana → entregar.
--    · Como entrenador, la semana sale «Recuperada el …» y el pesaje en
--      «Añadido después de su semana».
--
-- ── Lo que NO hace ─────────────────────────────────────────────────────────
-- No toca los datos viejos. Las entradas de antes no llevan `apuntadoEl` y se
-- leen como apuntadas a tiempo. Las semanas que el entrenador cerró sin entrega
-- antes de hoy siguen con `submitted_at` puesto: el SQL para distinguirlas va
-- aparte (`scripts/cierres-sin-entrega.sql`) y no se ejecuta solo.
-- ============================================================================
