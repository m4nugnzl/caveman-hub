-- ============================================================================
-- Check-ins cerrados y calendario
-- ----------------------------------------------------------------------------
-- ⚠️  CAMBIA QUIÉN PUEDE ESCRIBIR QUÉ. Léelo antes de ejecutarlo. Es aditiva:
--     no toca ninguna tabla ni columna existente.
--
--     Como con los equipos, la aplicación funciona SIN esta migración: si las
--     tablas no existen, el tablero de la cartera deduce el estado de los datos
--     que ya hay y el calendario muestra un aviso de que falta la migración. En
--     cuanto se aplica, el estado pasa a ser exacto.
--
-- ── Qué resuelve ────────────────────────────────────────────────────────────
-- Hoy un «check-in» no existe como cosa: es la suma de unos pesajes en
-- `anthropometry.history` y unas fotos en Storage. Eso impide responder a tres
-- preguntas que el producto necesita:
--
--   1. ¿Lo ha ENTREGADO el cliente, o solo lleva dos pesajes a medias?
--   2. ¿Lo he REVISADO yo? Sin esto no hay aviso posible: no se puede distinguir
--      «pendiente de revisar» de «ya visto», y por tanto no hay nada que avisar.
--   3. ¿Cuándo le TOCA el próximo, y qué más tiene planificado?
--
-- Las dos primeras las resuelve `check_ins`; la tercera, `client_events`.
--
-- ── La decisión de fondo: qué es «una semana» ───────────────────────────────
-- El proyecto arrastra DOS calendarios: las fotos se archivan por semana de
-- programa (la ruta `<clientId>/photos/week-12/…` en Storage) y los pesajes se
-- promedian por semana natural (el lunes). Si un cliente empieza en miércoles, su
-- «semana 3» de fotos y su «semana del 17 de agosto» de pesajes no cubren los
-- mismos días.
--
-- Aquí se zanja: **la identidad del check-in es la semana natural** (`week_start`,
-- siempre lunes), porque es la que comparte con el promedio de peso, que es la
-- cifra con la que se decide. La semana de programa se guarda al lado
-- (`program_week`) como dato derivado, para poder casar las fotos sin recalcular
-- nada y sin depender de que `start_date` siga siendo el mismo.
-- ============================================================================

BEGIN;

-- ── Helpers canónicos de acceso a un cliente ────────────────────────────────
--
-- El proyecto tiene ya dos juegos de helpers: `is_my_client` / `is_me` (0002) y
-- `can_read_client` / `can_write_client` (0006, solo si hay equipos). Un tercero
-- suelto sería un acertijo, así que estos son los CANÓNICOS: funcionan con
-- equipos y sin ellos, y la intención es que las políticas nuevas usen solo
-- estos. `to_regclass` devuelve NULL si la tabla no existe, que es cómo se
-- detecta si 0006 está aplicada sin que falle la creación de la función.
--
-- SECURITY DEFINER para que no dependan del estado de las políticas de
-- `clients`. No hay riesgo de recursión: ninguna política de `clients` mira
-- `check_ins` ni `client_events`.

CREATE OR REPLACE FUNCTION public.app_can_write_client(target uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  -- Dueño directo. Sigue siendo válido durante toda la transición a equipos.
  IF EXISTS (SELECT 1 FROM public.clients c WHERE c.id = target AND c.coach_id = auth.uid()) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.team_members') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.team_members m ON m.team_id = c.team_id AND m.profile_id = auth.uid()
      WHERE c.id = target
        AND (m.role IN ('owner', 'admin') OR (m.role = 'trainer' AND c.assigned_to = auth.uid()))
    );
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_can_read_client(target uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF public.app_can_write_client(target) THEN
    RETURN true;
  END IF;

  -- `viewer` ve todo el equipo, pero no escribe.
  IF to_regclass('public.team_members') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.team_members m ON m.team_id = c.team_id AND m.profile_id = auth.uid()
      WHERE c.id = target AND m.role = 'viewer'
    );
  END IF;

  RETURN false;
END;
$$;

