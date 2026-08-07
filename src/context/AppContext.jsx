import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

// ============================================================================
// COLA DE GUARDADO SERIALIZADA POR CLAVE
// ----------------------------------------------------------------------------
// Por qué "se sigue borrando al rato, como que no termina de guardarse en
// ningún sitio": cada mutación (mover un ejercicio, renombrar un día, escribir
// un kg...) lanzaba su propio upsert "fire and forget". Si el usuario edita
// rápido, salen varias peticiones casi seguidas; la red NO garantiza que
// lleguen en el mismo orden en que se enviaron. Si la petición más antigua
// (con datos ya desactualizados) responde DESPUÉS que una más nueva, esa
// respuesta vieja gana en la base de datos y pisa el cambio reciente — de
// fuera parece que el trabajo se borra solo, y cuánto tarde en pasar depende
// del azar de la red, no de nada que hagas mal.
//
// Esta cola garantiza una única petición en vuelo POR CLIENTE: si llegan más
// cambios mientras se está guardando, se guarda solo el último estado y en
// cuanto la petición en curso termina se reenvía automáticamente el más
// reciente. Nunca hay dos peticiones a la vez para el mismo cliente, así que
// nunca puede llegar una respuesta vieja después de una nueva.
// ============================================================================
function createSaveQueue(onStatusChange) {
  const queues = {};
  const run = (key) => {
    const q = queues[key];
    if (!q || q.inFlight) return;
    q.inFlight = true;
    onStatusChange?.(key, true);
    const payload = q.latest;
    Promise.resolve(q.sender(payload)).finally(() => {
      q.inFlight = false;
      if (q.latest !== payload) run(key); // llegó algo más nuevo mientras se guardaba
      else onStatusChange?.(key, false);
    });
  };
  return (key, payload, sender) => {
    queues[key] = { ...queues[key], latest: payload, sender };
    run(key);
  };
}

// ============================================================================
// MAPEO DB (snake_case) ↔ Shape que ya consumen los componentes (camelCase)
// Los componentes de Coach/ y Client/ no cambian ni una línea: siguen
// esperando exactamente los mismos objetos que devolvía el mock de antes.
// ============================================================================

const mapClientFromDb = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  status: row.status,
  plan: row.plan,
  gender: row.gender,
  onboardingComplete: row.onboarding_complete,
  postureReviewed: row.posture_reviewed,
  paymentStatus: row.payment_status,
  nextPaymentDate: row.next_payment_date,
  gymEquipmentLink: row.gym_equipment_link,
  youtubeExplanationUrl: row.youtube_explanation_url,
  avatar: row.avatar,
  currentWeight: row.current_weight,
  startDate: row.start_date,
  // 'weekly' = estructura ligada a días de la semana (comportamiento de siempre).
  // 'rotating' = ciclo tipo "2 entreno / 1 descanso" que se repite sin fin,
  // sin atarse a lunes-domingo. cyclePattern solo se usa si rotating.
  cycleType: row.cycle_type || 'weekly',
  cyclePattern: row.cycle_pattern || { train: 2, rest: 1 },
});

// Convierte solo las claves presentes en `fields` (usado tanto para crear
// como para actualizar parcialmente vía updateClient).
const mapClientToDb = (fields) => {
  const map = {
    name: 'name', email: 'email', phone: 'phone', status: 'status', plan: 'plan',
    gender: 'gender', onboardingComplete: 'onboarding_complete', postureReviewed: 'posture_reviewed',
    paymentStatus: 'payment_status', nextPaymentDate: 'next_payment_date',
    gymEquipmentLink: 'gym_equipment_link', youtubeExplanationUrl: 'youtube_explanation_url',
    avatar: 'avatar', currentWeight: 'current_weight', startDate: 'start_date',
    cycleType: 'cycle_type', cyclePattern: 'cycle_pattern',
  };
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    if (map[k]) out[map[k]] = v;
  });
  return out;
};

const emptyWorkoutData = () => ({ weeklySplit: {}, mobilityDrills: [], notes: '', microcycles: [] });
const mapWorkoutFromDb = (row) => ({
  weeklySplit: row.weekly_split || {},
  mobilityDrills: row.mobility_drills || [],
  notes: row.notes || '',
  microcycles: row.microcycles || [],
});

const emptyAnthropometry = () => ({ threeDayWeights: { day1: '', day2: '', day3: '' }, history: [] });
const mapAnthroFromDb = (row) => ({
  threeDayWeights: row.three_day_weights || { day1: '', day2: '', day3: '' },
  history: row.history || [],
});

const mapNutritionFromDb = (row) => ({
  type: row.type,
  targetKcals: row.target_kcals,
  proteinGrams: row.protein_grams,
  carbsGrams: row.carbs_grams,
  fatsGrams: row.fats_grams,
  stepsGoal: row.steps_goal,
  habitsNotes: row.habits_notes || [],
  // hasDayVariants = el cliente tiene dos dietas cerradas distintas (entreno
  // / descanso) en vez de una sola lista de comidas.
  hasDayVariants: row.has_day_variants || false,
  closedMeals: row.closed_meals || [],
  closedMealsTraining: row.closed_meals_training || [],
  closedMealsRest: row.closed_meals_rest || [],
});

const mapLibraryExerciseFromDb = (row) => ({
  id: row.id,
  name: row.name,
  muscle: row.muscle_group,
});

