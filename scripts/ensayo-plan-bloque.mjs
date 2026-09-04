/**
 * ENSAYO DE LA MIGRACIÓN: subir el plan al bloque, en seco.
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * El plan de entrenamiento pasa de vivir copiado en cada microciclo a vivir una
 * sola vez en su bloque (`domain/blocksMigration`). Es el corazón del producto y
 * hay programas de clientes reales dentro, así que la migración no se lanza a
 * ver qué pasa: primero se ENSAYA sobre una copia de seguridad y se comprueba,
 * cliente a cliente, que la lectura nueva dice exactamente lo mismo que la
 * vieja.
 *
 * Este script NO escribe en ninguna base de datos. Lee una carpeta de copia, la
 * migra en memoria y cuenta qué habría pasado.
 *
 * ══ Uso ════════════════════════════════════════════════════════════════════
 *
 *   node scripts/ensayo-plan-bloque.mjs                  la copia más reciente
 *   node scripts/ensayo-plan-bloque.mjs copias/2026-08-13T09-43-05
 *   node scripts/ensayo-plan-bloque.mjs --detalle        cada cliente, entero
 *
 * Termina en error si alguna comparación falla, para que valga en integración
 * continua: si esto no está en verde, la migración no se lanza.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { migrateBlockPlans, compareBlockPlans } from '../src/domain/blocksMigration.js';
import { blocksOf, hasBlockPlan } from '../src/domain/blocks.js';

const args = process.argv.slice(2);
const detalle = args.includes('--detalle');
const carpeta = args.find((a) => !a.startsWith('--')) || ultimaCopia();

function ultimaCopia() {
  if (!existsSync('copias')) return null;
  const dirs = readdirSync('copias').sort();
  return dirs.length ? join('copias', dirs[dirs.length - 1]) : null;
}

const leer = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null);

if (!carpeta) {
  console.error('No hay ninguna copia en `copias/`. Haz una con `npm run backup` o pasa la carpeta.');
  process.exit(1);
}

/* Una copia de un solo cliente (`npm run ver-cliente` la escribe así) vale
   igual: es el mismo programa, en un archivo en vez de en una carpeta. */
const suelta = carpeta.endsWith('.json');
const datos = suelta ? null : join(carpeta, 'datos');
const programas = suelta
  ? Object.values(leer(carpeta)?.workout_data || {}).filter(Boolean)
  : leer(join(datos, 'workout_data.json'));
/* En la copia de un solo cliente, `cliente` ES el cliente; en la carpeta,
   `clients.json` es la lista de todos. */
const clientes = suelta ? [leer(carpeta)?.cliente].filter((c) => c?.id) : leer(join(datos, 'clients.json')) || [];

if (!programas || programas.length === 0) {
  console.error(`No encuentro programas en ${carpeta}.`);
  process.exit(1);
}

const nombre = (id) => clientes.find((c) => c.id === id)?.name || id;

console.log(`\nEnsayo sobre ${carpeta} · ${programas.length} programas\n`);

const total = { bloques: 0, hojas: 0, excepciones: 0, sesiones: 0, vacios: 0 };
const fallos = [];

for (const antes of programas) {
  const quien = nombre(antes.client_id);
  const { program, report } = migrateBlockPlans(antes);
  const diferencias = compareBlockPlans(antes, program);

  total.bloques += report.bloques;
  total.hojas += report.hojas;
  total.excepciones += report.excepciones;
  total.sesiones += report.sesionesReapuntadas;
  total.vacios += report.bloquesVacios.length;

  const micros = (antes.microcycles || []).length;
  const marca = diferencias.length === 0 ? 'ok' : `${diferencias.length} DIFERENCIAS`;
  console.log(
    `  ${marca.padEnd(16)} ${quien.padEnd(22)} ${String(micros).padStart(3)} microciclos · ` +
      `${report.bloques} bloques · ${report.hojas} hojas · ${report.excepciones} excepciones · ` +
      `${report.sesionesReapuntadas} sesiones reapuntadas`
  );

  if (report.bloquesVacios.length > 0) {
    console.log(`${' '.repeat(20)}sin nada escrito: ${report.bloquesVacios.join(', ')}`);
  }

  if (diferencias.length > 0) {
    fallos.push({ quien, diferencias });
    for (const d of diferencias.slice(0, 5)) {
      console.log(`${' '.repeat(20)}M${d.week} · ${d.dayName} · ${d.motivo}`);
    }
  }

  if (detalle) {
    for (const b of blocksOf(program).filter(hasBlockPlan)) {
      console.log(`${' '.repeat(20)}«${b.name}»: ${(b.sessions || []).map((s) => `${s.dayName}(${(s.exercises || []).length})`).join(' ')}`);
    }
  }
}

console.log(
  `\n  Total: ${total.bloques} bloques con plan · ${total.hojas} hojas · ${total.excepciones} excepciones · ` +
    `${total.sesiones} sesiones reapuntadas · ${total.vacios} bloques sin nada escrito`
);

if (fallos.length > 0) {
  console.error(`\n  ${fallos.length} programas donde la lectura nueva NO dice lo mismo. No se migra.\n`);
  process.exit(1);
}

console.log('\n  Todas las lecturas coinciden. La migración se puede lanzar.\n');
