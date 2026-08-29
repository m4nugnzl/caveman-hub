/**
 * Datos coherentes para UN cliente de prueba.
 *
 * ══ Qué hace y qué no ══════════════════════════════════════════════════════
 *
 * Escribe una historia de quince semanas —volumen y luego definición— en el
 * cliente cuyo id se le pase, y SOLO en ése: programa con dos bloques y sesiones
 * registradas, pesajes cada dos días, perímetros cada quincena, un check-in
 * semanal con lo que contestó y la foto del plan de esa semana, y las dos fases
 * del roadmap.
 *
 * Antes de tocar nada guarda en un fichero JSON todo lo que había. Sin
 * `--aplicar` no escribe: enseña lo que haría y se va.
 *
 * Uso:
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.backup \
 *     scripts/sembrar-cliente.mjs <client_id> [--aplicar]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CLIENTE = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
const COPIA = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : './_copia-cliente.json';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!CLIENTE) { console.error('Falta el id del cliente'); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });

// ── Fechas, todas en UTC y a partir del lunes ──────────────────────────────
const DIA = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const lunesDe = (fecha) => {
  const d = new Date(`${iso(fecha)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
};
const mas = (fecha, dias) => iso(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA);

const HOY = iso(new Date());
const SEMANAS = 15;
/* El alta cae en el lunes de hace catorce semanas: así la semana 15 es la de
   hoy y el panel abre con una historia que ya tiene forma. */
const ALTA = mas(lunesDe(HOY), -(SEMANAS - 1) * 7);
const lunesDeSemana = (n) => mas(ALTA, (n - 1) * 7);

let n = 0;
const id = (p) => `${p}-${(n += 1).toString(36)}`;

// ── El programa ────────────────────────────────────────────────────────────

/*
  Dos bloques con estructura distinta, que es de lo que va un bloque: el primero
  de tres días y el segundo de cuatro. Cargas de partida creíbles — una tabla con
  «Ejercicio 3 · 80 kg» delata que nadie ha usado esto.
*/
const RUTINAS = {
  Push: [['Press banca', 'Pecho', 80, 4], ['Press inclinado con mancuernas', 'Pecho', 28, 3], ['Press militar', 'Deltoides Anterior', 45, 3], ['Elevaciones laterales', 'Deltoides Lateral', 10, 3], ['Extensión de tríceps en polea', 'Tríceps', 30, 3]],
  Pull: [['Dominadas lastradas', 'Espalda Alta', 10, 4], ['Remo con barra', 'Espalda Alta', 70, 4], ['Jalón al pecho', 'Dorsal', 60, 3], ['Curl con barra Z', 'Bíceps', 30, 3]],
  Pierna: [['Sentadilla trasera', 'Cuádriceps', 100, 4], ['Peso muerto rumano', 'Isquiotibiales', 90, 3], ['Prensa 45º', 'Cuádriceps', 180, 3], ['Curl femoral tumbado', 'Isquiotibiales', 45, 3], ['Gemelo de pie', 'Gemelo', 40, 4]],
  'Push A': [['Press banca', 'Pecho', 92, 4], ['Press inclinado con mancuernas', 'Pecho', 32, 4], ['Elevaciones laterales', 'Deltoides Lateral', 12, 4], ['Fondos en paralelas', 'Tríceps', 15, 3], ['Extensión de tríceps en polea', 'Tríceps', 34, 3]],
  'Pull A': [['Dominadas lastradas', 'Espalda Alta', 16, 4], ['Remo con barra', 'Espalda Alta', 82, 4], ['Remo en polea baja', 'Dorsal', 60, 3], ['Curl con barra Z', 'Bíceps', 34, 3], ['Curl martillo', 'Bíceps', 16, 3]],
  'Pierna A': [['Sentadilla trasera', 'Cuádriceps', 115, 4], ['Peso muerto rumano', 'Isquiotibiales', 105, 4], ['Prensa 45º', 'Cuádriceps', 210, 3], ['Curl femoral tumbado', 'Isquiotibiales', 52, 3], ['Gemelo de pie', 'Gemelo', 50, 4]],
  'Push B': [['Press militar', 'Deltoides Anterior', 52, 4], ['Press banca con mancuernas', 'Pecho', 34, 3], ['Elevaciones laterales', 'Deltoides Lateral', 12, 4], ['Extensión de tríceps sobre la cabeza', 'Tríceps', 26, 3]],
};

