-- ============================================================================
-- Pagar por años
-- ----------------------------------------------------------------------------
-- Dos columnas en `plan_limits` y un permiso. Ni funciones, ni políticas, ni
-- disparadores, ni una línea del webhook.
--
--      Solo     390 €/año      Pro   790 €/año      Equipo  1.490 €/año
--
-- Diez meses por doce. El descuento no es generosidad: adelanta un año de caja,
-- y sobre todo quita once ocasiones de darse de baja. En una herramienta cuyo
-- valor se demuestra en meses —el check-in es semanal y el progreso de un
-- cliente se mide en trimestres (0056)— el cobro mensual pone la pregunta
-- «¿esto me sirve?» once veces más de las que hace falta.
--
-- ══ 1. Dos precios en la misma fila, y no una fila por periodo ═════════════
--
-- Lo evidente era `solo_anual`, `pro_anual`, `equipo_anual`. Se descarta, y por
-- el motivo por el que `plan_limits` existe siendo una tabla y no un `CASE`
-- dentro de una función (0019): **para que cambiar un límite sea un `UPDATE`**.
-- Con una fila por periodo, subir Pro de 30 a 35 clientes son dos `UPDATE` que
-- hay que acordarse de hacer los dos, y el día que solo se haga uno, dos
-- entrenadores que pagan lo mismo tendrán topes distintos. Ese fallo no avisa:
-- se descubre porque alguien no puede dar de alta a un cliente que su vecino sí.
--
-- Y hay una segunda razón, más difícil de deshacer: `team_subscriptions.plan`
-- guarda la clave, y el webhook la escribe desde `metadata.plan`. Con filas por
-- periodo, el plan de un equipo pasaría a codificar **cómo paga** además de
-- **qué tiene**, y `my_team_plan()`, el disparador del límite y la pantalla
-- tendrían que aprender a quitarle el sufijo. Aquí no se entera nadie: el que
-- paga por años está en `solo` exactamente igual que el que paga por meses, y
-- la única diferencia vive en Stripe, que es donde vive el dinero.
--
-- Lo que cuesta esta decisión: `interval` se queda describiendo solo a
-- `price_cents` —o sea, vale `month` y ya no dice gran cosa—. Se deja porque lo
-- lee `planPrice` en `lib/num.js` y porque quitarlo no arregla nada.
--
-- ══ 2. Llegan vacías, como en la 0061 ══════════════════════════════════════
--
-- Las dos columnas nacen NULL y **la interfaz enseña el anual solo si
-- `price_cents_year` tiene algo**. Eso hace que esta migración no cambie nada de
-- lo que se ve y que el interruptor sea por plan: el día que Solo tenga precio
-- anual en Stripe, aparece el de Solo y nada más.
--
-- No hace falta un `purchasable_year`: el precio anual y el permiso para
-- venderlo son la misma cosa, y dos banderas que siempre valen lo mismo son una
-- bandera y un despiste.
--
-- ══ 3. El permiso, que es el que se olvida ═════════════════════════════════
--
-- La 0049 no concedió la tabla a `anon`: concedió **una lista de columnas**. Una
-- columna nueva no entra en esa lista por existir, así que sin el `GRANT` de
-- abajo la portada —que lee sin sesión— vería los precios anuales como NULL y no
-- los enseñaría nunca. Y no daría ningún error: enseñaría la página de siempre.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql.';
  END IF;
END;
$$;

BEGIN;

ALTER TABLE public.plan_limits
  -- El `price_…` anual de Stripe. Mientras sea NULL, el plan no se puede pagar
  -- por años y la interfaz no lo ofrece.
  ADD COLUMN IF NOT EXISTS stripe_price_id_year text,
  -- Solo para pintar, en céntimos y en la misma moneda que `price_cents`: quien
  -- cobra sigue siendo Stripe. Si algún día discrepan, lo que se corrige es esto.
  ADD COLUMN IF NOT EXISTS price_cents_year integer;

COMMENT ON COLUMN public.plan_limits.price_cents_year IS
  'Precio anual en céntimos, solo para pintar. NULL = este plan no se paga por años.';
COMMENT ON COLUMN public.plan_limits.stripe_price_id_year IS
  'El `price_…` anual. NULL = no se puede contratar por años.';

-- Un importe negativo no es un precio. La columna la escribe una migración y no
-- la aplicación, así que esto es un cinturón, no un control de entrada — pero es
-- barato y el día que alguien copie mal un cero se nota aquí y no en una factura.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.plan_limits'::regclass
      AND conname = 'plan_limits_price_cents_year_check'
  ) THEN
    ALTER TABLE public.plan_limits
      ADD CONSTRAINT plan_limits_price_cents_year_check
      CHECK (price_cents_year IS NULL OR price_cents_year > 0);
  END IF;
END;
$$;

/*
  El permiso del punto 3. `stripe_price_id_year` NO se concede, igual que no se
  concedió `stripe_price_id`: sin sesión no hay ninguna razón para leer un
  identificador de Stripe, y el precio que se pinta ya viaja en la otra columna.
*/
GRANT SELECT (price_cents_year) ON public.plan_limits TO anon;

COMMIT;


-- ============================================================================
-- DESPUÉS DE STRIPE — plan a plan
-- ----------------------------------------------------------------------------
-- 1. En la cuenta REAL, sobre los productos que ya existen —no se crean
--    productos nuevos: es el mismo plan pagado de otra forma, y en la factura
--    tiene que seguir poniendo «Solo»—:
--
--       Catálogo de productos → Solo → Añadir otro precio
--         · Importe: 390,00 EUR
--         · Recurrente · Anual
--         · Comportamiento fiscal: EXCLUIDO  ← no se puede corregir después
--
--    Igual en Pro (790,00 €) y en Equipo (1.490,00 €).
--
--    **No lo marques como precio predeterminado.** El predeterminado es el
--    mensual: es al que cae `billing-checkout` cuando un plan no tiene
--    `stripe_price_id`, y también lo que enseña Stripe donde no cabe una lista.
--
-- 2. Y esto, de una vez, con los tres `price_…` anuales:
--
--   BEGIN;
--
--   UPDATE public.plan_limits
--      SET stripe_price_id_year = 'price_…', price_cents_year = 39000
--    WHERE plan = 'solo';
--
--   UPDATE public.plan_limits
--      SET stripe_price_id_year = 'price_…', price_cents_year = 79000
--    WHERE plan = 'pro';
--
--   UPDATE public.plan_limits
--      SET stripe_price_id_year = 'price_…', price_cents_year = 149000
--    WHERE plan = 'equipo';
--
--   COMMIT;
--
--    Los tres juntos por lo mismo que en la 0061: la portada lee esta tabla sin
--    sesión, así que media tarifa aplicada es media tarifa publicada.
--
-- 3. Comprobación con dinero de verdad, que es la única que vale en directo:
--    contratar Solo anual y mirar que el cargo son **390 € + IVA = 471,90 €** y
--    que la renovación que anuncia Stripe es dentro de un año. Y reembolsar.
-- ============================================================================


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
--   SELECT plan, label, price_cents, price_cents_year, purchasable
--     FROM public.plan_limits ORDER BY sort;
--
-- Que la portada ve el precio anual y NO el identificador:
--
--   SET ROLE anon;
--   SELECT plan, price_cents, price_cents_year FROM public.plan_limits ORDER BY sort;
--   SELECT stripe_price_id_year FROM public.plan_limits;  -- tiene que fallar
--   RESET ROLE;
-- ============================================================================
