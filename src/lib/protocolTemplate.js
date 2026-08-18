/**
 * La plantilla de protocolo del entrenador.
 *
 * ══ Dónde vive, y por qué ha cambiado ══════════════════════════════════════
 *
 * En `profiles.preferences.protocolTemplate` (migración 0035), que es la columna
 * donde ya vivían sus preferencias de panel.
 *
 * Antes vivía en `localStorage`, con un compromiso explícito: **no seguía al
 * entrenador si cambiaba de ordenador o borraba los datos del navegador**. Eso se
 * asumió cuando no había dónde guardarla en el servidor. Ya lo hay —la 0035 la
 * añadió para otra cosa— así que el compromiso deja de tener contrapartida:
 * mantenerlo solo significaba perder la forma de trabajar de alguien por abrir la
 * aplicación en el portátil.
 *
 * ── Lo guardado en el navegador no se tira ──────────────────────────────────
 * `readLocalTemplate` sigue existiendo para una sola cosa: rescatar la plantilla
 * de quien ya tenía una. La pantalla la sube al servidor la primera vez que entra
 * y limpia la copia local. A partir de ahí este archivo solo sabe leer la del
 * servidor.
 *
 * Se guardaba por identificador de usuario para que dos entrenadores que usaran
 * el mismo ordenador no se pisaran la suya; el rescate respeta esa misma clave.
 */

import { CHECKIN_BLOCKS, checkinMode, clientProtocol, defaultProtocol } from '@/domain/protocol';

const key = (userId) => `caveman-protocol:${userId || 'anon'}`;

/**
 * La plantilla del entrenador, sacada de sus preferencias.
 *
 * `null` —y no el protocolo por defecto— cuando no tiene ninguna guardada: es la
 * diferencia entre «no ha configurado nada» y «configuró justo lo de serie», y de
 * ella depende que el rescate del navegador se dispare o no.
 */
export const templateFrom = (coachPrefs) => {
  const raw = coachPrefs?.protocolTemplate;
  if (!raw || typeof raw !== 'object') return null;
  // Mismo saneado que lo de cada cliente: viene de una columna jsonb abierta.
  return clientProtocol({ protocol: raw });
};

/** Lo que se guarda. Es el protocolo entero, que ya está saneado. */
export const templateToPreferences = (protocol) => protocol;

/** La que quedara en el navegador, para subirla una vez. `null` si no hay. */
export const readLocalTemplate = (userId) => {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    return clientProtocol({ protocol: JSON.parse(raw) });
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto: no hay nada que
    // rescatar, y no es un error que deba enseñarse a nadie.
    return null;
  }
};

export const clearLocalTemplate = (userId) => {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* Si no se puede limpiar, la copia vieja se queda ahí sin hacer daño: el
       rescate solo se dispara cuando el servidor no tiene plantilla, y a partir
       de ahora la tiene. */
  }
};

export { defaultProtocol };

/**
 * ¿El protocolo de este cliente coincide con la plantilla?
 *
 * ══ Se comparan TODAS las partes, y hay que acordarse al añadir una ═════════
 *
 * De esta función cuelga el botón «Aplicar a todos»: si dice que todo coincide,
 * el botón se apaga. Así que una parte que se deje fuera no produce una
 * comparación un poco peor — produce **una pantalla que afirma que tus clientes
 * ya tienen algo que no tienen**, y sin forma de dárselo.
 *
 * Ya ha pasado dos veces. La primera con los bloques del check-in: cambiar «pide
 * perímetros» dejaba el botón apagado. La segunda con el cuestionario del
 * check-in, que se añadió al protocolo y no aquí: elegir las preguntas de la
 * semana no llegaba a ningún cliente, y el paso no aparecía nunca en su revisión.
 *
 * Por eso ahora se recorre la lista de claves en vez de encadenar comparaciones
 * a mano: `protocol.test.js` comprueba que esta lista cubre el protocolo entero,
 * así que añadir una clave sin tocar esto rompe una prueba en vez de una pantalla.
 */

/** Las listas ordenadas del protocolo. El orden cuenta: es el de la pantalla. */
const LISTAS = ['modules', 'questions', 'checkinQuestions'];

export const matchesTemplate = (template, protocol) =>
  LISTAS.every((k) => (template[k] || []).join() === (protocol[k] || []).join()) &&
  JSON.stringify(template.custom) === JSON.stringify(protocol.custom) &&
  CHECKIN_BLOCKS.every((b) => checkinMode(template, b.id) === checkinMode(protocol, b.id));

/** Lo que compara `matchesTemplate`. Lo usa la prueba que vigila que no falte nada. */
export const COMPARED_KEYS = [...LISTAS, 'custom', 'checkin'];
