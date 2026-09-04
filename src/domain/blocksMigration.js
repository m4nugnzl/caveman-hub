/**
 * SUBIR EL PLAN AL BLOQUE: la migración, como función pura.
 *
 * ══ Qué convierte ══════════════════════════════════════════════════════════
 *
 * Hasta ahora el plan —qué ejercicios lleva cada hoja, con cuántas series y qué
 * objetivo— vivía dentro de CADA microciclo, repetido tantas veces como
 * microciclos tuviera el bloque. Esto lo escribe UNA vez, en el bloque, y anota
 * como EXCEPCIÓN lo que un microciclo concreto tenía distinto:
 *
 *     block.sessions   ← el plan, leído del microciclo de referencia
 *     block.overrides  ← en qué se apartaba cada microciclo, con su tramo
 *
 * Las dos capas son del BLOQUE: un cambio lleva `fromWeek`/`toWeek` dentro y es
 * `overridesAt` quien dice cuáles rigen en una semana. El microciclo no guarda
 * nada de esto — que es justo lo que evita tener el plan escrito dos veces.
 *
 * ══ Qué NO toca ════════════════════════════════════════════════════════════
 *
 * `microcycle.days` se queda exactamente como está. No es descuido: mientras la
 * lectura nueva y la vieja conviven (`planOfDay` contesta por las dos), los
 * `days` son la red de seguridad —y el sitio del que `legacySession` saca los
 * registros antiguos que aún no se han normalizado—. Se retiran cuando la
 * lectura nueva esté probada contra la vieja, no antes.
 *
 * Tampoco toca lo ejecutado. Lo único que se reescribe de una sesión es a qué
 * ejercicio apunta cada entrada, y por la razón de abajo.
 *
 * ══ El detalle que rompería todo si se pasara por alto ═════════════════════
 *
 * Cada microciclo tenía SU copia del ejercicio, con su propio id, y los
 * registros apuntan a ese id (`session.entries[].exerciseId`). Al pasar el plan
 * al bloque, el ejercicio efectivo de la semana 3 pasa a ser el del bloque —que
 * es el de la semana de referencia— y su id ya no es el que la sesión de la
 * semana 3 anotó: los kilos dejarían de salir en la hoja, en silencio.
 *
 * Por eso la migración REAPUNTA las entradas de cada sesión al ejercicio
 * efectivo de su hoja, emparejando por nombre y en orden. Lo que no encuentre
 * pareja se queda como está: sigue siendo historia legible por su nombre, que
 * es lo que hoy pasa con un ejercicio que se quitó del plan.
 *
 * ══ El orden no se conserva ════════════════════════════════════════════════
 *
 * Un microciclo que solo hubiera cambiado el ORDEN de sus ejercicios pasa a
 * enseñar el del bloque. Es cosmético y se arregla arrastrando, así que no
 * merece una excepción por ejercicio que ensuciaría la lista de verdad.
 *
 * ══ Es idempotente ═════════════════════════════════════════════════════════
 *
 * Un bloque que ya tiene `sessions` no se vuelve a tocar.
 */

import { deepClone } from '@/lib/ids';
import { emptySet } from './training';
import { blockOfWeek, blockSessionOf, blocksOf, buildOverride, hasBlockPlan, overridesAt, weeksOfBlock } from './blocks';

/** Dos ejercicios son «el mismo» si se llaman igual. Es la regla de la casa. */
const clave = (name) => String(name || '').trim().toLowerCase();

/**
 * El ejercicio como PLAN: sus series con su objetivo, sin los kilos ni las
 * repeticiones que alguien anotó dentro.
 *
 * Los datos antiguos guardaban la ejecución dentro del plan, y el plan del
 * bloque lo comparten todos sus microciclos: arrastrar ahí los kilos de la
 * semana de referencia los enseñaría en las cinco. Lo ejecutado sigue donde
 * está —en `microcycle.days`, hasta que se normalice— y no se pierde.
 */
