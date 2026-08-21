import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { createSaveQueue } from '@/lib/saveQueue';
import { pendingStore } from '@/lib/pendingSaves';
import { useMirroredState } from '@/lib/useMirroredState';
import { newId, deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';
import { recordIssue } from '@/lib/diagnostics';
import { bucket, flushEvents, forgetActor, identify, track } from '@/lib/analytics';
import { useRoadmap } from '@/context/useRoadmap';
import { useSupport } from '@/context/useSupport';
import { useReviews } from '@/context/useReviews';
import { useCalendar } from '@/context/useCalendar';
import { useCheckIns } from '@/context/useCheckIns';
import { useTeam } from '@/context/useTeam';
import { useIntegrations } from '@/context/useIntegrations';
import { useProgressPhotos } from '@/context/useProgressPhotos';
import { useCoachPrefs } from '@/context/useCoachPrefs';
import { BUCKET, SIGNED_URL_TTL_SECONDS } from '@/context/media';
import {
  mapAnthroFromDb,
  mapAnthroToDb,
  mapCatalogFoodFromDb,
  mapCheckInFromDb,
  mapClientFromDb,
  mapClientToDb,
  mapLibraryExerciseFromDb,
  mapLibraryFoodFromDb,
  mapNutritionFromDb,
  mapNutritionToDb,
  mapPhotoFromDb,
  mapPlanFromDb,
  mapTrainingSummaryFromDb,
  mapWorkoutFromDb,
  mapWorkoutToDb,
} from '@/lib/mappers';
import {
  buildMicrocycle,
  blankDays,
  cloneDays,
  emptyWorkoutData,
  findMicrocycle,
  firstCycleDate,
  nextCycleDate,
  nextWeekNumber,
  reidExercises,
  restWeekSplit,
  today,
  uniqueDayName,
} from '@/domain/training';
import { emptyAnthropometry } from '@/domain/anthropometry';
import {
  VARIANT_KEY,
  buildFoodEntry,
  cloneMeal,
  cloneMeals,
  cloneOption,
  moveItem,
  buildMeal,
  buildOption,
  emptyNutrition,
  isEmptyDiet,
} from '@/domain/nutrition';
import {
  buildIntakePath,
  validateAttachment,
} from '@/domain/attachments';
import { traduceStorageError } from '@/lib/dbErrors';
import { isArchived } from '@/domain/portfolio';
import { nextPaymentAfter } from '@/domain/billing';
import { stampUpdate } from '@/domain/updates';
import {
  buildSessionFromPlan,
  normalizeMicrocycles,
  sessionsOf,
  trainingSummary,
  withSessionSet,
} from '@/domain/sessions';

/*
  Los tres contextos. Ver el razonamiento entero donde se construyen sus valores,
  al final de `AppProvider`: se separan por FRECUENCIA DE CAMBIO, que es lo que
  decide a quién arrastra cada cosa cuando se repinta.
*/
const SessionContext = createContext(null);
const DataContext = createContext(null);
const ActionsContext = createContext(null);

/**
 * Qué cola de guardado corresponde a cada tabla de bloque.
 *
 * Fuera del componente: es una constante, y dentro obligaría a memoizarla o a
 * declararla como dependencia de todo lo que la use.
 */
const QUEUE_OF_TABLE = {
  workout_data: 'workout',
  anthropometry: 'anthro',
  nutrition_plans: 'nutrition',
};

/** Destinos válidos de un guardado recuperado. Ver el efecto de recuperación. */
const DOMINIOS = ['workout', 'anthro', 'nutrition', 'client', 'preferences'];

const EMPTY_SAVE_STATE = { status: 'idle', error: null };

export const AppProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  /*
    Escritura rechazada porque alguien tocó los mismos datos en medio. Es un
    estado del que hay que SALIR —recargando o imponiendo tu versión—, no un
    error que se pueda ignorar, y por eso vive aparte de `loadError`.
  */
  const [conflict, setConflict] = useState(null);

  /** Rol real, según la tabla `profiles`. La autorización la aplica RLS. */
  const [profileRole, setProfileRole] = useState('coach');
  /** Vista activa. Un coach puede previsualizar el portal del cliente. */
  const [viewMode, setViewMode] = useState('coach');

  const [selectedClientId, setSelectedClientId] = useState('');
  const [clients, setClients, clientsRef] = useMirroredState([]);
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const [workoutData, setWorkoutData, workoutRef] = useMirroredState({});
  const [anthropometry, setAnthropometry, anthroRef] = useMirroredState({});
  const [nutrition, setNutrition, nutritionRef] = useMirroredState({});

  /*
    El catálogo común (migración 0033): alimentos y ejercicios de referencia que
    ve todo el mundo y que nadie puede escribir desde el navegador.

    Se carga UNA vez por sesión y no por cliente: es el mismo para todos y no
    cambia salvo que se despliegue una migración. Vacío si la 0033 no está
    aplicada, y entonces los buscadores se comportan como siempre.
  */
  const [catalogFoods, setCatalogFoods] = useState([]);
  const [catalogExercises, setCatalogExercises] = useState([]);

  /** Equipo del entrenador y plan contratado, en su gancho (`useTeam.js`).
      `loadForUser` siembra los tres estados con los setters que devuelve. */
  const {
    team,
    setTeam,
    teamMembers,
    setTeamMembers,
    plan,
    setPlan,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    renameTeam,
    refreshPlan,
  } = useTeam({ clientsRef, setClients });

  /*
    El resumen de entrenamiento que calcula el servidor (migración 0024), por
    cliente. Vacío significa «no hay resumen»: o falta la migración, o algún
    cliente conserva registros del formato antiguo. En los dos casos se ha cargado
    el programa completo y `training` sale de ahí.
  */
  const [serverSummaries, setServerSummaries] = useState({});
  const [legacyPending, setLegacyPending] = useState(false);

  /*
    El plan, accesible desde funciones que no deben depender de él.

    `upsertClientRow` necesita saber si la suscripción está activa para explicar
    un rechazo de escritura, pero meterlo en sus dependencias recrearía media
    cadena de guardado cada vez que se relee el plan. Un espejo en un ref da el
    valor de siempre sin arrastrar a nadie.
  */
  const planRef = useRef(null);
  planRef.current = plan;

  const [saveState, setSaveState] = useState({});

  // ── Cola de guardado ─────────────────────────────────────────────────────

  /*
    ══ Lo pendiente sobrevive a que se cierre la pestaña ══════════════════════

    La cola retenía en MEMORIA lo que no había podido enviar. En un gimnasio con
    mala cobertura eso significa que las series anotadas viven en una pestaña que
    el móvil puede matar en cualquier momento — y ahí no hay reintento posible.

    El almacén se enchufa por referencia y no directamente porque la cola se
    construye en el primer render, cuando todavía no se sabe QUIÉN es el usuario,
    y lo pendiente tiene que quedar separado por persona: dos entrenadores en el
    mismo ordenador no pueden heredar los guardados a medias del otro.
  */
  const storeRef = useRef(null);
  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue({
      store: {
        save: (key, payload) => storeRef.current?.save(key, payload),
        clear: (key) => storeRef.current?.clear(key),
      },
      onStatus: (key, next) => {
        /*
          Un guardado que falla se apunta para el diagnóstico (`lib/diagnostics`).

          Es el fallo que más veces está detrás de un ticket y el que peor se
          cuenta: el usuario escribe «no me guarda», y lo que hace falta saber es
          QUÉ no se guardó y con qué error. La clave de cola dice lo primero
          —`workout:<cliente>`— y el mensaje lo segundo.
        */
        if (next.status === 'error') recordIssue('guardado', next.error, { key });

        setSaveState((prev) =>
          prev[key]?.status === next.status && prev[key]?.error === next.error
            ? prev
            : { ...prev, [key]: next }
        );
      },
    });
  }
  const queue = queueRef.current;

  /**
   * Estado de guardado de un dominio.
   *
   * ── Por qué «workout» mira también las claves `set:` ────────────────────────
   * Cuando el cliente registra una serie no se guarda el bloque completo, sino un
   * campo concreto con `log_session_set` (ver 0014), y cada campo tiene su propia
   * clave de cola para que kg, reps y RIR no se pisen. Eso deja al indicador de
   * guardado sin nada que mirar: la clave `workout:<id>` ya no se usa en el portal
   * del cliente, y el indicador diría «guardado» sin que se haya guardado nada.
   *
   * Así que para `workout` se agrega: cualquier campo fallando pone el indicador en
   * error —un fallo silencioso es exactamente lo que la cola existe para evitar—, y
   * cualquiera en vuelo lo pone en «guardando».
   */
  const saveStatus = useCallback(
    (domain, clientId) => {
      const own = saveState[`${domain}:${clientId}`];
      if (domain !== 'workout') return own || EMPTY_SAVE_STATE;

      const prefix = `set:${clientId}:`;
      const parts = Object.entries(saveState).filter(([key]) => key.startsWith(prefix));
      if (parts.length === 0) return own || EMPTY_SAVE_STATE;

      const failed = parts.find(([, s]) => s.status === 'error');
      if (failed) return failed[1];
      if (parts.some(([, s]) => s.status === 'saving')) return { status: 'saving', error: null };
      if (own?.status === 'error' || own?.status === 'saving') return own;
      return { status: 'saved', error: null };
    },
    [saveState]
  );

  const retrySave = useCallback(
    (domain, clientId) => {
      queue.retry(`${domain}:${clientId}`);
      // Y los campos sueltos que hayan fallado, que son los que de verdad tiene
      // pendientes el cliente.
      if (domain === 'workout') {
        for (const key of Object.keys(saveState)) {
          if (key.startsWith(`set:${clientId}:`) && saveState[key]?.status === 'error') queue.retry(key);
        }
      }
    },
    [queue, saveState]
  );

  /** ¿Hay algo escrito que todavía no está confirmado en el servidor? */
  const hasUnsavedChanges = useMemo(
    () => Object.values(saveState).some((s) => s.status === 'saving' || s.status === 'error'),
    [saveState]
  );

  // Un cierre de pestaña con debounce pendiente perdía el último cambio.
  useEffect(() => {
    const flush = () => queue.flushAll();
    const onBeforeUnload = (event) => {
      if (!queue.hasUnsaved()) return;
      flush();
      event.preventDefault();
      event.returnValue = '';
    };
    const onHide = () => {
      // En móvil `beforeunload` no siempre dispara; `hidden` sí.
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [queue]);

  // ── Persistencia de los tres bloques JSONB ───────────────────────────────

  /**
   * Guarda un bloque de datos de un cliente (una fila por cliente).
   *
   * ── Por qué no se usa `upsert` ──────────────────────────────────────────────
   * Estas filas se identifican por `client_id`, no por la clave primaria. Un
   * `upsert(..., { onConflict: 'client_id' })` exige que exista una constraint
   * UNIQUE sobre esa columna, y en la base de datos real **no todas la tienen**:
   * el guardado de antropometría fallaba con «there is no unique or exclusion
   * constraint matching the ON CONFLICT specification» (Postgres 42P10). El
   * `schema.sql` del repositorio las declara, pero es una reconstrucción y en
   * las constraints no coincide con la realidad.
   *
   * UPDATE-y-si-no-existe-INSERT no depende de ninguna constraint. `select('id')`
   * en el UPDATE es lo que revela si había fila: PostgREST devuelve las filas
   * afectadas, así que un array vacío significa "no existía". Coste habitual:
   * una sola petición, porque la fila casi siempre existe ya.
   *
   * Sigue mereciendo la pena crear las constraints (migración 0003): sin ellas
   * nada impide dos filas para el mismo cliente, lo que partiría sus datos en
   * dos en silencio.
   */
  /**
   * La versión que tenemos leída de cada bloque: `tabla → cliente → updated_at`.
   *
   * Es un ref y no estado porque nadie lo pinta: solo se compara al escribir, y
   * un cambio aquí no debe provocar un render.
   */
  const versionsRef = useRef({});

  const rememberVersion = useCallback((table, clientId, stamp) => {
    if (!stamp) return;
    if (!versionsRef.current[table]) versionsRef.current[table] = {};
    versionsRef.current[table][clientId] = stamp;
  }, []);

  /**
   * Escribe un bloque de un cliente SOLO si nadie lo ha tocado desde que lo
   * leímos.
   *
   * ══ El problema que cierra ══════════════════════════════════════════════════
   *
   * `updated_at` se escribía en cada guardado y **nadie lo comparaba nunca**. Dos
   * escrituras simultáneas sobre el mismo cliente se pisaban sin dejar rastro:
   * ganaba la última en llegar y la otra desaparecía. No hacía falta un equipo —
   * bastaban dos pestañas abiertas, o una pestaña vieja que despierta y guarda su
   * copia en caché encima de la actual.
   *
   * El caso concreto que ya podía ocurrir: el entrenador reordena los ejercicios
   * del lunes mientras el cliente anota sus kilos. Los dos leyeron el mismo jsonb,
   * los dos lo reescriben entero, y el segundo borra el trabajo del primero.
   *
   * ══ Por qué aquí y no con `save_workout_data` ═══════════════════════════════
   *
   * La migración 0014 dejó escrita esa función, que hace justo esta comprobación.
   * No se usa por una razón concreta: solo escribe `microcycles`, y la fila lleva
   * además el split semanal, el calentamiento y las notas. Enchufarla habría
   * dejado de persistir esas tres columnas.
   *
   * Comparando `updated_at` desde aquí se protege la fila ENTERA y las TRES
   * tablas de bloque —rutina, antropometría y nutrición— sin una migración más.
   * La función sigue en la base de datos y es válida; simplemente cubre menos.
   *
   * ── Cómo se distingue «no existe» de «conflicto» ────────────────────────────
   * Las dos cosas dan cero filas afectadas. Se resuelve con UNA consulta extra
   * que solo ocurre en ese caso —la primera escritura de un cliente, o un
   * conflicto de verdad—, no en cada guardado.
   */
  const upsertClientRow = useCallback(
    async (table, clientId, row) => {
      const seen = versionsRef.current[table]?.[clientId];

      let query = supabase.from(table).update(row).eq('client_id', clientId);
      if (seen) query = query.eq('updated_at', seen);

      const updated = await query.select('updated_at');
      if (updated.error) return updated;

      if (updated.data && updated.data.length > 0) {
        rememberVersion(table, clientId, updated.data[0].updated_at);
        return updated;
      }

      const current = await supabase
        .from(table)
        .select('updated_at')
        .eq('client_id', clientId)
        .maybeSingle();

      if (current.error) return current;

      if (current.data) {
        /*
          ── ¿Conflicto, o escritura RECHAZADA? ────────────────────────────────
          Las dos dan cero filas y hasta ahora se trataban igual, así que una
          suscripción caducada —que hace que RLS rechace el UPDATE— se anunciaba
          como «alguien ha cambiado estos datos mientras editabas». Mentira, y de
          las que hacen perder una tarde buscando a ese alguien.

          Se distinguen sin preguntar nada a nadie: si la versión que hay en el
          servidor es EXACTAMENTE la que leímos, nadie ha tocado la fila. El
          UPDATE llevaba esa misma condición, así que habría casado; si no casó,
          fue la política la que lo rechazó, no la versión.

          Sin `seen` es lo mismo: el UPDATE iba sin condición de versión, así que
          cero filas sobre una fila que existe solo puede ser un rechazo.
        */
        const rechazado = !seen || current.data.updated_at === seen;

        if (rechazado) {
          return {
            error: {
              message:
                planRef.current && planRef.current.activo === false
                  ? 'Tu suscripción no está activa, así que no se pueden guardar cambios. Lo que ya tienes sigue visible y puedes descargar tu copia.'
                  : 'No tienes permiso para guardar en esta ficha.',
            },
          };
        }

        /*
          La fila existe y su versión no es la nuestra: alguien ha escrito en
          medio. Se devuelve como error para que la cola lo trate como tal —el
          indicador dirá que no se guardó— y se marca el conflicto para poder
          explicarlo y ofrecer salida. Lo que NO se hace es escribir igualmente:
          eso es exactamente el borrado silencioso que esto viene a impedir.
        */
        setConflict({ table, clientId, at: current.data.updated_at });
        return {
          error: {
            message:
              'Alguien ha cambiado estos datos mientras editabas. Tus cambios no se han guardado para no pisar los suyos.',
          },
        };
      }

      const inserted = await supabase.from(table).insert(row).select('updated_at');
      if (!inserted.error && inserted.data?.length > 0) {
        rememberVersion(table, clientId, inserted.data[0].updated_at);
      }
      return inserted;
    },
    [rememberVersion]
  );


  /**
   * Salir de un conflicto. Dos caminos, y ninguno es «reintentar»: reintentar tal
   * cual volvería a chocar contra la misma versión, para siempre.
   *
   *   · `reload`    — recargar la página y quedarse con la versión del servidor.
   *     Es una recarga completa a propósito: media aplicación tiene el bloque en
   *     memoria y volver a pedir solo esa tabla dejaría el resto descuadrado.
   *   · `overwrite` — imponer la versión local. Se olvida la versión leída, con lo
   *     que la siguiente escritura va sin guardia, y se reenvía lo que quedó en la
   *     cola.
   *
   * El segundo PIERDE el trabajo del otro, y por eso la interfaz lo dice con esas
   * palabras en vez de llamarlo «forzar».
   */
  const resolveConflict = useCallback(
    (mode) => {
      if (!conflict) return;
      if (mode === 'reload') {
        window.location.reload();
        return;
      }
      const { table, clientId } = conflict;
      if (versionsRef.current[table]) delete versionsRef.current[table][clientId];
      setConflict(null);
      queue.retry(`${QUEUE_OF_TABLE[table]}:${clientId}`);
    },
    [conflict, queue]
  );

  /*
    Quién está escribiendo, en una referencia.

    `persist` no puede depender del rol como valor sin volver a crearse cada vez
    que cambia —y con él la mitad de las funciones del contexto—. Una referencia
    da el valor de AHORA sin entrar en las dependencias.
  */
  const isCoachRef = useRef(false);
  isCoachRef.current = profileRole === 'coach';

  /** Cuándo se selló por última vez cada (tipo, cliente). Ver `persist`. */
  const stampedRef = useRef(new Map());

  /**
   * Deja constancia de que el entrenador ha tocado algo, para que al cliente le
   * salga como novedad.
   *
   * Escribe por la función de la base directamente y no por
   * `updateClientPreferences`, que se define mucho más abajo y usa `persist`: el
   * ciclo no compilaría. Y actualiza también el estado local, porque el sello
   * siguiente se calcula sobre lo que hay en memoria — sin eso, sellar la dieta
   * borraría el sello de la rutina.
   */
  const stampNow = useCallback(
    (clientId, kind) => {
      const actual = clientsRef.current.find((c) => c.id === clientId);
      if (!actual) return;

      const prefs = { ...(actual.preferences || {}), updates: stampUpdate(actual.preferences, kind) };
      setClients(clientsRef.current.map((c) => (c.id === clientId ? { ...c, preferences: prefs } : c)));

      /* Su fallo no se propaga: no haber podido dejar el aviso no puede
         estropear el guardado del trabajo, que es lo que importa.

         `Promise.resolve` en medio porque lo que devuelve `rpc()` es un
         thenable SIN `.catch`: llamarlo directo lanzaba un TypeError síncrono
         dentro del guardado — el aviso que no podía estropear nada rompía el
         `submit` entero, y era la causa de que el formulario de ejercicio o
         alimento se quedara con el texto anterior (el reset venía después). */
      Promise.resolve(supabase.rpc('set_client_preferences', { target: clientId, prefs })).catch(
        () => {}
      );
    },
    [clientsRef, setClients]
  );

  /* Los check-ins: estado y acciones en su gancho (`useCheckIns.js`). Va aquí y
     no con los demás dominios extraídos porque `loadForUser`, más abajo, siembra
     su estado con los setters que devuelve. */
  const {
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
  } = useCheckIns({ stampNow });

  const persist = useCallback(
    (domain, clientId, payload, { immediate = false } = {}) => {
      const senders = {
        workout: (data) => upsertClientRow('workout_data', clientId, mapWorkoutToDb(clientId, data)),
        anthro: (data) => upsertClientRow('anthropometry', clientId, mapAnthroToDb(clientId, data)),
        nutrition: (data) =>
          upsertClientRow('nutrition_plans', clientId, mapNutritionToDb(clientId, data)),
        client: (data) => supabase.from('clients').update(mapClientToDb(data)).eq('id', clientId),
        /*
          Las preferencias NO van por un UPDATE a `clients`, sino por una función
          de la base de datos.
          ------------------------------------------------------------------
          Porque RLS filtra FILAS, no columnas: permitir que el cliente escriba en
          su propia fila para guardar cómo quiere ver su panel le devuelve también
          el poder de ponerse el pago al día o cambiarse de entrenador. La función
          `set_client_preferences` (migración 0008) escribe exactamente esa columna
          después de comprobar quién llama, así que el permiso concedido es la
          operación y no la fila.

          El entrenador usa el mismo camino: un solo trayecto para los dos, y una
          sola regla que revisar.
        */
        preferences: (data) =>
          supabase.rpc('set_client_preferences', { target: clientId, prefs: data }),
      };

      queue.enqueue(`${domain}:${clientId}`, payload, senders[domain], { immediate });

      /*
        ══ La novedad del cliente sale SOLA de aquí ═══════════════════════════

        Hubo un botón de «avisar del cambio» y sobraba: si le has cambiado la
        rutina, que le aparezca que ha cambiado no es una decisión, es la
        consecuencia. Un botón para eso solo añade una forma de que se te olvide.

        ── Por qué no llena de avisos al cliente ───────────────────────────────
        Porque la novedad es una COMPARACIÓN —«esto se tocó después de la última
        vez que entré»— y no una lista de sucesos. Cuarenta guardados en una tarde
        de programación dejan un solo sello, y por tanto una sola línea en su
        panel. Ver `domain/updates.js`.

        ── Por qué solo cuando escribe el ENTRENADOR ──────────────────────────
        `workout_data` la escriben los dos: tú al programar y él al anotar sus
        series. Un sello puesto por su propio entrenamiento le diría «tu rutina ha
        cambiado» por algo que ha hecho él. Como esto corre en la sesión de quien
        escribe, `isCoachRef` distingue las dos sin preguntarle a la base de datos
        quién tocó la fila.

        Y se limita a uno cada cinco minutos: sin eso, montar un mesociclo serían
        cien llamadas a `set_client_preferences` que acabarían todas en el mismo
        valor.
      */
      if ((domain === 'workout' || domain === 'nutrition') && isCoachRef.current) {
        const kind = domain === 'workout' ? 'routine' : 'diet';
        const clave = `${kind}:${clientId}`;
        const ultimo = stampedRef.current.get(clave) || 0;
        if (Date.now() - ultimo > 5 * 60 * 1000) {
          stampedRef.current.set(clave, Date.now());
          stampNow(clientId, kind);
        }
      }
    },
    [queue, upsertClientRow, isCoachRef, stampedRef, stampNow]
  );

  /**
   * Guarda UN campo de UNA serie, por su propia clave de cola.
   *
   * Es el camino del cliente. Ver `log_session_set` en la migración 0014 y el
   * comentario largo en `logSessionSet`: el cliente no tiene UPDATE sobre
   * `workout_data` porque ese permiso, sobre una fila que contiene el programa
   * completo en un jsonb, le habría permitido reescribirlo entero.
   *
   * La clave incluye el campo para que kg, reps y RIR de la misma serie no se
   * sustituyan entre sí en la cola —que solo retiene el último payload por clave—.
   */
  const persistSet = useCallback(
    (key, clientId, args) => {
      queue.enqueue(
        key,
        args,
        (data) =>
          supabase.rpc('log_session_set', {
            p_client: clientId,
            p_week: data.weekNumber,
            p_session_id: data.sessionId,
            p_date: data.date,
            p_day_name: data.dayName,
            p_exercise_id: data.exercise.id,
            p_set_index: data.setIndex,
            p_field: data.field,
            p_value: String(data.value ?? ''),
          }),
        { immediate: false }
      );
    },
    [queue]
  );

  /**
   * Reenvía lo que quedó sin confirmar la última vez.
   *
   * ── Por qué se reconstruye el envío y no se guarda ─────────────────────────
   * Lo que se apunta en el navegador es el PAYLOAD, nunca la función que lo
   * manda: una función no se puede serializar, y guardar la petición ya montada
   * la congelaría con la sesión de entonces. Al volver, el payload se vuelve a
   * meter por el mismo camino de siempre, con la sesión de ahora.
   *
   * La clave dice a dónde iba. `domain:clientId` para lo que se guarda entero, y
   * `set:clientId:…` para una serie suelta —el camino del cliente en el gimnasio,
   * que es justo el caso que esto viene a salvar—. Una clave que no encaje en
   * ninguno de los dos se ignora: reenviar algo a un destino adivinado es peor
   * que perderlo.
   */
  const recuperadoRef = useRef(false);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      // Al cerrar sesión se suelta el almacén: lo que escriba el siguiente no
      // puede acabar bajo la clave del anterior.
      storeRef.current = null;
      recuperadoRef.current = false;
      return;
    }
    if (recuperadoRef.current) return;

    recuperadoRef.current = true;
    storeRef.current = pendingStore(userId);

    for (const { key, payload } of storeRef.current.list()) {
      const partes = key.split(':');
      if (partes[0] === 'set' && partes[1]) {
        persistSet(key, partes[1], payload);
      } else if (DOMINIOS.includes(partes[0]) && partes[1]) {
        persist(partes[0], partes[1], payload, { immediate: true });
      }
    }
  }, [session, persist, persistSet]);

  // ── Carga inicial ────────────────────────────────────────────────────────

  /** Descarta respuestas de una carga anterior si el usuario cambia rápido. */
  const loadTokenRef = useRef(0);

  /* Las fotos de progreso: estado espejado y acciones en su gancho
     (`useProgressPhotos.js`). `loadForUser` siembra las filas —sin firmar— con
     el setter que devuelve. */
  const {
    progressPhotos,
    setProgressPhotos,
    ensurePhotoUrls,
    uploadProgressPhoto,
    deleteProgressPhoto,
    updateProgressPhoto,
    refreshPhotoUrls,
  } = useProgressPhotos({ clientsRef, isCoachRef });

  const loadForUser = useCallback(
    async (user) => {
      const token = ++loadTokenRef.current;
      const isStale = () => token !== loadTokenRef.current;

      setLoadError(null);

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (isStale()) return;
      if (profileErr) {
        setLoadError('No se pudo cargar tu perfil. Comprueba tu conexión y vuelve a intentarlo.');
        return;
      }

      const role = profile?.role === 'client' ? 'client' : 'coach';
      setProfileRole(role);
      setViewMode(role === 'coach' ? 'coach' : 'client');

      /*
        El equipo, si existe.
        --------------------------------------------------------------------
        Mientras la migración 0006 no esté aplicada estas tablas no existen y la
        consulta falla con «Could not find the table». Eso NO es un error para el
        usuario: significa "todavía no hay equipos", y la aplicación sigue
        funcionando como siempre —un entrenador con sus clientes—. Por eso se
        traga el fallo aquí en lugar de propagarlo a `loadError`.
      */
      let team = null;
      let members = [];

      if (role === 'coach') {
        let membership = await supabase.from('team_members').select('team_id, role');

        /*
          Un entrenador que se registró DESPUÉS de la 0006 no tiene equipo: aquella
          migración rellenó los que ya existían y nada crea los nuevos. Daba igual
          mientras el equipo solo servía para repartir clientes; con la suscripción
          colgando de él (0019), quedarse sin equipo es quedarse sin plan.

          `ensure_my_team` es idempotente y devuelve el que haya. Si la 0019 no está
          aplicada, falla y todo sigue como antes.
        */
        if (!isStale() && !membership.error && (membership.data || []).length === 0) {
          const created = await supabase.rpc('ensure_my_team');
          /*
            Si falla, la aplicación sigue —un entrenador sin equipo funciona— pero
            el fallo se APUNTA. Es lo que faltaba cuando `ensure_my_team` chocaba
            consigo misma (arreglado en la 0037): quedarse sin equipo aquí no
            dejaba rastro, y el ticket llegaba con el error del alta, que es dos
            pasos más abajo y no menciona el equipo por ninguna parte.
          */
          if (created.error) recordIssue('equipo', created.error);
          if (!isStale() && !created.error && created.data) {
            membership = await supabase.from('team_members').select('team_id, role');
          }
        }

        if (!isStale() && !membership.error && (membership.data || []).length > 0) {
          const teamId = membership.data[0].team_id;
          const [teamRes, memberRes] = await Promise.all([
            supabase.from('teams').select('*').eq('id', teamId).single(),
            supabase
              .from('team_members')
              .select('profile_id, role, profiles(full_name, email)')
              .eq('team_id', teamId),
          ]);

          if (!teamRes.error) {
            team = {
              id: teamRes.data.id,
              name: teamRes.data.name,
              ownerId: teamRes.data.owner_id,
              myRole: membership.data[0].role,
            };
          }
          members = (memberRes.data || []).map((row) => ({
            profileId: row.profile_id,
            role: row.role,
            name: row.profiles?.full_name || '',
            email: row.profiles?.email || '',
          }));
        }
      }

      if (isStale()) return;
      setTeam(team);
      setTeamMembers(members);

      /*
        El plan. Mismo criterio que el equipo: si la 0019 no está aplicada la
        función no existe, y eso no es un error del usuario sino «todavía no hay
        planes». Queda en `null` y la pantalla de Plan lo dice.
      */
      if (role === 'coach' && team) {
        const planRes = await supabase.rpc('my_team_plan');
        if (!isStale() && !planRes.error) setPlan(mapPlanFromDb(planRes.data?.[0]));
      }

      /*
        Sin `.eq('coach_id', …)`: el filtro lo aplica RLS.
        --------------------------------------------------------------------
        Con equipos, quién ve a quién depende del rol —un entrenador ve solo los
        suyos, el dueño todos—, y reproducir esa regla en JavaScript sería
        duplicar la autorización en el único sitio donde no se puede confiar en
        ella. Sin equipos el resultado es idéntico, porque la política actual ya
        es `coach_id = auth.uid()`.
      */
      const clientsQuery =
        role === 'coach'
          ? supabase.from('clients').select('*').order('created_at')
          : supabase.from('clients').select('*').eq('client_profile_id', user.id);

      const { data: clientRows, error: clientsErr } = await clientsQuery;
      if (isStale()) return;
      if (clientsErr) {
        setLoadError(`No se pudieron cargar los clientes: ${clientsErr.message}`);
        return;
      }

      const mappedClients = (clientRows || []).map(mapClientFromDb);
      setClients(mappedClients);
      setSelectedClientId((prev) =>
        mappedClients.some((c) => c.id === prev) ? prev : mappedClients[0]?.id || ''
      );

      /*
        Las bibliotecas solo las gestiona el coach (autocompletado al programar).

        ── Sin filtro cuando hay equipo ──────────────────────────────────────
        La 0006 pasó `exercises` y `foods` a ser del EQUIPO —su política ya es
        `team_id IN (my_team_ids())`— y dejó la carga filtrando por `coach_id`,
        que era lo que había antes. Con eso, un entrenador contratado no veía ni
        un ejercicio: la biblioteca es del equipo pero él preguntaba por la suya,
        que está vacía. Y desde la 0022 hay una biblioteca de partida que le
        pasaría exactamente lo mismo.

        Con equipo se deja decidir a RLS, igual que con los clientes. Sin equipo
        se sigue filtrando por `coach_id`, porque entonces la columna `team_id` no
        existe y la política antigua es la que manda.
      */
      if (role === 'coach') {
        const library = (table) => {
          const query = supabase.from(table).select('*').order('name');
          return team ? query : query.eq('coach_id', user.id);
        };

        const [exRes, foodRes] = await Promise.all([library('exercises'), library('foods')]);
        if (isStale()) return;
        if (exRes.error) console.error('exercises:', exRes.error.message);
        if (foodRes.error) console.error('foods:', foodRes.error.message);
        setExerciseLibrary((exRes.data || []).map(mapLibraryExerciseFromDb));
        setFoodLibrary((foodRes.data || []).map(mapLibraryFoodFromDb));
      } else {
        setExerciseLibrary([]);
        setFoodLibrary([]);
      }

      const ids = mappedClients.map((c) => c.id);
      if (ids.length === 0) {
        setWorkoutData({});
        setAnthropometry({});
        setNutrition({});
        setProgressPhotos([]);
        setCheckIns({});
        return;
      }

      /*
        ── El resumen, y por qué puede no usarse ─────────────────────────────
        `training_summaries` (migración 0024) devuelve por cliente lo que la
        cartera y «Hoy» necesitan, en kilobytes en vez de megas. Con él, el
        programa completo solo se descarga del cliente que se abre.

        Dos motivos para NO usarlo, y los dos acaban en la carga de siempre:

          · la migración no está aplicada — la función no existe;
          · algún cliente conserva registros del formato antiguo (`has_legacy`).
            Esos kilos viven dentro del plan y el resumen no los ve, así que
            usarlo diría «40 días sin entrenar» de alguien que entrenó ayer.
            Cargar de más es un problema de velocidad; enseñar una alerta falsa
            es un problema de confianza.

        Es un todo o nada por entrenador: media cartera resumida y media completa
        sería la peor versión de las dos.
      */
      let resumenes = null;
      if (role === 'coach') {
        const res = await supabase.rpc('training_summaries');
        if (!isStale() && !res.error && Array.isArray(res.data)) {
          const conHeredados = res.data.some((row) => row.has_legacy);
          if (!conHeredados) resumenes = res.data.map(mapTrainingSummaryFromDb);
          else setLegacyPending(true);
        }
      }

      const [wd, anthro, nutri, photos] = await Promise.all([
        // Con resumen no se piden los programas: es la descarga que sobra.
        resumenes
          ? Promise.resolve({ data: [], error: null })
          : supabase.from('workout_data').select('*').in('client_id', ids),
        supabase.from('anthropometry').select('*').in('client_id', ids),
        supabase.from('nutrition_plans').select('*').in('client_id', ids),
        // `progress_photos` no tiene columna `date`; la fecha es `created_at`.
        supabase
          .from('progress_photos')
          .select('*')
          .in('client_id', ids)
          .order('created_at', { ascending: false }),
      ]);

      if (isStale()) return;

      const failed = [wd, anthro, nutri, photos].filter((r) => r.error);
      if (failed.length > 0) {
        setLoadError(`Algunos datos no se pudieron cargar: ${failed[0].error.message}`);
      }

      /*
        La versión de cada bloque, tal y como la acabamos de leer. Es contra esto
        contra lo que se compara al escribir (ver `upsertClientRow`): sin
        registrarla aquí, la primera escritura de la sesión iría sin guardia y
        volvería a poder pisar el trabajo de otro.
      */
      versionsRef.current = { workout_data: {}, anthropometry: {}, nutrition_plans: {} };
      for (const [table, res] of [
        ['workout_data', wd],
        ['anthropometry', anthro],
        ['nutrition_plans', nutri],
      ]) {
        for (const row of res.data || []) {
          versionsRef.current[table][row.client_id] = row.updated_at;
        }
      }

      setWorkoutData(
        Object.fromEntries((wd.data || []).map((r) => [r.client_id, mapWorkoutFromDb(r)]))
      );
      setServerSummaries(
        resumenes ? Object.fromEntries(resumenes.map((r) => [r.clientId, r])) : {}
      );
      setAnthropometry(
        Object.fromEntries((anthro.data || []).map((r) => [r.client_id, mapAnthroFromDb(r)]))
      );
      setNutrition(
        Object.fromEntries((nutri.data || []).map((r) => [r.client_id, mapNutritionFromDb(r)]))
      );

      /*
        Check-ins: el ÚLTIMO de cada cliente.
        --------------------------------------------------------------------
        Solo hace falta el más reciente para saber si hay algo por revisar hoy;
        traer el histórico completo de veinte clientes serían cientos de filas que
        nadie mira. Como con los equipos, si la tabla no existe (migración 0009 sin
        aplicar) se ignora el error: significa «todavía no hay check-ins cerrados»
        y el tablero deduce el estado de los datos que ya hay.
      */
      const checkInRes = await supabase
        .from('check_ins')
        .select('*')
        .in('client_id', ids)
        .order('week_start', { ascending: false });

      if (isStale()) return;
      /*
        «No existe la tabla» significa función sin activar; cualquier otro error
        —red, permisos— no autoriza a decir eso: se deja el dato como esté. El
        patrón del texto es el mismo que usa `loadAuditLog` con la 0017.
      */
      if (checkInRes.error) {
        if (/does not exist|schema cache/i.test(checkInRes.error.message)) setCheckInsActivos(false);
      } else {
        setCheckInsActivos(true);
      }
      setCheckIns(
        checkInRes.error
          ? {}
          : Object.fromEntries(
              (checkInRes.data || [])
                .map(mapCheckInFromDb)
                // El primero de cada cliente es el más reciente: el orden ya viene
                // dado, así que la primera entrada gana.
                .reduce((acc, row) => (acc.has(row.clientId) ? acc : acc.set(row.clientId, row)), new Map())
            )
      );

      /*
        ── Las fotos se cargan SIN firmar ────────────────────────────────────
        Antes se firmaba aquí la URL de TODAS las fotos de TODOS los clientes. Con
        veinte clientes y sesenta fotos cada uno son mil doscientos enlaces
        temporales generados en el arranque, de los que se usan los de un cliente
        —si es que se abre alguna foto—. Y caducan a las 8 horas, así que buena
        parte se firmaba para nada.

        La cartera y «Hoy» solo necesitan las FECHAS de las fotos, que vienen en la
        fila. El enlace hace falta cuando se va a mirar una imagen, y entonces lo
        pide la pantalla que la mira (`ensurePhotoUrls`).
      */
      const nameOf = (clientId) => mappedClients.find((c) => c.id === clientId)?.name;
      if (isStale()) return;
      setProgressPhotos((photos.data || []).map((r) => mapPhotoFromDb(r, nameOf(r.client_id))));
    },
    [
      setAnthropometry,
      setCheckIns,
      setCheckInsActivos,
      setClients,
      setNutrition,
      setPlan,
      setProgressPhotos,
      setTeam,
      setTeamMembers,
      setWorkoutData,
    ]
  );

  const clearAll = useCallback(() => {
    queue.reset();
    setSaveState({});
    setClients([]);
    setExerciseLibrary([]);
    setFoodLibrary([]);
    setWorkoutData({});
    setAnthropometry({});
    setNutrition({});
    setProgressPhotos([]);
    setSelectedClientId('');
    setTeam(null);
    setTeamMembers([]);
    setCheckIns({});
  }, [queue, setAnthropometry, setCheckIns, setClients, setNutrition, setProgressPhotos, setTeam, setTeamMembers, setWorkoutData]);

  /**
   * Quién está cargado ahora mismo. Es la guardia de la recarga completa.
   *
   * ══ Por qué no basta con filtrar por nombre de evento ══════════════════════
   *
   * Aquí había `if (event === 'TOKEN_REFRESHED') return;`, puesto porque recargar
   * en ese evento «pisaba el estado local y el trabajo reciente parecía borrarse
   * solo». El diagnóstico era correcto y la guardia se quedó corta: **`auth-js`
   * emite `SIGNED_IN` cada vez que la pestaña vuelve a estar visible**. Su
   * manejador de `visibilitychange` llama a `_recoverAndRefresh()`, y esa función
   * termina en `_notifyAllSubscribers('SIGNED_IN', session)` siempre que la sesión
   * guardada siga siendo válida. No es una sesión nueva: es la misma, recuperada.
   *
   * Así que salir un momento a otra pestaña y volver disparaba `loadForUser`
   * entero. Y con la carga perezosa (0024) eso **vacía `workoutData`**: la consulta
   * de programas no se hace cuando hay resumen, así que el mapa se reescribe con
   * `{}` y el cliente abierto se queda sin programa en memoria. La pantalla de
   * rutina —que no distingue «no cargado» de «no tiene»— pasaba a decir «este
   * cliente no tiene programa todavía» y a ofrecer «crear el primer microciclo»,
   * que al pulsarlo escribía un programa vacío ENCIMA del bueno. De ahí que el
   * microciclo desapareciera «a pesar de aparecer como guardado» y no volviera ni
   * recargando: para entonces ya no estaba en el servidor.
   *
   * La guardia ahora es por IDENTIDAD y no por evento: se recarga cuando cambia
   * QUIÉN está dentro. Eso cubre `TOKEN_REFRESHED`, `SIGNED_IN` al volver a la
   * pestaña, `USER_UPDATED` y lo que auth-js añada mañana —una lista de nombres de
   * evento vuelve a quedarse corta cada vez que la librería crece—. Y de paso
   * evita la doble carga del arranque, donde `getSession()` e `INITIAL_SESSION`
   * llegaban a la vez.
   *
   * Refrescar datos a propósito sigue teniendo su camino: `refreshClients`.
   */
  const loadedUserRef = useRef(null);
  /* La promesa de la carga en marcha. Existe para que el camino de arranque que
     NO la lanzó pueda esperarla en vez de saltársela (ver `loadOnce`). */
  const cargaEnVueloRef = useRef(null);

  useEffect(() => {
    let active = true;

    /** Carga la cartera entera, y solo si de verdad ha cambiado el usuario. */
    const loadOnce = async (user) => {
      if (!user) {
        loadedUserRef.current = null;
        clearAll();
        return;
      }
      if (loadedUserRef.current === user.id) {
        /*
          La carga de este usuario ya está en marcha por el otro camino de
          arranque (`getSession()` e `INITIAL_SESSION` llegan a la vez). Se
          ESPERA, no se salta: quien llama sostiene `loading`, y soltarlo antes
          de que la cartera llegue expulsaba los enlaces profundos — quien abría
          `/c/<id>/rutina` desde un marcador aterrizaba en «Clientes», porque
          CoachLayout veía `loading` apagado con cero clientes y no puede
          distinguir «no cargó todavía» de «ese cliente no existe».

          El error, si lo hay, ya lo registró y anunció quien lanzó la carga.
        */
        try {
          await cargaEnVueloRef.current;
        } catch {
          /* ya contado por el camino que la lanzó */
        }
        return;
      }
      // Se marca ANTES de esperar: los dos caminos de arranque corren en el mismo
      // hilo y, sin esto, ambos verían el ref vacío y cargarían por duplicado.
      loadedUserRef.current = user.id;
      try {
        cargaEnVueloRef.current = loadForUser(user);
        await cargaEnVueloRef.current;
      } catch (e) {
        // Una carga que revienta no puede dejar la marca puesta: sin esto, la
        // aplicación se quedaría vacía hasta cerrar sesión, porque ya nadie
        // volvería a intentarlo.
        loadedUserRef.current = null;
        recordIssue('carga', e);
        setLoadError(e?.message || 'No se han podido cargar tus datos.');
      }
    };

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session?.user) await loadOnce(data.session.user);
      })
      .catch((e) => active && setLoadError(e?.message || 'Error al iniciar sesión.'))
      .finally(() => active && setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (!active) return;
      setSession(next);
      await loadOnce(next?.user || null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForUser, clearAll]);

  const signOut = useCallback(async () => {
    queue.flushAll();
    flushEvents();
    forgetActor();
    await supabase.auth.signOut();
  }, [queue]);

  /*
    A quién se le apunta el uso (migración 0045).

    Va en un efecto y no dentro de `loadForUser` porque depende de tres cosas que
    se resuelven en momentos distintos —la sesión, el rol y el equipo— y aquí se
    reacciona a las tres a la vez sin ensuciar la carga.

    `identify` decide por su cuenta que solo se instrumenta al ENTRENADOR: el
    cliente final es el sujeto de los datos de salud que esto guarda, y no va a
    ser además el sujeto de la medición.
  */
  useEffect(() => {
    identify({ userId: session?.user?.id, team: team?.id, role: profileRole });
  }, [session?.user?.id, team?.id, profileRole]);

  // ── Cliente activo ───────────────────────────────────────────────────────

  /*
    ── Dos listas, y por qué ─────────────────────────────────────────────────
    `clients` es el estado completo y así se queda: todas las mutaciones y el
    espejo (`clientsRef`) trabajan sobre él, y filtrarlo ahí dentro haría que
    actualizar a un archivado lo borrase de la lista.

    Lo que cambia es lo que se EXPONE. Casi todo el producto —la cartera, «Hoy»,
    la paleta, el selector— habla de la cartera viva, así que `clients` sale ya
    filtrado y ninguna de esas pantallas necesita saber que existe el archivo. Lo
    completo se expone aparte, para las tres cosas que sí lo necesitan: la lista
    de clientes, la copia de seguridad y resolver la ficha que pide la URL.
  */
  /**
   * El resumen de entrenamiento de cada cliente, venga de donde venga.
   *
   * ── Por qué el programa cargado MANDA sobre el resumen del servidor ─────────
   * Porque es más reciente. El resumen se calculó al arrancar; el programa que hay
   * en memoria incluye la serie que el entrenador acaba de anotar hace diez
   * segundos. Si el resumen ganara, «Hoy» no enseñaría el entreno que se está
   * registrando en la pestaña de al lado.
   *
   * Y por eso mismo la mezcla es por cliente y no una elección global: del que
   * está abierto se tiene el programa entero, del resto el resumen, y la cartera
   * los trata igual sin saber cuál es cuál.
   */
  const training = useMemo(() => {
    const out = { ...serverSummaries };
    for (const [clientId, program] of Object.entries(workoutData)) {
      out[clientId] = trainingSummary(program);
    }
    return out;
  }, [serverSummaries, workoutData]);

  const visibleClients = useMemo(() => clients.filter((c) => !isArchived(c)), [clients]);
  const archivedClients = useMemo(() => clients.filter(isArchived), [clients]);

  /*
    Se busca en la lista COMPLETA: `/c/<id>/resumen` de alguien archivado tiene que
    seguir abriéndose —para consultar su historial o para recuperarlo—, y si se
    resolviera contra la filtrada, el enlace caería en el primer cliente de la
    lista y estarías mirando la ficha de otra persona sin enterarte.

    El respaldo, en cambio, sale de la viva: al entrar sin haber elegido a nadie,
    lo razonable es el primero de la cartera, no uno que ya terminó.
  */
  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || visibleClients[0] || null,
    [clients, visibleClients, selectedClientId]
  );

  // ── Preferencias del entrenador ──────────────────────────────────────────

  /* En su gancho (`useCoachPrefs.js`). `applyDashboardToAll` no está allí: es
     una escritura masiva de la cartera y vive con `reloadClients`. */
  const { coachPrefs, coachPrefsReady, updateCoachPreferences } = useCoachPrefs({ session });

  // ── Soporte ──────────────────────────────────────────────────────────────

  /* Segundo dominio extraído: estado (`isSupport`), bandeja y acciones de
     tickets viven en su gancho. `uploadIntakeFile` y `signPaths` se quedan
     aquí porque no son de soporte (ver `useSupport.js`). */
  const { isSupport, loadTickets, createTicket, replyTicket, setTicketStatus } = useSupport({
    session,
    team,
  });

  // ── Archivos de los pasos del alta ───────────────────────────────────────
  //
  // Van al MISMO bucket y con el mismo esquema de rutas que las fotos y las
  // revisiones (`<clientId>/…`), así que las políticas de la 0007 ya los cubren:
  // el entrenador dueño sube y lee, el propio cliente lee. Ni una política nueva.
  //
  // La RUTA es lo que se guarda en `preferences.intake.files`, nunca la URL: el
  // bucket es privado y lo que se firma caduca. Guardar una URL firmada sería
  // guardar algo que deja de abrir a las ocho horas.

  const uploadIntakeFile = useCallback(async ({ clientId, stepId, file }) => {
    const invalido = validateAttachment(file);
    if (invalido) return { ok: false, error: invalido };

    const path = buildIntakePath({ clientId, stepId, fileName: file.name });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (error) {
      // Los archivos del alta cuelgan del cliente, así que la cuota (0067)
      // también los cuenta y también puede cortarlos.
      const capado = traduceStorageError(error, { cliente: !isCoachRef.current });
      return { ok: false, error: capado || `No se pudo subir el archivo: ${error.message}` };
    }
    return { ok: true, path };
  }, []);

  /**
   * Firma una lista de rutas del bucket. Devuelve un `Map` ruta → URL.
   *
   * Existe porque ya son cuatro los sitios que necesitan lo mismo —fotos,
   * revisiones, adjuntos de soporte y ahora los archivos del alta— y cada uno se
   * lo estaba montando con su propia llamada. Lo que no se firma no aparece en el
   * mapa, así que quien llame puede distinguir «no hay archivo» de «hay archivo y
   * no puedo abrirlo», que son dos mensajes distintos para el usuario.
   */
  const signPaths = useCallback(async (paths, ttl = SIGNED_URL_TTL_SECONDS) => {
    const limpias = [...new Set((paths || []).filter(Boolean))];
    if (limpias.length === 0) return new Map();

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(limpias, ttl);
    if (error) return new Map();

    return new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }, []);

  // ── Catálogo común ───────────────────────────────────────────────────────

  /*
    Una sola carga por sesión, en cuanto hay usuario. No se recarga al cambiar de
    cliente ni al volver a la pestaña: son datos de referencia que solo cambian
    cuando se despliega una migración, y volver a pedirlos sería tráfico por nada.
  */
  const catalogUserId = session?.user?.id || null;

  useEffect(() => {
    if (!catalogUserId) {
      setCatalogFoods([]);
      setCatalogExercises([]);
      return undefined;
    }

    let cancelado = false;

    (async () => {
      const [foods, exercises] = await Promise.all([
        supabase.from('catalog_foods').select('*').order('name'),
        supabase.from('catalog_exercises').select('*').order('name'),
      ]);

      if (cancelado) return;
      // Sin la 0033 las tablas no existen. Se traga: el catálogo es una ayuda,
      // no un requisito, y un `loadError` aquí tumbaría la aplicación entera por
      // una función opcional.
      setCatalogFoods(foods.error ? [] : (foods.data || []).map(mapCatalogFoodFromDb));
      setCatalogExercises(
        exercises.error ? [] : (exercises.data || []).map(mapLibraryExerciseFromDb)
      );
    })();

    return () => {
      cancelado = true;
    };
  }, [catalogUserId]);

  // ── Roadmap ──────────────────────────────────────────────────────────────

  const activeClientId = activeClient?.id || null;

  /* El primer dominio extraído del proveedor: estado, carga y acciones viven
     en su gancho. La convención está escrita en `useRoadmap.js`. */
  const { phases, addPhase, updatePhase, removePhase } = useRoadmap({
    session,
    activeClientId,
  });

  // ── Mutaciones de rutina ─────────────────────────────────────────────────

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
   * Trae el programa completo de un cliente si todavía no está en memoria.
   *
   * ── Por qué hace falta y por qué es delicado ────────────────────────────────
   * Con el resumen (0024), al arrancar no se descarga el programa de nadie. Eso
   * está bien para pintar la cartera y mal para todo lo demás: en cuanto se abre
   * un cliente, o se copia el programa de otro, hacen falta los datos de verdad.
   *
   * Y no es solo que falten: `applyWorkout` cae en `emptyWorkoutData()` cuando no
   * encuentra al cliente, así que escribir sobre alguien sin cargar **sustituiría
   * su programa por uno vacío**. Por eso todo lo que escriba o lea el programa de
   * un cliente que no sea el abierto tiene que pasar por aquí primero.
   *
   * ── «Sin fila» también se recuerda ──────────────────────────────────────────
   * Antes, un cliente sin fila salía de aquí sin dejar entrada en el mapa, y eso
   * hacía que `undefined` significara dos cosas incompatibles: «todavía no lo he
   * pedido» y «lo pedí y no tiene nada». Nadie podía distinguirlas, y de las dos
   * solo una permite escribir sin riesgo.
   *
   * Ahora se guarda un programa vacío, así que la entrada existe siempre que se
   * haya mirado. `undefined` pasa a significar exactamente una cosa —«no
   * cargado»— y es lo que deja al efecto de abajo volver a intentarlo y a la
   * pantalla de rutina saber que aún no puede opinar.
   *
   * Un fallo de red NO se cachea: sin entrada, se reintenta.
   *
   * Devuelve el programa (vacío si ese cliente no tiene fila), o `null` si la
   * consulta falló.
   */
  /** Peticiones de programa en vuelo, por cliente. Ver el comentario de dentro. */
  const programLoadsRef = useRef(new Map());

  const ensureProgram = useCallback(
    async (clientId) => {
      if (!clientId) return null;
      if (workoutRef.current[clientId]) return workoutRef.current[clientId];

      /*
        Una petición por cliente, aunque la pidan dos a la vez.

        La piden dos: el efecto del cliente abierto y la propia pantalla de rutina,
        que ya no se fía de que alguien lo haya hecho por ella. Sin esto serían dos
        consultas idénticas en vuelo por cada apertura de ficha, y la segunda
        llegaría a `setWorkoutData` con lo mismo que la primera.
      */
      const enCurso = programLoadsRef.current.get(clientId);
      if (enCurso) return enCurso;

      const peticion = (async () => {
        const { data, error } = await supabase
          .from('workout_data')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();

        // Un fallo NO deja entrada en el mapa: es lo que permite reintentarlo.
        if (error) return null;

        // La versión leída, para que la primera escritura no vaya sin guardia.
        if (data) rememberVersion('workout_data', clientId, data.updated_at);

        const mapped = data ? mapWorkoutFromDb(data) : emptyWorkoutData();
        setWorkoutData({ ...workoutRef.current, [clientId]: mapped });
        return mapped;
      })()
        // No puede rechazar: quien espera esto lee `null` como «no se pudo».
        .catch(() => null)
        .finally(() => programLoadsRef.current.delete(clientId));

      programLoadsRef.current.set(clientId, peticion);
      return peticion;
    },
    [rememberVersion, setWorkoutData, workoutRef]
  );

  /**
   * Lo mismo para la DIETA: el plan de un cliente, traído si no está en memoria.
   *
   * ══ Por qué existe ══════════════════════════════════════════════════════════
   *
   * A diferencia del programa, la nutrición sí se pide entera en el arranque, así
   * que en la vida normal esto no hace ninguna consulta. Existe por el caso que
   * rompía la copia entre clientes: **el mapa de dietas puede quedarse vacío sin
   * que nada lo diga**. Si la consulta de `nutrition_plans` del arranque falla, se
   * apunta un aviso general y la aplicación sigue con `{}` — y a partir de ahí
   * `nutritionRef.current[quien]` es `undefined` para todo el mundo.
   *
   * Copiar de otro cliente leía ese mapa directamente, así que en esa situación la
   * dieta no se copiaba y no se decía por qué: el entrenamiento sí llegaba —ese
   * camino se relee solo con `ensureProgram`— y la dieta se quedaba en blanco.
   *
   * Devuelve el plan (vacío si ese cliente no tiene fila) o `null` si la consulta
   * falló, que es lo que permite distinguir «no tiene dieta» de «no se pudo leer».
   */
  const nutritionLoadsRef = useRef(new Map());

  const ensureNutrition = useCallback(
    async (clientId) => {
      if (!clientId) return null;
      if (nutritionRef.current[clientId]) return nutritionRef.current[clientId];

      const enCurso = nutritionLoadsRef.current.get(clientId);
      if (enCurso) return enCurso;

      const peticion = (async () => {
        const { data, error } = await supabase
          .from('nutrition_plans')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();

        if (error) return null;

        // La versión leída, para que la primera escritura no vaya sin guardia.
        if (data) rememberVersion('nutrition_plans', clientId, data.updated_at);

        const mapped = data ? mapNutritionFromDb(data) : emptyNutrition();
        /*
          Solo se guarda en memoria lo que EXISTE. Cachear un plan vacío haría
          que el cliente pasara a «tiene dieta» para todo lo que pregunta por el
          mapa —empezando por el aviso de «esto sustituye su dieta actual»— sin
          que nadie le haya configurado nada.
        */
        if (data) setNutrition({ ...nutritionRef.current, [clientId]: mapped });
        return mapped;
      })()
        // No puede rechazar: quien espera esto lee `null` como «no se pudo».
        .catch(() => null)
        .finally(() => nutritionLoadsRef.current.delete(clientId));

      nutritionLoadsRef.current.set(clientId, peticion);
      return peticion;
    },
    [nutritionRef, rememberVersion, setNutrition]
  );

  /*
    El programa del cliente que se está mirando.

    Es la otra mitad de la carga perezosa: el arranque trae el resumen de todos y
    esto trae el detalle del que se abre. Con la carga completa no hace nada —ya
    está en memoria—, así que el efecto vale para los dos modos sin condicionales.

    Va aquí, justo detrás de `ensureProgram`, y no arriba con el resto del estado
    derivado: las dependencias de un efecto se evalúan al RENDERIZAR, así que
    nombrar una función declarada más abajo revienta con «Cannot access before
    initialization» antes de que el efecto llegue a ejecutarse nunca.
  */
  /*
    La condición mira el MAPA, no solo el cliente elegido. Con `[selectedClientId]`
    a secas esto corría una vez por cliente y nunca más, así que cualquier cosa que
    dejara el programa fuera de memoria —una recarga completa a mitad de sesión, un
    fallo de red en el primer intento— abría un hueco del que no se salía sin
    cambiar de cliente. Y un hueco aquí no es una pantalla vacía: es la puerta por
    la que se escribe un programa vacío encima del bueno.

    Depender de `workoutData` no lo hace correr en cada tecleo: la guardia lo
    convierte en nada en cuanto la entrada existe.
  */
  useEffect(() => {
    if (selectedClientId && !workoutData[selectedClientId]) ensureProgram(selectedClientId);
  }, [selectedClientId, workoutData, ensureProgram]);

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
   * leen aquí: en el semanal son siete días y en el rotativo lo que sume su
   * patrón —un 3/1 dura cuatro—. Ver `nextCycleDate`.
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
      const days = (last?.days || []).map((d) => ({ dayName: d.dayName, exercises: [] }));

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

      applyWorkout(clientId, (cd) => ({ ...cd, microcycles: renumbered }));

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
    (clientId, microcycle) =>
      applyWorkout(clientId, (cd) => {
        const sorted = [...cd.microcycles].sort((a, b) => a.weekNumber - b.weekNumber);
        sorted.splice(Math.max(0, Math.min(microcycle.weekNumber - 1, sorted.length)), 0, microcycle);
        return {
          ...cd,
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
   * El cliente ya tiene UPDATE sobre `workout_data` para registrar sus series, y
   * como RLS filtra filas y no columnas, ese permiso alcanza al JSONB completo.
   * Esto no abre ninguna puerta nueva: usa la que ya estaba abierta por el diseño
   * de un único bloque `microcycles`.
   */
  const continueProgram = useCallback(
    (clientId) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      if (current.microcycles.length === 0) return null;

      const last = [...current.microcycles].sort((a, b) => b.weekNumber - a.weekNumber)[0];
      const newWeek = nextWeekNumber(current.microcycles);
      const days = blankDays(last.days || []);

      /*
        Igual que al registrar series: el estado local se actualiza en los dos
        casos, y lo que cambia es quién puede escribir el bloque.

        El cliente no puede —ni debe— reescribir `microcycles`, así que llama a
        `continue_program` (0014), que construye la semana EN EL SERVIDOR copiando
        la estructura de la última y vaciando los valores. La diferencia importa:
        lo que se le concede es «duplica la última semana en blanco», no «guárdame
        este programa».

        La semana local y la del servidor se construyen con la misma regla, así que
        coinciden salvo en los identificadores, que se recolocan en la próxima carga.
      */
      applyWorkout(
        clientId,
        (cd) => ({
          ...cd,
          microcycles: [...cd.microcycles, buildMicrocycle({ weekNumber: newWeek, days })],
        }),
        { skipPersist: profileRole === 'client' }
      );

      if (profileRole === 'client') {
        queue.enqueue(
          `continue:${clientId}:${newWeek}`,
          newWeek,
          () => supabase.rpc('continue_program', { p_client: clientId }),
          { immediate: true }
        );
      }
      return newWeek;
    },
    [applyWorkout, profileRole, queue, workoutRef]
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

  // ── Nutrición ────────────────────────────────────────────────────────────

  const applyNutrition = useCallback(
    (clientId, updater, { immediate = true } = {}) => {
      const current = nutritionRef.current[clientId] || emptyNutrition();
      const next = updater(current);
      if (next === current) return current;

      setNutrition({ ...nutritionRef.current, [clientId]: next });
      persist('nutrition', clientId, next, { immediate });
      return next;
    },
    [nutritionRef, persist, setNutrition]
  );

  /** Actualiza una lista de comidas de la variante indicada. */
  const applyMeals = useCallback(
    (clientId, variant, updater, options) =>
      applyNutrition(
        clientId,
        (n) => {
          const key = VARIANT_KEY[variant] || VARIANT_KEY.default;
          const meals = updater(n[key] || []);
          return meals === null ? n : { ...n, [key]: meals };
        },
        options
      ),
    [applyNutrition]
  );

  const updateNutrition = useCallback(
    (clientId, fields, options) =>
      applyNutrition(clientId, (n) => ({ ...n, ...fields }), options),
    [applyNutrition]
  );

  /**
   * Actualiza el objetivo de kcal y macros de UNA variante.
   *
   * Las columnas principales son el objetivo de los días de entreno (o el único
   * si no hay variantes); el de descanso vive en `restTargets`. Sin esta
   * separación, activar "dos dietas" mostraba la misma cifra en los dos días,
   * que es precisamente lo que la opción quiere distinguir.
   */
  const updateNutritionTargets = useCallback(
    (clientId, variant, fields, options) =>
      applyNutrition(
        clientId,
        (n) =>
          variant === 'rest' && n.hasDayVariants
            ? { ...n, restTargets: { ...(n.restTargets || {}), ...fields } }
            : { ...n, ...fields },
        options
      ),
    [applyNutrition]
  );

  const setHasDayVariants = useCallback(
    (clientId, value) =>
      applyNutrition(clientId, (n) => {
        if (!value || n.hasDayVariants) return { ...n, hasDayVariants: value };
        // Al activar por primera vez se parte de una copia de la dieta única,
        // tanto en comidas como en OBJETIVO, para no dejar el día de descanso
        // con cifras vacías ni perder lo ya configurado.
        return {
          ...n,
          hasDayVariants: true,
          restTargets: n.restTargets || {
            targetKcals: n.targetKcals,
            proteinGrams: n.proteinGrams,
            carbsGrams: n.carbsGrams,
            fatsGrams: n.fatsGrams,
          },
          closedMealsTraining: n.closedMealsTraining?.length
            ? n.closedMealsTraining
            : deepClone(n.closedMeals || []),
          closedMealsRest: n.closedMealsRest?.length
            ? n.closedMealsRest
            : deepClone(n.closedMeals || []),
        };
      }),
    [applyNutrition]
  );

  /**
   * Trae el menú de una variante a la otra, dentro del mismo cliente.
   *
   * ── El hueco que cierra ─────────────────────────────────────────────────────
   * Al ACTIVAR las dos dietas, `setHasDayVariants` copia la única a ambas, así que
   * se empieza con lo mismo en las dos. Pero a partir de ahí divergen y no había
   * ningún camino de vuelta: el entrenador monta seis comidas en el día de
   * entreno, va al de descanso y se lo encuentra como lo dejó hace tres semanas.
   * Rehacerlo a mano es media hora por cliente.
   *
   * Y es el caso NORMAL, no el raro: un día de descanso casi nunca es una dieta
   * distinta, es la misma con menos hidratos. Partir de una copia y quitar es el
   * flujo de trabajo real.
   *
   * ── Qué NO copia, y por qué ─────────────────────────────────────────────────
   * El objetivo de kcal y macros. Es justo lo que distingue a las dos variantes
   * —si fueran iguales no habría dos— y arrastrarlo borraría la única cifra que
   * el entrenador ajustó a mano al separarlas.
   *
   * Los identificadores se regeneran (ver `cloneMeals`). Hoy no haría falta,
   * porque cada variante es un array aparte y las acciones van dirigidas a uno;
   * se hace igualmente para que compartir `id` entre listas nunca llegue a ser
   * una suposición sobre la que alguien construya.
   */
  const copyVariantMeals = useCallback(
    (clientId, from, to) => {
      if (from === to) return false;
      const source = nutritionRef.current[clientId]?.[VARIANT_KEY[from]] || [];
      if (source.length === 0) return false;

      applyMeals(clientId, to, () => cloneMeals(source));
      return true;
    },
    [applyMeals, nutritionRef]
  );

  /**
   * Llevar UNA comida a la otra variante.
   *
   * `copyVariantMeals` copia el día entero y sustituye lo que hubiera. Eso vale
   * para montar el día de descanso desde cero, pero no para lo que se hace
   * después: el día de descanso ya está hecho y solo quieres llevarte la cena que
   * acabas de ajustar en el de entreno. Con la única herramienta que había, la
   * opción era rehacerla a mano o tirar el día entero y volver a empezar.
   *
   * Se AÑADE al final y no sustituye nada: copiar no debería poder borrar. Si
   * acaba habiendo dos «Cena», se ve al momento y se borra una — que es un error
   * reversible, al revés que perder la que estaba.
   */
  const copyMealToVariant = useCallback(
    (clientId, from, to, mealIdx) => {
      if (from === to) return null;
      const source = nutritionRef.current[clientId]?.[VARIANT_KEY[from]]?.[mealIdx];
      if (!source) return null;

      applyMeals(clientId, to, (meals) => [...meals, cloneMeal(source, { rename: false })]);
      return source.name || 'Comida';
    },
    [applyMeals, nutritionRef]
  );

  /**
   * Llevar UNA opción a la comida que se llama igual en la otra variante.
   *
   * ── Por qué no pregunta a dónde ─────────────────────────────────────────────
   * Porque la respuesta es siempre la misma: la alternativa de pasta del almuerzo
   * de entreno va al almuerzo de descanso. Un selector de destino sería un paso
   * más para elegir lo único que se iba a elegir, y el nombre de la comida ya
   * dice a dónde va.
   *
   * Si esa comida no existe allí, se crea con ese nombre. La alternativa —negarse
   * a copiar— obligaría a ir a la otra variante, crear la comida vacía, volver y
   * repetir la operación.
   */
  const copyOptionToVariant = useCallback(
    (clientId, from, to, mealIdx, optIdx) => {
      if (from === to) return null;
      const source = nutritionRef.current[clientId]?.[VARIANT_KEY[from]]?.[mealIdx];
      const option = source?.options?.[optIdx];
      if (!option) return null;

      const nombre = source.name || 'Comida';
      applyMeals(clientId, to, (meals) => {
        const destino = meals.findIndex((m) => (m.name || '') === nombre);
        if (destino < 0) {
          return [...meals, { ...buildMeal(), name: nombre, options: [cloneOption(option)] }];
        }
        return meals.map((m, i) =>
          i === destino ? { ...m, options: [...(m.options || []), cloneOption(option)] } : m
        );
      });
      return nombre;
    },
    [applyMeals, nutritionRef]
  );

  const addMeal = useCallback(
    (clientId, variant) => applyMeals(clientId, variant, (meals) => [...meals, buildMeal()]),
    [applyMeals]
  );

  const removeMeal = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) => meals.filter((_, i) => i !== mealIdx)),
    [applyMeals]
  );

  /** El inverso de `removeMeal`, para el «Deshacer» del aviso (ver
      `restoreExercise`: misma regla, mismo motivo). */
  const restoreMeal = useCallback(
    (clientId, variant, mealIdx, meal) =>
      applyMeals(clientId, variant, (meals) => {
        const next = [...meals];
        next.splice(Math.max(0, Math.min(mealIdx, next.length)), 0, meal);
        return next;
      }),
    [applyMeals]
  );

  const updateMealName = useCallback(
    (clientId, variant, mealIdx, name) =>
      applyMeals(
        clientId,
        variant,
        (meals) => meals.map((m, i) => (i === mealIdx ? { ...m, name } : m)),
        { immediate: false }
      ),
    [applyMeals]
  );

  /** La pauta escrita de una comida: «que sea 2 h antes de dormir», «marca X». */
  const updateMealNote = useCallback(
    (clientId, variant, mealIdx, note) =>
      applyMeals(
        clientId,
        variant,
        (meals) => meals.map((m, i) => (i === mealIdx ? { ...m, note } : m)),
        { immediate: false }
      ),
    [applyMeals]
  );

  /**
   * El objetivo de una comida, campo a campo.
   *
   * Un objetivo que se queda entero a cero se guarda como `null` y no como cuatro
   * ceros: `mealTarget` distingue «no le he puesto objetivo» de «le he puesto
   * cero kcal», y sin esto borrar los cuatro campos dejaría la comida marcada
   * como si tuviera un objetivo imposible de cumplir.
   */
  const updateMealTarget = useCallback(
    (clientId, variant, mealIdx, field, value) =>
      applyMeals(
        clientId,
        variant,
        (meals) =>
          meals.map((m, i) => {
            if (i !== mealIdx) return m;
            const target = { ...(m.target || {}), [field]: value };
            const vacio = Object.values(target).every((v) => v === '' || v === null || Number(v) === 0);
            return { ...m, target: vacio ? null : target };
          }),
        { immediate: false }
      ),
    [applyMeals]
  );

  const addMealOption = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) => (i === mealIdx ? { ...m, options: [...m.options, buildOption()] } : m))
      ),
    [applyMeals]
  );

  const removeMealOption = useCallback(
    (clientId, variant, mealIdx, optIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx || m.options.length <= 1
            ? m
            : { ...m, options: m.options.filter((_, o) => o !== optIdx) }
        )
      ),
    [applyMeals]
  );

  // ── Orden y duplicados en la dieta ───────────────────────────────────────
  //
  // Montar una dieta es sobre todo REORGANIZAR: la comida que va antes, la
  // alternativa que es casi igual que la anterior con un cambio. Sin esto, la
  // única forma de cambiar el orden de dos comidas era borrar una y volver a
  // escribirla entera con sus alimentos.

  const moveMeal = useCallback(
    (clientId, variant, fromIndex, toIndex) =>
      applyMeals(clientId, variant, (meals) => moveItem(meals, fromIndex, toIndex)),
    [applyMeals]
  );

  const moveFood = useCallback(
    (clientId, variant, mealIdx, optIdx, fromIndex, toIndex) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx ? o : { ...o, foods: moveItem(o.foods || [], fromIndex, toIndex) }
                ),
              }
        )
      ),
    [applyMeals]
  );

  /**
   * Duplica una alternativa dentro de su comida.
   *
   * Es el atajo que faltaba y el que más se usa: la segunda opción de una comida
   * casi nunca se monta desde cero, sino que es la primera con el arroz cambiado
   * por pasta. Sin esto había que volver a buscar y añadir los cinco alimentos.
   */
  const duplicateOption = useCallback(
    (clientId, variant, mealIdx, optIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) => {
          if (i !== mealIdx) return m;
          const source = m.options[optIdx];
          if (!source) return m;
          // Detrás de la que se copia, no al final: es donde se espera encontrarla.
          const options = [...m.options];
          options.splice(optIdx + 1, 0, cloneOption(source));
          return { ...m, options };
        })
      ),
    [applyMeals]
  );

  const duplicateMeal = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) => {
        const source = meals[mealIdx];
        if (!source) return meals;
        const next = [...meals];
        next.splice(mealIdx + 1, 0, cloneMeal(source));
        return next;
      }),
    [applyMeals]
  );

  const addFoodToOption = useCallback(
    // `null` y no 100: deja que `buildFoodEntry` elija: una unidad entera si el
    // alimento la tiene, 100 g si se pesa. Ver `domain/nutrition.js`.
    (clientId, variant, mealIdx, optIdx, food, grams = null) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx
                    ? o
                    : { ...o, foods: [...(o.foods || []), buildFoodEntry(food, grams)] }
                ),
              }
        )
      ),
    [applyMeals]
  );

  const removeFoodFromOption = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) =>
                  oi !== optIdx ? o : { ...o, foods: (o.foods || []).filter((f) => f.id !== foodId) }
                ),
              }
        )
      ),
    [applyMeals]
  );

  /** El inverso de `removeFoodFromOption`, para el «Deshacer» del aviso. */
  const restoreFoodInOption = useCallback(
    (clientId, variant, mealIdx, optIdx, food, foodIdx) =>
      applyMeals(clientId, variant, (meals) =>
        meals.map((m, i) =>
          i !== mealIdx
            ? m
            : {
                ...m,
                options: m.options.map((o, oi) => {
                  if (oi !== optIdx) return o;
                  const foods = [...(o.foods || [])];
                  foods.splice(Math.max(0, Math.min(foodIdx, foods.length)), 0, food);
                  return { ...o, foods };
                }),
              }
        )
      ),
    [applyMeals]
  );

  /**
   * Cambia UN alimento dentro de una opción de una comida.
   *
   * Los cuatro índices son el camino hasta él y son idénticos para cualquier
   * cambio, así que estaban a punto de repetirse veinte líneas por cada campo
   * nuevo. Se extrae una vez y cada acción pone solo lo suyo.
   */
  const patchFood = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, patch) =>
      applyMeals(
        clientId,
        variant,
        (meals) =>
          meals.map((m, i) =>
            i !== mealIdx
              ? m
              : {
                  ...m,
                  options: m.options.map((o, oi) =>
                    oi !== optIdx
                      ? o
                      : {
                          ...o,
                          foods: (o.foods || []).map((f) =>
                            f.id === foodId ? { ...f, ...patch(f) } : f
                          ),
                        }
                  ),
                }
          ),
        { immediate: false }
      ),
    [applyMeals]
  );

  const updateFoodGrams = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, grams) =>
      patchFood(clientId, variant, mealIdx, optIdx, foodId, () => ({
        grams: toNum(grams) ?? 0,
      })),
    [patchFood]
  );

  /**
   * Elige si este alimento se cuenta en gramos o en unidades.
   *
   * Es una preferencia POR ALIMENTO Y POR DIETA, no de la biblioteca: el mismo
   * entrenador escribe «2 huevos» en la dieta de quien cocina y «110 g» en la de
   * quien pesa todo. Que la biblioteca decidiera por los dos obligaría a tener el
   * huevo duplicado.
   *
   * Los gramos no se tocan al cambiar de modo —son la verdad, la unidad es la
   * lente—, así que ir y volver no mueve ni una caloría.
   */
  const setFoodDisplay = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, mode) =>
      patchFood(clientId, variant, mealIdx, optIdx, foodId, () => ({
        showAs: mode === 'units' ? 'units' : 'grams',
      })),
    [patchFood]
  );

  // ── Antropometría ────────────────────────────────────────────────────────

  const applyAnthro = useCallback(
    (clientId, updater, { immediate = true } = {}) => {
      const current = anthroRef.current[clientId] || emptyAnthropometry();
      const next = updater(current);
      if (next === current) return current;

      setAnthropometry({ ...anthroRef.current, [clientId]: next });
      persist('anthro', clientId, next, { immediate });
      return next;
    },
    [anthroRef, persist, setAnthropometry]
  );

  /**
   * Añade una revisión. El histórico se mantiene ordenado por fecha
   * descendente, y si ya existe un registro en la misma fecha se sustituye:
   * dos pesajes del mismo día no son dos puntos de tendencia.
   */
  const addAnthropometryLog = useCallback(
    (clientId, log) =>
      applyAnthro(clientId, (a) => {
        const rest = (a.history || []).filter((h) => h.date !== log.date);
        return {
          ...a,
          history: [{ id: log.id || newId('log'), ...log }, ...rest].sort((x, y) =>
            String(y.date).localeCompare(String(x.date))
          ),
        };
      }),
    [applyAnthro]
  );

  const removeAnthropometryLog = useCallback(
    (clientId, logId) =>
      applyAnthro(clientId, (a) => ({
        ...a,
        history: (a.history || []).filter((h, i) => (h.id ? h.id !== logId : i !== logId)),
      })),
    [applyAnthro]
  );

  /** Edita un registro ya guardado (corregir un peso mal teclado). */
  const updateAnthropometryLog = useCallback(
    (clientId, logId, fields) =>
      applyAnthro(clientId, (a) => ({
        ...a,
        history: (a.history || []).map((h) => (h.id === logId ? { ...h, ...fields } : h)),
      })),
    [applyAnthro]
  );

  // ── Bibliotecas del coach ────────────────────────────────────────────────

  /**
   * `exercises` y `foods` NO tienen constraint UNIQUE (coach_id, name), así que
   * un `upsert` con `onConflict: 'coach_id,name'` falla con «no unique or
   * exclusion constraint matching the ON CONFLICT specification».
   *
   * Mientras no exista esa constraint hay que buscar primero y decidir después.
   * Cuesta una petición extra; la alternativa es la migración que hay preparada
   * en `supabase/migrations/`, que permitiría volver a un único upsert.
   */
  /**
   * Alta o actualización de una entrada de biblioteca, buscándola por su nombre.
   *
   * ── El `team_id` no es opcional, aunque la columna lo permita ────────────────
   * Se escribía solo `coach_id`, que era correcto antes de los equipos y dejó de
   * serlo con la 0006: desde entonces las bibliotecas son del EQUIPO y sus
   * políticas preguntan por `team_id`. Una fila nueva sin él nace huérfana —fuera
   * de la biblioteca compartida— y, con las políticas de la 0027, ni se puede
   * escribir ni se puede leer por la vía del equipo.
   *
   * ── Y por eso también se busca por equipo ───────────────────────────────────
   * Buscar por `coach_id` en un equipo significa que si el dueño ya tiene «Pollo»
   * y lo añade un entrenador suyo, salen dos «Pollo» con macros propios. Es
   * exactamente la divergencia de bibliotecas que `modelo-de-equipo.md` daba como
   * motivo para compartirlas.
   */
  const upsertByName = useCallback(async (table, coachId, teamId, name, fields) => {
    const trimmed = name.trim();

    let find = supabase.from(table).select('id').eq('name', trimmed);
    find = teamId ? find.eq('team_id', teamId) : find.eq('coach_id', coachId);

    const { data: existing, error: findErr } = await find.maybeSingle();
    if (findErr) return { error: findErr };

    if (existing) {
      return supabase.from(table).update(fields).eq('id', existing.id).select().single();
    }

    return supabase
      .from(table)
      // `coach_id` se sigue escribiendo porque es NOT NULL y su retirada va en
      // otra migración (ver 0006). `team_id`, solo si hay equipo: sin la 0006 esa
      // columna no existe y PostgREST rechazaría la fila entera.
      .insert({ coach_id: coachId, ...(teamId ? { team_id: teamId } : {}), name: trimmed, ...fields })
      .select()
      .single();
  }, []);

  const upsertLibraryExercise = useCallback(
    async (name, muscle) => {
      const userId = session?.user?.id;
      if (!userId || !name?.trim()) return null;

      const { data, error } = await upsertByName('exercises', userId, team?.id || null, name, {
        muscle_group: muscle,
      });

      if (error) {
        console.error('upsertLibraryExercise:', error.message);
        return null;
      }

      const mapped = mapLibraryExerciseFromDb(data);
      setExerciseLibrary((prev) => {
        const exists = prev.some((e) => e.id === mapped.id);
        return exists
          ? prev.map((e) => (e.id === mapped.id ? mapped : e))
          : [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
      });
      return mapped;
    },
    [session, team, upsertByName]
  );

  const upsertLibraryFood = useCallback(
    async (food) => {
      const userId = session?.user?.id;
      if (!userId || !food?.name?.trim()) return null;

      /*
        Las dos columnas de unidad viajan juntas o no viajan (CHECK de la 0030).
        Una etiqueta en blanco se manda como NULL en las DOS para poder quitarle la
        unidad a un alimento: mandar solo `unit_label: null` dejaría los gramos
        huérfanos y la fila la rechazaría la base.
      */
      const etiqueta = String(food.unitLabel || '').trim();
      const gramosPorUnidad = toNum(food.unitGrams);
      const unidad =
        etiqueta && gramosPorUnidad && gramosPorUnidad > 0
          ? { unit_label: etiqueta, unit_grams: gramosPorUnidad }
          : { unit_label: null, unit_grams: null };

      const { data, error } = await upsertByName('foods', userId, team?.id || null, food.name, {
        protein_per_100g: toNum(food.proteinPer100) ?? 0,
        carbs_per_100g: toNum(food.carbsPer100) ?? 0,
        fats_per_100g: toNum(food.fatsPer100) ?? 0,
        ...unidad,
      });

      if (error) {
        console.error('upsertLibraryFood:', error.message);
        return null;
      }

      const mapped = mapLibraryFoodFromDb(data);
      setFoodLibrary((prev) => {
        const exists = prev.some((f) => f.id === mapped.id);
        return exists
          ? prev.map((f) => (f.id === mapped.id ? mapped : f))
          : [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
      });
      return mapped;
    },
    [session, team, upsertByName]
  );

  /**
   * Define cuánto pesa una unidad de un alimento, desde la dieta.
   *
   * ── Escribe en DOS sitios, y es deliberado ──────────────────────────────────
   *   1. **La entrada abierta**, para que el cambio se vea al instante y sin
   *      esperar a una recarga de la biblioteca.
   *   2. **La biblioteca**, para que la próxima vez que se añada ese alimento a
   *      cualquier dieta ya venga con su unidad.
   *
   * Sin (2) habría que repetir la definición en cada dieta, que es justo el
   * trabajo manual que esto viene a quitar. Sin (1) el entrenador definiría la
   * unidad y no pasaría nada visible, que parece que no ha funcionado.
   *
   * Va DESPUÉS de `upsertLibraryFood` en el archivo a propósito: las dependencias
   * de un `useCallback` se evalúan al renderizar, así que declararlo antes daría
   * «Cannot access before initialization» al montar la aplicación.
   */
  const defineFoodUnit = useCallback(
    async (clientId, variant, mealIdx, optIdx, food, unitLabel, unitGrams) => {
      patchFood(clientId, variant, mealIdx, optIdx, food.id, () => ({
        unitLabel,
        unitGrams,
        showAs: 'units',
      }));

      // La biblioteca se actualiza por nombre (`upsertByName`), así que basta con
      // el nombre y las macros que la entrada ya lleva copiadas.
      return upsertLibraryFood({
        name: food.name,
        proteinPer100: food.proteinPer100,
        carbsPer100: food.carbsPer100,
        fatsPer100: food.fatsPer100,
        unitLabel,
        unitGrams,
      });
    },
    [patchFood, upsertLibraryFood]
  );

  // ── Clientes ─────────────────────────────────────────────────────────────

  /**
   * Parches de cliente pendientes de enviar, acumulados por cliente.
   *
   * La cola de guardado retiene SOLO el último payload por clave (que es
   * justamente lo que evita que una respuesta antigua pise una nueva). Con
   * bloques completos —rutina, nutrición— eso es correcto, porque cada payload
   * es el estado entero. Pero `updateClient` envía un PARCHE de campos: si el
   * coach cambia el tipo de ciclo y acto seguido el número de días, el segundo
   * parche sustituye al primero dentro de la ventana de debounce y el cambio de
   * tipo de ciclo nunca llega a la base de datos (se ve en pantalla hasta que
   * recargas).
   *
   * Acumular los parches lo resuelve: siempre se envía la unión de todos los
   * campos tocados, cada uno con su valor más reciente.
   */
  const clientPatchRef = useRef({});

  const updateClient = useCallback(
    (clientId, fields, { immediate = true } = {}) => {
      setClients(clientsRef.current.map((c) => (c.id === clientId ? { ...c, ...fields } : c)));

      const merged = { ...(clientPatchRef.current[clientId] || {}), ...fields };
      clientPatchRef.current[clientId] = merged;
      persist('client', clientId, merged, { immediate });
    },
    [clientsRef, persist, setClients]
  );

  /**
   * Marca un cobro como hecho y adelanta el ciclo.
   *
   * ══ Por qué es una acción y no dos campos sueltos ═══════════════════════════
   *
   * Marcar «pagado» sin mover la fecha deja la ficha mintiendo al día siguiente:
   * el cobro consta cobrado y la fecha sigue siendo la del que ya entró, así que
   * la cartera vuelve a reclamarlo. Son dos escrituras que solo tienen sentido
   * juntas, y estaban repartidas entre la bandeja de «Hoy» y la ficha — dos
   * sitios donde acordarse de la segunda.
   *
   * Sin periodicidad anotada solo cambia el estado, que es lo único que se puede
   * saber: adivinar un mes por defecto pondría una fecha inventada en la ficha de
   * alguien que cobra por trimestres.
   */
  const markClientPaid = useCallback(
    (clientId) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      if (!client) return { ok: false, error: 'Ese cliente ya no está en la cartera.' };

      const siguiente = nextPaymentAfter(client.nextPaymentDate, client.billingPeriod);

      /*
        Lo que había ANTES, devuelto para el «Deshacer» del aviso: marcar cobrado
        es un toque sin confirmación, y su pareja honesta es poder volver atrás.
        El inverso es `updateClient` con estos mismos campos — no hace falta una
        acción nueva porque esta escritura no pasa por ninguna función de la base.
      */
      const prev = {
        paymentStatus: client.paymentStatus ?? 'pending',
        ...(siguiente ? { nextPaymentDate: client.nextPaymentDate ?? null } : {}),
      };

      updateClient(clientId, {
        paymentStatus: 'paid',
        ...(siguiente ? { nextPaymentDate: siguiente } : {}),
      });
      return { ok: true, prev };
    },
    [clientsRef, updateClient]
  );

  /**
   * Convierte los registros heredados de TODA la cartera en sesiones con fecha.
   *
   * ── Por qué es una operación aparte y no algo que pase solo ─────────────────
   * Porque reescribe el programa completo de cada cliente. Es la única escritura
   * de la aplicación que toca a todos a la vez, así que se pide a mano, se puede
   * ensayar sin escribir (`apply: false`) y avisa de que antes hay que bajarse una
   * copia. La regla la aplica `normalizeMicrocycles`, que está probada aparte —lo
   * que se comprueba ahí es que el tonelaje es idéntico antes y después—.
   *
   * ── Por qué escribe una por una y esperando ─────────────────────────────────
   * La cola de guardado está pensada para tecleo: agrupa, rebota y no dice cuándo
   * terminó. Aquí hace falta lo contrario —saber de cada cliente si se guardó— y
   * `upsertClientRow` además comprueba que nadie haya escrito en medio, que en una
   * migración de datos es justo lo que no se puede pasar por alto.
   */
  const normalizeLegacySessions = useCallback(
    async ({ apply = false } = {}) => {
      const report = { clients: 0, converted: 0, skipped: 0, failed: [] };

      for (const client of clientsRef.current) {
        const current = workoutRef.current[client.id];
        if (!current) continue;

        const { microcycles, converted, skipped } = normalizeMicrocycles(current.microcycles || []);
        report.skipped += skipped;
        if (converted === 0) continue;

        report.clients += 1;
        report.converted += converted;
        if (!apply) continue;

        const next = { ...current, microcycles };
        const result = await upsertClientRow('workout_data', client.id, mapWorkoutToDb(client.id, next));

        if (result.error) {
          report.failed.push(`${client.name}: ${result.error.message}`);
          continue;
        }
        setWorkoutData({ ...workoutRef.current, [client.id]: next });
      }

      return report;
    },
    [clientsRef, setWorkoutData, upsertClientRow, workoutRef]
  );

  /**
   * Archiva o recupera un cliente.
   *
   * ── Por qué existe, habiendo borrar ─────────────────────────────────────────
   * Porque el plan tiene un tope de clientes y borrar es irreversible: sin esto,
   * caber en el plan obligaba a destruir el año de entrenamientos, los pesajes y
   * las fotos de alguien que simplemente terminó su etapa.
   *
   * Archivar es la operación normal al terminar con un cliente. Borrar queda para
   * lo que de verdad lo pide: que la persona ejerza su derecho de supresión.
   *
   * No se guarda con debounce (`immediate`) porque es una decisión, no una
   * escritura continua: quien lo pulsa espera ver el efecto y probablemente
   * cierre la pantalla a continuación.
   */
  const setClientArchived = useCallback(
    async (clientId, archived) => {
      updateClient(clientId, { status: archived ? 'archived' : 'active' });

      /* El recuento del plan lo lleva la base de datos, así que después de
         archivar hay que volver a preguntárselo: es justo la cifra que cambia. */
      await refreshPlan();

      /*
        La señal de abandono que no se puede sacar de ninguna otra parte.

        Una cuenta que deja de entrar puede estar de vacaciones. Una cuenta que
        archiva clientes uno detrás de otro está cerrando, y eso se ve semanas
        antes de que deje de pagar. Va en tramos —`bucket`— porque el número
        exacto de clientes de alguien señala a ese alguien.
      */
      track('cliente_archivado', {
        archivado: archived ? 'si' : 'no',
        cartera: bucket(clientsRef.current.filter((c) => c.status !== 'archived').length),
      });
      return { ok: true };
    },
    [clientsRef, refreshPlan, updateClient]
  );

  /**
   * Preferencias del panel (ver domain/preferences.js).
   *
   * Se fusiona por SECCIÓN, no se reemplaza el objeto entero: así una preferencia
   * futura que viva en `preferences.otraCosa` no desaparece cada vez que se toca
   * un KPI del panel.
   *
   * Va por la cola de guardado con su propia clave, de modo que un fallo —la
   * columna o la función que faltan— se ve en pantalla como «No se guardó» con su
   * botón de reintentar, en lugar de perderse en silencio. Y por tener clave
   * propia, un guardado de preferencias no se mezcla con los campos de la ficha
   * que el entrenador pueda estar editando a la vez.
   */
  const updateClientPreferences = useCallback(
    (clientId, section, patch) => {
      const current = clientsRef.current.find((c) => c.id === clientId)?.preferences || {};
      const next = { ...current, [section]: { ...(current[section] || {}), ...patch } };

      setClients(
        clientsRef.current.map((c) => (c.id === clientId ? { ...c, preferences: next } : c))
      );
      persist('preferences', clientId, next, { immediate: true });
    },
    [clientsRef, persist, setClients]
  );

  /**
   * Sella un cambio para que al cliente le salga como novedad.
   *
   * ── Por qué lo dice un botón y no el guardado ───────────────────────────────
   * La rutina se guarda cada vez que se mueve una serie. Si esto se disparara con
   * cada escritura, el cliente vería «tu rutina ha cambiado» cuarenta veces en una
   * tarde de programación y a la tercera dejaría de mirarlo. Cuándo está terminado
   * lo sabe el entrenador; la aplicación no puede adivinarlo.
   *
   * La excepción es la revisión, que sí es un acto único —crear el enlace— y por
   * eso se sella sola.
   */
  const publishUpdate = useCallback(
    (clientId, kind) => {
      const prefs = clientsRef.current.find((c) => c.id === clientId)?.preferences;
      updateClientPreferences(clientId, 'updates', stampUpdate(prefs, kind));
    },
    [clientsRef, updateClientPreferences]
  );

  /**
   * Enlace de invitación de un cliente (migración 0015).
   *
   * Es lo que hace que el portal del cliente sea alcanzable: `client_profile_id`
   * existía desde el principio y no había ninguna pantalla que lo rellenara, así que
   * la única forma de que un cliente entrara era escribir su uuid a mano en la base
   * de datos.
   *
   * Devuelve la URL completa y no solo el token: lo que el entrenador va a hacer es
   * pegarla en un WhatsApp.
   */
  const createInvite = useCallback(async (clientId) => {
    const { data, error } = await supabase.rpc('create_client_invite', { target: clientId });
    if (error) return { ok: false, error: error.message };
    /*
      El hito que de verdad importa del arranque.

      Dar de alta a alguien es rellenar un formulario; INVITARLE es el momento en
      que el producto empieza a existir para su cliente, y es donde
      `monetizacion.md` §4.1 supone que está el abandono. Suponerlo es justo lo
      que esto viene a dejar de hacer.
    */
    track('invitacion_creada');
    return { ok: true, token: data, url: `${window.location.origin}/invitacion/${data}` };
  }, []);

  const revokeInvite = useCallback(async (clientId) => {
    const { error } = await supabase.rpc('revoke_client_invite', { target: clientId });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const addClient = useCallback(
    async (clientData) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { name, ...resto } = clientData || {};

      /*
        El alta va por `create_client` (migración 0032) y no por un INSERT.

        El motivo no es de estilo. Con el INSERT, el `team_id` lo elegía el
        navegador y el permiso lo juzgaba RLS, que rechaza en silencio: el usuario
        veía «new row violates row-level security policy» y no había forma de
        saber por qué desde fuera de la base de datos. La función resuelve el
        equipo ella misma y, cuando el permiso falta, DICE cuál es tu rol.

        Mismo permiso, misma comprobación del plan (el trigger corre igual). Lo
        único que cambia es que ahora el fallo se puede leer.
      */
      const viaRpc = await supabase.rpc('create_client', {
        p_name: String(name || '').trim(),
        p_fields: mapClientToDb(resto),
      });

      let { data, error } = viaRpc;

      /*
        Respaldo para bases sin la 0032 aplicada: se intenta el camino de siempre.
        `PGRST202` es «no existe esa función» — cualquier otro error es del alta y
        hay que enseñarlo, no reintentar por otra puerta.
      */
      if (error?.code === 'PGRST202') {
        const teamFields = team
          ? { team_id: team.id, assigned_to: clientData.assignedTo || userId }
          : {};
        ({ data, error } = await supabase
          .from('clients')
          .insert({
            coach_id: userId,
            start_date: today(),
            ...teamFields,
            ...mapClientToDb(clientData),
          })
          .select()
          .single());
      }

      if (error) return { ok: false, error: explicarErrorDeAlta(error) };

      const created = mapClientFromDb(data);
      setClients([...clientsRef.current, created]);
      setSelectedClientId(created.id);
      /* El primer paso del embudo. En TRAMOS: «tiene 28 clientes» señala a un
         entrenador concreto y «tiene entre 10 y 29» contesta igual de bien a la
         única pregunta que se le va a hacer —en qué tamaño de cartera se
         abandona—. */
      track('cliente_creado', { cartera: bucket(clientsRef.current.length) });
      return { ok: true, client: created };
    },
    [clientsRef, session, setClients, team]
  );

  /**
   * Vuelve a leer las fichas de los clientes.
   *
   * ── Por qué hace falta ──────────────────────────────────────────────────────
   * Las integraciones escriben `payment_status` y `next_payment_date` desde el
   * SERVIDOR, con `service_role`, porque el estado lo decide la función después de
   * conciliar. La aplicación no se enteraba: su lista de clientes era la de la carga
   * inicial, así que después de sincronizar Notion se veía al cliente recién creado
   * sin pago —«no les coge el pago»— cuando en la base de datos ya lo tenía.
   *
   * Es el mismo problema que tendría cualquier escritura hecha por fuera de la
   * aplicación, y la solución es la misma: releer cuando se sabe que algo ha
   * cambiado ahí fuera.
   */
  /*
    ══ Protección de datos ═══════════════════════════════════════════════════

    Esto guarda fotos corporales, peso, pliegues y perímetros: categoría especial
    del RGPD. Con clientes reales en la UE, poder EXPORTAR y poder BORRAR no son
    funciones de producto, son obligaciones — y hasta ahora no existía ninguna de
    las dos: borrar la fila de un cliente ni siquiera era posible (sus bloques
    tienen clave foránea sin cascada) y sus fotos se quedaban en el bucket para
    siempre.
  */

  /** Todo lo que la aplicación guarda de un cliente, en un objeto. */
  const exportClientData = useCallback(
    async (clientId) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      if (!client) return { ok: false, error: 'Ese cliente ya no existe.' };

      const table = (name) => supabase.from(name).select('*').eq('client_id', clientId);

      const [wd, anthro, nutri, photos, checkins, events] = await Promise.all([
        table('workout_data'),
        table('anthropometry'),
        table('nutrition_plans'),
        table('progress_photos'),
        table('check_ins'),
        table('client_events'),
      ]);

      const failed = [wd, anthro, nutri, photos].find((r) => r.error);
      if (failed) return { ok: false, error: `No se pudo exportar: ${failed.error.message}` };

      /*
        Las fotos van como ENLACES FIRMADOS de larga duración, no como binarios.
        Meter los archivos dentro exigiría una librería de ZIP —una dependencia
        nueva para una función que se usa dos veces al año— y un JSON con las
        imágenes en base64 sería un archivo de cientos de megas que ningún editor
        abre. Los enlaces caducan a los 7 días: es lo que hay que decirle a quien
        recibe la exportación, y por eso va escrito dentro del propio archivo.
      */
      /* `photo_url` guarda una RUTA del bucket, no una URL (la columna se llama
         mal desde el primer esquema). Las filas antiguas sí pueden tener una URL
         completa, y esas no hay que firmarlas. */
      const paths = (photos.data || [])
        .map((p) => p.photo_url)
        .filter((p) => p && !/^https?:\/\//i.test(p));
      let signed = [];
      if (paths.length > 0) {
        const res = await supabase.storage.from(BUCKET).createSignedUrls(paths, 7 * 24 * 3600);
        signed = res.data || [];
      }

      /*
        Exportar los datos de UN cliente es casi siempre atender una petición del
        RGPD, y eso hay que poder cuantificarlo: si esto se dispara, la pantalla
        que lo hace deja de ser una casilla de cumplimiento y pasa a ser una
        función que merece cuidado. También aparece —y esto es lo importante—
        cuando alguien se está llevando su cartera antes de irse.
      */
      track('datos_exportados', { alcance: 'cliente' });

      return {
        ok: true,
        data: {
          _aviso:
            'Exportación de datos personales. Los enlaces de las fotos caducan a los 7 días desde la fecha de generación.',
          _generado: new Date().toISOString(),
          cliente: client,
          rutina: wd.data || [],
          antropometria: anthro.data || [],
          nutricion: nutri.data || [],
          fotos: (photos.data || []).map((p, i) => ({ ...p, enlace: signed[i]?.signedUrl || null })),
          // Las dos últimas dependen de la migración 0009: si no está, se
          // exporta lo que hay en vez de fallar entero.
          checkIns: checkins.error ? [] : checkins.data,
          calendario: events.error ? [] : events.data,
        },
      };
    },
    [clientsRef]
  );

  /**
   * La traza de cambios de un cliente: quién tocó qué y cuándo.
   *
   * Bajo demanda y no en la carga inicial: es un dato de consulta puntual —se
   * mira cuando hay una duda— y traerlo para los veinte clientes al arrancar sería
   * exactamente el problema que este proyecto ya tiene con el resto.
   *
   * Si la tabla no existe (migración 0017 sin aplicar) devuelve una lista vacía y
   * lo dice, en vez de fallar: es el mismo trato que se le da a la 0009.
   */
  const loadAuditLog = useCallback(async (clientId, limit = 20) => {
    const res = await supabase
      .from('audit_log')
      .select('id, table_name, action, at, actor, profiles(full_name, email)')
      .eq('client_id', clientId)
      .order('at', { ascending: false })
      .limit(limit);

    if (res.error) {
      const missing = /does not exist|schema cache/i.test(res.error.message);
      return { ok: false, missing, error: res.error.message, rows: [] };
    }

    return {
      ok: true,
      missing: false,
      rows: (res.data || []).map((row) => ({
        id: row.id,
        table: row.table_name,
        action: row.action,
        at: row.at,
        who: row.profiles?.full_name || row.profiles?.email || null,
      })),
    };
  }, []);

  /**
   * Copia de seguridad de TODA la cartera.
   *
   * ── Por qué existe estando Supabase detrás ──────────────────────────────────
   * Porque las copias de Supabase son de la base entera y dependen del plan: no
   * sirven para «devuélveme el programa de Marta como estaba el martes». Y el
   * modelo concentra el trabajo de un año de cada cliente en unas pocas filas
   * jsonb, así que un UPDATE mal hecho —o un borrado por error— se lleva doce
   * meses sin dejar rastro.
   *
   * Esto no es un sistema de copias: es un volcado que el entrenador puede
   * guardar donde quiera y con el que se puede reconstruir a mano. Es poco, y es
   * infinitamente más que nada.
   *
   * Una consulta por tabla con `in(...)`, no una por cliente: con cuarenta
   * clientes eso serían doscientas peticiones.
   */
  const exportAllData = useCallback(async () => {
    const all = clientsRef.current;
    if (all.length === 0) return { ok: false, error: 'No hay clientes que copiar.' };

    const ids = all.map((c) => c.id);
    const table = (name) => supabase.from(name).select('*').in('client_id', ids);

    const [wd, anthro, nutri, photos, checkins, events] = await Promise.all([
      table('workout_data'),
      table('anthropometry'),
      table('nutrition_plans'),
      table('progress_photos'),
      table('check_ins'),
      table('client_events'),
    ]);

    const failed = [wd, anthro, nutri, photos].find((r) => r.error);
    if (failed) return { ok: false, error: `No se pudo copiar: ${failed.error.message}` };

    /* La cartera entera. Es la misma señal que la de un cliente suelto pero mucho
       más fuerte: quien se descarga todo o está siendo prudente o se está yendo,
       y las dos cosas merecen una conversación. */
    track('datos_exportados', { alcance: 'todo', cartera: bucket(all.length) });

    return {
      ok: true,
      data: {
        _aviso:
          'Copia de seguridad de Caveman Hub. Contiene datos de salud: guárdala cifrada y no la compartas. NO incluye los archivos de fotos, solo sus rutas en el almacenamiento.',
        _generado: new Date().toISOString(),
        _clientes: all.length,
        clientes: all,
        rutina: wd.data || [],
        antropometria: anthro.data || [],
        nutricion: nutri.data || [],
        fotos: photos.data || [],
        checkIns: checkins.error ? [] : checkins.data,
        calendario: events.error ? [] : events.data,
      },
    };
  }, [clientsRef]);

  /**
   * Borra un cliente y TODO lo suyo, incluidas sus fotos del almacenamiento.
   *
   * ── Por qué es un procedimiento y no un `delete()` ──────────────────────────
   * Las tablas de bloque referencian `clients` SIN cascada, así que borrar la
   * ficha a secas falla por clave foránea. Y aunque no fallara, los archivos del
   * bucket no los borra nadie: hoy quedarían las fotos corporales de una persona
   * que pidió que la borraras.
   *
   * El orden importa: primero los archivos, después las filas hijas y al final la
   * ficha. Si algo falla se sigue con el resto y se devuelve la lista de lo que
   * quedó, porque un borrado a medias hay que poder terminarlo a mano — y para
   * eso hay que saber qué falta.
   */
  const deleteClientCompletely = useCallback(
    async (clientId) => {
      const problems = [];

      /* Los archivos. Se listan del bucket en vez de fiarse de las filas: una
         subida que falló a mitad puede haber dejado el archivo sin su fila. */
      try {
        const root = `${clientId}/photos`;
        const folders = await supabase.storage.from(BUCKET).list(root, { limit: 1000 });
        const files = [];
        for (const entry of folders.data || []) {
          if (entry.id) {
            files.push(`${root}/${entry.name}`);
            continue;
          }
          const inner = await supabase.storage.from(BUCKET).list(`${root}/${entry.name}`, { limit: 1000 });
          for (const file of inner.data || []) files.push(`${root}/${entry.name}/${file.name}`);
        }
        if (files.length > 0) {
          const removed = await supabase.storage.from(BUCKET).remove(files);
          if (removed.error) problems.push(`archivos: ${removed.error.message}`);
        }
      } catch (e) {
        problems.push(`archivos: ${e?.message || 'error al listar el almacenamiento'}`);
      }

      for (const table of [
        'progress_photos',
        'workout_data',
        'anthropometry',
        'nutrition_plans',
        'check_ins',
        'client_events',
        'client_invites',
      ]) {
        const res = await supabase.from(table).delete().eq('client_id', clientId);
        /* Una tabla que no existe (migración sin aplicar) no es un problema: es
           que ahí no hay nada de este cliente. */
        if (res.error && !/does not exist|schema cache/i.test(res.error.message)) {
          problems.push(`${table}: ${res.error.message}`);
        }
      }

      const gone = await supabase.from('clients').delete().eq('id', clientId);
      if (gone.error) {
        return {
          ok: false,
          error: `No se pudo borrar la ficha: ${gone.error.message}`,
          problems,
        };
      }

      setClients((prev) => prev.filter((c) => c.id !== clientId));
      setProgressPhotos((prev) => prev.filter((p) => p.clientId !== clientId));

      return { ok: true, problems };
    },
    [setClients, setProgressPhotos]
  );

  const reloadClients = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('created_at');
    if (error) return { ok: false, error: error.message };
    setClients((data || []).map(mapClientFromDb));
    return { ok: true };
  }, [setClients]);

  /**
   * Aplica un panel a toda la cartera de una vez (migración 0035).
   *
   * ── Por qué una función de base de datos y no un bucle ──────────────────────
   * Veinte llamadas son veinte transacciones: si la novena falla, quedan ocho
   * clientes con el panel nuevo y doce con el viejo, y no hay forma de saber
   * cuáles sin abrirlos uno a uno. Así, o entran todos o no entra ninguno.
   *
   * Va justo DESPUÉS de `reloadClients` a propósito: lo necesita en sus
   * dependencias, y las de un `useCallback` se evalúan al renderizar. Declararlo
   * antes daría «Cannot access before initialization» al arrancar la aplicación.
   */
  const applyDashboardToAll = useCallback(
    async (dashboard) => {
      const { data, error } = await supabase.rpc('apply_dashboard_to_my_clients', {
        p_dashboard: dashboard,
      });

      if (error) return { ok: false, error: error.message };

      // Las fichas cambiaron en el servidor. Sin releer, el panel abierto
      // seguiría enseñando lo de antes hasta recargar la página entera.
      await reloadClients();
      return { ok: true, count: data ?? 0 };
    },
    [reloadClients]
  );

  /* Integraciones (Notion, Stripe): sin estado propio, extraídas con la
     convención de useRoadmap.js. */
  const {
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runIntegration,
    createClientFromExternal,
    setWebhookSecret,
    runStripe,
    linkExternalName,
  } = useIntegrations({ session, team, addClient });

  /* Revisiones y calendario: dos dominios sin estado propio, extraídos con la
     convención de `useRoadmap.js`. */
  const {
    uploadReview,
    listReviews,
    createReviewLink,
    createReviewUrl,
    markReviewViewed,
    listReviewLinks,
    revokeReviewLink,
    deleteReview,
  } = useReviews({ isCoachRef });

  const { loadEvents, addClientEvent, setEventDone, removeClientEvent } = useCalendar({
    session,
  });

  // ── Equipo ───────────────────────────────────────────────────────────────
  //
  // Las acciones del equipo viven en su gancho (useTeam.js). Aquí queda solo
  // assignClient, que es un delegado de updateClient — dominio de clientes.

  /** Cambia el entrenador responsable de un cliente. */
  const assignClient = useCallback(
    (clientId, profileId) => updateClient(clientId, { assignedTo: profileId || null }),
    [updateClient]
  );

  // ── Vista activa ─────────────────────────────────────────────────────────

  const isCoach = profileRole === 'coach';
  const effectiveView = isCoach ? viewMode : 'client';

  /* ==========================================================================
     Tres contextos, y no uno
     --------------------------------------------------------------------------
     Todo esto vivía en un solo objeto con ciento cincuenta y cuatro claves, y
     ese objeto se rehacía en cuanto cambiaba cualquiera de sus dependencias:
     `workoutData`, `nutrition`, `clients`, `saveState`… Como los cuarenta y
     cuatro componentes que llaman a `useApp()` leían de ahí, escribir UN CARÁCTER
     en un campo de kilos volvía a pintar la aplicación entera —incluidos el menú
     de cuenta, el panel de integraciones y el de soporte, que no leen ni uno de
     los datos que habían cambiado—.

     No hay ningún `React.memo` en el proyecto que cortara esa propagación, y
     ponerlos habría sido tratar el síntoma: el problema no es que los
     componentes se pinten de más, es que estaban SUSCRITOS a más de lo que
     leen.

     Se parte por FRECUENCIA DE CAMBIO, que es lo que determina a quién arrastra
     cada cosa:

       · SESIÓN   — quién eres y qué puedes. Cambia al entrar y poco más.
       · DATOS    — la cartera y sus bloques. Cambia con cada escritura.
       · ACCIONES — las ciento veinte funciones. NO CAMBIA NUNCA (ver abajo).

     `useApp()` se conserva y sigue devolviendo las tres cosas juntas, así que no
     hay que tocar ni un componente para que esto entre. Lo que se gana está en
     los que se pasen a los ganchos estrechos: un componente que solo llame a
     `useActions()` deja de repintarse cuando alguien teclea un peso.
     ========================================================================== */

  /** Quién eres y qué puedes. */
  const sessionValue = useMemo(
    () => ({
      session,
      loading,
      loadError,
      conflict,
      profileRole,
      isCoach,
      view: effectiveView,
      team,
      teamMembers,
      plan,
      hasTeams: Boolean(team),
      myTeamRole: team?.myRole || null,
      isSupport,
      coachPrefs,
      coachPrefsReady,
    }),
    [
      session, loading, loadError, conflict, profileRole, isCoach, effectiveView,
      team, teamMembers, plan, isSupport, coachPrefs, coachPrefsReady,
    ]
  );

  /**
   * La cartera y sus bloques.
   *
   * `saveStatus` va aquí y no con las acciones aunque sea una función: no hace
   * nada, LEE `saveState` y se llama durante el render para pintar el indicador.
   * Detrás de la fachada estable de las acciones, un componente no se enteraría
   * de que un guardado ha fallado — que es justo lo que la cola existe para
   * evitar.
   */
  const dataValue = useMemo(
    () => ({
      clients: visibleClients,
      allClients: clients,
      archivedClients,
      activeClient,
      selectedClientId,
      workoutData,
      training,
      legacyPending,
      anthropometry,
      nutrition,
      progressPhotos,
      exerciseLibrary,
      foodLibrary,
      catalogFoods,
      catalogExercises,
      checkIns,
      checkInsActivos,
      phases,
      saveStatus,
      hasUnsavedChanges,
    }),
    [
      visibleClients, clients, archivedClients, activeClient, selectedClientId,
      workoutData, training, legacyPending, anthropometry, nutrition, progressPhotos,
      exerciseLibrary, foodLibrary, catalogFoods, catalogExercises, checkIns, checkInsActivos,
      phases, saveStatus, hasUnsavedChanges,
    ]
  );

  /*
    ══ Las acciones, con identidad fija ═══════════════════════════════════════

    El espejo se reescribe en cada render, así que siempre apunta a la versión
    recién creada de cada `useCallback`. Lo que se reparte por el contexto es una
    FACHADA construida una sola vez: cada nombre es una función estable que
    reenvía al espejo.

    Dos consecuencias, las dos buenas:

      · El objeto de acciones nunca cambia de identidad, así que un componente
        que solo consuma acciones no vuelve a pintarse por culpa de un dato.
      · Desaparecen los cierres rancios. Una acción guardada en un `useEffect` al
        montar llamaba a la versión de entonces; ahora siempre entra por el
        espejo y ejecuta la de ahora.

    Y un efecto que conviene entender antes de tocar nada: los `useEffect` que
    llevaban una acción en su lista de dependencias dejan de dispararse cuando
    esa acción se recrea. Es lo correcto —esas recreaciones eran ruido, no una
    señal de que hubiera que volver a pedir nada— pero si algún día un efecto
    depende de eso, el problema es el efecto.
  */
  const actionsRef = useRef(null);
  actionsRef.current = {
    // Sesión
    resolveConflict,
    signOut,
    setViewMode,
    setSelectedClientId,

    // Estado de guardado
    retrySave,

    // Rutina
    updateExerciseSet,
    updateExerciseTarget,
    addExercise,
    removeExercise,
    restoreExercise,
    addExerciseSetSlot,
    removeExerciseSetSlot,
    moveExercise,
    setExerciseNote,
    addDay,
    renameDay,
    setDayNote,
    setDayDrills,
    duplicateDay,
    moveDay,
    removeDay,
    restoreDay,
    updateWeeklySplit,
    startSession,
    logSessionSet,
    updateSession,
    updateSessionMeta,
    updateMobilityDrills,
    removeSession,
    startProgram,
    appendMicrocycle,
    cloneMicrocycle,
    continueProgram,
    removeMicrocycle,
    restoreMicrocycle,
    setMicrocycleDate,
    copyDayToClient,
    copyMicrocycleToClient,
    copyProgramToClient,
    replicateClient,
    ensureProgram,

    // Nutrición
    updateNutrition,
    updateNutritionTargets,
    setHasDayVariants,
    addMeal,
    removeMeal,
    restoreMeal,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    copyVariantMeals,
    copyMealToVariant,
    copyOptionToVariant,
    moveMeal,
    moveFood,
    duplicateOption,
    duplicateMeal,
    addMealOption,
    removeMealOption,
    addFoodToOption,
    removeFoodFromOption,
    restoreFoodInOption,
    updateFoodGrams,
    setFoodDisplay,
    defineFoodUnit,

    // Antropometría
    addAnthropometryLog,
    removeAnthropometryLog,
    updateAnthropometryLog,

    // Bibliotecas
    upsertLibraryExercise,
    upsertLibraryFood,

    // Fotos
    uploadProgressPhoto,
    deleteProgressPhoto,
    updateProgressPhoto,
    refreshPhotoUrls,
    ensurePhotoUrls,

    // Clientes
    addClient,
    updateClient,
    markClientPaid,
    setClientArchived,
    updateClientPreferences,
    exportClientData,
    exportAllData,
    normalizeLegacySessions,
    loadAuditLog,
    deleteClientCompletely,

    // Preferencias del entrenador
    updateCoachPreferences,
    applyDashboardToAll,

    // Soporte
    loadTickets,
    createTicket,
    replyTicket,
    setTicketStatus,
    uploadIntakeFile,
    signPaths,

    // Integraciones
    reloadClients,
    createInvite,
    revokeInvite,
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runIntegration,
    runStripe,
    setWebhookSecret,
    linkExternalName,
    createClientFromExternal,

    // Revisiones
    uploadReview,
    listReviews,
    deleteReview,
    createReviewLink,
    createReviewUrl,
    markReviewViewed,
    publishUpdate,
    listReviewLinks,
    revokeReviewLink,

    // Check-ins y calendario
    reviewCheckIn,
    unreviewCheckIn,
    updateCheckInNotes,
    submitCheckIn,
    loadCheckInHistory,
    deleteCheckIn,
    loadEvents,
    addClientEvent,
    setEventDone,
    removeClientEvent,

    // Roadmap
    addPhase,
    updatePhase,
    removePhase,

    // Equipo y plan
    refreshPlan,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    assignClient,
    renameTeam,
  };

  /* La fachada. Lista vacía de dependencias a propósito: es lo que la hace
     estable, y el conjunto de nombres no cambia en tiempo de ejecución. */
  const actionsValue = useMemo(() => {
    const estable = {};
    for (const nombre of Object.keys(actionsRef.current)) {
      estable[nombre] = (...args) => actionsRef.current[nombre](...args);
    }
    return Object.freeze(estable);
  }, []);

  return (
    <SessionContext.Provider value={sessionValue}>
      <ActionsContext.Provider value={actionsValue}>
        <DataContext.Provider value={dataValue}>{children}</DataContext.Provider>
      </ActionsContext.Provider>
    </SessionContext.Provider>
  );
};

