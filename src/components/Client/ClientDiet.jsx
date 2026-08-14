import { useState } from 'react';
import { Sparkles, Utensils } from 'lucide-react';

import { dayKcalRange, dayKcals, dietNotes, mealsForVariant } from '@/domain/nutrition';
import { Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';
import { MealCard } from '@/components/nutrition/MealCard';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';

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

  /* Se normaliza al leer, no al guardar: hay planes con el formato viejo —una
     cadena por nota— y tienen que seguir viéndose. */
  const notas = dietNotes(plan?.habitsNotes);

  if (!plan) {
    return (
      <Panel>
        <p className="t-sm t-secondary">Tu entrenador aún no ha configurado tu plan nutricional.</p>
      </Panel>
    );
  }

  const variant = plan.hasDayVariants ? dietView : 'default';
  const meals = mealsForVariant(plan, variant);
  const total = dayKcals(meals);
  const range = dayKcalRange(meals);

  return (
    <div className="stack">
      {/*
        Con dos dietas, el selector va ARRIBA y manda también sobre el objetivo.
        Antes el objetivo mostraba siempre el de los días de entreno mientras el
        menú de abajo podía estar enseñando el de descanso: dos cifras que se
        contradecían en la misma pantalla.
      */}
      {plan.hasDayVariants && (
        <SegmentedControl
          value={dietView}
          onChange={setDietView}
          options={VARIANT_OPTIONS}
          label="Variante de dieta"
        />
      )}

      <MacroTargetCard
        plan={plan}
        variant={variant}
        title={plan.hasDayVariants ? `Mi objetivo · ${variant === 'rest' ? 'descanso' : 'entreno'}` : 'Mi objetivo diario'}
      />

      {plan.type === 'closed' && (
        <Panel className="col gap-4">
          <div className="row between wrap gap-3">
            <SectionTitle icon={Utensils} color="var(--accent)">
              Mi menú
            </SectionTitle>
            {meals.length > 0 && (
              <span className="meal-kcal">
                ~{Math.round(total)} kcal/día
                {range.min !== range.max && (
                  <span className="t-xs" style={{ opacity: 0.7, fontWeight: 600 }}>
                    {' '}
                    ({Math.round(range.min)}–{Math.round(range.max)})
                  </span>
                )}
              </span>
            )}
          </div>

          {meals.length === 0 ? (
            <p className="t-sm t-secondary">Tu entrenador aún no ha configurado el menú cerrado.</p>
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
          <p className="t-sm t-secondary">
            Tu plan es por macros: no hay un menú cerrado, sino los objetivos de arriba. Reparte los
            alimentos como quieras siempre que cuadres esas cifras al final del día.
          </p>
        </Panel>
      )}

      {/*
        Las pautas de su entrenador.

        Antes eran frases de una línea con un ✓ delante, y ese ✓ las convertía en
        una lista de normas. Ahora cada una puede llevar título y varios párrafos
        —«teniendo en cuenta tu patología…»— y por eso se pintan como texto y no
        como casillas: `pre-wrap` conserva los saltos de línea exactamente como
        los escribió, que es lo que hace que se lea como algo dirigido a ti.
      */}
      {notas.length > 0 && (
        <Panel className="col gap-3">
          <SectionTitle icon={Sparkles} color="var(--data-blue)">
            Pautas de tu entrenador
          </SectionTitle>
          {notas.map((note) => (
            <div className="card-inset col gap-1" key={note.id}>
              {note.title && (
                <span className="t-sm" style={{ fontWeight: 700 }}>
                  {note.title}
                </span>
              )}
              <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>
                {note.body}
              </p>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
};
