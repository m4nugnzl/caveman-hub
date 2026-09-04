import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, NotebookPen, Play, Quote, Timer } from 'lucide-react';

import {
  WEEK_DAYS,
  countSets,
  dayMuscleVolume,
  drillsForDay,
  normalizePattern,
  unitLabel,
  unitLabelPlural,
  weekdayForDay,
} from '@/domain/training';
import {
  allSessionsOfDay,
  bestSetsBefore,
  isRecord,
  isSetLogged,
  previousSetsBefore,
  sessionLabel,
  executedSessions,
  sessionSetCount,
  sessionTonnage,
} from '@/domain/sessions';
import { blockOfWeek, blockSummary, isCurrentBlock, weeksOfBlock } from '@/domain/blocks';
import { activeQuestions, asksFeedback, clientProtocol, isModuleOn } from '@/domain/protocol';
import { localeNumber, shortDate, todayISO } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';
import { Panel, SaveIndicator, WeekPicker } from '@/components/ui/primitives';
import { ComoLoLlevo } from '@/components/Coach/Workout/ComoLoLlevo';
import { ComparativaEjercicio } from '@/components/Coach/Workout/ComparativaEjercicio';
import { ExerciseList } from '@/components/Coach/Workout/ExerciseList';
import { HistorialPopup } from '@/components/Coach/Workout/HistorialPopup';
import { ProgresionPopup } from '@/components/Coach/Workout/ProgresionPopup';
import { SensacionesPopup } from '@/components/Coach/Workout/SensacionesPopup';
import { LineaDeBloques } from '@/components/Coach/Workout/LineaDeBloques';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { WarmupView } from '@/components/Coach/Workout/WarmupBlock';
import { useDaySession } from '@/components/Coach/Workout/useDaySession';
import { PlanDelBloque } from './PlanDelBloque';

/**
 * ══ La rutina, como la usa el cliente ═══════════════════════════════════════
 *
 * Esta pantalla era la vista de PROGRAMACIÓN del entrenador entregada al
 * cliente: pintaba los cinco días del microciclo enteros, uno detrás de otro,
 * con todos sus ejercicios y todas sus series. En un escritorio eso es un
 * documento que se repasa; en un móvil, con el que se entra al gimnasio, son
 * varias pantallas de scroll para llegar a la única sesión que importa hoy.
 *
 * Se le da la vuelta a las dos piezas:
 *
 * ── 1. La estructura y la navegación son LA MISMA COSA ──────────────────────
 * Había un panel «Tu estructura semanal» con los siete días en una rejilla, y
 * debajo la lista de días. Dos piezas para lo mismo: la primera decía qué toca
 * cada día y la segunda te llevaba allí, y ninguna de las dos hacía el trabajo
 * completa.
 *
 * Ahora hay UNA tira de siete días. Cada uno dice qué toca, si es hoy y cuántas
 * series llevas, y pulsarlo abre esa sesión. Los descansos están en la tira —son
 * parte de la semana— pero no se pueden pulsar, porque no hay nada que abrir.
 *
 * ── 2. Una sesión, no cinco ─────────────────────────────────────────────────
 * Se abre la de hoy si hoy toca, y si no la primera. Todo lo demás está a un
 * toque en la tira. Lo que el cliente hace en esta pantalla es registrar una
 * sesión, no repasar el mesociclo.
 *
 * ── 3. Y su programa se recorre por BLOQUES, no por números ─────────────────
 * En el nivel del bloque va la misma línea de tiempo que ve su entrenador
 * (`LineaDeBloques`), de solo leer: un tramo por bloque con su nombre y sus
 * fechas, y dentro una marca por semana. Sustituye al carril de «Semana 1 …
 * Semana 14», que enumeraba sin decir nada — y que además llamaba «semana» a
 * dos cosas distintas a la vez.
 *
 * ── 4. Entrenando, el mapa se guarda ────────────────────────────────────────
 * Dentro de una sesión no se pinta la línea: los tres bloques del programa con
 * todas sus semanas encima de la pantalla donde solo hay que escribir tres
 * números son un mapa del año para un gesto de diez segundos. Queda una miga
 * —de qué bloque cuelga esto— y el carril de las semanas DE ESE bloque, con
 * «+ Semana 3» al final.
 *
 * Ese «+» es la pieza más importante de la pantalla y por eso tiene nombre:
 * quien monta el plan es el entrenador, pero quien lo RECORRE es el cliente, y
 * hasta que no empieza la semana siguiente no tiene dónde apuntar.
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
const buildStrip = ({ days, weeklySplit, cycleType, microcycle, pattern }) => {
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
      entries: days.map((day, index) => ({
        key: day.dayName,
        lead: `Sesión ${index + 1}`,
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

  const today = todayWeekday();
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

const DayPill = ({ entry, active, onOpen }) => {
  const done = entry.planned > 0 && entry.logged >= entry.planned;

  return (
    <button
      type="button"
      className={`day-pill${entry.isToday ? ' is-today' : ''}${done ? ' is-done' : ''}`}
      aria-pressed={active}
      onClick={onOpen}
    >
      <span className="lead">
        {entry.lead}
        {entry.isToday && <span className="dot" aria-label="hoy" />}
      </span>
      <span className="nm">{entry.name}</span>
      <span className="pg">{entry.planned > 0 ? `${entry.logged}/${entry.planned}` : 'sin series'}</span>
    </button>
  );
};

/** «miércoles y domingo» — la conjunción en su sitio, no una lista con comas. */
const joinDays = (list) =>
  list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;

