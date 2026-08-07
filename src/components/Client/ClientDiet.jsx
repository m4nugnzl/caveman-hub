import { useState } from 'react';
import { Sparkles, Utensils } from 'lucide-react';

import { dayKcalRange, dayKcals, mealsForVariant } from '@/domain/nutrition';
import { Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';
import { MealCard } from '@/components/nutrition/MealCard';
import { NutritionHeadline } from '@/components/dashboard/NutritionHeadline';

const VARIANT_OPTIONS = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso', tone: 'tone-cyan' },
];

/**
 * Dieta del cliente, en modo lectura.
 *
 * Reutiliza el bloque de objetivo del panel y las mismas tarjetas de comida que
 * usa el entrenador. Antes había dos renderizados distintos del mismo dato —con
 * aspecto y estructura diferentes— y el del cliente era el peor de los dos.
 */
export const ClientDiet = ({ plan }) => {
  const [dietView, setDietView] = useState('training');

  if (!plan) {
    return (
      <Panel>
        <p className="text-sm text-muted">Tu entrenador aún no ha configurado tu plan nutricional.</p>
      </Panel>
    );
  }

  const variant = plan.hasDayVariants ? dietView : 'default';
  const meals = mealsForVariant(plan, variant);
  const total = dayKcals(meals);
  const range = dayKcalRange(meals);

  return (
    <div className="stack">
      <NutritionHeadline plan={plan} />

      {plan.type === 'closed' && (
        <Panel className="col gap-4">
          <div className="row between wrap gap-3">
            <SectionTitle icon={Utensils} color="var(--accent-emerald)">
              Mi menú
            </SectionTitle>
            {meals.length > 0 && (
              <span className="meal-card-kcal">
                ~{Math.round(total)} kcal/día
                {range.min !== range.max && (
                  <span className="text-xs" style={{ opacity: 0.7, fontWeight: 600 }}>
                    {' '}
                    ({Math.round(range.min)}–{Math.round(range.max)})
                  </span>
                )}
              </span>
            )}
          </div>

          {plan.hasDayVariants && (
            <SegmentedControl
              value={dietView}
              onChange={setDietView}
              options={VARIANT_OPTIONS}
              label="Variante de dieta"
            />
          )}

          {meals.length === 0 ? (
            <p className="text-sm text-muted">Tu entrenador aún no ha configurado el menú cerrado.</p>
          ) : (
            <div className="col gap-4">
              {meals.map((meal) => (
                <MealCard key={meal.id} meal={meal} editable={false} />
              ))}
            </div>
          )}
        </Panel>
      )}

      {plan.type === 'macros' && (
        <Panel>
          <p className="text-sm text-muted">
            Tu plan es por macros: no hay un menú cerrado, sino los objetivos de arriba. Reparte los
            alimentos como quieras siempre que cuadres esas cifras al final del día.
          </p>
        </Panel>
      )}

      {plan.habitsNotes?.length > 0 && (
        <Panel className="col gap-3">
          <SectionTitle icon={Sparkles} color="var(--accent-cyan)">
            Recomendaciones de tu entrenador
          </SectionTitle>
          {plan.habitsNotes.map((note, index) => (
            <div className="panel-plain text-sm" key={`${note}-${index}`}>
              <span style={{ color: 'var(--accent-emerald)', marginRight: 8 }}>✓</span>
              {note}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
};