const soloPlan = (exercise) => ({
  ...deepClone(exercise),
  sets: (exercise?.sets || []).map((s) => ({
    ...emptySet(s?.targetReps ?? ''),
    targetRir: s?.targetRir ?? '',
  })),
});

/** ¿Estos dos piden lo mismo? Mismas series, y cada una con el mismo objetivo. */
const mismaPauta = (a, b) => {
  const sa = a?.sets || [];
  const sb = b?.sets || [];
  if (sa.length !== sb.length) return false;
  return sa.every(
    (s, i) =>
      String(s?.targetReps ?? '') === String(sb[i]?.targetReps ?? '') &&
      String(s?.targetRir ?? '') === String(sb[i]?.targetRir ?? '')
  );
};

/** Aplica excepciones a una lista de ejercicios. Local: el `applyOverrides` de
    `blocks` trabaja sobre hojas enteras y aquí solo hacen falta los ejercicios. */
const aplicar = (exercises, overrides) => {
  let out = [...exercises];
  for (const o of overrides) {
    if (o.targetId === null || o.targetId === undefined) {
      if (!o.exercise) continue;
      const at = Number.isInteger(o.index) ? Math.min(Math.max(o.index, 0), out.length) : out.length;
      out = [...out.slice(0, at), o.exercise, ...out.slice(at)];
      continue;
    }
    const i = out.findIndex((ex) => ex.id === o.targetId);
    if (i === -1) continue;
    out =
      o.exercise === null
        ? [...out.slice(0, i), ...out.slice(i + 1)]
        : [...out.slice(0, i), o.exercise, ...out.slice(i + 1)];
  }
  return out;
};

/** Un día del microciclo, convertido en hoja del bloque: solo su plan. */
const comoHoja = (day) => ({
  dayName: day.dayName,
  exercises: (day.exercises || []).map(soloPlan),
  ...(Array.isArray(day.mobilityDrills) ? { mobilityDrills: deepClone(day.mobilityDrills) } : {}),
  ...(day.coachNote ? { coachNote: day.coachNote } : {}),
});

/** ¿Tiene este microciclo algo escrito en alguna hoja? */
const conAlgo = (micro) => (micro?.days || []).some((d) => (d.exercises || []).length > 0);

/**
 * De qué microciclo se lee el plan del bloque: el ÚLTIMO con algo escrito.
 *
 * No el último a secas: continuar el programa crea el microciclo siguiente con
 * las hojas en blanco, y leer de él dejaría el bloque entero vacío. Es la misma
 * regla que ya usaba `blockPlan`.
 */
const referenciaDe = (microcycles, semanas) => {
  const suyos = semanas.map((w) => microcycles.find((m) => m.weekNumber === w)).filter(Boolean);
  return [...suyos].reverse().find(conAlgo) || suyos[suyos.length - 1] || null;
};

/**
 * Las excepciones de un microciclo respecto al plan de su hoja.
 *
 * Se emiten en el orden en que se aplican —bajas, cambios y altas— y cada
 * índice de alta se calcula contra la lista tal y como va quedando, para que
 * aplicarlas devuelva exactamente los ejercicios que tenía el microciclo.
 */
