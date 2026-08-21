/**
 * Calendario del cliente.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * El check-in semanal no tiene día. «Pésate tres veces» sin decir cuándo se
 * convierte en «me peso cuando me acuerdo», y ahí se acaba la comparabilidad: el
 * promedio de una semana con tres pesajes de lunes a miércoles no es comparable
 * con el de otra con tres de viernes a domingo.
 *
 * Aquí el cliente fija SU día —el que le encaje— y a partir de ahí el calendario
 * lo repite, marca lo cumplido y le deja apuntar lo suyo: una carrera, una semana
 * de viaje, una comida fuera. Esas notas no son adorno: explican los picos del peso
 * que si no parecen inexplicables.
 *
 * Todo son funciones puras sobre fechas ISO. El mes se genera aquí y no en el
 * componente para poder comprobarlo caso por caso: los meses que empiezan en
 * domingo y los años bisiestos son donde fallan estas cosas.
 */

import { addDays, daysBetween, toISODate, todayISO, weekStart } from '@/lib/dates';

const DAY_MS = 86400000;

/** Tipos de evento. `checkin` lo genera el sistema; el resto los pone la gente. */
export const EVENT_KINDS = [
  { id: 'checkin', label: 'Check-in', hint: 'Pesarse y subir las fotos', color: 'var(--accent)' },
  { id: 'appointment', label: 'Cita', hint: 'Sesión presencial, videollamada, revisión', color: 'var(--data-blue)' },
  { id: 'race', label: 'Competición', hint: 'Carrera, campeonato, prueba', color: 'var(--data-violet)' },
  { id: 'rest', label: 'Descanso', hint: 'Viaje, vacaciones, semana de descarga', color: 'var(--data-amber)' },
  { id: 'goal', label: 'Objetivo', hint: 'Una fecha a la que llegar', color: 'var(--data-pink)' },
  { id: 'note', label: 'Nota', hint: 'Cualquier otra cosa que quieras recordar', color: 'var(--data-slate)' },
];

export const kindMeta = (id) => EVENT_KINDS.find((k) => k.id === id) || EVENT_KINDS[EVENT_KINDS.length - 1];

/** Lunes = 0 … domingo = 6, que es el orden en el que se lee un calendario aquí. */
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const weekdayIndex = (date) => {
  const d = new Date(`${toISODate(date)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : (d.getUTCDay() + 6) % 7;
};

/**
 * Rejilla de un mes: siempre semanas completas de lunes a domingo, con los días
 * de los meses vecinos rellenados.
 *
 * Se rellenan a propósito en lugar de dejar huecos: una rejilla con huecos hace
 * que la primera semana del mes parezca más corta, y un check-in que cae en un día
 * de relleno tiene que verse igual —esa semana existe aunque el mes no la empiece.
 */
export const monthGrid = (year, month) => {
  const first = Date.UTC(year, month, 1);
  const start = Date.parse(`${weekStart(new Date(first).toISOString().slice(0, 10))}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Semanas necesarias para cubrir el mes desde el lunes de su primera semana.
  const offset = Math.round((first - start) / DAY_MS);
  const weeks = Math.ceil((offset + daysInMonth) / 7);

  return Array.from({ length: weeks * 7 }, (_, i) => {
    const iso = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    const d = new Date(`${iso}T00:00:00Z`);
    return {
      date: iso,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month && d.getUTCFullYear() === year,
      isToday: iso === todayISO(),
      weekStart: weekStart(iso),
    };
  });
};

/**
 * Los 7 días de la semana de una fecha, de lunes a domingo, con la MISMA forma
 * que las celdas del mes: lo que sabe leer una celda del mes (`checkInDates`,
 * `eventsByDate`) sabe leer una de estas sin enterarse de dónde viene.
 *
 * Es lo que pinta el bloque «Esta semana» del calendario: la semana en curso
 * con sus eventos con nombre, sin tener que buscarlos entre treinta y cinco
 * celdas de mes.
 */
export const weekCells = (date = todayISO()) => {
  const lunes = weekStart(toISODate(date) || todayISO());
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(lunes, i);
    return {
      date: iso,
      day: new Date(`${iso}T00:00:00Z`).getUTCDate(),
      inMonth: true,
      isToday: iso === todayISO(),
      weekStart: lunes,
    };
  });
};

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const monthLabel = (year, month) => `${MONTH_NAMES[month]} de ${year}`;

/** Mes anterior / siguiente sin liarse con el año. */
export const shiftMonth = (year, month, delta) => {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
};

