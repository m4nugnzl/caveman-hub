import { WEEK_DAYS, countSets, normalizePattern } from '@/domain/training';
import { allSessionsOfDay, sessionSetCount } from '@/domain/sessions';

/**
 * ══ LAS HOJAS: el programa entero puesto en fila ═════════════════════════════
 *
 * Aquí vive la forma en que se RECORRE la rutina, separada de quien la pinta,
 * porque la usan dos pantallas que no se parecen en nada:
 *
 * · En el ordenador, `buildStrip` da la tira de un microciclo: sus sesiones,
 *   con su día de la semana y cuánto llevas de cada una.
 * · En el teléfono, `buildTape` pone TODOS los microciclos en una sola fila de
 *   hojas —una hoja es una sesión— y deslizar pasa de una a la siguiente. Al
 *   final de la fila está la hoja de empezar el microciclo que aún no existe.
 *
 * Es la misma información ordenada dos veces, así que se arma una vez.
 */

/** Lunes = 0. Se calcula aquí y no en el dominio porque depende del reloj. */
const todayWeekday = () => WEEK_DAYS[(new Date().getDay() + 6) % 7];

/**
 * La tira de la semana: las SESIONES, y los descansos en una línea aparte.
 *
 * ── Por qué los descansos no son píldoras ───────────────────────────────────
 * El primer intento ponía los siete días, con los descansos como píldoras
 * apagadas. Dos cosas fallaban. Una, de sitio: siete destinos en 366 px salen a
 * 52 px cada uno, donde no cabe «Empuje A», y con nombre truncado la tira deja
 * de decir la estructura, que es justo para lo que está. Y dos, de fondo: un
 * descanso no lleva a ninguna parte, así que ocupaba el sitio de un control sin
 * serlo.
 *
 * Con solo las sesiones son tres o cuatro píldoras que caben con su nombre
 * entero, y el descanso se dice como lo que es —información— en una línea:
 * «Descansas miércoles y domingo».
 *
 * Para un ciclo semanal el orden y el día lo da `weeklySplit`. Para uno rotativo
 * —«2 entreno / 1 descanso»— no hay correspondencia con la semana natural, así
 * que la tira son las sesiones del ciclo en orden. Ese mismo camino es la red de
 * seguridad: si el split está vacío o nombra días que no existen en el
 * microciclo, la tira se quedaría sin una sola entrada y la pantalla sin salida.
 *
 * ── El descanso del rotativo también se dice ────────────────────────────────
 * La línea existía solo para el semanal, así que quien entrena por ciclos veía
 * sus sesiones en fila y NADA sobre sus descansos: ni aquí ni en ninguna otra
 * pantalla. Y el descanso es la mitad del patrón que le han puesto.
 */
export const buildStrip = ({ days, weeklySplit, cycleType, microcycle, pattern, marcarHoy = true }) => {
  const progressOf = (day) => {
    const sessions = allSessionsOfDay(microcycle, day.dayName);
    const logged = sessions.length > 0 ? Math.max(...sessions.map(sessionSetCount)) : 0;
    return { logged, planned: countSets(day) };
  };

  const asSessions = () => {
    /* El ritmo, no el total: «2 y 1» significa descansar cada dos sesiones, no
       entrenarlo todo y descansar al final. El descanso sale del patrón, que es
       lo único que lo sabe — los días del microciclo son las sesiones, no los
       huecos entre ellas. */
    const { train, rest: descanso } = cycleType === 'rotating'
      ? normalizePattern(pattern)
      : { train: 0, rest: 0 };

    /*
      ── El rótulo dice SESIÓN, nunca la unidad del programa ──────────────────
      Ponía `${unit} N`, y `unit` es «Semana» en un ciclo semanal. Este camino es
      el de un ciclo semanal SIN reparto por días —que es lo que hay hasta que el
      entrenador asigna los días, o sea la primera semana de casi todo el
      mundo—, así que la tira quedaba justo debajo del selector de semanas
      diciendo «SEMANA 1 · Empuje, SEMANA 2 · Tirón» mientras el selector decía
      «Semana 1 … Semana 10». Dos filas pegadas con la misma palabra y dos
      significados: arriba la semana del programa, abajo el orden del día dentro
      de esa semana.

      Estas entradas son sesiones lo llame como lo llame el programa. En un ciclo
      rotativo `unit` ya era «Sesión», así que ahí no cambia nada.
    */
    return {
      entries: days.map((day) => ({
        key: day.dayName,
        /* Sin rótulo: aquí sería «Sesión 1, Sesión 2…», o sea el orden en el que
           ya están puestas. Ver `DayPill`. Con reparto por días sí lo hay, y es
           el día de la semana. */
        lead: null,
        name: day.dayName,
        day,
        isToday: false,
        ...progressOf(day),
      })),
      restNote:
        descanso > 0
          ? `Descansas ${descanso} ${descanso === 1 ? 'día' : 'días'} cada ${train} ${
              train === 1 ? 'sesión' : 'sesiones'
            }.`
          : null,
    };
  };

  if (cycleType !== 'weekly') return asSessions();

  /* Sin marca de hoy, ningún día de la semana coincide: es la forma de decir
     «este microciclo no es el de esta semana» sin que la tira mienta. */
  const today = marcarHoy ? todayWeekday() : null;
  const entries = [];
  const rest = [];

  for (const weekday of WEEK_DAYS) {
    const planned = (weeklySplit?.[weekday] ?? '').trim();
    const day = planned
      ? days.find((d) => d.dayName.trim().toLowerCase() === planned.toLowerCase())
      : null;

    if (!day) {
      rest.push(weekday.toLowerCase());
      continue;
    }

    entries.push({
      key: weekday,
      lead: weekday.slice(0, 3),
      name: planned,
      day,
      isToday: weekday === today,
      ...progressOf(day),
    });
  }

  return entries.length > 0
    ? { entries, restNote: rest.length > 0 ? `Descansas ${joinDays(rest)}.` : null }
    : asSessions();
};