const BLOQUE_1 = { desde: 1, hasta: 7, dias: ['Push', 'Pull', 'Pierna'] };
const BLOQUE_2 = { desde: 8, hasta: null, dias: ['Push A', 'Pull A', 'Pierna A', 'Push B'] };
const bloqueDe = (semana) => (semana <= BLOQUE_1.hasta ? BLOQUE_1 : BLOQUE_2);

const SPLIT_1 = { Lunes: 'Push', Martes: 'Descanso', Miércoles: 'Pull', Jueves: 'Descanso', Viernes: 'Pierna', Sábado: 'Descanso', Domingo: 'Descanso' };
const SPLIT_2 = { Lunes: 'Push A', Martes: 'Pull A', Miércoles: 'Descanso', Jueves: 'Pierna A', Viernes: 'Push B', Sábado: 'Descanso', Domingo: 'Descanso' };

const CALENTAMIENTO = [
  { id: id('drill'), name: 'Movilidad de cadera', detail: '2 × 10 por lado' },
  { id: id('drill'), name: 'Band pull-apart', detail: '2 × 15' },
];

/* Semanas SIN sesión anotada: la 11 entera —se fue de viaje— y los dos últimos
   días de la 15, que es la que está en curso. Un programa real nunca está
   entero, y el panel tiene que saber decirlo. */
const SIN_SESION = new Set([11]);
const A_MEDIAS = { 15: 2 };

const microcycles = Array.from({ length: SEMANAS }, (_, i) => {
  const semana = i + 1;
  const bloque = bloqueDe(semana);
  const enBloque = semana - bloque.desde;
  const hechos = SIN_SESION.has(semana) ? 0 : (A_MEDIAS[semana] ?? bloque.dias.length);

  const days = bloque.dias.map((nombre) => ({
    dayName: nombre,
    mobilityDrills: CALENTAMIENTO,
    note: '',
    /* El PLAN no lleva kilos: los pone quien entrena. La carga de partida —el
       hueco del medio— solo la usan las sesiones de más abajo. */
    exercises: RUTINAS[nombre].map(([ejercicio, musculo, , series], e) => ({
      id: id('ex'),
      name: ejercicio,
      muscle: musculo,
      notes: e === 0 && semana === SEMANAS ? 'Controla la bajada, tres segundos.' : '',
      sets: Array.from({ length: series }, () => ({
        targetReps: e < 2 ? '6-8' : '10-12',
        targetRir: e < 2 ? '2' : '1',
        kg: '',
        reps: '',
        rir: '',
      })),
    })),
  }));

  const sessions = bloque.dias.slice(0, hechos).map((nombre, d) => ({
    id: id('ses'),
    dayName: nombre,
    date: mas(lunesDeSemana(semana), d),
    /* Lo subjetivo de la sesión: la fatiga sube dentro del bloque y se resetea
       al abrir el siguiente, que es lo que pasa de verdad. */
    feedback: {
      fatigue: String(Math.min(9, 4 + Math.round(enBloque * 0.7))),
      pain: String(semana >= 12 ? 3 : 1),
      rpe: String(Math.min(9, 7 + Math.round(enBloque / 4))),
    },
    clientNote:
      semana === 13 && d === 0 ? 'El press me ha costado más de lo normal, dormí fatal.' : '',
    entries: RUTINAS[nombre].map(([ejercicio, musculo, base, series], e) => {
      /* La carga sube un escalón por semana dentro del bloque. */
      const carga = Math.round((base + enBloque * (base > 60 ? 2.5 : 1)) * 2) / 2;
      return {
        name: ejercicio,
        muscle: musculo,
        sets: Array.from({ length: series }, (_, s) => ({
          kg: String(carga),
          reps: String(e < 2 ? 8 - (s > 2 ? 1 : 0) : 11 - (s > 1 ? 1 : 0)),
          rir: String(Math.max(0, 2 - Math.floor(s / 2))),
        })),
      };
    }),
  }));

  return { id: id('micro'), weekNumber: semana, date: lunesDeSemana(semana), days, sessions };
});

