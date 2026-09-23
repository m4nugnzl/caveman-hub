/**
 * REPARAR LAS SESIONES CON EL NOMBRE VIEJO DE SU HOJA.
 *
 * ══ Qué arregla ════════════════════════════════════════════════════════════
 *
 * Antes de `ac05e52`, renombrar una hoja no se llevaba sus sesiones: se
 * quedaban con el nombre de antes, que ya no casa con ningún día del plan. No
 * cuentan en la adherencia (van a `extra`) y no salen en su hoja.
 *
 * Con la copia del 22 sep solo hay un caso que sea un renombre de verdad:
 * Roberto Pérez, M1, «MARTES» del 25 ago, que tiene exactamente los ocho
 * ejercicios de EMPUJE (los mismos ids). Los demás nombres viejos no se
 * arreglan así: Javier Bolaños y Gustavo Dueñas son de F2d (sus sesiones no
 * comparten ejercicios con las hojas de hoy, o son hojas quitadas del bloque
 * cerrado), y Daniel y Raúl tienen sesiones vacías.
 *
 * ══ Qué hace ═══════════════════════════════════════════════════════════════
 *
 * Cambia el `dayName` de las sesiones de la lista `REPARACIONES`, y nada más.
 * La lista está escrita a mano: no se deduce nada. Cada una se comprueba sobre
 * la fila tal como esté al ejecutar (`renombrar-sesiones.mjs`), y además se
 * exige que fuera del nombre no cambie ni un byte de `microcycles`. Si algo no
 * cuadra, ese cliente se salta.
 *
 * ══ Uso ════════════════════════════════════════════════════════════════════
 *
 *   npm run reparar:nombres                          ensayo sobre la copia más reciente
 *   npm run reparar:nombres -- copias/2026-09-22T09-28-46
 *   npm run reparar:nombres -- --base                en seco contra la base de `.env`
 *   npm run reparar:nombres -- --base --aplicar      escribe, tras guardar una copia
 *
 * El ensayo y `--base` no escriben nada. `--aplicar` deja antes las filas
 * ORIGINALES en `copias/nombres-<fecha>.json`, y escribe con la guardia de
 * `updated_at`: si el entrenador guardó entre la lectura y la escritura, ese
 * cliente no se escribe. Necesita `SUPABASE_SERVICE_ROLE_KEY` en
 * `.env.backup`, como `npm run backup`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { blockSummary, blocksOf } from '../src/domain/blocks.js';
import { migrateBlockPlans } from '../src/domain/blocksMigration.js';
import { mapWorkoutFromDb } from '../src/lib/mappers.js';
import { cambiosAjenos, renombrarSesion } from './renombrar-sesiones.mjs';

/** Cada reparación, escrita a mano y comprobada en la copia del 22 sep. */
const REPARACIONES = [
  {
    cliente: 'c140d758-bcc9-44da-94dd-343c094884b3', // Roberto Pérez
    semana: 1,
    sesion: 'ses_8d8f5d29-25cf-40e0-9c46-b3b1771226df', // 25 ago
    de: 'MARTES',
    a: 'EMPUJE',
  },
];

const args = process.argv.slice(2);
const contraLaBase = args.includes('--base');
const aplicar = args.includes('--aplicar');
const [ruta] = args.filter((a) => !a.startsWith('--'));

if (aplicar && !contraLaBase) {
  console.error('\n  --aplicar solo tiene sentido con --base: el ensayo sobre la copia no escribe.\n');
  process.exit(1);
}

/* ── Las filas: de la copia o de la base ─────────────────────────────────── */

const ultimaCarpeta = () => {
  if (!existsSync('copias')) return null;
  const dirs = readdirSync('copias').filter((d) => statSync(join('copias', d)).isDirectory()).sort();
  return dirs.length ? join('copias', dirs[dirs.length - 1]) : null;
};

let filas;
let clientes;
let db = null;
let origen;

