-- ============================================================================
-- Integraciones externas (Notion y las que vengan)
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva: no toca ninguna tabla existente. Como el resto, la aplicación
--     funciona sin ella: la pantalla de Integraciones avisa de que falta.
--
-- ── Qué resuelve ────────────────────────────────────────────────────────────
-- El entrenador lleva los cobros en Notion. Hoy eso significa que el estado de
-- pago se teclea dos veces —una en Notion y otra aquí— y que la cartera muestra
-- lo segundo, que es lo que se olvida de actualizar. El objetivo es que Notion
-- siga siendo la fuente de verdad de los pagos y que Caveman Hub la lea.
--
-- Se diseña GENÉRICO desde el principio: `provider` + `config` jsonb, de modo que
-- otro entrenador conecta su propia base de Notion con sus propias columnas, y
-- añadir Stripe o una hoja de cálculo mañana no requiere otra tabla.
--
-- ── Por qué esto necesita servidor ──────────────────────────────────────────
-- La API de Notion exige un token secreto y **bloquea las llamadas desde el
-- navegador** (no manda cabeceras CORS). Así que la sincronización vive en una
-- Edge Function (`supabase/functions/notion-payments`), que es la primera pieza de
-- servidor del proyecto. Esta migración prepara el sitio donde guardar la
-- configuración y el token.
--
-- ── El problema de fondo: emparejar por nombre ──────────────────────────────
-- En Notion el cliente se identifica por una columna de texto con su nombre y
-- apellido. No hay id estable. Eso es frágil: acentos, orden invertido, apodos, o
-- dos clientes que se llamen igual. Si la integración da por bueno el nombre, un
-- pago acabará en el cliente equivocado y nadie se enterará.
--
-- La solución es no adivinar dos veces: `client_external_refs` guarda «esta
-- cadena de Notion es este cliente» la primera vez que se confirma, y a partir de
-- ahí el emparejamiento es exacto. Lo que no tiene correspondencia se queda SIN
-- ASIGNAR y visible, nunca colocado a la fuerza.
-- ============================================================================

BEGIN;

-- ── La integración: qué se conecta y cómo se leen sus columnas ───────────────

CREATE TABLE IF NOT EXISTS public.integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Si hay equipos, la integración es del negocio y no de la persona: que se vaya
  -- un entrenador no debe llevarse los cobros.
  team_id      uuid,
  provider     text NOT NULL CHECK (provider IN ('notion')),
  label        text,

  /*
    Configuración, abierta a propósito. Para Notion:

      {
        "databaseId": "…",
        "props": {
          "client": "Cliente",      -- la columna con el nombre
          "amount": "Importe",
          "date":   "Fecha",
          "status": "Estado",
          "periodEnd": "Vence"
        },
        "paidValues": ["Pagado", "Cobrado"]   -- qué valores cuentan como pagado
      }

    Los nombres de las columnas los pone el entrenador, no están fijados aquí: es
    lo que hace que cada uno conecte SU Notion.
  */
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,

  status       text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'ok', 'error')),
  last_sync_at timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT integrations_owner_provider_key UNIQUE (owner_id, provider)
);

-- ── El token, donde no lo pueda leer nadie ──────────────────────────────────
--
-- Tabla aparte, con RLS ACTIVO y CERO POLÍTICAS. Eso significa que con la anon
-- key —que es pública por diseño— no se puede leer ni escribir NADA de aquí, ni
-- siquiera el dueño. Solo `service_role`, que salta RLS y que solo tiene la Edge
-- Function del lado servidor.
--
-- Guardarlo en `integrations.config` habría sido más simple y habría dejado el
-- token de Notion al alcance de cualquiera que abriese el inspector con la sesión
-- del entrenador. Un token de Notion da acceso a TODO lo que el entrenador haya
-- compartido con la integración, no solo a los pagos.
--
-- Se escribe con `set_integration_token`, que comprueba quién llama.

CREATE TABLE IF NOT EXISTS public.integration_secrets (
  integration_id uuid PRIMARY KEY REFERENCES public.integrations (id) ON DELETE CASCADE,
  token          text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
-- Intencionadamente sin políticas. No añadir ninguna.
REVOKE ALL ON public.integration_secrets FROM authenticated, anon;


-- ── Memoria de conciliación: qué cadena de Notion es qué cliente ────────────
--
-- La clave es (integración, nombre normalizado). Va atada a la integración y no
-- global porque dos entrenadores pueden tener cada uno una «Marta García» y no son
-- la misma persona.
--
-- Un cliente puede tener VARIAS cadenas apuntándole (el nombre completo y el
-- apodo), así que `client_id` no es único: lo único único es la cadena.

CREATE TABLE IF NOT EXISTS public.client_external_refs (
  integration_id uuid NOT NULL REFERENCES public.integrations (id) ON DELETE CASCADE,
  external_key   text NOT NULL,
  client_id      uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  external_label text,
  linked_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  linked_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, external_key)
);

CREATE INDEX IF NOT EXISTS client_external_refs_client_idx
  ON public.client_external_refs (client_id);


-- ── Los pagos importados ────────────────────────────────────────────────────
--
-- Se guardan en lugar de solo actualizar `clients.payment_status` por dos motivos:
-- se puede enseñar el histórico y el importe, y queda constancia de lo que dijo
-- Notion —si mañana el estado no cuadra, se ve de dónde salió.
--
-- `UNIQUE (integration_id, external_id)` es lo que hace la sincronización
-- IDEMPOTENTE: volver a lanzarla actualiza las filas en vez de duplicarlas.
--
-- `client_id` es NULLABLE a propósito: un pago cuyo nombre no se ha conciliado
-- todavía se guarda sin cliente y aparece en la pantalla pidiendo que lo asignes.
-- Colocarlo «a ver si acierta» sería peor que dejarlo visible.

