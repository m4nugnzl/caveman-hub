/**
 * El calendario del cliente, en iCalendar.
 *
 * ── Quién llama aquí ────────────────────────────────────────────────────────
 * No el navegador: **los servidores de Google, Apple o Outlook**, cada uno por su
 * cuenta y cuando le parece. Eso manda tres cosas que la separan del resto de
 * funciones del proyecto:
 *
 *   1. **Es GET**, no POST. Un calendario suscribe una URL; no hace peticiones
 *      con cuerpo.
 *   2. **No lleva ninguna cabecera nuestra.** Ni sesión, ni `apikey`. Por eso
 *      `verify_jwt = false` en `config.toml` no es aquí el apaño del preflight
 *      que explican las otras, sino el requisito: con la pasarela exigiendo un
 *      JWT, la suscripción es imposible.
 *   3. **Lo único que autentica es el token de la URL**, igual que en
 *      `review-link`. De ahí que la tabla no la pueda leer el anónimo y se
 *      resuelva aquí con `service_role`.
 *
 * ── Y por qué el formato importa tanto ──────────────────────────────────────
 * Un `.ics` mal formado no da un error: el calendario lo rechaza en silencio y el
 * cliente ve un calendario vacío sin nada que explique por qué. Los tres sitios
 * donde se rompe —finales de línea, plegado y escapado— están resueltos abajo,
 * cada uno con su motivo.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
  La ventana. Ni todo el historial ni solo lo que viene.

  Hacia atrás, lo justo para que al suscribirse el calendario no aparezca vacío
  —un feed que empieza mañana parece roto—. Hacia delante, un año, que es más de
  lo que nadie programa. Sin tope, el archivo crecería para siempre y cada
  refresco de cada cliente lo descargaría entero.
*/
const DIAS_ATRAS = 60;
const DIAS_ADELANTE = 365;

/** Cada cuánto SUGERIMOS que se refresque. Es una sugerencia: Google la ignora. */
const REFRESCO = 'PT6H';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Max-Age': '3600',
};

const texto = (body: string, status: number, type = 'text/plain; charset=utf-8') =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': type } });

/**
 * Escapado de un valor TEXT (RFC 5545 §3.3.11).
 *
 * La barra invertida va PRIMERO o se escaparían las que introducen las demás
 * reglas. Y la coma importa de verdad aquí: en iCalendar separa valores de una
 * lista, así que un título como «Cita: piernas, empuje» sin escapar parte el
 * evento en dos y el calendario descarta el segundo trozo.
 */
const esc = (value: string): string =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/**
 * Plegado de líneas a 75 OCTETOS (RFC 5545 §3.1).
 *
 * Se mide en octetos y no en caracteres, y ahí está la trampa: cortar a 75
 * caracteres deja pasar líneas más largas cuando hay tildes o emojis, y cortar a
 * ciegas por bytes puede partir un carácter multibyte por la mitad y producir un
 * archivo que ni siquiera es UTF-8 válido. Se corta por bytes y se retrocede
 * mientras el byte sea una continuación (`10xxxxxx`).
 *
 * La continuación lleva un espacio delante, que el lector quita al desplegar; por
 * eso las siguientes caben en 74 y no en 75.
 */
const fold = (line: string): string => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const trozos: string[] = [];
  let inicio = 0;
  let limite = 75;

  while (inicio < bytes.length) {
    let fin = Math.min(inicio + limite, bytes.length);
    // Nunca partir un carácter: atrás hasta el principio de su secuencia.
    while (fin > inicio && fin < bytes.length && (bytes[fin] & 0b1100_0000) === 0b1000_0000) fin--;
    trozos.push(decoder.decode(bytes.slice(inicio, fin)));
    inicio = fin;
    limite = 74;
  }

  return trozos.join('\r\n ');
};

/** `2026-08-22` → `20260822`. Lo que pide una fecha sin hora. */
const soloFecha = (iso: string): string => String(iso).slice(0, 10).replace(/-/g, '');

/**
 * El día siguiente, para `DTEND`.
 *
 * En un evento de día completo el final es EXCLUSIVO: un evento de un solo día
 * empieza el 22 y termina el 23. Poniendo el mismo día en los dos, unos
 * calendarios lo dibujan bien y otros lo tratan como un evento de duración cero y
 * no lo enseñan. Se calcula en UTC a propósito: son fechas sin hora y sin zona, y
 * usar la hora local del servidor podría restar un día.
 */
const diaSiguiente = (iso: string): string => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

/** `DTSTAMP` en UTC básico: `20260822T191500Z`. */
const ahoraUtc = (): string => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Cómo se llama cada cosa en el calendario.
 *
 * El `kind` es del dominio (0009) y no está pensado para leerse; aquí se traduce
 * a lo que el cliente reconoce al verlo entre sus cosas. `note` no lleva prefijo:
 * lo que apuntó él ya está escrito como él quiso, y anteponerle «Nota:» sería
 * corregirle.
 */
