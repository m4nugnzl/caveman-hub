/**
 * Copia de seguridad completa: filas y archivos.
 *
 * ══ Por qué existe, habiendo ya una copia en la aplicación ═════════════════
 *
 * La de Ajustes → Copia de seguridad es un volcado que el entrenador se descarga
 * a mano, y su propia pantalla dice lo que no hace: no es automática, no incluye
 * las fotos y no se restaura sola. Sirve para llevarse los datos; no para
 * sobrevivir a un accidente.
 *
 * Esta sí. Corre fuera del navegador, se puede programar, y **se trae los
 * archivos**, que son la mitad irrecuperable: una fila de `progress_photos` sin
 * su imagen no es nada, y las fotos de progreso de un año no se pueden repetir.
 *
 * ══ Lo que hace falta para restaurar, y dónde está cada pieza ══════════════
 *
 *   · El ESQUEMA está en git: `supabase/schema.sql` y `supabase/migrations/`.
 *   · Los DATOS, aquí.
 *   · Los ARCHIVOS, aquí.
 *
 * Las tres juntas reconstruyen el proyecto entero en una Supabase nueva. Por eso
 * esto no intenta ser un `pg_dump`: el esquema ya está versionado y escrito para
 * leerse, y depender de `pg_dump` obligaría a tener las herramientas de Postgres
 * instaladas en la máquina que hace la copia.
 *
 * ══ Uso ═══════════════════════════════════════════════════════════════════
 *
 *   npm run backup                     copia completa en ./copias/<fecha>
 *   npm run backup -- --sin-fotos      solo las filas: rápido, para el día a día
 *   npm run backup -- --salida D:/x    otra carpeta (un disco externo, por ejemplo)
 *   npm run backup -- --verificar ./copias/2026-08-13T09-00-00
 *
 * Necesita dos variables, en `.env.backup` o en el entorno:
 *
 *   SUPABASE_URL=https://tu-proyecto.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * ══ Por qué la service_role key y qué implica ══════════════════════════════
 *
 * Una copia hecha con la `anon key` saldría **vacía y sin ningún error**: RLS
 * filtraría todas las filas y el archivo tendría listas de cero elementos con
 * aspecto de haber funcionado. Es el peor fallo posible en una copia —el que solo
 * se descubre el día que hace falta—, así que el script comprueba la clave antes
 * de empezar y se niega a seguir si no es la que salta las políticas.
 *
 * La consecuencia es que esa clave, y la carpeta que genera, son lo más sensible
 * del proyecto: filas de salud de personas concretas y sus fotos, sin ninguna
 * política delante. `.gitignore` cubre las dos; el resto es dónde las guardes.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/*
  Todas las tablas del esquema menos una.

  `integration_secrets` se queda fuera A PROPÓSITO: guarda los tokens de Notion y
  Stripe en claro. Copiarlos convertiría cada copia de seguridad en un llavero de
  credenciales vivas repartido por discos externos y carpetas de la nube. Se
  vuelven a pegar en un minuto desde Ajustes → Integraciones; una filtración no se
  arregla en un minuto.

  Las que no existan —migraciones sin aplicar— no son un error: se anotan como
  omitidas y la copia sigue. Una copia que se aborta porque falta una tabla
  opcional es una copia que no se hace.
*/
const TABLES = [
  'profiles',
  'clients',
  'workout_data',
  'anthropometry',
  'nutrition_plans',
  'progress_photos',
  'check_ins',
  'client_events',
  'exercises',
  'foods',
  'teams',
  'team_members',
  'client_invites',
  'client_consents',
  'integrations',
  'client_payments',
  'client_external_refs',
  'review_links',
  'audit_log',
  'videos',
];

const BUCKET = 'client-media';

/* PostgREST devuelve como mucho 1000 filas por petición, y lo hace SIN avisar de
   que hay más. Una cartera grande cabría de sobra en el límite y la copia saldría
   truncada con aspecto de completa. De ahí que se pida por páginas siempre. */
const PAGE = 1000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const log = (...parts) => console.log(...parts);
const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

// ── Comprobación de la clave ───────────────────────────────────────────────

