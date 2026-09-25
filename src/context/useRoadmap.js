import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { competicionDe } from '@/domain/calendar';
import { optionToPhaseDraft } from '@/domain/fork';
import { conReplanteo, sinReplanteo } from '@/domain/roadmap';
import { HECHO_KINDS } from '@/domain/semanasDelPlan';
import {
  mapEventFromDb,
  mapInterventionFromDb,
  mapInterventionToDb,
  mapNutritionFromDb,
  mapPhaseFromDb,
  mapPhaseToDb,
} from '@/lib/mappers';

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
    LAS ANCLAS del cliente abierto: los eventos del calendario a los que apunta
    su plan (`client_events.ancla`, migración 0122).

    Viven aquí y no en el calendario porque las leen las mismas pantallas que
    leen las fases —Sus fases, la franja del Resumen, el Inicio del cliente— y
    el calendario solo se carga cuando se abre. Son una o dos filas por cliente
    sobre un índice parcial; traerse el calendario entero para esto sería el
    mapa en memoria que la nota de arriba ya descarta.
  */
  const [anchors, setAnchors] = useState([]);

  /*
    LOS HECHOS del plan del cliente abierto: competiciones, vacaciones, refeeds
    y diet breaks (`HECHO_KINDS`, 0123). Los dibuja el roadmap en su franja y
    los apunta su libro. Son pocos por cliente; el calendario entero no hace
    falta, por la misma razón que las anclas.
  */
  const [hechos, setHechos] = useState([]);

  /*
    LA PAUTA FECHADA del cliente abierto (`nutrition_plan_versions`, 0124): una
    fila por día en que cambió alguna cifra de la dieta, ya traducida a la forma
    de la dieta (`{ dia, nutrition }`). La leen el roadmap, la Revisión y el
    Resumen a través de `nutritionTrack`, que es su única fuente de la dieta por
    semana. Sin la migración la consulta falla y la lista se queda vacía: la
    escalera sale de las revisiones, como antes.
  */
  const [dietVersions, setDietVersions] = useState([]);

  /*
    LO QUE EL ENTRENADOR PIENSA DE CADA INTERVENCIÓN (`client_interventions`,
    0143): el motivo, la valoración y las ventanas movidas a mano. Una fila solo
    cuando ha escrito algo; las intervenciones en sí se derivan de los hechos,
    la pauta fechada y los bloques (`domain/intervenciones.js`). Solo el equipo
    la lee: para el cliente la consulta vuelve vacía y no pasa nada.
  */
  const [notasDeIntervencion, setNotasDeIntervencion] = useState([]);

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
      setAnchors([]);
      setHechos([]);
      setDietVersions([]);
      setNotasDeIntervencion([]);
      return undefined;
    }

    let cancelado = false;
    setPhases([]);
    setAnchors([]);
    setHechos([]);
    setDietVersions([]);
    setNotasDeIntervencion([]);

    (async () => {
      const [fases, anclas, suyos, versiones, capa] = await Promise.all([
        supabase.from('client_phases').select('*').eq('client_id', activeClientId).order('starts_on'),
        supabase.from('client_events').select('*').eq('client_id', activeClientId).eq('ancla', true).order('date'),
        supabase
          .from('client_events')
          .select('*')
          .eq('client_id', activeClientId)
          .in('kind', HECHO_KINDS)
          .order('date'),
        supabase
          .from('nutrition_plan_versions')
          .select('dia, pauta')
          .eq('client_id', activeClientId)
          .order('dia'),
        supabase.from('client_interventions').select('*').eq('client_id', activeClientId),
      ]);

      if (cancelado) return;
      /*
        Sin la migración 0028 la tabla no existe y esto falla. Se traga: un
        roadmap vacío deja la aplicación exactamente como estaba antes de que
        existiera esta función, y `effectiveGoal` cae solo al objetivo declarado.
        Un `loadError` aquí rompería la ficha entera por una función opcional.

        Lo mismo con las anclas sin la 0122: la columna no existe, la consulta
        falla, y el plan se queda sin destino — que es como estaba.
      */
      setPhases(fases.error ? [] : (fases.data || []).map(mapPhaseFromDb));
      setAnchors(anclas.error ? [] : (anclas.data || []).map(mapEventFromDb));
      setHechos(suyos.error ? [] : (suyos.data || []).map(mapEventFromDb));
      setDietVersions(
        versiones.error
          ? []
          : (versiones.data || []).map((v) => ({ dia: v.dia, nutrition: mapNutritionFromDb(v.pauta || {}) }))
      );
      /* Sin la 0143, sin notas: las intervenciones se ven igual, sin motivo ni valoración. */
      setNotasDeIntervencion(capa.error ? [] : (capa.data || []).map(mapInterventionFromDb));
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
    /* La pregunta viaja con los caminos (0125): se escriben y se borran juntos. */
    (phaseId, options, pregunta = '') =>
      updatePhase(phaseId, { nextOptions: options ?? null, nextQuestion: options ? pregunta : '' }),
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

  /**
   * Fijar el ancla: crear el evento al que apunta el plan, marcar uno que ya
   * existía, o cambiarle la fecha, el nombre o la competición.
   *
   * Con `id` es un evento que ya existe —de las anclas o del calendario—; sin
   * él se crea. Siempre compartido (`privada: false`): la base no admite un
   * ancla privada (`client_events_ancla_compartida`), porque el cliente lee su
   * plan entero y uno que termina en nada no es un plan.
   */
  const saveAnchor = useCallback(
    async (clientId, { id = null, date, kind, title, competicion = null }) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const campos = {
        date,
        kind,
        title: String(title || '').trim(),
        ancla: true,
        privada: false,
        competicion: kind === 'race' ? competicionDe(competicion) : null,
      };

      const { data, error } = id
        ? await supabase.from('client_events').update(campos).eq('id', id).select().single()
        : await supabase
            .from('client_events')
            .insert({ client_id: clientId, created_by: userId, ...campos })
            .select()
            .single();

      if (error) {
        return {
          ok: false,
          error:
            error.code === PG.RLS
              ? 'No se ha podido guardar el destino. Solo quien lleva a este cliente puede fijarlo.'
              : error.message || 'No se ha podido guardar el destino.',
        };
      }

      const ancla = mapEventFromDb(data);
      if (clientId === activeClientId) {
        setAnchors((prev) =>
          [...prev.filter((a) => a.id !== ancla.id), ancla].sort((a, b) => String(a.date).localeCompare(String(b.date)))
        );
      }
      return { ok: true, anchor: ancla };
    },
    [activeClientId, session]
  );

  /**
   * Quitar el ancla: el plan deja de apuntar ahí. El EVENTO se queda —la
   * competición sigue en el calendario—; lo que se retira es la marca. Borrar
   * la carrera por dejar de medir el plan contra ella sería perder un dato que
   * nadie ha pedido perder.
   */
  const removeAnchor = useCallback(async (eventId) => {
    const { error } = await supabase.from('client_events').update({ ancla: false }).eq('id', eventId);
    if (error) return { ok: false, error: error.message };
    setAnchors((prev) => prev.filter((a) => a.id !== eventId));
    return { ok: true };
  }, []);

  /**
   * Mover las fases que aún no han empezado `dias` días (`shift_future_phases`,
   * migración 0122). SOLO se llama desde un gesto explícito del entrenador —la
   * casilla del diálogo al mover el ancla—; nada en la aplicación lo dispara
   * solo.
   *
   * Todo o nada: la función corre en una transacción y, si alguna fase choca
   * con otra, no se mueve ninguna. Por eso, al acabar, se recargan TODAS las
   * fases en vez de parchear las que creemos que se movieron.
   */
  const shiftFuturePhases = useCallback(
    async (clientId, dias, hasta = null) => {
      const { error } = await supabase.rpc('shift_future_phases', {
        p_client: clientId,
        p_days: dias,
        p_hasta: hasta,
      });
      if (error) {
        return {
          ok: false,
          error:
            error.code === PG.EXCLUSION
              ? 'Las fases no se han movido: alguna se pisaría con la fase en curso o con las del tramo siguiente. Ajústalas a mano.'
              : error.message || 'No se han podido mover las fases.',
        };
      }

      if (clientId === activeClientId) {
        const { data } = await supabase
          .from('client_phases')
          .select('*')
          .eq('client_id', clientId)
          .order('starts_on');
        if (data) setPhases(data.map(mapPhaseFromDb));
      }
      return { ok: true };
    },
    [activeClientId]
  );

  /**
   * Alargar (o acortar, en negativo) una fase `dias` días y mover lo mismo
   * todas las que empiezan detrás (`estirar_fase`, 0136). Es el arrastre del
   * final de una fase en el creador del plan, y su Deshacer es la misma
   * llamada con el signo cambiado.
   *
   * Todo o nada, como `shiftFuturePhases`, y por eso al acabar se recargan
   * TODAS las fases del cliente en vez de parchear las que creemos movidas.
   */
  const estirarFase = useCallback(
    async (clientId, faseId, dias) => {
      if (!dias) return { ok: true };
      const { error } = await supabase.rpc('estirar_fase', { p_fase: faseId, p_dias: dias });
      if (error) {
        return {
          ok: false,
          error:
            error.code === PG.EXCLUSION
              ? 'La fase no se ha movido: alguna de detrás se pisaría con otra. Ajústalas a mano.'
              : error.code === PG.RLS
                ? 'No se ha podido guardar el roadmap. Si tu suscripción no está activa, la planificación queda en solo lectura.'
                : error.message || 'No se ha podido cambiar la fase.',
        };
      }
      if (clientId === activeClientId) {
        const { data } = await supabase
          .from('client_phases')
          .select('*')
          .eq('client_id', clientId)
          .order('starts_on');
        if (data) setPhases(data.map(mapPhaseFromDb));
      }
      return { ok: true };
    },
    [activeClientId]
  );

  /**
   * Un hecho del plan —refeed, diet break, vacaciones, competición— puesto
   * desde el creador. Es un evento del calendario de siempre (0123): el
   * calendario lo verá como cualquier otro. Solo el entrenador escribe refeeds
   * y diet breaks (RLS).
   */
  const anadirHecho = useCallback(
    async (
      clientId,
      { kind, title, date, hasta = null, kcal = null, proteina = null, carbohidratos = null, grasa = null, nota = null }
    ) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      /* Las macros van las tres o ninguna (0142); con ellas, las kcal las
         calcula la base y lo que llegue aquí se descarta. Solo se mandan si
         hay: así apuntar un refeed sigue funcionando sin la migración. */
      const macros = [num(proteina), num(carbohidratos), num(grasa)];
      const conMacros = macros.every((v) => v !== null);
      const texto = String(nota ?? '').trim().slice(0, 280);
      const { data, error } = await supabase
        .from('client_events')
        .insert({
          client_id: clientId,
          created_by: userId,
          kind,
          title: String(title || '').trim(),
          date,
          hasta: hasta && hasta > date ? hasta : null,
          kcal: conMacros ? null : num(kcal),
          ...(conMacros ? { proteina_g: macros[0], carbohidratos_g: macros[1], grasa_g: macros[2] } : {}),
          ...(texto ? { nota: texto } : {}),
          privada: false,
        })
        .select()
        .single();
      if (error) return { ok: false, error: error.message || 'No se ha podido apuntar.' };
      const hecho = mapEventFromDb(data);
      if (clientId === activeClientId) {
        setHechos((prev) => [...prev, hecho].sort((a, b) => String(a.date).localeCompare(String(b.date))));
      }
      return { ok: true, hecho };
    },
    [activeClientId, session]
  );

  /** Quitarlo: es el Deshacer de `anadirHecho` y la papelera del globo. */
  const quitarHecho = useCallback(async (eventId) => {
    const { error } = await supabase.from('client_events').delete().eq('id', eventId);
    if (error) return { ok: false, error: error.message };
    setHechos((prev) => prev.filter((h) => h.id !== eventId));
    return { ok: true };
  }, []);

  /**
   * Escribir el motivo, la valoración o las ventanas de una intervención. SOLO
   * desde un gesto del entrenador en su tarjeta: nada la valora solo.
   *
   * @param fuente `{ eventId }`, `{ dietaDia }` o `{ bloqueId }`: de qué
   *               intervención habla (`intervencionesDelCliente`).
   * @param campos los que cambian (`mapInterventionToDb`).
   */
  const guardarIntervencion = useCallback(
    async (clientId, fuente, campos) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };
      const fila = mapInterventionToDb(campos);
      const deEsta = (c) =>
        (fuente.eventId && c.eventId === fuente.eventId) ||
        (fuente.dietaDia && c.dietaDia === fuente.dietaDia) ||
        (fuente.bloqueId && c.bloqueId === fuente.bloqueId);
      const previa = notasDeIntervencion.find((c) => c.clientId === clientId && deEsta(c)) || null;
      const { data, error } = previa
        ? await supabase.from('client_interventions').update(fila).eq('id', previa.id).select().single()
        : await supabase
            .from('client_interventions')
            .insert({
              client_id: clientId,
              created_by: userId,
              event_id: fuente.eventId || null,
              dieta_dia: fuente.dietaDia || null,
              bloque_id: fuente.bloqueId || null,
              ...fila,
            })
            .select()
            .single();
      if (error) {
        return {
          ok: false,
          error:
            error.code === PG.RLS
              ? 'No se ha podido guardar. Solo quien lleva a este cliente puede valorar sus intervenciones.'
              : error.message || 'No se ha podido guardar.',
        };
      }
      const nota = mapInterventionFromDb(data);
      if (clientId === activeClientId) setNotasDeIntervencion((prev) => [...prev.filter((c) => c.id !== nota.id), nota]);
      return { ok: true, nota };
    },
    [activeClientId, session, notasDeIntervencion]
  );

  /**
   * Igualar una semana: su media pasa a ser la base de la expectativa y se sigue
   * al ritmo que se elija (`client_phases.replanteos`, 0123). SOLO desde el gesto
   * «Igualar aquí» del detalle de una semana: nada en la aplicación iguala solo.
   */
  const igualar = useCallback(
    (fase, replanteo) => updatePhase(fase.id, { replanteos: conReplanteo(fase, replanteo) }),
    [updatePhase]
  );

  /** Quitar un replanteo hecho por error: la expectativa vuelve a la de antes. */
  const quitarReplanteo = useCallback(
    (fase, semana) => updatePhase(fase.id, { replanteos: sinReplanteo(fase, semana) }),
    [updatePhase]
  );

  return {
    phases,
    anchors,
    hechos,
    dietVersions,
    notasDeIntervencion,
    guardarIntervencion,
    igualar,
    quitarReplanteo,
    addPhase,
    updatePhase,
    removePhase,
    setPhaseFork,
    chooseFork,
    saveAnchor,
    removeAnchor,
    shiftFuturePhases,
    estirarFase,
    anadirHecho,
    quitarHecho,
  };
};
