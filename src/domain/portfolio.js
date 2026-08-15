/**
 * La cartera: todos los clientes a la vez.
 *
 * ── El problema que resuelve ─────────────────────────────────────────────────
 * Toda la aplicación está construida alrededor de UN cliente: eliges a alguien y
 * ves su rutina, su dieta y su progreso. Eso sirve para trabajar con él, pero no
 * para gestionar veinte. Con veinte, la pregunta del lunes por la mañana no es
 * «¿cómo va Marta?» sino **«¿a quién tengo que escribir hoy?»**, y responderla
 * obligaba a entrar cliente por cliente y mirar cuatro pestañas de cada uno.
 *
 * Este módulo invierte el planteamiento: en vez de mostrar datos y dejar que el
 * entrenador deduzca si hay un problema, detecta los problemas y los ordena.
 *
 * ── Criterio de las alertas ─────────────────────────────────────────────────
 * Cada alerta tiene que ser ACCIONABLE: algo que el entrenador pueda hacer hoy.
 * «Lleva 9 días sin entrenar» lo es; «su tonelaje bajó un 3%» no —eso es
 * analítica, y vive en su pestaña.
 *
 * Los umbrales son deliberadamente laxos. Un aviso a los 3 días sin entrenar
 * saltaría constantemente para quien entrena 3 días por semana, y una lista que
 * avisa siempre no avisa de nada.
 *
 * ── De qué se alimenta ──────────────────────────────────────────────────────
 * De un RESUMEN por cliente (`trainingSummary`), no de su programa. La cartera
 * necesita cuatro cifras de cada uno —cuándo entrenó, cuántas sesiones, cuántas
 * semanas programadas— y pedir el programa completo es lo que obligaba a
 * descargar varios MB por cliente al arrancar (`auditoria.md` 1.5).
 *
 * Sigue siendo cálculo puro sobre datos en memoria; lo que cambia es cuántos.
 */

import { clientIntake } from './intake';
import { clientProtocol, requiredBlocks } from './protocol';
import { emptyTrainingSummary } from './sessions';
import { weeklyCheckIn } from './anthropometry';
import { daysBetween, todayISO, weekStart } from '@/lib/dates';
import { buildWeeklySeries } from './analytics';
import { readingHeadline, weeklyReading } from './reading';

/**
 * ¿Está archivado?
 *
 * Un cliente archivado terminó su etapa: no aparece en la cartera, no sale en la
 * paleta, no genera alertas y **no cuenta para el límite del plan**. Todo lo suyo
 * sigue en la base de datos, así que si vuelve, vuelve con su historial.
 *
 * La comprobación es «distinto de archivado» y no «igual a activo» porque la
 * columna es antigua: hay filas con `NULL` de antes de que tuviera valor por
 * defecto, y un `NULL` ahí significa que no se archivó nunca. Es la misma
 * comparación que hace el disparador del límite en la base de datos, y tiene que
 * seguir siéndolo: si las dos discreparan, la aplicación enseñaría un recuento y
 * el servidor rechazaría el alta por otro.
 */
export const isArchived = (client) => client?.status === 'archived';

/** Umbrales, en un solo sitio para poder discutirlos sin buscarlos. */
export const THRESHOLDS = {
  noTraining: 7, // días sin registrar un entreno
  noWeight: 10, // días sin registrar un peso
  paymentSoon: 5, // días de antelación con los que avisar de una renovación
  noPhotos: 45, // días sin subir fotos de progreso
};

/** Gravedad de las alertas, de más a menos. El orden es el de la lista. */
const SEVERITY_ORDER = { alta: 0, media: 1, baja: 2 };

const lastDate = (dates) => {
  const valid = dates.filter(Boolean).sort();
  return valid.length > 0 ? valid[valid.length - 1] : null;
};

const daysSince = (date, today) => (date ? daysBetween(date, today) : null);

/**
 * Si un registro trae medido ese bloque.
 *
 * `buildAnthropometryLog` solo escribe `skinFolds` y `perimeters` cuando hay
 * algo dentro, así que basta con que la clave exista — pero se comprueba también
 * que no esté vacía, porque los registros antiguos y los importados no pasaron
 * necesariamente por ahí.
 */
