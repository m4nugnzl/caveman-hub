/**
 * Los mensajes de Supabase Auth, en castellano.
 *
 * Llegan en inglés y describen el fallo desde el punto de vista del servidor
 * («Invalid login credentials»). Quien los lee está intentando entrar en su cuenta
 * y necesita saber qué hacer a continuación, que no es lo mismo.
 *
 * Vive aquí porque lo usan las dos pantallas de acceso —el login y el cambio de
 * contraseña— y una tabla de traducciones duplicada acaba divergiendo: la segunda
 * copia no se entera de los mensajes nuevos.
 *
 * Lo que no esté en la tabla se muestra tal cual: un mensaje en inglés es peor que
 * uno en castellano y mucho mejor que «se ha producido un error».
 */

/**
 * Mínimo de caracteres de una contraseña.
 *
 * Se comprueba en el navegador para avisar antes de enviar, pero **quien lo impone
 * es Supabase Auth** (Authentication → Policies). Si se sube aquí sin subirlo allí,
 * esto es solo una molestia; si se sube allí sin tocar esto, el servidor rechaza
 * contraseñas que el formulario daba por buenas.
 */
export const MIN_PASSWORD = 8;

const MESSAGES = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'Email not confirmed': 'Tienes que confirmar tu email antes de entrar.',
  'User already registered': 'Ya existe una cuenta con ese email.',

  // Cambio de contraseña.
  'New password should be different from the old password.':
    'La contraseña nueva tiene que ser distinta de la anterior.',
  'Auth session missing!': 'El enlace ya no es válido. Pide otro desde la pantalla de acceso.',
  'Password should be at least 6 characters.': `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,

  // Límite de envíos. Sale al pulsar dos veces seguidas «enviar enlace», y sin
  // traducir parece que algo se ha roto cuando lo que pasa es que hay que esperar.
  'For security purposes, you can only request this after 60 seconds.':
    'Acabas de pedir uno. Espera un minuto antes de volver a intentarlo.',

  /*
    ── Los dos fallos del correo saliente ──────────────────────────────────────

    No son el límite de arriba, que es por persona y se pasa esperando un minuto.
    Estos dos son del PROYECTO: el techo de envíos por hora del SMTP compartido de
    Supabase y el fallo del propio servidor de correo. Llegaban sin traducir —«email
    rate limit exceeded»— y el que los lee entiende que ha hecho algo mal y vuelve a
    pulsar, que es justo lo que no hay que hacer.

    Se dice que el problema no es suyo y se le da la salida que sí tiene: su
    entrenador puede devolverle el acceso sin correo (migración 0083). Ese camino se
    nombra aquí porque este mensaje es lo único que va a leer.

    El arreglo de fondo es un SMTP propio: `docs/correo-transaccional.md`.
  */
  'email rate limit exceeded':
    'Ahora mismo no podemos enviar correos. No es cosa tuya: vuelve a intentarlo dentro de un rato y, si eres cliente de un entrenador, pídele que te mande un enlace de acceso nuevo.',
  'Error sending recovery email':
    'No hemos podido enviar el correo. Vuelve a intentarlo dentro de un rato y, si eres cliente de un entrenador, pídele que te mande un enlace de acceso nuevo.',
  'Error sending confirmation email':
    'No hemos podido enviar el correo de confirmación. Vuelve a intentarlo dentro de un rato.',
};

export const traduceAuthError = (message = '') =>
  MESSAGES[message] ||
  // El límite de envíos llega con el número de segundos incrustado, así que no
  // casa por igualdad exacta.
  (/only request this after/i.test(message)
    ? 'Acabas de pedir uno. Espera un momento antes de volver a intentarlo.'
    : message);