const mapLibraryFoodFromDb = (row) => ({
  id: row.id,
  name: row.name,
  proteinPer100: row.protein_per_100g,
  carbsPer100: row.carbs_per_100g,
  fatsPer100: row.fats_per_100g,
});

const mapVideoFromDb = (row, clientName) => ({
  id: row.id,
  clientId: row.client_id,
  clientName: clientName || '',
  exercise: row.exercise,
  loadKg: row.load_kg,
  reps: row.reps,
  rpe: row.rpe,
  rir: row.rir,
  notes: row.notes,
  videoUrl: row.video_url,
  date: row.date,
  status: row.status,
  coachFeedback: row.coach_feedback,
  timestamps: row.timestamps || [],
});

const mapPhotoFromDb = (row, clientName) => ({
  id: row.id,
  clientId: row.client_id,
  clientName: clientName || '',
  url: row.photo_url,
  angle: row.angle,
  weight: row.weight,
  notes: row.notes,
  date: row.date,
});

// ============================================================================
// PROVIDER
// ============================================================================

export const AppProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('coach'); // "vista" activa en la UI — el permiso real siempre lo decide RLS, no esto.
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clients, setClients] = useState([]);
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [foodLibrary, setFoodLibrary] = useState([]);
  const [workoutData, setWorkoutData] = useState({});
  const [anthropometry, setAnthropometry] = useState({});
  const [nutrition, setNutrition] = useState({});
  const [videos, setVideos] = useState([]);
  const [progressPhotos, setProgressPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState({}); // 'workout:<clientId>' -> bool

  const saveQueueRef = useRef(
    createSaveQueue((key, saving) => {
      setSavingKeys((prev) => (prev[key] === saving ? prev : { ...prev, [key]: saving }));
    })
  );
  const isSaving = (domain, clientId) => !!savingKeys[`${domain}:${clientId}`];

  const activeClient = clients.find((c) => c.id === selectedClientId) || clients[0];

  // ── CARGA INICIAL Y EN CADA CAMBIO DE SESIÓN ──────────────────────────────
  const loadForUser = useCallback(async (user) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    const userRole = profile?.role || 'coach';
    setRole(userRole);

    const { data: clientRows, error: clientsErr } =
      userRole === 'coach'
        ? await supabase.from('clients').select('*').eq('coach_id', user.id).order('created_at')
        : await supabase.from('clients').select('*').eq('client_profile_id', user.id);

    if (clientsErr) console.error('loadForUser clients:', clientsErr.message);

    const mappedClients = (clientRows || []).map(mapClientFromDb);
    setClients(mappedClients);
    setSelectedClientId((prev) => (mappedClients.some((c) => c.id === prev) ? prev : mappedClients[0]?.id || ''));

    // Biblioteca de ejercicios: solo el coach la gestiona (autocompletado +
    // grupo muscular). Los clientes no la necesitan para ver su rutina.
    if (userRole === 'coach') {
      const { data: exRows, error: exErr } = await supabase
        .from('exercises')
        .select('*')
        .eq('coach_id', user.id)
        .order('name');
      if (exErr) console.error('loadForUser exercises:', exErr.message);
      setExerciseLibrary((exRows || []).map(mapLibraryExerciseFromDb));

      const { data: foodRows, error: foodErr } = await supabase
        .from('foods')
        .select('*')
        .eq('coach_id', user.id)
        .order('name');
      if (foodErr) console.error('loadForUser foods:', foodErr.message);
      setFoodLibrary((foodRows || []).map(mapLibraryFoodFromDb));
    } else {
      setExerciseLibrary([]);
      setFoodLibrary([]);
    }

    const ids = mappedClients.map((c) => c.id);
    if (ids.length === 0) {
      setWorkoutData({});
      setAnthropometry({});
      setNutrition({});
      setVideos([]);
      setProgressPhotos([]);
      return;
    }

    const [wdRes, anthroRes, nutriRes, vidsRes, photosRes] = await Promise.all([
      supabase.from('workout_data').select('*').in('client_id', ids),
      supabase.from('anthropometry').select('*').in('client_id', ids),
      supabase.from('nutrition_plans').select('*').in('client_id', ids),
      supabase.from('videos').select('*').in('client_id', ids).order('date', { ascending: false }),
      supabase.from('progress_photos').select('*').in('client_id', ids).order('date', { ascending: false }),
    ]);

    setWorkoutData(Object.fromEntries((wdRes.data || []).map((r) => [r.client_id, mapWorkoutFromDb(r)])));
    setAnthropometry(Object.fromEntries((anthroRes.data || []).map((r) => [r.client_id, mapAnthroFromDb(r)])));
    setNutrition(Object.fromEntries((nutriRes.data || []).map((r) => [r.client_id, mapNutritionFromDb(r)])));
    setVideos(
      (vidsRes.data || []).map((r) =>
        mapVideoFromDb(r, mappedClients.find((c) => c.id === r.client_id)?.name)
      )
    );
    setProgressPhotos(
      (photosRes.data || []).map((r) =>
        mapPhotoFromDb(r, mappedClients.find((c) => c.id === r.client_id)?.name)
      )
    );
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      if (session?.user) await loadForUser(session.user);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      // OJO: este listener también dispara en TOKEN_REFRESHED (Supabase renueva
      // el token en segundo plano ~cada hora, o al volver a la pestaña). Antes
      // recargábamos loadForUser() en CUALQUIER evento, lo que pisaba el estado
      // local (p.ej. un ejercicio recién añadido) con lo último persistido en
      // BD — de ahí el "se borra todo solo al rato". Solo recargamos en
      // eventos que realmente cambian de usuario o de sesión.
      if (event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        await loadForUser(session.user);
      } else {
        setClients([]);
        setExerciseLibrary([]);
        setWorkoutData({});
        setAnthropometry({});
        setNutrition({});
        setVideos([]);
        setProgressPhotos([]);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForUser]);

  // ── COMPUTED HELPERS (sin cambios: son puros, no tocan la base de datos) ──

  const calcFatPct = (skinFolds, gender) => {
    if (!skinFolds) return '0.0';
    const sum = Object.values(skinFolds).reduce((a, b) => a + Number(b), 0);
    if (sum === 0) return '0.0';
    return gender === 'Mujer' ? (3.5803 + sum * 0.1548).toFixed(1) : (2.59 + sum * 0.1051).toFixed(1);
  };

  const calcMuscleVolume = (clientId, weekNumber) => {
    const cd = workoutData[clientId];
    if (!cd) return {};
    const micro = cd.microcycles.find((m) => m.weekNumber === weekNumber) || cd.microcycles[cd.microcycles.length - 1];
    if (!micro) return {};
    const vol = {};
    micro.days.forEach((day) =>
      day.exercises.forEach((ex) => {
        const m = ex.muscle || 'Otros';
        const count = (ex.sets || []).filter((s) => s && Number(s.reps) > 0).length;
        vol[m] = (vol[m] || 0) + count;
      })
    );
    return vol;
  };

  const calcTonnage = (clientId, weekNumber) => {
    const cd = workoutData[clientId];
    if (!cd) return 0;
    const micro = cd.microcycles.find((m) => m.weekNumber === weekNumber) || cd.microcycles[cd.microcycles.length - 1];
    if (!micro) return 0;
    let total = 0;
    micro.days.forEach((day) =>
      day.exercises.forEach((ex) =>
        (ex.sets || []).forEach((s) => {
          if (s && Number(s.kg) > 0 && Number(s.reps) > 0) total += Number(s.kg) * Number(s.reps);
        })
      )
    );
    return total.toFixed(0);
  };

  // ── PERSISTENCIA (fire-and-forget con log de error; la UI ya se actualizó
  // de forma optimista antes de llamar a estas funciones) ───────────────────
  //
  // *** ESTA ERA LA CAUSA REAL DE "SE BORRA TODO" ***
  // Los tres upsert de abajo NO indicaban `onConflict`. Por defecto, el
  // cliente de Supabase usa la clave primaria de la tabla (normalmente `id`)
  // como columna de conflicto — pero estas filas se identifican por
  // `client_id` (que tiene su propia constraint UNIQUE, no es la PK). Como
  // el payload nunca lleva `id`, Supabase no encontraba ningún conflicto por
  // PK y intentaba INSERTAR una fila nueva en cada guardado. La primera vez
  // funcionaba (creaba la fila); TODAS las siguientes chocaban con la
  // constraint unique de client_id y fallaban con 409 "duplicate key value
  // violates unique constraint" — visible en la consola, pero silencioso
  // para el usuario. Es decir: literalmente ningún cambio se guardó nunca
  // después del primer upsert de cada cliente. Lo que parecía "se borra al
  // rato" era en realidad "nunca llegó a guardarse", y al recargar la app
  // vuelves a ver el último estado que sí se guardó con éxito.
  const persistWorkoutData = (clientId, cd) => {
    saveQueueRef.current(`workout:${clientId}`, cd, (payload) =>
      supabase
        .from('workout_data')
        .upsert({
          client_id: clientId,
          weekly_split: payload.weeklySplit,
          mobility_drills: payload.mobilityDrills,
          notes: payload.notes,
          microcycles: payload.microcycles,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id' })
        .then(({ error }) => error && console.error('persistWorkoutData:', error.message))
    );
  };

  const persistAnthropometry = (clientId, an) => {
    saveQueueRef.current(`anthro:${clientId}`, an, (payload) =>
      supabase
        .from('anthropometry')
        .upsert({
          client_id: clientId,
          three_day_weights: payload.threeDayWeights,
          history: payload.history,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id' })
        .then(({ error }) => error && console.error('persistAnthropometry:', error.message))
    );
  };

  const persistNutrition = (clientId, n) => {
    saveQueueRef.current(`nutrition:${clientId}`, n, (payload) =>
      supabase
        .from('nutrition_plans')
        .upsert({
          client_id: clientId,
          type: payload.type,
          target_kcals: payload.targetKcals,
          protein_grams: payload.proteinGrams,
          carbs_grams: payload.carbsGrams,
          fats_grams: payload.fatsGrams,
          steps_goal: payload.stepsGoal,
          habits_notes: payload.habitsNotes,
          has_day_variants: payload.hasDayVariants,
          closed_meals: payload.closedMeals,
          closed_meals_training: payload.closedMealsTraining,
          closed_meals_rest: payload.closedMealsRest,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id' })
        .then(({ error }) => error && console.error('persistNutrition:', error.message))
    );
  };

  // Aplica un `updater` puro (cd) => nuevoCd sobre workoutData[clientId],
  // actualiza el estado local al instante y persiste el resultado.
  const applyWorkoutUpdate = (clientId, updater) => {
    setWorkoutData((prev) => {
      const cd = prev[clientId] || emptyWorkoutData();
      const newCd = updater(cd);
      persistWorkoutData(clientId, newCd);
      return { ...prev, [clientId]: newCd };
    });
  };

  // ── WORKOUT MUTATIONS ──────────────────────────────────────────────────────

  // Aplica un `updater` puro (day) => nuevoDay sobre el día concreto de un
  // microciclo — evita repetir el mismo triple .map() en cada mutación de
  // ejercicios/series/orden.
  const applyDayUpdate = (clientId, weekNum, dayName, updater) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNum
          ? m
          : { ...m, days: m.days.map((d) => (d.dayName !== dayName ? d : updater(d))) }
      ),
    }));
  };

  const updateExerciseSet = (clientId, weekNum, dayName, exId, setIdx, field, value) => {
    applyDayUpdate(clientId, weekNum, dayName, (d) => ({
      ...d,
      exercises: d.exercises.map((ex) =>
        ex.id !== exId
          ? ex
          : { ...ex, sets: ex.sets.map((s, i) => (i !== setIdx ? s : { ...s, [field]: value })) }
      ),
    }));
  };

  // exercise ya trae `sets: [{kg:'',reps:'',rir:''}, ...]` con tantas
  // entradas como series haya elegido el coach al crearlo (antes venían
  // fijas a 4 — set1..set4).
  const addExercise = (clientId, weekNum, dayName, exercise) => {
    applyDayUpdate(clientId, weekNum, dayName, (d) => ({ ...d, exercises: [...d.exercises, exercise] }));
  };

  const removeExercise = (clientId, weekNum, dayName, exId) => {
    applyDayUpdate(clientId, weekNum, dayName, (d) => ({
      ...d,
      exercises: d.exercises.filter((ex) => ex.id !== exId),
    }));
  };

  // Añade/quita una serie a un ejercicio ya creado, para cuando el número de
  // series se decide sobre la marcha en vez de al añadir el ejercicio.
  const addExerciseSetSlot = (clientId, weekNum, dayName, exId) => {
    applyDayUpdate(clientId, weekNum, dayName, (d) => ({
      ...d,
      exercises: d.exercises.map((ex) =>
        ex.id !== exId
          ? ex
          : { ...ex, sets: [...ex.sets, { kg: '', reps: '', rir: '', targetReps: ex.sets[ex.sets.length - 1]?.targetReps || '' }] }
      ),
    }));
  };

  const removeExerciseSetSlot = (clientId, weekNum, dayName, exId, setIdx) => {
    applyDayUpdate(clientId, weekNum, dayName, (d) => ({
      ...d,
      exercises: d.exercises.map((ex) => {
        if (ex.id !== exId || ex.sets.length <= 1) return ex;
        if (setIdx === undefined || setIdx === null) return { ...ex, sets: ex.sets.slice(0, -1) };
        return { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) };
      }),
    }));
  };

  // Mueve un ejercicio una posición arriba/abajo dentro del día.
  const reorderExercise = (clientId, weekNum, dayName, exId, direction) => {
    applyDayUpdate(clientId, weekNum, dayName, (d) => {
      const idx = d.exercises.findIndex((ex) => ex.id === exId);
      const swapWith = direction === 'up' ? idx - 1 : idx + 1;
      if (idx === -1 || swapWith < 0 || swapWith >= d.exercises.length) return d;
      const next = [...d.exercises];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return { ...d, exercises: next };
    });
  };

  // Copia los ejercicios de un día de un cliente a otro. Si el día destino no
  // existe en la semana destino, se crea. Útil porque muchos clientes llevan
  // rutinas muy parecidas y no tiene sentido reescribirlas a mano cada vez.
  const copyDayToClient = (sourceClientId, sourceWeekNum, sourceDayName, targetClientId, targetWeekNum, targetDayName) => {
    const sourceCd = workoutData[sourceClientId];
    const sourceMicro = sourceCd?.microcycles.find((m) => m.weekNumber === sourceWeekNum);
    const sourceDay = sourceMicro?.days.find((d) => d.dayName === sourceDayName);
    if (!sourceDay) return;

    const clonedExercises = JSON.parse(JSON.stringify(sourceDay.exercises)).map((ex) => ({
      ...ex,
      id: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    }));

    applyWorkoutUpdate(targetClientId, (cd) => {
      const hasTargetWeek = cd.microcycles.some((m) => m.weekNumber === targetWeekNum);
      const microcycles = hasTargetWeek
        ? cd.microcycles
        : [...cd.microcycles, { id: 'mc_' + Date.now(), weekNumber: targetWeekNum, sessionNumber: targetWeekNum, date: new Date().toISOString().split('T')[0], days: [] }];

      return {
        ...cd,
        microcycles: microcycles.map((m) => {
          if (m.weekNumber !== targetWeekNum) return m;
          const hasTargetDay = m.days.some((d) => d.dayName === targetDayName);
          const days = hasTargetDay
            ? m.days.map((d) => (d.dayName !== targetDayName ? d : { ...d, exercises: clonedExercises }))
            : [...m.days, { dayName: targetDayName, exercises: clonedExercises }];
          return { ...m, days };
        }),
      };
    });
  };

  // Copia una semana completa (todos sus días) a otro cliente como un
  // microciclo nuevo al final de su programación.
  const copyMicrocycleToClient = (sourceClientId, sourceWeekNum, targetClientId) => {
    const sourceCd = workoutData[sourceClientId];
    const sourceMicro = sourceCd?.microcycles.find((m) => m.weekNumber === sourceWeekNum);
    if (!sourceMicro) return;

    applyWorkoutUpdate(targetClientId, (cd) => {
      const nextNum = cd.microcycles.length > 0 ? Math.max(...cd.microcycles.map((m) => m.weekNumber)) + 1 : 1;
      const clonedDays = JSON.parse(JSON.stringify(sourceMicro.days)).map((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => ({ ...ex, id: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) })),
      }));
      const newMicro = {
        id: 'mc_' + Date.now(),
        weekNumber: nextNum,
        sessionNumber: nextNum,
        date: new Date().toISOString().split('T')[0],
        days: clonedDays,
      };
      return { ...cd, microcycles: [...cd.microcycles, newMicro] };
    });
  };

  // Copia el PROGRAMA ENTERO (todas las semanas/sesiones) de un cliente a
  // otro — para cuando quieres montar a un cliente nuevo con la misma
  // estructura base que ya usas con otro, no solo una semana suelta.
  // Se añade a continuación de lo que el cliente destino ya tuviera (no
  // sustituye nada) para no borrar por accidente un programa existente.
  const copyAllMicrocyclesToClient = (sourceClientId, targetClientId) => {
    const sourceCd = workoutData[sourceClientId];
    if (!sourceCd || sourceCd.microcycles.length === 0) return;

    applyWorkoutUpdate(targetClientId, (cd) => {
      let nextNum = cd.microcycles.length > 0 ? Math.max(...cd.microcycles.map((m) => m.weekNumber)) + 1 : 1;
      const clonedMicros = JSON.parse(JSON.stringify(sourceCd.microcycles))
        .sort((a, b) => a.weekNumber - b.weekNumber)
        .map((m) => ({
          ...m,
          id: 'mc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          weekNumber: nextNum,
          sessionNumber: nextNum++,
          days: m.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((ex) => ({ ...ex, id: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) })),
          })),
        }));
      return { ...cd, microcycles: [...cd.microcycles, ...clonedMicros] };
    });
  };

  const addDay = (clientId, weekNum, dayName) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNum ? m : { ...m, days: [...m.days, { dayName, exercises: [] }] }
      ),
    }));
  };

  // Crea el primer microciclo desde cero para un cliente sin ninguno todavía.
  // cloneMicrocycle no sirve aquí porque necesita un microciclo existente
  // del que partir; esta es la función que faltaba para arrancar.
  const createMicrocycle = (clientId) => {
    const today = new Date().toISOString().split('T')[0];
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      weeklySplit:
        Object.keys(cd.weeklySplit || {}).length > 0
          ? cd.weeklySplit
          : {
              Lunes: 'Descanso', Martes: 'Descanso', Miércoles: 'Descanso', Jueves: 'Descanso',
              Viernes: 'Descanso', Sábado: 'Descanso', Domingo: 'Descanso',
            },
      microcycles: [
        {
          id: 'mc_' + Date.now(),
          weekNumber: 1,
          sessionNumber: 1,
          date: today,
          days: [{ dayName: 'Día 1', exercises: [] }],
        },
      ],
    }));
  };

  const cloneMicrocycle = (clientId, weekNum) => {
    applyWorkoutUpdate(clientId, (cd) => {
      const src = cd.microcycles.find((m) => m.weekNumber === weekNum);
      if (!src) return cd;
      const nextNum = Math.max(...cd.microcycles.map((m) => m.weekNumber)) + 1;
      const newMicro = {
        ...JSON.parse(JSON.stringify(src)),
        id: 'mc_' + Date.now(),
        weekNumber: nextNum,
        date: new Date().toISOString().split('T')[0],
        sessionNumber: src.sessionNumber + 1,
      };
      return { ...cd, microcycles: [...cd.microcycles, newMicro] };
    });
  };

  const updateWeeklySplit = (clientId, day, value) => {
    applyWorkoutUpdate(clientId, (cd) => ({ ...cd, weeklySplit: { ...cd.weeklySplit, [day]: value } }));
  };

  // ── EXERCISE LIBRARY (biblioteca de ejercicios del coach) ─────────────────
  // Guarda (o actualiza el músculo de) un ejercicio en la biblioteca del
  // coach, para que el autocompletado de "Añadir Ejercicio" lo recuerde la
  // próxima vez y rellene el grupo muscular solo. name+coach_id es único en
  // BD, así que un upsert basta tanto para crear como para corregir el
  // músculo de un ejercicio ya guardado.
  const upsertLibraryExercise = async (name, muscle) => {
    if (!session?.user || !name.trim()) return;
    const { data, error } = await supabase
      .from('exercises')
      .upsert({ coach_id: session.user.id, name: name.trim(), muscle_group: muscle }, { onConflict: 'coach_id,name' })
      .select()
      .single();
    if (error) {
      console.error('upsertLibraryExercise:', error.message);
      return;
    }
    const mapped = mapLibraryExerciseFromDb(data);
    setExerciseLibrary((prev) => {
      const exists = prev.some((e) => e.id === mapped.id);
      return exists ? prev.map((e) => (e.id === mapped.id ? mapped : e)) : [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  // Igual que upsertLibraryExercise pero para alimentos: guarda (o corrige)
  // los macros por 100g de un alimento en la biblioteca del coach, para que
  // el autocompletado de la dieta cerrada rellene los macros solo.
  const upsertLibraryFood = async (name, proteinPer100, carbsPer100, fatsPer100) => {
    if (!session?.user || !name.trim()) return null;
    const { data, error } = await supabase
      .from('foods')
      .upsert({
        coach_id: session.user.id, name: name.trim(),
        protein_per_100g: Number(proteinPer100) || 0,
        carbs_per_100g: Number(carbsPer100) || 0,
        fats_per_100g: Number(fatsPer100) || 0,
      }, { onConflict: 'coach_id,name' })
      .select()
      .single();
    if (error) {
      console.error('upsertLibraryFood:', error.message);
      return null;
    }
    const mapped = mapLibraryFoodFromDb(data);
    setFoodLibrary((prev) => {
      const exists = prev.some((f) => f.id === mapped.id);
      return exists ? prev.map((f) => (f.id === mapped.id ? mapped : f)) : [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name));
    });
    return mapped;
  };
  // Renombrar un día dentro de un microciclo (p.ej. "Día 1" → "Lunes").
  // OJO: antes esta función mutaba `clientData` DIRECTAMENTE (sin copiar el
  // objeto) y nunca llamaba a persistWorkoutData — el cambio se veía en
  // pantalla pero jamás llegaba a la base de datos, así que se perdía en
  // cuanto se recargaba la app. Ahora pasa por el mismo camino inmutable y
  // persistido que el resto de mutaciones de rutina.
  const renameDay = (clientId, weekNumber, oldDayName, newDayName) => {
    applyDayUpdate(clientId, weekNumber, oldDayName, (d) => ({ ...d, dayName: newDayName }));
  };

  // Mover un ejercicio a cualquier posición dentro de un día (drag & drop
  // libre, no solo subir/bajar una posición).
  const moveExercise = (clientId, weekNumber, dayName, sourceIndex, destIndex) => {
    applyDayUpdate(clientId, weekNumber, dayName, (d) => {
      if (sourceIndex === destIndex || sourceIndex < 0 || sourceIndex >= d.exercises.length) return d;
      const exercises = [...d.exercises];
      const [moved] = exercises.splice(sourceIndex, 1);
      exercises.splice(destIndex, 0, moved);
      return { ...d, exercises };
    });
  };

  // Duplica un día completo (con todos sus ejercicios y series) dentro de la
  // misma semana, con nombre "<día> (copia)" — o "(copia 2)", etc. si ya
  // existe una copia.
  const duplicateDay = (clientId, weekNumber, dayName) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) => {
        if (m.weekNumber !== weekNumber) return m;
        const src = m.days.find((d) => d.dayName === dayName);
        if (!src) return m;
        let copyName = `${dayName} (copia)`;
        let n = 2;
        while (m.days.some((d) => d.dayName === copyName)) copyName = `${dayName} (copia ${n++})`;
        const clonedExercises = JSON.parse(JSON.stringify(src.exercises)).map((ex) => ({
          ...ex,
          id: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        }));
        return { ...m, days: [...m.days, { dayName: copyName, exercises: clonedExercises }] };
      }),
    }));
  };

  // Elimina un día del microciclo.
  const removeDay = (clientId, weekNumber, dayName) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNumber ? m : { ...m, days: m.days.filter((d) => d.dayName !== dayName) }
      ),
    }));
  };



  // ── NUTRITION MUTATIONS ────────────────────────────────────────────────────
  // Cada comida ahora es { id, name, options: [{id, description, protein,
  // carbs, fats, kcal}] } — tantas opciones como quiera el coach por comida.
  // `variant` decide sobre qué lista de comidas se opera: 'default' (una
  // sola dieta cerrada), o 'training'/'rest' cuando hasDayVariants está
  // activo (dos dietas cerradas: días de entreno y días de descanso).
  const VARIANT_KEY = { default: 'closedMeals', training: 'closedMealsTraining', rest: 'closedMealsRest' };

  const applyNutritionUpdate = (clientId, updater) => {
    setNutrition((prev) => {
      const current = prev[clientId] || {
        type: 'macros', targetKcals: null, proteinGrams: null, carbsGrams: null,
        fatsGrams: null, stepsGoal: '', habitsNotes: [], hasDayVariants: false,
        closedMeals: [], closedMealsTraining: [], closedMealsRest: [],
      };
      const next = updater(current);
      persistNutrition(clientId, next);
      return { ...prev, [clientId]: next };
    });
  };

  const updateNutrition = (clientId, fields) => applyNutritionUpdate(clientId, (n) => ({ ...n, ...fields }));

  // Activa/desactiva tener dos dietas cerradas (entreno/descanso) en vez de
  // una sola. Al activar por primera vez, se parte de una copia de la dieta
  // única existente para no perder lo ya configurado.
  const setHasDayVariants = (clientId, value) => {
    applyNutritionUpdate(clientId, (n) => {
      if (value && !n.hasDayVariants) {
        return {
          ...n, hasDayVariants: true,
          closedMealsTraining: n.closedMealsTraining?.length ? n.closedMealsTraining : n.closedMeals || [],
          closedMealsRest: n.closedMealsRest?.length ? n.closedMealsRest : n.closedMeals || [],
        };
      }
      return { ...n, hasDayVariants: value };
    });
  };

  const updateMealName = (clientId, variant, mealIdx, name) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      meals[mealIdx] = { ...meals[mealIdx], name };
      return { ...n, [key]: meals };
    });
  };

  const addMeal = (clientId, variant = 'default') => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meal = {
        id: 'meal_' + Date.now(),
        name: 'Nueva Comida',
        // Cada opción es una lista de alimentos (no texto libre): cada
        // alimento tiene gramos + sus macros por 100g, así que las kcal y
        // macros de la opción se calculan solos, alimento a alimento.
        options: [{ id: 'opt_' + Date.now(), foods: [] }],
      };
      return { ...n, [key]: [...(n[key] || []), meal] };
    });
  };

  const removeMeal = (clientId, variant, mealIdx) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      meals.splice(mealIdx, 1);
      return { ...n, [key]: meals };
    });
  };

  const addMealOption = (clientId, variant, mealIdx) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      const meal = meals[mealIdx];
      if (!meal) return n;
      meals[mealIdx] = {
        ...meal,
        options: [...meal.options, { id: 'opt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), foods: [] }],
      };
      return { ...n, [key]: meals };
    });
  };

  const removeMealOption = (clientId, variant, mealIdx, optIdx) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      const meal = meals[mealIdx];
      if (!meal || meal.options.length <= 1) return n;
      meals[mealIdx] = { ...meal, options: meal.options.filter((_, i) => i !== optIdx) };
      return { ...n, [key]: meals };
    });
  };

  // Añade un alimento (box) a una opción de comida — food = {name,
  // proteinPer100, carbsPer100, fatsPer100}, grams = cantidad en gramos.
  const addFoodToOption = (clientId, variant, mealIdx, optIdx, food, grams = 100) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      const meal = meals[mealIdx];
      if (!meal) return n;
      const options = meal.options.map((o, i) => {
        if (i !== optIdx) return o;
        const newFood = {
          id: 'food_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: food.name,
          grams,
          proteinPer100: Number(food.proteinPer100) || 0,
          carbsPer100: Number(food.carbsPer100) || 0,
          fatsPer100: Number(food.fatsPer100) || 0,
        };
        return { ...o, foods: [...(o.foods || []), newFood] };
      });
      meals[mealIdx] = { ...meal, options };
      return { ...n, [key]: meals };
    });
  };

  const removeFoodFromOption = (clientId, variant, mealIdx, optIdx, foodId) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      const meal = meals[mealIdx];
      if (!meal) return n;
      const options = meal.options.map((o, i) => (i !== optIdx ? o : { ...o, foods: o.foods.filter((f) => f.id !== foodId) }));
      meals[mealIdx] = { ...meal, options };
      return { ...n, [key]: meals };
    });
  };

  const updateFoodGrams = (clientId, variant, mealIdx, optIdx, foodId, grams) => {
    applyNutritionUpdate(clientId, (n) => {
      const key = VARIANT_KEY[variant];
      const meals = [...(n[key] || [])];
      const meal = meals[mealIdx];
      if (!meal) return n;
      const options = meal.options.map((o, i) =>
        i !== optIdx ? o : { ...o, foods: o.foods.map((f) => (f.id !== foodId ? f : { ...f, grams })) }
      );
      meals[mealIdx] = { ...meal, options };
      return { ...n, [key]: meals };
    });
  };

  // Macros/kcal de UN alimento según sus gramos.
  const calcFoodMacros = (food) => {
    const factor = (Number(food?.grams) || 0) / 100;
    const protein = (Number(food?.proteinPer100) || 0) * factor;
    const carbs = (Number(food?.carbsPer100) || 0) * factor;
    const fats = (Number(food?.fatsPer100) || 0) * factor;
    return { protein, carbs, fats, kcal: protein * 4 + carbs * 4 + fats * 9 };
  };

  // Macros/kcal totales de una OPCIÓN (suma de sus alimentos). Se calculan
  // solos — el coach nunca teclea una kcal a mano.
  const calcOptionMacros = (option) => {
    return (option?.foods || []).reduce(
      (acc, f) => {
        const m = calcFoodMacros(f);
        return { protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fats: acc.fats + m.fats, kcal: acc.kcal + m.kcal };
      },
      { protein: 0, carbs: 0, fats: 0, kcal: 0 }
    );
  };

  const calcOptionKcals = (option) => Math.round(calcOptionMacros(option).kcal);

  // ── ANTHROPOMETRY MUTATIONS ────────────────────────────────────────────────

  const applyAnthropometryUpdate = (clientId, updater) => {
    setAnthropometry((prev) => {
      const current = prev[clientId] || emptyAnthropometry();
      const next = updater(current);
      persistAnthropometry(clientId, next);
      return { ...prev, [clientId]: next };
    });
  };

  const addAnthropometryLog = (clientId, log) => {
    applyAnthropometryUpdate(clientId, (a) => ({ ...a, history: [log, ...(a.history || [])] }));
  };

  const updateThreeDayWeights = (clientId, weights) => {
    applyAnthropometryUpdate(clientId, (a) => ({ ...a, threeDayWeights: weights }));
  };

  // ── VIDEO MUTATIONS ────────────────────────────────────────────────────────

  // data.file (opcional): un File real del <input type="file">, se sube a
  // Supabase Storage (bucket "client-media"). Si no se pasa, cae al vídeo de
  // muestra (útil en desarrollo sin archivo real a mano).
  const uploadClientVideo = async (data) => {
    const client = clients.find((c) => c.id === data.clientId) || clients[0];
    let videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

    if (data.file) {
      const path = `${data.clientId}/videos/${Date.now()}-${data.file.name}`;
      const { error: uploadErr } = await supabase.storage.from('client-media').upload(path, data.file);
      if (uploadErr) {
        console.error('uploadClientVideo storage:', uploadErr.message);
      } else {
        const { data: signed } = await supabase.storage
          .from('client-media')
          .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 año — ver nota en README sobre renovación
        if (signed?.signedUrl) videoUrl = signed.signedUrl;
      }
    }

    const { data: inserted, error } = await supabase
      .from('videos')
      .insert({
        client_id: data.clientId,
        exercise: data.exercise,
        load_kg: Number(data.loadKg),
        reps: Number(data.reps),
        rpe: Number(data.rpe),
        rir: Number(data.rir),
        notes: data.notes || '',
        video_url: videoUrl,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('uploadClientVideo insert:', error.message);
      return;
    }
    setVideos((prev) => [mapVideoFromDb(inserted, client?.name), ...prev]);
  };

  // Sube una foto de progreso real a Storage (bucket "client-media", igual
  // que los vídeos) y crea su fila en progress_photos.
  const uploadProgressPhoto = async (data) => {
    const client = clients.find((c) => c.id === data.clientId) || clients[0];
    const path = `${data.clientId}/photos/${Date.now()}-${data.file.name}`;

    const { error: uploadErr } = await supabase.storage.from('client-media').upload(path, data.file);
    if (uploadErr) {
      console.error('uploadProgressPhoto storage:', uploadErr.message);
      return;
    }
    const { data: signed } = await supabase.storage
      .from('client-media')
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    const { data: inserted, error } = await supabase
      .from('progress_photos')
      .insert({
        client_id: data.clientId,
        photo_url: signed?.signedUrl || '',
        angle: data.angle || 'frontal',
        weight: data.weight ? Number(data.weight) : null,
        notes: data.notes || '',
      })
      .select()
      .single();

    if (error) {
      console.error('uploadProgressPhoto insert:', error.message);
      return;
    }
    setProgressPhotos((prev) => [mapPhotoFromDb(inserted, client?.name), ...prev]);
  };

  const reviewVideo = (videoId, feedback) => {
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, status: 'reviewed', coachFeedback: feedback } : v)));
    supabase
      .from('videos')
      .update({ status: 'reviewed', coach_feedback: feedback })
      .eq('id', videoId)
      .then(({ error }) => error && console.error('reviewVideo:', error.message));
  };

  // ── CLIENT MUTATIONS ───────────────────────────────────────────────────────

  const updateClient = (clientId, fields) => {
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...fields } : c)));
    supabase
      .from('clients')
      .update(mapClientToDb(fields))
      .eq('id', clientId)
      .then(({ error }) => error && console.error('updateClient:', error.message));
  };

  const addClient = async (clientData) => {
    if (!session?.user) {
      console.error('addClient: no hay sesión activa.');
      return;
    }
    const { data, error } = await supabase
      .from('clients')
      .insert({ coach_id: session.user.id, ...mapClientToDb(clientData) })
      .select()
      .single();

    if (error) {
      console.error('addClient:', error.message);
      return;
    }
    const newClient = mapClientFromDb(data);
    setClients((prev) => [...prev, newClient]);
    setSelectedClientId(newClient.id);
  };

  return (
    <AppContext.Provider
      value={{
        session, loading,
        role, setRole,
        selectedClientId, setSelectedClientId,
        clients, setClients,
        activeClient,
        exerciseLibrary,
        workoutData,
        anthropometry,
        nutrition,
        videos,
        progressPhotos,
        isSaving,
        // Helpers
        calcFatPct, calcMuscleVolume, calcTonnage, calcOptionKcals, calcOptionMacros,
        // Exercise & food library
        upsertLibraryExercise,
        foodLibrary, upsertLibraryFood,
        // Workout
        updateExerciseSet, addExercise, removeExercise, addDay, createMicrocycle, cloneMicrocycle, updateWeeklySplit,
        addExerciseSetSlot, removeExerciseSetSlot, reorderExercise, copyDayToClient, copyMicrocycleToClient,
        copyAllMicrocyclesToClient,
        renameDay, moveExercise, duplicateDay, removeDay,
        // Nutrition
        updateNutrition, setHasDayVariants, updateMealName, addMeal, removeMeal,
        addMealOption, removeMealOption, addFoodToOption, removeFoodFromOption, updateFoodGrams,
        // Anthropometry
        addAnthropometryLog, updateThreeDayWeights,
        // Videos
        uploadClientVideo, reviewVideo,
        // Progress photos
        uploadProgressPhoto,
        // Clients
        updateClient, addClient,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
