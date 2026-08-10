import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Plus, X } from 'lucide-react';

import { ANGLES, availableWeeks, validatePhotoFile, weekFromStart } from '@/domain/photos';
import { today } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { newId } from '@/lib/ids';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/primitives';

/**
 * Subida de fotos de progreso: TODAS a la vez, y se etiquetan después.
 *
 * ── Por qué cambia ──────────────────────────────────────────────────────────
 * Antes era una foto por diálogo: abrir, elegir archivo, rellenar cuatro campos,
 * subir, cerrar… y repetirlo tres veces, porque un check-in son tres fotos
 * (frontal, lateral, espalda). Doce campos y tres viajes para una sola tarea.
 *
 * Ahora se sueltan las tres juntas, se ve la miniatura de cada una y se dice qué
 * es cada cosa con un toque. La semana se decide UNA vez para todo el lote,
 * porque son del mismo día.
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

  /** items: [{ id, file, url, angle, status, error }] */
  const [items, setItems] = useState([]);
  const [week, setWeek] = useState(String(suggestedWeek || 1));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Cada miniatura es un object URL: hay que revocarlos o se filtra memoria.
  useEffect(
    () => () => {
      items.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [items]
  );

  /**
   * Al añadir archivos se les propone un ángulo: el primero frontal, el segundo
   * lateral, el tercero espalda. Es el orden en que se hacen las fotos, así que
   * la mayoría de las veces acierta y no hay que tocar nada.
   */
  const addFiles = (files) => {
    const incoming = [...(files || [])];
    if (incoming.length === 0) return;

    const rejected = [];
    const accepted = [];

    for (const file of incoming) {
      const invalid = validatePhotoFile(file);
      if (invalid) rejected.push(`${file.name}: ${invalid}`);
      else accepted.push(file);
    }

    setError(rejected.length > 0 ? rejected.join(' · ') : null);

    setItems((prev) => {
      const used = new Set(prev.map((i) => i.angle));
      const next = [...prev];
      for (const file of accepted) {
        const free = ANGLES.find((a) => !used.has(a.id));
        const angle = free?.id || 'frontal';
        used.add(angle);
        next.push({
          id: newId('up'),
          file,
          url: URL.createObjectURL(file),
          angle,
          status: 'pending',
          error: null,
        });
      }
      return next;
    });
  };

  const setAngle = (id, angle) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, angle } : i)));

  const drop = (id) =>
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((i) => i.id !== id);
    });

  /**
   * Se suben de una en una y en serie, no en paralelo.
   *
   * Tres subidas simultáneas de 15 MB desde el móvil de un cliente saturan la
   * conexión y hacen que fallen las tres. En serie, además, cada foto puede
   * marcarse como subida o fallida por separado y reintentar solo lo que falló.
   */
  const submit = async (event) => {
    event.preventDefault();
    const pending = items.filter((i) => i.status !== 'done');
    if (pending.length === 0) {
      setError('Añade al menos una foto.');
      return;
    }

    setBusy(true);
    setError(null);
    const weekNumber = clampInt(week, 1, 520, 1);
    let failures = 0;

    for (const item of pending) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)));

      const result = await onUpload({
        clientId: client.id,
        file: item.file,
        week: weekNumber,
        angle: item.angle,
        notes,
      });

      if (result?.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'done', error: null } : i)));
      } else {
        failures += 1;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', error: result?.error || 'No se pudo subir.' }
              : i
          )
        );
      }
    }

    setBusy(false);
    if (failures === 0) onClose();
    else setError(`${failures} de ${pending.length} fotos no se pudieron subir. Puedes reintentarlo.`);
  };

  const pendingCount = items.filter((i) => i.status !== 'done').length;

  return (
    <Modal
      title={`Subir fotos · semana ${clampInt(week, 1, 520, 1)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {items.some((i) => i.status === 'done') ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            form="photo-upload"
            className="btn btn-primary"
            disabled={busy || pendingCount === 0}
          >
            {busy
              ? 'Subiendo…'
              : `Subir ${pendingCount} ${pendingCount === 1 ? 'foto' : 'fotos'}`}
          </button>
        </>
      }
    >
      <form id="photo-upload" className="col gap-4" onSubmit={submit}>
        {error && <Notice tone="error">{error}</Notice>}

        <div className="row-end wrap gap-3">
          <label className="field shrink-0">
            <span className="field-label">Semana del programa</span>
            <input
              type="text"
              inputMode="numeric"
              className="input input-center"
              style={{ width: 92 }}
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            />
            <span className="field-hint">
              {client.startDate ? `Sugerida por tu fecha de inicio` : 'Sin fecha de inicio'}
            </span>
          </label>

          <label className="field grow">
            <span className="field-label">Notas del check-in</span>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional — cómo te has sentido esta semana"
            />
          </label>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ''; // permite volver a elegir el mismo archivo
          }}
        />

        {items.length === 0 ? (
          <button
            type="button"
            className="btn btn-dashed btn-block"
            style={{ padding: 30, flexDirection: 'column', height: 'auto' }}
            onClick={() => inputRef.current?.click()}
          >
            <Camera size={26} />
            <span>Elegir todas las fotos</span>
            <span className="t-xs t-tertiary">
              Puedes seleccionar varias a la vez · JPG, PNG, WEBP o HEIC · máximo 15 MB
            </span>
          </button>
        ) : (
          <>
            <div className="upload-grid">
              {items.map((item) => (
                <div className={`upload-card is-${item.status}`} key={item.id}>
                  <img src={item.url} alt="" />

                  <div className="rail-wrap">
                    {ANGLES.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="chip"
                        aria-pressed={item.angle === a.id}
                        disabled={busy || item.status === 'done'}
                        onClick={() => setAngle(item.id, a.id)}
                        title={a.hint}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>

                  <span className="upload-state">
                    {item.status === 'done' && (
                      <>
                        <Check size={12} /> Subida
                      </>
                    )}
                    {item.status === 'uploading' && 'Subiendo…'}
                    {item.status === 'error' && item.error}
                    {item.status === 'pending' && item.file.name}
                  </span>

                  {!busy && item.status !== 'done' && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-danger upload-drop"
                      onClick={() => drop(item.id)}
                      aria-label="Quitar esta foto"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Plus size={14} /> Añadir más
            </button>
          </>
        )}

        <Notice tone="info">
          Hazte las fotos siempre en las mismas condiciones: misma luz, misma distancia, misma pose y
          a ser posible el mismo día de la semana. Es lo que hace que la comparación signifique algo.
        </Notice>
      </form>
    </Modal>
  );
};
