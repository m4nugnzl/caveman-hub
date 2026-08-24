/**
 * Radiografía: qué se usa, qué se rompe, qué se rellena y por dónde se entra.
 *
 * ══ Por qué esto SIGUE existiendo en la terminal ════════════════════════════
 *
 * Durante un tiempo esto era el ÚNICO sitio donde el informe podía existir, por
 * las tres razones de `docs/observabilidad.md` §2. Dos de ellas ya no valen —hay
 * servidor propio desde la sexta función edge— y el informe pasa a tener también
 * una pantalla dentro de la aplicación y un bot (`docs/plataforma.md`).
 *
 * Este script no se retira, y no por nostalgia. Hace dos cosas que la pantalla
 * no puede hacer:
 *
 *   1. FUNCIONA CUANDO LO DEMÁS NO. Una herramienta cuyo trabajo es auditar la
 *      infraestructura no puede depender por completo de esa infraestructura:
 *      con la función edge sin desplegar, mal desplegada o caída, esto sigue
 *      contestando. Es la única vía que solo necesita una clave y una red.
 *
 *   2. TERMINA EN ERROR. `--estricto` devuelve un código de salida, y eso es lo
 *      que convierte el informe en una comprobación de integración continua. Una
 *      pantalla no puede tumbar un despliegue.
 *
 * El razonamiento —qué va mal y por qué— ya no vive aquí, sino en
 * `src/domain/radiografia/`, porque lo comparten este script, la función edge y
 * el panel. Aquí queda recoger, orquestar y escribir archivos.
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
/*
  El análisis vive en `src/domain/radiografia/` y no aquí. No es una mudanza de
  orden: es que a partir de la función edge hay TRES consumidores del mismo
  razonamiento —este script, la función y el panel— y dos implementaciones de
  «qué va mal» divergen. Aquí queda lo que solo sabe hacer un script: recoger,
  orquestar y escribir archivos.
*/
import { catalogoDe } from '../src/domain/radiografia/catalogo.js';
import { componer } from '../src/domain/radiografia/componer.js';
import { aAceptar, siguienteEstado } from '../src/domain/radiografia/estado.js';
import { leerTodo } from '../src/domain/radiografia/lectura.js';
import { planDe } from '../src/domain/radiografia/recogida.js';
import { guardarEstado } from './radiografia/archivo.mjs';
import { guardarMemoria, leerMemoria } from './radiografia/memoria.mjs';
import { render } from './radiografia/informe.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

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
  '--aceptar-nuevos',
  '--aceptar-avisos',
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
  'Dar por buenos hallazgos de seguridad. El motivo es obligatorio siempre:',
  '',
  '  --aceptar-nuevos "motivo"   solo los que no estaban en el informe anterior',
  '  --aceptar-avisos "motivo"   todos los que no son críticos',
  '  --aceptar-todo   "motivo"   TODOS, críticos incluidos. Fija la línea base',
  '',
  '      Los dos primeros NUNCA alcanzan a un hallazgo crítico: aceptar unos',
  '      avisos no puede dejar de pedir atención sobre algo sin arreglar. Un',
  '      crítico solo se acepta escribiendo --aceptar-todo, a propósito.',
  '',
  'El informe se escribe en informes/radiografia.html.',
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
 * Qué ofrece la aplicación, para poder decir qué no se usa.
 *
 * Las reglas —y el porqué de leer el código en vez de copiar la lista— están en
 * `src/domain/radiografia/catalogo.js`, donde además hay pruebas que corren
 * contra estos mismos archivos. Aquí solo se leen del disco.
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

  /* La lista de qué se lee vive en `recogida.js`, compartida con la función
     edge: dos listas que hay que cambiar a la vez acaban divergiendo, y la que
     se olvidara no fallaría — devolvería el informe de siempre con una sección
     en blanco. Aquí queda solo ejecutarla. */
  const { tablas, avisos: avisosPlan } = planDe({ desde, conProgramas: !flag('--sin-programas') });
  avisos.push(...avisosPlan);

  const { datos, avisos: avisosLectura } = await leerTodo(supabase, tablas, {
    alLeer: ({ tabla, filas, falta, error: fallo }) => {
      const nombre = tabla.padEnd(20);
      if (falta) return log(`  ·  ${nombre} no existe`);
      if (fallo) return log(`  ✗  ${nombre} ${fallo}`);
      return log(`  ✓  ${nombre} ${filas} filas`);
    },
  });
  avisos.push(...avisosLectura);

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

  /* De la base si la 0074 está aplicada, y del archivo si no. Las dos cosas
     funcionan; lo que no puede pasar es leer de un sitio y escribir en el otro.
     Ver la cabecera de `memoria.mjs`. */
  const memoria = await leerMemoria(supabase, { rutaEstado });
  const { estado, sembrar } = memoria;
  avisos.push(...memoria.avisos);

  /* ── El análisis ──────────────────────────────────────────────────────── */

  /* Todo el montaje —y sobre todo su ORDEN, que es la mitad del informe— está
     en `componer.js`, compartido con la función edge. Ver su cabecera. */
  const informe = componer({
    datos,
    sesiones,
    seguridad: seg.data || [],
    avisoSeguridad,
    volumen: vol.data || [],
    catalogo: cat,
    estado,
    proyecto: new URL(url).host,
    generado: ahora.toISOString(),
    dias,
    avisos,
  });

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
  /*
    Tres ámbitos, y ninguno salvo `--aceptar-todo` alcanza a un crítico. El
    porqué está en `AMBITOS` (`src/domain/radiografia/estado.js`): usar la línea
    base entera para dar por buenos dos avisos nuevos se lleva por delante los
    críticos sin arreglar, que dejan de pedir atención sin que nadie haya
    decidido nada sobre ellos.
  */
  const BANDERAS = {
    '--aceptar-nuevos': 'nuevos',
    '--aceptar-avisos': 'avisos',
    '--aceptar-todo': 'todo',
  };

  const usadas = Object.keys(BANDERAS).filter(flag);
  if (usadas.length > 1) {
    fail(`No se pueden combinar ${usadas.join(' y ')}: elige un ámbito.`);
  }

  const bandera = usadas[0] || null;
  const ambito = bandera ? BANDERAS[bandera] : null;
  const aceptar = bandera ? value(bandera) : null;

  if (bandera && (!aceptar || aceptar.trim().length < 3)) {
    fail(
      `A \`${bandera}\` le falta el motivo.\n` +
        '  Dar por buenos unos hallazgos de seguridad sin dejar dicho por qué es\n' +
        '  cómo empiezan los agujeros que luego nadie sabe explicar.\n\n' +
        `    npm run radiografia -- ${bandera} "revisados el 23/08, deliberados"`
    );
  }

  /* Qué alcanza el ámbito, ya descontado lo que estaba aceptado: así el mensaje
     final dice cuántos se han aceptado de verdad y no un número inflado. */
  const aceptables = ambito ? aAceptar(informe.seguridad, ambito, estado.aceptados) : [];

  if (memoria.en === 'archivo') {
    await guardarEstado(
      rutaEstado,
      siguienteEstado({
        estado,
        hallazgos: informe.seguridad.filter((h) => h.nivel !== 'info'),
        instantanea: informe.metricas,
        generado: informe.generado,
        aceptar,
        aceptables,
      })
    );
  } else {
    await guardarMemoria(supabase, { informe, estado, aceptar, aceptables, sembrar });
  }

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
  /* Decía `informe.seguridad.length` —la lista ENTERA, líneas de contexto
     incluidas—, así que anunciaba haber aceptado cincuenta cosas al aceptar
     dos. Un mensaje inflado enseña a no leer los mensajes. */
  if (aceptar) {
    log(
      aceptables.length === 0
        ? `\n  ·  Nada que aceptar en «${ambito}»: ya estaba todo dado por bueno.`
        : `\n  ✓  ${aceptables.length} hallazgo(s) aceptados (${ambito}): «${aceptar}»`
    );
  }

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
