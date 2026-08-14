/**
 * Lo último que se rompió, guardado por si alguien abre un ticket.
 *
 * ══ El problema que resuelve ═══════════════════════════════════════════════
 *
 * Un ticket dice «no me deja guardar la dieta». Eso no es diagnosticable: no
 * dice en qué pantalla, ni qué error salió, ni si fue una vez o veinte. La ida y
 * vuelta para averiguarlo cuesta dos días, y a menudo el entrenador ya no
 * recuerda qué estaba haciendo.
 *
 * Aquí se apunta cada fallo según ocurre —sin preguntarle nada a nadie— y el
 * formulario de soporte se lleva los últimos cuando se manda el ticket. La
 * diferencia práctica es entre «no me deja guardar» y «`new row violates
 * row-level security policy for table "workout_data"`, tres veces, en
 * /c/abc/rutina».
 *
 * ══ Por qué en memoria y no en `localStorage` ══════════════════════════════
 *
 * Porque son datos de depuración de la sesión en curso, no algo que deba
 * sobrevivir al navegador. Guardarlos en disco significa acumular mensajes de
 * error de un usuario indefinidamente, y eso es una recogida de datos que habría
 * que declarar y que nadie ha pedido.
 *
 * Al recargar la página se pierde, y es correcto: si el fallo sigue pasando,
 * vuelve a apuntarse.
 *
 * ══ Qué NO se guarda ═══════════════════════════════════════════════════════
 *
 * Nada que se escriba en un formulario. Solo el mensaje del error, de dónde
 * viene y en qué ruta pasó. Los mensajes se recortan porque una traza entera no
 * aporta más que sus primeras líneas y sí engorda el ticket.
 */

/** Cuántos fallos se recuerdan. Los más viejos se van. */
const MAX = 12;

/** Tope por mensaje. Una traza de Postgres cabe de sobra; una de React, no. */
const MAX_TEXTO = 300;

const buffer = [];

const recortar = (value) => {
  const texto = typeof value === 'string' ? value : String(value?.message || value || '');
  return texto.length > MAX_TEXTO ? `${texto.slice(0, MAX_TEXTO)}…` : texto;
};

/**
 * Apunta un fallo.
 *
 * `source` dice de qué parte viene —«guardado», «carga», «js»— para poder
 * distinguir de un vistazo un error de la aplicación de uno del navegador.
 *
 * Los repetidos NO se acumulan: se cuenta cuántas veces ha pasado el mismo. Sin
 * eso, un fallo en bucle llenaría los doce huecos con la misma línea y taparía
 * todo lo anterior, que suele ser lo que explica por qué empezó.
 */
export const recordIssue = (source, error, extra = {}) => {
  const message = recortar(error);
  if (!message) return;

  const ultimo = buffer[buffer.length - 1];
  if (ultimo && ultimo.source === source && ultimo.message === message) {
    ultimo.count += 1;
    ultimo.at = new Date().toISOString();
    return;
  }

  buffer.push({
    source,
    message,
    count: 1,
    at: new Date().toISOString(),
    // La ruta importa tanto como el error: el mismo mensaje significa cosas
    // distintas en la rutina y en la dieta.
    path: typeof window === 'undefined' ? '' : window.location.pathname,
    ...extra,
  });

  if (buffer.length > MAX) buffer.shift();
};

/** Los fallos apuntados, del más reciente al más antiguo. */
export const recentIssues = () => [...buffer].reverse();

/** Para las pruebas y para «empezar de cero» tras resolver algo. */
export const clearIssues = () => {
  buffer.length = 0;
};

/**
 * Engancha los fallos que NO pasan por nuestro código: excepciones sueltas y
 * promesas rechazadas sin capturar.
 *
 * Son justo los que hoy no dejan rastro en ningún sitio —van a la consola, que
 * nadie tiene abierta— y los que más veces están detrás de «se me quedó la
 * pantalla en blanco».
 *
 * Devuelve la función para desengancharlo, que es lo que espera un `useEffect`.
 */
export const installGlobalHandlers = () => {
  if (typeof window === 'undefined') return () => {};

  const onError = (event) => recordIssue('js', event.message || event.error);
  const onRejection = (event) => recordIssue('promesa', event.reason);

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
};
