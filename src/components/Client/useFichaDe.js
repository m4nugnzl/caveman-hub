import { useCallback } from 'react';

import { useApp } from '@/context/AppContext';
import { findByName } from '@/domain/catalog';

/**
 * LA FICHA DE UN EJERCICIO, YA UNIDA: lo de su entrenador y lo del catálogo.
 *
 * ══ Por qué es un gancho y no una línea en cada pantalla ═══════════════════
 *
 * Porque son DOS fuentes con dos permisos distintos —el vídeo y las pautas
 * llegan por la función `exercise_sheets` (0100), y el músculo, el material y la
 * descripción salen de `catalog_exercises`, que cualquiera puede leer (0033)— y
 * unirlas es el trabajo de la frontera entre el contexto y las vistas.
 *
 * Vivía dentro de `ClientRoutineRoute`. Desde que la ficha se abre desde tres
 * sitios —la portada del teléfono, la hoja de la sesión y el cajón de
 * ejercicios— copiarla en cada uno habría sido tener tres uniones que se
 * desincronizan.
 *
 * ── Devuelve `null` si no lo ha puesto su entrenador ──────────────────────
 * Y ese `null` es lo que decide que el renglón NO lleve marca. La condición es
 * que haya vídeo o pautas: la descripción del catálogo, sola, no abre ficha. Es
 * la regla de la 0098 —«si no lo pone el entrenador, no existe»— y evita que
 * trescientos ejercicios aparezcan de repente con una marca que solo lleva texto
 * genérico detrás.
 */
export const useFichaDe = () => {
  const { sheetOf, catalogExercises } = useApp();

  return useCallback(
    (name) => {
      const suyo = sheetOf?.(name);
      if (!suyo) return null;

      const general = findByName(catalogExercises, name);
      return {
        videoUrl: suyo.videoUrl,
        cue: suyo.cue,
        muscle: general?.muscle ?? null,
        equipment: general?.equipment ?? null,
        description: general?.description ?? null,
      };
    },
    [sheetOf, catalogExercises]
  );
};
