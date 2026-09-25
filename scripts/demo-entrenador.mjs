/**
 * Una cuenta de PRUEBA para un entrenador de fuera: la suya y la de su cliente.
 *
 * ══ Para qué existe ═════════════════════════════════════════════════════════
 *
 * Para dejarle a un entrenador que nos está evaluando una cuenta llena en la
 * aplicación DE VERDAD —la publicada—, con la que pueda trastear sin miedo:
 * dos clientes de culturismo (uno a nueve semanas de su campeonato, con la
 * temporada entera en el roadmap; otra en volumen) y la cuenta del primero
 * para ver lo que ve desde el móvil.
 *
 * ══ Por qué no usa la `service_role` ════════════════════════════════════════
 *
 * Esto escribe en PRODUCCIÓN, donde están los datos de salud de personas de
 * verdad. Así que hace exactamente lo que haría alguien registrándose en la
 * portada: `signUp` con la clave pública, y todo lo demás con la SESIÓN de esa
 * cuenta nueva. Las políticas RLS son las de siempre: no puede leer ni tocar
 * nada que no sea suyo, ni aunque el guion tuviera un error.
 *
 * Por lo mismo va en el plan gratuito (tres clientes): es lo que tendría
 * cualquiera que se registre, y no hace falta tocar suscripciones.
 *
 * ══ La contraseña ═══════════════════════════════════════════════════════════
 *
 * Aleatoria en cada alta y solo en la salida del terminal: la de la demo local
 * está escrita en el repositorio, y en producción eso sería una puerta abierta.
 *
 * Uso:
 *   node --env-file=.env scripts/demo-entrenador.mjs
 *   node --env-file=.env scripts/demo-entrenador.mjs --entrenador=a@b.c --cliente=d@e.f
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { TEMPORADA, VOLUMEN, sembrarPerfil } from './demo-temporada.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !ANON) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (van en .env).');
  process.exit(1);
}

const arg = (nombre, porDefecto) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1] || porDefecto;

const CORREO_ENTRENADOR = arg('entrenador', 'prueba.entrenador@ejemplo.invalid');
const CORREO_CLIENTE = arg('cliente', 'prueba.cliente@ejemplo.invalid');

/* La versión del consentimiento que acepta hoy la aplicación
   (`CONSENT_VERSION` en `components/Auth/ConsentNotice.jsx`). */
const CONSENTIMIENTO = '2026-08';

/* Sin letras que se confundan (I, l, 1, O, 0): se va a dictar o a teclear
   leyéndola de un WhatsApp, y la primera que se generó en base64 no entró por
   eso. Cuatro grupos de cuatro, como una matrícula. */
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';
const clave = () => {
  const bytes = randomBytes(16);
  const grupos = [0, 4, 8, 12].map((i) =>
    Array.from(bytes.subarray(i, i + 4), (b) => LETRAS[b % LETRAS.length]).join('')
  );
  return `Caveman-${grupos.join('-')}`;
};

const ok = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

const nuevaSesion = () => createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

/** Da de alta una cuenta por la puerta de la portada y devuelve su sesión. */
const alta = async (correo, nombre) => {
  const db = nuevaSesion();
  const contrasena = clave();
  const r = await db.auth.signUp({ email: correo, password: contrasena, options: { data: { name: nombre } } });
  if (r.error) throw new Error(`alta de ${correo}: ${r.error.message}`);
  if (!r.data.session) {
    throw new Error(
      `${correo} se ha creado pero pide confirmar el correo. Confírmalo en Supabase → Authentication y vuelve a lanzar con otro correo.`
    );
  }
  /* El nombre del alta va a los metadatos, no al perfil: sin esto la barra
     lateral enseña el correo en vez de un nombre. */
  ok(await db.from('profiles').update({ full_name: nombre }).eq('id', r.data.user.id), 'nombre');
  return { db, contrasena, uid: r.data.user.id };
};

console.log(`Creando la cuenta de prueba en ${new URL(SUPABASE_URL).host}…\n`);

// ── El entrenador ──────────────────────────────────────────────────────────

const entrenador = await alta(CORREO_ENTRENADOR, 'Entrenador de prueba');
ok(await entrenador.db.rpc('ensure_my_team'), 'ensure_my_team');

/* Dos de los tres del plan gratuito, a propósito: con los tres ocupados, la
   aplicación le recibe con «Has llegado al tope de tu plan» y no puede dar de
   alta a nadie suyo, que es lo primero que va a querer probar. */
const fichas = [];
for (const perfil of [TEMPORADA, VOLUMEN]) {
  const fila = ok(await entrenador.db.rpc('create_client', { p_name: perfil.nombre }), 'create_client');
  const clientId = fila?.id || fila?.[0]?.id;
  const { sesiones } = await sembrarPerfil(entrenador.db, clientId, entrenador.uid, perfil);
  fichas.push({ clientId, perfil });
  console.log(`  ${perfil.nombre.padEnd(15)} ${sesiones} entrenos registrados`);
}

// ── Su cliente ─────────────────────────────────────────────────────────────

/* Por el mismo camino que un cliente real: el entrenador emite la invitación
   y el cliente, con su cuenta recién creada, la canjea aceptando el
   consentimiento. Es lo que deja la ficha enlazada y el rol en `client`. */
const [temporada] = fichas;
const token = ok(await entrenador.db.rpc('create_client_invite', { target: temporada.clientId }), 'invitación');
const cliente = await alta(CORREO_CLIENTE, TEMPORADA.nombre);
ok(
  await cliente.db.rpc('claim_client_invite', { p_token: token, p_consent_version: CONSENTIMIENTO }),
  'canjear la invitación'
);

console.log(`
Listo. Dos accesos, en la dirección de siempre (/entrar):

  Entrenador   ${CORREO_ENTRENADOR}
               ${entrenador.contrasena}

  Cliente      ${CORREO_CLIENTE}   (${TEMPORADA.nombre}, su temporada)
               ${cliente.contrasena}

Guarda las contraseñas ahora: no se escriben en ningún sitio.`);
