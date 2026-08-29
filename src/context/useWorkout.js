import { useCallback } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { track } from '@/lib/analytics';
import { deepClone, newId } from '@/lib/ids';
import {
  buildMicrocycle,
  blankDays,
  cloneDays,
  emptyWorkoutData,
  findMicrocycle,
  firstCycleDate,
  microcycleIds,
  nextCycleDate,
  nextWeekNumber,
  reidExercises,
  restWeekSplit,
  today,
  uniqueDayName,
} from '@/domain/training';
import { buildSessionFromPlan, isSetLogged, sessionsOf, withSessionSet } from '@/domain/sessions';
import {
  blocksAfterInsertingWeek,
  logBlockChange as logBlockChangeIn,
  openNextBlock,
  programAfterRemovingWeek,
  renameBlockIn,
} from '@/domain/blocks';
import { moveItem, isEmptyDiet } from '@/domain/nutrition';

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
  persistContinue,
  queue,
  ensureProgram,
  ensureNutrition,
  profileRole,
}) => {
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
  const applyWorkout = useCallback(
    (clientId, updater, { immediate = true, skipPersist = false } = {}) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const next = updater(current);
      if (next === current) return current;

      setWorkoutData({ ...workoutRef.current, [clientId]: next });
      if (!skipPersist) persist('workout', clientId, next, { immediate });
      return next;
    },
    [persist, setWorkoutData, workoutRef]
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
    (clientId, weekNumber, sessionId, date, dayName, exercise, setIndex, field, value) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const micro = findMicrocycle(current.microcycles, weekNumber);
      if (!micro) return null;

      let targetId = sessionId;
      let sessions = sessionsOf(micro);

      if (!targetId || !sessions.some((s) => s.id === targetId)) {
        const day = (micro.days || []).find((d) => d.dayName === dayName);
        if (!day) return null;
        const created = buildSessionFromPlan(day, date);
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
        s.id === targetId ? withSessionSet(s, exercise, setIndex, field, value) : s
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
        persistSet(`set:${clientId}:${targetId}:${exercise.id}:${setIndex}:${field}`, clientId, {
          weekNumber,
          sessionId: targetId,
          date,
          dayName,
          exercise,
          setIndex,
          field,
          value,
        });
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

  /**
   * La indicación del entrenador para un día.
   *
   * ── Por qué vive en el DÍA y no en la sesión ────────────────────────────────
   * Estuvo colgada de la sesión, y era un error de modelo con una consecuencia
   * inmediata: una sesión no existe hasta que alguien anota la primera serie, así
   * que la nota solo se podía escribir DESPUÉS de que el cliente entrenara. Justo
   * al revés de para lo que sirve — es una instrucción para hacer el
   * entrenamiento, no un comentario sobre uno ya hecho.
   *
   * En el día del PLAN se puede escribir al programar la semana, que es cuando el
   * entrenador la está pensando, y sigue ahí aunque el cliente repita el día dos
   * veces. Y como es plan, la escribe solo el entrenador: el cliente no tiene
   * UPDATE sobre `workout_data` y su RPC no toca `days`.
   */
  const setDayNote = useCallback(
    (clientId, weekNumber, dayName, note) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({ ...d, coachNote: note }), {
        immediate: false,
      }),
    [applyDay]
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
   * Mismo campo y mismas reglas que la del día —`coachNote`, dentro del PLAN, la
   * escribe solo el entrenador y la ve el cliente— porque es la misma cosa a otra
   * altura. Vacía es no tener nota: no ocupa sitio y no se pide.
   */
  const setExerciseNote = useCallback(
    (clientId, weekNumber, dayName, exId, note) =>
      applyDay(
        clientId,
        weekNumber,
        dayName,
        (d) => ({
          ...d,
          exercises: d.exercises.map((ex) => (ex.id !== exId ? ex : { ...ex, coachNote: note })),
        }),
        { immediate: false }
      ),
    [applyDay]
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
   */
  const setDayDrills = useCallback(
    (clientId, weekNumber, dayName, drills) =>
      applyDay(clientId, weekNumber, dayName, (d) => ({ ...d, mobilityDrills: drills }), {
        immediate: false,
      }),
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

  const updateWeeklySplit = useCallback(
    (clientId, day, value) =>
      applyWorkout(
        clientId,
        (cd) => ({ ...cd, weeklySplit: { ...cd.weeklySplit, [day]: value } }),
        { immediate: false }
      ),
    [applyWorkout]
  );

  /**
   * Con qué fecha nace el ciclo que va después de `previous`.
   *
   * El tipo de ciclo y el patrón son del CLIENTE, no del programa, así que se
   * leen aquí: en el semanal son siete días y en el rotativo lo que dure el
   * ciclo anterior con sus sesiones dentro —seis sesiones a 2/1 son nueve días,
   * no tres—. Ver `cycleSpanDays`.
   */
  const fechaSiguienteCiclo = useCallback(
    (clientId, previous) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      return nextCycleDate(previous, client?.cycleType, client?.cyclePattern);
    },
    [clientsRef]
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
               las cuatro nacían el mismo día. Ver `nextCycleDate`. */
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

  /**
   * Elimina una semana/sesión completa y RENUMERA las restantes para que la
   * secuencia siga siendo continua (borrar la 2 de 1-2-3 deja 1-2, no 1-3).
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

  /** Duplica una semana con todos sus ejercicios y series. */
  const cloneMicrocycle = useCallback(
    (clientId, weekNumber) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const source = findMicrocycle(current.microcycles, weekNumber);
      if (!source) return null;

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
              days: cloneDays(source.days || []),
              date: fechaSiguienteCiclo(clientId, last),
            }),
            sessionNumber: newWeek,
          },
        ],
      }));
      return newWeek;
    },
    [applyWorkout, fechaSiguienteCiclo, workoutRef]
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
   * `cloneMicrocycle` trae los kilos de la semana copiada, que es lo que el
   * entrenador quiere al duplicar. Aquí sería un desastre: los números aparecerían
   * rellenos sin haber entrenado y la analítica los contaría como reales. Por eso
   * `blankDays` y no `cloneDays`.
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

      const last = [...current.microcycles].sort((a, b) => b.weekNumber - a.weekNumber)[0];
      const newWeek = nextWeekNumber(current.microcycles);
      const days = blankDays(last.days || []);
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
  return {
    updateExerciseSet,
    updateExerciseTarget,
    startSession,
    logSessionSet,
    updateSession,
    updateSessionMeta,
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
    updateWeeklySplit,
    startProgram,
    appendMicrocycle,
    startBlock,
    renameBlock,
    logBlockChange,
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
