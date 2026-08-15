/**
 * Restaurar una copia de seguridad.
 *
 * ══ Por qué esto existe ═════════════════════════════════════════════════════
 *
 * Porque había copia y no había forma de usarla. `docs/copias.md` §5 describía la
 * restauración en prosa: cinco pasos, con un orden de tablas que hay que respetar
 * y un detalle —recrear las cuentas conservando su `id`— que si se hace mal deja
 * todos los datos sin dueño. Eso es un procedimiento manual a ejecutar el peor
 * día del año, con prisa y probablemente de madrugada.
 *
 * Una copia que solo se puede restaurar a mano es media copia.
 *
 * ══ Qué restaura y en qué orden ════════════════════════════════════════════
 *
 *   1. Las CUENTAS de `auth`, con su identificador original.
 *   2. Las FILAS, en orden de dependencia (`profiles` → `teams` → … ).
 *   3. Los ARCHIVOS del bucket, en su ruta exacta.
 *
 * El orden de las tablas no es alfabético ni el de la copia: es el de las claves
 * foráneas. Cargar `clients` antes que `teams` falla, y falla a la mitad, dejando
 * una base peor que vacía.
 *
 * ══ Lo que NO restaura, y hay que rehacer a mano ═══════════════════════════
 *
 *   · Las CONTRASEÑAS. No se pueden exportar. Las cuentas se recrean con su id y
 *     su email, y cada persona entra con «he olvidado mi contraseña». Lo que
 *     importa es el id: `profiles.id`, `clients.client_profile_id` y media docena
 *     de columnas más apuntan a él.
 *   · Los TOKENS de integraciones, que la copia no trae a propósito.
 *   · El ESQUEMA. Va antes y está en git: `supabase/migrations/` en orden, más
 *     `supabase/bootstrap.sql`.
 *
 * ══ Uso ═══════════════════════════════════════════════════════════════════
 *
 *   npm run restore -- --ensayo ./copias/2026-08-15T20-18-16
 *   npm run restore -- --escribir ./copias/2026-08-15T20-18-16
 *
 * `--ensayo` no escribe nada: lee la copia, comprueba que está completa y dice
 * qué haría. Es el primer botón a propósito — el mismo criterio que el
 * normalizador de registros heredados, que también ensaya antes de tocar.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'client-media';

/*
  ══ El orden, que es lo único que no se puede improvisar ═══════════════════

  Las claves foráneas no tienen cascada en este esquema, así que una tabla
  cargada antes que su padre falla fila a fila. `profiles` va primero porque de
  ella cuelga casi todo; `clients` después de `teams` porque referencia a los
  dos; el resto cuelga de `clients` y entre ellas da igual.

  Es el mismo orden que `docs/copias.md` §5.3, aquí escrito una sola vez y en un
  sitio que se ejecuta en vez de leerse.
*/
const ORDEN = [
  'profiles',
  'teams',
  'team_members',
  'team_subscriptions',
  'platform_admins',
  'clients',
  'workout_data',
  'anthropometry',
  'nutrition_plans',
  'progress_photos',
  'check_ins',
  'client_events',
  'client_phases',
  'client_invites',
  'client_consents',
  'client_payments',
  'client_external_refs',
  'review_links',
  'integrations',
  'exercises',
  'foods',
  'support_tickets',
  'support_messages',
  'audit_log',
  'videos',
];

/*
  La clave por la que se reconcilia cada tabla al reescribirla.

  Casi todas tienen `id`, y por eso el primer intento usó `id` para todas y se
  estrelló en `team_members` —«column "id" does not exist»— con dos tablas ya
  restauradas y el resto sin tocar. Las cinco de abajo son las que no lo tienen:
  claves compuestas o naturales.

  Se escriben a mano en vez de consultarlas al catálogo porque una restauración
  tiene que funcionar con lo mínimo, y porque este mapa es la clase de dato que se
  quiere ver al leer el archivo. Si alguna vez no cuadra, el error dirá
  exactamente cuál — como dijo esta vez.
*/
const CLAVE = {
  team_members: 'team_id,profile_id',
  team_subscriptions: 'team_id',
  platform_admins: 'profile_id',
  client_external_refs: 'integration_id,external_key',
  plan_limits: 'plan',
};

