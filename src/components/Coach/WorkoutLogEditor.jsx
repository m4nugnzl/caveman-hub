import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Copy, Plus, Trash2, ChevronDown, ChevronUp, Save,
  Dumbbell, Calendar, Zap
} from 'lucide-react';

const MUSCLE_GROUPS = [
  'Pecho', 'Dorsal', 'Espalda Alta', 'Tríceps', 'Bíceps',
  'Deltoides Anterior', 'Deltoides Lateral', 'Deltoides Posterior',
  'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductor', 'Gemelo', 'Abdominales', 'Otros',
];

const emptySet = { kg: '', reps: '', rir: '' };

const SetInput = ({ val, onChange, color }) => (
  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
    <input
      type="number" step="0.25" placeholder="kg"
      value={val.kg}
      onChange={(e) => onChange('kg', e.target.value)}
      style={{
        width: 54, background: '#0f172a', border: `1px solid ${color}40`,
        color: '#fff', textAlign: 'center', padding: '5px 4px',
        borderRadius: 6, fontSize: '0.82rem', fontWeight: 700,
      }}
    />
    <input
      type="number" placeholder="reps"
      value={val.reps}
      onChange={(e) => onChange('reps', e.target.value)}
      style={{
        width: 46, background: '#0f172a', border: `1px solid ${color}40`,
        color: '#fff', textAlign: 'center', padding: '5px 4px',
        borderRadius: 6, fontSize: '0.82rem', fontWeight: 700,
      }}
    />
    <input
      type="text" placeholder="rir"
      value={val.rir}
      onChange={(e) => onChange('rir', e.target.value)}
      style={{
        width: 38, background: '#0f172a', border: `1px solid ${color}40`,
        color: color, textAlign: 'center', padding: '5px 4px',
        borderRadius: 6, fontSize: '0.82rem', fontWeight: 800,
      }}
    />
  </div>
);

const SET_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b'];

