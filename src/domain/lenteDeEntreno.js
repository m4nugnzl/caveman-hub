/**
 * LA LENTE DE ENTRENO DE LA PORTADA DE REVISIONES: lo que llevan sus columnas.
 *
 * ══ Qué contesta, y por qué vive en el dominio ══════════════════════════════
 *
 * La portada dibuja SEMANAS NATURALES —una columna por lunes— y el entreno se
 * guarda por MICROCICLOS, que en un rotativo no miden siete días. Traducir lo
 * uno a lo otro es una cuenta con reglas, no un formateo, y la tiene que
 * contestar igual que la dieta del cliente: si la lente dijera que esa semana
 * pedía cinco entrenos y la dieta del cliente estuviera repartiendo cuatro,
 * una de las dos estaría mintiendo y no habría forma de saber cuál.
 *
 * Por eso la cuenta es LA MISMA que `semanaDelCliente` (`domain/blocks.js`):
 * un día cae en la casilla `(días desde el ancla) mod (número de casillas)`, y
 * en un ciclo semanal no hay nada que traducir porque la casilla ya es el día
 * de la semana.
 *
 * ── En qué se diferencia de `semanaDelCliente`, y por qué ──────────────────
 * En el ANCLA. Aquella contesta por HOY y usa el microciclo en curso; esta
 * mira semanas de hace seis meses, cuando corría otro bloque con otra
 * secuencia y otro N. Así que cada semana se cuenta con el microciclo de SU
 * bloque y desde la fecha del PRIMER microciclo de ese bloque.
 *
 * Para el bloque que corre las dos anclas dan la misma casilla, y no por
 * suerte: los microciclos de un bloque van seguidos —cada uno empieza donde
 * acaba el anterior (`fechaDelSiguiente`)—, así que la distancia entre el
 * primero y el último es múltiplo de N y las dos cuentas son congruentes.
 *
 * ── El día saltado sigue aparcado ─────────────────────────────────────────
 * Aquí no se compensa nada. Si alguien se salta un día en un rotativo, su
 * entreno no avanza con el calendario y la cuenta sigue corriendo hasta que el
 * microciclo siguiente la reancla. Es la decisión escrita en
 * `docs/estudio-microciclo-secuencia.md` §1.4, y cambiarla desde una lente de
 * lectura sería decidirla de refilón.
 *
 * ══ Lo que NO hace ═════════════════════════════════════════════════════════
 * No juzga. Devuelve cuánto se levantó, cuántas sesiones había y cuántas se
 * hicieron. «Va bien» o «va mal» no sale de aquí ni de ninguna otra parte.
 */

import { daysBetween, localeNumber, weekStart } from '@/lib/dates';
import { blockPlan, blocksOf, microcicloDelBloque, weeksOfBlock } from './blocks';
import { referenciasSaneadas } from './borradores';
import { WEEK_DAYS, casillasDe, claveDelDia, duracionDe, entrenosDe, vecesDeCadaHoja } from './training';
import { allSessions, sessionSetCount, sessionTonnage } from './sessions';

/**
 * EL TONELAJE, ESCRITO. En toneladas con un decimal a partir de mil kilos, y
 * en kilos por debajo: «850 kg» es una sesión y «0,9 t» no se lee como nada.
 */
