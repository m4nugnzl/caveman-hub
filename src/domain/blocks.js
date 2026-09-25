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
import { addDays, daysBetween, toISODate, todayISO, weekStart } from '@/lib/dates';
import {
  MRV_GOALS,
  WEEK_DAYS,
  casillasDe,
  claveDelDia,
  cloneExerciseAsTemplate,
  copiaDeLaHoja,
  cycleSlots,
  dayPlannedVolume,
  duracionDe,
  entrenosDe,
  isRestDay,
  normalizaMicrociclo,
  normalizePattern,
  renombrarEnMicrociclo,
  rotatingSlots,
  secuenciaSemanal,
  seguirAlPlan,
  tecnicaOf,
  vecesDeCadaHoja,
} from './training';
import { executedSessions, sesionAbierta, sesionAMedias, sessionsOf, sessionTonnage } from './sessions';
import { weekStartOfProgramWeek } from './photos';
import { nombreCortoDelSplit, nombreDelSplit } from './split';
import { clientProtocol, isServiceOn } from './protocol';

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
 *
 * `id` es el de un borrador que empieza (`domain/borradores`): el bloque que
 * nace conserva el suyo. Si ya lo lleva otro bloque, se usa uno nuevo.
 */
export const openNextBlock = (program, { name = null, id = null } = {}) => {
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
    id: id && !lista.some((b) => b.id === id) ? id : newId('b'),
    name: name || `Bloque ${lista.length + 1}`,
    fromWeek: fin + 1,
    toWeek: null,
    /* Hereda la temporada del que cierra: un bloque nuevo sigue en la misma
       funda hasta que el entrenador lo cambie (ver `domain/temporadas`). */
    ...(carpetaDelBloque(abierto) ? { folder: carpetaDelBloque(abierto) } : {}),
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

/**
 * LO QUE PIDEN TODAS LAS SERIES, EN UNA CIFRA. `null` si no piden lo mismo.
 *
 * «8-10» cuando las cuatro series piden 8-10; `null` cuando la primera pide 5 y
 * la última 12, que es lo que la pantalla dice con la palabra «varias»; y `''`
 * cuando ninguna lo pauta, que es distinto de las dos anteriores: no hay
 * desacuerdo, hay silencio.
 *
 * Nació resumiendo las repeticiones y vale igual para los kilos y el RIR: los
 * tres objetivos cuelgan de la SERIE y los tres se leen —y se escriben— desde
 * el renglón del ejercicio, que es donde se pauta lo que vale para todas. Una
 * sola lectura para los tres, porque si no habría tres formas de contestar la
 * misma pregunta.
 */
export const pautaComun = (exercise, campo) => {
  const valores = (exercise?.sets || []).map((s) => String(s?.[campo] ?? '').trim());
  if (valores.length === 0) return '';
  return valores.every((v) => v === valores[0]) ? valores[0] : null;
};

/** «8-10» si todas las series piden lo mismo; `null` si son mixtas. */
const repsObjetivo = (exercise) => pautaComun(exercise, 'targetReps');

/**
 * LA PAUTA CON LA QUE NACE EL EJERCICIO SIGUIENTE: la del anterior de la hoja.
 *
 * Esto se decidía en dos sitios y de dos maneras distintas: el alta del banco
 * llevaba sus propias casillas «3 × 8-10» —pegajosas, se quedaban de un
 * ejercicio al siguiente— y el «+» de la biblioteca añadía SIEMPRE 3 × 8-10 sin
 * mirar nada. El mismo gesto daba dos resultados según por dónde entraras, y el
 * alta pagaba dos campos de formulario en el sitio más visible de la pantalla
 * por una decisión que casi nunca cambia.
 *
 * Quien mete cuatro de espalda a 4 × 6-8 los quiere iguales; y cuando no, la
 * cifra se corrige en la fila, que es donde se lee. La hoja en blanco arranca
 * en 3 × 8-10, que es de donde venía el valor de siempre.
 *
 * Recibe los ejercicios TAL Y COMO LOS LEE LA PANTALLA (`planExerciseView`):
 * `series` contadas y `targetReps` resumido. Las repeticiones mixtas —`null`—
 * no se heredan: un ejercicio nuevo no nace con una pirámide que nadie ha
 * pedido.
 */
export const pautaHeredada = (exercises = []) => {
  const ultimo = exercises[exercises.length - 1];
  return {
    numSets: ultimo?.series || 3,
    targetReps: ultimo?.targetReps || '8-10',
  };
};

/**
 * EL ESQUEMA DE SERIES, EN TRAMOS: series seguidas que piden lo mismo.
 *
 * «4 × 6-8» es un tramo. «1 × 12, 3 × 6-8» son dos, y hasta ahora la rejilla del
 * bloque no sabía decirlo: `pautaComun` contestaba `null` —las series no piden
 * lo mismo— y la casilla imprimía «varias», que es exactamente tanta información
 * como no poner nada. Quien abre el bloque para leer el plan tiene que enterarse
 * de que la primera va a 12 sin irlo a buscar a otra pantalla.
 *
 * No hay campo nuevo: los tramos SALEN de las series, que es donde el plan ya
 * vive, y vuelven a ellas sin perder nada (`setsDesdeTramos`). Es el modelo más
 * pequeño que dice una pauta heterogénea, y el único que no crea una segunda
 * verdad sobre la misma cosa.
 *
 * Tramos por POSICIÓN y no por valor: «1 × 12, 3 × 6-8, 1 × 12» son tres, no
 * dos. Una pirámide que baja y vuelve a subir es lo que está escrito, y
 * agruparla por el número la reordenaría al guardar.
 *
 * @returns `[{ n, reps }]`, vacío si el ejercicio no tiene series.
 */
export const tramosDeSeries = (exercise) => {
  const tramos = [];
  for (const set of exercise?.sets || []) {
    const reps = String(set?.targetReps ?? '').trim();
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.reps === reps) ultimo.n += 1;
    else tramos.push({ n: 1, reps });
  }
  return tramos;
};

/**
 * EL ESQUEMA DE UN VISTAZO: «4×6-8», «12, 3×6-8», «6-8, 8-10, 8-12».
 *
 * Con el `×` pegado, que es como lo dibuja el frame y como cabe en una columna
 * de 276 px. Y con **el 1 callado cuando hay más de un tramo**, que es la regla
 * que hace que esto quepa en un renglón: una rampa de tres series distintas se
 * escribía «1×6-8, 1×8-10, 1×8-12» —tres multiplicadores que siempre dicen lo
 * mismo— y se lee «6-8, 8-10, 8-12», que es como lo escribe a mano cualquier
 * entrenador. Cuántas series hay lo dice la propia lista.
 *
 * Con un solo tramo el multiplicador SÍ se escribe («4×6-8», «1×12»): ahí no
 * hay lista que contar y sin él la cifra no diría cuántas series son.
 */
export const esquemaDicho = (tramos = []) => {
  const solo = tramos.length === 1;
  return tramos
    .map(({ n, reps }) => (n === 1 && !solo ? reps || '—' : `${n}×${reps || '—'}`))
    .join(', ');
};

/**
 * LAS SERIES QUE SALEN DE UN ESQUEMA, conservando lo escrito por serie.
 *
 * Cada serie hereda POR POSICIÓN lo que ya había —los kilos pautados, el RIR y
 * el remate—, y las que no tenían sitio antes nacen de la última sin su remate:
 * es la misma regla con la que crece un ejercicio desde su casilla de series
 * (`setBlockExerciseSetsIn`), y por eso repartir «4 × 6-8» en «1 × 12, 3 × 6-8»
 * no borra la pirámide de kilos que ya estuviera escrita en la hoja.
 *
 * Lo único que dicta el esquema es el objetivo de repeticiones.
 *
 * Un tramo de cero series NO existe: es como se quita un tramo desde la fila, y
 * aquí se cae solo. Un esquema entero a cero deja las series como estaban —un
 * ejercicio sin ninguna no es un ejercicio—. Tope de 12, el de toda la casa.
 */
export const setsDesdeTramos = (tramos = [], previos = []) => {
  const pedidas = [];
  for (const { n, reps } of tramos) {
    const cuantas = Math.max(0, Math.round(Number(n)) || 0);
    for (let i = 0; i < cuantas && pedidas.length < 12; i += 1) pedidas.push(String(reps ?? '').trim());
  }
  if (pedidas.length === 0) return previos;
  const ultima = previos[previos.length - 1];
  return pedidas.map((targetReps, i) =>
    previos[i]
      ? { ...previos[i], targetReps }
      : {
          kg: '',
          reps: '',
          rir: '',
          targetKg: ultima?.targetKg || '',
          targetReps,
          targetRir: ultima?.targetRir || '',
        }
  );
};

/**
 * Un ejercicio guardado, como lo lee una pantalla: las series contadas y la
 * pauta resumida, en vez del array de sets.
 *
 * Lo usan `blockPlan` —la rejilla y la hoja del bloque abierto— y el
 * compositor, que trabaja sobre hojas que todavía no están guardadas en
 * ningún sitio. Sin esto, la misma traducción estaría escrita dos veces y se
 * separarían al primer campo nuevo.
 */
export const planExerciseView = (ex) => ({
  id: ex.id,
  name: ex.name,
  muscle: ex.muscle,
  series: (ex.sets || []).length,
  targetReps: repsObjetivo(ex),
  /*
    ── Y LAS SERIES, QUE NO SON UN RESUMEN ───────────────────────────────────
    Esta lectura nació resumiendo —cuántas series, qué repeticiones— porque eso
    era todo el plan de un ejercicio. Dejó de serlo cuando los kilos y el RIR
    bajaron a la SERIE: desde entonces «4 × 6-8» es media verdad y la otra media
    no viajaba, así que quien recibía la vista no podía enseñarla ni escribirla.

    Se notaba en dos sitios a la vez y en los dos en silencio: `pesoPautado` de
    la rejilla del bloque leía `ex.sets` para imprimir «100 kg» delante de la
    pauta y le llegaba siempre vacío —el peso escrito en la hoja no aparecía en
    ninguna parte de la rejilla—, y el banco del compositor no tenía de dónde
    sacar las series para dejar pautarlas.

    Van por referencia y sin copiar: es el mismo array que ya está en memoria.
  */
  sets: ex.sets || [],
  /* La gramática de serie viaja al plan: la rejilla y la hoja la imprimen. Las
     alternativas iban aquí y se han retirado del producto (ver `training.js`). */
  enlazado: Boolean(ex.enlazado),
  tecnica: tecnicaOf(ex),
  restSeconds: ex.restSeconds ?? null,
  /* Tu indicación para ESE ejercicio. Es plan y no registro —la escribe el
     entrenador al programar, y el cliente la lee junto a la fila—, así que
     viaja igual que la pauta. Sin ella el compositor no podía enseñarla: la
     nota estaba en la hoja y la vista que la hoja lee no la traía. */
  coachNote: ex.coachNote ?? '',
});

/**
 * Una hoja, como la lee la rejilla del bloque: sus ejercicios traducidos, las
 * series contadas y el volumen pautado por grupo.
 *
 * ── Por qué está aquí y no dentro de `blockPlan` ──────────────────────────
 * Porque hay TRES sitios que necesitan esta forma y solo dos tienen un bloque
 * guardado del que sacarla: las dos ramas de `blockPlan` —el bloque con su
 * plan dentro y el que todavía lo deduce de la última semana— y el
 * COMPOSITOR, que trabaja sobre hojas que aún no están escritas en ninguna
 * parte. Escrita tres veces se separarían al primer campo nuevo, y el que se
 * quedaría atrás sería siempre el del compositor: es el único que no se ve en
 * producción hasta que alguien abre un bloque.
 *
 * `vacias` y `difieren` los pone quien sabe de semanas; sin ellos, una hoja
 * que no se repite en ningún microciclo — que es exactamente el caso de la
 * que se está componiendo.
 */
