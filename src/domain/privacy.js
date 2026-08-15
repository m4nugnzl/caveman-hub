/**
 * El consentimiento del cliente.
 *
 * ══ Por qué esto es un dato y no un texto legal ═════════════════════════════
 *
 * La aplicación guarda fotos corporales, peso, pliegues y perímetros: categoría
 * especial del RGPD. Para tratarlos hace falta el consentimiento EXPLÍCITO de la
 * persona, y «explícito» significa dos cosas que solo se cumplen si queda
 * registrado:
 *
 *   1. Que se pueda demostrar CUÁNDO lo dio. Un consentimiento que no consta no
 *      existe si alguien lo reclama.
 *   2. Que se pueda RETIRAR. Y para poder retirarlo tiene que constar.
 *
 * ══ Dónde vive, y por qué ya no vive en dos sitios ══════════════════════════
 *
 * En la tabla `client_consents` (migración 0018), y SOLO ahí.
 *
 * Hubo dos sistemas a la vez. Este archivo guardaba el consentimiento en
 * `clients.preferences.consent` —un JSONB que escribía la propia aplicación—
 * mientras la tabla lo guardaba en paralelo desde el canje de la invitación y
 * desde `ConsentGate`. Ninguno de los dos miraba donde escribía el otro, así que
 * quien aceptaba en la puerta se encontraba la misma petición otra vez al entrar.
 *
 * Peor: cada uno tenía su propia constante de versión, y ni siquiera del mismo
 * tipo —`'2026-08'` frente a `1`—, de modo que subir una para volver a pedir el
 * consentimiento tras cambiar el texto no subía la otra.
 *
 * Se queda la tabla porque es la única que vale como prueba: no tiene política
 * de escritura, así que el interesado no la puede fabricar ni editar, y guarda el
 * historial entero —dado, retirado, vuelto a dar— que es lo que hay que poder
 * enseñar. La retirada la añadió la migración 0050.
 *
 * ── Qué queda aquí ──────────────────────────────────────────────────────────
 * El CONTENIDO del consentimiento: qué se le dice antes de aceptar. Va junto a la
 * versión (`components/Auth/ConsentNotice.jsx`) porque lo que se guarda es
 * «aceptó esta versión», y esta versión es este texto: los dos tienen que moverse
 * a la vez.
 */

/**
 * Lo que se le dice antes de aceptar, en su idioma y sin rodeos.
 *
 * Si cambias una coma de aquí, sube `CONSENT_VERSION` en `ConsentNotice.jsx`: el
 * consentimiento anterior se dio sobre otro texto y ya no cubre este.
 */
export const CONSENT_POINTS = [
  'Tu entrenador guarda tu peso, tus medidas, tus pliegues y las fotos que subas, para seguir tu progreso.',
  'Solo lo ve tu entrenador — y, si trabaja en equipo, quien tenga tu ficha asignada.',
  'Puedes pedirle en cualquier momento una copia de todo lo que guarda de ti, o que lo borre entero.',
  'Puedes retirar este consentimiento cuando quieras, desde tu portal. Si lo haces, tu entrenador deja de poder tratar tus datos.',
];

/**
 * El estado tal y como lo devuelve `consent_state` (migración 0050), o `null` si
 * esa persona no tiene ninguna fila todavía.
 *
 * Normaliza y nada más: la decisión de qué es «vigente» la toma la base de datos
 * en `needs_consent`, y tenerla también aquí sería volver a tener dos jueces del
 * mismo hecho — que es justo lo que se acaba de quitar.
 *
 * @param {{ kind?: string, version?: string, at?: string } | null} fila
 */
export const consentFromRow = (fila) => {
  if (!fila || !fila.kind) return null;
  return {
    granted: fila.kind === 'granted',
    version: fila.version ? String(fila.version) : null,
    at: fila.at ? String(fila.at) : null,
  };
};
