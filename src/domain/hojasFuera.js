/**
 * LAS HOJAS FUERA DEL PLAN: las que siguen en los microciclos de un bloque
 * aunque el plan del bloque ya no las tenga.
 *
 * ══ De dónde salen ══════════════════════════════════════════════════════════
 * Quitar o renombrar una hoja dejaba su día en los `days` de todos los
 * microciclos del bloque —entrenada o no—, fuera del plan y sin forma de
 * editarla. Con la copia del 22 sep eran 56 apariciones: 19 hojas en 9
 * clientes. Ya no se crean: quitar suelta sus días sin entrenar en el mismo
 * gesto (esto), y renombrar se los lleva.
 *
 * ══ Nada automático, y tampoco un aviso ═════════════════════════════════════
 * Hubo una versión que las borraba sola en la siguiente escritura del plan. El
 * dueño la rechazó (22 sep): una hoja con registros es historial, y decidir qué
 * se queda es del entrenador. Después se diseñó un aviso en el bloque con sus
 * gestos —colocar en un día, archivar, quitar— y también se decidió no
 * construirlo. Las que ya hay se quedan donde están.
 */

import { blockPlan, blocksOf, weeksOfBlock } from './blocks';
import { executedSessions } from './sessions';

const entrenadasEn = (micro) => new Set(executedSessions(micro).map((s) => s.dayName));

/**
 * Una hoja que acaba de salir del plan sale también de los microciclos del
 * bloque donde no se entrenó. Donde sí, se queda: sus sesiones apuntan a ese
 * día. No toca una hoja que esté en el plan —esa no está fuera—.
 *
 * Es lo que hace quitar una hoja del bloque, en el mismo paso, y solo ese
 * gesto: su regla no vale para ninguna otra escritura (ver
 * `proyectarPlanEnDias`).
 */
export const soltarHojaSinEntrenar = (program, blockId, nombre) => {
  const bloque = blocksOf(program).find((b) => b.id === blockId);
  if (!bloque) return program;
  if (blockPlan(program, bloque).sessions.some((s) => s.dayName === nombre)) return program;
  const semanas = new Set(weeksOfBlock(program, bloque));
  let cambia = false;
  const microcycles = (program.microcycles || []).map((m) => {
    if (!semanas.has(m.weekNumber) || !(m.days || []).some((d) => d.dayName === nombre)) return m;
    if (entrenadasEn(m).has(nombre)) return m;
    cambia = true;
    return { ...m, days: m.days.filter((d) => d.dayName !== nombre) };
  });
  return cambia ? { ...program, microcycles } : program;
};