export const planSessionView = (session, { vacias = [], difieren = [], avisan = difieren } = {}) => ({
  dayName: session.dayName,
  series: (session.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0),
  volumen: dayPlannedVolume(session),
  exercises: (session.exercises || []).map(planExerciseView),
  vacias,
  difieren,
  /* Las de `difieren` que nadie ha dado por vistas (`excepcionVista`): son
     las que la tarjeta marca. */
  avisan,
});

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
    const sinVer = (dayName) => conExcepcion(dayName).filter((w) => !excepcionVista(block, w, dayName));

    return {
      reference: null,
      weeks,
      sessions: blockSessionsOf(block).map((hoja) =>
        planSessionView(hoja, { difieren: conExcepcion(hoja.dayName), avisan: sinVer(hoja.dayName) })
      ),
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

    return planSessionView(day, {
      /* Sin nada escrito es que está por rellenar; con algo distinto, que se
         tocó a mano. Son dos cosas y llevan a dos acciones distintas: la
         primera se rellena con la plantilla, la segunda solo se avisa. */
      vacias: otras.filter((w) => (suyoEn(w)?.exercises || []).length === 0),
      difieren: otras.filter((w) => {
        const suyo = suyoEn(w);
        return Boolean(suyo) && (suyo.exercises || []).length > 0 && firmaDelDia(suyo) !== firma;
      }),
    });
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
 *
 * ── Se cuentan APARICIONES, no hojas ────────────────────────────────────────
 * Una hoja que cae dos días del microciclo son dos sesiones planificadas, y
 * `hechas` solo suma las que cubren una aparición: la tercera sesión de una
 * hoja que sale dos veces no sube la adherencia. Ver `vecesDeLaHoja`.
 *
 * ── Lo que no estaba previsto va aparte ─────────────────────────────────────
 * Las sesiones de una hoja que no está en el plan de ESE microciclo —quitada o
 * renombrada después— van a `extra`, no a `hechas`. Antes sumaban a `hechas`
 * sin sumar a `planificadas`, y la adherencia pasaba del 100 %: 4 de 1 (400 %)
 * en un bloque real al que le quitaron tres hojas ya entrenadas. Se entrenaron,
 * y el tonelaje las cuenta; lo que no hacen es cumplir un plan que no las pedía.
 *
 * @param client `{ cycleType, cyclePattern }`: para derivar la secuencia de los
 *   bloques que aún no la tienen guardada.
 */
export const blockSummary = (program, block, client = null) => {
  const semanas = weeksOfBlock(program, block);
  const microcycles = program?.microcycles || [];
  const suyos = semanas.map((w) => microcycles.find((m) => m.weekNumber === w)).filter(Boolean);

  let kg = 0;
  let hechas = 0;
  let extra = 0;
  let planificadas = 0;
  /*
    ── Microciclo a microciclo, para poder DIBUJARLO ─────────────────────────
    Las cifras de arriba son del bloque entero y no dicen su forma: «38 de 40»
    puede ser cuatro semanas parejas o tres perfectas y una en blanco. La misma
    pasada que las suma deja aquí el desglose, que es lo que la fila de la lista
    pinta como barra segmentada.

    Es la mitad honesta de lo que hace Efort: su barra dibuja también las
    semanas que faltan hasta el final, y aquí el bloque abierto no tiene final
    que dibujar. Se pintan las escritas y el canto se deja abierto.
  */
  const detalle = [];
  for (const micro of suyos) {
    const sesiones = executedSessions(micro);
    const plan = planOfWeek(program, micro.weekNumber);
    const veces = vecesDeLaHoja(program, micro.weekNumber, client);
    const porHoja = sesionesPorHoja(sesiones);
    const enElPlan = new Set(plan.map((h) => h.dayName));

    const suyasPlan = plan.reduce((n, h) => n + veces(h.dayName), 0);
    const suyasHechas = plan.reduce((n, h) => n + Math.min(porHoja.get(h.dayName) || 0, veces(h.dayName)), 0);
    const suyasExtra = sesiones.filter((s) => !enElPlan.has(s.dayName)).length;

    hechas += suyasHechas;
    extra += suyasExtra;
    planificadas += suyasPlan;
    for (const s of sesiones) kg += sessionTonnage(s);
    detalle.push({ semana: micro.weekNumber, hechas: suyasHechas, planificadas: suyasPlan, extra: suyasExtra });
  }

  const fechas = suyos.map((m) => m.date).filter(Boolean);
  return {
    semanas: semanas.length,
    /* Cada microciclo escrito con lo que se hizo en él: la forma del bloque. */
    microciclos: detalle,
    desde: fechas[0] || null,
    hasta: fechas[fechas.length - 1] || null,
    kg,
    hechas,
    /* Sesiones de hojas que ese microciclo no tenía en el plan. */
    extra,
    planificadas,
    /* Sin nada planificado no hay adherencia que dar: un 0 % diría que se lo
       saltó todo, y lo que pasa es que no había nada que saltarse. */
    adherencia: planificadas > 0 ? Math.round((hechas / planificadas) * 100) : null,
    series: blockPlannedVolume(program, block).media,
    abierto: block?.toWeek === null || block?.toWeek === undefined,
  };
};

/**
 * Las series por grupo muscular de un plan, de más a menos y con su MRV.
 *
 * Toma las hojas YA RESUELTAS (`blockPlan(...).sessions`), que llevan su
 * `volumen` calculado: rehacer aquí la cuenta sería escribirla dos veces.
 *
 * Vivía dentro de `VistaBloque` como una función privada. Sube al dominio
 * desde que la lista de bloques enfrenta dos: la misma cuenta la hacen ahora
 * dos pantallas, y esto no es una decisión de pintura.
 */
export const volumeByGroup = (hojas = []) =>
  [...new Set(hojas.flatMap((h) => Object.keys(h?.volumen || {})))]
    .map((name) => ({
      name,
      valor: hojas.reduce((n, h) => n + (h?.volumen?.[name] || 0), 0),
      mrv: MRV_GOALS[name]?.mrv ?? null,
    }))
    .filter((m) => m.valor > 0)
    .sort((a, b) => b.valor - a.valor);

/**
 * Las series por grupo de UNA hoja, con lo que ese grupo suma en TODO el bloque.
 *
 * Es lo que hace falta para planificar con la hoja abierta: la cifra de la
 * izquierda es lo que estás tocando —las series de este día— y la de detrás,
 * dónde cae eso en el reparto del bloque. Sin la segunda no se puede contestar
 * la pregunta que se hace uno mientras añade un ejercicio: «el pecho, ¿ya va
 * servido en otro día?».
 *
 * Solo salen los grupos que ESTA hoja trabaja: la tabla de todos, grupo a
 * grupo y hoja a hoja, es la de `VolumenPopup`, a un clic de aquí.
 *
 * @param volumenDeLaHoja  `{ Pecho: 6, Tríceps: 3 }` — de `dayPlannedVolume`,
 *   leído del día que hay en la mesa y no del plan del bloque: con una excepción
 *   puesta en este microciclo, los dos no coinciden y lo que se está mirando es
 *   el día.
 * @param hojasDelBloque   Las de `blockPlan(...).sessions`, con su `volumen`.
 * @returns `[{ name, parte, valor, mrv }]`, de más a menos series en la hoja.
 */
export const sheetVolumeByGroup = (volumenDeLaHoja = {}, hojasDelBloque = []) =>
  Object.entries(volumenDeLaHoja || {})
    .filter(([, series]) => series > 0)
    .map(([name, parte]) => ({
      name,
      parte,
      valor: (hojasDelBloque || []).reduce((n, h) => n + (h?.volumen?.[name] || 0), 0),
      mrv: MRV_GOALS[name]?.mrv ?? null,
    }))
    .sort((a, b) => b.parte - a.parte || a.name.localeCompare(b.name));

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

/* ══════════════════════════════════════════════════════════════════════════
   DE DÓNDE NACE UN BLOQUE, Y QUÉ LE HAS CAMBIADO
   ══════════════════════════════════════════════════════════════════════════

   Las dos vivían dentro del formulario de definir un bloque, que era a la vez
   pantalla y razonamiento (hoy `Compositor.jsx`). Son puras —programa dentro, hojas fuera— y las usa el
   compositor entero, así que bajan al dominio y se prueban aquí.
   ══════════════════════════════════════════════════════════════════════════ */

/** Los ejercicios de una hoja, sin lo que nadie levantó y con ids nuevos. */
const comoPlantilla = (hoja) => ({
  dayName: hoja.dayName,
  exercises: (hoja.exercises || []).map(cloneExerciseAsTemplate),
  ...(Array.isArray(hoja.mobilityDrills) ? { mobilityDrills: hoja.mobilityDrills } : {}),
});

/**
 * Las hojas que hereda un bloque nuevo del que se cierra.
 *
 * Del plan del bloque si ya lo tiene dentro; del último microciclo escrito si
 * todavía no. `planOfWeek` contesta por los dos, así que esto no tiene que
 * saber cuál manda.
 */
export const inheritedSessions = (program, block) => {
  if (hasBlockPlan(block)) return blockSessionsOf(block).map(comoPlantilla);
  const referencia = blockPlan(program, block).reference;
  if (!referencia) return [];
  return planOfWeek(program, referencia).map(comoPlantilla);
};

/** «4 × 8-10» a partir de las series de un ejercicio. */
const objetivoDe = (ex) => {
  const valores = (ex.sets || []).map((s) => String(s?.targetReps ?? '').trim());
  return valores.length > 0 && valores.every((v) => v === valores[0]) ? valores[0] : '';
};

/**
 * Qué ha cambiado un bloque respecto al que hereda.
 *
 * Se empareja por nombre, como en toda la casa — salvo que en el compositor se
 * haya cambiado un ejercicio por otro en su sitio (mismo id, ver
 * `renombrarEnLista`): eso se dice «X → Y», no «fuera X» y «entra Y». Devuelve
 * una línea por cambio; sin ninguna, el bloque nuevo es idéntico al anterior y
 * también hay que poder decirlo.
 */
export const sessionDiff = (antesLista = [], ahoraLista = []) => {
  const out = [];
  const clave = claveDeNombre;
  const parejaDe = (ex, lista = []) =>
    (ex.id ? lista.find((e) => e.id === ex.id) : null) || lista.find((e) => clave(e.name) === clave(ex.name)) || null;

  for (const antes of antesLista) {
    const ahora = ahoraLista.find((s) => s.dayName === antes.dayName);
    if (!ahora) {
      out.push({ hoja: antes.dayName, tipo: 'menos', texto: 'la hoja se va' });
      continue;
    }
    for (const ex of antes.exercises || []) {
      const suyo = parejaDe(ex, ahora.exercises);
      if (!suyo) {
        out.push({ hoja: antes.dayName, tipo: 'menos', texto: `fuera ${ex.name}` });
        continue;
      }
      if (clave(suyo.name) !== clave(ex.name)) {
        out.push({ hoja: antes.dayName, tipo: 'mas', texto: `${ex.name} → ${suyo.name}` });
      }
      const seriesAntes = (ex.sets || []).length;
      const seriesAhora = (suyo.sets || []).length;
      if (seriesAntes !== seriesAhora) {
        out.push({ hoja: antes.dayName, tipo: 'mas', texto: `${ex.name} ${seriesAntes} → ${seriesAhora} series` });
      } else if (objetivoDe(ex) !== objetivoDe(suyo)) {
        out.push({ hoja: antes.dayName, tipo: 'mas', texto: `${ex.name} ${objetivoDe(ex)} → ${objetivoDe(suyo)}` });
      }
    }
  }

  for (const ahora of ahoraLista) {
    const antes = antesLista.find((s) => s.dayName === ahora.dayName);
    if (!antes) {
      out.push({ hoja: ahora.dayName, tipo: 'mas', texto: 'hoja nueva' });
      continue;
    }
    for (const ex of ahora.exercises || []) {
      if (!parejaDe(ex, antes.exercises)) {
        out.push({ hoja: ahora.dayName, tipo: 'mas', texto: `entra ${ex.name}` });
      }
    }
  }

  return out;
};

/* ══════════════════════════════════════════════════════════════════════════
   LAS CARACTERÍSTICAS DEL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   ══ Lo que había ══════════════════════════════════════════════════════════
   Un bloque era `id · name · fromWeek · toWeek` y su plan. Todo lo que el
   entrenador sabe de POR QUÉ existe ese bloque cabía en una cadena de texto:
   «Bloque 2». Y la duración prevista se pedía al crearlo,
   se guardaba en `plannedWeeks`… y no la leía nadie.

   ══ Las tres, y ninguna calculada ═════════════════════════════════════════
   · `intent` — a qué juega el bloque, de una lista corta del oficio.
   · `plannedWeeks` — cuánto se ha previsto que dure. Opcional: lo normal es
     que una rutina dure hasta que hay motivo para cambiarla.
   · `note` — una línea del entrenador: qué se persigue.

   La intención NO receta nada: rotula el bloque, ordena la lectura del
   conjunto y explica al cliente en qué anda metido. La app no propone
   cargas, ni duraciones, ni descargas.

   ══ Sin migración ═════════════════════════════════════════════════════════
   Son claves nuevas en `workout_data.blocks`, que ya es `jsonb` (0086) y ya
   lleva claves de más. Un bloque sin ellas se lee exactamente como hasta hoy.
   ══════════════════════════════════════════════════════════════════════════ */

/** A qué juega un bloque. Lista corta y del oficio: no es una taxonomía. */
export const BLOCK_INTENTS = [
  /* La tinta es de la paleta de DATOS: distingue, no juzga. Adaptación va en
     gris como «sin intención» porque es el punto de partida, no un énfasis. */
  { id: 'adaptacion', label: 'Adaptación', color: 'var(--data-slate)' },
  { id: 'acumulacion', label: 'Acumulación', color: 'var(--data-teal)' },
  { id: 'intensificacion', label: 'Intensificación', color: 'var(--data-violet)' },
  { id: 'descarga', label: 'Descarga', color: 'var(--data-amber)' },
  { id: 'mantenimiento', label: 'Mantenimiento', color: 'var(--data-blue)' },
];

const INTENT_IDS = new Set(BLOCK_INTENTS.map((i) => i.id));

/** «acumulacion» → «Acumulación». Sin intención, nada. */
export const intentLabel = (id) => BLOCK_INTENTS.find((i) => i.id === id)?.label || null;

/** La tinta de una intención. Sin intención, gris. */
export const intentColor = (id) => BLOCK_INTENTS.find((i) => i.id === id)?.color || 'var(--data-slate)';

/* Una línea, no un diario: lo largo va a la bitácora del bloque. */
export const MAX_BLOCK_NOTE = 280;

/* El nombre del split, como lo diría el entrenador: «Torso-pierna», «PPL». */
export const MAX_BLOCK_SPLIT = 40;

/* El nombre de una temporada: «Volumen 2026», «Hacia el campeonato». */
export const MAX_BLOCK_FOLDER = 40;

/**
 * La TEMPORADA en la que el entrenador ha puesto el bloque (`folder`), saneada,
 * o `null` si no la tiene: entonces va a la del año. Vale igual para un bloque
 * que para un borrador. Ver `domain/temporadas`.
 */
export const carpetaDelBloque = (block) =>
  String(block?.folder ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_BLOCK_FOLDER) || null;

/** Un tope alto y honesto: un bloque de un año no es un bloque. */
const MAX_PLANNED = 52;

const semanasPrevistas = (valor) => {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n >= 1 && n <= MAX_PLANNED ? n : null;
};

/**
 * Las características de un bloque, saneadas. Siempre las tres claves, para
 * que quien lea no tenga que preguntar si existen.
 */
export const blockTraits = (block) => ({
  intent: INTENT_IDS.has(block?.intent) ? block.intent : null,
  plannedWeeks: semanasPrevistas(block?.plannedWeeks),
  note: String(block?.note ?? '').trim().slice(0, MAX_BLOCK_NOTE) || null,
  split: String(block?.split ?? '').trim().slice(0, MAX_BLOCK_SPLIT) || null,
});

/**
 * Escribe las que lleguen y deja intactas las que no.
 *
 * Lo que queda vacío se BORRA de la fila en vez de guardarse como `null`: un
 * bloque sin características tiene que seguir siendo el objeto pequeño que era.
 */
export const setBlockTraitsIn = (program, blockId, traits = {}) => ({
  ...program,
  blocks: blocksOf(program).map((b) => {
    if (b.id !== blockId) return b;
    const saneadas = blockTraits({ ...blockTraits(b), ...traits });
    const { intent: _i, plannedWeeks: _p, note: _n, split: _s, ...limpio } = b;
    return {
      ...limpio,
      ...(saneadas.intent ? { intent: saneadas.intent } : {}),
      ...(saneadas.plannedWeeks ? { plannedWeeks: saneadas.plannedWeeks } : {}),
      ...(saneadas.note ? { note: saneadas.note } : {}),
      ...(saneadas.split ? { split: saneadas.split } : {}),
    };
  }),
});

/**
 * El HORIZONTE del ciclo: cuánto le queda al bloque por el que va la persona y
 * qué viene detrás. Es el dato que alimenta la frase de la línea de bloques
 * («A Intensificación le quedan 2 semanas · después, nada programado») — el
 * entrenador tenía que deducirlo contando pastillas y leyendo fechas.
 *
 * ── Y por fin el bloque ABIERTO puede tener horizonte ──────────────────────
 * Aquí se contaba lo que le quedaba al abierto restando semanas MONTADAS, y
 * eso mentía: decía «le quedan 2» cuando lo que quedaba era lo que aún no se
 * había escrito. Por eso la línea dejó de contarlo y el abierto pasó a decir
 * solo que estaba abierto.
 *
 * Con `plannedWeeks` vivo hay una tercera respuesta, que es la verdadera: si
 * el entrenador previó cuatro, «va por el 3 de 4» no es una deducción, es su
 * plan. Sin duración prevista no cambia nada: el abierto sigue sin horizonte,
 * porque una rutina dura hasta que hay motivo para cambiarla.
 *
 * `posicion` es 1-based dentro del bloque, y puede pasarse de `previstas` sin
 * que eso sea un error: un bloque de 4 que va por el 6 se dice y no se regaña.
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
  const abierto = bloque.toWeek === null || bloque.toWeek === undefined;
  const { plannedWeeks } = blockTraits(bloque);
  const posicion = semanas.indexOf(semanaEnCurso) + 1;
  /* La duración prevista solo manda mientras el bloque está ABIERTO: uno
     cerrado ya tiene final de verdad, y contra eso se cuenta. */
  const contraPrevisto = abierto && plannedWeeks !== null;
  return {
    bloque,
    restantes: contraPrevisto ? plannedWeeks - posicion : semanas[semanas.length - 1] - semanaEnCurso,
    previstas: plannedWeeks,
    posicion,
    siguiente,
    abierto,
  };
};

