import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Camera, TrendingDown, ArrowRight, Award, Calendar, Layers } from 'lucide-react';

export const ProgressCompare = () => {
  const { progressPhotos, clients } = useApp();
  const [selectedPhotoId, setSelectedPhotoId] = useState(progressPhotos[0]?.id || null);

  const currentPhoto = progressPhotos.find(p => p.id === selectedPhotoId) || progressPhotos[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="var(--accent-purple)" /> Comparador de Evolución Física (Semana 1 vs Actual)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Inspecciona visualmente el cambio corporal y métricas antropométricas del cliente sin rebuscar en chat o Drive.
          </p>
        </div>

        <select
          value={selectedPhotoId}
          onChange={(e) => setSelectedPhotoId(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid var(--border-color)', padding: '8px 14px', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
        >
          {progressPhotos.map(p => (
            <option key={p.id} value={p.id}>{p.clientName} (12 Semanas de Cambio)</option>
          ))}
        </select>
      </div>

      {currentPhoto && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
          {/* Side-by-side Photos Grid */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent-emerald)' }}>
                Comparativa Visual de {currentPhoto.clientName}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vista de Frente</span>
            </div>

            <div className="comparison-grid">
              {/* Week 1 Photo */}
              <div className="photo-card">
                <img src={currentPhoto.week1PhotoFront} alt="Semana 1" />
                <div className="photo-label">
                  📅 Inicio ({currentPhoto.week1Date}) — {currentPhoto.week1Weight} kg
                </div>
              </div>

              {/* Current Week Photo */}
              <div className="photo-card" style={{ border: '2px solid var(--accent-emerald)' }}>
                <img src={currentPhoto.currentWeekPhotoFront} alt="Actual" />
                <div className="photo-label" style={{ background: 'rgba(16, 185, 129, 0.85)', color: '#fff' }}>
                  🔥 Actual ({currentPhoto.currentWeekDate}) — {currentPhoto.currentWeight} kg
                </div>
              </div>
            </div>
          </div>

          {/* Right Metrics Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TrendingDown size={18} /> Resultados Antropométricos
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Variación de Peso Corporal</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-emerald)', marginTop: '2px' }}>
                    {(currentPhoto.currentWeight - currentPhoto.week1Weight).toFixed(1)} kg
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    De {currentPhoto.week1Weight} kg a {currentPhoto.currentWeight} kg
                  </div>
                </div>

                <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cintura / Perímetro Abdominal</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)', marginTop: '2px' }}>
                    {currentPhoto.waistChangeCm} cm
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px' }}>Observaciones del Entrenador</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {currentPhoto.notes}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
