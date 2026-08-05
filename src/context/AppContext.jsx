import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

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
  closedMeals: row.closed_meals || [],
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

// ============================================================================
// PROVIDER
// ============================================================================

export const AppProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('coach'); // "vista" activa en la UI — el permiso real siempre lo decide RLS, no esto.
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clients, setClients] = useState([]);
  const [workoutData, setWorkoutData] = useState({});
  const [anthropometry, setAnthropometry] = useState({});
  const [nutrition, setNutrition] = useState({});
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

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

    const ids = mappedClients.map((c) => c.id);
    if (ids.length === 0) {
      setWorkoutData({});
      setAnthropometry({});
      setNutrition({});
      setVideos([]);
      return;
    }

    const [wdRes, anthroRes, nutriRes, vidsRes] = await Promise.all([
      supabase.from('workout_data').select('*').in('client_id', ids),
      supabase.from('anthropometry').select('*').in('client_id', ids),
      supabase.from('nutrition_plans').select('*').in('client_id', ids),
      supabase.from('videos').select('*').in('client_id', ids).order('date', { ascending: false }),
    ]);

    setWorkoutData(Object.fromEntries((wdRes.data || []).map((r) => [r.client_id, mapWorkoutFromDb(r)])));
    setAnthropometry(Object.fromEntries((anthroRes.data || []).map((r) => [r.client_id, mapAnthroFromDb(r)])));
    setNutrition(Object.fromEntries((nutriRes.data || []).map((r) => [r.client_id, mapNutritionFromDb(r)])));
    setVideos(
      (vidsRes.data || []).map((r) =>
        mapVideoFromDb(r, mappedClients.find((c) => c.id === r.client_id)?.name)
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

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadForUser(session.user);
      } else {
        setClients([]);
        setWorkoutData({});
        setAnthropometry({});
        setNutrition({});
        setVideos([]);
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
        const count = ['set1', 'set2', 'set3', 'set4'].filter((k) => ex[k] && Number(ex[k].reps) > 0).length;
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
        ['set1', 'set2', 'set3', 'set4'].forEach((k) => {
          const s = ex[k];
          if (s && Number(s.kg) > 0 && Number(s.reps) > 0) total += Number(s.kg) * Number(s.reps);
        })
      )
    );
    return total.toFixed(0);
  };

  // ── PERSISTENCIA (fire-and-forget con log de error; la UI ya se actualizó
  // de forma optimista antes de llamar a estas funciones) ───────────────────

  const persistWorkoutData = (clientId, cd) => {
    supabase
      .from('workout_data')
      .upsert({
        client_id: clientId,
        weekly_split: cd.weeklySplit,
        mobility_drills: cd.mobilityDrills,
        notes: cd.notes,
        microcycles: cd.microcycles,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => error && console.error('persistWorkoutData:', error.message));
  };

  const persistAnthropometry = (clientId, an) => {
    supabase
      .from('anthropometry')
      .upsert({
        client_id: clientId,
        three_day_weights: an.threeDayWeights,
        history: an.history,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => error && console.error('persistAnthropometry:', error.message));
  };

  const persistNutrition = (clientId, n) => {
    supabase
      .from('nutrition_plans')
      .upsert({
        client_id: clientId,
        type: n.type,
        target_kcals: n.targetKcals,
        protein_grams: n.proteinGrams,
        carbs_grams: n.carbsGrams,
        fats_grams: n.fatsGrams,
        steps_goal: n.stepsGoal,
        habits_notes: n.habitsNotes,
        closed_meals: n.closedMeals,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => error && console.error('persistNutrition:', error.message));
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

  const updateExerciseSet = (clientId, weekNum, dayName, exId, setKey, field, value) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNum
          ? m
          : {
              ...m,
              days: m.days.map((d) =>
                d.dayName !== dayName
                  ? d
                  : {
                      ...d,
                      exercises: d.exercises.map((ex) =>
                        ex.id !== exId ? ex : { ...ex, [setKey]: { ...ex[setKey], [field]: value } }
                      ),
                    }
              ),
            }
      ),
    }));
  };

  const addExercise = (clientId, weekNum, dayName, exercise) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNum
          ? m
          : {
              ...m,
              days: m.days.map((d) => (d.dayName !== dayName ? d : { ...d, exercises: [...d.exercises, exercise] })),
            }
      ),
    }));
  };

  const removeExercise = (clientId, weekNum, dayName, exId) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNum
          ? m
          : {
              ...m,
              days: m.days.map((d) =>
                d.dayName !== dayName ? d : { ...d, exercises: d.exercises.filter((ex) => ex.id !== exId) }
              ),
            }
      ),
    }));
  };

  const addDay = (clientId, weekNum, dayName) => {
    applyWorkoutUpdate(clientId, (cd) => ({
      ...cd,
      microcycles: cd.microcycles.map((m) =>
        m.weekNumber !== weekNum ? m : { ...m, days: [...m.days, { dayName, exercises: [] }] }
      ),
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

  // ── NUTRITION MUTATIONS ────────────────────────────────────────────────────

  const applyNutritionUpdate = (clientId, updater) => {
    setNutrition((prev) => {
      const current = prev[clientId] || {
        type: 'macros', targetKcals: null, proteinGrams: null, carbsGrams: null,
        fatsGrams: null, stepsGoal: '', habitsNotes: [], closedMeals: [],
      };
      const next = updater(current);
      persistNutrition(clientId, next);
      return { ...prev, [clientId]: next };
    });
  };

  const updateNutrition = (clientId, fields) => applyNutritionUpdate(clientId, (n) => ({ ...n, ...fields }));

  const updateMeal = (clientId, mealIdx, field, value) => {
    applyNutritionUpdate(clientId, (n) => {
      const meals = [...(n.closedMeals || [])];
      meals[mealIdx] = { ...meals[mealIdx], [field]: value };
      return { ...n, closedMeals: meals };
    });
  };

  const addMeal = (clientId) => {
    applyNutritionUpdate(clientId, (n) => ({
      ...n,
      closedMeals: [...(n.closedMeals || []), { name: 'Nueva Comida', description: '' }],
    }));
  };

  const removeMeal = (clientId, idx) => {
    applyNutritionUpdate(clientId, (n) => {
      const meals = [...(n.closedMeals || [])];
      meals.splice(idx, 1);
      return { ...n, closedMeals: meals };
    });
  };

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
        workoutData,
        anthropometry,
        nutrition,
        videos,
        // Helpers
        calcFatPct, calcMuscleVolume, calcTonnage,
        // Workout
        updateExerciseSet, addExercise, removeExercise, addDay, cloneMicrocycle, updateWeeklySplit,
        // Nutrition
        updateNutrition, updateMeal, addMeal, removeMeal,
        // Anthropometry
        addAnthropometryLog, updateThreeDayWeights,
        // Videos
        uploadClientVideo, reviewVideo,
        // Clients
        updateClient, addClient,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
