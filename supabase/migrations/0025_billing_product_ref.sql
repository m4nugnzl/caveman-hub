-- ============================================================================
-- Cobrar apuntando al PRODUCTO, no solo al precio
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere `0021_billing_prices.sql`. Añade una columna; la anterior
--     sigue funcionando igual. Hay que volver a desplegar `billing-checkout`.
--
-- ══ Por qué ════════════════════════════════════════════════════════════════
--
-- Un producto de Stripe («Caveman Hub · Solo») tiene uno o varios precios, y cada
-- precio es un objeto INMUTABLE: cambiar 25 € por 29 € no edita el precio, crea
-- uno nuevo y lo marca como predeterminado del producto.
--
-- Con solo `stripe_price_id`, esa subida de precio obliga a acordarse de venir
-- aquí a cambiar la fila. Y si se olvida, la aplicación sigue cobrando el precio
-- viejo sin que nada avise, porque el precio antiguo no deja de existir.
--
-- Apuntando al producto, se cobra siempre su precio vigente.
--
-- ══ Y por qué se conservan las dos columnas ════════════════════════════════
--
-- Porque responden a dos intenciones distintas y las dos son legítimas:
--
--   stripe_price_id    «cobra EXACTAMENTE este precio». Es lo que hace falta para
--                      mantener una tarifa antigua a quien ya la tenía, o para no
--                      depender de qué esté marcado como predeterminado.
--   stripe_product_id  «cobra lo que valga hoy». Lo normal.
--
-- Si están las dos, manda el precio: es la más específica, y una preferencia al
-- revés haría que fijar un precio concreto no sirviera de nada.
--
-- Cada columna dice lo que guarda, que es lo que evita el problema de la sección 2
-- de `auditoria.md` —columnas cuyo nombre no describe su contenido—. Meter un
-- `prod_…` dentro de `stripe_price_id` habría sido justo eso.
-- ============================================================================

BEGIN;

ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS stripe_product_id text;

COMMENT ON COLUMN public.plan_limits.stripe_price_id IS
  'Precio exacto de Stripe (price_…). Si está, manda sobre el producto.';
COMMENT ON COLUMN public.plan_limits.stripe_product_id IS
  'Producto de Stripe (prod_…). Se cobra su precio predeterminado vigente.';

COMMIT;

-- ============================================================================
-- Rellenarlo
-- ----------------------------------------------------------------------------
-- Los identificadores están en Stripe → Catálogo de productos, en la cabecera de
-- cada producto. Son los que empiezan por `prod_`.
--
--   UPDATE public.plan_limits SET stripe_product_id = 'prod_...' WHERE plan = 'solo';
--   UPDATE public.plan_limits SET stripe_product_id = 'prod_...' WHERE plan = 'equipo';
--
-- Y después:  npx supabase functions deploy billing-checkout
--
-- ⚠️  Los identificadores de MODO PRUEBA y los de DIRECTO son objetos distintos.
--    Al pasar a cobrar de verdad hay que crear los productos otra vez y volver a
--    ejecutar estos UPDATE con los nuevos.
--
-- Comprobación:
--
--   SELECT plan, label, price_cents, stripe_product_id, stripe_price_id, purchasable
--   FROM public.plan_limits ORDER BY sort;
-- ============================================================================
