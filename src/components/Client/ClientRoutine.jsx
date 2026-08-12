import { ArrowRight, CheckCircle2, CircleDashed, Dumbbell, Play, RotateCw } from 'lucide-react';

import { WEEK_DAYS, countSets, dayMuscleVolume, unitLabel, weekdayForDay } from '@/domain/training';
import { sessionLabel, sessionSetCount } from '@/domain/sessions';
import { todayISO } from '@/lib/dates';
import { Panel, SaveIndicator, WeekPicker } from '@/components/ui/primitives';
import { ExerciseList } from '@/components/Coach/Workout/ExerciseList';
import { useDaySession } from '@/components/Coach/Workout/useDaySession';

/**
 * Cabecera de día con el mismo lenguaje visual que la del entrenador (comparte
 * la clase `.day-head`), pero sin el menú de acciones: el cliente no renombra
 * ni borra días.
 */
const DayBanner = ({ day, weeklySplit }) => {
  const weekday = weekdayForDay(weeklySplit, day.dayName);

  return (
    <header className="day-head">
      <div className="row gap-4">
        <span className="day-icon">
          <Dumbbell size={22} />
        </span>

        <div className="col gap-1">
          <div className="row gap-2 wrap">
            <span className="section-label" style={{ color: 'var(--accent)' }}>
              Sesión
            </span>
            {weekday && <span className="badge">{weekday}</span>}
          </div>
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{day.dayName}</h2>
        </div>
      </div>

      <div className="day-stats">
        <div className="day-stat">
          <span className="section-label">Ejercicios</span>
          <span className="v">{day.exercises?.length || 0}</span>
        </div>
        <div className="day-stat">
          <span className="section-label">Series</span>
          <span className="v" style={{ color: 'var(--accent)' }}>{countSets(day)}</span>
        </div>
      </div>
    </header>
  );
};

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
const ClientDay = ({ client, program, microcycle, day, cycleType, onLogSet }) => {
  const daySession = useDaySession(microcycle, day);
  const volume = dayMuscleVolume(day);

  const logged = daySession.session ? sessionSetCount(daySession.session) : 0;
  const planned = countSets(day);

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
    <Panel className="col gap-5">
      <DayBanner day={day} weeklySplit={cycleType === 'weekly' ? program?.weeklySplit : null} />

      {Object.keys(volume).length > 0 && (
        <div className="row wrap gap-2">
          {Object.entries(volume).map(([muscle, count]) => (
            <span className="badge" key={muscle}>
              {muscle}
              <strong style={{ color: 'var(--accent)' }}>{count} series</strong>
            </span>
          ))}
        </div>
      )}

      {/*
        ── Ya no hay «Registrar hoy» ─────────────────────────────────────────
        Era un botón que creaba una sesión vacía para el día de hoy, y no encajaba
        con cómo piensa el cliente. Dos motivos:

          1. Era REDUNDANTE. Al escribir el primer kilo, `logSessionSet` ya crea la
             sesión con la fecha de hoy. El botón hacía por adelantado algo que
             pasaba solo, así que solo servía para plantear una duda —«¿tengo que
             pulsar esto antes de anotar?»— cuya respuesta era no.
          2. Introducía un concepto que el cliente no necesita. Para él la unidad es
             la SEMANA: se rellena la semana y, cuando se acaba, se añade otra. Que
             además pudiera haber varias sesiones del mismo día dentro de una semana
             es del modelo del entrenador, no de su forma de trabajar.

        Lo que sí hacía falta —saber sobre qué fecha se está escribiendo— se queda,
        pero como INFORMACIÓN. Y los selectores solo aparecen si de verdad hay más
        de una sesión, que es cuando hay algo que elegir.
      */}
      <div className="row between wrap gap-2">
        {daySession.sessions.length > 1 ? (
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
        ) : (
          <span className="t-xs t-tertiary">
            {daySession.session
              ? `Registrando el ${daySession.session.date}`
              : 'Escribe tus kilos y se registrará con la fecha de hoy'}
          </span>
        )}

        {planned > 0 && (
          <span className="t-xs t-tertiary">
            {logged} de {planned} series registradas
          </span>
        )}
      </div>

      {/*
        Exactamente la misma lista que usa el entrenador, con `canEditStructure`
        en false: el cliente registra sus kg, reps y RIR pero no puede reordenar,
        borrar ni añadir series.
      */}
      <ExerciseList
        exercises={daySession.exercises}
        canEditStructure={false}
        emptyMessage="Tu entrenador no ha programado ejercicios en este día."
        onSetChange={logSet}
      />
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
  onContinue,
  save,
  onRetry,
}) => {
  const microcycles = program?.microcycles || [];
  const micro = microcycles.find((m) => m.weekNumber === activeWeek);
  const lastWeek = weeks.length > 0 ? Math.max(...weeks) : null;
  const cycleType = client.cycleType || 'weekly';
  const pattern = client.cyclePattern || { train: 2, rest: 1 };
  const unit = unitLabel(cycleType);

  if (microcycles.length === 0) {
    return (
      <Panel>
        <p className="t-sm t-secondary">Tu entrenador aún no te ha asignado ningún microciclo.</p>
      </Panel>
    );
  }

  return (
    <div className="stack">
      {client.youtubeExplanationUrl && (
        <Panel tight className="row between wrap gap-3">
          <div>
            <strong style={{ color: 'var(--data-rose)' }}>Vídeo explicativo de tu rutina</strong>
            <p className="t-sm t-secondary">Grabado por tu entrenador para ti</p>
          </div>
          <a
            href={client.youtubeExplanationUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-primary"
            style={{ background: 'var(--negative)' }}
          >
            <Play size={15} /> Ver en YouTube
          </a>
        </Panel>
      )}

      <Panel tight className="col gap-4">
        <div className="row between wrap gap-3">
          <div className="row gap-2">
            <RotateCw size={16} color="var(--data-blue)" />
            <strong className="t-sm">
              {cycleType === 'weekly'
                ? 'Tu estructura semanal'
                : `Ciclo rotativo ${pattern.train} entreno / ${pattern.rest} descanso`}
            </strong>
          </div>
          <SaveIndicator status={save.status} error={save.error} onRetry={onRetry} />
        </div>

        {cycleType === 'weekly' ? (
          <div className="split-grid">
            {WEEK_DAYS.map((day) => {
              const value = program?.weeklySplit?.[day] ?? 'Descanso';
              const isRest = value.trim().toLowerCase() === 'descanso';
              return (
                // .split-day del sistema, en vez de repetir aquí los colores.
                <div className="split-day" key={day}>
                  <span className="name">{day.slice(0, 3)}</span>
                  <span className={`value${isRest ? '' : ' is-training'}`}>{value}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="row wrap gap-2">
            {[
              ...Array.from({ length: pattern.train }, (_, i) => ({ key: `t${i}`, train: true })),
              ...Array.from({ length: pattern.rest }, (_, i) => ({ key: `r${i}`, train: false })),
            ].map((item, index, all) => (
              <span className="row gap-2" key={item.key}>
                <span
                  className="badge"
                  style={
                    item.train
                      ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                      : { background: 'var(--fill-subtle)', color: 'var(--text-secondary)' }
                  }
                >
                  {item.train ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
                  {item.train ? 'Entreno' : 'Descanso'}
                </span>
                {index < all.length - 1 && <ArrowRight size={12} color="var(--text-tertiary)" />}
              </span>
            ))}
          </div>
        )}
      </Panel>

      {/*
        ── Añadir semana, aquí ───────────────────────────────────────────────
        Estaba en un panel al final de la página, detrás de todos los ejercicios
        del día: si no lo buscabas no existía. Y era el sitio equivocado por una
        razón concreta — es una acción sobre EL PROGRAMA, no sobre el día que
        estás mirando, así que su lugar es la tira de semanas, que es donde se
        mira cuando lo que quieres es otra semana.

        `WeekPicker` ya aceptaba `onAdd`; solo había que usarlo.

        La condición pasa de `weeks.length > 1` a «hay semanas»: con una sola
        semana la tira se ocultaba, y con ella la única forma de añadir la segunda.
      */}
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

      {micro?.days.map((day) => (
        <ClientDay
          key={day.dayName}
          client={client}
          program={program}
          microcycle={micro}
          day={day}
          cycleType={cycleType}
          onLogSet={onLogSet}
        />
      ))}
    </div>
  );
};