export const overridesDeLaHoja = (plan, day, { at = null, week = null } = {}) => {
  const delBloque = plan?.exercises || [];
  const deLaSemana = (day?.exercises || []).filter((ex) => String(ex?.name || '').trim() !== '');
  const overrides = [];
  let actual = [...delBloque];

  /* Emparejamiento por nombre y en orden: dos «Press banca» en la misma hoja se
     casan primero con primero, segundo con segundo. */
  const librePorClave = new Map();
  deLaSemana.forEach((ex, i) => {
    const k = clave(ex.name);
    if (!librePorClave.has(k)) librePorClave.set(k, []);
    librePorClave.get(k).push(i);
  });
  const parejaDe = new Map(); // índice del bloque → ejercicio de la semana
  const usados = new Set();
  delBloque.forEach((ex, i) => {
    const cola = librePorClave.get(clave(ex.name));
    if (!cola || cola.length === 0) return;
    const j = cola.shift();
    parejaDe.set(i, deLaSemana[j]);
    usados.add(j);
  });

  /* 1 · Las bajas: lo que el bloque tiene y el microciclo no. */
  delBloque.forEach((ex, i) => {
    if (parejaDe.has(i)) return;
    overrides.push(buildOverride({ dayName: plan.dayName, targetId: ex.id, exercise: null, sobre: ex.name, fromWeek: week, toWeek: week, at }));
    actual = actual.filter((x) => x.id !== ex.id);
  });

  /* 2 · Los cambios: mismo ejercicio, otra pauta. Se queda el objeto de la
     SEMANA, con su id, porque es al que apuntan sus registros. */
  delBloque.forEach((ex, i) => {
    const suyo = parejaDe.get(i);
    if (!suyo || mismaPauta(ex, suyo)) return;
    overrides.push(
      buildOverride({ dayName: plan.dayName, targetId: ex.id, exercise: soloPlan(suyo), sobre: ex.name, fromWeek: week, toWeek: week, at })
    );
    actual = actual.map((x) => (x.id === ex.id ? soloPlan(suyo) : x));
  });

  /* 3 · Las altas: lo que el microciclo tiene de más, en su sitio. */
  deLaSemana.forEach((ex, j) => {
    if (usados.has(j)) return;
    const index = Math.min(j, actual.length);
    overrides.push(buildOverride({ dayName: plan.dayName, targetId: null, exercise: soloPlan(ex), index, fromWeek: week, toWeek: week, at }));
    actual = [...actual.slice(0, index), ex, ...actual.slice(index)];
  });

  return overrides;
};

/**
 * Reapunta las entradas de una sesión al ejercicio efectivo de su hoja.
 *
 * Empareja por nombre y en orden, igual que el resto de la migración. Lo que no
 * encuentra pareja conserva su `exerciseId`: no se inventa un destino.
 */
export const remapSessionEntries = (session, exercises) => {
  const librePorClave = new Map();
  (exercises || []).forEach((ex) => {
    const k = clave(ex.name);
    if (!librePorClave.has(k)) librePorClave.set(k, []);
    librePorClave.get(k).push(ex.id);
  });

  let tocado = false;
  const entries = (session.entries || []).map((e) => {
    const cola = librePorClave.get(clave(e.name));
    if (!cola || cola.length === 0) return e;
    const id = cola.shift();
    if (id === e.exerciseId) return e;
    tocado = true;
    return { ...e, exerciseId: id };
  });

  return tocado ? { ...session, entries } : session;
};

/**
 * El programa con el plan dentro de sus bloques.
 *
 * @returns `{ program, report }` — `report` dice qué se hizo, para poder
 *   comprobarlo antes de guardar nada: `{ bloques, hojas, excepciones,
 *   sesionesReapuntadas, bloquesVacios }`.
 */
/**
 * LOS CAMBIOS QUE SE GUARDARON DENTRO DE UN MICROCICLO.
 *
 * Hubo una versión intermedia en la que las excepciones vivían en
 * `microcycle.overrides` y valían para esa semana y ninguna más. Aguantaban un
 * solo caso: «esta semana no». Pero un cambio a prueba dura lo que dura —«le
 * meto press inclinado tres microciclos y vemos»— y para que durara tres había
 * que escribirlo tres veces, que es el problema que este rediseño vino a quitar.
 *
 * Ahora viven en el bloque con su tramo. Esto sube los que queden con el tramo
 * que tenían: su microciclo y ninguno más, que es lo que significaban.
 */
