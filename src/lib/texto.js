/**
 * Normaliza para comparar texto escrito por personas: sin mayúsculas y sin
 * tildes.
 *
 * Lo segundo no es un detalle: media cartera se llama Martínez, Núñez o Peña,
 * la biblioteca está llena de «Maíz» y «Plátano», y sin esto había que teclear
 * la tilde para encontrarlos. Nadie lo hace.
 *
 * Vivía dentro de la paleta de comandos; se saca aquí porque los buscadores de
 * ejercicios y alimentos (`Autocomplete`) y el filtro de clientes del teléfono
 * tenían el mismo problema y cada uno comparaba a su manera.
 */
export const norm = (value) =>
  String(value || '')
    .normalize('NFD')
    // Se quitan las marcas diacríticas con la propiedad Unicode y la bandera
    // `u`, en vez de con un rango de caracteres combinantes escrito a mano: esos
    // caracteres son INVISIBLES en el editor, y una expresión que no se puede leer
    // es una expresión que nadie puede revisar.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/* Las vocales acentuadas y su equivalente sin tilde, para las agudas que la
   pierden al pluralizar: «melón» → «melones», no «melónes». */
const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };

/**
 * El plural castellano de una palabra suelta.
 *
 * ══ Por qué hace falta más que añadir una «s» ══════════════════════════════
 *
 * `unitsLabel` pluralizaba pegando una «s» al final, con el argumento de que
 * las etiquetas raras «las escribe el entrenador y las ve él». Pero el catálogo
 * de la casa trae DIECISÉIS alimentos cuya unidad es literalmente «unidad», así
 * que lo que veía todo el mundo era «3 unidads». Y un «dátil» salía «2 dátils».
 *
 * Las reglas, que son cuatro y no cambian desde hace siglos:
 *
 *   · Acabada en vocal átona o en -á/-é/-ó   → +s     (vaso → vasos)
 *   · Acabada en -í/-ú tónicas               → +es    (maní → manís/maníes;
 *                                                      se toma la culta)
 *   · Acabada en -z                          → -ces   (nuez → nueces)
 *   · Acabada en cualquier otra consonante   → +es    (unidad → unidades)
 *
 * Y si es aguda con tilde en la última sílaba, la tilde se cae al añadir la
 * sílaba nueva, porque la palabra deja de ser aguda: «melón» → «melones».
 *
 * Las palabras acabadas en -s sin acento en la última sílaba no cambian
 * («el lunes» / «los lunes»), y aquí eso importa poco pero cuesta una línea.
 */
export const pluralEs = (palabra) => {
  const p = String(palabra || '').trim();
  if (!p) return p;

  const ultima = p.slice(-1).toLowerCase();

  if ('aeiouáéó'.includes(ultima)) return `${p}s`;
  if ('íú'.includes(ultima)) return `${p}es`;
  if (ultima === 'z') return `${p.slice(0, -1)}ces`;
  /* Llana o esdrújula acabada en -s: invariable. Aguda acabada en -s sí
     pluraliza («el mes» / «los meses»), y esa lleva tilde o es monosílaba. */
  if (ultima === 's' && p.length > 3 && !/[áéíóú]/i.test(p.slice(-4))) return p;

  /*
    Consonante: se añade «-es», y solo la AGUDA pierde su tilde.

    Aguda es la que lleva el acento en la última sílaba, así que basta con
    buscar hacia atrás la última vocal de la palabra: si es la acentuada, la
    palabra era aguda y deja de serlo. «melón» → la última vocal es «ó» →
    «melones». «dátil» → la última vocal es la «i», sin tilde, y la «á» está
    detrás: sigue acentuada, «dátiles». Quitar todas las tildes a lo bruto
    convertía uno en «datiles».
  */
  const cuerpo = p.replace(/[aeiouáéíóú](?=[^aeiouáéíóú]*$)/i, (v) => SIN_TILDE[v.toLowerCase()] ?? v);
  return `${cuerpo}es`;
};

/**
 * Una lista dicha en castellano: «Empuje, Tirón y Pierna».
 *
 * La escribían a mano cuatro sitios con la misma línea exacta —`hojas.js`,
 * `Today.jsx`, `CalendarPanel.jsx` y `acciones.js`—, así que la conjunción
 * final vivía en cuatro copias. Aquí queda la buena; las otras cuatro se irán
 * mudando cuando se toquen, que es cuando toca.
 */
export const enumeraEs = (lista = []) => {
  const partes = lista.filter((x) => String(x ?? '').trim() !== '');
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
};
