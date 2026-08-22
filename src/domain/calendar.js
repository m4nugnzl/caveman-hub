/**
 * Calendario del cliente.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * La revisión no tenía día. «Pésate tres veces» sin decir cuándo se convierte en
 * «me peso cuando me acuerdo», y ahí se acaba la comparabilidad: el promedio de
 * una semana con tres pesajes de lunes a miércoles no es comparable con el de
 * otra con tres de viernes a domingo.
 *
 * ══ La pauta la puede poner cualquiera de los dos, y es a propósito ═════════
 *
 * El día y la cadencia son de las dos partes: el cliente elige el que le encaja
 * al entrar y ahí se queda, y el entrenador puede ponérselo o moverlo sin
 * pedírselo. Lo que hace falta no es que la fecha sea inamovible —eso convierte
 * cada viaje en una discusión— sino que **exista y sea una sola**: mientras haya
 * un día, `reviewState` puede decir `missing`, que es la señal de que alguien
 * lleva tres semanas sin subir nada. Sin día no se reclama nada, que es la única
 * situación que de verdad rompe el bucle.
 *
 * Alrededor cuelga lo suyo: una carrera, una semana de viaje, una comida fuera.
 * Esas notas no son adorno — explican los picos del peso que si no parecen
 * inexplicables.
 *
 * Todo son funciones puras sobre fechas ISO. El mes se genera aquí y no en el
 * componente para poder comprobarlo caso por caso: los meses que empiezan en
 * domingo y los años bisiestos son donde fallan estas cosas.
 */

import { addDays, daysBetween, toISODate, todayISO, weekStart } from '@/lib/dates';

const DAY_MS = 86400000;

