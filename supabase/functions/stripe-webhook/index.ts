/**
 * Webhook de Stripe: los avisos llegan solos.
 *
 * ── Por qué existe además de la sincronización ──────────────────────────────
 * «Sincronizar» hay que acordarse de pulsarlo, y el dato que más importa —la tarjeta
 * rechazada— caduca rápido: enterarte cinco días tarde de que a un cliente le falló
 * el cobro es enterarte cuando ya se ha ido. Aquí Stripe avisa en el momento.
 *
 * ── La verificación de firma NO es opcional ──────────────────────────────────
 * Este endpoint es público: cualquiera puede llamarlo. Sin comprobar la firma
 * bastaría con enviarle un JSON inventado para marcar a un cliente como pagado, o
 * como dado de baja. Stripe firma cada evento con HMAC-SHA256 sobre
 * `timestamp.cuerpo` usando un secreto que solo conocen Stripe y el servidor.
 *
 * Tres cosas que hay que hacer bien o la verificación no sirve:
 *   1. Firmar sobre el cuerpo EN CRUDO, no sobre el JSON reserializado: cualquier
 *      diferencia de espacios o de orden de claves cambia el hash.
 *   2. Comparar en tiempo constante, para no filtrar información por lo que tarda
 *      la comparación.
 *   3. Rechazar los eventos viejos, o una petición legítima capturada podría
 *      reenviarse indefinidamente.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Ventana de tolerancia. Cinco minutos es lo que recomienda Stripe. */
const MAX_AGE_SECONDS = 300;

const text = (body: string, status = 200) => new Response(body, { status });

/** Comparación en tiempo constante: no debe delatar cuántos bytes coinciden. */
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Verifica la cabecera `Stripe-Signature`, con formato:
 *   t=1700000000,v1=abc123…,v1=def456…
 *
 * Puede traer varias `v1` durante una rotación de secreto: vale que coincida
 * cualquiera.
 */
async function verifySignature(payload: string, header: string, secret: string): Promise<string | null> {
  const parts = Object.create(null) as Record<string, string[]>;
  for (const piece of header.split(',')) {
    const [key, value] = piece.split('=', 2);
    if (!key || !value) continue;
    (parts[key.trim()] ||= []).push(value.trim());
  }

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return 'Cabecera de firma mal formada.';

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) {
    return 'El evento es demasiado antiguo.';
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  const expected = toHex(mac);

  return signatures.some((signature) => safeEqual(signature, expected))
    ? null
    : 'La firma no coincide.';
}

const isoDate = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;

/** Estados que cuentan como «al día». */
const PAID_STATES = new Set(['active', 'trialing']);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return text('Usa POST.', 405);

  // El id de la integración viaja en la URL: es lo que permite que varios
  // entrenadores con su propio Stripe apunten a la misma función. No es un secreto
  // —la firma es lo que autentica— pero dice de quién es el evento.
  const integrationId = new URL(request.url).searchParams.get('integration');
  if (!integrationId) return text('Falta el parámetro integration.', 400);

  const signature = request.headers.get('Stripe-Signature');
  if (!signature) return text('Falta la firma.', 400);

  // EN CRUDO. Reserializar el JSON cambiaría el hash y la firma nunca cuadraría.
  const payload = await request.text();

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: secret } = await service
    .from('integration_secrets')
    .select('webhook_secret')
    .eq('integration_id', integrationId)
    .maybeSingle();

  if (!secret?.webhook_secret) return text('Esta integración no tiene webhook configurado.', 400);

  const problem = await verifySignature(payload, signature, secret.webhook_secret);
  // 400 y no 401: para Stripe, cualquier no-2xx es un fallo que reintenta. Lo
  // importante es no procesar nada.
  if (problem) return text(problem, 400);

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return text('Cuerpo no válido.', 400);
  }

  try {
    const object = event.data?.object || {};
    let subscriptionId: string | null = null;
    const patch: Record<string, unknown> = { synced_at: new Date().toISOString() };

    switch (event.type) {
      /*
        El cobro ha fallado. Es el evento que justifica todo esto: se marca la
        suscripción como impagada sin esperar a que nadie sincronice.
      */
      case 'invoice.payment_failed': {
        subscriptionId =
          typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
        patch.payment_failed = true;
        patch.is_paid = false;
        patch.subscription_status = 'past_due';
        patch.status = 'past_due';
        break;
      }

      // Un cobro correcto después de uno fallido: hay que LIMPIAR la marca, o el
      // cliente se queda como moroso para siempre.
      case 'invoice.payment_succeeded': {
        subscriptionId =
          typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
        patch.payment_failed = false;
        patch.is_paid = true;
        patch.subscription_status = 'active';
        patch.status = 'active';
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        subscriptionId = object.id;
        const status = object.status || (event.type.endsWith('deleted') ? 'canceled' : null);
        patch.subscription_status = status;
        patch.status = status;
        patch.is_paid = PAID_STATES.has(status);
        patch.payment_failed = status === 'past_due' || status === 'unpaid';
        patch.period_end = isoDate(object.current_period_end);
        patch.canceled_at = object.canceled_at
          ? new Date(object.canceled_at * 1000).toISOString()
          : null;
        break;
      }

      default:
        // Un 200 a lo que no interesa: devolver error haría que Stripe reintentara
        // eventos que nunca vamos a procesar, y acabaría desactivando el endpoint.
        return text('ok (evento ignorado)', 200);
    }

    if (!subscriptionId) return text('ok (sin suscripción)', 200);

    /*
      Solo se ACTUALIZA lo que ya existe; no se crea.
      ----------------------------------------------------------------------
      Una suscripción que no está en la tabla es de alguien que nunca se ha
      sincronizado, y sin haber conciliado no se sabe a qué cliente pertenece.
      Insertarla sin `client_id` no aportaría nada y ensuciaría el histórico: el
      primer «Sincronizar» la traerá con su emparejamiento.
    */
    const { data: rows, error } = await service
      .from('client_payments')
      .update(patch)
      .eq('integration_id', integrationId)
      .eq('subscription_id', subscriptionId)
      .select('client_id, is_paid, period_end');

    if (error) return text(`No se pudo guardar: ${error.message}`, 500);

    // El estado del cliente, si la suscripción ya estaba conciliada.
    for (const row of rows || []) {
      if (!row.client_id) continue;
      await service
        .from('clients')
        .update({
          payment_status: row.is_paid ? 'paid' : 'pending',
          ...(row.period_end ? { next_payment_date: row.period_end } : {}),
        })
        .eq('id', row.client_id);
    }

    // Contador de eventos: sin esto, un webhook mal configurado es indistinguible
    // de uno que funciona y todavía no ha recibido nada.
    const { data: current } = await service
      .from('integrations')
      .select('event_count')
      .eq('id', integrationId)
      .maybeSingle();

    await service
      .from('integrations')
      .update({
        last_event_at: new Date().toISOString(),
        event_count: (current?.event_count || 0) + 1,
      })
      .eq('id', integrationId);

    return text('ok', 200);
  } catch (e) {
    // 500 para que Stripe reintente: un fallo nuestro no debe perder el evento.
    return text(e instanceof Error ? e.message : 'Error inesperado.', 500);
  }
});
