import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BarChart3, TrendingDown, Activity, Zap } from 'lucide-react';

const MUSCLE_COLORS = {
  'Pecho': '#f43f5e',
  'Dorsal': '#06b6d4',
  'Espalda Alta': '#3b82f6',
  'Tríceps': '#8b5cf6',
  'Bíceps': '#ec4899',
  'Deltoides Anterior': '#f59e0b',
  'Deltoides Lateral': '#10b981',
  'Deltoides Posterior': '#14b8a6',
  'Cuádriceps': '#84cc16',
  'Isquiotibiales': '#22d3ee',
  'Glúteos': '#a855f7',
  'Aductor': '#fb923c',
  'Gemelo': '#6ee7b7',
  'Abdominales': '#fbbf24',
  'Otros': '#94a3b8',
};

const MRV_GOALS = {
  'Pecho': { mev: 8, mrv: 20 },
  'Dorsal': { mev: 10, mrv: 22 },
  'Espalda Alta': { mev: 10, mrv: 22 },
  'Tríceps': { mev: 6, mrv: 18 },
  'Bíceps': { mev: 6, mrv: 20 },
  'Deltoides Anterior': { mev: 6, mrv: 16 },
  'Deltoides Lateral': { mev: 6, mrv: 22 },
  'Deltoides Posterior': { mev: 6, mrv: 22 },
  'Cuádriceps': { mev: 8, mrv: 20 },
  'Isquiotibiales': { mev: 6, mrv: 16 },
  'Glúteos': { mev: 4, mrv: 16 },
  'Aductor': { mev: 4, mrv: 12 },
};

