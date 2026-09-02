/**
 * Los bloques de entreno: la estructura que no cambia, y sus semanas.
 *
 * ══ La idea ════════════════════════════════════════════════════════════════
 * Mientras los días son los mismos —Push, Pull, Legs; qué toca cada día del
 * calendario; el calentamiento— es el mismo bloque, y las semanas se van
 * sumando. Cuando la estructura cambia, se CIERRA el bloque y se abre otro.
 * Lo anterior queda entero: se lee, se compara, no se pierde.
 *
 * ══ Cómo se representa ═════════════════════════════════════════════════════
 * Como rangos de semanas dentro de `program.blocks`:
 *
 *     { id, name, fromWeek, toWeek, weeklySplit?, mobilityDrills? }
 *
 * El último es el ABIERTO (`toWeek === null`) y su estructura y calentamiento
 * son `program.weeklySplit` y `program.mobilityDrills`, como siempre. Los
 * cerrados llevan una copia congelada de los suyos, tomada al cerrarlos.
 *
 * Un programa sin `blocks` ES el bloque 1 desde la semana 1: no hay migración
 * de datos y nada de lo que ya existe cambia de forma. Ver la migración 0086.
 */
import { newId } from '@/lib/ids';
import { dayPlannedVolume } from './training';
import { executedSessions, sessionTonnage } from './sessions';

/** La última semana montada del programa (0 sin ninguna). */
export const lastWeekNumber = (microcycles = []) =>
  microcycles.length ? Math.max(...microcycles.map((m) => m.weekNumber)) : 0;
const ultimaSemana = lastWeekNumber;

const PRIMERO = { id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null };

/** Los bloques del programa, siempre con uno abierto al final. */
export const blocksOf = (program) => {
  const guardados = Array.isArray(program?.blocks) ? program.blocks : [];
  if (guardados.length === 0) return [PRIMERO];
  const ultimo = guardados[guardados.length - 1];
  if (ultimo.toWeek === null || ultimo.toWeek === undefined) return guardados;
  /* Todos cerrados (no debería pasar): se abre uno detrás para que siempre haya
     dónde seguir sumando semanas. */
  /* Id DETERMINISTA: dos llamadas seguidas tienen que devolver el mismo bloque. */
  return [...guardados, { id: `b_auto_${ultimo.toWeek + 1}`, name: `Bloque ${guardados.length + 1}`, fromWeek: ultimo.toWeek + 1, toWeek: null }];
};

export const currentBlock = (program) => {
  const lista = blocksOf(program);
  return lista[lista.length - 1];
};

export const isCurrentBlock = (program, block) => currentBlock(program)?.id === block?.id;

/** El bloque al que pertenece una semana. */
export const blockOfWeek = (program, weekNumber) => {
  const lista = blocksOf(program);
  return (
    lista.find((b) => weekNumber >= b.fromWeek && (b.toWeek === null || b.toWeek === undefined || weekNumber <= b.toWeek)) ||
    lista[lista.length - 1]
  );
};

/** Las semanas montadas de un bloque, en orden. */
export const weeksOfBlock = (program, block) =>
  (program?.microcycles || [])
    .map((m) => m.weekNumber)
    .filter((w) => w >= block.fromWeek && (block.toWeek === null || block.toWeek === undefined || w <= block.toWeek))
    .sort((a, b) => a - b);

/**
 * La estructura y el calentamiento de un bloque: del abierto, los del programa;
 * de uno cerrado, su copia congelada.
 */
export const structureOfBlock = (program, block) =>
  isCurrentBlock(program, block)
    ? { weeklySplit: program?.weeklySplit || {}, mobilityDrills: program?.mobilityDrills || [] }
    : { weeklySplit: block?.weeklySplit || {}, mobilityDrills: block?.mobilityDrills || [] };

/**
 * Cierra el bloque abierto en la última semana montada y abre el siguiente.
 * Devuelve el programa nuevo (sin tocar el que recibe) y el bloque abierto.
 *
 * No añade semana: eso lo hace quien llama, que sabe si copia la estructura o
 * empieza de cero. Sin semanas montadas no hay nada que cerrar.
 */
