import { X } from 'lucide-react';

/**
 * Una serie del ejercicio.
 *
 * ── Estructura ──────────────────────────────────────────────────────────────
 * Cuatro columnas del mismo tamaño con la etiqueta encima:
 *
 *     SERIE 1                      ✕
 *      OBJ     KG     REP    RIR
 *    [ 8-10 ] [ 100 ] [ 8 ]  [ 2 ]
 *
 * Las dos versiones anteriores metían el objetivo en una cabecera, más pequeño y
 * en otro eje que los valores: quedaba descentrado y parecía un detalle menor
 * cuando es la instrucción que el cliente tiene que leer en cada serie. Aquí
 * tiene el mismo peso visual, y se distingue por color —cian, como el resto de
 * lo que programa el entrenador— en vez de por tamaño.
 */

const VALUE_FIELDS = [
  { key: 'kg', unit: 'kg', label: 'kilos', mode: 'decimal' },
  { key: 'reps', unit: 'rep', label: 'repeticiones', mode: 'numeric' },
  { key: 'rir', unit: 'rir', label: 'RIR', mode: 'numeric' },
];

export const SetCell = ({
  index,
  set,
  color,
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
        <span className="set-cell-tag" style={{ color }}>
          Serie {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn"
            style={{ padding: 2, minWidth: 0, color: 'var(--text-dark)' }}
            aria-label={`Quitar ${label}`}
            title="Quitar serie"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="set-cell-grid">
        <label className="set-cell-col is-target">
          <span className="unit">obj</span>
          {canEditTarget ? (
            <input
              type="text"
              className="input"
              placeholder="8-10"
              value={set.targetReps || ''}
              onChange={(e) => onChange('targetReps', e.target.value)}
              aria-label={`${label}: repeticiones objetivo`}
            />
          ) : (
            <span className="readonly" aria-label={`${label}: objetivo ${set.targetReps || 'sin definir'}`}>
              {set.targetReps || '—'}
            </span>
          )}
        </label>

        {VALUE_FIELDS.map((field) => (
          <label className="set-cell-col" key={field.key}>
            <span className="unit">{field.unit}</span>
            <input
              type="text"
              inputMode={field.mode}
              className="input"
              style={field.key === 'rir' ? { color } : undefined}
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
