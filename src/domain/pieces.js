/**
 * TUS PIEZAS: los días guardados del entrenador.
 *
 * ══ La idea ════════════════════════════════════════════════════════════════
 * Tu mejor día de pierna, guardado con nombre y listo para ponerlo en el
 * bloque de cualquier cliente. Es la mitad que faltaba de «traer un día de
 * otro cliente»: aquello copia entre personas; esto guarda TU criterio como
 * pieza propia, sin dueño.
 *
 * ══ Dónde viven ════════════════════════════════════════════════════════════
 * En `profiles.preferences.piezas.items` (la columna de la 0035): son del
 * entrenador —no de un cliente— y la fachada de secciones de
 * `updateCoachPreferences` ya fusiona sin pisar lo demás. Un día son unos
 * pocos KB; el tope de abajo evita que la fila del perfil engorde sin límite.
 *
 * ── Plantillas de verdad ───────────────────────────────────────────────────
 * Una pieza guarda el PROGRAMA (ejercicios, series, objetivos, gramática,
 * alternativas) y nunca el registro: pasa por `cloneExerciseAsTemplate` al
 * guardarse y otra vez al ponerse, para que dos usos no compartan ids.
 */

import { newId } from '@/lib/ids';
import { cloneExerciseAsTemplate } from './training';

/** Más de treinta ya no es una biblioteca de piezas: es otro archivador. */
export const MAX_PIECES = 30;

/** Las piezas guardadas, saneadas: con id, nombre y algo dentro. */
export const piecesOf = (coachPrefs) =>
  (Array.isArray(coachPrefs?.piezas?.items) ? coachPrefs.piezas.items : []).filter(
    (p) => p && p.id && String(p.name || '').trim() && Array.isArray(p.exercises)
  );

/**
 * Una pieza nueva a partir de una hoja. `savedAt` lo pone quien llama, que es
 * quien tiene reloj.
 */
export const buildPiece = ({ name, exercises = [], savedAt = null }) => ({
  id: newId('pz'),
  name: String(name || '').trim(),
  exercises: (exercises || []).map(cloneExerciseAsTemplate),
  savedAt,
});

/** «5 ejercicios · 18 series», para la fila del cajón. */
export const pieceSummary = (piece) => {
  const ejercicios = piece?.exercises || [];
  const series = ejercicios.reduce((n, ex) => n + (ex.sets || []).length, 0);
  return `${ejercicios.length} ${ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'} · ${series} series`;
};

/**
 * El nombre con el que una pieza entra en un bloque sin pisar una hoja que ya
 * se llame así: «Pierna», «Pierna 2», «Pierna 3»…
 */
export const freeSheetName = (name, existentes = []) => {
  const usados = new Set(existentes);
  const base = String(name || '').trim() || 'Pieza';
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
};
