/**
 * EL LATIDO: la mañana mirando quién se ha callado.
 *
 * ══ Qué es ════════════════════════════════════════════════════════════════
 *
 * Una puerta de cuatro líneas. Todo el criterio —quién está callado, desde
 * cuándo, qué se le manda y si ya se le mandó— vive en `correr_el_latido()`
 * (migración 0118) y en el núcleo que comparte con el motor 2. Aquí no se decide
 * nada: se abre la puerta, se llama y se cuenta lo que salió.
 *
 * Es la misma forma que el empujón del bot (`telegram?empujar`) y por el mismo
 * motivo, escrito en la cabecera de `worker.mjs`: **un worker que decidiera algo
 * sería otro sitio donde se contesta la misma pregunta.**
 *
 * ══ Por qué existe esta función y no llama el worker a la base ════════════
 *
 * Porque `correr_el_latido()` está revocada para todo el mundo —también para
 * `authenticated`— y solo la puede ejecutar la clave de servicio. Esa clave abre
 * la base entera saltándose RLS, así que vive donde ya viven las demás: en los
 * secretos de las funciones edge. El worker de Cloudflare solo conoce un secreto
 * compartido que no sirve para nada más que para tocar este timbre.
 *
 * ══ Y por qué un secreto propio y no el de la radiografía ═════════════════
 *
 * Los dos los llama el mismo cron, y aun así no comparten llave. El empujón
 * manda un mensaje a un chat; esto escribe en la lista de pendientes de los
 * clientes de todos los entrenadores. Dos capacidades con ese salto de alcance
 * compartiendo credencial significa que filtrar la pequeña regala la grande.
 *
 * Sin `LATIDO_CRON_SECRET` configurado la puerta NO se abre: un endpoint que
 * reparte a la cartera entera no puede quedar abierto por un despiste de
 * configuración. Se dice en el registro, que es la diferencia entre «no está
 * puesto» y «está roto».
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const esperado = Deno.env.get('LATIDO_CRON_SECRET');
  const dado = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');

  if (!esperado) {
    console.error('latido: falta LATIDO_CRON_SECRET');
    return new Response('No', { status: 401 });
  }
  if (dado !== esperado) return new Response('No', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  /*
    Las dietas programadas que ya tocan (0146), antes que lo demás y aparte:
    si esto falla, el latido sigue —la aplicación las vuelve a intentar al
    abrir al cliente— y se dice en el registro con su código.
  */
  const dietas = await supabase.rpc('aplicar_dietas_programadas', { p_client: null });
  if (dietas.error) console.error('latido: dietas programadas', dietas.error.code || '', dietas.error.message);
  else console.log('latido', 'dietas programadas', dietas.data ?? 0);

  /*
    `?dietas`: el toque de cada hora (ver `worker.mjs`). Solo las programadas:
    la base decide con el día de CADA cliente en su zona (`dia_del_cliente`),
    así que a cada uno le entra la suya en la primera hora de su día. Lo demás
    del latido es de la mañana y no se repite.
  */
  if (new URL(request.url).searchParams.has('dietas')) {
    return new Response(JSON.stringify({ ok: !dietas.error, dietas: dietas.error ? null : dietas.data ?? 0 }), {
      status: dietas.error ? 500 : 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const { data, error } = await supabase.rpc('correr_el_latido');

  if (error) {
    /*
      Se registra con su código: si un día falta la 0118 el error será «no existe
      la función», y eso es una cosa muy distinta de una automatización rota
      —que la base se traga a propósito para no romperle la entrega a nadie—.
    */
    console.error('latido', error.code || '', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  /* Se dice siempre cuántas salieron, también el cero. Un latido que solo hablara
     cuando reparte algo no se distinguiría de un cron que dejó de correr. */
  console.log('latido', 'repartidas', data ?? 0);

  return new Response(JSON.stringify({ ok: true, repartidas: data ?? 0, dietas: dietas.error ? null : dietas.data ?? 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
