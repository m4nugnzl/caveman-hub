import { X } from 'lucide-react';

/**
 * Una serie.
 *
 *   S1              obj [8-10]
 *    KG    REPS   RIR
 *  [100]  [ 8 ]  [ 2 ]
 *
 * ── Sobre el objetivo de repeticiones ───────────────────────────────────────
 * Es POR SERIE, y tiene que serlo: hay pirámides, series descendentes y
 * aproximaciones, y forzar un rango único para todo el ejercicio quita
 * información real.
 *
 * Lo que estaba mal no era que existiera, sino su peso visual: ocupaba una
 * columna del mismo tamaño que los kilos y competía con ellos. Ahora vive en la
 * cabecera de la celda, pequeño y en cian —el color de lo que programa el
 * entrenador— claramente subordinado a los tres valores que se registran.
 */

const FIELDS = [
  { key: 'kg', unit: 'kg', label: 'kilos', mode: 'decimal' },
  { key: 'reps', unit: 'reps', label: 'repeticiones', mode: 'numeric' },
  { key: 'rir', unit: 'rir', label: 'RIR', mode: 'numeric' },
];

export const SetCell = ({
  index,
  set,
  canRemove,
  canEditTarget = true,
  onChange,
  onRemove,
  exerciseName,
}) => {
  const label = `${exerciseName}, serie ${index + 1}`;

  return (
    <div className="set-cell">
      <div className="set-cell-head">
        <span className="set-cell-tag">S{index + 1}</span>

        <span className="set-cell-target">
          <span className="tag">obj</span>
          {canEditTarget ? (
            <input
              type="text"
              className="input"
              placeholder="8-10"
              value={set.targetReps ?? ''}
              onChange={(e) => onChange('targetReps', e.target.value)}
              aria-label={`${label}: repeticiones objetivo`}
              title="Repeticiones objetivo de esta serie"
            />
          ) : (
            <span className="fixed">{set.targetReps || '—'}</span>
          )}
        </span>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn"
            style={{ padding: 0, minWidth: 0, color: 'var(--text-tertiary)', flexShrink: 0 }}
            aria-label={`Quitar ${label}`}
            title="Quitar serie"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="set-cell-grid">
        {FIELDS.map((field) => (
          <label className="set-cell-col" key={field.key}>
            <span className="unit">{field.unit}</span>
            <input
              type="text"
              inputMode={field.mode}
              className="input"
              value={set[field.key] ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              aria-label={`${label}: ${field.label}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
};