const blocks = [
  { id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: 7, weeklySplit: SPLIT_1, mobilityDrills: CALENTAMIENTO },
  { id: 'b_2', name: 'Bloque 2', fromWeek: 8, toWeek: null },
];

// ── El cuerpo ──────────────────────────────────────────────────────────────

/*
  Volumen las siete primeras semanas y definición las ocho siguientes. Con ruido:
  una tendencia limpia no existe en una báscula, y sin ruido la recta de la
  ventana sale con r² = 1, que no se lo cree nadie.
*/
const PESO_INICIAL = 79.2;
const pesoEn = (dias) => {
  const semana = dias / 7;
  const volumen = Math.min(semana, 7) * 0.2;
  const corte = Math.max(0, semana - 7) * -0.45;
  const ruido = Math.sin(dias * 1.7) * 0.3 + Math.cos(dias * 0.9) * 0.18;
  return Math.round((PESO_INICIAL + volumen + corte + ruido) * 10) / 10;
};

const PERIMETROS = (dias) => {
  const semana = dias / 7;
  const corte = Math.max(0, semana - 7);
  const r = (v) => Math.round(v * 10) / 10;
  return {
    pecho: String(r(103 + Math.min(semana, 7) * 0.12 - corte * 0.08)),
    brazoD: String(r(37.4 + Math.min(semana, 7) * 0.07 - corte * 0.02)),
    brazoI: String(r(37.1 + Math.min(semana, 7) * 0.07 - corte * 0.02)),
    ombligo: String(r(88 + Math.min(semana, 7) * 0.15 - corte * 0.55)),
    gluteo: String(r(100 + Math.min(semana, 7) * 0.1 - corte * 0.3)),
    musloD: String(r(59 + Math.min(semana, 7) * 0.1 - corte * 0.12)),
  };
};

/*
  Los pliegues, que son de donde sale el % graso. Bajan con el déficit y casi no
  se mueven en volumen, que es lo que hacen de verdad. Con un suelo: un pliegue
  de dos milímetros no existe.
*/
const PLIEGUES = (dias) => {
  const semana = dias / 7;
  const corte = Math.max(0, semana - 7);
  const r = (v, suelo) => String(Math.round(Math.max(suelo, v) * 10) / 10);
  return {
    tricipital: r(9.5 + Math.min(semana, 7) * 0.05 - corte * 0.28, 4),
    subescapular: r(13 + Math.min(semana, 7) * 0.06 - corte * 0.3, 6),
    abdominal: r(19 + Math.min(semana, 7) * 0.1 - corte * 0.62, 7),
    suprailiaco: r(15 + Math.min(semana, 7) * 0.08 - corte * 0.5, 5),
    muslo: r(12 + Math.min(semana, 7) * 0.05 - corte * 0.3, 5),
    pantorrilla: r(8 + Math.min(semana, 7) * 0.03 - corte * 0.18, 4),
  };
};

// ── Lo que le fuiste poniendo ──────────────────────────────────────────────

