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
 * a tu biblioteca. Después de la primera vez ya es tuya y editable.
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
 * ══ Quién puede corregir qué ═══════════════════════════════════════════════
 *
 * **Solo se toca lo que has dado de alta tú.** Los dos casos que quedan fuera
 * son distintos y por motivos distintos:
 *
 *   · **El catálogo** (0033) es global, sin dueño y de solo lectura para todo el
 *     mundo. Son datos de referencia que tienen que estar bien para todos; una
 *     escritura mal puesta ahí la vería la aplicación entera. Ni siquiera el
 *     dueño de un equipo escribe en él, y por eso no se edita: se COPIA. Al
 *     elegirlo por primera vez nace una fila tuya en tu biblioteca, y ESA sí es
 *     editable — que es justo lo que dice la cabecera de este archivo.
 *
 *   · **Lo que dio de alta un compañero de equipo.** Desde la 0006 la biblioteca
 *     es del EQUIPO y sus políticas de RLS dejan a cualquier miembro escribir
 *     cualquier fila: la base NO te va a parar. La regla vive aquí, en el
 *     producto, porque es una decisión de producto — un entrenador no le
 *     reescribe los macros a otro sin que se entere.
 *
 * ── Lo que NO está en la biblioteca de nadie ───────────────────────────────
 * Vale: si no hay fila con ese nombre, nadie lo creó, y al guardarlo nace una
 * fila tuya. Es el caso de una dieta traída de fuera —un PDF importado— cuyos
 * alimentos todavía no ha visto la biblioteca.
 *
 * ── Y esto NO decide si se puede tocar la DIETA ────────────────────────────
 * Una entrada de dieta es una copia congelada (ver `buildFoodEntry`): los gramos,
 * el orden, la unidad en la que se lee y hasta cambiar un alimento por otro
 * siguen siendo del entrenador que monta ese plan. Lo que esto acota es la
 * escritura en la BIBLIOTECA, que es lo único compartido.
 */
export const canEditLibraryItem = (name, items, coachId) => {
  if (!coachId) return false;
  const fila = findByName(items, name);
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