/*
  ══ Traducir a Postgres ════════════════════════════════════════════════════

  Los mensajes que devuelve la base de datos son exactos y no se le pueden
  enseñar a nadie. «new row violates row-level security policy for table
  "clients"» es correcto, describe lo ocurrido y no dice ni qué ha pasado ni qué
  hacer — quien lo lee entiende que algo va mal y nada más.

  Se traducen los códigos que de verdad pueden salir aquí. Solo esos: un
  catálogo de veinte códigos sería adivinar, y el `error.message` de respaldo es
  mejor que una traducción inventada. (El del roadmap vive con su dominio, en
  `useRoadmap.js`.)

  Los mensajes del trigger `enforce_client_limit` (0019) NO se tocan: ya vienen
  escritos para leerse y además dicen el número exacto de clientes y el plan.
*/

/** Códigos de Postgres que aparecen al escribir una ficha. */
const PG = {
  RLS: '42501', // insufficient_privilege — una política ha rechazado la fila
};

/**
 * Por qué ha fallado un alta de cliente.
 *
 * El caso de RLS aquí tiene una causa concreta y una sola: la política
 * `clients_team_insert` (0006) exige que quien inserta sea `owner`, `admin` o
 * `trainer` DE SU EQUIPO. Si el rechazo llega es que el equipo no está resuelto
 * o el rol es `viewer` — el `team_id` en blanco no puede ser, porque el trigger
 * de la 0019 lo rellena antes de que la política mire la fila.
 *
 * Decirlo así convierte un callejón sin salida en algo que se puede comprobar.
 */
