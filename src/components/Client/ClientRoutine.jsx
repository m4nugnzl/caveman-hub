import { ArrowRight, CheckCircle2, CircleDashed, Dumbbell, Play, RotateCw } from 'lucide-react';

import { WEEK_DAYS, countSets, dayMuscleVolume, unitLabel, weekdayForDay } from '@/domain/training';
import { Panel, SaveIndicator, WeekPicker } from '@/components/ui/primitives';
import { ExerciseList } from '@/components/Coach/Workout/ExerciseList';

/**
 * Cabecera de día con el mismo lenguaje visual que la del entrenador (comparte
 * la clase `.day-header`), pero sin el menú de acciones: el cliente no renombra
 * ni borra días.
 */
const DayBanner = ({ day, weeklySplit }) => {
  const weekday = weekdayForDay(weeklySplit, day.dayName);

  return (
    <header className="day-header">
      <div className="row gap-4">
        <span
          style={{
            background: 'rgba(34,211,238,0.15)',
            padding: 12,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Dumbbell size={24} color="var(--accent-cyan)" />
        </span>

        <div className="col gap-1">
          <div className="row gap-2 wrap">
            <span className="uppercase-label" style={{ color: 'var(--accent-cyan)' }}>
              Sesión
            </span>
            {weekday && <span className="badge badge-neutral">{weekday}</span>}
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900 }}>{day.dayName}</h2>
        </div>
      </div>

      <div
        className="row gap-5"
        style={{
          background: 'rgba(0,0,0,0.25)',
          padding: '10px 18px',
          borderRadius: 16,
          border: '1px solid var(--border-color)',
        }}
      >
        <div className="col gap-1" style={{ alignItems: 'center' }}>
          <span className="stat-label">Ejercicios</span>
          <strong style={{ fontSize: '1.15rem' }}>{day.exercises?.length || 0}</strong>
        </div>
        <span style={{ width: 1, height: 28, background: 'var(--border-color)' }} />
        <div className="col gap-1" style={{ alignItems: 'center' }}>
          <span className="stat-label">Series</span>
          <strong style={{ fontSize: '1.15rem', color: 'var(--accent-emerald)' }}>{countSets(day)}</strong>
        </div>
      </div>
    </header>
  );
};

export const ClientRoutine = ({ client, program, weeks, activeWeek, onSelectWeek, onSetChange, save, onRetry }) => {
  const microcycles = program?.microcycles || [];
  const micro = microcycles.find((m) => m.weekNumber === activeWeek);
  const cycleType = client.cycleType || 'weekly';
  const pattern = client.cyclePattern || { train: 2, rest: 1 };
  const unit = unitLabel(cycleType);

  if (microcycles.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-muted">Tu entrenador aún no te ha asignado ningún microciclo.</p>
      </Panel>
    );
  }

  return (
    <div className="stack">
      {client.youtubeExplanationUrl && (
        <Panel tight className="row between wrap gap-3">
          <div>
            <strong style={{ color: 'var(--accent-coral)' }}>Vídeo explicativo de tu rutina</strong>
            <p className="text-sm text-muted">Grabado por tu entrenador para ti</p>
          </div>
          <a
            href={client.youtubeExplanationUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-primary"
            style={{ background: '#ef4444' }}
          >
            <Play size={15} /> Ver en YouTube
          </a>
        </Panel>
      )}

      <Panel tight className="col gap-4">
        <div className="row between wrap gap-3">
          <div className="row gap-2">
            <RotateCw size={16} color="var(--accent-cyan)" />
            <strong className="text-sm">
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
                <div className="col gap-1" key={day}>
                  <span className="uppercase-label" style={{ textAlign: 'center' }}>
                    {day.slice(0, 3)}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      background: isRest ? 'var(--bg-sunken)' : 'rgba(16,185,129,0.12)',
                      border: `1px solid ${isRest ? 'var(--border-color)' : 'var(--accent-emerald)'}`,
                      borderRadius: 10,
                      padding: '9px 4px',
                      fontWeight: 700,
                      textAlign: 'center',
                      color: isRest ? 'var(--text-muted)' : '#fff',
                    }}
                  >
                    {value}
                  </span>
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
                      ? { background: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }
                  }
                >
                  {item.train ? <CheckCircle2 size={12} /> : <CircleDashed size={12} />}
                  {item.train ? 'Entreno' : 'Descanso'}
                </span>
                {index < all.length - 1 && <ArrowRight size={12} color="rgba(255,255,255,0.25)" />}
              </span>
            ))}
          </div>
        )}
      </Panel>

      {weeks.length > 1 && (
        <WeekPicker weeks={weeks} value={activeWeek} onChange={onSelectWeek} prefix={unit} />
      )}

      {micro?.days.map((day) => {
        const volume = dayMuscleVolume(day);

        return (
          <Panel className="col gap-5" key={day.dayName}>
            <DayBanner day={day} weeklySplit={cycleType === 'weekly' ? program?.weeklySplit : null} />

            {Object.keys(volume).length > 0 && (
              <div className="row wrap gap-2">
                {Object.entries(volume).map(([muscle, count]) => (
                  <span className="badge badge-neutral" key={muscle}>
                    {muscle}
                    <strong style={{ color: 'var(--accent-emerald)' }}>{count} series</strong>
                  </span>
                ))}
              </div>
            )}

            {/*
              Exactamente la misma lista que usa el entrenador, con
              `canEditStructure` en false: el cliente registra sus kg, reps y RIR
              pero no puede reordenar, borrar ni añadir series. Antes esto era
              una tabla aparte, con otro aspecto y su propio bug (la columna del
              objetivo de repeticiones salía siempre vacía).
            */}
            <ExerciseList
              exercises={day.exercises || []}
              canEditStructure={false}
              emptyMessage="Tu entrenador no ha programado ejercicios en este día."
              onSetChange={(exId, setIndex, field, value) =>
                onSetChange(client.id, micro.weekNumber, day.dayName, exId, setIndex, field, value)
              }
            />
          </Panel>
        );
      })}
    </div>
  );
};