/** Segundos de descanso que arrancan solos al cerrar una serie. */
const DESCANSO_S = 90;

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Un día de la rutina, con su sesión.
 *
 * ── El fallo que corrige ────────────────────────────────────────────────────
 * El cliente escribía sus kilos DENTRO DEL PLAN (`updateExerciseSet`), mientras el
 * entrenador los escribía en sesiones con fecha (`logSessionSet`). Dos formas del
 * mismo dato, y dos consecuencias graves:
 *
 *   1. Lo que registraba el cliente se fechaba con la fecha del MICROCICLO, no
 *      con el día real en que entrenó.
 *   2. `allSessions()` descarta la versión heredada de un día que ya tiene sesión
 *      real. Es decir: en cuanto el entrenador abría una sesión de ese mismo día,
 *      **los kilos del cliente desaparecían de la analítica** sin ningún aviso.
 *
 * Ahora el cliente escribe en el mismo sitio que el entrenador. El componente es
 * aparte porque `useDaySession` es un hook y no se puede llamar dentro de un
 * `.map`.
 *
 * ══ Cómo se registra, después de mirar Hevy y ProCoach ═════════════════════
 *
 * · Cada serie lleva la vez anterior dentro del campo y un ✓ que la repite de
 *   un toque. La mayoría de las series de un bloque son «lo mismo que la
 *   semana pasada»: escribir se reserva para cuando algo cambia.
 * · Al cerrar una serie arranca solo el descanso, en la barra de abajo. Se
 *   puede parar con un toque y no suena nada: el gimnasio ya tiene ruido.
 * · Una serie que supera la mejor marca del ejercicio se marca «PR».
 * · La sesión se TERMINA: el botón de la barra abre el resumen —series,
 *   tonelaje, comparado con la última vez— y ahí, y solo ahí, se contesta
 *   cómo ha ido y se escribe en el cuaderno. Antes las cuatro escalas iban
 *   debajo del último ejercicio, cuarenta botones a la vista mientras todavía
 *   se estaba entrenando.
 */
