/**
 * Radiografía: qué se usa, qué se rompe, qué se rellena y por dónde se entra.
 *
 * ══ Por qué esto NO está dentro de la aplicación ════════════════════════════
 *
 * Fue la primera decisión y condiciona todas las demás. Tres razones, y la
 * tercera es la que decide:
 *
 *   1. PUEDE VER MÁS. La mitad más valiosa del informe —el estado real de RLS,
 *      qué puede ejecutar quien no ha iniciado sesión, qué buckets son
 *      públicos— vive en el catálogo de Postgres, y el catálogo no se expone por
 *      la API. Desde el navegador esa sección no existiría.
 *
 *   2. NO HAY DONDE PONERLO. La aplicación es una SPA estática en Cloudflare
 *      (`wrangler.jsonc`): no hay servidor propio donde guardar una clave. Un
 *      panel web tendría que leerlo todo con la sesión del usuario, y para eso
 *      habría que abrir por política justo lo que no se quiere abrir.
 *
 *   3. NO TIENE PUERTA. Una pantalla protegida es una pantalla que se puede
 *      desproteger: bastaría una política mal escrita para publicar el mapa de
 *      la seguridad de la base. Un archivo que se genera en local no se puede
 *      filtrar por una política mal escrita porque no hay ninguna que escribir.
 *      Y el reparto de llaves ya existe: la misma `service_role key` de
 *      `npm run backup`, en `.env.backup`, que nunca sale de esta máquina.
 *
 * El precio es que no se consulta desde el móvil. A cambio se guarda, se compara
 * con el del mes pasado y se manda por correo, que es lo que de verdad se hace
 * con algo que se mira una vez a la semana.
 *
 * ══ Uso ═══════════════════════════════════════════════════════════════════
 *
 *   npm run radiografia                      informe de los últimos 30 días
 *   npm run radiografia -- --dias 90         otra ventana
 *   npm run radiografia -- --sin-programas   sin leer los programas (rápido)
 *   npm run radiografia -- --salida D:/x     otra carpeta
 *   npm run radiografia -- --estricto        termina en error si hay críticos
 *
 * Necesita lo mismo que la copia de seguridad, en `.env.backup`:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * ══ Qué contiene el archivo que genera ═════════════════════════════════════
 *
 * Agregados: recuentos, porcentajes y mensajes de error ya saneados. No sale
 * ni un nombre, ni un correo, ni una medida de nadie. Aun así **no es
 * publicable**: es el estado de seguridad y las cifras de negocio juntos, y por
 * eso la carpeta de salida está en `.gitignore`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { resolverCredenciales } from './credenciales.mjs';
import {
  actividadSemanal,
  censo,
  comparar,
  embudo,
  fallosAgrupados,
  fallosPorDia,
  instantanea,
  negocio,
  porEvento,
  porPantalla,
  retencionSemanaSiguiente,
} from './radiografia/analisis.mjs';
import { catalogoDe } from './radiografia/catalogo.mjs';
import { cuentasDe, enRiesgo } from './radiografia/cuentas.mjs';
import { diagnosticar, resumenDe } from './radiografia/diagnosticos.mjs';
import { cobros, invitaciones, movimientoClientes, porPlan, pruebas } from './radiografia/dinero.mjs';
import { anotar, guardarEstado, leerEstado, serieDe, siguienteEstado } from './radiografia/estado.mjs';
import { render } from './radiografia/informe.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* PostgREST devuelve como mucho 1000 filas por petición y lo hace SIN avisar de
   que hay más. El mismo cuidado que en la copia: un informe truncado tiene
   aspecto de informe completo. */
const PAGE = 1000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const OPCIONES = [
  '--dias',
  '--salida',
  '--sin-programas',
  '--estricto',
  '--aceptar-todo',
  '--ayuda',
  '-h',
  '--help',
];

const AYUDA = [
  'Radiografía de Caveman Hub.',
  '',
  '  npm run radiografia                      informe de los últimos 30 días',
  '  npm run radiografia -- --dias 90         otra ventana de tiempo',
  '  npm run radiografia -- --sin-programas   sin leer los programas (rápido)',
  '  npm run radiografia -- --salida D:/x     otra carpeta de salida',
  '  npm run radiografia -- --estricto        termina en error si hay críticos',
  '',
  '  npm run radiografia -- --aceptar-todo "motivo"',
  '      Fija la línea base: da por buenos TODOS los hallazgos de seguridad de',
  '      ahora, con ese motivo, para que a partir del próximo informe solo',
  '      destaque lo nuevo. Se usa una vez, después de revisarlos a mano.',
  '',
  'El panel se abre en informes/radiografia.html y se gestiona ahí mismo.',
  'Necesita SUPABASE_SERVICE_ROLE_KEY en .env.backup (ver docs/observabilidad.md).',
].join('\n');

