/**
 * ENSAYO DE LA MIGRACIÓN: guardar el microciclo en cada bloque, en seco.
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * F2b del microciclo como secuencia conecta `materializarMicrociclos` a
 * `applyPlan`: la primera escritura de cada programa guarda en cada bloque la
 * secuencia que hasta ahora se derivaba del reparto y del patrón del cliente.
 * Antes de conectarlo se ENSAYA sobre copias de seguridad y se comprueba,
 * programa a programa, que lo guardado se lee igual que lo derivado: los
 * microciclos y sus fechas, la fecha del siguiente, las casillas de la dieta,
 * la semana del cliente y las cifras del bloque. Y que la primera escritura no
 * cambia `weekly_split`, que desde F2b es copia del bloque abierto
 * (`conRepartoDelAbierto`).
 * Ver `docs/estudio-microciclo-secuencia.md`.
 *
 * Este script NO escribe en ninguna base de datos.
 *
 * ══ Uso ════════════════════════════════════════════════════════════════════
 *
 *   npm run ensayo:microciclo                         la carpeta más reciente
 *   npm run ensayo:microciclo -- copias/2026-08-13T09-43-05 _copia-javier.json
 *   npm run ensayo:microciclo -- --detalle            cada bloque, con su secuencia
 *
 * Vale una carpeta de `npm run backup`, la copia de un cliente (`cliente` +
 * `workout_data`) o una lista de filas de `workout_data`. Termina en error si
 * alguna comparación falla.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  blockSummary,
  blocksOf,
  cicloPorAbrir,
  clientCycleSlots,
  conRepartoDelAbierto,
  fechaDelCicloSiguiente,
  materializarMicrociclos,
  microcicloDelBloque,
  seguirALasHojas,
  semanaDelCliente,
} from '../src/domain/blocks.js';
import { cadenaDe, duracionDe, nextCycleDate, vecesDeCadaHoja } from '../src/domain/training.js';
import { mapWorkoutFromDb } from '../src/lib/mappers.js';
import { addDays } from '../src/lib/dates.js';

const args = process.argv.slice(2);
const detalle = args.includes('--detalle');
const rutas = args.filter((a) => !a.startsWith('--'));

function ultimaCarpeta() {
  if (!existsSync('copias')) return null;
  const dirs = readdirSync('copias')
    .filter((d) => statSync(join('copias', d)).isDirectory())
    .sort();
  return dirs.length ? join('copias', dirs[dirs.length - 1]) : null;
}

const leer = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null);

/** De cualquier forma de copia, `[{ id, nombre, cliente, program }]`. */
function programasDe(ruta) {
  if (statSync(ruta).isDirectory()) {
    const filas = leer(join(ruta, 'datos', 'workout_data.json')) || [];
    const clientes = leer(join(ruta, 'datos', 'clients.json')) || [];
    return filas.map((fila) => deFila(fila, clientes.find((c) => c.id === fila.client_id)));
  }
  const json = leer(ruta);
  if (json?.workout_data) {
    const filas = Array.isArray(json.workout_data) ? json.workout_data : Object.values(json.workout_data);
    return filas.filter(Boolean).map((fila) => deFila(fila, json.cliente));
  }
  return (Array.isArray(json) ? json : [json]).filter(Boolean).map((fila) => deFila(fila, null));
}

const deFila = (fila, cliente) => ({
  id: fila.client_id,
  nombre: cliente?.name || fila.client_id,
  /* Sin la ficha, el tipo no se sabe: se deriva como semanal, igual que la app
     con un cliente sin `cycle_type`. Se dice en la salida. */
  cliente: cliente?.cycle_type
    ? { cycleType: cliente.cycle_type, cyclePattern: cliente.cycle_pattern }
    : null,
  program: mapWorkoutFromDb(fila),
});

