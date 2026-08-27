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
