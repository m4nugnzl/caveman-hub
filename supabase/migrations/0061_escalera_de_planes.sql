-- ============================================================================
-- La escalera de planes
-- ----------------------------------------------------------------------------
-- Tres peldaños de pago en vez de dos, y el precio vuelve a crecer con el
-- cliente. No toca ninguna función, ninguna política ni ningún disparador: el
-- límite lo sigue imponiendo `enforce_client_limit` (0019) leyendo
-- `max_clients`, que es lo que hace que esto sea una migración de datos.
--
-- El porqué está entero en `docs/monetizacion.md` §7.
--
--      Gratis    0 €     3 clientes   1 asiento    (`prueba`, no se toca)
--      Solo     39 €    10 clientes   1 asiento
--      Pro      79 €    30 clientes   1 asiento
--      Equipo  149 €    sin tope      3 asientos
--
-- ══ 1. Los nombres se quedan; lo que se mueve es lo que hay detrás ═════════
--
-- `solo` sigue llamándose Solo y `equipo` sigue llamándose Equipo. Lo que cambia
-- es lo que significan: Solo pasa de 30 clientes por 25 € a 10 por 39, y Equipo
-- de ilimitado por 69 € a ilimitado con tres asientos por 149.
--
-- Reutilizar las claves es una decisión, no un descuido, y trae consigo el
-- trabajo del punto 2. Se toma porque la escalera que se vende —Solo, Pro,
-- Equipo— es la que se entiende, y una tabla de precios se lee una vez y se
-- decide en esa: no es sitio para nombres de segunda opción.
--
-- ══ 2. Y por eso hay que mover a quien ya paga, en DOS sitios ══════════════
--
-- Esta es la parte que falla en silencio si se hace a medias, y falla semanas
-- después de ejecutarla.
--
-- `billing-webhook` escribe `patch.plan = object.metadata.plan` en cada
-- `customer.subscription.updated`. La suscripción de quien ya paga lleva
-- `metadata.plan = 'solo'` grabado en Stripe desde el día que la contrató. O sea
-- que mover su fila en la base **no basta**: en su siguiente renovación el
-- webhook le devolvería a `solo`, que para entonces significa diez clientes, y
-- un entrenador con veinte se encontraría sin poder dar de alta al siguiente.
-- Sin aviso, sin error, y con el `UPDATE` de aquí abajo pareciendo correcto.
--
-- Así que son dos pasos y el segundo está en Stripe, a mano:
--
--   1. Aquí: `team_subscriptions.plan` pasa a `solo_2026` / `equipo_2026`, dos
--      filas nuevas que son **copia exacta** de lo que Solo y Equipo valían y
--      limitaban ayer. Nadie nota nada: mismo cupo, mismo precio, misma factura.
--   2. En Stripe: editar `metadata.plan` de esa suscripción y poner `solo_2026`.
--      A partir de ahí el webhook escribe la clave vieja para siempre y esto se
--      sostiene solo.
--
-- Entre el paso 1 y el paso 2 hay una ventana: si justo ahí llega una
-- renovación, esa cuenta se va al plan nuevo. Se arregla repitiendo el `UPDATE`
-- del paso 1, y se evita haciendo los dos seguidos. La lista está al final.
--
-- ══ 3. Se aplica UNA vez ═══════════════════════════════════════════════════
--
-- Todo el trabajo va dentro de un bloque que se corta solo si ya se pasó: mueve
-- suscripciones y reescribe precios, y ninguna de las dos cosas se puede repetir
-- sin hacer daño. Volver a pasarla después de configurar Stripe borraría los
-- `price_…` recién puestos y apagaría los planes encendidos, que es exactamente
-- el fallo que nadie mira porque «la migración ya estaba aplicada».
--
-- ══ 4. Llegan sin poder contratarse ════════════════════════════════════════
--
-- `purchasable = false` en los tres, porque todavía no existen en Stripe.
-- `billing-checkout` resuelve el precio por `stripe_price_id` —y por eso esta
-- migración los pone a NULL: el `price_…` de los 25 € se queda en la fila vieja,
-- que es de quien lo está pagando, y el Solo nuevo no puede heredarlo o cobraría
-- 25 € por un plan de 39—. Sin precio, checkout contesta que no está
-- configurado; y como la portada pinta lo que hay en esta tabla (0049),
-- publicar la fila antes que el producto sería anunciar un precio que no se
-- puede cobrar.
--
-- Así que aplicar esto **no cambia nada de lo que se ve**. Enciende el bloque
-- «DESPUÉS DE STRIPE» del final.
--
-- ══ 5. Los asientos todavía no se facturan ═════════════════════════════════
--
-- `billing-checkout` manda `line_items[0][quantity] = '1'` fijo, así que
-- `max_seats` limita pero no cobra. Equipo nace con tres asientos exactos y el
-- cuarto es un `UPDATE` acordado, no un botón. Comprar un asiento no es cosa de
-- la pasarela de todas formas: nadie sabe cuántos va a necesitar el día que se
-- da de alta.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.plan_limits') IS NULL THEN
    RAISE EXCEPTION 'Falta 0019_billing.sql: sin planes no hay escalera que construir.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_limits' AND column_name = 'purchasable'
  ) THEN
    RAISE EXCEPTION 'Falta 0021_billing_prices.sql: sin `purchasable` ni `price_cents` esto no se puede escribir.';
  END IF;
  /*
    Y la 0025, que pasó de verdad: sin ella el `INSERT` de más abajo se rompe con
    «column "stripe_product_id" does not exist», que es un error que no dice cuál
    es el arreglo. Toda la migración va en una transacción, así que no deja nada a
    medias — pero deja creyendo que se aplicó algo, y eso es peor que no aplicarla.

    Merece guarda propia porque `billing-checkout` LEE esa columna: si falta en la
    base, el `select` de la función devuelve error, `planRow` llega vacío y la
    pasarela contesta «ese plan no se puede contratar» a todo el mundo.
  */
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plan_limits' AND column_name = 'stripe_product_id'
  ) THEN
    RAISE EXCEPTION 'Falta 0025_billing_product_ref.sql. Aplícala antes: es un ALTER TABLE y dos comentarios.';
  END IF;
