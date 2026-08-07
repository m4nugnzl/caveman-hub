import { useMemo, useState } from 'react';
import { Camera } from 'lucide-react';

import { ANGLES, angleLabel, groupByWeek, suggestPair, weightDelta } from '@/domain/photos';
import { EmptyState, Notice, Panel, SectionTitle, StatCard } from '@/components/ui/primitives';
import { PhotoUploadDialog } from '@/components/photos/PhotoUploadDialog';

/**
 * Fotos de progreso del cliente: aquí es donde SUBE sus fotos.
 *
 * Esta pantalla no existía. `uploadProgressPhoto` estaba escrito en el contexto
 * pero solo conectado al panel del entrenador, así que el cliente no tenía
 * forma de aportar nada; y el input de archivo que sí existía (para vídeo) no
 * tenía `onChange`, de modo que nunca subía el archivo.
 *
 * El cliente ve además su propia comparación antes/después, pero no puede
 * borrar fotos: eso queda en manos del entrenador.
 */
export const ClientPhotos = ({ client, photos, onUpload }) => {
  const [uploadOpen, setUploadOpen] = useState(false);

  const groups = useMemo(() => groupByWeek(photos, client.startDate), [photos, client.startDate]);
  const pair = useMemo(() => suggestPair(photos), [photos]);
  const delta = weightDelta(pair.before, pair.after);

  const uploadButton = (
    <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}>
      <Camera size={16} /> Subir foto
    </button>
  );

  const dialog = uploadOpen && (
    <PhotoUploadDialog
      client={client}
      existingPhotos={photos}
      onUpload={onUpload}
      onClose={() => setUploadOpen(false)}
    />
  );

  if (photos.length === 0) {
    return (
      <>
        <EmptyState
          icon={Camera}
          title="Sube tu primera foto de progreso"
          message="Tu entrenador las usa para valorar tu evolución real, que muchas veces no se ve reflejada en la báscula. Hazlas siempre con la misma luz, a la misma distancia y con la misma pose."
          action={uploadButton}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="stack">
      <Panel tight className="row between wrap gap-3">
        <div>
          <h2 className="section-title">
            <Camera size={18} color="var(--accent-purple)" /> Mis fotos de progreso
          </h2>
          <p className="text-sm text-muted">
            {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} en {groups.length}{' '}
            {groups.length === 1 ? 'semana' : 'semanas'}
          </p>
        </div>
        {uploadButton}
      </Panel>

      <Notice tone="info">
        Consejo: misma luz, misma distancia, misma hora del día y misma pose. Así la comparación
        refleja cambios reales y no diferencias de la foto.
      </Notice>

      {pair.before && pair.after && (
        <Panel tight className="col gap-4">
          <SectionTitle color="var(--accent-emerald)">Tu evolución</SectionTitle>

          <div className="comparison-grid">
            {[pair.before, pair.after].map((photo, index) => (
              <figure className="photo-card" key={photo.id}>
                {photo.url && <img src={photo.url} alt={`${angleLabel(photo.angle)} del ${photo.date}`} />}
                <figcaption
                  className="photo-label"
                  style={
                    index === 1
                      ? { background: 'rgba(16,185,129,0.85)', color: '#fff' }
                      : undefined
                  }
                >
                  {photo.week != null ? `Semana ${photo.week}` : photo.date}
                  {photo.weight != null ? ` · ${photo.weight} kg` : ''}
                </figcaption>
              </figure>
            ))}
          </div>

          {delta !== null && (
            <div className="grid-auto">
              <StatCard
                label="Variación de peso"
                value={`${delta > 0 ? '+' : ''}${delta} kg`}
                color={delta <= 0 ? 'var(--accent-emerald)' : 'var(--accent-amber)'}
              />
              <StatCard label="Ángulo comparado" value={angleLabel(pair.after.angle)} />
            </div>
          )}
        </Panel>
      )}

      {groups.map((group) => (
        <Panel tight className="col gap-3" key={group.week ?? 'sin-semana'}>
          <div className="row between wrap gap-2">
            <strong className="text-sm">{group.label}</strong>
            <span className="text-xs text-muted">
              {group.dateRange?.from === group.dateRange?.to
                ? group.dateRange?.from
                : `${group.dateRange?.from} – ${group.dateRange?.to}`}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            {group.photos.map((photo) => (
              <figure className="photo-card" key={photo.id}>
                {photo.url ? (
                  <img src={photo.url} alt={`${angleLabel(photo.angle)} del ${photo.date}`} loading="lazy" />
                ) : (
                  <span className="row center text-xs text-dim" style={{ height: '100%' }}>
                    sin vista previa
                  </span>
                )}
                <figcaption className="photo-label" style={{ fontSize: '0.68rem', padding: '4px 8px' }}>
                  {angleLabel(photo.angle)}
                  {photo.weight != null ? ` · ${photo.weight} kg` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </Panel>
      ))}

      {ANGLES.some((angle) => !photos.some((p) => p.angle === angle.id)) && (
        <Notice tone="warn">
          Te faltan ángulos por cubrir:{' '}
          {ANGLES.filter((angle) => !photos.some((p) => p.angle === angle.id))
            .map((a) => a.label.toLowerCase())
            .join(', ')}
          . Con los tres ángulos tu entrenador ve mucho mejor los cambios.
        </Notice>
      )}

      {dialog}
    </div>
  );
};
