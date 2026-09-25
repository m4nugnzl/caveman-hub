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
  /*
    Las intervenciones de dieta (0123). Son pauta, como el destino: solo las
    escribe el entrenador (`soloEntrenador`, y la base lo exige por RLS). Pueden
    durar varios días (`hasta`) y llevar kcal. Violeta el refeed y violeta
    claro el diet break (25 sep): el mismo en la línea, el calendario y las
    tarjetas.
  */
  { id: 'refeed', label: 'Refeed', hint: 'Uno o dos días de más hidratos', color: 'var(--data-violet)', soloEntrenador: true },
  { id: 'diet_break', label: 'Diet break', hint: 'Una o dos semanas en mantenimiento', color: 'var(--data-violet-claro)', soloEntrenador: true },
  /* Estar enfermo (0141): contexto de las semanas de alrededor, como unas
     vacaciones. Lo apuntan los dos y puede durar varios días. */
  { id: 'illness', label: 'Enfermedad', hint: 'Resfriado, gripe, un virus', color: 'var(--data-rose)' },
];

/* Lo desconocido se lee como una nota, por su nombre y no por su posición: la
   lista crece por el final (0123) y «el último» dejó de ser la nota. */
export const kindMeta = (id) => EVENT_KINDS.find((k) => k.id === id) || EVENT_KINDS.find((k) => k.id === 'note');

/**
 * Los tipos de evento a los que puede apuntar un plan: un sitio al que llegar.
 * Lo mismo que exige la base (`client_events_ancla_kind`, migración 0122).
 */
export const ANCHOR_KINDS = ['race', 'goal'];

/** Tope de cada texto de la competición: son rótulos, no fichas. */
export const MAX_COMPETICION_TEXTO = 80;

/**
 * LOS DATOS DE UNA COMPETICIÓN, saneados. `null` si no hay nada que decir.
 *
 * Viven en `client_events.competicion` (0122), un `jsonb` y no columnas: cada
 * federación nombra sus categorías y sus sedes a su manera, y la forma de estos
 * campos no se sabrá hasta que haya una fuente real de calendarios. La base
 * solo exige un objeto en un evento `race`; lo demás se decide aquí.
 *
 * `pesoLimiteKg` es el LÍMITE de la categoría, no un objetivo. Se acota a lo
 * humano, como el peso objetivo de `clientGoal`.
 */
export const competicionDe = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const texto = (v) => String(v ?? '').trim().slice(0, MAX_COMPETICION_TEXTO) || null;
  const kg = Number(String(raw.pesoLimiteKg ?? '').replace(',', '.'));
  const limpio = {
    federacion: texto(raw.federacion),
    categoria: texto(raw.categoria),
    sede: texto(raw.sede),
    pesoLimiteKg: raw.pesoLimiteKg !== null && raw.pesoLimiteKg !== '' && Number.isFinite(kg) && kg >= 30 && kg <= 300
      ? Math.round(kg * 10) / 10
      : null,
  };
  return Object.values(limpio).some((v) => v !== null) ? limpio : null;
};

/** La competición dicha en una línea: «AEFN · −83 kg · Madrid». */
export const competicionDicha = (competicion) => {
  const c = competicionDe(competicion);
  if (!c) return null;
  return [c.federacion, c.categoria, c.sede].filter(Boolean).join(' · ') || null;
};

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
  /* La de tres la pide todo el mundo y no estaba: quien revisa cada tres semanas
     tenía que elegir entre reclamar de más o de menos. */
  { weeks: 3, label: 'Cada 3 semanas' },
  { weeks: 4, label: 'Cada 4 semanas' },
];

/**
 * Tope de la cadencia. Es el mismo del horario del protocolo
 * (`EVERY_MAX`), y es a propósito: el horario SIEMBRA esta pauta, así que si
 * aceptara valores que aquí no caben, sembrar «cada 6 semanas» se convertiría en
 * silencio en «cada semana» — la clase de desacuerdo que la unificación de la
 * cita vino a cerrar.
 *
 * `CHECKIN_CADENCES` es lo que la pantalla OFRECE; esto es lo que el modelo
 * acepta. Un valor guardado fuera de la lista se respeta y se dice tal cual.
 */
