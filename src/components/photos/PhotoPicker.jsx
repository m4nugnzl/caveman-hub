import { useRef } from 'react';
import { Camera, Check, Plus, X } from 'lucide-react';

import { ANGLES } from '@/domain/photos';
import { useArrastreDeFicheros } from '@/lib/useArrastreDeFicheros';
import { ZonaDeSoltar } from '@/components/ui/ZonaDeSoltar';

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
 *
 * ── `onDrop` aquí NO es soltar ──────────────────────────────────────────────
 * Es descartar: quitar una foto del lote antes de subirla (`usePhotoBatch.drop`).
 * El nombre es anterior al arrastre y se queda, porque cambiarlo tocaría los
 * tres sitios que lo pasan. Soltar ficheros entra por `soltar.props`, abajo.
 */
export const PhotoPicker = ({ items, busy, onAddFiles, onSetTag, onDrop, compacto = false }) => {
  const inputRef = useRef(null);

  /* En el envoltorio y no solo en el recuadro: cuando ya hay fotos el recuadro
     no existe, y arrastrar la cuarta encima de las tres que se ven es
     exactamente donde se espera poder soltarla. */
  const soltar = useArrastreDeFicheros(onAddFiles, !busy);

  /* Con el recuadro delante, el que se enciende es él. Con fotos ya puestas no
     hay recuadro, así que el acuse de recibo lo da el bloque entero. */
  const marcarBloque = soltar.encima && items.length > 0;

  return (
    <div className={`col gap-3 zona-soltable${marcarBloque ? ' is-encima' : ''}`} {...soltar.props}>
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
        <ZonaDeSoltar
          icon={Camera}
          encima={soltar.encima}
          titulo={compacto ? 'Trae las fotos de esta semana' : 'Trae las fotos'}
          sub="Suéltalas aquí, o pulsa para buscarlas"
          onClick={() => inputRef.current?.click()}
        >
          <span className="t-xs t-tertiary">
            {compacto
              ? 'Frontal, lateral y espalda · las tres de una vez'
              : 'Varias a la vez · JPG, PNG, WEBP o HEIC · máximo 15 MB'}
          </span>
        </ZonaDeSoltar>
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
    </div>
  );
};
