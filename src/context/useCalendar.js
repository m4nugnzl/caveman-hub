import { useCallback } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapEventFromDb } from '@/lib/mappers';

/*
  ══ El calendario, fuera de AppContext ═══════════════════════════════════════

  Con la convención de `useRoadmap.js`. Sin estado propio: los eventos se cargan
  por cliente y a demanda, no todos al arrancar — son la única cosa del proyecto
  que crece sin techo con el tiempo, y nadie mira el calendario de veinte
  clientes a la vez.
*/

export const useCalendar = ({ session }) => {
  const loadEvents = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('client_events')
      .select('*')
      .eq('client_id', clientId)
      .order('date');

    // Sin la migración 0009 la tabla no existe: se devuelve vacío y la pantalla
    // avisa, en lugar de tratarlo como un fallo de carga.
    if (error) return { ok: false, error: error.message, events: [] };
    return { ok: true, events: (data || []).map(mapEventFromDb) };
  }, []);

  const addClientEvent = useCallback(
    async ({ clientId, date, kind, title }) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { data, error } = await supabase
        .from('client_events')
        // `created_by` lo exige la política: cada uno crea lo suyo, y así se sabe
        // quién puso cada cosa cuando el entrenador y el cliente comparten el mes.
        .insert({ client_id: clientId, date, kind, title, created_by: userId })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };
      return { ok: true, event: mapEventFromDb(data) };
    },
    [session]
  );

  const setEventDone = useCallback(async (eventId, done) => {
    const { error } = await supabase.from('client_events').update({ done }).eq('id', eventId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const removeClientEvent = useCallback(async (eventId) => {
    const { error } = await supabase.from('client_events').delete().eq('id', eventId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  return { loadEvents, addClientEvent, setEventDone, removeClientEvent };
};