export const MAX_EVERY_WEEKS = 8;

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

/** Y el tope del porqué. Es una nota al margen, no un parte. */
export const MAX_CHECKIN_NOTE = 80;

/** La pauta de revisión de un cliente, con los valores por defecto puestos. */
export const checkInSchedule = (preferences) => {
  const raw = preferences?.checkin;
  const weekday = Number.isInteger(raw?.weekday) && raw.weekday >= 0 && raw.weekday <= 6 ? raw.weekday : null;
  const weeks =
    Number.isInteger(raw?.everyWeeks) && raw.everyWeeks >= 1 && raw.everyWeeks <= MAX_EVERY_WEEKS
      ? raw.everyWeeks
      : 1;

  /* Ordenadas y sin repetidos, aquí y no en quien las escriba: `dueOnOf` se
     queda con la PRIMERA que cae dentro del periodo, así que el orden es parte
     del significado y no puede depender de en qué orden se pulsaron. */
  const dates = [...new Set((Array.isArray(raw?.dates) ? raw.dates : []).map(toISODate).filter(Boolean))]
    .sort()
    .slice(0, MAX_CHECKIN_DATES);

  /*
    ══ Y el porqué de cada fecha movida ═══════════════════════════════════════

    Una fecha movida sin motivo, tres semanas después, es un día raro en el
    calendario: nadie se acuerda de que Javier estaba de viaje. El motivo es
    opcional —aplazar tiene que seguir costando un gesto— y se guarda apuntado a
    su fecha, no como una lista paralela: así una fecha que se devuelve a su día
    de pauta se lleva su nota consigo y no queda huérfana.
  */
  const notas = {};
  for (const fecha of dates) {
    const texto = String(raw?.notes?.[fecha] ?? '').trim().slice(0, MAX_CHECKIN_NOTE);
    if (texto) notas[fecha] = texto;
  }

  return { weekday, everyWeeks: weeks, dates, notes: notas };
};

/**
 * El lunes en el que empieza el periodo al que pertenece una semana.
 *
 * `null` antes del ancla: quien todavía no ha empezado no está en ningún
 * periodo. La cuenta del módulo normalizaría las semanas negativas al rango
 * [0, everyWeeks-1] y devolvería un periodo inventado — es el fallo que la
 * migración de `currentCheckInPeriod` ya tuvo una vez.
 *
 * Se exporta para las casillas de Revisiones (`estadosDeSemana`): con cadencia
 * quincenal las dos semanas de un periodo son una sola entrega, y la portada
 * tiene que saber cuáles van juntas con la MISMA cuenta que la cola.
 */