/**
 * EL HORIZONTE DE LO ESCRITO: por qué microciclo va, y cuántos hay detrás.
 *
 * ══ Por qué no vale `horizonteDeBloque` para esto ══════════════════════════
 *
 * `horizonteDeBloque` contesta sobre EL BLOQUE, y solo cuando la semana en
 * curso cae dentro de sus semanas montadas. La pregunta de la portada y de la
 * barra es otra y es más simple: **¿hay hoja escrita para la semana que viene?**
 * Alguien que va por la 18 con diez microciclos escritos no tiene bloque en
 * curso que contar —se le acabó— y es exactamente la persona por la que hay que
 * preguntar.
 *
 * ── Por qué se cuenta lo ESCRITO y no lo que falta para un final ───────────
 * Porque un bloque nuestro es abierto (`fraseDeHorizonte` devuelve literalmente
 * «abierto»). El «New block forecast» de Efort funciona porque los suyos tienen
 * duración fija; importarlo tal cual sería inventarse un final. Lo único cierto
 * aquí es cuántos microciclos quedan escritos por delante, y de ahí sale la cola
 * honesta: «sin semana siguiente», no «se le acaba el bloque».
 *
 * ══ Qué recibe ═════════════════════════════════════════════════════════════
 *
 * El ÍNDICE del programa —`{ microcycles: [{ weekNumber }], blocks }`—, que es
 * lo que `trainingSummary` lleva de cada cliente de la cartera. Las funciones de
 * este archivo no necesitan nada más para situar una semana en su bloque, así
 * que la cartera y la ficha usan la misma aritmética sobre distinto volumen de
 * datos, no dos aritméticas.
 *
 * Devuelve `null` cuando no hay nada escrito o no se sabe por dónde va: sin
 * programa la respuesta no es «le falta la semana siguiente», es «no tiene
 * rutina», y eso ya lo dice su alerta.
 *
 * `previstas` solo viene con número si el entrenador previó duración: entonces
 * su barra puede decir «M3 de 4», que no es una deducción sino su plan, dicho.
 */
export const horizonteEscrito = (indice, semanaEnCurso) => {
  if (semanaEnCurso === null || semanaEnCurso === undefined) return null;
  const semanas = (indice?.microcycles || [])
    .map((m) => m.weekNumber)
    .filter((w) => Number.isFinite(w))
    .sort((a, b) => a - b);
  if (semanas.length === 0) return null;

  const horizonte = horizonteDeBloque(indice, semanaEnCurso);
  return {
    /* Por dónde va, en el eje de la persona: la «M18» de la barra. */
    microcicloEnCurso: semanaEnCurso,
    /* Cuántos microciclos hay escritos DESPUÉS del que va. Cero es la cola. */
    escritosDespues: semanas.filter((w) => w > semanaEnCurso).length,
    /* El último escrito: de él sale CUÁNDO se queda sin hoja (`previsionEscrita`). */
    ultimoEscrito: semanas[semanas.length - 1],
    /* Su plan, si lo dijo. Y su sitio dentro del bloque, para poder decir «de 4». */
    previstas: horizonte?.previstas ?? null,
    posicion: horizonte?.posicion ?? null,
  };
};

/**
 * El horizonte DICHO: «va por el microciclo 3 de 4», «le quedan 2 microciclos ·
 * después, Descarga», «abierto».
 *
 * Vivía dentro de `LineaDeBloques`, que es la cabecera del portal del cliente.
 * Desde que el entrenador tiene la suya (`CabeceraDelBloque`), las dos dicen lo
 * mismo del mismo bloque: escrito dos veces se separa a la primera corrección,
 * así que la frase baja aquí y las dos la piden.
 *
 * Devuelve `null` cuando no hay nada cierto que decir: sin semana en curso, o
 * mirando un bloque que no es por el que va la persona —uno cerrado del
 * historial contaba lo del abierto debajo de su nombre, y la línea decía
 * «cerrado · abierto · 3 microciclos»—.
 *
 * Pasarse de lo previsto se dice y no se regaña: la casa no reprocha.
 */
export const fraseDeHorizonte = (program, bloque, semanaEnCurso, { unidad, unidades }) => {
  const horizonte = horizonteDeBloque(program, semanaEnCurso);
  if (!horizonte || horizonte.bloque?.id !== bloque?.id) return null;

  const { restantes, previstas, posicion, siguiente, abierto } = horizonte;

  /*
    ── Un bloque abierto no tiene horizonte… salvo que se le previera uno ─────
    Aquí se contaba lo que le «quedaba» al bloque abierto como si tuviera un
    final al que acercarse. No lo tiene: una rutina se monta y dura hasta que
    hay motivo para cambiarla. Con duración prevista, «va por el 3 de 4» no es
    una deducción: es su plan, dicho.
  */
  if (abierto) {
    if (!previstas) return 'abierto';
    return restantes >= 0
      ? `va por el ${unidad} ${posicion} de ${previstas}`
      : `va por el ${unidad} ${posicion} · ${previstas} previstos`;
  }

  const cuanto =
    restantes === 0
      ? `acaba este ${unidad}`
      : restantes === 1
        ? `le queda 1 ${unidad}`
        : `le quedan ${restantes} ${unidades}`;
  return [cuanto, siguiente ? `después, ${siguiente.name}` : 'después, nada programado'].join(' · ');
};

