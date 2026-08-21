import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapCheckInFromDb } from '@/lib/mappers';
import { track } from '@/lib/analytics';

/*
  ══ Los check-ins, fuera de AppContext ═══════════════════════════════════════

  Con la convención de `useRoadmap.js`, y con la variante que estrena este
  dominio: su estado lo SIEMBRA el arranque (`loadForUser` baja el último
  check-in de cada cliente junto con las fichas), así que el gancho devuelve
  también los setters. El dueño del estado sigue siendo uno —este módulo—; el
  arranque solo lo rellena.

  `stampNow` llega del proveedor: es la infraestructura de novedades (sellar
  «tienes respuesta» en las preferencias del cliente), no algo de este dominio.
*/

export const useCheckIns = ({ stampNow }) => {
  /** Último check-in por cliente. Vacío si la migración 0009 no está aplicada. */
  const [checkIns, setCheckIns] = useState({});
  /*
    Si la ENTREGA de check-ins existe en esta base (la 0009 está aplicada).

    Es distinto de «checkIns está vacío»: una cuenta recién creada no tiene
    ninguno y la función está perfectamente activa. Confundir los dos casos hacía
    que la cartera le dijera a cada cuenta nueva «los check-ins no están activos,
    escríbenos» — una avería inventada y un ticket de soporte por estreno.
    `null` = todavía no se ha cargado nada.
  */
  const [checkInsActivos, setCheckInsActivos] = useState(null);

  /**
   * El cliente entrega su semana.
   *
   * ══ Era el eslabón que faltaba ═════════════════════════════════════════════
   *
   * La función existe en la base desde la migración 0009 y **no la llamaba
   * nadie**. Sin ella, la fila de `check_ins` solo aparecía si la creaba el
   * entrenador, así que el estado «entregado, esperando respuesta» —que es
   * exactamente lo que la aplicación tenía que saber— no se daba nunca, y todo el
   * seguimiento funcionaba con la aproximación de «parece que ha hecho su parte».
   *
   * Entregar es un ACTO del cliente, y por eso hace falta: pesarse tres veces no
   * significa «ya está, mírame». Lo primero lo hace él para él; lo segundo es
   * pedirle a alguien que mire.
   *
   * ── Por qué por función y no con un INSERT ──────────────────────────────────
   * Porque `submitted_at` lo tiene que poner el servidor y `reviewed_at` no lo
   * puede tocar el cliente. RLS filtra filas y no columnas, así que con permiso
   * de escritura sobre su fila podría marcarse como revisado él solo.
   */
  const submitCheckIn = useCallback(
    async (
      clientId,
      { weekStart: week, programWeek = null, weight = null, notes = null, answers = null } = {}
    ) => {
      const { data, error } = await supabase.rpc('submit_check_in', {
        target: clientId,
        week,
        program_week: programWeek,
        weight_kg: weight,
        client_notes: notes,
        /* Las respuestas del cuestionario de la semana (migración 0060). El
           parámetro es opcional en la función, así que quien no pregunte nada
           —la mayoría— manda `null` y la columna se queda como estaba. */
        answers,
      });

      if (error) return { ok: false, error: error.message };

      /* Se refleja al instante: entregar es un gesto y la pantalla tiene que
         cambiar de estado sin esperar a una recarga que quizá no llega.

         ── Pero solo si es MÁS RECIENTE que lo que ya había ─────────────────
         `checkIns` guarda una sola entrega por cliente, la última: así la carga
         inicial y todo lo que la lee —«Hoy», la cartera, el portal— hablan de la
         semana en curso.

         Entregar una ATRASADA rompía ese invariante. El cliente que ya entregó
         esta semana, ya recibió respuesta, y luego pulsa el chip de la semana que
         se le quedó sin mandar, se encontraba con que su pantalla volvía a
         ofrecerle «Entregar mi semana» y la respuesta de su entrenador
         desaparecía: la fila vieja había sustituido a la nueva. */
      setCheckIns((prev) => {
        const anterior = prev[clientId];
        if (anterior && anterior.weekStart > week) return prev;

        return {
          ...prev,
          [clientId]: {
            ...(anterior?.weekStart === week ? anterior : {}),
            id: data,
            clientId,
            weekStart: week,
            weight,
            notes: notes || '',
            /* `?? anterior?.answers` y no `answers` a secas: reentregar sin
               cuestionario no puede borrar de la pantalla lo que ya se contestó,
               porque en la base tampoco se borra (el UPDATE usa COALESCE). */
            answers: answers ?? (anterior?.weekStart === week ? anterior.answers : null) ?? null,
            submittedAt: new Date().toISOString(),
            reviewedAt: null,
            coachNotes: '',
          },
        };
      });

      return { ok: true, id: data };
    },
    []
  );

  /**
   * Todas las revisiones de un cliente, para su histórico.
   *
   * A demanda y no en la carga inicial: `checkIns` guarda solo la última de cada
   * uno porque es lo que necesitan la cartera y la cola, y traer el historial
   * completo de veinte clientes al arrancar sería descargar años de filas para
   * una pantalla que se abre de vez en cuando.
   */
  const loadCheckInHistory = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('client_id', clientId)
      .order('week_start', { ascending: false });

    if (error) return { ok: false, error: error.message, checkIns: [] };
    return { ok: true, checkIns: (data || []).map(mapCheckInFromDb) };
  }, []);

  /**
   * Borra un check-in (migración 0044).
   *
   * Quita la revisión y su respuesta; el plan se queda como esté. Volver atrás la
   * dieta o la rutina es otra cosa: haría falta guardar el contenido anterior
   * entero, no el resumen de `snapshot`.
   */
  const deleteCheckIn = useCallback(async (checkInId) => {
    const { error } = await supabase.rpc('delete_check_in', { check_in: checkInId });
    if (error) return { ok: false, error: error.message };

    /* Fuera del estado también: si era el de la semana en curso, el cliente
       vuelve a poder entregar y el entrenador a verlo pendiente. */
    setCheckIns((prev) => {
      const entry = Object.values(prev).find((c) => c.id === checkInId);
      if (!entry) return prev;
      const next = { ...prev };
      delete next[entry.clientId];
      return next;
    });
    return { ok: true };
  }, []);

  /**
   * Marca un check-in como revisado.
   *
   * Va por la función `review_check_in` (migración 0009) y no por un UPDATE, para
   * que quede registrado QUIÉN lo revisó sin que la aplicación tenga que acordarse
   * de mandarlo — que es justo el dato que se olvida y luego se echa en falta con
   * un equipo de varios entrenadores.
   */
  const reviewCheckIn = useCallback(
    async (checkInId, notes = null, snapshot = null) => {
      const { error } = await supabase.rpc('review_check_in', {
        check_in: checkInId,
        notes,
        snapshot,
      });
      if (error) return { ok: false, error: error.message };

      /*
        Se refleja en local sin recargar: la revisión es un gesto y tiene que
        desaparecer de la cola al instante.

        Y se guarda TAMBIÉN la nota. Antes solo se marcaba la fecha, así que el
        cliente —que lee esa misma nota en su «Hoy»— veía «revisada» y ningún
        texto hasta recargar la página. Escribir la respuesta y que no aparezca es
        exactamente el fallo que hacía inútil todo esto.
      */
      let dueño = null;
      setCheckIns((prev) => {
        const entry = Object.values(prev).find((c) => c.id === checkInId);
        if (!entry) return prev;
        dueño = entry.clientId;
        return {
          ...prev,
          [entry.clientId]: {
            ...entry,
            reviewedAt: new Date().toISOString(),
            coachNotes: notes ?? entry.coachNotes,
            snapshot: snapshot ?? entry.snapshot,
          },
        };
      });

      /* Y le sale como novedad, igual que un cambio de dieta. Sin esto, el
         cliente tenía que adivinar que le habías contestado entrando a mirar. */
      if (dueño) stampNow(dueño, 'checkin');

      /* Contestar un check-in es el momento en que el cliente recibe de verdad lo
         que paga. Si esta cifra sube y las demás no, el producto funciona; si
         baja, se está perdiendo a los clientes de alguien. */
      track('revision_hecha');
      return { ok: true };
    },
    [stampNow]
  );

  /**
   * Deshacer una revisión recién cerrada (migración 0063): la fila vuelve a
   * estar pendiente, sin sello, sin nota y sin foto del plan.
   *
   * Existe para el «Deshacer» del aviso que sale al cerrar: «Seguimos igual» y
   * «Contestar» son un toque sin confirmación —así debe ser—, y un toque en la
   * fila equivocada cerraba la semana de otra persona sin vuelta atrás.
   *
   * La novedad que se le publicó al cliente no se retracta (ver la migración):
   * el aviso le lleva a su semana, que vuelve a decir la verdad — pendiente.
   */
  const unreviewCheckIn = useCallback(async (checkInId) => {
    const { error } = await supabase.rpc('unreview_check_in', { check_in: checkInId });
    if (error) return { ok: false, error: error.message };

    /* El espejo local de lo que hace `reviewCheckIn` al cerrar. */
    setCheckIns((prev) => {
      const entry = Object.values(prev).find((c) => c.id === checkInId);
      if (!entry) return prev;
      return {
        ...prev,
        [entry.clientId]: { ...entry, reviewedAt: null, coachNotes: null, snapshot: null },
      };
    });
    return { ok: true };
  }, []);

  /**
   * Corregir el texto de una revisión ya cerrada. NO es volver a revisarla.
   *
   * ── Qué NO hace, y ese es el punto ──────────────────────────────────────────
   * No sella `reviewed_at` ni `reviewed_by`, y **no llama a `stampNow`**. Antes
   * el histórico reutilizaba `reviewCheckIn` para esto, así que arreglar una
   * errata movía la fecha de la revisión a hoy, ponía como autor a quien
   * corregía —perdiendo quién la hizo de verdad— y le volvía a saltar la novedad
   * al cliente por un texto que ya había leído.
   *
   * La función de la base (migración 0051) solo escribe `coach_notes`, y solo
   * sobre filas que ya estaban revisadas.
   */
  const updateCheckInNotes = useCallback(async (checkInId, notes) => {
    const { error } = await supabase.rpc('update_check_in_notes', {
      check_in: checkInId,
      notes,
    });
    if (error) return { ok: false, error: error.message };

    /* Solo el texto: lo demás de esa fila no ha cambiado. */
    setCheckIns((prev) => {
      const entry = Object.values(prev).find((c) => c.id === checkInId);
      if (!entry) return prev;
      return { ...prev, [entry.clientId]: { ...entry, coachNotes: notes } };
    });

    return { ok: true };
  }, []);

  return {
    checkIns,
    setCheckIns,
    checkInsActivos,
    setCheckInsActivos,
    submitCheckIn,
    loadCheckInHistory,
    deleteCheckIn,
    reviewCheckIn,
    unreviewCheckIn,
    updateCheckInNotes,
  };
};
