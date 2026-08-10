import { useState } from 'react';
import { Check, Footprints, Pencil, X } from 'lucide-react';

import { TARGET_FIELDS, macroSplit, targetsFor } from '@/domain/nutrition';
import { MacroBar } from './macros';

const LABELS = {
  targetKcals: 'Kcal',
  proteinGrams: 'Proteína (g)',
  carbsGrams: 'Carbos (g)',
  fatsGrams: 'Grasas (g)',
};

/**
 * Objetivo de una variante: la cifra calórica y su reparto en una barra.
 *
 * ── Por qué una barra y no un anillo ────────────────────────────────────────
 * Es la misma forma que en el resumen: kcal grandes, barra segmentada por macro e
 * iconos con los gramos. Repetir la forma es lo que hace que la app se lea como
 * una sola cosa, y a lo ancho de la tarjeta caben las tres etiquetas sin
 * comprimir nada.
 *
 * El anillo queda para las comidas y sus opciones, donde lo que se hace es
 * comparar varias piezas pequeñas entre sí.
 */
export const MacroTargetCard = ({
  plan,
  variant = 'default',
  title,
  editable = false,
  onSave,
  showSteps = true,
}) => {
  const targets = targetsFor(plan, variant);
  const macros = macroSplit(targets);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  const open = () => {
    setForm(
      Object.fromEntries([
        ...TARGET_FIELDS.map((key) => [key, targets[key] ?? '']),
        ['stepsGoal', plan?.stepsGoal ?? ''],
      ])
    );
    setEditing(true);
  };

  const commit = (event) => {
    event.preventDefault();
    const { stepsGoal, ...rest } = form;
    onSave({ ...rest, ...(showSteps ? { stepsGoal } : {}) });
    setEditing(false);
  };

  const kcals = targets.targetKcals ?? (macros.total > 0 ? Math.round(macros.total) : null);
  const derived = !targets.targetKcals && macros.total > 0;
  const mismatch =
    targets.targetKcals && macros.total > 0 && Math.abs(macros.total - targets.targetKcals) > 60;

  if (editing) {
    return (
      <form className="card col gap-4" onSubmit={commit}>
        <div className="row between wrap gap-2">
          <span className="section-title">{title || 'Objetivo diario'}</span>
          <div className="row gap-1">
            <button type="submit" className="btn btn-primary btn-sm">
              <Check size={14} /> Guardar
            </button>
            <button type="button" className="btn btn-icon" onClick={() => setEditing(false)} aria-label="Cancelar">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="grid-auto">
          {TARGET_FIELDS.map((key) => (
            <label className="field" key={key}>
              <span className="field-label">{LABELS[key]}</span>
              <input
                type="text"
                inputMode="decimal"
                className="input input-center"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>

        {showSteps && (
          <label className="field">
            <span className="field-label">Pasos diarios</span>
            <input
              className="input"
              value={form.stepsGoal}
              onChange={(e) => setForm({ ...form, stepsGoal: e.target.value })}
              placeholder="10000"
            />
          </label>
        )}
      </form>
    );
  }

  return (
    <article className="card col gap-4">
      <div className="row between wrap gap-2">
        <span className="section-label">{title || 'Objetivo diario'}</span>
        <div className="row gap-2">
          {showSteps && plan?.stepsGoal && (
            <span className="badge badge-info">
              <Footprints size={11} /> {plan.stepsGoal} pasos
            </span>
          )}
          {editable && (
            <button type="button" className="btn btn-icon" onClick={open} aria-label="Editar objetivo">
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      <MacroBar
        protein={targets.proteinGrams}
        carbs={targets.carbsGrams}
        fats={targets.fatsGrams}
        kcals={kcals}
        caption={derived ? 'calculadas a partir de los macros' : undefined}
      />

      {macros.total === 0 && (
        <p className="t-sm t-secondary">
          Sin macros configurados{editable ? ' — pulsa el lápiz para definirlos.' : '.'}
        </p>
      )}

      {mismatch && (
        <p className="t-xs" style={{ color: 'var(--warning)' }}>
          Los macros suman {Math.round(macros.total)} kcal,{' '}
          {macros.total > targets.targetKcals ? 'por encima' : 'por debajo'} del objetivo de{' '}
          {targets.targetKcals}.
        </p>
      )}
    </article>
  );
};
