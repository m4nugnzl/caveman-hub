import { useRef } from 'react';
import { Camera, Check, Plus, X } from 'lucide-react';

import { ANGLES } from '@/domain/photos';

/**
 * Elegir fotos y decir qué es cada una.
 *
 * Es solo la parte visual del lote: el estado vive en `usePhotoBatch`. Existe
 * separada del diálogo porque la misma pieza se usa en dos sitios que NO son la
 * misma pantalla —el diálogo suelto del entrenador y el paso de fotos del
 * asistente de revisión del cliente—, y meter esto dentro de un `<Modal>` la
 * habría dejado inservible para el segundo: un diálogo dentro de otro diálogo
 * atrapa el foco dos veces y el `Escape` cierra el que no toca.
 *
 * Todas a la vez y se etiquetan después. Antes era una foto por diálogo: abrir,
 * elegir archivo, rellenar cuatro campos, subir, cerrar… y repetirlo tres veces,
 * porque una revisión son tres fotos. Doce campos y tres viajes para una tarea.
 */
export const PhotoPicker = ({ items, busy, onAddFiles, onSetTag, onDrop, compacto = false }) => {
  const inputRef = useRef(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          onAddFiles(e.target.files);
          e.target.value = ''; // permite volver a elegir el mismo archivo
        }}
      />

      {items.length === 0 ? (
        <button
          type="button"
          className="btn btn-dashed btn-block photo-drop"
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={26} />
          <span>Elegir todas las fotos</span>
          <span className="t-xs t-tertiary">
            {compacto
              ? 'Frontal, lateral y espalda · puedes elegirlas de una vez'
              : 'Puedes seleccionar varias a la vez · JPG, PNG, WEBP o HEIC · máximo 15 MB'}
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
                      aria-pressed={item.tag === a.id}
                      disabled={busy || item.status === 'done'}
                      onClick={() => onSetTag(item.id, a.id)}
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
                    onClick={() => onDrop(item.id)}
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
            className="btn btn-secondary btn-sm self-start"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Plus size={14} /> Añadir más
          </button>
        </>
      )}
    </>
  );
};