/**
 * Días de check-in del mes, según el día elegido por el cliente.
 *
 * ── Por qué se derivan y no se guardan ──────────────────────────────────────
 * Guardar una fila por cada check-in futuro obligaría a generarlas para siempre y
 * a borrarlas y regenerarlas cada vez que el cliente cambie de día. Derivarlos del
 * día de la semana es una cuenta, y cambiar de día es cambiar un número.
 *
 * Solo se materializan como fila los que TIENEN algo: el check-in entregado vive en
 * `check_ins`, no aquí.
 */
export const checkInDates = (grid, weekday, everyWeeks = 1, anchor = null) => {
  if (weekday === null || weekday === undefined) return new Set();

  const cada = Number.isInteger(everyWeeks) && everyWeeks > 0 ? everyWeeks : 1;
  const desde = anchor ? weekStart(anchor) : null;

  return new Set(
    grid
      .filter((cell) => {
        if (weekdayIndex(cell.date) !== weekday) return false;
        if (cada === 1 || !desde) return true;

        /*
          Solo las semanas que le tocan. Sin esto el calendario marcaba TODAS
          —también a quien revisa cada dos semanas—, y entonces el cliente veía
          una cita cada semana mientras la aplicación le reclamaba una cada dos.
          Dos verdades sobre la misma pregunta, y la que se cree es la del
          calendario, que es la que se mira.

          Se cuenta desde la misma ancla que `currentCheckInPeriod`, así que las
          fechas marcadas y las reclamadas no pueden discrepar.
        */
        const semanas = Math.floor((daysBetween(desde, cell.weekStart) || 0) / 7);
        return ((semanas % cada) + cada) % cada === 0;
      })
      .map((cell) => cell.date)
  );
};

/* ==========================================================================
   Cada cuánto toca el check-in
   --------------------------------------------------------------------------
   ══ Por qué hacía falta ═════════════════════════════════════════════════════

   El día ya se elegía (`preferences.checkin.weekday`), pero la aplicación daba
   por hecho que TODAS las semanas tocaba. Con eso, la lista de revisiones
   pendientes del entrenador enseñaba a los veinte clientes cada lunes —incluidos
   los que revisan cada dos semanas y los que no habían subido nada— y una lista
   que sale entera siempre no es una lista de pendientes, es la cartera otra vez.

   Con la cadencia, «pendiente» pasa a significar algo: le tocaba, y o lo ha
   subido (y te espera) o no lo ha subido (y se le reclama). A quien no le toca no
   aparece.

   ── El ancla, y por qué es la fecha de alta ─────────────────────────────────
   «Cada dos semanas» necesita saber CUÁLES son esas semanas. Se cuentan desde
   que empezó el cliente, que es la única fecha que ya existe, que no hay que
   inventar ni mantener, y que además se explica sola: «cada dos semanas desde que
   empezaste». Sin fecha de alta se comporta como semanal, que es no estorbar.
   ========================================================================== */

/**
 * Las cadencias que se pueden elegir. En semanas, porque el check-in cuelga de un
 * día de la semana: «cada 10 días» no tendría dónde caer.
 */
export const CHECKIN_CADENCES = [
  { weeks: 1, label: 'Cada semana' },
  { weeks: 2, label: 'Cada 2 semanas' },
  { weeks: 4, label: 'Cada 4 semanas' },
];

/** El día y la cadencia de un cliente, con los valores por defecto puestos. */
export const checkInSchedule = (preferences) => {
  const raw = preferences?.checkin;
  const weekday = Number.isInteger(raw?.weekday) && raw.weekday >= 0 && raw.weekday <= 6 ? raw.weekday : null;
  const weeks = CHECKIN_CADENCES.some((c) => c.weeks === raw?.everyWeeks) ? raw.everyWeeks : 1;
  return { weekday, everyWeeks: weeks };
};

/**
 * El periodo de check-in vigente: cuándo empezó y qué día toca entregarlo.
 *
 * Devuelve `null` cuando el cliente no ha elegido día — sin día no hay «le
 * tocaba», y reclamar algo que nadie ha fijado es ruido.
 *
 *   `start`  — el lunes del periodo en curso. Un check-in de esa fecha en
 *              adelante cuenta como el de este periodo.
 *   `dueOn`  — la fecha exacta en la que le toca.
 *   `isDue`  — si ya ha llegado ese día. Antes no se le reclama nada: el jueves
 *              por la mañana nadie ha hecho el check-in del jueves.
 */