/**
 * EL BLOQUE EN EL CALENDARIO: de qué día a qué día fue (o va).
 *
 * ══ Para qué ═══════════════════════════════════════════════════════════════
 *
 * Para dibujar los bloques debajo de las fases, sobre el MISMO eje de fechas
 * (`roadmap/EjeTemporal`). Fase y bloque no se anidan —la fase es la dirección
 * del cuerpo y va por fechas; el bloque es la estructura del entreno y va por
 * microciclos—, así que lo único que hace falta es traducir el segundo al
 * calendario del primero.
 *
 * ══ Por qué NO con `weekStartOfProgramWeek` ════════════════════════════════
 *
 * Esa cuenta —lunes del alta + (N − 1) × 7— supone que el microciclo 1 empieza
 * con el alta, que no hay pausas y que un microciclo mide siete días. En la
 * demo se equivoca en los seis clientes, en cuatro por entre 3 y 21 semanas: el
 * carril de Iván saldría entre febrero y abril cuando entrenó de julio a
 * septiembre. Ver `docs/eje-temporal.md` §1.
 *
 * La verdad ya existe: cada microciclo guarda su fecha (`micro.date`, la pone
 * `fechaDelCicloSiguiente` al montarlo, y la usa `anclaDelCiclo`). El bloque
 * empieza el día de su primer microciclo y acaba el día antes de que acabara el
 * último, medido con la secuencia del bloque (`duracionDe`) —siete en un ciclo
 * semanal, lo que dure la vuelta en uno rotativo—.
 *
 * Solo sin fecha —programas viejos— se cae a la cuenta del alta, y se dice con
 * `estimado`, para que el carril lo pinte distinto en vez de afirmarlo.
 *
 * ── Lo previsto ────────────────────────────────────────────────────────────
 * Un bloque abierto con `plannedWeeks` mayor que lo escrito tiene un final
 * PREVISTO: `previstoHasta`. Es su plan, no algo hecho, y se dibuja a trazos.
 *
 * @param opciones `{ cycleType, cyclePattern, startDate }` del cliente. Sin
 *   `cycleType` se toma el del programa.
 * @returns `{ bloque, desde, hasta, previstoHasta, estimado }`, o `null` si el
 *   bloque no tiene microciclos o no hay de dónde sacar una fecha.
 */
export const tramoDelBloque = (program, block, { cycleType = null, cyclePattern = null, startDate = null } = {}) => {
  const semanas = weeksOfBlock(program, block);
  if (semanas.length === 0) return null;

  const tipo = cycleType || program?.cycleType || 'weekly';
  const micros = new Map((program?.microcycles || []).map((m) => [m.weekNumber, m]));
  const primero = micros.get(semanas[0]);
  const ultimo = micros.get(semanas[semanas.length - 1]);

  let estimado = false;
  const fechaDe = (micro) => {
    const propia = toISODate(micro?.date);
    if (propia) return propia;
    estimado = true;
    return startDate ? weekStartOfProgramWeek(startDate, micro?.weekNumber) : null;
  };

  const desde = fechaDe(primero);
  const inicioDelUltimo = fechaDe(ultimo);
  if (!desde || !inicioDelUltimo) return null;

  const microciclo = microcicloDelBloque(program, block, { cycleType: tipo, cyclePattern });
  const hasta = addDays(inicioDelUltimo, duracionDe(microciclo) - 1);

  const abierto = block?.toWeek === null || block?.toWeek === undefined;
  const { plannedWeeks } = blockTraits(block);
  const faltan = abierto && plannedWeeks ? plannedWeeks - semanas.length : 0;
  /* Cada semana que falta mide lo que dura la secuencia del bloque. Medía UNA
     tanda del patrón —3 días en un 2-1 con seis hojas, no 9— y el fin previsto
     de un bloque rotativo salía unas tres veces más cerca. */
  const previstoHasta = faltan > 0 ? addDays(hasta, faltan * duracionDe(microciclo)) : null;

  return { bloque: block, desde, hasta, previstoHasta, estimado };
};

/**
 * EL SPLIT DE UN BLOQUE, como se enseña en la línea de tiempo (24 sep 2026).
 *
 * El nombre lo pone `nombreDelSplit` (domain/split): el del entrenador si lo
 * escribió (`split`, en el bloque) y, si no, el que se deduce de sus hojas
 * —«Torso / Pierna · 4 días», «Push Pull Legs 2-1»—. `datos` sigue diciendo
 * lo literal, para el rótulo del ratón: cuántos entrenos y qué hojas.
 *
 * Límite conocido: el microciclo no guarda versiones dentro de un bloque. Si
 * se cambió a mitad, esto describe el último.
 *
 * @param client lo que hace falta para derivar el microciclo si no está
 *   guardado: `{ cycleType, cyclePattern }`.
 * @returns `{ nombre, datos, dias, texto, deducido, corto }`: `nombre` el del
 *   entrenador o `null`; `datos` lo literal; `texto` el nombre entero y
 *   `corto` el de las filas estrechas. `null` sin entrenos ni nombre.
 */
export const splitDelBloque = (program, block, client = null) => {
  const microciclo = microcicloDelBloque(program, block, client);
  const entrenos = entrenosDe(microciclo);
  const nombre = blockTraits(block).split;
  if (entrenos === 0 && !nombre) return null;
  const hojas = [];
  for (const d of microciclo?.dias || []) if (!d.descanso && d.hoja && !hojas.includes(d.hoja)) hojas.push(d.hoja);
  const dias =
    microciclo?.tipo === 'rotativo' && duracionDe(microciclo) !== 7
      ? `${entrenos} de cada ${duracionDe(microciclo)} días`
      : `${entrenos} ${entrenos === 1 ? 'día' : 'días'}`;
  const datos = entrenos > 0 ? [dias, hojas.join(', ')].filter(Boolean).join(' · ') : null;
  const conSeries = block ? blockPlan(program, block).sessions : [];
  return {
    nombre,
    datos,
    dias: entrenos > 0 ? dias : null,
    texto: nombreDelSplit(block, conSeries, microciclo),
    /* El que saldría sin el nombre del entrenador: el ejemplo de su campo. */
    deducido: nombreDelSplit({ ...block, split: null }, conSeries, microciclo),
    corto: nombreCortoDelSplit(block, conSeries, microciclo),
  };
};

/**
 * QUÉ MICROCICLO DE UN BLOQUE CAE EN UNA SEMANA DEL CALENDARIO.
 *
 * La regla vive aquí y en ningún otro sitio: la usan el creador del plan y
 * quien tenga que nombrar «el microciclo de esta semana».
 *
 *   · Semanal (siete días): el que contiene el JUEVES. Muchos microciclos
 *     semanales no empiezan en lunes (80 de 153 en la copia del 22 sep), así
 *     que una semana natural toca dos; se nombra uno solo, el del jueves, igual
 *     que la fase y el bloque de una semana.
 *   · Rotativo (una vuelta de otra longitud): TODOS los que tocan la semana,
 *     porque en diez días caben dos vueltas en siete. Se dice «M3–M4».
 *
 * @param desde  el día en que empieza el primer microciclo del bloque.
 * @param vuelta los días que dura un microciclo (`duracionDe`).
 * @param total  cuántos microciclos tiene (escritos o previstos).
 * @param lunes  la semana.
 * @returns `{ primero, ultimo }` (1-based), o `null` si la semana no toca el
 *   bloque.
 */
export const microciclosDeLaSemana = ({ desde, vuelta = 7, total = null } = {}, lunes) => {
  const inicio = toISODate(desde);
  const l = toISODate(lunes);
  const largo = Math.max(1, Math.trunc(Number(vuelta)) || 7);
  if (!inicio || !l) return null;
  const tope = total === null || total === undefined ? Infinity : total;
  const numero = (dia) => Math.floor((daysBetween(inicio, dia) ?? 0) / largo) + 1;
  const dentro = (n) => n >= 1 && n <= tope;

  if (largo === 7) {
    const n = numero(addDays(l, 3));
    return dentro(n) && addDays(l, 3) >= inicio ? { primero: n, ultimo: n } : null;
  }
  const a = Math.max(1, numero(l < inicio ? inicio : l));
  const b = Math.min(tope, numero(addDays(l, 6)));
  if (addDays(l, 6) < inicio || a > b) return null;
  return { primero: a, ultimo: b };
};

/* ══════════════════════════════════════════════════════════════════════════
   EL MICROCICLO DEL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   La estructura —qué se entrena cada día y cuándo se descansa— es del BLOQUE:
   cambiarla en uno no cambia cómo se leen los anteriores. Se guarda en
   `block.microciclo` (ver «El microciclo como secuencia» en `training.js`).

   ══ Mientras no esté guardado, se DERIVA de lo de siempre ════════════════════
   · Semanal: el reparto del bloque —el del programa si es el abierto, su copia
     congelada si está cerrado—, día a día.
   · Rotativo: `rotatingSlots` con el patrón de la ficha del cliente y las hojas
     del bloque, que es exactamente lo que se pintaba hasta ahora.

   Así los lectores pasan a preguntar aquí sin que cambie nada visible, y el día
   que se guarde (`materializarMicrociclos`), lo guardado es idéntico a lo que ya
   se leía. Ver `docs/estudio-microciclo-secuencia.md`.

   @param client `{ cycleType, cyclePattern }`: solo cuentan para derivar.
*/
export const microcicloDelBloque = (program, block, client = null) =>
  normalizaMicrociclo(block?.microciclo) || derivarMicrociclo(program, block, client);

/** El que se lee sin nada guardado: del reparto o del patrón del cliente. */
export const derivarMicrociclo = (program, block, client = null) => {
  if ((client?.cycleType || 'weekly') !== 'rotating') {
    return { tipo: 'semanal', dias: secuenciaSemanal(block ? structureOfBlock(program, block).weeklySplit : {}) };
  }

  const sesiones = block ? blockPlan(program, block).sessions : [];
  return {
    tipo: 'rotativo',
    dias: rotatingSlots(client?.cyclePattern, sesiones).map((slot) =>
      slot.rest ? { descanso: true } : { hoja: sesiones.length > 0 ? slot.name || null : null }
    ),
  };
};

/** El microciclo del bloque que corre. */
export const microcicloEnCurso = (program, client = null) =>
  microcicloDelBloque(program, currentBlock(program), client);

/** El microciclo del bloque al que pertenece la semana `weekNumber`. */
export const microcicloDeLaSemana = (program, weekNumber, client = null) =>
  microcicloDelBloque(program, blockOfWeek(program, weekNumber), client);

/**
 * CUÁNTAS SESIONES PIDE CADA HOJA EN UNA SEMANA: las veces que sale en la
 * secuencia de su bloque, y una como mínimo.
 *
 * Una hoja que cae el lunes y el jueves pide dos sesiones; contarla una vez
 * daba el microciclo por cerrado con la mitad hecha. El «como mínimo una» es
 * para las hojas que no caen en ningún día —un semanal sin días asignados, o
 * una hoja en «Sin día»—: siguen siendo del plan y se entrenan, como hasta
 * ahora.
 *
 * La i-ésima sesión de una hoja, por fecha, cubre su i-ésima aparición; las que
 * pasen de ahí no cubren nada. Ver `docs/estudio-microciclo-secuencia.md` §5.
 *
 * @returns {(dayName: string) => number}
 */
export const vecesDeLaHoja = (program, weekNumber, client = null) => {
  const veces = vecesDeCadaHoja(microcicloDeLaSemana(program, weekNumber, client));
  return (dayName) => Math.max(1, veces.get(dayName) || 0);
};

/** Cuántas sesiones lleva cada hoja en un microciclo. */
const sesionesPorHoja = (sesiones) => {
  const cuenta = new Map();
  for (const s of sesiones) cuenta.set(s.dayName, (cuenta.get(s.dayName) || 0) + 1);
  return cuenta;
};