const fuentes = rutas.length ? rutas : [ultimaCarpeta()].filter(Boolean);
if (fuentes.length === 0) {
  console.error('No hay ninguna copia en `copias/`. Haz una con `npm run backup` o pasa la ruta.');
  process.exit(1);
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const total = { programas: 0, sinFicha: 0, bloques: 0, semanal: 0, rotativo: 0, repetidas: 0, reglaVieja: 0 };
const fallos = [];

for (const fuente of fuentes) {
  const lista = programasDe(fuente);
  console.log(`\nEnsayo sobre ${fuente} · ${lista.length} programas\n`);

  for (const { nombre, cliente, program: antes } of lista) {
    total.programas += 1;
    if (!cliente) total.sinFicha += 1;
    const quien = cliente ? cliente : {};
    const despues = materializarMicrociclos(antes, cliente);
    const problemas = [];
    const mira = (que, a, b) => {
      if (!igual(a, b)) problemas.push(que);
    };

    /* Lo guardado: microciclos intactos, idempotente, y en los bloques solo se
       añade `microciclo`. */
    mira('microciclos', antes.microcycles, despues.microcycles);
    if (materializarMicrociclos(despues, cliente) !== despues) problemas.push('no es idempotente');
    /* Lo demás que hace la primera escritura: copiar el reparto y seguir a las
       hojas. Sin cambios de hojas, ninguna de las dos toca nada. */
    mira('weekly_split', antes.weeklySplit, conRepartoDelAbierto(despues).weeklySplit);
    if (seguirALasHojas(despues, despues, cliente) !== despues) problemas.push('seguir a las hojas cambia algo');
    const bloquesAntes = blocksOf(antes);
    const bloquesDespues = blocksOf(despues);
    mira('número de bloques', bloquesAntes.length, bloquesDespues.length);
    bloquesDespues.forEach((b, i) => {
      const resto = { ...b };
      delete resto.microciclo;
      mira(`bloque ${b.name}: campos`, resto, bloquesAntes[i]);
    });

    /* Lo que se lee de él. */
    mira('casillas', clientCycleSlots(quien, antes), clientCycleSlots(quien, despues));
    mira('cicloPorAbrir', cicloPorAbrir(antes, cliente), cicloPorAbrir(despues, cliente));
    for (const [i, b] of bloquesAntes.entries()) {
      const d = bloquesDespues[i];
      mira(`duración ${b.name}`, duracionDe(microcicloDelBloque(antes, b, cliente)), duracionDe(microcicloDelBloque(despues, d, cliente)));
      mira(`cifras ${b.name}`, blockSummary(antes, b, cliente), blockSummary(despues, d, cliente));
    }
    for (const m of antes.microcycles) {
      const fecha = fechaDelCicloSiguiente(antes, m, cliente);
      mira(`fecha tras M${m.weekNumber}`, fecha, fechaDelCicloSiguiente(despues, m, cliente));
      /* Informativo: la regla vieja (duda 6 del estudio). No es un fallo. */
      if (m.date && fecha !== nextCycleDate(m, quien.cycleType, quien.cyclePattern)) total.reglaVieja += 1;
    }
    const casillasAntes = clientCycleSlots(quien, antes);
    const casillasDespues = clientCycleSlots(quien, despues);
    const ultima = antes.microcycles[antes.microcycles.length - 1]?.date;
    for (const hoy of [ultima, addDays(ultima, 3), addDays(ultima, 10), '2026-09-22'].filter(Boolean)) {
      mira(`semana del ${hoy}`, semanaDelCliente(quien, antes, casillasAntes, hoy), semanaDelCliente(quien, despues, casillasDespues, hoy));
    }

    const guardados = bloquesDespues.map((b) => b.microciclo);
    total.bloques += guardados.length;
    for (const mc of guardados) {
      total[mc.tipo] += 1;
      if ([...vecesDeCadaHoja(mc).values()].some((n) => n > 1)) total.repetidas += 1;
    }

    const marca = problemas.length === 0 ? 'ok' : `${problemas.length} DIFERENCIAS`;
    const tipo = cliente ? cliente.cycleType : 'sin ficha';
    console.log(
      `  ${marca.padEnd(16)} ${String(nombre).slice(0, 36).padEnd(38)} ${tipo.padEnd(9)} ` +
        `${String(antes.microcycles.length).padStart(3)} microciclos · ${guardados.length} bloques`
    );
    if (problemas.length > 0) {
      fallos.push({ nombre, problemas });
      for (const p of problemas.slice(0, 5)) console.log(`${' '.repeat(20)}${p}`);
    }
    if (detalle) {
      bloquesDespues.forEach((b) => {
        const mc = b.microciclo;
        const dias = mc.dias.map((d) => (d.descanso ? '·' : d.hoja || '?')).join(' ');
        const cadena = mc.tipo === 'rotativo' ? ` «${cadenaDe(mc.dias) || '—'}»` : '';
        console.log(`${' '.repeat(20)}«${b.name}» ${mc.tipo}${cadena}: ${dias}`);
      });
    }
  }
}

console.log(
  `\n  Total: ${total.programas} programas (${total.sinFicha} sin ficha de cliente) · ` +
    `${total.bloques} bloques materializados (${total.semanal} semanales, ${total.rotativo} rotativos) · ` +
    `${total.repetidas} con una hoja en dos días`
);
console.log(
  `  Informativo: ${total.reglaVieja} fechas del siguiente distintas de la regla vieja \`nextCycleDate\` ` +
    '(hojas retiradas en los días del microciclo; ver la duda 6 del estudio).'
);

if (fallos.length > 0) {
  console.error(`\n  ${fallos.length} programas donde lo guardado NO se lee igual. No se conecta.\n`);
  process.exit(1);
}

console.log('\n  Todo se lee igual guardado que derivado. Se puede conectar.\n');
