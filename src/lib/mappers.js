// @ts-check
/**
 * Frontera entre el `snake_case` de Postgres y el `camelCase` que consumen los
 * componentes. Toda conversión vive aquí: si cambia una columna, se cambia en
 * un solo sitio y ninguna vista se entera.
 */

import { toNum } from '@/lib/num';
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
  /*
    La pausa y las etiquetas (migración 0093). Sin ella llegan `undefined` y
    caen a sus vacíos —sin fecha de vuelta, sin etiquetas— y nada se rompe:
    `pauseOf` solo mira `status`, y una lista vacía no se pinta.
  */
  pausedUntil: row.paused_until ?? null,
  tags: Array.isArray(row.tags) ? row.tags : [],
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
  pausedUntil: 'paused_until',
  tags: 'tags',
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
  /* Hasta cuándo su entrenador le ha abierto esta revisión pasada (0134). `null`
     sin reapertura, que es lo normal: entonces manda el margen de cuatro semanas. */
  abiertaHasta: row.abierta_hasta || null,
});

export const mapEventFromDb = (row) => ({
  id: row.id,
  clientId: row.client_id,
  date: row.date,
  kind: row.kind,
  title: row.title,
  done: row.done,
  createdBy: row.created_by,
  /* Privada = solo la ve quien lleva a ese cliente (0106). Al cliente RLS ni se
     las manda, así que aquí siempre llega `false` en su portal; se mapea igual
     porque el calendario del entrenador sí necesita distinguirlas para decirlo
     en pantalla. Sin la migración no viene la columna: `false`, que es como se
     comportaba todo antes de que existiera. */
  privada: row.privada === true,
  /* El plan apunta aquí (0122). Sin la migración no viene la columna: `false`,
     que es un calendario sin anclas — exactamente lo de antes. */
  ancla: row.ancla === true,
  /* Los datos de la competición, en crudo: los sanea `competicionDe`
     (`domain/calendar.js`), que es quien sabe su forma. */
  competicion: row.competicion ?? null,
  /* Lo que dura y las kcal de una intervención (0123). El último día, incluido,
     como `ends_on` en las fases; nulo es un día. Sin la migración no vienen:
     un evento de un día y sin kcal, que es lo de antes. */
  hasta: row.hasta ?? null,
  kcal: row.kcal === null || row.kcal === undefined ? null : Number(row.kcal),
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
  /* La pregunta que decide el cruce (0125). Vacía, o sin la migración, `''`:
     la pantalla de Plan la pide y las ramas se leen por su frase. */
  nextQuestion: typeof row.next_question === 'string' ? row.next_question : '',
  /* Los replanteos de la fase (0123), en crudo: los sanea `replanteosDe`
     (`domain/roadmap.js`), que es quien sabe su forma. `null` si no hay. */
  replanteos: Array.isArray(row.replanteos) ? row.replanteos : null,
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
  nextQuestion: 'next_question',
  replanteos: 'replanteos',
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
    /* Vacía es `null`: la base no admite una pregunta de cero letras ni una
       pregunta sin caminos (0125). */
    else if (column === 'next_question') out[column] = String(value ?? '').trim() || null;
    else if (column === 'next_options' || column === 'replanteos') {
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
  /* Solo si la fila la trae (0133): sin la columna, el programa no lleva la
     clave y `mapWorkoutToDb` no la manda. Ver `domain/borradores`. */
  ...(Array.isArray(row.draft_blocks) ? { draftBlocks: row.draft_blocks } : {}),
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
  /* Los borradores, si el programa los leyó o los tiene: una lista vacía SÍ se
     manda, porque es quitar el último. Sin la clave no se toca la columna. */
  ...(Array.isArray(data.draftBlocks) ? { draft_blocks: data.draftBlocks } : {}),
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
  /* Los días y el reparto del ciclo (migración 0111). Vacíos mientras el plan
     quepa en las columnas de arriba: ver «LOS DÍAS DE LA DIETA» en
     `domain/nutrition.js`. Con la lista puesta, ELLA manda y lo de arriba es su
     reflejo. */
  days: row.days || [],
  week: row.week || {},
});

/**
 * ── El reflejo de los dos primeros días en las columnas de siempre ──────────
 *
 * Con `days` escrito, el plan tiene N días y las columnas viejas solo saben de
 * uno o dos. Se siguen escribiendo igualmente, por POSICIÓN: el primer día a
 * las columnas principales y el segundo al de descanso.
 *
 * No es por nostalgia. Un plan lo leen por su cuenta la copia de seguridad
 * (`scripts/backup.mjs`), la radiografía y cualquier cliente que todavía tenga
 * abierta la versión anterior de la aplicación. Sin el reflejo, todos ellos
 * verían una dieta vacía; con él ven los dos primeros días, que es incompleto
 * pero no es falso.
 *
 * `days` y `week` solo se envían si hay algo que enviar. Es la misma cautela
 * que `blocks` en `mapWorkoutToDb`: quien nunca añada un tercer día nunca toca
 * las columnas nuevas, así que el código puede desplegarse antes que la 0111.
 */
export const mapNutritionToDb = (clientId, data) => {
  const dias = data.days?.length ? data.days : null;
  const primero = dias?.[0] || null;
  const segundo = dias?.[1] || null;
  /*
    `numerico` es el guardián de la frontera, y está aquí porque la columna es
    `numeric`: una casilla vacía viaja como `''` desde cualquier formulario y
    Postgres rechaza la fila ENTERA con «invalid input syntax for type numeric»,
    así que un macro sin poner tumbaba el guardado del objetivo de kcal. Lo
    normaliza `setDayTargets` en el dominio; esto es el cinturón, y además deja
    pasar lo que ya estuviera en cola de escritura con el `''` dentro.
  */
  const numerico = (v) => (v === '' || v === undefined ? null : v);
  const objetivo = (dia, campo, porDefecto) =>
    numerico(dia ? dia.targets?.[campo] ?? null : porDefecto);

  return {
    client_id: clientId,
    type: data.type,
    target_kcals: objetivo(primero, 'targetKcals', data.targetKcals),
    protein_grams: objetivo(primero, 'proteinGrams', data.proteinGrams),
    carbs_grams: objetivo(primero, 'carbsGrams', data.carbsGrams),
    fats_grams: objetivo(primero, 'fatsGrams', data.fatsGrams),
    steps_goal: data.stepsGoal,
    cardio_goal: data.cardioGoal,
    habits_notes: data.habitsNotes,
    has_day_variants: dias ? dias.length > 1 : data.hasDayVariants,
    meals: segundo
      ? { restTargets: segundo.targets }
      : data.restTargets
        ? { restTargets: data.restTargets }
        : [],
    closed_meals: dias ? (dias.length === 1 ? primero.meals : []) : data.closedMeals,
    closed_meals_training: dias ? (dias.length > 1 ? primero.meals : []) : data.closedMealsTraining,
    closed_meals_rest: dias ? segundo?.meals || [] : data.closedMealsRest,
    ...(dias ? { days: dias, week: data.week || {} } : {}),
    updated_at: new Date().toISOString(),
  };
};

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
  /* La ficha del ejercicio (0094): qué necesita y cómo se hace. Solo la traen
     las filas del CATÁLOGO — la biblioteca no tiene estas columnas y aquí
     llegan `null`, que es la verdad: la ficha es del catálogo y se busca en él
     por nombre. */
  equipment: row.equipment ?? null,
  description: row.description ?? null,
  /* La capa del ENTRENADOR (0098), que es lo contrario de la anterior: no es un
     hecho del ejercicio sino suyo —su vídeo, su clave, sus cambios—, y por eso
     vive en la biblioteca y no en el catálogo. Las filas del catálogo llegan sin
     estas columnas y valen `null` / `[]`, que es la verdad. */
  videoUrl: row.video_url ?? null,
  cue: row.cue ?? null,
  /* `row.alternatives` existe en la tabla (0098) y ya no se lee: las
     alternativas se retiraron del producto. La columna se queda —borrarla es
     irreversible— pero no entra en el modelo. Ver `domain/training.js`. */
});

