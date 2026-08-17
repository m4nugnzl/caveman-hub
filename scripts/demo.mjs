/**
 * Una cuenta de demostración con una cartera de verdad.
 *
 * ══ Para qué existe ═════════════════════════════════════════════════════════
 *
 * Para poder MIRAR la aplicación llena. Una cuenta recién creada está vacía, y
 * con la aplicación vacía no se puede hacer ninguna de las tres cosas para las
 * que hace falta verla llena:
 *
 *   · sacar capturas para la portada,
 *   · comprobar que lo que la portada promete se parece a lo que hay dentro,
 *   · y probar a ojo una pantalla nueva con la densidad que tiene de verdad
 *     —seis clientes, ocho semanas de programa, treinta pesajes— en lugar de con
 *     un cliente y dos filas.
 *
 * Los datos son inventados, pero la FORMA es la real: se escriben con las mismas
 * funciones y en las mismas columnas que usa la aplicación, así que si mañana
 * cambia el esquema, esto se rompe — que es exactamente lo que tiene que pasar.
 *
 * ══ Dónde escribe, y por qué no puede equivocarse ═══════════════════════════
 *
 * SOLO contra el proyecto de usar y tirar de `.env.test`, el mismo que usa
 * `npm run test:db`, y con la misma guarda: si esa URL coincide con la de la
 * aplicación, esto no corre. Da de alta cuentas y borra filas con la
 * `service_role`, que salta todas las políticas: apuntarlo por descuido al
 * proyecto real sería destruir datos de salud de personas concretas.
 *
 * Uso:
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.test scripts/demo.mjs
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.test scripts/demo.mjs --limpiar
 *
 * O, más corto:  npm run demo   /   npm run demo:limpiar
 */
import { createClient } from '@supabase/supabase-js';

const URL_TEST = process.env.SUPABASE_TEST_URL || '';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_TEST_ANON_KEY || '';
const URL_APP = process.env.VITE_SUPABASE_URL || '';

if (!URL_TEST || !SERVICE || !ANON) {
  console.error(
    'Faltan SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY.\n' +
      'Van en .env.test, y tienen que ser de un proyecto de usar y tirar.'
  );
  process.exit(1);
}

if (URL_APP && new URL(URL_TEST).host === new URL(URL_APP).host) {
  console.error(
    'SUPABASE_TEST_URL apunta al MISMO proyecto que VITE_SUPABASE_URL.\n' +
      'Esto crea y borra cuentas: usa un proyecto de usar y tirar.'
  );
  process.exit(1);
}

const admin = createClient(URL_TEST, SERVICE, { auth: { persistSession: false } });
const ok = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

/* Credenciales fijas: la gracia de una cuenta de demostración es poder entrar
   sin buscarlas, y volver a sembrar sin que cambien. */
export const CORREO = 'demo@ejemplo.invalid';
export const CLAVE = 'DemoCaveman2026!';

const hoy = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const haceDias = (n) => iso(new Date(hoy.getTime() - n * 86400000));

// ── Limpieza ───────────────────────────────────────────────────────────────

const limpia = async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const cuentas = (data?.users || []).filter((u) => u.email?.endsWith('@ejemplo.invalid'));

  for (const u of cuentas) {
    const { data: suyos } = await admin.from('clients').select('id').eq('coach_id', u.id);
    for (const c of suyos || []) {
      // Los archivos primero: borrar la fila no vacía el bucket.
      const { data: ficheros } = await admin.storage.from('client-media').list(`${c.id}/photos`, {
        limit: 1000,
      });
      for (const carpeta of ficheros || []) {
        const { data: dentro } = await admin.storage
          .from('client-media')
          .list(`${c.id}/photos/${carpeta.name}`, { limit: 1000 });
        const rutas = (dentro || []).map((f) => `${c.id}/photos/${carpeta.name}/${f.name}`);
        if (rutas.length > 0) await admin.storage.from('client-media').remove(rutas);
      }
      for (const tabla of [
        'workout_data',
        'anthropometry',
        'nutrition_plans',
        'progress_photos',
        'check_ins',
        'review_links',
        'client_events',
        'client_phases',
      ]) {
        await admin.from(tabla).delete().eq('client_id', c.id);
      }
      await admin.from('clients').delete().eq('id', c.id);
    }
    await admin.auth.admin.deleteUser(u.id);
  }
  console.log(`Borradas ${cuentas.length} cuentas de demostración y todo lo suyo.`);
};

