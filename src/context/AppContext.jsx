import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { createSaveQueue } from '@/lib/saveQueue';
import { useMirroredState } from '@/lib/useMirroredState';
import { newId, deepClone } from '@/lib/ids';
import { toNum } from '@/lib/num';
import {
  mapAnthroFromDb,
  mapAnthroToDb,
  mapClientFromDb,
  mapClientToDb,
  mapLibraryExerciseFromDb,
  mapLibraryFoodFromDb,
  mapNutritionFromDb,
  mapNutritionToDb,
  mapPhotoFromDb,
  mapPhotoToDb,
  mapWorkoutFromDb,
  mapWorkoutToDb,
} from '@/lib/mappers';
import {
  buildMicrocycle,
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
import { buildPhotoPath, validatePhotoFile } from '@/domain/photos';

const AppContext = createContext(null);

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

  const saveStatus = useCallback(
    (domain, clientId) => saveState[`${domain}:${clientId}`] || EMPTY_SAVE_STATE,
    [saveState]
  );

  const retrySave = useCallback((domain, clientId) => queue.retry(`${domain}:${clientId}`), [queue]);

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
  const upsertClientRow = useCallback(async (table, clientId, row) => {
    const updated = await supabase.from(table).update(row).eq('client_id', clientId).select('id');
    if (updated.error) return updated;
    if (updated.data && updated.data.length > 0) return updated;
    return supabase.from(table).insert(row).select('id');
  }, []);

  const persist = useCallback(
    (domain, clientId, payload, { immediate = false } = {}) => {
      const senders = {
        workout: (data) => upsertClientRow('workout_data', clientId, mapWorkoutToDb(clientId, data)),
        anthro: (data) => upsertClientRow('anthropometry', clientId, mapAnthroToDb(clientId, data)),
        nutrition: (data) =>
          upsertClientRow('nutrition_plans', clientId, mapNutritionToDb(clientId, data)),
        client: (data) => supabase.from('clients').update(mapClientToDb(data)).eq('id', clientId),
      };

      queue.enqueue(`${domain}:${clientId}`, payload, senders[domain], { immediate });
    },
    [queue, upsertClientRow]
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

      const clientsQuery =
        role === 'coach'
          ? supabase.from('clients').select('*').eq('coach_id', user.id).order('created_at')
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

      // Las bibliotecas solo las gestiona el coach (autocompletado al programar).
      if (role === 'coach') {
        const [exRes, foodRes] = await Promise.all([
          supabase.from('exercises').select('*').eq('coach_id', user.id).order('name'),
          supabase.from('foods').select('*').eq('coach_id', user.id).order('name'),
        ]);
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

      setWorkoutData(
        Object.fromEntries((wd.data || []).map((r) => [r.client_id, mapWorkoutFromDb(r)]))
      );
      setAnthropometry(
        Object.fromEntries((anthro.data || []).map((r) => [r.client_id, mapAnthroFromDb(r)]))
      );
      setNutrition(
        Object.fromEntries((nutri.data || []).map((r) => [r.client_id, mapNutritionFromDb(r)]))
      );

      const nameOf = (clientId) => mappedClients.find((c) => c.id === clientId)?.name;
      const mappedPhotos = (photos.data || []).map((r) => mapPhotoFromDb(r, nameOf(r.client_id)));
      const withUrls = await resolvePhotoUrls(mappedPhotos);
      if (isStale()) return;
      setProgressPhotos(withUrls);
    },
    [
      resolvePhotoUrls,
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

  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || clients[0] || null,
    [clients, selectedClientId]
  );

  // ── Mutaciones de rutina ─────────────────────────────────────────────────

  /**
   * Aplica un updater puro sobre la rutina de un cliente, actualiza el estado
   * y encola el guardado. Devuelve el nuevo valor para que quien llame pueda
   * derivar datos (ej. el número de la semana creada) sin esperar a React.
   */
  const applyWorkout = useCallback(
    (clientId, updater, { immediate = true } = {}) => {
      const current = workoutRef.current[clientId] || emptyWorkoutData();
      const next = updater(current);
      if (next === current) return current;

      setWorkoutData({ ...workoutRef.current, [clientId]: next });
      persist('workout', clientId, next, { immediate });
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

  /** Teclear kg/reps/rir: se agrupa la ráfaga en un solo guardado. */
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
   * Copia el programa completo. Se AÑADE a lo que el cliente destino ya tenga
   * (no sustituye nada) para no borrar por accidente un programa existente.
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

  const setHasDayVariants = useCallback(
    (clientId, value) =>
      applyNutrition(clientId, (n) => {
        if (!value || n.hasDayVariants) return { ...n, hasDayVariants: value };
        // Al activar por primera vez se parte de una copia de la dieta única,
        // para no perder lo ya configurado.
        return {
          ...n,
          hasDayVariants: true,
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

  const addClient = useCallback(
    async (clientData) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { data, error } = await supabase
        .from('clients')
        .insert({ coach_id: userId, start_date: today(), ...mapClientToDb(clientData) })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      const created = mapClientFromDb(data);
      setClients([...clientsRef.current, created]);
      setSelectedClientId(created.id);
      return { ok: true, client: created };
    },
    [clientsRef, session, setClients]
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
      signOut,
      profileRole,
      isCoach,
      view: effectiveView,
      setViewMode,

      // Datos
      clients,
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
      addExercise,
      removeExercise,
      addExerciseSetSlot,
      removeExerciseSetSlot,
      moveExercise,
      addDay,
      renameDay,
      duplicateDay,
      removeDay,
      updateWeeklySplit,
      startProgram,
      appendMicrocycle,
      cloneMicrocycle,
      removeMicrocycle,
      copyDayToClient,
      copyMicrocycleToClient,
      copyProgramToClient,

      // Nutrición
      updateNutrition,
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

      // Clientes
      addClient,
      updateClient,
    }),
    [
      session, loading, loadError, signOut, profileRole, isCoach, effectiveView,
      clients, activeClient, selectedClientId, workoutData, anthropometry, nutrition,
      progressPhotos, exerciseLibrary, foodLibrary,
      saveStatus, retrySave, hasUnsavedChanges,
      updateExerciseSet, addExercise, removeExercise, addExerciseSetSlot, removeExerciseSetSlot,
      moveExercise, addDay, renameDay, duplicateDay, removeDay, updateWeeklySplit,
      startProgram, appendMicrocycle, cloneMicrocycle, removeMicrocycle,
      copyDayToClient, copyMicrocycleToClient, copyProgramToClient,
      updateNutrition, setHasDayVariants, addMeal, removeMeal, updateMealName,
      addMealOption, removeMealOption, addFoodToOption, removeFoodFromOption, updateFoodGrams,
      addAnthropometryLog, removeAnthropometryLog, updateAnthropometryLog,
      upsertLibraryExercise, upsertLibraryFood,
      uploadProgressPhoto, deleteProgressPhoto, updateProgressPhoto, refreshPhotoUrls,
      addClient, updateClient,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>.');
  return ctx;
};
