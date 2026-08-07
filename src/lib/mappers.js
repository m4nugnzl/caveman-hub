/**
 * Frontera entre el `snake_case` de Postgres y el `camelCase` que consumen los
 * componentes. Toda conversión vive aquí: si cambia una columna, se cambia en
 * un solo sitio y ninguna vista se entera.
 */

import { isRemoteUrl, parsePhotoPath } from '@/domain/photos';

// ── Clientes ───────────────────────────────────────────────────────────────

export const mapClientFromDb = (row) => ({
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
  cycleType: row.cycle_type || 'weekly',
  cyclePattern: row.cycle_pattern || { train: 2, rest: 1 },
});

const CLIENT_COLUMNS = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  status: 'status',
  plan: 'plan',
  gender: 'gender',
  onboardingComplete: 'onboarding_complete',
  postureReviewed: 'posture_reviewed',
  paymentStatus: 'payment_status',
  nextPaymentDate: 'next_payment_date',
  gymEquipmentLink: 'gym_equipment_link',
  youtubeExplanationUrl: 'youtube_explanation_url',
  avatar: 'avatar',
  currentWeight: 'current_weight',
  startDate: 'start_date',
  cycleType: 'cycle_type',
  cyclePattern: 'cycle_pattern',
};

/** Convierte solo las claves presentes: sirve para crear y para actualizar. */
export const mapClientToDb = (fields) => {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    const column = CLIENT_COLUMNS[key];
    if (column) out[column] = value;
  }
  return out;
};

// ── Rutina ─────────────────────────────────────────────────────────────────

export const mapWorkoutFromDb = (row) => ({
  weeklySplit: row.weekly_split || {},
  mobilityDrills: row.mobility_drills || [],
  notes: row.notes || '',
  microcycles: row.microcycles || [],
});

export const mapWorkoutToDb = (clientId, data) => ({
  client_id: clientId,
  weekly_split: data.weeklySplit,
  mobility_drills: data.mobilityDrills,
  notes: data.notes,
  microcycles: data.microcycles,
  updated_at: new Date().toISOString(),
});

// ── Antropometría ──────────────────────────────────────────────────────────

/**
 * `anthropometry` solo tiene `history`. La columna `three_day_weights` que este
 * código asumía NO EXISTE, y por eso el upsert fallaba completo y no se
 * guardaba nada — ni el peso. El promedio de días alternos se calcula ahora a
 * partir de `history` (ver domain/anthropometry.js).
 */
export const mapAnthroFromDb = (row) => ({
  history: row.history || [],
});

export const mapAnthroToDb = (clientId, data) => ({
  client_id: clientId,
  history: data.history,
  updated_at: new Date().toISOString(),
});

// ── Nutrición ──────────────────────────────────────────────────────────────

export const mapNutritionFromDb = (row) => ({
  type: row.type,
  targetKcals: row.target_kcals,
  proteinGrams: row.protein_grams,
  carbsGrams: row.carbs_grams,
  fatsGrams: row.fats_grams,
  stepsGoal: row.steps_goal,
  habitsNotes: row.habits_notes || [],
  hasDayVariants: row.has_day_variants || false,
  closedMeals: row.closed_meals || [],
  closedMealsTraining: row.closed_meals_training || [],
  closedMealsRest: row.closed_meals_rest || [],
});

export const mapNutritionToDb = (clientId, data) => ({
  client_id: clientId,
  type: data.type,
  target_kcals: data.targetKcals,
  protein_grams: data.proteinGrams,
  carbs_grams: data.carbsGrams,
  fats_grams: data.fatsGrams,
  steps_goal: data.stepsGoal,
  habits_notes: data.habitsNotes,
  has_day_variants: data.hasDayVariants,
  closed_meals: data.closedMeals,
  closed_meals_training: data.closedMealsTraining,
  closed_meals_rest: data.closedMealsRest,
  updated_at: new Date().toISOString(),
});

// ── Bibliotecas del coach ──────────────────────────────────────────────────

export const mapLibraryExerciseFromDb = (row) => ({
  id: row.id,
  name: row.name,
  muscle: row.muscle_group,
});

export const mapLibraryFoodFromDb = (row) => ({
  id: row.id,
  name: row.name,
  proteinPer100: row.protein_per_100g,
  carbsPer100: row.carbs_per_100g,
  fatsPer100: row.fats_per_100g,
});

// ── Fotos de progreso ──────────────────────────────────────────────────────

/**
 * ── Fotos de progreso: qué columnas hay REALMENTE ──────────────────────────
 * `progress_photos` tiene solo `id, client_id, photo_url, tag, created_at`.
 * No existen `angle`, `weight`, `notes` ni `date`, que es lo que este código
 * asumía (de ahí el error «column progress_photos.date does not exist», que
 * tumbaba la carga de TODAS las fotos).
 *
 * Reparto de la información sobre lo que hay:
 *   · semana  → en la RUTA del archivo en Storage (`…/week-12/…`), que además
 *               crea carpetas por semana de verdad en el bucket.
 *   · fecha   → `created_at`.
 *   · ángulo, peso y notas → un objeto JSON compacto en `tag`.
 *
 * `tag` es una columna de texto libre sin uso previo. Meter JSON en ella es un
 * compromiso consciente: evita una migración y queda contenido en este archivo,
 * a cambio de no poder filtrar por ángulo o peso desde SQL (algo que la
 * aplicación hace en cliente de todas formas). Si algún día se normaliza, la
 * migración está preparada en `supabase/migrations/`.
 *
 * Las filas antiguas cuyo `tag` sea texto plano se interpretan como el ángulo.
 */
const parseTag = (tag) => {
  const raw = String(tag || '').trim();
  if (!raw) return {};
  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return { angle: raw };
};

const buildTag = ({ angle, weight, notes }) => {
  const payload = {};
  if (angle) payload.angle = angle;
  if (weight !== null && weight !== undefined) payload.weight = weight;
  if (notes) payload.notes = notes;
  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
};

export const mapPhotoFromDb = (row, clientName) => {
  const stored = row.photo_url || '';
  const remote = isRemoteUrl(stored);
  const path = remote ? null : stored;
  const fromPath = path ? parsePhotoPath(path) : { week: null, angle: null };
  const meta = parseTag(row.tag);

  return {
    id: row.id,
    clientId: row.client_id,
    clientName: clientName || '',
    path,
    url: remote ? stored : null,
    week: fromPath.week,
    angle: meta.angle || fromPath.angle || 'frontal',
    weight: meta.weight ?? null,
    notes: meta.notes || '',
    date: (row.created_at || '').slice(0, 10) || null,
  };
};

export const mapPhotoToDb = ({ clientId, path, angle, weight, notes }) => ({
  client_id: clientId,
  photo_url: path,
  tag: buildTag({ angle, weight, notes }),
});