/**
 * Cuándo nace el microciclo que va después de `previous`: su fecha más lo que
 * dura la secuencia de SU bloque. Sin fecha anterior —datos viejos—, hoy.
 *
 * Sustituye a `nextCycleDate`, que medía con el patrón del cliente y los `days`
 * del microciclo anterior. Difiere solo si esos `days` arrastran hojas
 * retiradas con kilos antiguos (`proyectarPlanEnDias`): entonces el siguiente
 * nace unos días antes. Lo ya fechado no se mueve.
 */
export const fechaDelCicloSiguiente = (program, previous, client = null) => {
  const bloque = previous ? blockOfWeek(program, previous.weekNumber) : currentBlock(program);
  return addDays(previous?.date, duracionDe(microcicloDelBloque(program, bloque, client))) || todayISO();
};

/**
 * GUARDA EN CADA BLOQUE LA SECUENCIA QUE YA SE LEE.
 *
 * Pura, idempotente y perezosa, como `migrateBlockPlans`: los bloques que ya la
 * tienen no se tocan, y si todos la tienen devuelve el mismo programa. No toca
 * `microcycles`, así que fechas y analítica no pueden moverse.
 *
 * La llama `applyPlan` antes de cada escritura del plan (también la de la tira
 * del microciclo, `ponerMicrocicloDelBloque`), con la ficha del cliente de
 * ANTES del cambio. Sin ficha no se llama: se guardaría un semanal a quien es
 * rotativo.
 */
export const materializarMicrociclos = (program, client = null) => {
  const lista = blocksOf(program);
  if (lista.every((b) => normalizaMicrociclo(b.microciclo))) return program;
  return {
    ...program,
    blocks: lista.map((b) =>
      normalizaMicrociclo(b.microciclo) ? b : { ...b, microciclo: microcicloDelBloque(program, b, client) }
    ),
  };
};

/** Todos los bloques del programa en el calendario, los que tienen microciclos. */
export const tramosDeLosBloques = (program, opciones = {}) =>
  blocksOf(program)
    .map((b) => tramoDelBloque(program, b, opciones))
    .filter(Boolean);

/* ── Lo que hacía la lectura, ahora al escribir ──────────────────────────────
   Derivado en cada lectura, el rotativo seguía solo a las hojas y al patrón del
   cliente, y el semanal al reparto del programa. Guardado, eso hay que hacerlo
   al escribir, o la secuencia se quedaría con las hojas de cuando se guardó.
   `seguirALasHojas` es ese seguimiento, con las reglas de la tira (§5 del
   estudio): lo generado se regenera y lo retocado solo pierde lo que se quita. */

const igualQue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const conMicrociclo = (program, blockId, microciclo) => ({
  ...program,
  blocks: blocksOf(program).map((b) => (b.id === blockId ? { ...b, microciclo } : b)),
});
const hojasDelBloque = (program, block) => blockPlan(program, block).sessions.map((s) => s.dayName);

/** La cadena del patrón del cliente, con la que se derivaba su rotativo. */
const cadenaDelCliente = (client) => {
  if (client?.cycleType !== 'rotating') return [];
  const patron = normalizePattern(client.cyclePattern);
  return [`${patron.train}-${patron.rest}`];
};

/**
 * TRAS UNA ESCRITURA DEL PLAN, LA SECUENCIA SIGUE A LAS HOJAS.
 *
 * `antes` ya tiene todas sus secuencias guardadas; `despues` es lo que ha
 * dejado la escritura. Los bloques nuevos —los abre el Compositor— guardan la
 * suya, derivada de cómo ha quedado el programa: el reparto que se le ha dado o
 * el patrón del cliente con sus hojas. En los demás, `seguirAlPlan`: el
 * rotativo que sigue siendo lo que da el generador se regenera con sus hojas
 * nuevas, y en el resto los días de una hoja quitada pasan a descanso.
 *
 * Una secuencia que la propia escritura ha cambiado no se toca: es la que se
 * quería (renombrar ya la deja con el nombre nuevo, ver `renameBlockSessionIn`).
 */
export const seguirALasHojas = (antes, despues, client = null) => {
  const previos = new Map(blocksOf(antes).map((b) => [b.id, b]));
  const guardado = materializarMicrociclos(despues, client);
  let cambia = guardado !== despues;
  const blocks = blocksOf(guardado).map((b) => {
    const previo = previos.get(b.id);
    const microciclo = normalizaMicrociclo(b.microciclo);
    if (!previo || previo.microciclo !== b.microciclo || !microciclo) return b;
    const nuevo = seguirAlPlan(
      microciclo,
      hojasDelBloque(antes, previo),
      hojasDelBloque(guardado, b),
      cadenaDelCliente(client)
    );
    if (nuevo === microciclo) return b;
    cambia = true;
    return { ...b, microciclo: nuevo };
  });
  return cambia ? { ...guardado, blocks } : despues;
};

/**
 * LA SECUENCIA DE UN BLOQUE, ESCRITA ENTERA: lo que guarda cada gesto de la tira
 * del microciclo. Se sanea al entrar (`normalizaMicrociclo`); si no se puede
 * leer, o no cambia nada, devuelve el mismo programa.
 */
export const ponerMicrociclo = (program, blockId, microciclo) => {
  const limpio = normalizaMicrociclo(microciclo);
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  if (!limpio || !bloque || igualQue(normalizaMicrociclo(bloque.microciclo), limpio)) return program;
  return conMicrociclo(program, blockId, limpio);
};

/**
 * `weekly_split`, COPIA DEL BLOQUE ABIERTO. El único sitio que la escribe
 * mientras ese bloque tenga su semanal guardado: lo llama `applyWorkout` tras
 * cada escritura.
 *
 * Se sigue guardando para quien todavía lee el reparto —la app en caché de un
 * teléfono, y los lectores de F3—; se retira cuando no quede ninguno. Si ya dice
 * lo mismo, no se toca: un día puede decir «» o «Descanso» y los dos son
 * descanso.
 */
export const conRepartoDelAbierto = (program) => {
  const microciclo = normalizaMicrociclo(currentBlock(program)?.microciclo);
  if (microciclo?.tipo !== 'semanal') return program;
  /* Un día de entreno sin hoja no cabe en un reparto: se copia como descanso. */
  const dias = microciclo.dias.map((d) => (d.hoja ? d : { descanso: true }));
  const previo = program?.weeklySplit || {};
  if (igualQue(secuenciaSemanal(previo), dias)) return program;
  const weeklySplit = Object.fromEntries(
    WEEK_DAYS.map((dia, i) => {
      const { hoja } = dias[i];
      if (!hoja) return [dia, previo[dia] !== undefined && isRestDay(previo[dia]) ? previo[dia] : 'Descanso'];
      return [dia, String(previo[dia] ?? '').trim() === hoja ? previo[dia] : hoja];
    })
  );
  return { ...program, weeklySplit };
};

/* ══════════════════════════════════════════════════════════════════════════
   LA BITÁCORA DEL BLOQUE
   ══════════════════════════════════════════════════════════════════════════

   ══ La pregunta ═══════════════════════════════════════════════════════════
   «Si toco el volumen de UNA semana del bloque, ¿qué pasa?»

   La respuesta del producto es: sigue siendo el mismo bloque. Un bloque es una
   estructura y una estructura aguanta retoques —subir una serie de espalda en
   la semana 3 porque llegó fresco— sin dejar de ser la misma. Abrir un bloque
   nuevo es una decisión, no una consecuencia; se hace a mano, en el compositor
   (`Compositor.jsx`).

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
  /* Cambiar el reparto de las series, no cuántas hay: «4×6-8 → 1×12, 3×6-8».
     No es el de arriba con otro texto —ahí la cifra sube o baja y eso se lee de
     un vistazo; aquí lo que cambia es la forma del ejercicio. */
  ESQUEMA: 'esquema',
  HOJA_MAS: 'hoja-mas',
  HOJA_MENOS: 'hoja-menos',
  PLANTILLA: 'plantilla',
  /* Un ejercicio cambiado por otro en su sitio, con la misma pauta: «Press
     banca → Remo». Sin su verbo, la bitácora no diría nada. */
  NOMBRE: 'nombre',
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
    case BLOCK_CHANGE.ESQUEMA:
      /* Sin «series» al final: el esquema ya lo lleva escrito en los dos lados
         («1×12, 3×6-8»), y repetirlo diría «3×6-8 series». */
      return `${que}: ${entry.de} → ${entry.a}`;
    case BLOCK_CHANGE.NOMBRE:
      return `${entry.de} → ${entry.a}`;
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

/*
 * ══ «ES INTENCIONADO»: EL AVISO DE UNA EXCEPCIÓN, DADO POR VISTO (23 sep) ═══
 *
 * La tarjeta de una hoja marca con «✱ M2» los microciclos donde se aparta del
 * bloque. Es verdad, pero no tiene por qué quedarse para siempre: el dueño
 * quiere poder decir «ya lo sé, es a propósito» y que la marca se vaya.
 *
 * Lo que se guarda NO es un «sí» para siempre sino la FIRMA de lo que difería
 * cuando se dio por visto: `block.excepcionesVistas[hoja][microciclo] = firma`.
 * Si después se cambia algo más en ese microciclo, la firma ya no coincide y la
 * marca vuelve a salir sola — es otra diferencia, y esa nadie la ha visto.
 *
 * Vive en el bloque (el programa, en la base) y no en el navegador: el mismo
 * entrenador lo ve igual desde el teléfono y desde el PC.
 */

/** Un resumen corto y estable de un texto (djb2). No es criptografía: basta
    con que dos contenidos distintos casi nunca den lo mismo. */
