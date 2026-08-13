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
