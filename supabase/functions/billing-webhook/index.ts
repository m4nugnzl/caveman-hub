/**
 * Webhook de facturación: lo que decide qué plan tiene cada equipo.
 *
 * ══ Por qué el estado se escribe SOLO aquí ═════════════════════════════════
 *
 * `team_subscriptions` no tiene políticas de escritura: ni el dueño de un equipo
 * puede tocar su propia fila desde el navegador. La única entrada es esta
 * función, con la `service_role key`, y solo después de que Stripe confirme.
 *
 * Es la diferencia entre «he pulsado contratar» y «he pagado». Si el plan se
 * activara al abrir la pasarela, bastaría con abrirla y cerrar la pestaña.
 *
 * ══ La verificación de firma no es opcional ════════════════════════════════
 *
 * Este endpoint es público. Sin comprobar la firma, cualquiera podría enviar un
 * JSON inventado y regalarse el plan Equipo. Stripe firma cada evento con
 * HMAC-SHA256 sobre `timestamp.cuerpo`, y hay tres cosas que hay que hacer bien o
 * la comprobación no sirve de nada:
 *
 *   1. Firmar sobre el cuerpo EN CRUDO. Reserializar el JSON cambia el hash.
 *   2. Comparar en tiempo constante, para no filtrar por lo que tarda.
 *   3. Rechazar los eventos viejos, o una petición legítima capturada valdría
 *      para siempre.
 *
 * Es la misma comprobación que `stripe-webhook`, que es de otra cosa —la
 * conciliación de los cobros DEL ENTRENADOR a sus clientes— y no comparte con
 * esta ni la cuenta de Stripe ni la clave. Se repite el código a propósito: dos
 * funciones de Deno no comparten módulos sin un paso de empaquetado, y tener el
 * secreto de una al alcance de la otra sería peor que repetir cuarenta líneas.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Cinco minutos, que es lo que recomienda Stripe. */
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