if (contraLaBase) {
  /* Como en `reparar-ids-del-plan`: bajo `vite-node` no hay `--env-file`. */
  for (const archivo of ['.env', '.env.backup']) {
    if (!existsSync(archivo)) continue;
    for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const { createClient } = await import('@supabase/supabase-js');
  const { resolverCredenciales } = await import('./credenciales.mjs');
  const { url, key, error } = resolverCredenciales({ para: 'la reparación' });
  if (error) {
    console.error(`\n${error}\n`);
    process.exit(1);
  }
  db = createClient(url, key, { auth: { persistSession: false } });
  origen = url;
  const ids = REPARACIONES.map((r) => r.cliente);
  const r1 = await db.from('clients').select('id,name,cycle_type,cycle_pattern').in('id', ids);
  const r2 = await db.from('workout_data').select('*').in('client_id', ids);
  if (r1.error || r2.error) {
    console.error('No se ha podido leer:', (r1.error || r2.error).message);
    process.exit(1);
  }
  clientes = r1.data;
  filas = r2.data;
} else {
  const carpeta = ruta || ultimaCarpeta();
  if (!carpeta) {
    console.error('No hay ninguna copia en `copias/`. Haz una con `npm run backup` o pasa la ruta.');
    process.exit(1);
  }
  const leer = (f) => JSON.parse(readFileSync(join(carpeta, 'datos', f), 'utf8'));
  clientes = leer('clients.json');
  filas = leer('workout_data.json');
  origen = carpeta;
}

/* ── La lectura que cambia: la adherencia de cada bloque ─────────────────── */

const adherencias = (fila, cliente) => {
  const program = migrateBlockPlans(mapWorkoutFromDb(fila)).program;
  const client = cliente && { cycleType: cliente.cycle_type, cyclePattern: cliente.cycle_pattern };
  return blocksOf(program).map((b) => {
    const r = blockSummary(program, b, client);
    return `${b.name || b.id}: ${r.hechas} de ${r.planificadas}${r.extra ? ` (+${r.extra} fuera del plan)` : ''}`;
  });
};

console.log(`\nReparar nombres viejos · ${contraLaBase ? `BASE ${origen}` : `copia ${origen}`}\n`);

const porEscribir = [];
for (const r of REPARACIONES) {
  const cliente = clientes.find((c) => c.id === r.cliente);
  const quien = cliente?.name || r.cliente;
  const fila = filas.find((f) => f.client_id === r.cliente);
  if (!fila) {
    console.log(`  SE SALTA  ${quien}: no tiene programa`);
    continue;
  }
  const { microcycles, problemas } = renombrarSesion(fila, r);
  const ajenos = microcycles ? cambiosAjenos(fila.microcycles, microcycles) : [];
  if (!microcycles || ajenos.length) {
    console.log(`  SE SALTA  ${quien}`);
    for (const p of [...problemas, ...ajenos]) console.log(`            ${p}`);
    continue;
  }
  const despues = { ...fila, microcycles };
  console.log(`  arregla   ${quien} · M${r.semana} «${r.de}» → «${r.a}»`);
  const [a, b] = [adherencias(fila, cliente), adherencias(despues, cliente)];
  a.forEach((x, i) => console.log(`            ${x}  →  ${b[i]}`));
  porEscribir.push({ fila, microcycles, quien });
}

if (porEscribir.length === 0) {
  console.log('\n  Nada que reparar.\n');
  process.exit(0);
}
if (!aplicar) {
  console.log(`\n  ${porEscribir.length} por reparar. Nada escrito: esto era el ensayo.\n`);
  process.exit(0);
}

await mkdir('copias', { recursive: true });
const respaldo = `copias/nombres-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(respaldo, JSON.stringify(porEscribir.map((p) => p.fila), null, 2), 'utf8');
console.log(`\n  Copia de las filas originales en ${respaldo}`);

let escritos = 0;
for (const { fila, microcycles, quien } of porEscribir) {
  /* Solo `microcycles`: el plan (`blocks`) no se toca. Y con la guardia de
     `updated_at`, para no pisar lo que alguien haya guardado entre medias. */
  const { data, error } = await db
    .from('workout_data')
    .update({ microcycles, updated_at: new Date().toISOString() })
    .eq('client_id', fila.client_id)
    .eq('updated_at', fila.updated_at)
    .select('client_id');
  if (error) console.error(`  FALLA     ${quien}: ${error.message}`);
  else if (!data?.length) console.error(`  NO ESCRITO ${quien}: alguien guardó entre medias; vuelve a ejecutarlo`);
  else {
    escritos++;
    console.log(`  escrito   ${quien}`);
  }
}
console.log(`\n  ${escritos} de ${porEscribir.length} reparados.\n`);
process.exit(escritos === porEscribir.length ? 0 : 1);
