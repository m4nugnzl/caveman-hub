/**
 * Sincroniza los pagos desde Notion.
 *
 * ── Por qué esto vive en el servidor ────────────────────────────────────────
 * Dos razones, y cualquiera de las dos bastaría:
 *   1. La API de Notion exige un token secreto. En una SPA, cualquier token queda
 *      a la vista de quien abra el inspector, y un token de Notion da acceso a
 *      TODO lo que el entrenador haya compartido con su integración.
 *   2. Notion no manda cabeceras CORS: una llamada desde el navegador falla
 *      siempre, aunque el token fuera público.
 *
 * ── Cómo se autoriza ────────────────────────────────────────────────────────
 * Se usan DOS clientes de Supabase, y la diferencia es lo que hace esto seguro:
 *   · uno con el JWT del usuario, que pasa por RLS y sirve para comprobar que la
 *     integración es suya. Si RLS no la devuelve, no es suya. No se reimplementa
 *     ningún permiso aquí.
 *   · otro con `service_role`, que salta RLS y es el único que puede leer el token
 *     de `integration_secrets` (tabla sin políticas) y escribir los pagos.
 *
 * ── Acciones ────────────────────────────────────────────────────────────────
 *   { action: 'test',    integrationId }  → comprueba token y base, sin escribir
 *   { action: 'preview', integrationId }  → devuelve lo que haría, sin escribir
 *   { action: 'sync',    integrationId }  → escribe pagos y estado de los clientes
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NOTION_VERSION = '2022-06-28';

/**
 * Cabeceras de CORS.
 *
 * `x-supabase-api-version` y `x-client-info` las manda `supabase-js` por su
 * cuenta: si no están listadas, el navegador rechaza el preflight y el error que
 * sale no menciona la cabecera que falta. `Max-Age` evita repetir la comprobación
 * en cada llamada durante una hora.
 *
 * Ojo: para que este preflight llegue siquiera a ejecutarse hace falta
 * `verify_jwt = false` en `supabase/config.toml`. Ver la explicación allí.
 */
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
 * Extrae el id de la base de lo que haya guardado en la configuración.
 *
 * Se sanea también aquí, y no solo en la interfaz, porque esta función es un
 * endpoint: puede llamarse con una configuración guardada antes de que la interfaz
 * supiera limpiarla. Lo importante es cortar en el `?`: el `?v=…` de la vista es
 * TAMBIÉN 32 hexadecimales, y quedarse con el último trozo cogería el id de la
 * vista en vez del de la base — que es lo que provocaba `invalid_request_url`.
 */
const databaseIdOf = (input: string): string => {
  const beforeQuery = String(input || '').trim().split('?')[0].split('#')[0];
  const matches = beforeQuery.replace(/-/g, '').match(/[0-9a-fA-F]{32}/g);
  return matches ? matches[matches.length - 1].toLowerCase() : '';
};

/**
 * Clave de conciliación de un nombre.
 *
 * Tiene que absorber lo que varía sin querer entre Notion y la ficha del cliente:
 * acentos, mayúsculas, espacios dobles y el ORDEN de nombre y apellido —«Manu
 * González» y «González, Manu» son la misma persona—. Ordenar las palabras
 * alfabéticamente resuelve el orden invertido sin heurísticas.
 *
 * Lo que NO absorbe: apodos y diminutivos. Para eso está la memoria de
 * conciliación (`client_external_refs`): se confirma una vez y ya está.
 *
 * OJO: esta función existe también en `src/domain/integrations.js`. Es la única
 * duplicación deliberada del proyecto, porque cruza dos runtimes (Deno y el
 * navegador) y la clave TIENE que coincidir en los dos lados. Si se cambia una,
 * hay que cambiar la otra.
 */