const ETIQUETA: Record<string, string> = {
  checkin: 'Check-in',
  appointment: 'Cita',
  goal: 'Objetivo',
  rest: 'Descanso',
  race: 'Competición',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return texto('Usa GET.', 405);
  }

  const token = new URL(request.url).searchParams.get('t');
  if (!token || token.length < 16) return texto('Enlace no válido.', 404);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: feed } = await service
    .from('client_calendar_feeds')
    .select('id, client_id, revoked_at, fetch_count')
    .eq('token', token)
    .maybeSingle();

  /* El mismo mensaje para «no existe» y «revocado», como en `review-link`:
     distinguirlos permitiría averiguar qué tokens han existido. */
  if (!feed || feed.revoked_at) return texto('Este calendario ya no está disponible.', 404);

  const desde = new Date();
  desde.setUTCDate(desde.getUTCDate() - DIAS_ATRAS);
  const hasta = new Date();
  hasta.setUTCDate(hasta.getUTCDate() + DIAS_ADELANTE);

  const [{ data: eventos, error: errorEventos }, { data: client }] = await Promise.all([
    service
      .from('client_events')
      .select('id, date, kind, title, done')
      .eq('client_id', feed.client_id)
      .gte('date', desde.toISOString().slice(0, 10))
      .lte('date', hasta.toISOString().slice(0, 10))
      .order('date'),
    service.from('clients').select('name').eq('id', feed.client_id).maybeSingle(),
  ]);

  /*
    Si la consulta falla, 500 — y NO un calendario vacío.

    Es la diferencia entre «no he podido» y «no tienes nada», y para un
    calendario suscrito no se parecen en nada: un `.ics` válido y sin eventos es
    una respuesta correcta, así que Google la aplicaría y **le borraría al cliente
    todo lo que tenía puesto** hasta el siguiente refresco, que son horas. Con un
    5xx, el calendario conserva la última copia buena y vuelve a intentarlo.

    El nombre del cliente no entra en esta comprobación: si falla, se pierde el
    subtítulo del calendario y nada más.
  */
  if (errorEventos) return texto('No se ha podido leer el calendario.', 500);

  const sello = ahoraUtc();
  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caveman Hub//Calendario del cliente//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc('Caveman Hub')}`,
    `X-WR-CALDESC:${esc(`Lo que tienes apuntado${client?.name ? `, ${client.name}` : ''}`)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESCO}`,
    `X-PUBLISHED-TTL:${REFRESCO}`,
  ];

  for (const evento of eventos || []) {
    const etiqueta = ETIQUETA[evento.kind];
    const titulo = etiqueta ? `${etiqueta}: ${evento.title}` : evento.title;

    lineas.push(
      'BEGIN:VEVENT',
      /*
        El UID tiene que ser ESTABLE entre refrescos: es lo que hace que cambiar
        el título de un evento lo actualice en vez de crear otro al lado. El id
        de la fila ya lo es, y no filtra nada — es un uuid, no un dato.
      */
      `UID:${evento.id}@caveman-hub`,
      `DTSTAMP:${sello}`,
      `DTSTART;VALUE=DATE:${soloFecha(evento.date)}`,
      `DTEND;VALUE=DATE:${diaSiguiente(evento.date)}`,
      `SUMMARY:${esc(evento.done ? `✓ ${titulo}` : titulo)}`,
      /*
        SIEMPRE transparente, y esto era un fallo de verdad.

        Estaba puesto opaco para lo pendiente, con la idea de que «lo que está
        por hacer ocupa». Pero estos eventos no tienen hora: son de día
        completo. Un evento de día completo marcado como opaco pone a la persona
        **ocupada las veinticuatro horas** en su disponibilidad, así que un
        cliente con dos check-ins pendientes aparecería como no disponible dos
        días enteros ante cualquiera que intentara buscarle un hueco.

        Son marcas informativas, no compromisos con horario. Lo hecho se
        distingue por la paloma del título, que además se ve en todos los
        calendarios; `TRANSP` no se ve en ninguno.
      */
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }

  lineas.push('END:VCALENDAR');

  /*
    Se cuenta la lectura sin esperarla: que falle el contador no puede impedir
    servir el calendario. Igual que en `review-link`.
  */
  service
    .from('client_calendar_feeds')
    .update({
      first_fetched_at: feed.fetch_count === 0 ? new Date().toISOString() : undefined,
      last_fetched_at: new Date().toISOString(),
      fetch_count: feed.fetch_count + 1,
    })
    .eq('id', feed.id)
    .then(() => {});

  /*
    El plegado se aplica AQUÍ, a todas las líneas de una vez, y no línea a línea
    al construirlas.

    Estaba solo en `SUMMARY`, que es la que evidentemente se pasa de largo — y
    por eso mismo se olvidaba en las demás: `X-WR-CALDESC` lleva el nombre del
    cliente y se pasa de 75 octetos con un nombre y dos apellidos, que no es un
    caso raro sino el normal. Aplicándolo al final no hay línea nueva que pueda
    olvidarse de plegarse.

    Y CRLF, no `\n`: RFC 5545 lo exige y hay lectores estrictos —Outlook entre
    ellos— que rechazan el archivo entero con saltos de línea de Unix. Es el
    fallo más caro de los tres porque no da error: da un calendario vacío.
  */
  return texto(`${lineas.map(fold).join('\r\n')}\r\n`, 200, 'text/calendar; charset=utf-8');
});
