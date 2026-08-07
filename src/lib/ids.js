/**
 * Generación de identificadores para entidades que viven dentro de JSONB
 * (microciclos, días, ejercicios, comidas, opciones, alimentos).
 *
 * Antes había cinco copias de `'ex_' + Date.now() + '_' + Math.random()...`
 * repartidas por el código. Además de duplicado, era colisionable: dos
 * ejercicios añadidos en el mismo milisegundo podían compartir id, y el id es
 * lo que usan `removeExercise` y `updateExerciseSet` para localizar la fila.
 */

const uuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback para contextos no seguros (http en IP de red local, por ejemplo).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

/** `newId('ex')` → `'ex_3f2a…'`. El prefijo solo sirve para leer logs. */
export const newId = (prefix) => `${prefix}_${uuid()}`;

/** Clon profundo sin las trampas de JSON.parse(JSON.stringify(...)). */
export const deepClone = (value) =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));