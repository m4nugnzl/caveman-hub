import { useMemo, useState } from 'react';

import { availableWeeks, weekFromStart } from '@/domain/photos';
import { today } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/primitives';
import { PhotoPicker } from '@/components/photos/PhotoPicker';
import { usePhotoBatch } from '@/components/photos/usePhotoBatch';

/**
 * Subir fotos de progreso desde fuera de una revisión.
 *
 * ── Quién lo usa ────────────────────────────────────────────────────────────
 * El ENTRENADOR, desde la biblioteca del estudio y desde el propio estudio:
 * fotos que le llegan por otro camino —un WhatsApp, una sesión presencial— y que
 * mete él a mano en la semana que toque.
 *
 * El cliente ya no pasa por aquí: lo suyo es el asistente de revisión
 * (`anthropometry/ReviewWizard.jsx`), donde las fotos son un paso más de la
 * misma tarea en lugar de un diálogo aparte que hay que acordarse de abrir.
 *
 * ── Lo que ha desaparecido ──────────────────────────────────────────────────
 * El campo «Peso en esa foto». El peso de una foto es el de su semana, y ese dato
 * ya existe en el check-in: pedirlo aquí obligaba a escribir el mismo número dos
 * veces en dos pantallas y hacía que esto pareciera una herramienta ajena al
 * resto de la aplicación. Ahora se toma del historial (ver `photoWeight`).
 */
export const PhotoUploadDialog = ({
  client,
  existingPhotos = [],
  // Semana impuesta por quien abre el diálogo. Cuando se abre desde el check-in
  // de una semana concreta, las fotos tienen que ir a ESA y no a la de hoy.
  defaultWeek = null,
  onUpload,
  onClose,
}) => {
  const suggestedWeek = useMemo(() => {
    if (defaultWeek !== null) return defaultWeek;
    const fromStart = weekFromStart(client.startDate, today());
    if (fromStart !== null) return fromStart;
    const weeks = availableWeeks(existingPhotos, client.startDate);
    return weeks.length > 0 ? Math.max(...weeks) : 1;
  }, [client.startDate, existingPhotos, defaultWeek]);

  const [week, setWeek] = useState(String(suggestedWeek || 1));
  const [notes, setNotes] = useState('');

  const lote = usePhotoBatch({ onUpload });

  const submit = async (event) => {
    event.preventDefault();
    if (lote.pendientes === 0) {
      lote.setError('Añade al menos una foto.');
      return;
    }

    const total = lote.pendientes;
    const { fallidas } = await lote.upload({
      clientId: client.id,
      week: clampInt(week, 1, 520, 1),
      notes,
    });

    if (fallidas === 0) onClose();
    else lote.setError(`${fallidas} de ${total} fotos no se pudieron subir. Puedes reintentarlo.`);
  };

  return (
    <Modal
      title={`Subir fotos · semana ${clampInt(week, 1, 520, 1)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={lote.busy}>
            {lote.algunaSubida ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            form="photo-upload"
            className="btn btn-primary"
            disabled={lote.busy || lote.pendientes === 0}
          >
            {lote.busy
              ? 'Subiendo…'
              : `Subir ${lote.pendientes} ${lote.pendientes === 1 ? 'foto' : 'fotos'}`}
          </button>
        </>
      }
    >
      <form id="photo-upload" className="col gap-4" onSubmit={submit}>
        {lote.error && <Notice tone="error">{lote.error}</Notice>}

        <div className="row-end wrap gap-3">
          <label className="field shrink-0">
            <span className="field-label">Semana del programa</span>
            <input
              type="text"
              inputMode="numeric"
              className="input input-center input-week"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
            <span className="field-hint">
              {client.startDate ? 'Sugerida por la fecha de inicio' : 'Sin fecha de inicio'}
            </span>
          </label>

          <label className="field grow">
            <span className="field-label">Notas del check-in</span>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional — cómo ha ido la semana"
            />
          </label>
        </div>

        <PhotoPicker
          items={lote.items}
          busy={lote.busy}
          onAddFiles={lote.addFiles}
          onSetTag={lote.setTag}
          onDrop={lote.drop}
        />

        <Notice tone="info">
          Las fotos tienen que hacerse siempre en las mismas condiciones: misma luz, misma
          distancia, misma pose y a ser posible el mismo día de la semana. Es lo que hace que la
          comparación signifique algo.
        </Notice>
      </form>
    </Modal>
  );
};
