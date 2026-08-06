import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Camera, TrendingDown, Upload } from 'lucide-react';

export const ProgressCompare = () => {
  const { activeClient, progressPhotos, uploadProgressPhoto } = useApp();
  const [uploading, setUploading] = useState(false);

  const clientPhotos = progressPhotos
    .filter((p) => p.clientId === activeClient.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // más reciente primero

  const [beforeId, setBeforeId] = useState(null);
  const [afterId, setAfterId] = useState(null);

  React.useEffect(() => {
    if (clientPhotos.length >= 2) {
      setAfterId(clientPhotos[0].id);
      setBeforeId(clientPhotos[clientPhotos.length - 1].id);
    } else {
      setAfterId(clientPhotos[0]?.id || null);
      setBeforeId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClient.id, progressPhotos.length]);

  const before = clientPhotos.find((p) => p.id === beforeId);
  const after = clientPhotos.find((p) => p.id === afterId);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const angle = window.prompt('Ángulo (frontal / lateral / espalda):', 'frontal') || 'frontal';
    const weight = window.prompt('Peso en esa foto (kg, opcional):', '') || '';
    try {
      await uploadProgressPhoto({ clientId: activeClient.id, file, angle, weight });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="var(--accent-purple)" /> Comparador de Evolución Física — {activeClient.name}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Sube fotos de progreso y compara dos fechas cualquiera.
          </p>
        </div>

        <label className="btn-primary" style={{ cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
          <Upload size={16} /> {uploading ? 'Subiendo…' : 'Subir foto'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {clientPhotos.length === 0 && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Este cliente todavía no tiene fotos de progreso. Sube la primera arriba.
        </div>
      )}

      {clientPhotos.length === 1 && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Solo hay una foto todavía — sube una segunda para poder comparar.
        </div>
      )}

      {before && after && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <PhotoSelect label="Antes" photos={clientPhotos} value={beforeId} onChange={setBeforeId} />
              <PhotoSelect label="Después" photos={clientPhotos} value={afterId} onChange={setAfterId} />
            </div>

            <div className="comparison-grid">
              <div className="photo-card">
                <img src={before.url} alt="Antes" />
                <div className="photo-label">
                  📅 {before.date} {before.weight ? `— ${before.weight} kg` : ''}
                </div>
              </div>
              <div className="photo-card" style={{ border: '2px solid var(--accent-emerald)' }}>
                <img src={after.url} alt="Después" />
                <div className="photo-label" style={{ background: 'rgba(16, 185, 129, 0.85)', color: '#fff' }}>
                  🔥 {after.date} {after.weight ? `— ${after.weight} kg` : ''}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TrendingDown size={18} /> Variación
              </h4>
              {before.weight && after.weight ? (
                <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Peso corporal</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-emerald)', marginTop: '2px' }}>
                    {(after.weight - before.weight).toFixed(1)} kg
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    De {before.weight} kg a {after.weight} kg
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Añade el peso al subir las fotos para ver la variación aquí.
                </p>
              )}
            </div>

            {after.notes && (
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px' }}>Notas</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {after.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function PhotoSelect({ label, photos, value, onChange }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem' }}
      >
        {photos.map((p) => (
          <option key={p.id} value={p.id}>{p.date} — {p.angle}</option>
        ))}
      </select>
    </div>
  );
}
