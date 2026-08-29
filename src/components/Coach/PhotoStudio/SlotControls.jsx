import { ArrowLeftRight, FlipHorizontal, RotateCcw, RotateCw, Sparkles, Trash2, ZoomIn } from 'lucide-react';

import { fmt } from '@/lib/num';
import { angleLabel } from '@/domain/photos';
// Sin `Panel`: este bloque se pinta dentro de `StudioPanel`, que ya es la tarjeta.

/** Fila etiqueta + deslizador + valor, usada por encuadre y ajustes de luz. */
const SliderRow = ({ label, value, min, max, step = 1, suffix = '', decimals = 0, onChange }) => (
  <label className="adjust-row">
    <span className="t-secondary">{label}</span>
    <input
      type="range"
      className="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    <span className="value">
      {Number(value).toFixed(decimals)}
      {suffix}
    </span>
  </label>
);

/**
 * Controles del hueco seleccionado: encuadre, ajustes de luz y acciones.
 *
 * El encuadre es lo que hace que la comparación sea honesta: dos fotos tomadas
 * a distinta distancia o altura sugieren un cambio corporal que no ha
 * ocurrido. Los ajustes de luz compensan que las fotos estén hechas con
 * iluminación distinta, que es la otra causa habitual de que un progreso real
 * parezca inexistente.
 *
 * Ninguno de los dos modifica el archivo original: son parámetros de
 * renderizado que solo existen en este montaje.
 */
export const SlotControls = ({ slots, activeSlot, photoOf, layout, maxGridSlots, onSelectSlot, onUpdate, onReset, onRemove, onAddSlot, onApplyToAll, onSwap }) => {
  const slot = slots[activeSlot];
  if (!slot) return null;

  /*
    Invertir el orden. En «Antes / Después» es imprescindible: la sugerencia
    automática coloca la antigua a la izquierda, pero si el cliente está ganando
    masa a veces se quiere la reciente delante, y antes había que reasignar las dos
    fotos a mano desde la biblioteca para conseguirlo.
    En la matriz no aparece: allí el orden lo dan las semanas, de la más antigua a
    la más reciente, y eso no se discute.
  */
  const canSwap = layout !== 'matrix' && slots.filter((s) => s.photoId).length > 1;

  const photo = slot.photoId ? photoOf(slot.photoId) : null;
  const { transform: t, adjustments: a } = slot;

  const setTransform = (patch) => onUpdate(activeSlot, { transform: patch });
  const setAdjust = (patch) => onUpdate(activeSlot, { adjustments: patch });

  return (
    <div className="col gap-4">

      <div className="slot-tabs">
        {slots.map((s, index) => {
          const p = s.photoId ? photoOf(s.photoId) : null;
          return (
            <button
              key={index}
              type="button"
              className="chip"
              aria-pressed={index === activeSlot}
              onClick={() => onSelectSlot(index)}
            >
              {index + 1}
              {p ? ` · ${p.week != null ? `S${p.week}` : angleLabel(p.angle).slice(0, 3)}` : ' · vacío'}
            </button>
          );
        })}

        {layout === 'grid' && slots.length < maxGridSlots && (
          <button type="button" className="chip chip-dashed" onClick={onAddSlot}>
            + Hueco
          </button>
        )}
      </div>

      {canSwap && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={onSwap}
        >
          <ArrowLeftRight size={14} />
          {slots.length === 2 ? 'Cambiar antes por después' : 'Invertir el orden'}
        </button>
      )}

      {!photo ? (
        <p className="t-sm t-secondary">
          Este hueco está vacío. Pulsa una foto de la biblioteca para colocarla aquí.
        </p>
      ) : (
        <>
          <div className="card-inset col gap-1">
            <span className="t-sm" style={{ fontWeight: 700 }}>
              {photo.week != null ? `Semana ${photo.week}` : 'Semana sin determinar'} · {angleLabel(photo.angle)}
            </span>
            <span className="t-xs t-secondary">
              {photo.date}
              {photo.derivedWeight != null ? ` · ${fmt(photo.derivedWeight, { decimals: 1 })} kg` : ''}
            </span>
          </div>

          <div className="col gap-2">
            <span className="section-label">
              <ZoomIn size={11} className="icon-inline" /> Encuadre
            </span>
            <SliderRow label="Zoom" value={t.zoom} min={0.4} max={3} step={0.02} decimals={2} suffix="×" onChange={(v) => setTransform({ zoom: v })} />
            <SliderRow label="Horizontal" value={t.offsetX * 100} min={-60} max={60} step={0.5} suffix="%" onChange={(v) => setTransform({ offsetX: v / 100 })} />
            <SliderRow label="Vertical" value={t.offsetY * 100} min={-60} max={60} step={0.5} suffix="%" onChange={(v) => setTransform({ offsetY: v / 100 })} />
            <SliderRow label="Rotación" value={t.rotation} min={-180} max={180} step={0.5} decimals={1} suffix="°" onChange={(v) => setTransform({ rotation: v })} />

            <div className="row gap-2 wrap">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTransform({ rotation: t.rotation - 90 })}>
                <RotateCcw size={13} /> 90°
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTransform({ rotation: t.rotation + 90 })}>
                <RotateCw size={13} /> 90°
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-pressed={t.flipH}
                onClick={() => setTransform({ flipH: !t.flipH })}
                title="Voltear en horizontal (útil si una foto está en espejo)"
              >
                <FlipHorizontal size={13} /> Espejo
              </button>
            </div>
          </div>

          <hr className="divider" />

          <div className="col gap-2">
            <span className="section-label">
              <Sparkles size={11} className="icon-inline" /> Ajustes de imagen
            </span>
            <SliderRow label="Brillo" value={a.brightness} min={40} max={180} suffix="%" onChange={(v) => setAdjust({ brightness: v })} />
            <SliderRow label="Contraste" value={a.contrast} min={40} max={180} suffix="%" onChange={(v) => setAdjust({ contrast: v })} />
            <SliderRow label="Saturación" value={a.saturation} min={0} max={200} suffix="%" onChange={(v) => setAdjust({ saturation: v })} />
          </div>

          <hr className="divider" />

          <div className="row gap-2 wrap">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onReset(activeSlot)}>
              <RotateCcw size={13} /> Restablecer
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onApplyToAll}
              title="Copiar este encuadre y estos ajustes al resto de huecos"
              disabled={slots.length < 2}
            >
              Aplicar a todos
            </button>
            {layout === 'grid' && slots.length > 2 && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(activeSlot)}>
                <Trash2 size={13} /> Quitar hueco
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
