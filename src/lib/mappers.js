// @ts-check
/**
 * Frontera entre el `snake_case` de Postgres y el `camelCase` que consumen los
 * componentes. Toda conversión vive aquí: si cambia una columna, se cambia en
 * un solo sitio y ninguna vista se entera.
 */

import { isRemoteUrl, parsePhotoPath } from '@/domain/photos';
import { cleanCondition } from '@/domain/conditions';
import { cleanProfile } from '@/domain/profile';

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
  /*
    Cuánto paga y cada cuánto (migración 0058). `plan` es el NOMBRE de lo que le
    vendiste —texto libre— y esto es su precio: dos cosas distintas que antes
    tenían que caber en la misma casilla.

    Postgres devuelve `numeric` como cadena para no perder precisión, así que se
    convierte aquí. Sin este Number, comparar la tarifa con un número —que es lo
    que hace `feeLabel`— daría resultados absurdos. Es el mismo cuidado que ya se
    tiene con `rate_pct` más abajo.
  */
  feeAmount: row.fee_amount === null || row.fee_amount === undefined ? null : Number(row.fee_amount),
  billingPeriod: row.billing_period ?? null,
  youtubeExplanationUrl: row.youtube_explanation_url,
  avatar: row.avatar,
  startDate: row.start_date,
  cycleType: row.cycle_type || 'weekly',
  cyclePattern: row.cycle_pattern || { train: 2, rest: 1 },
  /*
    Quién es la persona (migración 0076). Mientras no esté aplicada llegan
    `undefined` y caen a `null`, que es lo mismo que «no lo ha puesto»: la ficha
    enseña el hueco y nada se rompe.

    La EDAD no está aquí porque no está en la base: se deriva de la fecha cada
    vez que se pinta (`domain/ficha.js`). Guardarla sería guardar algo que
    caduca solo — el error que costó `current_weight` en la 0048.

    `height_cm` es `numeric`, y Postgres devuelve los `numeric` como CADENA para
    no perder precisión. Sin este Number, comparar la altura con un número daría
    resultados absurdos; es el mismo cuidado que ya se tiene con `fee_amount`.
  */
  birthDate: row.birth_date ?? null,
  heightCm:
    row.height_cm === null || row.height_cm === undefined ? null : Number(row.height_cm),
  /*
    Lo que el cliente cuenta de sí mismo (migración 0078): cómo entrena, cómo
    come y cómo es su día. Pasa por `cleanProfile` al leerlo y no solo al
    escribirlo, por el mismo motivo que los condicionantes: un campo que se
    retire del catálogo mañana tiene que dejar de pintarse hoy, sin que nadie
    tenga que limpiar la columna de veinte clientes.

    Sin la migración llega `undefined` y queda `{}`: los tres bloques enseñan su
    estado vacío y nada se rompe.
  */
  profile: cleanProfile(row.profile),
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
  birthDate: 'birth_date',
  heightCm: 'height_cm',
  profile: 'profile',
  onboardingComplete: 'onboarding_complete',
  postureReviewed: 'posture_reviewed',
  paymentStatus: 'payment_status',
  nextPaymentDate: 'next_payment_date',
  feeAmount: 'fee_amount',
  billingPeriod: 'billing_period',
  youtubeExplanationUrl: 'youtube_explanation_url',
  avatar: 'avatar',
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

// ── Cobros a clientes (migraciones 0010, 0012 y 0072) ──────────────────────

/**
 * Un apunte del libro de cobros del entrenador.
 *
 * OJO con el nombre: esto NO es lo que el entrenador paga por usar la
 * aplicación —eso es `mapPlanFromDb`, más abajo—, sino lo que sus clientes le
 * pagan a él. Las dos cosas se llaman «pagos» y sumarlas por error daría una
 * cifra que no significa nada.
 *
 * `source` (0072) distingue lo que dijo Notion o Stripe de lo que apuntó el
 * entrenador al pulsar «Cobrado». No es cosmética: dice cuánto te puedes fiar de
 * la suma, y la pantalla de Ingresos lo escribe.
 *
 * `clientId` puede venir vacío a propósito: un cobro importado cuyo nombre no se
 * ha conciliado todavía se guarda sin cliente y hay que poder verlo para
 * asignarlo. Como `feeAmount`, el `numeric` llega de Postgres como cadena.
 */