export const WorkoutLogEditor = () => {
  const {
    activeClient, workoutData, updateExerciseSet,
    addExercise, removeExercise, addDay, cloneMicrocycle,
    updateWeeklySplit, calcTonnage, calcMuscleVolume,
  } = useApp();

  const cd = workoutData[activeClient.id];
  const microcycles = cd?.microcycles || [];

  const [activeWeek, setActiveWeek] = useState(
    microcycles.length > 0 ? microcycles[microcycles.length - 1].weekNumber : 1
  );
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [newExForm, setNewExForm] = useState({ name: '', muscle: 'Pecho', targetReps: '8-10' });
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayName, setNewDayName] = useState('');
  const [showAddEx, setShowAddEx] = useState(false);

  const micro = microcycles.find((m) => m.weekNumber === activeWeek) || microcycles[0];
  const activeDay = micro?.days[activeDayIdx];

  const tonnage = calcTonnage(activeClient.id, activeWeek);
  const volumeMap = calcMuscleVolume(activeClient.id, activeWeek);

  const muscleSummary = {};
  if (activeDay) {
    activeDay.exercises.forEach((ex) => {
      const m = ex.muscle || 'Otros';
      const count = ['set1', 'set2', 'set3', 'set4'].filter(
        (k) => ex[k] && Number(ex[k].reps) > 0
      ).length;
      muscleSummary[m] = (muscleSummary[m] || 0) + count;
    });
  }

  const handleClone = () => {
    if (!micro) return;
    cloneMicrocycle(activeClient.id, activeWeek);
    const newWeek = Math.max(...microcycles.map((m) => m.weekNumber)) + 1;
    setTimeout(() => setActiveWeek(newWeek), 50);
  };

  const handleAddExercise = () => {
    if (!newExForm.name.trim() || !activeDay) return;
    const ex = {
      id: 'ex_' + Date.now(),
      name: newExForm.name,
      muscle: newExForm.muscle,
      targetReps: newExForm.targetReps,
      set1: { ...emptySet }, set2: { ...emptySet },
      set3: { ...emptySet }, set4: { ...emptySet },
    };
    addExercise(activeClient.id, activeWeek, activeDay.dayName, ex);
    setNewExForm({ name: '', muscle: 'Pecho', targetReps: '8-10' });
    setShowAddEx(false);
  };

  const handleAddDay = () => {
    if (!newDayName.trim() || !micro) return;
    addDay(activeClient.id, activeWeek, newDayName);
    setNewDayName('');
    setShowAddDay(false);
  };

  if (!cd || microcycles.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <Dumbbell size={40} color="var(--accent-emerald)" style={{ marginBottom: 12 }} />
        <h3>No hay microciclos para este cliente aún</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          Crea el primer microciclo desde el panel de Clientes.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── WEEKLY SPLIT EDITOR ── */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8, color: '#f87171' }}>
          <Calendar size={18} /> Estructura Semanal (Editable)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          {Object.entries(cd.weeklySplit).map(([day, val]) => (
            <div key={day}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>{day}</div>
              <input
                value={val}
                onChange={(e) => updateWeeklySplit(activeClient.id, day, e.target.value)}
                style={{
                  width: '100%', background: val === 'Descanso' ? '#0f172a' : 'rgba(16,185,129,0.12)',
                  border: `1px solid ${val === 'Descanso' ? 'var(--border-color)' : 'var(--accent-emerald)'}`,
                  color: '#fff', textAlign: 'center', padding: '8px 4px',
                  borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── MICROCYCLE SELECTOR + ACTIONS ── */}
      <div className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '0.95rem' }}>Microciclo:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {microcycles.map((m) => (
              <button
                key={m.weekNumber}
                onClick={() => { setActiveWeek(m.weekNumber); setActiveDayIdx(0); }}
                style={{
                  padding: '6px 16px', borderRadius: 8, fontWeight: 800, fontSize: '0.85rem',
                  background: activeWeek === m.weekNumber ? 'var(--accent-emerald)' : '#1e293b',
                  color: '#fff', border: activeWeek === m.weekNumber ? 'none' : '1px solid var(--border-color)',
                  cursor: 'pointer',
                }}
              >
                Semana {m.weekNumber}
                {m.weekNumber === microcycles[microcycles.length - 1].weekNumber && (
                  <span style={{ marginLeft: 6, fontSize: '0.7rem', opacity: 0.8 }}>● Activa</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--border-color)', padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Tonelaje: </span>
            <strong style={{ color: 'var(--accent-cyan)' }}>{tonnage} kg</strong>
          </div>
          <button className="btn-primary" onClick={handleClone} style={{ fontSize: '0.85rem' }}>
            <Copy size={15} /> Clonar Semana +1
          </button>
        </div>
      </div>

      {/* ── DAY TABS ── */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', paddingBottom: 10, flexWrap: 'wrap' }}>
        {micro?.days.map((day, dIdx) => (
          <button
            key={dIdx}
            onClick={() => setActiveDayIdx(dIdx)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem',
              background: activeDayIdx === dIdx ? 'rgba(248,113,113,0.2)' : 'transparent',
              color: activeDayIdx === dIdx ? '#f87171' : 'var(--text-muted)',
              border: activeDayIdx === dIdx ? '1px solid #f87171' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            {day.dayName}
          </button>
        ))}
        <button
          onClick={() => setShowAddDay(!showAddDay)}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text-dark)', border: '1px dashed var(--border-color)', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <Plus size={14} style={{ verticalAlign: 'middle' }} /> Día
        </button>
      </div>

      {showAddDay && (
        <div style={{ display: 'flex', gap: 8, padding: '0.75rem 0' }}>
          <input
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
            placeholder="Ej: Día 3 (Density)"
            style={{ flex: 1, background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem' }}
          />
          <button className="btn-primary" onClick={handleAddDay}>Añadir Día</button>
          <button className="btn-secondary" onClick={() => setShowAddDay(false)}>Cancelar</button>
        </div>
      )}

      {/* ── MUSCLE VOLUME PILLS ── */}
      {activeDay && Object.keys(muscleSummary).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(muscleSummary).map(([muscle, count]) => (
            <div key={muscle} style={{
              background: '#0f172a', padding: '4px 12px', borderRadius: 20,
              border: '1px solid var(--border-color)', fontSize: '0.78rem',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{muscle}: </span>
              <strong style={{ color: 'var(--accent-emerald)' }}>{count} series</strong>
            </div>
          ))}
        </div>
      )}

      {/* ── EXERCISE TABLE ── */}
      {activeDay && (
        <div className="glass-panel" style={{ padding: '1.25rem', overflowX: 'auto' }}>
          {/* Day Banner */}
          <div style={{ background: '#f87171', color: '#fff', padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '1rem', letterSpacing: 1, textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            {activeDay.dayName} — Sesión {micro.sessionNumber} &nbsp;|&nbsp; {micro.date}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 780 }}>
            <thead>
              <tr style={{ background: '#1e293b', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: 36, color: 'var(--text-muted)' }}>Nº</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Ejercicio</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Músculo</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Rango</th>
                {['SERIE 1', 'SERIE 2', 'SERIE 3', 'SERIE 4'].map((s, i) => (
                  <th key={s} style={{ padding: '10px 8px', textAlign: 'center', color: SET_COLORS[i], fontSize: '0.78rem' }}>
                    {s}<br />
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dark)' }}>kg · reps · rir</span>
                  </th>
                ))}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {activeDay.exercises.map((ex, idx) => (
                <tr key={ex.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-dark)', fontWeight: 700 }}>{idx + 1}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#fff' }}>{ex.name}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ex.muscle}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 700 }}>{ex.targetReps}</td>
                  {['set1', 'set2', 'set3', 'set4'].map((sk, si) => (
                    <td key={sk} style={{ padding: '6px 4px' }}>
                      <SetInput
                        val={ex[sk]}
                        color={SET_COLORS[si]}
                        onChange={(field, value) =>
                          updateExerciseSet(activeClient.id, activeWeek, activeDay.dayName, ex.id, sk, field, value)
                        }
                      />
                    </td>
                  ))}
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                    <button
                      onClick={() => removeExercise(activeClient.id, activeWeek, activeDay.dayName, ex.id)}
                      style={{ background: 'none', color: '#f43f5e', cursor: 'pointer', opacity: 0.6, padding: 4 }}
                      title="Eliminar ejercicio"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── ADD EXERCISE FORM ── */}
          <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <button
              onClick={() => setShowAddEx(!showAddEx)}
              className="btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              <Plus size={15} /> Añadir Ejercicio
            </button>

            {showAddEx && (
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre</label>
                  <input
                    value={newExForm.name}
                    onChange={(e) => setNewExForm({ ...newExForm, name: e.target.value })}
                    placeholder="Ej: Press Banca"
                    style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', width: 200 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Músculo</label>
                  <select
                    value={newExForm.muscle}
                    onChange={(e) => setNewExForm({ ...newExForm, muscle: e.target.value })}
                    style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem' }}
                  >
                    {MUSCLE_GROUPS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Rango Reps</label>
                  <input
                    value={newExForm.targetReps}
                    onChange={(e) => setNewExForm({ ...newExForm, targetReps: e.target.value })}
                    placeholder="8-10"
                    style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', width: 80 }}
                  />
                </div>
                <button className="btn-primary" onClick={handleAddExercise}>Confirmar</button>
                <button className="btn-secondary" onClick={() => setShowAddEx(false)}>Cancelar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NOTES ── */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h4 style={{ fontWeight: 800, color: '#f87171', marginBottom: 8 }}>💡 Notas de Ejecución & Respiración</h4>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{cd.notes}</p>
        {cd.mobilityDrills?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h5 style={{ fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 8 }}>🧘 Mobility Drills</h5>
            {cd.mobilityDrills.map((drill, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: 6, fontSize: '0.85rem' }}>
                <span>{drill.text}</span>
                {drill.videoUrl && (
                  <a href={drill.videoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', fontWeight: 700, textDecoration: 'none', fontSize: '0.8rem' }}>
                    ▶ Ver vídeo
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
