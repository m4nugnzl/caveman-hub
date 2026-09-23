/**
 * LOS BLOQUES EN BORRADOR: lo que viene detrás del abierto, si se quiere prever.
 *
 * ══ Dónde viven, y por qué no en `blocks` ══════════════════════════════════
 * En `workout_data.draft_blocks` (0133), una columna HERMANA de `blocks`. Todo
 * el código —y `continue_program` (0109) y `training_summaries` (0110)— supone
 * que el último bloque de `blocks` es el abierto, y unas cuarenta escrituras
 * reconstruyen la lista desde `blocksOf`: un borrador ahí dentro pasaría por el
 * bloque en curso o se perdería al guardar. Aquí no lo lee nadie que no lo pida.
 * La previsión es OPCIONAL (M-01 enmendada el 22 sep): un programa sin
 * borradores es el de siempre.
 *
 * ══ La forma ════════════════════════════════════════════════════════════════
 *   { id, name, plannedWeeks, intent?, note?, sessions?, mobilityDrills?,
 *     microciclo?, referencias? }
 *
 * · El ORDEN del array es el orden en el tiempo. No lleva fechas: su sitio se
 *   deriva del final previsto del abierto, sumando lo que dura cada uno.
 * · `plannedWeeks` es obligatorio: un borrador sin duración no se puede poner
 *   en ninguna parte del calendario. En un rotativo cuenta MICROCICLOS, no
 *   semanas (ver `diasDelBorrador`).
 * · `referencias` son los ejercicios que el entrenador quiere seguir en la
 *   lente: `{ ejercicioId?, nombre }`. La hoja y los registros guardan el
 *   NOMBRE, y renombrar en la Librería no reescribe las hojas; con el id se
 *   casa también el nombre de ahora.
 *
 * ══ Rellenar no es empezar ══════════════════════════════════════════════════
 * Un borrador se rellena (hojas, microciclo) sin que empiece nada. Empezar es
 * otro gesto, «Empezar ahora», que lo pasa a bloque en UNA escritura y le
 * conserva el id (`openNextBlock` con `id`, y `sinBorrador` en el mismo paso).
 * Nunca empieza solo, y solo empieza el PRIMERO: es el que va detrás del
 * abierto; empezar otro reordenaría el tiempo sin decirlo.
 */

import { newId } from '@/lib/ids';
import { blockTraits, blocksOf } from './blocks';
import { duracionDe, normalizaMicrociclo } from './training';

/** Tope de un nombre de ejercicio de referencia: el de la Librería. */
const MAX_NOMBRE = 120;

/** Las referencias, saneadas: con nombre, sin repetir, y el id solo si es texto. */
export const referenciasSaneadas = (lista) => {
  const vistas = new Set();
  const salida = [];
  for (const r of Array.isArray(lista) ? lista : []) {
    const nombre = String(r?.nombre ?? '').trim().slice(0, MAX_NOMBRE);
    if (!nombre || vistas.has(nombre.toLowerCase())) continue;
    vistas.add(nombre.toLowerCase());
    salida.push({ ...(typeof r.ejercicioId === 'string' && r.ejercicioId ? { ejercicioId: r.ejercicioId } : {}), nombre });
  }
  return salida;
};

/**
 * Un borrador tal como se guarda: las claves vacías no se escriben, igual que
 * las características de un bloque (`setBlockTraitsIn`). `null` si no se puede
 * guardar —sin id o sin duración—.
 */
export const borradorSaneado = (b) => {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id) return null;
  const { intent, plannedWeeks, note } = blockTraits(b);
  if (!plannedWeeks) return null;
  const microciclo = normalizaMicrociclo(b.microciclo);
  const referencias = referenciasSaneadas(b.referencias);
  return {
    id: b.id,
    name: String(b.name ?? '').trim() || 'Bloque',
    plannedWeeks,
    ...(intent ? { intent } : {}),
    ...(note ? { note } : {}),
    ...(Array.isArray(b.sessions) && b.sessions.length > 0 ? { sessions: b.sessions } : {}),
    ...(Array.isArray(b.mobilityDrills) && b.mobilityDrills.length > 0 ? { mobilityDrills: b.mobilityDrills } : {}),
    ...(microciclo ? { microciclo } : {}),
    ...(referencias.length > 0 ? { referencias } : {}),
  };
};

/**
 * Los borradores de un programa, en su orden. Lo que llega de la base se lee
 * tal cual salvo lo que no tiene id, que no se puede ni nombrar ni quitar.
 */
export const borradoresDe = (program) =>
  (Array.isArray(program?.draftBlocks) ? program.draftBlocks : []).filter(
    (b) => b && typeof b === 'object' && typeof b.id === 'string' && b.id
  );

export const borradorDe = (program, id) => borradoresDe(program).find((b) => b.id === id) || null;

