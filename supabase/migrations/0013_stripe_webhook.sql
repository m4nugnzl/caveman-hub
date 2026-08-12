-- ============================================================================
-- Webhook de Stripe: que los avisos lleguen solos
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere `0012_stripe.sql` y desplegar `stripe-webhook`.
--
-- ── Qué cambia respecto a sincronizar a mano ────────────────────────────────
-- «Sincronizar» hay que acordarse de pulsarlo. Y el dato que más importa —la
-- tarjeta rechazada— caduca rápido: enterarte cinco días tarde de que a un cliente
-- le falló el cobro es enterarte cuando ya se ha ido.
--
-- Con el webhook, Stripe avisa en el momento. La sincronización manual se queda
-- para el primer volcado y para cuadrar de vez en cuando.
--
-- ── Por qué el secreto de firma es imprescindible ───────────────────────────
-- El webhook es un endpoint PÚBLICO: cualquiera puede llamarlo. Sin verificar la
-- firma, bastaría con enviarle un JSON inventado para marcar a un cliente como
-- pagado o como dado de baja. Stripe firma cada evento con HMAC-SHA256 y un secreto
-- que solo conocen Stripe y el servidor; la función rechaza todo lo que no venga
-- firmado con él.
--
-- Ese secreto es DISTINTO de la clave de API, así que necesita su propio hueco.
-- ============================================================================

BEGIN;

ALTER TABLE public.integration_secrets
  ADD COLUMN IF NOT EXISTS webhook_secret text;

-- Últimos eventos recibidos, para que la pantalla pueda decir «está llegando».
-- Sin esto, un webhook mal configurado es indistinguible de uno que funciona y no
-- ha tenido eventos todavía.
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_count integer NOT NULL DEFAULT 0;

COMMIT;


BEGIN;

/**
 * Guarda el secreto de firma del webhook.
 *
 * Mismo criterio que la clave de API: la tabla no tiene políticas, así que ni el
 * dueño puede escribirla desde el navegador. Y no hay función para leerlo.
 */
CREATE OR REPLACE FUNCTION public.set_integration_webhook_secret(integration uuid, secret text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_owns_integration(integration) THEN
    RAISE EXCEPTION 'Esa integración no es tuya';
  END IF;

  -- Los secretos de Stripe empiezan por `whsec_`. Comprobarlo evita el error más
  -- común: pegar la clave de API en el hueco del secreto de firma.
  IF secret IS NULL OR secret NOT LIKE 'whsec_%' THEN
    RAISE EXCEPTION 'El secreto de firma de Stripe empieza por whsec_. ¿Has pegado la clave de API por error?';
  END IF;

  -- La fila puede no existir si se configura el webhook antes que la clave.
  INSERT INTO public.integration_secrets (integration_id, token, webhook_secret)
  VALUES (integration, '', trim(secret))
  ON CONFLICT (integration_id) DO UPDATE
  SET webhook_secret = EXCLUDED.webhook_secret, updated_at = now();
END;
$$;

/** ¿Hay secreto de firma guardado? Lo único que se puede saber de él. */
CREATE OR REPLACE FUNCTION public.integration_has_webhook(integration uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT public.app_owns_integration(integration) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.integration_secrets s
    WHERE s.integration_id = integration AND s.webhook_secret IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_integration_webhook_secret(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.integration_has_webhook(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.set_integration_webhook_secret(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.integration_has_webhook(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- Cómo se configura, en orden
-- ----------------------------------------------------------------------------
-- 1. Desplegar:  npx supabase functions deploy stripe-webhook
--
-- 2. En Stripe: Developers → Webhooks → Add endpoint, con la URL que la pantalla
--    de Stripe te muestra y te deja copiar. Lleva `?integration=<id>` al final: es
--    lo que permite tener varios entrenadores con su propio Stripe apuntando a la
--    misma función. No es un secreto —la firma es lo que autentica— pero identifica
--    de quién es el evento.
--
-- 3. Eventos a suscribir (solo estos cuatro; los demás son ruido y la función los
--    descarta con un 200):
--      invoice.payment_failed            → tarjeta rechazada
--      invoice.payment_succeeded         → cobrado
--      customer.subscription.updated     → cambio de estado o de renovación
--      customer.subscription.deleted     → baja
--
--    El de cobro correcto parece redundante y no lo es: es el que LIMPIA la marca
--    de impago. Sin él, un cliente cuya tarjeta falló un mes y se arregló al
--    siguiente se queda como moroso para siempre, hasta que alguien sincronice.
--
-- 4. Stripe muestra el «Signing secret» (whsec_…). Pegarlo en la pantalla.
--
-- Para comprobarlo: «Send test webhook» desde Stripe. El contador de eventos de la
-- pantalla tiene que subir.
-- ============================================================================