const log = (...parts) => console.log(...parts);
const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

/* ==========================================================================
   Lectura
   ========================================================================== */

/**
 * Una tabla entera, por páginas.
 *
 * Que una tabla no exista NO es un error: significa que su migración no está
 * aplicada, y eso es una respuesta legítima que el informe tiene que poder
 * contar. Lo que sí sería un error es dar por vacío lo que no se ha podido leer,
 * así que se distingue: `{ rows }`, `{ falta }` o `{ error }`.
 */
const leer = async (supabase, tabla, { columnas = '*', desde = null } = {}) => {
  const filas = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(tabla).select(columnas).range(from, from + PAGE - 1);
    if (desde) q = q.gte('at', desde);

    const { data, error } = await q;
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return { falta: true };
      return { error: error.message };
    }

    filas.push(...data);
    if (data.length < PAGE) break;
  }
  return { rows: filas };
};

/**
 * Qué ofrece la aplicación, para poder decir qué no se usa.
 *
 * Las reglas —y el porqué de leer el código en vez de copiar la lista— están en
 * `radiografia/catalogo.mjs`, donde además hay pruebas que corren contra estos
 * mismos archivos. Aquí solo se leen del disco.
 */
const catalogos = async (avisos) => {
  try {
    const cat = catalogoDe({
      rutas: await readFile(join(RAIZ, 'src', 'routes.jsx'), 'utf8'),
      antropometria: await readFile(join(RAIZ, 'src', 'domain', 'anthropometry.js'), 'utf8'),
    });
    avisos.push(...cat.avisos);
    return cat;
  } catch (e) {
    avisos.push(
      `No se ha podido leer el código para saber qué pantallas y campos existen: ${e.message}. ` +
        'Las listas de «sin uso» salen vacías por eso, no porque no falte nada.'
    );
    return { pantallas: [], pliegues: [], perimetros: [] };
  }
};

/* ==========================================================================
   Principal
   ========================================================================== */

