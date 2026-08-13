// @ts-check
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
  // Si es null, este cliente NO puede entrar en su portal: no hay ninguna cuenta
  // enlazada con su ficha. Es lo que decide si se le muestra el botón de invitar.
  // No está en CLIENT_COLUMNS a propósito: se escribe solo desde
  // `claim_client_invite` (migración 0015), nunca desde el navegador.
  clientProfileId: row.client_profile_id ?? null,
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
  // Equipos (migración 0006). Mientras no esté aplicada llegan `undefined`, y
  // `assignedTo` cae en `coach_id`, que es exactamente lo que significaba antes:
  // el entrenador responsable. Así ninguna vista necesita distinguir los dos
  // mundos.
  teamId: row.team_id ?? null,
  assignedTo: row.assigned_to ?? row.coach_id ?? null,
  // Objeto abierto: la app ignora lo que no conoce y aplica valores por
  // defecto a lo que falta (ver domain/preferences.js).
  preferences: row.preferences || {},
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
  assignedTo: 'assigned_to',
  // `preferences` NO está aquí a propósito, aunque se lea arriba: no se escribe
  // con un UPDATE a `clients` sino con la función `set_client_preferences`
  // (migración 0008), porque RLS filtra filas y no columnas. Dejarla disponible
  // aquí abriría un segundo camino de escritura que el cliente no puede usar.
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

// ── Check-ins (migración 0009) ─────────────────────────────────────────────

/**
 * Un check-in semanal cerrado.
 *
 * `submittedAt` y `reviewedAt` son las dos fechas que hacen posible el aviso al
 * entrenador: entregado y sin revisar es exactamente la bandeja de trabajo.
 */
export const mapCheckInFromDb = (row) => ({
  id: row.id,
  clientId: row.client_id,
  weekStart: row.week_start,
  programWeek: row.program_week,
  weight: row.weight,
  notes: row.notes || '',
  submittedAt: row.submitted_at,
  reviewedAt: row.reviewed_at,
  reviewedBy: row.reviewed_by,
  coachNotes: row.coach_notes || '',
});

export const mapEventFromDb = (row) => ({
  id: row.id,
  clientId: row.client_id,
  date: row.date,
  kind: row.kind,
  title: row.title,
  done: row.done,
  createdBy: row.created_by,
});

// ── Fases del roadmap (migración 0028) ─────────────────────────────────────

/**
 * Un tramo del plan.
 *
 * `endsOn` puede ser null y eso significa «abierta», no «falta el dato»: es la
 * última fase, la que sigue en curso sin final decidido. Ver `domain/roadmap.js`.
 */
export const mapPhaseFromDb = (row) => ({
  id: row.id,
  clientId: row.client_id,
  title: row.title,
  direction: row.direction,
  // Postgres devuelve `numeric` como cadena para no perder precisión. Sin este
  // Number, `ratePct` llega como "0.6" y cualquier comparación con un número
  // —que es lo que hace `rateVerdict`— empieza a dar resultados absurdos.
  ratePct: Number(row.rate_pct ?? 0),
  startsOn: row.starts_on,
  endsOn: row.ends_on ?? null,
  note: row.note || '',
  createdBy: row.created_by ?? null,
});

/**
 * Un alimento del catálogo común (migración 0033).
 *
 * Devuelve la MISMA forma que `mapLibraryFoodFromDb` más `category`, y eso es
 * deliberado: así el buscador puede mezclar las dos listas sin distinguirlas y
 * `upsertLibraryFood` puede copiar uno del catálogo sin traducir nada por el
 * camino. `id` viene del catálogo y se descarta al copiar —la fila nueva de tu
 * biblioteca tiene el suyo—.
 */
export const mapCatalogFoodFromDb = (row) => ({
  ...mapLibraryFoodFromDb(row),
  category: row.category || 'Otros',
});

const PHASE_COLUMNS = {
  title: 'title',
  direction: 'direction',
  ratePct: 'rate_pct',
  startsOn: 'starts_on',
  endsOn: 'ends_on',
  note: 'note',
};

export const mapPhaseToDb = (fields) => {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    const column = PHASE_COLUMNS[key];
    // `endsOn: null` es un valor con significado —cerrar una fase abierta—, así
    // que se comprueba la columna y no la verdad del valor.
    if (column) out[column] = value === '' ? null : value;
  }
  return out;
};

// ── Rutina ─────────────────────────────────────────────────────────────────

/**
 * La frontera: de la fila de Postgres al contrato que usa el dominio.
 * @returns {import('@/types').WorkoutData}
 */
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

