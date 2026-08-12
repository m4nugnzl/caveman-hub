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
 * Por eso vive en `clients.preferences.consent` —la columna que el propio cliente
 * puede escribir por RPC (migración 0008)— y no en una casilla del formulario de
 * alta que rellena el entrenador. **El consentimiento lo da él, no se lo dan.**
 *
 * ── La versión, y por qué importa ───────────────────────────────────────────
 * Si mañana cambia lo que se hace con los datos —por ejemplo, que un segundo
 * entrenador del equipo pueda ver sus fotos— el consentimiento anterior ya no
 * cubre el nuevo tratamiento. Subir `CONSENT_VERSION` hace que se vuelva a pedir
 * a todo el mundo, que es exactamente lo que la ley espera.
 */

/** Súbela cuando cambie QUÉ se trata o QUIÉN lo ve. */
export const CONSENT_VERSION = 1;

/**
 * Lo que se le dice antes de aceptar, en su idioma y sin rodeos.
 *
 * Se declara aquí y no en el componente porque es el CONTENIDO del
 * consentimiento: lo que se guarda es «aceptó esta versión», y esta versión es
 * este texto. Tenerlo junto al número es lo que hace que los dos se muevan a la
 * vez.
 */
export const CONSENT_POINTS = [
  'Tu entrenador guarda tu peso, tus medidas, tus pliegues y las fotos que subas, para seguir tu progreso.',
  'Solo lo ve tu entrenador — y, si trabaja en equipo, quien tenga tu ficha asignada.',
  'Puedes pedirle en cualquier momento una copia de todo lo que guarda de ti, o que lo borre entero.',
  'Puedes retirar este consentimiento cuando quieras. Si lo haces, díselo: dejará de tratar tus datos y podrá borrarlos.',
];

/**
 * El consentimiento tal y como está guardado, o `null` si nunca hubo ninguno.
 *
 * Devuelve también los RETIRADOS, con su fecha. Es intencionado: «retiró el
 * consentimiento el 3 de marzo» es un dato que el entrenador tiene que ver —le
 * dice que debe dejar de tratar esos datos— y borrarlo del registro dejaría la
 * retirada sin constancia, que es el mismo problema que tenía no registrar la
 * aceptación.
 */
export const clientConsent = (preferences) => {
  const raw = preferences?.consent;
  if (!raw || typeof raw !== 'object') return null;

  const acceptedAt = raw.acceptedAt ? String(raw.acceptedAt) : null;
  const withdrawnAt = raw.withdrawnAt ? String(raw.withdrawnAt) : null;
  if (!acceptedAt && !withdrawnAt) return null;

  return { acceptedAt, withdrawnAt, version: Number(raw.version) || 0 };
};

/**
 * ¿Está cubierto el tratamiento actual?
 *
 * Tres condiciones, y las tres tienen que darse: que aceptara, que no lo haya
 * retirado, y que lo aceptara sobre la versión vigente —un consentimiento de una
 * versión anterior se dio sobre otra cosa.
 */
export const hasConsent = (preferences) => {
  const consent = clientConsent(preferences);
  return Boolean(
    consent && consent.acceptedAt && !consent.withdrawnAt && consent.version >= CONSENT_VERSION
  );
};

/**
 * Lo que se escribe al aceptar.
 *
 * `withdrawnAt: null` explícito, y no omitido: `updateClientPreferences` FUSIONA
 * por sección, así que omitir la clave dejaría la fecha de retirada anterior
 * puesta y quien vuelve a aceptar seguiría contando como retirado.
 */
export const grantConsent = (now = new Date().toISOString()) => ({
  acceptedAt: now,
  withdrawnAt: null,
  version: CONSENT_VERSION,
});

/**
 * Lo que se escribe al retirarlo.
 *
 * Se conserva la versión sobre la que se había aceptado: forma parte de lo que
 * pasó. Lo que se anula es la aceptación.
 */
export const withdrawConsent = (now = new Date().toISOString()) => ({
  acceptedAt: null,
  withdrawnAt: now,
});
