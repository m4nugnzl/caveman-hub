/**
 * EL DESHACER DEL PLAN: QUÉ ES UNA FOTO Y QUÉ NO SE DEVUELVE NUNCA.
 *
 * ══ Por qué el programa entero no vale como foto ════════════════════════════
 *
 * Todo lo que el entrenador escribe en la rutina pasa por un solo embudo
 * —`applyWorkout`, en `context/useWorkout`— que reemplaza el programa completo.
 * Eso hace el deshacer casi gratis: se guarda el de antes y se devuelve.
 *
 * Solo que dentro del mismo objeto viven DOS cosas que no se parecen en nada:
 *
 *     microcycle.days       el PLAN        lo escribe el entrenador
 *     microcycle.sessions   el REGISTRO    lo escribe quien entrena
 *
 * Devolver la foto entera sería, literalmente, borrarle a alguien las series
 * que acaba de anotar mientras su entrenador tecleaba. Un deshacer que puede
 * comerse el entreno de ayer no es un deshacer: es una avería con atajo.
 *
 * De ahí la ley de este módulo, que es una sola frase:
 *
 *     EL DESHACER DEVUELVE EL PLAN Y NUNCA TOCA LO REGISTRADO.
 *
 * En código son las dos funciones de abajo: `mismoPlan` decide si un cambio
 * merece entrar en la pila —los tecleos del registro no la ensucian, y así ⌘Z
 * no se gasta en pasos que no mueven nada—, y `conLoRegistradoDeAhora` injerta
 * las sesiones de AHORA en la foto de antes.
 */

/** Un microciclo sin su registro: lo que de él es plan. */
const soloElPlan = (micro) => {
  const { sessions: _sessions, ...plan } = micro || {};
  return plan;
};

/*
  La comparación es por referencia primero y por texto solo donde hace falta.

  No es una optimización prematura: `mismoPlan` corre en CADA escritura, y las
  hay que ocurren por pulsación de tecla (el objetivo de repeticiones de una
  serie). Los updaters del dominio son inmutables y conservan la identidad de
  lo que no tocan, así que el caso normal —cambiar un microciclo de doce— sale
  por las referencias y solo se serializa el que cambió.
*/
const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * ¿Estos dos microciclos tienen el mismo plan?
 *
 * El camino corto no es un lujo: el caso que más se repite es el entrenador
 * apuntándole los kilos a alguien, y ahí lo único que cambia es `sessions`. Los
 * updaters devuelven `{ ...m, sessions: [...] }`, así que `days`, `date` y el
 * resto siguen siendo LOS MISMOS objetos. Comparando campo a campo por
 * referencia eso se resuelve sin serializar nada; sin el atajo, cada tecla
 * convertía un microciclo entero en texto para acabar diciendo que no había
 * cambiado.
 */
const mismoMicro = (a, b) => {
  if (a === b) return true;
  const pa = soloElPlan(a);
  const pb = soloElPlan(b);
  const claves = Object.keys(pa);
  if (claves.length !== Object.keys(pb).length) return false;
  if (claves.every((k) => pa[k] === pb[k])) return true;
  return igual(pa, pb);
};

/**
 * ¿Estos dos programas tienen el mismo PLAN?
 *
 * Lo registrado se ignora a propósito: dos programas que solo difieren en una
 * serie anotada son el mismo plan, y entre ellos no hay nada que deshacer.
 */
export const mismoPlan = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;

  if (!igual(a.blocks || [], b.blocks || [])) return false;
  /* Los borradores son plan: quitar uno o cambiarle la duración se deshace.
     Casi siempre no hay ninguno y la clave ni existe: por eso se comparan
     antes por referencia, para no serializar `[]` contra `[]` en cada tecla. */
  if (a.draftBlocks !== b.draftBlocks && !igual(a.draftBlocks || [], b.draftBlocks || [])) return false;
  if (!igual(a.weeklySplit || {}, b.weeklySplit || {})) return false;
  if (!igual(a.mobilityDrills || [], b.mobilityDrills || [])) return false;
  if ((a.notes || '') !== (b.notes || '')) return false;

  const ma = a.microcycles || [];
  const mb = b.microcycles || [];
  if (ma.length !== mb.length) return false;
  for (let i = 0; i < ma.length; i += 1) {
    if (!mismoMicro(ma[i], mb[i])) return false;
  }
  return true;
};

/**
 * La foto de antes, con el registro de ahora dentro.
 *
 * Dos injertos, que son las dos formas que tiene el registro de perderse:
 *
 *   · Un microciclo que existe en las dos: se queda el plan de la foto y las
 *     sesiones de ahora. Es el caso de todos los días.
 *   · Un microciclo que nació DESPUÉS de la foto y ya tiene algo entrenado: no
 *     se va. Deshacer «+ semana» retira la semana en blanco que acabas de
 *     añadir; no la que alguien ha empezado a entrenar mientras tanto.
 */
export const conLoRegistradoDeAhora = (foto, actual) => {
  const ahora = new Map((actual?.microcycles || []).map((m) => [m.id, m]));
  const enLaFoto = new Set((foto?.microcycles || []).map((m) => m.id));

  const devueltos = (foto?.microcycles || []).map((m) => {
    const vivo = ahora.get(m.id);
    return vivo ? { ...m, sessions: vivo.sessions || [] } : m;
  });

  const conRegistro = (actual?.microcycles || []).filter(
    (m) => !enLaFoto.has(m.id) && (m.sessions || []).length > 0
  );

  return {
    ...foto,
    microcycles:
      conRegistro.length === 0
        ? devueltos
        : [...devueltos, ...conRegistro].sort((a, b) => (a.weekNumber || 0) - (b.weekNumber || 0)),
  };
};

/** Cuántos pasos atrás se guardan por cliente. */
export const PASOS_DE_DESHACER = 25;

/**
 * La pila de un cliente después de apuntar un cambio.
 *
 * El futuro se vacía: deshacer tres veces y volver a tocar algo abre una rama
 * nueva, y el «rehacer» de la rama vieja ya no lleva a ninguna parte.
 */
export const apuntarFoto = (pila, foto) => ({
  pasado: [...(pila?.pasado || []), foto].slice(-PASOS_DE_DESHACER),
  futuro: [],
});
