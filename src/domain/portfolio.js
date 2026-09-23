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
import { alertDaysFor, clientProtocol, isServiceOn, requiredBlocks, weighInsTarget } from './protocol';
import { emptyTrainingSummary } from './sessions';
import { horizonteEscrito } from './blocks';
import { semanaDeAhora } from './week';
import { weekStartOfProgramWeek } from './photos';
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
 * ¿Está en pausa, y hasta cuándo?
 *
 * ══ Por qué existe un tercer estado ═════════════════════════════════════════
 *
 * El lesionado de agosto que vuelve en octubre no cabía en ninguno de los dos:
 * activo genera alertas falsas durante dos meses —«60 días sin entrenar» de
 * alguien a quien TÚ le has dicho que pare— y archivado lo saca de la cartera
 * como si hubiera terminado. La pausa es la verdad: sigue siendo tu cliente,
 * no está entrenando, y los dos lo sabéis.
 *
 * En pausa no genera NINGUNA alerta y se va al final de la lista. Sigue
 * viéndose —es tu cliente— y sigue pudiendo entrar en su portal: sus datos son
 * suyos, igual que los del archivado (0020).
 *
 * ── La vuelta no la escribe nadie ───────────────────────────────────────────
 * `pausedUntil` es la fecha en la que quedasteis. Cuando pasa, la pausa VENCE
 * sola: las alertas vuelven a contar y sale un aviso de que venció — sin
 * ningún proceso que escriba en la base a medianoche. La fila conserva su
 * `status: 'paused'` hasta que el entrenador reanuda o amplía desde la ficha.
 *
 * ── Y el tope del plan NO cambia ────────────────────────────────────────────
 * Un cliente en pausa sigue contando para el límite de asientos (0064): sigue
 * siendo tuyo y va a volver. Descontarlo abriría la puerta a pausar la mitad
 * de la cartera para caber en un plan más barato, y el disparador del límite
 * solo corre en el alta — no vería el despausado. Quien termina de verdad, se
 * archiva, que para eso está.
 */
export const pauseOf = (client, today = todayISO()) => {
  if (client?.status !== 'paused') return null;
  const until = client.pausedUntil || null;
  if (until && until < today) return { on: false, until, expired: true };
  return { on: true, until, expired: false };
};

