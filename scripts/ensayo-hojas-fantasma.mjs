/**
 * ENSAYO DE LA LIMPIEZA DE HOJAS FANTASMA, en seco.
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * `proyectarPlanEnDias` conservaba en los `days` de TODOS los microciclos del
 * bloque cualquier hoja que el plan ya no tuviera —quitada o renombrada—, se
 * hubiera entrenado o no. Eran las hojas fantasma: fuera del plan y sin forma
 * de editarlas. Desde el arreglo solo se conserva donde tiene sesiones (o kilos
 * heredados dentro), y las que ya están guardadas se van en la siguiente
 * escritura del plan.
 *
 * Esto hace esa siguiente escritura sobre una copia, con la regla vieja y con
 * la nueva, y comprueba que la nueva quita EXACTAMENTE las hojas fuera del plan
 * sin sesiones, deja las que tienen sesiones y no toca nada más.
 *
 * Este script NO escribe en ninguna base de datos.
 *
 * ══ Uso ════════════════════════════════════════════════════════════════════
 *
 *   npm run ensayo:fantasmas                          la carpeta más reciente
 *   npm run ensayo:fantasmas -- copias/2026-09-22T09-28-46
 *   npm run ensayo:fantasmas -- --detalle             cada hoja, con su sitio
 *
 * Termina en error si algo distinto de un fantasma cambia.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { blockOfWeek, blocksOf, hasBlockPlan, planOfWeek, proyectarPlanEnDias, resolvedMicrocycles } from '../src/domain/blocks.js';
import { migrateBlockPlans } from '../src/domain/blocksMigration.js';
import { executedSessions } from '../src/domain/sessions.js';
import { mapWorkoutFromDb } from '../src/lib/mappers.js';

const args = process.argv.slice(2);
const detalle = args.includes('--detalle');
const [ruta] = args.filter((a) => !a.startsWith('--'));

function ultimaCarpeta() {
  if (!existsSync('copias')) return null;
  const dirs = readdirSync('copias').filter((d) => statSync(join('copias', d)).isDirectory()).sort();
  return dirs.length ? join('copias', dirs[dirs.length - 1]) : null;
}

const carpeta = ruta || ultimaCarpeta();
if (!carpeta) {
  console.error('No hay ninguna copia en `copias/`. Haz una con `npm run backup` o pasa la ruta.');
  process.exit(1);
}

const leer = (f) => JSON.parse(readFileSync(join(carpeta, 'datos', f), 'utf8'));
const filas = leer('workout_data.json');
const clientes = leer('clients.json');

/** La regla de antes del arreglo: toda retirada se queda, entrenada o no. */
const proyectarComoAntes = (program) => {
  if (!blocksOf(program).some(hasBlockPlan)) return program;
  const resueltos = resolvedMicrocycles(program);
  return {
    ...program,
    microcycles: (program.microcycles || []).map((micro, i) => {
      const resuelto = resueltos[i];
      if (resuelto === micro) return micro;
      const enElPlan = new Set((resuelto.days || []).map((d) => d.dayName));
      const retiradas = (micro.days || []).filter((d) => !enElPlan.has(d.dayName));
      return retiradas.length === 0 ? resuelto : { ...resuelto, days: [...(resuelto.days || []), ...retiradas] };
    }),
  };
};

const clave = (quien, semana, hoja) => `${quien}|M${semana}|${hoja}`;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const fantasmas = new Set(); // fuera del plan, sin sesiones: se tienen que ir
const entrenadas = new Set(); // fuera del plan, con sesiones: se tienen que quedar
const quitadas = new Set();
const fallos = [];

for (const fila of filas) {
  const quien = clientes.find((c) => c.id === fila.client_id)?.name || fila.client_id;
  /* Lo mismo que `applyPlan` antes de escribir. */
  const program = migrateBlockPlans(mapWorkoutFromDb(fila)).program;

  /* El inventario, leído de lo guardado. */
  for (const micro of program.microcycles || []) {
    if (!hasBlockPlan(blockOfWeek(program, micro.weekNumber))) continue;
    const plan = new Set(planOfWeek(program, micro.weekNumber).map((h) => h.dayName));
    const conSesion = new Set(executedSessions(micro).map((s) => s.dayName));
    for (const d of micro.days || []) {
      if (plan.has(d.dayName)) continue;
      (conSesion.has(d.dayName) ? entrenadas : fantasmas).add(clave(quien, micro.weekNumber, d.dayName));
    }
  }

  /* La siguiente escritura, con las dos reglas. */
  const antes = proyectarComoAntes(program);
  const ahora = proyectarPlanEnDias(program);
  const problemas = [];
  if (!igual({ ...antes, microcycles: null }, { ...ahora, microcycles: null })) problemas.push('cambia algo fuera de los microciclos');
  antes.microcycles.forEach((m, i) => {
    const n = ahora.microcycles[i];
    if (!igual({ ...m, days: null }, { ...n, days: null })) problemas.push(`M${m.weekNumber}: cambia algo fuera de los días`);
    const quedan = new Set((n.days || []).map((d) => d.dayName));
    for (const d of m.days || []) if (!quedan.has(d.dayName)) quitadas.add(clave(quien, m.weekNumber, d.dayName));
    const restantes = (m.days || []).filter((d) => quedan.has(d.dayName));
    if (!igual(restantes, n.days)) problemas.push(`M${m.weekNumber}: los días que se quedan no son idénticos`);
  });
  if (problemas.length) fallos.push({ quien, problemas });
}

const diferencia = (a, b) => [...a].filter((x) => !b.has(x));
const deMas = diferencia(quitadas, fantasmas);
const deMenos = diferencia(fantasmas, quitadas);
const tocadas = [...entrenadas].filter((x) => quitadas.has(x));

console.log(`\nEnsayo sobre ${carpeta} · ${filas.length} programas\n`);
console.log(`  Fuera del plan: ${fantasmas.size + entrenadas.size} (${fantasmas.size} sin sesiones, ${entrenadas.size} con sesiones)`);
console.log(`  La siguiente escritura quita: ${quitadas.size}`);
console.log(`  Quitadas que no eran fantasma: ${deMas.length} · fantasmas que se quedan: ${deMenos.length} · con sesiones tocadas: ${tocadas.length}`);

if (detalle) {
  const lista = (titulo, conjunto) => {
    console.log(`\n  ${titulo}`);
    for (const k of [...conjunto].sort()) console.log(`    ${k.split('|').join(' · ')}`);
  };
  lista('Se quitan', quitadas);
  lista('Se quedan (con sesiones)', entrenadas);
}

for (const { quien, problemas } of fallos) console.log(`\n  ${quien}: ${problemas.slice(0, 5).join('; ')}`);

if (fallos.length || deMas.length || deMenos.length || tocadas.length) {
  console.error('\n  La limpieza no es exactamente la esperada. No se publica.\n');
  process.exit(1);
}
console.log('\n  Quita exactamente los fantasmas y nada más.\n');
