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
 * QUITAR UN BLOQUE: se deshace la SEPARACIÓN, no el entrenamiento.
 *
 * ══ Por qué no borra semanas ═══════════════════════════════════════════════
 * Un bloque no es un contenedor de datos: es un CORTE en la línea de semanas
 * —«de aquí en adelante entrena otra cosa»—. Casi siempre se quita porque el
 * corte cayó donde no tocaba: un «+ bloque» de más, un cambio de rutina que al
 * final no fue tal. Llevarse por delante ocho semanas de entrenamientos
 * registrados sería contestar a otra pregunta. Así que sus semanas pasan
 * enteras al bloque de al lado —el de antes, o el de después si era el
 * primero— y para borrar una semana ya está el borrado de semanas.
 *
 * ── La bitácora se junta con la de su destino ──────────────────────────────
 * Lo apuntado es de esas semanas, que siguen ahí. Se mezcla por fecha y se
 * recorta al mismo tope.
 *
 * ── Si el que se va era el abierto, el anterior se reabre ──────────────────
 * Y suelta su copia congelada: la estructura viva del programa es la de las
 * semanas que quedan, que son justo las del bloque quitado.
 *
 * Siempre queda al menos un bloque: con uno solo no hay corte que deshacer.
 */
export const deleteBlockFrom = (program, blockId) => {
  const lista = blocksOf(program);
  const i = lista.findIndex((b) => b.id === blockId);
  if (lista.length < 2 || i === -1) return program;

  const fuera = lista[i];
  const abierto = fuera.toWeek === null || fuera.toWeek === undefined;
  const resto = lista.filter((_, j) => j !== i);
  /* Absorbe el de delante; si el que se va era el primero, el de detrás. */
  const destino = i > 0 ? i - 1 : 0;

  return {
    ...program,
    blocks: resto.map((b, j) => {
      if (j !== destino) return b;
      const log = [...(b.log || []), ...(fuera.log || [])]
        .sort((a, z) => String(a.at || '').localeCompare(String(z.at || '')))
        .slice(-MAX_BITACORA);
      const juntos = log.length > 0 ? { log } : {};
      if (i === 0) return { ...b, ...juntos, fromWeek: fuera.fromWeek };
      if (!abierto) return { ...b, ...juntos, toWeek: fuera.toWeek };
      /* Vuelve a ser el abierto: sin `toWeek` y sin estructura congelada. */
      const { weeklySplit: _ws, mobilityDrills: _md, ...limpio } = b;
      return { ...limpio, ...juntos, toWeek: null };
    }),
  };
};

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

  const porMusculo = {};
  let total = 0;

  for (const week of semanas) {
    /* `planOfWeek` sirve el plan del bloque con las excepciones de esa semana
       aplicadas, o los días del microciclo mientras el bloque no lo tenga
       dentro. Las dos lecturas dan lo mismo; ver `domain/blocksMigration`. */
    for (const day of planOfWeek(program, week)) {
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

  /*
    ── Cuando el bloque YA TIENE su plan dentro ──────────────────────────────
    No hay nada que deducir: las hojas son las suyas y ya está. Y entonces
    `difieren` deja de significar «esta semana no coincide con la plantilla»
    —una acusación— para significar «esta semana tiene una excepción», que es
    un hecho. `vacias` desaparece: una semana sin escribir ya lleva el plan del
    bloque puesto, así que no hay hueco que rellenar. Y `reference` es `null`
    porque el plan ya no se lee de ninguna semana.
  */
  if (hasBlockPlan(block)) {
    const conExcepcion = (dayName) => weeks.filter((w) => overridesAt(block, w, dayName).length > 0);

    return {
      reference: null,
      weeks,
      sessions: blockSessionsOf(block).map((hoja) => ({
        dayName: hoja.dayName,
        series: (hoja.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0),
        volumen: dayPlannedVolume(hoja),
        exercises: (hoja.exercises || []).map((ex) => ({
          id: ex.id,
          name: ex.name,
          muscle: ex.muscle,
          series: (ex.sets || []).length,
          targetReps: repsObjetivo(ex),
        })),
        vacias: [],
        difieren: conExcepcion(hoja.dayName),
      })),
    };
  }

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
    planificadas += planOfWeek(program, micro.weekNumber).length;
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
   (`DefinirBloque`).

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

/* ══════════════════════════════════════════════════════════════════════════
   EL PLAN VIVE EN EL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   ══ Lo que había ══════════════════════════════════════════════════════════
   El plan —qué ejercicios lleva cada hoja, con cuántas series y qué
   repeticiones— vivía dentro de CADA microciclo, repetido tantas veces como
   microciclos tuviera el bloque. «El plan del bloque» no existía como dato: se
   DEDUCÍA leyendo el último microciclo escrito (`blockPlan`), y cada cambio
   había que repartirlo a mano a los que quedaban por entrenar.

   De esa copia salía todo el andamio: deducir la plantilla, repartir el cambio,
   avisar de los microciclos que no coincidían, y ofrecer un botón para rellenar
   los que estaban en blanco.

   ══ Lo que hay ════════════════════════════════════════════════════════════
   Un bloque es la estructura de sesión, y se escribe UNA vez:

       block.sessions = [{ dayName, exercises, mobilityDrills?, coachNote? }]

   El microciclo guarda lo que pasó —sus `sessions`, que son la ejecución— y,
   cuando lo hubo, en qué se apartó del plan:

       microcycle.overrides = [{ id, dayName, targetId, exercise, sobre, index, at }]

   ══ Un cambio se hace para quedarse ═══════════════════════════════════════
   Lo normal es cambiar el bloque: se monta una rutina y se ajusta sobre la
   marcha, y ese ajuste vale de ahí en adelante. La excepción es lo puntual
   —«esta semana llegó tocado, le quito una serie»— y por eso se llama así: se
   marca, se deshace, y se puede ASCENDER al bloque cuando resulta que
   funcionaba.

   ══ Convivencia ═══════════════════════════════════════════════════════════
   Un bloque sin `sessions` es uno que todavía no se ha migrado, y entonces
   manda el camino de siempre: los `days` del microciclo. `planOfDay` contesta
   por los dos, así que cada consumidor puede pasarse sin esperar a nadie. Ver
   `domain/blocksMigration`.
*/

/** Las hojas del bloque: su plan. `[]` mientras el bloque no lo tenga dentro. */
export const blockSessionsOf = (block) => (Array.isArray(block?.sessions) ? block.sessions : []);

/** ¿Este bloque lleva ya su plan dentro, o todavía vive en los microciclos? */
export const hasBlockPlan = (block) => Array.isArray(block?.sessions);

/** La hoja del bloque con ese nombre. */
export const blockSessionOf = (block, dayName) =>
  blockSessionsOf(block).find((s) => s.dayName === dayName) || null;

/*
 * ══ LOS CAMBIOS DEL BLOQUE, CON SU TRAMO ═══════════════════════════════════
 *
 * ── Por qué viven en el BLOQUE y no en el microciclo ──────────────────────
 * Estuvieron dentro del microciclo (`microcycle.overrides`) y aguantaban un
 * solo caso: «esta semana no». Pero un cambio a prueba dura lo que dura —«voy
 * a meterle press inclinado tres semanas y vemos»— y para que durara tres
 * había que escribirlo tres veces, una por microciclo. Que es EXACTAMENTE el
 * problema que este rediseño vino a quitar: el plan copiado por semana.
 *
 * Así que el cambio sube al bloque y lleva su tramo:
 *
 *     { id, dayName, targetId, exercise, sobre, index, fromWeek, toWeek, at }
 *
 * `toWeek: null` es «sin fin». Con eso, los tres gestos son el mismo dato:
 *
 *     solo este microciclo     fromWeek = toWeek = M
 *     unas semanas             fromWeek = M, toWeek = M + n
 *     de aquí en adelante      fromWeek = M, toWeek = null
 *
 * ── Y de paso arregla el pasado ───────────────────────────────────────────
 * Cambiar `block.sessions` cambia el plan de TODOS sus microciclos, los ya
 * entrenados incluidos: la adherencia de la semana 3 se movía sola al tocar
 * algo en la 10. Con el tramo, un cambio normal empieza donde estás y lo que
 * ya pasó se queda como estaba. Tocar la línea base sigue siendo posible —es
 * «también hacia atrás»— pero ahora es un gesto aparte y se pide.
 *
 * ── Las dos capas ─────────────────────────────────────────────────────────
 *   `block.sessions`  la ESTRUCTURA, la línea base: lo que se define al abrir
 *                     el bloque.
 *   `block.overrides` los CAMBIOS, cada uno con desde cuándo y hasta cuándo.
 */

/** Todos los cambios de un bloque; de una hoja concreta si se pide. */
export const blockOverridesOf = (block, dayName = null) => {
  const todos = Array.isArray(block?.overrides) ? block.overrides : [];
  return dayName === null ? todos : todos.filter((o) => o.dayName === dayName);
};

/** ¿Está este cambio vigente en ese microciclo? */
export const overrideCovers = (override, weekNumber) => {
  const desde = override?.fromWeek ?? -Infinity;
  const hasta = override?.toWeek ?? Infinity;
  return weekNumber >= desde && weekNumber <= hasta;
};

/**
 * Los cambios vigentes en un microciclo, en el orden en que se hicieron.
 *
 * El orden importa: dos cambios sobre el mismo ejercicio se aplican uno detrás
 * de otro, así que manda el último. `at` es la hora a la que se hizo; los
 * antiguos que no la tengan se quedan donde estaban.
 */
export const overridesAt = (block, weekNumber, dayName = null) =>
  blockOverridesOf(block, dayName)
    .filter((o) => overrideCovers(o, weekNumber))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

/**
 * Un cambio, con su identidad y su tramo puestos.
 *
 * `at` lo pone quien llama —es quien tiene reloj—; el id se genera aquí porque
 * este archivo ya genera los de los bloques.
 *
 * @param targetId el ejercicio DE LA LÍNEA BASE al que afecta; `null` en un alta.
 * @param exercise lo que queda en su sitio; `null` cuando se quita.
 * @param sobre    el nombre del ejercicio del bloque, para poder decir «en
 *                 lugar de X» aunque el bloque cambie después.
 * @param index    dónde entra un alta, en índices del plan del bloque.
 * @param fromWeek desde qué microciclo vale. Obligatorio: un cambio sin
 *                 principio valdría también para lo ya entrenado.
 * @param toWeek   hasta cuál, o `null` para «sin fin».
 */
export const buildOverride = ({
  dayName,
  targetId = null,
  exercise = null,
  sobre = null,
  index = null,
  fromWeek,
  toWeek = null,
  at = null,
}) => ({ id: newId('ov'), dayName, targetId, exercise, sobre, index, fromWeek, toWeek, at });

/** «solo M3», «M3–M5», «desde M3». Es lo que la pantalla pone al lado. */
export const overrideSpan = (override, block, etiqueta = (w) => `M${w}`) => {
  const desde = override?.fromWeek;
  const hasta = override?.toWeek;
  if (desde === null || desde === undefined) return '';
  if (hasta === null || hasta === undefined) return `desde ${etiqueta(desde)}`;
  if (hasta === desde) return `solo ${etiqueta(desde)}`;
  return `${etiqueta(desde)}–${etiqueta(hasta)}`;
};

/** ¿Es de un solo microciclo? Lo puntual se cuenta y se lee aparte. */
export const isPuntual = (override) =>
  override?.toWeek !== null && override?.toWeek !== undefined && override.toWeek === override.fromWeek;

/**
 * El plan de una hoja con sus excepciones aplicadas, en orden de creación.
 *
 * Devuelve un DÍA con la forma de siempre (`{ dayName, exercises, … }`), para
 * que lo que ya sabe leer un día no tenga que aprender nada nuevo.
 */
export const applyOverrides = (session, overrides = []) => {
  if (!session) return null;
  let exercises = [...(session.exercises || [])];

  /*
    ── Sobre un mismo ejercicio manda EL ÚLTIMO ────────────────────────────
    Dos cambios pueden caer sobre el mismo ejercicio de la línea base y ser los
    dos vigentes: «press inclinado desde el M1» y, tres microciclos después,
    «press declinado desde el M4». Aplicarlos en cadena no funciona —el segundo
    apunta a un ejercicio que el primero ya ha sustituido, así que se quedaría
    sin sujeto y se ignoraría— y además no es lo que significa: el segundo
    CORRIGE al primero, no se suma a él.

    Así que de los que tocan el mismo ejercicio se queda el último que se hizo.
    Las altas no compiten con nadie: entran todas.
  */
  const ultimoPorObjetivo = new Map();
  for (const o of overrides) {
    if (o.targetId === null || o.targetId === undefined) continue;
    ultimoPorObjetivo.set(o.targetId, o.id);
  }
  const vigentes = overrides.filter(
    (o) => o.targetId === null || o.targetId === undefined || ultimoPorObjetivo.get(o.targetId) === o.id
  );

  for (const o of vigentes) {
    if (o.targetId === null || o.targetId === undefined) {
      /* Un alta. Sin sitio dicho, al final: es donde se añade un ejercicio. */
      if (!o.exercise) continue;
      const at = Number.isInteger(o.index) ? Math.min(Math.max(o.index, 0), exercises.length) : exercises.length;
      exercises = [...exercises.slice(0, at), o.exercise, ...exercises.slice(at)];
      continue;
    }
    const i = exercises.findIndex((ex) => ex.id === o.targetId);
    /* El ejercicio del bloque ya no está: la excepción se queda sin sujeto y se
       ignora. No se borra —el bloque puede volver atrás— pero tampoco se
       inventa un sitio donde meterla. */
    if (i === -1) continue;
    exercises =
      o.exercise === null
        ? [...exercises.slice(0, i), ...exercises.slice(i + 1)]
        : [...exercises.slice(0, i), o.exercise, ...exercises.slice(i + 1)];
  }

  return { ...session, exercises };
};

/**
 * EL PLAN EFECTIVO DE UNA HOJA, venga de donde venga.
 *
 * Del bloque con sus excepciones si el bloque ya tiene su plan; de los `days`
 * del microciclo si todavía no. Es la única función que hay que llamar para
 * saber «qué le toca hacer aquí», y por eso la convivencia no se le nota a
 * nadie más.
 */
export const planOfDay = (program, weekNumber, dayName) => {
  const micro = (program?.microcycles || []).find((m) => m.weekNumber === weekNumber) || null;
  const bloque = blockOfWeek(program, weekNumber);
  if (!hasBlockPlan(bloque)) {
    return (micro?.days || []).find((d) => d.dayName === dayName) || null;
  }
  const hoja = blockSessionOf(bloque, dayName);
  if (!hoja) return null;
  return applyOverrides(hoja, overridesAt(bloque, weekNumber, dayName));
};

/** Todas las hojas de un microciclo, en el orden del bloque. */
export const planOfWeek = (program, weekNumber) => {
  const bloque = blockOfWeek(program, weekNumber);
  if (!hasBlockPlan(bloque)) {
    return (program?.microcycles || []).find((m) => m.weekNumber === weekNumber)?.days || [];
  }
  return blockSessionsOf(bloque).map((hoja) => applyOverrides(hoja, overridesAt(bloque, weekNumber, hoja.dayName)));
};

/* ── Escribir ─────────────────────────────────────────────────────────────── */

/** Pone el plan de un bloque. Es lo que hace «definir el bloque». */
export const setBlockSessionsIn = (program, blockId, sessions) => ({
  ...program,
  blocks: blocksOf(program).map((b) => (b.id === blockId ? { ...b, sessions } : b)),
});

/** Cambia una hoja del bloque, dejando las demás como están. */
export const updateBlockSessionIn = (program, blockId, dayName, fn) => ({
  ...program,
  blocks: blocksOf(program).map((b) =>
    b.id !== blockId ? b : { ...b, sessions: blockSessionsOf(b).map((s) => (s.dayName === dayName ? fn(s) : s)) }
  ),
});

/** Añade un cambio al bloque. Su tramo va dentro del propio cambio. */
export const putOverrideIn = (program, blockId, override) => ({
  ...program,
  blocks: blocksOf(program).map((b) =>
    b.id !== blockId ? b : { ...b, overrides: [...blockOverridesOf(b), override] }
  ),
});

/** Lo quita: el plan vuelve a la línea base en ese punto. */
export const removeOverrideIn = (program, blockId, overrideId) => ({
  ...program,
  blocks: blocksOf(program).map((b) =>
    b.id !== blockId ? b : { ...b, overrides: blockOverridesOf(b).filter((o) => o.id !== overrideId) }
  ),
});

/**
 * Le cambia el tramo: alargar la prueba, acortarla, o dejarla sin fin.
 *
 * Es lo que convierte «solo este microciclo» en «tres semanas más» sin volver a
 * escribir nada — que era justo lo que no se podía hacer cuando el cambio vivía
 * dentro de un microciclo.
 */
export const setOverrideSpanIn = (program, blockId, overrideId, { fromWeek = undefined, toWeek = undefined } = {}) => ({
  ...program,
  blocks: blocksOf(program).map((b) =>
    b.id !== blockId
      ? b
      : {
          ...b,
          overrides: blockOverridesOf(b).map((o) =>
            o.id !== overrideId
              ? o
              : {
                  ...o,
                  ...(fromWeek === undefined ? {} : { fromWeek }),
                  ...(toWeek === undefined ? {} : { toWeek }),
                }
          ),
        }
  ),
});

/**
 * ASCENDER UN CAMBIO A LA LÍNEA BASE: «esto ya no es una prueba».
 *
 * Lo mete en `block.sessions` y lo borra de la lista de cambios, así que pasa a
 * valer para el bloque ENTERO, los microciclos ya entrenados incluidos. Es la
 * única puerta que toca el pasado, y por eso se pide a propósito.
 *
 * Para que valga «de aquí en adelante» sin tocar lo anterior no hace falta
 * ascender nada: basta con quitarle el fin (`setOverrideSpanIn` con
 * `toWeek: null`), que es lo que hace «que se quede».
 *
 * El ejercicio conserva su id al subir: los registros de esos microciclos
 * apuntan a él, y cambiárselo los dejaría huérfanos.
 */
export const promoteOverrideIn = (program, blockId, overrideId) => {
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  const o = blockOverridesOf(bloque).find((x) => x.id === overrideId);
  if (!o || !hasBlockPlan(bloque)) return program;

  const conElPlanPuesto = updateBlockSessionIn(program, blockId, o.dayName, (hoja) => ({
    ...hoja,
    exercises: applyOverrides(hoja, [o]).exercises,
  }));
  return removeOverrideIn(conElPlanPuesto, blockId, overrideId);
};

/** «+ Face pull», «X en lugar de Y», «− Fondos». */
export const describeOverride = (override) => {
  const nombre = override?.exercise?.name || override?.sobre || '';
  if (!override?.exercise) return `− ${override?.sobre || nombre}`;
  if (override.targetId === null || override.targetId === undefined) return `+ ${nombre}`;
  if (override.sobre && override.sobre !== nombre) return `${nombre} en lugar de ${override.sobre}`;
  return nombre;
};

/**
 * LOS MICROCICLOS CON SU PLAN YA PUESTO: el adaptador de la convivencia.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 *
 * Media docena de funciones del dominio reciben `microcycles` y leen el plan de
 * `micro.days`: la adherencia, la frecuencia por grupo, los nombres de
 * ejercicio, la progresión, las señales de la revisión. Cambiarles la firma
 * para pasarles el programa entero sería tocar quince sitios a la vez y en el
 * mismo movimiento en el que cambia el modelo — dos riesgos multiplicados en
 * lugar de sumados.
 *
 * Esto devuelve los microciclos con `days` ya resuelto: el plan del bloque con
 * las excepciones de cada semana aplicadas. Así todo lo que ya sabía leer un
 * microciclo sigue leyéndolo, y la verdad vive en el bloque.
 *
 * Es una PROYECCIÓN, no un guardado: no se escribe en ningún sitio y desaparece
 * cuando esas funciones pasen a leer el bloque directamente.
 *
 * ══ Sin plan, no toca nada ═════════════════════════════════════════════════
 * Devuelve los mismos objetos —identidad incluida— mientras ningún bloque tenga
 * su plan dentro. Es lo que hace que se pueda enchufar hoy sin cambiar nada.
 *
 * ══ Y conserva lo anotado dentro del plan ══════════════════════════════════
 * Los datos antiguos guardan los kilos DENTRO del plan, y de ahí los saca
 * `legacySession` para que el histórico no se pierda. El plan del bloque va
 * limpio —lo comparten todas sus semanas—, así que al resolver se vuelven a
 * poner los valores que tenía esa semana, casando por id y, si no, por nombre.
 * Sin esto, migrar haría desaparecer el registro antiguo de la analítica.
 */
export const resolvedMicrocycles = (program) => {
  const microcycles = program?.microcycles || [];
  if (!blocksOf(program).some(hasBlockPlan)) return microcycles;

  return microcycles.map((micro) => {
    const bloque = blockOfWeek(program, micro.weekNumber);
    if (!hasBlockPlan(bloque)) return micro;

    const days = blockSessionsOf(bloque).map((hoja) => {
      const resuelto = applyOverrides(hoja, overridesAt(bloque, micro.weekNumber, hoja.dayName));
      return conLoAnotado(resuelto, (micro.days || []).find((d) => d.dayName === hoja.dayName));
    });

    return { ...micro, days };
  });
};

/** El día resuelto, con los kilos que esa semana tuviera escritos dentro. */
const conLoAnotado = (day, viejo) => {
  if (!viejo || (viejo.exercises || []).length === 0) return day;

  const porId = new Map((viejo.exercises || []).map((ex) => [ex.id, ex]));
  const porNombre = new Map();
  for (const ex of viejo.exercises || []) {
    const k = String(ex.name || '').trim().toLowerCase();
    if (!porNombre.has(k)) porNombre.set(k, []);
    porNombre.get(k).push(ex);
  }

  let tocado = false;
  const exercises = (day.exercises || []).map((ex) => {
    const suyo = porId.get(ex.id) || (porNombre.get(String(ex.name || '').trim().toLowerCase()) || []).shift();
    if (!suyo) return ex;
    const anotado = (suyo.sets || []).some((s) => s?.kg || s?.reps || s?.rir);
    if (!anotado) return ex;
    tocado = true;
    return {
      ...ex,
      sets: (ex.sets || []).map((s, i) => ({
        ...s,
        kg: suyo.sets?.[i]?.kg ?? '',
        reps: suyo.sets?.[i]?.reps ?? '',
        rir: suyo.sets?.[i]?.rir ?? '',
      })),
    };
  });

  return tocado ? { ...day, exercises } : day;
};

/* ══════════════════════════════════════════════════════════════════════════
   EDITAR EL PLAN DEL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   Un gesto, una escritura. Antes cada cambio del plan había que REPARTIRLO a
   las semanas del bloque que quedaran por entrenar, con una copia del
   ejercicio por semana y su propio identificador; y como una semana ya
   entrenada no se podía tocar, había cambios que simplemente no cabían en
   ningún sitio y había que avisar de que no se había hecho nada.

   Aquí el plan es uno, así que escribir es escribir. Lo que pasó no corre
   peligro: vive en las sesiones registradas, que esto no toca.
*/

/** Añade una hoja al bloque, al final. Si ya está, no hace nada. */
export const addBlockSessionIn = (program, blockId, dayName) => ({
  ...program,
  blocks: blocksOf(program).map((b) => {
    if (b.id !== blockId) return b;
    const hojas = blockSessionsOf(b);
    if (hojas.some((s) => s.dayName === dayName)) return b;
    return { ...b, sessions: [...hojas, { dayName, exercises: [] }] };
  }),
});

/**
 * Quita una hoja del bloque.
 *
 * Sus excepciones se van con ella: describen cómo se apartaba de un plan que
 * ya no existe, y dejarlas sería guardar una respuesta sin pregunta. Lo
 * ENTRENADO no se toca — las sesiones de esa hoja siguen en sus microciclos y
 * se siguen leyendo, que es la diferencia entre quitar del plan y borrar.
 */
export const removeBlockSessionFrom = (program, blockId, dayName) => ({
  ...program,
  blocks: blocksOf(program).map((b) =>
    b.id !== blockId
      ? b
      : {
          ...b,
          sessions: blockSessionsOf(b).filter((s) => s.dayName !== dayName),
          overrides: blockOverridesOf(b).filter((o) => o.dayName !== dayName),
        }
  ),
});

/** Le cambia el nombre. Las excepciones lo siguen: son de esa hoja. */
export const renameBlockSessionIn = (program, blockId, de, a) => {
  const nombre = String(a || '').trim();
  if (!nombre || nombre === de) return program;
  return {
    ...program,
    blocks: blocksOf(program).map((b) =>
      b.id !== blockId
        ? b
        : {
            ...b,
            sessions: blockSessionsOf(b).map((s) => (s.dayName === de ? { ...s, dayName: nombre } : s)),
            overrides: blockOverridesOf(b).map((o) => (o.dayName === de ? { ...o, dayName: nombre } : o)),
          }
    ),
  };
};

/** La mueve de sitio dentro del bloque: el orden en el que se lee. */
export const moveBlockSessionIn = (program, blockId, from, to) => ({
  ...program,
  blocks: blocksOf(program).map((b) => {
    if (b.id !== blockId) return b;
    const hojas = [...blockSessionsOf(b)];
    if (from < 0 || to < 0 || from >= hojas.length || to >= hojas.length || from === to) return b;
    const [suya] = hojas.splice(from, 1);
    hojas.splice(to, 0, suya);
    return { ...b, sessions: hojas };
  }),
});

/* ── Los ejercicios de una hoja ────────────────────────────────────────── */

const conEjercicios = (program, blockId, dayName, fn) =>
  updateBlockSessionIn(program, blockId, dayName, (hoja) => ({ ...hoja, exercises: fn(hoja.exercises || []) }));

export const addBlockExerciseIn = (program, blockId, dayName, exercise) =>
  conEjercicios(program, blockId, dayName, (lista) => [...lista, exercise]);

export const removeBlockExerciseIn = (program, blockId, dayName, exerciseId) =>
  conEjercicios(program, blockId, dayName, (lista) => lista.filter((ex) => ex.id !== exerciseId));

/** Lo devuelve a su sitio: es lo que deshace el quitar. */
export const restoreBlockExerciseIn = (program, blockId, dayName, exercise, index) =>
  conEjercicios(program, blockId, dayName, (lista) => [
    ...lista.slice(0, index),
    exercise,
    ...lista.slice(index),
  ]);

export const moveBlockExerciseIn = (program, blockId, dayName, from, to) =>
  conEjercicios(program, blockId, dayName, (lista) => {
    if (from < 0 || to < 0 || from >= lista.length || to >= lista.length || from === to) return lista;
    const copia = [...lista];
    const [suyo] = copia.splice(from, 1);
    copia.splice(to, 0, suyo);
    return copia;
  });

/**
 * Cuántas series pide un ejercicio del bloque.
 *
 * Crecer copia el objetivo de la última —que es lo que se espera al subir de
 * tres a cuatro— y encoger quita por el final. Entre 1 y 12, como en la hoja.
 */
export const setBlockExerciseSetsIn = (program, blockId, dayName, exerciseId, count) =>
  conEjercicios(program, blockId, dayName, (lista) =>
    lista.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const objetivo = Math.max(1, Math.min(12, Math.round(count) || 1));
      const sets = [...(ex.sets || [])];
      if (sets.length === objetivo) return ex;
      const ultima = sets[sets.length - 1];
      while (sets.length < objetivo) {
        sets.push({ kg: '', reps: '', rir: '', targetReps: ultima?.targetReps || '', targetRir: ultima?.targetRir || '' });
      }
      while (sets.length > objetivo && sets.length > 1) sets.pop();
      return { ...ex, sets };
    })
  );