/**
 * ── Dónde se guarda el objetivo de los días de descanso ─────────────────────
 * Cuando el cliente tiene dieta de entreno y de descanso hacen falta DOS
 * objetivos de kcal y macros, y la tabla solo tiene un juego de columnas
 * (`target_kcals`, `protein_grams`…).
 *
 * Las columnas principales guardan el objetivo de los días de ENTRENO (o el
 * único, si no hay variantes), y el de descanso va en la columna `meals`, que es
 * un jsonb heredado de una versión anterior y que la aplicación no usa para
 * nada más.
 *
 * Es un compromiso consciente: evita una migración y queda contenido en este
 * archivo. La migración que lo normaliza está preparada en
 * `supabase/migrations/0004_nutrition_rest_targets.sql`; en cuanto se aplique,
 * basta cambiar estas dos funciones.
 */
const readRestTargets = (raw) => {
  if (!raw || Array.isArray(raw)) return null; // '[]' es el valor heredado
  const rest = raw.restTargets || raw;
  const keys = ['targetKcals', 'proteinGrams', 'carbsGrams', 'fatsGrams'];
  if (!keys.some((k) => rest?.[k] !== undefined)) return null;
  return Object.fromEntries(keys.map((k) => [k, rest[k] ?? null]));
};

export const mapNutritionFromDb = (row) => ({
  type: row.type,
  targetKcals: row.target_kcals,
  proteinGrams: row.protein_grams,
  carbsGrams: row.carbs_grams,
  fatsGrams: row.fats_grams,
  stepsGoal: row.steps_goal,
  habitsNotes: row.habits_notes || [],
  hasDayVariants: row.has_day_variants || false,
  restTargets: readRestTargets(row.meals),
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
  meals: data.restTargets ? { restTargets: data.restTargets } : [],
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
  /*
    Unidades (migración 0030). Las dos van juntas o no va ninguna —lo garantiza un
    CHECK—, así que basta comprobar una para saber si este alimento se puede
    contar en piezas. `numeric` llega como cadena: sin el Number, «2 × '55'» sería
    concatenación en vez de multiplicación.
  */
  unitLabel: row.unit_label ?? null,
  unitGrams: row.unit_grams === null || row.unit_grams === undefined ? null : Number(row.unit_grams),
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
// ── Plan del equipo ────────────────────────────────────────────────────────

/**
 * Lo que devuelve `my_team_plan()`.
 *
 * Llega vacío cuando la migración 0019 no está aplicada o el equipo no tiene fila
 * de suscripción. Se distingue de «plan sin límite» devolviendo `null`: son dos
 * cosas distintas y la pantalla las cuenta distinto —una es «falta configurar»,
 * la otra es «no hay tope»—.
 */
export const mapPlanFromDb = (row) =>
  row
    ? {
        teamId: row.team_id,
        plan: row.plan,
        label: row.label,
        status: row.status,
        activo: row.activo,
        clients: row.clientes ?? 0,
        maxClients: row.max_clientes ?? null,
        trialEndsAt: row.trial_ends_at || null,
        currentPeriodEnd: row.current_period_end || null,
        /*
          ¿Hay relación con Stripe? Decide si se ofrece el portal de facturación.

          Llega `undefined` mientras no esté aplicada la 0026, y entonces se cae
          en el criterio anterior: se ofrece a quien no está en prueba. Es peor
          —puede fallar al pulsarlo— pero es lo que había, y no romper con una
          migración pendiente es la regla del proyecto.
        */
        conFacturacion: row.con_facturacion ?? null,
      }
    : null;

// ── Resumen de entrenamiento ───────────────────────────────────────────────

/**
 * Lo que devuelve `training_summaries()` (migración 0024).
 *
 * La forma resultante es exactamente la de `trainingSummary` en
 * `domain/sessions.js`, y tiene que seguir siéndolo: la cartera mezcla los dos
 * orígenes —el resumen del servidor para veinte clientes, el derivado del programa
 * para el que está abierto— y no distingue cuál es cuál. Si divergieran, una ficha
 * cambiaría de aspecto solo por haberla abierto.
 *
 * `recent_sessions` llega como el array de sesiones tal cual está guardado, sin
 * transformar: quien calcula tonelaje y series es el dominio, con los mismos
 * objetos de siempre.
 */
export const mapTrainingSummaryFromDb = (row) => ({
  clientId: row.client_id,
  lastTraining: row.last_training || null,
  sessionCount: row.session_count || 0,
  microcycleCount: row.microcycle_count || 0,
  recentSessions: Array.isArray(row.recent_sessions) ? row.recent_sessions : [],
});
