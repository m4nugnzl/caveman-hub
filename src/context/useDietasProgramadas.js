import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapDietaProgramadaToDb, mapProgramadaFromDb } from '@/lib/mappers';
import { emptyNutrition } from '@/domain/nutrition';
import { operacionesDeLaDieta } from './operacionesDeLaDieta';

/*
  ══ LAS DIETAS PROGRAMADAS, fuera de AppContext (letra e, 0146) ═════════════

  Con la convención de `useRoadmap.js`: el estado es el del cliente abierto y
  se recarga al cambiar de cliente, descartando la respuesta que llegue tarde.

  Tres cosas:
    1. Al ABRIR un cliente se aplican las que ya tocan
       (`aplicar_dietas_programadas`), también cuando lo abre él mismo: si el
       latido no pasó, la dieta entra igual. Si entró alguna, `alAplicarse`
       relee la dieta y su pauta fechada.
    2. La lista, para el equipo (el cliente no la lee: RLS la deja vacía).
    3. Los verbos de la dieta sobre UNA programada (`dietaProgramadaDe`), los
       mismos de `operacionesDeLaDieta` atados a la copia: en memoria y en la
       cola de guardado con la clave `programada:<id>`. Es lo que usa el editor
       con `?programada=`.
*/

const TABLA = 'nutrition_plan_programadas';

/** Los errores de la base, dichos por lo que pasa. */
const explicar = (error) => {
  const m = String(error?.message || '');
  if (/un_cambio_por_dia|duplicate key/i.test(m)) return 'Ya hay un cambio programado para ese día.';
  return m || 'No se pudo guardar el cambio programado.';
};

/**
 * La programada que entró en vigor encima de lo que se estaba editando, o
 * `null`. La lee el aviso de conflicto de la dieta: si la hay, lo que cambió
 * la dieta no fue otra persona sino el cambio programado.
 *
 * @param desde la versión de la dieta que tenía el editor (`updated_at`).
 */
