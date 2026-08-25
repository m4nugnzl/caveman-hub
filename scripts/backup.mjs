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
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { resolverCredenciales } from './credenciales.mjs';

/*
  Lo que se copia.

  ══ Esta lista se desfasó, y era invisible ══════════════════════════════════

  Se escribió a mano y no se actualizó con las migraciones posteriores. Al probar
  por primera vez una restauración aparecieron CUATRO tablas con datos reales que
  no se copiaban:

    · `client_phases`      el roadmap de cada cliente (0028). Trabajo del
                           entrenador, uno por cliente, irrecuperable.
    · `team_subscriptions` quién paga, qué plan y hasta cuándo (0019).
                           Restaurar sin esto deja a todo el mundo sin plan.
    · `support_tickets`    las conversaciones con soporte (0034), que es donde
    · `support_messages`   está la mitad del contexto de una incidencia.

  Ninguna daba error: la copia salía «correcta», con su manifiesto y su
  verificación en verde, y sin ellas dentro. Es el mismo fallo que el script dice
  evitar en su cabecera —una copia vacía con aspecto de haber funcionado— pero por
  tabla en vez de por todo.

  Para que no vuelva a pasar, la lista de abajo ya no es la única fuente: hay una
  prueba (`supabase/tests/copia.test.js`) que compara estas dos listas contra el
  esquema REAL y falla si aparece una tabla que no esté en ninguna. Añadir una
  tabla obliga a decidir si entra en la copia; olvidarse deja de ser posible.
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
  'client_phases',
  /* Lesiones, patologías y alergias (0077). Son datos de salud, así que si esta
     tabla se quedara fuera, una restauración devolvería a los clientes sin lo
     único de su ficha que condiciona lo que se les prescribe — y sin ruido: la
     aplicación trata la ausencia como «no tiene ninguno». */
  'client_conditions',
  /* Las fotos de la maquinaria de su gimnasio (0079). Las FOTOS viven en el
     bucket y no aquí; lo que se copia son las filas, sin las cuales las
     imágenes quedan en el almacén sin nada que diga de quién son. */
  'client_equipment',
  'exercises',
  'foods',
  'teams',
  'team_members',
  'team_subscriptions',
  'client_invites',
  'client_consents',
  'integrations',
  'client_payments',
  'client_external_refs',
  'review_links',
  'support_tickets',
  'support_messages',
  'platform_admins',
  /*
    Las dos de la radiografía (0074). Entran, y merece la pena decir por qué,
    porque la intuición dice lo contrario: `product_events` y `app_errors` están
    EXCLUIDAS por ser telemetría desechable, y esto se le parece.

    No es lo mismo. Aquellas se pueden volver a generar usando la aplicación;
    éstas no se pueden generar de ninguna manera. `platform_snapshots` es la
    única copia que existe de cuántos clientes había en marzo — recalcularlo es
    imposible porque los datos de marzo ya no existen. Y `platform_acceptances`
    es el registro de qué hallazgos de seguridad se dieron por buenos y por qué:
    perderlo hace que todos vuelvan a salir como nuevos y que nadie recuerde
    cuáles ya se habían mirado.
  */
  'platform_snapshots',
  'platform_acceptances',
  'audit_log',
];

/*
  Lo que se deja fuera A PROPÓSITO, y por qué.

  Existe como lista y no como comentario porque la prueba la lee: dejar una tabla
  sin copiar tiene que ser una decisión escrita, no un olvido.
*/
export const EXCLUIDAS = {
  integration_secrets:
    'Guarda los tokens de Notion y Stripe en claro. Copiarlos convertiría cada copia en un ' +
    'llavero de credenciales vivas repartido por discos externos. Se vuelven a pegar en un ' +
    'minuto desde Ajustes → Integraciones; una filtración no se arregla en un minuto.',
  catalog_exercises: 'Catálogo común, lo recrea la migración 0033. No es de nadie.',
  catalog_foods: 'Catálogo común, lo recrea la migración 0033. No es de nadie.',
  plan_limits: 'Los límites y precios de cada plan, los recrea la 0019. Configuración, no datos.',
  product_events:
    'Instrumentación de uso (0045). Es desechable por diseño y se poda a los seis meses: ' +
    'restaurarla no devuelve nada que nadie vaya a echar de menos.',
  app_errors:
    'Registro de fallos (0052). La misma categoría que product_events y con un plazo aún más ' +
    'corto —90 días—: un fallo de hace tres meses o está arreglado o sigue ocurriendo hoy, y en ' +
    'los dos casos su copia no sirve para nada. Restaurar una instalación no necesita saber qué ' +
    'se rompió en la anterior.',
  platform_alerts:
    'Lo que el bot de Telegram ya ha avisado (0075). Es lo único de las cuatro tablas de ' +
    'plataforma que NO entra en la copia, y la diferencia importa: las otras tres guardan ' +
    'medidas que no se pueden recalcular y decisiones que no se pueden reconstruir; ésta ' +
    'guarda qué mensajes se mandaron. Perderla cuesta un mensaje: el primer aviso tras ' +
    'restaurar vuelve a fijar la línea base y a partir de ahí sigue igual.',
  videos:
    'La corrección de vídeos se retiró del producto (auditoria.md §2) y la tabla la borra la ' +
    'migración 0057, que se niega a hacerlo si tiene una sola fila. Se queda aquí y no en TABLES ' +
    'para que la copia siga siendo correcta en las dos situaciones: antes de aplicar la 0057 la ' +
    'tabla existe y está vacía, y después no existe.',
};

