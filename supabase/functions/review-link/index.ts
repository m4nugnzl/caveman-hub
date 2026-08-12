/**
 * Canjea el token de una revisión por una URL de vídeo, y cuenta la visita.
 *
 * ── Por qué hace falta una función ──────────────────────────────────────────
 * La página `/r/<token>` la abre el CLIENTE, normalmente desde WhatsApp y sin
 * sesión en la aplicación. Eso descarta las dos alternativas:
 *
 *   · Leer `review_links` con la anon key exigiría una política que permita a
 *     cualquiera consultar la tabla, y entonces se podría enumerar: sacar todos
 *     los tokens, y con ellos todos los vídeos de todos los clientes.
 *   · Compartir directamente la URL firmada de Storage es lo que ya se hacía, y
 *     caduca a los 7 días.
 *
 * Aquí el token entra, `service_role` lo resuelve —saltando RLS pero solo para
 * ESA fila y solo si no está revocada— y sale una URL firmada de 30 minutos. El
 * archivo sigue privado y el enlace que tiene el cliente no caduca nunca.
 *
 * La visita se registra de paso: primera apertura y contador. Es la mitad del
 * valor de Loom y aquí son dos columnas.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** 30 minutos: lo que dura ver un vídeo, no lo que dura el enlace. */
const SIGNED_TTL = 60 * 30;

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string' || token.length < 16) {
      return json({ error: 'Enlace no válido.' }, 400);
    }

    const { data: link } = await service
      .from('review_links')
      .select('id, client_id, storage_path, title, week_start, notes, revoked_at, view_count')
      .eq('token', token)
      .maybeSingle();

    // El mismo mensaje para «no existe» y «revocado»: distinguirlos permitiría
    // averiguar qué tokens han existido.
    if (!link || link.revoked_at) {
      return json({ error: 'Este enlace ya no está disponible.' }, 404);
    }

    const { data: signed, error: signError } = await service.storage
      .from('client-media')
      .createSignedUrl(link.storage_path, SIGNED_TTL);

    if (signError || !signed?.signedUrl) {
      return json({ error: 'El vídeo no está disponible.' }, 404);
    }

    // El nombre del cliente hace la página personal, y es lo único de su ficha
    // que se expone. Nada de email, plan ni pesos.
    const { data: client } = await service
      .from('clients')
      .select('name')
      .eq('id', link.client_id)
      .maybeSingle();

    /*
      Se registra la visita DESPUÉS de tener la URL: si firmar falla, no se cuenta
      una visita que el cliente no ha podido ver. Y no se espera el resultado —un
      fallo al contar no debe impedir ver el vídeo.
    */
    service
      .from('review_links')
      .update({
        first_viewed_at: link.view_count === 0 ? new Date().toISOString() : undefined,
        last_viewed_at: new Date().toISOString(),
        view_count: link.view_count + 1,
      })
      .eq('id', link.id)
      .then(() => {});

    return json({
      ok: true,
      title: link.title,
      weekStart: link.week_start,
      notes: link.notes,
      clientName: client?.name || null,
      videoUrl: signed.signedUrl,
      // Para que la página avise antes de que la URL expire a media reproducción.
      expiresInSeconds: SIGNED_TTL,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado.' }, 400);
  }
});