export const liftMicrocycleOverrides = (program) => {
  const microcycles = program?.microcycles || [];
  if (!microcycles.some((m) => Array.isArray(m.overrides) && m.overrides.length > 0)) return program;

  const porBloque = new Map(); // blockId → override[]
  for (const m of microcycles) {
    for (const o of m.overrides || []) {
      const b = blockOfWeek(program, m.weekNumber);
      if (!porBloque.has(b.id)) porBloque.set(b.id, []);
      porBloque.get(b.id).push({ ...o, fromWeek: o.fromWeek ?? m.weekNumber, toWeek: o.toWeek ?? m.weekNumber });
    }
  }

  return {
    ...program,
    blocks: blocksOf(program).map((b) =>
      porBloque.has(b.id) ? { ...b, overrides: [...(b.overrides || []), ...porBloque.get(b.id)] } : b
    ),
    microcycles: microcycles.map((m) => {
      if (!Array.isArray(m.overrides)) return m;
      const { overrides: _viejos, ...limpio } = m;
      return limpio;
    }),
  };
};

export const migrateBlockPlans = (entrada) => {
  /* Primero los cambios que quedaran dentro de un microciclo. */
  const program = liftMicrocycleOverrides(entrada);
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];
  if (bloques.every(hasBlockPlan)) {
    return {
      program,
      report: { bloques: 0, hojas: 0, excepciones: 0, sesionesReapuntadas: 0, bloquesVacios: [] },
    };
  }

  const report = { bloques: 0, hojas: 0, excepciones: 0, sesionesReapuntadas: 0, bloquesVacios: [] };
  /* Los cambios son del BLOQUE y llevan su tramo; los de la migración valen
     solo en su microciclo, que es de donde salen. */
  let todosLosCambios = [];
  const planPorSemana = new Map(); // weekNumber → { dayName: exercises[] }

  const nuevos = bloques.map((bloque) => {
    if (hasBlockPlan(bloque)) return bloque;

    const semanas = weeksOfBlock(program, bloque);
    const referencia = referenciaDe(microcycles, semanas);
    /* Un bloque sin microciclos no tiene de dónde leer, y uno sin nada escrito
       conserva al menos SUS HOJAS: los nombres son estructura aunque estén en
       blanco, y perderlos dejaría el bloque sin sitio donde programar. */
    const sessions = (referencia?.days || []).map(comoHoja);

    /*
      ── Y las hojas que la referencia no tiene ──────────────────────────────
      Un bloque puede llevar una hoja que el último microciclo escrito no
      montó —se programó el Legs en el primero y en el último todavía no—. Si
      el plan saliera SOLO de la referencia, esa hoja desaparecería del bloque
      y con ella su plan entero. Así que se recogen las demás y cada una se lee
      del último microciclo que la tenga escrita, que es la misma regla que la
      referencia aplicada hoja a hoja.
    */
    const puestas = new Set(sessions.map((s) => s.dayName));
    for (const w of [...semanas].reverse()) {
      const micro = microcycles.find((m) => m.weekNumber === w);
      for (const day of micro?.days || []) {
        if (puestas.has(day.dayName) || (day.exercises || []).length === 0) continue;
        puestas.add(day.dayName);
        sessions.push(comoHoja(day));
      }
    }

    report.bloques += 1;
    report.hojas += sessions.length;
    if (sessions.every((s) => s.exercises.length === 0)) report.bloquesVacios.push(bloque.name);

    const conPlan = { ...bloque, sessions };
    todosLosCambios = [];

    for (const w of semanas) {
      const micro = microcycles.find((m) => m.weekNumber === w);
      if (!micro || w === referencia?.weekNumber) {
        /* La referencia no se aparta de sí misma, pero sí hay que saber qué
           ejercicios quedan efectivos en ella para reapuntar sus registros. */
        if (micro) {
          planPorSemana.set(w, Object.fromEntries(sessions.map((s) => [s.dayName, s.exercises])));
        }
        continue;
      }

      const suyos = [];
      const efectivo = {};
      for (const hoja of sessions) {
        const day = (micro.days || []).find((d) => d.dayName === hoja.dayName);
        /* Sin la hoja, o con la hoja en blanco, no hay nada de lo que apartarse:
           es un hueco que el plan del bloque viene justamente a llenar. Era ya
           la lectura de `fillableWeeksOfDay`. */
        if (!day || (day.exercises || []).length === 0) {
          efectivo[hoja.dayName] = hoja.exercises;
          continue;
        }
        const os = overridesDeLaHoja(hoja, day, { week: w });
        suyos.push(...os);
        efectivo[hoja.dayName] = aplicar(hoja.exercises, os);
      }

      if (suyos.length > 0) todosLosCambios.push(...suyos);
      planPorSemana.set(w, efectivo);
      report.excepciones += suyos.length;
    }

    return todosLosCambios.length > 0 ? { ...conPlan, overrides: todosLosCambios } : conPlan;
  });

  /* De los microciclos solo se reapuntan los registros: el plan y sus cambios
     viven ya en el bloque. */
  const nuevosMicrociclos = microcycles.map((m) => {
    const efectivo = planPorSemana.get(m.weekNumber);
    let out = m;

    if (efectivo && (m.sessions || []).length > 0) {
      const sessions = (m.sessions || []).map((s) => {
        const ejercicios = efectivo[s.dayName];
        if (!ejercicios) return s;
        const remapeada = remapSessionEntries(s, ejercicios);
        if (remapeada !== s) report.sesionesReapuntadas += 1;
        return remapeada;
      });
      out = { ...out, sessions };
    }

    return out;
  });

  return { program: { ...program, blocks: nuevos, microcycles: nuevosMicrociclos }, report };
};

