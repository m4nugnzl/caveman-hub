import { LayoutList } from 'lucide-react';

import { mealTarget, mealTargetsTotal } from '@/domain/nutrition';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * El reparto del día entre las comidas, ANTES de llenarlas.
 *
 * ══ Por qué esto va aquí arriba ═════════════════════════════════════════════
 *
 * Montar una dieta cerrada empieza siempre igual: 2400 kcal repartidas en cinco
 * comidas. Pero la aplicación solo conocía el total del día, así que ese reparto
 * —que es la PRIMERA decisión que se toma— vivía en la cabeza del entrenador
 * mientras iba metiendo alimentos, y solo se sabía si había acertado al sumar el
 * día entero al final. Cuadrar la última comida por descarte es rehacer las
 * cuatro anteriores.
 *
 * Repartiendo primero, cada comida es un problema pequeño y cerrado: «aquí me
 * caben 520 kcal y 40 g de proteína». Y cada tarjeta de comida enseña ese número
 * mientras la llenas.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 * No obliga a nada. Una comida sin objetivo funciona igual que siempre; el
 * reparto es una ayuda para quien lo quiera, no un paso más del formulario.
 */
const CAMPOS = [
  { key: 'kcals', label: 'kcal', width: 62 },
  { key: 'protein', label: 'P', width: 46 },
  { key: 'carbs', label: 'C', width: 46 },
  { key: 'fats', label: 'G', width: 46 },
];

export const MealStructure = ({ meals, dayTarget, onChange }) => {
  if (meals.length === 0) return null;

  const total = mealTargetsTotal(meals, dayTarget);
  const hayObjetivo = total.meals > 0;

  return (
    <Panel className="col gap-3">
      <div className="row between wrap gap-2">
        <SectionTitle icon={LayoutList}>Estructura del día</SectionTitle>
        {hayObjetivo && (
          <span className="row gap-2 wrap t-sm">
            <span className="t-secondary">
              Repartidas <strong>{total.kcals}</strong> kcal
            </span>
            {/*
              Lo que queda del objetivo del día. Puede salir en negativo a
              propósito: pasarse es información, y esconderlo con un `Math.max`
              sería enseñar una cifra falsa justo en la que se toma la decisión.
            */}
            {total.left !== null && (
              <span
                className={`badge ${total.left === 0 ? 'badge-ok' : total.left < 0 ? 'badge-bad' : ''}`}
              >
                {total.left === 0
                  ? 'cuadra'
                  : total.left > 0
                    ? `quedan ${total.left}`
                    : `te pasas ${Math.abs(total.left)}`}
              </span>
            )}
          </span>
        )}
      </div>

      <p className="t-sm t-secondary">
        Reparte primero las calorías entre las comidas y luego llénalas. Cada comida te irá diciendo
        cuánto le queda. Lo que dejes en blanco no se te pedirá.
      </p>

      <div className="col gap-2">
        <div className="row gap-2 t-2xs t-tertiary">
          <span className="grow">Comida</span>
          {CAMPOS.map((campo) => (
            <span key={campo.key} style={{ width: campo.width, textAlign: 'center' }}>
              {campo.label}
            </span>
          ))}
        </div>

        {meals.map((meal, index) => {
          const target = mealTarget(meal) || {};
          return (
            <div className="card-inset row gap-2" key={meal.id}>
              <span className="grow t-sm" style={{ fontWeight: 600, minWidth: 0 }}>
                {meal.name}
              </span>
              {CAMPOS.map((campo) => (
                <input
                  key={campo.key}
                  type="text"
                  inputMode="numeric"
                  className="input input-sm input-center"
                  style={{ width: campo.width }}
                  placeholder="—"
                  value={meal.target?.[campo.key] ?? ''}
                  onChange={(e) => onChange(index, campo.key, e.target.value)}
                  aria-label={`${campo.label} objetivo de ${meal.name}`}
                  title={target[campo.key] ? undefined : `Sin objetivo de ${campo.label}`}
                />
              ))}
            </div>
          );
        })}
      </div>
    </Panel>
  );
};