/** ¿Es el que va justo detrás del abierto? Solo ese se puede empezar. */
export const esElSiguiente = (program, id) => borradoresDe(program)[0]?.id === id;

/**
 * ¿Se puede empezar ya? El primero, con al menos una hoja (un bloque sin hojas
 * no se abre, igual que en el Compositor) y con un programa que cerrar.
 */
export const sePuedeEmpezar = (program, id) =>
  esElSiguiente(program, id) &&
  (borradorDe(program, id)?.sessions || []).length > 0 &&
  (program?.microcycles || []).length > 0;

const conBorradores = (program, lista) => ({ ...program, draftBlocks: lista });

/**
 * Un borrador nuevo, al final. `plannedWeeks` es obligatorio: sin él no se
 * añade nada y `borrador` es `null`. El nombre por defecto sigue la cuenta de
 * los bloques («Bloque 4» si hay dos y un borrador).
 *
 * @returns {{ program: object, borrador: object | null }}
 */
export const anadirBorrador = (program, datos = {}) => {
  const lista = borradoresDe(program);
  const nombre = String(datos.name ?? '').trim() || `Bloque ${blocksOf(program).length + lista.length + 1}`;
  const borrador = borradorSaneado({ ...datos, id: newId('b'), name: nombre });
  if (!borrador) return { program, borrador: null };
  return { program: conBorradores(program, [...lista, borrador]), borrador };
};

/**
 * Cambia lo que llegue y deja lo demás. Una duración que no vale no se aplica
 * (el borrador conserva la suya): un borrador no puede quedarse sin duración.
 * Sin ese borrador, o sin cambio, devuelve el mismo programa.
 */
export const cambiarBorrador = (program, id, cambios = {}) => {
  const lista = borradoresDe(program);
  const i = lista.findIndex((b) => b.id === id);
  if (i < 0) return program;
  const { id: _id, plannedWeeks, ...resto } = cambios;
  const duracion = blockTraits({ plannedWeeks }).plannedWeeks;
  const nuevo = borradorSaneado({ ...lista[i], ...resto, ...(duracion ? { plannedWeeks: duracion } : {}) });
  if (!nuevo || JSON.stringify(nuevo) === JSON.stringify(lista[i])) return program;
  return conBorradores(program, lista.map((b, j) => (j === i ? nuevo : b)));
};

/**
 * Lo quita y dice dónde estaba, para poder devolverlo con Deshacer.
 * @returns {{ program: object, quitado: object | null, posicion: number }}
 */
export const quitarBorrador = (program, id) => {
  const lista = borradoresDe(program);
  const posicion = lista.findIndex((b) => b.id === id);
  if (posicion < 0) return { program, quitado: null, posicion: -1 };
  return { program: conBorradores(program, lista.filter((b) => b.id !== id)), quitado: lista[posicion], posicion };
};

/** Lo vuelve a poner donde estaba (o al final, si ya no hay tantos). */
export const devolverBorrador = (program, borrador, posicion) => {
  const lista = borradoresDe(program);
  if (!borrador || lista.some((b) => b.id === borrador.id)) return program;
  const i = Math.max(0, Math.min(Number.isInteger(posicion) ? posicion : lista.length, lista.length));
  return conBorradores(program, [...lista.slice(0, i), borrador, ...lista.slice(i)]);
};

/** Lo cambia de sitio en el tiempo. */
export const moverBorrador = (program, id, destino) => {
  const lista = borradoresDe(program);
  const de = lista.findIndex((b) => b.id === id);
  const a = Math.max(0, Math.min(destino, lista.length - 1));
  if (de < 0 || de === a) return program;
  const sin = lista.filter((b) => b.id !== id);
  return conBorradores(program, [...sin.slice(0, a), lista[de], ...sin.slice(a)]);
};

/** El programa sin ese borrador: es lo que acompaña a «Empezar ahora». */
export const sinBorrador = (program, id) => quitarBorrador(program, id).program;

/**
 * Lo que necesita `startBlockWithPlan` para empezarlo: el bloque que nace se
 * llama igual, tiene sus hojas y su microciclo, y CONSERVA EL ID.
 */
export const datosParaEmpezar = (borrador) => ({
  id: borrador.id,
  name: borrador.name,
  sessions: borrador.sessions || [],
  mobilityDrills: borrador.mobilityDrills || null,
  plannedWeeks: borrador.plannedWeeks,
  intent: borrador.intent || null,
  note: borrador.note || null,
  microciclo: borrador.microciclo || null,
});

/**
 * Cuántos días ocupa en el calendario: `plannedWeeks` microciclos de lo que
 * dure su secuencia. Un semanal (o uno sin secuencia todavía) son 7 días por
 * microciclo; un rotativo, lo que mida su cadena — igual que el bloque abierto.
 */
export const diasDelBorrador = (borrador) =>
  (blockTraits(borrador).plannedWeeks || 0) * (duracionDe(normalizaMicrociclo(borrador?.microciclo)) || 7);
