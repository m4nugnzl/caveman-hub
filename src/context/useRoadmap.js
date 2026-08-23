import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { optionToPhaseDraft } from '@/domain/fork';
import { mapPhaseFromDb, mapPhaseToDb } from '@/lib/mappers';

/*
  ══ El roadmap, fuera de AppContext ══════════════════════════════════════════

  Primer dominio extraído del proveedor. La convención que estrena, para los
  que vengan detrás:

    · Un gancho por dominio, que POSEE su estado y devuelve sus acciones.
    · Recibe del proveedor solo lo que de verdad necesita (aquí: la sesión y el
      cliente activo), nunca el proveedor entero.
    · El proveedor reparte el estado por `DataContext` y las acciones por la
      fachada estable, exactamente igual que antes: los consumidores no
      distinguen de dónde salió cada cosa.

  Se eligió el roadmap como piloto porque es el dominio más autocontenido: su
  estado, su carga, sus tres acciones y su traductor de errores no los tocaba
  nada más del archivo. Los dominios grandes (rutina, nutrición) comparten la
  infraestructura de guardado (`persist`, colas, sellos) y pedirán pensar esa
  frontera antes de moverlos.
*/

/** Códigos de Postgres que aparecen al escribir una fase. */
const PG = {
  RLS: '42501', // insufficient_privilege — una política ha rechazado la fila
  EXCLUSION: '23P01', // exclusion_violation — el solape de fases
  CHECK: '23514', // check_violation — el nombre del CHECK viene en el mensaje
};

const explicarErrorDeFase = (error) => {
  if (error?.code === PG.EXCLUSION) {
    return 'Esa fase se pisa con otra del mismo cliente. Una fase empieza el día siguiente al final de la anterior.';
  }
  /*
    Los dos CHECK de la 0073 los cubre ya la interfaz —`validateOptions` y el
    aviso al quitarle el final a una fase con cruce—, así que llegar aquí
    significa que se coló por un camino que nadie previó. Aun así se traduce: el
    texto de Postgres nombra el constraint y no dice qué hacer.
  */
  if (error?.code === PG.CHECK && String(error.message || '').includes('fork_needs_end')) {
    return 'La fase tiene un cruce planteado y sin fecha de fin no habría día en el que decidir. Descarta el cruce o déjale un final.';
  }
  if (error?.code === PG.CHECK && String(error.message || '').includes('next_options')) {
    return 'Un cruce son dos caminos o tres.';
  }
  if (error?.code === PG.RLS) {
    return 'No se ha podido guardar el roadmap. Si tu suscripción no está activa, la planificación queda en solo lectura.';
  }
  return error?.message || 'No se ha podido guardar la fase.';
};