export const VolumeAnalytics = () => {
  const { activeClient, workoutData, calcMuscleVolume, calcTonnage, anthropometry } = useApp();

  const cd = workoutData[activeClient.id];
  const microcycles = cd?.microcycles || [];
  const [selectedWeek, setSelectedWeek] = useState(
    microcycles.length > 0 ? microcycles[microcycles.length - 1].weekNumber : 1
  );

  const volumeMap = calcMuscleVolume(activeClient.id, selectedWeek);
  const tonnage = calcTonnage(activeClient.id, selectedWeek);

  // Weight history for sparkline
  const weightHistory = [...(anthropometry[activeClient.id]?.history || [])]
    .reverse()
    .map((h) => ({ date: h.date, weight: h.weight }));

  const muscleEntries = Object.entries(volumeMap).sort((a, b) => b[1] - a[1]);
  const maxSeries = Math.max(...muscleEntries.map(([, v]) => v), 1);

  // Tonnage per week (historical)
  const tonnageHistory = microcycles.map((m) => ({
    week: `Sem ${m.weekNumber}`,
    tonnage: Number(calcTonnage(activeClient.id, m.weekNumber)),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── HEADER BANNER ── */}
      <div className="glass-panel" style={{
        padding: '1.5rem',
        borderLeft: '4px solid var(--accent-emerald)',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(6,182,212,0.05) 100%)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.7rem', fontWeight: 900, letterSpacing: -0.5 }}>
              {activeClient.name.toUpperCase()}
            </h1>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {activeClient.plan} · Iniciado: {activeClient.startDate} · Sexo: {activeClient.gender}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ background: '#0f172a', padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border-color)', textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Peso Actual</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>{activeClient.currentWeight} kg</div>
            </div>
            <div style={{ background: '#0f172a', padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border-color)', textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Tonelaje Sem.</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{tonnage} kg</div>
            </div>
            <div style={{ background: '#0f172a', padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border-color)', textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Semanas</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-purple)' }}>{microcycles.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── WEEKLY SPLIT OVERVIEW ── */}
      {cd && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontWeight: 800, color: '#f87171', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} /> Estructura Semanal
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
            {Object.entries(cd.weeklySplit).map(([day, val]) => (
              <div key={day} style={{
                background: val === 'Descanso' ? '#0f172a' : 'rgba(16,185,129,0.15)',
                border: `1px solid ${val === 'Descanso' ? 'var(--border-color)' : 'var(--accent-emerald)'}`,
                borderRadius: 10, padding: '10px 6px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-muted)' }}>{day}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 4, color: val === 'Descanso' ? 'var(--text-dark)' : '#fff' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VOLUME CHART ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
        {/* Table */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={18} /> Volumen por Músculo
            </h4>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: '0.8rem' }}
            >
              {microcycles.map((m) => (
                <option key={m.weekNumber} value={m.weekNumber}>Semana {m.weekNumber}</option>
              ))}
            </select>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#1e293b', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Músculo</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>Series</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>MEV</th>
              </tr>
            </thead>
            <tbody>
              {muscleEntries.map(([muscle, count]) => {
                const goals = MRV_GOALS[muscle];
                const isAboveMEV = goals && count >= goals.mev;
                const isAboveMRV = goals && count > goals.mrv;
                return (
                  <tr key={muscle} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 700 }}>{muscle}</td>
                    <td style={{
                      padding: '7px 12px', textAlign: 'right', fontWeight: 800,
                      color: isAboveMRV ? '#f43f5e' : isAboveMEV ? '#10b981' : 'var(--text-muted)',
                    }}>
                      {count}
                      {isAboveMRV && <span style={{ fontSize: '0.7rem', marginLeft: 4 }}>⚠ MRV</span>}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-dark)', fontSize: '0.8rem' }}>
                      {goals ? `${goals.mev}-${goals.mrv}` : '—'}
                    </td>
                  </tr>
                );
              })}
              {muscleEntries.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin datos en esta semana</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Horizontal bar chart */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h4 style={{ fontWeight: 800, marginBottom: '1rem', color: '#f87171' }}>
            Análisis Gráfico — Series Efectivas por Grupo Muscular
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {muscleEntries.map(([muscle, count]) => {
              const pct = Math.min((count / maxSeries) * 100, 100);
              const color = MUSCLE_COLORS[muscle] || '#94a3b8';
              const goals = MRV_GOALS[muscle];
              const mrvPct = goals ? Math.min((goals.mrv / maxSeries) * 100, 100) : null;
              return (
                <div key={muscle} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 140, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                    {muscle}
                  </span>
                  <div style={{ flex: 1, background: '#0f172a', height: 24, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                    {/* MRV reference line */}
                    {mrvPct && (
                      <div style={{
                        position: 'absolute', left: `${mrvPct}%`, top: 0, bottom: 0,
                        width: 2, background: 'rgba(244,63,94,0.5)', zIndex: 2,
                      }} />
                    )}
                    <div style={{
                      width: `${pct}%`, height: '100%',
                      background: `linear-gradient(90deg, ${color} 0%, ${color}99 100%)`,
                      borderRadius: 6, display: 'flex', alignItems: 'center',
                      justifyContent: 'flex-end', paddingRight: 8,
                      fontSize: '0.75rem', fontWeight: 800, color: '#fff',
                      transition: 'width 0.4s ease',
                    }}>
                      {count > 0 ? `${count}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            {muscleEntries.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                Sin datos para esta semana
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-dark)', display: 'flex', gap: 16 }}>
            <span>🟥 Línea roja = MRV (Máximo Volumen Recuperable)</span>
            <span style={{ color: 'var(--accent-emerald)' }}>Verde = Por encima del MEV</span>
          </div>
        </div>
      </div>

      {/* ── TONNAGE TREND ── */}
      {tonnageHistory.length > 1 && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h4 style={{ fontWeight: 800, marginBottom: '1rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingDown size={18} /> Progresión de Tonelaje Semanal (kg totales levantados)
          </h4>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 100 }}>
            {tonnageHistory.map((w, i) => {
              const maxT = Math.max(...tonnageHistory.map((x) => x.tonnage), 1);
              const pct = (w.tonnage / maxT) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{w.tonnage}</span>
                  <div style={{
                    width: '100%', height: `${pct}%`, minHeight: 10,
                    background: `linear-gradient(180deg, var(--accent-cyan) 0%, var(--accent-emerald) 100%)`,
                    borderRadius: '6px 6px 0 0',
                  }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{w.week}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── WEIGHT TREND ── */}
      {weightHistory.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h4 style={{ fontWeight: 800, marginBottom: '1rem', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingDown size={18} /> Evolución de Peso Corporal
          </h4>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', height: 80 }}>
            {weightHistory.map((w, i) => {
              const weights = weightHistory.map((x) => x.weight);
              const minW = Math.min(...weights);
              const maxW = Math.max(...weights);
              const range = maxW - minW || 1;
              const pct = ((w.weight - minW) / range) * 60 + 20;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-amber)' }}>{w.weight}</span>
                  <div style={{
                    width: '60%', height: `${pct}%`, minHeight: 10,
                    background: 'linear-gradient(180deg, var(--accent-amber) 0%, #f59e0b55 100%)',
                    borderRadius: '6px 6px 0 0',
                  }} />
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{w.date}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
