import { useCallback, useMemo } from 'react';

import { emptyNutrition } from '@/domain/nutrition';
import { operacionesDeLaDieta } from './operacionesDeLaDieta';

/*
  ══ La dieta, fuera de AppContext ════════════════════════════════════════════

  Con la convención de `useRoadmap.js` y la frontera de `useClients.js`: recibe
  `persist` y el estado espejado del bloque, que sigue siendo del proveedor.

  Los verbos viven en `operacionesDeLaDieta` (letra e, 26 sep 2026), que no
  sabe dónde está la dieta. Aquí se atan a la del cliente: en memoria y en la
  cola de guardado. `dietaDe(clientId)` los da ya atados (es por donde entra el
  editor, `useEditorDeDieta`); los de siempre, con `clientId` delante, siguen
  para quien reparte o copia entre clientes.

  `editFood` NO está aquí: escribe a la vez en la dieta abierta (con
  `patchFood`) y en la biblioteca del equipo, así que es el puente entre dos
  dominios y vive en la puerta del editor (`useEditorDeDieta`).
*/

export const useNutrition = ({ nutritionRef, setNutrition, persist }) => {
  const applyNutrition = useCallback(
    (clientId, updater, { immediate = true } = {}) => {
      const current = nutritionRef.current[clientId] || emptyNutrition();
      const next = updater(current);
      if (next === current) return current;

      setNutrition({ ...nutritionRef.current, [clientId]: next });
      persist('nutrition', clientId, next, { immediate });
      return next;
    },
    [nutritionRef, persist, setNutrition]
  );

  /** Los verbos de la dieta de UN cliente. */
  const dietaDe = useCallback(
    (clientId) =>
      operacionesDeLaDieta({
        aplicar: (updater, opciones) => applyNutrition(clientId, updater, opciones),
        leer: () => nutritionRef.current[clientId] || emptyNutrition(),
      }),
    [applyNutrition, nutritionRef]
  );

  /* Los mismos verbos con `clientId` delante, que es como los llama el resto de
     la aplicación. Se atan una vez: su identidad es estable, como cuando eran
     `useCallback` sueltos. */
  const conCliente = useMemo(() => {
    const nombres = Object.keys(dietaDe(null));
    return Object.fromEntries(nombres.map((n) => [n, (clientId, ...resto) => dietaDe(clientId)[n](...resto)]));
  }, [dietaDe]);

  return { ...conCliente, dietaDe };
};
