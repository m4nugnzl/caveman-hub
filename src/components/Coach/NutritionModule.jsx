import { useState } from 'react';
import { Beef, Droplet, Edit3, Flame, Footprints, Plus, Save, Sparkles, Trash2, Utensils, Wheat } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  MACRO_COLORS,
  dayKcalRange,
  dayKcals,
  emptyNutrition,
  macroSplit,
  mealsForVariant,
} from '@/domain/nutrition';
import { fmt } from '@/lib/num';
import {
  Field,
  Panel,
  SaveIndicator,
  SectionTitle,
  SegmentedControl,
  StatCard,
} from '@/components/ui/primitives';
import { MealCard } from '@/components/nutrition/MealCard';

const DIET_TYPES = [
  { id: 'macros', label: 'Por macros', tone: 'tone-coral' },
  { id: 'closed', label: 'Menú cerrado', tone: 'tone-coral' },
];

const VARIANT_OPTIONS = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso', tone: 'tone-cyan' },
];

const MACRO_FIELDS = [
  { key: 'targetKcals', label: 'Kcal', icon: Flame, color: 'var(--accent-coral)' },
  { key: 'proteinGrams', label: 'Proteína (g)', icon: Beef, color: 'var(--accent-emerald)' },
  { key: 'carbsGrams', label: 'Carbos (g)', icon: Wheat, color: 'var(--accent-cyan)' },
  { key: 'fatsGrams', label: 'Grasas (g)', icon: Droplet, color: 'var(--accent-amber)' },
];

export const NutritionModule = () => {
  const {
    activeClient,
    nutrition,
    foodLibrary,
    saveStatus,
    retrySave,
    updateNutrition,
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

  const [editingMacros, setEditingMacros] = useState(false);
  const [macroForm, setMacroForm] = useState(null);
  const [newNote, setNewNote] = useState('');

  const macros = macroSplit(plan);
  const dayTotal = dayKcals(meals);
  const dayRange = dayKcalRange(meals);

  const openMacroEditor = () => {
    setMacroForm({
      targetKcals: plan.targetKcals ?? '',
      proteinGrams: plan.proteinGrams ?? '',
      carbsGrams: plan.carbsGrams ?? '',
      fatsGrams: plan.fatsGrams ?? '',
      stepsGoal: plan.stepsGoal ?? '',
    });
    setEditingMacros(true);
  };

  const saveMacros = (event) => {
    event.preventDefault();
    updateNutrition(activeClient.id, macroForm);
    setEditingMacros(false);
  };

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
      <Panel className="row between wrap gap-4">
        <div className="row gap-4">
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #f8717130, #f8717110)',
              border: '1px solid #f8717140',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Utensils size={21} color="var(--accent-coral)" />
          </span>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              Plan nutricional de {activeClient.name}
            </h2>
            <p className="text-sm text-muted">Macros, menú cerrado por alimentos, pasos y hábitos.</p>
          </div>
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
      </Panel>

      <Panel className="col gap-4">
        <SectionTitle
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={editingMacros ? () => setEditingMacros(false) : openMacroEditor}>
              <Edit3 size={13} /> {editingMacros ? 'Cancelar' : 'Editar'}
            </button>
          }
        >
          Objetivo diario
        </SectionTitle>

        {editingMacros ? (
          <form className="col gap-4" onSubmit={saveMacros}>
            <div className="grid-auto">
              {MACRO_FIELDS.map(({ key, label, color }) => (
                <Field key={key} label={label}>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      inputMode="decimal"
                      className="input input-center"
                      style={{ borderColor: `${color}55`, color }}
                      value={macroForm[key]}
                      onChange={(e) => setMacroForm({ ...macroForm, [key]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>

            <Field label="Pasos diarios">
              {(props) => (
                <input
                  {...props}
                  className="input"
                  value={macroForm.stepsGoal}
                  onChange={(e) => setMacroForm({ ...macroForm, stepsGoal: e.target.value })}
                  placeholder="10000"
                />
              )}
            </Field>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              <Save size={15} /> Guardar objetivo
            </button>
          </form>
        ) : (
          <>
            <div className="grid-auto">
              {MACRO_FIELDS.map(({ key, label, icon: Icon, color }) => (
                <div className="stat stat-center" key={key} style={{ borderColor: `${color}35` }}>
                  <Icon size={17} color={color} />
                  <span className="stat-value" style={{ color, fontSize: '1.25rem' }}>
                    {fmt(plan[key], { dash: '—' })}
                  </span>
                  <span className="stat-label">{label}</span>
                </div>
              ))}
            </div>

            {macros.total > 0 && (
              <div className="macro-bar">
                <div style={{ width: `${macros.pct.protein}%`, background: MACRO_COLORS.protein }} />
                <div style={{ width: `${macros.pct.carbs}%`, background: MACRO_COLORS.carbs }} />
                <div style={{ width: `${macros.pct.fats}%`, background: MACRO_COLORS.fats }} />
              </div>
            )}

            {plan.stepsGoal && (
              <div className="panel-plain row gap-2 text-sm">
                <Footprints size={15} color="var(--accent-cyan)" />
                <strong>{plan.stepsGoal}</strong> pasos al día
              </div>
            )}
          </>
        )}
      </Panel>

      {plan.type === 'closed' && (
        <Panel className="col gap-4">
          <div className="row between wrap gap-3">
            <div>
              <h3 className="section-title">Menú estructurado</h3>
              <p className="text-sm text-muted">
                {meals.length === 0
                  ? 'Sin comidas todavía.'
                  : `${Math.round(dayTotal)} kcal/día con la primera opción de cada comida` +
                    (dayRange.min !== dayRange.max
                      ? ` · entre ${Math.round(dayRange.min)} y ${Math.round(dayRange.max)} según las opciones elegidas`
                      : '')}
              </p>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(plan.hasDayVariants)}
                onChange={(e) => setHasDayVariants(activeClient.id, e.target.checked)}
              />
              Dos dietas (entreno / descanso)
            </label>
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
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => addMeal(activeClient.id, variant)}
            >
              <Plus size={15} /> Añadir comida
            </button>
          </div>
        </Panel>
      )}

      <Panel className="col gap-4">
        <SectionTitle icon={Sparkles} color="var(--accent-coral)">
          Hábitos y recomendaciones
        </SectionTitle>

        <div className="col gap-2">
          {(plan.habitsNotes || []).map((note, index) => (
            <div className="panel-plain row between gap-2 text-sm" key={`${note}-${index}`}>
              <span>
                <span style={{ color: 'var(--accent-emerald)', marginRight: 8 }}>✓</span>
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
                aria-label={`Eliminar la recomendación «${note}»`}
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
              placeholder="Añadir recomendación de hábito…"
              aria-label="Nueva recomendación"
            />
            <button type="button" className="btn btn-secondary" onClick={addNote} disabled={!newNote.trim()}>
              <Plus size={14} /> Añadir
            </button>
          </div>
        </div>
      </Panel>

      {plan.type === 'closed' && meals.length > 0 && (
        <div className="grid-auto">
          <StatCard label="Comidas" value={meals.length} />
          <StatCard label="Kcal de referencia" value={Math.round(dayTotal)} color="var(--accent-amber)" />
          <StatCard
            label="Rango según opciones"
            value={`${Math.round(dayRange.min)}–${Math.round(dayRange.max)}`}
            color="var(--accent-cyan)"
          />
        </div>
      )}
    </div>
  );
};