export const mapPaymentFromDb = (row) => ({
  id: row.id,
  clientId: row.client_id ?? null,
  externalLabel: row.external_label ?? null,
  amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
  currency: row.currency || 'EUR',
  paidOn: row.paid_on ?? null,
  periodEnd: row.period_end ?? null,
  status: row.status ?? null,
  isPaid: Boolean(row.is_paid),
  source: row.source || 'integration',
  // Lo que Stripe sabe y un apunte suelto no (migración 0012): el último intento
  // de cobro falló. Es el aviso más accionable de todos, y no es un ingreso.
  paymentFailed: Boolean(row.payment_failed),
  subscriptionStatus: row.subscription_status ?? null,
});

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
  /* La foto del plan al cerrar la revisión (migración 0042). `null` en las
     anteriores: entonces no se guardaba, y no se puede reconstruir. */
  snapshot: row.snapshot || null,
  /*
    Lo que contestó al cuestionario de la semana (migración 0060): un mapa de
    `id de pregunta → texto`, con la misma forma que `Session.feedback`. `null`
    —y no `{}`— en los check-ins anteriores: entonces no se preguntaba nada, y un
    objeto vacío se leería como «se le preguntó y no contestó», que es otra cosa.
  */
  answers: row.answers || null,
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
  /*
    Los caminos que salen del final de esta fase (migración 0073), o `null` si no
    hay cruce planteado — que es el caso de casi todas.

    Todo lo que no sea una lista se queda en `null`, incluido el `undefined` de
    una base sin la 0073: así `hasFork` responde que no en vez de recibir algo
    que no sabe mirar. Ver `domain/fork.js`.
  */
  nextOptions: Array.isArray(row.next_options) ? row.next_options : null,
});

// ── Condicionantes (migración 0077) ────────────────────────────────────────

/**
 * Una lesión, una patología o una alergia.
 *
 * Pasa por `cleanCondition` en vez de copiar campos a mano, y no es ceremonia:
 * ahí es donde un `area` desconocido cae en «entrenamiento» en lugar de dejar la
 * fila invisible en las dos secciones. Una fila escrita a mano en la base —o de
 * una versión futura con un área más— tiene que seguir viéndose en alguna parte.
 *
 * Devuelve `null` si la fila no tiene etiqueta. Quien mapea una lista filtra:
 * pintar un condicionante sin nombre sería pintar una fila que no se puede leer
 * ni borrar.
 */
export const mapConditionFromDb = (row) =>
  cleanCondition({
    id: row.id,
    clientId: row.client_id,
    label: row.label,
    detail: row.detail,
    area: row.area,
    severity: row.severity,
    since: row.since,
    resolvedAt: row.resolved_at,
  });

const CONDITION_COLUMNS = {
  label: 'label',
  detail: 'detail',
  area: 'area',
  severity: 'severity',
  since: 'since',
  resolvedAt: 'resolved_at',
};

/** Convierte solo las claves presentes: sirve para crear y para actualizar. */
export const mapConditionToDb = (fields) => {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    const column = CONDITION_COLUMNS[key];
    /* La cadena vacía se manda como NULL: `detail`, `since` y `resolved_at`
       admiten nulo y NO admiten «», que para una `date` es un error de Postgres
       y para el texto es un detalle que existe pero está en blanco. */
    if (column) out[column] = value === '' ? null : value;
  }
  return out;
};

// ── Soporte (migración 0034) ───────────────────────────────────────────────

/**
 * Un ticket. `email` y `name` llegan del `profiles` embebido y solo cuando quien
 * consulta es soporte: para el dueño del ticket sobran —ya sabe quién es— y RLS
 * no le devuelve el perfil de nadie más.
 */
export const mapTicketFromDb = (row) => ({
  id: row.id,
  profileId: row.profile_id,
  teamId: row.team_id ?? null,
  subject: row.subject,
  status: row.status,
  context: row.context || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  authorName: row.profiles?.full_name || '',
  authorEmail: row.profiles?.email || '',
  messages: (row.support_messages || []).map(mapTicketMessageFromDb),
});

