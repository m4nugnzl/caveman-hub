/**
 * La semana de un cliente: lo programado, lo ejecutado y lo entregado, juntos.
 *
 * ══ Por qué existe este archivo ═════════════════════════════════════════════
 *
 * Porque la aplicación estaba partida por sus TABLAS y no por su trabajo. Lo que
 * un entrenador hace cada lunes —mirar la semana de alguien y contestarle—
 * cruzaba cuatro secciones: la rutina (qué le puse), la revisión (qué me ha
 * entregado), la nutrición (si le cuadró) y el progreso (qué decido ahora). Cada
 * una con su propio selector de semana, y ninguna sabiendo en qué semana estaba
 * la de al lado.
 *
 * La prueba de que el corte estaba mal es la misma que el README usa para
 * justificar la fusión de «Fotos» y «Check-ins» un piso más abajo: hizo falta
 * inventar un MODO —`ReviewSession`, con barra flotante— para poder terminar la
 * tarea cruzando de una sección a otra. Un modo que existe para pegar dos
 * pantallas es la señal de que faltaba una.
 *
 * ── Qué hace y qué NO hace ──────────────────────────────────────────────────
 * Esto **no calcula nada nuevo**. Cada cifra sale de la función que ya la
 * calculaba —`weekTonnage`, `weekAdherence`, `weeklyCheckIn`, `sessionTonnage`—
 * y aquí solo se reúnen bajo una misma semana. Es deliberado: si hubiera que
 * escribir una regla nueva para pintar esta pantalla, la pantalla estaría
 * inventándose un dato en vez de enseñar el que hay.
 *
 * Y por eso tampoco pide nada a la red. Todo lo que entra ya está cargado.
 */
import { round, toNum } from '@/lib/num';
import { weekAdherence } from './analytics';
import { linearTrend } from './analytics';
import { weeklyCheckIn } from './anthropometry';
import { groupByWeek, photoWeek, weekStartOfProgramWeek } from './photos';
import { executedSessions, sessionSetCount, sessionTonnage } from './sessions';
import { countSets, findMicrocycle, weekTonnage, estimatedOneRm } from './training';

/** Los días de una semana con lo programado y lo ejecutado, en el orden del plan. */
const daysOfWeek = (micro) => {
  if (!micro) return [];

  const sesiones = executedSessions(micro);

  return (micro.days || []).map((day) => {
    /*
      Todas las sesiones de ese día, no la primera. Repetir un «Push» en la misma
      semana es legítimo —pasa cuando alguien recupera un día perdido— y quedarse
      con una sola contaba la mitad de sus kilos.
    */
    const suyas = sesiones.filter((s) => s.dayName === day.dayName);

    return {
      dayName: day.dayName,
      /* Ejercicios PROGRAMADOS: es lo que se comparó al decidir la semana. */
      exercises: (day.exercises || []).length,
      plannedSets: countSets(day),
      loggedSets: suyas.reduce((n, s) => n + sessionSetCount(s), 0),
      tonnage: Math.round(suyas.reduce((n, s) => n + sessionTonnage(s), 0)),
      /* La fecha real en que entrenó, que es lo que hace legible «se saltó el
         viernes y lo hizo el sábado». `null` si no lo hizo. */
      date: suyas[0]?.date ?? null,
      done: suyas.length > 0,
      /* Lo que escribió al terminar. Es lo más leído de toda la pantalla y vivía
         enterrado dentro del editor de rutina. */
      note: suyas.find((s) => s.clientNote)?.clientNote ?? null,
    };
  });
};

/**
 * Todo lo que hay que saber de la semana `weekNumber` de un cliente.
 *
 * @param startDate  El alta del cliente. De ahí sale la conversión entre semana
 *   de programa y semana natural, que es la que permite casar los pesajes —que
 *   van por lunes— con las sesiones —que van por número de semana—. Ver
 *   `photos.weekStartOfProgramWeek` y `auditoria.md` 1.2.
 */
