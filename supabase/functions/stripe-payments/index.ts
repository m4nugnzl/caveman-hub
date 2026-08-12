/**
 * Estado de pago de los clientes, leído de Stripe.
 *
 * ── Qué aporta sobre Notion ─────────────────────────────────────────────────
 * Notion es un espejo de una tabla que el entrenador mantiene a mano: si no apunta
 * un cobro, la aplicación no lo sabe. Aquí el estado viene de quien cobra, y trae
 * tres cosas que no existen en una hoja escrita a mano: la tarjeta rechazada el día
 * que se rechaza, la baja en cuanto se pide, y la fecha real de la próxima
 * renovación calculada por la suscripción.
 *
 * ── Por qué el emparejamiento casi nunca pregunta ───────────────────────────
 * Stripe identifica a cada cliente por EMAIL. El email es exacto: o coincide o no,
 * sin acentos, sin apellidos invertidos y sin apodos. Con Notion había que conciliar
 * catorce nombres a mano; aquí solo se pregunta por quien no tenga email en su
 * ficha o lo tenga distinto.
 *
 * ── Se lee la SUSCRIPCIÓN, no la factura ────────────────────────────────────
 * Una factura dice «se cobró». La suscripción dice «está activa, renueva el día X y
 * el último intento falló», que es lo que permite saber con quién hay que hablar
 * hoy. Se recorren las suscripciones y se completan con su cliente.
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
 * Clave de conciliación de un email: minúsculas y sin espacios.
 *
 * No se normaliza más que eso a propósito. Quitar los puntos de la parte local
 * («j.perez@» = «jperez@») es cierto en Gmail y falso en otros proveedores, así que
 * hacerlo emparejaría cuentas distintas de dos personas distintas.
 */
const emailKey = (value: string): string => String(value || '').trim().toLowerCase();

/** Estados de suscripción que cuentan como «al día». */
const PAID_STATES = new Set(['active', 'trialing']);

