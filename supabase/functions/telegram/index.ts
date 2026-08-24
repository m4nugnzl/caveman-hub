/**
 * El bot: la mitad que EMPUJA del mismo cerebro.
 *
 * ══ Qué es y qué no ═════════════════════════════════════════════════════════
 *
 * No es una segunda interfaz. Es `diagnosticar()` —el mismo que pinta el panel y
 * el mismo que resume la terminal— con otra salida. Un bot que dijera «todo
 * bien» mientras el panel dice «atender» destruye la confianza en los dos a la
 * vez, y eso pasa siempre que el aviso se escribe aparte del análisis.
 *
 * Qué decir y cuándo callarse está en `src/domain/radiografia/aviso.js`, con sus
 * pruebas. Aquí solo se abre la puerta, se recoge y se manda.
 *
 * ══ Las DOS puertas, que no son la misma ════════════════════════════════════
 *
 * Esta función se llama por dos caminos y cada uno se autentica distinto,
 * porque quien llama es distinto:
 *
 *   · **El webhook de Telegram** (`/telegram`). Llama Telegram, sin sesión de
 *     nadie. Se comprueba el secreto de la cabecera
 *     `X-Telegram-Bot-Api-Secret-Token`, que es lo que Telegram ofrece para esto
 *     y que solo conocen ellos y nosotros. Y DESPUÉS, que el `chat_id` esté en
 *     la lista blanca.
 *
 *   · **El empujón** (`?empujar`). Llama el Cron Trigger del worker, con un
 *     secreto compartido en la cabecera `Authorization`. No hay usuario detrás,
 *     así que no puede ser un JWT.
 *
 * Ninguna de las dos usa `platform_admins`: no hay sesión que comprobar. Lo que
 * las cierra es que el secreto no lo tiene nadie más.
 *
 * ══ Por qué a un desconocido se le contesta con SILENCIO ════════════════════
 *
 * Un «no tienes permiso» le confirma a quien escribe que hay un bot vivo detrás
 * y que responde a algo. Un 200 vacío no le dice nada: para él es
 * indistinguible de un bot que no existe. Telegram necesita el 200 de todos
 * modos —si no, reintenta— así que salir callando no cuesta nada.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { componer } from '../../../src/domain/radiografia/componer.js';
import { queDecir, responder } from '../../../src/domain/radiografia/aviso.js';
import { estadoDeFilas } from '../../../src/domain/radiografia/estado.js';
import { leerTodo } from '../../../src/domain/radiografia/lectura.js';
import { planDe } from '../../../src/domain/radiografia/recogida.js';

import catalogo from '../radiografia/catalogo.json' with { type: 'json' };

/** Telegram reintenta lo que no acaba en 200, así que casi todo acaba en 200. */
const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Manda un mensaje.
 *
 * `disable_web_page_preview` porque si el texto menciona una URL —y el aviso
 * lleva el enlace al panel— Telegram cargaría su vista previa y el mensaje
 * pasaría de cinco líneas a media pantalla de otra cosa.
 */
const mandar = async (token: string, chatId: string, texto: string) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!r.ok) {
    /*
      Un 400 aquí casi siempre es HTML mal formado —una etiqueta sin cerrar por
      un `<` sin escapar— y el síntoma es que NO LLEGA NADA. Se registra el
      cuerpo entero porque el mensaje que no llegó es justo el que traía la
      novedad. El escapado vive en `aviso.js` y tiene sus pruebas.
    */
    console.error('telegram sendMessage', r.status, await r.text());
  }
  return r.ok;
};

/**
 * El informe entero. Es lo mismo que hace la función `radiografia`, y sí, es
 * código parecido — pero lo parecido es la ORQUESTACIÓN, no el criterio: el plan
 * de lectura, el montaje y el análisis salen todos del dominio compartido. Lo
 * que cambia aquí es que no hay usuario, la ventana es fija y nadie va a mirar
 * los avisos de lectura.
 */