/*
  Tablas cuyo `id` lo genera la base y NO admite que se le imponga uno.

  `audit_log.id` es `GENERATED ALWAYS AS IDENTITY` (migración 0017), así que
  Postgres rechaza el valor que trae la copia: «cannot insert a non-DEFAULT value
  into column id». Se restaura sin él y la base le pone otro.

  Es correcto porque **a ese id no apunta nadie**: el registro guarda qué tabla,
  qué cliente, quién y cuándo, y se consulta por cliente y fecha. Cambiar el
  número no cambia lo que dice.

  La contrapartida, y por eso está escrito: estas tablas se INSERTAN, no se
  reconcilian. Repetir la restauración duplica su contenido. Para un registro de
  auditoría es preferible a lo contrario —perderlo—, pero conviene saberlo antes
  de lanzar el mismo comando dos veces «por si acaso».
*/
const ID_GENERADO = new Set(['audit_log']);

const args = process.argv.slice(2);
const OPCIONES = ['--ensayo', '--escribir', '--ayuda', '-h', '--help'];

const AYUDA = [
  'Restaura una copia hecha con `npm run backup`.',
  '',
  '  npm run restore -- --ensayo <carpeta>     comprueba y dice qué haría (no escribe)',
  '  npm run restore -- --escribir <carpeta>   restaura de verdad',
  '',
  'Antes hay que tener el esquema puesto: las migraciones de supabase/migrations',
  'en orden, y supabase/bootstrap.sql. Ver docs/copias.md §5.',
  '',
  'Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
].join('\n');

const log = (...p) => console.log(...p);
const fail = (m) => {
  console.error(`\n✗ ${m}`);
  process.exit(1);
};

/** Las filas de una tabla, o `null` si esa tabla no está en la copia. */
const leeTabla = async (dir, tabla) => {
  try {
    return JSON.parse(await readFile(join(dir, 'datos', `${tabla}.json`), 'utf8'));
  } catch {
    return null;
  }
};

/*
  El tipo del archivo, deducido de su extensión.

  Hace falta porque el bucket declara una lista de tipos admitidos (migración
  0007), y subir un `Buffer` sin decir cuál es hace que se mande como
  `text/plain`: Storage lo rechaza con «mime type text/plain is not supported» y
  la restauración se queda sin fotos justo al final, con todas las filas ya
  puestas. Una fila de `progress_photos` sin su imagen no es nada.
*/
const TIPOS = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  webm: 'video/webm',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
};

const tipoDe = (ruta) => TIPOS[(/\.([a-z0-9]+)$/i.exec(ruta)?.[1] || '').toLowerCase()] || 'application/octet-stream';

/** Todos los archivos de `fotos/`, con su ruta relativa al bucket. */
const listaArchivos = async (raiz, base = '') => {
  const dir = join(raiz, base);
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entradas) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listaArchivos(raiz, rel)));
    else out.push(rel);
  }
  return out;
};

