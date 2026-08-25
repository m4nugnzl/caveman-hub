import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapConditionFromDb, mapConditionToDb } from '@/lib/mappers';
import { todayISO } from '@/lib/dates';

/*
  ══ Los condicionantes, fuera de AppContext ══════════════════════════════════

  Con la convención que estrenó `useRoadmap.js`: un gancho por dominio, que POSEE
  su estado, recibe solo lo que necesita y devuelve sus acciones.

  ── Del cliente ABIERTO, no de la cartera entera ────────────────────────────
  Igual que el roadmap, y por el mismo motivo: son tres o cuatro filas diminutas
  y las tres pantallas que las miran —su ficha, su rutina y su dieta— hablan
  todas del cliente que tienes delante. Un mapa por cliente sería una caché con
  invalidación para un problema que no existe.

  La contrapartida, dicha antes de que se note: la lista de clientes NO puede
  avisar de que alguien tiene un veto, porque no los tiene cargados. Cuando eso
  haga falta, la salida es una consulta en bloque, no un mapa en memoria.
*/

/** Códigos de Postgres que aparecen al escribir un condicionante. */
const PG = {
  RLS: '42501', // insufficient_privilege — una política ha rechazado la fila
  CHECK: '23514', // check_violation — el nombre del CHECK viene en el mensaje
};

/**
 * Por qué ha fallado.
 *
 * Los CHECK de la 0077 los cubre ya la interfaz —el formulario no deja guardar
 * sin nombre y recorta por el tope—, así que llegar aquí significa que se coló
 * por un camino que nadie previó. Aun así se traducen: el texto de Postgres
 * nombra el constraint y no dice qué hacer.
 */
const explicarError = (error) => {
  const texto = String(error?.message || '');

  if (/does not exist|schema cache/i.test(texto)) {
    return 'Falta aplicar la migración 0077 para poder guardar condicionantes.';
  }
  if (error?.code === PG.CHECK && texto.includes('label')) {
    return 'El nombre no puede quedar vacío y no puede pasar de 120 caracteres.';
  }
  if (error?.code === PG.CHECK && texto.includes('detail')) {
    return 'El detalle es demasiado largo. Resúmelo o cuélgalo como archivo en su alta.';
  }
  if (error?.code === PG.CHECK) {
    return 'Ese área o esa gravedad no existen.';
  }
  if (error?.code === PG.RLS) {
    return 'No tienes permiso para tocar los datos de salud de este cliente. Si tu suscripción no está activa, la ficha queda en solo lectura.';
  }
  return texto || 'No se ha podido guardar el condicionante.';
};

export const useConditions = ({ activeClientId }) => {
  const [conditions, setConditions] = useState([]);

  /*
    Se recargan al cambiar de cliente.

    `cancelado` evita el fallo clásico del patrón: pasando rápido de una ficha a
    otra, la respuesta de la primera puede llegar DESPUÉS que la de la segunda.
    Aquí eso no es un parpadeo — sería enseñar la alergia de otra persona sobre
    la dieta que estás montando, que es exactamente el error que este dominio
    existe para evitar.
  */
  useEffect(() => {
    if (!activeClientId) {
      setConditions([]);
      return undefined;
    }

    let cancelado = false;
    setConditions([]);

    (async () => {
      const { data, error } = await supabase
        .from('client_conditions')
        .select('*')
        .eq('client_id', activeClientId)
        .order('created_at');

      if (cancelado) return;
      /*
        Sin la migración 0077 la tabla no existe y esto falla. Se traga, igual
        que hace el roadmap con la 0028: una lista vacía deja la aplicación como
        estaba antes de que esto existiera. Un `loadError` rompería la ficha
        entera por una función que todavía puede no estar desplegada.

        Lo que NO se traga es el fallo al ESCRIBIR: ahí callar dejaría a alguien
        creyendo que ha apuntado una alergia que no se guardó.
      */
      setConditions(error ? [] : (data || []).map(mapConditionFromDb).filter(Boolean));
    })();

    return () => {
      cancelado = true;
    };
  }, [activeClientId]);

  const addCondition = useCallback(
    async (clientId, fields) => {
      const { data, error } = await supabase
        .from('client_conditions')
        .insert({ client_id: clientId, ...mapConditionToDb(fields) })
        .select()
        .single();

      if (error) return { ok: false, error: explicarError(error) };

      const fila = mapConditionFromDb(data);
      if (clientId === activeClientId && fila) setConditions((prev) => [...prev, fila]);
      return { ok: true, condition: fila };
    },
    [activeClientId]
  );

  const updateCondition = useCallback(async (conditionId, fields) => {
    const { data, error } = await supabase
      .from('client_conditions')
      .update({ ...mapConditionToDb(fields), updated_at: new Date().toISOString() })
      .eq('id', conditionId)
      .select()
      .single();

    if (error) return { ok: false, error: explicarError(error) };

    const fila = mapConditionFromDb(data);
    setConditions((prev) => prev.map((c) => (c.id === conditionId ? fila : c)));
    return { ok: true, condition: fila };
  }, []);

  /**
   * Darlo por resuelto, que NO es borrarlo.
   *
   * Una lesión se cura, y borrar la fila entonces tiraría el motivo por el que
   * durante cuatro meses no hubo peso muerto en el programa. Se queda con su
   * fecha y deja de avisar. Es `updateCondition` con nombre propio para que en
   * la pantalla se lea lo que se hace y no «actualizar con una fecha».
   */
  const resolveCondition = useCallback(
    (conditionId, resuelto = true) =>
      updateCondition(conditionId, { resolvedAt: resuelto ? todayISO() : null }),
    [updateCondition]
  );

  const removeCondition = useCallback(async (conditionId) => {
    const { error } = await supabase.from('client_conditions').delete().eq('id', conditionId);
    if (error) return { ok: false, error: explicarError(error) };
    setConditions((prev) => prev.filter((c) => c.id !== conditionId));
    return { ok: true };
  }, []);

  return { conditions, addCondition, updateCondition, resolveCondition, removeCondition };
};
