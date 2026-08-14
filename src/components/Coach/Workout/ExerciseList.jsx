import { useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import { setColor } from '@/domain/training';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { SetCell, SetRow, SetRowHead } from './SetCell';

/**
 * Lista de ejercicios del día, reordenable.
 *
 * El drag & drop arranca SOLO desde el asa: cuando la fila entera era
 * arrastrable, el gesto competía con hacer clic en los inputs y en los botones,
 * y a veces no se podía escribir en un campo. Hay además reordenación por
 * teclado (Alt + flechas sobre el asa), porque el arrastre con ratón deja fuera
 * a quien no lo pueda usar.
 *
 * @param canEditStructure  true para el entrenador (reordenar, borrar, añadir
 *   series, definir objetivos). El cliente usa la MISMA lista con esto en false:
 *   registra sus kg, reps y RIR, pero no cambia el programa que le han montado.
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
  showRir = false,
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
      <p className="t-sm t-secondary" style={{ padding: 'var(--s4) 0' }}>
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
              'exercise',
              /* Registrando, el ejercicio es una FICHA en columna —nombre arriba,
                 tabla debajo— en cualquier ancho. Antes era la misma fila que usa
                 el entrenador y solo se convertía en columna por debajo de 640 px,
                 con `flex-wrap` y un `order: 10`: el resultado se sostenía por dos
                 apaños que había que leer para entender por qué el nombre acababa
                 encima. Si la forma correcta es la columna, se declara. */
              canEditStructure ? '' : 'is-log',
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

            {/*
              Nombre y músculo. Nada más.
              --------------------------------------------------------------
              Aquí hubo un campo con el objetivo de repeticiones que parecía
              informativo y escribía en TODAS las series a la vez, y después un
              resumen de solo lectura. Los dos sobraban: el objetivo vive en cada
              serie —una pirámide es 6-8 / 8-10 / 8-10 y solo se puede decir celda
              a celda— y repetirlo aquí solo servía para confundir.
            */}
            <div className="exercise-name">
              <div className="name" title={exercise.name}>
                {exercise.name}
              </div>
              <div className="exercise-meta">
                <span className="muscle">{exercise.muscle}</span>
              </div>
            </div>

            {/*
              Las series cambian de FORMA según el trabajo, no según el ancho.
              ------------------------------------------------------------------
              Programar (entrenador) es comparar estructuras entre ejercicios y
              añadir o quitar piezas: cada serie es una tarjeta autónoma en un
              carril que envuelve.

              Registrar (cliente) es escribir doce números seguidos de un mismo
              ejercicio: eso es una tabla, con las etiquetas UNA vez arriba. Ver
              `SetRow` para el porqué largo.
            */}
            {canEditStructure ? (
              <div className="set-lane">
                {(exercise.sets || []).map((set, setIndex) => (
                  <SetCell
                    key={setIndex}
                    index={setIndex}
                    set={set}
                    exerciseName={exercise.name}
                    canRemove={exercise.sets.length > 1}
                    onChange={(field, value) => onSetChange(exercise.id, setIndex, field, value)}
                    onRemove={() => onRemoveSet(exercise.id, setIndex)}
                    showRir={showRir}
                  />
                ))}
                <button
                  type="button"
                  className="set-add"
                  onClick={() => onAddSet(exercise.id)}
                  title="Añadir serie"
                  aria-label={`Añadir una serie a ${exercise.name}`}
                >
                  <Plus size={16} />
                </button>
              </div>
            ) : (
              <div className="set-table">
                <SetRowHead />
                {(exercise.sets || []).map((set, setIndex) => (
                  <SetRow
                    key={setIndex}
                    index={setIndex}
                    set={set}
                    exerciseName={exercise.name}
                    onChange={(field, value) => onSetChange(exercise.id, setIndex, field, value)}
                    showRir={showRir}
                  />
                ))}
              </div>
            )}

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
