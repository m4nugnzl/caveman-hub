import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, NotebookPen, Play, Quote, Timer } from 'lucide-react';

import {
  WEEK_DAYS,
  countSets,
  dayMuscleVolume,
  drillsForDay,
  normalizePattern,
  unitLabel,
  weekdayForDay,
} from '@/domain/training';
import {
  allSessionsOfDay,
  bestSetsBefore,
  isRecord,
  isSetLogged,
  previousSetsBefore,
  sessionLabel,
  sessionSetCount,
  sessionTonnage,
} from '@/domain/sessions';
import { activeQuestions, asksFeedback, clientProtocol, isModuleOn } from '@/domain/protocol';
import { localeNumber, shortDate, todayISO } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { Panel, SaveIndicator, WeekPicker } from '@/components/ui/primitives';
import { ExerciseList } from '@/components/Coach/Workout/ExerciseList';
import { SessionFeedback } from '@/components/Coach/Workout/SessionFeedback';
import { WarmupView } from '@/components/Coach/Workout/WarmupBlock';
import { useDaySession } from '@/components/Coach/Workout/useDaySession';

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
 * La semana sigue siendo suya: `WeekPicker` deja mirar las anteriores y añadir la
 * siguiente, que es la unidad en la que piensa.
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
const buildStrip = ({ days, weeklySplit, cycleType, microcycle, unit, pattern }) => {
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

    return {
      entries: days.map((day, index) => ({
        key: day.dayName,
        lead: `${unit} ${index + 1}`,
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
  const pideCierre = asksFeedback(protocol) || isModuleOn(protocol, 'clientNote');

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

          {planned > 0 && (
            <span className="sesion-cuenta">
              <strong>{logged}</strong> de {planned} series
            </span>
          )}
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

      {/* El cierre, en línea: una fila que dice si falta contar cómo ha ido y
          abre el resumen. Lo que había aquí eran las cuatro escalas enteras. */}
      {pideCierre && logged > 0 && (
        <button type="button" className="sesion-cierre" onClick={() => setResumen(true)}>
          <span className="col">
            <strong>{contestadas === questions.length && questions.length > 0 ? 'Sesión terminada' : 'Terminar la sesión'}</strong>
            <span className="t-xs t-tertiary">
              {questions.length > 0
                ? `${contestadas} de ${questions.length} contestadas · cómo ha ido y tu cuaderno`
                : 'resumen y tu cuaderno'}
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}

      {/* La barra de abajo, en el móvil: cuánto llevas, el descanso y la
          salida. Es la que grita «No se guardó · Reintentar» cuando la red del
          gimnasio falla (ver `.save-bar`). */}
      <div className="save-bar">
        {finDescanso ? (
          <button type="button" className="descanso" onClick={() => setFinDescanso(null)} aria-label="Parar el descanso">
            <Timer size={14} aria-hidden="true" />
            <strong>{mmss(restante)}</strong>
            <span>descanso</span>
          </button>
        ) : (
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

export const ClientRoutine = ({
  client,
  program,
  weeks,
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
  const lastWeek = weeks.length > 0 ? Math.max(...weeks) : null;
  const cycleType = client.cycleType || 'weekly';
  const unit = unitLabel(cycleType);
  const days = micro?.days || [];

  /* El día abierto es una preferencia de la visita, no un estado que haya que
     sincronizar: si el que estaba abierto no existe en la semana que se acaba de
     elegir, se ignora y manda la sugerencia. Así cambiar de semana no necesita
     ningún efecto que resetee nada. */
  const [picked, setPicked] = useState(null);

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
    unit,
    pattern: client.cyclePattern,
  });

  const suggested = entries.find((entry) => entry.isToday) || entries[0];
  const activeName =
    picked && days.some((d) => d.dayName === picked) ? picked : suggested?.day.dayName || null;
  const activeDay = days.find((d) => d.dayName === activeName);

  return (
    <div className="stack save-pad">
      <div className="col gap-3">
        <div className="row between wrap gap-2">
          <span className="section-label">Tu {unit.toLowerCase()}</span>
          <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
        </div>

        {weeks.length > 0 && (
          <WeekPicker
            weeks={weeks}
            value={activeWeek}
            onChange={onSelectWeek}
            prefix={unit}
            onAdd={onContinue}
            addLabel={`${unit} ${(lastWeek ?? 0) + 1}`}
          />
        )}

        {/* La tira: qué toca cada día, cuánto llevas y a dónde vas. */}
        <div className="day-strip">
          {entries.map((entry) => (
            <DayPill
              key={entry.key}
              entry={entry}
              active={entry.day.dayName === activeName}
              onOpen={() => setPicked(entry.day.dayName)}
            />
          ))}
        </div>

        {restNote && <p className="t-xs t-tertiary">{restNote}</p>}

        {/*
          El vídeo explicativo, en UNA línea y no en un panel.

          Era una tarjeta entera ENCIMA de la tira, en el sitio de honor, todas
          las visitas e indefinidamente — y se mira las dos primeras semanas.
          Esta pantalla se abre en el gimnasio para registrar la sesión de hoy;
          el vídeo tiene que estar (quien lo necesita, lo necesita de verdad),
          pero como referencia al pie de la semana, no como portada perpetua.
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
        />
      ) : (
        <Panel>
          <p className="t-sm t-secondary">
            Esta {unit.toLowerCase()} no tiene ningún día programado todavía.
          </p>
        </Panel>
      )}

    </div>
  );
};