END;
$$;

BEGIN;

DO $$
BEGIN
  /*
    El corte del punto 3. `solo_2026` solo existe si esto ya corrió, así que es
    la señal más fiable que hay y no hace falta una tabla de migraciones.
  */
  IF EXISTS (SELECT 1 FROM public.plan_limits WHERE plan = 'solo_2026') THEN
    RAISE NOTICE 'La 0061 ya estaba aplicada. No se toca nada.';
    RETURN;
  END IF;

  -- ── 1. La tarifa de ayer, guardada tal cual ──────────────────────────────
  --
  -- Copia con `SELECT` y no con valores escritos a mano: así la fila retirada
  -- es exactamente lo que esa gente contrató, incluido su `price_…`, y no lo
  -- que yo recuerde que era. `blurb` y `label` sí se escriben, porque son lo
  -- único que tiene que cambiar: quien la vea en su pantalla debe entender que
  -- es un plan retirado y no una opción.
  INSERT INTO public.plan_limits
    (plan, label, max_clients, max_seats, sort, price_cents, currency, interval,
     blurb, purchasable, stripe_price_id, stripe_product_id)
  SELECT 'solo_2026', 'Solo (tarifa 2026)', max_clients, max_seats, 7,
         price_cents, currency, interval,
         'Tu tarifa de siempre. Se retiró para los nuevos y a ti no te cambia.',
         false, stripe_price_id, stripe_product_id
    FROM public.plan_limits WHERE plan = 'solo';

  INSERT INTO public.plan_limits
    (plan, label, max_clients, max_seats, sort, price_cents, currency, interval,
     blurb, purchasable, stripe_price_id, stripe_product_id)
  SELECT 'equipo_2026', 'Equipo (tarifa 2026)', max_clients, max_seats, 8,
         price_cents, currency, interval,
         'Tu tarifa de siempre. Se retiró para los nuevos y a ti no te cambia.',
         false, stripe_price_id, stripe_product_id
    FROM public.plan_limits WHERE plan = 'equipo';

  -- ── 2. Y la gente que la tiene, dentro ───────────────────────────────────
  --
  -- Antes de redefinir nada, que si no se les cambia el cupo por debajo.
  -- Se mueven TODAS las filas, también las canceladas: todas se contrataron con
  -- el precio viejo, y una cuenta que vuelva tiene que volver a lo que tenía.
  UPDATE public.team_subscriptions
     SET plan = 'solo_2026', updated_at = now()
   WHERE plan = 'solo';

  UPDATE public.team_subscriptions
     SET plan = 'equipo_2026', updated_at = now()
   WHERE plan = 'equipo';

  -- ── 3. Los mismos nombres, detrás otra cosa ──────────────────────────────
  --
  -- `stripe_price_id` y `stripe_product_id` a NULL, que es la línea que más
  -- fácil sería olvidar y la más cara: sin esto, el Solo de 39 € seguiría
  -- apuntando al precio de 25 € y cobraría eso, indefinidamente y sin que
  -- ninguna pantalla dijera nada raro.
  UPDATE public.plan_limits SET
    label             = 'Solo',
    max_clients       = 10,
    max_seats         = 1,
    sort              = 1,
    price_cents       = 3900,
    blurb             = 'Para el que ya vive de esto, con sus primeros diez.',
    purchasable       = false,
    stripe_price_id   = NULL,
    stripe_product_id = NULL
  WHERE plan = 'solo';

  UPDATE public.plan_limits SET
    label             = 'Equipo',
    max_clients       = NULL,
    max_seats         = 3,
    sort              = 3,
    price_cents       = 14900,
    blurb             = 'Cuando ya no entrenas solo: sin tope de clientes y tres asientos.',
    purchasable       = false,
    stripe_price_id   = NULL,
    stripe_product_id = NULL
  WHERE plan = 'equipo';

  -- ── 4. El peldaño que faltaba ────────────────────────────────────────────
  --
  -- Es el que arregla la fuga: hasta hoy, pasar de 30 clientes costaba +176 % y
  -- el siguiente peldaño era «ilimitado». Treinta clientes por 79 € es donde
  -- está el entrenador que vive de esto y trabaja solo, que es casi todo el
  -- mercado (§7.3).
  INSERT INTO public.plan_limits
    (plan, label, max_clients, max_seats, sort, price_cents, currency, interval,
     blurb, purchasable)
  VALUES
    ('pro', 'Pro', 30, 1, 2, 7900, 'eur', 'month',
     'La cartera llena de un entrenador que trabaja solo.', false);
