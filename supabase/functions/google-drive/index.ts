/**
 * La carpeta de cada cliente, en el Drive del entrenador.
 *
 * ── Qué hace, en una frase ──────────────────────────────────────────────────
 * Crea y comparte una carpeta por cliente dentro del Drive del entrenador, y deja
 * que el cliente suba cosas a la suya desde su portal. Nada más. No lee el Drive
 * de nadie: con el ámbito `drive.file` **no puede** (ver la migración 0082).
 *
 * ── Por qué esta función tiene dos puertas ──────────────────────────────────
 * Una `GET /google-drive/oauth`, que es la vuelta de Google —una redirección del
 * navegador, sin sesión ni cabeceras—, y una `POST /google-drive` que es la que
 * llama la aplicación con el JWT de quien esté delante. Son dos protocolos
 * distintos y por eso se separan por ruta; juntarlos en una obligaría a adivinar
 * cuál es cuál por el cuerpo, que es como se cuelan las peticiones que no
 * deberían pasar.
 *
 * ── Y por qué QUIEN LLAMA no siempre es el entrenador ───────────────────────
 * `folder`, `sync` y `settings` las llama él; `upload` y `list` las llama SU
 * CLIENTE desde el portal, que no puede ver la fila de `integrations` —su RLS es
 * del dueño— y ni siquiera sabe que existe. Por eso esas dos se autorizan por la
 * carpeta (`client_folders`, que el cliente sí ve) y no por la integración, y por
 * eso `uploads` se comprueba aquí: es el permiso que el entrenador da por
 * cliente, y una política de Postgres no puede vigilar una escritura que ocurre
 * en Google.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OAUTH = 'https://oauth2.googleapis.com/token';
const CONSENT = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/**
 * El ámbito, y no hay ninguno más.
 *
 * `drive.file` da acceso **solo a lo que crea esta aplicación**. Es la decisión
 * que hace que esto se pueda publicar sin la verificación de Google y sin que los
 * tokens de refresco caduquen cada siete días — el motivo entero está en la
 * cabecera de `0082_la_carpeta_de_cada_cliente.sql`, y conviene leerlo antes de
 * añadir aquí nada que empiece por `.../auth/drive`.
 */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** El nombre de la carpeta raíz en el Drive del entrenador. */
const RAIZ = 'Caveman Hub';

/**
 * Lo que se admite subir, y cuánto puede pesar.
 *
 * Los mismos números que `src/domain/attachments.js`, y a propósito: el archivo
 * que el cliente deja en la carpeta es la misma clase de cosa que el que adjunta
 * a un ticket —una analítica, la hoja del fisio, una foto de algo—. Que el
 * navegador y el servidor tengan el mismo criterio es lo que evita que alguien
 * elija un archivo, espere la subida y se lleve el rechazo al final.
 *
 * El tope de verdad es éste, el de aquí. El del navegador es cortesía.
 */
const MAX_BYTES = 10 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '3600',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** La dirección de retorno. Tiene que coincidir LETRA POR LETRA con la de la consola. */
const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-drive/oauth`;

/**
 * Un token de acceso a partir del de refresco.
 *
 * Se pide en cada llamada y no se guarda. Dura una hora, así que guardarlo obliga
 * a llevar su caducidad y a resolver qué pasa cuando dos peticiones lo renuevan a
 * la vez; pedirlo cuesta una petición y ningún estado que pueda quedarse viejo.
 */
async function accessToken(refresh: string): Promise<string> {
  const response = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    /*
      `invalid_grant` es el caso que hay que nombrar: significa que el permiso ya
      no vale —lo retiró el entrenador desde su cuenta de Google, o cambió la
      contraseña—. Sin decirlo, lo que se lee es «error 400» y nadie relaciona eso
      con «vuelve a conectar».
    */
    if (data.error === 'invalid_grant') {
      throw new Error(
        'Google ha retirado el permiso. Vuelve a conectar tu Drive desde Ajustes → Integraciones.'
      );
    }
    throw new Error(`Google no ha querido dar el permiso (${data.error || response.status}).`);
  }
  return data.access_token as string;
}

/** Una llamada a Drive, con el error de Google traducido a algo que se pueda leer. */
async function drive(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(path.startsWith('http') ? path : `${DRIVE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });

  if (!response.ok) {
    const detalle = await response.text();
    if (response.status === 403 && detalle.includes('storageQuotaExceeded')) {
      throw new Error('El Drive del entrenador está lleno. No cabe nada más.');
    }
    if (response.status === 404) {
      throw new Error('Esa carpeta ya no existe en Drive. Vuelve a crearla desde su ficha.');
    }
    throw new Error(`Drive respondió ${response.status}: ${detalle.slice(0, 300)}`);
  }

  return response.json();
}

