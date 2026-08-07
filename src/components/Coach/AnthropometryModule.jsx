import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Save, Scale, Ruler } from 'lucide-react';

const FOLDS_LABELS = {
  tricipital: 'Tricipital',
  subescapular: 'Subescapular',
  abdominal: 'Abdominal',
  suprailiaco: 'Suprailíaco',
  muslo: 'Muslo',
  pantorrilla: 'Pantorrilla',
};

const PERIMETER_LABELS = {
  pecho: 'Pecho',
  brazoD: 'Brazo Dcho.',
  brazoI: 'Brazo Izq.',
  ombligo: 'Ombligo',
  gluteo: 'Glúteo',
  musloD: 'Muslo Dcho.',
  musloI: 'Muslo Izq.',
  gemeloD: 'Gemelo Dcho.',
  gemeloI: 'Gemelo Izq.',
};

const emptyFolds = () => ({ tricipital: '', subescapular: '', abdominal: '', suprailiaco: '', muslo: '', pantorrilla: '' });
const emptyPerimeters = () => ({ pecho: '', brazoD: '', brazoI: '', ombligo: '', gluteo: '', musloD: '', musloI: '', gemeloD: '', gemeloI: '' });

export const AnthropometryModule = () => {
  const { activeClient, anthropometry, calcFatPct, addAnthropometryLog, updateThreeDayWeights } = useApp();

  const clientAnth = anthropometry[activeClient.id] || { threeDayWeights: { day1: '', day2: '', day3: '' }, history: [] };
  const history = clientAnth.history || [];
  const tdw = clientAnth.threeDayWeights;

  const avgWeight = tdw.day1 && tdw.day2 && tdw.day3
    ? ((Number(tdw.day1) + Number(tdw.day2) + Number(tdw.day3)) / 3).toFixed(2)
    : '—';

  const [newFolds, setNewFolds] = useState(emptyFolds());
  const [newPerimeters, setNewPerimeters] = useState(emptyPerimeters());
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newWeight, setNewWeight] = useState('');

  const foldsSum = Object.values(newFolds).reduce((a, b) => a + Number(b || 0), 0);
  const fatPct = foldsSum > 0 ? calcFatPct(Object.fromEntries(Object.entries(newFolds).map(([k, v]) => [k, Number(v || 0)])), activeClient.gender) : '—';

  const handleSaveLog = () => {
    if (!newDate || !newWeight) {
      alert('Introduce al menos la fecha y el peso.');
      return;
    }
    addAnthropometryLog(activeClient.id, {
      date: newDate,
      weight: Number(newWeight),
      perimeters: Object.fromEntries(Object.entries(newPerimeters).map(([k, v]) => [k, Number(v || 0)])),
      skinFolds: Object.fromEntries(Object.entries(newFolds).map(([k, v]) => [k, Number(v || 0)])),
    });
    setNewFolds(emptyFolds());
    setNewPerimeters(emptyPerimeters());
    setNewWeight('');
    setNewDate(new Date().toISOString().split('T')[0]);
    alert('¡Registro guardado correctamente!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── 3-DAY WEIGHT ── */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontWeight: 800, marginBottom: '1rem', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Scale size={18} /> Peso Promedio Semanal (3 Días Alternos: L, X, V)
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Nota: Rellenar el peso en 3 días alternos y obtener el promedio para ver la evolución real.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '1rem', alignItems: 'center' }}>
          {['day1', 'day2', 'day3'].map((key, i) => (
            <div key={key} style={{ background: '#0f172a', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Día {i + 1} (Ej: {['Lunes', 'Miércoles', 'Viernes'][i]})
              </label>
              <input
                type="text" inputMode="numeric" step="0.05"
                value={tdw[key] || ''}
                onChange={(e) => updateThreeDayWeights(activeClient.id, { ...tdw, [key]: e.target.value })}
                style={{ width: '100%', background: '#1e293b', border: 'none', color: '#fff', fontWeight: 800, padding: '8px', borderRadius: 6, textAlign: 'center', fontSize: '1.1rem' }}
              />
            </div>
          ))}
          <div style={{ background: 'rgba(245,158,11,0.15)', padding: 14, borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Promedio Semanal</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginTop: 2 }}>{avgWeight} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>kg</span></div>
          </div>
        </div>
      </div>

      {/* ── FORMULA INFO BOX ── */}
      <div className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: '0.83rem' }}>
          <strong style={{ color: '#f87171' }}>Fórmula Hombres:</strong>
          <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>% Graso = 2,59 + (suma 6 pliegues mm × 0,1051)</span>
        </div>
        <div style={{ fontSize: '0.83rem' }}>
          <strong style={{ color: '#ec4899' }}>Fórmula Mujeres:</strong>
          <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>% Graso = 3,5803 + (suma 6 pliegues mm × 0,1548)</span>
        </div>
        <div style={{ fontSize: '0.83rem', fontWeight: 700 }}>
          <span style={{ color: 'var(--text-muted)' }}>Sexo detectado: </span>
          <span style={{ color: activeClient.gender === 'Mujer' ? '#ec4899' : '#06b6d4' }}>{activeClient.gender}</span>
        </div>
      </div>

      {/* ── NEW RECORD FORM ── */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontWeight: 800, marginBottom: '1.25rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Nuevo Registro Antropométrico
        </h3>

        {/* Date + Weight */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha</label>
            <input
              type="date" value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '10px', borderRadius: 8, fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Peso (kg)</label>
            <input
              type="text" inputMode="numeric" step="0.05" value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder="81.3"
              style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '10px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 700 }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Pliegues */}
          <div>
            <h4 style={{ fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              🩸 Pliegues Cutáneos (mm)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {Object.entries(FOLDS_LABELS).map(([key, label]) => (
                <div key={key} style={{ background: '#0f172a', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
                  <input
                    type="text" inputMode="numeric" step="0.5"
                    value={newFolds[key]}
                    onChange={(e) => setNewFolds({ ...newFolds, [key]: e.target.value })}
                    style={{ width: 50, background: '#1e293b', border: 'none', color: '#fff', fontWeight: 800, padding: '4px', textAlign: 'center', borderRadius: 4, fontSize: '0.9rem' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ background: 'rgba(6,182,212,0.15)', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(6,182,212,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>SUMA: {foldsSum} mm</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>% Graso: {fatPct}%</div>
              </div>
            </div>
          </div>

          {/* Perímetros */}
          <div>
            <h4 style={{ fontWeight: 800, color: 'var(--accent-emerald)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ruler size={16} /> Perímetros Corporales (cm)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {Object.entries(PERIMETER_LABELS).map(([key, label]) => (
                <div key={key} style={{ background: '#0f172a', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
                  <input
                    type="text" inputMode="numeric" step="0.5"
                    value={newPerimeters[key]}
                    onChange={(e) => setNewPerimeters({ ...newPerimeters, [key]: e.target.value })}
                    style={{ width: 55, background: '#1e293b', border: 'none', color: '#fff', fontWeight: 800, padding: '4px', textAlign: 'center', borderRadius: 4, fontSize: '0.9rem' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={handleSaveLog} style={{ fontSize: '0.95rem', padding: '12px 24px' }}>
            <Save size={16} /> Guardar Registro Completo
          </button>
        </div>
      </div>

      {/* ── HISTORY TABLE ── */}
      {history.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontWeight: 800, marginBottom: '1rem', color: 'var(--text-muted)' }}>📋 Historial de Revisiones</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#1e293b', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)' }}>Fecha</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--accent-amber)' }}>Peso (kg)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--accent-cyan)' }}>% Graso</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Ombligo (cm)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Pecho (cm)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>Σ Pliegues (mm)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const foldSum = h.skinFolds ? Object.values(h.skinFolds).reduce((a, b) => a + Number(b), 0) : 0;
                  const fp = h.skinFolds ? calcFatPct(h.skinFolds, activeClient.gender) : '—';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>{h.date}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--accent-amber)' }}>{h.weight}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--accent-cyan)' }}>{fp}%</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{h.perimeters?.ombligo || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{h.perimeters?.pecho || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{foldSum}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