END;
$$;

COMMIT;


-- ============================================================================
-- DESPUÉS DE STRIPE — el interruptor
-- ----------------------------------------------------------------------------
-- Nada de lo de arriba se ve hasta que se ejecute esto. La §3.6 de
-- `docs/monetizacion.md` sigue valiendo entera y vuelve a ser lo que más caro
-- sale: el sandbox y la cuenta real son mundos separados, un `price_…` de uno no
-- existe en el otro, y un webhook dado de alta en el que no toca no da ningún
-- error — simplemente no llega nada y el plan se queda como estaba.
--
-- ── 0. PRIMERO, lo de Stripe que no puede esperar ───────────────────────────
--
-- Antes que ningún producto nuevo, y valga o no valga la tarifa: en cada `Price`
-- → **Tax behavior = `exclusive`**. Si está en `inclusive`, de cada 39 € se
-- ingresan 32,23 € y el IVA sale de tu margen en vez del bolsillo de un autónomo
-- que se lo deduce. Es la línea de todo este trabajo que más dinero mueve por
-- minuto invertido (§7.1).
--
-- ── 1. Mover el `metadata` de quien ya paga (el paso 2 de la cabecera) ──────
--
-- Hazlo INMEDIATAMENTE después de aplicar la migración, no mañana: entre una
-- cosa y otra, una renovación se lleva esa cuenta al plan nuevo.
--
-- Quiénes son, y cuántos clientes tienen —que es lo que decide si además hay que
-- hablar con ellos—:
--
--   SELECT p.email, ts.plan, ts.status, ts.stripe_subscription_id,
--          (SELECT count(*) FROM public.clients c
--            WHERE c.team_id = t.id AND c.status <> 'archived') AS clientes
--     FROM public.team_subscriptions ts
--     JOIN public.teams t    ON t.id = ts.team_id
--     JOIN public.profiles p ON p.id = t.owner_id
--    WHERE ts.plan IN ('solo_2026', 'equipo_2026')
--      AND ts.stripe_subscription_id IS NOT NULL;
--
-- Para cada `sub_…` que salga: Stripe → Subscriptions → esa suscripción →
-- Metadata → `plan` = `solo_2026` (o `equipo_2026`). Nada más. No se toca el
-- precio: sigue pagando lo que pagaba.
--
-- ── 2. Los productos nuevos ─────────────────────────────────────────────────
--
--   Product catalog → Add product, recurrente y mensual, uno por plan:
--      Solo   39,00 €      Pro   79,00 €      Equipo   149,00 €
--
-- ── 3. Y el interruptor, de una vez ─────────────────────────────────────────
--
--   BEGIN;
--
--   UPDATE public.plan_limits SET stripe_price_id = 'price_…' WHERE plan = 'solo';
--   UPDATE public.plan_limits SET stripe_price_id = 'price_…' WHERE plan = 'pro';
--   UPDATE public.plan_limits SET stripe_price_id = 'price_…' WHERE plan = 'equipo';
--
--   -- Los tres a la vez. Encender de uno en uno deja ratos con media tarifa
--   -- publicada, y eso se ve desde la calle: la portada lee esta tabla.
--   UPDATE public.plan_limits SET purchasable = true
--    WHERE plan IN ('solo', 'pro', 'equipo');
--
--   COMMIT;
--
-- Comprobación, y con dinero de verdad como la otra vez: una compra del plan
-- Solo con tarjeta propia, mirar que el cargo son 39 € y no 25 —que es lo que
-- confirma que el `price_…` viejo se soltó— y su reembolso.
--
-- ── 4. La portada ───────────────────────────────────────────────────────────
--
-- Pasa de tres tarjetas a cuatro: Gratis · Solo · Pro · Equipo. `lp-plan-grid`
-- estaba pensada para tres y las mete en una fila por catorce píxeles; que
-- sigan siendo legibles hay que mirarlo.
-- ============================================================================