const hasBlock = (log, block) => {
  const datos = block === 'folds' ? log?.skinFolds : log?.perimeters;
  return Boolean(datos) && Object.keys(datos).length > 0;
};

/**
 * Estado de un cliente: las cuatro fechas que importan, el check-in de la semana
 * y las alertas que se derivan de todo ello.
 */
/**
 * @param training  El resumen de entrenamiento (`trainingSummary`), no el programa
 *   completo. La cartera habla de veinte clientes a la vez y de cada uno solo
 *   necesita cuatro cifras; pedir el programa entero es lo que obligaba a
 *   descargarlo todo al arrancar. Ver `auditoria.md` 1.5.
 */
export const clientStatus = (
  { client, training, anthro, photos = [], checkIn: submitted = null },
  today = todayISO()
) => {
  const resumen = training || emptyTrainingSummary();
  const history = anthro?.history || [];

  const lastTraining = resumen.lastTraining;
  const lastWeight = lastDate(history.map((h) => h.date));
  const lastPhoto = lastDate(photos.map((p) => p.date));

  const checkIn = weeklyCheckIn(history, today);
  const alerts = [];

  const add = (id, severity, label, detail) => alerts.push({ id, severity, label, detail });

  /*
    ── Acceso ────────────────────────────────────────────────────────────────
    Sin cuenta enlazada el cliente no puede entrar en su portal, así que no va a
    registrar nada nunca. Es la alerta que explica todas las demás: sin ella la
    ficha decía «no ha registrado ningún entreno» y «nunca ha registrado su peso»,
    que son ciertas y llevan a la conclusión equivocada de que el cliente no
    colabora.

    Va PRIMERA por eso mismo, y es de gravedad alta: hasta que se resuelva, ninguna
    otra cifra de la ficha significa nada.
  */
  if (!client.clientProfileId) {
    add(
      'no_account',
      'alta',
      'Sin acceso a su portal',
      'No tiene ninguna cuenta enlazada: no puede entrar ni registrar nada. Mándale la invitación.'
    );
  }

  /*
    ══ Empezar no es lo mismo que descolgarse ═════════════════════════════════

    Un cliente recién dado de alta no tiene rutina, no ha entrenado, no se ha
    pesado y no ha subido fotos. Cada una de esas cuatro cosas disparaba su
    alerta, así que la persona con la que todavía no has hecho nada aparecía
    como el caso MÁS GRAVE de la cartera —cuatro avisos, dos de gravedad alta—
    por delante de quien lleva tres semanas sin aparecer.

    Y no dice lo mismo: «12 días sin entrenar» es alguien que se está
    descolgando; «nunca ha entrenado» es alguien que aún no ha empezado. Lo
    primero pide una llamada, lo segundo pide que le montes la rutina.

    Así que quien no ha arrancado tiene UNA alerta, la suya, y ninguna de las
    otras. Las de descolgarse necesitan un punto de partida para significar algo.
  */
  const sinceTraining = daysSince(lastTraining, today);
  const sinceWeight = daysSince(lastWeight, today);
  const started = resumen.microcycleCount > 0 || sinceTraining !== null || sinceWeight !== null;

  if (!started) {
    add(
      'not_started',
      'media',
      'Todavía no ha empezado',
      'Sin rutina, sin entrenos y sin pesajes. Le falta la puesta en marcha, no es que se haya descolgado.'
    );
  } else {
    // ── Programa ────────────────────────────────────────────────────────────
    if (resumen.microcycleCount === 0) {
      add('no_program', 'alta', 'Sin rutina asignada', 'No tiene ningún microciclo programado.');
    }

    // ── Entrenamiento ───────────────────────────────────────────────────────
    if (resumen.microcycleCount > 0) {
      if (sinceTraining === null) {
        add('never_trained', 'alta', 'No ha registrado ningún entreno', 'Tiene rutina, pero ni una serie anotada.');
      } else if (sinceTraining >= THRESHOLDS.noTraining) {
        add('stale_training', sinceTraining >= THRESHOLDS.noTraining * 2 ? 'alta' : 'media',
          `${sinceTraining} días sin entrenar`, 'Último entreno registrado.');
      }
    }

    // ── Peso y check-in ─────────────────────────────────────────────────────
    if (sinceWeight === null) {
      add('no_weight', 'media', 'Nunca ha registrado su peso', 'No hay ningún pesaje en su historial.');
    } else if (sinceWeight >= THRESHOLDS.noWeight) {
      add('stale_weight', 'media', `${sinceWeight} días sin pesarse`, 'Último pesaje registrado.');
    }

    // El check-in solo se reclama a mitad de semana: el lunes por la mañana nadie
    // lo tiene hecho y avisar de eso sería ruido.
    const dayOfWeek = daysBetween(weekStart(today), today);
    if (!checkIn.complete && dayOfWeek !== null && dayOfWeek >= 3) {
      add('checkin_pending', checkIn.count === 0 ? 'media' : 'baja',
        checkIn.count === 0 ? 'Check-in sin empezar' : `Check-in a medias (${checkIn.count}/${checkIn.target})`,
        'Pesajes de esta semana.');
    }

    /*
      ══ Lo que el entrenador EXIGE medir y no ha llegado ══════════════════════

      Pliegues y perímetros pueden estar en «obligatorio» (`domain/protocol.js`).
      El formulario del cliente ya no deja cerrar el check-in sin ellos, pero eso
      solo cubre lo que se registra DESDE la aplicación: quedan las semanas en las
      que no registra nada, y las medidas que mete el entrenador a mano.

      Sin esta alerta, exigir un bloque no se notaba en ninguna parte hasta que
      alguien iba a mirar la ficha. Con ella, «Marta no ha dado perímetros esta
      semana» sale donde ya se mira todo lo demás.

      Es de gravedad baja a propósito: es una medida que falta, no un cliente que
      se descuelga. Y se reclama con el mismo margen que el check-in —a mitad de
      semana— para no llenar la cartera cada lunes.
    */
    const exigidos = requiredBlocks(clientProtocol(client.preferences));
    if (exigidos.length > 0 && dayOfWeek !== null && dayOfWeek >= 3) {
      const deLaSemana = history.filter((h) => h.date && weekStart(h.date) === checkIn.weekStart);
      const faltan = exigidos.filter(
        (bloque) => !deLaSemana.some((log) => hasBlock(log, bloque.id))
      );
      if (faltan.length > 0) {
        add(
          'measures_missing',
          'baja',
          `Sin ${faltan.map((b) => b.label.toLowerCase()).join(' ni ')} esta semana`,
          'Se lo pides en cada check-in.'
        );
      }
    }
  }

  // ── Cobro ─────────────────────────────────────────────────────────────────
  /*
    ══ Un cobro cuya fecha no ha llegado no está pendiente ════════════════════

    `paymentStatus` se pone en 'pending' en cuanto empieza un ciclo nuevo, así
    que un cliente que renueva el día 30 aparecía como «pago pendiente» desde el
    día 1 — veintinueve días avisando de algo que no había que hacer todavía. Y
    con eso, un aviso que se aprende a ignorar: cuando de verdad vence, ya no
    se distingue del ruido de las cuatro semanas anteriores.

    Ahora solo se reclama lo que YA toca:

      · vencido            → la fecha pasó. Eso sí es una tarea.
      · sin fecha          → no se puede saber cuándo toca, y eso es un dato que
                             falta en la ficha, no una deuda del cliente.
      · fecha en el futuro → no es nada. A lo sumo, «renueva en 3 días» cuando
                             está a la vuelta de la esquina, que es un aviso de
                             gravedad baja y no una tarea.
  */
  const daysToPayment = client.nextPaymentDate ? daysBetween(today, client.nextPaymentDate) : null;
  if (client.paymentStatus !== 'paid') {
    if (daysToPayment !== null && daysToPayment < 0) {
      add('payment_overdue', 'alta', `Pago vencido hace ${Math.abs(daysToPayment)} días`, client.nextPaymentDate);
    } else if (daysToPayment === null) {
      add(
        'payment_no_date',
        'baja',
        'Sin fecha de renovación',
        'No se sabe cuándo le toca renovar, así que no se puede avisar a tiempo.'
      );
    }
  } else if (daysToPayment !== null && daysToPayment >= 0 && daysToPayment <= THRESHOLDS.paymentSoon) {
    add('payment_soon', 'baja',
      daysToPayment === 0 ? 'Renueva hoy' : `Renueva en ${daysToPayment} días`, client.nextPaymentDate);
  }

  /*
    ── El alta ───────────────────────────────────────────────────────────────
    Solo se avisa si el entrenador PIDE este paso. «Onboarding» era una alerta
    para todo el mundo, y a quien trabaja de otra manera le salía en naranja algo
    que él nunca hace — la aplicación reprochándole no seguir el método de otro.

    Ahora es un paso más de los que cada uno elige (`domain/intake.js`) y, si lo
    quita, el aviso desaparece con él.
  */
  if (clientIntake(client.preferences).steps.includes('onboarding') && !client.onboardingComplete) {
    add('onboarding', 'media', 'Onboarding sin cerrar', 'Falta marcarlo como completado.');
  }

  // ── Fotos ─────────────────────────────────────────────────────────────────
  const sincePhoto = daysSince(lastPhoto, today);
  if (sincePhoto !== null && sincePhoto >= THRESHOLDS.noPhotos) {
    add('stale_photos', 'baja', `${sincePhoto} días sin fotos`, 'Última foto de progreso.');
  }

  /*
    Estado de revisión del check-in de esta semana.
    ------------------------------------------------------------------------
    Con la migración 0009 es exacto: `submitted_at` y `reviewed_at` lo dicen. Sin
    ella se aproxima con «el cliente ha hecho su parte» —pesajes suficientes y al
    menos una foto de la semana—, que detecta lo mismo salvo que no sabe si ya lo
    revisaste. `exact` deja claro cuál de los dos casos es, para que la interfaz
    pueda avisar en lugar de fingir precisión.
  */
  const hasWeekPhoto = photos.some((p) => p.date && weekStart(p.date) === checkIn.weekStart);
  const review = submitted
    ? {
        exact: true,
        submittedAt: submitted.submittedAt,
        reviewedAt: submitted.reviewedAt,
        pending: Boolean(submitted.submittedAt) && !submitted.reviewedAt,
        id: submitted.id,
      }
    : {
        exact: false,
        submittedAt: null,
        reviewedAt: null,
        pending: checkIn.complete && hasWeekPhoto,
        id: null,
      };

  if (review.pending && review.exact) {
    add('review_pending', 'media', 'Check-in por revisar', 'Entregado y esperando tu respuesta.');
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    review,
    client,
    lastTraining,
    lastWeight,
    lastPhoto,
    sinceTraining,
    sinceWeight,
    sincePhoto,
    daysToPayment,
    checkIn,
    weeksProgrammed: resumen.microcycleCount,
    sessionCount: resumen.sessionCount,
    alerts,
    // La gravedad del cliente es la de su peor alerta: es lo que decide su
    // posición en la lista.
    severity: alerts[0]?.severity || null,
    needsAttention: alerts.some((a) => a.severity !== 'baja'),
  };
};