const main = async () => {
  const desconocidas = args.filter((a) => a.startsWith('-') && !OPCIONES.includes(a));
  if (desconocidas.length > 0) {
    console.error(`\n✗ No conozco ${desconocidas.join(', ')}.\n\n${AYUDA}`);
    process.exit(2);
  }
  if (flag('--ayuda') || flag('-h') || flag('--help')) {
    log(AYUDA);
    return;
  }

  const { url, key, error } = resolverCredenciales({ para: 'el informe' });
  if (error) fail(error);

  const dias = Math.max(1, Math.min(365, Number(value('--dias')) || 30));
  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);
  const desde = new Date(ahora.getTime() - dias * 86400000).toISOString();

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const avisos = [];

  log(`Radiografía de ${new URL(url).host}`);
  log(`Ventana: ${dias} días\n`);

  /* ── Lo que solo sabe el catálogo ─────────────────────────────────────── */

  log('  Seguridad…');
  const seg = await supabase.rpc('radiografia_seguridad');
  const vol = await supabase.rpc('radiografia_volumen');

  /* Un fallo aquí NO se traga en silencio. Toda la sección de seguridad puede
     desaparecer del informe por una migración sin aplicar, y un informe sin esa
     sección se lee exactamente igual que uno donde todo está bien. */
  const avisoSeguridad = seg.error
    ? `No se ha podido leer el estado de seguridad: ${seg.error.message}. ` +
      '¿Está aplicada la migración 0053? Sin ella esta sección no existe, y no ' +
      'existir NO significa que no haya nada que mirar.'
    : null;
  if (vol.error) avisos.push(`No se ha podido leer el volumen de las tablas: ${vol.error.message}`);

  /* ── Las tablas ───────────────────────────────────────────────────────── */

  const tablas = {
    eventos: { tabla: 'product_events', desde },
    fallos: { tabla: 'app_errors', desde },
    equipos: { tabla: 'teams', columnas: 'id, name, owner_id, created_at' },
    /* Nombres y correos de los ENTRENADORES. Ver la cabecera de `cuentas.mjs`:
       son los clientes de pago del negocio y sin saber quién es quién no se
       puede llevar. De los clientes finales aquí no sale ni un nombre. */
    perfiles: { tabla: 'profiles', columnas: 'id, full_name, email, role' },
    miembros: { tabla: 'team_members', columnas: 'team_id, profile_id, role' },
    pagos: { tabla: 'client_payments' },
    tickets: { tabla: 'support_tickets', columnas: 'id, team_id, profile_id, subject, status, created_at' },
    invites: { tabla: 'client_invites', columnas: 'id, client_id, created_at, expires_at, claimed_at, revoked_at' },
    integraciones: { tabla: 'integrations', columnas: 'id, team_id, provider, status, last_sync_at' },
    /* Para saber cuál de las cuentas eres tú y no listarte entre las que no facturan. */
    admins: { tabla: 'platform_admins', columnas: 'profile_id' },
    /* Para la etiqueta visible del plan y su tope: la clave interna del gratuito
       sigue siendo `prueba` (0056) y enseñarla diría lo contrario de lo que hace. */
    planes: { tabla: 'plan_limits', columnas: 'plan, label, max_clients, max_seats, price_cents, purchasable' },
    clientes: {
      tabla: 'clients',
      columnas: 'id, team_id, status, gender, start_date, client_profile_id, created_at',
    },
    antropometria: { tabla: 'anthropometry', columnas: 'client_id, history' },
    nutricion: {
      tabla: 'nutrition_plans',
      columnas: 'client_id, target_kcals, has_day_variants, steps_goal, habits_notes',
    },
    checkins: { tabla: 'check_ins', columnas: 'client_id, submitted_at, reviewed_at' },
    fotos: { tabla: 'progress_photos', columnas: 'client_id' },
    /* `trial_ends_at` y `current_period_end` son las DOS únicas fechas límite de
       todo el negocio: pasado ese día ya no se puede hacer nada. Pedir solo el
       plan y el estado —como se hacía— dejaba el informe sin la información más
       accionable que existe. */
    suscripciones: {
      tabla: 'team_subscriptions',
      columnas: 'team_id, plan, status, trial_ends_at, current_period_end, stripe_customer_id, updated_at',
    },
  };

  /* Los programas van aparte porque son lo único que pesa: `microcycles` es el
     JSONB de varios MB por cliente de `auditoria.md` §1.4. Se puede dejar fuera
     con `--sin-programas`, y entonces el censo lo dice en vez de contar cero. */
  const conProgramas = !flag('--sin-programas');
  if (conProgramas) {
    tablas.programas = {
      tabla: 'workout_data',
      columnas: 'client_id, microcycles, mobility_drills, notes',
    };
  } else {
    avisos.push('Los programas no se han leído (--sin-programas): la sección de programas sale vacía.');
  }

  const datos = {};
  for (const [nombre, opciones] of Object.entries(tablas)) {
    const res = await leer(supabase, opciones.tabla, opciones);

    if (res.falta) {
      avisos.push(`La tabla «${opciones.tabla}» no existe en este proyecto: su migración no está aplicada.`);
      datos[nombre] = [];
      log(`  ·  ${opciones.tabla.padEnd(20)} no existe`);
      continue;
    }
    if (res.error) {
      avisos.push(`No se ha podido leer «${opciones.tabla}»: ${res.error}`);
      datos[nombre] = [];
      log(`  ✗  ${opciones.tabla.padEnd(20)} ${res.error}`);
      continue;
    }

    datos[nombre] = res.rows;
    log(`  ✓  ${opciones.tabla.padEnd(20)} ${res.rows.length} filas`);
  }

  /*
    ── Las cuentas de `auth`, que no salen por la API de tablas ─────────────

    De aquí sale `last_sign_in_at`, y es el dato más valioso de todo el informe:
    es la única señal de que una cuenta sigue viva que existe desde el primer día
    y para todo el mundo. Los eventos solo existen desde que se instrumentó y
    solo se apuntan desde el panel del entrenador.
  */
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

  const cat = await catalogos(avisos);

  /* ── Lo ya visto y lo de la vez anterior ──────────────────────────────── */

  const carpeta = resolve(value('--salida') || join(RAIZ, 'informes'));
  const rutaEstado = join(carpeta, 'estado.json');

  const { estado, aviso: avisoEstado } = await leerEstado(rutaEstado);
  if (avisoEstado) avisos.push(avisoEstado);

  /* ── El análisis ──────────────────────────────────────────────────────── */

  const eventos = datos.eventos || [];
  const ahoraISO = ahora.toISOString();

  /*
    La hoja de cuentas. Va antes que nada porque casi todo lo demás cuelga de
    ella: los veredictos nombran a estas personas, el dinero se agrupa por su
    plan y el riesgo sale de sus fechas.
  */
  const cuentas = cuentasDe({
    equipos: datos.equipos,
    miembros: datos.miembros,
    perfiles: datos.perfiles,
    sesiones,
    suscripciones: datos.suscripciones,
    clientes: datos.clientes,
    programas: datos.programas || [],
    eventos,
    tickets: datos.tickets,
    integraciones: datos.integraciones,
    admins: datos.admins,
    planes: datos.planes,
    hoy: ahoraISO,
  });

  const porPerfil = new Map((datos.perfiles || []).map((p) => [p.id, p.full_name || p.email]));

  const informe = {
    proyecto: new URL(url).host,
    generado: ahora.toISOString(),
    ventanaDias: dias,

    seguridad: seg.data || [],
    avisoSeguridad,
    volumen: vol.data || [],

    cuentas,
    riesgo: enRiesgo(cuentas),
    planes: porPlan(cuentas),
    pruebas: pruebas(cuentas),
    cobros: cobros(datos.pagos, { hoy: ahoraISO }),
    movimiento: movimientoClientes(datos.clientes, { hoy: ahoraISO }),
    invitaciones: invitaciones(datos.invites, { hoy: ahoraISO }),
    /* Con quién hablar, no solo qué se dijo: un ticket sin nombre no se puede
       contestar. */
    tickets: (datos.tickets || [])
      .map((t) => ({ ...t, quien: porPerfil.get(t.profile_id) || null }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),

    embudo: embudo({
      equipos: datos.equipos,
      clientes: datos.clientes,
      programas: datos.programas || [],
      checkins: datos.checkins,
    }),

    actividad: actividadSemanal(eventos, { semanas: Math.min(16, Math.ceil(dias / 7)), hoy }),
    retencion: retencionSemanaSiguiente(eventos, { semanas: 16 }),

    eventos: porEvento(eventos),
    pantallas: porPantalla(eventos, cat.pantallas),

    fallos: fallosAgrupados(datos.fallos || []),
    fallosDia: fallosPorDia(datos.fallos || []),

    censo: censo({
      clientes: datos.clientes,
      antropometria: datos.antropometria,
      nutricion: datos.nutricion,
      programas: datos.programas || [],
      checkins: datos.checkins,
      fotos: datos.fotos,
      etiquetas: { pliegues: cat.pliegues, perimetros: cat.perimetros },
      hoy,
    }),

    negocio: negocio({
      equipos: datos.equipos,
      suscripciones: datos.suscripciones,
      eventos,
      hoy,
    }),

    avisos,
  };

  /*
    ── Lo aceptado, lo nuevo y lo que ha cambiado ────────────────────────────

    Va después del análisis porque necesita el informe entero: la instantánea se
    saca de él, y `anotar` compara los hallazgos de hoy con las claves de la vez
    anterior. Es lo que convierte una foto en una serie.
  */
  informe.seguridad = anotar(informe.seguridad, estado);
  informe.estado = estado;

  const foto = instantanea(informe);
  informe.cambios = comparar(estado.ultimo?.metricas || {}, foto);
  informe.comparadoCon = estado.ultimo?.generado || null;

  /*
    El veredicto va al final del análisis porque necesita el informe COMPLETO —y
    ya anotado con lo aceptado y lo nuevo—: la mitad de los diagnósticos miran
    justamente eso. Es lo único del panel que se moja, y por eso vive en su
    propio archivo con sus propias pruebas.
  */
  informe.diagnosticos = diagnosticar(informe);
  informe.resumen = resumenDe(informe.diagnosticos);

  /* Las líneas de tendencia de los indicadores salen del histórico que este
     mismo script viene acumulando. En la primera ejecución no hay ninguna, y no
     se dibuja nada: un punto suelto no es una tendencia. */
  informe.serie = (clave) =>
    serieDe([...(estado.historico || []), { generado: informe.generado, metricas: foto }], clave).map(
      (p) => ({ etiqueta: p.fecha, valor: p.valor })
    );

  /* ── Los archivos ─────────────────────────────────────────────────────── */

  const marca = ahora.toISOString().replace(/:/g, '-').slice(0, 19);
  /* Nombre fijo para poder marcarlo en favoritos: si cambiara cada vez, la
     única forma de abrir el último sería mirar la carpeta. El archivo con fecha
     se guarda aparte, en `historico/`. */
  const destino = join(carpeta, 'radiografia.html');
  const historico = join(carpeta, 'historico');

  await mkdir(historico, { recursive: true });

  const html = render(informe);
  await writeFile(destino, html, 'utf8');
  await writeFile(join(historico, `radiografia-${marca}.html`), html, 'utf8');

  /*
    El estado se guarda SIEMPRE, aunque no se acepte nada: dentro va la lista de
    claves de hoy, que es contra lo que se comparará la próxima vez para saber
    qué es nuevo. Sin eso, cada informe sería el primero.
  */
  const aceptar = flag('--aceptar-todo') ? value('--aceptar-todo') : null;
  if (flag('--aceptar-todo') && (!aceptar || aceptar.trim().length < 3)) {
    fail(
      'A `--aceptar-todo` le falta el motivo.\n' +
        '  Dar por buenos unos hallazgos de seguridad sin dejar dicho por qué es\n' +
        '  cómo empiezan los agujeros que luego nadie sabe explicar.\n\n' +
        '    npm run radiografia -- --aceptar-todo "revisados el 16/08, todos deliberados"'
    );
  }

  await guardarEstado(
    rutaEstado,
    siguienteEstado({
      estado,
      hallazgos: informe.seguridad.filter((h) => h.nivel !== 'info'),
      instantanea: foto,
      generado: informe.generado,
      aceptar,
    })
  );

  /* ── El resumen en pantalla ───────────────────────────────────────────── */

  /*
    La terminal enseña LO MISMO que la portada del panel y en el mismo orden. Que
    las dos cosas cuenten historias distintas es la forma más rápida de que se
    deje de creer a las dos.
  */
  const MARCA = { atender: '⚠', vigilar: '·', sin_datos: '?', bien: '✓' };

  log(`\n${destino}\n`);

  const { atender, vigilar } = informe.resumen;
  log(
    atender === 0
      ? '  ✓  Nada que atender. Lo demás es seguimiento.'
      : `  ⚠  ${atender} cosa(s) que atender${vigilar > 0 ? `, ${vigilar} que vigilar` : ''}.`
  );
  log('');

  for (const v of informe.diagnosticos) {
    if (v.gravedad === 'bien') continue;
    log(`  ${MARCA[v.gravedad]}  ${v.titulo}${v.cifra ? `  (${v.cifra})` : ''}`);
    if (v.hacer) log(`       → ${v.hacer}`);
  }

  if (informe.cambios.length > 0) {
    log(`\n  Cambios desde el informe anterior:`);
    for (const c of informe.cambios.slice(0, 5)) {
      log(`     ${c.mejor ? '↗' : '↘'} ${c.clave}: ${c.antes} → ${c.ahora}`);
    }
  }
  if (aceptar) log(`\n  ✓  ${informe.seguridad.length} hallazgo(s) aceptados: «${aceptar}»`);

  for (const aviso of avisos) log(`  ⚠  ${aviso}`);

  const criticos = informe.seguridad.filter((h) => h.nivel === 'critico' && !h.aceptado);

  /*
    Sin `--estricto` termina bien aunque haya críticos, y es deliberado: la
    primera ejecución va a encontrar cosas —la trampa de los permisos por defecto
    de la 0047 hace que cada función nueva nazca alcanzable sin sesión— y un
    script que siempre falla es un script que se deja de mirar.

    Cuando la lista esté revisada y en cero, una tarea programada con `--estricto`
    convierte esto en una alarma de verdad.
  */
  if (flag('--estricto') && criticos.length > 0) {
    console.error(`\n✗ ${criticos.length} hallazgo(s) crítico(s) de seguridad.`);
    process.exit(1);
  }
};

main().catch((e) => fail(e?.stack || e?.message || String(e)));
