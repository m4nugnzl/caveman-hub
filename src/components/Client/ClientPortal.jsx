import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Dumbbell, Upload, Utensils, Scale, MessageSquare, Play, CheckCircle2, Mic } from 'lucide-react';

const CLIENT_TABS = [
  { id: 'workout', label: 'Mi Rutina', icon: Dumbbell },
  { id: 'upload', label: 'Subir Vídeo', icon: Upload },
  { id: 'nutrition', label: 'Mi Dieta', icon: Utensils },
  { id: 'weight', label: 'Registrar Peso', icon: Scale },
  { id: 'feedback', label: 'Mis Revisiones', icon: MessageSquare },
];

export const ClientPortal = () => {
  const { activeClient, workoutData, nutrition, anthropometry, videos, uploadClientVideo, updateThreeDayWeights } = useApp();
  const [activeTab, setActiveTab] = useState('workout');

  const cd = workoutData[activeClient.id];
  const microcycles = cd?.microcycles || [];
  const currentMicro = microcycles[microcycles.length - 1] || microcycles[0];

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

          {currentMicro ? currentMicro.days.map((day, dIdx) => (
            <div key={dIdx} className="glass-panel" style={{ padding: '1.25rem' }}>
              <div style={{ background: '#f87171', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.95rem', textTransform: 'uppercase', marginBottom: '1rem' }}>
                {day.dayName}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 540 }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Ejercicio</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent-emerald)' }}>S1</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent-cyan)' }}>S2</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent-purple)' }}>S3</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--accent-amber)' }}>S4</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Rango</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.exercises.map((ex, idx) => (
                      <tr key={ex.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700 }}>{ex.name}</td>
                        {['set1', 'set2', 'set3', 'set4'].map((sk, si) => (
                          <td key={sk} style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: ['var(--accent-emerald)', 'var(--accent-cyan)', 'var(--accent-purple)', 'var(--accent-amber)'][si] }}>
                            {ex[sk]?.kg ? `${ex[sk].kg}×${ex[sk].reps}` : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ex.targetReps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <input type="number" step="0.5" value={val} onChange={(e) => setter(e.target.value)}
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
      {activeTab === 'nutrition' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ background: '#f87171', padding: '10px 16px', borderRadius: 8, textAlign: 'center', fontWeight: 900, fontSize: '1.05rem', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            MI PLAN NUTRICIONAL
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'KCALS', value: `${nut.targetKcals || '—'}`, color: '#f87171' },
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
          {nut.type === 'closed' && nut.closedMeals?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ fontWeight: 800, color: 'var(--accent-emerald)' }}>📋 Menú Estructurado</h4>
              {nut.closedMeals.map((meal, i) => (
                <div key={i} style={{ background: '#0f172a', padding: '1rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 800, color: 'var(--accent-emerald)', marginBottom: 4 }}>{meal.name}</div>
                  <div style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{meal.description}</div>
                </div>
              ))}
            </div>
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
      )}

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
                  type="number" step="0.05"
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