/** ¿Es el propio cliente quien llama? */
CREATE OR REPLACE FUNCTION public.app_is_client(target uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = target AND c.client_profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.app_can_write_client(uuid) FROM public;
REVOKE ALL ON FUNCTION public.app_can_read_client(uuid) FROM public;
REVOKE ALL ON FUNCTION public.app_is_client(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.app_can_write_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_can_read_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_client(uuid) TO authenticated;


-- ── check_ins ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.check_ins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  -- Identidad: el lunes de la semana natural. Uno por cliente y semana.
  week_start   date NOT NULL,
  -- Semana de programa correspondiente, para casar con las fotos de Storage.
  program_week integer,

  -- El peso que el cliente CONFIRMA al entregar. Normalmente el promedio de sus
  -- pesajes, pero puede corregirlo: él sabe si algún día se pesó en condiciones
  -- raras, y su criterio manda sobre la media.
  weight       numeric,
  notes        text,

  -- Entregado por el cliente. NULL = lo tiene a medias y todavía es suyo.
  submitted_at timestamptz,

  -- Revisado por el entrenador. La combinación (submitted_at NOT NULL,
  -- reviewed_at NULL) es EXACTAMENTE la bandeja de «por revisar», y es lo único
  -- que hacía falta para que exista el aviso.
  reviewed_at  timestamptz,
  reviewed_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  coach_notes  text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT check_ins_client_week_key UNIQUE (client_id, week_start)
);

CREATE INDEX IF NOT EXISTS check_ins_client_idx ON public.check_ins (client_id, week_start DESC);
-- Índice parcial para la bandeja del entrenador: solo las filas pendientes, que
-- son un puñado, en lugar de recorrer el histórico entero.
CREATE INDEX IF NOT EXISTS check_ins_pending_idx
  ON public.check_ins (client_id)
  WHERE submitted_at IS NOT NULL AND reviewed_at IS NULL;


-- ── client_events ───────────────────────────────────────────────────────────
--
-- El calendario. Es del cliente tanto como del entrenador: el cliente se
-- planifica sus check-ins y apunta lo suyo (una carrera, una semana de viaje,
-- una comida fuera), y el entrenador ve el de todos y puede añadir cosas.
--
-- `kind` no es un ENUM a propósito: añadir un tipo nuevo con un ENUM obliga a
-- migrar, y con un CHECK es una línea. `created_by` deja claro quién puso cada
-- cosa, para que ninguno de los dos borre lo del otro sin darse cuenta.

CREATE TABLE IF NOT EXISTS public.client_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  date       date NOT NULL,
  kind       text NOT NULL DEFAULT 'note'
             CHECK (kind IN ('checkin', 'note', 'appointment', 'goal', 'rest', 'race')),
  title      text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_events_client_date_idx ON public.client_events (client_id, date);

COMMIT;


-- ============================================================================
-- RLS
-- ============================================================================

BEGIN;

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_events ENABLE ROW LEVEL SECURITY;

-- ── check_ins: el entrenador ────────────────────────────────────────────────

DROP POLICY IF EXISTS "checkins_coach_read" ON public.check_ins;
CREATE POLICY "checkins_coach_read" ON public.check_ins
  FOR SELECT TO authenticated USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "checkins_coach_write" ON public.check_ins;
CREATE POLICY "checkins_coach_write" ON public.check_ins
  FOR ALL TO authenticated
  USING (public.app_can_write_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id));

-- ── check_ins: el cliente ───────────────────────────────────────────────────
--
-- Puede leer los suyos, crear el de la semana y editarlo MIENTRAS NO LO HAYA
-- ENTREGADO. En cuanto lo entrega deja de ser suyo: si pudiera seguir
-- cambiándolo, el entrenador estaría revisando algo que se mueve bajo sus pies.
--
-- Y nunca puede tocar `reviewed_at`. RLS filtra filas, no columnas, así que un
-- UPDATE libre sobre su propia fila le dejaría marcarse el check-in como
-- revisado. Por eso la entrega va por una FUNCIÓN (`submit_check_in`) y esta
-- política solo cubre el borrador.

DROP POLICY IF EXISTS "checkins_client_read" ON public.check_ins;
CREATE POLICY "checkins_client_read" ON public.check_ins
  FOR SELECT TO authenticated USING (public.app_is_client(client_id));

DROP POLICY IF EXISTS "checkins_client_draft_insert" ON public.check_ins;
CREATE POLICY "checkins_client_draft_insert" ON public.check_ins
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_is_client(client_id)
    AND submitted_at IS NULL
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND coach_notes IS NULL
  );

DROP POLICY IF EXISTS "checkins_client_draft_update" ON public.check_ins;
CREATE POLICY "checkins_client_draft_update" ON public.check_ins
  FOR UPDATE TO authenticated
  USING (public.app_is_client(client_id) AND submitted_at IS NULL)
  WITH CHECK (
    public.app_is_client(client_id)
    AND submitted_at IS NULL
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND coach_notes IS NULL
  );

-- ── client_events ───────────────────────────────────────────────────────────
-- Los dos leen, los dos crean. Cada uno borra lo que puso él, y el entrenador
-- puede borrar cualquier cosa: es quien cura el calendario.

DROP POLICY IF EXISTS "events_read" ON public.client_events;
CREATE POLICY "events_read" ON public.client_events
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id) OR public.app_is_client(client_id));

DROP POLICY IF EXISTS "events_insert" ON public.client_events;
CREATE POLICY "events_insert" ON public.client_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.app_can_write_client(client_id) OR public.app_is_client(client_id))
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "events_update" ON public.client_events;
CREATE POLICY "events_update" ON public.client_events
  FOR UPDATE TO authenticated
  USING (public.app_can_write_client(client_id) OR public.app_is_client(client_id))
  WITH CHECK (public.app_can_write_client(client_id) OR public.app_is_client(client_id));