/**
 * ¿Es la clave que salta RLS?
 *
 * Las claves de Supabase son JWT: el cuerpo lleva `role`, y en la de servicio vale
 * `service_role`. Se mira sin verificar la firma, que aquí no hace falta —no se
 * está autenticando a nadie, se está evitando un error de copiar y pegar—.
 */
const isServiceRole = (key) => {
  try {
    const body = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return body.role === 'service_role';
  } catch {
    // Formato desconocido: puede ser una clave nueva de Supabase (`sb_secret_…`),
    // que no es un JWT. No se puede afirmar que sea la equivocada, así que pasa.
    return true;
  }
};

// ── Volcado ────────────────────────────────────────────────────────────────

const dumpTable = async (supabase, table) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return { skipped: error.message };
      return { error: error.message };
    }

    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows };
};

/**
 * Las cuentas de `auth`, que no salen por la API de tablas.
 *
 * ── Por qué sin esto la copia no se puede restaurar ─────────────────────────
 * `profiles.id` apunta a `auth.users`, y `clients.client_profile_id` también. Ese
 * esquema no lo expone PostgREST, así que una copia de solo las tablas públicas
 * deja miles de filas señalando a identificadores que ya no existen en ningún
 * sitio: no hay forma de saber que la ficha de Marta era de la cuenta de Marta.
 *
 * Lo que se guarda es el PADRÓN —identificador, email, cuándo se creó—, que es lo
 * que permite reconstruir esa correspondencia.
 *
 * ── Lo que NO trae, y no puede traer ────────────────────────────────────────
 * Las contraseñas. La API de administración no devuelve sus hashes, y es lo
 * correcto. Restaurar en un proyecto nuevo significa crear las cuentas otra vez
 * con estos emails y que cada uno pase por «he olvidado mi contraseña».
 */
const dumpAuthUsers = async (supabase) => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) return { error: error.message };

    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        user_metadata: u.user_metadata,
      }))
    );
    if (data.users.length < PAGE) break;
  }
  return { rows: users };
};

/** Recorre el bucket entero. La estructura es `<clientId>/photos/<semana>/<archivo>`. */
const listFiles = async (supabase, prefix = '') => {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: PAGE });
  if (error) throw new Error(`no se pudo listar «${prefix || '/'}»: ${error.message}`);

  const files = [];
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Sin `id` es una carpeta. Es la misma señal que usa la aplicación al borrar.
    if (entry.id) files.push({ path, size: entry.metadata?.size ?? null });
    else files.push(...(await listFiles(supabase, path)));
  }
  return files;
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

// ── Verificación ───────────────────────────────────────────────────────────

/**
 * Vuelve a leer una copia y comprueba que está entera.
 *
 * Una copia que nadie ha comprobado nunca no es una copia: es la creencia de tener
 * una. Esto no restaura —eso se hace a mano y está en `docs/copias.md`—, pero
 * responde a lo que se puede responder sin tocar la base: que cada archivo sigue
 * ahí, con el tamaño y el contenido con los que se guardó.
 */
