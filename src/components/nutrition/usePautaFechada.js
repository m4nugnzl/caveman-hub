import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { fotoDeVersion } from '@/domain/reviews';

/**
 * LA PAUTA FECHADA del cliente abierto, con la forma de la foto del plan.
 *
 * Las versiones (`nutrition_plan_versions`, 0124) llegan de `useRoadmap` con la
 * forma de la dieta. Aquí se convierten en lo que leen `nutritionTrack` y
 * `dietLog` —`[{ dia, snapshot }]`—, con la media del ciclo calculada con los
 * días de entreno de hoy, igual que la foto de una revisión.
 *
 * Un solo sitio para esta conversión: la usan la Revisión, el Resumen, la
 * evolución de la dieta y el roadmap, y si cada uno la hiciera a su manera
 * volverían a discrepar sobre cuándo cambiaron las kcal.
 */
export const usePautaFechada = () => {
  const { activeClient, dietVersions, workoutData } = useApp();
  const programa = workoutData?.[activeClient?.id] || null;

  return useMemo(
    () =>
      (dietVersions || []).map((v) => ({
        dia: v.dia,
        snapshot: fotoDeVersion({ nutrition: v.nutrition, program: programa, client: activeClient }),
      })),
    [dietVersions, programa, activeClient]
  );
};
