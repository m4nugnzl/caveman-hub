import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Dumbbell, Youtube, Plus, ExternalLink, Play, FileText, CheckCircle } from 'lucide-react';

export const RoutineManager = () => {
  const { routines, clients, updateClientStatus } = useApp();
  const [selectedClientForAssign, setSelectedClientForAssign] = useState(clients[0]?.id || '');
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const currentRoutine = routines[0];

  const handleAssignRoutine = () => {
    if (!selectedClientForAssign) return;
    const client = clients.find(c => c.id === selectedClientForAssign);
    updateClientStatus(selectedClientForAssign, {
      youtubeExplanationUrl: youtubeUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      routineId: currentRoutine.id
    });
    alert(`¡Rutina y enlace de vídeo explicativo asignados correctamente a ${client?.name}!`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Assign Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--accent-emerald)" /> Gestor de Rutinas & Vídeo Explicativo YouTube
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Asigna programas de entrenamiento e integra el vídeo explicativo grabado en oculto de YouTube.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={selectedClientForAssign}
            onChange={(e) => setSelectedClientForAssign(e.target.value)}
            style={{ background: '#0f172a', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>Asignar a: {c.name}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="URL vídeo YouTube oculto..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            style={{ background: '#0f172a', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', width: '220px' }}
          />

          <button className="btn-primary" onClick={handleAssignRoutine}>
            <CheckCircle size={16} /> Asignar Programa
          </button>
        </div>
      </div>

      {/* Routine Detail View */}
      {currentRoutine && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: '1rem' }}>
              {currentRoutine.name}
            </h3>

            {currentRoutine.days.map((day, dIdx) => (
              <div key={dIdx} style={{ marginBottom: '1.5rem', background: '#0f172a', borderRadius: 'var(--radius-sm)', padding: '1.25rem', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: '10px', color: 'var(--accent-emerald)' }}>
                  {day.dayName}
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {day.exercises.map((ex, eIdx) => (
                    <div
                      key={eIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 80px 100px 80px 100px',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        background: '#1e293b',
                        borderRadius: '8px',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{ex.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}><strong>Series:</strong> {ex.sets}</span>
                      <span style={{ color: 'var(--text-muted)' }}><strong>Reps:</strong> {ex.reps}</span>
                      <span style={{ color: 'var(--accent-amber)' }}><strong>RIR:</strong> {ex.rir}</span>
                      <span style={{ color: 'var(--text-muted)' }}>⏱️ {ex.rest}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