if (process.argv.includes('--limpiar')) {
  await limpia();
  process.exit(0);
}

// ── El catálogo del que sale el programa ───────────────────────────────────

/**
 * Ejercicios de verdad, con su grupo muscular y una carga de partida creíble.
 * El realismo importa: una portada con «Ejercicio 3 · 80 kg» delata que nadie ha
 * usado esto, y una captura con cuatro filas iguales tampoco enseña nada.
 */
const CATALOGO = {
  Empuje: [
    ['Press banca', 'pecho', 80],
    ['Press inclinado con mancuernas', 'pecho', 28],
    ['Press militar', 'hombro', 45],
    ['Elevaciones laterales', 'hombro', 10],
    ['Fondos en paralelas', 'triceps', 0],
    ['Extensión de tríceps en polea', 'triceps', 30],
  ],
  Tirón: [
    ['Dominadas lastradas', 'espalda', 10],
    ['Remo con barra', 'espalda', 70],
    ['Jalón al pecho', 'espalda', 60],
    ['Remo en polea baja', 'espalda', 55],
    ['Curl con barra Z', 'biceps', 30],
    ['Curl martillo', 'biceps', 14],
  ],
  Pierna: [
    ['Sentadilla trasera', 'cuadriceps', 100],
    ['Peso muerto rumano', 'femoral', 90],
    ['Prensa 45º', 'cuadriceps', 180],
    ['Curl femoral tumbado', 'femoral', 45],
    ['Hip thrust', 'gluteo', 110],
    ['Gemelo de pie', 'gemelo', 60],
  ],
  'Full body': [
    ['Sentadilla frontal', 'cuadriceps', 70],
    ['Press banca', 'pecho', 80],
    ['Remo con barra', 'espalda', 70],
    ['Press militar', 'hombro', 45],
    ['Peso muerto rumano', 'femoral', 90],
    ['Plancha lastrada', 'core', 10],
  ],
};

const SPLITS = {
  4: ['Empuje', 'Tirón', 'Pierna', 'Full body'],
  3: ['Empuje', 'Tirón', 'Pierna'],
};

/** Un id estable y legible, como los que genera `lib/ids`. */
let contador = 0;
const id = (p) => `${p}-${(contador += 1).toString(36)}`;

/**
 * Ocho microciclos con progresión de verdad: la carga sube un escalón cada
 * semana y la última está a medias, que es como se encuentra un programa en
 * mitad de la semana. Lo de la vez anterior existe porque las semanas anteriores
 * están registradas.
 */
const programa = (semanas, dias) => {
  const nombres = SPLITS[dias];
  return Array.from({ length: semanas }, (_, s) => ({
    id: id('micro'),
    weekNumber: s + 1,
    date: haceDias((semanas - s) * 7),
    days: nombres.map((nombre, d) => {
      const ultimaSemana = s === semanas - 1;
      // En la semana en curso solo están hechos los dos primeros días.
      const registrado = !ultimaSemana || d < 2;
      return {
        dayName: nombre,
        exercises: CATALOGO[nombre].map(([ejercicio, musculo, base], e) => {
          const carga = base === 0 ? 0 : Math.round((base + s * 2.5) * 2) / 2;
          return {
            id: id('ex'),
            name: ejercicio,
            muscle: musculo,
            notes: e === 0 && s === semanas - 1 ? 'Controla la bajada, 3 segundos.' : '',
            sets: Array.from({ length: e < 2 ? 4 : 3 }, (_, i) => ({
              targetReps: e < 2 ? '6-8' : '10-12',
              targetRir: e < 2 ? '2' : '1',
              kg: registrado ? String(carga === 0 ? '' : carga) : '',
              reps: registrado ? String(e < 2 ? 8 - (i > 2 ? 1 : 0) : 11) : '',
              rir: registrado ? String(Math.max(0, 2 - Math.floor(i / 2))) : '',
            })),
          };
        }),
      };
    }),
  }));
};