/** Crear una carpeta y devolver lo que hace falta para enlazarla. */
const crearCarpeta = (token: string, name: string, parent?: string) =>
  drive(token, '/files?fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parent ? { parents: [parent] } : {}),
    }),
  });

/**
 * ¿Sigue estando la carpeta donde decía la ficha?
 *
 * Porque el entrenador puede haberla borrado desde Drive, y ahí la aplicación no
 * pinta nada: es su Drive. Lo que no puede pasar es que la aplicación siga
 * enseñando un enlace a una papelera. Se comprueba y, si no está, se crea otra.
 */
async function sigueViva(token: string, id: string): Promise<boolean> {
  try {
    const file = await drive(token, `/files/${id}?fields=id,trashed`);
    return !file.trashed;
  } catch {
    return false;
  }
}

/**
 * Compartir la carpeta con el cliente, POR SU CORREO.
 *
 * ══ Y no «cualquiera con el enlace», que es lo que se hace hoy a mano ══════
 *
 * Es justo lo que este repositorio ya criticó por escrito dos veces: «había que
 * subirlas a Drive, hacerlas públicas y pegar aquí ese enlace — los datos de
 * salud de alguien colgando de una dirección sin caducidad» (migración 0039). Un
 * enlace público es un permiso que no se puede retirar de verdad, porque no se
 * sabe quién lo tiene.
 *
 * Con el correo, el permiso tiene nombre, se ve en Drive y se quita desde allí.
 * El precio es real y hay que decirlo en la interfaz: **el cliente tiene que
 * abrirlo con esa cuenta de Google**. Si su correo de la ficha no es una cuenta
 * de Google, verá la pantalla de «solicitar acceso» — y subir le seguirá
 * funcionando igual, porque eso no pasa por su cuenta sino por esta función.
 *
 * `sendNotificationEmail: false` a propósito: el aviso lo da su portal, no un
 * correo de Google en inglés que parece publicidad.
 */
