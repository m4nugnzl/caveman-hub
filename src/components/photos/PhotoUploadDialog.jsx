import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera } from 'lucide-react';

import { ANGLES, availableWeeks, validatePhotoFile, weekFromStart } from '@/domain/photos';
import { today } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { Field, Notice } from '@/components/ui/primitives';

/**
 * Diálogo de subida de foto de progreso. Lo usan tanto el coach (desde el
 * Photo Studio) como el cliente (desde su portal), así que vive fuera de los
 * dos árboles de componentes.
 *
 * Sustituye a los dos `window.prompt()` seguidos que pedían ángulo y peso: eran
 * imposibles de validar, no se podían cancelar a medias y no daban ninguna
 * pista de qué formato se esperaba.
 */
export const PhotoUploadDialog = ({ client, existingPhotos = [], onUpload, onClose }) => {
  /**
   * Semana propuesta: la que toca según la fecha de inicio del cliente. Si no
   * hay fecha de inicio, se continúa a partir de la última semana con fotos.
   */
  const suggestedWeek = useMemo(() => {
    const fromStart = weekFromStart(client.startDate, today());
    if (fromStart !== null) return fromStart;
    const weeks = availableWeeks(existingPhotos, client.startDate);
    return weeks.length > 0 ? Math.max(...weeks) : 1;
  }, [client.startDate, existingPhotos]);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [week, setWeek] = useState(String(suggestedWeek || 1));
  const [angle, setAngle] = useState('frontal');
  const [weight, setWeight] = useState(client.currentWeight ? String(client.currentWeight) : '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // La URL del objeto hay que revocarla o se filtra memoria en cada selección.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (selected) => {
    if (!selected) return;
    const invalid = validatePhotoFile(selected);
    setError(invalid);
    setFile(invalid ? null : selected);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Selecciona una foto.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await onUpload({
      clientId: client.id,
      file,
      week: clampInt(week, 1, 520, 1),
      angle,
      weight,
      notes,
    });
    setBusy(false);

    if (result?.ok) onClose();
    else setError(result?.error || 'No se pudo subir la foto.');
  };

  return (
    <Modal
      title="Subir foto de progreso"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="photo-upload" className="btn btn-primary" disabled={busy || !file}>
            {busy ? 'Subiendo…' : 'Subir foto'}
          </button>
        </>
      }
    >
      <form id="photo-upload" className="col gap-4" onSubmit={submit}>
        {error && <Notice tone="error">{error}</Notice>}

        <button
          type="button"
          className="btn btn-dashed btn-block"
          style={{ padding: previewUrl ? 8 : 28, flexDirection: 'column', height: 'auto' }}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vista previa de la foto seleccionada"
              style={{ maxHeight: 220, borderRadius: 'var(--radius-sm)', objectFit: 'contain' }}
            />
          ) : (
            <>
              <Camera size={26} />
              <span>Elegir foto</span>
              <span className="text-xs text-dim">JPG, PNG, WEBP o HEIC · máximo 15 MB</span>
            </>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {file && <p className="text-xs text-muted">{file.name}</p>}

        <div className="row-end wrap gap-3">
          <Field
            label="Semana del programa"
            className="shrink-0"
            hint={client.startDate ? `Sugerida por la fecha de inicio (${client.startDate})` : 'Sin fecha de inicio'}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="numeric"
                className="input input-center"
                style={{ width: 92 }}
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              />
            )}
          </Field>

          <Field label="Ángulo" className="grow">
            {(props) => (
              <select {...props} className="select" value={angle} onChange={(e) => setAngle(e.target.value)}>
                {ANGLES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.hint}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <div className="row-end wrap gap-3">
          <Field label="Peso en esa foto (kg)" className="shrink-0" hint="Opcional, permite ver la variación">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input input-center"
                style={{ width: 110 }}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="81.5"
              />
            )}
          </Field>

          <Field label="Notas" className="grow">
            {(props) => (
              <input
                {...props}
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional"
              />
            )}
          </Field>
        </div>

        <Notice tone="info">
          Para que la comparación sea fiable, haz siempre las fotos con la misma luz, a la misma
          distancia y con la misma pose.
        </Notice>
      </form>
    </Modal>
  );
};
