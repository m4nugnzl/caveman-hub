import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Quote, Trash2, X } from 'lucide-react';

import { isSetLogged } from '@/domain/sessions';
import { toNum } from '@/lib/num';
import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * La hoja de series: el día como TABLA, no como fichas.
 *
 * ── Por qué existe al lado de `ExerciseList` ────────────────────────────────
 * `ExerciseList` pinta cada serie como una tarjeta con tres cajas grandes, y
 * está bien en el móvil, donde se escribe con el pulgar. En el escritorio del
 * entrenador es lo contrario de lo que se necesita: programar es mirar de un
 * vistazo diez ejercicios con sus series, y comparar lo que se puso con lo que
 * hizo. Eso es una hoja —una fila por serie, las columnas siempre en el mismo
 * sitio— y es lo que se le enseñó al dueño en la maqueta.
 *
 * ── Qué es objetivo y qué es hecho ──────────────────────────────────────────
 * Lo que el entrenador programa por serie son las repeticiones y el RIR
 * objetivo (`targetReps`, `targetRir`); los kilos no se prescriben en este
 * producto. Lo que el cliente anota son kilos, repeticiones y RIR reales
 * (`kg`, `reps`, `rir`). Así que la tabla es OBJETIVO (reps · RIR) | HIZO
 * (kg · reps · RIR), y una repetición real por debajo del mínimo objetivo se
 * pinta en negativo: es lo único que hay que ver sin leer.
 *
 * Recibe exactamente las mismas props que `ExerciseList`, para que el editor
 * elija una u otra según el ancho sin cambiar nada más.
 */
/** El mínimo del rango objetivo: «8-10» → 8. */
const minimoDe = (targetReps) => toNum(String(targetReps ?? '').split(/[-–]/)[0]);

const CAMPOS_HECHO = [
  { key: 'kg', label: 'kg', mode: 'decimal' },
  { key: 'reps', label: 'reps', mode: 'numeric' },
  { key: 'rir', label: 'rir', mode: 'numeric' },
];

const Celda = ({ value, placeholder = '—', mode = 'numeric', tone = '', label, onChange }) => (
  <input
    type="text"
    inputMode={mode}
    className={`hoja-celda${tone ? ` ${tone}` : ''}`}
    value={value ?? ''}
    placeholder={placeholder}
    aria-label={label}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const hoja = e.currentTarget.closest('.hoja');
      const campos = [...(hoja?.querySelectorAll('input.hoja-celda') || [])];
      const siguiente = campos[campos.indexOf(e.currentTarget) + 1];
      if (siguiente) siguiente.focus();
      else e.currentTarget.blur();
    }}
  />
);