const firmaCorta = (texto) => {
  let h = 5381;
  for (let i = 0; i < texto.length; i += 1) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * La firma de lo que difiere en esa hoja y ese microciclo: las excepciones
 * vigentes con lo que ponen (el ejercicio entero, series incluidas), sin su id
 * ni su hora, que no cambian lo que se ve. `null` si no difiere en nada.
 */
export const firmaDeLaExcepcion = (block, weekNumber, dayName) => {
  const vigentes = overridesAt(block, weekNumber, dayName);
  if (vigentes.length === 0) return null;
  return firmaCorta(
    JSON.stringify(
      vigentes.map((o) => [o.targetId ?? null, o.exercise ?? null, o.sobre ?? null, o.index ?? null])
    )
  );
};

/** ¿Está dado por visto, y sigue siendo lo mismo que se vio? */
export const excepcionVista = (block, weekNumber, dayName) => {
  const firma = firmaDeLaExcepcion(block, weekNumber, dayName);
  return firma !== null && block?.excepcionesVistas?.[dayName]?.[weekNumber] === firma;
};

/** Qué difiere, en una línea: «Press inclinado en lugar de Press banca · − Fondos». */
export const queDifiere = (block, weekNumber, dayName) =>
  overridesAt(block, weekNumber, dayName).map(describeOverride).join(' · ');

/**
 * Da por vistas las excepciones de esa hoja en esos microciclos, con la firma
 * de hoy. Las que ya no difieren en nada se limpian de paso.
 */
export const marcarExcepcionVistaIn = (program, blockId, dayName, weeks = []) => ({
  ...program,
  blocks: blocksOf(program).map((b) => {
    if (b.id !== blockId) return b;
    const deLaHoja = { ...(b.excepcionesVistas?.[dayName] || {}) };
    for (const w of weeks) {
      const firma = firmaDeLaExcepcion(b, w, dayName);
      if (firma === null) delete deLaHoja[w];
      else deLaHoja[w] = firma;
    }
    return { ...b, excepcionesVistas: { ...(b.excepcionesVistas || {}), [dayName]: deLaHoja } };
  }),
});

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

/**
 * GUARDA EN LOS `days` LO QUE `resolvedMicrocycles` YA ENSEÑA.
 *
 * ══ El fallo que cierra ════════════════════════════════════════════════════
 *
 * `resolvedMicrocycles` es una proyección para LEER: cambia los `days` de cada
 * microciclo por las hojas del bloque, y con ellas cambian los identificadores
 * de ejercicio, que en el plan del bloque son uno solo para todas sus semanas.
 *
 * Pero el cliente no escribe el programa: escribe por `log_session_set`
 * (migración 0014), y esa función busca el ejercicio **únicamente dentro de
 * `microcycles[].days[]`**. O sea, la pantalla trabaja con los ids del bloque y
 * el servidor solo conoce los del microciclo. Coinciden en la semana de la que
 * se leyó el plan al migrar; en todas las demás, no, y entonces cada número que
 * anota esa persona se rechaza con:
 *
 *     El ejercicio ex_… no está programado en Lower A
 *
 * Es el mismo agujero que cerró la 0085 —dos verdades sobre el mismo
 * ejercicio— abierto otra vez por una puerta nueva. Y se ve igual de mal desde
 * dentro: el número aparece en pantalla (`withSessionSet` lo acepta en local),
 * no vuelve tras recargar, y el rechazo es `P0001`, que `esRechazoDefinitivo`
 * ni siquiera reintenta. Un entrenamiento entero, perdido en silencio.
 *
 * ══ Por qué se arregla proyectando y no en el servidor ═════════════════════
 *
 * La alternativa era enseñarle el bloque a `log_session_set`: resolver en
 * plpgsql las hojas y sus excepciones. Eso es duplicar `applyOverrides` en un
 * segundo idioma, y una regla del plan escrita dos veces se desincroniza sola.
 *
 * Aquí no hay lógica nueva: `days` pasa a ser la PROYECCIÓN de lo que ya se
 * está enseñando, escrita por quien sí puede escribirla —el entrenador—, y el
 * servidor sigue mirando el único sitio que conoce. La verdad sigue estando en
 * el bloque; `days` es su copia para el camino de escritura y para el histórico
 * viejo que aún vive ahí (`legacySession`), y se retirará el día que
 * `log_session_set` lea el bloque.
 *
 * ── Las hojas retiradas se conservan ───────────────────────────────────────
 * Una hoja que el plan ya no tiene desaparece de la lectura, pero dentro de sus
 * `days` puede haber sesiones o kilos de cuando sí existía. La proyección no
 * decide por nadie: las deja donde están, en todos los microciclos. El objetivo
 * es que no falte nada que el servidor necesite, no adelgazar la fila.
 *
 * Solo salen por un gesto: quitar esa hoja del bloque, que la suelta de los
 * microciclos donde no se entrenó en el mismo paso (`soltarHojaSinEntrenar`).
 * Renombrar no deja retiradas: se lleva el día de la tira (`renameBlockSessionIn`).
 */
export const proyectarPlanEnDias = (program) => {
  const microcycles = program?.microcycles || [];
  if (!blocksOf(program).some(hasBlockPlan)) return program;

  const resueltos = resolvedMicrocycles(program);

  return {
    ...program,
    microcycles: microcycles.map((micro, i) => {
      const resuelto = resueltos[i];
      /* Sin plan en su bloque, `resolvedMicrocycles` devuelve el mismo objeto:
         ese microciclo se queda exactamente como estaba. */
      if (resuelto === micro) return micro;

      const enElPlan = new Set((resuelto.days || []).map((d) => d.dayName));
      const retiradas = (micro.days || []).filter((d) => !enElPlan.has(d.dayName));

      return retiradas.length === 0
        ? resuelto
        : { ...resuelto, days: [...(resuelto.days || []), ...retiradas] };
    }),
  };
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
 * «Copia de "Pull A"»: la hoja entera como hoja NUEVA del bloque, al final.
 *
 * Era una hoja en blanco y luego un alta por ejercicio —N + 1 escrituras con
 * sus N + 1 guardados— y se quedaba por el camino lo que no es un ejercicio:
 * tu indicación, el calentamiento propio y la nota de cada ejercicio. Aquí es
 * una escritura, y la copia es la de `copiaDeLaHoja`: todo lo que es plan, con
 * ids nuevos y sin lo registrado.
 *
 * Se copia la LÍNEA BASE de la hoja, no lo que enseñe un microciclo concreto:
 * una excepción de Pull A («solo M3, press inclinado») es de sus semanas y de
 * esa hoja, y convertirla en el plan fijo de Pull B sería inventarle una
 * decisión a nadie.
 *
 * El nombre lo pone quien llama (`freeSheetName`). Si está cogido, vacío, o no
 * existe la hoja de origen, devuelve el mismo programa: no hay a medias.
 */
export const duplicateBlockSessionIn = (program, blockId, dayName, nombreNuevo) => {
  const nombre = String(nombreNuevo || '').trim();
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  const origen = blockSessionOf(bloque, dayName);
  if (!nombre || !origen || blockSessionOf(bloque, nombre)) return program;
  return {
    ...program,
    blocks: blocksOf(program).map((b) =>
      b.id !== blockId ? b : { ...b, sessions: [...blockSessionsOf(b), copiaDeLaHoja(origen, nombre)] }
    ),
  };
};

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

/**
 * Le cambia el nombre. Las excepciones lo siguen: son de esa hoja.
 *
 * ── Y lo entrenado también, dentro de su bloque ─────────────────────────────
 * Las sesiones de la hoja y su día en cada microciclo del bloque pasan al
 * nombre nuevo en la misma escritura. Antes se quedaban con el viejo: el
 * historial se partía en dos nombres, el viejo se quedaba como hoja retirada
 * donde se había entrenado y sus sesiones dejaban de contar como hechas (22
 * sep: «TORSO» contra «TORSO A»). El día se renombra con sus kilos heredados
 * dentro, que `resolvedMicrocycles` casa por nombre.
 *
 * Fuera del bloque no se toca nada: en otro bloque esa hoja es otra.
 *
 * Quien está entrenando esa hoja en el teléfono manda sus series con el
 * nombre que cargó, y el servidor las rechazaría. Por eso la interfaz no deja
 * renombrar mientras haya una en curso: ver `sesionEnCursoDeLaHoja`.
 */
export const renameBlockSessionIn = (program, blockId, de, a) => {
  const nombre = String(a || '').trim();
  if (!nombre || nombre === de) return program;
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  const semanas = new Set(bloque ? weeksOfBlock(program, bloque) : []);
  const renombra = (x) => (x.dayName === de ? { ...x, dayName: nombre } : x);
  const tiene = (lista) => (lista || []).some((x) => x.dayName === de);
  return {
    ...program,
    blocks: blocksOf(program).map((b) =>
      b.id !== blockId
        ? b
        : {
            ...b,
            sessions: blockSessionsOf(b).map(renombra),
            overrides: blockOverridesOf(b).map(renombra),
            /* Y los días de la tira en los que cae: la hoja es la misma. */
            ...(normalizaMicrociclo(b.microciclo)?.dias.some((d) => d.hoja === de)
              ? { microciclo: renombrarEnMicrociclo(normalizaMicrociclo(b.microciclo), de, nombre) }
              : {}),
          }
    ),
    microcycles: (program?.microcycles || []).map((m) =>
      !semanas.has(m.weekNumber) || !(tiene(m.days) || tiene(m.sessions))
        ? m
        : {
            ...m,
            days: (m.days || []).map(renombra),
            ...(m.sessions ? { sessions: m.sessions.map(renombra) } : {}),
          }
    ),
  };
};

/** Una sesión abierta que empezó hace menos de esto se está entrenando. */
const EN_CURSO_MS = 24 * 60 * 60 * 1000;

/**
 * LA SESIÓN DE ESA HOJA QUE ALGUIEN ESTÁ ENTRENANDO AHORA, o `null`.
 *
 * El teléfono toma el nombre de la hoja al abrir la sesión y no lo vuelve a
 * leer: cada serie viaja con él a `log_session_set`, que exige que ese día
 * exista en el microciclo. Renombrar a mitad de sesión le dejaría la pantalla
 * sin hoja y le haría rechazar lo que queda en la cola.
 *
 * «En curso» es abierta (`sesionAbierta`: algo anotado y sin cerrar) y
 * empezada en las últimas 24 horas. Una que se dejó a medias hace días no
 * bloquea para siempre: esa ya no la tiene nadie en la mano.
 */
export const sesionEnCursoDeLaHoja = (program, blockId, dayName, ahora = Date.now()) => {
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  if (!bloque) return null;
  const semanas = new Set(weeksOfBlock(program, bloque));
  for (const micro of program?.microcycles || []) {
    if (!semanas.has(micro.weekNumber)) continue;
    for (const sesion of sessionsOf(micro)) {
      if (sesion.dayName !== dayName || !sesionAbierta(sesion)) continue;
      const desde = Date.parse(sesion.startedAt || sesion.date || '');
      if (Number.isFinite(desde) && ahora - desde < EN_CURSO_MS) return sesion;
    }
  }
  return null;
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

/**
 * La lista entera de una hoja, de una vez.
 *
 * ── Por qué hace falta además de las de una en una ─────────────────────────
 * Porque pegar una hoja ENCIMA de otra es una sola decisión —«este lunes pasa a
 * ser este otro»— y hacerlo con las de arriba serían N bajas y M altas: la
 * pantalla parpadearía por los pasos intermedios, la bitácora contaría catorce
 * cambios donde hubo uno, y el «Deshacer» tendría que rehacer catorce
 * escrituras en el orden correcto. Aquí el inverso es la lista de antes, que es
 * lo que hace que pegar encima se pueda deshacer con un clic.
 */
export const setBlockExercisesIn = (program, blockId, dayName, exercises) =>
  conEjercicios(program, blockId, dayName, () => exercises);

export const removeBlockExerciseIn = (program, blockId, dayName, exerciseId) =>
  conEjercicios(program, blockId, dayName, (lista) => lista.filter((ex) => ex.id !== exerciseId));

/** Lo devuelve a su sitio: es lo que deshace el quitar. */
export const restoreBlockExerciseIn = (program, blockId, dayName, exercise, index) =>
  conEjercicios(program, blockId, dayName, (lista) => [
    ...lista.slice(0, index),
    exercise,
    ...lista.slice(index),
  ]);

/**
 * Cambia campos sueltos de un ejercicio del bloque. Es la puerta de la
 * gramática de serie —enlazado, técnica, descanso—, que es plan y por tanto
 * vive aquí y no en el microciclo.
 */
export const updateBlockExerciseIn = (program, blockId, dayName, exerciseId, fn) =>
  conEjercicios(program, blockId, dayName, (lista) =>
    lista.map((ex) => (ex.id === exerciseId ? fn(ex) : ex))
  );

export const moveBlockExerciseIn = (program, blockId, dayName, from, to) =>
  conEjercicios(program, blockId, dayName, (lista) => {
    if (from < 0 || to < 0 || from >= lista.length || to >= lista.length || from === to) return lista;
    const copia = [...lista];
    const [suyo] = copia.splice(from, 1);
    copia.splice(to, 0, suyo);
    return copia;
  });

/*
  ── CAMBIAR UN EJERCICIO POR OTRO, CON SU ESTRUCTURA ────────────────────────
  Para poner otro ejercicio en el sitio de uno había que quitarlo y meter el
  nuevo, y con el viejo se iban sus series, sus rangos, el RIR, los remates, la
  nota y la superserie: había que volver a montarlo todo a mano. Ahora se pulsa
  el nombre, se escribe el otro y la estructura se queda.

  ── Es OTRO ejercicio, y por eso lleva id nuevo ─────────────────────────────
  «Su progreso se pierde porque es otro ejercicio.» Lo que se hereda es la
  PAUTA, no la historia: el ejercicio nuevo estrena identificador, igual que el
  de una excepción (ver `overridePlanExerciseIn`). Con el id de antes, lo que
  se hubiera anotado del viejo —una sesión a medias esta semana— se sumaría al
  nuevo, y el registro mezclaría dos ejercicios bajo un nombre.

  La única salvedad son las mayúsculas: «press banca» → «Press banca» es el
  mismo ejercicio bien escrito, y conserva su id.

  ── Por qué no vale un nombre repetido ──────────────────────────────────────
  En esta casa un ejercicio de una hoja se localiza por su NOMBRE (ver «Por
  NOMBRE, y resuelto aquí dentro» en `useWorkout`): dos «Press banca» en la
  misma hoja serían el mismo para cada manejador, y tocar uno escribiría en el
  otro. Se compara como compara toda la casa, sin espacios ni mayúsculas.

  ── Lo ya registrado no se toca ─────────────────────────────────────────────
  Las sesiones guardan su propia foto del ejercicio (`entries[]`, con su id y
  su nombre) y esto no la reescribe: lo que se hizo, se hizo con el de antes.
*/

const claveDeNombre = (n) => String(n || '').trim().toLowerCase();

/** Por qué no se puede poner ese nombre: `'vacio'`, `'repetido'` o `null` si vale. */
export const porQueNoSeRenombra = (exercises = [], exerciseId, nombre) => {
  const clave = claveDeNombre(nombre);
  if (!clave) return 'vacio';
  return exercises.some((ex) => ex.id !== exerciseId && claveDeNombre(ex.name) === clave) ? 'repetido' : null;
};

/**
 * El músculo del ejercicio nuevo, si está en la biblioteca: cambiar «Press
 * banca» por «Remo con barra» y dejarle «Pecho» contaría su volumen en el grupo
 * equivocado. `null` si el nombre no está: entonces se queda el que tenía.
 */
export const musculoDelNombre = (library = [], nombre) => {
  const clave = claveDeNombre(nombre);
  return (library || []).find((item) => claveDeNombre(item?.name) === clave)?.muscle || null;
};

/** La frase del rechazo, para decirla donde se elige el ejercicio. */
export const avisoDeRenombrar = (motivo, nombre = '') =>
  motivo === 'vacio'
    ? 'Un ejercicio necesita nombre.'
    : motivo === 'repetido'
      ? `Ya hay un «${String(nombre).trim()}» en esta hoja: elige otro.`
      : '';

/** ¿Pasa a ser otro ejercicio, o es el mismo con las mayúsculas corregidas? */
const esOtroEjercicio = (antes, nombre) => claveDeNombre(antes) !== claveDeNombre(nombre);

/**
 * Cambia un ejercicio de una lista por otro, con su estructura.
 * Devuelve la MISMA lista si el nombre no vale o no cambia nada.
 *
 * Es la escritura del COMPOSITOR, y ahí conserva el id: sus hojas todavía no
 * son el plan de nadie —nada se ha anotado contra esos ids— y mantenerlo es lo
 * que deja al diario del bloque decir «Press banca → Remo» en vez de «fuera» y
 * «entra» (ver `sessionDiff`).
 */
export const renombrarEnLista = (exercises = [], exerciseId, nombre, { muscle = null } = {}) => {
  const suyo = exercises.find((ex) => ex.id === exerciseId);
  if (!suyo || porQueNoSeRenombra(exercises, exerciseId, nombre)) return exercises;
  const limpio = String(nombre).trim();
  const musculo = muscle || suyo.muscle;
  if (limpio === suyo.name && musculo === suyo.muscle) return exercises;
  return exercises.map((ex) => (ex.id === exerciseId ? { ...ex, name: limpio, muscle: musculo } : ex));
};

/**
 * Los ejercicios con los que un nombre de esa hoja no puede coincidir: los del
 * bloque y los que entran por excepción en alguna semana. Los que SUSTITUYEN
 * a este mismo ejercicio no cuentan —nunca conviven con él—.
 */
export const nombresDeLaHoja = (block, dayName, exerciseId = null) => [
  ...(blockSessionOf(block, dayName)?.exercises || []),
  ...blockOverridesOf(block, dayName)
    .filter((o) => o.exercise && (exerciseId === null || o.targetId !== exerciseId))
    .map((o) => o.exercise),
];

/**
 * Cambia un ejercicio del BLOQUE por otro, con su estructura, en una sola
 * escritura.
 *
 * Las excepciones de esa hoja que colgaban de él pasan al nuevo: apuntan a su
 * id, su `sobre` —el «en lugar de X»— dice el nombre nuevo, y si la excepción
 * era el MISMO ejercicio retocado (se llamaba igual: «esta semana, dos series»)
 * pasa a ser el nuevo retocado. Una sustitución de verdad —otro nombre— se
 * queda como está.
 *
 * @param muscle  el músculo nuevo, si cambia; `null` lo deja.
 * @param id      el id del ejercicio nuevo. Lo pone quien llama cuando lo
 *                necesita saber (para seguir enfocándolo en la hoja).
 */
export const renameBlockExerciseIn = (
  program,
  blockId,
  dayName,
  exerciseId,
  nombre,
  { muscle = null, id = null } = {}
) => {
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  const suyo = (blockSessionOf(bloque, dayName)?.exercises || []).find((ex) => ex.id === exerciseId);
  if (!suyo) return program;
  if (porQueNoSeRenombra(nombresDeLaHoja(bloque, dayName, exerciseId), exerciseId, nombre)) return program;

  const limpio = String(nombre).trim();
  const musculo = muscle || suyo.muscle;
  if (limpio === suyo.name && musculo === suyo.muscle) return program;

  const viejo = suyo.name;
  const otro = esOtroEjercicio(viejo, limpio);
  const idNuevo = otro ? id || newId('ex') : exerciseId;
  /* El músculo de una excepción solo sigue al del bloque si era el mismo: si
     alguien le puso otro a propósito, esa decisión es suya. */
  const cambiado = (ex, conId) => ({
    ...ex,
    id: conId,
    name: limpio,
    ...(ex.muscle === suyo.muscle ? { muscle: musculo } : {}),
  });

  return {
    ...program,
    blocks: blocksOf(program).map((b) => {
      if (b.id !== blockId) return b;
      const sessions = blockSessionsOf(b).map((s) =>
        s.dayName !== dayName
          ? s
          : {
              ...s,
              exercises: (s.exercises || []).map((ex) => (ex.id === exerciseId ? cambiado(ex, idNuevo) : ex)),
            }
      );
      if (!Array.isArray(b.overrides)) return { ...b, sessions };
      return {
        ...b,
        sessions,
        overrides: b.overrides.map((o) => {
          if (o.dayName !== dayName || o.targetId !== exerciseId) return o;
          const mismo = Boolean(o.exercise) && o.exercise.name === viejo;
          return {
            ...o,
            targetId: idNuevo,
            ...(o.sobre === viejo ? { sobre: limpio } : {}),
            ...(mismo ? { exercise: cambiado(o.exercise, otro ? newId('ex') : o.exercise.id) } : {}),
          };
        }),
      };
    }),
  };
};

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
        /* Hereda los OBJETIVOS de la última —una serie más de lo mismo— y no su
           remate: la bajada estaba puesta en esa serie, no en «la última que
           haya», y arrastrarla movería una pauta que nadie ha tocado. */
        sets.push({
          kg: '',
          reps: '',
          rir: '',
          targetKg: ultima?.targetKg || '',
          targetReps: ultima?.targetReps || '',
          targetRir: ultima?.targetRir || '',
        });
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

/**
 * EL ESQUEMA ENTERO DE UN EJERCICIO: «1 × 12, 3 × 6-8».
 *
 * Los dos de arriba son este mismo con UN tramo —cuántas series, y qué piden
 * todas—, que es el caso que se da el 90 % de las veces y por eso conserva su
 * casilla. Se quedan porque son las dos escrituras con nombre propio de la
 * rejilla: la de las series lleva su apunte en la bitácora y la de las
 * repeticiones es el verbo que la hoja también usa. Este entra cuando los
 * tramos son más de uno, que es justo lo que no se podía escribir sin salir de
 * la vista. Ver `setsDesdeTramos`.
 */
export const setBlockExerciseSchemeIn = (program, blockId, dayName, exerciseId, tramos) =>
  updateBlockExerciseIn(program, blockId, dayName, exerciseId, (ex) => ({
    ...ex,
    sets: setsDesdeTramos(tramos, ex.sets || []),
  }));

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
 * Cambia lo que es de la HOJA y no de un ejercicio —la indicación del
 * entrenador, su calentamiento propio—, donde esa hoja vive.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 * La indicación se escribía en el día del MICROCICLO, que es donde vivía el
 * plan antes de que subiera al bloque. Con el plan en el bloque eso tenía dos
 * consecuencias, y las dos malas: la hoja se lee del bloque, así que lo
 * escrito no se veía ni al momento; y el microciclo siguiente nacía sin ella,
 * porque su día solo aporta el nombre. Una indicación es plan —«en este día
 * vamos suaves de espalda» vale para todo el bloque—, así que se escribe donde
 * el plan está.
 *
 * @param fn recibe la hoja y devuelve la hoja nueva.
 */
export const updatePlanDayIn = (program, weekNumber, dayName, fn) => {
  const bloque = blockOfWeek(program, weekNumber);
  if (hasBlockPlan(bloque) && blockSessionOf(bloque, dayName)) {
    return updateBlockSessionIn(program, bloque.id, dayName, fn);
  }
  /* Sin plan en el bloque manda el camino de siempre: el día del microciclo. */
  return {
    ...program,
    microcycles: (program?.microcycles || []).map((m) =>
      m.weekNumber !== weekNumber
        ? m
        : { ...m, days: (m.days || []).map((d) => (d.dayName === dayName ? fn(d) : d)) }
    ),
  };
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
 * Lo mismo para VARIOS ejercicios de la hoja, en una sola escritura.
 *
 * Es lo que hace falta para un gesto de la hoja entera —quitar la columna de
 * kilos— sin dejar N pasos en el guardado ni N «Deshacer»: cada ejercicio se
 * escribe donde vive (el bloque o su excepción), igual que de uno en uno.
 */
export const updatePlanExercisesIn = (program, weekNumber, dayName, exerciseIds, fn) =>
  (exerciseIds || []).reduce((p, id) => updatePlanExerciseIn(p, weekNumber, dayName, id, fn), program);

/**
 * Cambia un ejercicio por otro desde la HOJA de un microciclo, donde vive.
 *
 * Del bloque, con `renameBlockExerciseIn` y sus excepciones detrás. De una
 * excepción —un alta o una sustitución de esas semanas—, en la excepción, sin
 * tocar el bloque: el nombre no puede chocar con lo que esa semana enseña.
 * Sin plan en el bloque no hay dónde escribir y no se hace nada.
 */
export const renamePlanExerciseIn = (
  program,
  weekNumber,
  dayName,
  exerciseId,
  nombre,
  { muscle = null, id = null } = {}
) => {
  const { donde, bloque } = wherePlanExercise(program, weekNumber, dayName, exerciseId);
  if (donde === 'bloque') return renameBlockExerciseIn(program, bloque.id, dayName, exerciseId, nombre, { muscle, id });
  if (donde !== 'excepcion') return program;
  const deLaSemana = planOfDay(program, weekNumber, dayName)?.exercises || [];
  if (porQueNoSeRenombra(deLaSemana, exerciseId, nombre)) return program;
  const suyo = deLaSemana.find((ex) => ex.id === exerciseId);
  if (suyo && suyo.name === String(nombre).trim() && (!muscle || muscle === suyo.muscle)) return program;
  /* Otro ejercicio, otro id: lo mismo que en el bloque. */
  const otro = esOtroEjercicio(suyo?.name, nombre);
  return updatePlanExerciseIn(program, weekNumber, dayName, exerciseId, (ex) => ({
    ...ex,
    ...(otro ? { id: id || newId('ex') } : {}),
    name: String(nombre).trim(),
    ...(muscle ? { muscle } : {}),
  }));
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

/**
 * ¿ENTRENA POR SU CUENTA? Quien solo tiene la dieta con nosotros.
 *
 * ══ La avería que lo trajo (21 sep 2026) ═══════════════════════════════════
 *
 * «Un cliente que solo tiene nutrición quiere días de entreno y de descanso.»
 * Las casillas del ciclo sacaban qué días entrena del bloque en curso, y sin
 * servicio de entreno no hay bloque ni pantalla donde decir si su ciclo es
 * semanal o rotativo: los siete días salían de descanso, «Repartir por el
 * entreno» no aparecía y un «2 y 1» no se podía repartir.
 *
 * Así que para esta persona lo dice su entrenador desde la dieta (`AjustesPlan`)
 * y se guarda en su ficha: el tipo de ciclo y el patrón en las MISMAS columnas
 * que usa Entreno —si mañana se le activa el entreno, no hay dos respuestas— y
 * los días de la semana y el arranque del rotativo en `preferences.ciclo`, que
 * es lo que en Entreno pone el bloque. Lo decide el entrenador, no el cliente.
 */
export const entrenaPorSuCuenta = (client) =>
  Boolean(client) && !isServiceOn(clientProtocol(client.preferences), 'training');

/**
 * Su ciclo, saneado al leer: `dias` en el orden de la semana y sin claves
 * inventadas; `inicio` es el día 1 del rotativo, o `null` si no se ha dicho.
 */
export const cicloPropio = (client) => {
  const raw = client?.preferences?.ciclo || {};
  const dias = Array.isArray(raw.dias) ? raw.dias : [];
  return {
    dias: WEEK_DAYS.filter((dia) => dias.includes(dia)),
    inicio: typeof raw.inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.inicio) ? raw.inicio : null,
  };
};

/**
 * LAS CASILLAS DEL CICLO DE UNA PERSONA, en un solo sitio.
 *
 * ══ Estaba escrito dos veces, y ahora hacían falta cinco ═══════════════════
 *
 * El mismo `useMemo` —el bloque en curso, y de él las sesiones o el reparto
 * semanal— vivía copiado en `NutritionModule` y en `ClientDietRoute`: el
 * entrenador y el cliente calculando por su cuenta las casillas que tienen que
 * coincidir. Con la foto del plan guardando ya el reparto del ciclo
 * (`cycleFoto`), los sitios que necesitan estas casillas pasan a ser cinco.
 *
 * Dos copias divergen; cinco es una avería anunciada. Aquí está la regla:
 * quién es esta persona —su tipo de ciclo y su patrón— y qué entrena ahora
 * mismo. Ver `cycleSlots`, que es quien las dibuja.
 */
export const clientCycleSlots = (client, program) => {
  if (entrenaPorSuCuenta(client)) {
    const { dias } = cicloPropio(client);
    return cycleSlots({
      cycleType: client?.cycleType,
      pattern: client?.cyclePattern,
      weeklySplit: Object.fromEntries(dias.map((dia) => [dia, 'Entreno'])),
    });
  }

  return casillasDe(microcicloEnCurso(program, client));
};

/**
 * LA INICIAL DE CADA DÍA. `X` para el miércoles, que es como se escribe en
 * español —`M` dos veces no distingue nada— y es lo que enseña el prototipo.
 */
const INICIAL_DEL_DIA = {
  Lunes: 'L',
  Martes: 'M',
  Miércoles: 'X',
  Jueves: 'J',
  Viernes: 'V',
  Sábado: 'S',
  Domingo: 'D',
};

/**
 * La inicial del día de una FECHA. Misma tabla, otra puerta.
 *
 * Existe porque la fila de siete casillas ya se pinta en dos sitios —la cinta
 * de la dieta y los pesajes de la semana en «Tu revisión»— y cada uno llegaba
 * con lo suyo: el segundo sacaba la letra de `weekdayName(...).charAt(0)` y
 * ponía **M para el martes y M para el miércoles**, que es exactamente el fallo
 * que la tabla de arriba está escrita para evitar. Una tabla y dos lectores.
 */
export const inicialDelDia = (iso) => {
  const dia = new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return INICIAL_DEL_DIA[`${dia.charAt(0).toUpperCase()}${dia.slice(1)}`] || dia.charAt(0).toUpperCase();
};

/**
 * DÓNDE EMPIEZA LA VUELTA: la fecha del microciclo más reciente que tenga una.
 *
 * Es el único ancla que existe, y no es una fecha inventada aquí: la pone el
 * entrenador al montar el ciclo y la aplicación ya la usa para dos cosas de
 * peso —fechar el ciclo siguiente (`nextCycleDate`) y agrupar la analítica—.
 * Se toma el ÚLTIMO y no el primero porque cada ciclo nuevo reancla la cuenta:
 * partiendo del primero, tres meses de vacaciones y bajas se acumulan en la
 * proyección y la semana de esta persona saldría corrida dos días.
 */
const anclaDelCiclo = (program) => {
  const micros = (program?.microcycles || []).filter((m) => m?.date);
  if (micros.length === 0) return null;
  return micros.reduce((a, b) => (b.weekNumber > a.weekNumber ? b : a)).date;
};

/**
 * LA SEMANA DE ESTA PERSONA: los siete días naturales, y qué casilla de su
 * ciclo le toca a cada uno.
 *
 * ══ Por qué existe, y qué ley cambia ═══════════════════════════════════════
 *
 * La dieta del cliente enseñaba sus casillas tal cual: `Lun…Dom` a quien entrena
 * por semanas y **`D1…D9`** a quien lleva un ciclo rotativo. Lo segundo es
 * correcto de modelo y es ilegible de calendario: nadie sabe si hoy es su D4.
 *
 * El 13 de septiembre de 2026 el dueño lo decidió al revés de como estaba
 * escrito: *«aunque se utilicen microciclos y no días, está bien que la app
 * móvil sea semanal, estilo MyFitnessPal»*. O sea que la casilla sigue siendo el
 * modelo —la dieta se reparte por casillas, no por martes— y la SEMANA es cómo
 * se enseña. Esto es la traducción entre las dos, y vive en el dominio porque la
 * preguntan las dos formas de la cinta y ninguna puede contestar distinto.
 *
 * ── La cuenta, y por qué no inventa nada ──────────────────────────────────
 * La misma con la que la aplicación fecha el ciclo siguiente: los ciclos van
 * seguidos desde la fecha del último montado. Un día cae en la casilla
 * `(días desde el ancla) mod (número de casillas)`. Con el ciclo natural no hay
 * nada que traducir: la casilla YA es el día de la semana.
 *
 * ── Cuándo devuelve `null`, y qué hay que hacer entonces ──────────────────
 * Sin fecha de la que partir —programas viejos, o un cliente sin ciclos
 * montados— no se puede colocar la semana en el calendario, y colocarla a ojo
 * sería decirle que hoy le toca una dieta que a lo mejor no es la suya. Quien lo
 * llama se queda con las casillas a secas, que es lo que había.
 *
 * @returns `[{ fecha, key, corto, dia, titulo, esHoy }]`, o `null`.
 *   `key` es la casilla del ciclo (lo que guarda `cycleMap`); `fecha` es lo que
 *   identifica al día, porque en un ciclo de cinco una semana pisa dos veces la
 *   misma casilla y entonces la clave no distingue las dos columnas.
 */
export const semanaDelCliente = (client, program, casillas = [], hoy = todayISO()) => {
  const lunes = weekStart(hoy);
  if (!lunes) return null;

  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  /* Quien entrena por su cuenta no tiene bloque: su tipo es el de su ficha. */
  const rotativo = entrenaPorSuCuenta(client)
    ? (client?.cycleType || 'weekly') === 'rotating'
    : microcicloEnCurso(program, client).tipo === 'rotativo';

  if (!rotativo) {
    return dias.map((fecha) => {
      const dia = claveDelDia(fecha) || WEEK_DAYS[0];
      return {
        fecha,
        key: dia,
        corto: INICIAL_DEL_DIA[dia] || dia.slice(0, 1),
        dia,
        titulo: dia,
        esHoy: fecha === hoy,
      };
    });
  }

  /* Quien entrena por su cuenta no tiene ciclos montados de los que fechar la
     vuelta: el día 1 lo pone su entrenador junto al patrón. */
  const ancla = entrenaPorSuCuenta(client) ? cicloPropio(client).inicio : anclaDelCiclo(program);
  if (!ancla || casillas.length === 0) return null;

  return dias.map((fecha) => {
    const desde = daysBetween(ancla, fecha) ?? 0;
    const i = ((desde % casillas.length) + casillas.length) % casillas.length;
    const casilla = casillas[i];
    const dia = claveDelDia(fecha) || WEEK_DAYS[0];
    return {
      fecha,
      key: casilla.key,
      corto: INICIAL_DEL_DIA[dia] || dia.slice(0, 1),
      dia,
      /* El día de la semana Y la casilla de su ciclo: en un rotativo las dos
         hacen falta —«Martes · D4»— porque lo que su entrenador le montó está
         escrito en casillas y él lo vive en martes. */
      titulo: `${dia} · ${casilla.corto}`,
      esHoy: fecha === hoy,
    };
  });
};

/**
 * ¿LE TOCA EL MICROCICLO SIGUIENTE? La regla, en un solo sitio.
 *
 * ══ Por qué es del dominio y no de la portada ══════════════════════════════
 *
 * Porque la preguntan dos cosas que tienen que contestar lo mismo: el aviso de
 * la portada —que es la oferta— y el automatismo de quien ha marcado «que el
 * siguiente se abra solo al cerrar este». Escrita dos veces, el día que una se
 * afinara el cliente se encontraría una tarjeta ofreciéndole algo que ya se
 * había abierto solo, o al revés.
 *
 * ── Las tres condiciones, y las tres son HECHOS ───────────────────────────
 *   · El microciclo abierto está ENTERO anotado. Cerrar es haber entrenado
 *     todas sus sesiones, no que sea lunes: un microciclo mide cinco días o
 *     nueve, y atarlo al calendario lo parte en cuanto deja de medir siete.
 *   · No hay ninguna sesión a medias. Esa espera una decisión suya —seguirla o
 *     descartarla— y ofrecerle empezar otro ciclo encima es un segundo verbo
 *     delante de alguien que va a hacer una cosa.
 *   · Su bloque es EL QUE CORRE. Solo el bloque abierto crece; prometer alargar
 *     uno que se cerró hace dos meses es ofrecer algo que no va a pasar.
 *
 * Devuelve el número de la semana que se abriría, o `null`. El número sirve
 * para la clave del guardado (ver `continueProgram`); lo que la portada escribe
 * es la posición dentro del bloque, que es otra cuenta y es suya.
 *
 * «Entero anotado» cuenta APARICIONES: una hoja que cae el lunes y el jueves
 * necesita dos sesiones. Ver `vecesDeLaHoja`.
 *
 * @param client `{ cycleType, cyclePattern }`: para derivar la secuencia del
 *   bloque si aún no la tiene guardada.
 */
export const cicloPorAbrir = (program, client = null) => {
  const conPlan = program ? { ...program, microcycles: resolvedMicrocycles(program) } : null;
  const micros = conPlan?.microcycles || [];
  if (micros.length === 0 || sesionAMedias(micros)) return null;

  const actual = lastWeekNumber(micros);
  const micro = micros.find((m) => m.weekNumber === actual);
  const dias = micro?.days || [];
  /* Sin días programados no hay nada que cerrar: un microciclo vacío no está
     «entero anotado», está sin montar. */
  if (dias.length === 0) return null;

  const anotadas = sesionesPorHoja(executedSessions(micro));
  const veces = vecesDeLaHoja(conPlan, actual, client);
  if (!dias.every((d) => (anotadas.get(d.dayName) || 0) >= veces(d.dayName))) return null;

  const bloque = blockOfWeek(conPlan, actual);
  if (!bloque || !isCurrentBlock(conPlan, bloque)) return null;

  return actual + 1;
};

/**
 * ¿Ha pedido que el siguiente se abra solo al cerrar este?
 *
 * ══ Por qué la oferta se ata al hecho y no al lunes ════════════════════════
 *
 * La casilla decía «que se abra sola cada lunes» y era falsa: `unitLabel` nunca
 * dice «Semana» en un ciclo rotativo, y un microciclo de nueve días se habría
 * abierto dos veces antes de terminarse. Lo que la dispara es cerrar el
 * anterior, que es lo mismo que dispara la oferta de la portada.
 *
 * Vive en `clients.preferences.rutina`, que el propio cliente puede escribir por
 * `set_client_preferences` (0008) — es SUYA: quien decide si su plan crece solo
 * es quien lo entrena. No hace falta migración ni columna.
 */
export const abreSoloElCiclo = (preferences) => Boolean(preferences?.rutina?.seguirSolo);