export const isPaused = (client, today = todayISO()) => Boolean(pauseOf(client, today)?.on);

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
  {
    client,
    training,
    anthro,
    photos = [],
    checkIn: submitted = null,
    equipmentCount = 0,
    /** Cuántas cosas de las que le mandaste tiene sin hacer (ver `buildPortfolio`). */
    mandadoCount = 0,
    /** Y cuántas te ha contestado que todavía no has leído (0108, ídem). */
    contestadoCount = 0,
  },
  today = todayISO()
) => {
  const resumen = training || emptyTrainingSummary();
  const history = anthro?.history || [];

  /* Su pausa, si la tiene. Se calcula una vez: decide el final de esta función
     —una pausa VIGENTE silencia todas las alertas— y viaja en la fila para que
     la lista, la cola de revisiones y el tablero pregunten lo mismo. */
  const pausa = pauseOf(client, today);

  const lastTraining = resumen.lastTraining;
  const lastWeight = lastDate(history.map((h) => h.date));
  const lastPhoto = lastDate(photos.map((p) => p.date));

  /* El protocolo de esta persona, UNA vez: decide cuántos pesajes se le piden y
     qué bloques son obligatorios, y las dos cosas se reclaman más abajo. */
  const protocolo = clientProtocol(client.preferences);

  /* Su vara: los días que tienen que pasar antes de avisar DE ELLA. Afinada en
     su protocolo, o los umbrales generales de siempre. El de fotos no se afina
     —45 días es igual de largo para todo el mundo—. */
  const vara = alertDaysFor(protocolo, {
    training: THRESHOLDS.noTraining,
    weight: THRESHOLDS.noWeight,
  });
  const checkIn = weeklyCheckIn(history, today, { target: weighInsTarget(protocolo) });
  /* Qué ha entregado él, del mismo sitio que su portal y que su ficha: los tres
     no pueden discrepar sobre si el cuestionario está contestado. */
  const estadoDelAlta = onboardingState({ client, equipment: { length: equipmentCount }, checkIn: submitted });

  /*
    ══ Por dónde va, y qué le queda escrito ═══════════════════════════════════

    El reloj es el de siempre —`semanaDeAhora`, el tiempo que lleva contigo— y
    aquí se le da lo poco que la cartera tiene: sin el programa cargado no hay
    microciclos que mirar, así que el último recurso es la semana más alta que
    el resumen ya trae (`montada`).

    Del horizonte salen tres cosas que antes había que ir a buscar cliente a
    cliente: el microciclo que la barra pone al lado del nombre, la cola «sin
    semana siguiente» y la previsión de las cuatro semanas.
  */
  const horizonte = horizonteEscrito(
    resumen.indice,
    semanaDeAhora({
      startDate: client.startDate,
      today,
      history,
      photos,
      montada: resumen.weekNumber ?? null,
    })
  );

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
  /*
    ══ Lo que le mandaste a mano y no ha hecho ════════════════════════════════

    Lo suelto —un formulario, un vídeo, algo que le pediste— se veía en
    `/protocolos`, envío por envío, y en su ficha. O sea que para saber a quién le
    falta algo había que abrirlos de uno en uno y cruzarlos mentalmente. Ésta es
    la vuelta que faltaba: sale donde ya se mira todo lo demás.

    ── Y va FUERA del corte de «todavía no ha empezado» ──────────────────────
    Las alertas de descolgarse necesitan un punto de partida para significar
    algo, y por eso quien no ha arrancado tiene una sola, la suya. Ésta no: al
    recién dado de alta es justo a quien le acabas de mandar el cuestionario, así
    que esconderla ahí dejaría sin reclamar el caso en el que casi siempre hay
    algo pendiente.

    Gravedad BAJA, y sin contar días. No es un cliente que se descuelgue: es un
    recado que sigue ahí. El «cuándo» ya lo respeta la cifra, que solo cuenta lo
    que le toca ya (`vigente`).
  */
  if (mandadoCount > 0) {
    add(
      'mandado_pending',
      'baja',
      mandadoCount === 1
        ? 'Le falta algo que le mandaste'
        : `Le faltan ${mandadoCount} cosas que le mandaste`,
      'Fuera de su protocolo.'
    );
  }

  /*
    ══ Y lo que te ha contestado y no has leído ═══════════════════════════════

    La otra mitad del bucle, y la que de verdad te da trabajo. Con la alerta de
    arriba sola, la aplicación sabía decir a quién le FALTA algo y no sabía decir
    quién ya lo ha mandado: lo contestado había que ir a buscarlo al Taller,
    envío por envío, o no se encontraba.

    Gravedad MEDIA, la misma que el check-in por revisar: es exactamente lo
    mismo —alguien ha hecho su parte y espera— y dos varas distintas para el
    mismo hecho harían que la cartera ordenara mal.

    Y no cuenta lo que se abre ni lo que se marca (ver `sinLeer` en
    `domain/envios.js`): solo lo que trae algo que leer.
  */
  if (contestadoCount > 0) {
    add(
      'contestado_nuevo',
      'media',
      contestadoCount === 1
        ? 'Te ha contestado y no lo has leído'
        : `Te ha contestado ${contestadoCount} cosas sin leer`,
      'De lo que le mandaste suelto.'
    );
  }

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

    /*
      ══ Y la que faltaba: no hay hoja para la semana que viene ═════════════════

      La cartera sabía decir quién no tiene rutina y quién lleva días sin
      entrenar, o sea lo que ya ha salido mal. No sabía decir a quién se le
      ACABA lo escrito, que es lo que se ve venir y lo único que se puede
      adelantar. Había que entrar cliente por cliente en Entreno y contar
      pastillas.

      ── Por qué no se dice «se le acaba el bloque» ─────────────────────────
      Porque un bloque nuestro es abierto y no tiene final que agotar (ver
      `horizonteEscrito`). Lo cierto es que la semana que viene no hay hoja, y
      eso es exactamente lo que se dice. Un cliente que va por la 18 con diez
      microciclos escritos entra aquí igual que el que va por la 10 de 10: en
      los dos casos lo siguiente que tienes que hacer es escribirle la semana.

      ── Gravedad BAJA, y no es un descuido ─────────────────────────────────
      Que a alguien no le hayas escrito todavía la semana que viene el miércoles
      no es una avería: es la lista de la compra del oficio. Con gravedad media
      entraría en «requieren atención» y la mitad de la cartera dejaría de estar
      al día por trabajo que aún no toca — que es cómo se estropea un panel de
      alertas. Como tarea de la bandeja pesa lo que pesa, y en la portada tiene
      su propia cola con su verbo.
    */
    if (conEntreno && horizonte && horizonte.escritosDespues === 0) {
      add(
        'sin_semana',
        'baja',
        'Sin semana siguiente',
        `Va por el microciclo ${horizonte.microcicloEnCurso} y no hay ninguno escrito después.`
      );
    }

    // ── Entrenamiento ───────────────────────────────────────────────────────
    if (conEntreno && resumen.microcycleCount > 0) {
      if (sinceTraining === null) {
        add('never_trained', 'alta', 'No ha registrado ningún entreno', 'Tiene rutina, pero ni una serie anotada.');
      } else if (sinceTraining >= vara.training) {
        add('stale_training', sinceTraining >= vara.training * 2 ? 'alta' : 'media',
          `${sinceTraining} días sin entrenar`, 'Último entreno registrado.');
      }
    }

    // ── Peso y check-in ─────────────────────────────────────────────────────
    if (sinceWeight === null) {
      add('no_weight', 'media', 'Nunca ha registrado su peso', 'No hay ningún pesaje en su historial.');
    } else if (sinceWeight >= vara.weight) {
      add('stale_weight', 'media', `${sinceWeight} días sin pesarse`, 'Último pesaje registrado.');
    }

    // El check-in solo se reclama a mitad de semana: el lunes por la mañana nadie
    // lo tiene hecho y avisar de eso sería ruido.
    //
    // Y solo si le has pedido pesajes: `asked`. Sin número pedido esta alerta
    // decía «check-in a medias (1/3)» sobre una norma que no existía, y de ella
    // cuelgan la columna «Check-in pendiente» y su cifra de cabecera — o sea que
    // media cartera aparecía incumpliendo lo que nadie le había mandado.
    const dayOfWeek = daysBetween(weekStart(today), today);
    if (checkIn.asked && !checkIn.complete && dayOfWeek !== null && dayOfWeek >= 3) {
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
    const exigidos = requiredBlocks(protocolo);
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
        /* El lunes de la semana que espera: lo que abre «Revisar» desde Inicio
           (`/c/:id/semana/<lunes>`). No cambia ninguna regla de la cola. */
        weekStart: submitted.weekStart || null,
        /* Lo que contestó al cuestionario de la semana (migración 0060). Viaja
           con la fila porque es lo que la cola de revisiones enseña para que se
           note, sin entrar, que esta semana trae algo nuevo. */
        answers: submitted.answers || null,
      }
    : {
        exact: false,
        submittedAt: null,
        reviewedAt: null,
        /* La aproximación de «ha hecho su parte» necesita una vara: sin pesajes
           pedidos, `complete` es cierto siempre y esto daría por entregada la
           semana de cualquiera que hubiera subido una foto. Sin norma no se
           aproxima nada. */
        pending: checkIn.asked && checkIn.complete && hasWeekPhoto,
        id: null,
        /* Sin fila, la semana por la que pregunta la cola es la del periodo
           vigente (`queueWeek`), o la natural de hoy sin pauta. */
        weekStart: currentCheckInPeriod(client.preferences, client.startDate, today)?.start || checkIn.weekStart || null,
        answers: null,
      };

  if (review.pending && review.exact) {
    add('review_pending', 'media', 'Check-in por revisar', 'Entregado y esperando tu respuesta.');
  }

  /* La pausa que venció. No es una alerta del cliente —él no ha hecho nada
     mal— sino un cabo suelto del entrenador: la fecha en la que quedasteis ya
     pasó y la ficha sigue en pausa. Con ella, las demás alertas vuelven a
     contar solas (la pausa vencida ya no silencia nada). */
  if (pausa?.expired) {
    add(
      'pause_over',
      'media',
      'Su pausa venció',
      'La fecha de vuelta ya pasó. Reanúdale o amplía la pausa desde su ficha.'
    );
  }

  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  /*
    ══ La pausa vigente silencia TODO ══════════════════════════════════════════

    Las alertas se calculan igual —el cálculo es barato y mantiene la forma de
    la fila— y aquí se descartan: a quien está de baja o de vacaciones no se le
    reprocha no entrenar, no pesarse ni deber un check-in. Es la regla de «sin
    reproches» aplicada al único caso en el que TODAS las alertas son reproche.
  */
  if (pausa?.on) {
    return {
      /* `pending: false` también aquí: la bandeja de Hoy y los filtros leen
         `review.pending` directamente, sin pasar por `reviewState`, y una
         entrega en pausa no es trabajo hasta la vuelta. `submittedAt` se
         conserva: la entrega existe, lo que no existe es la prisa. */
      review: { ...review, pending: false },
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
      weekNumber: resumen.weekNumber,
      horizonte,
      sessionCount: resumen.sessionCount,
      alerts: [],
      severity: null,
      needsAttention: false,
      paused: pausa,
    };
  }

  return {
    paused: null,
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
    /* Por dónde va y cuánto le queda escrito. Viaja en la fila porque lo leen
       tres sitios —la barra lateral, la cola de la portada y la previsión— y
       calcularlo tres veces sería acabar con tres respuestas. */
    horizonte,
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

  /* En pausa no se revisa a nadie: no hay semana que juzgar ni entrega que
     reclamar. Si entrega algo igualmente, la entrega espera a la vuelta —la
     cola no puede reclamarle trabajo a quien está de baja. */
  if (row?.paused) return 'off';

  /*
    ══ Una ENTREGA es un hecho, no una cita ═══════════════════════════════════

    «Quien no ha elegido día no aparece, porque no se puede llegar tarde a una
    cita que nadie ha puesto» — cierto para `missing`, y falso para lo que de
    verdad importa: si el cliente ha subido su semana y nadie le ha contestado,
    hay trabajo tuyo esperando, tenga pauta o no la tenga.

    Lo reportó un entrenador con un cliente sin periodicidad: subía sus fotos y
    sus pesajes, la entrega se guardaba, y en «Por revisar» no salía nadie. El
    cliente esperando una respuesta y el entrenador sin enterarse — el fallo
    exacto que esta cola existe para que no pase.

    Solo vale la entrega EXACTA (la fila de `check_ins`, migración 0009). La
    aproximación de «ha hecho su parte» sigue necesitando pauta: es una
    conjetura, y una conjetura sin cita detrás no es trabajo, es ruido.
  */
  if (row?.review?.exact && row.review.pending) return 'ready';

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
    /* Y cuántas cosas de las que le mandaste tiene sin hacer (0105). Viaja
       contada por el mismo motivo, y además porque contarla aquí obligaría a
       importar de `domain/envios.js`, que importa de este módulo: ver
       `pendientesPorCliente`. */
    mandadoCounts = {},
    /* Y cuántas respuestas suyas te faltan por leer (0108). Misma forma y mismo
       motivo: la regla de qué cuenta vive en `domain/envios.js`. */
    contestadoCounts = {},
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
        mandadoCount: mandadoCounts[client.id] || 0,
        contestadoCount: contestadoCounts[client.id] || 0,
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
          /* Entregada y sin contestar pasa SIEMPRE, sea de la semana que sea.
             Sin pauta, «el periodo en curso» se caía a la semana natural de hoy,
             así que la entrega del jueves pasado desaparecía el lunes: el
             cliente había subido lo suyo y su entrenador no volvía a verlo. Una
             respuesta que aún debes no caduca sola. */
          if (suyo.submittedAt && !suyo.reviewedAt) return suyo;
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
    /* Los pausados, al final del tramo tranquilo: con nadie hay nada que hacer,
       pero el que está al día HOY es más cartera viva que el que no está. */
    if (Boolean(a.paused) !== Boolean(b.paused)) return a.paused ? 1 : -1;
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
  /* En pausa no hay nada pendiente por definición: va con los que están al
     día, no con los que incumplen algo. */
  if (row.paused) return 'on_track';
  if (row.review?.pending) return 'to_review';
  if (row.alerts.some((a) => RISK_ALERTS.has(a.id))) return 'at_risk';
  /* A quien no le pides pesajes nunca le falta ninguno: `complete` es cierto
     siempre sin objetivo pedido (ver `weeklyCheckIn`), así que esta columna
     recoge solo a los que incumplen algo que su entrenador SÍ ha puesto. */
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
  Las doce tareas de la bandeja no son de la misma naturaleza. Nueve son trabajo
  TUYO que decides cuándo hacer —programarle, cobrarle, recordarle el check-in—
  y tres son gente que ya ha hecho su parte y está esperando a que contestes.

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
    /*
      Va pegada a «programar la rutina» porque es el mismo trabajo en otro
      momento: montarle lo que viene. La diferencia es que aquélla es de quien no
      tiene nada y ésta de quien tiene y se le acaba.
    */
    id: 'sin_semana',
    seccion: 'rutina',
    label: 'Escribir la semana siguiente',
    hint: 'No tienen hoja escrita después de la que van',
    tone: 'info',
    match: (row) => row.alerts.some((a) => a.id === 'sin_semana'),
    /* Por dónde va, y no el nombre de la tarea: la fila está debajo de una
       tarjeta que ya dice «Sin semana siguiente», y repetirlo seis veces en
       vertical no añade nada. Lo que hace falta para decidir es por dónde anda
       esa persona. */
    why: (row) =>
      row.horizonte ? `Va por el microciclo ${row.horizonte.microcicloEnCurso}` : '',
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
  {
    /*
      Las dos de lo suelto van juntas y al final, detrás del check-in: el
      check-in es la rutina de la casa y esto es lo que TÚ decidiste pedir
      aparte. Y ésta va delante de la otra porque lo que ha vuelto se lee antes
      de reclamar lo que falta — leerlo cambia a menudo lo que ibas a reclamar.
    */
    id: 'contestado',
    seccion: 'protocolo',
    label: 'Leer lo que te han contestado',
    hint: 'Han contestado algo tuyo y no lo has abierto',
    tone: 'info',
    awaited: true,
    match: (row) => row.alerts.some((a) => a.id === 'contestado_nuevo'),
    why: (row) => row.alerts.find((a) => a.id === 'contestado_nuevo')?.label || '',
  },
  {
    id: 'mandado',
    seccion: 'protocolo',
    label: 'Les falta lo que les mandaste',
    hint: 'Tienen algo tuyo pendiente, fuera de su protocolo',
    tone: 'warn',
    match: (row) => row.alerts.some((a) => a.id === 'mandado_pending'),
    why: (row) => row.alerts.find((a) => a.id === 'mandado_pending')?.label || '',
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

/*
  El acotado de las etiquetas (columna `tags`, 0093): cortas y pocas. El
  vocabulario es del entrenador; el límite solo evita que la columna acumule
  basura. Vive aquí y no en un componente porque lo aplican DOS gestos — el
  alta en la ficha y el etiquetado en lote de la cartera — y dos copias del
  mismo número acaban discrepando.
*/
export const TAG_LIMITS = { max: 8, len: 24 };

/**
 * Las etiquetas que se OFRECEN cuando el entrenador todavía no tiene las suyas.
 *
 * ══ Por qué un catálogo, si el vocabulario es suyo ══════════════════════════
 *
 * Porque un campo de texto en blanco no es libertad, es un examen. El primer
 * día no hay ninguna etiqueta puesta, así que el desplegable se abría vacío con
 * un «Buscar o crear…» y ahí se acaba: para usar la función hay que inventarse
 * primero un sistema de clasificación entero. La lista de Coachway arranca con
 * tres puestas —Weight Loss, Muscle Gain, Injured— y con eso la primera
 * etiqueta se pone en un clic.
 *
 * Son SUGERENCIAS, no un catálogo cerrado: se ofrecen solo mientras no las
 * tenga, se pueden ignorar, y crear la suya sigue siendo un renglón del mismo
 * desplegable. En cuanto usa una, deja de ser sugerencia y pasa a ser
 * vocabulario suyo como cualquier otra.
 *
 * ── Y por qué ESTAS ocho ────────────────────────────────────────────────────
 * Son los cortes por los que un entrenador de verdad agrupa su cartera cuando
 * le preguntas: el objetivo (tres), el formato (dos), y las tres situaciones
 * que cambian cómo se le lleva a alguien. No hay ninguna que dependa de una
 * función de la aplicación — una etiqueta que solo significa algo dentro del
 * producto no sirve para clasificar a personas.
 */
export const TAGS_SUGERIDAS = [
  'Pérdida de grasa',
  'Ganancia muscular',
  'Recomposición',
  'Presencial',
  'Online',
  'Competidor',
  'Lesión',
  'Mantenimiento',
];

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
  { id: 'review', label: 'Por revisar', test: (r) => Boolean(r.review?.pending) },
  { id: 'checkin', label: 'Check-in pendiente', test: (r) => !r.paused && !r.checkIn.complete },
  { id: 'payment', label: 'Cobros', test: esCobro },
  /* En pausa: los que apartaste tú. No entran en «al día» ni en «atención» —
     con ellos no hay nada que hacer hasta su vuelta— así que sin filtro propio
     no había forma de encontrarlos. */
  { id: 'paused', label: 'En pausa', test: (r) => Boolean(r.paused) },
  // «Al día» es no tener nada urgente, no tener cero avisos: un «renueva en 3
  // días» es información, no una tarea. Así atención + al día = la cartera
  // entera, y los dos números se pueden leer juntos.
  { id: 'ok', label: 'Al día', test: (r) => !r.paused && !r.needsAttention },
  { id: 'all', label: 'Todos', test: () => true },
];

const countBy = (rows, id) => {
  const filter = PORTFOLIO_FILTERS.find((f) => f.id === id);
  return rows.filter(filter.test).length;
};

/**
 * Los filtros que MERECEN estar en pantalla, con su cifra.
 *
 * ══ Un filtro solo se gana el sitio si PARTE la lista ═══════════════════════
 *
 * La regla estaba a medias y en el componente: se retiraban los que no tienen a
 * nadie —«un chip a cero es una promesa vacía»— y se dejaban los que se llevan a
 * todo el mundo, que es el mismo «no filtra nada» por el otro extremo. Contra la
 * cartera de verdad se veía: «Requieren atención 6 · Sin entrenar 6 · Todos 6»
 * sobre seis clientes. Tres botones para la misma lista, y encima prometiendo un
 * subgrupo donde lo que hay es el grupo entero.
 *
 * `all` se queda siempre: es el sitio al que se vuelve, no un filtro.
 *
 * Vive aquí y no en la pantalla porque la cifra sale de `PORTFOLIO_FILTERS`, que
 * también está aquí, y porque una regla que decide qué se ve tiene que poderse
 * probar sin montar una tabla.
 */
export const filtrosUtiles = (rows) => {
  const total = rows.length;
  return PORTFOLIO_FILTERS.map((f) => ({ ...f, count: rows.filter(f.test).length })).filter(
    (f) => f.id === 'all' || (f.count > 0 && f.count < total)
  );
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
 * Las colas de «Inicio», y nada más.
 *
 * ── Por qué son cinco y no las doce tareas de la bandeja ────────────────────
 * La bandeja (`INBOX_TASKS`) mezcla el trabajo del oficio —revisar, programar,
 * escribir a quien desaparece, cobrar— con los trámites de un alta: dar acceso,
 * terminar el alta, recordar un check-in. Sumados, el «36» de la portada no
 * decía nada y se aprendía a ignorar. Las colas son solo el oficio; los
 * trámites se listan aparte, en voz baja, y no cuentan.
 *
 * Vive aquí, en el dominio, para que la chapa de la barra lateral y la portada
 * cuenten LO MISMO: una tercera cuenta propia divergiría (y divergió).
 *
 * ── `alDia`: cómo se llama esta cola CUANDO ESTÁ VACÍA ──────────────────────
 * «Hoy» funde las colas a cero en un renglón que premia —«Revisiones y cobros,
 * al día»— y para eso necesita el nombre en positivo y en plural, que no es el
 * rótulo de la tarjeta: el rótulo dice el ESTADO («Sin leer», «Sin programar»)
 * y ahí hace falta la COSA («respuestas», «rutinas por montar»).
 *
 * Estaba en una tabla aparte dentro de `Today.jsx`, con un respaldo al rótulo
 * para lo que no estuviera en ella. Faltaba `leer`, así que el respaldo metía
 * su rótulo tal cual en mitad de la lista y la portada decía:
 *
 *     «Revisiones, SIN LEER, rutinas y cobros, al día.»
 *
 * Una negación colada en una lista de cosas que van bien. Aquí no puede pasar:
 * el nombre viaja con la cola, y una cola nueva sin él se ve al escribirla.
 */
export const COLAS_INICIO = [
  { id: 'revisar', label: 'Por revisar', alDia: 'revisiones', verbo: 'Revisar', seccion: 'semana', tasks: [] },
  {
    /*
      Va la segunda, pegada a «Por revisar», porque es la misma clase de cosa:
      alguien ha hecho su parte y espera. La diferencia es solo de qué —el
      check-in de la semana, o lo que le mandaste suelto—, y separarlas en dos
      sitios distintos de la pantalla obligaría a preguntarse dos veces «¿me
      espera alguien?».

      Es cola y no trámite porque leer lo que te ha contestado es el oficio: de
      ahí sale lo que le vas a cambiar. Los trámites son los de al lado —dar
      acceso, recordar—, que no cambian nada de lo que haces con esa persona.
    */
    id: 'leer',
    /* «Sin leer» y no «Te han contestado», que era lo primero que puse: las
       cuatro tarjetas de al lado se rotulan con el ESTADO en dos palabras —«Por
       revisar», «Sin programar», «Sin señales»— y el qué va en el pie. Y con
       cinco tarjetas en la rejilla, un rótulo de tres palabras se parte en dos
       renglones y descoloca la cifra. */
    label: 'Sin leer',
    alDia: 'respuestas',
    sub: 'te han contestado',
    verbo: 'Leer',
    seccion: 'protocolo',
    tasks: ['contestado'],
  },
  {
    id: 'programar',
    label: 'Sin programar',
    /* NO «rutinas» a secas, que es lo que decía y es el origen de que la portada
       se contradijera consigo misma: con esta cola a cero y `siguiente` con
       cinco personas, la línea afirmaba «rutinas al día» mientras la tarjeta de
       al lado decía «Sin semana siguiente · 5». Las dos colas son de rutina; lo
       que las separa es que ésta cuenta a quien no tiene NINGUNA y aquélla a
       quien no tiene la que VIENE. El nombre tiene que decir cuál es cuál. */
    alDia: 'rutinas por montar',
    sub: 'sin rutina o sin empezar',
    verbo: 'Programar',
    seccion: 'rutina',
    tasks: ['program', 'start'],
  },
  {
    id: 'senales',
    label: 'Sin señales',
    alDia: 'entrenos',
    sub: 'llevan días sin entrenar',
    verbo: 'Escribir',
    seccion: 'semana',
    tasks: ['inactive'],
  },
  {
    /*
      La única cola que mira hacia DELANTE. Las otras cuatro cuentan lo que ya
      ha pasado —te esperan, no han empezado, han desaparecido, deben dinero— y
      ésta cuenta lo que va a pasar el lunes que viene si no haces nada.

      Su rótulo dice el ESTADO en dos palabras como los demás, y el verbo es
      largo a propósito: «Escribir» ya es el de «Sin señales», y dos tarjetas
      con el mismo verbo al lado obligan a leer el rótulo para saber cuál es
      cuál. Aquí lo que se escribe es el microciclo, y decirlo lo separa.
    */
    id: 'siguiente',
    label: 'Sin semana siguiente',
    alDia: 'microciclos',
    sub: 'no hay hoja después',
    verbo: 'Escribir el microciclo',
    seccion: 'rutina',
    tasks: ['sin_semana'],
  },
  {
    id: 'cobrar',
    label: 'Cobros',
    alDia: 'cobros',
    sub: 'vencidos o vencen hoy',
    verbo: 'Cobrar',
    seccion: 'ficha',
    tasks: ['payment'],
  },
];

/**
 * Lo administrativo: se lista aparte y no suma en las colas.
 *
 * `mandado` entró aquí al repasarlo: la tarea existía en `INBOX_TASKS` desde que
 * lo mandado vuelve a la cartera, pero «Hoy» solo pinta las colas y ESTA lista,
 * así que no salía en ninguna pantalla — se calculaba para nadie. Es trámite y
 * no cola por lo mismo que «Recordar el check-in», con la que hace pareja: es
 * reclamarle algo que le falta a él, no trabajo tuyo sobre su entrenamiento.
 */
export const TRAMITES_INICIO = ['access', 'intake_ready', 'intake', 'checkin', 'mandado'];

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

/** Cuántas semanas mira la previsión. Cuatro: la de Efort y la que cabe leer. */
export const SEMANAS_DE_PREVISION = 4;

/**
 * LA PREVISIÓN: a cuánta gente se le acaba lo escrito, esta semana y las tres
 * siguientes.
 *
 * ══ Lo que se copia de Efort, y lo que no ══════════════════════════════════
 *
 * Lo que se copia es el GESTO: cuatro barras que convierten una bandeja
 * reactiva —«éstos ya se han quedado sin nada»— en planificación —«el martes te
 * tocan tres»—. Es lo mejor de su producto y no lleva ni un gráfico complicado.
 *
 * Lo que NO se copia es el dato. Su «New block forecast» cuenta bloques que se
 * acaban porque sus bloques tienen duración fija; los nuestros son abiertos, así
 * que aquí se cuenta **a quién se le acaba lo ESCRITO**: la semana siguiente a
 * su último microciclo. Es lo único cierto, y además es el trabajo real.
 *
 * ── Los dos ejes, y por qué hace falta la fecha de alta ────────────────────
 * El microciclo es un número («M11») y la previsión es un calendario («del 15 al
 * 21»). El puente entre los dos es `weekStartOfProgramWeek`, que ya existe y ya
 * lo usan las fotos y los check-ins. Sin fecha de alta no hay puente: esa
 * persona sigue saliendo en la cola —que no necesita calendario— pero no puede
 * caer en ninguna columna sin inventarse una fecha.
 *
 * ── Lo vencido cae en la primera columna ───────────────────────────────────
 * A quien se le acabó hace tres semanas le hace falta la hoja HOY, no hace tres
 * semanas. Repartirlo en columnas negativas sería un histórico de tu retraso, y
 * eso es un reproche; la primera columna dice lo que hay que escribir ya.
 *
 * @returns `SEMANAS_DE_PREVISION` cubos `{ desde, n, filas }`, de esta semana en
 *   adelante. `desde` es el lunes de cada uno; el rótulo lo pone la pantalla.
 */
export const previsionEscrita = (rows = [], today = todayISO()) => {
  const lunes = weekStart(today);
  const cubos = Array.from({ length: SEMANAS_DE_PREVISION }, (_, i) => ({
    desde: lunes ? new Date(Date.parse(`${lunes}T00:00:00Z`) + i * 7 * 86400000).toISOString().slice(0, 10) : null,
    n: 0,
    filas: [],
  }));
  if (!lunes) return cubos;

  for (const row of rows) {
    /* En pausa no se cuenta: a quien apartaste tú no se le escribe la semana
       que viene. Es la misma regla que silencia sus alertas. */
    if (row.paused) continue;
    const horizonte = row.horizonte;
    if (!horizonte) continue;

    /*
      La columna es la semana del ÚLTIMO microciclo escrito: es la última en la
      que tiene hoja, o sea la semana en la que hay que escribirle la siguiente.
      Quien lleva tres semanas montadas por delante no da trabajo hoy: da
      trabajo dentro de tres. Ésa es la diferencia entre la previsión y la cola
      —la cola es esta columna, la primera— y toda la gracia del movimiento.
    */
    const seAcaba = weekStartOfProgramWeek(row.client.startDate, horizonte.ultimoEscrito);
    if (!seAcaba) continue;

    const dias = daysBetween(lunes, seAcaba);
    if (dias === null) continue;
    const i = Math.max(0, Math.floor(dias / 7));
    if (i >= SEMANAS_DE_PREVISION) continue;

    cubos[i].n += 1;
    cubos[i].filas.push(row);
  }

  return cubos;
};