/**
 * La cartera completa, ordenada por urgencia.
 *
 * Ordenar por gravedad y no alfabéticamente es la decisión importante: una lista
 * alfabética obliga a leerla entera para encontrar los problemas. Con este orden,
 * lo que hay que hacer hoy está siempre arriba.
 */
export const buildPortfolio = (
  { clients = [], training = {}, anthropometry = {}, progressPhotos = [], checkIns = {} },
  today = todayISO()
) => {
  const photosByClient = new Map();
  for (const photo of progressPhotos) {
    if (!photosByClient.has(photo.clientId)) photosByClient.set(photo.clientId, []);
    photosByClient.get(photo.clientId).push(photo);
  }

  const week = weekStart(today);

  const rows = clients.map((client) =>
    clientStatus(
      {
        client,
        training: training[client.id],
        anthro: anthropometry[client.id],
        photos: photosByClient.get(client.id) || [],
        // El check-in de LA SEMANA EN CURSO. Los anteriores no dicen nada del
        // estado de hoy, y mezclarlos haría que un cliente pareciera pendiente
        // por algo que entregó en marzo.
        checkIn: checkIns[client.id]?.weekStart === week ? checkIns[client.id] : null,
      },
      today
    )
  ).map((row) => ({
    ...row,
    /*
      El titular de la lectura de la semana, en la ficha del tablero.
      ----------------------------------------------------------------------
      Hasta ahora la cartera contaba ALERTAS —«3 avisos»— y las alertas son todas
      del mismo tipo: cosas que faltan. Ninguna decía lo único que el entrenador
      quiere saber de un vistazo, que es si el cliente está progresando.

      «En rumbo: −0,5 kg/semana» y «Estancado» son eso, y ya están calculados: el
      mismo `weeklyReading` que alimenta la analítica. Se reutiliza en vez de
      reimplementar un criterio paralelo que acabaría discrepando del otro.

      Es `null` cuando no hay objetivo o no hay semanas suficientes, y la ficha se
      queda como estaba: no se inventa un veredicto para rellenar el hueco.
    */
    headline: readingHeadline(
      weeklyReading({
        client: row.client,
        /*
          Sin microciclos, y a propósito. De toda la lectura semanal aquí solo se
          conserva el factor `rate`, que es el ritmo de cambio de PESO: sale de la
          serie de pesajes y no mira el entrenamiento. Está comprobado con una
          prueba —la serie de peso es idéntica con y sin programa—, y es lo que
          permite que la cartera no necesite descargarlo.
        */
        series: buildWeeklySeries({
          microcycles: [],
          history: anthropometry[row.client.id]?.history || [],
          gender: row.client.gender,
        }),
        microcycles: [],
        history: anthropometry[row.client.id]?.history || [],
        today,
      }).filter((f) => f.id === 'rate')
    ),
  }));

  return rows.sort((a, b) => {
    const sa = a.severity ? SEVERITY_ORDER[a.severity] : 9;
    const sb = b.severity ? SEVERITY_ORDER[b.severity] : 9;
    if (sa !== sb) return sa - sb;
    if (b.alerts.length !== a.alerts.length) return b.alerts.length - a.alerts.length;
    return a.client.name.localeCompare(b.client.name);
  });
};

