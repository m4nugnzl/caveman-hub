/**
 * La radiografía, servida a quien administra la plataforma.
 *
 * ══ Por qué esto existe, si el informe ya se generaba en local ══════════════
 *
 * `docs/observabilidad.md` §2 decidió que el informe viviera FUERA de la
 * aplicación, por tres razones. Dos han caducado —la que decidía era «no hay
 * servidor propio donde guardar una clave», y este archivo es la prueba de que
 * ya lo hay— y la tercera es la que gobierna todo lo de abajo.
 *
 * El razonamiento no está aquí: está en `src/domain/radiografia/`, y es
 * exactamente el mismo que ejecuta `npm run radiografia`. Aquí solo se abre la
 * puerta, se recoge y se contesta. Ver `docs/plataforma.md`.
 *
 * ══ LA PUERTA, que es lo único delicado de todo esto ════════════════════════
 *
 * La respuesta lleva el estado de seguridad de la base y las cifras del negocio
 * en la misma carga. La comprobación de quién puede pedirla tiene tres
 * propiedades, y las tres son deliberadas:
 *
 *   1. **No pasa por RLS.** `observabilidad.md` §2.3 tiene razón: una política
 *      mal escrita puede publicar el mapa de la seguridad, y la 0046 documenta
 *      que en este proyecto RLS estuvo apagado en nueve tablas durante meses sin
 *      que nadie lo viera. Aquí no hay ninguna política que escribir mal:
 *      `platform_admins` se lee con `service_role`, que no pasa por el muro.
 *
 *   2. **No llama a `is_platform_admin()`.** Existe desde la 0034 y sería lo
 *      cómodo. No se usa porque depende de un GRANT y de que su cuerpo siga
 *      siendo el que era, y la 0069 documenta que en este proyecto una función
 *      se ha repegado mal desde el panel TRES veces. La puerta no puede
 *      depender de algo que se rompe por ese camino. Se lee la tabla.
 *
 *   3. **Va antes de tocar un solo dato.** Nada se recoge hasta que se sabe
 *      quién pregunta. Si la comprobación se hiciera después, un fallo en
 *      cualquier punto intermedio ya habría leído lo que no debía.
 *
 * ══ Lo único que escribe, y por qué está aquí y no en otra función ═════════
 *
 * `accion: 'aceptar'` añade filas a `platform_acceptances`. Nada más: ni
 * instantáneas —eso lo sigue haciendo `npm run radiografia`— ni ninguna otra
 * tabla.
 *
 * Podría vivir en su propia función y no lo hace, porque la puerta sería
 * EXACTAMENTE la misma y dos puertas iguales divergen: la de arriba es una
 * lección que este proyecto ya pagó tres veces (migración 0069). Una sola
 * comprobación, un solo sitio donde mirarla.
 *
 * ── Por qué el nivel y el objeto NO llegan del navegador ────────────────────
 * Podrían: la pantalla los tiene delante. Pero entonces el registro de por qué
 * se dio por bueno un hallazgo crítico llevaría dentro lo que el cliente dijera
 * que era, y ese registro existe justo para poder revisarlo dentro de seis
 * meses. Se vuelve a leer el catálogo —una llamada, sin tablas— y se cogen de
 * ahí. De paso, una clave que ya no existe no se puede aceptar.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { componer } from '../../../src/domain/radiografia/componer.js';
import { claveDe, estadoDeFilas } from '../../../src/domain/radiografia/estado.js';
import { leerTodo } from '../../../src/domain/radiografia/lectura.js';
import { planDe } from '../../../src/domain/radiografia/recogida.js';

/*
  El catálogo —qué pantallas y qué campos OFRECE la aplicación— sale del código
  fuente, y aquí no hay código fuente: hay un despliegue. Lo genera
  `scripts/generar-catalogo.mjs` y lo mantiene al día `catalogo.test.js`, que
  falla si este archivo se queda viejo. Sin él, las dos listas negativas del
  informe («pantallas que no ha abierto nadie», «pliegues que no mide nadie»)
  saldrían vacías, y una lista vacía se lee como «no falta nada».
*/
import catalogo from './catalogo.json' with { type: 'json' };

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
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      /* Esto no se guarda en ninguna caché intermedia. Lleva nombres, correos y
         el estado de seguridad de la base: el sitio donde menos falta hace que
         se quede una copia es un intermediario que nadie administra. */
      'Cache-Control': 'no-store',
    },
  });

