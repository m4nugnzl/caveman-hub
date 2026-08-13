import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { createSaveQueue } from '@/lib/saveQueue';
import { useMirroredState } from '@/lib/useMirroredState';
import { newId, deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';
import {
  mapAnthroFromDb,
  mapAnthroToDb,
  mapCheckInFromDb,
  mapEventFromDb,
  mapClientFromDb,
  mapClientToDb,
  mapLibraryExerciseFromDb,
  mapLibraryFoodFromDb,
  mapNutritionFromDb,
  mapNutritionToDb,
  mapPhotoFromDb,
  mapPhotoToDb,
  mapPlanFromDb,
  mapWorkoutFromDb,
  mapWorkoutToDb,
} from '@/lib/mappers';
import {
  buildMicrocycle,
  blankDays,
  cloneDays,
  emptyWorkoutData,
  findMicrocycle,
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
  buildMeal,
  buildOption,
  emptyNutrition,
} from '@/domain/nutrition';
import { buildPhotoPath, slug as slugify, validatePhotoFile } from '@/domain/photos';
import { isArchived } from '@/domain/portfolio';
import { buildSessionFromPlan, sessionsOf, withSessionSet } from '@/domain/sessions';

const AppContext = createContext(null);

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

const BUCKET = 'client-media';

/**
 * Duración de las URLs firmadas de Storage.
 *
 * Antes se firmaban a UN AÑO y la URL se guardaba en la base de datos, así que
 * todo el material multimedia caducaba de golpe en la fecha de aniversario.
 * Ahora se guarda la ruta y se firma en cada carga: 8 horas cubren una jornada
 * de trabajo y `refreshPhotoUrls()` vuelve a firmar si algo expira.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 8;

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
  const [progressPhotos, setProgressPhotos, photosRef] = useMirroredState([]);

  /** Equipo del entrenador. `null` mientras la migración 0006 no esté aplicada. */
  const [team, setTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [plan, setPlan] = useState(null);

  /** Último check-in por cliente. Vacío si la migración 0009 no está aplicada. */
  const [checkIns, setCheckIns] = useState({});

  const [saveState, setSaveState] = useState({});

  // ── Cola de guardado ─────────────────────────────────────────────────────

  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue({
      onStatus: (key, next) =>
        setSaveState((prev) =>
          prev[key]?.status === next.status && prev[key]?.error === next.error
            ? prev
            : { ...prev, [key]: next }
        ),
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
    },
    [queue, upsertClientRow]
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

  // ── Carga inicial ────────────────────────────────────────────────────────

  /** Descarta respuestas de una carga anterior si el usuario cambia rápido. */
  const loadTokenRef = useRef(0);

  const resolvePhotoUrls = useCallback(async (photos) => {
    const paths = photos.filter((p) => p.path && !p.url).map((p) => p.path);
    if (paths.length === 0) return photos;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error('No se pudieron firmar las URLs de las fotos:', error.message);
      return photos;
    }

    const byPath = new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    return photos.map((p) => (p.path && byPath.has(p.path) ? { ...p, url: byPath.get(p.path) } : p));
  }, []);

  /**
   * Firma las fotos de UN cliente que todavía no tengan enlace.
   *
   * Lo llama la pantalla que va a enseñarlas. Si ya están firmadas no hace nada,
   * así que se puede llamar en cada render sin pensarlo.
   */
  const ensurePhotoUrls = useCallback(
    async (clientId) => {
      const pending = photosRef.current.filter((p) => p.clientId === clientId && p.path && !p.url);
      if (pending.length === 0) return;

      const resolved = await resolvePhotoUrls(pending);
      const byId = new Map(resolved.map((p) => [p.id, p.url]));

      setProgressPhotos((prev) =>
        prev.map((p) => (byId.has(p.id) && byId.get(p.id) ? { ...p, url: byId.get(p.id) } : p))
      );
    },
    [photosRef, resolvePhotoUrls, setProgressPhotos]
  );

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

      const [wd, anthro, nutri, photos] = await Promise.all([
        supabase.from('workout_data').select('*').in('client_id', ids),
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
      setClients,
      setNutrition,
      setProgressPhotos,
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
  }, [queue, setAnthropometry, setClients, setNutrition, setProgressPhotos, setWorkoutData]);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (data.session?.user) await loadForUser(data.session.user);
      })
      .catch((e) => active && setLoadError(e?.message || 'Error al iniciar sesión.'))
      .finally(() => active && setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (!active) return;
      setSession(next);

      // TOKEN_REFRESHED dispara cada ~hora en segundo plano y al volver a la
      // pestaña. Recargar en ese evento pisaba el estado local con lo último
      // persistido y el trabajo reciente parecía borrarse solo.
      if (event === 'TOKEN_REFRESHED') return;

      if (next?.user) {
        await loadForUser(next.user);
      } else {
        clearAll();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForUser, clearAll]);

  const signOut = useCallback(async () => {
    queue.flushAll();
    await supabase.auth.signOut();
  }, [queue]);

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

      applyWorkout(clientId, (cd) => ({
        ...cd,
        weeklySplit: Object.keys(cd.weeklySplit || {}).length > 0 ? cd.weeklySplit : restWeekSplit(),
        microcycles: [buildMicrocycle({ weekNumber: 1, days: [{ dayName: 'Día 1', exercises: [] }] })],
      }));
      return 1;
    },
    [applyWorkout, workoutRef]
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
          }),
        ],
      }));
      return weekNumber;
    },
    [applyWorkout, startProgram, workoutRef]
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

  /** Duplica una semana con todos sus ejercicios y series. */
  const cloneMicrocycle = useCallback(
    (clientId, weekNumber) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const source = findMicrocycle(current.microcycles, weekNumber);
      if (!source) return null;

      const newWeek = nextWeekNumber(current.microcycles);
      applyWorkout(clientId, (cd) => ({
        ...cd,
        microcycles: [
          ...cd.microcycles,
          {
            ...buildMicrocycle({ weekNumber: newWeek, days: cloneDays(source.days || []) }),
            sessionNumber: newWeek,
          },
        ],
      }));
      return newWeek;
    },
    [applyWorkout, workoutRef]
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
    (sourceClientId, targetClientId, { training = false, diet = false } = {}) => {
      const result = { training: false, diet: false };
      if (sourceClientId === targetClientId) return result;

      if (training) {
        const source = workoutRef.current[sourceClientId];
        const sourceClient = clientsRef.current.find((c) => c.id === sourceClientId);

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

      if (diet) {
        const source = nutritionRef.current[sourceClientId];
        if (source) {
          const copy = deepClone(source);
          setNutrition({ ...nutritionRef.current, [targetClientId]: copy });
          persist('nutrition', targetClientId, copy, { immediate: true });
          result.diet = true;
        }
      }

      return result;
    },
    [applyWorkout, clientsRef, nutritionRef, persist, setClients, setNutrition, workoutRef]
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

  const addMeal = useCallback(
    (clientId, variant) => applyMeals(clientId, variant, (meals) => [...meals, buildMeal()]),
    [applyMeals]
  );

  const removeMeal = useCallback(
    (clientId, variant, mealIdx) =>
      applyMeals(clientId, variant, (meals) => meals.filter((_, i) => i !== mealIdx)),
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

  const addFoodToOption = useCallback(
    (clientId, variant, mealIdx, optIdx, food, grams = 100) =>
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

  const updateFoodGrams = useCallback(
    (clientId, variant, mealIdx, optIdx, foodId, grams) =>
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
                            f.id === foodId ? { ...f, grams: toNum(grams) ?? 0 } : f
                          ),
                        }
                  ),
                }
          ),
        { immediate: false }
      ),
    [applyMeals]
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
  const upsertByName = useCallback(async (table, coachId, name, fields) => {
    const trimmed = name.trim();

    const { data: existing, error: findErr } = await supabase
      .from(table)
      .select('id')
      .eq('coach_id', coachId)
      .eq('name', trimmed)
      .maybeSingle();

    if (findErr) return { error: findErr };

    if (existing) {
      return supabase.from(table).update(fields).eq('id', existing.id).select().single();
    }
    return supabase
      .from(table)
      .insert({ coach_id: coachId, name: trimmed, ...fields })
      .select()
      .single();
  }, []);

  const upsertLibraryExercise = useCallback(
    async (name, muscle) => {
      const userId = session?.user?.id;
      if (!userId || !name?.trim()) return null;

      const { data, error } = await upsertByName('exercises', userId, name, {
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
    [session, upsertByName]
  );

  const upsertLibraryFood = useCallback(
    async (food) => {
      const userId = session?.user?.id;
      if (!userId || !food?.name?.trim()) return null;

      const { data, error } = await upsertByName('foods', userId, food.name, {
        protein_per_100g: toNum(food.proteinPer100) ?? 0,
        carbs_per_100g: toNum(food.carbsPer100) ?? 0,
        fats_per_100g: toNum(food.fatsPer100) ?? 0,
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
    [session, upsertByName]
  );

  // ── Fotos de progreso ────────────────────────────────────────────────────

  /**
   * Sube una foto real a Storage y crea su fila. Devuelve `{ ok, error }` en
   * vez de tragarse el fallo: quien llama tiene que poder informar al usuario.
   */
  const uploadProgressPhoto = useCallback(
    async ({ clientId, file, week, angle, weight, notes }) => {
      const invalid = validatePhotoFile(file);
      if (invalid) return { ok: false, error: invalid };

      const path = buildPhotoPath({ clientId, week, angle, fileName: file.name });

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (uploadErr) {
        return { ok: false, error: `No se pudo subir la imagen: ${uploadErr.message}` };
      }

      const { data, error } = await supabase
        .from('progress_photos')
        .insert(mapPhotoToDb({ clientId, path, angle, weight: toNum(weight), notes }))
        .select()
        .single();

      if (error) {
        // La fila no se creó: se limpia el objeto huérfano para no dejar basura.
        await supabase.storage.from(BUCKET).remove([path]);
        return { ok: false, error: `No se pudo registrar la foto: ${error.message}` };
      }

      const clientName = clientsRef.current.find((c) => c.id === clientId)?.name;
      const [withUrl] = await resolvePhotoUrls([mapPhotoFromDb(data, clientName)]);
      setProgressPhotos([withUrl, ...photosRef.current]);
      return { ok: true, photo: withUrl };
    },
    [clientsRef, photosRef, resolvePhotoUrls, setProgressPhotos]
  );

  const deleteProgressPhoto = useCallback(
    async (photo) => {
      const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id);
      if (error) return { ok: false, error: error.message };

      if (photo.path) {
        const { error: storageErr } = await supabase.storage.from(BUCKET).remove([photo.path]);
        // La fila ya no existe: un objeto huérfano es molesto, no grave.
        if (storageErr) console.warn('No se pudo borrar el archivo:', storageErr.message);
      }

      setProgressPhotos(photosRef.current.filter((p) => p.id !== photo.id));
      return { ok: true };
    },
    [photosRef, setProgressPhotos]
  );

  /**
   * Edita los metadatos de una foto. Ángulo, peso y notas viven juntos dentro de
   * `tag`, así que hay que reescribirlo completo a partir del estado ya
   * fusionado (no se puede actualizar un campo suelto).
   */
  const updateProgressPhoto = useCallback(
    async (photoId, fields) => {
      const current = photosRef.current.find((p) => p.id === photoId);
      if (!current) return { ok: false, error: 'La foto ya no existe.' };

      const merged = {
        ...current,
        ...fields,
        weight: 'weight' in fields ? toNum(fields.weight) : current.weight,
      };

      const { error } = await supabase
        .from('progress_photos')
        .update({ tag: mapPhotoToDb(merged).tag })
        .eq('id', photoId);

      if (error) return { ok: false, error: error.message };

      setProgressPhotos(photosRef.current.map((p) => (p.id === photoId ? merged : p)));
      return { ok: true };
    },
    [photosRef, setProgressPhotos]
  );

  /** Vuelve a firmar las URLs (por si alguna expiró durante la sesión). */
  const refreshPhotoUrls = useCallback(async () => {
    const cleared = photosRef.current.map((p) => (p.path ? { ...p, url: null } : p));
    const refreshed = await resolvePhotoUrls(cleared);
    setProgressPhotos(refreshed);
  }, [photosRef, resolvePhotoUrls, setProgressPhotos]);

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
   * Vuelve a leer el plan.
   *
   * Hace falta cuando cambia el recuento de clientes —alta, archivo, borrado— y
   * al volver de pagar. La cifra sale de la base y no de `clients.length` a
   * propósito: quien impone el límite es el disparador de Postgres, y una segunda
   * cuenta hecha en el navegador acabaría discrepando el día que dos pestañas den
   * de alta a la vez. Se enseña la misma que manda.
   */
  const refreshPlan = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_team_plan');
    if (error) return { ok: false, error: error.message };
    setPlan(mapPlanFromDb(data?.[0]));
    return { ok: true };
  }, []);

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
      return { ok: true };
    },
    [refreshPlan, updateClient]
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

      /*
        `coach_id` se sigue escribiendo aunque haya equipo: la columna es NOT NULL
        y su retirada va en una migración posterior (ver 0006). `team_id` y
        `assigned_to` solo se mandan si hay equipo; si no, las columnas no existen
        y PostgREST rechazaría la fila entera.
      */
      const teamFields = team
        ? { team_id: team.id, assigned_to: clientData.assignedTo || userId }
        : {};

      const { data, error } = await supabase
        .from('clients')
        .insert({
          coach_id: userId,
          start_date: today(),
          ...teamFields,
          ...mapClientToDb(clientData),
        })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      const created = mapClientFromDb(data);
      setClients([...clientsRef.current, created]);
      setSelectedClientId(created.id);
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

  // ── Integraciones ────────────────────────────────────────────────────────
  //
  // Se cargan a demanda desde su pantalla: son una o dos filas que no hacen falta
  // para nada más. Si las tablas no existen (migración 0010 sin aplicar), la
  // pantalla lo dice.

  const loadIntegration = useCallback(
    async (provider = 'notion') => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', provider)
        .maybeSingle();

      if (error) return { ok: false, error: error.message, integration: null };
      if (!data) return { ok: true, integration: null, hasToken: false };

      // Del token solo se puede saber SI existe: no hay forma de leerlo desde el
      // cliente, y eso es deliberado (ver migración 0010).
      const { data: hasToken } = await supabase.rpc('integration_has_token', {
        integration: data.id,
      });

      // Lo mismo con el secreto de firma del webhook. Falla en silencio si la
      // migración 0013 no está aplicada: entonces simplemente no hay webhook.
      const { data: webhook } = await supabase
        .rpc('integration_has_webhook', { integration: data.id })
        .then((r) => r, () => ({ data: false }));

      return {
        ok: true,
        hasToken: Boolean(hasToken),
        hasWebhook: Boolean(webhook),
        integration: {
          id: data.id,
          provider: data.provider,
          label: data.label,
          config: data.config || {},
          status: data.status,
          lastSyncAt: data.last_sync_at,
          lastError: data.last_error,
          // Sin 0013 estas columnas no existen y llegan como undefined: la
          // pantalla lo lee como «todavía no ha llegado ningún evento».
          lastEventAt: data.last_event_at || null,
          eventCount: data.event_count || 0,
        },
      };
    },
    [session]
  );

  const saveIntegration = useCallback(
    async ({ id, provider = 'notion', config, label }) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const row = {
        owner_id: userId,
        provider,
        config,
        label,
        team_id: team?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      const query = id
        ? supabase.from('integrations').update(row).eq('id', id).select().single()
        : supabase.from('integrations').insert(row).select().single();

      const { data, error } = await query;
      return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
    },
    [session, team]
  );

  const setIntegrationToken = useCallback(async (integrationId, token) => {
    const { error } = await supabase.rpc('set_integration_token', {
      integration: integrationId,
      token,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  /**
   * Llama a la Edge Function.
   *
   * `functions.invoke` manda el JWT de la sesión automáticamente, que es lo que la
   * función usa para comprobar —vía RLS— que la integración es del que llama. El
   * token de Notion no pasa por aquí en ningún momento.
   */
  const runIntegration = useCallback(async (integrationId, action) => {
    const { data, error } = await supabase.functions.invoke('notion-payments', {
      body: { integrationId, action },
    });

    if (error) {
      // El cuerpo del error trae el mensaje útil; `error.message` a secas suele ser
      // un genérico «non-2xx status code» que no ayuda a nadie.
      const detail = await error.context?.json?.().catch(() => null);
      return { ok: false, error: detail?.error || error.message };
    }
    return data?.error ? { ok: false, error: data.error } : { ok: true, ...data };
  }, []);

  /**
   * Da de alta un cliente A PARTIR de un nombre de Notion y lo vincula.
   *
   * ── Por qué esto es lo que faltaba ──────────────────────────────────────────
   * La conciliación solo sabía emparejar con clientes que YA existían. Pero el caso
   * real es el contrario: el entrenador lleva años cobrando en Notion y su cartera
   * entera está ahí, mientras que en la aplicación no hay nadie. Sin esto la
   * integración enseñaba catorce nombres seguidos con «¿Está dado de alta en
   * Clientes?» y no ofrecía ninguna forma de darlos de alta — que es exactamente lo
   * que hacía que no sirviera de nada.
   *
   * Con esto, la tabla de pagos se convierte en el alta masiva de la cartera: un
   * toque por persona y el pago queda ya asignado.
   */
  const createClientFromExternal = useCallback(
    async ({ integrationId, externalKey, externalLabel }) => {
      const created = await addClient({ name: String(externalLabel || '').trim() });
      if (!created.ok) return created;

      // Vincular a la vez que se crea: si no, el siguiente sincronizado volvería a
      // preguntar por el mismo nombre.
      const linked = await supabase.from('client_external_refs').upsert(
        {
          integration_id: integrationId,
          external_key: externalKey,
          external_label: externalLabel,
          client_id: created.client.id,
          linked_by: session?.user?.id,
        },
        { onConflict: 'integration_id,external_key' }
      );

      if (linked.error) return { ok: false, error: linked.error.message };
      return { ok: true, client: created.client };
    },
    [addClient, session]
  );

  /**
   * Guarda el secreto de firma del webhook de Stripe.
   *
   * Va por su propia función (migración 0013) y no por un UPDATE: la tabla de
   * secretos no tiene políticas, así que ni el dueño puede escribirla desde el
   * navegador. La función comprueba además que empiece por «whsec_», que es el
   * error más común: pegar la clave de API en el hueco del secreto de firma.
   */
  const setWebhookSecret = useCallback(async (integrationId, secret) => {
    const { error } = await supabase.rpc('set_integration_webhook_secret', {
      integration: integrationId,
      secret,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  /** Lo mismo para Stripe, que tiene su propia función. */
  const runStripe = useCallback(async (integrationId, action) => {
    const { data, error } = await supabase.functions.invoke('stripe-payments', {
      body: { integrationId, action },
    });
    if (error) {
      const detail = await error.context?.json?.().catch(() => null);
      return { ok: false, error: detail?.error || error.message };
    }
    return data?.error ? { ok: false, error: data.error } : { ok: true, ...data };
  }, []);

  /** Confirma que una cadena de Notion corresponde a un cliente, para siempre. */
  const linkExternalName = useCallback(
    async ({ integrationId, externalKey, externalLabel, clientId }) => {
      const userId = session?.user?.id;
      const { error } = await supabase.from('client_external_refs').upsert(
        {
          integration_id: integrationId,
          external_key: externalKey,
          external_label: externalLabel,
          client_id: clientId,
          linked_by: userId,
        },
        { onConflict: 'integration_id,external_key' }
      );
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [session]
  );

  // ── Vídeos de revisión ───────────────────────────────────────────────────
  //
  // Se guardan en el MISMO bucket y con el mismo esquema de rutas que las fotos
  // (`<clientId>/…`), así que las políticas de Storage de la migración 0007 ya los
  // cubren sin tocar nada: acotan por el primer segmento de la ruta.
  //
  // Y no hacen falta filas en ninguna tabla: se listan directamente de Storage. Un
  // registro en base de datos solo añadiría algo si hubiera que guardar metadatos
  // (visto por el cliente, comentarios), y eso todavía no existe.

  const uploadReview = useCallback(
    async ({ clientId, blob, mimeType, label }) => {
      if (!blob || blob.size === 0) return { ok: false, error: 'La grabación está vacía.' };

      const extension = mimeType?.includes('mp4') ? 'mp4' : 'webm';
      const path = `${clientId}/reviews/${Date.now()}-${slugify(label || 'revision')}.${extension}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: mimeType || 'video/webm', upsert: false });

      if (error) return { ok: false, error: error.message };

      // Se firma más largo que las fotos: un vídeo se manda por WhatsApp y el
      // cliente lo abre cuando puede, no en los siguientes minutos.
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
      return { ok: true, path, url: signed.data?.signedUrl || null };
    },
    []
  );

  const listReviews = useCallback(async (clientId) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(`${clientId}/reviews`, { sortBy: { column: 'name', order: 'desc' } });

    if (error) return { ok: false, error: error.message, reviews: [] };

    const paths = (data || []).filter((f) => f.id).map((f) => `${clientId}/reviews/${f.name}`);
    if (paths.length === 0) return { ok: true, reviews: [] };

    const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24 * 7);
    const urlByPath = new Map((signed.data || []).map((s) => [s.path, s.signedUrl]));

    return {
      ok: true,
      reviews: paths.map((path, index) => ({
        path,
        url: urlByPath.get(path) || null,
        name: data[index].name,
        // El nombre empieza por el timestamp de la subida: es la fecha sin
        // necesitar una tabla.
        createdAt: Number(data[index].name.split('-')[0]) || null,
        size: data[index].metadata?.size ?? null,
      })),
    };
  }, []);

  /**
   * Crea el enlace permanente de un vídeo y devuelve su URL pública.
   *
   * El token lo genera la base de datos (migración 0011), no el navegador: así no
   * depende de la calidad de su generador aleatorio y no se puede forzar uno
   * elegido a mano.
   */
  const createReviewLink = useCallback(async ({ clientId, path, title, weekStart, notes }) => {
    const { data, error } = await supabase.rpc('create_review_link', {
      target: clientId,
      path,
      link_title: title || null,
      week: weekStart || null,
      link_notes: notes || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, token: data, url: `${window.location.origin}/r/${data}` };
  }, []);

  /** Enlaces ya creados de un cliente, con sus visitas. */
  const listReviewLinks = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('review_links')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) return { ok: false, error: error.message, links: [] };
    return {
      ok: true,
      links: (data || []).map((row) => ({
        id: row.id,
        token: row.token,
        path: row.storage_path,
        title: row.title,
        weekStart: row.week_start,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
        firstViewedAt: row.first_viewed_at,
        lastViewedAt: row.last_viewed_at,
        viewCount: row.view_count,
        url: `${window.location.origin}/r/${row.token}`,
      })),
    };
  }, []);

  /** Revocar: el enlace deja de servir sin borrar que existió ni sus visitas. */
  const revokeReviewLink = useCallback(async (id) => {
    const { error } = await supabase
      .from('review_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const deleteReview = useCallback(async (path) => {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  // ── Calendario ───────────────────────────────────────────────────────────
  //
  // Los eventos se cargan por cliente y a demanda, no todos al arrancar: son la
  // única cosa del proyecto que crece sin techo con el tiempo, y nadie mira el
  // calendario de veinte clientes a la vez.

  const loadEvents = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('client_events')
      .select('*')
      .eq('client_id', clientId)
      .order('date');

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

  // ── Check-ins ────────────────────────────────────────────────────────────

  /**
   * Marca un check-in como revisado.
   *
   * Va por la función `review_check_in` (migración 0009) y no por un UPDATE, para
   * que quede registrado QUIÉN lo revisó sin que la aplicación tenga que acordarse
   * de mandarlo — que es justo el dato que se olvida y luego se echa en falta con
   * un equipo de varios entrenadores.
   */
  const reviewCheckIn = useCallback(async (checkInId, notes = null) => {
    const { error } = await supabase.rpc('review_check_in', { check_in: checkInId, notes });
    if (error) return { ok: false, error: error.message };

    // Se refleja en local sin recargar: la revisión es un gesto y tiene que
    // desaparecer del tablero al instante.
    setCheckIns((prev) => {
      const entry = Object.values(prev).find((c) => c.id === checkInId);
      if (!entry) return prev;
      return { ...prev, [entry.clientId]: { ...entry, reviewedAt: new Date().toISOString() } };
    });
    return { ok: true };
  }, []);

  // ── Equipo ───────────────────────────────────────────────────────────────
  //
  // Estas cuatro operaciones son puntuales y no van por la cola de guardado: la
  // cola existe para escrituras repetidas de un mismo bloque (los kilos de una
  // serie, el historial de peso). Aquí cada acción es un acto deliberado del
  // usuario y devuelve su resultado para que la vista lo muestre.

  const reloadTeamMembers = useCallback(async (teamId) => {
    const { data, error } = await supabase
      .from('team_members')
      .select('profile_id, role, profiles(full_name, email)')
      .eq('team_id', teamId);

    if (error) return;
    setTeamMembers(
      (data || []).map((row) => ({
        profileId: row.profile_id,
        role: row.role,
        name: row.profiles?.full_name || '',
        email: row.profiles?.email || '',
      }))
    );
  }, []);

  const inviteTeamMember = useCallback(
    async (email, role = 'trainer') => {
      if (!team) return { ok: false, error: 'Todavía no hay ningún equipo.' };

      const { error } = await supabase.rpc('invite_team_member', {
        target_team: team.id,
        member_email: email,
        member_role: role,
      });
      if (error) return { ok: false, error: error.message };

      await reloadTeamMembers(team.id);
      return { ok: true };
    },
    [reloadTeamMembers, team]
  );

  const updateTeamMemberRole = useCallback(
    async (profileId, role) => {
      if (!team) return { ok: false, error: 'Todavía no hay ningún equipo.' };
      if (profileId === team.ownerId) {
        return { ok: false, error: 'El dueño del equipo no puede cambiar de rol.' };
      }

      const { error } = await supabase
        .from('team_members')
        .update({ role })
        .eq('team_id', team.id)
        .eq('profile_id', profileId);
      if (error) return { ok: false, error: error.message };

      await reloadTeamMembers(team.id);
      return { ok: true };
    },
    [reloadTeamMembers, team]
  );

  const removeTeamMember = useCallback(
    async (profileId) => {
      if (!team) return { ok: false, error: 'Todavía no hay ningún equipo.' };
      if (profileId === team.ownerId) {
        return { ok: false, error: 'No se puede sacar del equipo a quien lo creó.' };
      }

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('profile_id', profileId);
      if (error) return { ok: false, error: error.message };

      /*
        Sus clientes quedan sin asignar, no se borran ni se reparten solos: quién
        se hace cargo de cada uno es una decisión del entrenador jefe, y adivinarla
        sería peor que preguntarla. La cartera los muestra como «sin asignar».
      */
      const orphans = clientsRef.current.filter((c) => c.assignedTo === profileId);
      if (orphans.length > 0) {
        await supabase
          .from('clients')
          .update({ assigned_to: null })
          .in('id', orphans.map((c) => c.id));
        setClients(
          clientsRef.current.map((c) => (c.assignedTo === profileId ? { ...c, assignedTo: null } : c))
        );
      }

      await reloadTeamMembers(team.id);
      return { ok: true, unassigned: orphans.length };
    },
    [clientsRef, reloadTeamMembers, setClients, team]
  );

  /** Cambia el entrenador responsable de un cliente. */
  const assignClient = useCallback(
    (clientId, profileId) => updateClient(clientId, { assignedTo: profileId || null }),
    [updateClient]
  );

  const renameTeam = useCallback(
    async (name) => {
      const clean = String(name || '').trim();
      if (!team || !clean) return { ok: false, error: 'El nombre no puede estar vacío.' };

      const { error } = await supabase.from('teams').update({ name: clean }).eq('id', team.id);
      if (error) return { ok: false, error: error.message };

      setTeam({ ...team, name: clean });
      return { ok: true };
    },
    [team]
  );

  // ── Vista activa ─────────────────────────────────────────────────────────

  const isCoach = profileRole === 'coach';
  const effectiveView = isCoach ? viewMode : 'client';

  const value = useMemo(
    () => ({
      // Sesión y estado global
      session,
      loading,
      loadError,
      conflict,
      resolveConflict,
      signOut,
      profileRole,
      isCoach,
      view: effectiveView,
      setViewMode,

      // Datos
      // La cartera viva. Lo archivado sale por `archivedClients`.
      clients: visibleClients,
      allClients: clients,
      archivedClients,
      activeClient,
      selectedClientId,
      setSelectedClientId,
      workoutData,
      anthropometry,
      nutrition,
      progressPhotos,
      exerciseLibrary,
      foodLibrary,

      // Estado de guardado
      saveStatus,
      retrySave,
      hasUnsavedChanges,

      // Rutina
      updateExerciseSet,
      updateExerciseTarget,
      addExercise,
      removeExercise,
      addExerciseSetSlot,
      removeExerciseSetSlot,
      moveExercise,
      addDay,
      renameDay,
      setDayNote,
      duplicateDay,
      removeDay,
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
      copyDayToClient,
      copyMicrocycleToClient,
      copyProgramToClient,
      replicateClient,

      // Nutrición
      updateNutrition,
      updateNutritionTargets,
      setHasDayVariants,
      addMeal,
      removeMeal,
      updateMealName,
      addMealOption,
      removeMealOption,
      addFoodToOption,
      removeFoodFromOption,
      updateFoodGrams,

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
      setClientArchived,
      updateClientPreferences,
      exportClientData,
      exportAllData,
      loadAuditLog,
      deleteClientCompletely,

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

      // Vídeos de revisión
      uploadReview,
      listReviews,
      deleteReview,
      createReviewLink,
      listReviewLinks,
      revokeReviewLink,

      // Check-ins y calendario
      checkIns,
      reviewCheckIn,
      loadEvents,
      addClientEvent,
      setEventDone,
      removeClientEvent,

      // Equipo
      team,
      teamMembers,
      plan,
      refreshPlan,
      hasTeams: Boolean(team),
      myTeamRole: team?.myRole || null,
      inviteTeamMember,
      updateTeamMemberRole,
      removeTeamMember,
      assignClient,
      renameTeam,
    }),
    [
      session, loading, loadError, conflict, resolveConflict, signOut, profileRole, isCoach, effectiveView,
      clients, visibleClients, archivedClients, activeClient, selectedClientId, workoutData, anthropometry, nutrition,
      progressPhotos, exerciseLibrary, foodLibrary,
      saveStatus, retrySave, hasUnsavedChanges,
      updateExerciseSet, updateExerciseTarget, addExercise, removeExercise, addExerciseSetSlot, removeExerciseSetSlot,
      moveExercise, addDay, renameDay, setDayNote, duplicateDay, removeDay, updateWeeklySplit,
      startSession, logSessionSet, updateSession, updateSessionMeta, updateMobilityDrills, removeSession,
      startProgram, appendMicrocycle, cloneMicrocycle, continueProgram, removeMicrocycle,
      copyDayToClient, copyMicrocycleToClient, copyProgramToClient, replicateClient,
      updateNutrition, updateNutritionTargets, setHasDayVariants, addMeal, removeMeal, updateMealName,
      addMealOption, removeMealOption, addFoodToOption, removeFoodFromOption, updateFoodGrams,
      addAnthropometryLog, removeAnthropometryLog, updateAnthropometryLog,
      upsertLibraryExercise, upsertLibraryFood,
      uploadProgressPhoto, deleteProgressPhoto, updateProgressPhoto, refreshPhotoUrls, ensurePhotoUrls,
      addClient, updateClient, setClientArchived, updateClientPreferences, exportClientData, exportAllData, loadAuditLog, deleteClientCompletely,
      reloadClients, createInvite, revokeInvite, loadIntegration, saveIntegration, setIntegrationToken, runIntegration, runStripe, setWebhookSecret, linkExternalName, createClientFromExternal,
      uploadReview, listReviews, deleteReview, createReviewLink, listReviewLinks, revokeReviewLink,
      checkIns, reviewCheckIn, loadEvents, addClientEvent, setEventDone, removeClientEvent, team, teamMembers, plan, refreshPlan, inviteTeamMember, updateTeamMemberRole, removeTeamMember, assignClient, renameTeam,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>.');
  return ctx;
};
