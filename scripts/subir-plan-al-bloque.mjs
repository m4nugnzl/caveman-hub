/**
 * SUBIR EL PLAN AL BLOQUE, de verdad: en la base de datos.
 *
 * ══ Qué hace ═══════════════════════════════════════════════════════════════
 *
 * El plan de entrenamiento vivía copiado en cada microciclo. Esto lo sube a su
 * bloque y anota como excepción lo que cada microciclo tuviera distinto (ver
 * `domain/blocksMigration`). No borra nada: `microcycle.days` se queda tal cual
 * mientras conviven las dos lecturas.
 *
 * ══ Las tres puertas antes de escribir ═════════════════════════════════════
 *
 *   1. COPIA. Antes de tocar nada guarda en un JSON lo que había, cliente a
 *      cliente. Es lo que permite volver.
 *   2. COMPROBACIÓN. `compareBlockPlans` recorre el programa y exige que la
 *      lectura nueva diga exactamente lo mismo que la vieja. Si un solo cliente
 *      falla, no se escribe ninguno.
 *   3. `--aplicar`. Sin él enseña lo que haría y se va.
 *
 * ══ Uso ════════════════════════════════════════════════════════════════════
 *
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.backup \
 *     scripts/subir-plan-al-bloque.mjs [<client_id>] [--aplicar] [--ejemplo]
 *
 * Sin id, todos los clientes con programa. Con `--ejemplo`, además deja DOS
 * EXCEPCIONES puestas en el último microciclo del bloque abierto: es lo que
 * permite ver en pantalla la marca «✱», la fila señalada en la hoja y sus dos
 * salidas —volver al bloque, aplicar al bloque— sin tener que crearlas a mano.
 *
 * Se ejecuta con vite-node porque el dominio usa el alias `@/`:
 *
 *   npx vite-node scripts/subir-plan-al-bloque.mjs -- <id> --aplicar
 */
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { migrateBlockPlans, compareBlockPlans } from '../src/domain/blocksMigration.js';
import { blockSessionsOf, blocksOf, buildOverride, hasBlockPlan, weeksOfBlock } from '../src/domain/blocks.js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const EJEMPLO = args.includes('--ejemplo');
const CLIENTE = args.find((a) => !a.startsWith('--')) || null;

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env y .env.backup).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/* La fila de `workout_data` viaja en snake_case; el dominio trabaja en camel. */
const aDominio = (fila) => ({
  weeklySplit: fila.weekly_split || {},
  mobilityDrills: fila.mobility_drills || [],
  notes: fila.notes || '',
  microcycles: fila.microcycles || [],
  blocks: fila.blocks || [],
});

/**
 * Las dos excepciones de ejemplo, en el último microciclo del bloque abierto.
 *
 * Una SUSTITUCIÓN —«en lugar de»— y una SUBIDA DE SERIES, que son las dos
 * formas que toma un ajuste puntual y las dos que la hoja dibuja distinto. Van
 * en un microciclo sin sesiones registradas: cambiar el plan de uno ya
 * entrenado sería cambiarle el pasado a alguien.
 */
const conEjemplo = (program, at) => {
  const bloque = blocksOf(program).filter(hasBlockPlan).pop();
  const hoja = blockSessionsOf(bloque).find((s) => (s.exercises || []).length >= 2);
  const semanas = weeksOfBlock(program, bloque);
  const suyos = semanas
    .map((w) => (program.microcycles || []).find((m) => m.weekNumber === w))
    .filter((m) => m && (m.sessions || []).length === 0);
  const micro = suyos[suyos.length - 1];

  if (!bloque || !hoja || !micro) {
    console.log('  (sin sitio para el ejemplo: hace falta un microciclo sin sesiones y una hoja con dos ejercicios)');
    return { program, donde: null };
  }

  /* Fuera los ejemplos de una pasada anterior: esto se ejecuta varias veces
     mientras se afina la pantalla, y si no se apilarían. */
  const sinViejos = program.blocks.map((b) => ({
    ...b,
    overrides: (b.overrides || []).filter((o) => !String(o.exercise?.id || '').startsWith('ex_ejemplo_')),
  }));
  const conBloques = { ...program, blocks: sinViejos };

  const [uno, dos] = hoja.exercises;
  const overrides = [
    buildOverride({
      dayName: hoja.dayName,
      targetId: uno.id,
      sobre: uno.name,
      fromWeek: micro.weekNumber,
      toWeek: micro.weekNumber,
      at,
      exercise: {
        ...uno,
        id: `ex_ejemplo_1_${micro.weekNumber}`,
        name: 'Press plano con mancuernas',
        sets: (uno.sets || []).map((s) => ({ ...s, kg: '', reps: '', rir: '' })),
      },
    }),
    buildOverride({
      dayName: hoja.dayName,
      targetId: dos.id,
      sobre: dos.name,
      /* Este dura tres microciclos: es la prueba que antes no cabía. */
      fromWeek: micro.weekNumber,
      toWeek: micro.weekNumber + 2,
      at,
      exercise: {
        ...dos,
        id: `ex_ejemplo_2_${micro.weekNumber}`,
        sets: [
          ...(dos.sets || []).map((s) => ({ ...s, kg: '', reps: '', rir: '' })),
          { kg: '', reps: '', rir: '', targetReps: dos.sets?.[0]?.targetReps || '', targetRir: '' },
        ],
      },
    }),
  ];

  return {
    program: {
      ...conBloques,
      blocks: conBloques.blocks.map((b) =>
        b.id === bloque.id ? { ...b, overrides: [...(b.overrides || []), ...overrides] } : b
      ),
    },
    donde: { week: micro.weekNumber, dayName: hoja.dayName, uno: uno.name, dos: dos.name },
  };
};

