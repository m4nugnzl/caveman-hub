-- ============================================================================
-- Cuánto paga y cada cuánto
-- ----------------------------------------------------------------------------
-- Añade DOS columnas a `clients`. No toca RLS ni ninguna función.
--
-- ══ Qué falta hoy ══════════════════════════════════════════════════════════
--
-- La ficha de un cliente sabe CUÁNDO le toca renovar (`next_payment_date`) y si
-- está al día (`payment_status`), pero no sabe **cuánto te tiene que pagar**. Lo
-- más cerca que hay es `plan`, que es texto libre —«Asesoría premium»— y sirve
-- para acordarse de qué le vendiste, no de por cuánto.
--
-- El resultado es que la única pregunta económica que se hace un entrenador
-- —«¿cuánto me debe Marta?»— no tiene respuesta en la aplicación, y acaba en una
-- hoja de cálculo aparte que se desincroniza a la tercera semana.
--
-- ══ Por qué también la periodicidad ════════════════════════════════════════
--
-- Porque un importe suelto no dice nada: 180 € puede ser tres meses de uno y un
-- mes de otro. Y sobre todo porque es lo que permite **adelantar la fecha sola**
-- al marcar un cobro como pagado, que es el gesto que hoy deja la fecha vieja
-- puesta y convierte la ficha en una mentira al día siguiente.
--
-- ── Por qué `numeric` y no `integer` de céntimos ────────────────────────────
-- Aquí no se procesan pagos: es una cifra que el entrenador anota para acordarse
-- de lo que cobra. `numeric` no tiene error de coma flotante y se lee tal cual en
-- la ficha. Cuando el dinero lo mueve Stripe, la verdad está en Stripe
-- (`stripe_payments`, migración 0012), no en esta columna.
--
-- ── Y por qué no hay moneda ─────────────────────────────────────────────────
-- Porque un entrenador cobra en una sola. Añadir `currency` sería una columna
-- que todo el mundo rellenaría igual y que habría que enseñar en cada pantalla.
-- Si algún día hay clientes en dos divisas, la moneda es del ENTRENADOR y va en
-- sus preferencias, no en la fila de cada cliente.
--
-- ── Quién lo ve ─────────────────────────────────────────────────────────────
-- El cliente tiene SELECT sobre su propia fila (`clients_client_read`, migración
-- 0002), así que puede leer su tarifa. Es correcto: es lo que él paga. Escribir
-- no puede — esa política es solo de lectura.
-- ============================================================================

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fee_amount     numeric,
  ADD COLUMN IF NOT EXISTS billing_period text;

/*
  Los seis periodos, comprobados en la base y no solo en el navegador.

  `once` es el pago único —una planificación puntual, una revisión suelta— y es
  el motivo de que esto sea texto y no un número de meses: «cada 0 meses» no
  significa nada, y «no se repite» sí.

  Se añade con un DO porque `ADD CONSTRAINT` no admite `IF NOT EXISTS`, y esta
  migración tiene que poder ejecutarse dos veces sin romperse.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_billing_period_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_billing_period_check
      CHECK (billing_period IS NULL OR billing_period IN
        ('monthly', 'bimonthly', 'quarterly', 'biannual', 'annual', 'once'));
  END IF;
END $$;

/*
  Y un importe negativo tampoco. No es paranoia de esquema: la ficha escribe
  directamente con un UPDATE desde el navegador, así que un signo menos colado al
  teclear se guardaría y saldría en la cartera como un ingreso al revés.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_fee_amount_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_fee_amount_check
      CHECK (fee_amount IS NULL OR (fee_amount >= 0 AND fee_amount <= 100000));
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT name, plan, fee_amount, billing_period, next_payment_date
--   FROM public.clients ORDER BY name;
--
-- Que el CHECK muerde (tiene que fallar):
--   UPDATE public.clients SET billing_period = 'semanal' WHERE id = '…';
--
-- Y desde la APLICACIÓN: ficha de un cliente → Cobro → poner 60 € y «Mensual».
-- Marcar «Al día» tiene que adelantar la próxima fecha un mes.
--
-- ── Los clientes anteriores ─────────────────────────────────────────────────
-- Se quedan con las dos columnas a NULL, que es lo cierto: nunca se anotó cuánto
-- pagaban. La aplicación lo dice —«sin tarifa»— en vez de inventarse un cero.
-- ============================================================================
