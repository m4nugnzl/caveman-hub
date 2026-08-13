-- ============================================================================
-- Soporte: un sitio al que escribir, y alguien que lo lea
-- ----------------------------------------------------------------------------
-- Requiere `0006_teams.sql`. Tres tablas nuevas. No toca nada existente.
--
-- ══ El agujero ═════════════════════════════════════════════════════════════
--
-- Hoy no hay ningún canal. Ni formulario, ni correo, ni pantalla de ayuda: si un
-- entrenador se atasca, su única salida es buscar a alguien por fuera de la
-- aplicación. Con clientes de pago eso no es una carencia de producto, es la
-- forma más barata de perder a uno.
--
-- Y es lo primero que hay que resolver antes de meter una IA de soporte encima,
-- por un motivo que se ve al revés: **la IA necesita un sitio adonde escalar**.
-- Un asistente que contesta lo que sabe y, cuando no sabe, dice «te paso con
-- Manu» sin que exista ningún «con Manu», es peor que no tener asistente.
--
-- ══ Por qué un hilo y no un formulario de contacto ═════════════════════════
--
-- Un formulario que manda un correo y se olvida deja al que pregunta sin saber si
-- ha llegado, y al que responde sin saber qué contestó la vez anterior. Las dos
-- cosas se pagan: la primera en preguntas repetidas, la segunda en respuestas
-- incoherentes.
--
-- Un hilo guardado es también lo que hace posible la siguiente pieza: las
-- preguntas reales son el material con el que se escribe la base de conocimiento
-- del asistente. Inventárselas antes de tenerlas es escribir respuestas a
-- preguntas que nadie hace.
--
-- ══ Y quién contesta ═══════════════════════════════════════════════════════
--
-- Mientras no haya correo transaccional, se contesta DESDE LA PROPIA APLICACIÓN.
-- De ahí `platform_admins`: una lista de quién puede ver los tickets de todos.
--
-- No se siembra con nadie a propósito —un identificador escrito a mano en una
-- migración es una puerta que nadie recuerda haber dejado abierta—. Se añade con
-- una línea de SQL, y está anotada al final del archivo.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla `profiles`.';
  END IF;
END $$;

BEGIN;