// ── Leer ───────────────────────────────────────────────────────────────────

let q = db.from('workout_data').select('*');
if (CLIENTE) q = q.eq('client_id', CLIENTE);
const { data: filas, error } = await q;
if (error) {
  console.error('No se ha podido leer workout_data:', error.message);
  process.exit(1);
}

const { data: clientes } = await db.from('clients').select('id,name');
const nombre = (id) => (clientes || []).find((c) => c.id === id)?.name || id;

console.log(`\nSubir el plan al bloque · ${filas.length} programas · ${APLICAR ? 'APLICANDO' : 'ensayo, no escribe'}\n`);

const trabajo = [];
const fallos = [];
const at = new Date().toISOString();

for (const fila of filas) {
  const antes = aDominio(fila);
  if ((antes.microcycles || []).length === 0) continue;

  const { program: migrado, report } = migrateBlockPlans(antes);
  const diferencias = compareBlockPlans(antes, migrado);
  if (diferencias.length > 0) {
    fallos.push({ quien: nombre(fila.client_id), diferencias });
    continue;
  }

  let program = migrado;
  let ejemplo = null;
  if (EJEMPLO && blocksOf(migrado).some(hasBlockPlan)) {
    const puesto = conEjemplo(program, at);
    program = puesto.program;
    ejemplo = puesto.donde;
  }

  trabajo.push({ fila, antes, program, report, ejemplo });

  console.log(
    `  ${nombre(fila.client_id).padEnd(22)} ${String((antes.microcycles || []).length).padStart(3)} microciclos · ` +
      `${report.bloques} bloques · ${report.hojas} hojas · ${report.excepciones} excepciones · ` +
      `${report.sesionesReapuntadas} sesiones reapuntadas`
  );
  if (ejemplo) {
    console.log(
      `${' '.repeat(24)}ejemplo en M${ejemplo.week} · ${ejemplo.dayName}: ` +
        `«${ejemplo.uno}» → Press plano con mancuernas, y una serie más en «${ejemplo.dos}»`
    );
  }
}

if (fallos.length > 0) {
  console.error(`\n  ${fallos.length} programas donde la lectura nueva NO dice lo mismo. No se escribe nada.\n`);
  for (const f of fallos) console.error(`    ${f.quien}: ${f.diferencias.length} diferencias`);
  process.exit(1);
}

if (!APLICAR) {
  console.log('\n  Todas las lecturas coinciden. Repite con --aplicar para escribirlo.\n');
  process.exit(0);
}

// ── Copia, y luego escribir ────────────────────────────────────────────────

const copia = `./_copia-antes-del-plan-${Date.now()}.json`;
writeFileSync(copia, JSON.stringify(trabajo.map((t) => t.fila), null, 2));
console.log(`\n  Copia de lo que había: ${copia}`);

let escritos = 0;
for (const { fila, program } of trabajo) {
  const { error: err } = await db
    .from('workout_data')
    .update({ blocks: program.blocks, microcycles: program.microcycles })
    .eq('id', fila.id);
  if (err) {
    console.error(`  ERROR en ${nombre(fila.client_id)}: ${err.message}`);
    continue;
  }
  escritos += 1;
}

console.log(`\n  Escritos ${escritos} de ${trabajo.length}.\n`);
