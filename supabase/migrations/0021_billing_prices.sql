-- ============================================================================
-- Precios: lo que se enseña y lo que se cobra
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere `0019_billing.sql`. Sin rellenar los identificadores de
--     Stripe (abajo), la pantalla de Plan enseña los precios pero el botón de
--     contratar avisa de que ese plan no está configurado. Nada se rompe.
--
-- ══ Dos columnas para el precio, y no es una duplicación por descuido ══════
--
-- `stripe_price_id` es lo que COBRA. Es el único dato que viaja a Stripe al abrir
-- la pasarela, y por tanto el único que decide cuánto se le carga a alguien.
--
-- `price_cents` es lo que se ENSEÑA. Es una etiqueta.
--
-- La alternativa —pedirle los precios a Stripe cada vez que alguien abre la
-- pantalla— evita tener el número en dos sitios, y a cambio hace que la página de
-- planes no exista hasta que la función esté desplegada y responda. Para una
-- pantalla que también tiene que servir ANTES de conectar Stripe, no compensa.
--
-- El riesgo de tenerlo dos veces es real y es este: **cambiar el precio en Stripe
-- y no aquí hace que la pantalla mienta**. Por eso el precio de verdad nunca sale
-- de esta tabla —quien cobra es Stripe con su `price_id`— y por eso, si algún día
-- discrepan, lo que hay que corregir es esta fila.
-- ============================================================================

BEGIN;

ALTER TABLE public.plan_limits
  -- El identificador del precio en Stripe (`price_…`), no el del producto.
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  -- Solo para pintar. En céntimos, que es como lo dice Stripe y como se evita el
  -- redondeo de los decimales.
  ADD COLUMN IF NOT EXISTS price_cents integer,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'eur',
  -- 'month' | 'year'
  ADD COLUMN IF NOT EXISTS interval text NOT NULL DEFAULT 'month',
  -- La frase que dice para quién es. Una línea, no una lista de características:
  -- lo que separa a estos planes es cuánta gente llevas, y eso ya se ve.
  ADD COLUMN IF NOT EXISTS blurb text,
  -- Un plan retirado deja de ofrecerse sin romper a quien ya lo tiene.
  ADD COLUMN IF NOT EXISTS purchasable boolean NOT NULL DEFAULT false;

UPDATE public.plan_limits SET
  blurb = 'Para probarlo con tus primeros clientes.',
  purchasable = false
WHERE plan = 'prueba';

UPDATE public.plan_limits SET
  price_cents = 2500,
  blurb = 'Para el entrenador que lleva su cartera solo.',
  purchasable = true
WHERE plan = 'solo';

UPDATE public.plan_limits SET
  price_cents = 6900,
  blurb = 'Para un equipo, con la cartera repartida y sin tope.',
  purchasable = true
WHERE plan = 'equipo';

UPDATE public.plan_limits SET
  blurb = 'Estabas antes de que esto tuviera precio.',
  purchasable = false
WHERE plan = 'fundador';

COMMIT;

-- ============================================================================
-- Lo que hay que hacer en Stripe, en orden
-- ----------------------------------------------------------------------------
-- 1. Stripe → Product catalog → Add product, uno por plan de pago:
--      «Caveman Hub · Solo»    precio recurrente mensual  25,00 €
--      «Caveman Hub · Equipo»  precio recurrente mensual  69,00 €
--
-- 2. De cada uno, copiar el id del PRECIO (`price_…`, no `prod_…`) y traerlo:
--
--      UPDATE public.plan_limits SET stripe_price_id = 'price_...' WHERE plan = 'solo';
--      UPDATE public.plan_limits SET stripe_price_id = 'price_...' WHERE plan = 'equipo';
--
-- 3. Desplegar las dos funciones:
--
--      npx supabase functions deploy billing-checkout
--      npx supabase functions deploy billing-webhook --no-verify-jwt
--
--    `--no-verify-jwt` SOLO en el webhook: lo llama Stripe, que no tiene sesión de
--    Supabase. Lo que autentica ahí es la firma HMAC, no un token. En
--    `billing-checkout` es al revés y la verificación del token es imprescindible.
--
-- 4. Secretos de las funciones (Dashboard → Edge Functions → Secrets):
--
--      STRIPE_SECRET_KEY=sk_live_…      ⚠️ la clave COMPLETA: esta sí cobra
--      STRIPE_WEBHOOK_SECRET=whsec_…    la del endpoint del paso 5
--      APP_URL=https://tu-dominio.com   a dónde vuelve el usuario al terminar
--
--    No confundir con la integración de Stripe que ya existe en Ajustes: aquella
--    es la cuenta DEL ENTRENADOR, con clave restringida de solo lectura, y sirve
--    para conciliar lo que le pagan sus clientes. Esta es la cuenta de la
--    PLATAFORMA y mueve dinero de verdad.
--
-- 5. Stripe → Developers → Webhooks → Add endpoint:
--
--      https://<project-ref>.supabase.co/functions/v1/billing-webhook
--
--    Eventos: checkout.session.completed · customer.subscription.updated ·
--             customer.subscription.deleted · invoice.payment_failed ·
--             invoice.payment_succeeded
--
-- Comprobación: contratar en modo prueba con la tarjeta 4242 4242 4242 4242 y
-- mirar que la fila cambia de plan.
--
--   SELECT t.name, s.plan, s.status, s.stripe_subscription_id, s.current_period_end
--   FROM public.team_subscriptions s JOIN public.teams t ON t.id = s.team_id;
-- ============================================================================
