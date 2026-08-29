import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Trash2, Upload } from 'lucide-react';

import { ANGLES, angleLabel, angleShort, groupByWeek } from '@/domain/photos';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { fmt } from '@/lib/num';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { PhotoUploadDialog } from '@/components/photos/PhotoUploadDialog';
import { Thumb } from '@/components/photos/Thumb';

/**
 * Biblioteca de fotos organizada en "carpetas" por semana — el mismo modelo
 * mental de las carpetas del Drive, pero dentro de la propia aplicación y sin
 * salir a buscar nada.
 *
 * Pulsar una miniatura la asigna al hueco activo del montaje; volver a
 * pulsarla la quita.
 */
export const PhotoLibrary = ({ photos, client, usedPhotoIds, onAssign, onDelete, onUpload }) => {
  const confirm = useConfirm();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [angleFilter, setAngleFilter] = useState('all');

  const filtered = useMemo(
    () => (angleFilter === 'all' ? photos : photos.filter((p) => p.angle === angleFilter)),
    [photos, angleFilter]
  );

  const groups = useMemo(() => groupByWeek(filtered, client.startDate), [filtered, client.startDate]);

  const askDelete = async (photo, event) => {
    event.stopPropagation();
    const ok = await confirm({
      title: '¿Eliminar esta foto?',
      message: `Se borrará la foto ${angleLabel(photo.angle).toLowerCase()} del ${photo.date}.`,
      detail: 'La imagen se elimina también del almacenamiento y no se puede recuperar.',
      confirmLabel: 'Eliminar foto',
      tone: 'danger',
    });
    if (ok) onDelete(photo);
  };

  return (
    <Panel tight className="col gap-4">
      <SectionTitle
        icon={FolderOpen}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
            <Upload size={14} /> Subir
          </button>
        }
      >
        Fotos por semana
      </SectionTitle>

      <div className="rail-wrap" role="group" aria-label="Filtrar por ángulo">
        <button
          type="button"
          className="chip"
          aria-pressed={angleFilter === 'all'}
          onClick={() => setAngleFilter('all')}
        >
          Todos
        </button>
        {ANGLES.map((angle) => (
          <button
            key={angle.id}
            type="button"
            className="chip"
            aria-pressed={angleFilter === angle.id}
            onClick={() => setAngleFilter(angle.id)}
          >
            {angle.label}
          </button>
        ))}
      </div>

      {photos.length === 0 && (
        <Notice tone="info">
          {client.name} todavía no ha subido fotos. Puede hacerlo desde su portal, o súbelas tú con el
          botón «Subir».
        </Notice>
      )}

      {photos.length > 0 && groups.length === 0 && (
        <p className="t-sm t-secondary">Ninguna foto con ese ángulo.</p>
      )}

      <div className="col gap-2">
        {groups.map((group) => {
          const key = group.week ?? 'sin-semana';
          const isCollapsed = collapsed[key];

          return (
            <div className="week-folder" key={key}>
              <button
                type="button"
                className="week-folder-head"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <span className="grow">{group.label}</span>
                <span className="badge">{group.photos.length}</span>
              </button>

              {!isCollapsed && (
                <div className="week-folder-body">
                  {group.photos.map((photo) => {
                    const used = usedPhotoIds.has(photo.id);
                    return (
                      // El botón de borrar va como HERMANO, no dentro del botón
                      // de la miniatura: anidar controles interactivos es HTML
                      // inválido y rompe la navegación por teclado.
                      <div style={{ position: 'relative' }} key={photo.id}>
                        <button
                          type="button"
                          className="photo-thumb"
                          style={{ width: '100%' }}
                          aria-pressed={used}
                          onClick={() => onAssign(photo.id)}
                          title={`${angleLabel(photo.angle)} · ${photo.date}${photo.derivedWeight ? ` · ${fmt(photo.derivedWeight, { decimals: 1 })} kg` : ''}`}
                        >
                          {photo.url ? (
                            /* Miniatura de 180 px, no el original de 3 MB. Ver
                               `photos/Thumb.jsx`: si la versión redimensionada no
                               está disponible, cae a la original sola. */
                            <Thumb url={photo.url} width={180} alt={`${angleLabel(photo.angle)} del ${photo.date}`} />
                          ) : (
                            <span className="row center t-xs t-tertiary" style={{ height: '100%' }}>
                              sin vista previa
                            </span>
                          )}
                          {used && <span className="photo-thumb-slot">✓</span>}
                          <span className="photo-thumb-tag">{angleShort(photo.angle)}</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-icon btn-icon-compact btn-icon-danger"
                          style={{ position: 'absolute', top: 4, right: 4 }}
                          onClick={(e) => askDelete(photo, e)}
                          aria-label={`Eliminar foto del ${photo.date}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {uploadOpen && (
        <PhotoUploadDialog
          client={client}
          existingPhotos={photos}
          onUpload={onUpload}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </Panel>
  );
};
