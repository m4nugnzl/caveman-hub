import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Copy, Plus, Trash2, Save, Dumbbell, Calendar,
  Settings, RotateCw, GripVertical, CheckCircle2,
  CircleDashed, ChevronLeft, ChevronRight, Edit2, X, ArrowRight,
  MoreVertical, Layers, Dumbbell as DumbbellIcon
} from 'lucide-react';

const MUSCLE_GROUPS = [
  'Pecho', 'Dorsal', 'Espalda Alta', 'Tríceps', 'Bíceps',
  'Deltoides Anterior', 'Deltoides Lateral', 'Deltoides Posterior',
  'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductor', 'Gemelo', 'Abdominales', 'Otros',
];

const emptySet = (defaultTarget = '') => ({ kg: '', reps: '', rir: '', targetReps: defaultTarget });
const buildSets = (n, defaultTarget = '') => Array.from({ length: n }, () => emptySet(defaultTarget));

const SET_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#22d3ee', '#a3e635', '#fb923c'];
const colorFor = (i) => SET_COLORS[i % SET_COLORS.length];

const SetInput = ({ val, onChange, color, onRemove, canRemove, idx }) => (
  <div style={{ 
    display: 'flex', flexDirection: 'column', gap: 6, 
    background: 'rgba(255, 255, 255, 0.03)', 
    padding: '10px', borderRadius: '14px',
    border: `1px solid ${color}30`,
    position: 'relative',
    minWidth: '120px'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>
        Serie {idx + 1}
      </span>
      {canRemove && (
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}>
          <X size={12} />
        </button>
      )}
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 8 }}>
      <span style={{ fontSize: '0.65rem', color: color, fontWeight: 800 }}>OBJ</span>
      <input
        type="text" placeholder="8-10" value={val.targetReps || ''}
        onChange={(e) => onChange('targetReps', e.target.value)}
        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', textAlign: 'center', fontSize: '0.8rem', fontWeight: 800 }}
      />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>kg</span>
        <input
          type="text" inputMode="numeric" step="0.25" placeholder="-" value={val.kg}
          onChange={(e) => onChange('kg', e.target.value)}
          style={{ width: '100%', background: '#0f172a', border: 'none', color: '#fff', textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700 }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>rep</span>
        <input
          type="text" inputMode="numeric" placeholder="-" value={val.reps}
          onChange={(e) => onChange('reps', e.target.value)}
          style={{ width: '100%', background: '#0f172a', border: 'none', color: '#fff', textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700 }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>rir</span>
        <input
          type="text" placeholder="-" value={val.rir}
          onChange={(e) => onChange('rir', e.target.value)}
          style={{ width: '100%', background: '#0f172a', border: 'none', color: color, textAlign: 'center', padding: '6px 0', borderRadius: 8, fontSize: '0.85rem', fontWeight: 800 }}
        />
      </div>
    </div>
  </div>
);

const unitLabel = (cycleType) => (cycleType === 'rotating' ? 'Sesión' : 'Semana');

export const WorkoutLogEditor = () => {
  const {
    activeClient, clients, workoutData, exerciseLibrary, isSaving,
    updateExerciseSet, addExercise, removeExercise, addDay, createMicrocycle, cloneMicrocycle,
    updateWeeklySplit, updateClient, upsertLibraryExercise, addExerciseSetSlot, removeExerciseSetSlot,
    copyDayToClient, copyMicrocycleToClient, copyAllMicrocyclesToClient,
    renameDay, moveExercise, duplicateDay, removeDay
  } = useApp();

  const cd = workoutData[activeClient.id];
  const microcycles = cd?.microcycles || [];
  const cycleType = activeClient.cycleType || 'weekly';
  const cyclePattern = activeClient.cyclePattern || { train: 2, rest: 1 };

  const [activeWeek, setActiveWeek] = useState(
    microcycles.length > 0 ? microcycles[microcycles.length - 1].weekNumber : 1
  );
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [newExForm, setNewExForm] = useState({ name: '', muscle: 'Pecho', targetReps: '8-10', numSets: 4 });
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayName, setNewDayName] = useState('');
  const [showAddEx, setShowAddEx] = useState(false);
  const [showCycleSettings, setShowCycleSettings] = useState(false);
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [copyTarget, setCopyTarget] = useState({ clientId: '', scope: 'day' });

  // Estados para menús
  const [showDayMenu, setShowDayMenu] = useState(false);

  // Estados para editar nombre de día y drag&drop
  const [editingDayName, setEditingDayName] = useState(false);
  const [tempDayName, setTempDayName] = useState('');
  const [draggedExIdx, setDraggedExIdx] = useState(null);

  const micro = microcycles.find((m) => m.weekNumber === activeWeek) || microcycles[0];
  const activeDay = micro?.days[activeDayIdx];

  // Si se elimina el día activo (o cambiamos de semana a una con menos días),
  // activeDayIdx puede quedar fuera de rango — lo acotamos al último día
  // disponible en vez de dejar la vista en blanco.
  useEffect(() => {
    if (micro && micro.days.length > 0 && activeDayIdx >= micro.days.length) {
      setActiveDayIdx(micro.days.length - 1);
    }
  }, [micro, activeDayIdx]);

  const muscleSummary = {};
  if (activeDay) {
    activeDay.exercises.forEach((ex) => {
      const m = ex.muscle || 'Otros';
      const count = (ex.sets || []).filter((s) => s && Number(s.reps) > 0).length;
      muscleSummary[m] = (muscleSummary[m] || 0) + count;
    });
  }

  // Métricas adicionales para la cabecera del día
  const totalExercisesCount = activeDay ? activeDay.exercises.length : 0;
  const totalSetsCount = activeDay ? activeDay.exercises.reduce((acc, ex) => acc + (ex.sets ? ex.sets.length : 0), 0) : 0;
  const dayOfWeekString = activeDay && cd.weeklySplit 
    ? Object.keys(cd.weeklySplit).find(dayKey => cd.weeklySplit[dayKey]?.toLowerCase() === activeDay.dayName.toLowerCase())
    : null;

  const otherClients = useMemo(() => clients.filter((c) => c.id !== activeClient.id), [clients, activeClient.id]);

  const nameMatches = exerciseLibrary.filter(
    (e) => newExForm.name.trim() && e.name.toLowerCase().includes(newExForm.name.trim().toLowerCase())
  ).slice(0, 6);

  const handlePrevWeek = () => {
    const currentIdx = microcycles.findIndex(m => m.weekNumber === activeWeek);
    if (currentIdx > 0) setActiveWeek(microcycles[currentIdx - 1].weekNumber);
  };
  
  const handleNextWeek = () => {
    const currentIdx = microcycles.findIndex(m => m.weekNumber === activeWeek);
    if (currentIdx < microcycles.length - 1) setActiveWeek(microcycles[currentIdx + 1].weekNumber);
  };

  const handleSaveDayName = () => {
    if (tempDayName.trim() && renameDay && activeDay) {
      renameDay(activeClient.id, activeWeek, activeDay.dayName, tempDayName.trim());
    }
    setEditingDayName(false);
  };

  const handleDragStart = (e, index) => {
    setDraggedExIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedExIdx === null || draggedExIdx === dropIndex || !activeDay) return;
    if (moveExercise) {
      moveExercise(activeClient.id, activeWeek, activeDay.dayName, draggedExIdx, dropIndex);
    }
    setDraggedExIdx(null);
  };

  const handleClone = () => {
    if (!micro) return;
    cloneMicrocycle(activeClient.id, activeWeek);
    const newWeek = Math.max(...microcycles.map((m) => m.weekNumber)) + 1;
    setTimeout(() => setActiveWeek(newWeek), 50);
  };

  const handleCreateNewWeek = () => {
    createMicrocycle(activeClient.id);
    const newWeek = Math.max(...microcycles.map((m) => m.weekNumber), 0) + 1;
    setTimeout(() => {
      setActiveWeek(newWeek);
      setShowWeekDropdown(false);
    }, 50);
  };

  const handlePickLibraryExercise = (ex) => {
    setNewExForm({ ...newExForm, name: ex.name, muscle: ex.muscle });
  };

  const handleAddExercise = () => {
    if (!newExForm.name.trim() || !activeDay) return;
    const n = Math.max(1, Math.min(12, Number(newExForm.numSets) || 4));
    const ex = {
      id: 'ex_' + Date.now(),
      name: newExForm.name.trim(),
      muscle: newExForm.muscle,
      sets: buildSets(n, newExForm.targetReps),
    };
    addExercise(activeClient.id, activeWeek, activeDay.dayName, ex);
    upsertLibraryExercise(newExForm.name.trim(), newExForm.muscle);
    setNewExForm({ name: '', muscle: 'Pecho', targetReps: '8-10', numSets: 4 });
    setShowAddEx(false);
  };

  const handleAddDay = () => {
    if (!newDayName.trim() || !micro) return;
    addDay(activeClient.id, activeWeek, newDayName);
    setNewDayName('');
    setShowAddDay(false);
  };

  const handleCopy = () => {
    if (!copyTarget.clientId) return;
    if (copyTarget.scope === 'program') {
      copyAllMicrocyclesToClient(activeClient.id, copyTarget.clientId);
    } else if (!activeDay) {
      return;
    } else if (copyTarget.scope === 'day') {
      copyDayToClient(activeClient.id, activeWeek, activeDay.dayName, copyTarget.clientId, activeWeek, activeDay.dayName);
    } else {
      copyMicrocycleToClient(activeClient.id, activeWeek, copyTarget.clientId);
    }
    setShowCopyPanel(false);
    setCopyTarget({ clientId: '', scope: 'day' });
  };

  if (!cd || microcycles.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', borderRadius: 24 }}>
        <Dumbbell size={48} color="var(--accent-emerald)" style={{ marginBottom: 16, opacity: 0.8 }} />
        <h3 style={{ fontSize: '1.25rem' }}>No hay microciclos para este cliente aún</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 8, marginBottom: 24 }}>
          Crea el primer microciclo para empezar a programar días y ejercicios.
        </p>
        <button className="btn-primary" style={{ padding: '12px 24px', borderRadius: 12 }} onClick={() => createMicrocycle(activeClient.id)}>
          <Plus size={18} /> Crear primer microciclo
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      
      {/* ── TIPO DE CICLO ── */}
      <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(34, 211, 238, 0.1)', padding: 8, borderRadius: 10 }}>
              <RotateCw size={20} color="var(--accent-cyan)" />
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: 0.5 }}>
                Estructura del Programa
              </span>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                {cycleType === 'weekly' ? 'Semana Natural (Lunes–Domingo)' : 'Ciclo Rotativo Ininterrumpido'}
              </h4>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isSaving('workout', activeClient.id) ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--accent-amber)', fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-amber)', animation: 'pulse 1s infinite' }} />
                Guardando…
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                <CheckCircle2 size={13} color="var(--accent-emerald)" /> Guardado
              </span>
            )}
            <button className="btn-secondary" style={{ padding: '8px 12px', borderRadius: 10 }} onClick={() => setShowCycleSettings(!showCycleSettings)}>
              <Settings size={16} /> Configurar
            </button>
          </div>
        </div>

        {cycleType === 'rotating' && !showCycleSettings && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>Patrón:</span>
            {Array.from({ length: cyclePattern.train }).map((_, i) => (
              <React.Fragment key={`t-${i}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 800 }}>
                  <CheckCircle2 size={14} /> Entreno
                </div>
                {(i < cyclePattern.train - 1 || cyclePattern.rest > 0) && <ArrowRight size={14} color="rgba(255,255,255,0.2)" />}
              </React.Fragment>
            ))}
            {Array.from({ length: cyclePattern.rest }).map((_, i) => (
              <React.Fragment key={`r-${i}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 800 }}>
                  <CircleDashed size={14} /> Descanso
                </div>
                {i < cyclePattern.rest - 1 && <ArrowRight size={14} color="rgba(255,255,255,0.2)" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {showCycleSettings && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Tipo</label>
              <div style={{ display: 'flex', background: '#0f172a', padding: 4, borderRadius: 12 }}>
                <button
                  style={{ padding: '8px 16px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 800, background: cycleType === 'weekly' ? 'var(--accent-emerald)' : 'transparent', color: cycleType === 'weekly' ? '#000' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                  onClick={() => updateClient(activeClient.id, { cycleType: 'weekly' })}
                >
                  Semanal
                </button>
                <button
                  style={{ padding: '8px 16px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 800, background: cycleType === 'rotating' ? 'var(--accent-cyan)' : 'transparent', color: cycleType === 'rotating' ? '#000' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                  onClick={() => updateClient(activeClient.id, { cycleType: 'rotating' })}
                >
                  Rotativa
                </button>
              </div>
            </div>

            {cycleType === 'rotating' && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Días de Entreno</label>
                  <input
                    type="text" inputMode="numeric" min={1} max={14} value={cyclePattern.train}
                    onChange={(e) => updateClient(activeClient.id, { cyclePattern: { ...cyclePattern, train: Number(e.target.value) || 1 } })}
                    style={{ width: 80, background: '#0f172a', border: 'none', color: '#fff', padding: '10px', borderRadius: 12, textAlign: 'center', fontSize: '1rem', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Días de Descanso</label>
                  <input
                    type="text" inputMode="numeric" min={0} max={14} value={cyclePattern.rest}
                    onChange={(e) => updateClient(activeClient.id, { cyclePattern: { ...cyclePattern, rest: Number(e.target.value) || 0 } })}
                    style={{ width: 80, background: '#0f172a', border: 'none', color: '#fff', padding: '10px', borderRadius: 12, textAlign: 'center', fontSize: '1rem', fontWeight: 800 }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── WEEKLY SPLIT EDITOR ── */}
      {cycleType === 'weekly' && (
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 20 }}>
          <h3 style={{ fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8, color: '#f87171' }}>
            <Calendar size={18} /> Planificación Semanal
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
            {Object.entries(cd.weeklySplit).map(([day, val]) => (
              <div key={day}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6, textAlign: 'center', textTransform: 'uppercase' }}>{day}</div>
                <input
                  value={val}
                  onChange={(e) => updateWeeklySplit(activeClient.id, day, e.target.value)}
                  style={{
                    width: '100%', background: val === 'Descanso' ? '#0f172a' : 'rgba(16,185,129,0.12)',
                    border: `1px solid ${val === 'Descanso' ? 'rgba(255,255,255,0.05)' : 'var(--accent-emerald)'}`,
                    color: val === 'Descanso' ? 'var(--text-muted)' : '#fff', textAlign: 'center', padding: '10px 4px',
                    borderRadius: 12, fontSize: '0.8rem', fontWeight: 700
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SELECTOR DE SEMANA/SESIÓN ── */}
      {/* Antes había un dropdown flotante (position:absolute) SUPERPUESTO a un
          carrusel de chips que hacía lo mismo — con muchas semanas clonadas,
          el dropdown se quedaba corto o tapaba contenido de debajo ("se
          solapa... no se ve"). Ahora hay un único carril horizontal: sin
          overlay, sin z-index, sin nada que recortar. */}
      <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={handlePrevWeek} disabled={activeWeek === microcycles[0]?.weekNumber} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '50%', width: 32, height: 32, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={17} />
            </button>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{unitLabel(cycleType)} {activeWeek}</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{micro.date || 'Fecha por definir'}</span>
            </div>
            <button onClick={handleNextWeek} disabled={activeWeek === microcycles[microcycles.length - 1]?.weekNumber} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '50%', width: 32, height: 32, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={17} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" style={{ fontSize: '0.8rem', borderRadius: 16 }} onClick={handleClone}>
              <Copy size={16} /> Clonar {unitLabel(cycleType).toLowerCase()}
            </button>
            {activeDay && (
              <button className="btn-secondary" style={{ fontSize: '0.8rem', borderRadius: 16 }} onClick={() => setShowCopyPanel(!showCopyPanel)}>
                <Copy size={16} /> Copiar a otro cliente
              </button>
            )}
          </div>
        </div>

        {/* Carril horizontal: todas las semanas/sesiones, sin solape posible */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {microcycles.map((m) => {
            const isSelected = m.weekNumber === activeWeek;
            return (
              <button
                key={m.weekNumber}
                onClick={() => setActiveWeek(m.weekNumber)}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
                  background: isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.03)',
                  color: isSelected ? '#000' : 'var(--text-muted)',
                  border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.05)',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.2s ease'
                }}
              >
                {unitLabel(cycleType).slice(0, 1)}{m.weekNumber}
              </button>
            );
          })}
          <button
            onClick={handleCreateNewWeek}
            style={{
              padding: '8px 16px', borderRadius: 20, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
              background: 'transparent', color: 'var(--accent-emerald)', border: '1px dashed var(--accent-emerald)',
              whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Plus size={14} /> Nueva
          </button>
        </div>
      </div>

      {showCopyPanel && activeDay && (
        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Cliente destino</label>
            <select
              value={copyTarget.clientId}
              onChange={(e) => setCopyTarget({ ...copyTarget, clientId: e.target.value })}
              style={{ background: '#0f172a', border: 'none', color: '#fff', padding: '10px 14px', borderRadius: 12, minWidth: 180, fontWeight: 700 }}
            >
              <option value="">Selecciona cliente…</option>
              {otherClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Qué copiar</label>
            <div style={{ display: 'flex', gap: 6, background: '#0f172a', padding: 4, borderRadius: 12 }}>
              <button
                className={copyTarget.scope === 'day' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 8, border: 'none' }}
                onClick={() => setCopyTarget({ ...copyTarget, scope: 'day' })}
              >
                Solo "{activeDay.dayName}"
              </button>
              <button
                className={copyTarget.scope === 'week' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 8, border: 'none' }}
                onClick={() => setCopyTarget({ ...copyTarget, scope: 'week' })}
              >
                {unitLabel(cycleType)} completa
              </button>
              <button
                className={copyTarget.scope === 'program' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 8, border: 'none' }}
                onClick={() => setCopyTarget({ ...copyTarget, scope: 'program' })}
              >
                Programa entero ({microcycles.length} {unitLabel(cycleType).toLowerCase()}s)
              </button>
            </div>
          </div>
          <button className="btn-primary" style={{ padding: '10px 16px', borderRadius: 12 }} onClick={handleCopy} disabled={!copyTarget.clientId}>Copiar</button>
          <button className="btn-secondary" style={{ padding: '10px 16px', borderRadius: 12 }} onClick={() => setShowCopyPanel(false)}>Cancelar</button>
        </div>
      )}

      {/* ── DAY TABS ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {micro?.days.map((day, idx) => (
          <button
            key={day.dayName}
            onClick={() => setActiveDayIdx(idx)}
            style={{
              padding: '10px 20px', borderRadius: 24, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
              background: idx === activeDayIdx ? '#fff' : 'rgba(255,255,255,0.03)',
              color: idx === activeDayIdx ? '#000' : 'var(--text-muted)',
              border: idx === activeDayIdx ? 'none' : '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.2s ease'
            }}
          >
            {day.dayName}
          </button>
        ))}
        <button onClick={() => setShowAddDay(!showAddDay)} style={{ padding: '10px 16px', borderRadius: 24, background: 'transparent', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={16} /> Día
        </button>
      </div>

      {showAddDay && (
        <div className="glass-panel" style={{ display: 'flex', gap: 12, padding: '1rem', borderRadius: 16, alignItems: 'center' }}>
          <input
            value={newDayName} onChange={(e) => setNewDayName(e.target.value)}
            placeholder="Ej: Día 3 (Pierna)"
            style={{ flex: 1, background: '#0f172a', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: 12, fontSize: '0.9rem', fontWeight: 700 }}
          />
          <button className="btn-primary" style={{ padding: '10px 20px', borderRadius: 12 }} onClick={handleAddDay}>Añadir Día</button>
          <button className="btn-secondary" style={{ padding: '10px 20px', borderRadius: 12 }} onClick={() => setShowAddDay(false)}>Cancelar</button>
        </div>
      )}

      {/* ── MUSCLE VOLUME PILLS ── */}
      {activeDay && Object.keys(muscleSummary).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
          {Object.entries(muscleSummary).map(([muscle, count]) => (
            <div key={muscle} style={{
              background: 'rgba(0,0,0,0.2)', padding: '6px 14px', borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.78rem',
            }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{muscle}: </span>
              <strong style={{ color: 'var(--accent-emerald)' }}>{count} series</strong>
            </div>
          ))}
        </div>
      )}

      {/* ── EXERCISE LIST CON DRAG & DROP Y CABECERA MODERNA DEL DÍA ── */}
      {activeDay && (
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: 32 }}>
          
          {/* CABECERA DEL DÍA - Tarjeta Premium */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            padding: '1.5rem 2rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Decorative accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-emerald))',
              opacity: 0.6
            }} />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
              {/* Workout Icon */}
              <div style={{
                background: 'rgba(34, 211, 238, 0.15)',
                padding: 14,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <DumbbellIcon size={28} color="var(--accent-cyan)" />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Day type badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--accent-cyan)', fontWeight: 800, letterSpacing: 0.5 }}>
                    {activeDay.dayName.includes('Día') ? activeDay.dayName.split(' ')[0] + ' ' + (activeDay.dayName.split(' ')[1] || '') : 'Entrenamiento'}
                  </span>
                  {dayOfWeekString && (
                    <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700 }}>
                      {dayOfWeekString}
                    </span>
                  )}
                </div>

                {/* Título o Edición Inline del Nombre */}
                {editingDayName ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={tempDayName}
                      onChange={(e) => setTempDayName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveDayName()}
                      onBlur={handleSaveDayName}
                      style={{ background: '#0f172a', border: '1px solid var(--accent-cyan)', color: '#fff', padding: '8px 14px', borderRadius: 12, fontSize: '1.35rem', fontWeight: 900, minWidth: 200 }}
                    />
                    <button onClick={handleSaveDayName} style={{ background: 'var(--accent-cyan)', color: '#000', border: 'none', padding: '10px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Save size={18}/></button>
                    <button onClick={() => setEditingDayName(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '10px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18}/></button>
                  </div>
                ) : (
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
                    {activeDay.dayName}
                  </h2>
                )}
              </div>
            </div>

            {/* Métricas del entrenamiento y Menú de acciones (⋮) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', gap: 24, background: 'rgba(0,0,0,0.25)', padding: '12px 20px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>Ejercicios</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{totalExercisesCount}</span>
                </div>
                <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)' }}></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>Series Totales</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald)', lineHeight: 1 }}>{totalSetsCount}</span>
                </div>
              </div>

              {/* Menú de acciones (⋮) */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowDayMenu(!showDayMenu)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', padding: '12px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.12)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.06)'}
                >
                  <MoreVertical size={20} />
                </button>

                {showDayMenu && (
                  <div style={{
                    position: 'absolute', right: 0, top: '120%', zIndex: 50,
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 14, padding: '6px', minWidth: 170, boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                  }}>
                    <button
                      onClick={() => { setTempDayName(activeDay.dayName); setEditingDayName(true); setShowDayMenu(false); }}
                      style={{ width: '100%', background: 'transparent', color: '#fff', border: 'none', padding: '12px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <Edit2 size={15} /> Editar nombre
                    </button>
                    <button
                      onClick={() => { if (duplicateDay) duplicateDay(activeClient.id, activeWeek, activeDay.dayName); setShowDayMenu(false); }}
                      style={{ width: '100%', background: 'transparent', color: '#fff', border: 'none', padding: '12px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <Copy size={15} /> Duplicar día
                    </button>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }}></div>
                    <button
                      onClick={() => { if (removeDay) removeDay(activeClient.id, activeWeek, activeDay.dayName); setShowDayMenu(false); }}
                      style={{ width: '100%', background: 'transparent', color: '#ef4444', border: 'none', padding: '12px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <Trash2 size={15} /> Eliminar día
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Exercise Cards Container */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeDay.exercises.map((ex, idx) => (
              <div
                key={ex.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                style={{
                  background: draggedExIdx === idx ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255,255,255,0.02)',
                  border: draggedExIdx === idx ? '1px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  transition: 'all 0.2s ease',
                  overflow: 'hidden'
                }}
              >
                {/* Exercise Card Header — antes era una barra oscura con
                    borde inferior claramente separada de las series de
                    debajo (efecto "título + lista"). Ahora es una sola
                    tarjeta continua: badge numerado con acento de color,
                    nombre grande y músculo como pastilla discreta al lado,
                    sin línea divisoria dura hacia el contenido. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px 6px 20px' }}>
                  {/* Drag handle — SOLO este icono es "draggable": arrastrar
                      desde cualquier otro punto de la fila (antes: la fila
                      entera) chocaba con hacer click en los inputs/botones,
                      por eso "el drag and hold no funciona bien". */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnd={() => setDraggedExIdx(null)}
                    style={{ cursor: 'grab', color: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', flexShrink: 0 }}
                    title="Arrastra para reordenar"
                  >
                    <GripVertical size={18} />
                  </div>

                  {/* Badge numerado con degradado sutil en el color de la
                      primera serie — le da identidad visual sin depender de
                      una barra de fondo oscura */}
                  <div style={{
                    width: 34, height: 34, borderRadius: 12, flexShrink: 0,
                    background: `linear-gradient(135deg, ${colorFor(idx)}30, ${colorFor(idx)}10)`,
                    border: `1px solid ${colorFor(idx)}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: colorFor(idx), fontWeight: 900, fontSize: '0.95rem',
                  }}>
                    {idx + 1}
                  </div>

                  {/* Exercise info */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#fff', fontSize: '1.05rem' }}>{ex.name}</span>
                    <span style={{
                      background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                      padding: '3px 9px', borderRadius: 20, fontSize: '0.66rem', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 0.3,
                    }}>
                      {ex.muscle}
                    </span>
                  </div>

                  {/* Delete exercise button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeExercise(activeClient.id, activeWeek, activeDay.dayName, ex.id); }}
                    style={{
                      background: 'transparent', border: 'none', color: 'rgba(239, 68, 68, 0.55)',
                      cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(239, 68, 68, 0.55)'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                {/* Exercise Card Content - Sets EN HORIZONTAL: antes se apilaban
                    verticalmente (una debajo de otra) y cada ejercicio ocupaba
                    mucho alto; ahora van en fila, como una tabla, y solo saltan
                    de línea si no caben. */}
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {ex.sets.map((setObj, si) => (
                      <SetInput
                        key={si}
                        idx={si}
                        val={setObj}
                        color={colorFor(si)}
                        canRemove={ex.sets.length > 1}
                        onRemove={() => removeExerciseSetSlot(activeClient.id, activeWeek, activeDay.dayName, ex.id, si)}
                        onChange={(field, value) => updateExerciseSet(activeClient.id, activeWeek, activeDay.dayName, ex.id, si, field, value)}
                      />
                    ))}

                    {/* Add Set Button — chip del mismo alto que una serie, al
                        final de la fila, no un bloque ancho debajo */}
                    <button
                      onClick={() => addExerciseSetSlot(activeClient.id, activeWeek, activeDay.dayName, ex.id)}
                      style={{
                        minWidth: 64,
                        background: 'transparent',
                        border: '2px dashed rgba(255,255,255,0.12)',
                        borderRadius: '14px',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        gap: 4,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '10px 12px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                        e.currentTarget.style.color = 'var(--accent-cyan)';
                        e.currentTarget.style.background = 'rgba(34, 211, 238, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <Plus size={16} />
                      <span>Serie</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* ── ADD EXERCISE FORM ── */}
          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {!showAddEx ? (
              <button onClick={() => setShowAddEx(true)} style={{ width: '100%', padding: '16px', borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.03)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
                <Plus size={18} /> Nuevo Ejercicio
              </button>
            ) : (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px', position: 'relative' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Nombre del Ejercicio</label>
                    <input
                      value={newExForm.name}
                      onChange={(e) => setNewExForm({ ...newExForm, name: e.target.value })}
                      placeholder="Ej: Press Banca"
                      autoComplete="off"
                      style={{ width: '100%', background: '#0f172a', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: 12, fontSize: '0.9rem', fontWeight: 700 }}
                    />
                    {nameMatches.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginTop: 4, zIndex: 10, overflow: 'hidden' }}>
                        {nameMatches.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => handlePickLibraryExercise(m)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.85rem', fontWeight: 700 }}
                          >
                            {m.name} <span style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem', marginLeft: 6 }}>({m.muscle})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Músculo Principal</label>
                    <select
                      value={newExForm.muscle}
                      onChange={(e) => setNewExForm({ ...newExForm, muscle: e.target.value })}
                      style={{ background: '#0f172a', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: 12, fontSize: '0.9rem', fontWeight: 700 }}
                    >
                      {MUSCLE_GROUPS.map((mg) => <option key={mg} value={mg}>{mg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Reps Objetivo</label>
                    <input
                      value={newExForm.targetReps}
                      onChange={(e) => setNewExForm({ ...newExForm, targetReps: e.target.value })}
                      placeholder="8-10"
                      style={{ width: 90, background: '#0f172a', border: 'none', color: '#fff', padding: '12px', borderRadius: 12, textAlign: 'center', fontSize: '0.9rem', fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 700 }}>Nº Series</label>
                    <input
                      type="text" inputMode="numeric" min={1} max={12}
                      value={newExForm.numSets}
                      onChange={(e) => setNewExForm({ ...newExForm, numSets: e.target.value })}
                      style={{ width: 80, background: '#0f172a', border: 'none', color: '#fff', padding: '12px', borderRadius: 12, textAlign: 'center', fontSize: '0.9rem', fontWeight: 700 }}
                    />
                  </div>
                  <button className="btn-primary" style={{ padding: '12px 24px', borderRadius: 12 }} onClick={handleAddExercise}>Añadir Ejercicio</button>
                  <button className="btn-secondary" style={{ padding: '12px 24px', borderRadius: 12 }} onClick={() => setShowAddEx(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};