const informeDe = async (supabase: SupabaseClient) => {
  const ahora = new Date();
  const generado = ahora.toISOString();
  const dias = 30;
  const desde = new Date(ahora.getTime() - dias * 86400000).toISOString();

  const [seg, vol] = await Promise.all([
    supabase.rpc('radiografia_seguridad'),
    supabase.rpc('radiografia_volumen'),
  ]);

  /* Sin programas: son el JSONB de varios MB por cliente de `auditoria.md` §1.4
     y ninguna de las cinco respuestas del bot los usa. Leerlos aquí sería pagar
     el minuto más caro del informe para nada. */
  const { tablas, avisos: avisosPlan } = planDe({ desde, conProgramas: false });
  const { datos, avisos: avisosLectura } = await leerTodo(supabase, tablas);

  const auth = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const sesiones = (auth.data?.users || []).map((u) => ({
    id: u.id,
    last_sign_in_at: u.last_sign_in_at,
  }));

  const [instantaneas, aceptaciones] = await Promise.all([
    supabase.from('platform_snapshots').select('dia, generado, metricas, claves'),
    supabase
      .from('platform_acceptances')
      .select('id, clave, motivo, nivel, objeto, quien, at, retira'),
  ]);

  return componer({
    datos,
    sesiones,
    seguridad: seg.data || [],
    avisoSeguridad: seg.error ? `No se ha podido leer la seguridad: ${seg.error.message}` : null,
    volumen: vol.data || [],
    catalogo,
    estado: estadoDeFilas({
      snapshots: instantaneas.data || [],
      aceptaciones: aceptaciones.data || [],
    }),
    proyecto: new URL(Deno.env.get('SUPABASE_URL')!).host,
    generado,
    dias,
    avisos: [...avisosPlan, ...avisosLectura],
  });
};

Deno.serve(async (request) => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const permitidos = (Deno.env.get('TELEGRAM_CHAT_IDS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  /* Sin token no hay bot, y decirlo en el registro es mejor que fallar callando:
     es la diferencia entre «no está configurado» y «está roto». */
  if (!token) {
    console.error('telegram: falta TELEGRAM_BOT_TOKEN');
    return ok({ ok: false, error: 'no configurado' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const url = new URL(request.url);
  const enlace = Deno.env.get('APP_URL') ? `${Deno.env.get('APP_URL')}/plataforma` : null;

  /* ══ El empujón, que llama el cron ═══════════════════════════════════════ */

  if (url.searchParams.has('empujar')) {
    const esperado = Deno.env.get('RADIOGRAFIA_CRON_SECRET');
    const dado = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');

    /* Sin secreto configurado NO se abre la puerta: un endpoint que corre el
       informe entero es caro de invocar y quedaría abierto a cualquiera. */
    if (!esperado || dado !== esperado) return new Response('No', { status: 401 });

    const informe = await informeDe(supabase);

    /* La última vez que este bot miró, hablara o no. */
    const ultimo = await supabase
      .from('platform_alerts')
      .select('titulos')
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const decision = queDecir({
      informe,
      yaAvisado: ultimo.data?.titulos || [],
      primeraVez: !ultimo.data,
      enlace,
    });

    if (decision.hablar && decision.mensaje) {
      for (const chatId of permitidos) await mandar(token, chatId, decision.mensaje);
    }

    /*
      Se apunta SIEMPRE, se hable o no. Si solo se guardara al hablar, un día de
      silencio borraría la memoria y al siguiente todo volvería a parecer nuevo
      — que es justo la inundación que este bot existe para no provocar.
    */
    await supabase.from('platform_alerts').insert({
      titulos: decision.titulos,
      hablado: decision.hablar,
      porque: decision.porque,
      mensaje: decision.mensaje,
    });

    return ok({ ok: true, hablado: decision.hablar, porque: decision.porque });
  }

  /* ══ El webhook, que llama Telegram ══════════════════════════════════════ */

  const secreto = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (secreto && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secreto) {
    /* Esto no es Telegram. Silencio: ver la cabecera. */
    return ok();
  }

  const update = await request.json().catch(() => null);
  const mensaje = update?.message || update?.edited_message;
  const chatId = String(mensaje?.chat?.id ?? '');
  const texto = String(mensaje?.text ?? '');

  if (!chatId || !texto) return ok();

  /*
    La lista blanca. Es lo único que separa el informe de la plataforma de
    cualquiera que encuentre el bot por su nombre de usuario — que es público,
    porque los nombres de los bots de Telegram lo son.
  */
  if (!permitidos.includes(chatId)) {
    console.warn('telegram: chat no permitido', chatId);
    return ok();
  }

  try {
    /*
      Se monta el informe ENTERO para contestar una pregunta. Es caro y es
      deliberado: la alternativa —cachear el último— haría que el bot contestara
      con cifras de hace unas horas sin decirlo, y una cifra vieja con aspecto de
      recién medida es peor que esperar cinco segundos.
    */
    const informe = await informeDe(supabase);
    const respuesta = responder(texto, informe);

    /* `null` es «no es una orden que conozca», y eso significa callarse. */
    if (respuesta) await mandar(token, chatId, respuesta);
  } catch (e) {
    console.error('telegram', e);
    await mandar(token, chatId, 'No he podido montar el informe. Mira el registro de la función.');
  }

  return ok();
});