export const clientWeek = ({
  microcycles = [],
  history = [],
  photos = [],
  startDate = null,
  weekNumber = null,
} = {}) => {
  const micro = weekNumber === null ? null : findMicrocycle(microcycles, weekNumber);
  const days = daysOfWeek(micro);
  const weekStart = startDate && weekNumber !== null ? weekStartOfProgramWeek(startDate, weekNumber) : null;

  const adherence = weekNumber === null ? null : weekAdherence(microcycles, weekNumber);
  const checkIn = weekStart ? weeklyCheckIn(history, weekStart) : null;

  const dePeso = groupByWeek(photos, startDate).find((g) => g.week === weekNumber);

  const hechos = days.filter((d) => d.done).length;

  return {
    weekNumber,
    weekStart,
    days,
    /*
      «3 de 4» y no «3»: sin el denominador, tres sesiones puede ser una semana
      redonda o media semana perdida, y es la diferencia entre felicitar a alguien
      y preguntarle qué ha pasado.
    */
    sessions: { done: hechos, planned: days.length },
    tonnage: weekNumber === null ? 0 : weekTonnage(microcycles, weekNumber),
    sets: {
      logged: days.reduce((n, d) => n + d.loggedSets, 0),
      planned: days.reduce((n, d) => n + d.plannedSets, 0),
    },
    adherence,
    checkIn,
    photos: dePeso?.photos || [],
    /* Las notas de sesión de la semana, con su día delante. */
    notes: days.filter((d) => d.note).map((d) => ({ dayName: d.dayName, note: d.note })),
  };
};

/** Las series REGISTRADAS de un ejercicio en un microciclo, tal cual se anotaron. */
const seriesDe = (micro, name) => {
  const out = [];
  for (const session of executedSessions(micro)) {
    for (const entry of session.entries || []) {
      if (entry?.name !== name) continue;
      for (const set of entry.sets || []) {
        const reps = toNum(set?.reps);
        /* Sin repeticiones no hay serie: es una fila del plan que nadie llenó.
           El PESO sí puede faltar —dominadas, fondos— y eso no la invalida. */
        if (reps === null || reps <= 0) continue;
        out.push({ kg: toNum(set?.kg), reps, rir: toNum(set?.rir) });
      }
    }
  }
  return out;
};

/**
 * La serie más pesada de una sesión; a igual peso, la de más repeticiones.
 *
 * Es la que representa el tope de ese día, y la única contra la que tiene
 * sentido comparar el día anterior.
 */
const topSet = (sets = []) =>
  sets.reduce((mejor, s) => {
    if (!mejor) return s;
    const a = s.kg ?? 0;
    const b = mejor.kg ?? 0;
    if (a > b) return s;
    if (a === b && s.reps > mejor.reps) return s;
    return mejor;
  }, null);

/**
 * Si subió, se quedó igual o bajó respecto de la vez anterior.
 *
 * ══ La regla, dicha en voz alta ════════════════════════════════════════════
 *
 * **Más kilos, o los mismos kilos con más repeticiones.** Nada más.
 *
 * Aquí había un 1RM estimado, y era un error de fondo: una fórmula que convierte
 * 100×5 y 90×10 en un mismo número para poder compararlos. Suena bien y es
 * exactamente lo que un entrenador NO quiere leer — porque la fórmula decide por
 * él, con un margen de error de varios kilos, sobre el dato que más mira.
 *
 * Esta regla no inventa nada: es la lectura que se hace mirando las dos líneas.
 * Y cuando no aplica —cambió el rango de repeticiones a propósito— la respuesta
 * es `null` y no una flecha inventada; para eso están las series enteras debajo.
 */
const compara = (ahora, antes) => {
  const a = topSet(ahora?.sets);
  const b = topSet(antes?.sets);
  if (!a || !b) return null;

  const ka = a.kg ?? 0;
  const kb = b.kg ?? 0;
  if (ka !== kb) return ka > kb ? 'up' : 'down';
  if (a.reps !== b.reps) return a.reps > b.reps ? 'up' : 'down';
  return 'same';
};

