/**
 * «Hoy»: la jornada del entrenador.
 *
 * ══ Por qué existe esta pantalla ════════════════════════════════════════════
 *
 * La cartera responde **«¿en qué estado está cada cliente?»**: cuatro columnas,
 * cada uno en la suya, ordenados por gravedad. Es un corte transversal, y es lo
 * correcto cuando la pregunta es a quién atender primero.
 *
 * Pero esa no es la primera pregunta de la mañana. La primera es
 * **«¿qué ha pasado desde ayer?»**, y ninguna pantalla la contestaba. Los datos
 * estaban todos —una sesión registrada tiene fecha, un pesaje tiene fecha, una
 * foto tiene fecha, un check-in tiene hora de entrega— pero solo se podían ver
 * cliente a cliente, así que enterarse de que Marta entrenó ayer exigía entrar en
 * Marta. Con veinte clientes eso no se hace, y el resultado práctico es que el
 * trabajo del cliente pasa desapercibido salvo que se convierta en un problema y
 * salte como alerta.
 *
 * Este módulo lo pone del derecho: un hilo cronológico de lo que han hecho, y una
 * bandeja de lo que espera respuesta.
 *
 * ── La diferencia con la cartera, dicha de otra forma ───────────────────────
 * La cartera cuenta lo que FALTA. «Hoy» cuenta lo que HA OCURRIDO. Son las dos
 * mitades del mismo trabajo y ninguna sustituye a la otra: un cliente puede estar
 * impecable en la cartera —sin una sola alerta— y haber entrenado cuatro veces
 * esta semana batiendo su tonelaje, y eso, que es la razón por la que te paga, no
 * aparecía en ningún sitio.
 *
 * ── Sin una sola consulta más ───────────────────────────────────────────────
 * Todo sale de lo que la aplicación ya tiene en memoria: `workoutData`,
 * `anthropometry`, `progressPhotos` y `checkIns` se cargan al arrancar para toda
 * la cartera. Nada de esto añade tráfico.
 *
 * Los eventos de calendario NO entran, y es a propósito: se cargan por cliente y
 * bajo demanda (`loadEvents`), así que traerlos aquí significaría una consulta por
 * cliente al abrir la aplicación. La agenda vive en el calendario de cada uno.
 *
 * ── Funciones puras ─────────────────────────────────────────────────────────
 * Como todo `domain/`: sin React, sin Supabase, sin `Date.now()` escondido —el
 * día de hoy siempre entra como argumento, que es lo que hace que estas funciones
 * se puedan probar en enero y en agosto con el mismo resultado.
 */

import { daysBetween, localeNumber, toISODate, todayISO, weekdayName } from '@/lib/dates';
import { feeLabel, needsCollecting, paymentState } from './billing';
import { isSetLogged, sessionTonnage } from './sessions';

/**
 * Los cuatro tipos de actividad, con el color del dato al que pertenecen y la
 * sección del cliente a la que lleva pulsarlos.
 *
 * `section` no es decoración: un evento del que no se puede tirar es una
 * notificación, y una notificación que no lleva a ningún sitio se ignora a la
 * tercera. Aquí pulsar «Marta registró Empuje A» abre la rutina de Marta.
 */
export const ACTIVITY_KINDS = {
  session: { id: 'session', label: 'Entreno', color: 'var(--data-violet)', section: 'rutina' },
  weight: { id: 'weight', label: 'Pesaje', color: 'var(--data-blue)', section: 'revision' },
  photo: { id: 'photo', label: 'Fotos', color: 'var(--data-pink)', section: 'revision/fotos' },
  checkin: { id: 'checkin', label: 'Check-in', color: 'var(--data-teal)', section: 'revision' },
};

/** Ventana por defecto del hilo. Dos semanas es lo que cabe leer de una sentada. */
export const DEFAULT_WINDOW = 14;

/** ¿Cae esta fecha dentro de los `days` últimos días, hoy incluido? */
const inWindow = (date, today, days) => {
  const age = daysBetween(date, today);
  return age !== null && age >= 0 && age < days;
};

/**
 * Cuántas series se registraron de verdad en una sesión.
 *
 * Hace falta porque una sesión ABIERTA y una sesión HECHA son la misma fila hasta
 * que alguien escribe kilos: al empezar el día el entrenador crea la sesión con
 * todas las casillas en blanco. Anunciar «Marta entrenó» por una plantilla vacía
 * es exactamente la clase de aviso falso que hace que se deje de mirar la
 * pantalla.
 */
const loggedSetCount = (session) => {
  let n = 0;
  for (const entry of session?.entries || []) {
    for (const set of entry.sets || []) if (isSetLogged(set)) n += 1;
  }
  return n;
};

