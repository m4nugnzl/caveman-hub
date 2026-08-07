import { useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import { setColor } from '@/domain/training';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { SetCell } from './SetCell';

/**
 * Lista de ejercicios del día, reordenable.
 *
 * El drag & drop arranca SOLO desde el asa: cuando la fila entera era
 * arrastrable, el gesto competía con hacer clic en los inputs y en los botones,
 * y a veces no se podía escribir en un campo.
 *
 * Se añade además reordenación por teclado (Alt + flechas sobre el asa), porque
 * el arrastre con ratón dejaba fuera a cualquiera que no lo pueda usar.
 */
/**
 * @param canEditStructure  true para el entrenador (reordenar, borrar, añadir
 *   series). El cliente usa la MISMA lista con esto en false: puede registrar
 *   sus kg, reps y RIR, pero no cambiar el programa que le han montado.
 *   Antes el cliente tenía su propia tabla, con otro aspecto y su propio bug.
 */
export const ExerciseList = ({
  exercises,
  canEditStructure = true,
  emptyMessage = 'Este día todavía no tiene ejercicios. Añade el primero abajo.',
  onMove,
  onRemove,
  onSetChange,
  onAddSet,
  onRemoveSet,
}) => {
  const confirm = useConfirm();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const handleDrop = (event, index) => {
    event.preventDefault();
    if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleKeyDown = (event, index) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onMove(index, index - 1);
    } else if (event.key === 'ArrowDown' && index < exercises.length - 1) {
      event.preventDefault();
      onMove(index, index + 1);
    }
  };

  const askRemove = async (exercise) => {
    const ok = await confirm({
      title: `¿Eliminar «${exercise.name}»?`,
      message: 'Se borrarán también todas sus series registradas.',
      confirmLabel: 'Eliminar ejercicio',
      tone: 'danger',
    });
    if (ok) onRemove(exercise.id);
  };

  if (exercises.length === 0) {
    return (
      <p className="text-sm text-muted" style={{ padding: 'var(--space-4) 0' }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="col gap-2" style={{ listStyle: 'none' }}>
      {exercises.map((exercise, index) => {
        const accent = setColor(index);
        return (
          <li
            key={exercise.id}
            className={[
              'exercise-row',
              overIndex === index && dragIndex !== index ? 'is-drop-target' : '',
              dragIndex === index ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((i) => (i === index ? null : i))}
            onDrop={(e) => handleDrop(e, index)}
          >
            {canEditStructure && (
              <button
                type="button"
                className="drag-handle"
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
                aria-label={`Reordenar ${exercise.name}. Alt y flechas para mover.`}
                title="Arrastra para reordenar (o Alt + ↑/↓)"
              >
                <GripVertical size={16} />
              </button>
            )}

            <span
              className="exercise-index"
              style={{
                background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
                border: `1px solid ${accent}40`,
                color: accent,
              }}
            >
              {index + 1}
            </span>

            <div className="exercise-name">
              <div className="name">{exercise.name}</div>
              <span className="badge badge-neutral" style={{ fontSize: '0.6rem', marginTop: 3 }}>
                {exercise.muscle}
              </span>
            </div>

            <div className="set-lane">
              {(exercise.sets || []).map((set, setIndex) => (
                <SetCell
                  key={setIndex}
                  index={setIndex}
                  set={set}
                  exerciseName={exercise.name}
                  color={setColor(setIndex)}
                  canRemove={canEditStructure && exercise.sets.length > 1}
                  canEditTarget={canEditStructure}
                  onChange={(field, value) => onSetChange(exercise.id, setIndex, field, value)}
                  onRemove={() => onRemoveSet(exercise.id, setIndex)}
                />
              ))}
              {canEditStructure && (
                <button
                  type="button"
                  className="set-add"
                  onClick={() => onAddSet(exercise.id)}
                  title="Añadir serie"
                  aria-label={`Añadir una serie a ${exercise.name}`}
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {canEditStructure && (
              <button
                type="button"
                className="btn btn-icon btn-icon-danger shrink-0"
                onClick={() => askRemove(exercise)}
                aria-label={`Eliminar ${exercise.name}`}
              >
                <Trash2 size={15} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};