/**
 * Una pieza del cajón del entrenador (0112): un bloque, un día o un plato
 * guardado con nombre. Ver `domain/cajon.js`.
 *
 * `savedAt` y no `createdAt` porque es como se llama en el producto desde que
 * existen las piezas y los platos, y es lo que la fila enseña: cuándo lo
 * guardaste. La columna de la tabla es `created_at` porque ahí es una fila.
 */
/*
  ── EL PUENTE DE LA 0114, Y POR QUÉ SE LEE AQUÍ ────────────────────────────
  Los platos se guardaron como `kind: 'comida'` hasta que el plato tuvo forma
  propia en el portapapeles (`TIPO.PLATO`). La 0114 reescribe esas filas, pero
  entre que se despliega el código y se aplica la migración —o si se aplica en
  el otro orden— un `kind` que ya nadie conoce no se enseña en ningún tramo, y
  el entrenador vería su vitrina de platos VACÍA sin que nada se lo dijera. Que
  es exactamente el dato falso contra el que se escribió el puente de `useCajon`.

  Se traduce al leer, que no cuesta nada y no puede llegar tarde. Se retira
  cuando la 0114 esté aplicada en todas partes.
*/
export const mapCajonFromDb = (row) => ({
  id: row.id,
  kind: row.kind === 'comida' ? 'plato' : row.kind,
  name: row.name,
  savedAt: row.created_at ?? null,
  coachId: row.coach_id ?? null,
  carga: row.carga || {},
});