export const periodStartOf =(weekStartISO, anchor, everyWeeks) => {
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
 * La forma de UN periodo, el que sea.
 *
 * Se extrajo de `currentCheckInPeriod` cuando apareció la ventana de gracia
 * (`periodoAEntregar`): hacían falta dos periodos con la misma forma —el de hoy
 * y el anterior— y escribir el segundo a mano habría sido una segunda verdad
 * sobre `dueOn`, que es justo lo que este archivo lleva tres rondas evitando.
 */
const periodoDe = (start, pauta, today) => {
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

  return periodoDe(start, pauta, today);
};

/**
 * EL PERIODO QUE ESTÁ ENTREGANDO AHORA MISMO, que no siempre es el de hoy.
 *
 * ══ La avería que arregla ══════════════════════════════════════════════════
 *
 * Una revisión se archiva en `(cliente, lunes de su semana)`, y hasta ahora se
 * archivaba en **el periodo en el que estás hoy**, no en el que debías. Con la
 * revisión el domingo, eso hacía esto:
 *
 *     dom 13  le tocaba          → no entrega
 *     lun 14  empieza periodo nuevo
 *     mar 15  entrega            → se guardaba en la semana del 14
 *
 * Mandó una y se le contaron dos: la del 14 quedaba consumida sin haberla
 * vivido, y la del 7 seguía ahí sin entregar. «Le ha saltado una», que es como
 * lo contó el entrenador que lo reportó.
 *
 * ── La regla: de tu día al siguiente ───────────────────────────────────────
 * Mientras no te haya llegado tu **próximo** día, lo que entregas es la que
 * debías. Nadie manda un martes la revisión del domingo que viene; manda la que
 * debe. Llegado el día nuevo, la ventana se cierra y la vieja cae a «semanas
 * atrasadas» (`deliverableWeeks`), que es donde ya vivía.
 *
 * Sale gratis en todas las cadencias y en todos los días de la semana: la
 * ventana es exactamente «`isDue` del periodo en curso», sin ningún plazo
 * inventado. Con la revisión el lunes no cambia nada —el periodo en curso YA es
 * el que se debe toda la semana—, y con cadencia quincenal la ventana dura dos
 * semanas sola.
 *
 * ── Y no toca nada del lado del entrenador ─────────────────────────────────
 * La entrega tardía se archiva en la semana del 7 y le llega igual: `buildPortfolio`
 * deja pasar cualquier entrega sin contestar sea de la semana que sea, y
 * `weekToReview` abre la que el cliente entregó de verdad.
 *
 * @param entrega La última entrega que se tenga cargada de esta persona — es la
 *   única que hace falta: si hubiera entregado el periodo anterior, sería esa o
 *   una más nueva.
 * @returns El mismo objeto que `currentCheckInPeriod`, con `tarde` en cierto
 *   cuando lo abierto es el periodo anterior. `null` sin día elegido.
 */
export const periodoAEntregar = ({
  preferences,
  startDate,
  entrega = null,
  today = todayISO(),
} = {}) => {
  const actual = currentCheckInPeriod(preferences, startDate, today);
  if (!actual) return null;

  /* Llegado su día, lo abierto es el de hoy: la ventana del anterior se acabó
     justo aquí. Es la única condición de toda la regla. */
  if (actual.isDue) return actual;

  const pauta = checkInSchedule(preferences);
  const anterior = addDays(actual.start, -pauta.everyWeeks * 7);

  /* Antes del alta no hay periodo anterior que deber. La misma guarda que
     `periodStartOf`, y por el mismo motivo: quien empezó este lunes no arrastra
     nada de la semana pasada. */
  const ancla = startDate ? weekStart(startDate) : weekStart(today);
  if (anterior < ancla) return actual;

  /* Ya entregado el anterior no hay nada que recuperar. Vale la fila de
     cualquier semana desde ese lunes: el periodo siguiente es el de hoy, y ese
     no está entregado o no estaríamos aquí. */
  if (entrega?.weekStart >= anterior && (entrega.submittedAt || entrega.reviewedAt)) return actual;

  return { ...periodoDe(anterior, pauta, today), tarde: true };
};

/**
 * EL PERIODO QUE EMPIEZA EN UN LUNES DADO, con la misma forma que los otros
 * dos (`start`, `dueOn`, `everyWeeks`, `isDue`, `moved`).
 *
 * Lo necesitan las revisiones PASADAS (`domain/revisionesPasadas.js`): saber
 * qué día tocaba una que se quedó sin entregar, y cuándo se cerró su ventana
 * de gracia, sin escribir una segunda cuenta de `dueOn`.
 *
 * @returns `null` sin día de revisión elegido.
 */
export const periodoQueEmpieza = (preferences, lunes, today = todayISO()) => {
  const pauta = checkInSchedule(preferences);
  if (pauta.weekday === null || !lunes) return null;
  return periodoDe(weekStart(lunes), pauta, today);
};

/**
 * SU REVISIÓN, AHORA MISMO: el periodo vigente y si la ha entregado.
 *
 * ══ Por qué las dos cosas juntas ═══════════════════════════════════════════
 *
 * Porque por separado no contestan nada. El periodo dice cuándo le toca; la
 * fila de `check_ins` dice qué hay entregado; y la pregunta que hacen las
 * pantallas —«¿esta persona me debe algo?»— necesita las dos y el mismo
 * emparejamiento en todas: la entrega cuenta si es de este PERIODO, no de esta
 * semana natural. Con cadencia quincenal son dos ventanas distintas, y quien
 * comparaba contra el lunes de hoy volvía a pedirle la revisión dos días
 * después de haberla mandado.
 *
 * La escribían a mano la portada y la barra del pulgar. Ahora es una cuenta.
 *
 * @param entrega La fila de check-in que se tenga cargada de esta persona.
 * @returns `{ periodo, desde, sinEntregar, espera }` — `espera` es la única que
 *   enciende un punto: le toca YA y no la ha mandado. Antes del día no se le
 *   reclama nada.
 */
/**
 * LA FILA DE `check_ins` QUE ES DE ESTE PERIODO, o `null`.
 *
 * ══ Por qué no vale «de esta semana en adelante» ═══════════════════════════
 *
 * Era `entrega.weekStart >= desde`, escrito igual en tres sitios, y deja entrar
 * filas de semanas POSTERIORES al periodo abierto. Esas existen: el entrenador
 * cierra la semana en curso desde su pasada mientras el cliente todavía tiene
 * abierta la anterior por la ventana de gracia (`useCloseReview`). Con la de más
 * adelante colada aquí, el portal le contaba al cliente las respuestas de otra
 * semana como suyas y daba por revisada una entrega que no había hecho.
 *
 * `checkIns` guarda una fila por cliente —la última—, así que esto es un filtro
 * y no una búsqueda: o la que hay es de este periodo, o este periodo no tiene.
 */
export const entregaDelPeriodo = (entrega, desde, semanas = 1) => {
  if (!entrega?.weekStart || !desde) return null;
  const fin = addDays(desde, Math.max(1, semanas) * 7);
  return entrega.weekStart >= desde && entrega.weekStart < fin ? entrega : null;
};

/**
 * EL SELLO DE UN REGISTRO: el lunes del periodo abierto cuando la fecha con la
 * que se está apuntando cae FUERA de él, y `null` cuando cae dentro.
 *
 * ══ La avería que arregla ══════════════════════════════════════════════════
 *
 * `periodoAEntregar` dejó que la revisión del viernes se entregue el martes
 * siguiente, pero lo que el cliente APUNTA desde ella seguía yéndose a la
 * semana de su fecha. El resultado, tal y como lo contó un entrenador: el
 * cliente se pesa, se mide, y su revisión sigue diciendo «te pide 1 pesaje y
 * llevas 0» y «sin tomar esta semana», con el botón de entregar rebotando
 * contra un peso que acaba de escribir. Nada falla; todo se guarda; nada cuenta.
 *
 * ── Por qué un sello y no una ventana más ancha ────────────────────────────
 * Porque una ventana que llegue hasta hoy mete el pesaje del martes en las DOS
 * semanas: en la que se entrega tarde y en la que está viviendo. Dos medias con
 * el mismo pesaje dentro es peor que el fallo que venía a arreglar. El sello es
 * una asignación: el registro cuenta en una semana, se ve en cuál, y la
 * siguiente no lo pierde por sorpresa sino porque está escrito.
 *
 * Solo hay sello mientras la revisión anterior siga abierta: entregada o
 * cerrada, `periodoAEntregar` ya devuelve el periodo de hoy y esto da `null`.
 *
 * @param periodo `periodoAEntregar(...)` — el periodo que se está entregando.
 * @param fecha   La fecha con la que se va a guardar el registro.
 */
export const selloDelPeriodo = (periodo, fecha) => {
  const inicio = periodo?.start ? weekStart(periodo.start) : null;
  const semana = fecha ? weekStart(fecha) : null;
  if (!inicio || !semana) return null;
  const fin = addDays(inicio, Math.max(1, periodo.everyWeeks || 1) * 7);
  return semana < inicio || semana >= fin ? inicio : null;
};

export const estadoDeLaEntrega = ({
  preferences,
  startDate,
  entrega = null,
  today = todayISO(),
} = {}) => {
  /* El periodo ABIERTO y no el de hoy: entregarse con dos días de retraso no
     puede saltarse una revisión. Ver `periodoAEntregar`. */
  const periodo = periodoAEntregar({ preferences, startDate, entrega, today });
  const desde = periodo?.start || weekStart(today);
  const deEste = entregaDelPeriodo(entrega, desde, periodo?.everyWeeks || 1);
  const sinEntregar = !deEste?.submittedAt && !deEste?.reviewedAt;

  return { periodo, desde, sinEntregar, espera: sinEntregar && Boolean(periodo?.isDue) };
};

/** Eventos indexados por fecha, para pintar la rejilla sin recorrer la lista N veces. */
export const eventsByDate = (events) => {
  const map = new Map();
  const poner = (dia, event) => {
    if (!map.has(dia)) map.set(dia, []);
    map.get(dia).push(event);
  };
  for (const event of events) {
    /* Un evento de varios días (`hasta`, 0123) está en CADA uno de sus días:
       unas vacaciones de una semana ocupan la semana, no su lunes. El tope es
       de seguridad: nada del producto dura más de un año. */
    const fin = event.hasta && event.hasta > event.date ? event.hasta : event.date;
    let dia = event.date;
    for (let i = 0; dia && dia <= fin && i < 366; i += 1) {
      poner(dia, event);
      dia = addDays(dia, 1);
    }
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
 * Devuelve `{ dates, notes }` —la sección `checkin` que hay que guardar— o
 * `null` si el cambio no se puede hacer. Vive aquí y no en la pantalla porque la
 * regla —**una fecha movida por periodo**— es la que sostiene que `dueOnOf` no
 * pueda ser ambigua, y una pantalla no es sitio para guardar un invariante.
 *
 * ── Devuelve las DOS listas, siempre ───────────────────────────────────────
 * Aunque no se pase motivo. Las notas se podan aquí —se quedan solo las de
 * fechas que siguen movidas— porque quien llama no tiene forma de saber cuál se
 * acaba de caer, y una nota huérfana reaparecería el día que esa fecha se
 * volviera a mover por otro motivo distinto.
 *
 * @param motivo  El porqué, opcional. Ver `MAX_CHECKIN_NOTE`.
 */
export const moveCheckIn = (preferences, startDate, date, { today = todayISO(), motivo = '' } = {}) => {
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

  /** Las notas que sobreviven a una lista de fechas, más la que se acaba de dar. */
  const conNotas = (fechas, nueva = null) => {
    const notes = {};
    for (const f of fechas) if (pauta.notes[f]) notes[f] = pauta.notes[f];
    const texto = String(motivo ?? '').trim().slice(0, MAX_CHECKIN_NOTE);
    if (nueva && texto) notes[nueva] = texto;
    else if (nueva) delete notes[nueva];
    return { dates: fechas, notes };
  };

  /* Volver a pulsar la fecha que ya estaba la quita: es el mismo gesto de ida y
     de vuelta, y devuelve el periodo a su día de pauta. */
  if (pauta.dates.includes(iso)) return conNotas(resto);

  /* Poner la fecha del propio día de pauta no es mover nada. Se guarda igual
     como «sin mover» para que la lista no acumule fechas que no significan
     nada. */
  if (iso === addDays(periodo, pauta.weekday)) return conNotas(resto);

  if (resto.length >= MAX_CHECKIN_DATES) return null;
  return conNotas([...resto, iso].sort(), iso);
};
