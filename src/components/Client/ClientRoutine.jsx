import { useMemo, useState } from 'react';
import { Dumbbell, NotebookPen, Play, Quote } from 'lucide-react';

import { WEEK_DAYS, countSets, dayMuscleVolume, unitLabel, weekdayForDay } from '@/domain/training';
import {
  allSessionsOfDay,
  previousSetsBefore,
  sessionLabel,
  sessionSetCount,
} from '@/domain/sessions';
import { activeQuestions, asksFeedback, clientProtocol, isModuleOn } from '@/domain/protocol';
import { shortDate, todayISO } from '@/lib/dates';
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
 */
const buildStrip = ({ days, weeklySplit, cycleType, microcycle, unit }) => {
  const progressOf = (day) => {
    const sessions = allSessionsOfDay(microcycle, day.dayName);
    const logged = sessions.length > 0 ? Math.max(...sessions.map(sessionSetCount)) : 0;
    return { logged, planned: countSets(day) };
  };

  const asSessions = () => ({
    entries: days.map((day, index) => ({
      key: day.dayName,
      lead: `${unit} ${index + 1}`,
      name: day.dayName,
      day,
      isToday: false,
      ...progressOf(day),
    })),
    rest: [],
  });

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

  return entries.length > 0 ? { entries, rest } : asSessions();
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
 */
const ClientDay = ({ client, program, microcycle, day, cycleType, onLogSet, protocol, onMeta }) => {
  const daySession = useDaySession(microcycle, day);
  const volume = dayMuscleVolume(day);
  const questions = activeQuestions(protocol);
  const session = daySession.session;

  /*
    El feedback y el logbook se escriben SOBRE UNA SESIÓN, y la sesión no existe
    hasta que se anota la primera serie (así lo impone `log_session_feedback` de
    la 0016, y a propósito: contestar un formulario no es haber entrenado).

    Por eso los dos bloques aparecen solo cuando ya hay algo registrado, y
    mientras tanto se dice por qué en vez de enseñar campos que no se pueden
    guardar. Una sesión heredada tampoco vale: no tiene id real.
  */
  const canAnnotate = Boolean(session && !session.isLegacy && daySession.activeId);

  const saveMeta = (patch) =>
    onMeta({ weekNumber: microcycle.weekNumber, sessionId: daySession.activeId, patch });

  const logged = daySession.session ? sessionSetCount(daySession.session) : 0;
  const planned = countSets(day);
  const weekday = weekdayForDay(cycleType === 'weekly' ? program?.weeklySplit : null, day.dayName);

  /*
    Lo que levantó la vez anterior en cada serie. Se calcula UNA vez por día y no
    por celda: recorrer todas las sesiones del programa por cada uno de los
    veinticuatro campos de la pantalla sería el mismo trabajo veinticuatro veces.
  */
  const previousSets = useMemo(
    () => previousSetsBefore(program?.microcycles || [], microcycle.weekNumber),
    [program?.microcycles, microcycle.weekNumber]
  );

  const logSet = (exId, setIndex, field, value) => {
    const exercise = (day.exercises || []).find((ex) => ex.id === exId);
    if (!exercise) return;

    const id = onLogSet({
      clientId: client.id,
      weekNumber: microcycle.weekNumber,
      // Una sesión heredada (kilos que quedaron dentro del plan de una versión
      // anterior) no tiene id real: se manda `null` y se crea una de verdad.
      sessionId: daySession.session?.isLegacy ? null : daySession.activeId,
      date: daySession.session?.date || todayISO(),
      dayName: day.dayName,
      exercise,
      setIndex,
      field,
      value,
    });
    if (id && id !== daySession.activeId) daySession.select(id);
  };

  return (
    <Panel className="col gap-4">
      {/*
        La cabecera de la sesión.
        --------------------------------------------------------------------
        Era la misma `.day-head` que usa el entrenador, con su icono grande y sus
        dos cifras sueltas. Aquí sobra la mitad: el nombre del día ya está
        marcado en la tira de arriba, así que lo que hace falta no es repetirlo
        en grande sino decir CUÁNTO LLEVAS, que es lo único que cambia mientras
        entrenas. La barra de progreso es eso mismo, sin una cifra más.
      */}
      <header className="col gap-2">
        <div className="row between wrap gap-2">
          <div className="row gap-3">
            <span className="day-icon">
              <Dumbbell size={18} />
            </span>
            <div className="col">
              <h2 style={{ fontSize: 'var(--fs-lg)' }}>{day.dayName}</h2>
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
          </div>

          {planned > 0 && (
            <span className="badge">
              {logged} de {planned} series
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
      </header>

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

      {/*
        La misma lista que usa el entrenador con `canEditStructure` en false: el
        cliente registra sus kg, reps y RIR pero no reordena, borra ni añade
        series. En ese modo cada ejercicio es una ficha con su tabla de series
        —etiquetas una sola vez— en vez de un carril de tarjetas.
      */}
      {/* La indicación del entrenador va ANTES de los ejercicios: es lo que hay
          que leer para hacerlos, no un comentario sobre lo hecho. */}
      {/*
        La indicación vive en el DÍA del plan. Se lee también de la sesión como
        respaldo: la primera versión la guardaba ahí, y lo que ya se escribiera no
        tiene por qué desaparecer al cambiar el modelo.
      */}
      {isModuleOn(protocol, 'coachNote') && (day.coachNote?.trim() || session?.coachNote?.trim()) && (
        <div className="coach-note">
          <span className="section-label">
            <Quote size={12} /> De tu entrenador
          </span>
          <p>{day.coachNote?.trim() || session.coachNote}</p>
        </div>
      )}

      {isModuleOn(protocol, 'warmup') && <WarmupView drills={program?.mobilityDrills} />}

      <ExerciseList
        exercises={daySession.exercises}
        canEditStructure={false}
        emptyMessage="Tu entrenador no ha programado ejercicios en este día."
        onSetChange={logSet}
        showRir={isModuleOn(protocol, 'rir')}
        previousSets={previousSets}
      />

      {(asksFeedback(protocol) || isModuleOn(protocol, 'clientNote')) &&
        (canAnnotate ? (
          <div className="col gap-4">
            {asksFeedback(protocol) && (
              <SessionFeedback
                questions={questions}
                answers={session.feedback}
                /* Se manda UNA respuesta, no el objeto entero: el contexto y la
                   función de la 0016 fusionan. Mandarlo entero haría que dos
                   toques seguidos se pisaran. */
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
          </div>
        ) : (
          <p className="t-xs t-tertiary">
            En cuanto anotes tu primera serie podrás contarme cómo ha ido y apuntar lo que quieras.
          </p>
        ))}
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

  const { entries, rest } = buildStrip({
    days,
    weeklySplit: program?.weeklySplit,
    cycleType,
    microcycle: micro,
    unit,
  });

  const suggested = entries.find((entry) => entry.isToday) || entries[0];
  const activeName =
    picked && days.some((d) => d.dayName === picked) ? picked : suggested?.day.dayName || null;
  const activeDay = days.find((d) => d.dayName === activeName);

  return (
    <div className="stack">
      {client.youtubeExplanationUrl && (
        <Panel tight className="row between wrap gap-3">
          <div>
            <strong>Vídeo explicativo de tu rutina</strong>
            <p className="t-sm t-secondary">Grabado por tu entrenador para ti</p>
          </div>
          <a
            href={client.youtubeExplanationUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-secondary"
          >
            <Play size={15} /> Ver en YouTube
          </a>
        </Panel>
      )}

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

        {rest.length > 0 && (
          <p className="t-xs t-tertiary">Descansas {joinDays(rest)}.</p>
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