/** Treinta pesajes con ruido: una tendencia limpia no existe en una báscula. */
const pesajes = (inicio, pendienteSemanal, dias = 60) => {
  const salida = [];
  for (let d = dias; d >= 0; d -= 2) {
    const semanas = (dias - d) / 7;
    const ruido = Math.sin(d * 1.7) * 0.35 + Math.cos(d * 0.9) * 0.2;
    salida.push({
      id: id('log'),
      date: haceDias(d),
      weight: Math.round((inicio + pendienteSemanal * semanas + ruido) * 10) / 10,
    });
  }
  return salida;
};

// ── La cartera ─────────────────────────────────────────────────────────────

const CARTERA = [
  { nombre: 'Marta Ruiz', sexo: 'Mujer', desde: 84, dias: 4, peso: 63.8, ritmo: -0.35, kcals: 1950, foto: true, plan: 'Mensual · 90 €', renueva: 11 },
  { nombre: 'Javier Ortega', sexo: 'Hombre', desde: 119, dias: 4, peso: 78.2, ritmo: 0.18, kcals: 3050, foto: true, plan: 'Trimestral · 240 €', renueva: 34 },
  { nombre: 'Nerea Sanz', sexo: 'Mujer', desde: 56, dias: 3, peso: 58.4, ritmo: -0.22, kcals: 1800, foto: true, plan: 'Mensual · 90 €', renueva: 4 },
  { nombre: 'Álvaro Pino', sexo: 'Hombre', desde: 168, dias: 4, peso: 91.5, ritmo: -0.55, kcals: 2400, foto: true, plan: 'Semestral · 420 €', renueva: 62 },
  { nombre: 'Claudia Rey', sexo: 'Mujer', desde: 28, dias: 3, peso: 66.1, ritmo: -0.3, kcals: 1900, foto: false, plan: 'Mensual · 90 €', renueva: 19 },
  { nombre: 'Iván Tormo', sexo: 'Hombre', desde: 210, dias: 4, peso: 74.9, ritmo: 0.12, kcals: 2900, foto: false, plan: 'Trimestral · 240 €', renueva: 27 },
];

/* Un JPEG de ocho bytes. Aquí no hacen falta fotos de verdad —y no las va a
   haber nunca en un guion versionado—: lo que se está ejercitando es la ruta del
   bucket y la fila que la apunta. */
const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08]);

console.log(`Sembrando en ${new URL(URL_TEST).host}…`);
await limpia();

const { data: alta, error: errAlta } = await admin.auth.admin.createUser({
  email: CORREO,
  password: CLAVE,
  email_confirm: true,
});
if (errAlta) throw new Error(`crear la cuenta: ${errAlta.message}`);
const coachId = alta.user.id;

ok(await admin.from('profiles').update({ full_name: 'Entrenador Demo' }).eq('id', coachId), 'perfil');

/* Entrando una vez con la clave anónima se crea el equipo por el mismo camino
   que la aplicación (`ensure_my_team`), en lugar de insertando en `teams` a
   mano — que es como se acaba con un equipo que no se parece a los de verdad. */
const sesion = createClient(URL_TEST, ANON, { auth: { persistSession: false } });
const entrada = await sesion.auth.signInWithPassword({ email: CORREO, password: CLAVE });
if (entrada.error) throw new Error(`entrar: ${entrada.error.message}`);
const equipoId = ok(await sesion.rpc('ensure_my_team'), 'ensure_my_team');

