import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Utensils, Plus, Trash2, Save, Edit3, CheckCircle2 } from 'lucide-react';

export const NutritionModule = () => {
  const { activeClient, nutrition, updateNutrition, updateMeal, addMeal, removeMeal } = useApp();

  const nut = nutrition[activeClient.id] || {
    type: 'macros', targetKcals: 0, proteinGrams: 0, carbsGrams: 0, fatsGrams: 0,
    stepsGoal: '', habitsNotes: [], closedMeals: [],
  };

  const [editingMacros, setEditingMacros] = useState(false);
  const [macrosForm, setMacrosForm] = useState({
    targetKcals: nut.targetKcals,
    proteinGrams: nut.proteinGrams,
    carbsGrams: nut.carbsGrams,
    fatsGrams: nut.fatsGrams,
    stepsGoal: nut.stepsGoal,
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

  const proteinKcals = nut.proteinGrams * 4;
  const carbsKcals = nut.carbsGrams * 4;
  const fatsKcals = nut.fatsGrams * 9;
  const totalKcals = proteinKcals + carbsKcals + fatsKcals;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── DIET TYPE SWITCHER ── */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Utensils size={20} color="#f87171" /> Plan Nutricional de {activeClient.name}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>Configura macros, menú cerrado, pasos y recomendaciones de hábitos.</p>
        </div>
        <div className="role-switcher">
          <button
            className={`role-btn ${nut.type === 'macros' ? 'active' : ''}`}
            onClick={() => updateNutrition(activeClient.id, { type: 'macros' })}
          >
            🔥 Dieta por Macros
          </button>
          <button
            className={`role-btn ${nut.type === 'closed' ? 'active' : ''}`}
            onClick={() => updateNutrition(activeClient.id, { type: 'closed' })}
          >
            📋 Menú Cerrado
          </button>
        </div>
      </div>

      {/* ── MACROS SECTION ── */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ background: '#f87171', color: '#fff', padding: '10px 16px', borderRadius: 8, fontWeight: 900, fontSize: '1.05rem', letterSpacing: 1, textTransform: 'uppercase', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>DIETA {nut.type === 'macros' ? 'POR MACRONUTRIENTES' : 'CERRADA (MENÚ)'}</span>
          <button
            onClick={() => { setEditingMacros(!editingMacros); setMacrosForm({ targetKcals: nut.targetKcals, proteinGrams: nut.proteinGrams, carbsGrams: nut.carbsGrams, fatsGrams: nut.fatsGrams, stepsGoal: nut.stepsGoal }); }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
          >
            <Edit3 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {editingMacros ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {editingMacros ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              {[
                { label: 'Calorías Totales (kcal)', key: 'targetKcals', color: '#f87171' },
                { label: 'Proteínas (g)', key: 'proteinGrams', color: 'var(--accent-emerald)' },
                { label: 'Carbohidratos (g)', key: 'carbsGrams', color: 'var(--accent-cyan)' },
                { label: 'Grasas (g)', key: 'fatsGrams', color: 'var(--accent-amber)' },
              ].map(({ label, key, color }) => (
                <div key={key}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    type="number"
                    value={macrosForm[key]}
                    onChange={(e) => setMacrosForm({ ...macrosForm, [key]: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: `1px solid ${color}40`, color: color, fontWeight: 800, padding: '12px', borderRadius: 8, fontSize: '1.1rem', textAlign: 'center' }}
                  />
                </div>
              ))}
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Objetivo de Pasos Diarios</label>
              <input
                value={macrosForm.stepsGoal}
                onChange={(e) => setMacrosForm({ ...macrosForm, stepsGoal: e.target.value })}
                style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '10px', borderRadius: 8, fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={handleSaveMacros}><Save size={15} /> Guardar</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'CALORÍAS', value: `${nut.targetKcals} kcal`, color: '#f87171' },
                { label: 'PROTEÍNAS', value: `${nut.proteinGrams} g`, sub: `${proteinKcals} kcal`, color: 'var(--accent-emerald)' },
                { label: 'CARBOHIDRATOS', value: `${nut.carbsGrams} g`, sub: `${carbsKcals} kcal`, color: 'var(--accent-cyan)' },
                { label: 'GRASAS', value: `${nut.fatsGrams} g`, sub: `${fatsKcals} kcal`, color: 'var(--accent-amber)' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: '#0f172a', padding: '1.25rem', borderRadius: 10, border: `1px solid ${color}30`, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color }}>{value}</div>
                  {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-dark)', marginTop: 2 }}>{sub}</div>}
                </div>
              ))}
            </div>

            {/* Macro distribution bar */}
            {totalKcals > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Distribución calórica</div>
                <div style={{ display: 'flex', height: 20, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
                  <div style={{ flex: proteinKcals, background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff', minWidth: 0 }}>
                    {totalKcals > 0 ? `${((proteinKcals / totalKcals) * 100).toFixed(0)}%P` : ''}
                  </div>
                  <div style={{ flex: carbsKcals, background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff', minWidth: 0 }}>
                    {totalKcals > 0 ? `${((carbsKcals / totalKcals) * 100).toFixed(0)}%C` : ''}
                  </div>
                  <div style={{ flex: fatsKcals, background: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#000', minWidth: 0 }}>
                    {totalKcals > 0 ? `${((fatsKcals / totalKcals) * 100).toFixed(0)}%G` : ''}
                  </div>
                </div>
              </div>
            )}

            {nut.stepsGoal && (
              <div style={{ marginTop: '1rem', background: '#0f172a', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                🚶 <strong>Pasos:</strong> {nut.stepsGoal}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CLOSED MENU ── */}
      {nut.type === 'closed' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontWeight: 800, color: '#f87171' }}>📋 Menú Estructurado por Comidas</h3>
            <button className="btn-primary" onClick={() => addMeal(activeClient.id)} style={{ fontSize: '0.82rem' }}>
              <Plus size={14} /> Añadir Comida
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(nut.closedMeals || []).map((meal, idx) => (
              <div key={idx} style={{ background: '#0f172a', padding: '1.25rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                {editingMealIdx === idx ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      value={meal.name}
                      onChange={(e) => updateMeal(activeClient.id, idx, 'name', e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', fontWeight: 800, padding: '8px 12px', borderRadius: 6, fontSize: '0.95rem' }}
                    />
                    <textarea
                      rows={3}
                      value={meal.description}
                      onChange={(e) => updateMeal(activeClient.id, idx, 'description', e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: '0.88rem', resize: 'vertical' }}
                    />
                    <button className="btn-primary" onClick={() => setEditingMealIdx(null)} style={{ alignSelf: 'flex-end', fontSize: '0.82rem' }}>
                      <CheckCircle2 size={14} /> Listo
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--accent-emerald)', marginBottom: 4 }}>{meal.name}</div>
                      <div style={{ fontSize: '0.88rem', color: '#fff', lineHeight: 1.5 }}>{meal.description}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                      <button onClick={() => setEditingMealIdx(idx)} className="btn-icon"><Edit3 size={14} /></button>
                      <button onClick={() => removeMeal(activeClient.id, idx)} className="btn-icon" style={{ color: '#f43f5e' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PASOS BANNER ── */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ background: '#f87171', padding: '8px 14px', borderRadius: 8, textAlign: 'center', fontWeight: 900, fontSize: '0.95rem', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          PASOS DIARIOS
        </div>
        <div style={{ background: '#0f172a', padding: 14, borderRadius: 8, textAlign: 'center', fontWeight: 700, fontSize: '1rem', color: 'var(--accent-cyan)' }}>
          🚶 {nut.stepsGoal || 'Sin objetivo establecido'}
        </div>
      </div>

      {/* ── HABITS & LIFESTYLE NOTES ── */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ background: '#f87171', padding: '8px 14px', borderRadius: 8, textAlign: 'center', fontWeight: 900, fontSize: '0.95rem', letterSpacing: 1, textTransform: 'uppercase', marginBottom: '1rem' }}>
          💡 NOTAS & RECOMENDACIONES DE ESTILO DE VIDA
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(nut.habitsNotes || []).map((note, idx) => (
            <div key={idx} style={{ background: '#0f172a', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
              <span><span style={{ color: 'var(--accent-emerald)', marginRight: 8 }}>✓</span>{note}</span>
              <button onClick={() => handleRemoveNote(idx)} style={{ background: 'none', color: '#f43f5e', cursor: 'pointer', opacity: 0.6, flexShrink: 0 }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Añadir recomendación de hábito..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              style={{ flex: 1, background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem' }}
            />
            <button className="btn-secondary" onClick={handleAddNote} style={{ fontSize: '0.82rem' }}><Plus size={14} /> Añadir</button>
          </div>
        </div>
      </div>
    </div>
  );
};