/**
 * EL HISTORIAL DE SUS EJERCICIOS: qué levantó, esta semana y las anteriores.
 *
 * ══ Por qué esto y no un cuadro de métricas ════════════════════════════════
 *
 * Aquí hubo tonelaje, adherencia y 1RM estimado, y las tres eran cifras
 * derivadas que se leen sin poder comprobarlas:
 *
 *   · **El tonelaje absoluto no dice nada.** Sube si le pones un día más y baja
 *     si le quitas la sentadilla, sin que la persona haya progresado un gramo.
 *   · **La adherencia medida en series es una medida tonta**, porque lo esperado
 *     es que las haga todas: un 100 % constante no informa, y cuando baja lo que
 *     dice ya lo dice el carril de días.
 *   · **El 1RM estimado decide por el entrenador** con una fórmula y varios
 *     kilos de margen, sobre el dato que más mira.
 *
 * Lo que se quiere ver son **las series, tal y como se anotaron**, una semana
 * debajo de otra. Eso no hay que interpretarlo: se lee.
 *
 *     Press banca                                        ↑ subió
 *       S3 · 12 ago    100×8 @2 · 100×8 @2 · 95×8 @3
 *       S2 ·  5 ago    97,5×8 @2 · 97,5×8 @2 · 95×7 @3
 *       S1 · 29 jul    95×8 @2 · 95×8 @3 · 92,5×8 @3
 *
 * ── Los ejercicios son los PROGRAMADOS esta semana ──────────────────────────
 * En el orden del plan, que es el orden en que se entrena y por tanto el que
 * hace que la lista esté igual todos los lunes. Y sale también el que estaba
 * programado y NO hizo: que se lo saltara es media revisión, y su historial de
 * antes explica desde cuándo.
 *
 * ── Y hacia atrás se salta lo vacío ────────────────────────────────────────
 * Se buscan las últimas `weeks` sesiones CON registro, no las últimas `weeks`
 * semanas. Un ejercicio que se entrena cada dos semanas, o una semana de
 * descarga, dejarían el historial medio vacío justo donde hay que comparar.
 *
 * @param weeks  Cuántas sesiones enseñar por ejercicio. DOS: la de ahora y la
 *   de antes, una debajo de otra. Con tres, diez ejercicios son treinta
 *   renglones y la revisión se convierte en el registro de entrenamiento — que
 *   ya existe, y está a un clic en su rutina.
 */
export const exerciseHistory = ({ microcycles = [], weekNumber = null, weeks = 2 } = {}) => {
  if (weekNumber === null) return [];
  const micro = findMicrocycle(microcycles, weekNumber);
  if (!micro) return [];

  /* Hasta la semana que se revisa, incluida: lo que venga después todavía no ha
     pasado para quien está revisando. */
  const previos = [...microcycles]
    .filter((m) => m.weekNumber <= weekNumber)
    .sort((a, b) => a.weekNumber - b.weekNumber);

  /* Con su DÍA delante: un entrenamiento se lee por sesiones —«el lunes hizo
     esto»— y no como una lista suelta de ejercicios. El día es el sitio donde el
     entrenador los tiene en la cabeza. */
  const nombres = [];
  const vistos = new Set();
  for (const day of micro.days || []) {
    for (const ex of day.exercises || []) {
      if (ex?.name && !vistos.has(ex.name)) {
        vistos.add(ex.name);
        nombres.push({ name: ex.name, muscle: ex.muscle || null, dayName: day.dayName || null });
      }
    }
  }

  return nombres
    .map(({ name, muscle, dayName }) => {
      const sesiones = [];
      for (let i = previos.length - 1; i >= 0 && sesiones.length < weeks; i -= 1) {
        const sets = seriesDe(previos[i], name);
        if (sets.length === 0) continue;
        sesiones.push({ week: previos[i].weekNumber, date: previos[i].date, sets });
      }

      const hecho = sesiones[0]?.week === weekNumber;
      return {
        name,
        muscle,
        dayName,
        sessions: sesiones,
        done: hecho,
        /* Solo se compara lo de esta semana con lo anterior. Si no lo hizo, la
           flecha diría algo sobre dos semanas viejas mientras el titular es que
           se lo saltó. */
        trend: hecho ? compara(sesiones[0], sesiones[1]) : null,
      };
    })
    /* Un ejercicio programado que no se ha hecho NUNCA no es una fila: es una
       línea del plan, y eso ya se ve en la rutina. */
    .filter((e) => e.sessions.length > 0);
};