export const programadaQueEntro = async (clientId, desde) => {
  if (!clientId || !desde) return null;
  const { data, error } = await supabase
    .from(TABLA)
    .select('empieza, aplicada_el')
    .eq('client_id', clientId)
    .eq('estado', 'aplicada')
    .gte('aplicada_el', desde)
    .order('aplicada_el', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return { empieza: data[0].empieza, aplicadaEl: data[0].aplicada_el };
};

export const useDietasProgramadas = ({ session, activeClientId, ensureNutrition, queue, alAplicarse }) => {
  const [programadas, setProgramadas] = useState([]);
  /* El espejo, para los verbos: leen la copia de AHORA sin volver a crearse. */
  const programadasRef = useRef(programadas);
  const poner = useCallback((siguiente) => {
    programadasRef.current = typeof siguiente === 'function' ? siguiente(programadasRef.current) : siguiente;
    setProgramadas(programadasRef.current);
  }, []);
  const alAplicarseRef = useRef(alAplicarse);
  alAplicarseRef.current = alAplicarse;

  const leerLista = useCallback(async (clientId) => {
    const { data, error } = await supabase.from(TABLA).select('*').eq('client_id', clientId).order('empieza');
    /* Sin la 0146, sin programadas: la dieta funciona igual. */
    return error ? null : (data || []).map(mapProgramadaFromDb);
  }, []);

  /** Relee la lista del cliente abierto. Devuelve la lista, o `null` si falló. */
  const cargarProgramadas = useCallback(
    async (clientId = activeClientId) => {
      if (!clientId) return null;
      const lista = await leerLista(clientId);
      if (lista && clientId === activeClientId) poner(lista);
      return lista;
    },
    [activeClientId, leerLista, poner]
  );

  useEffect(() => {
    poner([]);
    if (!activeClientId || !session?.user?.id) return undefined;
    let cancelado = false;

    (async () => {
      /* Primero se aplica lo que ya toca, y después se lee: así la lista y la
         dieta ya dicen lo mismo. */
      const aplicadas = await supabase.rpc('aplicar_dietas_programadas', { p_client: activeClientId });
      if (cancelado) return;
      if (!aplicadas.error && aplicadas.data > 0) alAplicarseRef.current?.(activeClientId);
      const lista = await leerLista(activeClientId);
      if (!cancelado && lista) poner(lista);
    })();

    return () => {
      cancelado = true;
    };
  }, [activeClientId, session?.user?.id, leerLista, poner]);

  /**
   * Prepara un cambio de dieta: una copia de la dieta de ahora que empieza
   * `empieza`. Se edita después con el editor (`?programada=<id>`).
   */
  const programarDieta = useCallback(
    async (clientId, { empieza, motivo = null }) => {
      const actual = (await ensureNutrition(clientId)) ?? null;
      if (!actual) return { ok: false, error: 'No he podido leer la dieta que tiene ahora. Inténtalo otra vez.' };
      const texto = String(motivo || '').trim().slice(0, 280) || null;
      const { data, error } = await supabase
        .from(TABLA)
        .insert({ client_id: clientId, empieza, motivo: texto, dieta: mapDietaProgramadaToDb(clientId, actual) })
        .select()
        .single();
      if (error) return { ok: false, error: explicar(error) };
      const nueva = mapProgramadaFromDb(data);
      if (clientId === activeClientId) poner((prev) => [...prev, nueva].sort((a, b) => a.empieza.localeCompare(b.empieza)));
      return { ok: true, programada: nueva };
    },
    [activeClientId, ensureNutrition, poner]
  );

  /** Cambia su día o su motivo. */
  const cambiarProgramada = useCallback(
    async (id, { empieza, motivo }) => {
      const fila = {};
      if (empieza !== undefined) fila.empieza = empieza;
      if (motivo !== undefined) fila.motivo = String(motivo || '').trim().slice(0, 280) || null;
      const { data, error } = await supabase.from(TABLA).update(fila).eq('id', id).select().maybeSingle();
      if (error) return { ok: false, error: explicar(error) };
      if (!data) return { ok: false, error: 'Este cambio ya entró en vigor o se quitó.' };
      const nueva = mapProgramadaFromDb(data);
      poner((prev) => prev.map((p) => (p.id === id ? { ...nueva, plan: p.plan } : p)).sort((a, b) => a.empieza.localeCompare(b.empieza)));
      return { ok: true, programada: nueva };
    },
    [poner]
  );

  /** La quita. Solo las pendientes (RLS). Devuelve la fila para poder deshacer. */
  const quitarProgramada = useCallback(
    async (id) => {
      const antes = programadasRef.current.find((p) => p.id === id) || null;
      const { data, error } = await supabase.from(TABLA).delete().eq('id', id).select('id');
      if (error) return { ok: false, error: explicar(error) };
      if (!data?.length) return { ok: false, error: 'Este cambio ya entró en vigor: ya no se quita.' };
      poner((prev) => prev.filter((p) => p.id !== id));
      return { ok: true, antes };
    },
    [poner]
  );

  /*
    Guardar la dieta de una programada. Va por la cola, como la de ahora: con
    su estado («Guardando…», «No se guardó · Reintentar»), su espera sin red y
    su nota en el navegador. Cero filas = ya no está pendiente (entró en vigor,
    o se quitó en otra pestaña): se dice, no se traga.
  */
  const persistirProgramada = useCallback(
    (id, plan, { immediate = false } = {}) => {
      queue.enqueue(
        `programada:${id}`,
        plan,
        async (datos) => {
          const res = await supabase
            .from(TABLA)
            .update({ dieta: mapDietaProgramadaToDb(null, datos) })
            .eq('id', id)
            .select('id');
          if (res.error) return { error: { message: explicar(res.error) } };
          if (!res.data?.length) {
            return { error: { message: 'Este cambio ya entró en vigor o se quitó: lo que escribas aquí no se guarda.' } };
          }
          return res;
        },
        { immediate }
      );
    },
    [queue]
  );

  /** Los verbos de la dieta sobre UNA programada. */
  const dietaProgramadaDe = useCallback(
    (id) => {
      const leer = () => programadasRef.current.find((p) => p.id === id)?.plan || emptyNutrition();
      return operacionesDeLaDieta({
        leer,
        aplicar: (actualizador, { immediate = true } = {}) => {
          const actual = leer();
          /* Sin copia viva (ya entró en vigor, o se quitó) no se escribe nada. */
          if (!id) return actual;
          const siguiente = actualizador(actual);
          if (siguiente === actual) return actual;
          poner((prev) => prev.map((p) => (p.id === id ? { ...p, plan: siguiente } : p)));
          persistirProgramada(id, siguiente, { immediate });
          return siguiente;
        },
      });
    },
    [persistirProgramada, poner]
  );

  return {
    programadas,
    cargarProgramadas,
    programarDieta,
    cambiarProgramada,
    quitarProgramada,
    dietaProgramadaDe,
    persistirProgramada,
  };
};