export const mapLibraryFoodFromDb = (row) => ({
  id: row.id,
  name: row.name,
  coachId: row.coach_id ?? null,
  /* Cómo lo clasificas TÚ (0103). Antes esto sólo lo tenía el catálogo y la
     pantalla lo buscaba por nombre, así que un alimento tuyo era «Sin
     clasificar» para siempre y no salía bajo ninguna categoría del filtro. Sin
     la migración aplicada la columna no llega y vale `null`, que significa
     exactamente eso: sin clasificar. */
  category: row.category ?? null,
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
  /* Las etiquetas: hechos del alimento —gluten, lactosa…—. Del catálogo desde
     la 0094 y de TU biblioteca desde la 0102, que es lo que hacía falta para
     que el aviso de alérgeno no se callara justo con tus marcas y tus
     suplementos. Sin la columna llega la lista vacía, que significa «no dice». */
  tags: Array.isArray(row.tags) ? row.tags : [],
  /*
    Las cuatro del envase (0102). `null` es «NO DICE» y NO es cero, y esa
    distinción es la razón de ser de `micros.js`: sin ella, el total de fibra de
    un día en el que la mitad de los alimentos no la declaran se leería como una
    medida cuando es un suelo. Sin la migración aplicada la columna no llega y
    vale `null`, que es exactamente lo que significa.

    Sin convertir: `numeric` llega de PostgREST como cadena y quien la lee es
    `toNum`, en el dominio. Un `Number('')` aquí sería el cero que todo esto
    evita.
  */
  fiberPer100: row.fiber_per_100g ?? null,
  sugarsPer100: row.sugars_per_100g ?? null,
  saturatesPer100: row.saturates_per_100g ?? null,
  saltPer100: row.salt_per_100g ?? null,
  /* Tu nota de compra (0100), que es lo contrario de la anterior: no es un
     hecho del alimento sino tuyo —«el de lata al natural, no en aceite»— y por
     eso vive en la biblioteca y no en el catálogo. Es la CLAVE DEL EJERCICIO
     aplicada a la comida. Las filas del catálogo llegan sin la columna y valen
     `null`, que es la verdad: no dice. */
  note: row.note ?? null,
});

const MICRO_COLUMNAS = {
  fiberPer100: 'fiber_per_100g',
  sugarsPer100: 'sugars_per_100g',
  saturatesPer100: 'saturates_per_100g',
  saltPer100: 'salt_per_100g',
};

/**
 * Las cuatro del envase, de vuelta a sus columnas (0102).
 *
 * El camino de ida vive unas líneas más arriba y este es el de vuelta: los dos
 * nombres de cada cifra se escriben en el mismo sitio, que es lo que evita que
 * un día se guarde en `sugar_per_100g` lo que se lee de `sugars_per_100g`.
 *
 * ══ Solo lo que quien llama TRAE ═══════════════════════════════════════════
 *
 * Y esto no es una optimización: es la diferencia entre corregir un alimento y
 * vaciarlo. `upsertByName` escribe **los campos que se le pasan**, así que una
 * clave presente con valor `null` BORRA lo que hubiera. Eso es justo lo que se
 * quiere cuando la ficha manda las cuatro casillas y una está en blanco —así se
 * borra una cifra mal copiada de un envase—, y es un desastre cuando quien
 * llama es el lápiz de la dieta (`editFood`), que solo sabe de macros y unidad
 * y no tiene ninguna opinión sobre la fibra.
 *
 * Con la clave ausente, la columna ni se menciona y la base conserva la suya.
 */
