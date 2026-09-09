/**
 * REPARAR LAS SEMANAS QUE NO SE PUEDEN REGISTRAR.
 *
 * ══ Qué arregla ════════════════════════════════════════════════════════════
 *
 * Desde que el plan vive en el bloque (0086), la pantalla del cliente lee las
 * hojas del bloque —`resolvedMicrocycles`— y por tanto trabaja con los ids de
 * ejercicio del BLOQUE, que son uno solo para todas sus semanas.
 *
 * Pero el cliente no escribe el programa: escribe por `log_session_set` (0014),
 * que busca el ejercicio dentro de `microcycles[].days[]`. Ahí siguen los ids
 * viejos, uno distinto por semana. Coinciden en la semana de la que se leyó el
 * plan al migrar; en todas las demás, no, y entonces cada número que anota esa
 * persona vuelve rechazado:
 *
 *     El ejercicio ex_… no está programado en Lower A
 *
 * En pantalla el número aparece —el estado local lo acepta— y no vuelve tras
 * recargar. El rechazo es `P0001`, o sea definitivo: ni se reintenta ni se
 * apunta. Un entrenamiento entero, perdido sin ruido.
 *
 * ══ Qué hace ═══════════════════════════════════════════════════════════════
 *
 * Guarda en `days` exactamente lo que la pantalla ya enseña
 * (`proyectarPlanEnDias`), con los ids del plan. No es una conversión nueva ni
 * una regla escrita para este script: es la misma proyección que la aplicación
 * usa para leer, escrita ahora también en la fila. Por eso no puede «decidir»
 * nada distinto de lo que el cliente tiene delante.
 *
 * Lo ejecutado no se mueve de sitio: los kilos viven en `microcycle.sessions`, y
 * los del histórico viejo que aún están dentro de `days` viajan con la
 * proyección (`conLoAnotado`). Las hojas que el plan ya no tiene se conservan.
 *
 * ══ Y la otra mitad: lo anotado que no se ve ═══════════════════════════════
 *
 * La misma divergencia tiene un segundo efecto, y este no da ningún error. Una
 * sesión guarda lo levantado bajo el id que el ejercicio tenía en `days`; la
 * hoja lo busca por el id del plan. Cuando no coinciden, **los kilos siguen
 * guardados y dejan de verse**: casillas vacías donde hay un entrenamiento.
 *
 * Proyectar no lo arregla —las sesiones no se tocan al proyectar—, así que este
 * script reasigna además esas entradas al ejercicio del plan que se llama igual
 * en el mismo día, y solo cuando la correspondencia es una a una y no hay nada
 * que adivinar. La regla entera y sus pruebas, en `reasignar-entradas.mjs`.
 *
 * ══ Uso ════════════════════════════════════════════════════════════════════
 *
 *   npm run reparar:ids                      en seco: dice qué cambiaría
 *   npm run reparar:ids -- --cliente antonio  solo los que casen con ese nombre
 *   npm run reparar:ids -- --aplicar          escribe, tras guardar una copia
 *
 * En seco no escribe nada. Al aplicar, primero deja las filas ORIGINALES en
 * `copias/reparacion-<fecha>.json`, para poder volver atrás con un `restore`
 * manual si algo saliera mal.
 *
 * Necesita `SUPABASE_SERVICE_ROLE_KEY` en `.env.backup`, igual que `npm run
 * backup`: se escriben filas de clientes de varios entrenadores y RLS no deja
 * hacer eso desde ninguna sesión.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

import { proyectarPlanEnDias, blocksOf, hasBlockPlan } from '../src/domain/blocks.js';
import { reasignarEntradas, seriesAnotadas } from './reasignar-entradas.mjs';
import { resolverCredenciales } from './credenciales.mjs';

/*
  Las variables, a mano. Los demás scripts las cargan con `node --env-file`,
  pero este corre bajo `vite-node` —necesita el alias `@/` para importar el
  dominio— y esa bandera es de node, no suya. Leer dos archivos de texto es más
  barato que duplicar el dominio aquí.
*/
for (const archivo of ['.env', '.env.backup']) {
  if (!existsSync(archivo)) continue;
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const filtro = (args[args.indexOf('--cliente') + 1] || '').toLowerCase();
const soloUno = args.includes('--cliente') ? filtro : null;

const { url, key, error } = resolverCredenciales({ para: 'la reparación' });
if (error) {
  console.error(`\n${error}\n`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: clientes, error: e1 } = await db.from('clients').select('id,name');
if (e1) {
  console.error('No se ha podido leer la lista de clientes:', e1.message);
  process.exit(1);
}
const nombreDe = new Map((clientes || []).map((c) => [c.id, c.name]));

const { data: filas, error: e2 } = await db
  .from('workout_data')
  .select('client_id,blocks,microcycles');
if (e2) {
  console.error('No se han podido leer los programas:', e2.message);
  process.exit(1);
}

/** Los ids que `log_session_set` aceptaría en esa semana. */
const idsDeLosDias = (micro) =>
  new Set((micro.days || []).flatMap((d) => (d.exercises || []).map((e) => e.id)));

/** Los ids que la pantalla usa en esa semana: los del plan resuelto. */
const idsEnPantalla = (program, micro) => {
  const resuelto = (proyectarPlanEnDias(program).microcycles || []).find(
    (m) => m.weekNumber === micro.weekNumber
  );
  return new Set((resuelto?.days || []).flatMap((d) => (d.exercises || []).map((e) => e.id)));
};

const originales = [];
const porArreglar = [];

for (const fila of filas || []) {
  const quien = nombreDe.get(fila.client_id) || fila.client_id;
  if (soloUno && !quien.toLowerCase().includes(soloUno)) continue;
  if (!blocksOf(fila).some(hasBlockPlan)) continue;

  const rotas = [];
  for (const micro of fila.microcycles || []) {
    const enDias = idsDeLosDias(micro);
    const enPantalla = idsEnPantalla(fila, micro);
    const huerfanos = [...enPantalla].filter((id) => !enDias.has(id));
    if (huerfanos.length > 0) rotas.push({ semana: micro.weekNumber, cuantos: huerfanos.length });
  }

  /*
    Y lo ya REGISTRADO bajo un id que la pantalla no nombra: la otra mitad de la
    misma divergencia. Los `days` deciden si se PUEDE anotar; las entradas de las
    sesiones deciden si lo anotado SE VE. Ver `reasignar-entradas.mjs`.
  */
  const { program: reparado, cambios } = reasignarEntradas(proyectarPlanEnDias(fila));

  if (rotas.length === 0 && cambios.length === 0) {
    console.log(`  ok        ${quien}`);
    continue;
  }

  /*
    ── La comprobación que impide una reparación destructiva ────────────────
    Antes de escribir se exige que, semana a semana, TODO lo que la pantalla
    nombra esté ahora en `days`, y que no se haya perdido ninguna sesión ni
    ninguna entrada. Si algo no cuadra, ese cliente se salta: es preferible
    dejarlo roto y mirarlo a mano que escribirle una fila peor que la que tenía.
  */
  const problemas = [];
  for (const micro of reparado.microcycles || []) {
    const antes = (fila.microcycles || []).find((m) => m.weekNumber === micro.weekNumber);
    const enDias = idsDeLosDias(micro);
    const faltan = [...idsEnPantalla(reparado, micro)].filter((id) => !enDias.has(id));
    if (faltan.length > 0) problemas.push(`M${micro.weekNumber}: ${faltan.length} ejercicios sin id en days`);

    const sesionesAntes = (antes?.sessions || []).length;
    const sesionesDespues = (micro.sessions || []).length;
    if (sesionesAntes !== sesionesDespues) {
      problemas.push(`M${micro.weekNumber}: ${sesionesAntes} sesiones → ${sesionesDespues}`);
    }

    /*
      ── Y el histórico viejo, el que vive DENTRO del plan ────────────────────
      Los datos anteriores a las sesiones con fecha guardan los kilos en
      `days[].exercises[].sets` y `legacySession` los saca de ahí. La proyección
      los reinstala (`conLoAnotado`), pero un ejercicio que el plan del bloque ya
      no tiene no tiene dónde volver. Se cuenta antes y después: si falta uno,
      este cliente no se escribe.
    */
    const conRegistro = (dias) =>
      (dias || []).flatMap((d) =>
        (d.exercises || [])
          .filter((e) => (e.sets || []).some((s) => s?.kg || s?.reps || s?.rir))
          .map((e) => `${d.dayName}/${String(e.name || '').trim().toLowerCase()}`)
      );

    const perdidos = conRegistro(antes?.days).filter(
      (k) => !conRegistro(micro.days).includes(k)
    );
    if (perdidos.length > 0) {
      problemas.push(`M${micro.weekNumber}: se perdería lo anotado en ${perdidos.join(', ')}`);
    }
  }
  if ((reparado.microcycles || []).length !== (fila.microcycles || []).length) {
    problemas.push('cambia el número de microciclos');
  }

  /*
    ── Y la que protege lo registrado ───────────────────────────────────────
    Reasignar cambia el id de una entrada y nada más, así que el número de
    series anotadas tiene que ser exactamente el mismo antes y después. Si no lo
    es, se ha juntado o se ha perdido algo y este cliente no se escribe. Se
    comprueba además que ninguna sesión acabe con dos entradas del mismo
    ejercicio, que es la forma en que se duplicaría el tonelaje.
  */
  if (seriesAnotadas(reparado) !== seriesAnotadas(fila)) {
    problemas.push(
      `cambian las series anotadas: ${seriesAnotadas(fila)} → ${seriesAnotadas(reparado)}`
    );
  }
  for (const micro of reparado.microcycles || []) {
    for (const ses of micro.sessions || []) {
      const ids = (ses.entries || []).map((e) => e.exerciseId);
      if (new Set(ids).size !== ids.length) {
        problemas.push(`M${micro.weekNumber} ${ses.dayName} ${ses.date}: entradas repetidas`);
      }
    }
  }

  const detalle = [
    rotas.length > 0 ? `semanas ${rotas.map((r) => `M${r.semana} (${r.cuantos})`).join(', ')}` : null,
    cambios.length > 0 ? `${cambios.length} entradas por reasignar` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (problemas.length > 0) {
    console.log(`  SE SALTA  ${quien} · ${detalle}`);
    for (const p of problemas) console.log(`            ${p}`);
    continue;
  }

  console.log(`  arregla   ${quien} · ${detalle}`);
  for (const c of cambios) {
    console.log(
      `            M${c.semana} ${c.dayName} ${c.date} · «${c.name}» ` +
        `${c.series} ${c.series === 1 ? 'serie anotada' : 'series anotadas'} · ${c.de} → ${c.a}`
    );
  }
  originales.push(fila);
  porArreglar.push({ client_id: fila.client_id, microcycles: reparado.microcycles, quien });
}

if (porArreglar.length === 0) {
  console.log('\n  No hay nada que reparar.\n');
  process.exit(0);
}

if (!aplicar) {
  console.log(
    `\n  ${porArreglar.length} programas por reparar. Nada escrito: esto era el ensayo.\n` +
      '  Para escribirlo:  npm run reparar:ids -- --aplicar\n'
  );
  process.exit(0);
}

await mkdir('copias', { recursive: true });
const respaldo = `copias/reparacion-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(respaldo, JSON.stringify(originales, null, 2), 'utf8');
console.log(`\n  Copia de las filas originales en ${respaldo}`);

let escritos = 0;
for (const { client_id, microcycles, quien } of porArreglar) {
  const { error } = await db
    .from('workout_data')
    .update({ microcycles, updated_at: new Date().toISOString() })
    .eq('client_id', client_id);

  if (error) console.error(`  FALLA     ${quien}: ${error.message}`);
  else {
    escritos++;
    console.log(`  escrito   ${quien}`);
  }
}

console.log(`\n  ${escritos} de ${porArreglar.length} programas reparados.\n`);
process.exit(escritos === porArreglar.length ? 0 : 1);