CREATE TABLE IF NOT EXISTS public.client_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations (id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  client_id      uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  external_label text,
  amount         numeric,
  currency       text DEFAULT 'EUR',
  paid_on        date,
  period_end     date,
  status         text,
  is_paid        boolean NOT NULL DEFAULT false,
  raw            jsonb,
  synced_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_payments_external_key UNIQUE (integration_id, external_id)
);

CREATE INDEX IF NOT EXISTS client_payments_client_idx
  ON public.client_payments (client_id, paid_on DESC);

COMMIT;


-- ============================================================================
-- RLS
-- ============================================================================

BEGIN;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_external_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

/** ¿Es mía esta integración? Con equipos, ¿es de mi equipo y puedo gestionarla? */
CREATE OR REPLACE FUNCTION public.app_owns_integration(target uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = target AND i.owner_id = auth.uid()) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.team_members') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.integrations i
      JOIN public.team_members m ON m.team_id = i.team_id AND m.profile_id = auth.uid()
      WHERE i.id = target AND m.role IN ('owner', 'admin')
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.app_owns_integration(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.app_owns_integration(uuid) TO authenticated;

DROP POLICY IF EXISTS "integrations_own" ON public.integrations;
CREATE POLICY "integrations_own" ON public.integrations
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.app_owns_integration(id))
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "refs_own" ON public.client_external_refs;
CREATE POLICY "refs_own" ON public.client_external_refs
  FOR ALL TO authenticated
  USING (public.app_owns_integration(integration_id) AND public.app_can_write_client(client_id))
  WITH CHECK (public.app_owns_integration(integration_id) AND public.app_can_write_client(client_id));

-- Los pagos los LEE quien pueda ver al cliente, y también el dueño de la
-- integración (para poder ver los que aún no están conciliados, que no tienen
-- cliente). Escribirlos es cosa de la Edge Function, salvo asignar el cliente a
-- mano desde la pantalla de conciliación.
DROP POLICY IF EXISTS "payments_read" ON public.client_payments;
CREATE POLICY "payments_read" ON public.client_payments
  FOR SELECT TO authenticated
  USING (
    public.app_owns_integration(integration_id)
    OR (client_id IS NOT NULL AND public.app_can_read_client(client_id))
  );

DROP POLICY IF EXISTS "payments_reconcile" ON public.client_payments;
CREATE POLICY "payments_reconcile" ON public.client_payments
  FOR UPDATE TO authenticated
  USING (public.app_owns_integration(integration_id))
  WITH CHECK (public.app_owns_integration(integration_id));

COMMIT;


-- ============================================================================
-- Guardar el token sin exponerlo
-- ============================================================================

BEGIN;

/**
 * Escribe el token de una integración.
 *
 * Es el único camino: la tabla no tiene políticas, así que ni el propio dueño
 * puede hacer un INSERT desde el navegador. La función comprueba que la
 * integración es suya y escribe con los privilegios del propietario.
 *
 * No hay función para LEERLO. A propósito: una vez guardado, el token solo lo ve
 * la Edge Function. Si el entrenador lo pierde, pone otro.
 */
CREATE OR REPLACE FUNCTION public.set_integration_token(integration uuid, token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_owns_integration(integration) THEN
    RAISE EXCEPTION 'Esa integración no es tuya';
  END IF;

  IF token IS NULL OR length(trim(token)) < 20 THEN
    RAISE EXCEPTION 'El token no parece válido';
  END IF;

  INSERT INTO public.integration_secrets (integration_id, token)
  VALUES (integration, trim(token))
  ON CONFLICT (integration_id) DO UPDATE
  SET token = EXCLUDED.token, updated_at = now();

  UPDATE public.integrations
  SET status = 'idle', last_error = NULL, updated_at = now()
  WHERE id = integration;
END;
$$;

/** ¿Hay token guardado? Lo único que se puede saber del secreto desde el cliente. */
CREATE OR REPLACE FUNCTION public.integration_has_token(integration uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT public.app_owns_integration(integration) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.integration_secrets s WHERE s.integration_id = integration);
END;
$$;

REVOKE ALL ON FUNCTION public.set_integration_token(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.integration_has_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.set_integration_token(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.integration_has_token(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- 1. Desplegar la función:
--
--      npx supabase login
--      npx supabase link --project-ref pscpermmojmircadirzk
--      npx supabase functions deploy notion-payments
--
--    El despliegue toma `verify_jwt = false` de `supabase/config.toml`. Sin eso,
--    la pasarela rechaza la petición OPTIONS de comprobación del navegador —que
--    nunca lleva cabecera de sesión— y el error que sale es un CORS confuso. La
--    autorización la hace la función, y comprueba más que la pasarela: que el
--    recurso sea TUYO, no solo que el token sea válido.
--
--    Comprobar que quedó desplegada:
--      curl -i -X OPTIONS https://<proyecto>.supabase.co/functions/v1/notion-payments
--    Tiene que responder 204. Un 404 significa que no está desplegada.
-- 2. En Notion: crear una integración interna (Settings → Connections → Develop),
--    copiar su token, y **compartir la base «Pagos asesorados» con ella** (botón
--    Compartir de la propia base). Sin ese último paso el token existe pero no ve
--    la base, y la API responde 404 — es el fallo más común al conectar Notion.
-- 3. En la aplicación: Integraciones → pegar token, pegar el id de la base y
--    mapear las columnas.
--
-- El id de la base está en su URL:
--   notion.so/<workspace>/<DATABASE_ID>?v=…
-- ============================================================================