export const mapTicketMessageFromDb = (row) => ({
  id: row.id,
  ticketId: row.ticket_id,
  authorId: row.author_id ?? null,
  fromSupport: Boolean(row.from_support),
  body: row.body,
  createdAt: row.created_at,
  /*
    La RUTA del adjunto (migración 0039), no su URL: el bucket es privado y lo
    que se firma caduca. `attachmentUrl` lo rellena quien carga los tickets,
    firmando todas las rutas del hilo de una vez, y se queda en `null` cuando el
    archivo ya no está — que se enseña distinto a no tener ninguno.
  */
  attachmentPath: row.attachment_path ?? null,
  attachmentUrl: null,
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
  nextOptions: 'next_options',
};

/**
 * ── Por qué cada columna trata el vacío a su manera ─────────────────────────
 * La primera versión convertía `''` en `null` para TODAS, pensando solo en la
 * fecha de fin. Pero `note` es `NOT NULL DEFAULT ''` en la base, así que guardar
 * una fase sin nota —el caso normal— mandaba `null` y Postgres la rechazaba con
 * «null value in column "note" violates not-null constraint».
 *
 * Son tres vacíos distintos y no se pueden tratar igual:
 *
 *   · **`ends_on` vacío es `null`** y significa algo: fase abierta, sin final
 *     decidido (ver la migración 0028).
 *   · **`note` vacía es una cadena vacía** y significa «no hay nota». Un `null`
 *     ahí no es «sin nota», es una violación de esquema.
 *   · **`next_options` vacío es `null`**, nunca `[]`: la base solo admite dos o
 *     tres caminos o ninguno (`client_phases_next_options_shape`, 0073), así que
 *     una lista vacía —que es como queda al decidir— la rechazaría el CHECK.
 */
export const mapPhaseToDb = (fields) => {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    const column = PHASE_COLUMNS[key];
    if (!column) continue;

    if (column === 'ends_on') out[column] = value === '' ? null : value;
    else if (column === 'note') out[column] = value ?? '';
    else if (column === 'next_options') {
      out[column] = Array.isArray(value) && value.length > 0 ? value : null;
    } else out[column] = value;
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
  blocks: row.blocks || [],
});

export const mapWorkoutToDb = (clientId, data) => ({
  client_id: clientId,
  weekly_split: data.weeklySplit,
  mobility_drills: data.mobilityDrills,
  notes: data.notes,
  microcycles: data.microcycles,
  /* Solo si hay bloques: así el código puede desplegarse antes que la migración
     0086 —quien nunca abra un bloque nunca envía la columna—. */
  ...(data.blocks?.length ? { blocks: data.blocks } : {}),
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
  /* El cardio de alta intensidad (migración 0059). Texto libre igual que los
     pasos, y por el mismo motivo: se prescribe de mil maneras y ninguna cabe en
     dos números. */
  cardioGoal: row.cardio_goal,
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
  cardio_goal: data.cardioGoal,
  habits_notes: data.habitsNotes,
  has_day_variants: data.hasDayVariants,
  meals: data.restTargets ? { restTargets: data.restTargets } : [],
  closed_meals: data.closedMeals,
  closed_meals_training: data.closedMealsTraining,
  closed_meals_rest: data.closedMealsRest,
  updated_at: new Date().toISOString(),
});

// ── Bibliotecas del coach ──────────────────────────────────────────────────
//
// `coachId` es QUIÉN DIO DE ALTA la entrada, y no es decoración: desde la 0006
// la biblioteca es del EQUIPO —cualquier miembro la lee y las políticas le
// dejan escribirla entera—, así que la única forma de saber que una entrada es
// tuya es esta columna. Es lo que decide si se puede corregir (ver
// `canEditLibraryItem` en `domain/catalog.js`).
//
// Las filas del CATÁLOGO no la traen —son globales y sin dueño (0033)—, así que
// ahí llega `null`, que es exactamente lo que significa: no es de nadie, y no se
// toca desde el navegador.

export const mapLibraryExerciseFromDb = (row) => ({
  id: row.id,
  name: row.name,
  muscle: row.muscle_group,
  coachId: row.coach_id ?? null,
});

export const mapLibraryFoodFromDb = (row) => ({
  id: row.id,
  name: row.name,
  coachId: row.coach_id ?? null,
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
        /*
          Los tres de la 0067, con el mismo trato que `conFacturacion`: llegan
          `undefined` mientras la migración no esté aplicada y se dejan en `null`,
          que cada pantalla distingue de `false` para no anunciar un capado que
          la base todavía no impone.

          `maxStorageMb` en `null` significa DOS cosas —migración pendiente o
          plan sin tope— y da igual: en ambas la pantalla no pinta tope. La
          señal de «la migración está» es `storageBytes`, que con la 0067
          aplicada siempre trae un número.
        */
        hasAuditLog: row.con_registro ?? null,
        maxStorageMb: row.max_almacen_mb ?? null,
        storageBytes: row.almacen_bytes ?? null,
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