/**
 * EL SEGUIMIENTO DE UN EJERCICIO: todas sus semanas, con las series en crudo.
 *
 * ══ Por qué no vale `exerciseProgression` ══════════════════════════════════
 *
 * Existe, y devuelve por semana el 1RM estimado, el tonelaje y las series
 * efectivas. Las tres son cifras DERIVADAS, y esta pantalla las echó fuera a
 * propósito: el 1RM decide por el entrenador con una fórmula y varios kilos de
 * margen, y el tonelaje sube por ponerle un día más. Sirven para la analítica,
 * que es donde viven.
 *
 * Lo que se mira al revisar es otra cosa: **qué levantó, cuántas veces y con
 * cuánto margen**, semana debajo de semana. `100×8 @2` encima de `97,5×8 @2` no
 * hay que interpretarlo — se lee. Así que esto devuelve las series tal y como se
 * anotaron y una sola cifra derivada, la de la serie tope, que es la que dibuja
 * la progresión sin ninguna fórmula por medio: son los kilos que levantó.
 *
 * ── Y hasta la semana que se revisa ────────────────────────────────────────
 * Igual que `exerciseHistory`: lo que venga después todavía no ha pasado para
 * quien está revisando, y una fila del futuro en la tabla de progresión de un
 * ejercicio se lee como un récord que aún no existe.
 */
export const exerciseTrack = ({ microcycles = [], name = '', weekNumber = null } = {}) => {
  if (!name) return [];

  const previos = [...microcycles]
    .filter((m) => weekNumber === null || m.weekNumber <= weekNumber)
    .sort((a, b) => a.weekNumber - b.weekNumber);

  const filas = [];
  for (const micro of previos) {
    const sets = seriesDe(micro, name);
    /* Una semana en la que no lo hizo no abre fila: en una tabla de progresión
       un hueco se lee como «bajó a cero», y lo que pasó es que ese día entrenó
       otra cosa. Que faltan semanas ya lo dice el número de cada fila. */
    if (sets.length === 0) continue;

    const top = topSet(sets);
    filas.push({
      week: micro.weekNumber,
      date: micro.date,
      sets,
      top,
      topKg: top?.kg ?? null,
      /* Repeticiones totales de la sesión. Es lo que distingue «subió el peso»
         de «subió el trabajo»: con 100×5 en vez de 95×8 hay más kilos en la
         barra y menos trabajo hecho, y la flecha sola no lo cuenta. */
      reps: sets.reduce((n, x) => n + x.reps, 0),
    });
  }

  /* La flecha de cada semana contra la ANTERIOR SUYA, no contra la semana de
     programa anterior: si se saltó dos semanas el ejercicio, lo que hay que
     comparar sigue siendo la última vez que lo hizo. */
  return filas.map((fila, i) => ({ ...fila, trend: compara(fila, filas[i - 1]) }));
};

/**
 * ¿PROGRESA EN ESTE EJERCICIO? — su tendencia a lo largo de todo el programa.
 *
 * ══ La pregunta que faltaba ═════════════════════════════════════════════════
 *
 * La revisión sabía decir «esta semana subió respecto de la anterior», y eso es
 * una foto de dos semanas: en un bloque de tres meses no dice nada. La pregunta
 * de un entrenador es la otra —**«¿este ejercicio va a alguna parte?»**— y se
 * contesta mirando la serie entera. Un cliente que sube, baja y vuelve a subir
 * cada semana está estancado aunque la última flecha diga que subió.
 *
 * ══ Se DIBUJA con kilos y se CLASIFICA con 1RM estimado ═════════════════════
 *
 * Y no es una contradicción con la regla de esta pantalla —«el 1RM estimado
 * decide por el entrenador»—, sino exactamente su aplicación: lo que no se puede
 * hacer es **enseñar** una cifra derivada con varios kilos de margen como si
 * fuera un dato medido. Usarla para ordenar tres palabras —sube, se mantiene,
 * baja— es otra cosa, y hace falta: los kilos solos no comparan nada, porque
 * `100×3` y `100×10` son el mismo peso y dos esfuerzos distintos. Sin meter las
 * repeticiones en la cuenta, cambiarle el rango de repeticiones a alguien
 * saldría como un desplome.
 *
 * Es además la misma regla que ya usa la lectura semanal (`strengthTrend`), con
 * el mismo umbral, para que la ficha de alguien y su lectura no puedan decir dos
 * cosas distintas del mismo ejercicio.
 *
 * ── Y «estancado» se cuenta aparte ─────────────────────────────────────────
 * Porque una recta con pendiente cero sobre diez semanas y tres semanas seguidas
 * sin mover un kilo son dos situaciones distintas: la primera puede ser un
 * bloque de mantenimiento y la segunda es lo que hay que tocar el lunes. Se
 * cuentan las sesiones del final que no han mejorado la mejor marca anterior.
 *
 * @returns `null` si nunca lo ha hecho. Con menos de tres sesiones devuelve la
 *   fila con `verdict: null`: no hay recta que trazar, y decir «se mantiene»
 *   sobre dos puntos es inventarse una tendencia.
 */
