/**
 * Iniciales de un nombre o un email.
 *
 * Se usa para pintar un avatar cuando no hay foto. Un hueco vacío en su sitio se
 * lee como un fallo de carga, y una silueta genérica repetida veinte veces no
 * distingue a nadie: dos letras sí.
 *
 * Vive aquí porque lo necesitan el menú de cuenta y la ficha del cliente, y
 * porque la alternativa que había en la ficha era peor (ver abajo).
 *
 * ── Por qué no un servicio de avatares ──────────────────────────────────────
 * La ficha del cliente pedía su avatar a `api.dicebear.com`, poniendo **el nombre
 * de la persona en la URL**. Eso es mandar a un tercero el nombre de alguien de
 * quien esta aplicación guarda su peso, sus pliegues y fotos de su cuerpo: una
 * cesión de datos que nadie había decidido y que habría que declarar en la
 * política de privacidad. Dos letras dibujadas aquí no salen de la pantalla.
 */
export const initials = (value) =>
  String(value || '?')
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || '?';