export const tonelaje = (kg) => {
  if (!kg) return '—';
  if (kg < 1000) return `${localeNumber(Math.round(kg))} kg`;
  return `${localeNumber(kg / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;
};

/**
 * LA CASILLA DE UNA FECHA dentro de un bloque, o `null` si no se puede decir.
 *
 * Semanal: la casilla ES el día de la semana, y no hace falta ancla —que es
 * justo lo que salva a los bloques cuyo primer microciclo no cayó en lunes—.
 * Rotativo: la cuenta mod N desde el ancla, con el doble módulo para las
 * fechas anteriores a ella.
 */
export const casillaDelDia = (microciclo, ancla, fecha) => {
  const casillas = casillasDe(microciclo);
  if (casillas.length === 0) return null;

  if (microciclo?.tipo !== 'rotativo') {
    const i = WEEK_DAYS.indexOf(claveDelDia(fecha));
    return i < 0 ? null : casillas[i] || null;
  }

  if (!ancla) return null;
  const desde = daysBetween(ancla, fecha);
  if (desde === null) return null;
  const n = casillas.length;
  return casillas[((desde % n) + n) % n] || null;
};

/** Los siete días de la semana que empieza en `lunes`. */
const sieteDias = (lunes) => {
  const dias = [];
  const base = Date.parse(`${lunes}T00:00:00Z`);
  if (Number.isNaN(base)) return dias;
  for (let i = 0; i < 7; i += 1) dias.push(new Date(base + i * 86400000).toISOString().slice(0, 10));
  return dias;
};

/**
 * CUÁNTOS ENTRENOS PIDE UNA SEMANA NATURAL. En un rotativo unas piden cinco y
 * otras cuatro, y eso es exactamente lo que hay que enseñar: la hilera de
 * puntos es la forma de esa semana, no una media del bloque.
 *
 * `null` cuando no se puede contar —sin microciclo, o un rotativo sin ancla—:
 * quien dibuja se queda sin hilera, que es mejor que una inventada.
 */
export const pedidosDeLaSemana = (microciclo, ancla, lunes) => {
  if (duracionDe(microciclo) === 0) return null;
  /*
    Una secuencia ENTERA a descanso no es «no pedía ninguno»: es que nadie la
    ha escrito todavía. Le pasa a los bloques que aún derivan su microciclo de
    un reparto semanal vacío, y contestar «0 de 0» ahí sería inventarse que ese
    bloque no pedía entrenar. Sin secuencia no hay hilera, y ya está.
  */
  if (entrenosDe(microciclo) === 0) return null;
  const dias = sieteDias(lunes);
  if (dias.length === 0) return null;

  let n = 0;
  for (const dia of dias) {
    const casilla = casillaDelDia(microciclo, ancla, dia);
    if (casilla === null) return null;
    if (!casilla.rest) n += 1;
  }
  return n;
};

/**
 * EL ANCLA DE UN BLOQUE: la fecha de su primer microciclo escrito.
 *
 * No se estima cuando falta. Un bloque sin ninguna fecha no se puede colocar
 * en el calendario, y colocarlo a ojo pondría los entrenos de una semana en
 * otra — que es el error que nadie detectaría.
 */
export const anclaDelBloque = (program, block) => {
  const micros = program?.microcycles || [];
  const semanas = weeksOfBlock(program, block);
  for (const w of semanas) {
    const fecha = micros.find((m) => m.weekNumber === w)?.date;
    if (fecha) return fecha;
  }
  return null;
};

/**
 * LO QUE LLEVA CADA SEMANA NATURAL EN LA LENTE DE ENTRENO.
 *
 * Las sesiones se reparten por SU PROPIA FECHA y no por el microciclo al que
 * pertenecen: una sesión anotada el domingo es de esa semana aunque su
 * microciclo empezara el miércoles anterior. Es lo que hace que la columna
 * diga la verdad sobre el lunes que tiene debajo.
 *
 * @param program  `workoutData[clientId]` ya resuelto (`resolvedMicrocycles`).
 * @param client   la ficha, para derivar la secuencia de los bloques que aún
 *                 no la tienen guardada.
 * @param semanas  las filas de `semanasDelPlan`: de ahí sale el bloque de cada
 *                 una, que ya está calculado y no se vuelve a deducir aquí.
 * @returns `Map<lunes, { tonelaje, hechas, pedidos, extra, sesiones }>`
 *   · `pedidos` es `null` cuando no se puede contar (sin hilera).
 *   · `sesiones` son las de esa semana, con su fecha, su hoja y su tonelaje.
 */
export const entrenoDeLasSemanas = ({ program, client = null, semanas = [] } = {}) => {
  const salida = new Map();
  if (semanas.length === 0) return salida;

  /* Las sesiones, agrupadas por el lunes de su fecha. Una pasada por todas y
     no una búsqueda por semana: `allSessions` recorre el programa entero. */
  const porLunes = new Map();
  for (const s of allSessions(program?.microcycles || [])) {
    const l = s.date ? weekStart(s.date) : null;
    if (!l) continue;
    if (!porLunes.has(l)) porLunes.set(l, []);
    porLunes.get(l).push(s);
  }

  /* El microciclo y el ancla de cada bloque, una vez: `microcicloDelBloque`
     deriva la secuencia cuando no está guardada, y hacerlo por semana sería
     derivarla ocho veces para pintar un bloque de ocho. */
  const bloques = new Map();
  const deSuBloque = (id) => {
    if (!id) return null;
    if (bloques.has(id)) return bloques.get(id);
    const block = blocksOf(program).find((b) => b.id === id) || null;
    const dato = block
      ? { block, microciclo: microcicloDelBloque(program, block, client), ancla: anclaDelBloque(program, block) }
      : null;
    bloques.set(id, dato);
    return dato;
  };

  for (const s of semanas) {
    const suyas = porLunes.get(s.lunes) || [];
    const b = deSuBloque(s.bloque?.id);
    const pedidos = b ? pedidosDeLaSemana(b.microciclo, b.ancla, s.lunes) : null;

    let tonelaje = 0;
    const sesiones = suyas.map((x) => {
      const kg = sessionTonnage(x);
      tonelaje += kg;
      return { id: x.id, date: x.date, dayName: x.dayName, tonelaje: kg, series: sessionSetCount(x) };
    });

    salida.set(s.lunes, {
      tonelaje,
      hechas: sesiones.length,
      pedidos,
      /* Lo que se entrenó de más. No es un error ni un mérito: es un dato que
         explica por qué la hilera no sale y la columna sí. */
      extra: pedidos === null ? 0 : Math.max(0, sesiones.length - pedidos),
      sesiones,
      /* Qué pedía cada día y qué se hizo en él, con la misma casilla que
         cuenta los pedidos: `pedida` es la hoja (o `null`), `descanso` es
         `null` cuando no se puede saber. */
      dias: sieteDias(s.lunes).map((fecha) => {
        const casilla = b ? casillaDelDia(b.microciclo, b.ancla, fecha) : null;
        return {
          fecha,
          pedida: casilla && !casilla.rest ? casilla.sesion : null,
          descanso: casilla ? Boolean(casilla.rest) : null,
          hechas: sesiones.filter((x) => x.date === fecha),
        };
      }),
    });
  }

  return salida;
};

/**
 * LOS GRUPOS DE LA LENTE: tramos seguidos de semanas del MISMO BLOQUE.
 *
 * La lente de Nutrición agrupa por fase porque lo que cuenta es la dirección
 * del peso; aquí la unidad es el bloque, porque un bloque es una decisión de
 * entrenamiento entera —sus hojas, su secuencia, sus semanas— y compararlo
 * contra el de al lado es lo que se viene a hacer.
 *
 * Las semanas sin bloque hacen su propio grupo, como en `semanasDelPlan`: un
 * hueco entre dos bloques es un hecho, no un vacío que tapar.
 */
export const gruposPorBloque = (semanas = []) => {
  const grupos = [];
  for (const s of semanas) {
    const bloqueId = s.bloque?.id || null;
    const ultimo = grupos[grupos.length - 1];
    /* Se compara el BLOQUE, no la clave: la clave de un tramo sin bloque lleva
       su lunes para no repetirse entre dos huecos distintos, y compararla
       haría un grupo por semana. */
    if (ultimo && ultimo.bloqueId === bloqueId) ultimo.semanas.push(s);
    else grupos.push({ clave: bloqueId ?? `sin-${s.lunes}`, bloqueId, bloque: s.bloque || null, semanas: [s] });
  }
  for (const g of grupos) {
    g.desde = g.semanas[0].lunes;
    g.hasta = g.semanas[g.semanas.length - 1].domingo;
  }
  return grupos;
};

/**
 * LAS BANDAS DE FASE DE UN GRUPO: tramos seguidos con la misma fase, en
 * índices de columna. Es el fondo fino que recuerda en qué parte de la
 * temporada estaba el bloque, sin volver a dibujar el peso.
 */
export const bandasDeFase = (semanas = []) => {
  const bandas = [];
  semanas.forEach((s, i) => {
    const id = s.fase?.id || null;
    const ultima = bandas[bandas.length - 1];
    if (ultima && ultima.id === id) ultima.hasta = i;
    else bandas.push({ id, fase: s.fase || null, desde: i, hasta: i });
  });
  return bandas;
};

/* ══════════════════════════════════════════════════════════════════════════
   LOS EJERCICIOS DE REFERENCIA DE UN BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   Los elige el entrenador. La lente propone tres —los que más series llevan
   en el plan del bloque— y ahí se queda: la propuesta NO se guarda hasta que
   alguien la cambia, igual que la secuencia del microciclo no se escribía
   hasta que se tocaba. Así, afinar la plantilla del bloque sigue moviendo la
   propuesta, y un bloque que nadie ha mirado no tiene nada escrito encima.

   Se guardan como `{ ejercicioId?, nombre }`, la misma forma —y el mismo
   saneador— que los de un bloque en borrador, porque son lo mismo: lo que el
   entrenador dijo que quería seguir. Cuando el borrador se empieza, sus
   referencias viajan al bloque sin traducir nada.

   ── Por qué el id Y el nombre, y no uno de los dos ────────────────────────
   Porque renombrar un ejercicio en la Librería no borra lo que se levantó con
   el nombre viejo, y las sesiones guardan el NOMBRE con el que se anotaron.
   Con solo el id, la línea empezaría el día del cambio de nombre; con solo el
   nombre, se partiría en dos. Así que se junta: el nombre guardado y todos los
   nombres con los que se ha anotado ese id. */

/** Las referencias escritas en un bloque, saneadas. Vacío si no tiene. */
export const referenciasDelBloque = (block) => referenciasSaneadas(block?.referencias);

/**
 * LA PROPUESTA: los ejercicios con más series del plan del bloque.
 *
 * Series del PLAN y no del registro: lo que el bloque venía a trabajar lo dice
 * lo que se programó, y con el registro un bloque a medias propondría lo que
 * más se ha entrenado hasta ahora, que cambiaría solo cada semana.
 *
 * Una hoja que cae dos veces en el microciclo cuenta doble: sus series se
 * hacen dos veces. Es `vecesDeCadaHoja`, la misma cuenta que usa la adherencia.
 */
export const proponerReferencias = (program, block, client = null, cuantas = 3) => {
  if (!block) return [];
  const veces = vecesDeCadaHoja(microcicloDelBloque(program, block, client));
  const porNombre = new Map();

  for (const hoja of blockPlan(program, block).sessions || []) {
    const repite = Math.max(1, veces.get(hoja.dayName) || 0);
    for (const ex of hoja.exercises || []) {
      const nombre = String(ex.name || '').trim();
      if (!nombre) continue;
      const previo = porNombre.get(nombre) || { nombre, ejercicioId: ex.id || null, series: 0 };
      previo.series += (ex.series || 0) * repite;
      porNombre.set(nombre, previo);
    }
  }

  return [...porNombre.values()]
    /* A igualdad de series, por nombre: dos llamadas seguidas tienen que
       proponer lo mismo o la lente parpadearía al repintar. */
    .sort((a, b) => b.series - a.series || a.nombre.localeCompare(b.nombre))
    .slice(0, cuantas)
    .map((e) => referenciasSaneadas([{ ...(e.ejercicioId ? { ejercicioId: e.ejercicioId } : {}), nombre: e.nombre }])[0])
    .filter(Boolean);
};

/** Las que se enseñan: las suyas si las tiene, y si no la propuesta. */
export const referenciasAEnsenar = (program, block, client = null) => {
  const suyas = referenciasDelBloque(block);
  return suyas.length > 0 ? { referencias: suyas, propuestas: false } : { referencias: proponerReferencias(program, block, client), propuestas: true };
};

/**
 * LOS NOMBRES CON LOS QUE BUSCAR UNA REFERENCIA: el guardado más todos los que
 * ese id ha llevado en las sesiones. Sin id, el nombre y ya.
 */
export const nombresDeLaReferencia = (program, referencia) => {
  const nombres = new Set();
  const suyo = String(referencia?.nombre || '').trim();
  if (suyo) nombres.add(suyo);

  const id = referencia?.ejercicioId;
  if (id) {
    for (const s of allSessions(program?.microcycles || [])) {
      for (const e of s.entries || []) {
        if (e?.exerciseId !== id) continue;
        const n = String(e.name || '').trim();
        if (n) nombres.add(n);
      }
    }
  }
  return [...nombres];
};

/**
 * ESCRIBE las referencias de un bloque. Devuelve el MISMO programa si no
 * cambia nada —quien guarda lo usa para no dejar un paso de deshacer vacío—, y
 * quita la clave cuando la lista se queda vacía en vez de guardar un `[]`.
 */
export const ponerReferencias = (program, blockId, lista) => {
  const limpias = referenciasSaneadas(lista);
  const bloques = Array.isArray(program?.blocks) ? program.blocks : [];
  const bloque = bloques.find((b) => b.id === blockId);
  if (!bloque) return program;
  if (JSON.stringify(referenciasDelBloque(bloque)) === JSON.stringify(limpias)) return program;

  return {
    ...program,
    blocks: bloques.map((b) => {
      if (b.id !== blockId) return b;
      const { referencias: _fuera, ...resto } = b;
      return limpias.length > 0 ? { ...resto, referencias: limpias } : resto;
    }),
  };
};

/**
 * LA LÍNEA DE UNA REFERENCIA EN UN BLOQUE: su serie más pesada por semana
 * natural, para dibujarla bajo las columnas del bloque.
 *
 * Se mide en KILOS y no en 1RM estimado: el 1RM es una fórmula con varios
 * kilos de margen y esto es una lente de lectura, no un veredicto. Lo que se
 * enseña son cosas que pasaron.
 */
export const lineaDeLaReferencia = ({ program, referencia, lunes = [] }) => {
  const nombres = new Set(nombresDeLaReferencia(program, referencia));
  const dentro = new Set(lunes);
  const porLunes = new Map();

  for (const s of allSessions(program?.microcycles || [])) {
    const l = s.date ? weekStart(s.date) : null;
    if (!l || !dentro.has(l)) continue;
    for (const e of s.entries || []) {
      if (!nombres.has(String(e?.name || '').trim())) continue;
      for (const set of e.sets || []) {
        const kg = Number(set?.kg);
        const reps = Number(set?.reps);
        if (!Number.isFinite(kg) || !Number.isFinite(reps) || kg <= 0 || reps <= 0) continue;
        const mejor = porLunes.get(l);
        if (!mejor || kg > mejor.kg || (kg === mejor.kg && reps > mejor.reps)) porLunes.set(l, { kg, reps });
      }
    }
  }

  return lunes.map((l) => ({ lunes: l, ...(porLunes.get(l) || { kg: null, reps: null }) }));
};