/*
  Cuatro peldaños de calorías y cuatro de pasos, en semanas distintas: es lo que
  hace que las dos bandas de la gráfica se lean como decisiones y no como una
  raya, y lo que da sentido al conmutador «Calorías / Pasos».
*/
/*
  ── Y los pasos cambian en OTRAS semanas que las calorías ───────────────────
  A propósito, y es lo que hace que el conmutador «Calorías / Pasos» de la
  gráfica sirva para algo: si las dos escaleras saltaran en las mismas semanas,
  las dos bandas tendrían la MISMA silueta y cambiar de una a otra solo movería
  los números del eje — que es justo lo que se veía y parecía un botón roto.

  Con los peldaños desplazados se lee además la decisión real: la actividad sube
  ANTES de tocar la comida, y solo cuando eso deja de bastar bajan las kcal.
*/
const PAUTA_KCAL = [
  { desde: 1, kcals: 3000, protein: 175, carbs: 380, fats: 80 },
  { desde: 8, kcals: 2600, protein: 180, carbs: 300, fats: 70 },
  { desde: 11, kcals: 2450, protein: 180, carbs: 265, fats: 68 },
  { desde: 14, kcals: 2300, protein: 185, carbs: 240, fats: 62 },
];
const PAUTA_PASOS = [
  { desde: 1, steps: 8000, cardio: '' },
  { desde: 5, steps: 9500, cardio: '' },
  { desde: 9, steps: 11000, cardio: '2 × 30 min de caminata rápida' },
  { desde: 13, steps: 12500, cardio: '3 × 35 min de caminata rápida' },
];

const ultima = (tabla, semana) => [...tabla].reverse().find((p) => semana >= p.desde);
const pautaDe = (semana) => ({ ...ultima(PAUTA_KCAL, semana), ...ultima(PAUTA_PASOS, semana) });
const PAUTA_HOY = pautaDe(SEMANAS);

/*
  ══ Los pesajes, y por qué cada uno lleva la foto de la dieta ══════════════

  `buildWeeklySeries` saca el histórico de calorías y el reparto de macros de
  AQUÍ —de `log.nutrition`— y no de las revisiones. Sin esa foto, la gráfica del
  peso de la portada sale bien (ésa sí lee las revisiones) y en cambio la ventana
  del análisis enseña «configura los macros y registra un peso» al lado de un
  cliente con quince semanas de dieta. Que es exactamente lo que pasaba.
*/
const history = [];
for (let d = 0; d <= (SEMANAS - 1) * 7 + 4; d += 2) {
  const fecha = mas(ALTA, d);
  if (fecha > HOY) break;

  const pauta = pautaDe(Math.floor(d / 7) + 1);
  const log = {
    id: id('log'),
    date: fecha,
    weight: pesoEn(d),
    nutrition: { kcals: pauta.kcals, protein: pauta.protein, carbs: pauta.carbs, fats: pauta.fats },
  };

  /* Perímetros y pliegues cada quincena, no cada dos días: es lo que se hace, y
     además es lo que hace que la tendencia se lea en vez de ser treinta puntos
     de ruido de cinta métrica. */
  if (d % 14 === 0) {
    log.perimeters = PERIMETROS(d);
    log.skinFolds = PLIEGUES(d);
  }
  history.push(log);
}

const nutricion = {
  client_id: CLIENTE,
  type: 'macros',
  target_kcals: PAUTA_HOY.kcals,
  protein_grams: PAUTA_HOY.protein,
  carbs_grams: PAUTA_HOY.carbs,
  fats_grams: PAUTA_HOY.fats,
  steps_goal: String(PAUTA_HOY.steps),
  cardio_goal: PAUTA_HOY.cardio,
  habits_notes: [
    { id: id('h'), title: 'Agua', body: 'Tres litros al día, y uno de ellos antes de comer.' },
    { id: id('h'), title: 'Fuera de casa', body: 'Elige siempre la proteína primero y la guarnición después.' },
  ],
  has_day_variants: false,
  meals: [],
  closed_meals: [],
  closed_meals_training: [],
  closed_meals_rest: [],
  updated_at: new Date().toISOString(),
};

// ── Los check-ins, uno por semana ──────────────────────────────────────────

const NOTAS = [
  'Semana tranquila, todo según el plan.',
  'Me costó cuadrar la comida del viernes.',
  'Dormí mal dos noches, el resto bien.',
  'Buena semana, con hambre por la tarde.',
  'Cena fuera el sábado, lo demás clavado.',
];

