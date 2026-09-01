import { useRef } from 'react';
import { Camera, Check, Plus, X } from 'lucide-react';

import { UNSORTED, groupOptions } from '@/domain/equipment';
import { usePhotoBatch } from '@/components/photos/usePhotoBatch';
import { useArrastreDeFicheros } from '@/lib/useArrastreDeFicheros';
import { Notice } from '@/components/ui/primitives';
import { ZonaDeSoltar } from '@/components/ui/ZonaDeSoltar';

/**
 * Subir las fotos de la maquinaria de un gimnasio.
 *
 * ══ Por qué se parece a las fotos de una revisión ══════════════════════════
 *
 * Porque es el mismo gesto y ya estaba resuelto: elegir varias de una vez,
 * verlas antes de mandarlas, decir qué es cada una y subirlas en serie sabiendo
 * cuál falló. Todo eso vive en `usePhotoBatch` y en el aspecto de `.upload-card`
 * desde que las revisiones dejaron de subir foto a foto.
 *
 * Lo que había aquí era el escalón anterior: un botón, un desplegable arriba y
 * las fotos apareciendo ya subidas. Sin previsualización, sin poder quitar una
 * antes de mandarla y sin decir por dónde iba la tanda salvo un contador.
 *
 * ══ Y el desplegable de arriba se ha ido ═══════════════════════════════════
 *
 * Era «Van a», y con ello el control se leía como el estado de lo que ya hay:
 * quien tenía sus fotos ya colocadas veía «Sin clasificar» arriba del todo y no
 * entendía qué le estaba diciendo la pantalla.
 *
 * Ahora la etiqueta va DEBAJO DE CADA FOTO, antes de subirla, que es donde de
 * verdad se decide: se ve la máquina y se dice qué es. Y sigue sin hacer falta
 * —todo puede irse a «Sin clasificar» y ordenarse después—, pero ya no hay un
 * control suelto que parezca hablar de otra cosa.
 *
 * ── Un `select` y no chips, a diferencia de las revisiones ──────────────────
 * Los ángulos son tres y caben como chips. Los grupos musculares son quince más
 * la bandeja: en chips serían tres renglones por tarjeta y la rejilla dejaría de
 * ser una rejilla de fotos para ser una de botones.
 *
 * @param onUpload  Recibe `{ clientId, file, muscleGroup }` y devuelve `{ ok }`.
 *   Es `addEquipment` en las dos pantallas que lo usan.
 */
export const GymPicker = ({ clientId, onUpload, disabled = false }) => {
  const inputRef = useRef(null);

  const lote = usePhotoBatch({
    onUpload,
    tagKey: 'muscleGroup',
    /*
      Todas a la bandeja, y no repartiendo grupos como hacen los ángulos: quien
      sube veinte máquinas no quiere que la aplicación se invente que la tercera
      es de bíceps. La primera de la lista es «Sin clasificar» a propósito.
    */
    nextTag: () => UNSORTED,
  });

  const elegir = () => inputRef.current?.click();

  /* En el envoltorio y no solo en el recuadro: cuando ya hay fotos el recuadro
     no existe, y arrastrar otra máquina encima de las que se ven es donde se
     espera poder soltarla. */
  const soltar = useArrastreDeFicheros(lote.addFiles, !lote.busy && !disabled);
  const marcarBloque = soltar.encima && lote.items.length > 0;

  return (
    <div
      className={`col gap-3 zona-soltable${marcarBloque ? ' is-encima' : ''}`}
      {...soltar.props}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          lote.addFiles(e.target.files);
          /* Permite volver a elegir el mismo archivo: sin esto, quitar una foto
             y volver a seleccionarla no dispara el `change`. */
          e.target.value = '';
        }}
      />

      {lote.error && <Notice tone="warn">{lote.error}</Notice>}

      {lote.items.length === 0 ? (
        <ZonaDeSoltar
          icon={Camera}
          encima={soltar.encima}
          disabled={disabled}
          titulo="Trae las fotos del gimnasio"
          sub="Suéltalas aquí, o pulsa para buscarlas"
          onClick={elegir}
        >
          <span className="t-xs t-tertiary">
            Una a cada máquina · todas de una vez
          </span>
        </ZonaDeSoltar>
      ) : (
        <>
          <div className="upload-grid">
            {lote.items.map((item) => (
              <div className={`upload-card is-${item.status}`} key={item.id}>
                <img src={item.url} alt="" />

                <select
                  className="select select-xs"
                  aria-label="De qué es esta máquina"
                  value={item.tag}
                  disabled={lote.busy || item.status === 'done'}
                  onChange={(e) => lote.setTag(item.id, e.target.value)}
                >
                  {groupOptions().map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>

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

                {!lote.busy && item.status !== 'done' && (
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-danger upload-drop"
                    onClick={() => lote.drop(item.id)}
                    aria-label="Quitar esta foto"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="row gap-2 wrap">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={lote.busy || lote.pendientes === 0}
              onClick={() => lote.upload({ clientId })}
            >
              {lote.busy
                ? 'Subiendo…'
                : `Subir ${lote.pendientes} ${lote.pendientes === 1 ? 'foto' : 'fotos'}`}
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={elegir}
              disabled={lote.busy}
            >
              <Plus size={14} /> Añadir más
            </button>
          </div>
        </>
      )}
    </div>
  );
};
