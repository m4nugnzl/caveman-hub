import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { competicionDe } from '@/domain/calendar';
import { optionToPhaseDraft } from '@/domain/fork';
import { conReplanteo, juntarMotivos, quitarMotivo, sinReplanteo } from '@/domain/roadmap';
import { HECHO_KINDS } from '@/domain/semanasDelPlan';
import { versionDeFila } from '@/domain/versionesDelPlan';
import {
  mapEventFromDb,
  mapInterventionFromDb,
  mapInterventionToDb,
  mapNutritionFromDb,
  mapPhaseFromDb,
  mapPhaseToDb,
  parteDeToDb,
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

/** Los errores de un hecho, en palabras (el solape lo dice la 0144). */
const explicarErrorDeHecho = (error) => {
  if (error?.code === PG.EXCLUSION) {
    return 'Esos días ya tienen otra variación. Dos variaciones no pueden cubrir el mismo día.';
  }
  if (error?.code === PG.RLS) return 'No se ha podido guardar. Solo quien lleva a este cliente puede cambiar su dieta.';
  return error?.message || 'No se ha podido guardar.';
};

const ordenarHechos = (lista) => [...lista].sort((a, b) => String(a.date).localeCompare(String(b.date)));

/**
 * Los datos de un hecho, en columnas de `client_events`. Las macros van las
 * tres o ninguna (0142); con ellas, las kcal las calcula la base. O cifras
 * iguales o `pauta_dias`, nunca las dos (0143). El menú y el día del que
 * parte (0144) solo se escriben si llegan: el creador del plan no los manda y
 * una edición que no los toca no los borra.
 */
const filaDeHecho = ({
  kind,
  title,
  date,
  hasta = null,
  kcal = null,
  proteina = null,
  carbohidratos = null,
  grasa = null,
  pautaDias = null,
  nota = null,
  menus,
  parteDe,
}) => {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const macros = [num(proteina), num(carbohidratos), num(grasa)];
  const conMacros = macros.every((v) => v !== null);
  const texto = String(nota ?? '').trim().slice(0, 280);
  const dias = Array.isArray(pautaDias) && pautaDias.length > 1 ? pautaDias : null;
  return {
    kind,
    title: String(title || '').trim(),
    date,
    hasta: hasta && hasta > date ? hasta : null,
    kcal: conMacros || dias ? null : num(kcal),
    proteina_g: dias ? null : conMacros ? macros[0] : null,
    carbohidratos_g: dias ? null : conMacros ? macros[1] : null,
    grasa_g: dias ? null : conMacros ? macros[2] : null,
    nota: texto || null,
    pauta_dias: dias
      ? dias.map((d) =>
          [d.proteina, d.carbohidratos, d.grasa].every((v) => num(v) !== null)
            ? { p: num(d.proteina), c: num(d.carbohidratos), g: num(d.grasa) }
            : { kcal: num(d.kcal) }
        )
      : null,
    ...(menus !== undefined ? { menu: menus } : {}),
    ...(parteDe !== undefined ? { parte_de: parteDeToDb(parteDe) } : {}),
  };
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

  /*
    La pauta fechada y lo escrito de cada intervención, otra vez. Lo pide una
    dieta programada que acaba de entrar en vigor (0146): trae una versión
    nueva, con fecha, y quizá su motivo.
  */
  const releerLaPautaFechada = useCallback(async (clientId) => {
    if (!clientId || clientId !== activeClientId) return;
    const [versiones, capa] = await Promise.all([
      supabase.from('nutrition_plan_versions').select('dia, pauta').eq('client_id', clientId).order('dia'),
      supabase.from('client_interventions').select('*').eq('client_id', clientId),
    ]);
    if (!versiones.error) {
      setDietVersions((versiones.data || []).map((v) => ({ dia: v.dia, nutrition: mapNutritionFromDb(v.pauta || {}) })));
    }
    if (!capa.error) setNotasDeIntervencion((capa.data || []).map(mapInterventionFromDb));
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
   * «¿Por qué?»: el motivo de un cambio del plan, escrito como NOTA de la
   * versión que ese cambio acaba de dejar (0140). La versión la guarda la base
   * al escribir; aquí solo se busca y se anota (`anotar_version_del_plan`).
   *
   *   · Solo se anota una versión de quien escribe y tocada en los últimos 15
   *     minutos: si el cambio no dejó versión, no se le pone el motivo a una
   *     vieja ni a la de otra persona.
   *   · Varias ediciones seguidas son UNA versión (15 minutos, 0140): sus
   *     motivos se juntan con « · », sin repetir el mismo.
   */
  const anotarCambioDelPlan = useCallback(
    async (clientId, motivo) => {
      const texto = String(motivo || '').trim();
      if (!texto) return { ok: true };
      const userId = session?.user?.id;
      const { data: v, error } = await supabase
        .from('client_plan_versions')
        .select('id, nota, created_by, tocada_en')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { ok: false, error: error.message || 'No se ha podido guardar el motivo.' };
      /* La misma ventana que agrupa las ediciones (0140): lo tocado por quien
         escribe en los últimos 15 minutos es la versión de este cambio. */
      const reciente = v && Date.now() - new Date(v.tocada_en).getTime() < 15 * 60 * 1000;
      if (!v || !userId || v.created_by !== userId || !reciente) {
        return { ok: false, error: 'El motivo no se ha guardado: este cambio no ha dejado versión del plan.' };
      }
      const nota = juntarMotivos(v.nota, texto);
      if (nota.length > 280) {
        return { ok: false, error: 'El motivo no cabe: la nota de esta versión ya es larga. Acórtalo.' };
      }
      const { error: e2 } = await supabase.rpc('anotar_version_del_plan', { p_id: v.id, p_nota: nota });
      if (e2) return { ok: false, error: e2.message || 'No se ha podido guardar el motivo.' };
      /* `anadido`: si ya estaba (el mismo motivo dos veces en una versión), este
         paso no lo trajo y deshacerlo no debe quitarlo. */
      return { ok: true, versionId: v.id, anadido: nota !== juntarMotivos(v.nota, '') };
    },
    [session]
  );

  /**
   * Las versiones del plan de un cliente (0140), de la más nueva a la más
   * antigua. Se piden al abrir «Versiones»: no viven en el estado, porque
   * solo las mira esa lista y cambian con cada cambio del plan.
   */
  const leerVersionesDelPlan = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('client_plan_versions')
      .select('id, created_at, tocada_en, created_by, nota, fases, destino')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) return { ok: false, error: error.message || 'No se han podido leer las versiones del plan.' };
    return { ok: true, versiones: (data || []).map(versionDeFila) };
  }, []);

  /**
   * Dejar el plan como estaba en una versión (0147): fases y destino en una
   * transacción, y una versión nueva, cerrada, con la nota. Después se releen
   * las fases y el destino. El peso objetivo lo escribe la base en su clave;
   * quien llama lo pone también en las preferencias de la app, que se guardan
   * enteras (ver la 0147).
   */
  const restaurarVersionDelPlan = useCallback(
    async (clientId, versionId, nota) => {
      const { error } = await supabase.rpc('restaurar_version_del_plan', { p_version: versionId, p_nota: nota || null });
      if (error) {
        return {
          ok: false,
          error: /does not exist|schema cache/i.test(error.message || '')
            ? 'Falta aplicar la migración 0147 para poder restaurar versiones.'
            : error.message || 'No se ha podido restaurar la versión.',
        };
      }
      if (clientId === activeClientId) {
        const [fases, anclas] = await Promise.all([
          supabase.from('client_phases').select('*').eq('client_id', clientId).order('starts_on'),
          supabase.from('client_events').select('*').eq('client_id', clientId).eq('ancla', true).order('date'),
        ]);
        if (fases.data) setPhases(fases.data.map(mapPhaseFromDb));
        if (anclas.data) setAnchors(anclas.data.map(mapEventFromDb));
      }
      return { ok: true };
    },
    [activeClientId]
  );

  /**
   * Deshacer el paso que trajo un motivo lo quita de la nota de SU versión
   * (la que se anotó, aunque luego haya otra más nueva).
   */
  const quitarMotivoDelPlan = useCallback(async (versionId, motivo) => {
    const { data: v, error } = await supabase
      .from('client_plan_versions')
      .select('nota')
      .eq('id', versionId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message || 'No se ha podido quitar el motivo.' };
    if (!v) return { ok: true };
    const nota = quitarMotivo(v.nota, motivo);
    if (nota === juntarMotivos(v.nota, '')) return { ok: true };
    const { error: e2 } = await supabase.rpc('anotar_version_del_plan', { p_id: versionId, p_nota: nota });
    if (e2) return { ok: false, error: e2.message || 'No se ha podido quitar el motivo.' };
    return { ok: true };
  }, []);

  /**
   * Un hecho del plan —refeed, diet break, vacaciones, competición— puesto
   * desde el creador o desde las variaciones de la dieta. Es un evento del
   * calendario de siempre (0123): el calendario lo verá como cualquier otro.
   * Solo el entrenador escribe refeeds y diet breaks (RLS).
   *
   * Una variación puede traer además su pauta por día (`pautaDias`, 0143), su
   * menú día a día (`menus`) y el día del que parte (`parteDe`, 0144).
   */
  const anadirHecho = useCallback(
    async (clientId, datos) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };
      const { data, error } = await supabase
        .from('client_events')
        .insert({ client_id: clientId, created_by: userId, privada: false, ...filaDeHecho(datos) })
        .select()
        .single();
      if (error) return { ok: false, error: explicarErrorDeHecho(error) };
      const hecho = mapEventFromDb(data);
      if (clientId === activeClientId) setHechos((prev) => ordenarHechos([...prev, hecho]));
      return { ok: true, hecho };
    },
    [activeClientId, session]
  );

  /**
   * Cambiar una variación (o cualquier hecho) entera: se reescriben sus
   * fechas, cifras, indicación, menú y de qué día parte. Devuelve la de antes
   * para el «Deshacer».
   */
  const editarHecho = useCallback(
    async (eventId, datos) => {
      const antes = hechos.find((h) => h.id === eventId) || null;
      const { data, error } = await supabase
        .from('client_events')
        .update(filaDeHecho(datos))
        .eq('id', eventId)
        .select()
        .single();
      if (error) return { ok: false, error: explicarErrorDeHecho(error) };
      const hecho = mapEventFromDb(data);
      setHechos((prev) => ordenarHechos(prev.map((h) => (h.id === eventId ? hecho : h))));
      return { ok: true, hecho, antes };
    },
    [hechos]
  );

  /**
   * Quitarlo: es el Deshacer de `anadirHecho` y la papelera. Devuelve la fila
   * entera y la nota del entrenador (el motivo, que se va con ella por la FK),
   * para que `devolverHecho` la reponga tal cual, con su id.
   */
  const quitarHecho = useCallback(async (eventId) => {
    const [fila, capa] = await Promise.all([
      supabase.from('client_events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('client_interventions').select('*').eq('event_id', eventId).maybeSingle(),
    ]);
    const { error } = await supabase.from('client_events').delete().eq('id', eventId);
    if (error) return { ok: false, error: error.message };
    setHechos((prev) => prev.filter((h) => h.id !== eventId));
    setNotasDeIntervencion((prev) => prev.filter((c) => c.eventId !== eventId));
    return { ok: true, copia: { fila: fila.data || null, capa: capa.data || null } };
  }, []);

  /** El «Deshacer» de `quitarHecho`: la misma fila, con su id, y su motivo. */
  const devolverHecho = useCallback(
    async (copia) => {
      if (!copia?.fila) return { ok: false, error: 'No queda copia de lo quitado.' };
      const { data, error } = await supabase.from('client_events').insert(copia.fila).select().single();
      if (error) return { ok: false, error: explicarErrorDeHecho(error) };
      const hecho = mapEventFromDb(data);
      if (hecho.clientId === activeClientId) setHechos((prev) => ordenarHechos([...prev, hecho]));
      if (copia.capa) {
        const vuelta = await supabase.from('client_interventions').insert(copia.capa).select().single();
        if (!vuelta.error && hecho.clientId === activeClientId) {
          setNotasDeIntervencion((prev) => [...prev, mapInterventionFromDb(vuelta.data)]);
        }
      }
      return { ok: true, hecho };
    },
    [activeClientId]
  );

  /**
   * Al quitar un bloque previsto, la base se lleva su capa en cascada (0143)
   * cuando llegue el programa. Se saca ya de lo cargado y se devuelve, para
   * que su «Deshacer» la vuelva a poner (`devolverCapaDelBloque`).
   */
  const soltarCapaDelBloque = useCallback(
    (clientId, bloqueId) => {
      if (clientId !== activeClientId) return null;
      const capa = notasDeIntervencion.find((c) => c.clientId === clientId && c.bloqueId === bloqueId) || null;
      if (capa) setNotasDeIntervencion((prev) => prev.filter((c) => c.id !== capa.id));
      return capa;
    },
    [activeClientId, notasDeIntervencion]
  );

  /**
   * El «Deshacer» de `soltarCapaDelBloque`: la misma fila, con su id. El
   * borrador vuelve por la cola del programa y la base valida que exista
   * (0143): mientras no ha llegado, se reintenta.
   */
  const devolverCapaDelBloque = useCallback(
    async (capa) => {
      const userId = session?.user?.id;
      if (!capa || !userId) return { ok: false, error: 'No queda copia del motivo.' };
      const fila = {
        id: capa.id,
        client_id: capa.clientId,
        created_by: userId,
        bloque_id: capa.bloqueId,
        motivo: capa.motivo,
        valoracion: capa.valoracion,
        valoracion_nota: capa.valoracionNota,
        valorada_el: capa.valoradaEl,
        antes_desde: capa.antesDesde,
        despues_hasta: capa.despuesHasta,
      };
      let fallo = null;
      for (let i = 0; i < 12; i += 1) {
        const { data, error } = await supabase.from('client_interventions').insert(fila).select().single();
        if (!error) {
          if (capa.clientId === activeClientId) setNotasDeIntervencion((prev) => [...prev.filter((c) => c.id !== capa.id), mapInterventionFromDb(data)]);
          return { ok: true };
        }
        fallo = error;
        if (!/no existe/i.test(error.message || '')) break;
        await new Promise((r) => setTimeout(r, 700));
      }
      return { ok: false, error: fallo?.message || 'No se ha podido devolver el motivo.' };
    },
    [activeClientId, session]
  );

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
      /* Un cambio de dieta programado (0146) aún no tiene de qué colgar: sus
         ventanas y lo que se piense de él se escriben cuando entre en vigor. */
      if (!fuente) return { ok: false, error: 'Este cambio de dieta aún no ha empezado: lo que pienses de él se escribe cuando entre en vigor.' };
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
    releerLaPautaFechada,
    guardarIntervencion,
    soltarCapaDelBloque,
    devolverCapaDelBloque,
    leerVersionesDelPlan,
    restaurarVersionDelPlan,
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
    anotarCambioDelPlan,
    quitarMotivoDelPlan,
    anadirHecho,
    editarHecho,
    quitarHecho,
    devolverHecho,
  };
};