export const exerciseTrend = ({ microcycles = [], name = '', weekNumber = null } = {}) => {
  const sessions = exerciseTrack({ microcycles, name, weekNumber });
  if (sessions.length === 0) return null;

  /* Lo que se DIBUJA: los kilos de la serie tope. Es el dato en crudo. */
  const points = sessions
    .filter((f) => f.topKg !== null)
    .map((f) => ({ label: `S${f.week}`, value: f.topKg }));

  /* Lo que se CLASIFICA: el 1RM estimado de esa misma serie tope. */
  const fuerza = sessions
    .map((f) => ({ label: `S${f.week}`, value: estimatedOneRm(f.top?.kg, f.top?.reps) }))
    .filter((punto) => punto.value !== null);

  const trend = linearTrend(fuerza);

  /* El mismo umbral que `strengthTrend`: por debajo del 0,5 % por semana es la
     misma carga con una repetición de diferencia, no una progresión. */
  let verdict = null;
  if (trend) {
    const umbral = Math.max(0.5, Math.abs(trend.from) * 0.005);
    verdict = trend.perWeek > umbral ? 'up' : trend.perWeek < -umbral ? 'down' : 'flat';
  }

  /* Sesiones del final sin mejorar la mejor marca anterior. */
  let stalled = 0;
  let mejor = null;
  const topes = fuerza.map((punto) => punto.value);
  for (let i = 0; i < topes.length; i += 1) {
    if (mejor === null || topes[i] > mejor) {
      mejor = topes[i];
      stalled = 0;
    } else {
      stalled += 1;
    }
  }

  const primera = points[0] ?? null;
  const ultima = points[points.length - 1] ?? null;

  return {
    name,
    sessions,
    points,
    verdict,
    stalled,
    /* De cuánto a cuánto, en kilos de verdad. Es el resumen que se lee al lado
       del dibujo, y no lleva ninguna fórmula dentro. */
    from: primera?.value ?? null,
    to: ultima?.value ?? null,
    weeks: sessions.length,
    /* La última sesión contra la anterior suya, que es la comparación de la
       revisión de esta semana y no la del bloque. Las dos hacen falta. */
    last: sessions[sessions.length - 1] ?? null,
  };
};

/**
 * La semana por la que conviene entrar.
 *
 * ── Por qué no es «la última» ───────────────────────────────────────────────
 * Porque la última semana del programa puede ser una que el entrenador acaba de
 * dejar montada para dentro de quince días, y entrar por ahí enseña una semana
 * vacía y da la sensación de que el cliente no ha hecho nada. Se entra por la
 * última en la que hay ALGO —una sesión registrada o un pesaje—, y solo si no
 * hay ninguna se cae a la última montada.
 */