/** Tipos de evento. `checkin` lo genera el sistema; el resto los pone la gente. */
export const EVENT_KINDS = [
  { id: 'checkin', label: 'Revisión', hint: 'Pesarse y subir las fotos', color: 'var(--accent)' },
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

/* ==========================================================================
   Cada cuánto toca la revisión
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
 * Las cadencias que se pueden elegir. En semanas, porque la revisión cuelga de un
 * día de la semana: «cada 10 días» no tendría dónde caer.
 */
export const CHECKIN_CADENCES = [
  { weeks: 1, label: 'Cada semana' },
  { weeks: 2, label: 'Cada 2 semanas' },
  { weeks: 4, label: 'Cada 4 semanas' },
];

/* ==========================================================================
   Las fechas movidas
   --------------------------------------------------------------------------
   ══ Qué son y por qué no son «otro calendario» ══════════════════════════════

   Una pauta —jueves, cada dos semanas— cubre el caso normal y no cubre ninguno
   de los que de verdad ocurren: la semana que el cliente se va de viaje, la
   revisión que hay que adelantar antes de una competición, el día concreto al
   que el entrenador quiere que llegue con las fotos hechas.

   Hasta ahora eso se resolvía fuera de la aplicación —un mensaje de WhatsApp—, y
   por tanto la aplicación seguía reclamando el jueves mientras las dos personas
   habían quedado el martes. La pauta decía una cosa y la realidad otra.

   ── Mueven, no añaden ──────────────────────────────────────────────────────
   Una fecha movida NO es una revisión extra: **sustituye a la de su periodo**.
   Es la diferencia entre «este jueves, mejor el martes» y «dos revisiones esta
   semana», y la primera es la que pide todo el mundo.

   De ahí sale la propiedad que hace que esto no pueda mentir: cada periodo tiene
   exactamente UNA fecha de entrega, la calcula `dueOnOf`, y las tres preguntas
   —qué días se marcan, si le toca ya, cuándo le toca— la leen de ahí. No hay
   forma de que el calendario enseñe un día y la cola de revisiones reclame otro,
   que es el fallo que este archivo lleva dos rondas evitando.

   ── Por qué necesitan pauta ────────────────────────────────────────────────
   Una fecha suelta sin pauta no tiene periodo, y sin periodo no hay ventana en
   la que dejar de reclamarla: se quedaría pendiente para siempre. Con pauta, el
   periodo siguiente la releva sola.
   ========================================================================== */

/** Tope de fechas movidas que se guardan. Las preferencias enteras caben en 8 KB. */
export const MAX_CHECKIN_DATES = 12;

/** La pauta de revisión de un cliente, con los valores por defecto puestos. */
export const checkInSchedule = (preferences) => {
  const raw = preferences?.checkin;
  const weekday = Number.isInteger(raw?.weekday) && raw.weekday >= 0 && raw.weekday <= 6 ? raw.weekday : null;
  const weeks = CHECKIN_CADENCES.some((c) => c.weeks === raw?.everyWeeks) ? raw.everyWeeks : 1;

  /* Ordenadas y sin repetidos, aquí y no en quien las escriba: `dueOnOf` se
     queda con la PRIMERA que cae dentro del periodo, así que el orden es parte
     del significado y no puede depender de en qué orden se pulsaron. */
  const dates = [...new Set((Array.isArray(raw?.dates) ? raw.dates : []).map(toISODate).filter(Boolean))]
    .sort()
    .slice(0, MAX_CHECKIN_DATES);

  return { weekday, everyWeeks: weeks, dates };
};

/**
 * El lunes en el que empieza el periodo al que pertenece una semana.
 *
 * `null` antes del ancla: quien todavía no ha empezado no está en ningún
 * periodo. La cuenta del módulo normalizaría las semanas negativas al rango
 * [0, everyWeeks-1] y devolvería un periodo inventado — es el fallo que la
 * migración de `currentCheckInPeriod` ya tuvo una vez.
 */
const periodStartOf = (weekStartISO, anchor, everyWeeks) => {
  const semanas = Math.floor((daysBetween(anchor, weekStartISO) || 0) / 7);
  if (semanas < 0) return null;
  return addDays(weekStartISO, -(semanas % everyWeeks) * 7);
};

/**
 * La fecha de entrega de UN periodo: su día de pauta, salvo que haya una fecha
 * movida dentro, que manda.
 *
 * Es la única función que decide esto. Todo lo demás la llama.
 */
const dueOnOf = (periodStart, { weekday, everyWeeks, dates }) => {
  if (!periodStart) return null;
  const fin = addDays(periodStart, everyWeeks * 7); // exclusivo: el lunes siguiente
  const movida = dates.find((d) => d >= periodStart && d < fin);
  return movida || addDays(periodStart, weekday);
};

/**
 * Días de revisión de una tanda de celdas, según la pauta del cliente.
 *
 * ── Por qué se derivan y no se guardan ──────────────────────────────────────
 * Guardar una fila por cada revisión futura obligaría a generarlas para siempre y
 * a borrarlas y regenerarlas cada vez que se cambie de día. Derivarlas de la
 * pauta es una cuenta, y cambiar de día es cambiar un número.
 *
 * Solo se materializa como fila lo que TIENE algo: la revisión entregada vive en
 * `check_ins`, no aquí.
 *
 * ══ Por qué recibe la pauta entera y no un día suelto ═══════════════════════
 *
 * Es el mismo argumento que llevó a `nextCheckIn` a cambiar de firma. Con
 * `(grid, weekday, everyWeeks, anchor)` había que acordarse de pasar las cuatro
 * cosas en orden, y las fechas movidas no cabían en ninguna. Pidiendo el
 * resultado de `checkInSchedule` no hay forma de llamarla a medias.
 *
 * ── Y por qué el ancla cae en la semana de la celda, no en null ────────────
 * Sin fecha de alta, la versión anterior marcaba TODOS los días de la pauta
 * —también a quien revisa cada dos semanas— mientras `currentCheckInPeriod`
 * anclaba en la semana de hoy. Dos verdades sobre la misma pregunta, y la que se
 * cree es la del calendario, que es la que se mira. Ahora las dos anclan igual.
 */
export const checkInDates = (cells, schedule, anchor = null, today = todayISO()) => {
  if (schedule?.weekday === null || schedule?.weekday === undefined) return new Set();

  const desde = weekStart(anchor || today);

  return new Set(
    cells
      .filter((cell) => cell.date === dueOnOf(periodStartOf(cell.weekStart, desde, schedule.everyWeeks), schedule))
      .map((cell) => cell.date)
  );
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
  const pauta = checkInSchedule(preferences);
  if (pauta.weekday === null) return null;

  const semanaDeHoy = weekStart(today);
  const ancla = startDate ? weekStart(startDate) : semanaDeHoy;

  /*
    ══ El alta futura no tiene periodo en curso ═══════════════════════════════

    Pasa al dar de alta a alguien que empieza el mes que viene. Sin la guarda de
    `periodStartOf`, el módulo normaliza las semanas NEGATIVAS al rango
    [0, everyWeeks-1], lo que anclaba el periodo a esta semana y daba un `dueOn`
    ya pasado.

    Con `isDue` en cierto, `reviewState` no entraba en `off`, caía en `missing`, y
    la cola de revisiones reclamaba la revisión de alguien cuyo contrato todavía
    no ha empezado. `null` es lo que ya se devuelve cuando no hay día elegido, y
    todos los consumidores lo traducen a «no le toca».
  */
  const start = periodStartOf(semanaDeHoy, ancla, pauta.everyWeeks);
  if (!start) return null;

  const porPauta = addDays(start, pauta.weekday);
  const dueOn = dueOnOf(start, pauta);

  return {
    start,
    dueOn,
    everyWeeks: pauta.everyWeeks,
    isDue: today >= dueOn,
    /* Si esta entrega se ha movido de su día. Lo usa la pantalla para decirlo en
       vez de dejar al cliente comparándolo con la pauta él solo. */
    moved: dueOn !== porPauta,
  };
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

/**
 * La próxima revisión a partir de hoy, o null si no hay pauta.
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
  const pauta = checkInSchedule(preferences);
  if (pauta.weekday === null) return null;
  if (weekdayIndex(from) === null) return null;

  const semanaDeHoy = weekStart(from);
  const ancla = startDate ? weekStart(startDate) : semanaDeHoy;

  /*
    Con el alta en el futuro el primero que le toca es el de SU primera semana:
    no hay periodo en curso que continuar. Con el alta ya pasada se retrocede
    hasta el inicio del periodo vigente, igual que en `currentCheckInPeriod`.
  */
  const inicio = ancla > semanaDeHoy ? ancla : periodStartOf(semanaDeHoy, ancla, pauta.everyWeeks);

  const deEstePeriodo = dueOnOf(inicio, pauta);
  /* Si el de este periodo ya pasó, el siguiente está una cadencia más allá — no
     la semana que viene, que es lo que devolvía la versión anterior. */
  return deEstePeriodo >= from ? deEstePeriodo : dueOnOf(addDays(inicio, pauta.everyWeeks * 7), pauta);
};

/**
 * Mover la entrega de un periodo a otra fecha, o devolverla a su día de pauta.
 *
 * Devuelve la lista de fechas movidas que hay que guardar, o `null` si el cambio
 * no se puede hacer. Vive aquí y no en la pantalla porque la regla —**una fecha
 * movida por periodo**— es la que sostiene que `dueOnOf` no pueda ser ambigua, y
 * una pantalla no es sitio para guardar un invariante.
 */
export const moveCheckIn = (preferences, startDate, date, today = todayISO()) => {
  const pauta = checkInSchedule(preferences);
  if (pauta.weekday === null) return null;

  const iso = toISODate(date);
  if (!iso) return null;

  const ancla = weekStart(startDate || today);
  const periodo = periodStartOf(weekStart(iso), ancla, pauta.everyWeeks);
  if (!periodo) return null;

  const fin = addDays(periodo, pauta.everyWeeks * 7);
  /* Fuera las que ya ocupaban ESTE periodo: si no, dos fechas movidas en la
     misma quincena y `dueOnOf` se quedaría con la primera sin decirlo. */
  const resto = pauta.dates.filter((d) => d < periodo || d >= fin);

  /* Volver a pulsar la fecha que ya estaba la quita: es el mismo gesto de ida y
     de vuelta, y devuelve el periodo a su día de pauta. */
  if (pauta.dates.includes(iso)) return resto;

  /* Poner la fecha del propio día de pauta no es mover nada. Se guarda igual
     como «sin mover» para que la lista no acumule fechas que no significan
     nada. */
  if (iso === addDays(periodo, pauta.weekday)) return resto;

  if (resto.length >= MAX_CHECKIN_DATES) return null;
  return [...resto, iso].sort();
};