/** Llama a Stripe paginando. La API devuelve 100 por página como máximo. */
async function stripeList(key: string, path: string, params: Record<string, string> = {}) {
  const items: any[] = [];
  let startingAfter: string | undefined;

  do {
    const query = new URLSearchParams({ limit: '100', ...params });
    if (startingAfter) query.set('starting_after', startingAfter);

    const response = await fetch(`${STRIPE_API}/${path}?${query}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 401) {
        throw new Error('Stripe rechaza la clave. Comprueba que la has copiado entera.');
      }
      if (response.status === 403) {
        throw new Error(
          'La clave no tiene permiso de lectura sobre suscripciones o clientes. Si es una clave restringida, dale acceso de lectura a Customers y Subscriptions.'
        );
      }
      throw new Error(`Stripe respondió ${response.status}: ${detail.slice(0, 300)}`);
    }

    const page = await response.json();
    items.push(...(page.data || []));
    startingAfter = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (startingAfter);

  return items;
}

const isoDate = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Dos clientes: uno con el JWT del usuario, que pasa por RLS y decide si la
  // integración es suya; otro con service_role, el único que lee el secreto.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const asService = createClient(url, service);

  let integrationId: string | undefined;

  try {
    const body = await request.json();
    integrationId = body.integrationId;
    const action = body.action || 'test';
    if (!integrationId) return json({ error: 'Falta integrationId.' }, 400);

    const { data: integration, error: readError } = await asUser
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (readError || !integration) {
      return json({ error: 'Esa integración no existe o no es tuya.' }, 403);
    }

    const { data: secret } = await asService
      .from('integration_secrets')
      .select('token')
      .eq('integration_id', integrationId)
      .maybeSingle();

    if (!secret?.token) return json({ error: 'Esta integración no tiene clave guardada.' }, 400);
    const key = secret.token;

    // ── test: comprobar la clave sin escribir nada ──────────────────────────
    if (action === 'test') {
      const customers = await stripeList(key, 'customers', { limit: '1' });
      await asService
        .from('integrations')
        .update({ status: 'ok', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', integrationId);
      return json({ ok: true, reachable: true, sample: customers.length });
    }

    // ── preview y sync ──────────────────────────────────────────────────────
    // `status: all` incluye las canceladas y las impagadas: son justo las que
    // interesan. Pidiendo solo las activas se pierde a quien se ha dado de baja.
    const subscriptions = await stripeList(key, 'subscriptions', { status: 'all' });
    const customers = await stripeList(key, 'customers');
    const customerById = new Map(customers.map((c: any) => [c.id, c]));

    const { data: clients } = await asService
      .from('clients')
      .select('id, name, email')
      .eq('coach_id', integration.owner_id);

    const { data: refs } = await asService
      .from('client_external_refs')
      .select('external_key, client_id')
      .eq('integration_id', integrationId);

    const byRef = new Map((refs || []).map((r) => [r.external_key, r.client_id]));
    const byEmail = new Map(
      (clients || []).filter((c) => c.email).map((c) => [emailKey(c.email), c.id])
    );

    const payments = subscriptions.map((sub: any) => {
      const customer = customerById.get(
        typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
      );
      const email = emailKey(customer?.email);
      const label = customer?.name || customer?.email || sub.customer;

      const active = PAID_STATES.has(sub.status);
      const failed = sub.status === 'past_due' || sub.status === 'unpaid';

      return {
        integration_id: integrationId,
        // La suscripción es la unidad: `unique(integration_id, external_id)` hace
        // que volver a sincronizar actualice en lugar de duplicar.
        external_id: sub.id,
        client_id: byRef.get(email) ?? byEmail.get(email) ?? null,
        external_label: label,
        amount: sub.items?.data?.[0]?.price?.unit_amount
          ? sub.items.data[0].price.unit_amount / 100
          : null,
        currency: (sub.currency || 'eur').toUpperCase(),
        paid_on: isoDate(sub.current_period_start),
        period_end: isoDate(sub.current_period_end),
        status: sub.status,
        is_paid: active,
        subscription_status: sub.status,
        subscription_id: sub.id,
        canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        payment_failed: failed,
        raw: { email: customer?.email || null, last_edited: new Date().toISOString() },
        synced_at: new Date().toISOString(),
      };
    });

    // Sin email no hay forma fiable de emparejar: se pide a mano, como con Notion.
    const unmatched = [
      ...new Set(payments.filter((p) => !p.client_id && p.external_label).map((p) => p.external_label)),
    ];

    if (action === 'preview') {
      return json({
        ok: true,
        total: payments.length,
        matched: payments.filter((p) => p.client_id).length,
        unmatched,
        failing: payments.filter((p) => p.payment_failed).length,
        canceled: payments.filter((p) => p.subscription_status === 'canceled').length,
        sample: payments.slice(0, 8),
      });
    }

    const { error: writeError } = await asService
      .from('client_payments')
      .upsert(payments, { onConflict: 'integration_id,external_id' });

    if (writeError) throw new Error(`No se pudieron guardar los pagos: ${writeError.message}`);

    /*
      Estado por cliente: se toma la suscripción más reciente de cada uno.
      No se toca a los clientes sin suscripción conciliada: marcar a alguien como
      pendiente porque su email no cuadra en Stripe sería peor que no decir nada.
    */
    const latest = new Map<string, (typeof payments)[number]>();
    for (const payment of payments) {
      if (!payment.client_id) continue;
      const current = latest.get(payment.client_id);
      if (!current || (payment.period_end || '') > (current.period_end || '')) {
        latest.set(payment.client_id, payment);
      }
    }

    let updated = 0;
    for (const [clientId, payment] of latest) {
      const { error } = await asService
        .from('clients')
        .update({
          payment_status: payment.is_paid ? 'paid' : 'pending',
          ...(payment.period_end ? { next_payment_date: payment.period_end } : {}),
        })
        .eq('id', clientId);
      if (!error) updated += 1;
    }

    await asService
      .from('integrations')
      .update({
        status: 'ok',
        last_error: null,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    return json({
      ok: true,
      total: payments.length,
      matched: payments.filter((p) => p.client_id).length,
      clientsUpdated: updated,
      failing: payments.filter((p) => p.payment_failed).length,
      canceled: payments.filter((p) => p.subscription_status === 'canceled').length,
      unmatched,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error inesperado.';
    if (integrationId) {
      await asService
        .from('integrations')
        .update({ status: 'error', last_error: message })
        .eq('id', integrationId);
    }
    return json({ error: message }, 400);
  }
});