/**
 * LA COMPROBACIÓN: ¿la lectura nueva dice lo mismo que la vieja?
 *
 * Recorre todos los microciclos y compara, hoja por hoja, los ejercicios que
 * daba el camino de siempre (`microcycle.days`) con los que da el plan del
 * bloque con sus excepciones. Es lo que permite migrar sin fe: se pasa sobre
 * los programas reales y, si devuelve `[]`, la lectura nueva es la misma.
 *
 * Se comparan NOMBRE, número de series y objetivo de cada una — que es el plan.
 * Ni los ids ni el orden: los primeros cambian a propósito y el segundo es
 * cosmético (ver la nota de arriba).
 *
 * Una hoja que el microciclo no tenía, o que tenía en blanco, no se compara:
 * ahí el plan del bloque añade donde antes no había nada, y eso es el objetivo
 * de la migración, no una diferencia.
 */
export const compareBlockPlans = (antes, despues) => {
  const fallos = [];
  const firma = (exercises) =>
    (exercises || [])
      .map((ex) => `${clave(ex.name)}·${(ex.sets || []).map((s) => String(s?.targetReps ?? '')).join(',')}`)
      .sort()
      .join('|');

  for (const micro of antes?.microcycles || []) {
    const bloque = (blocksOf(despues) || []).find(
      (b) => micro.weekNumber >= b.fromWeek && (b.toWeek === null || b.toWeek === undefined || micro.weekNumber <= b.toWeek)
    );
    if (!bloque || !hasBlockPlan(bloque)) continue;

    for (const day of micro.days || []) {
      if ((day.exercises || []).length === 0) continue;
      const hoja = blockSessionOf(bloque, day.dayName);
      if (!hoja) {
        fallos.push({ week: micro.weekNumber, dayName: day.dayName, motivo: 'la hoja no está en el bloque' });
        continue;
      }
      const ahora = aplicar(hoja.exercises, overridesAt(bloque, micro.weekNumber, day.dayName));
      if (firma(ahora) !== firma(day.exercises)) {
        fallos.push({
          week: micro.weekNumber,
          dayName: day.dayName,
          motivo: 'el plan no coincide',
          antes: firma(day.exercises),
          despues: firma(ahora),
        });
      }
    }
  }

  return fallos;
};