DROP POLICY IF EXISTS "events_delete" ON public.client_events;
CREATE POLICY "events_delete" ON public.client_events
  FOR DELETE TO authenticated
  USING (public.app_can_write_client(client_id) OR created_by = auth.uid());

COMMIT;


-- ============================================================================
-- Operaciones que no pueden ser un UPDATE
-- ============================================================================

BEGIN;

/**
 * El cliente ENTREGA su check-in.
 *
 * No puede ser un UPDATE desde el cliente: para marcar `submitted_at` haría falta
 * permiso de escritura sobre la fila, y RLS filtra filas y no columnas, así que
 * ese permiso le dejaría también ponerse `reviewed_at`. La función escribe
 * exactamente los cuatro campos que le corresponden.
 *
 * Crea la fila si no existía, así que el cliente no tiene que «abrir» el check-in
 * antes de entregarlo.
 */
CREATE OR REPLACE FUNCTION public.submit_check_in(
  target       uuid,
  week         date,
  program_week integer DEFAULT NULL,
  weight_kg    numeric DEFAULT NULL,
  client_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result uuid;
BEGIN
  IF NOT (public.app_is_client(target) OR public.app_can_write_client(target)) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  -- Siempre el lunes: dos entregas de la misma semana tienen que caer en la
  -- misma fila, y el cliente puede mandar cualquier día de esa semana.
  week := date_trunc('week', week)::date;

  IF weight_kg IS NOT NULL AND (weight_kg <= 0 OR weight_kg > 400) THEN
    RAISE EXCEPTION 'El peso % no es un valor razonable', weight_kg;
  END IF;

  INSERT INTO public.check_ins (client_id, week_start, program_week, weight, notes, submitted_at)
  VALUES (target, week, program_week, weight_kg, client_notes, now())
  ON CONFLICT (client_id, week_start) DO UPDATE
  SET program_week  = COALESCE(EXCLUDED.program_week, public.check_ins.program_week),
      weight        = COALESCE(EXCLUDED.weight, public.check_ins.weight),
      notes         = COALESCE(EXCLUDED.notes, public.check_ins.notes),
      -- Reentregar no reabre la revisión: si el entrenador ya lo vio, sigue visto.
      submitted_at  = COALESCE(public.check_ins.submitted_at, now()),
      updated_at    = now()
  RETURNING id INTO result;

  RETURN result;
END;
$$;

/**
 * El entrenador marca un check-in como REVISADO.
 *
 * Podría ser un UPDATE normal —tiene permiso de escritura— pero como función
 * queda registrado QUIÉN lo revisó sin que la aplicación tenga que acordarse de
 * mandarlo, que es el tipo de dato que se olvida y luego se echa en falta.
 */
CREATE OR REPLACE FUNCTION public.review_check_in(check_in uuid, notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT client_id INTO owner FROM public.check_ins WHERE id = check_in;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'Ese check-in no existe';
  END IF;
  IF NOT public.app_can_write_client(owner) THEN
    RAISE EXCEPTION 'No tienes permiso sobre ese cliente';
  END IF;

  UPDATE public.check_ins
  SET reviewed_at = now(),
      reviewed_by = auth.uid(),
      coach_notes = COALESCE(notes, coach_notes),
      updated_at  = now()
  WHERE id = check_in;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_check_in(uuid, date, integer, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.review_check_in(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_check_in(uuid, date, integer, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_check_in(uuid, text) TO authenticated;

COMMIT;


-- ============================================================================
-- Relleno opcional del histórico
-- ----------------------------------------------------------------------------
-- No se ejecuta solo. Crea un check-in ya ENTREGADO Y REVISADO por cada semana
-- que tenga pesajes, para que el histórico no aparezca entero como «pendiente de
-- revisar» el día que apliques esto —que sería un tablero con cuarenta avisos
-- falsos—.
--
-- Revisa el SELECT antes de lanzar el INSERT.
--
--   select client_id, date_trunc('week', (h->>'date')::date)::date as week_start,
--          round(avg((h->>'weight')::numeric), 2) as media, count(*) as pesajes
--   from public.anthropometry a, jsonb_array_elements(a.history) h
--   where h->>'weight' is not null and h->>'date' is not null
--   group by 1, 2 order by 1, 2;
--
-- INSERT INTO public.check_ins (client_id, week_start, weight, submitted_at, reviewed_at)
-- SELECT client_id,
--        date_trunc('week', (h->>'date')::date)::date,
--        round(avg((h->>'weight')::numeric), 2),
--        now(), now()
-- FROM public.anthropometry a, jsonb_array_elements(a.history) h
-- WHERE h->>'weight' IS NOT NULL AND h->>'date' IS NOT NULL
--   -- Solo el histórico: la semana en curso se deja para que el cliente la
--   -- entregue de verdad.
--   AND date_trunc('week', (h->>'date')::date) < date_trunc('week', now())
-- GROUP BY 1, 2
-- ON CONFLICT (client_id, week_start) DO NOTHING;
-- ============================================================================
