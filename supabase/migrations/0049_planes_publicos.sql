-- ============================================================================
-- Los precios, legibles sin sesión
-- ----------------------------------------------------------------------------
-- ⚠️  Aditiva y reversible. Concede SELECT sobre UNA tabla —la lista de planes—
--     al rol de quien no ha iniciado sesión. No toca datos, ni funciones, ni
--     ninguna otra política.
--
-- ══ Por qué hace falta ══════════════════════════════════════════════════════
--
-- Hasta ahora la aplicación no tenía cara pública: la raíz sin sesión era el
-- formulario de acceso, y todo el posicionamiento del producto eran cuatro
-- palabras bajo el logotipo. Los precios EXISTEN —`plan_limits`, con su
-- `price_cents` desde la 0021— pero solo se veían DESPUÉS de crearse una cuenta
-- y entrar en Ajustes → Plan.
--
-- Con la página pública (`components/marketing/LandingPage.jsx`) eso se invierte:
-- lo primero que ve alguien que llega es qué es esto, para quién y cuánto cuesta.
-- Y para eso hay que poder leer la tabla sin sesión.
--
-- ══ Por qué esto no contradice a la 0046 y la 0047 ══════════════════════════
--
-- Aquellas dos quitaron permisos a `anon` porque **estaban concedidos sin que
-- nadie lo hubiera decidido**: los `ALTER DEFAULT PRIVILEGES` de Supabase los
-- daban solos, y el `REVOKE ... FROM public` no los retiraba. El problema no era
-- que `anon` pudiera hacer algo, era que podía hacerlo sin que constara.
--
-- Esto es lo contrario: un permiso concedido a propósito, sobre una tabla
-- concreta, y escrito. La 0047 ya lo dejaba dicho —«hay dos pantallas que se
-- abren sin sesión»—; ahora son tres.
--
-- ══ Por qué es seguro ══════════════════════════════════════════════════════
--
-- Una lista de precios es información pública por definición: es lo que se pone
-- en un escaparate. `plan_limits` tiene exactamente cuatro filas y ninguna
-- columna que hable de una persona:
--
--   plan · label · max_clients · max_seats · sort · price_cents · currency ·
--   interval · blurb · purchasable · stripe_price_id
--
-- `stripe_price_id` es un identificador de precio de Stripe, que es público por
-- diseño: se manda al navegador en cualquier integración de Checkout. Aun así se
-- filtra abajo por si algún día alguien mete ahí algo que no toca.
--
-- Lo que NO se concede: INSERT, UPDATE ni DELETE. Los planes los escribe una
-- migración, nadie más.
-- ============================================================================

BEGIN;

-- La política que ya existía sigue igual para quien tiene sesión; esta añade a
-- `anon` y solo las filas que se venden o que son el punto de partida.
DROP POLICY IF EXISTS "plans_read_anon" ON public.plan_limits;
CREATE POLICY "plans_read_anon" ON public.plan_limits
  FOR SELECT TO anon
  USING (purchasable OR plan = 'prueba');

GRANT SELECT (
  plan, label, max_clients, max_seats, sort,
  price_cents, currency, interval, blurb, purchasable
) ON public.plan_limits TO anon;

COMMIT;


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- Sin sesión se ven los planes que se venden y la prueba, y NO el de fundador:
--
--   SET ROLE anon;
--   SELECT plan, label, price_cents FROM public.plan_limits ORDER BY sort;
--   -- prueba, solo, equipo · nunca 'fundador'
--   RESET ROLE;
--
-- Y no se puede escribir:
--
--   SET ROLE anon;
--   UPDATE public.plan_limits SET price_cents = 1 WHERE plan = 'solo';  -- error
--   RESET ROLE;
--
-- Lo fija `supabase/tests/autorizacion.test.js`.
-- ============================================================================