-- ============================================================================
-- Comprobarlo
-- ----------------------------------------------------------------------------
-- La escalera entera, en el orden en que la ve alguien:
--
--   SELECT sort, plan, label, max_clients, max_seats, price_cents, purchasable
--     FROM public.plan_limits ORDER BY sort;
--
-- Que no ha cambiado nada de lo que se ve —sin sesión, exactamente los mismos
-- tres de ayer, porque los nuevos aún no se venden—:
--
--   SET ROLE anon;
--   SELECT plan, label, price_cents FROM public.plan_limits ORDER BY sort;
--   RESET ROLE;
--
-- Y lo importante: que a nadie se le ha movido el suelo bajo los pies. Cada
-- suscripción que existía sigue con el mismo cupo y el mismo precio que ayer,
-- solo que la fila se llama distinto:
--
--   SELECT ts.plan, l.max_clients, l.price_cents, count(*) AS equipos
--     FROM public.team_subscriptions ts
--     JOIN public.plan_limits l ON l.plan = ts.plan
--    GROUP BY 1, 2, 3 ORDER BY 1;
--   -- quien pagaba 2500 por 30 clientes sigue en 2500 por 30, en `solo_2026`
--
-- Que no queda nadie colgando de los nombres reutilizados:
--
--   SELECT count(*) FROM public.team_subscriptions WHERE plan IN ('solo', 'equipo');
--   -- 0, hasta que alguien contrate la tarifa nueva
-- ============================================================================
