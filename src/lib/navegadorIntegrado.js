/**
 * ¿Se está abriendo esto dentro de otra app (WhatsApp, Instagram, Facebook…)?
 *
 * ══ Por qué importa ═══════════════════════════════════════════════════════
 *
 * El enlace de invitación llega por WhatsApp, y al pulsarlo muchas veces se
 * abre en el navegador de DENTRO de la app. Ahí pasan dos cosas:
 *
 *   · **Google no deja entrar.** Bloquea su acceso en las vistas web integradas
 *     (`disallowed_useragent`): el cliente pulsa «Continuar con Google» y
 *     recibe una pantalla de error de Google en inglés. Así que ahí el botón no
 *     se ofrece; se explica cómo abrir el enlace en Safari o Chrome.
 *   · **La sesión se queda dentro.** Al terminar, la cuenta está iniciada en el
 *     navegador de WhatsApp y en ningún otro: mañana abrirá Safari y no estará
 *     dentro. La pantalla de «Todo listo» se lo dice.
 *
 * ── Cómo se reconoce ──────────────────────────────────────────────────────
 * Por su firma: las apps grandes se anuncian en el user agent (`Instagram`,
 * `FBAN`, `WhatsApp`…). Y las que no, por cómo es la vista web: en Android
 * llevan `; wv)`; en iPhone les falta el `Safari/` que llevan Safari, Chrome y
 * la hoja de Safari que usan las apps bien hechas. La hoja de Safari (iOS) y
 * las pestañas de Chrome (Android) NO cuentan: ahí Google sí deja entrar.
 *
 * Es una heurística, y falla hacia el lado bueno: si no reconoce la app, se
 * ofrece Google como siempre y lo peor que pasa es lo que pasaba antes.
 */

const APPS = [
  ['WhatsApp', /WhatsApp/i],
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['Messenger', /Messenger/i],
  ['TikTok', /musical_ly|Bytedance|TikTok/i],
  ['LinkedIn', /LinkedInApp/i],
  ['Telegram', /Telegram/i],
  ['Line', /\bLine\//],
  ['WeChat', /MicroMessenger/i],
  ['Snapchat', /Snapchat/i],
];

/**
 * `{ integrado, app }`: si es una vista web integrada, y el nombre de la app
 * cuando se sabe (`null` si no: «esta app»).
 */
export const navegadorIntegrado = (ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') => {
  const texto = String(ua || '');
  const conocida = APPS.find(([, firma]) => firma.test(texto));
  if (conocida) return { integrado: true, app: conocida[0] };

  const android = /Android/i.test(texto);
  if (android && /; wv\)/.test(texto)) return { integrado: true, app: null };

  const ios = /iPhone|iPad|iPod/i.test(texto);
  if (ios && /AppleWebKit/i.test(texto) && !/Safari\//i.test(texto)) return { integrado: true, app: null };

  return { integrado: false, app: null };
};

/** «Safari» en iPhone, «Chrome» en el resto: el navegador al que mandarle. */
export const navegadorDeFuera = (ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') =>
  /iPhone|iPad|iPod/i.test(String(ua || '')) ? 'Safari' : 'Chrome';
