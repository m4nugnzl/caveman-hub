/**
 * La copia local de lo que hay cargado: lo que hace que la aplicación ABRA CON
 * DATOS sin conexión.
 *
 * ══ Qué le faltaba al camino offline ════════════════════════════════════════
 *
 * El proyecto tenía ya tres de las cuatro piezas:
 *
 *   · el service worker (`scripts/sw.mjs`) hace que la aplicación se pinte sin red;
 *   · la cola (`lib/saveQueue`) ordena y reintenta lo que se escribe;
 *   · la nota del navegador (`lib/pendingSaves`) hace que lo escrito sobreviva a
 *     que el móvil mate la pestaña.
 *
 * Las tres cubren la ESCRITURA. La lectura no tenía nada: `loadForUser` va
 * derecho a Supabase, y sin red devolvía «No se pudo cargar tu perfil». O sea que
 * abrir el icono en un sótano daba una aplicación vacía — se podía pintar, pero
 * no había nada que mirar ni, por tanto, sobre lo que trabajar.
 *
 * Esto es esa cuarta pieza: al terminar cada carga (y después de cada cambio) se
 * guarda aquí el estado ya MAPEADO, y al arrancar sin red se rehidrata desde
 * aquí en vez de preguntar a un servidor que no está.
 *
 * ══ Por qué IndexedDB y no `localStorage` ═══════════════════════════════════
 *
 * Porque no cabe. `localStorage` da unos 5 MB por dominio y guarda TEXTO: un
 * programa de entrenamiento serializado ronda los 100 KB, así que una cartera de
 * veinte personas se sale ella sola —y de paso dejaría sin sitio a las notas de
 * `lib/pendingSaves`, que es la pieza que de verdad no puede fallar—.
 *
 * IndexedDB tiene cuota de cientos de megas y guarda OBJETOS: no hay que
 * serializar ni parsear la cartera entera en el hilo de la interfaz, que con un
 * `JSON.stringify` de varios megas es una pantalla congelada en cada guardado.
 *
 * ══ Lo que esto NO es ═══════════════════════════════════════════════════════
 *
 * No es una base de datos local ni una fuente de verdad. Es una FOTO del último
 * estado bueno, para poder seguir trabajando mientras no hay red. La verdad sigue
 * estando en el servidor y las escrituras siguen yendo por la cola de siempre;
 * lo que se escribe sin conexión no vive aquí, vive en `lib/pendingSaves`.
 *
 * Y por eso la foto lleva dentro las VERSIONES leídas de cada bloque
 * (`versionsRef` de `AppContext`): al volver la red, las escrituras siguen
 * llevando su guardia de «esto es lo que yo leí», así que si alguien tocó la
 * ficha mientras tanto sale el aviso de conflicto en vez de pisarle el trabajo.
 * Sin eso, trabajar offline sería exactamente el borrado silencioso que el resto
 * de la aplicación se dedica a impedir.
 *
 * ── Por usuario, como las notas ─────────────────────────────────────────────
 * Misma razón que en `lib/pendingSaves`: dos entrenadores en el mismo ordenador
 * no pueden verse la cartera el uno al otro. Al cerrar sesión se borra la suya.
 */

const BASE = 'caveman';
const ALMACEN = 'instantaneas';

/**
 * La versión de la FORMA de lo guardado.
 *
 * Se sube cuando cambia qué se mete en la foto o cómo lo mapea `lib/mappers`. Una
 * foto vieja rehidratada sobre un código nuevo es peor que no tener foto: la
 * aplicación arrancaría con campos que ya no existen y fallaría en sitios que no
 * tienen nada que ver con esto. Al no coincidir, se tira y se pide al servidor.
 */
const VERSION = 1;

const disponible = () => typeof indexedDB !== 'undefined';

/** Abre la base. Devuelve `null` si el navegador no deja (modo privado, cuota). */
const abrir = () =>
  new Promise((resolve) => {
    if (!disponible()) {
      resolve(null);
      return;
    }
    let peticion;
    try {
      peticion = indexedDB.open(BASE, 1);
    } catch {
      resolve(null);
      return;
    }
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'userId' });
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => resolve(null);
    /* Firefox en modo privado deja la petición colgada sin resolver ni fallar.
       Sin esto, el arranque se quedaría esperando una base que no va a llegar. */
    peticion.onblocked = () => resolve(null);
  });

/** Envuelve una transacción y no deja escapar nunca un fallo: sin copia se sigue. */
const conAlmacen = async (modo, trabajo) => {
  const db = await abrir();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(ALMACEN, modo);
      const peticion = trabajo(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolve(peticion?.result ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
};

/**
 * Guarda la foto del estado de este usuario.
 *
 * `datos` va tal cual, sin serializar: IndexedDB usa el algoritmo de clonado
 * estructurado, que se traga objetos, arrays y fechas. Lo que NO se traga son
 * funciones ni referencias circulares, y aquí no llega ninguna de las dos —esto
 * es estado mapeado desde filas de la base de datos—.
 */
export const guardarInstantanea = (userId, datos, at = Date.now()) => {
  if (!userId) return Promise.resolve(null);
  return conAlmacen('readwrite', (almacen) => almacen.put({ userId, v: VERSION, at, datos }));
};

/**
 * La última foto de este usuario, o `null` si no hay o es de otra época.
 *
 * Devuelve también CUÁNDO se tomó, porque la interfaz tiene que poder decirlo:
 * enseñar datos de ayer sin avisar de que son de ayer es la clase de mentira que
 * hace que alguien programe sobre información vieja.
 */
export const leerInstantanea = async (userId) => {
  if (!userId) return null;
  const fila = await conAlmacen('readonly', (almacen) => almacen.get(userId));
  if (!fila || fila.v !== VERSION || !fila.datos) return null;
  return { at: fila.at, datos: fila.datos };
};

/** Se llama al cerrar sesión: la cartera de uno no se queda en el aparato de otro. */
export const borrarInstantanea = (userId) => {
  if (!userId) return Promise.resolve(null);
  return conAlmacen('readwrite', (almacen) => almacen.delete(userId));
};
