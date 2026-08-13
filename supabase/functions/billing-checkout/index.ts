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

    const { action, plan: planName } = await request.json();

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
      .select('stripe_customer_id, stripe_subscription_id')
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

    const { data: planRow } = await service
      .from('plan_limits')
      .select('plan, label, stripe_price_id, purchasable')
      .eq('plan', planName)
      .maybeSingle();

    if (!planRow?.purchasable) return json({ error: 'Ese plan no se puede contratar.' }, 400);
    if (!planRow.stripe_price_id) {
      return json(
        { error: `El plan ${planRow.label} no tiene precio configurado en Stripe todavía.` },
        400
      );
    }

    const form: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price]': planRow.stripe_price_id,
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
