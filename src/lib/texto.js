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
