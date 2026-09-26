/**
 * La invitación que alguien abrió y todavía no ha canjeado.
 *
 * ══ Por qué hace falta recordarla ══════════════════════════════════════════
 *
 * El token viaja en la dirección (`/invitacion/<token>`) y en ningún otro sitio.
 * Cualquier camino que devuelva a esta persona a OTRA dirección lo pierde: el
 * correo de confirmación con un `redirectTo` que no está en la lista de
 * Supabase (vuelve al «Site URL», la raíz), una pestaña cerrada a mitad del
 * alta, o simplemente escribir la dirección de la app a mano. En los tres casos
 * aterriza en la raíz con una cuenta vacía que parece la de un entrenador
 * nuevo, nunca ve el consentimiento y su ficha no se enlaza.
 *
 * Así que la pantalla de invitación lo apunta al abrirse y `App` lo mira al
 * arrancar: una cuenta sin fichas con una invitación pendiente vuelve a ella en
 * lugar de quedarse en un panel vacío. Se olvida al canjearla y en cuanto se
 * sabe que no sirve (caducada, usada, anulada, o es del propio entrenador).
 *
 * ── Por qué el navegador ──────────────────────────────────────────────────
 * Es una red de seguridad, no la fuente de verdad: si el almacenamiento está
 * bloqueado, simplemente no hay red y el enlace sigue funcionando igual.
 * Caduca a los 14 días, lo mismo que el enlace (0015): pasado eso no hay nada
 * que recuperar.
 */

const CLAVE = 'caveman-invitacion-pendiente';
const VIDA_MS = 14 * 24 * 60 * 60 * 1000;
const FORMA = /^[0-9a-f]{64}$/;

/** Apunta el token de la invitación abierta. */
export const recordarInvitacion = (token) => {
  if (!FORMA.test(String(token || ''))) return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ token, at: Date.now() }));
  } catch {
    // Sin almacenamiento no hay red de seguridad; el enlace funciona igual.
  }
};

/** El token pendiente, o `null` si no hay, está caducado o no se puede leer. */
export const invitacionPendiente = (ahora = Date.now()) => {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!guardada || !FORMA.test(String(guardada.token || ''))) return null;
    if (!(ahora - Number(guardada.at) < VIDA_MS)) return null;
    return guardada.token;
  } catch {
    return null;
  }
};

/** La olvida. Con token, solo si es ESA la que estaba apuntada. */
export const olvidarInvitacion = (token = null) => {
  try {
    if (token) {
      const guardada = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (guardada?.token !== token) return;
    }
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que olvidar si no se pudo guardar.
  }
};