const verify = async (dir) => {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const problems = [];

  for (const [table, count] of Object.entries(manifest.tablas)) {
    try {
      const rows = JSON.parse(await readFile(join(dir, 'datos', `${table}.json`), 'utf8'));
      if (rows.length !== count) problems.push(`${table}: ${rows.length} filas, el manifiesto dice ${count}`);
    } catch (e) {
      problems.push(`${table}: no se puede leer (${e.message})`);
    }
  }

  for (const file of manifest.archivos) {
    try {
      const buffer = await readFile(join(dir, 'fotos', file.path));
      if (buffer.length !== file.bytes) problems.push(`${file.path}: ${buffer.length} bytes, se guardaron ${file.bytes}`);
      else if (sha256(buffer) !== file.sha256) problems.push(`${file.path}: el contenido ha cambiado`);
    } catch {
      problems.push(`${file.path}: falta`);
    }
  }

  log(`\nCopia del ${manifest.generado}`);
  log(`  ${Object.keys(manifest.tablas).length} tablas · ${manifest.archivos.length} archivos`);

  if (problems.length === 0) {
    log('\n✓ Íntegra: todas las filas y todos los archivos están donde dice el manifiesto.');
    return;
  }
  console.error(`\n✗ ${problems.length} problema(s):`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
};

// ── Principal ──────────────────────────────────────────────────────────────

const main = async () => {
  const toVerify = value('--verificar');
  if (toVerify) return verify(resolve(toVerify));

  /* La URL no es un secreto y ya está en `.env` como `VITE_SUPABASE_URL`: es el
     mismo proyecto. Repetirla en `.env.backup` solo añadiría un sitio donde se
     puede quedar desactualizada al cambiar de proyecto. Así lo único que hay que
     poner aparte es la clave, que es lo único que de verdad va aparte. */
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    fail(
      'No hay ninguna URL de Supabase.\n' +
        '  Se busca SUPABASE_URL y, si no está, VITE_SUPABASE_URL de tu .env.'
    );
  }

  if (!key) {
    fail(
      'Falta SUPABASE_SERVICE_ROLE_KEY.\n' +
        `  La URL sí está (${new URL(url).host}); solo falta la clave.\n\n` +
        '  1. Supabase Dashboard → Settings → API → service_role, «Reveal».\n' +
        '  2. Pégala en .env.backup, en la raíz del proyecto:\n\n' +
        '       SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n' +
        '  Ese archivo ya está en .gitignore. No es la anon key: esta salta todas\n' +
        '  las políticas de seguridad, así que no va al navegador ni al repositorio.'
    );
  }

  /*
    Supabase tiene dos generaciones de claves conviviendo, y las que valen aquí son
    las de servidor de cada una:

      eyJ…              JWT heredada. La `anon` y la `service_role` tienen esta
                        forma, y se distinguen por el `role` de dentro (más abajo).
      sb_secret_…       La nueva de servidor. Sustituye a la `service_role`.
      sb_publishable_…  La nueva de navegador. NO vale: es la que sustituye a la
                        anon, y con ella la copia saldría vacía.

    Comprobar la forma aquí evita recorrer las veinte tablas para terminar con
    veinte líneas de «Invalid API key», que no dicen cuál es el problema.
  */
  if (key.startsWith('sb_publishable_')) {
    fail(
      'Esa es la clave publicable, no la secreta.\n' +
        '  `sb_publishable_…` es la que sustituye a la anon: va en el navegador y\n' +
        '  respeta las políticas de seguridad, así que la copia saldría vacía.\n\n' +
        '  Necesitas la de al lado: Settings → API Keys → Secret keys → `sb_secret_…`.'
    );
  }

  if (!/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key) && !key.startsWith('sb_secret_')) {
    fail(
      'Eso no parece una clave de Supabase.\n' +
        '  ¿Has dejado el marcador de .env.backup sin sustituir, o has pegado la URL?\n\n' +
        '  Settings → API Keys. Vale cualquiera de las dos:\n' +
        '    · pestaña «API keys» → Secret keys → `sb_secret_…`  (recomendada)\n' +
        '    · pestaña «Legacy API keys» → `service_role` → «Reveal» → `eyJ…`'
    );
  }

  if (!isServiceRole(key)) {
    fail(
      'Esa es la anon key, no la service_role.\n' +
        '  Con ella la copia saldría VACÍA y sin ningún error: las políticas de\n' +
        '  seguridad filtran todas las filas cuando no hay usuario. Es justo el\n' +
        '  fallo que solo se descubre el día que hace falta la copia.'
    );
  }

  const withPhotos = !flag('--sin-fotos');
  const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  const out = resolve(value('--salida') || 'copias', stamp);

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  log(`Copia de ${new URL(url).host}`);
  log(`Destino: ${out}\n`);

  await mkdir(join(out, 'datos'), { recursive: true });

  const manifest = {
    generado: new Date().toISOString(),
    proyecto: new URL(url).host,
    tablas: {},
    omitidas: {},
    archivos: [],
    fotos_incluidas: withPhotos,
  };
  const problems = [];

  /* Va primero porque es de lo que cuelga todo lo demás: si esto falla, la copia
     no vale para restaurar y conviene verlo en la primera línea. */
  const auth = await dumpAuthUsers(supabase);
  if (auth.error) {
    problems.push(`cuentas: ${auth.error}`);
    log(`  ✗  ${'auth.users'.padEnd(22)} ${auth.error}`);
  } else {
    await writeFile(join(out, 'datos', '_auth_users.json'), JSON.stringify(auth.rows, null, 2));
    manifest.tablas._auth_users = auth.rows.length;
    log(`  ✓  ${'auth.users'.padEnd(22)} ${auth.rows.length} cuentas (sin contraseñas)`);
  }

  for (const table of TABLES) {
    const result = await dumpTable(supabase, table);

    if (result.skipped) {
      manifest.omitidas[table] = 'no existe en este proyecto';
      log(`  ·  ${table.padEnd(22)} omitida (no existe)`);
      continue;
    }
    if (result.error) {
      problems.push(`${table}: ${result.error}`);
      log(`  ✗  ${table.padEnd(22)} ${result.error}`);
      continue;
    }

    await writeFile(join(out, 'datos', `${table}.json`), JSON.stringify(result.rows, null, 2));
    manifest.tablas[table] = result.rows.length;
    log(`  ✓  ${table.padEnd(22)} ${result.rows.length} filas`);
  }

  if (withPhotos) {
    log('\nArchivos:');
    try {
      const files = await listFiles(supabase);
      let done = 0;

      for (const file of files) {
        const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
        if (error) {
          problems.push(`${file.path}: ${error.message}`);
          continue;
        }

        const buffer = Buffer.from(await data.arrayBuffer());
        const target = join(out, 'fotos', file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, buffer);

        manifest.archivos.push({ path: file.path, bytes: buffer.length, sha256: sha256(buffer) });
        done += 1;
        if (done % 25 === 0) log(`  ${done}/${files.length}…`);
      }
      log(`  ✓  ${done} de ${files.length} archivos`);
    } catch (e) {
      problems.push(`almacenamiento: ${e.message}`);
      log(`  ✗  ${e.message}`);
    }
  } else {
    log('\nArchivos: omitidos (--sin-fotos)');
  }

  manifest.problemas = problems;
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  /* La nota que se encuentra dentro de la carpeta dentro de tres años, cuando ya
     nadie recuerde qué es esto ni de qué proyecto salió. */
  await writeFile(
    join(out, 'LEEME.txt'),
    [
      'Copia de seguridad de Caveman Hub',
      `Proyecto: ${manifest.proyecto}`,
      `Generada: ${manifest.generado}`,
      '',
      'CONTIENE DATOS DE SALUD de personas concretas: pesos, perímetros, pliegues',
      'cutáneos y fotografías de sus cuerpos. Guárdala cifrada, no la subas a una',
      'carpeta compartida y bórrala cuando deje de hacer falta.',
      '',
      'Para restaurar hace falta además el esquema, que está en el repositorio:',
      'supabase/schema.sql y supabase/migrations/. El procedimiento está en',
      'docs/copias.md.',
      '',
      'Comprobar que sigue íntegra:',
      `  npm run backup -- --verificar "${out}"`,
      '',
      'NO incluye los tokens de las integraciones (Notion, Stripe): se vuelven a',
      'pegar a mano desde Ajustes.',
      '',
      'NO incluye las contraseñas: no se pueden exportar. En datos/_auth_users.json',
      'están las cuentas con su email y su identificador, que es lo que hace falta',
      'para volver a enlazar cada ficha con su persona.',
    ].join('\n')
  );

  const bytes = manifest.archivos.reduce((sum, f) => sum + f.bytes, 0);
  const rows = Object.values(manifest.tablas).reduce((sum, n) => sum + n, 0);

  log(`\n${rows} filas · ${manifest.archivos.length} archivos · ${(bytes / 1024 / 1024).toFixed(1)} MB`);

  if (problems.length > 0) {
    /* Salir con error es lo que permite que una tarea programada avise. Una copia
       incompleta que termina en verde es una copia en la que se va a confiar. */
    console.error(`\n✗ Terminó con ${problems.length} problema(s). La copia está INCOMPLETA:`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }

  log('\n✓ Copia completa.');
};

main().catch((e) => fail(e?.message || String(e)));
