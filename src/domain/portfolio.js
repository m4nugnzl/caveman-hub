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

import { clientIntake, clientSteps, coachSteps, stepDone } from './intake';
import { onboardingState } from './onboardingState';
import { feeLabel, paymentState } from './billing';
import { currentCheckInPeriod } from './calendar';
import { clientProtocol, isServiceOn, requiredBlocks } from './protocol';
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

/**
 * Umbrales, en un solo sitio para poder discutirlos sin buscarlos.
 *
 * El de la renovación no está aquí: es `PAYMENT_SOON_DAYS` en `domain/billing.js`,
 * junto al resto del criterio de cobro, porque lo usan también la cabecera del
 * cliente y la bandeja de «Hoy».
 */
export const THRESHOLDS = {
  noTraining: 7, // días sin registrar un entreno
  noWeight: 10, // días sin registrar un peso
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
  { client, training, anthro, photos = [], checkIn: submitted = null, equipmentCount = 0 },
  today = todayISO()
) => {
  const resumen = training || emptyTrainingSummary();
  const history = anthro?.history || [];

  const lastTraining = resumen.lastTraining;
  const lastWeight = lastDate(history.map((h) => h.date));
  const lastPhoto = lastDate(photos.map((p) => p.date));

  const checkIn = weeklyCheckIn(history, today);
  /* Qué ha entregado él, del mismo sitio que su portal y que su ficha: los tres
     no pueden discrepar sobre si el cuestionario está contestado. */
  const estadoDelAlta = onboardingState({ client, equipment: { length: equipmentCount }, checkIn: submitted });
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

  /*
    ══ A quien no le llevas el entrenamiento no se le echa en falta ═══════════

    «Sin rutina asignada», de gravedad ALTA, es correcto para el 99 % de los
    clientes y es un reproche permanente para el cliente de solo nutrición: nunca
    va a tener un microciclo, así que aparecería el primero de la cartera —en
    rojo, para siempre— por hacer exactamente lo que se acordó con él.

    Las tres alertas de entrenamiento cuelgan de esto. Las de peso, fotos y
    check-in no: esas se le piden igual, lleve dieta, programa o las dos cosas.
  */
  const conEntreno = isServiceOn(clientProtocol(client.preferences), 'training');

  const started = conEntreno
    ? resumen.microcycleCount > 0 || sinceTraining !== null || sinceWeight !== null
    : sinceWeight !== null;

  if (!started) {
    add(
      'not_started',
      'media',
      'Todavía no ha empezado',
      conEntreno
        ? 'Sin rutina, sin entrenos y sin pesajes. Le falta la puesta en marcha, no es que se haya descolgado.'
        : 'Sin ningún pesaje todavía. Le falta la puesta en marcha, no es que se haya descolgado.'
    );
  } else {
    // ── Programa ────────────────────────────────────────────────────────────
    if (conEntreno && resumen.microcycleCount === 0) {
      add('no_program', 'alta', 'Sin rutina asignada', 'No tiene ningún microciclo programado.');
    }

    // ── Entrenamiento ───────────────────────────────────────────────────────
    if (conEntreno && resumen.microcycleCount > 0) {
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

    ── Por qué el criterio ya no se calcula aquí ──────────────────────────────
    Porque esta regla la necesitan además la cabecera del cliente y la bandeja de
    «Hoy», y cada una la tenía escrita a su manera: la cartera miraba la fecha, la
    cabecera solo el estado —y por eso seguía saliendo en rojo el día 1— y la
    bandeja mezclaba las dos. Tres respuestas a la misma pregunta.

    Vive en `domain/billing.js`. Aquí solo se traduce a alertas.
  */
  const pago = paymentState(client, today);
  const daysToPayment = pago.days;

  if (pago.state === 'overdue') {
    add('payment_overdue', 'alta', pago.label, client.nextPaymentDate);
  } else if (pago.state === 'due') {
    /* Vence HOY y sin cobrar. Es tarea del día, no del mes que viene, así que ya
       no se disfraza de «renueva hoy» junto a los avisos de cortesía. */
    add('payment_due', 'media', pago.label, client.nextPaymentDate);
  } else if (pago.state === 'no_date' && client.paymentStatus !== 'paid') {
    add('payment_no_date', 'baja', 'Sin fecha de renovación', pago.detail);
  } else if (pago.state === 'soon') {
    add('payment_soon', 'baja', pago.label, client.nextPaymentDate);
  }

  /*
    ── El alta ───────────────────────────────────────────────────────────────
    Solo se avisa si el entrenador PIDE este paso. «Onboarding» era una alerta
    para todo el mundo, y a quien trabaja de otra manera le salía en naranja algo
    que él nunca hace — la aplicación reprochándole no seguir el método de otro.

    Ahora es un paso más de los que cada uno elige (`domain/intake.js`) y, si lo
    quita, el aviso desaparece con él.
  */
  const alta = clientIntake(client.preferences);

  if (alta.steps.includes('onboarding') && !client.onboardingComplete) {
    add('onboarding', 'media', 'Onboarding sin cerrar', 'Falta marcarlo como completado.');
  }

  /*
    ── «Ya puedes empezar con él» ────────────────────────────────────────────

    El aviso que faltaba, y es el que cierra el circuito: el cliente entrega lo
    suyo —cuestionario, fotos del gimnasio, primer check-in— y a partir de ahí le
    toca al entrenador. Sin esto, enterarse de que ya se puede empezar exigía
    entrar en su ficha a mirar, o sea acordarse de mirar.

    ══ Cuándo salta, y por qué las tres condiciones ══════════════════════════

      · Le pides ALGO a él. Quien no le pide nada no tiene nada que esperar.
      · Está TODO entregado. A medias no vale: montar un plan con la mitad de
        las respuestas es lo que este circuito viene a evitar.
      · Y a ti te queda algo por hacer. Si tus pasos están cerrados, no hay
        tarea: el aviso sería un recordatorio de algo terminado.

    ── Severidad media y no alta ─────────────────────────────────────────────
    Alta es para lo que se está estropeando —un cobro vencido, alguien sin
    entrenar hace nueve días—. Esto es trabajo que ha llegado, no un problema, y
    subirlo al rojo haría que el rojo dejara de significar «esto va mal».
  */
  const suyos = clientSteps(alta);
  const mios = coachSteps(alta);
  const entregado =
    suyos.length > 0 &&
    suyos.every((paso) => stepDone(paso, client, alta, estadoDelAlta));
  const meFalta = mios.some((paso) => !stepDone(paso, client, alta, estadoDelAlta));

  if (entregado && meFalta) {
    add(
      'intake_ready',
      'media',
      'Ya puedes empezar con él',
      'Te ha entregado todo lo suyo: te toca a ti.'
    );
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
        /* Lo que contestó al cuestionario de la semana (migración 0060). Viaja
           con la fila porque es lo que la cola de revisiones enseña para que se
           note, sin entrar, que esta semana trae algo nuevo. */
        answers: submitted.answers || null,
      }
    : {
        exact: false,
        submittedAt: null,
        reviewedAt: null,
        pending: checkIn.complete && hasWeekPhoto,
        id: null,
        answers: null,
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
    /* La «S14» que la barra lateral ya pone al lado del nombre. Se expone para
       que la plantilla de Clientes diga LA MISMA semana que el riel: dos
       cálculos de «en qué semana va» acabarían discrepando. */
    weekNumber: resumen.weekNumber,
    sessionCount: resumen.sessionCount,
    alerts,
    // La gravedad del cliente es la de su peor alerta: es lo que decide su
    // posición en la lista.
    severity: alerts[0]?.severity || null,
    needsAttention: alerts.some((a) => a.severity !== 'baja'),
  };
};

/* ==========================================================================
   La pasada semanal
   --------------------------------------------------------------------------
   ══ Qué problema resuelve ═══════════════════════════════════════════════════

   Revisar la semana de alguien es hoy abrir cuatro pantallas: check-ins para los
   pesajes, fotos para comparar, rutina para ver qué hizo y nutrición para
   ajustar. Multiplicado por veinte clientes, un lunes entero.

   Y la mayoría de las veces la conclusión es **«bien, seguimos igual»**, durante
   meses. Una herramienta que tarda lo mismo en decir eso que en rehacer un
   mesociclo está mal calibrada: lo que hay que abaratar es el caso normal.

   Estas dos funciones son el cálculo de esa pasada. La pantalla solo las pinta.

   ── Por qué se apoya en `clientStatus` y no calcula nada nuevo ──────────────
   Porque el criterio tiene que ser el MISMO que el de la cartera y el de las
   alertas. Un segundo cálculo paralelo acabaría diciendo que Marta está al día
   en una pantalla y pendiente en otra, y entonces no se puede confiar en
   ninguna de las dos.
   ========================================================================== */

/**
 * En qué punto está la revisión de un cliente, según SU cadencia.
 *
 *   `ready`   — le tocaba y lo ha subido: te espera. Es el trabajo.
 *   `missing` — le tocaba y no lo ha subido. Es un recordatorio, no trabajo.
 *   `done`    — ya revisado en este periodo.
 *   `off`     — no le toca todavía, o no tiene día fijado. **No se enseña.**
 *
 * ══ Por qué `off` es la mitad del valor de esto ═════════════════════════════
 *
 * La primera versión listaba a los veinte clientes cada semana. Una lista que
 * sale entera siempre no es una lista de pendientes: es la cartera con otro
 * título, y se deja de mirar en dos semanas. Con la cadencia, a quien revisa cada
 * dos semanas no se le reclama nada la semana que no toca, y quien no ha elegido
 * día no aparece — porque no se puede llegar tarde a una cita que nadie ha puesto.
 *
 * `done` y `ready` solo se distinguen con la migración 0009 aplicada
 * (`review.exact`). Sin ella se cae a la aproximación de «ha hecho su parte», que
 * no sabe si ya le contestaste: ahí nunca se dice `done`, porque ofrecer la
 * acción dos veces es mejor que darla por hecha sin saberlo.
 */
export const reviewState = (row, today = todayISO()) => {
  /*
    ══ Sin cuenta enlazada no hay nada que revisar ════════════════════════════

    Y salía en la cola igualmente, como «Sin subir»: la aplicación reclamaba un
    check-in a alguien que ni siquiera puede entrar a entregarlo. Es reprocharle
    al entrenador el resultado de un paso que la propia pantalla le está pidiendo
    dos bloques más abajo —«Dar acceso al portal»—, y encima ensucia la única
    cifra que tiene que significar trabajo de verdad.

    Lo que hay que hacer con esta persona es invitarla, y eso ya está en su sitio:
    la alerta `no_account`, que es la primera de todas, y el trámite «Dar acceso
    al portal». Aquí, `off`.
  */
  if (!row?.client?.clientProfileId) return 'off';

  const periodo = currentCheckInPeriod(row?.client?.preferences, row?.client?.startDate, today);
  if (!periodo || !periodo.isDue) return 'off';

  /* Que el check-in sea de ESTE periodo ya lo garantiza `buildPortfolio`, que
     descarta el de periodos anteriores antes de llegar aquí. Comprobarlo otra vez
     con `checkIn.weekStart` era mirar el dato equivocado: ese `checkIn` es el
     recuento de pesajes de la semana natural, no la fila entregada. */
  if (row?.review?.exact && row.review.reviewedAt) return 'done';
  if (row?.review?.pending) return 'ready';
  return 'missing';
};

/**
 * La cola de revisiones: solo lo que hay que atender, y en ese orden.
 *
 * Primero quien te espera —eso es trabajo— y después quien no ha subido lo suyo
 * —eso es un mensaje—. Lo ya revisado y lo que no toca se quedan fuera: la
 * pantalla contesta «¿qué me queda?», y para eso lo hecho estorba.
 *
 * Dentro de cada grupo manda la gravedad, que ya viene calculada.
 */
const REVIEW_ORDER = { ready: 0, missing: 1 };

export const reviewQueue = (rows = [], today = todayISO()) =>
  rows
    .map((row) => ({ ...row, review_state: reviewState(row, today) }))
    .filter((row) => row.review_state === 'ready' || row.review_state === 'missing')
    .sort((a, b) => {
      const orden = REVIEW_ORDER[a.review_state] - REVIEW_ORDER[b.review_state];
      if (orden !== 0) return orden;
      return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    });

/**
 * La cartera completa, ordenada por urgencia.
 *
 * Ordenar por gravedad y no alfabéticamente es la decisión importante: una lista
 * alfabética obliga a leerla entera para encontrar los problemas. Con este orden,
 * lo que hay que hacer hoy está siempre arriba.
 */
export const buildPortfolio = (
  {
    clients = [],
    training = {},
    anthropometry = {},
    progressPhotos = [],
    checkIns = {},
    /* Cuántas fotos de maquinaria tiene cada uno. Solo hace falta saber si hay
       alguna, así que viaja como cifra y no como lista: ver `useEquipment`. */
    equipmentCounts = {},
  },
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
        equipmentCount: equipmentCounts[client.id] || 0,
        // El check-in de LA SEMANA EN CURSO. Los anteriores no dicen nada del
        // estado de hoy, y mezclarlos haría que un cliente pareciera pendiente
        // por algo que entregó en marzo.
        /*
          El check-in que cuenta es el del PERIODO vigente, no el de la semana
          natural: con cadencia quincenal el periodo empezó hace dos semanas y
          comparar contra el lunes de hoy dejaba fuera al que entregó a tiempo.
        */
        checkIn: (() => {
          const suyo = checkIns[client.id];
          if (!suyo) return null;
          const periodo = currentCheckInPeriod(client.preferences, client.startDate, today);
          return suyo.weekStart >= (periodo?.start || week) ? suyo : null;
        })(),
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
    seccion: 'semana',
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

/**
 * Las alertas que son un cobro que hay que hacer HOY.
 *
 * En un solo sitio porque la lista se lee en tres —la bandeja, el filtro y las
 * cifras de cabecera— y ya divergió una vez: dos de ellas seguían buscando un
 * `payment_pending` que dejó de emitirse, así que el filtro «Cobros» enseñaba
 * menos gente de la que la tarjeta contaba.
 *
 * «Renueva en 3 días» NO entra: es información, no trabajo.
 */
const COBRO_ALERTS = new Set(['payment_overdue', 'payment_due']);
const esCobro = (row) => row.alerts.some((a) => COBRO_ALERTS.has(a.id));

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
/*
  ── `awaited`: quién ha entregado algo y sigue esperando ────────────────────
  Las once tareas de la bandeja no son de la misma naturaleza. Nueve son trabajo
  TUYO que decides cuándo hacer —programarle, cobrarle, recordarle el check-in—
  y dos son gente que ya ha hecho su parte y está esperando a que contestes.

  La distinción no la pedía la bandeja, que las lista todas y está bien así.
  La pidió el punto de la cartera en la barra lateral: marcaba a quien apareciera
  en CUALQUIER tarea, y con catorce clientes eso son diez puntos de catorce. Un
  aviso que llevan casi todos no avisa de nada — el mismo argumento por el que
  la chapa de cobro dejó de salir en rojo por defecto.

  Se declara aquí y no en la barra porque es una propiedad de la tarea, no de
  cómo se pinta: si mañana hay una tarea nueva, quien la escriba tiene que
  decidir de qué clase es, y lo tiene delante.
*/
/*
  `seccion` es a dónde lleva pulsar a la persona: la sección del cliente donde se
  resuelve esa tarea. Vive aquí, al lado de `awaited`, porque es una propiedad de
  la tarea y no de la pantalla que la pinta.
*/
export const INBOX_TASKS = [
  {
    id: 'review',
    seccion: 'semana',
    label: 'Responder check-ins',
    hint: 'Han entregado y esperan tu respuesta',
    tone: 'info',
    awaited: true,
    match: (row) => Boolean(row.review?.pending),
    why: () => 'Entregado y esperando',
  },
  {
    id: 'access',
    seccion: 'ficha',
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
    seccion: 'rutina',
    label: 'Poner en marcha',
    hint: 'Dados de alta y sin empezar todavía',
    tone: 'info',
    match: (row) => row.alerts.some((a) => a.id === 'not_started'),
    why: () => 'Sin rutina ni registros',
  },
  {
    id: 'program',
    seccion: 'rutina',
    label: 'Programar la rutina',
    hint: 'No tienen ni un microciclo',
    tone: 'bad',
    match: (row) => row.alerts.some((a) => a.id === 'no_program'),
    why: () => 'Sin rutina asignada',
  },
  {
    id: 'inactive',
    seccion: 'semana',
    label: 'Se están descolgando',
    hint: 'Llevan demasiado sin entrenar',
    tone: 'bad',
    match: (row) => row.alerts.some((a) => a.id === 'stale_training' || a.id === 'never_trained'),
    why: (row) =>
      row.alerts.find((a) => a.id === 'stale_training' || a.id === 'never_trained')?.label || '',
  },
  {
    id: 'payment',
    seccion: 'ficha',
    label: 'Cobrar',
    hint: 'Les ha vencido el cobro o les vence hoy',
    tone: 'warn',
    match: esCobro,
    /* La tarifa, si está anotada: «Pago vencido hace 3 días · 60 € / mes». Sin
       ella la tarea dice que hay que cobrar pero no cuánto, que es la mitad de
       lo que hace falta para hacerlo. */
    why: (row) => {
      const alerta = row.alerts.find((a) => COBRO_ALERTS.has(a.id));
      const tarifa = feeLabel(row.client);
      return [alerta?.label, tarifa].filter(Boolean).join(' · ');
    },
  },
  {
    /*
      Va la PRIMERA de las dos del alta, y delante de «terminar el alta»: son dos
      momentos del mismo circuito y éste es el que acaba de desbloquearse. Detrás
      del otro quedaría mezclado con los que todavía no han entregado nada, que
      es justo la distinción que hace falta ver de un vistazo.
    */
    id: 'intake_ready',
    seccion: 'ficha',
    label: 'Ya puedes empezar',
    hint: 'Te han entregado lo suyo y te toca a ti',
    tone: 'info',
    awaited: true,
    match: (row) => row.alerts.some((a) => a.id === 'intake_ready'),
    why: () => 'Alta entregada',
  },
  {
    id: 'intake',
    seccion: 'ficha',
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
  { id: 'payment', label: 'Cobros', test: esCobro },
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

/**
 * Las cuatro colas de «Inicio», y nada más.
 *
 * ── Por qué son cuatro y no las nueve tareas de la bandeja ──────────────────
 * La bandeja (`INBOX_TASKS`) mezcla el trabajo del oficio —revisar, programar,
 * escribir a quien desaparece, cobrar— con los trámites de un alta: dar acceso,
 * terminar el alta, recordar un check-in. Sumados, el «36» de la portada no
 * decía nada y se aprendía a ignorar. Las colas son solo el oficio; los
 * trámites se listan aparte, en voz baja, y no cuentan.
 *
 * Vive aquí, en el dominio, para que la chapa de la barra lateral y la portada
 * cuenten LO MISMO: una tercera cuenta propia divergiría (y divergió).
 */
export const COLAS_INICIO = [
  { id: 'revisar', label: 'Por revisar', verbo: 'Revisar', seccion: 'semana', tasks: [] },
  {
    id: 'programar',
    label: 'Sin programar',
    sub: 'sin rutina o sin empezar',
    verbo: 'Programar',
    seccion: 'rutina',
    tasks: ['program', 'start'],
  },
  {
    id: 'senales',
    label: 'Sin señales',
    sub: 'llevan días sin entrenar',
    verbo: 'Escribir',
    seccion: 'semana',
    tasks: ['inactive'],
  },
  {
    id: 'cobrar',
    label: 'Cobros',
    sub: 'vencidos o vencen hoy',
    verbo: 'Cobrar',
    seccion: 'ficha',
    tasks: ['payment'],
  },
];

/** Lo administrativo: se lista aparte y no suma en las colas. */
export const TRAMITES_INICIO = ['access', 'intake_ready', 'intake', 'checkin'];

/**
 * @returns Las colas con su gente: `n` es la cifra grande; en «Por revisar»,
 *   `lista` son las filas de `reviewQueue` (entregadas primero) y `n` solo las
 *   entregadas; en las demás, `filas` son `{ row, taskId }` sin repetir persona.
 */
export const colasDeInicio = (rows = [], today = todayISO()) => {
  const { tasks } = portfolioInbox(rows);
  const porTarea = new Map(tasks.map((t) => [t.id, t.rows]));
  const revisiones = reviewQueue(rows, today);

  return COLAS_INICIO.map((cola) => {
    if (cola.id === 'revisar') {
      const listas = revisiones.filter((r) => r.review_state === 'ready').length;
      const sinSubir = revisiones.length - listas;
      return {
        ...cola,
        n: listas,
        sub: sinSubir > 0 ? `${sinSubir} sin subir todavía` : 'han entregado',
        lista: revisiones,
      };
    }
    const vistos = new Set();
    const filas = [];
    for (const taskId of cola.tasks) {
      for (const row of porTarea.get(taskId) || []) {
        if (vistos.has(row.client.id)) continue;
        vistos.add(row.client.id);
        filas.push({ row, taskId });
      }
    }
    return { ...cola, n: filas.length, filas };
  });
};
