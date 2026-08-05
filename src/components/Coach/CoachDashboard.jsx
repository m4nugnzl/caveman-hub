import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BarChart3, Dumbbell, Ruler, Utensils, Video, Users, Camera, ChevronDown } from 'lucide-react';
import { VolumeAnalytics } from './VolumeAnalytics';
import { WorkoutLogEditor } from './WorkoutLogEditor';
import { AnthropometryModule } from './AnthropometryModule';
import { NutritionModule } from './NutritionModule';
import { VideoReviewHub } from './VideoReviewHub';
import { ClientRoster } from './ClientRoster';
import { ProgressCompare } from './ProgressCompare';

const TABS = [
  { id: 'volume', label: 'Resumen & Volumen', icon: BarChart3 },
  { id: 'workout', label: 'Rutina & Microciclos', icon: Dumbbell },
  { id: 'anthropometry', label: 'Antropometría & % Graso', icon: Ruler },
  { id: 'nutrition', label: 'Nutrición & Hábitos', icon: Utensils },
  { id: 'videos', label: 'Análisis de Vídeos', icon: Video },
  { id: 'clients', label: 'Clientes & Pagos', icon: Users },
  { id: 'progress', label: 'Fotos de Progreso', icon: Camera },
];

export const CoachDashboard = () => {
  const [activeTab, setActiveTab] = useState('volume');
  const { clients, selectedClientId, setSelectedClientId, videos, activeClient } = useApp();
  const pendingCount = videos.filter((v) => v.status === 'pending').length;

  return (
    <div className="layout-container">
      {/* ── CLIENT SELECTOR BAR ── */}
      <div className="glass-panel" style={{ padding: '10px 20px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Atleta:</span>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            style={{ background: '#1e293b', color: '#fff', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: 8, fontWeight: 800, fontSize: '0.95rem' }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.plan}
              </option>
            ))}
          </select>
          {activeClient && (
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`badge ${activeClient.paymentStatus === 'paid' ? 'badge-reviewed' : 'badge-urgent'}`}>
                {activeClient.paymentStatus === 'paid' ? '💳 Al día' : '⚠ Pago pendiente'}
              </span>
              <span className="badge badge-active">{activeClient.currentWeight} kg</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>
          ✦ FitCoach Hub — Panel del Entrenador
        </div>
      </div>

      {/* ── MAIN TABS ── */}
      <div className="tabs-nav">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} />
            {label}
            {id === 'videos' && pendingCount > 0 && (
              <span style={{ background: '#f43f5e', color: '#fff', fontSize: '0.68rem', padding: '2px 6px', borderRadius: 10 }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      {activeTab === 'volume' && <VolumeAnalytics />}
      {activeTab === 'workout' && <WorkoutLogEditor />}
      {activeTab === 'anthropometry' && <AnthropometryModule />}
      {activeTab === 'nutrition' && <NutritionModule />}
      {activeTab === 'videos' && <VideoReviewHub />}
      {activeTab === 'clients' && <ClientRoster />}
      {activeTab === 'progress' && <ProgressCompare />}
    </div>
  );
};