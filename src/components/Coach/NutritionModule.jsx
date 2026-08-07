import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Utensils, Plus, Trash2, Save, Edit3, X, Flame, Beef, Wheat, Droplet, Footprints, Sparkles } from 'lucide-react';

// Chip de un alimento dentro de una opción: nombre + gramos editable + kcal
// calculada sola. Sustituye al antiguo campo de texto libre "150g pechuga +
// 80g arroz..." — cada alimento es ahora una unidad independiente con sus
// propios macros por 100g, así que las kcal/macros salen solas.
const FoodBox = ({ food, macros, onGramsChange, onRemove }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14, padding: '8px 10px 8px 14px',
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{food.name}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>
        P {macros.protein.toFixed(0)}g · C {macros.carbs.toFixed(0)}g · G {macros.fats.toFixed(0)}g
      </div>
    </div>
    <input
      type="number" value={food.grams}
      onChange={(e) => onGramsChange(Number(e.target.value) || 0)}
      style={{ width: 52, background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '5px 4px', borderRadius: 8, fontSize: '0.78rem', textAlign: 'center', fontWeight: 700 }}
    />
    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>g</span>
    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-amber)', minWidth: 46, textAlign: 'right' }}>{Math.round(macros.kcal)}</span>
    <button onClick={onRemove} style={{ background: 'none', color: '#f43f5e', opacity: 0.6, cursor: 'pointer', flexShrink: 0 }}>
      <X size={14} />
    </button>
  </div>
);

