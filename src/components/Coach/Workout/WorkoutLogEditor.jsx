import { useMemo, useState } from 'react';
import { Dumbbell, Plus } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { dayMuscleVolume, unitLabel } from '@/domain/training';
import { EmptyState, Panel, SaveIndicator } from '@/components/ui/primitives';
import { useProgramNavigation } from './useProgramNavigation';
import { CycleSettings } from './CycleSettings';
import { WeeklySplitEditor } from './WeeklySplitEditor';
import { MicrocycleBar } from './MicrocycleBar';
import { CopyToClientPanel } from './CopyToClientPanel';
import { DayHeader } from './DayHeader';
import { ExerciseList } from './ExerciseList';
import { AddExerciseForm } from './AddExerciseForm';

/**
 * Editor de rutina. Antes eran 866 líneas y 14 `useState` en un solo
 * componente: selector de ciclo, split semanal, navegador de semanas, panel de
 * copia, pestañas de día, edición del nombre, menú de acciones, drag & drop,
 * lista de ejercicios, celdas de series y formulario de alta.
 *
 * Aquí queda solo la orquestación; cada pieza vive en su propio archivo.
 */
export const WorkoutLogEditor = () => {
  const {
    activeClient,
    clients,
    workoutData,
    exerciseLibrary,
    saveStatus,
    retrySave,
    updateClient,
    updateWeeklySplit,
    startProgram,
    appendMicrocycle,
    cloneMicrocycle,
    removeMicrocycle,
    addDay,
    renameDay,
    duplicateDay,
    removeDay,
    addExercise,
    removeExercise,
    moveExercise,
    updateExerciseSet,
    addExerciseSetSlot,
    removeExerciseSetSlot,
    upsertLibraryExercise,
    copyDayToClient,
    copyMicrocycleToClient,
    copyProgramToClient,
  } = useApp();

  const [cycleOpen, setCycleOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [newDayName, setNewDayName] = useState('');
  const [addingDay, setAddingDay] = useState(false);

  const program = workoutData[activeClient.id];
  const microcycles = program?.microcycles || [];
  const cycleType = activeClient.cycleType || 'weekly';

  const nav = useProgramNavigation(activeClient.id, microcycles);
  const save = saveStatus('workout', activeClient.id);

  const muscleSummary = useMemo(() => dayMuscleVolume(nav.day), [nav.day]);

  const indicator = (
    <SaveIndicator
      status={save.status}
      error={save.error}
      onRetry={() => retrySave('workout', activeClient.id)}
    />
  );

  if (microcycles.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Este cliente no tiene programa todavía"
        message="Crea el primer microciclo para empezar a programar días y ejercicios."
        action={
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => nav.selectWeek(startProgram(activeClient.id))}
          >
            <Plus size={17} /> Crear primer microciclo
          </button>
        }
      />
    );
  }

  const handleAddDay = (event) => {
    event.preventDefault();
    const name = newDayName.trim();
    if (!name) return;
    addDay(activeClient.id, nav.week, name);
    setNewDayName('');
    setAddingDay(false);
  };

  return (
    <div className="stack">
      <CycleSettings
        client={activeClient}
        open={cycleOpen}
        onToggle={() => setCycleOpen((v) => !v)}
        onChange={(fields) => updateClient(activeClient.id, fields, { immediate: false })}
        saveIndicator={indicator}
      />

      {cycleType === 'weekly' && (
        <WeeklySplitEditor
          split={program.weeklySplit}
          onChange={(day, value) => updateWeeklySplit(activeClient.id, day, value)}
        />
      )}

      <MicrocycleBar
        cycleType={cycleType}
        weeks={nav.weeks}
        activeWeek={nav.week}
        microcycleDate={nav.microcycle?.date}
        canGoPrev={nav.canGoPrev}
        canGoNext={nav.canGoNext}
        onPrev={nav.goPrevWeek}
        onNext={nav.goNextWeek}
        onSelect={nav.selectWeek}
        copyOpen={copyOpen}
        onToggleCopy={() => setCopyOpen((v) => !v)}
        /*
         * Estas dos acciones devuelven el número de la semana creada, así que la
         * navegación es inmediata. Antes se usaba `setTimeout(..., 50)` para
         * "esperar" a que React actualizase el estado, y encima el botón
         * "Nueva" llamaba a la función que BORRABA el programa entero.
         */
        onAppend={() => nav.selectWeek(appendMicrocycle(activeClient.id))}
        onClone={() => {
          const created = cloneMicrocycle(activeClient.id, nav.week);
          if (created) nav.selectWeek(created);
        }}
        onRemove={() => nav.selectWeek(removeMicrocycle(activeClient.id, nav.week))}
        exerciseCount={(nav.microcycle?.days || []).reduce(
          (acc, d) => acc + (d.exercises?.length || 0),
          0
        )}
      />

      {copyOpen && (
        <CopyToClientPanel
          clients={clients}
          activeClient={activeClient}
          cycleType={cycleType}
          dayName={nav.day?.dayName}
          weekCount={microcycles.length}
          onCopyDay={(targetId) =>
            copyDayToClient(activeClient.id, nav.week, nav.day.dayName, targetId)
          }
          onCopyWeek={(targetId) => copyMicrocycleToClient(activeClient.id, nav.week, targetId)}
          onCopyProgram={(targetId) => copyProgramToClient(activeClient.id, targetId)}
          onClose={() => setCopyOpen(false)}
        />
      )}

      <div className="row wrap gap-2" role="tablist" aria-label="Días del microciclo">
        {nav.days.map((day, index) => (
          <button
            key={day.dayName}
            type="button"
            role="tab"
            className="chip"
            style={
              index === nav.dayIndex
                ? { background: '#fff', color: '#000', borderColor: 'transparent' }
                : undefined
            }
            aria-pressed={index === nav.dayIndex}
            aria-selected={index === nav.dayIndex}
            onClick={() => nav.selectDay(index)}
          >
            {day.dayName}
          </button>
        ))}
        <button type="button" className="chip chip-dashed" onClick={() => setAddingDay((v) => !v)}>
          <Plus size={14} /> Día
        </button>
      </div>

      {addingDay && (
        <Panel tight as="form" className="row wrap gap-3" onSubmit={handleAddDay}>
          <input
            autoFocus
            className="input grow"
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
            placeholder="Ej: Día 3 (Pierna)"
            aria-label="Nombre del nuevo día"
          />
          <button type="submit" className="btn btn-primary" disabled={!newDayName.trim()}>
            Añadir día
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingDay(false)}>
            Cancelar
          </button>
        </Panel>
      )}

      {Object.keys(muscleSummary).length > 0 && (
        <div className="row wrap gap-2">
          {Object.entries(muscleSummary).map(([muscle, count]) => (
            <span className="badge badge-neutral" key={muscle}>
              {muscle}
              <strong style={{ color: 'var(--accent-emerald)' }}>{count} series</strong>
            </span>
          ))}
        </div>
      )}

      {nav.day ? (
        <Panel className="col gap-5">
          <DayHeader
            day={nav.day}
            weeklySplit={cycleType === 'weekly' ? program.weeklySplit : null}
            canRemove={nav.days.length > 1}
            onRename={(name) => renameDay(activeClient.id, nav.week, nav.day.dayName, name)}
            onDuplicate={() => duplicateDay(activeClient.id, nav.week, nav.day.dayName)}
            onRemove={() => removeDay(activeClient.id, nav.week, nav.day.dayName)}
          />

          <ExerciseList
            exercises={nav.day.exercises || []}
            onMove={(from, to) => moveExercise(activeClient.id, nav.week, nav.day.dayName, from, to)}
            onRemove={(exId) => removeExercise(activeClient.id, nav.week, nav.day.dayName, exId)}
            onSetChange={(exId, setIdx, field, value) =>
              updateExerciseSet(activeClient.id, nav.week, nav.day.dayName, exId, setIdx, field, value)
            }
            onAddSet={(exId) => addExerciseSetSlot(activeClient.id, nav.week, nav.day.dayName, exId)}
            onRemoveSet={(exId, setIdx) =>
              removeExerciseSetSlot(activeClient.id, nav.week, nav.day.dayName, exId, setIdx)
            }
          />

          <hr className="divider" />

          <AddExerciseForm
            library={exerciseLibrary}
            onAdd={(exercise) => addExercise(activeClient.id, nav.week, nav.day.dayName, exercise)}
            onRememberExercise={upsertLibraryExercise}
          />
        </Panel>
      ) : (
        <EmptyState
          icon={Dumbbell}
          title={`${unitLabel(cycleType)} ${nav.week} sin días`}
          message="Añade un día con el botón «+ Día» para empezar a programar ejercicios."
        />
      )}
    </div>
  );
};