Deno.serve(async (request) => {
  /* El preflight va antes de cualquier comprobación de sesión: no lleva
     `Authorization`, así que exigirla aquí rompería la llamada real. */
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  /* Un solo cliente, y con la clave de servicio. No hay «cliente del usuario»
     aquí a propósito: nada de lo que se lee debe pasar por RLS, porque nada de
     esto lo puede leer un usuario normal ni debería poder. Lo único que se
     necesita del que llama es SU IDENTIDAD, y para eso está `getUser`. */
  const supabase = createClient(url, service, { auth: { persistSession: false } });

  /* ── La puerta ─────────────────────────────────────────────────────────── */

  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data: quien, error: errorSesion } = await supabase.auth.getUser(token);
  if (errorSesion || !quien?.user) return json({ error: 'Sesión no válida.' }, 401);

  const { data: admin, error: errorAdmin } = await supabase
    .from('platform_admins')
    .select('profile_id')
    .eq('profile_id', quien.user.id)
    .maybeSingle();

  /*
    Un fallo AL COMPROBAR no es un «no», pero se contesta que no. La diferencia
    importa para quien depura y no para quien pregunta: si la tabla no se puede
    leer, lo que no se sabe es si esta persona es administradora, y en la duda
    esta respuesta no sale. Fallar abierto aquí sería publicar el informe cada
    vez que la base tenga un mal minuto.
  */
  if (errorAdmin) return json({ error: 'No se ha podido comprobar el permiso.' }, 503);
  if (!admin) return json({ error: 'Esto no es para tu cuenta.' }, 403);

  /* ── A partir de aquí ya se sabe quién pregunta ────────────────────────── */

  const cuerpo = await request.json().catch(() => ({}));

  /* ── Aceptar hallazgos ─────────────────────────────────────────────────── */

  if (cuerpo?.accion === 'aceptar') {
    const claves: string[] = Array.isArray(cuerpo.claves) ? cuerpo.claves : [];
    const motivo = String(cuerpo.motivo ?? '').trim();

    if (claves.length === 0) return json({ error: 'No has elegido ningún hallazgo.' }, 400);

    /*
      El motivo es obligatorio y se comprueba aquí ADEMÁS de en el CHECK de la
      0074. No es duplicar la regla: la base la impone y esta función la
      EXPLICA. Un `violates check constraint` no le dice a nadie que lo que
      falta es escribir por qué.
    */
    if (motivo.length < 3) {
      return json(
        {
          error:
            'Falta el motivo. Dar por bueno un hallazgo de seguridad sin dejar dicho por qué es cómo empiezan los agujeros que luego nadie sabe explicar.',
        },
        400
      );
    }

    /* El nivel y el objeto se cogen del catálogo, no de lo que diga el cliente:
       ver la cabecera. Una sola llamada, sin leer ninguna tabla. */
    const seg = await supabase.rpc('radiografia_seguridad');
    if (seg.error) {
      return json({ error: `No se ha podido releer el estado de seguridad: ${seg.error.message}` }, 503);
    }

    /** Lo que devuelve `radiografia_seguridad()` (migración 0053). */
    type Hallazgo = { area: string; objeto: string; detalle: string; nivel: string };

    const porClave = new Map<string, Hallazgo>(
      ((seg.data || []) as Hallazgo[]).map((h) => [claveDe(h), h])
    );

    const filas = [];
    const desconocidas = [];
    for (const clave of claves) {
      const hallazgo = porClave.get(clave);
      /* Una clave que ya no existe NO se acepta en silencio: o el hallazgo se
         arregló entre que se pintó la pantalla y se pulsó el botón, o cambió su
         texto y ya es otro. Aceptarla dejaría una fila que no corresponde a
         nada y que taparía el hallazgo de verdad si volviera. */
      if (!hallazgo) {
        desconocidas.push(clave);
        continue;
      }
      filas.push({
        clave,
        motivo,
        nivel: hallazgo.nivel,
        objeto: hallazgo.objeto,
        /* Quién. Es lo que el diff de git nunca decía. */
        quien: quien.user.id,
      });
    }

    if (filas.length > 0) {
      const { error: errorInsert } = await supabase.from('platform_acceptances').insert(filas);
      if (errorInsert) {
        return json({ error: `No se han podido guardar: ${errorInsert.message}` }, 500);
      }
    }

    return json({ aceptadas: filas.length, desconocidas });
  }

  /* ── El informe ────────────────────────────────────────────────────────── */

  try {
    const dias = Math.max(1, Math.min(365, Number(cuerpo?.dias) || 30));
    /* Los programas son el JSONB de varios MB por cliente de `auditoria.md`
       §1.4. Desde el móvil, pedirlos es lo que separa una respuesta de dos
       segundos de una de treinta, así que se pueden dejar fuera. */
    const conProgramas = cuerpo?.programas !== false;

    const ahora = new Date();
    const generado = ahora.toISOString();
    const desde = new Date(ahora.getTime() - dias * 86400000).toISOString();

    const avisos: string[] = [];

    /* ── Lo que solo sabe el catálogo de Postgres ────────────────────────── */

    const seg = await supabase.rpc('radiografia_seguridad');
    const vol = await supabase.rpc('radiografia_volumen');

    /* Un fallo aquí NO se traga en silencio: toda la sección de seguridad puede
       desaparecer por una migración sin aplicar, y un informe sin esa sección se
       lee exactamente igual que uno donde todo está bien. */
    const avisoSeguridad = seg.error
      ? `No se ha podido leer el estado de seguridad: ${seg.error.message}. ` +
        '¿Está aplicada la migración 0053? Sin ella esta sección no existe, y no ' +
        'existir NO significa que no haya nada que mirar.'
      : null;
    if (vol.error) {
      avisos.push(`No se ha podido leer el volumen de las tablas: ${vol.error.message}`);
    }

    /* ── Las tablas, con el mismo plan que la terminal ───────────────────── */

    const { tablas, avisos: avisosPlan } = planDe({ desde, conProgramas });
    avisos.push(...avisosPlan);

    const { datos, avisos: avisosLectura } = await leerTodo(supabase, tablas);
    avisos.push(...avisosLectura);

    /* De aquí sale `last_sign_in_at`, que es la única señal de que una cuenta
       sigue viva que existe desde el primer día y para todo el mundo. */
    const auth = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (auth.error) {
      avisos.push(
        `No se han podido leer las cuentas de auth (${auth.error.message}): la columna «última ` +
          'entrada» sale vacía, y sin ella no se sabe qué cuentas están dormidas.'
      );
    }
    const sesiones = (auth.data?.users || []).map((u) => ({
      id: u.id,
      last_sign_in_at: u.last_sign_in_at,
    }));

    /* ── Lo aceptado y lo de la vez anterior (migración 0074) ────────────── */

    const snapshots = await supabase
      .from('platform_snapshots')
      .select('dia, generado, metricas, claves');
    const aceptaciones = await supabase
      .from('platform_acceptances')
      .select('id, clave, motivo, nivel, objeto, quien, at, retira');

    /*
      Que esto falle es más grave de lo que parece, y por eso se dice. Sin lo
      aceptado, los hallazgos de seguridad ya revisados vuelven a salir como
      pendientes: la lista pasa de cinco cosas a doscientas y deja de mirarse,
      que es exactamente el fallo que la tabla existe para evitar.
    */
    if (snapshots.error || aceptaciones.error) {
      avisos.push(
        `No se ha podido leer la memoria del informe (${
          snapshots.error?.message || aceptaciones.error?.message
        }). ¿Está aplicada la migración 0074? Sin ella no hay nada aceptado ni nada ` +
          'con lo que comparar: los hallazgos ya revisados vuelven a salir como pendientes ' +
          'y la comparación con el informe anterior sale vacía.'
      );
    }

    const estado = estadoDeFilas({
      snapshots: snapshots.data || [],
      aceptaciones: aceptaciones.data || [],
    });

    /* ── El informe, montado por el mismo código que la terminal ─────────── */

    const informe = componer({
      datos,
      sesiones,
      seguridad: seg.data || [],
      avisoSeguridad,
      volumen: vol.data || [],
      catalogo,
      estado,
      proyecto: new URL(url).host,
      generado,
      dias,
      avisos,
    });

    return json(informe);
  } catch (e) {
    /*
      El mensaje va al registro entero y al que pregunta le llega recortado. No
      es paranoia genérica: aquí un error de Postgres puede llevar dentro un
      nombre de columna, un fragmento de consulta o el valor de una fila.
    */
    console.error('radiografia', e);
    return json({ error: 'El informe no se ha podido montar. Mira el registro de la función.' }, 500);
  }
});