const explicarErrorDeAlta = (error) => {
  if (error?.code === PG.RLS) {
    return 'Tu cuenta no tiene permiso para dar de alta clientes en este equipo. Aplica la migración 0032 para que el error diga exactamente cuál es tu rol.';
  }
  /*
    Todo lo demás llega ya escrito para leerse: los `RAISE EXCEPTION` de
    `create_client` (0032) nombran el rol y el equipo, y los del trigger del plan
    (0019) dan el número de clientes y el nombre del plan. Reescribirlos aquí
    sería perder justamente lo que los hace útiles.
  */
  return error?.message || 'No se ha podido dar de alta al cliente.';
};

/* ==========================================================================
   Los ganchos
   --------------------------------------------------------------------------
   Cuatro, y el orden de esta lista es el de preferencia: cuanto más estrecho es
   lo que se pide, menos veces se repinta quien lo pide.

   `useApp()` sigue existiendo y sigue devolviéndolo todo junto, así que ningún
   componente tuvo que cambiar para que el corte entrara. Pero es el más ancho
   de los cuatro: quien lo usa se suscribe a los tres contextos y se repinta con
   cualquier escritura, aunque solo lea una función. Al tocar un componente,
   merece la pena bajarlo al gancho que de verdad necesita.
   ========================================================================== */

const dentroDelProveedor = (ctx, nombre) => {
  if (!ctx) throw new Error(`${nombre} debe usarse dentro de <AppProvider>.`);
  return ctx;
};

/**
 * Las acciones. **El más barato de los cuatro**: su objeto no cambia nunca, así
 * que un componente que solo llame a esto no se repinta jamás por un dato.
 */
export const useActions = () => dentroDelProveedor(useContext(ActionsContext), 'useActions');

/** Quién eres y qué puedes. Cambia al entrar y poco más. */
export const useSession = () => dentroDelProveedor(useContext(SessionContext), 'useSession');

/** La cartera y sus bloques. Cambia con cada escritura, que es lo que se pinta. */
export const useData = () => dentroDelProveedor(useContext(DataContext), 'useData');

/**
 * Todo junto, como antes.
 *
 * Se conserva para no tener que reescribir cuarenta y cuatro componentes de
 * golpe, y porque hay pantallas —el editor de rutina, la analítica— que de
 * verdad leen de los tres. Para las que no, están los tres de arriba.
 */
export const useApp = () => {
  const session = useSession();
  const data = useData();
  const actions = useActions();
  return useMemo(() => ({ ...session, ...data, ...actions }), [session, data, actions]);
};