/*
  ══ La demostración necesita un plan, y eso no es hacer trampa ═════════════

  El límite de clientes lo impone un disparador de Postgres, no la interfaz, así
  que sembrar seis clientes en una cuenta en periodo de prueba falla al cuarto —
  y falla BIEN: es la prueba de que el límite existe de verdad.

  Una cuenta para mirar la aplicación llena tiene que estar en el plan sin tope.
  Se elige leyendo `plan_limits`, no escribiendo «equipo» a mano: si algún día se
  renombra el plan, esto sigue funcionando.
*/
const planes = ok(
  await admin.from('plan_limits').select('plan, max_clients').order('sort'),
  'plan_limits'
);
const sinTope = planes.find((p) => p.max_clients === null) || planes[planes.length - 1];

ok(
  await admin.from('team_subscriptions').upsert(
    {
      team_id: equipoId,
      plan: sinTope.plan,
      status: 'active',
      current_period_end: iso(new Date(hoy.getTime() + 365 * 86400000)),
    },
    { onConflict: 'team_id' }
  ),
  'suscripción'
);

const creados = [];

for (const persona of CARTERA) {
  const fila = ok(await sesion.rpc('create_client', { p_name: persona.nombre }), 'create_client');
  const clientId = fila?.id || fila?.[0]?.id;
  creados.push({ clientId, persona });

  ok(
    await admin
      .from('clients')
      .update({
        start_date: haceDias(persona.desde),
        gender: persona.sexo,
        /* El plan y el estado de pago del CLIENTE con su entrenador —no la
           suscripción del hub—. Se rellenan porque la cabecera de las siete
           secciones los enseña, y una cartera entera con «Pago pendiente» en
           rojo describe una cuenta abandonada, no una en uso. */
        plan: persona.plan,
        payment_status: 'paid',
        next_payment_date: iso(new Date(hoy.getTime() + persona.renueva * 86400000)),
      })
      .eq('id', clientId),
    'ficha'
  );

  const semanas = Math.max(2, Math.min(10, Math.floor(persona.desde / 7)));
  ok(
    await admin.from('workout_data').upsert(
      { client_id: clientId, microcycles: programa(semanas, persona.dias) },
      { onConflict: 'client_id' }
    ),
    'programa'
  );

  ok(
    await admin.from('anthropometry').upsert(
      { client_id: clientId, history: pesajes(persona.peso, persona.ritmo) },
      { onConflict: 'client_id' }
    ),
    'antropometría'
  );

  ok(
    await admin.from('nutrition_plans').upsert(
      {
        client_id: clientId,
        /* Los nombres salen de `lib/mappers.js`, que es quien los escribe de
           verdad: inventárselos aquí es cómo se acaba sembrando una forma que la
           aplicación no sabe leer. */
        target_kcals: persona.kcals,
        protein_grams: Math.round(persona.peso * 2),
        carbs_grams: Math.round((persona.kcals * 0.42) / 4),
        fats_grams: Math.round((persona.kcals * 0.27) / 9),
        steps_goal: 9000,
      },
      { onConflict: 'client_id' }
    ),
    'nutrición'
  );

  if (persona.foto) {
    for (const semana of [1, Math.max(2, Math.floor(semanas / 2)), semanas]) {
      for (const angulo of ['frontal', 'lateral', 'espalda']) {
        const ruta = `${clientId}/photos/week-${semana}/${Date.now()}-${angulo}.jpg`;
        const sub = await admin.storage
          .from('client-media')
          .upload(ruta, FOTO, { contentType: 'image/jpeg', upsert: true });
        if (sub.error) throw new Error(`subir ${ruta}: ${sub.error.message}`);
        ok(
          await admin.from('progress_photos').insert({
            client_id: clientId,
            photo_url: ruta,
            angle: angulo,
            tag: JSON.stringify({ angle: angulo, week: semana }),
            taken_on: haceDias(persona.desde - semana * 7),
          }),
          'foto'
        );
      }
    }
  }
}

console.log('\nSembrado:');
for (const { clientId, persona } of creados) {
  console.log(`  ${persona.nombre.padEnd(16)} ${clientId}`);
}
console.log(`\n  Entra con:  ${CORREO}  /  ${CLAVE}`);
console.log(`  Apunta la aplicación a ${new URL(URL_TEST).host} para verlo.`);
