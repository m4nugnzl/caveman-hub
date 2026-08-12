-- ============================================================================
-- Stripe
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva. Requiere `0010_integrations.sql` aplicada y desplegar la función
--     `stripe-payments`.
--
-- ── Por qué Stripe cambia lo que Notion no ──────────────────────────────────
-- Con Notion se lee una tabla que alguien mantiene A MANO: si el entrenador no
-- apunta un cobro, la aplicación no lo sabe. Es un espejo de su hoja de cálculo,
-- con las mismas lagunas.
--
-- Con Stripe el estado de pago viene de QUIEN COBRA. Y trae tres cosas que no
-- existen en una tabla escrita a mano:
--
--   · la tarjeta rechazada, el día que se rechaza;
--   · la baja, en cuanto el cliente la pide;
--   · la fecha real de la próxima renovación, calculada por la suscripción.
--
-- ── Por qué el emparejamiento es fiable, al contrario que con Notion ────────
-- Stripe identifica a cada cliente por EMAIL, no por un texto libre con su nombre.
-- El email es exacto: o coincide o no coincide, sin acentos, sin apellidos
-- invertidos y sin apodos. Por eso la conciliación de Stripe casi nunca pregunta.
--
-- La memoria de conciliación es la misma tabla (`client_external_refs`), con la
-- clave normalizada del email en lugar del nombre.
-- ============================================================================

BEGIN;

-- ── El catálogo de proveedores se abre ──────────────────────────────────────
-- `integrations.provider` tenía `CHECK (provider IN ('notion'))`, así que insertar
-- una integración de Stripe fallaba con una violación de constraint. Se sustituye
-- por la lista ampliada en lugar de quitar la comprobación: un CHECK que enumera
-- los proveedores conocidos es lo que evita guardar un `provider` mal escrito.

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_provider_check CHECK (provider IN ('notion', 'stripe'));

-- ── Lo que Stripe sabe y una tabla de pagos no ──────────────────────────────
-- Estas columnas describen el ESTADO de la relación, no un cobro suelto. Un pago
-- dice «cobré 60 € el 3 de marzo»; una suscripción dice «está activa, renueva el 3
-- de abril, y el último intento falló». Es la diferencia entre un registro
-- contable y saber con quién hay que hablar hoy.

ALTER TABLE public.client_payments
  -- 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'incomplete'
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_id text,
  -- Cuándo dejó de estar activa, si dejó de estarlo.
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  -- El último intento de cobro falló: es el aviso más accionable de todos.
  ADD COLUMN IF NOT EXISTS payment_failed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS client_payments_failed_idx
  ON public.client_payments (integration_id)
  WHERE payment_failed;

COMMIT;

-- ============================================================================
-- Después de aplicarla
-- ----------------------------------------------------------------------------
-- 1. Desplegar la función (desde el directorio del proyecto):
--
--      npx supabase functions deploy stripe-payments
--
-- 2. En Stripe: Developers → API keys → **clave restringida** (Restricted key),
--    NO la secreta completa. Con permisos de solo lectura en:
--      Customers: read · Subscriptions: read · Invoices: read
--
--    Es importante: una clave secreta completa puede EMITIR COBROS y REEMBOLSOS.
--    Esta integración solo lee, así que no hay ningún motivo para darle más. Si la
--    clave se filtrase, con una restringida de lectura el daño es ver datos; con la
--    completa, mover dinero.
--
-- 3. En la aplicación: Ajustes → Integraciones → Stripe → pegar la clave.
--
-- ── Lo que falta para que sea inmediato ─────────────────────────────────────
-- Esto sincroniza cuando se le pide. Para que los avisos lleguen SOLOS hace falta
-- un webhook de Stripe apuntando a la función, con los eventos
-- `invoice.payment_failed`, `customer.subscription.updated` y
-- `customer.subscription.deleted`. La función ya distingue esos casos; solo hay que
-- registrar el endpoint en Stripe y guardar su secreto de firma.
-- ============================================================================