export const latestActiveWeek = ({
  microcycles = [],
  history = [],
  photos = [],
  startDate = null,
} = {}) => {
  if (microcycles.length === 0) return null;

  const ordenadas = [...microcycles].sort((a, b) => b.weekNumber - a.weekNumber);

  /*
    ══ Las FOTOS también son actividad, y faltaban ════════════════════════════

    Miraba las sesiones y los pesajes, y no las fotos. Consecuencia: alguien que
    sube sus fotos el domingo y todavía no ha registrado el entreno de la semana
    entraba por la semana ANTERIOR — y como el resto de la pantalla obedece a esa
    elección, la revisión comparaba «semana 2 contra la 3» mientras el estudio de
    fotos, que sí las mira, enseñaba «3 contra 4».

    Dos pantallas del mismo cliente hablando de semanas distintas es peor que
    cualquiera de las dos por separado: obliga a comprobar cuál tiene razón.
  */
  const semanasConFoto = new Set(photos.map((p) => photoWeek(p, startDate)).filter((w) => w !== null));

  for (const micro of ordenadas) {
    if (executedSessions(micro).length > 0) return micro.weekNumber;
    if (semanasConFoto.has(micro.weekNumber)) return micro.weekNumber;

    const inicio = startDate ? weekStartOfProgramWeek(startDate, micro.weekNumber) : null;
    if (inicio && (weeklyCheckIn(history, inicio)?.count ?? 0) > 0) return micro.weekNumber;
  }

  return ordenadas[0].weekNumber;
};

/**
 * Cuánto se ha movido el peso entre dos semanas consecutivas.
 *
 * Va aparte de `clientWeek` porque necesita la semana ANTERIOR, y meter dentro
 * de «la semana N» un dato de la N-1 acabaría con alguien leyéndolo como si
 * fuera de la N.
 */
export const weightMove = ({ history = [], startDate = null, weekNumber = null } = {}) => {
  if (!startDate || weekNumber === null || weekNumber <= 1) return null;

  const ahora = weeklyCheckIn(history, weekStartOfProgramWeek(startDate, weekNumber));
  const antes = weeklyCheckIn(history, weekStartOfProgramWeek(startDate, weekNumber - 1));

  const a = toNum(ahora?.average);
  const b = toNum(antes?.average);
  if (a === null || b === null) return null;

  return { delta: round(a - b, 2), from: b, to: a };
};

/**
 * La PRESCRIPCIÓN que se puede ajustar de un ejercicio, y de qué semana es.
 *
 * ══ Por qué esto no es «el ejercicio de la semana que estoy revisando» ══════
 *
 * Revisar es mirar hacia atrás y ajustar es escribir hacia delante, y confundir
 * las dos es el fallo que hay que hacer imposible: cambiarle las series a la
 * semana que ya entrenó reescribe su registro y no le cambia nada de lo que
 * viene. Por eso esta función busca la ÚLTIMA semana en la que aparece el
 * ejercicio y solo la devuelve si es POSTERIOR a la revisada.
 *
 * Sin semana siguiente devuelve `null`, y quien llama no ofrece el ajuste: no
 * hay dónde escribirlo todavía, y crear una semana entera no es una decisión que
 * deba tomar un panel de consulta.
 *
 * Devuelve las tres coordenadas que piden las acciones de `useWorkout`
 * —`weekNumber`, `dayName`, `id`— más lo que hay puesto ahora, para poder
 * enseñarlo sin volver a buscarlo.
 */
export const nextPrescription = ({ microcycles = [], name = '', afterWeek = null } = {}) => {
  const buscado = String(name || '').trim().toLowerCase();
  if (!buscado) return null;

  const candidatas = [...microcycles]
    .filter((m) => Number.isFinite(Number(m?.weekNumber)))
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber));

  for (const micro of candidatas) {
    if (afterWeek !== null && Number(micro.weekNumber) <= Number(afterWeek)) return null;

    for (const day of micro.days || []) {
      const ex = (day.exercises || []).find(
        (e) => String(e?.name || '').trim().toLowerCase() === buscado
      );
      if (!ex) continue;

      return {
        weekNumber: Number(micro.weekNumber),
        dayName: day.dayName,
        id: ex.id,
        sets: (ex.sets || []).length,
        /* El objetivo se guarda por serie y se programa por ejercicio: se lee el
           de la primera, que es el que `updateExerciseTarget` escribe en todas. */
        targetReps: ex.sets?.[0]?.targetReps || '',
      };
    }
  }

  return null;
};