async function compartir(token: string, folderId: string, email: string) {
  await drive(token, `/files/${folderId}/permissions?sendNotificationEmail=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email }),
  });
}

/**
 * Asegurarse de que está compartida, la acabe de crear o no.
 *
 * ══ El agujero que esto tapa ═══════════════════════════════════════════════
 *
 * Compartir solo ocurría al CREAR la carpeta, y compartir es justo lo que falla
 * cuando el cliente no tiene correo en su ficha. O sea: el único momento en que
 * se intentaba era el único momento en que no podía salir bien, y a partir de ahí
 * la carpeta existía para siempre sin compartir. La pantalla decía «ponle un
 * correo y vuelve a intentarlo» y no había con qué — el botón de crear ya no
 * estaba, porque ya estaba creada.
 *
 * Peor todavía: con la carpeta ya existente se contestaba `shared` mirando si el
 * cliente tenía correo, sin haber comprobado ni compartido nada. La aplicación
 * afirmaba un permiso que podía no existir.
 *
 * Ahora `folder` es idempotente de verdad y esto se puede llamar las veces que
 * haga falta: mira los permisos que hay, y solo añade el que falta. Dar el mismo
 * permiso dos veces no es inofensivo en Drive —contesta un error— así que
 * comprobar antes no es una elegancia, es lo que evita un fallo al reintentar.
 */
async function asegurarCompartida(token: string, folderId: string, email: string) {
  if (!email) return false;

  const lista = await drive(
    token,
    `/files/${folderId}/permissions?fields=permissions(id,emailAddress,role)`
  );

  const yaEsta = (lista.permissions || []).some(
    (p: any) => String(p.emailAddress || '').toLowerCase() === email.trim().toLowerCase()
  );
  if (yaEsta) return true;

  await compartir(token, folderId, email.trim());
  return true;
}

/** El nombre de archivo, sin lo que pueda romper una ruta ni un nombre larguísimo. */
const nombreLimpio = (raw: string) =>
  String(raw || 'archivo')
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'archivo';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const app = Deno.env.get('APP_URL') || '';
  const asService = createClient(url, service);

  const ruta = new URL(request.url);

  // ══ La vuelta de Google ═══════════════════════════════════════════════════
  //
  // Es una navegación del navegador, así que lo que se devuelve son
  // REDIRECCIONES y no JSON: al otro lado no hay código nuestro esperando una
  // respuesta, hay una persona mirando una pantalla en blanco.
  if (request.method === 'GET' && ruta.pathname.endsWith('/oauth')) {
    const volver = (query: string) =>
      new Response(null, { status: 302, headers: { Location: `${app}/ajustes/integraciones?${query}` } });

    const error = ruta.searchParams.get('error');
    /* Cancelar en la pantalla de Google no es un fallo: es una respuesta. Se
       vuelve sin ruido y sin dejar nada a medias. */
    if (error) return volver(`drive=${error === 'access_denied' ? 'cancelado' : 'error'}`);

    const code = ruta.searchParams.get('code');
    const state = ruta.searchParams.get('state');
    if (!code || !state) return volver('drive=error');

    /*
      El `state` decide de quién es este permiso, y se CONSUME: se borra al
      usarlo, así que una vuelta repetida —un botón de atrás, un enlace
      reenviado— no vuelve a escribir nada.
    */
    const { data: pendiente } = await asService
      .from('integration_oauth_states')
      .select('integration_id, created_at')
      .eq('state', state)
      .maybeSingle();

    await asService.from('integration_oauth_states').delete().eq('state', state);

    if (!pendiente) return volver('drive=caducado');
    /* Diez minutos. Un permiso que se empezó ayer y vuelve hoy no es el mismo
       gesto; y un `state` que vive para siempre es un `state` que se puede
       reutilizar. */
    if (Date.now() - new Date(pendiente.created_at).getTime() > 10 * 60 * 1000) {
      return volver('drive=caducado');
    }

    const respuesta = await fetch(OAUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    const token = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !token.refresh_token) {
      /*
        Sin `refresh_token` no hay integración que valga: el de acceso dura una
        hora y esto tiene que funcionar mañana. Pasa cuando Google ya había dado
        el permiso antes y no vuelve a mandarlo; por eso la ida lleva siempre
        `prompt=consent`, que es lo que lo fuerza.
      */
      return volver('drive=sin-permiso');
    }

    await asService.from('integration_secrets').upsert(
      { integration_id: pendiente.integration_id, token: token.refresh_token, updated_at: new Date().toISOString() },
      { onConflict: 'integration_id' }
    );

    /* De quién es la cuenta conectada, para poder enseñarlo. No es un secreto y
       vive en `config`, que es lo que la aplicación sí puede leer. */
    let cuenta = '';
    try {
      const perfil = await drive(token.access_token, '/about?fields=user(emailAddress)');
      cuenta = perfil?.user?.emailAddress || '';
    } catch {
      /* Que no se sepa el correo no impide nada de lo que viene después. */
    }

    const { data: fila } = await asService
      .from('integrations')
      .select('config')
      .eq('id', pendiente.integration_id)
      .maybeSingle();

    await asService
      .from('integrations')
      .update({
        status: 'ok',
        last_error: null,
        config: { ...(fila?.config || {}), account: cuenta },
        updated_at: new Date().toISOString(),
      })
      .eq('id', pendiente.integration_id);

    return volver('drive=ok');
  }

  // ══ Todo lo demás: la aplicación, con sesión ══════════════════════════════

  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión.' }, 401);
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authorization } } });

  if (!Deno.env.get('GOOGLE_DRIVE_CLIENT_ID') || !Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')) {
    return json(
      { error: 'Google Drive no está configurado en el servidor. Faltan las credenciales.' },
      500
    );
  }

  /*
    El cuerpo llega de dos maneras y por un motivo: `upload` manda un ARCHIVO, y
    un archivo no cabe en un JSON sin inflarlo un tercio en base64. Las demás son
    JSON normal.
  */
  const esFormulario = (request.headers.get('Content-Type') || '').includes('multipart/form-data');
  let action = '';
  let integrationId = '';
  let clientId = '';
  let archivo: File | null = null;
  let cuerpo: Record<string, unknown> = {};

  try {
    if (esFormulario) {
      const form = await request.formData();
      action = String(form.get('action') || 'upload');
      clientId = String(form.get('clientId') || '');
      const subido = form.get('file');
      archivo = subido instanceof File ? subido : null;
    } else {
      cuerpo = await request.json();
      action = String(cuerpo.action || '');
      integrationId = String(cuerpo.integrationId || '');
      clientId = String(cuerpo.clientId || '');
    }
  } catch {
    return json({ error: 'La petición no se entiende.' }, 400);
  }

  try {
    /**
     * El token de refresco de una integración, leído con la clave de servicio.
     *
     * Es el único sitio de todo el proyecto donde se lee, y por eso está aquí
     * dentro y no en una variable de arriba: quien lo necesite tiene que pedirlo.
     */
    const refrescoDe = async (id: string) => {
      const { data } = await asService
        .from('integration_secrets')
        .select('token')
        .eq('integration_id', id)
        .maybeSingle();
      if (!data?.token) throw new Error('Este Drive no está conectado todavía.');
      return data.token as string;
    };

    /** La integración, comprobando POR RLS que es de quien llama. */
    const miIntegracion = async () => {
      if (!integrationId) throw new Error('Falta integrationId.');
      const { data, error } = await asUser
        .from('integrations')
        .select('*')
        .eq('id', integrationId)
        .single();
      if (error || !data) throw new Error('Esa integración no existe o no es tuya.');
      return data;
    };

    // ── authorize: la ida a Google ─────────────────────────────────────────
    //
    // No redirige: DEVUELVE la dirección para que la abra el navegador. Una
    // redirección desde `functions.invoke` la seguiría `fetch` en segundo plano y
    // el usuario no vería nunca la pantalla de permiso de Google.
    if (action === 'authorize') {
      const integration = await miIntegracion();

      const state = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
      const { error } = await asService
        .from('integration_oauth_states')
        .insert({ state, integration_id: integration.id });
      if (error) throw new Error('No se ha podido empezar la conexión. Inténtalo otra vez.');

      const consent = new URL(CONSENT);
      consent.searchParams.set('client_id', Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!);
      consent.searchParams.set('redirect_uri', redirectUri());
      consent.searchParams.set('response_type', 'code');
      consent.searchParams.set('scope', SCOPE);
      /* Las dos que hacen que esto funcione mañana: `offline` es lo que pide un
         token de refresco, y `consent` lo que obliga a Google a mandarlo aunque
         el permiso ya estuviera dado de antes. Sin la segunda, reconectar
         devuelve un permiso sin refresco y la integración muere en una hora. */
      consent.searchParams.set('access_type', 'offline');
      consent.searchParams.set('prompt', 'consent');
      consent.searchParams.set('include_granted_scopes', 'true');
      consent.searchParams.set('state', state);

      return json({ ok: true, url: consent.toString() });
    }

    // ── sync: ¿esto sigue vivo? ────────────────────────────────────────────
    //
    // Es lo que hace el botón «Sincronizar» del catálogo. Con Drive no hay nada
    // que traer —no es una fuente de datos, es un sitio donde dejar cosas— así
    // que lo que comprueba es lo único que puede fallar en silencio: que el
    // permiso siga concedido. Un botón que dijera «sincronizado» sin haber
    // hablado con Google sería peor que no tenerlo.
    if (action === 'sync' || action === 'test') {
      const integration = await miIntegracion();
      const token = await accessToken(await refrescoDe(integration.id));
      const about = await drive(token, '/about?fields=user(emailAddress),storageQuota(limit,usage)');

      const { count } = await asService
        .from('client_folders')
        .select('client_id', { count: 'exact', head: true })
        .eq('integration_id', integration.id);

      await asService
        .from('integrations')
        .update({
          status: 'ok',
          last_error: null,
          last_sync_at: new Date().toISOString(),
          config: { ...(integration.config || {}), account: about?.user?.emailAddress || '' },
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      const carpetas = count || 0;
      return json({
        ok: true,
        account: about?.user?.emailAddress || '',
        folders: carpetas,
        summary:
          carpetas === 0
            ? 'conectado, sin ninguna carpeta creada todavía'
            : `conectado · ${carpetas} ${carpetas === 1 ? 'carpeta' : 'carpetas'}`,
      });
    }

    /**
     * La carpeta de un cliente, creándola si todavía no existe.
     *
     * ══ Por qué esto es una función y no una acción ════════════════════════
     *
     * Porque nadie viene a «crear una carpeta»: se viene a subir algo, a mirar
     * qué hay o a dejársela abierta al cliente. La carpeta es el requisito de
     * esas tres cosas, no una de ellas.
     *
     * Tenerlo como acción suelta obligaba a que alguien se acordara de pulsarla
     * antes —y eso acabó siendo una lista de treinta clientes con treinta
     * botones en Ajustes, que es un segundo sitio donde gestionar personas
     * cuando este proyecto ya decidió que todo lo de una persona cuelga de su
     * ficha—. Ahora la crea quien la necesita, cuando la necesita.
     *
     * Es idempotente: con la carpeta ya hecha no crea otra, solo repasa el
     * permiso del cliente. Eso es lo que la deja servir también de «volver a
     * compartir» cuando la carpeta nació sin correo al que compartírsela.
     */
    const montarCarpeta = async (integration: any, token: string, id: string) => {
      /* Que el cliente sea suyo lo dice RLS, no un `eq` de aquí: leerlo con el
         JWT de quien llama ES la comprobación. */
      const { data: cliente, error: clienteError } = await asUser
        .from('clients')
        .select('id, name, email')
        .eq('id', id)
        .single();
      if (clienteError || !cliente) throw new Error('Ese cliente no es tuyo.');

      /* La raíz. Se comprueba que siga viva porque el entrenador puede haberla
         borrado o movido desde Drive —es suya— y entonces hay que hacer otra en
         vez de colgar la del cliente de un id que ya no existe. */
      let rootId = (integration.config || {}).rootFolderId as string | undefined;
      if (!rootId || !(await sigueViva(token, rootId))) {
        const raiz = await crearCarpeta(token, RAIZ);
        rootId = raiz.id;
        await asService
          .from('integrations')
          .update({
            config: { ...(integration.config || {}), rootFolderId: rootId, rootFolderUrl: raiz.webViewLink },
            updated_at: new Date().toISOString(),
          })
          .eq('id', integration.id);
      }

      const { data: existente } = await asService
        .from('client_folders')
        .select('*')
        .eq('client_id', id)
        .maybeSingle();

      /* Ya la tiene: no se crea otra, pero SÍ se repasa el permiso. */
      if (existente && (await sigueViva(token, existente.folder_id))) {
        let repasada = false;
        try {
          repasada = await asegurarCompartida(token, existente.folder_id, cliente.email);
        } catch {
          /* Un correo que Google no acepta no puede tumbar la respuesta: se dice
             que no está compartida y el entrenador ve por qué. */
        }
        return { ...existente, shared: repasada };
      }

      const nueva = await crearCarpeta(token, cliente.name || 'Cliente', rootId);

      /* Compartirla con él, si hay a quién. Sin correo se crea igual: la carpeta
         sirve al entrenador desde el primer minuto, y compartirla es lo que se
         puede hacer después, en cuanto le ponga el correo en su ficha. */
      let compartida = false;
      try {
        compartida = await asegurarCompartida(token, nueva.id, cliente.email);
      } catch {
        /* Igual que arriba: se dice y se sigue. */
      }

      /* `uploads` y `ask` NO viajan en el upsert, y es a propósito: son
         decisiones del entrenador sobre este cliente, y rehacer una carpeta que
         él borró de Drive no puede llevarse por delante el permiso de subir que
         tenía dado. Lo que no se manda, PostgREST no lo toca. */
      await asService.from('client_folders').upsert(
        {
          client_id: id,
          integration_id: integration.id,
          folder_id: nueva.id,
          folder_url: nueva.webViewLink,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id' }
      );

      return {
        client_id: id,
        integration_id: integration.id,
        folder_id: nueva.id,
        folder_url: nueva.webViewLink,
        uploads: existente?.uploads ?? false,
        ask: existente?.ask ?? null,
        shared: compartida,
      };
    };

    // ── folder: asegurarse de que la tiene (y de que está compartida) ──────
    if (action === 'folder') {
      const integration = await miIntegracion();
      if (!clientId) return json({ error: 'Falta clientId.' }, 400);

      const token = await accessToken(await refrescoDe(integration.id));
      const carpeta = await montarCarpeta(integration, token, clientId);

      return json({
        ok: true,
        folderId: carpeta.folder_id,
        folderUrl: carpeta.folder_url,
        shared: carpeta.shared,
      });
    }

    // ══ De aquí abajo, quien llama puede ser EL CLIENTE ═════════════════════
    //
    // Así que la autorización cambia de sitio: no se lee la integración —que él
    // no puede ver— sino su carpeta, que RLS le deja ver solo si es la suya
    // (`folders_read` en la 0082). Si la consulta no devuelve fila, no hay nada
    // que discutir.
    if (action === 'list' || action === 'upload') {
      if (!clientId) return json({ error: 'Falta clientId.' }, 400);

      let { data: carpeta } = await asUser
        .from('client_folders')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      /* ¿Es el entrenador? Lo dice si puede ver SU integración de Drive: al
         cliente RLS le devuelve vacío, que es exactamente la respuesta que hace
         falta. Se busca por proveedor y no por el id de la carpeta porque cuando
         la carpeta todavía no existe no hay id que mirar. */
      const { data: miDrive } = await asUser
        .from('integrations')
        .select('*')
        .eq('provider', 'google_drive')
        .maybeSingle();
      const esEntrenador = Boolean(miDrive);

      const deQuien = carpeta?.integration_id || miDrive?.id;
      if (!deQuien) {
        /* Un cliente cuyo entrenador no ha montado nada. Su portal ni siquiera
           pinta el bloque, así que llegar aquí es raro — pero la frase es suya y
           no habla de integraciones, que no es asunto suyo. */
        return json({ error: 'Tu entrenador todavía no te ha abierto ninguna carpeta.' }, 404);
      }

      const token = await accessToken(await refrescoDe(deQuien));

      /*
        Y si no hay carpeta, se monta — pero SOLO para el entrenador.

        Es lo que hace que «subir a su Drive» funcione a la primera desde
        cualquier sitio, sin haber pasado antes por ninguna pantalla a crearla.
        Para el cliente no: dejar que su portal cree carpetas en el Drive de otra
        persona sería escribir en la cuenta de alguien por iniciativa de un
        tercero, aunque el resultado pareciera inofensivo.
      */
      if (!carpeta) {
        if (!esEntrenador) {
          return json({ error: 'Tu entrenador todavía no te ha abierto ninguna carpeta.' }, 404);
        }
        carpeta = await montarCarpeta(miDrive, token, clientId);
      }

      if (action === 'list') {
        const listado = await drive(
          token,
          `/files?q=${encodeURIComponent(`'${carpeta.folder_id}' in parents and trashed = false`)}` +
            '&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=50'
        );
        return json({ ok: true, folderUrl: carpeta.folder_url, files: listado.files || [] });
      }

      // ── upload ───────────────────────────────────────────────────────────
      //
      // El permiso del cliente es `uploads`, y lo da el entrenador por cliente.
      // El entrenador puede subir siempre: es su Drive.
      if (!esEntrenador && !carpeta.uploads) {
        return json({ error: 'Tu entrenador no ha abierto esta carpeta para que subas cosas.' }, 403);
      }
      if (!archivo) return json({ error: 'No ha llegado ningún archivo.' }, 400);
      if (archivo.size > MAX_BYTES) {
        return json(
          { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 10 MB.` },
          400
        );
      }

      /*
        Multipart de UNA llamada, y no «sube el contenido y luego ponle nombre y
        carpeta». Con dos llamadas, un fallo en la segunda deja un archivo sin
        título tirado en la raíz del Drive del entrenador — un rastro que él no
        pidió y que tendría que limpiar a mano.
      */
      const boundary = `caveman${crypto.randomUUID()}`;
      const meta = JSON.stringify({
        name: nombreLimpio(archivo.name),
        parents: [carpeta.folder_id],
      });
      const tipo = archivo.type || 'application/octet-stream';
      const cabeza =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: ${tipo}\r\n\r\n`;
      const cola = `\r\n--${boundary}--`;

      const subido = await drive(
        token,
        `${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: new Blob([cabeza, await archivo.arrayBuffer(), cola]),
        }
      );

      return json({ ok: true, file: subido, folderUrl: carpeta.folder_url });
    }

    return json({ error: `No sé hacer «${action}».` }, 400);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Algo ha fallado con Drive.';

    /* El fallo se deja escrito en la integración, que es de donde lo saca la
       tarjeta del catálogo para decir «con un fallo» sin que nadie tenga que
       entrar a mirar. Solo cuando se sabe cuál es. */
    if (integrationId) {
      await asService
        .from('integrations')
        .update({ status: 'error', last_error: mensaje, updated_at: new Date().toISOString() })
        .eq('id', integrationId);
    }

    return json({ error: mensaje }, 400);
  }
});
