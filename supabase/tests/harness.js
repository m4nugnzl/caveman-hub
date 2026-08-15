/**
 * El arnés de las pruebas contra la base de datos.
 *
 * ══ Por qué existen estas pruebas ═══════════════════════════════════════════
 *
 * Las 385 pruebas del proyecto cubren `domain/`: funciones puras. Es la elección
 * correcta y está bien argumentada en `auditoria.md` §3.1. Pero los dos fallos
 * más caros que este repositorio tiene documentados NO estaban ahí:
 *
 *   · El cliente y el entrenador escribiendo las series en sitios distintos
 *     (`auditoria.md` §1.1) — la frontera aplicación/base de datos.
 *   · `gen_random_bytes` fuera del `search_path` (migración 0043), que dejó
 *     **imposible crear un enlace de revisión** desde la 0011. Meses roto y en
 *     silencio, porque nada ejecuta las funciones de Postgres.
 *
 * Ahí es donde vive la autorización de verdad —RLS y las `SECURITY DEFINER`— y
 * era la única capa sin ninguna red.
 *
 * ══ Por qué NO entran en `npm run check` ═══════════════════════════════════
 *
 * Porque necesitan una base de datos, y `check` tiene que poder correr en un
 * portátil sin red y en cualquier máquina que acabe de clonar el repositorio. Si
 * las pruebas de base de datos estuvieran ahí, `check` fallaría por no tener
 * credenciales y la gente aprendería a ignorar el rojo — que es peor que no
 * tenerlas.
 *
 * Van en `npm run test:db`, y **se saltan solas** cuando no hay proyecto
 * configurado, en lugar de fallar.
 *
 * ══ Cómo se corren ═════════════════════════════════════════════════════════
 *
 * Hace falta un proyecto de USAR Y TIRAR con todas las migraciones aplicadas.
 * Nunca el de producción: estas pruebas crean cuentas y clientes, y los borran.
 *
 *     # .env.test  (añádelo a .gitignore si no está)
 *     SUPABASE_TEST_URL=https://xxxx.supabase.co
 *     SUPABASE_TEST_ANON_KEY=...
 *     SUPABASE_TEST_SERVICE_ROLE_KEY=...
 *
 *     npm run test:db
 *
 * Con Docker instalado, el proyecto de usar y tirar puede ser el local:
 * `npx supabase start` y `npx supabase db push`.
 */

import { createClient } from '@supabase/supabase-js';

export const URL_TEST = process.env.SUPABASE_TEST_URL || '';
const ANON = process.env.SUPABASE_TEST_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';

/** ¿Hay proyecto contra el que correr? Si no, las suites se saltan enteras. */
export const configurado = Boolean(URL_TEST && ANON && SERVICE);

/*
  ══ La guarda que impide un desastre ═══════════════════════════════════════

  Estas pruebas dan de alta cuentas, crean clientes y los borran, y lo hacen con
  la `service_role`, que **salta todas las políticas de seguridad**. Apuntarlas
  por descuido al proyecto real —copiando un `.env` de más, o exportando la
  variable equivocada en una terminal— sería destruir datos de salud de personas
  concretas sin que ninguna política lo impidiera.

  Así que se comprueba antes de tocar nada: si la URL de pruebas coincide con la
  de la aplicación, esto NO corre. Es barato, es una sola comparación, y es la
  diferencia entre un fallo y una llamada a un abogado.
*/
const URL_APP = process.env.VITE_SUPABASE_URL || '';

export const compruebaQueNoEsProduccion = () => {
  if (!configurado) return;
  if (URL_APP && new URL(URL_TEST).host === new URL(URL_APP).host) {
    throw new Error(
      'SUPABASE_TEST_URL apunta al MISMO proyecto que VITE_SUPABASE_URL. ' +
        'Estas pruebas crean y borran datos: usa un proyecto de usar y tirar.'
    );
  }
};

/** Cliente con la `service_role`: para preparar y limpiar, nunca para probar. */
export const admin = () =>
  createClient(URL_TEST, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

/** Cliente anónimo, el mismo que usa el navegador. Es con el que se PRUEBA. */
export const anon = () =>
  createClient(URL_TEST, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * Da de alta un entrenador y devuelve su sesión ya iniciada.
 *
 * Se crea con la `service_role` y `email_confirm` para no depender del correo:
 * lo que se prueba aquí es la autorización, no el circuito de confirmación.
 *
 * El disparador `handle_new_user` le pone rol `coach`, y `ensure_my_team()` le
 * crea equipo — igual que al entrar por la aplicación.
 */
export const nuevoEntrenador = async (etiqueta) => {
  const email = `test-${etiqueta}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ejemplo.invalid`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const sa = admin();
  const { data, error } = await sa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`No se pudo crear ${etiqueta}: ${error.message}`);

  const sesion = anon();
  const login = await sesion.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(`No se pudo entrar como ${etiqueta}: ${login.error.message}`);

  // Lo mismo que hace la aplicación al arrancar.
  const equipo = await sesion.rpc('ensure_my_team');
  if (equipo.error) throw new Error(`ensure_my_team falló: ${equipo.error.message}`);

  return { id: data.user.id, email, password, db: sesion };
};

/** Da de alta un cliente de ese entrenador y devuelve su id. */
export const nuevoCliente = async (entrenador, nombre = 'Cliente de prueba') => {
  const { data, error } = await entrenador.db.rpc('create_client', { client_name: nombre });
  if (error) throw new Error(`create_client falló: ${error.message}`);
  return typeof data === 'string' ? data : data?.id || data?.[0]?.id;
};

/**
 * Borra lo que la prueba haya creado.
 *
 * Borrar el usuario de `auth` no arrastra sus clientes —las claves foráneas no
 * tienen cascada, y eso está anotado en `deleteClientCompletely`—, así que se
 * quitan antes y a mano.
 */
export const limpia = async ({ entrenadores = [], clientes = [] } = {}) => {
  const sa = admin();
  for (const clientId of clientes.filter(Boolean)) {
    for (const tabla of ['workout_data', 'anthropometry', 'nutrition_plans', 'progress_photos', 'check_ins', 'review_links', 'client_events']) {
      await sa.from(tabla).delete().eq('client_id', clientId);
    }
    await sa.from('clients').delete().eq('id', clientId);
  }
  for (const entrenador of entrenadores.filter(Boolean)) {
    await entrenador.db.auth.signOut().catch(() => {});
    await sa.auth.admin.deleteUser(entrenador.id).catch(() => {});
  }
};