// Buscador + alta rápida de alimento — autocompleta desde la biblioteca del
// coach (macros por 100g ya guardados) o permite dar de alta uno nuevo al
// vuelo con sus macros, que queda guardado para la próxima vez.
const AddFoodControl = ({ foodLibrary, onAdd }) => {
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFood, setNewFood] = useState({ name: '', proteinPer100: '', carbsPer100: '', fatsPer100: '' });

  const matches = query.trim()
    ? foodLibrary.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  const handlePick = (food) => {
    onAdd(food, 100);
    setQuery('');
  };

  const handleCreate = () => {
    if (!newFood.name.trim()) return;
    onAdd(newFood, 100);
    setNewFood({ name: '', proteinPer100: '', carbsPer100: '', fatsPer100: '' });
    setShowNewForm(false);
    setQuery('');
  };

  return (
    <div>
      {!showNewForm ? (
        <div style={{ position: 'relative' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar o añadir alimento…"
            style={{ width: '100%', background: '#0f172a', border: '1px dashed rgba(255,255,255,0.15)', color: '#fff', padding: '9px 12px', borderRadius: 12, fontSize: '0.82rem' }}
          />
          {query.trim() && (
            <div style={{ position: 'relative', marginTop: 6, background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
              {matches.map((f) => (
                <div
                  key={f.id}
                  onClick={() => handlePick(f)}
                  style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <span>{f.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>P{f.proteinPer100} C{f.carbsPer100} G{f.fatsPer100} /100g</span>
                </div>
              ))}
              <div
                onClick={() => setShowNewForm(true)}
                style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--accent-emerald)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} /> Crear "{query.trim()}" como alimento nuevo
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: '#0f172a', padding: 10, borderRadius: 12, border: '1px solid var(--border-color)' }}>
          <input
            value={newFood.name || query}
            onChange={(e) => setNewFood({ ...newFood, name: e.target.value })}
            placeholder="Nombre del alimento"
            style={{ flex: '1 1 140px', background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: '0.8rem' }}
          />
          {[
            { key: 'proteinPer100', label: 'P/100g' },
            { key: 'carbsPer100', label: 'C/100g' },
            { key: 'fatsPer100', label: 'G/100g' },
          ].map(({ key, label }) => (
            <input
              key={key}
              type="number" placeholder={label}
              value={newFood[key]}
              onChange={(e) => setNewFood({ ...newFood, [key]: e.target.value })}
              style={{ width: 62, background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', padding: '6px 4px', borderRadius: 8, fontSize: '0.75rem', textAlign: 'center' }}
            />
          ))}
          <button className="btn-primary" style={{ fontSize: '0.75rem', padding: '6px 10px' }} onClick={handleCreate}>Añadir</button>
          <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 10px' }} onClick={() => setShowNewForm(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
};

export const NutritionModule = () => {
  const {
    activeClient, nutrition, updateNutrition, setHasDayVariants, updateMealName, addMeal, removeMeal,
    addMealOption, removeMealOption, addFoodToOption, removeFoodFromOption, updateFoodGrams,
    calcOptionKcals, calcOptionMacros, foodLibrary, upsertLibraryFood,
  } = useApp();

  const nut = nutrition[activeClient.id] || {
    type: 'macros', targetKcals: 0, proteinGrams: 0, carbsGrams: 0, fatsGrams: 0,
    stepsGoal: '', habitsNotes: [], hasDayVariants: false,
    closedMeals: [], closedMealsTraining: [], closedMealsRest: [],
  };

  const [dietView, setDietView] = useState('training');
  const variant = nut.hasDayVariants ? dietView : 'default';
  const meals = variant === 'training' ? nut.closedMealsTraining : variant === 'rest' ? nut.closedMealsRest : nut.closedMeals;

  const [editingMacros, setEditingMacros] = useState(false);
  const [macrosForm, setMacrosForm] = useState({
    targetKcals: nut.targetKcals, proteinGrams: nut.proteinGrams, carbsGrams: nut.carbsGrams,
    fatsGrams: nut.fatsGrams, stepsGoal: nut.stepsGoal,
  });
  const [newNote, setNewNote] = useState('');
  const [editingMealIdx, setEditingMealIdx] = useState(null);

  const handleSaveMacros = () => {
    updateNutrition(activeClient.id, { ...macrosForm });
    setEditingMacros(false);
  };
  const handleAddNote = () => {
    if (!newNote.trim()) return;
    updateNutrition(activeClient.id, { habitsNotes: [...(nut.habitsNotes || []), newNote] });
    setNewNote('');
  };
  const handleRemoveNote = (idx) => {
    const notes = [...(nut.habitsNotes || [])];
    notes.splice(idx, 1);
    updateNutrition(activeClient.id, { habitsNotes: notes });
  };

  // Al elegir/crear un alimento se guarda también en la biblioteca del coach
  // (si no existía ya) para que la próxima vez salga en el autocompletado.
  const handleAddFood = (mealIdx, optIdx, food) => {
    upsertLibraryFood(food.name, food.proteinPer100, food.carbsPer100, food.fatsPer100);
    addFoodToOption(activeClient.id, variant, mealIdx, optIdx, food, 100);
  };

  const proteinKcals = (nut.proteinGrams || 0) * 4;
  const carbsKcals = (nut.carbsGrams || 0) * 4;
  const fatsKcals = (nut.fatsGrams || 0) * 9;
  const totalKcals = proteinKcals + carbsKcals + fatsKcals;

  const dayTotalKcal = (meals || []).reduce((sum, meal) => sum + Math.max(0, ...meal.options.map(calcOptionKcals), 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── HEADER + DIET TYPE SWITCHER ── */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 16, background: 'linear-gradient(135deg, #f8717130, #f8717110)', border: '1px solid #f8717140', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Utensils size={22} color="#f87171" />
          </div>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>Plan Nutricional de {activeClient.name}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Macros, menú cerrado por alimentos, pasos y hábitos.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 14 }}>
          <button
            onClick={() => updateNutrition(activeClient.id, { type: 'macros' })}
            style={{ padding: '9px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.82rem', border: 'none', cursor: 'pointer', background: nut.type === 'macros' ? '#f87171' : 'transparent', color: nut.type === 'macros' ? '#fff' : 'var(--text-muted)' }}
          >
            🔥 Por Macros
          </button>
          <button
            onClick={() => updateNutrition(activeClient.id, { type: 'closed' })}
            style={{ padding: '9px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.82rem', border: 'none', cursor: 'pointer', background: nut.type === 'closed' ? '#f87171' : 'transparent', color: nut.type === 'closed' ? '#fff' : 'var(--text-muted)' }}
          >
            📋 Menú Cerrado
          </button>
        </div>
      </div>

      {/* ── MACROS SECTION ── */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: '#fff' }}>Objetivo diario</h3>
          <button
            onClick={() => { setEditingMacros(!editingMacros); setMacrosForm({ targetKcals: nut.targetKcals, proteinGrams: nut.proteinGrams, carbsGrams: nut.carbsGrams, fatsGrams: nut.fatsGrams, stepsGoal: nut.stepsGoal }); }}
            className="btn-secondary" style={{ fontSize: '0.78rem', borderRadius: 12 }}
          >
            <Edit3 size={13} /> {editingMacros ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editingMacros ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              {[
                { label: 'Kcal', key: 'targetKcals', color: '#f87171' },
                { label: 'Proteína (g)', key: 'proteinGrams', color: 'var(--accent-emerald)' },
                { label: 'Carbos (g)', key: 'carbsGrams', color: 'var(--accent-cyan)' },
                { label: 'Grasas (g)', key: 'fatsGrams', color: 'var(--accent-amber)' },
              ].map(({ label, key, color }) => (
                <div key={key}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    type="text" inputMode="numeric"
                    value={macrosForm[key]}
                    onChange={(e) => setMacrosForm({ ...macrosForm, [key]: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: `1px solid ${color}40`, color, fontWeight: 800, padding: '12px', borderRadius: 12, fontSize: '1.05rem', textAlign: 'center' }}
                  />
                </div>
              ))}
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Pasos diarios</label>
              <input
                value={macrosForm.stepsGoal}
                onChange={(e) => setMacrosForm({ ...macrosForm, stepsGoal: e.target.value })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '10px', borderRadius: 12, fontSize: '0.88rem' }}
              />
            </div>
            <button className="btn-primary" style={{ alignSelf: 'flex-end', borderRadius: 12 }} onClick={handleSaveMacros}><Save size={15} /> Guardar</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.9rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'KCAL', value: nut.targetKcals || '—', icon: Flame, color: '#f87171' },
                { label: 'PROTEÍNA', value: `${nut.proteinGrams || 0}g`, icon: Beef, color: 'var(--accent-emerald)' },
                { label: 'CARBOS', value: `${nut.carbsGrams || 0}g`, icon: Wheat, color: 'var(--accent-cyan)' },
                { label: 'GRASAS', value: `${nut.fatsGrams || 0}g`, icon: Droplet, color: 'var(--accent-amber)' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', padding: '1.1rem 0.75rem', borderRadius: 16, textAlign: 'center', border: `1px solid ${color}25` }}>
                  <Icon size={18} color={color} style={{ marginBottom: 6 }} />
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color }}>{value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.5 }}>{label}</div>
                </div>
              ))}
            </div>
            {totalKcals > 0 && (
              <div style={{ display: 'flex', height: 10, borderRadius: 20, overflow: 'hidden', gap: 2 }}>
                <div style={{ flex: proteinKcals || 0.001, background: 'var(--accent-emerald)' }} />
                <div style={{ flex: carbsKcals || 0.001, background: 'var(--accent-cyan)' }} />
                <div style={{ flex: fatsKcals || 0.001, background: 'var(--accent-amber)' }} />
              </div>
            )}
            {nut.stepsGoal && (
              <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                <Footprints size={15} color="var(--accent-cyan)" /> <strong>{nut.stepsGoal}</strong> pasos/día
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DIETA CERRADA: comidas con alimentos como boxes, macros/kcal
            calculados solos, y variante entreno/descanso opcional ── */}
      {nut.type === 'closed' && (
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>📋 Menú Estructurado</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>~{Math.round(dayTotalKcal)} kcal/día con la primera opción de cada comida</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!nut.hasDayVariants} onChange={(e) => setHasDayVariants(activeClient.id, e.target.checked)} />
              Dos dietas (entreno / descanso)
            </label>
          </div>

          {nut.hasDayVariants && (
            <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem', background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 14, width: 'fit-content' }}>
              <button onClick={() => setDietView('training')} style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', border: 'none', cursor: 'pointer', background: dietView === 'training' ? 'var(--accent-emerald)' : 'transparent', color: dietView === 'training' ? '#000' : 'var(--text-muted)' }}>
                Días de Entreno
              </button>
              <button onClick={() => setDietView('rest')} style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', border: 'none', cursor: 'pointer', background: dietView === 'rest' ? 'var(--accent-cyan)' : 'transparent', color: dietView === 'rest' ? '#000' : 'var(--text-muted)' }}>
                Días de Descanso
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(meals || []).map((meal, idx) => {
              const mealBestKcal = Math.max(0, ...meal.options.map(calcOptionKcals), 0);
              return (
                <div key={meal.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 20, padding: '1.1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
                    {editingMealIdx === idx ? (
                      <input
                        autoFocus value={meal.name}
                        onChange={(e) => updateMealName(activeClient.id, variant, idx, e.target.value)}
                        onBlur={() => setEditingMealIdx(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingMealIdx(null)}
                        style={{ background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', fontWeight: 800, padding: '6px 10px', borderRadius: 8, fontSize: '0.95rem', flex: 1 }}
                      />
                    ) : (
                      <div onClick={() => setEditingMealIdx(idx)} style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {meal.name} <Edit3 size={12} style={{ opacity: 0.4 }} />
                      </div>
                    )}
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-amber)', flexShrink: 0, background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: 20 }}>
                      ~{mealBestKcal} kcal
                    </span>
                    <button onClick={() => removeMeal(activeClient.id, variant, idx)} style={{ background: 'none', color: '#f43f5e', opacity: 0.6, cursor: 'pointer' }}><Trash2 size={15} /></button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {meal.options.map((opt, optIdx) => {
                      const optMacros = calcOptionMacros(opt);
                      return (
                        <div key={opt.id} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 16, padding: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Opción {optIdx + 1}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                P{optMacros.protein.toFixed(0)} · C{optMacros.carbs.toFixed(0)} · G{optMacros.fats.toFixed(0)}
                              </span>
                              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-amber)' }}>{Math.round(optMacros.kcal)} kcal</span>
                              <button
                                onClick={() => removeMealOption(activeClient.id, variant, idx, optIdx)}
                                disabled={meal.options.length <= 1}
                                style={{ background: 'none', color: meal.options.length <= 1 ? '#334155' : '#f43f5e', cursor: meal.options.length <= 1 ? 'default' : 'pointer', opacity: 0.7 }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                            {(opt.foods || []).map((food) => (
                              <FoodBox
                                key={food.id}
                                food={food}
                                macros={{ protein: (food.proteinPer100 * food.grams) / 100, carbs: (food.carbsPer100 * food.grams) / 100, fats: (food.fatsPer100 * food.grams) / 100, kcal: ((food.proteinPer100 * 4 + food.carbsPer100 * 4 + food.fatsPer100 * 9) * food.grams) / 100 }}
                                onGramsChange={(grams) => updateFoodGrams(activeClient.id, variant, idx, optIdx, food.id, grams)}
                                onRemove={() => removeFoodFromOption(activeClient.id, variant, idx, optIdx, food.id)}
                              />
                            ))}
                            {(!opt.foods || opt.foods.length === 0) && (
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Sin alimentos todavía.</p>
                            )}
                          </div>

                          <AddFoodControl foodLibrary={foodLibrary} onAdd={(food, grams) => handleAddFood(idx, optIdx, food, grams)} />
                        </div>
                      );
                    })}
                    <button
                      onClick={() => addMealOption(activeClient.id, variant, idx)}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', alignSelf: 'flex-start', borderRadius: 10 }}
                    >
                      <Plus size={13} /> Opción alternativa
                    </button>
                  </div>
                </div>
              );
            })}
            <button className="btn-primary" onClick={() => addMeal(activeClient.id, variant)} style={{ fontSize: '0.85rem', alignSelf: 'flex-start', borderRadius: 12 }}>
              <Plus size={15} /> Añadir Comida
            </button>
            {(!meals || meals.length === 0) && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin comidas todavía — pulsa "Añadir Comida" para empezar.</p>
            )}
          </div>
        </div>
      )}

      {/* ── HABITS & LIFESTYLE NOTES ── */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 24 }}>
        <h4 style={{ fontWeight: 800, fontSize: '0.95rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="#f87171" /> Hábitos y recomendaciones
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(nut.habitsNotes || []).map((note, idx) => (
            <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span><span style={{ color: 'var(--accent-emerald)', marginRight: 8 }}>✓</span>{note}</span>
              <button onClick={() => handleRemoveNote(idx)} style={{ background: 'none', color: '#f43f5e', cursor: 'pointer', opacity: 0.6, flexShrink: 0 }}><Trash2 size={13} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Añadir recomendación de hábito…"
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', color: '#fff', padding: '9px 12px', borderRadius: 12, fontSize: '0.85rem' }}
            />
            <button className="btn-secondary" onClick={handleAddNote} style={{ fontSize: '0.82rem', borderRadius: 12 }}><Plus size={14} /> Añadir</button>
          </div>
        </div>
      </div>
    </div>
  );
};