/**
 * El tablero: cada cliente en UNA columna, nunca en dos.
 *
 * ── Por qué un tablero y no una lista ───────────────────────────────────────
 * Una lista ordenada por urgencia responde «a quién atiendo primero». Un tablero
 * responde algo distinto y más útil cuando llevas veinte: **dónde está el cuello
 * de botella del grupo**. Ver ocho fichas en «por revisar» y dos en «en riesgo»
 * dice qué clase de trabajo tienes hoy antes de leer un solo nombre.
 *
 * Para que eso funcione, cada cliente tiene que estar en una sola columna y los
 * contadores tienen que sumar el total. Si un cliente aparece en dos, los números
 * dejan de significar nada.
 *
 * ── El orden de las columnas ES el orden de prioridad ───────────────────────
 * De izquierda a derecha, y la primera que encaja se queda al cliente. Ese orden
 * no es estético, es el de la mañana del entrenador:
 *
 *   1. `to_review`  — trabajo que espera POR MÍ. Lo primero, siempre.
 *   2. `at_risk`    — el cliente se está descolgando. Hay que intervenir.
 *   3. `checkin`    — recordatorio de rutina.
 *   4. `on_track`   — nada.
 *
 * Un cliente que lleva veinte días sin entrenar Y sin hacer el check-in sale en
 * «en riesgo», no en «check-in pendiente»: lo segundo es un síntoma de lo primero,
 * y meterlo en la columna suave escondería el problema de verdad.
 *
 * ── Sin la migración 0009 esto sigue funcionando ────────────────────────────
 * `to_review` necesita saber si el cliente ENTREGÓ y si yo REVISÉ, y eso solo lo
 * puede decir la tabla `check_ins`. Mientras no exista, se aproxima con «el
 * cliente ha hecho su parte esta semana» (pesajes suficientes y fotos), que es una
 * señal útil aunque no distinga lo ya revisado. La columna lo advierte.
 */
