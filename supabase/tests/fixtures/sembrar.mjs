/**
 * Siembra el stack LOCAL con datos falsos para el ensayo de restauración.
 *
 * Nada de esto es real: nombres inventados, medidas inventadas y una «foto» que
 * son cuatro bytes. Lo que importa no son los datos sino la FORMA: cuentas de
 * auth, claves foráneas encadenadas, jsonb grandes y archivos en el bucket, que
 * son las cuatro cosas que una restauración puede romper.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
if (!/127\.0\.0\.1|localhost/.test(URL)) throw new Error('Esto solo corre contra el stack local.');

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const ok = (r, q) => {
  if (r.error) throw new Error(`${q}: ${r.error.message}`);
  return r.data;
};

/*
  Se puede sembrar dos veces.

  El ensayo de restauración se repite —se afina el script, se vuelve a probar— y
  un sembrador que solo funciona sobre una base recién creada obliga a un
  `db reset` completo entre intento e intento. Se limpian las cuentas de prueba
  antes de crearlas; sus datos se van detrás por las claves foráneas de `auth`.
*/
const limpiaCuentasDePrueba = async () => {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  const mias = (data?.users || []).filter((u) => u.email?.endsWith('@ejemplo.invalid'));
  for (const u of mias) await db.auth.admin.deleteUser(u.id);
  if (mias.length > 0) console.log(`(limpiadas ${mias.length} cuentas de un ensayo anterior)`);
};

await limpiaCuentasDePrueba();

const cuenta = async (email) => {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `Pw-${Math.random().toString(36).slice(2)}`,
    email_confirm: true,
  });
  if (error) throw new Error(`crear ${email}: ${error.message}`);
  return data.user.id;
};

// ── 1. Dos entrenadores y un cliente con cuenta ────────────────────────────
const ana = await cuenta('ana.entrenadora@ejemplo.invalid');
const luis = await cuenta('luis.entrenador@ejemplo.invalid');
const marta = await cuenta('marta.cliente@ejemplo.invalid');

// El disparador de `bootstrap.sql` ya les creó el perfil. Marta es cliente.
ok(await db.from('profiles').update({ role: 'client', full_name: 'Marta Ruiz' }).eq('id', marta), 'perfil marta');
ok(await db.from('profiles').update({ full_name: 'Ana Entrenadora' }).eq('id', ana), 'perfil ana');
ok(await db.from('profiles').update({ full_name: 'Luis Entrenador' }).eq('id', luis), 'perfil luis');

// ── 2. Equipos ─────────────────────────────────────────────────────────────
const equipoAna = ok(
  await db.from('teams').insert({ name: 'Equipo Ana', owner_id: ana }).select().single(),
  'equipo ana'
).id;
ok(
  await db.from('team_members').upsert({ team_id: equipoAna, profile_id: ana, role: 'owner' }, { onConflict: 'team_id,profile_id' }),
  'miembro ana'
);
ok(
  /* Sin `seats`: `monetizacion.md` §3.1 la documenta, pero la migración 0019 no
     la creó. Divergencia entre el documento y el esquema, anotada al pasar. */
  await db.from('team_subscriptions').insert({
    team_id: equipoAna, plan: 'solo', status: 'active',
    current_period_end: '2026-12-31T00:00:00Z',
  }),
  'suscripción'
);

// ── 3. Clientes ────────────────────────────────────────────────────────────
const nuevoCliente = async (nombre, perfil) =>
  ok(
    await db.from('clients').insert({
      coach_id: ana, team_id: equipoAna, name: nombre, client_profile_id: perfil,
      start_date: '2026-06-01', status: 'active',
    }).select().single(),
    `cliente ${nombre}`
  ).id;

const cMarta = await nuevoCliente('Marta Ruiz', marta);
const cPedro = await nuevoCliente('Pedro Gómez', null);

// ── 4. Los bloques gordos, que es donde vive el trabajo ────────────────────
const microciclos = Array.from({ length: 6 }, (_, s) => ({
  id: `micro-${s + 1}`, weekNumber: s + 1, date: '2026-06-01',
  days: Array.from({ length: 4 }, (_, d) => ({
    dayName: `Día ${d + 1}`,
    exercises: Array.from({ length: 7 }, (_, e) => ({
      id: `ex-${s}-${d}-${e}`, name: `Ejercicio ${e + 1}`, muscle: 'pecho',
      sets: Array.from({ length: 4 }, () => ({ kg: '80', reps: '8', rir: '2' })),
    })),
  })),
}));

for (const c of [cMarta, cPedro]) {
  ok(await db.from('workout_data').insert({ client_id: c, microcycles: microciclos }), 'workout');
  ok(
    await db.from('anthropometry').insert({
      client_id: c,
      history: Array.from({ length: 12 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, '0')}`, weight: 70 + i * 0.2,
      })),
    }),
    'antropometría'
  );
  ok(
    await db.from('nutrition_plans').insert({
      client_id: c, target_kcals: 2400, protein_grams: 180,
      closed_meals_training: [{ name: 'Desayuno', options: [] }],
    }),
    'nutrición'
  );
  ok(await db.from('client_phases').insert({ client_id: c, title: 'Volumen', direction: 'bulk', starts_on: '2026-06-01', ends_on: '2026-08-31', created_by: ana }), 'fase');
  ok(await db.from('check_ins').insert({ client_id: c, week_start: '2026-08-10', weight: 72.4, submitted_at: '2026-08-11T09:00:00Z' }), 'check-in');
}

// ── 5. Archivos en el bucket ───────────────────────────────────────────────
const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08]);
for (const [c, semanas] of [[cMarta, [1, 4, 8]], [cPedro, [1, 2]]]) {
  for (const w of semanas) {
    for (const angulo of ['frontal', 'lateral']) {
      const ruta = `${c}/photos/week-${w}/17000000${w}-${angulo}.jpg`;
      const sub = await db.storage.from('client-media').upload(ruta, FOTO, { contentType: 'image/jpeg', upsert: true });
      if (sub.error) throw new Error(`subir ${ruta}: ${sub.error.message}`);
      ok(await db.from('progress_photos').insert({ client_id: c, photo_url: ruta, tag: JSON.stringify({ angle: angulo }), angle: angulo, taken_on: '2026-06-01' }), 'foto');
    }
  }
}

// ── 6. Un hilo de soporte ──────────────────────────────────────────────────
const ticket = ok(
  await db.from('support_tickets').insert({ profile_id: ana, subject: 'No me guarda la rutina' }).select().single(),
  'ticket'
).id;
ok(await db.from('support_messages').insert({ ticket_id: ticket, author_id: ana, body: 'Me pasa desde ayer.' }), 'mensaje');

// ── Resumen ────────────────────────────────────────────────────────────────
const cuantos = async (t) => (await db.from(t).select('*', { count: 'exact', head: true })).count;
const tablas = ['profiles', 'teams', 'team_members', 'team_subscriptions', 'clients', 'workout_data',
  'anthropometry', 'nutrition_plans', 'client_phases', 'check_ins', 'progress_photos',
  'support_tickets', 'support_messages'];
console.log('\nSembrado:');
for (const t of tablas) console.log(`  ${String(await cuantos(t)).padStart(3)}  ${t}`);
const archivos = await db.storage.from('client-media').list(cMarta + '/photos/week-1');
console.log(`  ${String((archivos.data || []).length).padStart(3)}  archivos en una carpeta de fotos`);
