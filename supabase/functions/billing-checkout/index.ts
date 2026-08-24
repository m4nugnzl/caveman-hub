/**
 * Contratar y gestionar la suscripción del equipo.
 *
 * ══ Qué hace y qué NO hace ═════════════════════════════════════════════════
 *
 * Devuelve una URL de Stripe a la que redirigir: la pasarela de pago o el portal
 * de facturación. No cobra nada por su cuenta y **no toca `team_subscriptions`**:
 * el estado lo escribe el webhook cuando Stripe confirma. Es deliberado. Si esta
 * función marcara el plan como activo al devolver la URL, bastaría con abrirla y
 * cerrar la pestaña para tener el plan sin pagarlo.
 *
 * ══ Por qué el plan se elige aquí y no llega desde el navegador ════════════
 *
 * Del cliente solo viene el NOMBRE del plan («solo», «equipo»). El precio que se
 * cobra se lee de `plan_limits` en la base de datos. Si el navegador mandara el
 * `price_id`, cualquiera podría mandar el de un plan de un céntimo y llevarse el
 * de sesenta y nueve euros.
 *
 * ══ Quién puede llamarla ═══════════════════════════════════════════════════
 *
 * El token de la sesión identifica a la persona; de ahí se sacan su equipo y su
 * rol, y solo el `owner` puede contratar. La suscripción es del negocio: que un
 * entrenador contratado pueda cambiar el plan del equipo —o abrir el portal donde
 * se ven las facturas— no es un permiso que nadie haya querido dar.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_API = 'https://api.stripe.com/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '3600',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Llamada a Stripe.
 *
 * La API es `application/x-www-form-urlencoded`, no JSON, y los objetos anidados
 * se escriben con corchetes (`line_items[0][price]`). Se construye a mano en vez
 * de traerse la librería: son cuatro campos y evita una dependencia de 400 KB en
 * el arranque en frío de la función.
 */