/*
  Las tablas que no existan —migraciones sin aplicar— no son un error: se anotan
  como omitidas y la copia sigue. Una copia que se aborta porque falta una tabla
  opcional es una copia que no se hace.
*/
export { TABLES };

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

/*
  ══ Una opción desconocida PARA el script ══════════════════════════════════

  Antes se ignoraba, y eso tiene una consecuencia peor de lo que parece: como la
  copia completa es lo que se hace por defecto, escribir mal una opción
  —`--ayuda`, `--sin-foto`, `--verificr`— no daba ningún aviso y lanzaba una copia
  ENTERA de producción, con sus gigas de fotos y sus datos de salud, contra el
  disco. Pasó exactamente eso al probar el script.

  Lo caro y lo sensible no puede ser nunca lo que ocurre por descuido. Ahora una
  opción que no se reconoce para el proceso y enseña las que hay.
*/
const OPCIONES = ['--sin-fotos', '--salida', '--verificar', '--ayuda', '-h', '--help'];

const AYUDA = [
  'Copia de seguridad de Caveman Hub.',
  '',
  '  npm run backup                        copia completa en ./copias/<fecha>',
  '  npm run backup -- --sin-fotos         solo las filas: rápido, para el día a día',
  '  npm run backup -- --salida D:/copias  otra carpeta (un disco externo)',
  '  npm run backup -- --verificar <ruta>  recomprueba una copia ya hecha',
  '',
  'Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ver docs/copias.md).',
].join('\n');

/*
  Solo se ejecuta cuando se llama al script directamente.

  Importado —lo hace `supabase/tests/copia.test.js` para leer `TABLES`— los
  argumentos de la línea de órdenes son los de QUIEN importa: los de vitest, que
  incluyen `--config`. Sin esta condición, la comprobación de opciones de abajo
  vería `--config` como una opción desconocida y mataría las pruebas.
*/
const llamadoDirectamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (llamadoDirectamente) {
  const desconocidas = args.filter((a) => a.startsWith('-') && !OPCIONES.includes(a));
  if (desconocidas.length > 0) {
    console.error(`\n✗ No conozco ${desconocidas.join(', ')}.\n\n${AYUDA}`);
    process.exit(2);
  }
  if (flag('--ayuda') || flag('-h') || flag('--help')) {
    console.log(AYUDA);
    process.exit(0);
  }
}

const log = (...parts) => console.log(...parts);
const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
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

  /* Las comprobaciones viven en `scripts/credenciales.mjs` desde que las
     necesitan dos scripts. Son exactamente las mismas: lo que se evita es que la
     segunda copia se quede atrás cuando Supabase vuelva a cambiar el formato de
     sus claves — que ya lo cambió una vez. */
  const { url, key, error } = resolverCredenciales({ para: 'la copia' });
  if (error) fail(error);

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

/*
  Y la copia, por el mismo motivo: solo si se le llama directamente.

  Antes corría con solo importarlo, así que este archivo no se podía leer desde
  ninguna otra parte: la prueba que comprueba que la copia cubre todas las tablas
  (`supabase/tests/copia.test.js`) importaba `TABLES`, el script arrancaba, no
  encontraba credenciales y llamaba a `process.exit(1)` en mitad de las pruebas.

  Un script que no se puede importar es un script que no se puede probar — y éste
  es justo el que nadie quiere descubrir roto el día que hace falta.
*/
if (llamadoDirectamente) {
  main().catch((e) => fail(e?.message || String(e)));
}