export const BOARD_COLUMNS = [
  {
    id: 'to_review',
    label: 'Por revisar',
    hint: 'Han entregado su check-in y esperan tu respuesta',
    tone: 'info',
  },
  {
    id: 'at_risk',
    label: 'En riesgo',
    hint: 'Sin entrenar, sin rutina asignada o con el pago vencido',
    tone: 'bad',
  },
  {
    id: 'checkin',
    label: 'Check-in pendiente',
    hint: 'Les toca pesarse y subir fotos esta semana',
    tone: 'warn',
  },
  { id: 'on_track', label: 'Al día', hint: 'Nada pendiente con ellos', tone: 'ok' },
];

const RISK_ALERTS = new Set([
  'stale_training',
  'never_trained',
  'no_program',
  'payment_overdue',
]);

/** Columna de un cliente. La primera que encaja gana. */
export const columnFor = (row) => {
  if (row.review?.pending) return 'to_review';
  if (row.alerts.some((a) => RISK_ALERTS.has(a.id))) return 'at_risk';
  if (!row.checkIn.complete) return 'checkin';
  return 'on_track';
};

/**
 * Agrupa la cartera en columnas. Devuelve siempre las cuatro, aunque estén
 * vacías: una columna que desaparece cambia el ancho de las demás y obliga a
 * releer la pantalla cada vez.
 */
