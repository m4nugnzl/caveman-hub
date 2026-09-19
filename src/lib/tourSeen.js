/**
 * Si esta cuenta ya ha visto la bienvenida.
 *
 * ── Por qué el navegador y no la base de datos ──────────────────────────────
 * Mismo criterio que `protocolTemplate.js`: no hay ninguna tabla de ajustes de
 * usuario donde meter esto, y pedir una migración para un booleano de interfaz no
 * lo justifica.
 *
 * El compromiso, explícito: **la bienvenida vuelve a salir una vez en cada
 * navegador nuevo**. Es el peor caso y es leve —un diálogo que se cierra con
 * Escape—, mientras que la alternativa (no mostrarla nunca por no tener dónde
 * apuntarlo) deja a quien entra por primera vez delante de una aplicación vacía
 * sin saber por dónde empezar.
 *
 * Se guarda por identificador de usuario para que dos personas que compartan
 * ordenador no se salten la del otro.
 *
 * ── Por qué un número y no `true` ───────────────────────────────────────────
 * Es la versión de la bienvenida. El día que cambien los pasos, subir `VERSION`
 * hace que se vuelva a enseñar a quien ya la vio, que es justo lo que se querría.
 */

const VERSION = 1;

const key = (userId) => `caveman-tour:${userId || 'anon'}`;

/**
 * ¿Ya la ha visto?
 *
 * Si el almacenamiento está bloqueado (modo privado, permisos), se responde que
 * SÍ. La otra opción —responder que no— significaría abrir el diálogo en cada
 * recarga sin forma de callarlo, que es mucho peor que no verlo.
 */
export const hasSeenTour = (userId) => {
  try {
    return Number(localStorage.getItem(key(userId))) >= VERSION;
  } catch {
    return true;
  }
};

/** Anota que ya la ha visto. Devuelve si se pudo guardar. */
export const markTourSeen = (userId) => {
  try {
    localStorage.setItem(key(userId), String(VERSION));
    return true;
  } catch {
    // Sin persistencia, la bienvenida vuelve en la próxima carga. No es un error
    // que deba interrumpir nada: quien cierra el diálogo sigue trabajando igual.
    return false;
  }
};

/* ── Las guías de «Aprende» que ya ha hecho ────────────────────────────────
   Mismo criterio que arriba —el navegador, por usuario— y mismo compromiso:
   en un navegador nuevo las guías vuelven a salir sin la marca de hechas, que
   es un error leve. Solo sirve para marcar la lista; no bloquea nada. */

const claveGuias = (userId) => `caveman-aprende:${userId || 'anon'}`;

/** Los identificadores de las guías terminadas. Sin almacenamiento, ninguna. */
export const guiasHechas = (userId) => {
  try {
    const lista = JSON.parse(localStorage.getItem(claveGuias(userId)) || '[]');
    return Array.isArray(lista) ? lista.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/** Anota una guía como terminada. Devuelve la lista nueva. */
export const marcarGuiaHecha = (userId, id) => {
  const lista = guiasHechas(userId);
  if (lista.includes(id)) return lista;
  const nueva = [...lista, id];
  try {
    localStorage.setItem(claveGuias(userId), JSON.stringify(nueva));
  } catch {
    // Sin persistencia la marca se pierde al recargar. La guía ya se ha hecho:
    // no hay nada que interrumpir por ello.
  }
  return nueva;
};
