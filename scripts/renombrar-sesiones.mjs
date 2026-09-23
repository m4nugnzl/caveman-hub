/**
 * LA REGLA DE LA REPARACIÓN DE NOMBRES VIEJOS, pura y probada.
 *
 * Una sesión guardada con el nombre que tenía su hoja ANTES de renombrarla
 * (de cuando renombrar no se llevaba las sesiones, antes de `ac05e52`) no casa
 * con ningún día del plan: no cuenta para la adherencia y no sale en su hoja.
 * Renombrarla es cambiar su `dayName`, y nada más.
 *
 * No se deduce nada: cada reparación está escrita a mano (cliente, semana,
 * sesión, de, a) y solo se aplica si todas sus condiciones se cumplen en la
 * fila tal como está ahora. Si una no se cumple, no se toca ese cliente.
 */

/**
 * @param {object} fila  la fila de `workout_data` (con `microcycles`)
 * @param {{ semana: number, sesion: string, de: string, a: string }} r
 * @returns {{ microcycles: object[] | null, problemas: string[] }}
 *   `microcycles` es la lista nueva, o `null` si no se puede reparar.
 */
export const renombrarSesion = (fila, r) => {
  const problemas = [];
  const micros = fila?.microcycles || [];
  const micro = micros.find((m) => m.weekNumber === r.semana);
  if (!micro) return { microcycles: null, problemas: [`no hay M${r.semana}`] };

  const sesion = (micro.sessions || []).find((s) => s.id === r.sesion);
  if (!sesion) problemas.push(`M${r.semana}: no está la sesión ${r.sesion}`);
  else if (sesion.dayName !== r.de) {
    problemas.push(`M${r.semana}: la sesión se llama «${sesion.dayName}», no «${r.de}»`);
  }

  /* El nombre viejo no puede ser un día vivo de esa semana: entonces la sesión
     sí casaría con algo y renombrarla la movería de hoja. */
  if ((micro.days || []).some((d) => d.dayName === r.de)) {
    problemas.push(`M${r.semana}: «${r.de}» es un día de la semana, no un nombre viejo`);
  }

  /* Y el nuevo tiene que existir, con TODOS los ejercicios de la sesión: es la
     prueba de que es la misma hoja con otro nombre. */
  const destino = (micro.days || []).find((d) => d.dayName === r.a);
  if (!destino) problemas.push(`M${r.semana}: no hay día «${r.a}»`);
  else if (sesion) {
    const ids = new Set((destino.exercises || []).map((e) => e.id));
    const fuera = (sesion.entries || []).filter((e) => !ids.has(e.exerciseId));
    if (fuera.length > 0) {
      problemas.push(`M${r.semana}: ${fuera.length} ejercicios de la sesión no están en «${r.a}»`);
    }
  }

  if (problemas.length > 0) return { microcycles: null, problemas };

  return {
    microcycles: micros.map((m) =>
      m !== micro
        ? m
        : { ...m, sessions: m.sessions.map((s) => (s.id === r.sesion ? { ...s, dayName: r.a } : s)) }
    ),
    problemas,
  };
};

/**
 * Lo que cambia entre dos listas de microciclos, sesión a sesión, fuera del
 * `dayName`: tiene que ser nada. Devuelve las diferencias en texto.
 */
export const cambiosAjenos = (antes = [], despues = []) => {
  const sinNombre = (m) => ({ ...m, sessions: (m.sessions || []).map((s) => ({ ...s, dayName: null })) });
  if (antes.length !== despues.length) return ['cambia el número de microciclos'];
  return antes.flatMap((m, i) =>
    JSON.stringify(sinNombre(m)) === JSON.stringify(sinNombre(despues[i]))
      ? []
      : [`M${m.weekNumber}: cambia algo más que el nombre de una sesión`]
  );
};