/**
 * Todo lo que ha hecho un cliente en la ventana, como lista de eventos.
 *
 * Un evento es una COSA QUE PASÓ, no un dato: las cuatro fotos que alguien sube
 * de una vez son un solo evento («4 fotos»), y no cuatro líneas idénticas que
 * empujan al resto de la cartera fuera de la pantalla. Lo mismo con las series de
 * una sesión: doce series registradas son un entreno.
 */
const clientEvents = ({ client, training, anthro, photos, checkIn }, today, days) => {
  const out = [];
  const push = (event) => out.push({ clientId: client.id, clientName: client.name, ...event });

  /*
    ── Entrenos ──────────────────────────────────────────────────────────────
    De `recentSessions`, que ya viene acotado a los últimos días. Antes esto
    recorría el programa ENTERO de cada cliente para quedarse con los dos últimos
    entrenos, lo que obligaba a tenerlo descargado (`auditoria.md` 1.5).

    Las sesiones que llegan son las mismas de siempre, con sus entradas completas:
    el tonelaje y las series se siguen calculando aquí, con las mismas funciones.
    Lo que cambia es cuántas hay que traer, no cómo se leen.
  */
  for (const session of training?.recentSessions || []) {
    if (!inWindow(session.date, today, days)) continue;
    const sets = loggedSetCount(session);
    if (sets === 0) continue;

    const tonnage = sessionTonnage(session);
    push({
      id: `session:${client.id}:${session.id}`,
      date: session.date,
      kind: 'session',
      title: session.dayName || 'Entreno',
      detail: [
        `${sets} ${sets === 1 ? 'serie' : 'series'}`,
        tonnage > 0 ? `${localeNumber(tonnage)} kg` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }

  // ── Pesajes ───────────────────────────────────────────────────────────────
  for (const log of anthro?.history || []) {
    if (!inWindow(log.date, today, days)) continue;
    if (log.weight === null || log.weight === undefined || log.weight === '') continue;
    push({
      id: `weight:${client.id}:${log.date}`,
      date: log.date,
      kind: 'weight',
      title: `${log.weight} kg`,
      detail: log.skinFolds ? 'con pliegues' : null,
    });
  }

  // ── Fotos, agrupadas por día ──────────────────────────────────────────────
  const photosByDay = new Map();
  for (const photo of photos) {
    const date = toISODate(photo.date);
    if (!date || !inWindow(date, today, days)) continue;
    photosByDay.set(date, (photosByDay.get(date) || 0) + 1);
  }
  for (const [date, count] of photosByDay) {
    push({
      id: `photo:${client.id}:${date}`,
      date,
      kind: 'photo',
      title: `${count} ${count === 1 ? 'foto' : 'fotos'}`,
      detail: 'de progreso',
    });
  }

  // ── Check-in entregado ────────────────────────────────────────────────────
  const submitted = toISODate(checkIn?.submittedAt);
  if (submitted && inWindow(submitted, today, days)) {
    push({
      id: `checkin:${client.id}:${checkIn.id}`,
      date: submitted,
      kind: 'checkin',
      title: 'Entregó su check-in',
      detail: checkIn.reviewedAt ? 'revisado' : 'esperando tu respuesta',
      pending: !checkIn.reviewedAt,
    });
  }

  return out;
};

/**
 * El hilo completo de la cartera, del más reciente al más antiguo.
 *
 * El desempate por nombre no es cosmético: sin él, dos eventos del mismo día
 * salen en el orden en que Object.keys devolvió los clientes, que cambia entre
 * recargas. Una lista que se reordena sola al refrescar parece que ha cambiado
 * cuando no ha pasado nada.
 */
export const buildActivity = (
  { clients = [], training = {}, anthropometry = {}, progressPhotos = [], checkIns = {} },
  today = todayISO(),
  days = DEFAULT_WINDOW
) => {
  const photosByClient = new Map();
  for (const photo of progressPhotos) {
    if (!photosByClient.has(photo.clientId)) photosByClient.set(photo.clientId, []);
    photosByClient.get(photo.clientId).push(photo);
  }

  const events = clients.flatMap((client) =>
    clientEvents(
      {
        client,
        training: training[client.id],
        anthro: anthropometry[client.id],
        photos: photosByClient.get(client.id) || [],
        checkIn: checkIns[client.id] || null,
      },
      today,
      days
    )
  );

  return events.sort((a, b) => {
    if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
    return a.clientName.localeCompare(b.clientName);
  });
};

/** Etiqueta del día: relativa cuando lo relativo se entiende mejor que la fecha. */
export const dayLabel = (date, today = todayISO()) => {
  const age = daysBetween(date, today);
  if (age === 0) return 'Hoy';
  if (age === 1) return 'Ayer';

  const d = new Date(`${toISODate(date)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;

  /*
    Dentro de la última semana basta el día de la semana —«jueves» se sitúa solo—;
    más atrás hace falta la fecha, porque «jueves» a doce días de distancia ya no
    dice cuál. El resultado se capitaliza porque `toLocaleDateString` en español
    devuelve el día en minúscula y aquí encabeza una sección.
  */
  const label =
    age !== null && age < 7
      ? weekdayName(d)
      : weekdayName(d, { conFecha: true });

  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** Agrupa el hilo por día, conservando el orden de entrada. */
export const groupByDay = (events, today = todayISO()) => {
  const byDate = new Map();
  for (const event of events) {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push(event);
  }
  return [...byDate.entries()].map(([date, rows]) => ({
    date,
    label: dayLabel(date, today),
    events: rows,
  }));
};

/**
 * La escala de días: cuántos eventos hubo cada día de la ventana, del más
 * antiguo al más reciente.
 *
 * Es lo que alimenta LA REGLA de la cabecera —la firma visual del producto— y la
 * única razón por la que esa firma se gana estar ahí: no es un adorno, es un
 * histograma. Un día vacío en mitad de la tira es una cartera que se ha quedado
 * quieta, y eso se ve antes de leer una sola línea.
 *
 * Se devuelven TODOS los días, también los de cero. Una escala a la que le faltan
 * las marcas vacías deja de ser una escala.
 */
export const activityScale = (events, today = todayISO(), days = DEFAULT_WINDOW) => {
  const counts = new Map();
  for (const event of events) counts.set(event.date, (counts.get(event.date) || 0) + 1);

  const base = new Date(`${today}T00:00:00Z`);
  const out = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - back);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, count: counts.get(date) || 0, isToday: back === 0 });
  }
  return out;
};

/**
 * La bandeja: lo que espera una respuesta TUYA.
 *
 * ── Por qué es tan corta ────────────────────────────────────────────────────
 * La tentación es repetir aquí las alertas de la cartera, y sería un error: dos
 * pantallas que dicen lo mismo con distinta forma obligan a mirar las dos por si
 * acaso, y entonces ninguna de las dos es la buena.
 *
 * Aquí entra solo lo que tiene la pelota en tu tejado:
 *
 *   · Un check-in entregado y sin revisar. Alguien ha hecho su parte y espera.
 *   · Un cobro vencido o que vence ya. Tiene fecha, y la fecha es hoy.
 *
 * «Lleva nueve días sin entrenar» no entra: eso es un estado, no algo que llegó,
 * y la cartera lo ordena mejor de lo que lo haría una lista cronológica. Desde
 * aquí se enlaza a esa columna en vez de copiarla.
 */
export const buildInbox = (rows = [], today = todayISO()) => {
  const items = [];

  for (const row of rows) {
    if (row.review?.pending) {
      items.push({
        id: `review:${row.client.id}`,
        clientId: row.client.id,
        name: row.client.name,
        kind: 'review',
        tone: 'info',
        title: 'Check-in entregado',
        /* Que traiga cuestionario contestado se dice aquí: es lo que distingue
           «tienes que mirar sus fotos» de «además te ha contado cómo le ha ido»,
           y decide si esto se abre ahora o después de comer. */
        detail: row.review.exact
          ? row.review.answers
            ? 'Con su cuestionario contestado, esperando tu revisión'
            : 'Esperando tu revisión'
          : 'Ha hecho su parte de la semana (deducido de pesajes y fotos)',
        reviewId: row.review.id,
        section: 'revision',
      });
    }

    /*
      El cobro sale de `paymentState`, no de recomponer alertas.

      Antes se buscaba `payment_overdue` o bien un `payment_soon` con cero días,
      que es el mismo criterio dicho de una tercera manera — y por tanto una
      tercera oportunidad de que discrepe de las otras dos. Ahora las tres
      pantallas preguntan a la misma función.
    */
    const pago = paymentState(row.client, today);
    if (needsCollecting(pago)) {
      items.push({
        id: `payment:${row.client.id}`,
        clientId: row.client.id,
        name: row.client.name,
        kind: 'payment',
        tone: pago.tone === 'bad' ? 'bad' : 'warn',
        title: pago.label,
        /* Cuánto, si está anotado. Cobrar sin saber el importe obliga a abrir la
           ficha, que es justo lo que esta bandeja existe para evitar. */
        detail: [feeLabel(row.client), pago.detail].filter(Boolean).join(' · '),
        section: 'resumen',
      });
    }
  }

  /* Los cobros vencidos primero: es lo único de la bandeja que cuesta dinero. */
  const WEIGHT = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => WEIGHT[a.tone] - WEIGHT[b.tone] || a.name.localeCompare(b.name));
};