export const foodMicrosToDb = (food) => {
  const out = {};
  for (const [clave, columna] of Object.entries(MICRO_COLUMNAS)) {
    if (food && clave in food) out[columna] = toNum(food[clave]);
  }
  return out;
};

// ── Fotos de progreso ──────────────────────────────────────────────────────

/**
 * ── Fotos de progreso: de dónde se lee cada cosa ───────────────────────────
 * La base es `id, client_id, photo_url, tag, created_at` (`0000`). La `0001`
 * añadió además `angle`, `weight`, `notes` y `taken_on`, y está aplicada en
 * local y en producción (comprobado el 22 sep 2026), pero la aplicación NO las
 * usa: las rellenó una vez a partir de `tag` y desde entonces nadie las escribe,
 * así que en las fotos nuevas están vacías. No existe `date` (de ahí el error
 * «column progress_photos.date does not exist», que tumbaba la carga de TODAS
 * las fotos).
 *
 * Lo que la aplicación lee y escribe:
 *   · semana  → en la RUTA del archivo en Storage (`…/week-12/…`), que además
 *               crea carpetas por semana de verdad en el bucket.
 *   · fecha   → `created_at`.
 *   · ángulo, peso, notas y lado declarado → un objeto JSON compacto en `tag`.
 *
 * `tag` es la única fuente de verdad. Leer `angle` o `weight` de sus columnas
 * da datos viejos o nulos; si algún día se pasan a columnas de verdad, hay que
 * volver a copiar `tag` en ellas (incluido `lado`) y escribir en las dos.
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

/*
  `lado` es el lado DECLARADO de una lateral antigua (22 sep 2026): el ángulo
  sigue siendo `lateral` —es lo que se subió— y el lado es lo que el entrenador
  vio en la foto. Por eso va aparte y no pisa `angle`: quitarlo deja la foto
  exactamente como estaba. Ver `ladoDeLaFoto` en `domain/photos`.
*/
const buildTag = ({ angle, weight, notes, lado }) => {
  const payload = {};
  if (angle) payload.angle = angle;
  if (lado === 'izquierdo' || lado === 'derecho') payload.lado = lado;
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
    /* El ángulo con el que se SUBIÓ, que es el de la ruta: una lateral antigua
       sigue siéndolo aunque luego se le cambie el ángulo a mano. */
    origen: fromPath.angle,
    lado: meta.lado === 'izquierdo' || meta.lado === 'derecho' ? meta.lado : null,
    weight: meta.weight ?? null,
    notes: meta.notes || '',
    date: (row.created_at || '').slice(0, 10) || null,
    /* La hora entera: el entrenador ve si una foto se subió después de su semana. */
    creadaEl: row.created_at || null,
  };
};

export const mapPhotoToDb = ({ clientId, path, angle, weight, notes, lado }) => ({
  client_id: clientId,
  photo_url: path,
  tag: buildTag({ angle, weight, notes, lado }),
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
 *
 * ── El índice, y qué pasa sin la 0110 ───────────────────────────────────────
 * `microcycle_weeks` y `blocks` son de la 0110 y sirven para lo mismo que el
 * `indice` que arma `trainingSummary`: saber por qué microciclo va cada uno y si
 * tiene hoja escrita para la semana siguiente. Sin la migración aplicada llegan
 * `undefined` y el índice queda vacío — mismo trato que `conFacturacion` arriba:
 * la barra no pinta microciclo y la cola de «sin semana siguiente» sale a cero,
 * que es preferible a inventarse un horizonte que no se ha podido leer.
 */
export const mapTrainingSummaryFromDb = (row) => ({
  clientId: row.client_id,
  lastTraining: row.last_training || null,
  sessionCount: row.session_count || 0,
  microcycleCount: row.microcycle_count || 0,
  recentSessions: Array.isArray(row.recent_sessions) ? row.recent_sessions : [],
  /* La semana más alta montada, como en `trainingSummary`: es el último recurso
     del reloj (`semanaDeAhora`) para quien no tiene fecha de alta. */
  weekNumber: Array.isArray(row.microcycle_weeks) && row.microcycle_weeks.length > 0
    ? Math.max(...row.microcycle_weeks)
    : null,
  indice: {
    microcycles: (Array.isArray(row.microcycle_weeks) ? row.microcycle_weeks : []).map((weekNumber) => ({
      weekNumber,
    })),
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
  },
});
