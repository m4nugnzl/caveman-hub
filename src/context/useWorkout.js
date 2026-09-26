import { useCallback, useMemo, useRef } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { useMirroredState } from '@/lib/useMirroredState';
import { track } from '@/lib/analytics';
import { deepClone, newId } from '@/lib/ids';
import {
  buildMicrocycle,
  blankDays,
  cloneDays,
  emptyWorkoutData,
  findMicrocycle,
  firstCycleDate,
  microcicloParaLasHojas,
  microcycleIds,
  nextWeekNumber,
  reidExercises,
  restWeekSplit,
  today,
  uniqueDayName,
} from '@/domain/training';
import { buildSessionFromPlan, isSetLogged, sessionsOf, withSessionSet } from '@/domain/sessions';
import {
  blockOfWeek,
  buildOverride,
  overridePlanExerciseIn,
  planOfDay,
  removePlanExerciseIn,
  removePlanExerciseOnlyIn,
  updatePlanDayIn,
  updatePlanExerciseIn,
  updatePlanExercisesIn,
  wherePlanExercise,
  blockSessionOf,
  blocksOf,
  currentBlock,
  addBlockExerciseIn,
  setBlockExercisesIn,
  addBlockSessionIn,
  blockSessionsOf,
  duplicateBlockSessionIn,
  moveBlockExerciseIn,
  moveBlockSessionIn,
  promoteOverrideIn,
  marcarExcepcionVistaIn,
  putOverrideIn,
  removeBlockExerciseIn,
  removeBlockSessionFrom,
  removeOverrideIn,
  renameBlockSessionIn,
  renameBlockExerciseIn,
  renamePlanExerciseIn,
  BLOCK_CHANGE,
  restoreBlockExerciseIn,
  setBlockExerciseSetsIn,
  setBlockExerciseSchemeIn,
  setBlockExerciseTargetIn,
  setBlockSessionsIn,
  updateBlockExerciseIn,
  setOverrideSpanIn,
  blocksAfterInsertingWeek,
  deleteBlockFrom,
  logBlockChange as logBlockChangeIn,
  openNextBlock,
  programAfterRemovingWeek,
  renameBlockIn,
  blockTraits,
  setBlockTraitsIn,
  hasBlockPlan,
  proyectarPlanEnDias,
  resolvedMicrocycles,
  ponerPautaIn,
  volverAlAnteriorIn,
  soloEnIn,
  restaurarPautaIn,
  sellarPautasIn,
  fechaDelCicloSiguiente,
  conRepartoDelAbierto,
  materializarMicrociclos,
  ponerMicrociclo,
  seguirALasHojas,
} from '@/domain/blocks';
import { soltarHojaSinEntrenar } from '@/domain/hojasFuera';
import { conFechaDeSesion } from '@/domain/fechaDeLaSesion';
import {
  anadirBorrador,
  borradorDe,
  cambiarBorrador,
  datosParaEmpezar,
  devolverBorrador,
  moverBorrador,
  quitarBorrador,
  sePuedeEmpezar,
  sinBorrador,
} from '@/domain/borradores';
import { ponerReferencias } from '@/domain/lenteDeEntreno';
import { ponerCarpetaIn, sinCarpeta } from '@/domain/temporadas';
import { migrateBlockPlans } from '@/domain/blocksMigration';
import { freeSheetName } from '@/domain/pieces';
import { moveItem, isEmptyDiet } from '@/domain/nutrition';
import { apuntarFoto, conLoRegistradoDeAhora, mismoPlan } from '@/domain/deshacer';

/*
  ══ La rutina, sus sesiones y las copias entre clientes, fuera de AppContext

  El dominio más grande, con la frontera de useClients.js: recibe las puertas
  de la infraestructura de guardado —persist, persistSet y la propia queue,
  que las sesiones usan para encolar funciones de la base—, los dos loaders
  (ensureProgram/ensureNutrition, que se quedan en el proveedor porque los
  comparte el efecto del cliente abierto) y los estados espejados. profileRole
  decide qué camino de guardado toca: el coach reescribe el bloque, el
  cliente va por funciones de la base campo a campo.
*/

