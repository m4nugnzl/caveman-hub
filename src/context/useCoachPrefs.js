import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

/*
  ══ Las preferencias del entrenador, fuera de AppContext ═════════════════════

  Con la convención de `useRoadmap.js`: gancho que posee su estado y su carga.

  `applyDashboardToAll` NO está aquí aunque la fachada lo agrupe con las
  preferencias: reescribe las fichas de la cartera entera y recarga `clients`,
  que es el dominio de clientes — vive al lado de `reloadClients`, que necesita.
*/

export const useCoachPrefs = ({ session }) => {
  /*
    Cómo mira ESTE entrenador a sus clientes (migración 0035).

    Son dos preguntas distintas y hasta ahora solo existía la segunda: «¿cómo
    miro yo a mis clientes?» —que se repite— y «¿qué necesita ver Marta?» —que es
    la excepción—. Sin la primera, configurar el panel había que repetirlo tantas
    veces como clientes, y el resultado real era que nadie lo configuraba.
  */
  const [coachPrefs, setCoachPrefs] = useState({});
  /*
    Si ya se han LEÍDO, que no es lo mismo que si están vacías.

    Hace falta desde que las plantillas viven aquí: «este entrenador no tiene
    plantilla guardada» es la condición que dispara la subida de la que tenga en
    el navegador, y confundirla con «todavía no han llegado» significa subir la
    plantilla por defecto encima de la suya en cada arranque.
  */
  const [coachPrefsReady, setCoachPrefsReady] = useState(false);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setCoachPrefs({});
      setCoachPrefsReady(false);
      return undefined;
    }

    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId)
        .single();

      // Sin la 0035 la columna no existe. Vacío = «no hay plantilla», que es
      // exactamente como se comportaba la aplicación antes.
      if (cancelado) return;
      setCoachPrefs(error ? {} : data?.preferences || {});
      setCoachPrefsReady(true);
    })();

    return () => {
      cancelado = true;
    };
  }, [session]);

  /**
   * Guarda una sección de las preferencias del entrenador.
   *
   * Fusiona por sección, igual que `updateClientPreferences`: escribir el objeto
   * entero desde el navegador borraría lo que otra pantalla hubiera guardado
   * mientras tanto.
   */
  const updateCoachPreferences = useCallback(
    async (section, patch) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const next = {
        ...coachPrefs,
        [section]: { ...(coachPrefs[section] || {}), ...patch },
      };

      setCoachPrefs(next); // optimista: el cambio se ve al instante
      const { error } = await supabase
        .from('profiles')
        .update({ preferences: next })
        .eq('id', userId);

      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [coachPrefs, session]
  );

  return { coachPrefs, coachPrefsReady, updateCoachPreferences };
};