const ClientDay = ({
  client,
  program,
  microcycle,
  day,
  cycleType,
  onLogSet,
  protocol,
  onMeta,
  save,
  onRetry,
}) => {
  const daySession = useDaySession(microcycle, day);
  const volume = dayMuscleVolume(day);
  const questions = activeQuestions(protocol);
  const session = daySession.session;

  const canAnnotate = Boolean(session && !session.isLegacy && daySession.activeId);

  const saveMeta = (patch) =>
    onMeta({ weekNumber: microcycle.weekNumber, sessionId: daySession.activeId, patch });

  const logged = daySession.session ? sessionSetCount(daySession.session) : 0;
  const planned = countSets(day);
  const weekday = weekdayForDay(cycleType === 'weekly' ? program?.weeklySplit : null, day.dayName);

  /* Lo que levantó la vez anterior en cada serie, y su mejor marca por
     ejercicio. Una vez por día, no por celda. */
  const previousSets = useMemo(
    () => previousSetsBefore(program?.microcycles || [], microcycle.weekNumber),
    [program?.microcycles, microcycle.weekNumber]
  );
  const bestSets = useMemo(
    () => bestSetsBefore(program?.microcycles || [], microcycle.weekNumber),
    [program?.microcycles, microcycle.weekNumber]
  );

  /* La última vez que hizo ESTE día: contra qué se compara el resumen. */
  const anterior = useMemo(() => {
    const micros = (program?.microcycles || [])
      .filter((m) => m.weekNumber < microcycle.weekNumber)
      .sort((a, b) => b.weekNumber - a.weekNumber);
    for (const m of micros) {
      const sesiones = allSessionsOfDay(m, day.dayName);
      if (sesiones.length > 0) {
        return { weekNumber: m.weekNumber, tonnage: Math.max(...sesiones.map(sessionTonnage)) };
      }
    }
    return null;
  }, [program?.microcycles, microcycle.weekNumber, day.dayName]);

  /* ── El descanso ──────────────────────────────────────────────────────── */
  const [finDescanso, setFinDescanso] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!finDescanso) return undefined;
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [finDescanso]);
  const restante = finDescanso ? Math.max(0, Math.ceil((finDescanso - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (finDescanso && restante === 0) setFinDescanso(null);
  }, [finDescanso, restante]);
  const empezarDescanso = () => setFinDescanso(Date.now() + DESCANSO_S * 1000);

  const [resumen, setResumen] = useState(false);

  /* Escribe un campo y devuelve el id de la sesión en la que ha escrito: la
     primera serie de un día CREA la sesión, y quien escriba dos campos seguidos
     tiene que pasarle ese id al segundo o abrirá dos sesiones. */
  const escribir = (exId, setIndex, field, value, sessionId) => {
    const exercise = (day.exercises || []).find((ex) => ex.id === exId);
    if (!exercise) return null;

    const id = onLogSet({
      clientId: client.id,
      weekNumber: microcycle.weekNumber,
      // Una sesión heredada (kilos que quedaron dentro del plan de una versión
      // anterior) no tiene id real: se manda `null` y se crea una de verdad.
      sessionId: sessionId !== undefined ? sessionId : daySession.session?.isLegacy ? null : daySession.activeId,
      date: daySession.session?.date || todayISO(),
      dayName: day.dayName,
      exercise,
      setIndex,
      field,
      value,
    });
    if (id && id !== daySession.activeId) daySession.select(id);
    return id || sessionId || daySession.activeId || null;
  };

  const logSet = (exId, setIndex, field, value) => {
    /* La serie pasa a hecha con las repeticiones: ahí arranca el descanso. */
    const antes = daySession.exercises.find((ex) => ex.id === exId)?.sets?.[setIndex];
    if (field === 'reps' && antes && !isSetLogged(antes) && (Number(value) || 0) > 0) empezarDescanso();
    escribir(exId, setIndex, field, value);
  };

  /* «Igual que la vez anterior»: kilos y reps, en la MISMA sesión. */
  const confirmarSet = (exId, setIndex, previo) => {
    const id = escribir(exId, setIndex, 'kg', String(previo.kg));
    escribir(exId, setIndex, 'reps', String(previo.reps), id);
    empezarDescanso();
  };

  const tonelaje = session ? sessionTonnage(session) : 0;
  const records = daySession.exercises.reduce(
    (n, ex) => n + (ex.sets || []).filter((s) => isSetLogged(s) && isRecord(s, bestSets.get(ex.name))).length,
    0
  );
  const contestadas = questions.filter((q) => String(session?.feedback?.[q.id] ?? '').trim() !== '').length;

  /*
    ══ El descanso, en los DOS sitios donde se puede mirar ═══════════════════

    Vivía solo en `.save-bar`, y esa barra es del chasis móvil: en escritorio
    está oculta por CSS. O sea que cerrar una serie con el portátil delante
    arrancaba una cuenta atrás de noventa segundos que no se pintaba en ninguna
    parte —y que además redibujaba dos veces por segundo para nadie—.

    Es el mismo reparto que ya hace la navegación del portal, que se declara una
    vez y se pinta arriba con ratón y abajo con el pulgar: no son dos descansos,
    es el mismo en el sitio donde cada formato lo mira. En el teléfono, la barra
    fija de abajo; en escritorio, la cabecera de la sesión, que es lo único que
    se ve sin desplazarse.
  */
  const descanso = finDescanso ? (
    <button
      type="button"
      className="descanso"
      onClick={() => setFinDescanso(null)}
      aria-label="Parar el descanso"
    >
      <Timer size={14} aria-hidden="true" />
      <strong>{mmss(restante)}</strong>
      <span>descanso</span>
    </button>
  ) : null;

  return (
    <Panel className="col gap-4">
      {/* La cabecera: qué sesión es y cuánto llevas. El nombre del día ya está
          marcado en la tira de arriba; lo que cambia mientras entrenas es la
          barra. */}
      <header className="sesion-cab">
        <div className="row between wrap gap-2">
          <div className="col">
            <h3 className="day-name">{day.dayName}</h3>
            <span className="t-xs t-tertiary">
              {[
                weekday,
                daySession.session
                  ? `registrando el ${shortDate(daySession.session.date)}`
                  : 'se registrará con la fecha de hoy',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>

          <span className="row gap-2 wrap">
            {/* Solo en escritorio: en el teléfono lo lleva la barra de abajo. */}
            {descanso && <span className="descanso-cab">{descanso}</span>}
            {planned > 0 && (
              <span className="sesion-cuenta">
                <strong>{logged}</strong> de {planned} series
              </span>
            )}
          </span>
        </div>

        {planned > 0 && (
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={logged}
            aria-valuemin={0}
            aria-valuemax={planned}
            aria-label={`Series registradas de ${day.dayName}`}
          >
            <span style={{ width: `${Math.min(100, (logged / planned) * 100)}%` }} />
          </div>
        )}

        {Object.keys(volume).length > 0 && (
          <div className="row wrap gap-2">
            {Object.entries(volume).map(([muscle, count]) => (
              <span className="badge" key={muscle}>
                {muscle}
                <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Los selectores de sesión solo si de verdad hay más de una que elegir. */}
      {daySession.sessions.length > 1 && (
        <div className="rail-wrap" role="group" aria-label={`Sesiones de ${day.dayName}`}>
          {daySession.sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={s.id === daySession.activeId}
              onClick={() => daySession.select(s.id)}
            >
              {sessionLabel(s)}
            </button>
          ))}
        </div>
      )}

      {/* La indicación del entrenador va ANTES de los ejercicios: es lo que hay
          que leer para hacerlos, no un comentario sobre lo hecho. Vive en el DÍA
          del plan; la sesión es el respaldo de la primera versión. */}
      {isModuleOn(protocol, 'coachNote') && (day.coachNote?.trim() || session?.coachNote?.trim()) && (
        <div className="coach-note">
          <span className="section-label">
            <Quote size={12} className="icon-inline" />De tu entrenador
          </span>
          <p>{day.coachNote?.trim() || session.coachNote}</p>
        </div>
      )}

      {isModuleOn(protocol, 'warmup') && <WarmupView drills={drillsForDay(program, day)} />}

      <ExerciseList
        exercises={daySession.exercises}
        canEditStructure={false}
        emptyMessage="Tu entrenador no ha programado ejercicios en este día."
        onSetChange={logSet}
        showRir={isModuleOn(protocol, 'rir')}
        showNotes={isModuleOn(protocol, 'coachNote')}
        previousSets={previousSets}
        bestSets={bestSets}
        onConfirmSet={confirmarSet}
      />

      {/*
        El cierre, en línea: una fila que dice si falta contar cómo ha ido y
        abre el resumen. Lo que había aquí eran las cuatro escalas enteras.

        ── Y aparece con la primera serie, pregunte el entrenador o no ────────
        La condición era `pideCierre`, o sea «solo si hay cuestionario o
        cuaderno». Pero detrás de esta fila no está solo eso: está el RESUMEN
        —series, tonelaje comparado con la última vez, récords—, que es el
        momento en que la sesión se ve acabada. A quien no le preguntan nada se
        le quedaba escondido, y en escritorio del todo: allí la barra de abajo
        con su botón «Terminar» no existe, así que no había ninguna puerta.

        Lo que cambia con el protocolo es lo que se anuncia debajo, no si la
        salida está.
      */}
      {logged > 0 && (
        <button type="button" className="sesion-cierre" onClick={() => setResumen(true)}>
          <span className="col">
            <strong>{contestadas === questions.length && questions.length > 0 ? 'Sesión terminada' : 'Terminar la sesión'}</strong>
            <span className="t-xs t-tertiary">
              {questions.length > 0
                ? `${contestadas} de ${questions.length} contestadas${isModuleOn(protocol, 'clientNote') ? ' · cómo ha ido y tu cuaderno' : ' · cómo ha ido'}`
                : isModuleOn(protocol, 'clientNote')
                  ? 'tu resumen y tu cuaderno'
                  : 'series, tonelaje y récords'}
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}

      {/* La barra de abajo, en el móvil: cuánto llevas, el descanso y la
          salida. Es la que grita «No se guardó · Reintentar» cuando la red del
          gimnasio falla (ver `.save-bar`). */}
      <div className="save-bar">
        {descanso || (
          <span className="t-sm t-secondary">
            {planned > 0 ? `${logged} de ${planned} series` : day.dayName}
          </span>
        )}
        <span className="row gap-2">
          <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
          {logged > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setResumen(true)}>
              Terminar
            </button>
          )}
        </span>
      </div>

      {/* ══ El resumen ═══════════════════════════════════════════════════ */}
      <Modal open={resumen} title={`${day.dayName} · hecho`} onClose={() => setResumen(false)}>
        <div className="col gap-5">
          <div className="sesion-resumen">
            <div className="sesion-kpi">
              <span className="v">{logged}<small> de {planned}</small></span>
              <span className="k">series</span>
            </div>
            <div className="sesion-kpi">
              <span className="v">{localeNumber(Math.round(tonelaje))}<small> kg</small></span>
              <span className="k">
                {anterior && anterior.tonnage > 0 && tonelaje > 0
                  ? `${tonelaje >= anterior.tonnage ? '+' : '−'}${Math.round((Math.abs(tonelaje - anterior.tonnage) / anterior.tonnage) * 100)} % que la semana ${anterior.weekNumber}`
                  : 'tonelaje'}
              </span>
            </div>
            <div className={`sesion-kpi${records > 0 ? ' is-record' : ''}`}>
              <span className="v">{records}</span>
              <span className="k">{records === 1 ? 'récord' : 'récords'}</span>
            </div>
          </div>

          {canAnnotate ? (
            <>
              {asksFeedback(protocol) && (
                <SessionFeedback
                  questions={questions}
                  answers={session.feedback}
                  onChange={(id, value) => saveMeta({ feedback: { [id]: value } })}
                />
              )}
              {isModuleOn(protocol, 'clientNote') && (
                <label className="feedback-q">
                  <span className="k">
                    <NotebookPen size={12} /> Tu cuaderno
                  </span>
                  <textarea
                    className="textarea"
                    rows={3}
                    placeholder="Lo que quieras recordar de este entreno. Lo lee tu entrenador."
                    value={session.clientNote ?? ''}
                    onChange={(e) => saveMeta({ clientNote: e.target.value })}
                  />
                </label>
              )}
            </>
          ) : (
            <p className="t-sm t-tertiary">
              En cuanto anotes tu primera serie podrás contarme cómo ha ido y apuntar lo que quieras.
            </p>
          )}

          <button type="button" className="btn btn-primary btn-block" onClick={() => setResumen(false)}>
            Listo
          </button>
        </div>
      </Modal>
    </Panel>
  );
};

/**
 * TU BLOQUE, en cifras: lo que llevas hecho en la etapa en la que estás.
 *
 * Es la tarjeta lateral del entrenador (`lado-tarjeta`, la misma que usan la
 * comparativa y el objetivo de la dieta) dicha para quien entrena. De las cinco
 * cifras que calcula `blockSummary` se quedan dos y se van tres:
 *
 *   · «Series por semana» y el volumen contra el MRV son la dosis, que es una
 *     decisión del entrenador — al cliente le dirían que hay un número que
 *     vigilar sin darle nada que hacer con él.
 *   · «88 % de lo pautado» es un porcentaje de cumplimiento, y un porcentaje
 *     bajo en su propia pantalla es un reproche. Lo mismo se cuenta con
 *     «7 de 8 entrenamientos», que es un hecho y no una nota.
 *   · Cuántas semanas lleva el bloque ya lo dice el renglón de arriba.
 *
 * El título es la puerta del HISTORIAL, igual que en el costado del
 * entrenador: la gráfica de kilos de todo el programa y sus bloques con sus
 * semanas. Es la ventana que contesta «¿voy a más?» mirando meses, y para el
 * cliente es de solo leer — sin `onFechaSemana` no hay fechas que tocar.
 */
const TuBloque = ({ program, bloque, activeWeek, unidad, onAbrirHistorial }) => {
  const r = blockSummary(program, bloque);
  const semanas = weeksOfBlock(program, bloque);
  const cual = semanas.indexOf(activeWeek) + 1;

  return (
    <section className="lado-tarjeta tarjeta-puerta" aria-label="Tu bloque">
      {/* La tarjeta entera abre su ventana. Ver «LA TARJETA-PUERTA». */}
      <button
        type="button"
        className="task-hit"
        onClick={onAbrirHistorial}
        aria-label={`${bloque.name}: tu historial de entrenamiento, bloque a bloque`}
        title="Tu historial de entrenamiento, bloque a bloque"
      />
      <div className="lado-cab">
        <span className="section-label">Tu bloque</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo">{bloque.name}</span>
        </div>
        {cual > 0 && (
          <span className="t-2xs t-tertiary">
            {unidad} {cual} de {semanas.length}
          </span>
        )}
      </div>

      <div className="bloque-cifras is-2">
        <div className="bloque-cifra">
          <span className="v">
            {localeNumber(Math.round(r.kg))}
            <small> kg</small>
          </span>
          <span className="k">levantados</span>
        </div>
        <div className="bloque-cifra">
          <span className="v">
            {r.hechas}
            <small> de {r.planificadas}</small>
          </span>
          <span className="k">entrenamientos</span>
        </div>
      </div>
    </section>
  );
};

export const ClientRoutine = ({
  client,
  program,
  activeWeek,
  onSelectWeek,
  onLogSet,
  onMeta,
  onContinue,
  save,
  onRetry,
}) => {
  const protocol = clientProtocol(client.preferences);
  const microcycles = program?.microcycles || [];
  const micro = microcycles.find((m) => m.weekNumber === activeWeek);
  const cycleType = client.cycleType || 'weekly';
  const unit = unitLabel(cycleType);
  const units = unitLabelPlural(cycleType);
  const days = micro?.days || [];

  /* El día abierto es una preferencia de la visita, no un estado que haya que
     sincronizar: si el que estaba abierto no existe en la semana que se acaba de
     elegir, se ignora y manda la sugerencia. Así cambiar de semana no necesita
     ningún efecto que resetee nada. */
  const [picked, setPicked] = useState(null);

  /*
    ══ Dos niveles, y solo donde caben ════════════════════════════════════════

    El entrenador tiene el PLAN del bloque y, dentro, la hoja de un día. El
    portal tenía solo lo segundo: una sesión y una tira para saltar entre
    sesiones, que es lo correcto dentro del gimnasio —se viene a apuntar, no a
    repasar el mesociclo— y se queda corto delante de un ordenador, donde la
    pregunta es «¿qué me han montado?».

    Así que en pantalla ancha hay los mismos dos niveles, con la misma miga de
    vuelta. En el teléfono no: cuatro columnas de plan en 390 px son cuatro
    columnas de noventa, y el nivel de arriba sería un carril que se arrastra
    para leer lo que la tira ya dice. Ahí se entra directo a la sesión y `vista`
    se ignora — de ahí que el nivel efectivo sea `nivel` y no el estado.

    El corte es el mismo que el de las dos columnas (`.rutina-cuerpo` en
    `styles/responsive.css`): un solo sitio donde decidir qué es «ancho».
  */
  const anchoDePlan = useMediaQuery('(min-width: 1100px)');
  const [vista, setVista] = useState('bloque');

  /* El ejercicio del que habla la progresión del costado. Vive aquí y no en la
     sesión porque la tarjeta que lo enseña es hermana suya, no hija. */
  const [foco, setFoco] = useState(null);
  /* Una sola ventana abierta a la vez, como en el panel: 'historial',
     'progresion' o 'sensaciones'. Se montan solo abiertas. */
  const [ventana, setVentana] = useState(null);

  if (microcycles.length === 0) {
    return (
      <Panel>
        <p className="t-sm t-secondary">Tu entrenador aún no te ha asignado ningún microciclo.</p>
      </Panel>
    );
  }

  const { entries, restNote } = buildStrip({
    days,
    weeklySplit: program?.weeklySplit,
    cycleType,
    microcycle: micro,
    pattern: client.cyclePattern,
  });

  const suggested = entries.find((entry) => entry.isToday) || entries[0];
  const activeName =
    picked && days.some((d) => d.dayName === picked) ? picked : suggested?.day.dayName || null;
  const activeDay = days.find((d) => d.dayName === activeName);

  /* El bloque que se está mirando, que es el de la semana abierta. Pulsar otro
     tramo de la línea cambia de semana, y con ella cambia éste: la línea no
     necesita un estado propio. */
  const bloque = blockOfWeek(program, activeWeek);
  const nivel = anchoDePlan ? vista : 'hoja';

  /* Las semanas de ESTE bloque y su numeración interna: la línea, la miga, el
     carril y las ventanas cuentan todas «S1, S2…» del bloque, no del programa. */
  const semanasDelBloque = weeksOfBlock(program, bloque);
  const enBloque = (w) => w - bloque.fromWeek + 1;
  /* Solo el bloque abierto crece: continuar el programa añade la unidad al
     final, y ofrecerlo mirando uno cerrado prometería alargar ése. */
  const esBloqueAbierto = isCurrentBlock(program, bloque);

  /* Desde la línea, pulsar una semana ENTRA en ella: es lo que se espera de un
     destino, y en el teléfono es además la única forma de cambiar de semana. */
  const abrirSemana = (w) => {
    onSelectWeek(w);
    setVista('hoja');
  };

  /* Las semanas se numeran DENTRO del bloque en todas las ventanas, igual que
     en el costado del entrenador: «S1, S2…» de este bloque, no del programa. */
  const etiqueta = (w) => `${unit.charAt(0)}${enBloque(w)}`;
  const preguntas = activeQuestions(protocol);

  const ejerciciosDelDia = activeDay?.exercises || [];
  const ejercicioEnFoco = ejerciciosDelDia.find((ex) => ex.id === foco) || ejerciciosDelDia[0] || null;

  /* Para «cómo lo llevas» del nivel del bloque: la última sesión que registró,
     que es de la que hay algo que contar. */
  /*
    La última sesión CON ALGO QUE CONTAR, por fecha.

    No vale «la última del bloque» a secas: una semana tiene cuatro sesiones y
    solo en algunas se contesta cómo ha ido, así que quedarse con la del final
    del array dejaba la tarjeta muda —o peor, enseñando la de hace tres
    semanas— mientras lo que se acababa de escribir estaba dos posiciones más
    arriba. Y se ordena por FECHA y no por el orden en que están guardadas: es
    lo único que dice cuál pasó después.
  */
  const ultimaSesion =
    weeksOfBlock(program, bloque)
      .flatMap((w) => executedSessions(microcycles.find((m) => m.weekNumber === w) || {}))
      .filter((s) => s.clientNote?.trim() || Object.values(s.feedback || {}).some((v) => String(v ?? '').trim()))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .slice(-1)[0] || null;

  const abrirHoja = (dayName) => {
    setPicked(dayName);
    setFoco(null);
    setVista('hoja');
  };

  return (
    <div className="stack save-pad rutina-portal">
      <div className="row between wrap gap-2">
        <span className="section-label">Tu programa</span>
        <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
      </div>

      {/*
        ══ La línea de bloques: EL MAPA, y solo donde se está mirando el mapa ══

        Aquí había un carril de «Semana 1 … Semana 14»: una enumeración plana en
        la que la semana 5 y la 12 se parecen en todo menos en el número. Su
        entrenador dejó de programar así —programa por BLOQUES, y les pone
        nombre— y esa es justo la parte que le explica a alguien en qué anda
        metido: «voy por la segunda semana de Intensificación», no «voy por la
        catorce».

        Es el mismo componente del plan del entrenador, sin los mandos que no
        son suyos: no renombra bloques, no abre bloques nuevos y no toca los
        ajustes del programa. Sí puede recorrer su historia —pulsar «Adaptación»
        y ver lo que hizo en junio. Ver `LineaDeBloques`.

        ── Y DENTRO de una sesión no se pinta ──────────────────────────────────
        Estaba siempre, y con ello quien había entrado a apuntar sus series tenía
        encima los tres bloques del programa con todas sus semanas: un mapa del
        año entero sobre la pantalla donde solo hay que escribir tres números. La
        miga ya dice de qué bloque cuelga esto y el carril de debajo, por qué
        semana va. Entrenando se necesita eso y nada más.
      */}
      {nivel === 'bloque' && (
        <LineaDeBloques
          program={program}
          bloque={bloque}
          semanaEnCurso={activeWeek}
          unidad={unit}
          unidades={units}
          etiqueta="Tus bloques de entreno"
          onIrBloque={(b) => {
            const suyas = weeksOfBlock(program, b);
            if (suyas.length > 0) onSelectWeek(suyas[suyas.length - 1]);
          }}
          onIrSemana={abrirSemana}
          onNuevaSemana={esBloqueAbierto ? onContinue : null}
        />
      )}

      {nivel === 'hoja' && (
        <>
          {/*
            Dónde estás, en una línea. Con el nivel del bloque detrás es una miga
            —el nombre vuelve a él—; sin él (el teléfono) es la misma línea sin
            vuelta, porque no hay a dónde subir. En los dos casos es lo que
            contesta «¿de qué bloque es esto?» sin repintar el mapa.
          */}
          <nav className="entreno-miga" aria-label="Dónde estás">
            {anchoDePlan ? (
              <button
                type="button"
                className="entreno-miga-boton is-volver"
                onClick={() => setVista('bloque')}
                title={`Volver a ${bloque.name}`}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                {bloque.name}
              </button>
            ) : (
              <span className="entreno-miga-aqui">{bloque.name}</span>
            )}
            <span className="migas-sep" aria-hidden="true" />
            <span className="entreno-miga-aqui">
              {activeDay ? activeDay.dayName : 'Sin sesiones'} · {unit.toLowerCase()}{' '}
              {enBloque(activeWeek)} de {semanasDelBloque.length}
            </span>
          </nav>

          {/*
            ══ Las semanas del bloque, Y AÑADIR LA SIGUIENTE ══════════════════

            Quien monta el plan es el entrenador; quien lo RECORRE es el cliente.
            Empezar la semana siguiente es su gesto más repetido —lo hace cada
            siete días, y hasta que no lo hace no tiene dónde apuntar— y estaba
            escondido en una marca de 34 px con un «+» dentro de la línea de
            bloques, sin nombre y a dos niveles de donde entrena.

            Aquí es un destino más del carril, con su nombre: «+ Semana 3». Es la
            misma pieza que llevaba el carril viejo (`WeekPicker`), que era donde
            el cliente sabía encontrarlo.

            Solo del bloque ABIERTO: continuar el programa añade la semana al
            final, así que ofrecerlo mirando «Adaptación» prometería alargar un
            bloque cerrado hace dos meses y alargaría otro.
          */}
          <WeekPicker
            weeks={semanasDelBloque}
            value={activeWeek}
            onChange={onSelectWeek}
            chipLabel={(w) => `${unit} ${enBloque(w)}`}
            label={`${units} de ${bloque.name}`}
            onAdd={esBloqueAbierto ? onContinue : undefined}
            addLabel={`${unit} ${semanasDelBloque.length + 1}`}
          />
        </>
      )}

      <div className="rutina-cuerpo">
        <div className="rutina-centro">
          {nivel === 'bloque' ? (
            <PlanDelBloque
              program={program}
              bloque={bloque}
              cliente={client}
              unidad={unit}
              unidades={units}
              onAbrirHoja={abrirHoja}
            />
          ) : (
            <>
              {/* La tira: qué toca cada día, cuánto llevas y a dónde vas. */}
              <div className="day-strip">
                {entries.map((entry) => (
                  <DayPill
                    key={entry.key}
                    entry={entry}
                    active={entry.day.dayName === activeName}
                    onOpen={() => abrirHoja(entry.day.dayName)}
                  />
                ))}
              </div>

              {activeDay ? (
                <ClientDay
                  key={`${activeWeek}:${activeDay.dayName}`}
                  client={client}
                  program={program}
                  microcycle={micro}
                  day={activeDay}
                  cycleType={cycleType}
                  onLogSet={onLogSet}
                  protocol={protocol}
                  onMeta={onMeta}
                  save={save}
                  onRetry={onRetry}
                  /* El ejercicio en foco lo pinta la lista y lo lee la
                     progresión del costado: el estado vive donde alcanza a las
                     dos, que es aquí. */
                  focusedId={anchoDePlan ? ejercicioEnFoco?.id ?? null : null}
                  onFocusExercise={anchoDePlan ? setFoco : null}
                />
              ) : (
                <Panel>
                  <p className="t-sm t-secondary">
                    Esta {unit.toLowerCase()} no tiene ningún día programado todavía.
                  </p>
                </Panel>
              )}
            </>
          )}
        </div>

        {/*
          El costado: con qué se mide lo que estás haciendo, y las dos
          referencias que se consultan de vez en cuando. En el teléfono cae
          debajo de la sesión, que es donde no estorba.

          Las dos tarjetas grandes —la progresión de un ejercicio y cómo lo
          llevas— son de pantalla ancha: son tablas, y en 390 px se leerían
          peor que en la ventana que abren. Lo que sí queda en el teléfono es
          «Tu bloque», que son dos cifras y la puerta al historial.
        */}
        <aside className="rutina-lado" aria-label="Tu bloque y tus referencias">
          {anchoDePlan && nivel === 'hoja' && (
            <ComparativaEjercicio
              etiqueta={etiqueta}
              microcycles={microcycles}
              ejercicios={ejerciciosDelDia}
              name={ejercicioEnFoco?.name || null}
              weekNumber={activeWeek}
              onElegir={(nombre) => setFoco(ejerciciosDelDia.find((ex) => ex.name === nombre)?.id || null)}
              onAmpliar={() => setVentana('progresion')}
            />
          )}

          {anchoDePlan && nivel === 'bloque' && (
            <ComoLoLlevo
              sesion={ultimaSesion}
              preguntas={preguntas}
              fecha={ultimaSesion?.date ? shortDate(ultimaSesion.date) : null}
              rotulo="Cómo lo llevas"
              pista="Lo que has ido contando, sesión a sesión"
              onAmpliar={() => setVentana('sensaciones')}
            />
          )}

          <TuBloque
            program={program}
            bloque={bloque}
            activeWeek={activeWeek}
            unidad={unit}
            onAbrirHistorial={() => setVentana('historial')}
          />

          {restNote && <p className="t-xs t-tertiary">{restNote}</p>}

          {/*
            El vídeo explicativo, en UNA línea y no en un panel.

            Era una tarjeta entera ENCIMA de la tira, en el sitio de honor, todas
            las visitas e indefinidamente — y se mira las dos primeras semanas.
            Esta pantalla se abre en el gimnasio para registrar la sesión de hoy;
            el vídeo tiene que estar (quien lo necesita, lo necesita de verdad),
            pero como referencia al lado, no como portada perpetua.
          */}
          {client.youtubeExplanationUrl && (
            <p className="t-xs t-tertiary">
              <a
                className="link"
                href={client.youtubeExplanationUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Play size={12} className="icon-inline" />
                Vídeo explicativo de tu rutina
              </a>{' '}
              · grabado por tu entrenador
            </p>
          )}
        </aside>
      </div>

      {/*
        ══ Las ventanas, las mismas del entrenador ════════════════════════════

        Se montan solo abiertas: cerradas no calculan nada.

        · El HISTORIAL, sin `onFechaSemana`: las fechas de sus semanas son lo
          que pasó, no algo que él mueva (ver `HistorialPopup`).
        · La PROGRESIÓN de un ejercicio: la curva del tope y del 1RM estimado
          con todas sus semanas y todas sus series. Es la prueba de que está
          subiendo, que es lo que paga.
        · Las SENSACIONES: lo que él mismo contestó al acabar cada entreno,
          dibujado en el tiempo. Es suyo y hasta ahora no lo veía en ninguna
          parte — lo contestaba y desaparecía.

        Falta a propósito la del VOLUMEN: se lee contra el MEV y el MRV, que es
        con lo que se decide una dosis. Esa decisión no es suya.
      */}
      {ventana === 'historial' && (
        <HistorialPopup
          open
          onClose={() => setVentana(null)}
          program={program}
          bloque={bloque}
          semanaEnCurso={activeWeek}
          unidad={unit}
          unidades={units}
          onIrBloque={(b) => {
            const suyas = weeksOfBlock(program, b);
            if (suyas.length > 0) onSelectWeek(suyas[suyas.length - 1]);
            setVista('bloque');
            setVentana(null);
          }}
          /* Desde el historial se ENTRA en esa semana: se ha venido buscando
             una en concreto, no el bloque que la contiene. */
          onIrSemana={(w) => {
            abrirSemana(w);
            setVentana(null);
          }}
        />
      )}
      {ventana === 'progresion' && (
        <ProgresionPopup
          open
          onClose={() => setVentana(null)}
          etiqueta={etiqueta}
          microcycles={microcycles}
          name={ejercicioEnFoco?.name || null}
          weekNumber={activeWeek}
        />
      )}
      {ventana === 'sensaciones' && (
        <SensacionesPopup
          open
          onClose={() => setVentana(null)}
          etiqueta={etiqueta}
          microcycles={microcycles}
          preguntas={preguntas}
          titulo="Cómo lo llevas"
          escrito="Lo que escribiste"
        />
      )}
    </div>
  );
};