const checkIns = [];
for (let semana = 1; semana < SEMANAS; semana += 1) {
  const pauta = pautaDe(semana);
  const corte = semana > 7;
  const dias = (semana - 1) * 7;
  checkIns.push({
    client_id: CLIENTE,
    week_start: lunesDeSemana(semana),
    program_week: semana,
    weight: pesoEn(dias + 3),
    notes: NOTAS[semana % NOTAS.length],
    submitted_at: `${mas(lunesDeSemana(semana), 6)}T09:00:00Z`,
    reviewed_at: `${mas(lunesDeSemana(semana), 7)}T18:00:00Z`,
    coach_notes:
      semana === 11
        ? 'Semana de viaje, sin entrenos. No tocamos nada: retomamos donde estábamos.'
        : '',
    /* Lo que contesta al cerrar la semana. El hambre sube y la adherencia baja
       según avanza el déficit, que es exactamente la historia que un entrenador
       necesita leer al lado de la curva del peso. */
    answers: {
      adherence: String(corte ? Math.max(6, 10 - Math.floor((semana - 7) / 2)) : 9),
      hunger: String(corte ? Math.min(8, 2 + Math.floor((semana - 7) * 0.8)) : 2),
      week_sleep: String(semana === 13 ? 4 : 7),
      week_stress: String(corte ? 6 : 4),
      motivation: String(corte ? Math.max(6, 9 - Math.floor((semana - 7) / 3)) : 9),
      week_note: NOTAS[semana % NOTAS.length],
    },
    /* La foto del plan de ESA semana: es de donde salen los peldaños de la
       gráfica. Sin ella, la escalera se queda plana en el último cambio. */
    snapshot: {
      kcals: pauta.kcals,
      protein: pauta.protein,
      carbs: pauta.carbs,
      fats: pauta.fats,
      steps: pauta.steps,
      cardio: pauta.cardio || null,
      weeks: SEMANAS,
    },
  });
}

// ── Las fases ──────────────────────────────────────────────────────────────

const fases = [
  {
    client_id: CLIENTE,
    title: 'Volumen controlado',
    direction: 'bulk',
    rate_pct: 0.25,
    starts_on: ALTA,
    ends_on: mas(lunesDeSemana(8), -1),
    note: 'Subir despacio y aguantar la fuerza antes de recortar.',
  },
  {
    client_id: CLIENTE,
    title: 'Definición',
    direction: 'cut',
    rate_pct: 0.6,
    starts_on: lunesDeSemana(8),
    /* Doce semanas: hoy va por la octava, así que la barra de la fase enseña un
       tramo con recorrido por delante y por detrás. */
    ends_on: mas(lunesDeSemana(8), 12 * 7 - 1),
    note: '',
  },
];

// ── Y a escribir ───────────────────────────────────────────────────────────

const { data: cliente, error: errCliente } = await db
  .from('clients')
  .select('id, name, coach_id, start_date, plan, preferences')
  .eq('id', CLIENTE)
  .single();
if (errCliente) { console.error('ERROR leyendo el cliente:', errCliente.message); process.exit(1); }

console.log(`Cliente: ${cliente.name} (${cliente.id})`);
console.log(`Alta: ${cliente.start_date} → ${ALTA}`);
console.log(`Programa: ${SEMANAS} semanas · 2 bloques · ${microcycles.reduce((a, m) => a + m.sessions.length, 0)} sesiones anotadas`);
console.log(`Pesajes: ${history.length} · con perímetros: ${history.filter((h) => h.perimeters).length}`);
console.log(`Check-ins: ${checkIns.length} · Fases: ${fases.length}`);
console.log(`Kcal:  ${PAUTA_KCAL.map((p) => `S${p.desde} ${p.kcals}`).join(' → ')}`);
console.log(`Pasos: ${PAUTA_PASOS.map((p) => `S${p.desde} ${p.steps}`).join(' → ')}`);

