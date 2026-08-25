/**
 * El catálogo común, mezclado con lo que ya es tuyo.
 *
 * ══ Por qué no hay pantalla de catálogo ════════════════════════════════════
 *
 * Porque obligaría a un paso previo —«ir a importar»— que nadie da. El momento en
 * el que necesitas «Lentejas» es mientras montas la dieta, no media hora antes
 * administrando una lista.
 *
 * Así que el catálogo no se navega: se mezcla con tu biblioteca en los buscadores
 * que ya existen. Escribes «lentejas», sale, la eliges, y en ese momento se copia
 * a tu biblioteca, con su unidad y sus macros puestos.
 *
 * ── La copia NO es editable, y esto ha cambiado ───────────────────────────
 * Aquí ponía «después de la primera vez ya es tuya y editable», que es lo que
 * pensaba la 0033. Ya no: un alimento del catálogo es de referencia y se queda
 * como está, en el catálogo y en tu copia. Para unos macros distintos —los de
 * la marca que compras— se da de alta un alimento distinto, con su nombre.
 * Ver `canEditLibraryItem`, que es donde vive el porqué.
 *
 * ══ Quién gana cuando el nombre se repite ══════════════════════════════════
 *
 * **Tu biblioteca, siempre.** Si has ajustado los macros de «Pan integral» a los
 * de la marca que compras, ver dos «Pan integral» en el desplegable —el tuyo y el
 * genérico— sería un error a punto de pasar: elegirías el equivocado la mitad de
 * las veces y no notarías nada hasta que las cuentas no cuadren.
 *
 * Se comparan en minúsculas y sin espacios sobrantes, que es como se escriben los
 * duplicados de verdad: «Pan Integral» y «pan integral ».
 */

/** Clave de comparación: lo que hace que dos nombres sean «el mismo». */
const clave = (name) => String(name || '').trim().toLowerCase();

/**
 * Tu biblioteca primero y el catálogo detrás, sin repetidos.
 *
 * Las entradas del catálogo se marcan con `fromCatalog` para que el buscador
 * pueda decir de dónde vienen. No es decoración: saber que un alimento **todavía
 * no es tuyo** explica por qué al elegirlo aparece de repente en tu biblioteca.
 */
export const mergeCatalog = (library = [], catalog = []) => {
  const mios = new Set((library || []).map((item) => clave(item?.name)));

  return [
    ...(library || []),
    ...(catalog || [])
      .filter((item) => item && !mios.has(clave(item.name)))
      .map((item) => ({ ...item, fromCatalog: true })),
  ];
};

/**
 * La entrada de la lista que se llama así, o `null`.
 *
 * Compara con la misma `clave` que la mezcla: si «Pan Integral» y «pan integral »
 * cuentan como el mismo a la hora de no duplicar, tienen que contar como el mismo
 * a la hora de decir de quién es.
 */
export const findByName = (items, name) => {
  const buscada = clave(name);
  return (items || []).find((item) => clave(item?.name) === buscada) || null;
};

/**
 * ══ Qué se puede corregir y qué se queda como está ═════════════════════════
 *
 * **Solo lo que has dado de alta tú.** Y eso deja fuera dos cosas.
 *
 * ── 1. Los generales, que están bien y se quedan así ───────────────────────
 * Un alimento cuyo nombre está en el CATÁLOGO es de referencia: la pechuga de
 * pollo tiene los mismos macros en todas las bibliotecas del mundo, y los 179
 * del catálogo salen de tablas de composición, no del criterio de nadie. No se
 * tocan ni en el catálogo ni en la copia que tengas de él.
 *
 * Que la copia también cuente es EL punto, y es lo que fallaba antes: preguntar
 * solo por `coach_id` no distinguía nada para quien trabaja solo. Los 46
 * alimentos de arranque (0022) se siembran con el `coach_id` del DUEÑO del
 * equipo, y cada alimento que copias del catálogo al usarlo nace también con el
 * tuyo — así que todo era «tuyo» y todo llevaba lápiz. Cuarenta y cinco de esos
 * cuarenta y seis están en el catálogo, que es exactamente por lo que el
 * catálogo sirve de definición sin inventar una columna nueva.
 *
 * Si necesitas otros macros —la marca de pan que compras trae los suyos—, es un
 * alimento distinto y se da de alta con su nombre: «Pan integral Bimbo». Nombres
 * distintos para cosas distintas es además lo único que entiende `upsertByName`,
 * que identifica por nombre.
 *
 * ── 2. Lo que dio de alta un compañero de equipo ───────────────────────────
 * Desde la 0006 la biblioteca es del EQUIPO y sus políticas de RLS dejan a
 * cualquier miembro escribir cualquier fila: la base NO te va a parar. La regla
 * vive aquí, en el producto, porque es una decisión de producto — un entrenador
 * no le reescribe los macros a otro sin que se entere.
 *
 * ── Lo que NO está en la biblioteca de nadie ───────────────────────────────
 * Vale: si no hay fila con ese nombre, nadie lo creó, y al guardarlo nace una
 * fila tuya. Es el caso de una dieta traída de fuera —un PDF importado— cuyos
 * alimentos todavía no ha visto la biblioteca.
 *
 * ── Sin catálogo cargado ───────────────────────────────────────────────────
 * Si la 0033 no está aplicada, `catalog` llega vacío y no hay forma de saber qué
 * es general. Se cae a la regla de antes —`coach_id`— en vez de bloquearlo todo:
 * es un entorno a medio migrar, no un motivo para quitarle a nadie la única
 * manera de arreglar un macro mal tecleado.
 *
 * ── Y esto NO decide si se puede tocar la DIETA ────────────────────────────
 * Una entrada de dieta es una copia congelada (ver `buildFoodEntry`): los gramos,
 * el orden, la unidad en la que se lee y hasta cambiar un alimento por otro
 * siguen siendo del entrenador que monta ese plan. Lo que esto acota es la
 * escritura en la BIBLIOTECA, que es lo único compartido.
 */
export const canEditLibraryItem = (name, { library = [], catalog = [], coachId = null } = {}) => {
  if (!coachId) return false;
  if (findByName(catalog, name)) return false;

  const fila = findByName(library, name);
  if (!fila) return true;
  return !fila.fromCatalog && fila.coachId === coachId;
};

/**
 * Agrupa por categoría, respetando el orden en que llegan.
 *
 * Se usa cuando hay que enseñar el catálogo entero —no en el buscador, que
 * ordena por relevancia—. `Map` y no un objeto porque conserva el orden de
 * inserción y ahí sí importa: «Carne» antes que «Suplementos» es una decisión.
 */
export const byCategory = (items = []) => {
  const out = new Map();
  for (const item of items) {
    const cat = item?.category || 'Otros';
    if (!out.has(cat)) out.set(cat, []);
    out.get(cat).push(item);
  }
  return out;
};
