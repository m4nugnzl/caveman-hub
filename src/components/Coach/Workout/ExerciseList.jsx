import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Plus, Quote, Trash2 } from 'lucide-react';

import { setColor } from '@/domain/training';
import { previousSetKey } from '@/domain/sessions';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal } from '@/components/ui/Modal';
import { SetCell, SetRow, SetRowHead } from './SetCell';

/**
 * El resumen de un ejercicio para el índice del teléfono: «4 series × 8-10 ·
 * RIR 2». Los objetivos distintos se enumeran (una pirámide es «6-8 / 8-10»).
 */
const resumenSeries = (exercise, showRir) => {
  const sets = exercise.sets || [];
  const objetivos = [...new Set(sets.map((s) => String(s.targetReps ?? '').trim()).filter(Boolean))];
  const rirs = showRir
    ? [...new Set(sets.map((s) => String(s.targetRir ?? '').trim()).filter(Boolean))]
    : [];
  return [
    `${sets.length} ${sets.length === 1 ? 'serie' : 'series'}${objetivos.length > 0 ? ` × ${objetivos.join(' / ')}` : ''}`,
    rirs.length > 0 ? `RIR ${rirs.join(' / ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

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
 * @param previousSets  Mapa de `domain/sessions.previousSetsBefore`: lo que se
 *   levantó en cada serie la vez anterior. Solo se usa registrando — programando
 *   estorbaría, porque ahí las cifras son el plan y no la ejecución.
 * @param showNotes  Si el módulo de indicaciones está encendido para este
 *   cliente. Con él, el entrenador puede dejar una nota en un ejercicio suelto y
 *   quien entrena la lee ahí mismo. Es el MISMO interruptor que la indicación del
 *   día (`coachNote` del protocolo): las dos son lo mismo a distinta altura, y
 *   dos casillas para lo mismo solo harían pensar que son cosas distintas.
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
  onNoteChange,
  showRir = false,
  showNotes = false,
  previousSets = null,
}) => {
  const confirm = useConfirm();
  const esTelefono = useEsTelefono();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  /* Qué ejercicio tiene su hoja abierta (modo índice del teléfono). Se guarda
     el id y no el objeto: los datos frescos llegan por props en cada render. */
  const [abierto, setAbierto] = useState(null);
  /*
    Qué ejercicio tiene el campo de nota abierto SIN tener nota todavía.

    Es lo único que hace falta guardar aquí: un ejercicio con nota escrita la
    enseña siempre —no se esconde lo que ya has dicho— y uno sin nota no ocupa
    una sola línea hasta que se pide. Así la nota es de verdad opcional: quien no
    las use no ve nada de más, y quien las use tiene el campo a un clic.
  */
  const [notaAbierta, setNotaAbierta] = useState(null);

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

  /*
    ══ En el teléfono, programar es ÍNDICE + FICHA ═══════════════════════════
    El carril con todo abierto son ~30 casillas editables a la vez: en 390 px
    cada ejercicio ocupaba media pantalla y el día entero no se podía LEER.
    Aquí el día es una fila por ejercicio —nombre, músculo, «4 series × 8-10»—
    y tocar una abre su hoja con las series en grande, la nota y las acciones.
    Es el reparto de cualquier editor móvil que funciona: la lista para ver,
    la hoja para tocar.

    Solo programando y solo en el teléfono: el registro del cliente ya es una
    tabla pensada para el gimnasio, y en escritorio el carril completo es
    justo lo que permite comparar estructuras entre ejercicios.
  */
  if (canEditStructure && esTelefono) {
    const idx = exercises.findIndex((e) => e.id === abierto);
    const abiertoEx = idx >= 0 ? exercises[idx] : null;

    return (
      <>
        <ul className="col gap-2" style={{ listStyle: 'none' }}>
          {exercises.map((exercise, index) => {
            const accent = setColor(index);
            return (
              <li key={exercise.id}>
                <button type="button" className="exercise-row" onClick={() => setAbierto(exercise.id)}>
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
                  <span className="exercise-row-name">
                    <span className="name">{exercise.name}</span>
                    <span className="sum">
                      {[exercise.muscle, resumenSeries(exercise, showRir)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ChevronRight size={15} className="chevron" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>

        {abiertoEx && (
          <Modal
            title={abiertoEx.name}
            onClose={() => setAbierto(null)}
            footer={
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={idx === 0}
                  onClick={() => onMove(idx, idx - 1)}
                >
                  <ArrowUp size={15} /> Subir
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={idx === exercises.length - 1}
                  onClick={() => onMove(idx, idx + 1)}
                >
                  <ArrowDown size={15} /> Bajar
                </button>
                {/* La hoja se cierra ANTES de preguntar: dos diálogos apilados
                    pelean por el foco y por Escape (ver Modal.jsx). Cancelar
                    deja la hoja cerrada, que es un precio menor. */}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    const { id, name } = abiertoEx;
                    setAbierto(null);
                    const ok = await confirm({
                      title: `¿Eliminar «${name}»?`,
                      message: 'Se borrarán también todas sus series registradas.',
                      confirmLabel: 'Eliminar ejercicio',
                      tone: 'danger',
                    });
                    if (ok) onRemove(id);
                  }}
                >
                  <Trash2 size={15} /> Eliminar
                </button>
              </>
            }
          >
            <div className="col gap-4">
              {/* `order: 0` en línea: la regla móvil de `.set-lane` (order 10,
                  pensada para la fila del escritorio que envuelve) la mandaba
                  detrás de la nota; en la ficha las series van primero. */}
              <div className="set-lane" style={{ order: 0, flexBasis: 'auto' }}>
                {(abiertoEx.sets || []).map((set, setIndex) => (
                  <SetCell
                    key={setIndex}
                    index={setIndex}
                    set={set}
                    exerciseName={abiertoEx.name}
                    canRemove={abiertoEx.sets.length > 1}
                    onChange={(field, value) => onSetChange(abiertoEx.id, setIndex, field, value)}
                    onRemove={() => onRemoveSet(abiertoEx.id, setIndex)}
                    showRir={showRir}
                  />
                ))}
                <button
                  type="button"
                  className="set-add"
                  onClick={() => onAddSet(abiertoEx.id)}
                  aria-label={`Añadir una serie a ${abiertoEx.name}`}
                  title="Añadir serie"
                >
                  <Plus size={16} />
                </button>
              </div>

              {showNotes && (
                <label className="exercise-note">
                  <span className="section-label">
                    <Quote size={12} /> Nota de {abiertoEx.name}
                  </span>
                  <textarea
                    className="textarea"
                    rows={2}
                    placeholder="La verá tu cliente junto al ejercicio. Ej: el codo pegado al cuerpo."
                    value={abiertoEx.coachNote ?? ''}
                    onChange={(event) => onNoteChange(abiertoEx.id, event.target.value)}
                  />
                </label>
              )}
            </div>
          </Modal>
        )}
      </>
    );
  }

  return (
    <ul className="col gap-2" style={{ listStyle: 'none' }}>
      {exercises.map((exercise, index) => {
        const accent = setColor(index);
        /* La referencia de la primera serie sirve para saber SI hay vez
           anterior y de qué semana. Las cifras de cada serie van en su campo. */
        const antes = previousSets?.get(previousSetKey(exercise.name, 0)) || null;
        const nota = exercise.coachNote ?? '';
        /* Con texto se enseña siempre; vacía, solo si acaban de pedirla. */
        const editandoNota = notaAbierta === exercise.id || nota.length > 0;
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
              <>
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

                {/* En táctil el arrastre de HTML5 no dispara: estas flechas son
                    EL camino para reordenar, no una alternativa. Solo se pintan
                    ahí (ver `.touch-reorder`), donde además el asa se esconde. */}
                <span className="touch-reorder">
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1)}
                    aria-label={`Subir ${exercise.name}`}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact"
                    disabled={index === exercises.length - 1}
                    onClick={() => onMove(index, index + 1)}
                    aria-label={`Bajar ${exercise.name}`}
                  >
                    <ArrowDown size={14} />
                  </button>
                </span>
              </>
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
                {/* De cuándo son las cifras apagadas de los campos. Sin esto, un
                    número gris dentro de una casilla vacía no dice nada. */}
                {antes && (
                  <span className="prev-hint">
                    la vez anterior · semana {antes.weekNumber}
                  </span>
                )}
                {/*
                  Pedir la nota vive AQUÍ, con el nombre, y no entre los botones
                  de la derecha: esos son acciones sobre la estructura —reordenar,
                  borrar— y esto es decir algo sobre este ejercicio. Además así no
                  hay un icono más compitiendo con la papelera en cada fila.

                  Desaparece en cuanto hay nota, porque entonces el campo ya está
                  abierto debajo: un botón que no puede hacer nada es peor que no
                  tenerlo.
                */}
                {showNotes && canEditStructure && !editandoNota && (
                  <button
                    type="button"
                    className="note-add"
                    onClick={() => setNotaAbierta(exercise.id)}
                    aria-label={`Añadir una nota a ${exercise.name}`}
                  >
                    + nota
                  </button>
                )}
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
                    previous={previousSets?.get(previousSetKey(exercise.name, setIndex))}
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

            {/*
              ══ La nota, a lo ancho y DEBAJO ═══════════════════════════════

              Es texto para leer, y el hueco que queda en la fila —entre el
              nombre y las series— da para tres palabras. Ocupando la línea
              entera se lee de un vistazo y no le quita ancho a las celdas, que
              es lo que de verdad se usa aquí.

              Se guarda mientras se escribe, como la indicación del día: no hay
              botón de guardar en ningún sitio de esta pantalla.
            */}
            {showNotes && canEditStructure && editandoNota && (
              <label className="exercise-note">
                <span className="section-label">
                  <Quote size={12} /> Nota de {exercise.name}
                </span>
                <textarea
                  className="textarea"
                  rows={2}
                  autoFocus={notaAbierta === exercise.id}
                  placeholder="La verá tu cliente junto al ejercicio. Ej: el codo pegado al cuerpo."
                  value={nota}
                  onChange={(event) => onNoteChange(exercise.id, event.target.value)}
                />
              </label>
            )}

            {/* Registrando no hay campo: se lee lo que te han dicho. */}
            {showNotes && !canEditStructure && nota.trim() && (
              <div className="exercise-note is-read">
                <Quote size={12} />
                <p>{nota}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