export const useRoadmap = ({ session, activeClientId }) => {
  /*
    Las fases del roadmap DEL CLIENTE ABIERTO (migración 0028).

    Un array y no un mapa por cliente, a diferencia de las rutinas: son cuatro o
    cinco filas diminutas y solo hacen falta en la ficha que se está mirando. Un
    mapa aquí sería una caché con invalidación que resolvería un problema que
    todavía no existe.

    La contrapartida está anotada donde toca: `portfolio.js` llama a
    `weeklyReading` para toda la cartera sin fases, así que los titulares de la
    lista se siguen leyendo contra `preferences.goal`. Se nota poco —son una
    frase por cliente— y arreglarlo bien es una consulta de fases en bloque, no
    un mapa en memoria.
  */
  const [phases, setPhases] = useState([]);

  /*
    Las fases se recargan al cambiar de cliente.

    `cancelado` es lo que evita el fallo clásico de este patrón: al pasar rápido de
    una ficha a otra, la respuesta de la primera puede llegar DESPUÉS que la de la
    segunda y dejar en pantalla el roadmap del cliente anterior. Con clientes
    distintos en definición y en volumen, eso no es un parpadeo raro: es la
    analítica juzgando a alguien contra el objetivo de otra persona.
  */
  useEffect(() => {
    if (!activeClientId) {
      setPhases([]);
      return undefined;
    }

    let cancelado = false;
    setPhases([]);

    (async () => {
      const { data, error } = await supabase
        .from('client_phases')
        .select('*')
        .eq('client_id', activeClientId)
        .order('starts_on');

      if (cancelado) return;
      /*
        Sin la migración 0028 la tabla no existe y esto falla. Se traga: un
        roadmap vacío deja la aplicación exactamente como estaba antes de que
        existiera esta función, y `effectiveGoal` cae solo al objetivo declarado.
        Un `loadError` aquí rompería la ficha entera por una función opcional.
      */
      setPhases(error ? [] : (data || []).map(mapPhaseFromDb));
    })();

    return () => {
      cancelado = true;
    };
  }, [activeClientId]);

  const addPhase = useCallback(
    async (clientId, fields) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { data, error } = await supabase
        .from('client_phases')
        .insert({ client_id: clientId, created_by: userId, ...mapPhaseToDb(fields) })
        .select()
        .single();

      if (error) return { ok: false, error: explicarErrorDeFase(error) };

      const fase = mapPhaseFromDb(data);
      if (clientId === activeClientId) setPhases((prev) => [...prev, fase]);
      return { ok: true, phase: fase };
    },
    [activeClientId, session]
  );

  const updatePhase = useCallback(
    async (phaseId, fields) => {
      const { data, error } = await supabase
        .from('client_phases')
        .update({ ...mapPhaseToDb(fields), updated_at: new Date().toISOString() })
        .eq('id', phaseId)
        .select()
        .single();

      if (error) return { ok: false, error: explicarErrorDeFase(error) };

      const fase = mapPhaseFromDb(data);
      setPhases((prev) => prev.map((p) => (p.id === phaseId ? fase : p)));
      return { ok: true, phase: fase };
    },
    []
  );

  const removePhase = useCallback(async (phaseId) => {
    const { error } = await supabase.from('client_phases').delete().eq('id', phaseId);
    if (error) return { ok: false, error: error.message };
    setPhases((prev) => prev.filter((p) => p.id !== phaseId));
    return { ok: true };
  }, []);

  /*
    Plantear los caminos del final de una fase, o retirarlos con `null`.

    Es `updatePhase` con nombre propio: la columna viaja por el mismo mapeo que
    el resto (`next_options`, migración 0073) y no necesita consulta aparte. Se
    envuelve para que en la pantalla se lea lo que se está haciendo — «plantear
    un cruce» y no «actualizar una fase con un jsonb».
  */
  const setPhaseFork = useCallback(
    (phaseId, options) => updatePhase(phaseId, { nextOptions: options ?? null }),
    [updatePhase]
  );

  /**
   * Elegir un camino: la fase nace y el cruce desaparece.
   *
   * ── El orden importa, y su fallo a medias es inofensivo ─────────────────────
   * Primero se inserta la fase y solo después se limpian los caminos. No hay
   * transacción entre dos llamadas a PostgREST, así que hay que elegir cuál de
   * los dos fallos a medias se prefiere:
   *
   *   · Limpiando primero, un INSERT que falla deja al entrenador sin fase y sin
   *     los caminos que había escrito. Se pierde trabajo.
   *   · Insertando primero, un UPDATE que falla deja los caminos colgados de una
   *     fase que YA tiene otra detrás — y eso `forkState` no lo mira, porque
   *     solo atiende a la última. La decisión se ve tomada, que es lo que es.
   *
   * Por eso el segundo error no se propaga: la parte que importa está hecha, y
   * devolver un fallo obligaría a la pantalla a decir que no se pudo elegir
   * cuando la fase está creada. Lo que queda son unos bytes que nadie pinta y
   * que `staleForks` sabe encontrar.
   */
  const chooseFork = useCallback(
    async (phase, option) => {
      const draft = optionToPhaseDraft(phase, option);
      if (!draft) {
        return { ok: false, error: 'Ese camino no da para una fase. Revisa su dirección y sus semanas.' };
      }

      const creada = await addPhase(phase.clientId, draft);
      if (!creada.ok) return creada;

      await setPhaseFork(phase.id, null);
      return creada;
    },
    [addPhase, setPhaseFork]
  );

  return { phases, addPhase, updatePhase, removePhase, setPhaseFork, chooseFork };
};