export const useWorkout = ({
  workoutRef,
  setWorkoutData,
  clientsRef,
  setClients,
  nutritionRef,
  setNutrition,
  persist,
  persistSet,
  persistExerciseNote,
  persistContinue,
  queue,
  ensureProgram,
  ensureNutrition,
  profileRole,
}) => {
  /* Las fotos del plan por cliente: `{ [clientId]: { pasado: [], futuro: [] } }`.
     Ver el bloque «DESHACER Y REHACER EL PLAN», más abajo. */
  const [historial, setHistorial, historialRef] = useMirroredState({});

  /*
    ══ UN GESTO ES UN PASO ═══════════════════════════════════════════════════

    Casi ningún gesto de la rutina escribe una sola vez. «+ serie» escribe dos:
    el plan del ejercicio y el renglón de la bitácora del bloque que dice que
    ha pasado. Pegar una hoja, otras dos. Sin esto, cada gesto dejaba DOS pasos
    en la pila y el primer ⌘Z no movía nada de lo que se ve —deshacía el
    renglón del diario— así que el atajo parecía roto justo la primera vez que
    alguien lo probaba. Medido en la app: un «+ serie» hacían falta dos ⌘Z.

    Las escrituras de un mismo gesto ocurren todas en el mismo turno del
    intérprete —son el manejador del clic, sin esperas por medio—, así que basta
    con guardar la PRIMERA de cada turno e ignorar las demás: el microtask
    levanta la bandera en cuanto ese turno termina. La foto que se guarda es la
    de antes de la primera escritura, que es exactamente el «antes» del gesto.
  */
  const enElMismoGestoRef = useRef(false);

  const apuntarEnElHistorial = useCallback(
    (clientId, foto) => {
      if (enElMismoGestoRef.current) return;
      enElMismoGestoRef.current = true;
      queueMicrotask(() => {
        enElMismoGestoRef.current = false;
      });
      setHistorial({
        ...historialRef.current,
        [clientId]: apuntarFoto(historialRef.current[clientId], foto),
      });
    },
    [historialRef, setHistorial]
  );

  /**
   * Aplica un updater puro sobre la rutina de un cliente, actualiza el estado
   * y encola el guardado. Devuelve el nuevo valor para que quien llame pueda
   * derivar datos (ej. el número de la semana creada) sin esperar a React.
   */
  /**
   * @param skipPersist  Actualiza solo el estado local. Lo usa el cliente al
   *   registrar una serie: el dato se guarda por otro camino —la función
   *   `log_session_set`, que escribe únicamente ese campo— porque el cliente no
   *   tiene permiso para reescribir el bloque completo. Sin esta opción, cada
   *   tecleo suyo lanzaría además un upsert que la base de datos rechazaría, y el
   *   indicador de guardado mostraría un error por cada letra.
   */
  /**
   * @param sinHistorial  No apunta el cambio en la pila de deshacer. Lo usan
   *   `deshacerPlan` y `rehacerPlan`, que ya mueven la pila a mano: sin esto,
   *   deshacer apuntaría su propia vuelta atrás como un cambio más y no habría
   *   manera de salir del último paso.
   */
  const applyWorkout = useCallback(
    (clientId, updater, { immediate = true, skipPersist = false, sinHistorial = false } = {}) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      /* `weekly_split` se copia del bloque abierto aquí y en ningún otro sitio:
         ver `conRepartoDelAbierto`. */
      /* Y la foto de la pauta en las sesiones hechas cuya hoja cambia, venga el
         cambio de donde venga: ver `sellarPautasIn`. No en el camino del cliente
         (`skipPersist`), que solo anota series y no toca ninguna pauta. */
      const hecho = updater(current);
      const next = conRepartoDelAbierto(skipPersist ? hecho : sellarPautasIn(current, hecho));
      if (next === current) return current;

      setWorkoutData({ ...workoutRef.current, [clientId]: next });
      if (!skipPersist) persist('workout', clientId, next, { immediate });

      /*
        ── Y la foto de antes, si lo que ha cambiado es el PLAN ──────────────
        `skipPersist` es el camino del cliente registrando sus series: ni se
        guarda por aquí ni se deshace desde aquí. Y `mismoPlan` deja fuera lo
        que el entrenador escribe en el registro —los kilos que le apunta a
        alguien— para que ⌘Z no se gaste en pasos que al volver no mueven nada.
      */
      if (!skipPersist && !sinHistorial && !mismoPlan(current, next)) {
        apuntarEnElHistorial(clientId, current);
      }
      return next;
    },
    [apuntarEnElHistorial, persist, setWorkoutData, workoutRef]
  );

  /*
    ══ DESHACER Y REHACER EL PLAN ════════════════════════════════════════════

    Lo que hay abajo es toda la mecánica: una pila por cliente con las fotos de
    antes (`pasado`) y las de después de deshacer (`futuro`). La ley —qué es
    una foto y qué no se devuelve nunca— vive en `domain/deshacer`.

    Por qué la pila es estado y no un ref: la pantalla enseña el mando solo
    cuando hay algo que deshacer (la ley del reposo), y para eso tiene que
    enterarse de que la pila ha cambiado. Las fotos son objetos inmutables que
    ya existen —comparten estructura con el programa vivo—, así que guardarlas
    no cuesta lo que parece.
  */
  const deshacerPlan = useCallback(
    (clientId) => {
      const pila = historialRef.current[clientId];
      if (!pila?.pasado?.length) return false;

      const foto = pila.pasado[pila.pasado.length - 1];
      const actual = workoutRef.current[clientId] || emptyWorkoutData();
      setHistorial({
        ...historialRef.current,
        [clientId]: { pasado: pila.pasado.slice(0, -1), futuro: [...(pila.futuro || []), actual] },
      });
      applyWorkout(clientId, () => conLoRegistradoDeAhora(foto, actual), { sinHistorial: true });
      return true;
    },
    [applyWorkout, historialRef, setHistorial, workoutRef]
  );

  const rehacerPlan = useCallback(
    (clientId) => {
      const pila = historialRef.current[clientId];
      if (!pila?.futuro?.length) return false;

      const foto = pila.futuro[pila.futuro.length - 1];
      const actual = workoutRef.current[clientId] || emptyWorkoutData();
      setHistorial({
        ...historialRef.current,
        [clientId]: { pasado: [...(pila.pasado || []), actual], futuro: pila.futuro.slice(0, -1) },
      });
      applyWorkout(clientId, () => conLoRegistradoDeAhora(foto, actual), { sinHistorial: true });
      return true;
    },
    [applyWorkout, historialRef, setHistorial, workoutRef]
  );

  const applyDay = useCallback(
    (clientId, weekNumber, dayName, updater, options) =>
      applyWorkout(
        clientId,
        (cd) => ({
          ...cd,
          microcycles: cd.microcycles.map((m) =>
            m.weekNumber !== weekNumber
              ? m
              : { ...m, days: m.days.map((d) => (d.dayName !== dayName ? d : updater(d))) }
          ),
        }),
        options
      ),
    [applyWorkout]
  );

  /**
   * Objetivo de repeticiones de una serie. Vive en el PLAN, no en la sesión: es
   * lo que el entrenador programa, no lo que se ejecuta.
   */
  const updateExerciseSet = useCallback(
    (clientId, weekNumber, dayName, exId, setIdx, field, value) =>
      applyDay(
        clientId,
        weekNumber,
        dayName,
        (d) => ({
          ...d,
          exercises: d.exercises.map((ex) =>
            ex.id !== exId
              ? ex
              : { ...ex, sets: ex.sets.map((s, i) => (i !== setIdx ? s : { ...s, [field]: value })) }
          ),
        }),
        { immediate: false }
      ),
    [applyDay]
  );

  /**
   * Objetivo de repeticiones de un ejercicio: se escribe en TODAS sus series.
   *
   * El dato vive por serie en el JSONB (así estaba y no merece una migración),
   * pero se programa por ejercicio: "4×8-10". Editarlo en un solo sitio evita
   * tener que repetir la misma cifra cuatro veces.
   */
  const updateExerciseTarget = useCallback(
    (clientId, weekNumber, dayName, exId, value) =>
      applyDay(
        clientId,
        weekNumber,
        dayName,
        (d) => ({
          ...d,
          exercises: d.exercises.map((ex) =>
            ex.id !== exId ? ex : { ...ex, sets: ex.sets.map((s) => ({ ...s, targetReps: value })) }
          ),
        }),
        { immediate: false }
      ),
    [applyDay]
  );

  // ── Sesiones de entrenamiento ────────────────────────────────────────────
  //
  // El plan (`microcycle.days`) y la ejecución (`microcycle.sessions`) están
  // separados. Antes los kilos se anotaban dentro del plan, así que no quedaba
  // constancia de CUÁNDO se entrenó, no se podía repetir un día en la misma
  // semana, y si el entrenador cambiaba el plan se sobrescribía el registro.

  const applyMicrocycle = useCallback(
    (clientId, weekNumber, updater, options) =>
      applyWorkout(
        clientId,
        (cd) => ({
          ...cd,
          microcycles: cd.microcycles.map((m) => (m.weekNumber === weekNumber ? updater(m) : m)),
        }),
        options
      ),
    [applyWorkout]
  );

  /**
   * Crea una sesión para un día y una fecha. Si ya existe una en esa fecha la
   * devuelve en lugar de duplicarla: dos registros del mismo día no son dos
   * sesiones distintas.
   */
  const startSession = useCallback(
    (clientId, weekNumber, dayName, date = today()) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const micro = findMicrocycle(current.microcycles, weekNumber);
      if (!micro) return null;

      const existing = sessionsOf(micro).find((s) => s.dayName === dayName && s.date === date);
      if (existing) return existing.id;

      const day = (micro.days || []).find((d) => d.dayName === dayName);
      if (!day) return null;

      const session = buildSessionFromPlan(day, date);
      applyMicrocycle(clientId, weekNumber, (m) => ({
        ...m,
        sessions: [...sessionsOf(m), session],
      }));
      /* El gesto de cada día que alguien entrena. Va aquí y no en `logSessionSet`
         a propósito: registrar un kilo ocurre cien veces por sesión y mediría la
         velocidad de tecleo, no el uso. La comprobación de más arriba —si ya hay
         sesión de ese día, se devuelve— garantiza una por día entrenado. */
      track('sesion_registrada');
      return session.id;
    },
    [applyMicrocycle, workoutRef]
  );

  /**
   * Registra un valor ejecutado (kg, reps o RIR). Si la sesión indicada no
   * existe todavía se crea al vuelo, de modo que el usuario solo tiene que
   * empezar a escribir.
   */
  const logSessionSet = useCallback(
    (clientId, weekNumber, sessionId, date, dayName, exercise, setIndex, field, value, sub = null) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const micro = findMicrocycle(current.microcycles, weekNumber);
      if (!micro) return null;

      let targetId = sessionId;
      let sessions = sessionsOf(micro);

      if (!targetId || !sessions.some((s) => s.id === targetId)) {
        const day = (micro.days || []).find((d) => d.dayName === dayName);
        if (!day) return null;
        /* Con el id que trae, si trae uno: es el de una serie que el servidor no
           guardó y que la pantalla sigue enseñando (`domain/seriesSinConfirmar`).
           Otro id partiría la misma sesión en dos. */
        const created = { ...buildSessionFromPlan(day, date), ...(targetId ? { id: targetId } : {}) };
        targetId = created.id;
        sessions = [...sessions, created];
      }

      /*
        ── Dos caminos para el mismo dato, y el motivo es de permisos ──────────
        El estado local se actualiza igual en los dos casos: la interfaz tiene que
        responder al instante y no depender de la red. Lo que cambia es CÓMO se
        persiste.

        El ENTRENADOR reescribe el jsonb completo. Es lo correcto para él: está
        editando el programa, que es suyo, y tiene UPDATE sobre la fila.

        El CLIENTE llama a `log_session_set` (migración 0014), que recibe qué serie
        y qué valor y escribe solo eso. Antes usaba el mismo camino que el
        entrenador, y eso significaba darle UPDATE sobre la fila entera: como RLS
        filtra filas y no columnas, ese permiso —concedido para anotar «8
        repeticiones»— le alcanzaba para borrarse el programa completo desde la
        consola del navegador. No hacía falta mala intención: una pestaña vieja
        guardando su copia en caché encima de la actual bastaba.

        Es el mismo arreglo que se hizo con `preferences` en la 0008: el permiso
        pasa de ser una fila a ser una operación.
      */
      const nextSessions = sessions.map((s) =>
        s.id === targetId ? withSessionSet(s, exercise, setIndex, field, value, sub) : s
      );

      if (profileRole === 'client') {
        // Estado local sin persistir el bloque: `skipPersist` evita el upsert que
        // ya no está permitido.
        applyMicrocycle(clientId, weekNumber, (m) => ({ ...m, sessions: nextSessions }), {
          skipPersist: true,
        });

        /*
          Una clave de cola por CAMPO: cada tecleo sustituye el valor anterior de
          ese campo, y kg, reps y RIR no se pisan entre sí. Si la clave fuera por
          día, la cola solo guardaría el último payload y perdería los otros dos.

          El id de la sesión se genera aquí y se manda siempre el mismo, así que las
          tres llamadas escriben en la misma sesión aunque lleguen a la vez.
        */
        /* La subserie entra en la clave: la bajada 1 y la bajada 2 de la misma
           serie son dos valores distintos y no pueden pisarse en la cola. */
        persistSet(
          `set:${clientId}:${targetId}:${exercise.id}:${setIndex}${sub === null ? '' : `.${sub}`}:${field}`,
          clientId,
          {
            weekNumber,
            sessionId: targetId,
            date,
            dayName,
            exercise,
            setIndex,
            field,
            value,
            sub,
          }
        );
      } else {
        applyMicrocycle(clientId, weekNumber, (m) => ({ ...m, sessions: nextSessions }), {
          immediate: false,
        });
      }

      return targetId;
    },
    [applyMicrocycle, persistSet, profileRole, workoutRef]
  );

  const updateSession = useCallback(
    (clientId, weekNumber, sessionId, fields) =>
      applyMicrocycle(clientId, weekNumber, (m) => ({
        ...m,
        sessions: sessionsOf(m).map((s) => (s.id === sessionId ? { ...s, ...fields } : s)),
      })),
    [applyMicrocycle]
  );

  /**
   * Lo que cuelga de una sesión y no son kilos: la nota del entrenador, el
   * logbook del cliente y sus respuestas al terminar.
   *
   * ── Los dos caminos, otra vez, y por el mismo motivo ──────────────────────
   * El ENTRENADOR reescribe el jsonb: es su programa y tiene UPDATE sobre la
   * fila. El CLIENTE llama a `log_session_feedback` (migración 0016), que escribe
   * exactamente dos claves de una sesión que ya existe. Es el mismo reparto que
   * hay para las series con `log_session_set`, y por la misma razón: la fila
   * contiene el programa entero, así que darle UPDATE para que pueda escribir
   * «me dolió el hombro» le alcanzaría para borrárselo.
   *
   * `coachNote` NO viaja por la vía del cliente aunque él la vea: si pudiera
   * escribirla, podría fabricarse indicaciones que parecen de su entrenador.
   *
   * ── Sin la 0016 aplicada ──────────────────────────────────────────────────
   * El cliente ve el error de guardado con su botón de reintentar, como con
   * cualquier otro fallo de escritura. Lo que NO pasa es que se pierda en
   * silencio: el estado local ya cambió y el indicador dice que no se guardó.
   */
  const updateSessionMeta = useCallback(
    (clientId, weekNumber, sessionId, patch) => {
      /*
        `patch.feedback` es un DELTA —una respuesta, no el objeto entero— y aquí se
        fusiona sobre lo que ya hubiera, igual que hace la función de la 0016. Que
        las dos capas fusionen es lo que hace posible mandar una respuesta por
        llamada, que es lo que evita que dos toques seguidos se pisen.
      */
      const local = (m) => ({
        ...m,
        sessions: sessionsOf(m).map((s) =>
          s.id !== sessionId
            ? s
            : {
                ...s,
                ...patch,
                ...(patch.feedback ? { feedback: { ...(s.feedback || {}), ...patch.feedback } } : {}),
              }
        ),
      });

      if (profileRole !== 'client') {
        applyMicrocycle(clientId, weekNumber, local, { immediate: false });
        return;
      }

      applyMicrocycle(clientId, weekNumber, local, { skipPersist: true });

      /*
        ── Una clave de cola por CAMPO, y se manda SOLO ese campo ──────────────
        La cola retiene un único payload por clave. Si la clave fuera la sesión y
        el payload la sesión entera, dos ediciones seguidas —contestar una escala
        y seguir escribiendo en el cuaderno— se pisarían: la segunda se construye
        leyendo el estado, que todavía no ha recibido la primera, así que la
        sobrescribe con un valor viejo. Es exactamente el caso que `log_session_set`
        documenta para kg/reps/RIR, y se resuelve igual.

        `null` en la función de la 0016 significa «no toques esto», así que mandar
        un solo campo por llamada no borra el otro.
      */
      if (patch.clientNote !== undefined) {
        queue.enqueue(
          `note:${clientId}:${sessionId}`,
          patch.clientNote,
          (note) =>
            supabase.rpc('log_session_feedback', {
              p_client: clientId,
              p_week: weekNumber,
              p_session_id: sessionId,
              p_note: String(note ?? ''),
              p_feedback: null,
            }),
          { immediate: false }
        );
      }

      if (patch.feedback !== undefined) {
        /* La clave incluye las preguntas del delta: normalmente es una sola, así
           que cada respuesta tiene su propia entrada en la cola y ninguna sustituye
           a otra mientras se está guardando. */
        queue.enqueue(
          `feedback:${clientId}:${sessionId}:${Object.keys(patch.feedback).sort().join(',')}`,
          patch.feedback,
          (feedback) =>
            supabase.rpc('log_session_feedback', {
              p_client: clientId,
              p_week: weekNumber,
              p_session_id: sessionId,
              p_note: null,
              /* Las respuestas viajan como texto, igual que los kilos: el usuario
                 escribe cadenas y `toNum` decide después qué es un número. La
                 función de la 0016 rechaza cualquier otro tipo. */
              p_feedback: Object.fromEntries(
                Object.entries(feedback || {}).map(([k, v]) => [k, String(v ?? '')])
              ),
            }),
          { immediate: false }
        );
      }
    },
    [applyMicrocycle, profileRole, queue]
  );

  /**
   * TERMINAR la sesión: estampa el fin.
   *
   * Es el único momento en que se dice cuánto ha costado («te ha costado 52
   * min»), y es lo que la saca de «la dejaste a medias». El sello de verdad lo
   * pone el servidor con su reloj (`log_session_close`, 0119); aquí se escribe
   * el de este navegador para que el resumen pueda decir la cifra sin esperar a
   * la red, que es lo que pasa en un gimnasio.
   *
   * ── Lo que se pierde si el envío no llega, y por qué se puede perder ──────
   * Nada que no se pueda volver a decir. Un cierre que no sale reaparece en la
   * portada como la sesión a medias, con «Seguir» y «Descartar»: la propia
   * pantalla que existe para esto es la recuperación. Por eso su clave de cola
   * no está entre las que se reenvían al arrancar (ver `AppContext`) — apuntar
   * en el navegador «hay que cerrar aquello» duplicaría un mecanismo que ya
   * tiene la persona delante.
   */
  const closeSession = useCallback(
    (clientId, weekNumber, sessionId) => {
      if (!clientId || !sessionId || !Number.isFinite(weekNumber)) return;
      const endedAt = new Date().toISOString();
      const local = (m) => ({
        ...m,
        sessions: sessionsOf(m).map((s) => (s.id === sessionId ? { ...s, endedAt } : s)),
      });

      if (profileRole !== 'client') {
        applyMicrocycle(clientId, weekNumber, local, { immediate: false });
        return;
      }

      applyMicrocycle(clientId, weekNumber, local, { skipPersist: true });
      queue.enqueue(
        `cierre:${clientId}:${sessionId}`,
        { weekNumber, sessionId },
        (data) =>
          supabase.rpc('log_session_close', {
            p_client: clientId,
            p_week: data.weekNumber,
            p_session_id: data.sessionId,
          }),
        /* Inmediato: es un gesto explícito con una pantalla esperando. El resto
           de la sesión se guarda en tandas porque son cien tecleos. */
        { immediate: true }
      );
    },
    [applyMicrocycle, profileRole, queue]
  );

  /**
   * EL DÍA DE UNA SESIÓN, desde el mini calendario de los dos lados.
   *
   * La misma escritura para el entrenador y el cliente (`conFechaDeSesion`); lo
   * que cambia es cómo se persiste, por el mismo motivo que las series: el
   * entrenador reescribe el programa, que es suyo, y el cliente va por
   * `log_session_date` (0135), que valida el día y la frontera de las
   * revisiones en el servidor y deja dicho que lo movió él.
   *
   * Qué días se ofrecen lo decide `domain/fechaDeLaSesion`; aquí no se repite.
   */
  const cambiarFechaDeSesion = useCallback(
    (clientId, weekNumber, sessionId, fecha) => {
      if (!clientId || !sessionId || !fecha || !Number.isFinite(weekNumber)) return;
      const porCliente = profileRole === 'client';
      const local = (m) => conFechaDeSesion(m, sessionId, fecha, { porCliente });

      if (!porCliente) {
        applyMicrocycle(clientId, weekNumber, local, { immediate: true });
        return;
      }

      applyMicrocycle(clientId, weekNumber, local, { skipPersist: true });
      queue.enqueue(
        `fecha:${clientId}:${sessionId}`,
        { weekNumber, sessionId, fecha },
        (data) =>
          supabase.rpc('log_session_date', {
            p_client: clientId,
            p_week: data.weekNumber,
            p_session_id: data.sessionId,
            p_date: data.fecha,
          }),
        /* Inmediato: es un gesto explícito, como «Terminar». */
        { immediate: true }
      );
    },
    [applyMicrocycle, profileRole, queue]
  );

  /**
   * DESCARTAR una sesión a medias: la borra.
   *
   * El porqué de que borre —y no marque nada— está en la 0119: la razón de
   * anunciarla es que contamina el histórico, y dejarla dentro con una marca
   * obligaría a que cada cuenta del producto se acordase de la marca.
   *
   * La base de datos solo lo permite mientras la sesión esté SIN CERRAR. Aquí no
   * se repite esa comprobación con otro código: la pantalla solo ofrece el verbo
   * sobre lo que `sesionAMedias` devuelve, que es exactamente eso.
   */
  const discardSession = useCallback(
    (clientId, weekNumber, sessionId) => {
      if (!clientId || !sessionId || !Number.isFinite(weekNumber)) return;
      const local = (m) => ({
        ...m,
        sessions: sessionsOf(m).filter((s) => s.id !== sessionId),
      });

      if (profileRole !== 'client') {
        applyMicrocycle(clientId, weekNumber, local, { immediate: false });
        return;
      }

      applyMicrocycle(clientId, weekNumber, local, { skipPersist: true });
      queue.enqueue(
        `descarte:${clientId}:${sessionId}`,
        { weekNumber, sessionId },
        (data) =>
          supabase.rpc('log_session_discard', {
            p_client: clientId,
            p_week: data.weekNumber,
            p_session_id: data.sessionId,
          }),
        { immediate: true }
      );
    },
    [applyMicrocycle, profileRole, queue]
  );

  /**
   * LA NOTA DEL CLIENTE en un ejercicio de una sesión.
   *
   * Cuelga de la entrada de la sesión y no del plan, que es lo que la deja
   * fechada con el entreno y pegada a los kilos que explica. La del plan
   * (`coachNote`) es del entrenador y el cliente no la puede escribir: si
   * pudiera, se fabricaría indicaciones que parecen suyas.
   *
   * ── Y ésta sí se reenvía al arrancar ──────────────────────────────────────
   * A diferencia del cierre, aquí lo que se perdería es TEXTO que alguien
   * escribió, y no hay ninguna pantalla que lo vuelva a pedir. Su clave
   * (`notaej:`) está entre las que se recuperan.
   *
   * ── Solo la escribe el cliente, y sin esperar a la primera serie (0139) ──
   * Su entrenador la lee y no la escribe: la función de la base lo rechaza, y
   * aquí no hay camino para él. Y si la sesión aún no existe, se crea como la
   * crea la primera serie (`logSessionSet`), con el día y la fecha de la
   * pantalla: lo escrito antes de empezar ya no se pierde.
   *
   * @returns el id de la sesión, o `null` si no ha escrito nada.
   */
  const logExerciseNote = useCallback(
    (clientId, weekNumber, sessionId, exerciseId, note, { date = null, dayName = null } = {}) => {
      if (profileRole !== 'client') return null;
      if (!clientId || !exerciseId || !Number.isFinite(weekNumber)) return null;
      const texto = String(note ?? '');
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const micro = findMicrocycle(current.microcycles, weekNumber);
      if (!micro) return null;

      let targetId = sessionId;
      let sessions = sessionsOf(micro);
      const existe = Boolean(targetId) && sessions.some((s) => s.id === targetId);
      if (!existe) {
        const day = (micro.days || []).find((d) => d.dayName === dayName);
        if (!day) return null;
        const created = { ...buildSessionFromPlan(day, date || undefined), ...(targetId ? { id: targetId } : {}) };
        targetId = created.id;
        sessions = [...sessions, created];
      }

      const session = sessions.find((s) => s.id === targetId);
      const planEx = (micro.days || [])
        .find((d) => d.dayName === (session.dayName || dayName))
        ?.exercises?.find((ex) => ex.id === exerciseId);
      const tiene = (session.entries || []).some((e) => e.exerciseId === exerciseId);
      if (!tiene && !planEx) return null;

      const nextSessions = sessions.map((s) =>
        s.id !== targetId
          ? s
          : {
              ...s,
              entries: tiene
                ? (s.entries || []).map((e) => (e.exerciseId === exerciseId ? { ...e, clientNote: texto } : e))
                : [
                    ...(s.entries || []),
                    {
                      exerciseId,
                      name: planEx.name,
                      muscle: planEx.muscle,
                      sets: (planEx.sets || []).map(() => ({ kg: '', reps: '', rir: '' })),
                      clientNote: texto,
                    },
                  ],
            }
      );

      applyMicrocycle(clientId, weekNumber, (m) => ({ ...m, sessions: nextSessions }), { skipPersist: true });
      persistExerciseNote(`notaej:${clientId}:${targetId}:${exerciseId}`, clientId, {
        weekNumber,
        sessionId: targetId,
        exerciseId,
        note: texto,
        date: session.date || date || null,
        dayName: session.dayName || dayName || null,
      });
      return targetId;
    },
    [applyMicrocycle, persistExerciseNote, profileRole, workoutRef]
  );

  /**
   * El calentamiento / movilidad del cliente.
   *
   * Vive en `workout_data.mobility_drills`, una columna que existe desde el
   * primer esquema y que no usaba ninguna pantalla. Es del ENTRENADOR: el cliente
   * la lee y no la escribe, así que no necesita función propia.
   */
  const updateMobilityDrills = useCallback(
    (clientId, drills) =>
      applyWorkout(clientId, (cd) => ({ ...cd, mobilityDrills: drills }), { immediate: false }),
    [applyWorkout]
  );

  const removeSession = useCallback(
    (clientId, weekNumber, sessionId) =>
      applyMicrocycle(clientId, weekNumber, (m) => ({
        ...m,
        sessions: sessionsOf(m).filter((s) => s.id !== sessionId),
      })),
    [applyMicrocycle]
  );

  const addExercise = useCallback(
    (clientId, weekNumber, dayName, exercise) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({
        ...d,
        exercises: [...d.exercises, exercise],
      })),
    [applyDay]
  );

  /**
   * Varios ejercicios a un día, en UNA escritura.
   *
   * `addExercise` en bucle parece lo mismo y no lo es: cada llamada reserializa
   * el programa entero y encola su guardado, así que importar una hoja de siete
   * ejercicios manda siete escrituras del mismo documento por la cola. Con una
   * rutina de cinco días son treinta y tres.
   */
  const addExercises = useCallback(
    (clientId, weekNumber, dayName, exercises) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({
        ...d,
        exercises: [...d.exercises, ...exercises],
      })),
    [applyDay]
  );

  const removeExercise = useCallback(
    (clientId, weekNumber, dayName, exId) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({
        ...d,
        exercises: d.exercises.filter((ex) => ex.id !== exId),
      })),
    [applyDay]
  );

  /**
   * El inverso de `removeExercise`, para el «Deshacer» del aviso.
   *
   * Borrar un ejercicio dejó de pedir confirmación: es lo frecuente, y lo
   * frecuente se deshace con inverso en vez de confirmarse (la regla, en
   * `ui/ToastProvider`). Esto es lo que hace posible el inverso: vuelve a
   * ponerlo donde estaba, con sus series y su nota tal cual.
   */
  const restoreExercise = useCallback(
    (clientId, weekNumber, dayName, exercise, index) =>
      applyDay(clientId, weekNumber, dayName, (d) => {
        const exercises = [...d.exercises];
        exercises.splice(Math.max(0, Math.min(index, exercises.length)), 0, exercise);
        return { ...d, exercises };
      }),
    [applyDay]
  );

  const addExerciseSetSlot = useCallback(
    (clientId, weekNumber, dayName, exId) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({
        ...d,
        exercises: d.exercises.map((ex) => {
          if (ex.id !== exId) return ex;
          const last = ex.sets[ex.sets.length - 1];
          return {
            ...ex,
            sets: [...ex.sets, { kg: '', reps: '', rir: '', targetReps: last?.targetReps || '' }],
          };
        }),
      })),
    [applyDay]
  );

  const removeExerciseSetSlot = useCallback(
    (clientId, weekNumber, dayName, exId, setIdx) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({
        ...d,
        exercises: d.exercises.map((ex) => {
          if (ex.id !== exId || ex.sets.length <= 1) return ex;
          if (setIdx === undefined || setIdx === null) return { ...ex, sets: ex.sets.slice(0, -1) };
          return { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) };
        }),
      })),
    [applyDay]
  );

  /**
   * Cuántas series tiene un ejercicio, de una vez.
   *
   * ── Por qué no basta con llamar a los dos de arriba en bucle ───────────────
   * Porque pasar de 3 a 6 series serían tres escrituras del programa entero por
   * la cola, y desde la plantilla del bloque eso se multiplica por las semanas
   * a las que llega el cambio: una edición de «4 → 6» en un bloque de seis
   * semanas mandaría doce. Es el mismo motivo por el que existe `addExercises`
   * al lado de `addExercise`.
   *
   * Las series que sobran se quitan por el final y NUNCA una con algo anotado:
   * cambiar el plan no puede borrar lo que alguien levantó. Si las últimas
   * están registradas, el ejercicio se queda con las que tiene.
   */
  const setExerciseSetCount = useCallback(
    (clientId, weekNumber, dayName, exId, count) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({
        ...d,
        exercises: d.exercises.map((ex) => {
          if (ex.id !== exId) return ex;
          const objetivo = Math.max(1, Math.min(12, Math.round(count) || 1));
          const sets = [...(ex.sets || [])];
          if (sets.length === objetivo) return ex;

          if (sets.length < objetivo) {
            const ultima = sets[sets.length - 1];
            while (sets.length < objetivo) {
              sets.push({ kg: '', reps: '', rir: '', targetReps: ultima?.targetReps || '', targetRir: ultima?.targetRir || '' });
            }
            return { ...ex, sets };
          }

          while (sets.length > objetivo && sets.length > 1 && !isSetLogged(sets[sets.length - 1])) sets.pop();
          return { ...ex, sets };
        }),
      })),
    [applyDay]
  );

  const moveExercise = useCallback(
    (clientId, weekNumber, dayName, fromIndex, toIndex) =>
      applyDay(clientId, weekNumber, dayName, (d) => {
        if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= d.exercises.length) return d;
        const exercises = [...d.exercises];
        const [moved] = exercises.splice(fromIndex, 1);
        exercises.splice(Math.max(0, Math.min(exercises.length, toIndex)), 0, moved);
        return { ...d, exercises };
      }),
    [applyDay]
  );

  const renameDay = useCallback(
    (clientId, weekNumber, oldName, newName) => {
      const name = String(newName || '').trim();
      if (!name || name === oldName) return;
      applyDay(clientId, weekNumber, oldName, (d) => ({ ...d, dayName: name }));
    },
    [applyDay]
  );

  const addDay = useCallback(
    (clientId, weekNumber, dayName) =>
      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: cd.microcycles.map((m) =>
          m.weekNumber !== weekNumber
            ? m
            : {
                ...m,
                days: [...m.days, { dayName: uniqueDayName(m.days, dayName.trim()), exercises: [] }],
              }
        ),
      })),
    [applyWorkout]
  );

  /**
   * Varios días con sus ejercicios ya montados, de una vez.
   *
   * Es lo que necesita traer una rutina de fuera: una hoja de cinco días entra
   * como una sola escritura y no como cinco altas más treinta y tres ejercicios.
   *
   * Los nombres pasan por `uniqueDayName` **acumulando**, no contra el
   * microciclo de partida: dos días llamados «Torso» en la misma hoja tienen que
   * salir «Torso» y «Torso (2)», y comparando cada uno solo con lo que había
   * antes de empezar los dos se llamarían igual.
   *
   * @param dropEmptyDays  Quita los días que no tienen ni un ejercicio ANTES de
   *   añadir los nuevos. Solo lo pide quien acaba de crear el programa: el
   *   «Día 1» en blanco que monta `startProgram` es un andamio para que la
   *   pantalla tenga algo que enseñar, y dejarlo al lado de los cinco días
   *   recién traídos es dejar basura del montaje. Fuera de ese caso va apagado,
   *   porque un día vacío puede ser un día que alguien está montando.
   */
  const importDays = useCallback(
    (clientId, weekNumber, days, { dropEmptyDays = false } = {}) =>
      applyMicrocycle(clientId, weekNumber, (m) => {
        const base = dropEmptyDays ? (m.days || []).filter((d) => (d.exercises || []).length > 0) : m.days;
        return (days || []).reduce(
          (acc, day) => ({
            ...acc,
            days: [
              ...acc.days,
              {
                dayName: uniqueDayName(acc.days, String(day.dayName || '').trim()),
                exercises: day.exercises || [],
              },
            ],
          }),
          { ...m, days: base }
        );
      }),
    [applyMicrocycle]
  );

  const duplicateDay = useCallback(
    (clientId, weekNumber, dayName) =>
      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: cd.microcycles.map((m) => {
          if (m.weekNumber !== weekNumber) return m;
          const source = m.days.find((d) => d.dayName === dayName);
          if (!source) return m;
          return {
            ...m,
            days: [
              ...m.days,
              {
                dayName: uniqueDayName(m.days, dayName),
                exercises: reidExercises(deepClone(source.exercises || [])),
              },
            ],
          };
        }),
      })),
    [applyWorkout]
  );

  /**
   * Cambia un día de sitio dentro de su microciclo.
   *
   * ══ Por qué hacía falta ═════════════════════════════════════════════════════
   *
   * El orden de los días se podía elegir UNA vez —al crearlos— y nunca más.
   * Añadir un día iba siempre al final (`addDay`), duplicar también, así que
   * cualquier cambio de estructura a mitad de mesociclo dejaba el carril
   * desordenado para siempre: la única salida era borrar el día y volver a
   * escribirlo entero con sus ejercicios y sus series.
   *
   * Y el orden no es decorativo: es el orden en que el cliente ve su semana y en
   * el que la ejecuta. Los ejercicios de un día y las comidas de una dieta ya se
   * reordenaban por este mismo motivo; los días eran el hueco.
   *
   * ── Mueve solo ESTA semana ──────────────────────────────────────────────────
   * Cada microciclo tiene sus propios días, y es lo mismo que hacen `renameDay` y
   * `removeDay`: la semana 3 puede tener una estructura distinta de la 1 —de eso
   * va programar— y propagar el movimiento a todas escribiría en semanas que ni
   * se están mirando.
   *
   * Devuelve el índice donde ha quedado, o `-1` si no se ha movido nada, para que
   * la pantalla pueda seguir al día en vez de quedarse sobre el que ocupe ahora
   * esa posición.
   */
  const moveDay = useCallback(
    (clientId, weekNumber, dayName, toIndex) => {
      let destino = -1;

      applyWorkout(clientId, (cd) => {
        const micro = cd.microcycles.find((m) => m.weekNumber === weekNumber);
        const days = micro?.days || [];
        const from = days.findIndex((d) => d.dayName === dayName);
        const to = Math.max(0, Math.min(days.length - 1, toIndex));

        /* El MISMO objeto, no uno igual: `applyWorkout` compara por identidad
           para no guardar cuando no ha cambiado nada, y un `{...cd}` de más sería
           una escritura a la base de datos por pulsar una flecha desactivada. */
        if (from === -1 || from === to) return cd;

        destino = to;
        return {
          ...cd,
          microcycles: cd.microcycles.map((m) =>
            m.weekNumber === weekNumber ? { ...m, days: moveItem(days, from, to) } : m
          ),
        };
      });

      return destino;
    },
    [applyWorkout]
  );

  const removeDay = useCallback(
    (clientId, weekNumber, dayName) =>
      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: cd.microcycles.map((m) =>
          m.weekNumber !== weekNumber
            ? m
            : { ...m, days: m.days.filter((d) => d.dayName !== dayName) }
        ),
      })),
    [applyWorkout]
  );

  /** El inverso de `removeDay`, para el «Deshacer» del aviso: el día entero,
      con sus ejercicios y su calentamiento propio, de vuelta en su sitio. */
  const restoreDay = useCallback(
    (clientId, weekNumber, day, index) =>
      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: cd.microcycles.map((m) => {
          if (m.weekNumber !== weekNumber) return m;
          const days = [...m.days];
          days.splice(Math.max(0, Math.min(index, days.length)), 0, day);
          return { ...m, days };
        }),
      })),
    [applyWorkout]
  );

  /**
   * La ficha del cliente, para guardar la secuencia de los bloques que aún no
   * la tienen. Sin ficha no se guarda nada: derivada sin ella, la de un
   * rotativo saldría semanal. Ver `materializarMicrociclos`.
   */
  const conSecuencias = useCallback(
    (clientId, program) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      return client ? { program: materializarMicrociclos(program, client), client } : { program, client: null };
    },
    [clientsRef]
  );


  /**
   * Con qué fecha nace el ciclo que va después de `previous`.
   *
   * Lo que dura el anterior lo dice la secuencia de SU bloque: siete días en el
   * semanal, los que tenga en el rotativo —seis hojas a 2/1 son nueve días, no
   * tres—. El cliente solo hace falta para derivarla mientras el bloque no la
   * tenga guardada. Ver `fechaDelCicloSiguiente`.
   */
  const fechaSiguienteCiclo = useCallback(
    (clientId, previous) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      return fechaDelCicloSiguiente(workoutRef.current[clientId], previous, client);
    },
    [clientsRef, workoutRef]
  );

  /**
   * Arranca el programa de un cliente que todavía no tiene ninguno.
   *
   * *** Aquí estaba el bug más grave del proyecto. ***
   * Esta función reemplazaba el array `microcycles` por uno nuevo con una sola
   * semana... y el botón "+ Nueva" del carril de semanas la llamaba esperando
   * AÑADIR. Un cliente con doce semanas programadas se quedaba con una semana
   * vacía, persistido al instante, sin confirmación y sin deshacer.
   *
   * Ahora esta función se niega a hacer nada si ya existe un programa, y añadir
   * semanas es responsabilidad de `appendMicrocycle`.
   */
  const startProgram = useCallback(
    (clientId) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      if (current.microcycles.length > 0) return current.microcycles[0].weekNumber;

      /* La semana 1 empieza cuando empieza la asesoría, no cuando se monta la
         rutina: montarla en agosto para un cliente que arranca en septiembre es
         lo normal, no la excepción. Ver `firstCycleDate`. */
      const inicio = clientsRef.current.find((c) => c.id === clientId)?.startDate;

      applyWorkout(clientId, (cd) => ({
        ...cd,
        weeklySplit: Object.keys(cd.weeklySplit || {}).length > 0 ? cd.weeklySplit : restWeekSplit(),
        microcycles: [
          buildMicrocycle({
            weekNumber: 1,
            days: [{ dayName: 'Día 1', exercises: [] }],
            date: firstCycleDate(inicio),
          }),
        ],
      }));
      /* El tercer hito: ya hay un cliente con programa empezado. La comprobación
         de arriba garantiza que esto solo se apunta la PRIMERA vez de cada
         cliente, que es lo que hace que el embudo se pueda leer. */
      track('programa_iniciado');
      return 1;
    },
    [applyWorkout, clientsRef, workoutRef]
  );

  /**
   * Traer una rutina de fuera SIN saber contra qué semana.
   *
   * ── Por qué existe además de `importDays` ───────────────────────────────────
   * Porque quien importa desde la pantalla de la rutina está mirando una semana
   * concreta, y quien importa desde otra parte —el plan completo que llega en un
   * mismo Excel, con la dieta— no está mirando ninguna. Sin esto, cada pantalla
   * que quiera traer una rutina tiene que repetir la misma decisión: si no hay
   * programa se crea, y si lo hay se añade a la última semana.
   *
   * Repetida en dos sitios acabaría contestándose distinto en cada uno, que es
   * como aparecen los programas con una semana 1 vacía al lado de la buena.
   *
   * Devuelve el número de la semana donde ha caído, para poder navegar a ella.
   */
  const importRoutine = useCallback(
    (clientId, days) => {
      const actual = workoutRef.current[clientId] || emptyWorkoutData();
      const desdeCero = actual.microcycles.length === 0;
      const semana = desdeCero
        ? startProgram(clientId)
        : actual.microcycles[actual.microcycles.length - 1].weekNumber;

      importDays(clientId, semana, days, { dropEmptyDays: desdeCero });
      return semana;
    },
    [importDays, startProgram, workoutRef]
  );

  /**
   * Añade una semana/sesión nueva y VACÍA al final del programa, reutilizando
   * los nombres de día de la última (que es lo que un coach espera al pulsar
   * "nueva semana": la misma estructura, sin las cargas todavía).
   * Devuelve el número de la semana creada para que la UI navegue a ella.
   */
  const appendMicrocycle = useCallback(
    (clientId) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      if (current.microcycles.length === 0) return startProgram(clientId);

      const weekNumber = nextWeekNumber(current.microcycles);
      const last = current.microcycles[current.microcycles.length - 1];
      const days = (last?.days || []).map((d) => ({ ...deepClone(d), exercises: [] }));

      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: [
          ...cd.microcycles,
          buildMicrocycle({
            weekNumber,
            days: days.length > 0 ? days : [{ dayName: 'Día 1', exercises: [] }],
            /* Va DETRÁS de la anterior, no en la fecha de hoy: programar cuatro
               semanas de una sentada es el gesto normal, y con la fecha de hoy
               las cuatro nacían el mismo día. Ver `fechaDelCicloSiguiente`. */
            date: fechaSiguienteCiclo(clientId, last),
          }),
        ],
      }));
      /* El gesto que se repite cada semana mientras un entrenador siga
         trabajando. Es la mejor señal de retención que tiene el producto: quien
         deja de programar semanas se ha ido, aunque siga entrando. */
      track('microciclo_anadido');
      return weekNumber;
    },
    [applyWorkout, fechaSiguienteCiclo, startProgram, workoutRef]
  );

  /**
   * Cierra el bloque abierto y empieza otro.
   *
   * La estructura de un bloque no cambia: cuando hay que cambiarla, se cierra
   * el bloque (queda congelado con su estructura y su calentamiento, ver
   * `domain/blocks`) y se abre el siguiente con su primera semana. Con
   * `keepStructure` esa semana copia los días del anterior, vacíos; sin ella,
   * empieza con un solo día en blanco para montarla desde cero.
   *
   * Devuelve el número de la semana nueva.
   */
  const startBlock = useCallback(
    (clientId, { name = null, keepStructure = true } = {}) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      if (current.microcycles.length === 0) return startProgram(clientId);
      const weekNumber = nextWeekNumber(current.microcycles);
      const last = current.microcycles[current.microcycles.length - 1];
      const days = keepStructure
        ? (last?.days || []).map((d) => ({ ...deepClone(d), exercises: [] }))
        : [{ dayName: 'Día 1', exercises: [] }];
      applyWorkout(clientId, (cd) => {
        const { program } = openNextBlock(cd, { name });
        return {
          ...program,
          /* Desde cero, la semana natural también empieza limpia: el reparto
             anterior nombraba días que ya no existen. */
          weeklySplit: keepStructure ? program.weeklySplit : restWeekSplit(),
          microcycles: [
            ...program.microcycles,
            buildMicrocycle({
              weekNumber,
              days: days.length > 0 ? days : [{ dayName: 'Día 1', exercises: [] }],
              date: fechaSiguienteCiclo(clientId, last),
            }),
          ],
        };
      });
      track('bloque_abierto');
      return weekNumber;
    },
    [applyWorkout, fechaSiguienteCiclo, startProgram, workoutRef]
  );

  const renameBlock = useCallback(
    (clientId, blockId, name) =>
      applyWorkout(clientId, (cd) => renameBlockIn(cd, blockId, name), { immediate: false }),
    [applyWorkout]
  );

  /**
   * Las características del bloque: a qué juega, cuánto se ha previsto que dure
   * y qué se persigue. Ver `blockTraits` en el dominio.
   *
   * Va DIFERIDO como el renombrado: la nota se teclea, y guardar cada letra
   * sería una escritura por pulsación.
   */
  /*
    ══ LAS TEMPORADAS ═══════════════════════════════════════════════════════
    Una temporada es la `folder` de sus bloques y sus previstos: moverlos,
    renombrarla y quitarla son la MISMA escritura sobre una lista de ids. Ver
    `domain/temporadas`.
  */
  const ponerTemporada = useCallback(
    (clientId, ids, folder) => applyWorkout(clientId, (cd) => ponerCarpetaIn(cd, ids, folder)),
    [applyWorkout]
  );

  /** Cambia de sitio un previsto en el tiempo (su índice entre los previstos). */
  const moverBorradorDelBloque = useCallback(
    (clientId, id, destino) => applyWorkout(clientId, (cd) => moverBorrador(cd, id, destino)),
    [applyWorkout]
  );

  const setBlockTraits = useCallback(
    (clientId, blockId, traits) =>
      applyWorkout(clientId, (cd) => setBlockTraitsIn(cd, blockId, traits), { immediate: false }),
    [applyWorkout]
  );

  /**
   * Quita un bloque: sus semanas pasan al de al lado y no se borra ninguna.
   * Ver `deleteBlockFrom` — lo que se deshace es el corte, no el entreno. Va
   * inmediato: es una decisión de estructura, no un tecleo.
   */
  const deleteBlock = useCallback(
    (clientId, blockId) => {
      applyWorkout(clientId, (cd) => deleteBlockFrom(cd, blockId));
      track('bloque_quitado');
    },
    [applyWorkout]
  );

  /**
   * Apunta un cambio de plan en la bitácora de su bloque.
   *
   * El reloj y el generador de ids viven aquí y no en el dominio, que es puro y
   * tiene que poder probarse sin fingir ninguno de los dos. Va con
   * `immediate: false` porque acompaña siempre a otra escritura —la que de
   * verdad cambió el plan— y las dos salen en el mismo guardado.
   */
  const logBlockChange = useCallback(
    (clientId, blockId, entry) =>
      applyWorkout(
        clientId,
        (cd) => logBlockChangeIn(cd, blockId, { id: newId('bl'), at: new Date().toISOString(), ...entry }),
        { immediate: false }
      ),
    [applyWorkout]
  );

  /* ══════════════════════════════════════════════════════════════════════════
     EL PLAN DEL BLOQUE
     ══════════════════════════════════════════════════════════════════════════

     El plan es del bloque y se escribe UNA vez (`domain/blocks`). Antes cada
     cambio había que repartirlo a las semanas del bloque por entrenar, con una
     copia del ejercicio por semana; ahora un gesto es una escritura.

     ── La migración va aquí, y es perezosa ─────────────────────────────────
     Ningún programa nace con el plan dentro del bloque: lo tienen todos en sus
     microciclos. `migrateBlockPlans` lo sube —y anota como excepción lo que
     cada semana tuviera distinto— y es idempotente, así que se puede llamar en
     cada escritura sin comprobar nada. La primera vez que se toca el plan de un
     cliente, su programa pasa al modelo nuevo; las demás no hacen nada.

     No hay migración de golpe sobre todos los clientes a propósito: la lectura
     ya contesta por los dos modelos (`planOfDay`), así que nadie tiene que
     esperar a nadie. Antes de lanzarla en frío está `npm run ensayo:plan`.

     ── Y se guarda también en los `days`, que es por donde escribe el cliente ─
     El plan vive en el bloque, pero `log_session_set` —la única escritura que
     el cliente tiene— busca el ejercicio en `microcycles[].days[]`. Si esa copia
     se queda con los ids viejos, la pantalla enseña un ejercicio que el servidor
     no encuentra y todo lo que esa persona anote se rechaza. `proyectarPlanEnDias`
     deja ahí lo mismo que la pantalla lee, y lo hace en el mismo gesto que toca
     el plan: quien edita es el entrenador, que sí puede escribir la fila.
  */
  /*
     ── Y la secuencia del microciclo, guardada en cada bloque ──────────────
     Antes de escribir, los bloques que aún la derivan la guardan; después, la
     secuencia sigue a las hojas como lo hacía al derivarse (`seguirALasHojas`).
     Los bloques que abre la escritura —el Compositor— guardan la suya con el
     reparto que se les ha dado.
  */
  const applyPlan = useCallback(
    (clientId, updater, options) =>
      applyWorkout(
        clientId,
        (cd) => {
          const { program: antes, client } = conSecuencias(clientId, migrateBlockPlans(cd).program);
          const despues = updater(antes);
          return proyectarPlanEnDias(client ? seguirALasHojas(antes, despues, client) : despues);
        },
        options
      ),
    [applyWorkout, conSecuencias]
  );

  /** Sube el plan de este cliente al bloque, sin cambiar nada más. */
  const migratePlanToBlock = useCallback(
    (clientId) => applyPlan(clientId, (cd) => cd),
    [applyPlan]
  );


  /**
   * ABRIR UN BLOQUE CON SU PLAN YA DENTRO.
   *
   * ══ Lo que hacía `startBlock`, y por qué no basta ═══════════════════════
   * Cerraba el bloque y creaba el microciclo siguiente con las hojas VACÍAS
   * —el propio diálogo lo decía: «sin ejercicios: se rellenan de nuevo»— y te
   * dejaba dentro de esa semana para componerlo ahí. O sea: el momento en el
   * que un bloque se define no existía. Se definía por acumulación.
   *
   * Esto recibe el bloque ENTERO —sus hojas con sus ejercicios, su
   * calentamiento y, si se ha pedido, su duración prevista— y lo deja escrito
   * de una vez. El microciclo que abre lleva solo los nombres de las hojas: el
   * plan ya no vive ahí.
   *
   * ── La duración es OPCIONAL, y por defecto no hay ─────────────────────
   * Una rutina de hipertrofia se monta y se queda hasta que hay motivo para
   * cambiarla. `plannedWeeks` solo se guarda cuando de verdad hay un plan con
   * fecha; sin él, el bloque está abierto y punto.
   */
  const startBlockWithPlan = useCallback(
    (
      clientId,
      {
        name = null,
        sessions = [],
        mobilityDrills = null,
        plannedWeeks = null,
        intent = null,
        note = null,
        /* El split previsto del borrador que empieza (su nombre de split). */
        split = null,
        /* La temporada del borrador que empieza. Sin ella (`undefined`), el
           bloque que nace hereda la del que cierra (`openNextBlock`). */
        folder = undefined,
        /*
          ── EL REPARTO POR DÍAS, DESDE EL COMPOSITOR ──────────────────────────
          Va al PROGRAMA y no al bloque, y no es un descuido: el reparto del
          bloque ABIERTO vive en `program.weeklySplit` y solo se congela dentro
          del bloque al cerrarlo (ver `structureOfBlock` y `openNextBlock`). El
          bloque que se abre aquí es el nuevo abierto, así que su sitio es
          arriba; escribirlo en `blocks[n].weeklySplit` lo dejaría ahí sin que
          nadie lo leyera hasta que ese bloque se cerrara.

          `null` no toca nada: quien no reparte hereda el reparto que ya
          hubiera, que es lo que hacía esto antes de existir este parámetro.

          La secuencia del bloque nuevo sale de aquí: `applyPlan` la guarda en
          el bloque con este reparto (semanal) o con el patrón del cliente y
          las hojas nuevas (rotativo). Ver `seguirALasHojas`.
        */
        weeklySplit = null,
        /*
          ── Y SU MICROCICLO, SI LLEGA ─────────────────────────────────────────
          La secuencia que se ha compuesto en la tira del Compositor, o la del
          bloque copiado. Se guarda en el bloque que nace, con los días de una
          hoja que no viaja pasados a descanso. Sin ella, el bloque nuevo la
          deriva como siempre (`seguirALasHojas`).
        */
        microciclo = null,
        /*
          ── Y EL ID, SI EMPIEZA UN BORRADOR ──────────────────────────────────
          «Empezar ahora» (`empezarBorrador`): el bloque que nace conserva el id
          del borrador y el borrador sale de `draftBlocks` en la MISMA
          escritura. Ver `domain/borradores`.
        */
        id = null,
      } = {}
    ) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const suMicrociclo = microcicloParaLasHojas(microciclo, sessions);

      /*
        ── Sin programa no hay bloque que cerrar, pero SÍ plan que poner ──────
        Esto devolvía `startProgram(clientId)` a secas: creaba la semana 1 con un
        «Día 1» en blanco y TIRABA el plan que le acababan de pasar. Se notaba
        poco mientras el único camino era «+ bloque» dentro de la ficha de
        alguien que ya entrenaba; con el bloque pegado del portapapeles —o
        mandado a varios de golpe— es justo el caso del cliente nuevo al que
        quieres montarle lo mismo que a otro, y se quedaba con una semana vacía
        sin que nadie dijera nada.

        Ahora se abre su programa y el plan entra en el bloque que nace con él.
        Las hojas del microciclo se sustituyen por las del plan: esa semana
        acaba de crearse y su «Día 1» era relleno, no el trabajo de nadie.
      */
      if (current.microcycles.length === 0) {
        const primera = startProgram(clientId);
        if (sessions.length > 0) {
          applyPlan(clientId, (cd) => {
            const abierto = currentBlock(cd);
            const conPlan = setBlockSessionsIn(cd, abierto.id, sessions);
            return {
              ...conPlan,
              ...(Array.isArray(mobilityDrills) ? { mobilityDrills } : {}),
              ...(weeklySplit ? { weeklySplit } : {}),
              blocks: (conPlan.blocks || []).map((b) =>
                b.id !== abierto.id
                  ? b
                  : {
                      ...b,
                      ...(suMicrociclo ? { microciclo: suMicrociclo } : {}),
                      ...Object.fromEntries(
                        Object.entries(blockTraits({ plannedWeeks, intent, note, split })).filter(
                          ([, v]) => v !== null
                        )
                      ),
                    }
              ),
              microcycles: (conPlan.microcycles || []).map((m) => ({
                ...m,
                days: sessions.map((s) => ({ dayName: s.dayName, exercises: [] })),
              })),
            };
          });
        }
        return primera;
      }

      const weekNumber = nextWeekNumber(current.microcycles);
      const last = current.microcycles[current.microcycles.length - 1];

      applyPlan(clientId, (cd) => {
        const { program, block } = openNextBlock(cd, { name, id });
        return {
          ...(id ? sinBorrador(program, id) : program),
          /* Después de `openNextBlock`, que ya ha congelado el reparto del
             bloque que se cierra dentro de él: lo que se escriba aquí es del
             que se abre. */
          ...(weeklySplit ? { weeklySplit } : {}),
          blocks: program.blocks.map((b) =>
            b.id !== block.id
              ? b
              : {
                  ...(folder === undefined ? b : sinCarpeta(b)),
                  ...(folder ? { folder } : {}),
                  sessions,
                  ...(suMicrociclo ? { microciclo: suMicrociclo } : {}),
                  ...(Array.isArray(mobilityDrills) ? { mobilityDrills } : {}),
                  /* Las características, saneadas por el dominio y sin
                     guardar las vacías: ver `blockTraits`. */
                  ...Object.fromEntries(
                    Object.entries(blockTraits({ plannedWeeks, intent, note, split })).filter(([, v]) => v !== null)
                  ),
                }
          ),
          microcycles: [
            ...program.microcycles,
            buildMicrocycle({
              weekNumber,
              /* Solo los nombres: el plan es del bloque. Se conservan porque
                 media aplicación sigue recorriendo `days` mientras conviven
                 las dos lecturas. */
              days: sessions.map((s) => ({ dayName: s.dayName, exercises: [] })),
              date: fechaSiguienteCiclo(clientId, last),
            }),
          ],
        };
      });

      track('bloque_abierto');
      return weekNumber;
    },
    [applyPlan, fechaSiguienteCiclo, startProgram, workoutRef]
  );

  /** Pone el plan entero de un bloque: es lo que hace «definir el bloque». */
  const setBlockPlan = useCallback(
    (clientId, blockId, sessions) => applyPlan(clientId, (cd) => setBlockSessionsIn(cd, blockId, sessions)),
    [applyPlan]
  );

  const addBlockSheet = useCallback(
    (clientId, blockId, dayName) => applyPlan(clientId, (cd) => addBlockSessionIn(cd, blockId, dayName)),
    [applyPlan]
  );

  /**
   * «Copia de "Pull A"»: la hoja entera como hoja nueva, en UNA escritura —la
   * hoja con sus ejercicios y su línea en la bitácora—, y por tanto un solo
   * guardado y un solo ⌘Z. Ver `duplicateBlockSessionIn`.
   *
   * El nombre libre se busca DENTRO de la escritura, sobre el programa ya
   * migrado: fuera, en un bloque que todavía tiene el plan en sus microciclos,
   * la lista de hojas sale vacía y el nombre elegido chocaría con la original
   * (es la trampa que documenta `nombresDeHojaDelBloque` en la pantalla).
   *
   * Devuelve el nombre de la copia, o `null` si no había qué copiar.
   */
  const duplicateBlockSheet = useCallback(
    (clientId, blockId, dayName) => {
      let nombre = null;
      applyPlan(clientId, (cd) => {
        const bloque = blocksOf(cd).find((b) => b.id === blockId);
        const libre = freeSheetName(dayName, blockSessionsOf(bloque).map((h) => h.dayName));
        const next = duplicateBlockSessionIn(cd, blockId, dayName, libre);
        if (next === cd) return cd;
        nombre = libre;
        return logBlockChangeIn(next, blockId, {
          id: newId('bl'),
          at: new Date().toISOString(),
          alcance: 'bloque',
          semanas: [],
          hoja: libre,
          kind: BLOCK_CHANGE.HOJA_MAS,
          que: libre,
        });
      });
      return nombre;
    },
    [applyPlan]
  );

  /* Quitar una hoja la saca también de los microciclos del bloque donde no se
     entrenó, en el mismo paso: si no, quedaría como hoja fuera del plan. Es el
     único gesto que la suelta —ver `proyectarPlanEnDias`—. */
  const removeBlockSheet = useCallback(
    (clientId, blockId, dayName) =>
      applyPlan(clientId, (cd) =>
        soltarHojaSinEntrenar(removeBlockSessionFrom(cd, blockId, dayName), blockId, dayName)
      ),
    [applyPlan]
  );

  /**
   * LA TIRA DEL MICROCICLO: la secuencia de un bloque, escrita entera. Cada
   * gesto de `EditorDelMicrociclo` es una llamada, y por tanto un paso de ⌘Z.
   * Pasa por `applyPlan` para que los bloques que aún la derivan la guarden
   * antes, y por `applyWorkout`, que copia `weekly_split` del abierto.
   */
  const ponerMicrocicloDelBloque = useCallback(
    (clientId, blockId, microciclo) => applyPlan(clientId, (cd) => ponerMicrociclo(cd, blockId, microciclo)),
    [applyPlan]
  );

  /**
   * LOS EJERCICIOS DE REFERENCIA de un bloque: los que el entrenador quiere
   * seguir en la lente de Entreno de Revisiones.
   *
   * Va por `applyWorkout` y no por `applyPlan`, como los borradores: no toca
   * el plan de nadie ni hojas, ni series, ni secuencia, solo una clave del
   * bloque. Con `applyPlan` cada vez que alguien marcara un ejercicio se
   * dispararía `seguirALasHojas` sobre el programa entero, que es mucho motor
   * para guardar tres nombres.
   */
  const ponerReferenciasDelBloque = useCallback(
    (clientId, blockId, lista) => applyWorkout(clientId, (cd) => ponerReferencias(cd, blockId, lista)),
    [applyWorkout]
  );

  /**
   * «Es intencionado»: da por vistas las excepciones de una hoja en esos
   * microciclos, con la firma de lo que difiere hoy (`marcarExcepcionVistaIn`).
   * Por `applyWorkout`, como las referencias: una clave del bloque, sin plan.
   */
  const marcarExcepcionVista = useCallback(
    (clientId, blockId, dayName, weeks) =>
      applyWorkout(clientId, (cd) => marcarExcepcionVistaIn(cd, blockId, dayName, weeks)),
    [applyWorkout]
  );

  /*
    ══ LOS BLOQUES EN BORRADOR ══════════════════════════════════════════════
    Van por `applyWorkout` y no por `applyPlan`: no tocan el plan de ningún
    bloque, solo `draftBlocks`. Cada gesto es un paso de ⌘Z (`mismoPlan` los
    compara). Ver `domain/borradores`.
  */
  /** Uno nuevo, al final. Devuelve el borrador, o `null` si no tiene duración. */
  const anadirBorradorDelBloque = useCallback(
    (clientId, datos) => {
      let nuevo = null;
      applyWorkout(clientId, (cd) => {
        const { program, borrador } = anadirBorrador(cd, datos);
        nuevo = borrador;
        return program;
      });
      return nuevo;
    },
    [applyWorkout]
  );

  /** Rellenarlo o cambiarle las características. No lo empieza. */
  const cambiarBorradorDelBloque = useCallback(
    (clientId, id, cambios) => applyWorkout(clientId, (cd) => cambiarBorrador(cd, id, cambios)),
    [applyWorkout]
  );

  /** Lo quita y devuelve `{ quitado, posicion }` para el Deshacer del aviso. */
  const quitarBorradorDelBloque = useCallback(
    (clientId, id) => {
      let fuera = { quitado: null, posicion: -1 };
      applyWorkout(clientId, (cd) => {
        const { program, ...resto } = quitarBorrador(cd, id);
        fuera = resto;
        return program;
      });
      return fuera;
    },
    [applyWorkout]
  );

  const devolverBorradorDelBloque = useCallback(
    (clientId, borrador, posicion) => applyWorkout(clientId, (cd) => devolverBorrador(cd, borrador, posicion)),
    [applyWorkout]
  );

  /**
   * «Empezar ahora»: cierra el abierto y abre este, con su id, sus hojas y su
   * microciclo, en una escritura (`startBlockWithPlan` con `id`). Solo el
   * primero: es el que va detrás del abierto. Devuelve la semana que abre, o
   * `null` si no se podía empezar.
   */
  const empezarBorradorDelBloque = useCallback(
    (clientId, id) => {
      const programa = workoutRef.current[clientId];
      const borrador = borradorDe(programa, id);
      if (!borrador || !sePuedeEmpezar(programa, id)) return null;
      return startBlockWithPlan(clientId, datosParaEmpezar(borrador));
    },
    [startBlockWithPlan, workoutRef]
  );

  const renameBlockSheet = useCallback(
    (clientId, blockId, de, a) =>
      applyPlan(clientId, (cd) => renameBlockSessionIn(cd, blockId, de, a), { immediate: false }),
    [applyPlan]
  );

  const moveBlockSheet = useCallback(
    (clientId, blockId, from, to) => applyPlan(clientId, (cd) => moveBlockSessionIn(cd, blockId, from, to)),
    [applyPlan]
  );

  const addBlockExercise = useCallback(
    (clientId, blockId, dayName, exercise) =>
      applyPlan(clientId, (cd) => addBlockExerciseIn(cd, blockId, dayName, exercise)),
    [applyPlan]
  );

  /**
   * Los ejercicios de una hoja del bloque, de una vez.
   *
   * Es lo que hace falta para pegar una hoja ENCIMA de otra: un solo cambio en
   * el plan, y por tanto un solo «Deshacer» —la lista de antes—. Ver
   * `setBlockExercisesIn`.
   */
  const setBlockSheetExercises = useCallback(
    (clientId, blockId, dayName, exercises) =>
      applyPlan(clientId, (cd) => setBlockExercisesIn(cd, blockId, dayName, exercises)),
    [applyPlan]
  );

  /*
    ── Por NOMBRE, y resuelto aquí dentro ──────────────────────────────────
    Los ejercicios se localizan por nombre y no por id: es la regla de la casa
    —dos «Press banca» de dos microciclos son el mismo ejercicio del plan y dos
    objetos distintos— y además evita un problema de orden. Quien llama tiene
    delante el programa de ANTES de migrar, donde el ejercicio del bloque
    todavía no existe y por tanto no tiene id que pasar. Resolviendo aquí, tras
    la migración, siempre se apunta al ejercicio de verdad.
  */
  const enLaHoja = (cd, blockId, dayName) =>
    blockSessionOf(
      blocksOf(cd).find((b) => b.id === blockId),
      dayName
    )?.exercises || [];

  /* La línea «Press banca → Press inclinado» de la bitácora. Solo si cambia el
     NOMBRE: un cambio de músculo solo no es lo que el diario cuenta. */
  const conElApunteDelNombre = (cd, blockId, dayName, de, nuevo) => {
    const a = String(nuevo).trim();
    if (a === de) return cd;
    return logBlockChangeIn(cd, blockId, {
      id: newId('bl'),
      at: new Date().toISOString(),
      alcance: 'bloque',
      semanas: [],
      hoja: dayName,
      kind: BLOCK_CHANGE.NOMBRE,
      que: a,
      de,
      a,
    });
  };

  /** Quita un ejercicio del plan y devuelve cuál era y dónde estaba, para
      poder deshacerlo. `null` si no estaba. */
  const removeBlockExercise = useCallback(
    (clientId, blockId, dayName, name) => {
      let quitado = null;
      applyPlan(clientId, (cd) => {
        const lista = enLaHoja(cd, blockId, dayName);
        const index = lista.findIndex((ex) => ex.name === name);
        if (index < 0) return cd;
        quitado = { exercise: lista[index], index };
        return removeBlockExerciseIn(cd, blockId, dayName, lista[index].id);
      });
      return quitado;
    },
    [applyPlan]
  );

  const restoreBlockExercise = useCallback(
    (clientId, blockId, dayName, exercise, index) =>
      applyPlan(clientId, (cd) => restoreBlockExerciseIn(cd, blockId, dayName, exercise, index)),
    [applyPlan]
  );

  /**
   * Lo mueve `delta` puestos dentro de su hoja.
   *
   * Devuelve si LO HA MOVIDO. No es un detalle: un ejercicio puede no estar en
   * la hoja del bloque —una excepción de esta semana, o un programa de antes de
   * que el plan subiera al bloque— y entonces aquí no había nada que mover y la
   * función se iba en silencio. Quien llama desde la hoja del día necesita
   * saberlo para mover lo que el entrenador está viendo (ver `WorkoutLogEditor`).
   */
  const moveBlockExercise = useCallback(
    (clientId, blockId, dayName, name, delta) => {
      let movido = false;
      applyPlan(clientId, (cd) => {
        const lista = enLaHoja(cd, blockId, dayName);
        const from = lista.findIndex((ex) => ex.name === name);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= lista.length) return cd;
        movido = true;
        return moveBlockExerciseIn(cd, blockId, dayName, from, to);
      });
      return movido;
    },
    [applyPlan]
  );

  /**
   * Cambia un ejercicio por OTRO en su sitio, con su estructura: series,
   * rangos, RIR, remates, nota y superserie. Es otro ejercicio, así que estrena
   * id y su progreso empieza de cero; las excepciones de esa hoja pasan a él.
   * Ver `renameBlockExerciseIn`.
   *
   * La línea de la bitácora va en la MISMA escritura: apuntarla aparte serían
   * dos pasos en la pila, y ⌘Z se gastaría la primera vez en borrar el apunte.
   *
   * Devuelve el id con el que queda —el nuevo, o el mismo si solo cambiaron las
   * mayúsculas— o `null` si no ha escrito nada. El nombre ya viene validado por
   * la pantalla (`porQueNoSeRenombra`); el dominio lo vuelve a comprobar.
   */
  const renameBlockExercise = useCallback(
    (clientId, blockId, dayName, name, nuevo, { muscle = null } = {}) => {
      let queda = null;
      const id = newId('ex');
      applyPlan(clientId, (cd) => {
        const suyo = enLaHoja(cd, blockId, dayName).find((ex) => ex.name === name);
        if (!suyo) return cd;
        const next = renameBlockExerciseIn(cd, blockId, dayName, suyo.id, nuevo, { muscle, id });
        if (next === cd) return cd;
        queda = enLaHoja(next, blockId, dayName).some((ex) => ex.id === id) ? id : suyo.id;
        return conElApunteDelNombre(next, blockId, dayName, name, nuevo);
      });
      return queda;
    },
    [applyPlan]
  );

  /* Y desde la hoja de un microciclo, por id como el resto de lo que se toca
     ahí: se escribe donde el ejercicio vive. Si vive en el bloque, se apunta
     igual que desde la rejilla; una excepción es de sus semanas y no cambia el
     plan del bloque. Devuelve lo mismo que la de arriba. */
  const renamePlanExercise = useCallback(
    (clientId, weekNumber, dayName, exerciseId, nuevo, { muscle = null } = {}) => {
      let queda = null;
      const id = newId('ex');
      applyPlan(clientId, (cd) => {
        const { donde, bloque } = wherePlanExercise(cd, weekNumber, dayName, exerciseId);
        const antes = (planOfDay(cd, weekNumber, dayName)?.exercises || []).find((ex) => ex.id === exerciseId);
        const next = renamePlanExerciseIn(cd, weekNumber, dayName, exerciseId, nuevo, { muscle, id });
        if (next === cd || !antes) return next;
        queda = (planOfDay(next, weekNumber, dayName)?.exercises || []).some((ex) => ex.id === id) ? id : exerciseId;
        return donde === 'bloque' ? conElApunteDelNombre(next, bloque.id, dayName, antes.name, nuevo) : next;
      });
      return queda;
    },
    [applyPlan]
  );

  /* `immediate: false` en los dos que se teclean: subir series de tres en tres
     o escribir «8-10» letra a letra no son tres guardados. */
  const setBlockExerciseSets = useCallback(
    (clientId, blockId, dayName, name, count) =>
      applyPlan(
        clientId,
        (cd) => {
          const suyo = enLaHoja(cd, blockId, dayName).find((ex) => ex.name === name);
          return suyo ? setBlockExerciseSetsIn(cd, blockId, dayName, suyo.id, count) : cd;
        },
        { immediate: false }
      ),
    [applyPlan]
  );

  const setBlockExerciseTarget = useCallback(
    (clientId, blockId, dayName, name, targetReps) =>
      applyPlan(
        clientId,
        (cd) => {
          const suyo = enLaHoja(cd, blockId, dayName).find((ex) => ex.name === name);
          return suyo ? setBlockExerciseTargetIn(cd, blockId, dayName, suyo.id, targetReps) : cd;
        },
        { immediate: false }
      ),
    [applyPlan]
  );

  /* El esquema entero: «1 × 12, 3 × 6-8». También `immediate: false` — se
     escribe tecleando en las mismas casillas que los dos de arriba. */
  const setBlockExerciseScheme = useCallback(
    (clientId, blockId, dayName, name, tramos) =>
      applyPlan(
        clientId,
        (cd) => {
          const suyo = enLaHoja(cd, blockId, dayName).find((ex) => ex.name === name);
          return suyo ? setBlockExerciseSchemeIn(cd, blockId, dayName, suyo.id, tramos) : cd;
        },
        { immediate: false }
      ),
    [applyPlan]
  );

  /*
    ── LA PAUTA DE UN MICROCICLO ─────────────────────────────────────────────
    Desde la vista de bloque, con un microciclo delante: se guarda solo lo que
    cambia en él y sigue hacia delante (`ponerPautaIn`). Devuelve el programa
    de antes —ya migrado— y el de después: con los dos la pantalla dice qué hizo
    el cambio y ofrece «Solo en…» y «Deshacer». Ver `domain/pautas`.
  */
  const ponerPautaDelMicrociclo = useCallback(
    (clientId, weekNumber, dayName, exerciseId, sets) => {
      let antes = null;
      const despues = applyPlan(clientId, (cd) => {
        antes = cd;
        return ponerPautaIn(cd, weekNumber, dayName, exerciseId, sets);
      });
      return { antes, despues };
    },
    [applyPlan]
  );

  /* «Volver a como estaba en el anterior»: ese microciclo suelta su pauta propia. */
  const volverPautaAlAnterior = useCallback(
    (clientId, weekNumber, exerciseId) => applyPlan(clientId, (cd) => volverAlAnteriorIn(cd, weekNumber, exerciseId)),
    [applyPlan]
  );

  /* «Solo en M3» y «Deshacer» de la línea que sale bajo la fila, con el programa
     de antes del cambio que devolvió `ponerPautaDelMicrociclo`. */
  const pautaSoloEn = useCallback(
    (clientId, antes, weekNumber, dayName, exerciseId) =>
      applyPlan(clientId, (cd) => soloEnIn(cd, antes, weekNumber, dayName, exerciseId)),
    [applyPlan]
  );

  const restaurarPauta = useCallback(
    (clientId, antes, weekNumber, dayName, exerciseId) =>
      applyPlan(clientId, (cd) => restaurarPautaIn(cd, antes, weekNumber, dayName, exerciseId)),
    [applyPlan]
  );

  /* La gramática de serie —enlazado, técnica, descanso— es plan y va al bloque.
     `options` deja pasar `immediate: false` para lo que se teclea (el descanso);
     los conmutadores guardan al momento, como todo lo que es un clic. */
  const setBlockExerciseGrammar = useCallback(
    (clientId, blockId, dayName, name, campos, options) =>
      applyPlan(
        clientId,
        (cd) => {
          const suyo = enLaHoja(cd, blockId, dayName).find((ex) => ex.name === name);
          return suyo
            ? updateBlockExerciseIn(cd, blockId, dayName, suyo.id, (ex) => ({ ...ex, ...campos }))
            : cd;
        },
        options
      ),
    [applyPlan]
  );


  /* ── Y lo que se toca desde la HOJA ────────────────────────────────────
     Se escribe donde ese ejercicio VIVE —el bloque, o la excepción de esa
     semana si solo existía ahí— porque lo normal es que un cambio se quede.
     Para lo puntual están las dos de abajo, que dejan el bloque como está.
     Ver . */
  const updatePlanExercise = useCallback(
    (clientId, weekNumber, dayName, exerciseId, fn, options) =>
      applyPlan(clientId, (cd) => updatePlanExerciseIn(cd, weekNumber, dayName, exerciseId, fn), options),
    [applyPlan]
  );

  /* Varios ejercicios de la hoja en UNA escritura: un gesto de la hoja entera
     es un paso del guardado y un «Deshacer». Ver `updatePlanExercisesIn`. */
  const updatePlanExercises = useCallback(
    (clientId, weekNumber, dayName, exerciseIds, fn, options) =>
      applyPlan(clientId, (cd) => updatePlanExercisesIn(cd, weekNumber, dayName, exerciseIds, fn), options),
    [applyPlan]
  );

  /**
   * La indicación del entrenador para un día.
   *
   * ── Por qué vive en el PLAN y no en la sesión ───────────────────────────────
   * Estuvo colgada de la sesión, y era un error de modelo con una consecuencia
   * inmediata: una sesión no existe hasta que alguien anota la primera serie, así
   * que la nota solo se podía escribir DESPUÉS de que el cliente entrenara. Justo
   * al revés de para lo que sirve — es una instrucción para hacer el
   * entrenamiento, no un comentario sobre uno ya hecho.
   *
   * En el plan se puede escribir al programar, que es cuando el entrenador la
   * está pensando, y sigue ahí aunque el cliente repita el día dos veces. Y como
   * es plan, la escribe solo el entrenador: el cliente no tiene UPDATE sobre
   * `workout_data` y su RPC no toca el plan.
   *
   * ── Y por qué va al BLOQUE ──────────────────────────────────────────────────
   * Se escribía en el día del microciclo, que es donde vivía el plan antes. Con
   * el plan en el bloque eso la dejaba en tierra de nadie: la hoja se lee del
   * bloque, así que ni se veía al momento ni llegaba al microciclo siguiente —el
   * día del microciclo solo aporta el nombre—. Una indicación dura lo que dura
   * el bloque, igual que el ejercicio al que acompaña.
   */
  const setDayNote = useCallback(
    (clientId, weekNumber, dayName, note) =>
      applyPlan(clientId, (cd) => updatePlanDayIn(cd, weekNumber, dayName, (d) => ({ ...d, coachNote: note })), {
        immediate: false,
      }),
    [applyPlan]
  );

  /**
   * La indicación del entrenador para UN ejercicio.
   *
   * ── Por qué no basta con la del día ─────────────────────────────────────────
   * La del día es el marco («hoy vamos suaves de espalda»); esto es la corrección
   * técnica de un movimiento concreto («en el remo, el codo pegado»). Metida en
   * la nota del día habría que nombrar el ejercicio dentro del texto y quien
   * entrena tendría que acordarse de ella cuatro ejercicios después, en vez de
   * leerla justo donde está el ejercicio.
   *
   * Mismo campo, mismas reglas y MISMO DESTINO que la del día —`coachNote`,
   * dentro del plan, donde ese ejercicio viva: el bloque, o la excepción de esa
   * semana si solo existe ahí— porque es la misma cosa a otra altura. Vacía es
   * no tener nota: no ocupa sitio y no se pide.
   */
  const setExerciseNote = useCallback(
    (clientId, weekNumber, dayName, exId, note) =>
      applyPlan(
        clientId,
        (cd) => updatePlanExerciseIn(cd, weekNumber, dayName, exId, (ex) => ({ ...ex, coachNote: note })),
        { immediate: false }
      ),
    [applyPlan]
  );

  /**
   * El calentamiento propio de un día, o quitárselo para que herede el del
   * programa.
   *
   * ── `null` y `[]` no son lo mismo ───────────────────────────────────────────
   * `null` devuelve el día al calentamiento del programa —«no he decidido
   * nada»—; `[]` dice «este día NO se calienta», que es una decisión y hay que
   * poder tomarla: un día de test o un descanso activo no llevan movilidad, y
   * caer al del programa reaparecería el que se acaba de quitar.
   *
   * La regla de lectura vive en `domain/training.js` (`drillsForDay`).
   *
   * Va a la hoja del plan por lo mismo que la indicación del día: el
   * calentamiento de un día es plan, y escrito en el microciclo no se leía —la
   * hoja se lee del bloque— ni llegaba al microciclo siguiente.
   */
  const setDayDrills = useCallback(
    (clientId, weekNumber, dayName, drills) =>
      applyPlan(
        clientId,
        (cd) => updatePlanDayIn(cd, weekNumber, dayName, (d) => ({ ...d, mobilityDrills: drills })),
        { immediate: false }
      ),
    [applyPlan]
  );

  /**
   * Lo quita del plan y devuelve con qué se deshace.
   *
   * `donde` dice de dónde salió, porque deshacerlo no es lo mismo en los dos
   * casos: un ejercicio del bloque vuelve a su sitio en el bloque; uno que solo
   * existía como excepción de esa semana vuelve poniendo la excepción otra vez.
   */
  const removePlanExercise = useCallback(
    (clientId, weekNumber, dayName, exerciseId) => {
      let quitado = null;
      applyPlan(clientId, (cd) => {
        const { donde, bloque, override } = wherePlanExercise(cd, weekNumber, dayName, exerciseId);
        const hoja = planOfDay(cd, weekNumber, dayName);
        const index = (hoja?.exercises || []).findIndex((ex) => ex.id === exerciseId);
        if (index < 0) return cd;
        quitado = { exercise: hoja.exercises[index], index, donde, blockId: bloque?.id ?? null, override: override ?? null };
        return removePlanExerciseIn(cd, weekNumber, dayName, exerciseId);
      });
      return quitado;
    },
    [applyPlan]
  );

  /** El mismo cambio, pero SOLO en ese microciclo: crea la excepción. */
  const overridePlanExercise = useCallback(
    (clientId, weekNumber, dayName, exerciseId, fn, { hasta = weekNumber } = {}) =>
      applyPlan(clientId, (cd) =>
        overridePlanExerciseIn(cd, weekNumber, dayName, exerciseId, fn, { at: new Date().toISOString(), hasta })
      ),
    [applyPlan]
  );

  const removePlanExerciseOnly = useCallback(
    (clientId, weekNumber, dayName, exerciseId, { hasta = weekNumber } = {}) =>
      applyPlan(clientId, (cd) =>
        removePlanExerciseOnlyIn(cd, weekNumber, dayName, exerciseId, { at: new Date().toISOString(), hasta })
      ),
    [applyPlan]
  );

  /**
   * Un ejercicio nuevo desde la hoja, con su tramo.
   *
   * `hasta` dice hasta qué microciclo vale: el mismo (lo puntual), otro más
   * adelante (unas semanas de prueba) o `undefined` para que entre en la línea
   * base del bloque y lo vean todos, que es lo que se quiere casi siempre.
   */
  const addPlanExercise = useCallback(
    (clientId, weekNumber, dayName, exercise, { hasta = undefined } = {}) =>
      applyPlan(clientId, (cd) => {
        const bloque = blockOfWeek(cd, weekNumber);
        if (hasta === undefined) return addBlockExerciseIn(cd, bloque.id, dayName, exercise);
        return putOverrideIn(
          cd,
          bloque.id,
          buildOverride({ dayName, exercise, fromWeek: weekNumber, toWeek: hasta, at: new Date().toISOString() })
        );
      }),
    [applyPlan]
  );

  /* ── Los cambios del bloque y su tramo ──────────────────────────────────
     El id y el reloj los pone esta capa, como en la bitácora: el dominio es
     puro. Y todos toman el bloque, no el microciclo: un cambio puede durar
     varias semanas, así que no es de ninguna en particular. */
  const addOverride = useCallback(
    (clientId, blockId, override) =>
      applyPlan(clientId, (cd) => putOverrideIn(cd, blockId, { ...override, at: override.at || new Date().toISOString() })),
    [applyPlan]
  );

  const dropOverride = useCallback(
    (clientId, blockId, overrideId) => applyPlan(clientId, (cd) => removeOverrideIn(cd, blockId, overrideId)),
    [applyPlan]
  );

  /**
   * Alarga o acorta un cambio: «esto lo dejo dos semanas más», «que se quede».
   *
   * Es lo que hace que una prueba no haya que reescribirla para que dure otro
   * microciclo, que era justo lo que no se podía cuando el cambio vivía dentro
   * de una semana.
   */
  const setOverrideSpan = useCallback(
    (clientId, blockId, overrideId, tramo) =>
      applyPlan(clientId, (cd) => setOverrideSpanIn(cd, blockId, overrideId, tramo)),
    [applyPlan]
  );

  /** «Esto ya no es una prueba»: el cambio pasa a la línea base del bloque. */
  const promoteOverride = useCallback(
    (clientId, blockId, overrideId) => applyPlan(clientId, (cd) => promoteOverrideIn(cd, blockId, overrideId)),
    [applyPlan]
  );

  /**
   * Quita una semana/sesión completa y RENUMERA las restantes para que la
   * secuencia siga siendo continua (quitar la 2 de 1-2-3 deja 1-2, no 1-3).
   *
   * «Quita» y no «elimina»: el aviso que lo anuncia lleva «Deshacer» al lado
   * —`restoreMicrocycle` la devuelve entera—, y ése es el criterio que separa
   * los dos verbos del producto (`docs/producto.md` §5.7).
   *
   * Renumerar es seguro porque `weekNumber` solo identifica el microciclo dentro
   * de este mismo bloque JSONB: las fotos de progreso llevan su propia semana y
   * nada más lo referencia desde fuera.
   *
   * Devuelve la semana a la que conviene navegar después.
   */
  const removeMicrocycle = useCallback(
    (clientId, weekNumber) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const remaining = current.microcycles.filter((m) => m.weekNumber !== weekNumber);
      if (remaining.length === current.microcycles.length) return null;

      const renumbered = [...remaining]
        .sort((a, b) => a.weekNumber - b.weekNumber)
        .map((m, index) => ({ ...m, weekNumber: index + 1, sessionNumber: index + 1 }));

      /* Los bloques son rangos de números: se corren con la renumeración, y un
         bloque abierto que se queda vacío se va (ver `programAfterRemovingWeek`). */
      applyWorkout(clientId, (cd) => ({
        ...programAfterRemovingWeek(cd, weekNumber),
        microcycles: renumbered,
      }));

      if (renumbered.length === 0) return null;
      // Se queda en la posición que ocupaba la borrada, o en la última.
      return Math.min(weekNumber, renumbered.length);
    },
    [applyWorkout, workoutRef]
  );

  /**
   * El inverso de `removeMicrocycle`, para el «Deshacer» del aviso.
   *
   * No basta con reinsertarla: borrar RENUMERA las restantes para que la
   * secuencia siga siendo continua, así que deshacer es volver a colocarla en
   * su posición (su `weekNumber` de antes) y renumerar otra vez. Con eso las
   * demás recuperan exactamente el número que tenían.
   */
  const restoreMicrocycle = useCallback(
    (clientId, microcycle, estructura = null) =>
      applyWorkout(clientId, (cd) => {
        const sorted = [...cd.microcycles].sort((a, b) => a.weekNumber - b.weekNumber);
        const sitio = Math.max(0, Math.min(microcycle.weekNumber - 1, sorted.length));
        sorted.splice(sitio, 0, microcycle);
        return {
          ...cd,
          /* Si al borrar se fue un bloque entero, `estructura` trae los bloques, el
             reparto y el calentamiento de antes: deshacer los devuelve tal cual. */
          ...(estructura || { blocks: blocksAfterInsertingWeek(cd.blocks || [], sitio + 1) }),
          microcycles: sorted.map((m, index) => ({
            ...m,
            weekNumber: index + 1,
            sessionNumber: index + 1,
          })),
        };
      }),
    [applyWorkout]
  );

  /**
   * Añade un microciclo al final con los días que se le den.
   *
   * ── Por qué existe, y por qué `cloneMicrocycle` pasa por aquí ─────────────
   * Desde que hay portapapeles, los días que se pegan pueden no venir de este
   * programa: se copia el microciclo 4 de Marta y se pega en el bloque de Luis
   * media hora después. `cloneMicrocycle` sabía leer un microciclo del cliente y
   * escribirlo a continuación en el mismo gesto, así que no servía para nada que
   * no fuera duplicar en el sitio.
   *
   * Partido en dos, lo de abajo es lo único que hace falta —dónde cae, con qué
   * fecha y con qué número— y de dónde salgan los días es problema de quien
   * llama. `cloneMicrocycle` se queda como el caso de uso corto y ahora es una
   * línea sobre esto, que es como se evita que dos caminos escriban microciclos
   * con reglas distintas.
   *
   * Los días llegan CRUDOS y se clonan aquí (`cloneDays` reasigna los ids de los
   * ejercicios): si se clonaran fuera, cada sitio que pegue tendría que acordarse
   * y el día que uno se olvide dos microciclos compartirían ids de ejercicio, que
   * es como se cruzan dos historiales sin que salte nada.
   */
  const appendMicrocycleWithDays = useCallback(
    (clientId, days) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      if (current.microcycles.length === 0) return startProgram(clientId);

      const newWeek = nextWeekNumber(current.microcycles);
      /* La copia se coloca al final, así que su fecha sale de la ÚLTIMA y no de
         la copiada: duplicar la semana 2 estando por la 6 crea la 7, que empieza
         después de la 6. */
      const last = current.microcycles[current.microcycles.length - 1];

      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: [
          ...cd.microcycles,
          {
            ...buildMicrocycle({
              weekNumber: newWeek,
              days: cloneDays(days || []),
              date: fechaSiguienteCiclo(clientId, last),
            }),
            sessionNumber: newWeek,
          },
        ],
      }));
      return newWeek;
    },
    [applyWorkout, fechaSiguienteCiclo, startProgram, workoutRef]
  );

  /**
   * Copia una semana con sus ejercicios, series y pautas, y VACÍA lo registrado.
   *
   * Traía también los kilos, las reps y el RIR hechos. El dueño (21 sep): «la
   * copia del microciclo se hace vacía, para que el cliente rellene». Una semana
   * copiada es la siguiente que va a entrenar, y con los números heredados la
   * analítica la contaría como hecha — es el motivo de `blankDays`, que ya usaba
   * `continueProgram`.
   */
  const cloneMicrocycle = useCallback(
    (clientId, weekNumber) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const source = findMicrocycle(current.microcycles, weekNumber);
      if (!source) return null;
      return appendMicrocycleWithDays(clientId, blankDays(source.days || []));
    },
    [appendMicrocycleWithDays, workoutRef]
  );

  /**
   * Cuándo empieza un microciclo concreto.
   *
   * ── Por qué se puede editar y no basta con derivarla ────────────────────────
   * La fecha se hereda del ciclo anterior, que es lo correcto mientras el
   * programa corra seguido. Pero la vida se mete por medio: una semana de
   * vacaciones, una lesión, un cliente que empieza el día 1 y no hoy. Sin poder
   * moverla, la única salida era borrar el microciclo y volver a crearlo el día
   * bueno —perdiendo lo que tuviera dentro—.
   *
   * No es solo una etiqueta: la analítica agrupa por esta fecha (`analytics.js`),
   * así que moverla es lo que coloca el tonelaje y la adherencia en la semana en
   * la que de verdad ocurrieron.
   *
   * Solo el entrenador: vive en `microcycles`, y el cliente no tiene UPDATE
   * sobre esa columna (escribe por sus RPC, que no tocan la fecha del plan).
   */
  const setMicrocycleDate = useCallback(
    (clientId, weekNumber, date) =>
      applyMicrocycle(clientId, weekNumber, (m) => ({ ...m, date: date || null }), {
        immediate: false,
      }),
    [applyMicrocycle]
  );

  /**
   * Continúa el programa una semana más, con la estructura de la última y sin
   * ningún número.
   *
   * ── Por qué la necesita el CLIENTE y no solo el entrenador ──────────────────
   * El entrenador programa la estructura una vez y el cliente la va rellenando
   * semana a semana. Si cada semana nueva tuviera que crearla el entrenador, el
   * cliente se quedaría bloqueado al acabar la última: o entrena sin registrar
   * nada, o escribe encima de la semana anterior y borra su propio histórico. Las
   * dos salidas pierden datos, y la segunda los pierde sin avisar.
   *
   * ── Por qué se distingue de `cloneMicrocycle` ──────────────────────────────
   * Los dos vacían lo registrado con `blankDays` (desde el 21 sep también
   * `cloneMicrocycle`): los números aparecerían rellenos sin haber entrenado y
   * la analítica los contaría como reales. Lo que los distingue es de dónde
   * parten —la última semana resuelta aquí, la que se elija allí— y quién
   * escribe: aquí puede ser el cliente, por `continue_program`.
   *
   * ── Sobre el permiso ───────────────────────────────────────────────────────
   * El cliente NO tiene UPDATE sobre `workout_data` desde la 0014 —lo tuvo, y ese
   * permiso, sobre una fila con el programa entero en un jsonb, le alcanzaba para
   * borrárselo desde la consola—. Así que esto no escribe el bloque: pide una
   * operación acotada, `continue_program`, que construye la semana en el servidor.
   */
  const continueProgram = useCallback(
    (clientId) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      if (current.microcycles.length === 0) return null;

      /*
        ── Se parte del plan RESUELTO, no de los `days` en crudo ───────────────
        Con el plan en el bloque, lo que esta persona tiene delante son las hojas
        del bloque con las excepciones de su semana puestas. La semana nueva se
        copia de AHÍ y conservando los ids: en ese modelo el ejercicio es uno
        para todo el bloque y su identificador es el mismo en todas sus semanas.

        Reasignarlos —lo que se hacía— daba una semana cuyos ejercicios no
        existían en ninguna parte que `log_session_set` supiera mirar, así que
        nacía imposible de registrar: el primer número que se anotaba en ella
        volvía con «el ejercicio … no está programado en …». Y no era un caso
        raro: le pasaba a TODA semana añadida después de migrar el plan.
      */
      const resuelto = { ...current, microcycles: resolvedMicrocycles(current) };
      const last = [...resuelto.microcycles].sort((a, b) => b.weekNumber - a.weekNumber)[0];
      const newWeek = nextWeekNumber(resuelto.microcycles);
      const conPlan = hasBlockPlan(blockOfWeek(resuelto, newWeek));
      const days = blankDays(last.days || [], { conservarIds: conPlan });
      const micro = buildMicrocycle({ weekNumber: newWeek, days });

      /*
        Igual que al registrar series: el estado local se actualiza en los dos
        casos, y lo que cambia es quién puede escribir el bloque.

        El cliente no puede —ni debe— reescribir `microcycles`, así que llama a
        `continue_program`, que construye la semana EN EL SERVIDOR copiando la
        estructura de la última y vaciando los valores. La diferencia importa: lo
        que se le concede es «duplica la última semana en blanco», no «guárdame
        este programa».

        ── Y los identificadores viajan con la petición ────────────────────────
        Las dos semanas se construyen con la misma regla, pero cada una generaba
        sus propios `uuid`, y esa diferencia NO era cosmética: el id del ejercicio
        es lo único que `log_session_set` mira para saber dónde anotar. Mientras
        no se recargara la página entera, la pantalla enseñaba una semana y la base
        de datos guardaba otra, y cada kilo que se registrase en ella se rechazaba
        con «el ejercicio no está programado en …». Un entrenamiento completo,
        perdido sin que nadie pudiera hacer nada —el reintento mandaba lo mismo—.

        Ahora los ids los propone esta parte y el servidor los adopta si describen
        la semana que él va a construir (migración 0085). La respuesta trae el
        microciclo escrito, y `persistContinue` se queda con ese: si la copia de
        aquí estaba vieja y la propuesta se rechazó, se corrige en el sitio.
      */
      applyWorkout(clientId, (cd) => ({ ...cd, microcycles: [...cd.microcycles, micro] }), {
        skipPersist: profileRole === 'client',
      });

      if (profileRole === 'client') {
        persistContinue(`continue:${clientId}:${newWeek}`, clientId, microcycleIds(micro));
      }
      return newWeek;
    },
    [applyWorkout, persistContinue, profileRole, workoutRef]
  );

  // ── Copiar entre clientes ────────────────────────────────────────────────

  const copyDayToClient = useCallback(
    (sourceClientId, weekNumber, dayName, targetClientId) => {
      const source = workoutRef.current[sourceClientId];
      const day = findMicrocycle(source?.microcycles || [], weekNumber)?.days.find(
        (d) => d.dayName === dayName
      );
      if (!day) return false;

      const exercises = reidExercises(deepClone(day.exercises || []));

      applyWorkout(targetClientId, (cd) => {
        const hasWeek = cd.microcycles.some((m) => m.weekNumber === weekNumber);
        const microcycles = hasWeek
          ? cd.microcycles
          : [...cd.microcycles, buildMicrocycle({ weekNumber, days: [] })];

        return {
          ...cd,
          microcycles: microcycles.map((m) => {
            if (m.weekNumber !== weekNumber) return m;
            const exists = m.days.some((d) => d.dayName === dayName);
            return {
              ...m,
              days: exists
                ? m.days.map((d) => (d.dayName === dayName ? { ...d, exercises } : d))
                : [...m.days, { dayName, exercises }],
            };
          }),
        };
      });
      return true;
    },
    [applyWorkout, workoutRef]
  );

  const copyMicrocycleToClient = useCallback(
    (sourceClientId, weekNumber, targetClientId) => {
      const source = findMicrocycle(workoutRef.current[sourceClientId]?.microcycles || [], weekNumber);
      if (!source) return false;

      applyWorkout(targetClientId, (cd) => ({
        ...cd,
        microcycles: [
          ...cd.microcycles,
          buildMicrocycle({
            weekNumber: nextWeekNumber(cd.microcycles),
            days: cloneDays(source.days || []),
          }),
        ],
      }));
      return true;
    },
    [applyWorkout, workoutRef]
  );

  /**
   * Copia el programa completo AÑADIÉNDOLO al que el cliente destino ya tenga.
   * Se conserva para el caso de "traerme también estas semanas".
   */
  const copyProgramToClient = useCallback(
    (sourceClientId, targetClientId) => {
      const source = workoutRef.current[sourceClientId];
      if (!source || source.microcycles.length === 0) return false;

      const ordered = [...source.microcycles].sort((a, b) => a.weekNumber - b.weekNumber);

      applyWorkout(targetClientId, (cd) => {
        let week = nextWeekNumber(cd.microcycles);
        const cloned = ordered.map((m) => {
          const micro = buildMicrocycle({ weekNumber: week, days: cloneDays(m.days || []) });
          week += 1;
          return micro;
        });
        return { ...cd, microcycles: [...cd.microcycles, ...cloned] };
      });
      return true;
    },
    [applyWorkout, workoutRef]
  );

  /**
   * Réplica completa de un cliente a otro: entrenamiento y/o nutrición.
   *
   * A diferencia de `copyProgramToClient`, esto **sustituye**: es la operación de
   * "montar a este cliente igual que aquel", no la de añadirle semanas. Incluye
   * la estructura semanal y el tipo de ciclo, que antes no se copiaban y dejaban
   * el programa copiado a medias (los días existían pero no la planificación de
   * la semana ni el patrón rotativo).
   *
   * Lo que NO se copia son las SESIONES: son el registro de lo que otra persona
   * ejecutó, y no tienen ningún sentido en la ficha de un cliente distinto.
   */
  const replicateClient = useCallback(
    async (sourceClientId, targetClientId, { training = false, diet = false, warmup = false } = {}) => {
      /*
        `failed` es la tercera respuesta que faltaba.

        Antes solo había dos —copiado o «no tenía nada»— y con eso un fallo de red
        al leer el origen se anunciaba como que el otro cliente no tiene dieta.
        Son cosas distintas: una se arregla reintentando y la otra no.
      */
      const result = { training: false, diet: false, warmup: false, failed: [] };
      if (sourceClientId === targetClientId) return result;

      if (training) {
        /*
          El programa del ORIGEN, traído si no estaba.

          Con la carga perezosa, de los clientes que no se han abierto solo hay
          resumen. Sin esto, copiar de uno de ellos leería `undefined`, se saldría
          por el `if` de abajo y diría «no había nada que copiar» de alguien que
          tiene doce semanas programadas.
        */
        const source = await ensureProgram(sourceClientId);
        const sourceClient = clientsRef.current.find((c) => c.id === sourceClientId);

        // `null` es «no se pudo leer». Se dice, en vez de pasar por «no tiene».
        if (!source) result.failed.push('training');

        if (source && (source.microcycles.length > 0 || Object.keys(source.weeklySplit || {}).length > 0)) {
          applyWorkout(targetClientId, () => ({
            weeklySplit: deepClone(source.weeklySplit || {}),
            mobilityDrills: deepClone(source.mobilityDrills || []),
            blocks: deepClone(source.blocks || []),
            /* Los borradores viajan con el programa (22 sep). Sin la clave en el
               origen —columna sin leer— no se toca la del destino. */
            ...(Array.isArray(source.draftBlocks) ? { draftBlocks: deepClone(source.draftBlocks) } : {}),
            notes: source.notes || '',
            microcycles: [...source.microcycles]
              .sort((a, b) => a.weekNumber - b.weekNumber)
              .map((m, index) =>
                buildMicrocycle({
                  weekNumber: index + 1,
                  days: cloneDays(m.days || []),
                  date: m.date,
                })
              ),
          }));

          // El tipo de ciclo vive en la ficha del cliente, no en workout_data.
          // Se escribe aquí directamente porque `updateClient` se define más
          // abajo en el archivo y todavía no está inicializado.
          if (sourceClient) {
            const fields = {
              cycleType: sourceClient.cycleType,
              cyclePattern: deepClone(sourceClient.cyclePattern),
            };
            setClients(
              clientsRef.current.map((c) => (c.id === targetClientId ? { ...c, ...fields } : c))
            );
            persist('client', targetClientId, fields, { immediate: true });
          }
          result.training = true;
        }
      }

      /*
        El calentamiento, por separado.

        ── Por qué merece su propia opción ──────────────────────────────────────
        Vive en `workout_data.mobility_drills` y hasta ahora solo viajaba DENTRO de
        «entrenamiento», así que traerse la rutina de movilidad de un cliente
        obligaba a llevarse también sus doce semanas de programa —y a sustituir
        las del destino—. Como el calentamiento es lo que MÁS se repite entre
        clientes (es la misma pauta articular para media cartera) y el programa lo
        que menos, la combinación estaba justo al revés de lo que hace falta.

        Va DESPUÉS del bloque de entrenamiento a propósito: aquel reemplaza el
        objeto entero, así que hacerlo antes lo perdería.
      */
      if (warmup) {
        const desdeOrigen = await ensureProgram(sourceClientId);
        /*
          Y el del DESTINO también, aunque parezca que no hace falta.

          Aquí se fusiona sobre lo que el destino tenga (`{...cd, mobilityDrills}`).
          Si su programa no está cargado —carga perezosa: de un cliente que no se
          ha abierto solo hay resumen—, `cd` sería un `emptyWorkoutData()` y esa
          fusión escribiría un programa VACÍO encima del suyo. Borrar doce semanas
          de trabajo por copiar cuatro estiramientos.

          Con `training` no pasaba porque ese camino sustituye el objeto entero a
          conciencia y con confirmación previa.
        */
        const enDestino = await ensureProgram(targetClientId);

        /*
          Y si CUALQUIERA de las dos lecturas falla, no se escribe.

          La del destino es la delicada: sin su programa en memoria, la fusión de
          abajo parte de un `emptyWorkoutData()` y le escribiría un programa vacío
          encima del suyo. Un fallo de red al copiar cuatro estiramientos no puede
          acabar en doce semanas borradas.
        */
        if (!desdeOrigen || !enDestino) {
          result.failed.push('warmup');
        } else {
          const drills = desdeOrigen.mobilityDrills || [];
          if (drills.length > 0) {
            applyWorkout(targetClientId, (cd) => ({ ...cd, mobilityDrills: deepClone(drills) }));
            result.warmup = true;
          }
        }
      }

      if (diet) {
        /*
          El plan del ORIGEN, releído si no estaba — el mismo cuidado que el
          programa. Ver `ensureNutrition`: leer el mapa a pelo hacía que la dieta
          no se copiara, y sin decir nada, siempre que el arranque no hubiera
          podido traerla.
        */
        const source = await ensureNutrition(sourceClientId);

        if (!source) {
          result.failed.push('diet');
        } else if (!isEmptyDiet(source)) {
          const copy = deepClone(source);
          setNutrition({ ...nutritionRef.current, [targetClientId]: copy });
          persist('nutrition', targetClientId, copy, { immediate: true });
          result.diet = true;
        }
        /*
          Un plan en blanco NO se copia. Copiar sustituye, así que traerse la
          "dieta" de un cliente que no la tiene configurada le borraría la suya al
          destino — y el único aviso sería su pantalla de nutrición vacía.
        */
      }

      /*
        Replicar es la función que convierte «un entrenador con veinte clientes»
        en algo sostenible, y por eso es la que decide si esto escala o no. Si
        nadie la usa, la cartera grande es un infierno manual y hay un problema de
        producto que no se va a ver en ninguna otra métrica.

        Solo se apunta si algo se copió de verdad: pulsar y que no hubiera nada
        que traer no es haber usado la función, es haberla intentado.
      */
      // Solo los BLOQUES: `failed` vive en el mismo objeto y no es una parte copiada.
      const copiado = ['training', 'warmup', 'diet'].filter((k) => result[k]);
      if (copiado.length > 0) track('plantilla_usada', { partes: copiado.join('_') });

      return result;
    },
    [
      applyWorkout,
      clientsRef,
      ensureNutrition,
      ensureProgram,
      nutritionRef,
      persist,
      setClients,
      setNutrition,
    ]
  );
  /* Lo único que la pantalla necesita saber de la pila: cuántos pasos hay a
     cada lado. Las fotos no salen de aquí — nadie fuera tiene nada que hacer
     con un programa entero, y sacarlas invitaría a pintar con ellas. */
  const pasosDelPlan = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(historial).map(([clientId, pila]) => [
          clientId,
          { atras: pila?.pasado?.length || 0, adelante: pila?.futuro?.length || 0 },
        ])
      ),
    [historial]
  );

  return {
    deshacerPlan,
    rehacerPlan,
    pasosDelPlan,
    updateExerciseSet,
    updateExerciseTarget,
    startSession,
    logSessionSet,
    updateSession,
    updateSessionMeta,
    closeSession,
    discardSession,
    logExerciseNote,
    updateMobilityDrills,
    removeSession,
    addExercise,

    addExercises,
    removeExercise,
    restoreExercise,
    addExerciseSetSlot,
    removeExerciseSetSlot,
    moveExercise,
    setExerciseSetCount,
    renameDay,
    setDayNote,
    setExerciseNote,
    setDayDrills,
    addDay,

    importDays,
    importRoutine,
    duplicateDay,
    moveDay,
    removeDay,
    restoreDay,
    ponerMicrocicloDelBloque,
    ponerReferenciasDelBloque,
    marcarExcepcionVista,
    cambiarFechaDeSesion,
    startProgram,
    appendMicrocycle,
    appendMicrocycleWithDays,
    startBlock,
    renameBlock,
    setBlockTraits,
    ponerTemporada,
    moverBorradorDelBloque,
    deleteBlock,
    logBlockChange,
    migratePlanToBlock,
    startBlockWithPlan,
    anadirBorradorDelBloque,
    cambiarBorradorDelBloque,
    quitarBorradorDelBloque,
    devolverBorradorDelBloque,
    empezarBorradorDelBloque,
    setBlockPlan,
    addBlockSheet,
    duplicateBlockSheet,
    removeBlockSheet,
    renameBlockSheet,
    renameBlockExercise,
    renamePlanExercise,
    moveBlockSheet,
    addBlockExercise,
    setBlockSheetExercises,
    removeBlockExercise,
    restoreBlockExercise,
    moveBlockExercise,
    setBlockExerciseSets,
    setBlockExerciseScheme,
    ponerPautaDelMicrociclo,
    volverPautaAlAnterior,
    pautaSoloEn,
    restaurarPauta,
    setBlockExerciseTarget,
    setBlockExerciseGrammar,
    updatePlanExercise,
    updatePlanExercises,
    removePlanExercise,
    overridePlanExercise,
    removePlanExerciseOnly,
    addPlanExercise,
    addOverride,
    setOverrideSpan,
    dropOverride,
    promoteOverride,
    removeMicrocycle,
    restoreMicrocycle,
    cloneMicrocycle,
    setMicrocycleDate,
    continueProgram,
    copyDayToClient,
    copyMicrocycleToClient,
    copyProgramToClient,
    replicateClient,
  };
};
