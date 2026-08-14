/**
 * Avisa por correo de que hay un ticket de soporte esperando.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 *
 * La pantalla de Ayuda (migración 0034) guarda los tickets, pero no le dice a
 * nadie que han llegado: hay que entrar a mirar la bandeja. Eso aguanta con tres
 * entrenadores y se rompe con treinta — y sobre todo, un ticket sin contestar
 * durante dos días es un entrenador que ya ha decidido que esto no tiene soporte.
 *
 * ══ Por qué funciona sin dominio propio ════════════════════════════════════
 *
 * Resend deja enviar desde `onboarding@resend.dev` sin verificar ningún dominio,
 * con una limitación: **solo entrega a la dirección con la que te registraste**.
 *
 * Para cualquier otro correo del producto —invitaciones, restablecer contraseña—
 * eso lo hace inservible. Para este, es exactamente lo que hace falta: el único
 * destinatario es quien atiende la plataforma. Así que este aviso se puede tener
 * hoy, y el resto del correo sigue esperando al dominio.
 *
 * Cuando lo haya, se cambia `FROM` y `SUPPORT_EMAIL` y esta función no se toca.
 *
 * ══ Quién puede llamarla ═══════════════════════════════════════════════════
 *
 * Cualquiera con sesión, pero **solo para avisar de un ticket que es suyo**. El
 * identificador del ticket llega del navegador y no se cree: la función lo lee
 * con el token de quien llama, así que RLS decide. Si el ticket no es suyo, la
 * consulta no devuelve nada y no se manda ningún correo.
 *
 * Es lo que impide que sirva como cañón de correo: no acepta destinatario ni
 * texto libre, solo el identificador de una fila que el remitente ya podía leer.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
 * Escapa lo que va dentro del HTML del correo.
 *
 * Sirve para las dos salidas: Telegram en modo `HTML` usa el mismo escapado, y
 * es obligatorio en los dos sitios porque el texto lo escribe un usuario. Un
 * asunto con un `<` sin escapar rompe el mensaje de Telegram entero (responde
 * 400 y no llega nada) además de ser una inyección en el correo.
 */
const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Manda el aviso por Telegram.
 *
 * ── Por qué merece la pena además del correo ────────────────────────────────
 * El correo llega a un buzón que se mira cuando se mira; esto llega al bolsillo
 * al momento. Para «ha entrado algo» es lo que de verdad cambia el tiempo de
 * respuesta, que es la única métrica que importa en soporte.
 *
 * Y no depende de tener dominio: un bot y un identificador de conversación, sin
 * verificar nada. Es la única notificación externa que se puede tener hoy sin
 * comprar nada.
 *
 * `disable_web_page_preview` porque si el ticket menciona una URL, Telegram
 * intentaría cargar su vista previa y el aviso pasaría de dos líneas a media
 * pantalla de otra cosa.
 */
