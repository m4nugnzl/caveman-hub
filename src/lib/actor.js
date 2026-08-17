/**
 * Quién está usando esto, para las dos cosas que lo necesitan.
 *
 * ══ Por qué existe este archivo ═════════════════════════════════════════════
 *
 * La identidad vivía dentro de `lib/analytics.js` porque solo la usaba él. Desde
 * que los fallos también se registran en el servidor (migración 0052) la
 * necesitan dos, y la alternativa era que `diagnostics` tuviera su propio
 * `identify` y que la aplicación llamara a los dos con lo mismo.
 *
 * Dos sitios guardando quién eres es la clase de duplicación que se desincroniza
 * sin avisar: bastaría con que alguien añadiera un `identify` nuevo en el cierre
 * de sesión y se olvidara del otro para que los fallos siguieran saliendo a
 * nombre de quien ya se fue.
 *
 * ══ Lo que NO es ═══════════════════════════════════════════════════════════
 *
 * No es una sesión ni una fuente de autorización. La sesión de verdad la lleva
 * `supabase.auth` y los permisos los deciden las políticas de la base: esto es
 * una copia en memoria de tres campos, para que la telemetría sepa a nombre de
 * quién apunta lo que apunta.
 *
 * No sobrevive a una recarga y no se guarda en ningún sitio. Al salir se olvida.
 */

let identidad = { userId: null, teamId: null, role: null };

/**
 * A quién se le apunta lo que pase a partir de ahora.
 *
 * `role` se guarda entero en vez de deducirse de la ruta porque un entrenador
 * puede estar PREVISUALIZANDO el portal de su cliente, y eso sigue siendo uso
 * del panel: quien decide es con qué cuenta se entró, no en qué URL se está.
 */
export const identify = ({ userId, team, role } = {}) => {
  identidad = { userId: userId || null, teamId: team || null, role: role || null };
};

/** Cierra la sesión de medición. Se llama al salir. */
export const forgetActor = () => {
  identidad = { userId: null, teamId: null, role: null };
};

/** Quién es ahora mismo. Devuelve siempre un objeto, nunca `null`. */
export const currentActor = () => identidad;
