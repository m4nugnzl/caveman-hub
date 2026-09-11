/**
 * EL BLOQUE A MEDIAS: lo que se está componiendo, a salvo del navegador.
 *
 * ══ La avería ══════════════════════════════════════════════════════════════
 * El compositor monta el bloque ENTERO en memoria —sus hojas, sus ejercicios,
 * su reparto por días— y no escribe nada en ninguna parte hasta que se pulsa
 * «Cerrar el bloque anterior y abrir este». Es la decisión correcta: un bloque
 * a medias no puede quedarse escrito en la rutina de nadie.
 *
 * Pero tenía un precio que se pagaba entero: cualquier cosa que desmontara el
 * componente se llevaba por delante media hora de trabajo. Una recarga de la
 * página, un despliegue mientras se compone, un clic sin querer en la barra.
 * El dueño, componiendo un bloque de cinco hojas: «tus cambios hacen que
 * pierda todo, y tenga que volver a empezar de 0».
 *
 * ══ Qué se guarda, y dónde ═════════════════════════════════════════════════
 * En `localStorage`, y a propósito, por las dos razones de siempre en esta
 * casa:
 *
 *  · No es del servidor porque no es un dato del cliente todavía. Un bloque sin
 *    abrir no existe para nadie más que para quien lo está escribiendo, y
 *    subirlo obligaría a inventar un estado «borrador» en la rutina que después
 *    habría que limpiar.
 *  · No es `sessionStorage` porque el caso que hay que cubrir es precisamente
 *    el de la pestaña que se va: se cierra, se recarga, se recupera sola.
 *
 * Se guarda por cliente —la llave lleva su id— así que componer para Marta no
 * puede resucitar el bloque a medias de Luis.
 *
 * ══ Y se olvida solo ═══════════════════════════════════════════════════════
 * Al abrir el bloque y al cancelar, que son las dos formas de terminar. Y por
 * fecha: un borrador de hace tres semanas ya no es «lo que estaba haciendo»,
 * es una sorpresa. Misma regla que `intencionDePlan`.
 */

const CLAVE = (clientId) => `caveman-bloque:${clientId || 'anon'}`;

/** Lo que caduca: dos semanas sin tocarlo y deja de ser trabajo en curso. */
const DIAS = 14;

/**
 * El borrador guardado para este cliente, o `null`.
 *
 * Todo lo que salga de aquí es texto que escribió el navegador: se comprueba la
 * forma mínima —que haya hojas y que no sea de otro siglo— antes de devolverlo.
 * Un JSON roto o de otra versión no puede reventar la pantalla: se descarta y
 * se compone desde cero, que es lo que pasaba siempre antes de existir esto.
 */
export const leerBorrador = (clientId) => {
  try {
    const raw = localStorage.getItem(CLAVE(clientId));
    if (!raw) return null;
    const b = JSON.parse(raw);
    if (!b || typeof b !== 'object' || !Array.isArray(b.sesiones)) return null;
    if (!b.at || Date.now() - b.at > DIAS * 24 * 60 * 60 * 1000) {
      olvidarBorrador(clientId);
      return null;
    }
    /* Sin puerta elegida no hay nada que recuperar: eso es el paso 1 en
       blanco, que ya es donde se entra. */
    if (!b.origen?.tipo) return null;
    return b;
  } catch {
    return null;
  }
};

/** Lo deja escrito. Silencioso a propósito: ver abajo. */
export const guardarBorrador = (clientId, borrador) => {
  try {
    localStorage.setItem(CLAVE(clientId), JSON.stringify({ ...borrador, at: Date.now() }));
  } catch {
    /*
      Se queda sin guardar y no pasa nada más. Esto es una RED, no el sitio
      donde vive el bloque: el bloque vive en el estado de la pantalla, que
      sigue intacto. Avisar aquí sería interrumpir a quien está componiendo
      para contarle un problema que no le impide seguir —y el caso real es el
      navegador en modo privado con la cuota a cero, donde el aviso saltaría en
      cada tecla.
    */
  }
};

export const olvidarBorrador = (clientId) => {
  try {
    localStorage.removeItem(CLAVE(clientId));
  } catch {
    /* Un borrador viejo que no se puede borrar caduca solo a los 14 días. */
  }
};