export const portfolioBoard = (rows) => {
  const byId = new Map(BOARD_COLUMNS.map((c) => [c.id, { ...c, rows: [] }]));
  for (const row of rows) byId.get(columnFor(row)).rows.push(row);
  return [...byId.values()];
};

/* ==========================================================================
   La bandeja: agrupar por LO QUE HAY QUE HACER
   --------------------------------------------------------------------------
   El tablero de arriba agrupa por el estado del cliente y contesta «¿en qué
   estado está cada uno?». Es una pregunta legítima, pero no es la que se hace
   nadie al abrir la aplicación: esa es «¿qué hago ahora?».

   Y como cada cliente cabía en UNA sola columna, la pantalla escondía trabajo.
   Alguien con el pago vencido y doce días sin entrenar salía en «en riesgo», y
   la tarea de cobrarle no aparecía en ningún sitio.

   ── La diferencia que lo cambia todo ────────────────────────────────────────
   Aquí un cliente sale en TODAS las tareas que tiene abiertas. Eso significa que
   los contadores no suman el total de la cartera, y está bien: no cuentan
   personas, cuentan trabajo. Dos tareas del mismo cliente son dos cosas que
   hacer, no una persona contada dos veces.

   ── Por qué la lista vive aquí y no en el componente ────────────────────────
   Porque decidir qué es una tarea y en qué orden van es una regla de negocio, no
   una decisión de maquetación. Aquí se puede comprobar caso por caso.
   ========================================================================== */

/**
 * Las tareas, EN ORDEN DE PRIORIDAD.
 *
 * El orden es el de la mañana del entrenador y cada línea tiene su motivo:
 *
 *   1. Responder — es lo único que espera POR TI. El cliente ya hizo su parte.
 *   2. Dar acceso — sin cuenta no puede hacer nada, así que bloquea a todo lo
 *      demás que aparezca de él.
 *   3. Programar — sin rutina no hay nada que entrenar.
 *   4. Se descuelga — hay que intervenir, y cuanto antes.
 *   5. Cobrar — importa, pero no le impide entrenar mañana.
 *   6. Terminar el alta y recordar el check-in — mantenimiento.
 *
 * `verb` es lo que se hace, no lo que le pasa al cliente: «Responder el check-in»
 * y no «Check-in por revisar». Una bandeja de tareas se lee en infinitivo.
 */