const main = async () => {
  const escribir = args.includes('--escribir');
  const carpeta = args.find((a) => !a.startsWith('-'));

  if (!carpeta) fail(`Falta la carpeta de la copia.\n\n${AYUDA}`);
  const dir = resolve(carpeta);
  if (!(await stat(dir).catch(() => null))) fail(`No encuentro ${dir}`);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('Falta SUPABASE_URL.');
  if (!key) fail('Falta SUPABASE_SERVICE_ROLE_KEY (ver docs/copias.md).');

  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')).valueOf();

  log(`\nCopia de ${manifest.proyecto}, hecha el ${manifest.generado}`);
  log(`Destino:  ${new URL(url).host}`);
  log(escribir ? '\n⚠️  MODO ESCRITURA\n' : '\n(ensayo: no se va a escribir nada)\n');

  /*
    Una copia que se generó con problemas no se restaura sin decirlo. Restaurar
    desde una copia incompleta es la forma más silenciosa de perder datos: queda
    una base que funciona y a la que le faltan cosas.
  */
  if (manifest.problemas?.length > 0) {
    log(`⚠️  Esta copia se generó con ${manifest.problemas.length} problema(s):`);
    for (const p of manifest.problemas) log(`   · ${p}`);
    if (escribir) fail('No se restaura una copia marcada como incompleta.');
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── 1. Las cuentas ───────────────────────────────────────────────────────
  const cuentas = (await leeTabla(dir, '_auth_users')) || [];
  log(`Cuentas:  ${cuentas.length}`);

  let creadas = 0;
  let existian = 0;
  if (escribir) {
    for (const u of cuentas) {
      /*
        Con su `id` original. Es lo único de este paso que no se puede repetir
        después: con identificadores nuevos, los datos restaurados no le
        pertenecen a nadie y no hay forma de recomponerlo.
      */
      const { error } = await db.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: true,
      });
      if (!error) creadas += 1;
      else if (/already|exists|registered|duplicate/i.test(error.message)) existian += 1;
      else fail(`Cuenta ${u.email}: ${error.message}`);
    }
    log(`          ${creadas} creadas, ${existian} ya estaban`);
  }

  // ── 2. Las filas ─────────────────────────────────────────────────────────
  log('\nFilas:');
  let total = 0;
  for (const tabla of ORDEN) {
    const filas = await leeTabla(dir, tabla);
    if (filas === null) continue;
    if (filas.length === 0) {
      log(`  ·  ${tabla.padEnd(22)} 0`);
      continue;
    }

    if (!escribir) {
      log(`  ·  ${tabla.padEnd(22)} ${filas.length}`);
      total += filas.length;
      continue;
    }

    /*
      `upsert` y no `insert`: restaurar tiene que poder REPETIRSE. Un fallo a
      mitad —se cae la red con veinte tablas puestas— no puede obligar a empezar
      de cero, porque empezar de cero significa vaciar una base a medio
      restaurar, que es cuando de verdad se pierde algo.

      En trozos porque una tabla de bloques son varios MB por fila.
    */
    const TROZO = 200;
    const generado = ID_GENERADO.has(tabla);
    const onConflict = CLAVE[tabla] || 'id';

    for (let i = 0; i < filas.length; i += TROZO) {
      const lote = filas.slice(i, i + TROZO);
      const { error } = generado
        ? /* Sin el `id`, que lo pone la base. Ver `ID_GENERADO`. */
          await db.from(tabla).insert(
            lote.map((fila) => {
              const copia = { ...fila };
              delete copia.id;
              return copia;
            })
          )
        : await db.from(tabla).upsert(lote, { onConflict });
      if (error) fail(`${tabla}: ${error.message}`);
    }
    log(`  ✓  ${tabla.padEnd(22)} ${filas.length}${generado ? '  (con id nuevo)' : ''}`);
    total += filas.length;
  }
  log(`     ${total} filas en total`);

  // ── 3. Los archivos ──────────────────────────────────────────────────────
  const raizFotos = join(dir, 'fotos');
  const archivos = await listaArchivos(raizFotos);
  log(`\nArchivos: ${archivos.length}`);

  if (escribir && archivos.length > 0) {
    let subidos = 0;
    for (const rel of archivos) {
      const cuerpo = await readFile(join(raizFotos, rel));
      /*
        En su ruta EXACTA. `progress_photos.photo_url` guarda la ruta, no una
        URL, así que cualquier cambio de estructura deja las fotos huérfanas: la
        fila sigue ahí y el archivo no aparece.
      */
      const { error } = await db.storage
        .from(BUCKET)
        .upload(rel, cuerpo, { upsert: true, contentType: tipoDe(rel) });
      if (error) fail(`Subir ${rel}: ${error.message}`);
      subidos += 1;
    }
    log(`          ${subidos} subidos`);
  }

  if (!escribir) {
    log('\n✓ La copia está completa y se puede restaurar.');
    log('  Para hacerlo de verdad: repite con --escribir en lugar de --ensayo.');
    return;
  }

  log('\n✓ Restaurado.');
  log('\nQueda por hacer a mano (ver docs/copias.md §5.5):');
  log('  · Que cada persona entre con «he olvidado mi contraseña»: las');
  log('    contraseñas no se pueden exportar y las cuentas se han recreado sin ella.');
  log('  · Volver a pegar los tokens de integraciones en Ajustes → Integraciones.');
  log('  · Rehacer el webhook de Stripe, que apunta a un id que ha cambiado.');
};

const llamadoDirectamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (llamadoDirectamente) {
  const desconocidas = args.filter((a) => a.startsWith('-') && !OPCIONES.includes(a));
  if (desconocidas.length > 0) {
    console.error(`\n✗ No conozco ${desconocidas.join(', ')}.\n\n${AYUDA}`);
    process.exit(2);
  }
  if (args.includes('--ayuda') || args.includes('-h') || args.includes('--help') || args.length === 0) {
    console.log(AYUDA);
    process.exit(0);
  }
  /*
    Hay que elegir. Sin modo por defecto: que restaurar encima de una base con
    datos sea lo que ocurre por descuido es exactamente el error que este
    proyecto acaba de corregir en `backup.mjs`.
  */
  if (!args.includes('--ensayo') && !args.includes('--escribir')) {
    console.error(`\n✗ Elige --ensayo o --escribir.\n\n${AYUDA}`);
    process.exit(2);
  }
  main().catch((e) => fail(e?.message || String(e)));
}

export { ORDEN };