export const currentCheckInPeriod = (preferences, startDate, today = todayISO()) => {
  const { weekday, everyWeeks } = checkInSchedule(preferences);
  if (weekday === null) return null;

  const semanaDeHoy = weekStart(today);
  const ancla = startDate ? weekStart(startDate) : semanaDeHoy;

  /*
    ══ El alta futura no tiene periodo en curso ═══════════════════════════════

    Pasa al dar de alta a alguien que empieza el mes que viene, y hasta ahora
    esto lo decía el comentario y no lo hacía el código: sin esta guarda, el
    módulo de abajo —`((semanas % everyWeeks) + everyWeeks) % everyWeeks`—
    normaliza las semanas NEGATIVAS al rango [0, everyWeeks-1], lo que anclaba el
    periodo a esta semana y daba un `dueOn` ya pasado.

    Con `isDue` en cierto, `reviewState` no entraba en `off`, caía en `missing`, y
    la cola de revisiones reclamaba el check-in de alguien cuyo contrato todavía
    no ha empezado. `null` es lo que ya se devuelve cuando no hay día elegido, y
    todos los consumidores lo traducen a «no le toca».
  */
  if (ancla > semanaDeHoy) return null;

  /* Cuántas semanas van desde el ancla. Nunca negativo: lo anterior ya salió. */
  const semanas = Math.floor((daysBetween(ancla, semanaDeHoy) || 0) / 7);
  const dentro = ((semanas % everyWeeks) + everyWeeks) % everyWeeks;

  const start = new Date(Date.parse(`${semanaDeHoy}T00:00:00Z`) - dentro * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const dueOn = new Date(Date.parse(`${start}T00:00:00Z`) + weekday * DAY_MS)
    .toISOString()
    .slice(0, 10);

  return { start, dueOn, everyWeeks, isDue: today >= dueOn };
};

/** Eventos indexados por fecha, para pintar la rejilla sin recorrer la lista N veces. */
export const eventsByDate = (events) => {
  const map = new Map();
  for (const event of events) {
    if (!map.has(event.date)) map.set(event.date, []);
    map.get(event.date).push(event);
  }
  // Los del sistema primero, y dentro de cada grupo por orden de creación.
  const order = EVENT_KINDS.map((k) => k.id);
  for (const list of map.values()) {
    list.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  }
  return map;
};

/** Sumar días a una fecha ISO, que aquí se hace en tres sitios. */
const masDias = (iso, dias) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DAY_MS).toISOString().slice(0, 10);

/**
 * El próximo check-in a partir de hoy, o null si el cliente no ha elegido día.
 *
 * Es la cifra que se le enseña al cliente: «te toca el jueves» dice más que un
 * calendario entero.
 *
 * ══ Por qué recibe las preferencias y no un día suelto ══════════════════════
 *
 * Antes la firma era `(weekday, from)` y devolvía **el próximo jueves natural**,
 * sin saber nada de la cadencia ni de la fecha de alta. Con cadencia quincenal
 * eso es mentira la mitad de las veces, que es justo lo que el único sitio que la
 * usaba —el calendario— avisaba por escrito de no querer.
 *
 * Pidiendo las preferencias y el alta no hay forma de llamarla mal: es la misma
 * pareja de datos con la que `currentCheckInPeriod` decide si toca, así que las
 * dos contestan siempre lo mismo.
 */
export const nextCheckIn = (preferences, startDate, from = todayISO()) => {
  const { weekday, everyWeeks } = checkInSchedule(preferences);
  if (weekday === null) return null;
  if (weekdayIndex(from) === null) return null;

  const semanaDeHoy = weekStart(from);
  const ancla = startDate ? weekStart(startDate) : semanaDeHoy;

  /*
    Con el alta en el futuro el primero que le toca es el de SU primera semana:
    no hay periodo en curso que continuar. Con el alta ya pasada se retrocede
    hasta el inicio del periodo vigente, igual que en `currentCheckInPeriod`.
  */
  let inicio = ancla;
  if (ancla <= semanaDeHoy) {
    const semanas = Math.floor((daysBetween(ancla, semanaDeHoy) || 0) / 7);
    const dentro = ((semanas % everyWeeks) + everyWeeks) % everyWeeks;
    inicio = masDias(semanaDeHoy, -dentro * 7);
  }

  const deEstePeriodo = masDias(inicio, weekday);
  /* Si el de este periodo ya pasó, el siguiente está una cadencia más allá — no
     la semana que viene, que es lo que devolvía la versión anterior. */
  return deEstePeriodo >= from ? deEstePeriodo : masDias(inicio, everyWeeks * 7 + weekday);
};