export const openNextBlock = (program, { name = null } = {}) => {
  const lista = blocksOf(program);
  const abierto = lista[lista.length - 1];
  const fin = ultimaSemana(program?.microcycles);
  if (fin < abierto.fromWeek) return { program, block: abierto };

  const cerrado = {
    ...abierto,
    toWeek: fin,
    weeklySplit: program?.weeklySplit || {},
    mobilityDrills: program?.mobilityDrills || [],
  };
  const nuevo = {
    id: newId('b'),
    name: name || `Bloque ${lista.length + 1}`,
    fromWeek: fin + 1,
    toWeek: null,
  };
  return {
    program: { ...program, blocks: [...lista.slice(0, -1), cerrado, nuevo] },
    block: nuevo,
  };
};

export const renameBlockIn = (program, blockId, name) => ({
  ...program,
  blocks: blocksOf(program).map((b) => (b.id === blockId ? { ...b, name: name.trim() || b.name } : b)),
});

/**
 * Los rangos, cuando las semanas se renumeran.
 *
 * Borrar una semana renumera las que vienen detrás (`removeMicrocycle`), y
 * deshacerlo las vuelve a correr. Como un bloque es un RANGO de números, hay
 * que correr los rangos con ellas o los bloques dejan de describir las semanas
 * que contienen. Un bloque cerrado que se queda sin semanas desaparece; el
 * abierto se queda aunque esté vacío, para que siempre haya dónde sumar.
 */
export const blocksAfterRemovingWeek = (blocks = [], removed) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
  return blocks
    .map((b) => {
      const abierto = b.toWeek === null || b.toWeek === undefined;
      if (!abierto && b.toWeek < removed) return b;
      if (b.fromWeek > removed) return { ...b, fromWeek: b.fromWeek - 1, toWeek: abierto ? null : b.toWeek - 1 };
      return abierto ? b : { ...b, toWeek: b.toWeek - 1 };
    })
    .filter((b) => b.toWeek === null || b.toWeek === undefined || b.toWeek >= b.fromWeek);
};

/** La inversa: una semana vuelve a entrar con el número `inserted`. */
export const blocksAfterInsertingWeek = (blocks = [], inserted) => {
  if (!Array.isArray(blocks) || blocks.length === 0) return blocks;
  return blocks.map((b) => {
    const abierto = b.toWeek === null || b.toWeek === undefined;
    if (!abierto && b.toWeek < inserted) return b;
    if (b.fromWeek > inserted) return { ...b, fromWeek: b.fromWeek + 1, toWeek: abierto ? null : b.toWeek + 1 };
    return abierto ? b : { ...b, toWeek: b.toWeek + 1 };
  });
};

/**
 * El programa entero tras borrar una semana: los rangos se corren y, si el
 * bloque ABIERTO se queda sin semanas y hay otro detrás, desaparece y se
 * reabre el anterior con su estructura y su calentamiento congelados. Es lo
 * que se espera al borrar la única semana del bloque recién abierto: que no
 * quede un bloque fantasma sin nada dentro.
 */
export const programAfterRemovingWeek = (program, removed) => {
  const blocks = blocksAfterRemovingWeek(program?.blocks || [], removed);
  const restantes = (program?.microcycles || []).filter((m) => m.weekNumber !== removed).length;
  const abierto = blocks[blocks.length - 1];
  if (!abierto || blocks.length < 2 || abierto.fromWeek <= restantes) return { ...program, blocks };
  const { weeklySplit, mobilityDrills, ...anterior } = blocks[blocks.length - 2];
  return {
    ...program,
    weeklySplit: weeklySplit || program?.weeklySplit || {},
    mobilityDrills: mobilityDrills || program?.mobilityDrills || [],
    blocks: [...blocks.slice(0, -2), { ...anterior, toWeek: null }],
  };
};

/** Dónde empieza cada bloque que no es el primero: los cambios de rutina. */
export const blockChanges = (program) =>
  blocksOf(program)
    .filter((b) => b.fromWeek > 1)
    .map((b) => ({ week: b.fromWeek, name: b.name, id: b.id }));

/**
 * Las semanas se cuentan DENTRO de su bloque: al abrir el bloque 2 se
 * empieza otra vez por la 1. El número de siempre (`weekNumber`) sigue siendo
 * el del programa entero —es el que usan la URL, el portal y las revisiones—;
 * esto es solo cómo se dice.
 */
export const weekInBlock = (program, weekNumber) => {
  const b = blockOfWeek(program, weekNumber);
  return { n: weekNumber - b.fromWeek + 1, block: b, index: blocksOf(program).findIndex((x) => x.id === b.id) };
};

