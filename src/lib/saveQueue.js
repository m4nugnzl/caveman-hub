/**
 * Cola de guardado serializada por clave, con debounce y estado observable.
 *
 * Resuelve tres problemas distintos:
 *
 * 1. REORDENAMIENTO DE RESPUESTAS. Cada mutación lanzaba su propio upsert
 *    "fire and forget". La red no garantiza el orden de llegada: si una
 *    petición antigua (con datos desactualizados) responde DESPUÉS que una
 *    nueva, la respuesta vieja gana en la base de datos y pisa el cambio
 *    reciente. Desde fuera parece que el trabajo se borra solo.
 *    → Una única petición en vuelo POR CLAVE. Si llegan más cambios mientras
 *      se guarda, se retiene solo el último y se reenvía al terminar.
 *
 * 2. UNA PETICIÓN POR PULSACIÓN. Escribir "102.5" en un campo de kg lanzaba
 *    cinco upserts, y cada uno reserializaba el programa completo del cliente.
 *    → `debounceMs` agrupa la ráfaga. Los cambios estructurales (añadir,
 *      borrar, reordenar) se envían con `immediate: true`.
 *
 * 3. FALLOS SILENCIOSOS. Los errores acababan en console.error mientras la UI
 *    seguía mostrando "✓ Guardado". El usuario perdía trabajo creyéndolo a
 *    salvo.
 *    → `onStatus` publica 'saving' | 'saved' | 'error', el payload fallido se
 *      retiene y `retry(key)` lo reenvía.
 *
 * 4. LA PESTAÑA QUE MUERE. Los tres anteriores se resolvían en MEMORIA, así que
 *    un payload retenido esperando reintento desaparecía si el navegador cerraba
 *    la pestaña — que es exactamente lo que pasa en un gimnasio con mala
 *    cobertura y un móvil con poca memoria.
 *    → `store` escribe lo pendiente en el navegador y lo borra al confirmarse.
 *      Ver `lib/pendingSaves`. Es opcional: sin él, la cola se comporta como
 *      antes.
 */

const DEFAULT_DEBOUNCE_MS = 600;

export function createSaveQueue({ onStatus, debounceMs = DEFAULT_DEBOUNCE_MS, store = null }) {
  /** key -> { latest, sender, inFlight, timer, sent } */
  const queues = new Map();

  const emit = (key, status, error = null) => onStatus?.(key, { status, error });

  const send = (key) => {
    const q = queues.get(key);
    if (!q || q.inFlight || !q.hasPayload) return;

    q.inFlight = true;
    const payload = q.latest;
    q.sent = payload;
    emit(key, 'saving');

    Promise.resolve()
      .then(() => q.sender(payload))
      .then((result) => {
        const error = result?.error ?? null;
        q.inFlight = false;

        if (error) {
          // Se conserva `latest` para que retry(key) pueda reenviarlo.
          emit(key, 'error', error.message || String(error));
          return;
        }
        if (q.latest !== payload) {
          send(key); // llegó algo más nuevo mientras se guardaba
        } else {
          q.hasPayload = false;
          /* La nota se borra SOLO aquí, cuando el servidor ha confirmado. Si se
             borrara al enviar, un fallo de red dejaría la cola con el payload en
             memoria y sin copia — que es justo el caso que esto viene a cubrir. */
          store?.clear(key);
          emit(key, 'saved');
        }
      })
      .catch((e) => {
        q.inFlight = false;
        emit(key, 'error', e?.message || 'Error de red al guardar');
      });
  };

  const enqueue = (key, payload, sender, { immediate = false } = {}) => {
    const q = queues.get(key) || { inFlight: false, timer: null, hasPayload: false };
    q.latest = payload;
    q.sender = sender;
    q.hasPayload = true;
    queues.set(key, q);

    /* Se apunta ANTES de enviar y no después: lo que hay que sobrevivir es
       precisamente el hueco entre «el usuario lo escribió» y «el servidor lo
       confirmó». Apuntarlo al terminar solo cubriría el caso en el que ya no
       hace falta. */
    store?.save(key, payload);

    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }

    if (immediate || debounceMs === 0) {
      send(key);
    } else {
      // 'saving' desde el primer keystroke: para el usuario, "aún no está a
      // salvo" es la información honesta durante la ventana de debounce.
      emit(key, 'saving');
      q.timer = setTimeout(() => {
        q.timer = null;
        send(key);
      }, debounceMs);
    }
  };

  const retry = (key) => {
    const q = queues.get(key);
    if (!q || !q.hasPayload) return;
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }
    send(key);
  };

  /** Envía ya todo lo que esté esperando en debounce (cierre de pestaña, logout). */
  const flushAll = () => {
    for (const [key, q] of queues) {
      if (q.timer) {
        clearTimeout(q.timer);
        q.timer = null;
        send(key);
      }
    }
  };

  /** ¿Queda algo sin confirmar? Se usa para avisar antes de cerrar la pestaña. */
  const hasUnsaved = () => {
    for (const q of queues.values()) {
      if (q.hasPayload || q.inFlight) return true;
    }
    return false;
  };

  const reset = () => {
    for (const q of queues.values()) if (q.timer) clearTimeout(q.timer);
    queues.clear();
  };

  return { enqueue, retry, flushAll, hasUnsaved, reset };
}