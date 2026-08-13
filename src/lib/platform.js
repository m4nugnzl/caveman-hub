/**
 * La tecla modificadora de los atajos, según el sistema.
 *
 * `⌘` en Apple y `Ctrl` en el resto. Se decide por la plataforma y no se escribe
 * «Ctrl/⌘» porque una etiqueta que enseña las dos obliga a elegir cuál es la tuya
 * cada vez que la lees.
 *
 * Vive aquí porque lo necesitan dos sitios —el botón de búsqueda de la cabecera y
 * la bienvenida, que es donde se anuncia el atajo— y una comprobación de
 * plataforma repetida es de las que acaban divergiendo.
 */
export const modifierKey = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
    ? '⌘'
    : 'Ctrl';

/** El atajo de la paleta de comandos, ya escrito: `⌘ K` o `Ctrl K`. */
export const paletteShortcut = () => `${modifierKey()} K`;