/** «S3», o «B2·S1» cuando hay más de un bloque y hace falta decir cuál. */
export const weekLabel = (program, weekNumber, letra = 'S') => {
  const { n, index } = weekInBlock(program, weekNumber);
  return blocksOf(program).length > 1 ? `B${index + 1}·${letra}${n}` : `${letra}${n}`;
};

/**
 * EL VOLUMEN DE UN BLOQUE: lo que le has PUESTO, y su media por semana.
 *
 * ══ Por qué el bloque es la unidad y no la semana ══════════════════════════
 *
 * Porque un bloque es la estructura que no cambia —los mismos días, los mismos
 * ejercicios— y por tanto es el único tramo en el que «cuántas series de espalda
 * le estoy dando» tiene una respuesta estable. Semana a semana la cifra sube y
 * baja por los ajustes finos de cada sesión, y mirar una sola semana para decidir
 * si a alguien le sobra pecho es mirar el ruido.
 *
 * ── Pautado, no hecho ───────────────────────────────────────────────────────
 * Sale de `dayPlannedVolume`, o sea de las series que hay ESCRITAS en el
 * programa, y no de las que tienen repeticiones registradas. Son dos preguntas
 * distintas y aquí se contesta la del entrenador: qué le he mandado hacer. Lo
 * que de verdad hizo es la adherencia, y va por su cuenta.
 *
 * ── Y la media, porque el total no se puede comparar ────────────────────────
 * Un bloque de seis semanas tiene el doble de series que uno de tres sin que eso
 * signifique nada. Lo que se compara con el MRV —y entre bloques— es la media
 * por semana, así que se devuelven las dos y la pantalla no tiene que dividir.
 *
 * @returns `{ semanas, total, media, porMusculo: { musculo: {total, media} } }`
 */