/** El objetivo de repeticiones, en todas sus series. */
export const setBlockExerciseTargetIn = (program, blockId, dayName, exerciseId, targetReps) =>
  conEjercicios(program, blockId, dayName, (lista) =>
    lista.map((ex) => (ex.id !== exerciseId ? ex : { ...ex, sets: (ex.sets || []).map((s) => ({ ...s, targetReps })) }))
  );

/* ══════════════════════════════════════════════════════════════════════════
   ESCRIBIR DESDE LA HOJA
   ══════════════════════════════════════════════════════════════════════════

   En la hoja de series se ve el plan de UN microciclo: el del bloque con las
   excepciones de esa semana puestas. Cuando se toca algo ahí, lo normal es que
   el cambio se quede —una rutina se ajusta sobre la marcha y ese ajuste vale de
   ahí en adelante—, así que el destino por defecto es EL BLOQUE.

   Con una salvedad que no es una excepción a la regla sino la regla misma: si
   lo que se toca es un ejercicio que solo existe en la excepción de esa semana,
   se cambia la excepción. En los dos casos se escribe donde ese ejercicio vive.

   Lo puntual —«esta semana no, que llegó tocado»— se pide aparte, y entonces se
   crea una excepción con `putOverrideIn`.
*/

/** Dónde vive este ejercicio en el plan de esa semana. */
export const wherePlanExercise = (program, weekNumber, dayName, exerciseId) => {
  const bloque = blockOfWeek(program, weekNumber);
  if (!hasBlockPlan(bloque)) return { donde: 'semana', bloque };
  if ((blockSessionOf(bloque, dayName)?.exercises || []).some((ex) => ex.id === exerciseId)) {
    return { donde: 'bloque', bloque };
  }
  const suya = overridesAt(bloque, weekNumber, dayName).find((o) => o.exercise?.id === exerciseId);
  return suya ? { donde: 'excepcion', bloque, override: suya } : { donde: null, bloque };
};

