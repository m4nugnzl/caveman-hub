import { useState } from 'react';
import { Plus, Salad, Sparkles, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { dayKcalRange, dayKcals, emptyNutrition, mealsForVariant } from '@/domain/nutrition';
import { Panel, SaveIndicator, SegmentedControl } from '@/components/ui/primitives';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';

const DIET_TYPES = [
  { id: 'macros', label: 'Por macros' },
  { id: 'closed', label: 'Menú cerrado' },
];

const VARIANT_OPTIONS = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso' },
];

export const NutritionModule = () => {
  const {
    activeClient,
    nutrition,
    foodLibrary,
    saveStatus,
    retrySave,
    updateNutrition,
    updateNutritionTargets,
    setHasDayVariants,
    addMeal,
    removeMeal,
    updateMealName,
    addMealOption,
    removeMealOption,
    addFoodToOption,
    removeFoodFromOption,
    updateFoodGrams,
    upsertLibraryFood,
  } = useApp();

  const plan = nutrition[activeClient.id] || emptyNutrition();
  const save = saveStatus('nutrition', activeClient.id);

  const [dietView, setDietView] = useState('training');
  const variant = plan.hasDayVariants ? dietView : 'default';
  const meals = mealsForVariant(plan, variant);

  const [newNote, setNewNote] = useState('');

  const dayTotal = dayKcals(meals);
  const dayRange = dayKcalRange(meals);

  const addNote = () => {
    const note = newNote.trim();
    if (!note) return;
    updateNutrition(activeClient.id, { habitsNotes: [...(plan.habitsNotes || []), note] });
    setNewNote('');
  };

  /** Al elegir o crear un alimento se guarda también en la biblioteca del coach. */
  const handleAddFood = (mealIndex, optIndex, food) => {
    upsertLibraryFood(food);
    addFoodToOption(activeClient.id, variant, mealIndex, optIndex, food, 100);
  };

  return (
    <div className="stack">
      <section className="col gap-4">
        <div className="section-head">
          <div>
            <h2>Plan nutricional</h2>
            <p>Objetivo, menú cerrado por alimentos y hábitos de {activeClient.name}.</p>
          </div>
          <div className="row gap-3 wrap">
            <SaveIndicator
              status={save.status}
              error={save.error}
              onRetry={() => retrySave('nutrition', activeClient.id)}
            />
            <SegmentedControl
              value={plan.type}
              onChange={(type) => updateNutrition(activeClient.id, { type })}
              options={DIET_TYPES}
              label="Tipo de dieta"
            />
          </div>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(plan.hasDayVariants)}
            onChange={(e) => setHasDayVariants(activeClient.id, e.target.checked)}
          />
          Dos dietas distintas para días de entreno y de descanso
        </label>

        {/*
          Con variantes activas hay DOS objetivos, no uno: activar la opción
          implica que las calorías y el reparto de macros cambian entre un día de
          entreno y uno de descanso, que es justo el motivo de separarlos.
        */}
        {plan.hasDayVariants ? (
          <div className="grid-2">
            <MacroTargetCard
              plan={plan}
              variant="training"
              title="Objetivo · días de entreno"
              editable
              onSave={(fields) => updateNutritionTargets(activeClient.id, 'training', fields)}
            />
            <MacroTargetCard
              plan={plan}
              variant="rest"
              title="Objetivo · días de descanso"
              editable
              showSteps={false}
              onSave={(fields) => updateNutritionTargets(activeClient.id, 'rest', fields)}
            />
          </div>
        ) : (
          <MacroTargetCard
            plan={plan}
            variant="default"
            title="Objetivo diario"
            editable
            onSave={(fields) => updateNutritionTargets(activeClient.id, 'default', fields)}
          />
        )}
      </section>

      {plan.type === 'closed' && (
        <section className="col gap-4">
          <div className="section-head">
            <div>
              <h2>Menú estructurado</h2>
              <p>
                {meals.length === 0
                  ? 'Sin comidas todavía.'
                  : `${Math.round(dayTotal)} kcal/día con la primera opción de cada comida` +
                    (dayRange.min !== dayRange.max
                      ? ` · entre ${Math.round(dayRange.min)} y ${Math.round(dayRange.max)} según las opciones`
                      : '')}
              </p>
            </div>
          </div>

          {plan.hasDayVariants && (
            <SegmentedControl
              value={dietView}
              onChange={setDietView}
              options={VARIANT_OPTIONS}
              label="Variante de dieta"
            />
          )}

          <div className="col gap-4">
            {meals.map((meal, mealIndex) => (
              <MealCard
                key={meal.id}
                meal={meal}
                editable
                foodLibrary={foodLibrary}
                onRenameMeal={(name) => updateMealName(activeClient.id, variant, mealIndex, name)}
                onRemoveMeal={() => removeMeal(activeClient.id, variant, mealIndex)}
                onAddOption={() => addMealOption(activeClient.id, variant, mealIndex)}
                onRemoveOption={(optIndex) => removeMealOption(activeClient.id, variant, mealIndex, optIndex)}
                onAddFood={(optIndex, food) => handleAddFood(mealIndex, optIndex, food)}
                onRemoveFood={(optIndex, foodId) =>
                  removeFoodFromOption(activeClient.id, variant, mealIndex, optIndex, foodId)
                }
                onGrams={(optIndex, foodId, grams) =>
                  updateFoodGrams(activeClient.id, variant, mealIndex, optIndex, foodId, grams)
                }
              />
            ))}

            <button
              type="button"
              className="btn btn-tinted"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => addMeal(activeClient.id, variant)}
            >
              <Plus size={15} /> Añadir comida
            </button>
          </div>
        </section>
      )}

      {plan.type === 'macros' && (
        <Panel tight>
          <p className="t-sm t-secondary">
            <Salad size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
            Plan por macros: el cliente reparte los alimentos como quiera mientras cuadre las cifras del
            objetivo. Cambia a «Menú cerrado» si prefieres detallar las comidas.
          </p>
        </Panel>
      )}

      <section className="col gap-4">
        <div className="section-head">
          <div>
            <h2>Hábitos y recomendaciones</h2>
            <p>Notas que el cliente ve en su plan.</p>
          </div>
        </div>

        <Panel tight className="col gap-3">
          {(plan.habitsNotes || []).map((note, index) => (
            <div className="row between gap-2 t-sm" key={`${note}-${index}`}>
              <span className="row gap-2">
                <Sparkles size={13} color="var(--accent)" />
                {note}
              </span>
              <button
                type="button"
                className="btn btn-icon btn-icon-danger"
                onClick={() =>
                  updateNutrition(activeClient.id, {
                    habitsNotes: plan.habitsNotes.filter((_, i) => i !== index),
                  })
                }
                aria-label={`Eliminar «${note}»`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <div className="row gap-2">
            <input
              className="input grow"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNote();
                }
              }}
              placeholder="Añadir recomendación…"
              aria-label="Nueva recomendación"
            />
            <button type="button" className="btn btn-secondary" onClick={addNote} disabled={!newNote.trim()}>
              <Plus size={14} /> Añadir
            </button>
          </div>
        </Panel>
      </section>
    </div>
  );
};