/*
  Sin `--aplicar` el guion termina aquí, y termina SOLO: nada de `process.exit`.
  En Windows, salir a mano con una conexión de Supabase todavía abierta hace que
  libuv reviente con «Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)» y
  un código 9 — un ensayo que ha ido bien se lee como un fallo. Envolver la
  escritura en un `if` deja que el proceso se cierre por su cuenta.
*/
if (!APLICAR) {
  console.log('\nENSAYO. Nada escrito. Repite con --aplicar.');
} else {

/* La copia de seguridad ANTES de tocar nada: esto escribe sobre un cliente de
   una base de producción, y «es de prueba» no es lo mismo que «da igual». */
const [w0, a0, n0, c0, f0] = await Promise.all([
  db.from('workout_data').select('*').eq('client_id', CLIENTE),
  db.from('anthropometry').select('*').eq('client_id', CLIENTE),
  db.from('nutrition_plans').select('*').eq('client_id', CLIENTE),
  db.from('check_ins').select('*').eq('client_id', CLIENTE),
  db.from('client_phases').select('*').eq('client_id', CLIENTE),
]);
/*
  Y la copia NO se pisa. Volver a sembrar sobre lo ya sembrado guardaría como
  «lo que había» el resultado del sembrado anterior, o sea perder para siempre
  los datos originales del cliente en la segunda pasada — que es justo cuando
  uno se siente a salvo porque «ya hice copia».
*/
const destino = existsSync(COPIA) ? COPIA.replace(/\.json$/, `-${Date.now()}.json`) : COPIA;
writeFileSync(
  destino,
  JSON.stringify(
    { cliente, workout_data: w0.data, anthropometry: a0.data, nutrition_plans: n0.data, check_ins: c0.data, client_phases: f0.data },
    null,
    2
  )
);
console.log(`\nCopia de lo que había → ${destino}`);

const ok = (r, que) => { if (r.error) { console.error(`ERROR ${que}: ${r.error.message}`); process.exit(1); } };

ok(await db.from('clients').update({
  start_date: ALTA,
  plan: cliente.plan || 'Trimestral · 240 €',
  preferences: {
    ...(cliente.preferences || {}),
    protocol: {
      ...(cliente.preferences?.protocol || {}),
      /* Sin esto, la tarjeta de sensaciones sale vacía aunque los check-ins
         traigan respuestas: el panel recorre el PROTOCOLO, no las claves
         guardadas, para no resucitar preguntas jubiladas. */
      checkinQuestions: ['adherence', 'hunger', 'week_sleep', 'week_stress', 'motivation', 'week_note'],
      checkin: { perimeters: 'optional', folds: 'off' },
    },
  },
}).eq('id', CLIENTE), 'clients');

/*
  UPDATE y, si no existía, INSERT. NO `upsert(..., { onConflict: 'client_id' })`:
  esa forma exige una constraint UNIQUE sobre `client_id` y en la base real no
  todas la tienen —la antropometría fallaba con «there is no unique or exclusion
  constraint matching the ON CONFLICT specification» (42P10)—. Es exactamente la
  razón por la que la aplicación tampoco la usa; ver `upsertClientRow` en
  `context/AppContext.jsx`.
*/
const guardar = async (tabla, fila) => {
  const actualizado = await db.from(tabla).update(fila).eq('client_id', CLIENTE).select('client_id');
  ok(actualizado, `actualizar ${tabla}`);
  if ((actualizado.data || []).length > 0) return;
  ok(await db.from(tabla).insert(fila), `insertar ${tabla}`);
};

await guardar('workout_data', {
  client_id: CLIENTE,
  weekly_split: SPLIT_2,
  mobility_drills: CALENTAMIENTO,
  notes: '',
  microcycles,
  blocks,
  updated_at: new Date().toISOString(),
});

await guardar('anthropometry', { client_id: CLIENTE, history, updated_at: new Date().toISOString() });

await guardar('nutrition_plans', nutricion);

ok(await db.from('check_ins').delete().eq('client_id', CLIENTE), 'borrar check_ins');
ok(await db.from('check_ins').insert(checkIns.map((c) => ({ ...c, reviewed_by: cliente.coach_id }))), 'check_ins');

ok(await db.from('client_phases').delete().eq('client_id', CLIENTE), 'borrar fases');
ok(await db.from('client_phases').insert(fases), 'client_phases');

console.log('\nSembrado.');
}