export const INBOX_TASKS = [
  {
    id: 'review',
    label: 'Responder check-ins',
    hint: 'Han entregado y esperan tu respuesta',
    tone: 'info',
    match: (row) => Boolean(row.review?.pending),
    why: () => 'Entregado y esperando',
  },
  {
    id: 'access',
    label: 'Dar acceso al portal',
    hint: 'Todavía no pueden entrar a ver nada',
    tone: 'bad',
    match: (row) => row.alerts.some((a) => a.id === 'no_account'),
    why: () => 'Sin cuenta enlazada',
  },
  {
    /*
      Los que aún no han arrancado. Van antes que los que se descuelgan porque
      son trabajo TUYO —montarles el plan— mientras que descolgarse es algo que
      hace el cliente. Y antes iban mezclados con ellos, con cuatro alertas cada
      uno, así que el recién llegado encabezaba la lista de urgencias.
    */
    id: 'start',
    label: 'Poner en marcha',
    hint: 'Dados de alta y sin empezar todavía',
    tone: 'info',
    match: (row) => row.alerts.some((a) => a.id === 'not_started'),
    why: () => 'Sin rutina ni registros',
  },
  {
    id: 'program',
    label: 'Programar la rutina',
    hint: 'No tienen ni un microciclo',
    tone: 'bad',
    match: (row) => row.alerts.some((a) => a.id === 'no_program'),
    why: () => 'Sin rutina asignada',
  },
  {
    id: 'inactive',
    label: 'Se están descolgando',
    hint: 'Llevan demasiado sin entrenar',
    tone: 'bad',
    match: (row) => row.alerts.some((a) => a.id === 'stale_training' || a.id === 'never_trained'),
    why: (row) =>
      row.alerts.find((a) => a.id === 'stale_training' || a.id === 'never_trained')?.label || '',
  },
  {
    id: 'payment',
    label: 'Cobrar',
    hint: 'Pago vencido o pendiente',
    tone: 'warn',
    match: (row) =>
      row.alerts.some((a) => a.id === 'payment_overdue' || a.id === 'payment_pending'),
    why: (row) =>
      row.alerts.find((a) => a.id === 'payment_overdue' || a.id === 'payment_pending')?.label || '',
  },
  {
    id: 'intake',
    label: 'Terminar el alta',
    hint: 'Les faltan pasos de tu alta',
    tone: 'warn',
    match: (row) => row.alerts.some((a) => a.id === 'onboarding'),
    why: () => 'Alta sin cerrar',
  },
  {
    id: 'checkin',
    label: 'Recordar el check-in',
    hint: 'Les toca pesarse y subir fotos',
    tone: 'warn',
    match: (row) => row.alerts.some((a) => a.id === 'checkin_pending'),
    why: (row) => row.alerts.find((a) => a.id === 'checkin_pending')?.label || '',
  },
];

/**
 * Reparte la cartera en tareas.
 *
 * Devuelve solo los grupos CON trabajo, más la lista de quien no tiene ninguna.
 * Un grupo vacío en una bandeja es ruido: el tablero enseñaba sus cuatro
 * columnas siempre y tres de cada cuatro visitas tenían alguna a cero.
 */
export const portfolioInbox = (rows) => {
  const tasks = INBOX_TASKS.map((task) => ({
    ...task,
    rows: rows.filter((row) => task.match(row)).map((row) => ({ ...row, why: task.why(row) })),
  })).filter((task) => task.rows.length > 0);

  const conTarea = new Set(tasks.flatMap((t) => t.rows.map((r) => r.client.id)));
  return { tasks, clear: rows.filter((row) => !conTarea.has(row.client.id)) };
};

/**
 * Filtros de la vista. Cada uno es una pregunta concreta del entrenador.
 *
 * Las cifras de cabecera se derivan de estos mismos predicados a propósito: si el
 * número y el filtro se calcularan por separado acabarían discrepando, y una
 * tarjeta que dice «1» y al pulsarla enseña dos clientes destruye la confianza en
 * toda la pantalla.
 */
export const PORTFOLIO_FILTERS = [
  { id: 'attention', label: 'Requieren atención', test: (r) => r.needsAttention },
  {
    id: 'inactive',
    label: 'Sin entrenar',
    test: (r) => r.alerts.some((a) => a.id === 'stale_training' || a.id === 'never_trained'),
  },
  { id: 'checkin', label: 'Check-in pendiente', test: (r) => !r.checkIn.complete },
  {
    id: 'payment',
    label: 'Cobros',
    test: (r) => r.alerts.some((a) => a.id === 'payment_overdue' || a.id === 'payment_pending'),
  },
  // «Al día» es no tener nada urgente, no tener cero avisos: un «renueva en 3
  // días» es información, no una tarea. Así atención + al día = la cartera
  // entera, y los dos números se pueden leer juntos.
  { id: 'ok', label: 'Al día', test: (r) => !r.needsAttention },
  { id: 'all', label: 'Todos', test: () => true },
];

const countBy = (rows, id) => {
  const filter = PORTFOLIO_FILTERS.find((f) => f.id === id);
  return rows.filter(filter.test).length;
};

/** Cifras de cabecera: el estado de la cartera en cinco números. */
export const portfolioSummary = (rows) => ({
  total: rows.length,
  attention: countBy(rows, 'attention'),
  inactive: countBy(rows, 'inactive'),
  checkinPending: countBy(rows, 'checkin'),
  paymentIssues: countBy(rows, 'payment'),
  clean: countBy(rows, 'ok'),
});