export const blockPlannedVolume = (program, block) => {
  const semanas = weeksOfBlock(program, block);
  const microcycles = program?.microcycles || [];

  const porMusculo = {};
  let total = 0;

  for (const week of semanas) {
    const micro = microcycles.find((m) => m.weekNumber === week);
    for (const day of micro?.days || []) {
      for (const [musculo, series] of Object.entries(dayPlannedVolume(day))) {
        porMusculo[musculo] = (porMusculo[musculo] || 0) + series;
        total += series;
      }
    }
  }

  /* Sin semanas montadas no hay media que dar: dividir entre cero para enseñar
     un «0 series/semana» diría que le has puesto nada, y lo que pasa es que el
     bloque todavía no tiene ninguna semana. */
  const n = semanas.length;
  const media = (v) => (n === 0 ? null : Math.round((v / n) * 10) / 10);

  return {
    semanas: n,
    total,
    media: media(total),
    porMusculo: Object.fromEntries(
      Object.entries(porMusculo).map(([musculo, v]) => [musculo, { total: v, media: media(v) }])
    ),
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   LA PLANTILLA DEL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   Un bloque es una estructura repetida, pero hasta ahora solo se podía mirar
   una CELDA de ella: una semana por un día. Para verlo entero —sus sesiones,
   y en cada una sus ejercicios con series y reps— hace falta una lectura del
   bloque como plan, y es lo que hay aquí.

   ── Derivada, no guardada ─────────────────────────────────────────────────
   La plantilla NO es un campo nuevo del programa: se lee de la última semana
   montada del bloque. Guardarla como fuente de verdad (`block.template`)
   obligaría a instanciar semanas desde ella y a migrar todo lo que hoy
   trabaja por semana, a cambio de nada que no se pueda derivar. Lo que se
   escribe sobre la plantilla se reparte a las semanas del bloque; ver
   `untrainedWeeksOfDay`.

   ── Y dice dónde NO se cumple ─────────────────────────────────────────────
   Dentro de un bloque las semanas pueden haberse tocado a mano. Enseñar la
   plantilla como si todas fueran iguales sería mentir, así que cada sesión
   lleva las semanas que se salen (`difieren`) y la pantalla las nombra.
*/

/** «8-10» si todas las series piden lo mismo; `null` si son mixtas. */
const repsObjetivo = (exercise) => {
  const valores = (exercise?.sets || []).map((s) => String(s?.targetReps ?? '').trim());
  if (valores.length === 0) return '';
  return valores.every((v) => v === valores[0]) ? valores[0] : null;
};

/** Qué ejercicios y cuántas series tiene un día: dos días con la misma firma
    son el mismo día programado. Los kilos anotados no cuentan — son de la
    persona, no del plan. */
const firmaDelDia = (day) =>
  (day?.exercises || [])
    .map((ex) => `${String(ex.name || '').trim().toLowerCase()}·${(ex.sets || []).length}`)
    .join('|');

/**
 * El bloque como plan: sus sesiones, y en cada una sus ejercicios.
 *
 * @returns `{ reference, weeks, sessions: [{ dayName, series, volumen,
 *   exercises: [{ id, name, muscle, series, targetReps }], difieren }] }`
 *   — `reference` es la semana de la que se lee (la última del bloque), y
 *   `difieren` las semanas del bloque cuya versión de esa sesión no coincide
 *   con la plantilla. Sin semanas montadas, `sessions` viene vacío.
 */
export const blockPlan = (program, block) => {
  const weeks = weeksOfBlock(program, block);
  const microcycles = program?.microcycles || [];
  const conAlgo = (w) => (microcycles.find((m) => m.weekNumber === w)?.days || []).some((d) => (d.exercises || []).length > 0);

  /* La referencia es la última semana ESCRITA, no la última a secas: continuar
     el programa crea la semana siguiente con los días vacíos
     (ver `appendMicrocycle`), y leer la plantilla de ella la dejaría en blanco
     justo después del gesto que más se repite. Las vacías son destino de la
     plantilla, no su origen. */
  const reference = [...weeks].reverse().find(conAlgo) ?? (weeks.length ? weeks[weeks.length - 1] : null);
  const micro = microcycles.find((m) => m.weekNumber === reference);

  const sessions = (micro?.days || []).map((day) => {
    const firma = firmaDelDia(day);
    const otras = weeks.filter((w) => w !== reference);
    const suyoEn = (w) => ((microcycles.find((m) => m.weekNumber === w)?.days) || []).find((d) => d.dayName === day.dayName);

    return {
      dayName: day.dayName,
      series: (day.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0),
      volumen: dayPlannedVolume(day),
      exercises: (day.exercises || []).map((ex) => ({
        id: ex.id,
        name: ex.name,
        muscle: ex.muscle,
        series: (ex.sets || []).length,
        targetReps: repsObjetivo(ex),
      })),
      /* Sin nada escrito es que está por rellenar; con algo distinto, que se
         tocó a mano. Son dos cosas y llevan a dos acciones distintas: la
         primera se rellena con la plantilla, la segunda solo se avisa. */
      vacias: otras.filter((w) => (suyoEn(w)?.exercises || []).length === 0),
      difieren: otras.filter((w) => {
        const suyo = suyoEn(w);
        return Boolean(suyo) && (suyo.exercises || []).length > 0 && firmaDelDia(suyo) !== firma;
      }),
    };
  });

  return { reference, weeks, sessions };
};

/**
 * EL BLOQUE EN CIFRAS: lo justo para una fila de su historia.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 * Viajar entre bloques era un desplegable con nombres, y un nombre no dice si
 * aquel bloque fue el bueno. Para elegir hace falta lo que lo distingue: cuánto
 * duró, cuándo fue, cuánto se levantó y cuánto se cumplió. Con eso, la lista de
 * bloques deja de ser un selector y pasa a ser la historia del entrenamiento de
 * esa persona — que es lo que un entrenador consulta al plantear el siguiente.
 *
 * ── Pautado y hecho, los dos ────────────────────────────────────────────────
 * `series` es lo que le PUSISTE por semana (`blockPlannedVolume`, que promedia
 * porque el total de un bloque de seis semanas no se compara con el de tres);
 * `kg`, `hechas` y `planificadas` son lo que PASÓ. Son dos preguntas y las dos
 * hacen falta para juzgar un bloque: uno con mucho volumen y media adherencia
 * no es un bloque de mucho volumen.
 */
export const blockSummary = (program, block) => {
  const semanas = weeksOfBlock(program, block);
  const microcycles = program?.microcycles || [];
  const suyos = semanas.map((w) => microcycles.find((m) => m.weekNumber === w)).filter(Boolean);

  let kg = 0;
  let hechas = 0;
  let planificadas = 0;
  for (const micro of suyos) {
    const sesiones = executedSessions(micro);
    hechas += sesiones.length;
    planificadas += (micro.days || []).length;
    for (const s of sesiones) kg += sessionTonnage(s);
  }

  const fechas = suyos.map((m) => m.date).filter(Boolean);
  return {
    semanas: semanas.length,
    desde: fechas[0] || null,
    hasta: fechas[fechas.length - 1] || null,
    kg,
    hechas,
    planificadas,
    /* Sin nada planificado no hay adherencia que dar: un 0 % diría que se lo
       saltó todo, y lo que pasa es que no había nada que saltarse. */
    adherencia: planificadas > 0 ? Math.round((hechas / planificadas) * 100) : null,
    series: blockPlannedVolume(program, block).media,
    abierto: block?.toWeek === null || block?.toWeek === undefined,
  };
};

/**
 * Dónde puede escribir la plantilla sin pisar lo que ya pasó.
 *
 * Las semanas del bloque en las que ESA sesión todavía no se ha entrenado.
 * Añadir un ejercicio a una semana que el cliente ya cerró no es programar:
 * es cambiarle el pasado, y además la deja contada como incompleta (una serie
 * más planificada que nunca hizo). Es la misma regla con la que ya se quitaba
 * un día del bloque entero.
 */
export const untrainedWeeksOfDay = (program, block, dayName) => {
  const microcycles = program?.microcycles || [];
  return weeksOfBlock(program, block).filter((w) => {
    const micro = microcycles.find((m) => m.weekNumber === w);
    if (!(micro?.days || []).some((d) => d.dayName === dayName)) return false;
    return !executedSessions(micro).some((ss) => ss.dayName === dayName);
  });
};

/**
 * Y dónde se puede PONER la plantilla: las semanas del bloque en las que esa
 * sesión está en blanco —sin ejercicios, o sin el día siquiera— y todavía no
 * se ha entrenado.
 *
 * No vale `untrainedWeeksOfDay` para esto: aquel exige que el día EXISTA,
 * porque escribir en un día que no está no hace nada. Aquí es al revés — un
 * día que falta es justo el hueco más grande que hay que poder rellenar, y
 * quien llame creará el día antes de escribir en él.
 */
export const fillableWeeksOfDay = (program, block, dayName) => {
  const microcycles = program?.microcycles || [];
  return weeksOfBlock(program, block).filter((w) => {
    const micro = microcycles.find((m) => m.weekNumber === w);
    const dia = (micro?.days || []).find((d) => d.dayName === dayName);
    if ((dia?.exercises || []).length > 0) return false;
    return !executedSessions(micro).some((ss) => ss.dayName === dayName);
  });
};

/**
 * Y dónde entra una sesión NUEVA: de la semana en curso en adelante.
 *
 * No sirve la regla de arriba —un día que no existe en ningún sitio no está
 * entrenado en ninguno, así que caería también en las semanas ya cerradas y
 * las dejaría con una sesión en blanco que nadie se saltó—. Sin semana en
 * curso (el bloque aún no ha empezado) entra en todas.
 */
export const weeksAheadOfBlock = (program, block, currentWeek = null) => {
  const weeks = weeksOfBlock(program, block);
  if (currentWeek === null || currentWeek === undefined) return weeks;
  const desde = weeks.filter((w) => w >= currentWeek);
  return desde.length > 0 ? desde : weeks.slice(-1);
};

/**
 * El HORIZONTE del ciclo: cuánto le queda al bloque por el que va la persona y
 * qué viene detrás. Es el dato que alimenta la frase de la línea de bloques
 * («A Intensificación le quedan 2 semanas · después, nada programado») — el
 * entrenador tenía que deducirlo contando pastillas y leyendo fechas.
 *
 * Devuelve `null` sin semana en curso o si el programa no tiene esa semana
 * escrita: sin «estás aquí» no hay horizonte que contar.
 */
export const horizonteDeBloque = (program, semanaEnCurso) => {
  if (semanaEnCurso === null || semanaEnCurso === undefined) return null;
  const bloque = blockOfWeek(program, semanaEnCurso);
  const semanas = weeksOfBlock(program, bloque);
  if (semanas.length === 0 || semanaEnCurso < semanas[0] || semanaEnCurso > semanas[semanas.length - 1]) {
    return null;
  }
  const lista = blocksOf(program);
  const i = lista.findIndex((b) => b.id === bloque.id);
  /* El bloque sintético que `blocksOf` abre al final no es un plan: detrás de
     él no hay nada programado. */
  const siguiente = lista[i + 1] && !String(lista[i + 1].id).startsWith('b_auto_') ? lista[i + 1] : null;
  return {
    bloque,
    restantes: semanas[semanas.length - 1] - semanaEnCurso,
    siguiente,
    abierto: bloque.toWeek === null || bloque.toWeek === undefined,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   LA BITÁCORA DEL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   ══ La pregunta ═══════════════════════════════════════════════════════════
   «Si toco el volumen de UNA semana del bloque, ¿qué pasa?»

   La respuesta del producto es: sigue siendo el mismo bloque. Un bloque es una
   estructura y una estructura aguanta retoques —subir una serie de espalda en
   la semana 3 porque llegó fresco— sin dejar de ser la misma. Abrir un bloque
   nuevo es una decisión, no una consecuencia; se hace a mano y se confirma
   (`NuevoBloqueDialog`).

   Pero un retoque que no deja rastro es un agujero: tres semanas después nadie
   sabe si el pico de la S3 fue una decisión o un despiste, y la comparación
   entre semanas —que es para lo que sirve un bloque— deja de significar nada.

   Así que el bloque no se parte: se APUNTA.

   ══ Dónde vive ════════════════════════════════════════════════════════════
   En el propio bloque, `block.log`. `workout_data.blocks` ya es una columna
   `jsonb` (migración 0086) y los bloques ya llevan claves de más —los cerrados
   guardan su `weeklySplit` y su `mobilityDrills`—, así que esto no necesita
   migración ninguna. Y vivir dentro del bloque es lo correcto: si el bloque se
   renombra, se borra o se restaura, su historia va con él sin código extra.

   ══ Qué se apunta ═════════════════════════════════════════════════════════
   Solo lo que cambia el VOLUMEN o la forma del plan: un ejercicio que entra o
   sale, series que suben o bajan, una hoja que aparece o desaparece. No los
   kilos que levanta la persona —eso es la sesión, y ya se guarda— ni cada
   tecleo en un rango de reps, que llenaría la bitácora de ruido.

   Y cada entrada dice su ALCANCE, que es la mitad de la información:

     · `bloque` — se escribió desde el plan y fue a todas sus semanas por
       entrenar. El bloque sigue siendo uniforme.
     · `semana` — se escribió en una hoja concreta. Esa semana se sale de la
       plantilla, a propósito, y aquí queda dicho cuál y cuándo.
*/

/* Un tope, porque esto va en la misma fila que el programa: sin él, un año de
   retoques engorda cada lectura del cliente. Se quedan los últimos, que son los
   que se consultan. */
const MAX_BITACORA = 200;

export const BLOCK_CHANGE = {
  EJERCICIO_MAS: 'ejercicio-mas',
  EJERCICIO_MENOS: 'ejercicio-menos',
  SERIES: 'series',
  HOJA_MAS: 'hoja-mas',
  HOJA_MENOS: 'hoja-menos',
  PLANTILLA: 'plantilla',
};

/**
 * Apunta un cambio en la bitácora de un bloque y devuelve el programa nuevo.
 *
 * @param entry `{ id, at, kind, hoja, alcance: 'bloque'|'semana', semanas, que }`
 *   — `at` e `id` los pone quien llama, que es quien tiene reloj y generador.
 */
export const logBlockChange = (program, blockId, entry) => ({
  ...program,
  blocks: blocksOf(program).map((b) =>
    b.id !== blockId ? b : { ...b, log: [...(b.log || []), entry].slice(-MAX_BITACORA) }
  ),
});

/** La bitácora de un bloque, de lo más reciente a lo más viejo. */
export const blockChangeLog = (block) => [...(block?.log || [])].reverse();

/** Los cambios que afectan solo a una semana: los que la sacan de la plantilla. */
export const weekChangesOfBlock = (block, week) =>
  blockChangeLog(block).filter((e) => e.alcance === 'semana' && (e.semanas || []).includes(week));

/** «+ Face pull», «Sentadilla 3 → 4 series»… en una línea. */
export const describeBlockChange = (entry) => {
  const que = entry?.que || '';
  switch (entry?.kind) {
    case BLOCK_CHANGE.EJERCICIO_MAS:
      return `+ ${que}`;
    case BLOCK_CHANGE.EJERCICIO_MENOS:
      return `− ${que}`;
    case BLOCK_CHANGE.SERIES:
      return `${que}: ${entry.de} → ${entry.a} series`;
    case BLOCK_CHANGE.HOJA_MAS:
      return `hoja «${que}» añadida`;
    case BLOCK_CHANGE.HOJA_MENOS:
      return `hoja «${que}» quitada`;
    case BLOCK_CHANGE.PLANTILLA:
      /* Las semanas ya salen en la columna del alcance: repetirlas aquí sería
         decir dos veces lo mismo en la misma fila. */
      return 'plantilla puesta';
    default:
      return que;
  }
};
