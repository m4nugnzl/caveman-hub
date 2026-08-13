-- ============================================================================
-- El roadmap del cliente: el objetivo, pero con fechas y en plural
-- ----------------------------------------------------------------------------
-- Requiere `0006_teams.sql` (permisos por equipo) y `0027_readonly_when_expired.sql`
-- (la escritura al día). Se para sola si falta alguna.
--
-- ══ Qué le falta hoy al objetivo ═══════════════════════════════════════════
--
-- `domain/goals.js` guarda en `clients.preferences.goal` una dirección y un ritmo,
-- y con eso la analítica ya sabe juzgar: «−0,4 kg/semana sobre un objetivo de −0,5»
-- es «va en rumbo». Funciona, y es lo que convirtió los gráficos en frases.
--
-- Pero ese objetivo es UNO y es ETERNO. No tiene principio, no tiene final, y al
-- cambiarlo se pierde el anterior sin dejar rastro. Eso choca con cómo se trabaja
-- de verdad, que es por bloques: doce semanas de definición, cuatro de
-- mantenimiento para descansar la dieta, dieciséis de volumen.
--
-- Las consecuencias de no tenerlo no son cosméticas:
--
--   · **La lectura se equivoca al cambiar de bloque.** El día que alguien pasa de
--     definición a volumen, la analítica lo sigue midiendo contra el objetivo
--     viejo hasta que el entrenador se acuerda de cambiarlo a mano. Mientras
--     tanto, subir de peso —que es exactamente lo que toca— se lee como «en
--     dirección contraria».
--
--   · **El cliente no ve el plan.** Sabe qué le toca esta semana y no sabe hacia
--     dónde va. Es la queja que más se repite y la que hace que la gente se canse
--     en la fase aburrida: nadie aguanta un mantenimiento si no sabe que dura
--     cuatro semanas y que después viene otra cosa.
--
--   · **No hay historia.** Al terminar un proceso de nueve meses no se puede
--     reconstruir por qué fases pasó, así que no se puede aprender de él.
--
-- ══ Por qué una tabla y no otro hueco en `preferences` ═════════════════════
--
-- El objetivo suelto cabía bien en el jsonb: es un dato pequeño, del entrenador,
-- que solo se lee al abrir la ficha de esa persona. Una lista de fases con fechas
-- es otra cosa:
--
--   1. **El cliente tiene que verla**, y `preferences` no se le sirve entero —hay
--      cosas ahí que son notas del entrenador—.
--   2. **Se pregunta por fechas y a través de la cartera**: «¿a quién se le acaba
--      una fase este mes?» es la pregunta que convierte esto en una herramienta de
--      trabajo, y sobre un array dentro de un jsonb es incómoda y lenta.
--   3. **Se solapan si nadie lo impide**, y eso hay que garantizarlo abajo (ver el
--      constraint de exclusión), no confiando en que la interfaz lo haga bien.
--
-- ══ La regla que lo sostiene todo: las fases no se solapan ═════════════════
--
-- Es la decisión importante de este fichero. Si dos fases pudieran cubrir el mismo
-- día, «el objetivo de hoy» dejaría de tener respuesta única y la analítica
-- tendría que elegir una arbitrariamente. Con la exclusión, `phaseAt(hoy)` es una
-- función de verdad: o hay exactamente una, o no hay ninguna.
--
-- Y «ninguna» es una respuesta legítima: un cliente sin roadmap sigue leyéndose
-- contra su `preferences.goal` de siempre. Esta migración no rompe a nadie.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.app_can_write_client(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0009_checkins_calendar.sql: las políticas de aquí copian las suyas.';
  END IF;
  IF to_regprocedure('public.can_write_client_active(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta 0027_readonly_when_expired.sql: sin ella el roadmap se podría editar con la suscripción caducada.';
  END IF;
END $$;

BEGIN;

-- `daterange WITH &&` necesita GiST, y `client_id WITH =` necesita que GiST sepa
-- comparar uuid por igualdad. Eso último lo aporta btree_gist, que no viene
-- activado por defecto.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.client_phases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,

  -- Cómo la llama el entrenador. Se guarda aparte de la dirección porque «Bajar
  -- para la boda» y «Definición» son la misma dirección y no dicen lo mismo.
  title      text NOT NULL,

  -- Los mismos tres valores que `GOAL_DIRECTIONS` en `domain/goals.js`. Un CHECK
  -- y no un ENUM: añadir un cuarto es una línea en vez de una migración.
  direction  text NOT NULL CHECK (direction IN ('cut', 'maintain', 'bulk')),

  -- Ritmo semanal en % del peso corporal, igual que el objetivo suelto. El porqué
  -- del porcentaje está explicado en `domain/goals.js`: 0,5 kg/semana significa
  -- cosas opuestas en alguien de 55 kg y en alguien de 110.
  rate_pct   numeric NOT NULL DEFAULT 0 CHECK (rate_pct >= 0 AND rate_pct <= 2),

  starts_on  date NOT NULL,

  /*
    `ends_on` NULL = fase abierta, sin final decidido.

    No es un hueco por rellenar: es el caso normal de la última fase. El entrenador
    sabe que ahora toca definir y no sabe todavía cuántas semanas —eso depende de
    cómo responda—. Obligarle a inventarse una fecha para poder guardar haría que
    el roadmap mintiera desde el primer día.

    La exclusión de abajo se encarga de que solo pueda haber UNA abierta: dos
    tramos sin final se solapan por definición.
  */
  ends_on    date,

  note       text NOT NULL DEFAULT '',

  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_phases_dates_ordered CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

/*
  Ninguna persona está en dos fases el mismo día.

  `[]` incluye ambos extremos: una fase que acaba el día 30 y otra que empieza el
  30 se solapan, y eso es correcto rechazarlo — ese día tendría dos objetivos. Las
  fases consecutivas empiezan al día siguiente de acabar la anterior.

  Con `ends_on` NULL el rango queda abierto por arriba, así que una segunda fase
  abierta choca con la primera y también se rechaza.
*/
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_no_overlap;
ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_no_overlap
  EXCLUDE USING gist (
    client_id WITH =,
    daterange(starts_on, ends_on, '[]') WITH &&
  );

-- La consulta que se hace siempre: las fases de una persona, en orden.
CREATE INDEX IF NOT EXISTS client_phases_client_idx
  ON public.client_phases (client_id, starts_on);

/*
  Y la que hace que esto sirva para la cartera entera: «¿a quién se le acaba una
  fase pronto?». Parcial, porque las cerradas del pasado no interesan para eso y
  son la mayoría de las filas con el tiempo.
*/
CREATE INDEX IF NOT EXISTS client_phases_ending_idx
  ON public.client_phases (ends_on)
  WHERE ends_on IS NOT NULL;

COMMIT;


-- ============================================================================
-- Quién puede ver y tocar el roadmap
-- ============================================================================

BEGIN;

ALTER TABLE public.client_phases ENABLE ROW LEVEL SECURITY;

-- ── El entrenador ──────────────────────────────────────────────────────────
--
-- Leer: cualquiera del equipo que ya pueda leer la ficha (`app_can_read_client`
-- de la 0009 respeta que un `trainer` solo ve los suyos).
--
-- Escribir: además, con la suscripción al día. Es planificación —trabajo nuevo—,
-- así que cae del lado que la 0027 congela. Lo que ya está escrito se sigue
-- viendo y se puede exportar.

DROP POLICY IF EXISTS "phases_coach_read" ON public.client_phases;
CREATE POLICY "phases_coach_read" ON public.client_phases
  FOR SELECT TO authenticated
  USING (public.app_can_read_client(client_id));

DROP POLICY IF EXISTS "phases_coach_write" ON public.client_phases;
CREATE POLICY "phases_coach_write" ON public.client_phases
  FOR ALL TO authenticated
  USING (public.can_write_client_active(client_id))
  WITH CHECK (public.can_write_client_active(client_id));

-- ── El cliente ─────────────────────────────────────────────────────────────
--
-- Lee y solo lee, y ese es medio motivo de que esta tabla exista: enseñarle a
-- dónde va. No escribe porque el roadmap es el criterio profesional del
-- entrenador; si el cliente pudiera moverse de fase, no habría plan que sostener.
--
-- Se le sirve completo, notas incluidas: son las instrucciones de su propio
-- proceso. Lo que no se le enseña —notas privadas del entrenador— no vive aquí.

DROP POLICY IF EXISTS "phases_client_read" ON public.client_phases;
CREATE POLICY "phases_client_read" ON public.client_phases
  FOR SELECT TO authenticated
  USING (public.app_is_client(client_id));

COMMIT;


BEGIN;

/**
 * Fases que terminan pronto, de toda la cartera.
 *
 * ── Por qué una función y no una consulta desde la aplicación ───────────────
 * Porque el aviso útil es «a Marta se le acaba la definición el jueves» y para
 * construirlo desde el navegador habría que traerse las fases de todos los
 * clientes y filtrarlas en memoria. Son pocas filas hoy y muchas dentro de un
 * año; el sitio donde se filtra por fecha es la base de datos.
 *
 * SECURITY INVOKER a propósito: así RLS decide qué clientes entran, y un `trainer`
 * ve el vencimiento de los suyos y no el de los demás sin que haya que repetir esa
 * regla aquí. Es la misma decisión que en `training_summaries` (0024).
 */
CREATE OR REPLACE FUNCTION public.phases_ending_soon(p_days integer DEFAULT 14)
RETURNS TABLE (
  client_id  uuid,
  phase_id   uuid,
  title      text,
  direction  text,
  ends_on    date,
  days_left  integer
)
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public AS $$
  SELECT
    p.client_id,
    p.id,
    p.title,
    p.direction,
    p.ends_on,
    (p.ends_on - CURRENT_DATE)::integer
  FROM public.client_phases p
  JOIN public.clients c ON c.id = p.client_id
  WHERE p.ends_on IS NOT NULL
    AND p.ends_on >= CURRENT_DATE
    AND p.ends_on <= CURRENT_DATE + make_interval(days => GREATEST(p_days, 0))
    AND c.status IS DISTINCT FROM 'archived'
  ORDER BY p.ends_on;
$$;

REVOKE ALL ON FUNCTION public.phases_ending_soon(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.phases_ending_soon(integer) TO authenticated;

COMMIT;

-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Un roadmap de tres tramos para un cliente cualquiera (sustituye el uuid):
--
--   INSERT INTO public.client_phases (client_id, title, direction, rate_pct, starts_on, ends_on)
--   VALUES
--     ('...', 'Definición',    'cut',      0.6,  CURRENT_DATE - 30, CURRENT_DATE + 20),
--     ('...', 'Mantenimiento', 'maintain', 0,    CURRENT_DATE + 21, CURRENT_DATE + 48),
--     ('...', 'Volumen',       'bulk',     0.25, CURRENT_DATE + 49, NULL);
--
-- Que el solape se rechaza de verdad —esto tiene que fallar—:
--
--   INSERT INTO public.client_phases (client_id, title, direction, starts_on, ends_on)
--   VALUES ('...', 'Solapada', 'cut', CURRENT_DATE, CURRENT_DATE + 5);
--   -- ERROR: conflicting key value violates exclusion constraint
--
-- Y que solo cabe una fase abierta —esto también tiene que fallar—:
--
--   INSERT INTO public.client_phases (client_id, title, direction, starts_on)
--   VALUES ('...', 'Otra abierta', 'cut', CURRENT_DATE + 200);
--
-- Los vencimientos de la cartera:
--
--   SELECT * FROM public.phases_ending_soon(30);
-- ============================================================================