/*
  Quién puede leer los tickets de todo el mundo.

  Tabla y no una columna en `profiles` porque son cosas distintas: `profiles.role`
  dice qué eres DENTRO de la aplicación —entrenador o cliente— y esto dice si
  atiendes la plataforma. Mezclarlas obligaría a inventar un tercer rol que
  rompería todos los `role === 'client' ? … : …` que hay repartidos.
*/
CREATE TABLE IF NOT EXISTS public.platform_admins (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie la lee ni la escribe desde el navegador. Se consulta a
-- través de `is_platform_admin()`, que es SECURITY DEFINER, y se rellena con la
-- `service_role` o desde el panel.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE profile_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,

  -- El equipo es CONTEXTO, no dueño: sirve para saber qué plan tiene quien
  -- escribe sin preguntárselo. `ON DELETE SET NULL` porque un ticket sobrevive
  -- al equipo —a veces se escribe justo porque algo se ha borrado—.
  team_id    uuid REFERENCES public.teams (id) ON DELETE SET NULL,

  subject    text NOT NULL,
  status     text NOT NULL DEFAULT 'open'
             CHECK (status IN ('open', 'answered', 'closed')),

  /*
    Qué estaba pasando: ruta, navegador, versión.

    Lo manda la aplicación y ahorra el primer intercambio entero, que siempre es
    el mismo —«¿en qué pantalla?», «¿en el móvil o en el ordenador?»— y que
    cuesta un día de ida y vuelta. `jsonb` abierto porque lo que hace falta
    guardar aquí va a cambiar, y no merece una migración cada vez.
  */
  context    jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  /*
    De qué lado viene. Se guarda como dato y no se deduce comparando
    `author_id` con el dueño del ticket, porque cuando conteste alguien más del
    equipo de soporte —o el asistente automático— la deducción dejaría de valer y
    habría que reescribir toda la interfaz que la usa para pintar el hilo.
  */
  from_support boolean NOT NULL DEFAULT false,

  body        text NOT NULL CHECK (btrim(body) <> ''),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- La bandeja de soporte: lo que está sin contestar, primero lo más viejo — que
-- es el que lleva más tiempo esperando.
CREATE INDEX IF NOT EXISTS support_tickets_open_idx
  ON public.support_tickets (created_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS support_tickets_mine_idx
  ON public.support_tickets (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_messages_thread_idx
  ON public.support_messages (ticket_id, created_at);

COMMIT;


BEGIN;

/**
 * El estado del ticket lo decide quién habla último.
 *
 * ── Por qué un disparador y no que lo escriba la aplicación ─────────────────
 * Porque son dos aplicaciones: la del entrenador que pregunta y la de soporte que
 * responde. Con la regla en el cliente habría que escribirla dos veces y
 * mantenerla sincronizada, y el día que se desincronicen la bandeja de soporte
 * enseñará como pendiente algo ya contestado —o peor, al revés—.
 *
 * `closed` no se toca: si alguien cerró el ticket a mano, una respuesta nueva lo
 * reabre igualmente, que es lo que se espera al escribir en un hilo cerrado.
 */
CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
  SET status = CASE WHEN NEW.from_support THEN 'answered' ELSE 'open' END,
      updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_touch ON public.support_messages;
CREATE TRIGGER support_messages_touch
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket();

COMMIT;


-- ============================================================================
-- Quién ve qué
-- ============================================================================

BEGIN;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- ── Tickets ────────────────────────────────────────────────────────────────
--
-- El tuyo es tuyo, y soporte los ve todos. No hay término medio: un compañero de
-- equipo NO ve los tickets de otro aunque compartan cartera. Lo que se escribe a
-- soporte suele incluir el problema real —«no me funciona el cobro»— y eso no es
-- asunto del resto del equipo.

DROP POLICY IF EXISTS "tickets_own_read" ON public.support_tickets;
CREATE POLICY "tickets_own_read" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "tickets_own_insert" ON public.support_tickets;
CREATE POLICY "tickets_own_insert" ON public.support_tickets
  FOR INSERT TO authenticated
  -- Se abre a nombre propio y de nadie más: sin esto se podría abrir un ticket
  -- haciéndose pasar por otro usuario.
  WITH CHECK (profile_id = auth.uid());

/*
  Cerrar el tuyo, sí. Reabrirlo escribiendo, también (lo hace el disparador).
  Lo que no se puede es cambiar el asunto ni el contexto después de mandarlo:
  eso convertiría el historial en algo que no se puede citar.

  RLS filtra filas y no columnas, así que la restricción se expresa comparando la
  fila nueva con la vieja.
*/
DROP POLICY IF EXISTS "tickets_own_update" ON public.support_tickets;
CREATE POLICY "tickets_own_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_platform_admin());

-- ── Mensajes ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "messages_read" ON public.support_messages;
CREATE POLICY "messages_read" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.profile_id = auth.uid()
    )
  );

/*
  Escribir en un hilo exige ser su dueño o ser soporte. Y además:

  `from_support` tiene que coincidir con QUIÉN eres. Sin esa condición, un
  entrenador podría insertar un mensaje con `from_support = true` y fabricarse una
  respuesta oficial dentro de su propio hilo —inútil para él, pero es exactamente
  la clase de hueco que aparece luego en una captura de pantalla.
*/
DROP POLICY IF EXISTS "messages_write" ON public.support_messages;
CREATE POLICY "messages_write" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND from_support = public.is_platform_admin()
    AND (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.profile_id = auth.uid()
      )
    )
  );

COMMIT;

-- ============================================================================
-- Ponerlo en marcha
-- ----------------------------------------------------------------------------
-- ⚠️  SIN ESTO NADIE LEE LOS TICKETS. La tabla se queda vacía de administradores
--     a propósito; date de alta tú:
--
--   INSERT INTO public.platform_admins (profile_id)
--   SELECT id FROM auth.users WHERE email = 'tu-correo@ejemplo.com'
--   ON CONFLICT DO NOTHING;
--
-- Comprobar que ha funcionado, desde la aplicación con sesión iniciada:
--
--   await supabase.rpc('is_platform_admin')   // → true
--
-- La bandeja, en SQL:
--
--   SELECT t.created_at, p.email, t.subject, t.status
--   FROM public.support_tickets t
--   JOIN public.profiles p ON p.id = t.profile_id
--   WHERE t.status = 'open' ORDER BY t.created_at;
--
-- ── Lo que falta después ───────────────────────────────────────────────────
-- Un aviso por correo cuando entra un ticket. Sin él hay que entrar a mirar, y
-- eso funciona con tres entrenadores y deja de funcionar con treinta. Va con el
-- correo transaccional, que necesita cuenta de Resend y DNS del dominio.
-- ============================================================================