async function telegram(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chat = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chat) return { sent: false, reason: 'sin configurar' };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      text,
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: (await response.text()).slice(0, 200) };
  }
  return { sent: true };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const destino = Deno.env.get('SUPPORT_EMAIL');
  const hayCorreo = Boolean(resendKey && destino);
  const hayTelegram = Boolean(
    Deno.env.get('TELEGRAM_BOT_TOKEN') && Deno.env.get('TELEGRAM_CHAT_ID')
  );

  /*
    Sin ningún canal configurado esto NO es un error del usuario: el ticket ya
    está guardado y se puede leer en la bandeja —y el contador de Ajustes › Ayuda
    lo señala—. Se responde 200 con `sent: false` para que la aplicación no
    enseñe un fallo por algo que, desde su punto de vista, no ha fallado.

    Los dos canales son independientes: se puede tener solo Telegram, solo
    correo, o los dos. Cada uno se enciende poniendo sus secretos.
  */
  if (!hayCorreo && !hayTelegram) {
    return json({ sent: false, reason: 'Ningún aviso configurado.' });
  }

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Falta la sesión.' }, 401);

  try {
    const { ticketId } = await request.json();
    if (!ticketId) return json({ error: 'Falta el ticket.' }, 400);

    /*
      El cliente se crea CON EL TOKEN DE QUIEN LLAMA, no con la `service_role`.

      Es la decisión de seguridad de este archivo: así la lectura pasa por RLS y
      un usuario solo puede provocar el aviso de un ticket suyo. Con la clave de
      servicio, mandar el identificador de otro ticket funcionaría, y el correo
      —que incluye el texto— acabaría en un buzón que no le corresponde.
    */
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } }
    );

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('id, subject, status, context, created_at, profiles(full_name, email)')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) return json({ error: 'Ticket no encontrado.' }, 404);

    const { data: mensajes } = await supabase
      .from('support_messages')
      .select('body, from_support, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at')
      .limit(1);

    const primero = mensajes?.[0]?.body || '';
    const autor = ticket.profiles?.full_name || ticket.profiles?.email || 'Un entrenador';
    const contexto = Object.entries(ticket.context || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');

    /*
      Los dos canales se lanzan A LA VEZ y ninguno espera al otro.

      En serie, un Resend lento retrasaría el aviso de Telegram —que es el que
      llega al bolsillo y por tanto el que importa—, y un Resend caído se lo
      cargaría entero si además cortara el flujo. `allSettled` en vez de `all`
      justamente por eso: que falle uno no cancela al otro.
    */
    const [correo, tg] = await Promise.allSettled([
      hayCorreo
        ? fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: Deno.env.get('SUPPORT_FROM') || 'Caveman Hub <onboarding@resend.dev>',
              to: [destino],
              // El asunto lleva el del ticket para poder buscarlo en el buzón, y
              // el prefijo para poder filtrarlo con una regla.
              subject: `[Soporte] ${ticket.subject}`,
              // Contestar desde el buzón llega a la persona, aunque la respuesta
              // buena sea la del hilo de la aplicación.
              reply_to: ticket.profiles?.email || undefined,
              html: `
                <p><strong>${esc(autor)}</strong> ha abierto un ticket.</p>
                <p><strong>${esc(ticket.subject)}</strong></p>
                <p style="white-space:pre-wrap">${esc(primero)}</p>
                ${contexto ? `<p style="color:#666;font-size:12px">${esc(contexto)}</p>` : ''}
                <p style="color:#666;font-size:12px">
                  Contesta desde Ajustes › Ayuda. Este correo es solo el aviso.
                </p>
              `,
            }),
          }).then(async (r) => (r.ok ? { sent: true } : { sent: false, reason: (await r.text()).slice(0, 200) }))
        : Promise.resolve({ sent: false, reason: 'sin configurar' }),

      hayTelegram
        ? telegram(
            /*
              Corto a propósito: en el móvil el aviso se lee en la pantalla de
              bloqueo, y ahí solo caben unas líneas. Lo que hace falta saber es
              quién y de qué; el texto completo está en la aplicación.

              Se recorta el mensaje a 400 caracteres por lo mismo, y porque
              Telegram corta a 4096 y ahí ya no se lee nada.
            */
            `🛟 <b>${esc(ticket.subject)}</b>\n` +
              `<i>${esc(autor)}</i>\n\n` +
              `${esc(primero.slice(0, 400))}${primero.length > 400 ? '…' : ''}\n\n` +
              `Contesta en Ajustes › Ayuda.`
          )
        : Promise.resolve({ sent: false, reason: 'sin configurar' }),
    ]);

    const resultado = (r: PromiseSettledResult<{ sent: boolean; reason?: string }>) =>
      r.status === 'fulfilled' ? r.value : { sent: false, reason: String(r.reason).slice(0, 200) };

    const email = resultado(correo);
    const chat = resultado(tg);

    /*
      Siempre 200, aunque no haya salido ninguno: el ticket existe y el fallo es
      del aviso, no del alta. La aplicación no debe enseñar «no se ha podido
      crear el ticket» porque Telegram estuviera caído.

      El detalle va en el cuerpo para poder mirarlo en los registros de la
      función cuando algo no llegue.
    */
    return json({ sent: email.sent || chat.sent, email, telegram: chat });
  } catch (error) {
    return json({ sent: false, reason: String(error).slice(0, 200) });
  }
});