/** «miércoles y domingo» — la conjunción en su sitio, no una lista con comas. */
const joinDays = (list) =>
  list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;


/**
 * ══ LA CINTA: una hoja por sesión, de la primera semana a la última ══════════
 *
 * El teléfono se abre en el gimnasio, de pie y con una mano. Lo que tenía
 * delante hasta ahora eran cuatro elegidores apilados —de qué bloque, de qué
 * microciclo, de qué día, y la cabecera de la sesión— y 605 de los 844 px de la
 * pantalla se gastaban antes del primer ejercicio.
 *
 * La cinta le da la vuelta: **elegir deja de ser una capa encima y pasa a ser el
 * gesto**. Las sesiones del programa van una detrás de otra en el orden en que
 * se entrenan, se abre la que toca hoy y se cambia de hoja deslizando. Volver a
 * ver lo del microciclo pasado y empezar el siguiente son el MISMO gesto en las
 * dos direcciones, no dos mandos que haya que encontrar.
 *
 * ── Por qué se arma entera y no por trozos ──────────────────────────────────
 * Porque la continuidad es justo lo que se está construyendo: la hoja anterior a
 * la primera sesión del microciclo 4 es la última del 3, y eso solo se sabe
 * mirando el programa completo. Armarla cuesta un recorrido por microciclo —lo
 * mismo que ya costaba pintar la tira— y se memoriza en quien la llama.
 *
 * ── El «hoy» es de UN microciclo ────────────────────────────────────────────
 * `buildStrip` marca la sesión de hoy mirando el día de la semana, que en el
 * microciclo abierto contesta «¿esta es la de hoy?» y en uno de hace dos meses
 * es una casualidad del calendario. Por eso la marca solo se pide para el
 * último: en los demás, «hoy» no significa nada.
 *
 * ── Y el reparto por días es el que HABÍA ───────────────────────────────────
 * `splitDe(semana)` y no un reparto suelto: el que ordena las sesiones dentro
 * de la semana es el del bloque al que esa semana pertenece, y un bloque
 * cerrado se lleva el suyo congelado (`structureOfBlock`). Con el reparto de
 * hoy, el microciclo de junio saldría repartido como se entrena en septiembre
 * —o sin repartir, si entonces había días que ya no existen—.
 */
export const buildTape = ({ microcycles, splitDe, cycleType, pattern, conNueva = false }) => {
  const semanas = [...(microcycles || [])].sort((a, b) => a.weekNumber - b.weekNumber);
  const ultima = semanas[semanas.length - 1];
  const hojas = [];

  for (const microcycle of semanas) {
    const { entries } = buildStrip({
      days: microcycle.days || [],
      weeklySplit: splitDe ? splitDe(microcycle.weekNumber) : null,
      cycleType,
      microcycle,
      pattern,
      marcarHoy: microcycle.weekNumber === ultima?.weekNumber,
    });

    for (const entry of entries) {
      hojas.push({
        tipo: 'sesion',
        clave: `${microcycle.weekNumber}:${entry.day.dayName}`,
        weekNumber: microcycle.weekNumber,
        dayName: entry.day.dayName,
        entry,
      });
    }
  }

  /* La hoja que todavía no existe. Va al final y solo si hay algo detrás de lo
     que colgarla: sin un solo microciclo no hay programa que continuar. */
  if (conNueva && ultima) {
    hojas.push({
      tipo: 'nueva',
      clave: 'nueva',
      weekNumber: ultima.weekNumber + 1,
      dayName: null,
      entry: null,
    });
  }

  return hojas;
};

/**
 * El tramo de la cinta que pertenece al mismo microciclo que la hoja abierta, y
 * sus dos vecinas de fuera.
 *
 * Es lo que necesita la tira de arriba para ser a la vez el mapa de la semana y
 * la puerta a las de al lado: dentro, las sesiones con su nombre entero; en los
 * extremos, una marca corta a la última hoja del microciclo anterior y a la
 * primera del siguiente.
 */
export const tramoDeHojas = (hojas, indice) => {
  /*
    Fuera de la cinta —un microciclo al que su entrenador aún no le ha puesto
    días— se enseña el ÚLTIMO tramo. Con la tira vacía la pantalla se quedaría
    sin ninguna salida: ni sesiones que abrir, ni vecinos a los que ir, y el
    único texto sería «no tiene ningún día programado todavía».
  */
  if (hojas.length > 0 && !hojas[indice]) return tramoDeHojas(hojas, hojas.length - 1);

  const actual = hojas[indice];
  if (!actual) return { desde: 0, hasta: -1, anterior: -1, siguiente: -1 };

  /* La hoja de «empezar el siguiente» no es de ningún microciclo: mientras se
     mira, el tramo que se enseña sigue siendo el último, con ella de vecina. */
  const semana = actual.tipo === 'nueva' ? hojas[indice - 1]?.weekNumber : actual.weekNumber;

  let desde = indice;
  while (desde > 0 && hojas[desde - 1].tipo === 'sesion' && hojas[desde - 1].weekNumber === semana) desde -= 1;
  let hasta = actual.tipo === 'nueva' ? indice - 1 : indice;
  while (hasta + 1 < hojas.length && hojas[hasta + 1].tipo === 'sesion' && hojas[hasta + 1].weekNumber === semana) {
    hasta += 1;
  }

  return {
    desde,
    hasta,
    anterior: desde > 0 ? desde - 1 : -1,
    siguiente: hasta + 1 < hojas.length ? hasta + 1 : -1,
  };
};