const nameKey = (value: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

/** Extrae texto de una propiedad de Notion, sea del tipo que sea. */
const readText = (prop: any): string => {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return (prop.title || []).map((t: any) => t.plain_text).join('').trim();
    case 'rich_text':
      return (prop.rich_text || []).map((t: any) => t.plain_text).join('').trim();
    case 'select':
      return prop.select?.name?.trim() || '';
    case 'status':
      return prop.status?.name?.trim() || '';
    case 'multi_select':
      return (prop.multi_select || []).map((s: any) => s.name).join(', ');
    case 'people':
      return (prop.people || []).map((p: any) => p.name).filter(Boolean).join(', ');
    case 'formula':
      return String(prop.formula?.string ?? prop.formula?.number ?? '').trim();
    case 'rollup':
      return String(prop.rollup?.number ?? '').trim();
    case 'email':
      return prop.email?.trim() || '';
    case 'phone_number':
      return prop.phone_number?.trim() || '';
    case 'number':
      return prop.number == null ? '' : String(prop.number);
    case 'checkbox':
      return prop.checkbox ? 'true' : 'false';
    default:
      return '';
  }
};

const readNumber = (prop: any): number | null => {
  if (!prop) return null;
  if (prop.type === 'number') return prop.number ?? null;
  if (prop.type === 'formula') return prop.formula?.number ?? null;
  if (prop.type === 'rollup') return prop.rollup?.number ?? null;
  const parsed = Number(readText(prop).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const readDate = (prop: any): string | null => {
  if (!prop) return null;
  if (prop.type === 'date') return prop.date?.start?.slice(0, 10) || null;
  if (prop.type === 'created_time') return prop.created_time?.slice(0, 10) || null;
  if (prop.type === 'formula' && prop.formula?.date) return prop.formula.date.start?.slice(0, 10) || null;
  const text = readText(prop);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

/** Todas las filas de la base, paginando. Notion devuelve 100 por página. */
async function queryDatabase(token: string, databaseId: string) {
  const rows: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });

    if (!response.ok) {
      const detail = await response.text();
      // El 404 es casi siempre el mismo despiste y merece un mensaje propio: el
      // token existe pero la base no se ha compartido con la integración.
      if (response.status === 404) {
        throw new Error(
          'Notion no encuentra la base. Comprueba el id y, sobre todo, que has compartido la base con tu integración desde el botón Compartir de Notion.'
        );
      }
      if (response.status === 401) {
        throw new Error('Notion rechaza el token. Vuelve a generarlo y pégalo de nuevo.');
      }
      throw new Error(`Notion respondió ${response.status}: ${detail.slice(0, 300)}`);
    }

    const page = await response.json();
    rows.push(...(page.results || []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  return rows;
}

Deno.serve(async (request) => {
  // El preflight se contesta con 204 y las cabeceras, sin tocar nada más. Tiene
  // que ir antes de cualquier comprobación de sesión: un preflight no lleva
  // `Authorization`, así que exigirla aquí rompería la llamada real.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cliente CON el JWT del usuario: pasa por RLS. Es quien decide si la
  // integración es suya, y así no se reimplementa ningún permiso aquí.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  // Cliente con service_role: salta RLS. El único que puede leer el token.
  const asService = createClient(url, service);

  try {
    const { action = 'test', integrationId } = await request.json();
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

    if (!secret?.token) return json({ error: 'Esta integración no tiene token guardado.' }, 400);

    const config = integration.config || {};
    const databaseId = databaseIdOf(config.databaseId);
    if (!databaseId) {
      return json(
        {
          error:
            'El id de la base de Notion no es válido. Pega la URL completa de la base: se extrae el id solo.',
        },
        400
      );
    }

    const props = config.props || {};
    const clientProp = props.client || 'Cliente';
    const paidValues: string[] = (config.paidValues || ['pagado', 'cobrado', 'paid']).map((v: string) =>
      v.toLowerCase()
    );

    // ── test: solo comprobar que se puede leer ──────────────────────────────
    if (action === 'test') {
      const rows = await queryDatabase(secret.token, databaseId);
      const sample = rows[0];
      await asService
        .from('integrations')
        .update({ status: 'ok', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', integrationId);

      return json({
        ok: true,
        rows: rows.length,
        // Devolver los nombres de columna reales es lo que permite mapear sin
        // adivinar: la pantalla los ofrece en un desplegable.
        properties: sample ? Object.keys(sample.properties || {}) : [],
      });
    }

    // ── preview y sync ──────────────────────────────────────────────────────
    const rows = await queryDatabase(secret.token, databaseId);

    const { data: clients } = await asService
      .from('clients')
      .select('id, name')
      .eq('coach_id', integration.owner_id);

    const { data: refs } = await asService
      .from('client_external_refs')
      .select('external_key, client_id')
      .eq('integration_id', integrationId);

    // Dos vías de emparejamiento, en este orden: la memoria confirmada primero,
    // y solo si no hay, el nombre normalizado.
    const byRef = new Map((refs || []).map((r) => [r.external_key, r.client_id]));
    const byName = new Map((clients || []).map((c) => [nameKey(c.name), c.id]));

    const payments = rows.map((row) => {
      const label = readText(row.properties?.[clientProp]);
      const key = nameKey(label);
      const status = props.status ? readText(row.properties[props.status]) : '';

      return {
        integration_id: integrationId,
        external_id: row.id,
        external_label: label,
        client_id: byRef.get(key) ?? byName.get(key) ?? null,
        amount: props.amount ? readNumber(row.properties[props.amount]) : null,
        currency: config.currency || 'EUR',
        paid_on: props.date ? readDate(row.properties[props.date]) : null,
        period_end: props.periodEnd ? readDate(row.properties[props.periodEnd]) : null,
        status,
        is_paid: status ? paidValues.includes(status.toLowerCase()) : false,
        raw: { url: row.url, last_edited: row.last_edited_time },
        synced_at: new Date().toISOString(),
        matched_by: byRef.has(key) ? 'confirmado' : byName.has(key) ? 'nombre' : null,
      };
    });

    const unmatched = [
      ...new Set(payments.filter((p) => !p.client_id && p.external_label).map((p) => p.external_label)),
    ];

    if (action === 'preview') {
      return json({
        ok: true,
        total: payments.length,
        matched: payments.filter((p) => p.client_id).length,
        unmatched,
        sample: payments.slice(0, 8),
      });
    }

    // `matched_by` es informativo para la pantalla, no una columna de la tabla.
    const toWrite = payments.map(({ matched_by: _ignored, ...row }) => row);

    const { error: writeError } = await asService
      .from('client_payments')
      .upsert(toWrite, { onConflict: 'integration_id,external_id' });

    if (writeError) throw new Error(`No se pudieron guardar los pagos: ${writeError.message}`);

    /*
      Estado de pago por cliente: se calcula del pago más reciente de cada uno.
      No se toca a los clientes SIN pagos conciliados: dejar a alguien como
      «pendiente» solo porque su nombre no cuadra en Notion sería peor que no
      decir nada, y es exactamente el error que la conciliación evita.
    */
    /*
      Cuál es «el más reciente» cuando no hay columna de fecha.
      ----------------------------------------------------------------------
      Si el entrenador no ha mapeado una fecha —caso normal si en su Notion la
      fecha vive solo en la fila y no en una propiedad—, `paid_on` es null para
      todas las filas y cualquier comparación las empata. Entonces se usa la última
      modificación de la página en Notion, que es lo más cercano a «esto es lo
      último que tocó». No se guarda como `paid_on` porque no es la fecha del pago:
      solo sirve para ordenar.
    */
    const sortKey = (payment: (typeof toWrite)[number]) =>
      payment.paid_on || String((payment.raw as any)?.last_edited || '');

    const latest = new Map<string, (typeof toWrite)[number]>();
    for (const payment of toWrite) {
      if (!payment.client_id) continue;
      const current = latest.get(payment.client_id);
      if (!current || sortKey(payment) > sortKey(current)) latest.set(payment.client_id, payment);
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
      matched: toWrite.filter((p) => p.client_id).length,
      clientsUpdated: updated,
      unmatched,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error inesperado.';
    // El fallo se guarda en la integración para que la pantalla lo enseñe aunque
    // el entrenador cierre el navegador a mitad.
    try {
      const { integrationId } = await request.clone().json();
      if (integrationId) {
        await asService
          .from('integrations')
          .update({ status: 'error', last_error: message })
          .eq('id', integrationId);
      }
    } catch {
      // El cuerpo ya se consumió o no era JSON: no hay nada que registrar.
    }
    return json({ error: message }, 400);
  }
});
