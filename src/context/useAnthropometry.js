import { useCallback } from 'react';

import { newId } from '@/lib/ids';
import { emptyAnthropometry } from '@/domain/anthropometry';

/*
  ══ La antropometría, fuera de AppContext ════════════════════════════════════

  Con la convención de `useRoadmap.js` y la frontera de `useClients.js`: el
  gancho recibe `persist` (la puerta a la cola de guardado) y el estado
  espejado del bloque, que sigue siendo del proveedor porque lo siembra el
  arranque y lo lee el conflicto de concurrencia.
*/

export const useAnthropometry = ({ anthroRef, setAnthropometry, persist }) => {
  const applyAnthro = useCallback(
    (clientId, updater, { immediate = true } = {}) => {
      const current = anthroRef.current[clientId] || emptyAnthropometry();
      const next = updater(current);
      if (next === current) return current;

      setAnthropometry({ ...anthroRef.current, [clientId]: next });
      persist('anthro', clientId, next, { immediate });
      return next;
    },
    [anthroRef, persist, setAnthropometry]
  );

  /**
   * Añade una revisión. El histórico se mantiene ordenado por fecha
   * descendente, y si ya existe un registro en la misma fecha se sustituye:
   * dos pesajes del mismo día no son dos puntos de tendencia.
   */
  const addAnthropometryLog = useCallback(
    (clientId, log) =>
      applyAnthro(clientId, (a) => {
        const rest = (a.history || []).filter((h) => h.date !== log.date);
        return {
          ...a,
          history: [{ id: log.id || newId('log'), ...log }, ...rest].sort((x, y) =>
            String(y.date).localeCompare(String(x.date))
          ),
        };
      }),
    [applyAnthro]
  );

  const removeAnthropometryLog = useCallback(
    (clientId, logId) =>
      applyAnthro(clientId, (a) => ({
        ...a,
        history: (a.history || []).filter((h, i) => (h.id ? h.id !== logId : i !== logId)),
      })),
    [applyAnthro]
  );

  /**
   * APUNTAR UNA MEDIDA DE UN DÍA, sin tocar nada más de ese día.
   *
   * ══ Por qué no sirve `addAnthropometryLog` ═════════════════════════════════
   *
   * Porque ése SUSTITUYE el registro de la misma fecha, y es lo correcto para lo
   * que hace —una revisión reentregada es una revisión, no dos—. Aquí lo que se
   * escribe es una casilla de la rejilla de la semana: anotar la temperatura del
   * martes no puede llevarse por delante el peso que se anotó esa mañana.
   *
   * Así que se funde con lo que haya de ese día, o se crea el registro si no
   * había ninguno. `null` BORRA la medida en vez de guardar un cero: vaciar la
   * casilla de una glucosa significa «no la tomé», y un cero ahí es una
   * hipoglucemia inventada. Ver `domain/medidas.js`.
   */
  const apuntarMedida = useCallback(
    (clientId, date, id, valor) =>
      applyAnthro(clientId, (a) => {
        const history = a.history || [];
        const previo = history.find((h) => h.date === date) || null;
        const medidas = { ...(previo?.medidas || {}) };
        if (valor === null || valor === undefined) delete medidas[id];
        else medidas[id] = valor;

        const siguiente = { ...(previo || { id: newId('log'), date, weight: null }) };
        if (Object.keys(medidas).length > 0) siguiente.medidas = medidas;
        else delete siguiente.medidas;

        /* Un registro que se queda sin peso y sin nada medido no es un registro:
           es un punto muerto en cada serie y una fila vacía en el historial. */
        const vacio =
          siguiente.weight === null &&
          !siguiente.skinFolds &&
          !siguiente.perimeters &&
          !siguiente.medidas;

        const resto = history.filter((h) => h.date !== date);
        return {
          ...a,
          history: (vacio ? resto : [siguiente, ...resto]).sort((x, y) =>
            String(y.date).localeCompare(String(x.date))
          ),
        };
      }),
    [applyAnthro]
  );

  /** Edita un registro ya guardado (corregir un peso mal teclado). */
  const updateAnthropometryLog = useCallback(
    (clientId, logId, fields) =>
      applyAnthro(clientId, (a) => ({
        ...a,
        history: (a.history || []).map((h) => (h.id === logId ? { ...h, ...fields } : h)),
      })),
    [applyAnthro]
  );

  return { addAnthropometryLog, removeAnthropometryLog, updateAnthropometryLog, apuntarMedida };
};