async function stripe(path: string, key: string, form: Record<string, string>) {
  const body = new URLSearchParams(form);

  const response = await fetch(`${STRIPE_API}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json();

  if (!response.ok) {
    // El mensaje de Stripe es específico y útil («No such price: price_123»), así
    // que se conserva en el registro; al usuario se le da uno legible.
    console.error('Stripe', response.status, JSON.stringify(payload).slice(0, 500));
    throw new Error(payload?.error?.message || `Stripe respondió ${response.status}`);
  }

  return payload;
}

/**
 * Lectura de Stripe.
 *
 * `stripe()` solo escribe. Para cambiar de plan hay que leer antes la suscripción
 * —cuál es su línea y en qué estado está—, y un fallo aquí no es motivo para
 * cortar: se devuelve `null` y quien llama decide. En la práctica significa que
 * si la suscripción guardada ya no existe en Stripe, se sigue hacia la pasarela
 * en vez de dejar al usuario con un error que no puede resolver.
 */
async function stripeGet(path: string, key: string) {
  const response = await fetch(`${STRIPE_API}/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  const payload = await response.json();

  if (!response.ok) {
    console.error('Stripe GET', response.status, JSON.stringify(payload).slice(0, 500));
    return null;
  }

  return payload;
}

/**
 * Estados en los que una suscripción todavía se puede modificar.
 *
 * Las canceladas se siguen pudiendo LEER en Stripe —contestan 200 con
 * `status: 'canceled'`—, así que mirar solo si la lectura salió bien no basta
 * para saber si hay algo vivo que cambiar.
 */
const MODIFICABLE = new Set(['active', 'trialing', 'past_due', 'unpaid']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  const appUrl = Deno.env.get('APP_URL');
  if (!key || !appUrl) {
    return json({ error: 'Faltan STRIPE_SECRET_KEY o APP_URL en los secretos de la función.' }, 500);
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Falta la sesión.' }, 401);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    /*
      Quién llama. Se verifica el token contra Supabase Auth en lugar de fiarse de
      un identificador que venga en el cuerpo: lo segundo lo puede escribir
      cualquiera, y aquí se decide quién paga y a nombre de qué equipo.
    */
    const { data: userData, error: userError } = await service.auth.getUser(
      authorization.replace('Bearer ', '')
    );
    const user = userData?.user;
    if (userError || !user) return json({ error: 'Sesión no válida.' }, 401);

    const { action, plan: planName, periodo } = await request.json();

    const { data: membership } = await service
      .from('team_members')
      .select('team_id, role')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!membership) return json({ error: 'No perteneces a ningún equipo.' }, 400);
    if (membership.role !== 'owner') {
      return json({ error: 'Solo quien creó el equipo puede gestionar la suscripción.' }, 403);
    }

    const { data: subscription } = await service
      .from('team_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, plan')
      .eq('team_id', membership.team_id)
      .maybeSingle();

    // ── El portal: facturas, tarjeta y baja ──────────────────────────────────
    /*
      No se reimplementa nada de esto. Cambiar la tarjeta significa manejar datos
      de tarjeta; darse de baja y ver facturas, mantener pantallas que Stripe ya
      tiene hechas y traducidas. El portal es la respuesta correcta a las tres.
    */
    if (action === 'portal') {
      if (!subscription?.stripe_customer_id) {
        return json({ error: 'Todavía no hay ninguna suscripción que gestionar.' }, 400);
      }

      const session = await stripe('billing_portal/sessions', key, {
        customer: subscription.stripe_customer_id,
        return_url: `${appUrl}/ajustes/plan`,
      });

      return json({ ok: true, url: session.url });
    }

    // ── La pasarela ──────────────────────────────────────────────────────────
    if (typeof planName !== 'string' || !planName) {
      return json({ error: 'Falta el plan.' }, 400);
    }

    /*
      Cada cuánto se paga. Del navegador viaja una PALABRA de dos posibles, nunca
      un `price_…`, que es la misma regla que ya gobierna el plan y por el mismo
      motivo: lo que decide cuánto se cobra se lee en el servidor. Aquí además la
      palabra ni siquiera llega a Stripe — solo elige de qué columna sale el
      precio—, así que un valor inventado no puede acabar en ningún sitio.

      Sin `periodo` es mensual. Es lo que manda la aplicación que había antes de
      esta línea, y una versión vieja de la interfaz tiene que seguir contratando
      lo que contrataba.
    */
    const anual = periodo === 'year';
    if (periodo !== undefined && periodo !== 'month' && periodo !== 'year') {
      return json({ error: 'Ese periodo de pago no existe.' }, 400);
    }

    const { data: planRow } = await service
      .from('plan_limits')
      .select(
        'plan, label, stripe_price_id, stripe_price_id_year, stripe_product_id, purchasable'
      )
      .eq('plan', planName)
      .maybeSingle();

    if (!planRow?.purchasable) return json({ error: 'Ese plan no se puede contratar.' }, 400);

    /*
      Qué se cobra. Dos formas, y la más específica manda:

        · `stripe_price_id`   → ese precio exacto, pase lo que pase.
        · `stripe_product_id` → el precio VIGENTE del producto.

      La segunda existe porque los precios de Stripe son inmutables: subir de 25 €
      a 29 € no edita el precio, crea otro y lo marca como predeterminado. Con solo
      el precio guardado habría que acordarse de venir a cambiarlo, y si se olvida
      se sigue cobrando el viejo sin que nada avise.
    */
    let priceId = anual ? planRow.stripe_price_id_year : planRow.stripe_price_id;

    /*
      El anual NO cae al precio predeterminado del producto, y eso es a propósito:
      el predeterminado es el mensual (0062), así que la red de seguridad de abajo
      cobraría 39 € al mes a quien pulsó «pagar por años». Un plan sin precio anual
      no se puede pagar por años y punto — que es, además, lo que la pantalla ya
      cree, porque solo ofrece el anual cuando hay `price_cents_year`.
    */
    if (anual && !priceId) {
      return json(
        { error: `El plan ${planRow.label} no se puede pagar por años todavía.` },
        400
      );
    }

    if (!priceId && planRow.stripe_product_id) {
      const response = await fetch(
        `${STRIPE_API}/products/${planRow.stripe_product_id}`,
        { headers: { Authorization: `Bearer ${key}` } }
      );

      if (!response.ok) {
        return json(
          { error: `Stripe no encuentra el producto del plan ${planRow.label}. ¿Es de otro modo (prueba/directo)?` },
          400
        );
      }

      const product = await response.json();
      // `default_price` llega como identificador o como objeto según se pida
      // expandido; se aceptan los dos para no depender de ese detalle.
      priceId =
        typeof product.default_price === 'string'
          ? product.default_price
          : product.default_price?.id || null;

      if (!priceId) {
        return json(
          { error: `El producto del plan ${planRow.label} no tiene precio predeterminado en Stripe.` },
          400
        );
      }
    }

    if (!priceId) {
      return json(
        { error: `El plan ${planRow.label} no tiene precio configurado en Stripe todavía.` },
        400
      );
    }

    /*
      ══ Cambiar de plan no es comprar ═══════════════════════════════════════

      Si el equipo ya tiene una suscripción viva, esto NO puede abrir la pasarela.
      Una sesión de pago en modo suscripción crea siempre una suscripción NUEVA y
      cobra el primer periodo entero: el equipo se queda con dos —pagando las
      dos— y a quien sube de plan se le cobra el mes completo sin descontarle lo
      que ya había pagado del anterior.

      No es una hipótesis: pasó el 24 de agosto de 2026 con un cliente real, que
      acabó con la Solo de 39 € y la Pro de 79 € activas a la vez. El prorrateo
      que estaba configurado en el panel de Stripe nunca llegó a aplicarse porque
      gobierna los CAMBIOS de suscripción, y allí no había ninguno: había una
      compra.

      El prorrateo solo existe al modificar la suscripción que ya está viva, que
      es lo que se hace aquí.
    */
    if (subscription?.stripe_subscription_id) {
      const viva = await stripeGet(
        `subscriptions/${subscription.stripe_subscription_id}`,
        key
      );
      const linea = viva?.items?.data?.[0];

      /*
        Se mira el estado que dice Stripe, no el de nuestra columna: si la
        suscripción se canceló a mano desde el panel, la fila puede seguir con su
        identificador puesto un buen rato. Cuando ya no hay nada que modificar
        —cancelada, o borrada— se sigue hacia la pasarela, que para ese caso es lo
        correcto: no hay cambio, hay contratación.
      */
      if (linea && MODIFICABLE.has(viva.status)) {
        if (linea.price?.id === priceId) {
          return json({ error: `Ya tienes contratado el plan ${planRow.label}.` }, 400);
        }

        /*
          Hacia dónde se mueve, que es lo que decide quién paga y cuándo:

            · Subir → `always_invoice`. Se factura la diferencia AHORA, ya
              descontado lo que le queda sin consumir del plan viejo. Es lo que
              el usuario espera de un «pasar a Pro»: lo tiene al momento.

            · Bajar → `create_prorations`. El saldo a favor se queda en su cuenta
              y se le descuenta de la siguiente factura. Facturar al instante una
              bajada emitiría una factura negativa, que no es una devolución y sí
              un documento que luego hay que explicar.

          El orden es el de la escala (`sort`), el mismo que la pantalla usa para
          decir «tu siguiente paso». Si el plan actual no tiene fila —uno retirado—
          se trata como subida, que es lo que acaba de pulsar quien está delante.
        */
        const { data: escalones } = await service
          .from('plan_limits')
          .select('plan, sort')
          .in('plan', [planRow.plan, subscription.plan]);

        const sortDe = (nombre: string) =>
          escalones?.find((fila) => fila.plan === nombre)?.sort ?? null;

        const sortActual = sortDe(subscription.plan);
        const sortNuevo = sortDe(planRow.plan);
        const baja = sortActual !== null && sortNuevo !== null && sortNuevo < sortActual;

        await stripe(`subscriptions/${viva.id}`, key, {
          'items[0][id]': linea.id,
          'items[0][price]': priceId,
          'items[0][quantity]': '1',
          proration_behavior: baja ? 'create_prorations' : 'always_invoice',

          /*
            Y los metadatos, en la MISMA llamada. Es la mitad que se olvida: el
            webhook escribe el plan leyendo `metadata.plan` de la suscripción, así
            que cambiar el precio sin cambiar el metadato deja a alguien pagando
            Pro con el tope de Solo en cuanto le llegue la renovación. La 0061 ya
            documenta ese pisotón y por qué hubo que arreglarlo a mano en Stripe;
            aquí no puede volver a separarse, porque va en la misma petición.
          */
          'metadata[team_id]': membership.team_id,
          'metadata[plan]': planRow.plan,

          'automatic_tax[enabled]': 'true',
        });

        /*
          El cobro de la diferencia se intenta fuera de sesión, con la tarjeta que
          ya está guardada. Si el banco pide autenticación, la factura queda
          pendiente y llega `invoice.payment_failed`: la fila pasa a `past_due`,
          la pantalla lo dice y Stripe le manda al cliente el enlace para
          autenticarse. Es lo que la 0027 ya decidió que pasara en un impago —se
          puede seguir trabajando, no se puede dar de alta a nadie nuevo— y por
          eso aquí no hace falta una pantalla de confirmación propia.

          Sin URL a la que ir: el cambio ya está hecho. Quien escribe el plan en la
          fila sigue siendo el webhook, con el `customer.subscription.updated` que
          Stripe manda a continuación.
        */
        return json({ ok: true, cambiado: true, baja });
      }
    }

    const form: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/ajustes/plan?pago=ok`,
      cancel_url: `${appUrl}/ajustes/plan?pago=cancelado`,

      /*
        El equipo viaja en los metadatos y vuelve en el evento. Es lo que permite
        que el webhook sepa a qué fila aplicar el cobro: Stripe no conoce nuestros
        equipos, y emparejar por email fallaría en cuanto alguien pague con una
        dirección distinta de la de su cuenta.
      */
      'metadata[team_id]': membership.team_id,
      'metadata[plan]': planRow.plan,
      'subscription_data[metadata][team_id]': membership.team_id,
      'subscription_data[metadata][plan]': planRow.plan,

      // Que la factura salga con el IVA que toca según el país, sin mantener aquí
      // una tabla de tipos impositivos.
      'automatic_tax[enabled]': 'true',
    };

    /*
      Si el equipo ya es cliente de Stripe se reutiliza. Crear uno nuevo en cada
      contratación deja al mismo negocio repartido en varias fichas, y entonces el
      portal enseña solo la mitad de sus facturas.
    */
    if (subscription?.stripe_customer_id) {
      form.customer = subscription.stripe_customer_id;
      form['customer_update[address]'] = 'auto';
    } else {
      form.customer_email = user.email || '';
    }

    const session = await stripe('checkout/sessions', key, form);

    return json({ ok: true, url: session.url });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado.' }, 400);
  }
});
