import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Dumbbell, Upload, Utensils, Scale, MessageSquare, Play, CheckCircle2, Mic, LayoutGrid, TrendingUp, Calendar, RotateCw, ArrowRight, CircleDashed } from 'lucide-react';

const CLIENT_TABS = [
  { id: 'dashboard', label: 'Mi Panel', icon: LayoutGrid },
  { id: 'workout', label: 'Mi Rutina', icon: Dumbbell },
  { id: 'upload', label: 'Subir Vídeo', icon: Upload },
  { id: 'nutrition', label: 'Mi Dieta', icon: Utensils },
  { id: 'weight', label: 'Registrar Peso', icon: Scale },
  { id: 'feedback', label: 'Mis Revisiones', icon: MessageSquare },
];

export const ClientPortal = () => {
  const {
    activeClient, workoutData, nutrition, anthropometry, videos, uploadClientVideo, updateThreeDayWeights,
    updateExerciseSet, calcTonnage, calcMuscleVolume, calcOptionKcals,
  } = useApp();
  const [activeTab, setActiveTab] = useState('dashboard');

  const cd = workoutData[activeClient.id];
  const microcycles = cd?.microcycles || [];
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [dietView, setDietView] = useState('training');
  const currentMicro =
    microcycles.find((m) => m.weekNumber === selectedWeek) || microcycles[microcycles.length - 1] || microcycles[0];
  const cycleType = activeClient.cycleType || 'weekly';
  const cyclePattern = activeClient.cyclePattern || { train: 2, rest: 1 };
  const unitLabel = cycleType === 'rotating' ? 'Sesión' : 'Semana';

  const nut = nutrition[activeClient.id] || {};
  const anth = anthropometry[activeClient.id] || { threeDayWeights: { day1: '', day2: '', day3: '' } };
  const clientVideos = videos.filter((v) => v.clientId === activeClient.id);

  // Upload form state
  const [exercise, setExercise] = useState('');
  const [loadKg, setLoadKg] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('8');
  const [rir, setRir] = useState('1');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);

  const allExercises = currentMicro?.days.flatMap((d) => d.exercises.map((e) => e.name)) || [];

  const handleUpload = (e) => {
    e.preventDefault();
    if (!exercise || !loadKg || !reps) { alert('Introduce ejercicio, kg y reps.'); return; }
    uploadClientVideo({ clientId: activeClient.id, exercise, loadKg, reps, rpe, rir, notes });
    setSuccess(true);
    setLoadKg(''); setReps(''); setNotes('');
    setTimeout(() => setSuccess(false), 4000);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Welcome banner */}
      <div className="glass-panel" style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,182,212,0.1) 100%)',
        border: '1px solid var(--accent-emerald-glow)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={activeClient.avatar} alt={activeClient.name} style={{ width: 60, height: 60, borderRadius: 16, objectFit: 'cover', border: '2px solid var(--accent-emerald)' }} />
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>¡Hola, {activeClient.name}! 👋</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {activeClient.plan} · Semana {currentMicro?.weekNumber || '—'} activa
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Peso actual</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--accent-emerald)' }}>{activeClient.currentWeight} kg</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        {CLIENT_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab-item ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* ── MI PANEL (dashboard del cliente, mismo tipo de datos que ve el
            coach en su Resumen & Volumen, pero acotado a este cliente) ── */}
      {activeTab === 'dashboard' && (() => {
        const weightLogs = (anth.history || [])
          .filter((h) => h && h.weight)
          .slice()
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const weights = weightLogs.map((h) => Number(h.weight));
        const minW = weights.length ? Math.min(...weights) : 0;
        const maxW = weights.length ? Math.max(...weights) : 1;
        const range = maxW - minW || 1;

        const tonnageByWeek = microcycles.map((m) => ({ week: m.weekNumber, tonnage: Number(calcTonnage(activeClient.id, m.weekNumber)) }));
        const maxTonnage = Math.max(1, ...tonnageByWeek.map((t) => t.tonnage));

        const muscleVol = currentMicro ? calcMuscleVolume(activeClient.id, currentMicro.weekNumber) : {};
        const maxVol = Math.max(1, ...Object.values(muscleVol));

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              {[
                { label: 'Peso Actual', value: `${activeClient.currentWeight ?? '—'} kg`, color: 'var(--accent-emerald)' },
                { label: 'Tonelaje esta semana', value: `${tonnageByWeek.find((t) => t.week === currentMicro?.weekNumber)?.tonnage || 0} kg`, color: 'var(--accent-cyan)' },
                { label: `${unitLabel} activa`, value: currentMicro?.weekNumber ?? '—', color: 'var(--accent-amber)' },
                { label: 'Vídeos revisados', value: clientVideos.filter((v) => v.status === 'reviewed').length, color: '#ec4899' },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass-panel" style={{ padding: '1.1rem', borderRadius: 18, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color, marginTop: 6 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Evolución de peso */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 20 }}>
              <h4 style={{ fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-emerald)' }}>
                <TrendingUp size={18} /> Evolución de Peso
              </h4>
              {weights.length < 2 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aún no hay suficientes registros de peso para ver una tendencia.</p>
              ) : (
                <svg viewBox="0 0 600 160" style={{ width: '100%', height: 160 }} preserveAspectRatio="none">
                  <polyline
                    fill="none" stroke="var(--accent-emerald)" strokeWidth="3"
                    points={weights.map((w, i) => `${(i / (weights.length - 1)) * 580 + 10},${150 - ((w - minW) / range) * 130}`).join(' ')}
                  />
                  {weights.map((w, i) => (
                    <circle key={i} cx={(i / (weights.length - 1)) * 580 + 10} cy={150 - ((w - minW) / range) * 130} r="4" fill="var(--accent-emerald)" />
                  ))}
                </svg>
              )}
            </div>

            {/* Tonelaje por semana */}
            {tonnageByWeek.length > 0 && (
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 20 }}>
                <h4 style={{ fontWeight: 800, marginBottom: 14, color: 'var(--accent-cyan)' }}>🏋️ Tonelaje por {unitLabel.toLowerCase()}</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
                  {tonnageByWeek.map((t) => (
                    <div key={t.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: '100%', maxWidth: 34, borderRadius: '8px 8px 0 0',
                        background: t.week === currentMicro?.weekNumber ? 'var(--accent-cyan)' : 'rgba(34,211,238,0.35)',
                        height: `${Math.max(4, (t.tonnage / maxTonnage) * 110)}px`,
                      }} />
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>{t.week}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Volumen muscular de la semana activa */}
            {Object.keys(muscleVol).length > 0 && (
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: 20 }}>
                <h4 style={{ fontWeight: 800, marginBottom: 14, color: 'var(--accent-amber)' }}>💪 Volumen por Músculo — {unitLabel} {currentMicro?.weekNumber}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(muscleVol).sort((a, b) => b[1] - a[1]).map(([muscle, count]) => (
                    <div key={muscle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 130, fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>{muscle}</span>
                      <div style={{ flex: 1, background: '#0f172a', borderRadius: 6, overflow: 'hidden', height: 14 }}>
                        <div style={{ width: `${(count / maxVol) * 100}%`, height: '100%', background: 'var(--accent-amber)' }} />
                      </div>
                      <span style={{ width: 30, fontSize: '0.75rem', fontWeight: 800, textAlign: 'right' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── MY ROUTINE ── */}
      {activeTab === 'workout' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {activeClient.youtubeExplanationUrl && (
            <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#f43f5e' }}>🎬 Vídeo Explicativo de tu Rutina</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Grabado por tu entrenador exclusivamente para ti</div>
              </div>
              <a href={activeClient.youtubeExplanationUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ background: '#ef4444', textDecoration: 'none' }}>
                <Play size={15} /> Ver en YouTube
              </a>
            </div>
          )}

          {/* Estructura del programa: igual que ve el coach, en modo lectura */}
          <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: cycleType === 'weekly' ? 14 : 0 }}>
              <RotateCw size={16} color="var(--accent-cyan)" />
              <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                {cycleType === 'weekly' ? 'Estructura semanal' : `Ciclo rotativo ${cyclePattern.train}-${cyclePattern.rest}`}
              </span>
            </div>
            {cycleType === 'weekly' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 8 }}>
                {Object.entries(cd?.weeklySplit || {}).map(([day, val]) => (
                  <div key={day} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>{day.slice(0, 3)}</div>
                    <div style={{
                      background: val === 'Descanso' ? '#0f172a' : 'rgba(16,185,129,0.12)',
                      border: `1px solid ${val === 'Descanso' ? 'var(--border-color)' : 'var(--accent-emerald)'}`,
                      borderRadius: 10, padding: '8px 4px', fontSize: '0.72rem', fontWeight: 700,
                      color: val === 'Descanso' ? 'var(--text-muted)' : '#fff',
                    }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {Array.from({ length: cyclePattern.train }).map((_, i) => (
                  <React.Fragment key={`t-${i}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', padding: '6px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 800 }}>
                      <CheckCircle2 size={13} /> Entreno
                    </div>
                    {(i < cyclePattern.train - 1 || cyclePattern.rest > 0) && <ArrowRight size={13} color="rgba(255,255,255,0.2)" />}
                  </React.Fragment>
                ))}
                {Array.from({ length: cyclePattern.rest }).map((_, i) => (
                  <React.Fragment key={`r-${i}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 800 }}>
                      <CircleDashed size={13} /> Descanso
                    </div>
                    {i < cyclePattern.rest - 1 && <ArrowRight size={13} color="rgba(255,255,255,0.2)" />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Selector de semana/sesión: navega y consulta cualquier semana que
              te haya programado tu entrenador, no solo la última */}
          {microcycles.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {microcycles.map((m) => {
                const isSelected = m.weekNumber === currentMicro?.weekNumber;
                return (
                  <button
                    key={m.weekNumber}
                    onClick={() => setSelectedWeek(m.weekNumber)}
                    style={{
                      padding: '8px 16px', borderRadius: 20, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
                      background: isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.03)',
                      color: isSelected ? '#000' : 'var(--text-muted)',
                      border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {unitLabel} {m.weekNumber}
                  </button>
                );
              })}
            </div>
          )}

          {currentMicro ? currentMicro.days.map((day, dIdx) => (
            <div key={dIdx} className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ background: '#f87171', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.95rem', textTransform: 'uppercase', marginBottom: '1rem' }}>
                {day.dayName}
              </div>
              <div style={{ overflowX: 'auto' }}>
                {(() => {
                  // Nº de series variable por ejercicio (antes fijo a 4): la
                  // tabla saca tantas columnas "S{n}" como el ejercicio con
                  // más series tenga ese día.
                  const SET_COLORS = ['var(--accent-emerald)', 'var(--accent-cyan)', 'var(--accent-purple)', 'var(--accent-amber)', '#ec4899', '#22d3ee'];
                  const maxSets = Math.max(1, ...day.exercises.map((ex) => (ex.sets || []).length));
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 540 }}>
                      <thead>
                        <tr style={{ background: '#1e293b', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Ejercicio</th>
                          {Array.from({ length: maxSets }, (_, i) => (
                            <th key={i} style={{ padding: '8px 12px', textAlign: 'center', color: SET_COLORS[i % SET_COLORS.length] }}>S{i + 1}</th>
                          ))}
                          <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Rango</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.exercises.map((ex, idx) => (
                          <tr key={ex.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                            <td style={{ padding: '9px 12px', fontWeight: 700 }}>{ex.name}</td>
                            {Array.from({ length: maxSets }, (_, si) => {
                              const s = (ex.sets || [])[si];
                              const color = SET_COLORS[si % SET_COLORS.length];
                              if (!s) return <td key={si} />;
                              return (
                                <td key={si} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                    <input
                                      type="text" inputMode="numeric" step="0.25" placeholder="kg" value={s.kg}
                                      onChange={(e) => updateExerciseSet(activeClient.id, currentMicro.weekNumber, day.dayName, ex.id, si, 'kg', e.target.value)}
                                      style={{ width: 44, background: '#0f172a', border: `1px solid ${color}40`, color: '#fff', textAlign: 'center', padding: '4px 2px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700 }}
                                    />
                                    <input
                                      type="text" inputMode="numeric" placeholder="reps" value={s.reps}
                                      onChange={(e) => updateExerciseSet(activeClient.id, currentMicro.weekNumber, day.dayName, ex.id, si, 'reps', e.target.value)}
                                      style={{ width: 38, background: '#0f172a', border: `1px solid ${color}40`, color: '#fff', textAlign: 'center', padding: '4px 2px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700 }}
                                    />
                                    <input
                                      type="text" placeholder="rir" value={s.rir}
                                      onChange={(e) => updateExerciseSet(activeClient.id, currentMicro.weekNumber, day.dayName, ex.id, si, 'rir', e.target.value)}
                                      style={{ width: 32, background: '#0f172a', border: `1px solid ${color}40`, color, textAlign: 'center', padding: '4px 2px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 800 }}
                                    />
                                  </div>
                                </td>
                              );
                            })}
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ex.targetReps}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          )) : (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Tu entrenador aún no ha asignado ningún microciclo.
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD VIDEO ── */}
      {activeTab === 'upload' && (
        <div className="glass-panel glow-border" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 800, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Upload size={20} /> Subir Vídeo de Ejecución
          </h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Selecciona el ejercicio, introduce los datos y adjunta el vídeo para que tu entrenador analice la técnica.
          </p>

          {success && (
            <div style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid var(--accent-emerald)', padding: 12, borderRadius: 8, fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
              <CheckCircle2 size={18} color="var(--accent-emerald)" /> ¡Vídeo enviado a tu entrenador! Te avisaremos cuando lo analice.
            </div>
          )}

          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>1. Ejercicio</label>
              {allExercises.length > 0 ? (
                <select value={exercise} onChange={(e) => setExercise(e.target.value)} style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 12, borderRadius: 8, fontSize: '0.9rem', fontWeight: 600 }}>
                  <option value="">— Selecciona ejercicio —</option>
                  {[...new Set(allExercises)].map((e) => <option key={e}>{e}</option>)}
                </select>
              ) : (
                <input value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="Ej: Sentadilla Hack" style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 12, borderRadius: 8, fontSize: '0.9rem' }} />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
              {[['Kilos (kg)', loadKg, setLoadKg], ['Reps', reps, setReps], ['RPE', rpe, setRpe], ['RIR', rir, setRir]].map(([label, val, setter]) => (
                <div key={label}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input type="text" inputMode="numeric" step="0.5" value={val} onChange={(e) => setter(e.target.value)}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', fontWeight: 800, padding: 10, borderRadius: 8, textAlign: 'center', fontSize: '1rem' }}
                  />
                </div>
              ))}
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>2. Archivo de vídeo (desde el móvil)</label>
              <input type="file" accept="video/*" style={{ width: '100%', background: '#0f172a', border: '1px dashed var(--accent-emerald)', padding: 12, borderRadius: 8, color: '#fff', cursor: 'pointer' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>3. ¿Alguna duda o comentario? (Opcional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: Sentí molestia en rodilla derecha en la rep 5..."
                style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 10, borderRadius: 8, fontSize: '0.88rem' }}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: '1rem' }}>
              <Upload size={18} /> Enviar para Revisión
            </button>
          </form>
        </div>
      )}

      {/* ── MY DIET ── */}
      {activeTab === 'nutrition' && (() => {
        const variant = nut.hasDayVariants ? dietView : 'default';
        const meals = variant === 'training' ? nut.closedMealsTraining : variant === 'rest' ? nut.closedMealsRest : nut.closedMeals;
        const mealsTotalKcal = (meals || []).reduce((sum, meal) => sum + Math.max(0, ...meal.options.map(calcOptionKcals), 0), 0);

        return (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ background: '#f87171', padding: '10px 16px', borderRadius: 8, textAlign: 'center', fontWeight: 900, fontSize: '1.05rem', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
              MI PLAN NUTRICIONAL {nut.type === 'closed' ? '— MENÚ CERRADO' : '— POR MACROS'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'KCALS OBJETIVO', value: `${nut.targetKcals || '—'}`, color: '#f87171' },
                { label: 'PROTEÍNA', value: `${nut.proteinGrams || '—'}g`, color: 'var(--accent-emerald)' },
                { label: 'CARBOS', value: `${nut.carbsGrams || '—'}g`, color: 'var(--accent-cyan)' },
                { label: 'GRASAS', value: `${nut.fatsGrams || '—'}g`, color: 'var(--accent-amber)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#0f172a', padding: '1.25rem', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>

            {nut.type === 'closed' && (
              <>
                {nut.hasDayVariants && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', background: '#0f172a', padding: 4, borderRadius: 12, width: 'fit-content' }}>
                    <button
                      onClick={() => setDietView('training')}
                      style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.82rem', border: 'none', cursor: 'pointer', background: dietView === 'training' ? 'var(--accent-emerald)' : 'transparent', color: dietView === 'training' ? '#000' : 'var(--text-muted)' }}
                    >
                      Días de Entreno
                    </button>
                    <button
                      onClick={() => setDietView('rest')}
                      style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.82rem', border: 'none', cursor: 'pointer', background: dietView === 'rest' ? 'var(--accent-cyan)' : 'transparent', color: dietView === 'rest' ? '#000' : 'var(--text-muted)' }}
                    >
                      Días de Descanso
                    </button>
                  </div>
                )}

                {meals?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontWeight: 800, color: 'var(--accent-emerald)' }}>📋 Menú Estructurado</h4>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-amber)' }}>~{mealsTotalKcal} kcal/día (opción por defecto)</span>
                    </div>
                    {meals.map((meal) => (
                      <div key={meal.id} style={{ background: '#0f172a', padding: '1rem', borderRadius: 14, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--accent-emerald)', marginBottom: 10 }}>{meal.name}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {meal.options.map((opt, oi) => (
                            <div key={opt.id} style={{ background: '#1e293b', borderRadius: 12, padding: '0.75rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Opción {oi + 1}</span>
                                <span style={{ fontWeight: 800, color: 'var(--accent-amber)', fontSize: '0.82rem' }}>{calcOptionKcals(opt)} kcal</span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {(opt.foods || []).map((food) => (
                                  <span key={food.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                    {food.name} <span style={{ color: 'var(--text-muted)' }}>· {food.grams}g</span>
                                  </span>
                                ))}
                                {(!opt.foods || opt.foods.length === 0) && (
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{opt.description || 'Sin alimentos configurados'}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tu entrenador aún no ha configurado el menú cerrado.</p>
                )}
              </>
            )}
            {nut.stepsGoal && (
              <div style={{ marginTop: '1rem', background: '#0f172a', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                🚶 <strong>Pasos diarios:</strong> {nut.stepsGoal}
              </div>
            )}
            {nut.habitsNotes?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
              <h4 style={{ fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: 8 }}>💡 Recomendaciones de tu Entrenador</h4>
              {nut.habitsNotes.map((note, i) => (
                <div key={i} style={{ background: '#0f172a', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: 6, fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--accent-emerald)', marginRight: 8 }}>✓</span>{note}
                </div>
              ))}
            </div>
          )}
          </div>
        );
      })()}

      {/* ── WEIGHT REGISTER ── */}
      {activeTab === 'weight' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 800, color: 'var(--accent-amber)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale size={18} /> Registro de Peso Semanal (3 Días Alternos)
          </h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Pésate 3 días alternos (ej: Lunes, Miércoles y Viernes) por la mañana, en ayunas y tras ir al baño.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '1rem', alignItems: 'center' }}>
            {['day1', 'day2', 'day3'].map((key, i) => (
              <div key={key} style={{ background: '#0f172a', padding: 14, borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Día {i + 1} ({['L', 'X', 'V'][i]})
                </label>
                <input
                  type="text" inputMode="numeric" step="0.05"
                  value={anth.threeDayWeights?.[key] || ''}
                  onChange={(e) => updateThreeDayWeights(activeClient.id, { ...anth.threeDayWeights, [key]: e.target.value })}
                  placeholder="81.5"
                  style={{ width: '100%', background: '#1e293b', border: 'none', color: '#fff', fontWeight: 900, padding: '10px', borderRadius: 8, textAlign: 'center', fontSize: '1.2rem' }}
                />
              </div>
            ))}
            <div style={{ background: 'rgba(245,158,11,0.15)', padding: 16, borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontWeight: 700, textTransform: 'uppercase' }}>Promedio</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginTop: 4 }}>
                {anth.threeDayWeights?.day1 && anth.threeDayWeights?.day2 && anth.threeDayWeights?.day3
                  ? ((Number(anth.threeDayWeights.day1) + Number(anth.threeDayWeights.day2) + Number(anth.threeDayWeights.day3)) / 3).toFixed(2)
                  : '—'
                } <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>kg</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MY VIDEO REVIEWS ── */}
      {activeTab === 'feedback' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontWeight: 800, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={18} /> Historial de Revisiones
          </h3>
          {clientVideos.length === 0 && (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Aún no has subido ningún vídeo de ejecución.
            </div>
          )}
          {clientVideos.map((v) => (
            <div key={v.id} className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>{v.exercise}</span>
                <span className={`badge ${v.status === 'reviewed' ? 'badge-reviewed' : 'badge-pending'}`}>
                  {v.status === 'reviewed' ? '✓ Analizado' : '⏳ En revisión'}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                {v.loadKg} kg × {v.reps} reps @ RPE {v.rpe} · {new Date(v.date).toLocaleDateString('es-ES')}
              </div>
              {v.coachFeedback && (
                <div style={{ background: 'rgba(16,185,129,0.1)', padding: '12px 14px', borderRadius: 8, borderLeft: '3px solid var(--accent-emerald)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent-emerald)', marginBottom: 4 }}>
                    Feedback de tu Entrenador — {v.coachFeedback.rating}
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#fff' }}>"{v.coachFeedback.text}"</p>
                  {v.timestamps?.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {v.timestamps.map((t, i) => (
                        <span key={i} style={{ background: '#1e293b', padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem' }}>
                          <strong style={{ color: 'var(--accent-emerald)' }}>{t.time}</strong> — {t.note}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};