/**
 * Cambia un ejercicio del plan desde la hoja, en su sitio.
 *
 * @param fn recibe el ejercicio y devuelve el ejercicio nuevo.
 */
export const updatePlanExerciseIn = (program, weekNumber, dayName, exerciseId, fn) => {
  const { donde, bloque, override } = wherePlanExercise(program, weekNumber, dayName, exerciseId);

  if (donde === 'bloque') {
    return updateBlockSessionIn(program, bloque.id, dayName, (hoja) => ({
      ...hoja,
      exercises: (hoja.exercises || []).map((ex) => (ex.id === exerciseId ? fn(ex) : ex)),
    }));
  }

  if (donde === 'excepcion') {
    return {
      ...program,
      blocks: blocksOf(program).map((b) =>
        b.id !== bloque.id
          ? b
          : {
              ...b,
              overrides: blockOverridesOf(b).map((o) =>
                o.id === override.id ? { ...o, exercise: fn(o.exercise) } : o
              ),
            }
      ),
    };
  }

  return program;
};

/**
 * Lo quita del plan desde la hoja.
 *
 * De un ejercicio del bloque se va del bloque; de uno que solo existía como
 * excepción de esa semana, se retira la excepción — que es exactamente
 * deshacerla.
 */
export const removePlanExerciseIn = (program, weekNumber, dayName, exerciseId) => {
  const { donde, bloque, override } = wherePlanExercise(program, weekNumber, dayName, exerciseId);
  if (donde === 'bloque') return removeBlockExerciseIn(program, bloque.id, dayName, exerciseId);
  if (donde === 'excepcion') return removeOverrideIn(program, bloque.id, override.id);
  return program;
};

