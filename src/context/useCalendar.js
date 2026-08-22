import { useCallback } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapEventFromDb } from '@/lib/mappers';

/*
  ══ El calendario, fuera de AppContext ═══════════════════════════════════════

  Con la convención de `useRoadmap.js`. Sin estado propio: los eventos se cargan
  a demanda y no todos al arrancar — son la única cosa del proyecto que crece sin
  techo con el tiempo.
*/

/**
 * Los eventos de un cliente, o los de TODA la cartera si no se dice cuál.
 *
 * ══ Por qué el filtro es opcional y no hay una segunda función ══════════════
 *
 * Porque quien decide qué eventos se ven no es esta consulta, es RLS: la
 * política `events_read` (migración 0009) ya limita las filas a
 * `app_can_read_client(client_id) OR app_is_client(client_id)`. Quitar el `.eq()`
 * no abre nada — devuelve exactamente los clientes que quien pregunta puede leer,
 * y a un cliente le devuelve los suyos y nada más.
 *
 * Escribir una función aparte para «los de todos» habría significado un segundo
 * sitio donde equivocarse con el filtro, que es justo la clase de duplicado que
 * convierte una frontera de autorización en dos.
 *
 * ── Lo que esto revisa de la nota anterior ─────────────────────────────────
 * Decía que «nadie mira el calendario de veinte clientes a la vez». Era verdad
 * mientras el calendario fuera una sección DE un cliente. Con la agenda del
 * entrenador es exactamente lo que se mira, y por eso se pide por rango de
 * fechas: el mes que hay en pantalla, no la historia entera.
 */
export const useCalendar = ({ session }) => {
  const loadEvents = useCallback(async (clientId = null, { from = null, to = null } = {}) => {
    let query = supabase.from('client_events').select('*').order('date');

    if (clientId) query = query.eq('client_id', clientId);
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);

    const { data, error } = await query;

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