export const HojaDeSeries = ({
  exercises,
  emptyMessage = 'Este día todavía no tiene ejercicios. Añade el primero abajo.',
  onMove,
  onRemove,
  onSetChange,
  onAddSet,
  onRemoveSet,
  onNoteChange,
  showRir = false,
  showNotes = false,
  focusedId = null,
  onFocusExercise = null,
  /* La excepción de este microciclo sobre un ejercicio, si la hay, y sus dos
     salidas. Como en toda la casa: cada cosa que se puede hacer aparece si —y
     solo si— llega su manejador. */
  excepcionDe = null,
  onRemoveOnly = null,
  onSacarDeLaPlantilla = null,
  tramoDe = null,
  onAlargar = null,
  onVolverAlBloque = null,
  onAplicarAlBloque = null,
}) => {
  const [notaAbierta, setNotaAbierta] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  if (exercises.length === 0) {
    return <p className="t-sm t-secondary hoja-vacia">{emptyMessage}</p>;
  }

  const columnas = showRir ? 'is-rir' : 'is-sin-rir';

  return (
    <div className="hoja">
      {exercises.map((ex, index) => {
        const sets = ex.sets || [];
        const nota = ex.coachNote ?? '';
        const conNota = showNotes && (nota.length > 0 || notaAbierta === ex.id);
        const enFoco = focusedId === ex.id;
        const excepcion = excepcionDe ? excepcionDe(ex) : null;
        return (
          <section
            key={ex.id}
            className={`hoja-ej${enFoco ? ' is-focused' : ''}${overIndex === index && dragIndex !== index ? ' is-drop-target' : ''}${dragIndex === index ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((i) => (i === index ? null : i))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onClick={onFocusExercise ? () => onFocusExercise(ex.id) : undefined}
            onFocus={onFocusExercise ? () => onFocusExercise(ex.id) : undefined}
          >
            <header className="hoja-ej-head">
              <button
                type="button"
                className="hoja-asa"
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                aria-label={`Arrastrar ${ex.name} para reordenar`}
                title="Arrastra para reordenar"
              >
                <GripVertical size={14} />
              </button>
              <span className="hoja-ej-n">{index + 1}</span>
              <span className="hoja-ej-nombre">
                {ex.name}
                {/*
                  ── La excepción se dice, no se pinta de rojo ────────────────
                  Este ejercicio no es el del bloque: es de esta semana. Se
                  marca con el asterisco y la palabra, en tinta terciaria, y
                  NUNCA con semáforo — en esta hoja el color ya significa
                  «repeticiones por debajo del objetivo» y no puede tener un
                  segundo trabajo. Además una excepción no es un fallo.

                  Y lleva sus dos salidas: volver al plan del bloque, o
                  ascenderla y que pase a ser el plan («esto que probé me
                  gustó»), que con los cambios permanentes siendo lo normal es
                  el camino que más se va a andar.
                */}
                {excepcion && (
                  <span className="hoja-ej-excepcion">
                    <span className="ast" aria-hidden="true">
                      ✱
                    </span>
                    {tramoDe ? tramoDe(excepcion) : 'solo este microciclo'}
                    {excepcion.sobre && excepcion.sobre !== ex.name ? ` · en lugar de ${excepcion.sobre}` : ''}
                    {onVolverAlBloque && (
                      <button type="button" className="link" onClick={() => onVolverAlBloque(ex.id)}>
                        volver al bloque
                      </button>
                    )}
                    {onAlargar && (
                      <button type="button" className="link" onClick={() => onAlargar(ex.id)}>
                        dejarlo más tiempo
                      </button>
                    )}
                    {onAplicarAlBloque && (
                      <button type="button" className="link" onClick={() => onAplicarAlBloque(ex.id)}>
                        aplicar al bloque
                      </button>
                    )}
                  </span>
                )}
              </span>
              <span className="hoja-ej-meta">
                {[ex.muscle, `${sets.length} ${sets.length === 1 ? 'serie' : 'series'}`].filter(Boolean).join(' · ')}
              </span>
              <span className="hoja-ej-acciones">
                {showNotes && !conNota && (
                  <button type="button" className="btn btn-icon btn-icon-compact" title="Añadir una nota" aria-label={`Añadir una nota a ${ex.name}`} onClick={() => setNotaAbierta(ex.id)}>
                    <Quote size={13} />
                  </button>
                )}
                <button type="button" className="btn btn-icon btn-icon-compact" disabled={index === 0} aria-label={`Subir ${ex.name}`} onClick={() => onMove(index, index - 1)}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="btn btn-icon btn-icon-compact" disabled={index === exercises.length - 1} aria-label={`Bajar ${ex.name}`} onClick={() => onMove(index, index + 1)}>
                  <ArrowDown size={13} />
                </button>
                {/*
                  ── Quitar, y hasta dónde llega ─────────────────────────────
                  Un cambio se hace para quedarse, así que quitarlo del BLOQUE
                  es lo primero y lo que se lee como la acción normal. Debajo,
                  lo puntual. Sin `onRemoveOnly` —o sobre algo que ya es una
                  excepción— no hay nada que elegir y vuelve a ser un botón.
                */}
                {onRemoveOnly && !excepcion ? (
                  <MenuAcciones
                    clase="btn btn-icon btn-icon-compact btn-icon-danger"
                    ariaLabel={`Alcance de los cambios en ${ex.name}`}
                    label={<Trash2 size={13} />}
                    items={[
                      /*
                        ── Aquí se CREA un cambio, y con su tramo ────────────
                        Faltaba la puerta: se podía quitar solo en un
                        microciclo, pero no cambiar solo en él. «Sacarlo de la
                        plantilla» copia el ejercicio tal y como está a este
                        microciclo, y a partir de ahí todo lo que se toque en
                        esta fila —series, repeticiones, el nombre— se queda
                        aquí. No cambia nada al pulsarlo: cambia dónde van a
                        caer los cambios de después, que es justo la decisión.
                      */
                      onSacarDeLaPlantilla && {
                        label: 'Cambiarlo solo este microciclo',
                        run: () => onSacarDeLaPlantilla(ex.id, { semanas: 1 }),
                      },
                      onSacarDeLaPlantilla && {
                        label: 'Cambiarlo unas semanas',
                        run: () => onSacarDeLaPlantilla(ex.id, { semanas: 3 }),
                      },
                      onSacarDeLaPlantilla && {
                        label: 'Cambiarlo de aquí en adelante',
                        run: () => onSacarDeLaPlantilla(ex.id, { semanas: null }),
                      },
                      onSacarDeLaPlantilla && null,
                      { label: 'Quitar del bloque', danger: true, run: () => onRemove(ex.id) },
                      { label: 'Quitar solo este microciclo', run: () => onRemoveOnly(ex.id) },
                    ]}
                    sinFlecha
                  />
                ) : (
                  <button type="button" className="btn btn-icon btn-icon-compact btn-icon-danger" aria-label={`Eliminar ${ex.name}`} onClick={() => onRemove(ex.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </header>

            <div className={`hoja-tabla ${columnas}`} role="table" aria-label={`Series de ${ex.name}`}>
              <div className="hoja-fila is-grupo" role="row">
                <span />
                <span className="hoja-grupo is-objetivo">Objetivo</span>
                <span className="hoja-grupo is-hecho">Hizo</span>
                <span />
              </div>
              <div className="hoja-fila is-head" role="row">
                <span>#</span>
                <span>reps</span>
                {showRir && <span>rir</span>}
                {CAMPOS_HECHO.map((c) => (
                  <span key={c.key}>{c.label}</span>
                ))}
                <span />
              </div>
              {sets.map((set, i) => {
                const etiqueta = `${ex.name}, serie ${i + 1}`;
                const minimo = minimoDe(set.targetReps);
                const hechas = toNum(set.reps);
                const corta = minimo !== null && hechas !== null && hechas < minimo;
                return (
                  <div className={`hoja-fila${isSetLogged(set) ? ' is-hecha' : ''}`} role="row" key={i}>
                    <span className="hoja-num">{i + 1}</span>
                    <Celda
                      value={set.targetReps}
                      placeholder="8-10"
                      mode="text"
                      label={`${etiqueta}: repeticiones objetivo`}
                      onChange={(v) => onSetChange(ex.id, i, 'targetReps', v)}
                    />
                    {showRir && (
                      <Celda
                        value={set.targetRir}
                        placeholder="2"
                        label={`${etiqueta}: RIR objetivo`}
                        onChange={(v) => onSetChange(ex.id, i, 'targetRir', v)}
                      />
                    )}
                    {CAMPOS_HECHO.map((c) => (
                      <Celda
                        key={c.key}
                        value={set[c.key]}
                        mode={c.mode}
                        tone={c.key === 'reps' && corta ? 'is-corta' : c.key === 'reps' && isSetLogged(set) ? 'is-cumple' : ''}
                        label={`${etiqueta}: ${c.label} hechos`}
                        onChange={(v) => onSetChange(ex.id, i, c.key, v)}
                      />
                    ))}
                    <button
                      type="button"
                      className="hoja-x"
                      disabled={sets.length <= 1}
                      aria-label={`Quitar ${etiqueta}`}
                      title="Quitar serie"
                      onClick={() => onRemoveSet(ex.id, i)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
              <button type="button" className="hoja-mas" onClick={() => onAddSet(ex.id)}>
                <Plus size={12} /> serie
              </button>
            </div>

            {conNota && (
              <label className="hoja-nota">
                <span className="section-label">
                  Nota para el cliente
                </span>
                <textarea
                  className="textarea"
                  rows={2}
                  autoFocus={notaAbierta === ex.id && nota.length === 0}
                  placeholder="La verá junto al ejercicio. Ej: el codo pegado al cuerpo."
                  value={nota}
                  onChange={(e) => onNoteChange(ex.id, e.target.value)}
                  onBlur={() => !nota.trim() && setNotaAbierta(null)}
                />
              </label>
            )}
          </section>
        );
      })}
    </div>
  );
};