async function verifySignature(
  payload: string,
  header: string,
  secret: string
): Promise<string | null> {
  const parts = Object.create(null) as Record<string, string[]>;
  for (const piece of header.split(',')) {
    const [key, value] = piece.split('=', 2);
    if (!key || !value) continue;
    (parts[key.trim()] ||= []).push(value.trim());
  }

  const timestamp = parts.t?.[0];
  // Puede venir más de una `v1` durante una rotación de secreto: vale cualquiera.
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return 'Cabecera de firma mal formada.';

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return 'El evento es demasiado antiguo.';

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

const isoTime = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

/**
 * Cuándo renueva una suscripción.
 *
 * ── Por qué se mira en dos sitios ───────────────────────────────────────────
 * Stripe movió `current_period_end` del objeto suscripción a sus LÍNEAS: en las
 * versiones de API antiguas está arriba, en las nuevas está en cada `item`. Y la
 * versión que se aplica no la decide este código: la elige quien da de alta el
 * destino de eventos en el panel, y puede cambiar el día que se actualice.
 *
 * Leer los dos sitios cuesta una línea y evita el fallo silencioso: la
 * suscripción se activaría igual y la fecha de renovación quedaría en blanco, que
 * es de esas cosas que no se notan hasta que alguien pregunta cuándo se le cobra.
 */
const periodEnd = (subscription: any): string | null =>
  isoTime(subscription?.current_period_end) ||
  isoTime(subscription?.items?.data?.[0]?.current_period_end);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return text('Usa POST.', 405);

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) return text('Falta STRIPE_WEBHOOK_SECRET.', 500);

  const signature = request.headers.get('Stripe-Signature');
  if (!signature) return text('Falta la firma.', 400);

  // EN CRUDO: reserializar cambiaría el hash y la firma no cuadraría nunca.
  const payload = await request.text();

  const problem = await verifySignature(payload, signature, secret);
  // 400 y no 401: para Stripe cualquier no-2xx es un fallo que reintenta. Lo
  // importante es no procesar nada.
  if (problem) return text(problem, 400);

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return text('Cuerpo no válido.', 400);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const object = event.data?.object || {};
    let teamId: string | null = object.metadata?.team_id || null;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    switch (event.type) {
      /*
        El pago ha salido bien. Es el evento que activa el plan.

        La sesión de pago no trae ni el estado ni la fecha de renovación, así que
        se le piden a Stripe. Podría esperarse al `customer.subscription.updated`
        que llega justo después, pero entonces habría un hueco de segundos en el
        que el usuario vuelve a la aplicación y todavía ve su plan viejo —y lo
        primero que hace es recargar y dudar de si ha pagado—.
      */
      case 'checkout.session.completed': {
        patch.stripe_customer_id = object.customer;
        patch.stripe_subscription_id = object.subscription;
        patch.plan = object.metadata?.plan;
        patch.status = 'active';

        if (stripeKey && object.subscription) {
          const response = await fetch(
            `https://api.stripe.com/v1/subscriptions/${object.subscription}`,
            { headers: { Authorization: `Bearer ${stripeKey}` } }
          );
          if (response.ok) {
            const sub = await response.json();
            patch.status = sub.status || 'active';
            patch.current_period_end = periodEnd(sub);
          }
        }
        break;
      }

      /*
        Cambio de estado o de plan: renovación, cancelación programada, subida o
        bajada de plan desde el portal. `status` viene de Stripe tal cual, que es
        justo por lo que la columna usa su vocabulario.
      */
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        teamId = object.metadata?.team_id || null;
        patch.stripe_subscription_id = object.id;
        patch.status = event.type.endsWith('deleted') ? 'canceled' : object.status;
        patch.current_period_end = periodEnd(object);

        /*
          Al cancelar se vuelve a `prueba`, no se deja el plan de pago puesto: si
          se quedara, un equipo dado de baja seguiría con el límite del plan que ya
          no paga. Y no se le echa —sus datos siguen ahí—, simplemente deja de
          poder crecer.
        */
        if (event.type.endsWith('deleted')) patch.plan = 'prueba';
        else if (object.metadata?.plan) patch.plan = object.metadata.plan;
        break;
      }

      // La tarjeta ha fallado. Es el aviso más accionable que existe aquí.
      case 'invoice.payment_failed': {
        patch.status = 'past_due';
        break;
      }

      // Y el que LIMPIA lo anterior. Sin él, quien arregla su tarjeta se queda
      // como moroso hasta que alguien lo toque a mano.
      case 'invoice.payment_succeeded': {
        patch.status = 'active';
        patch.current_period_end = isoTime(object.lines?.data?.[0]?.period?.end);
        break;
      }

      default:
        // 200 a lo que no interesa: devolver error haría que Stripe reintentara
        // eventos que nunca vamos a procesar, y acabaría desactivando el endpoint.
        return text('ok (evento ignorado)', 200);
    }

    /*
      Localizar el equipo. Por metadatos cuando vienen —es lo normal— y si no, por
      la suscripción o el cliente de Stripe, que es el caso de las facturas: un
      `invoice.payment_failed` no lleva nuestros metadatos.
    */
    /*
      ¿Sigue siendo esta la suscripción del equipo?

      Un equipo puede tener más de una en Stripe: una vieja que quedó sin cancelar
      cuando subió de plan, una cancelada a mano desde el panel. Todas llevan los
      mismos metadatos —el `team_id` se grabó el día que se contrataron—, así que
      sin esta comprobación la baja de una suscripción MUERTA deja en `prueba`, y
      con ello en solo lectura, a un equipo que está pagando otra. Y su renovación
      le devuelve el plan viejo con sus límites viejos.

      Estuvo a punto de pasar el 24 de agosto de 2026 al cancelar la suscripción
      duplicada de un cliente que ya había pagado la nueva.

      `checkout.session.completed` se queda fuera a propósito: es justo el evento
      que INSTALA una suscripción distinta de la que hay guardada, así que
      compararlo con la vieja lo descartaría siempre.
    */
    const subId: string | null =
      event.type === 'checkout.session.completed'
        ? null
        : event.type.startsWith('customer.subscription.')
          ? object.id || null
          : typeof object.subscription === 'string'
            ? object.subscription
            : null;

    if (subId && (teamId || object.customer)) {
      const { data: fila } = await service
        .from('team_subscriptions')
        .select('stripe_subscription_id')
        .eq(teamId ? 'team_id' : 'stripe_customer_id', teamId || object.customer)
        .maybeSingle();

      /*
        Solo se descarta cuando la fila tiene una suscripción DISTINTA. Con la
        columna vacía se deja pasar: es el equipo que todavía no ha terminado de
        estrenar la suya, y ahí el evento es el bueno.
      */
      if (fila?.stripe_subscription_id && fila.stripe_subscription_id !== subId) {
        console.log('Evento de una suscripción que ya no es la del equipo:', event.type, subId);
        return text('ok (suscripción antigua)', 200);
      }
    }

    let query = service.from('team_subscriptions').update(patch);

    if (teamId) {
      query = query.eq('team_id', teamId);
    } else if (object.subscription || object.id?.startsWith?.('sub_')) {
      query = query.eq('stripe_subscription_id', object.subscription || object.id);
    } else if (object.customer) {
      query = query.eq('stripe_customer_id', object.customer);
    } else {
      return text('ok (sin equipo identificable)', 200);
    }

    const { data: rows, error } = await query.select('team_id');
    // 500 para que Stripe reintente: un fallo nuestro no debe perder un cobro.
    if (error) return text(`No se pudo guardar: ${error.message}`, 500);

    if (!rows || rows.length === 0) {
      /*
        Ninguna fila. Pasa si el equipo se borró entre el pago y el evento. Se
        responde 200 —reintentar no lo va a arreglar— pero se deja registrado: un
        cobro sin destino es algo que alguien tiene que mirar.
      */
      console.error('Evento sin equipo destino:', event.type, event.id);
      return text('ok (sin destino)', 200);
    }

    return text('ok', 200);
  } catch (e) {
    return text(e instanceof Error ? e.message : 'Error inesperado.', 500);
  }
});