/**
 * Y el mismo cambio, pero acotado en el tiempo.
 *
 * Por defecto solo en ese microciclo (`hasta = weekNumber`); `hasta` mueve el
 * final —unas semanas de prueba— y `null` lo deja sin fin, que es «que se
 * quede de aquí en adelante» sin tocar lo ya entrenado.
 *
 * Deja la línea base como está y anota la diferencia. Sobre un ejercicio del
 * bloque crea el cambio; sobre uno que ya lo era, lo afina en su sitio.
 */
export const overridePlanExerciseIn = (program, weekNumber, dayName, exerciseId, fn, { at = null, hasta = weekNumber } = {}) => {
  const { donde, bloque } = wherePlanExercise(program, weekNumber, dayName, exerciseId);
  if (donde === 'excepcion') return updatePlanExerciseIn(program, weekNumber, dayName, exerciseId, fn);
  if (donde !== 'bloque') return program;

  const suyo = (blockSessionOf(bloque, dayName)?.exercises || []).find((ex) => ex.id === exerciseId);
  if (!suyo) return program;
  /* El ejercicio de la excepción lleva id NUEVO: es otro ejercicio del plan de
     esa semana, y compartir el id del bloque cruzaría sus registros con los de
     las semanas que sí hacen el del bloque. */
  const cambiado = { ...fn(suyo), id: newId('ex') };
  return putOverrideIn(
    program,
    bloque.id,
    buildOverride({
      dayName,
      targetId: exerciseId,
      exercise: cambiado,
      sobre: suyo.name,
      fromWeek: weekNumber,
      toWeek: hasta,
      at,
    })
  );
};

/** Y quitarlo durante ese tramo: un cambio de baja. */
export const removePlanExerciseOnlyIn = (program, weekNumber, dayName, exerciseId, { at = null, hasta = weekNumber } = {}) => {
  const { donde, bloque, override } = wherePlanExercise(program, weekNumber, dayName, exerciseId);
  if (donde === 'excepcion') return removeOverrideIn(program, bloque.id, override.id);
  if (donde !== 'bloque') return program;
  const suyo = (blockSessionOf(bloque, dayName)?.exercises || []).find((ex) => ex.id === exerciseId);
  return putOverrideIn(
    program,
    bloque.id,
    buildOverride({
      dayName,
      targetId: exerciseId,
      exercise: null,
      sobre: suyo?.name || null,
      fromWeek: weekNumber,
      toWeek: hasta,
      at,
    })
  );
};
