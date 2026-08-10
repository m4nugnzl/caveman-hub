import { useState } from 'react';
import { ArrowUpRight, Download, Hand, Minus, Move, Type, Undo2, X } from 'lucide-react';

import { ASPECT_RATIOS, LAYOUTS } from '@/domain/photoLayout';
import { Field, Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';

const TOOLS = [
  { id: 'pan', label: 'Mover', icon: Hand, hint: 'Arrastra para encuadrar (o mover el divisor)' },
  { id: 'hline', label: 'Regla —', icon: Minus, hint: 'Regla horizontal: comprueba si dos fotos están a la misma altura' },
  { id: 'vline', label: 'Regla |', icon: Minus, hint: 'Regla vertical: comprueba anchuras y simetría', rotate: true },
  { id: 'line', label: 'Línea', icon: Move, hint: 'Línea libre entre dos puntos' },
  { id: 'arrow', label: 'Flecha', icon: ArrowUpRight, hint: 'Flecha para señalar un cambio' },
  { id: 'text', label: 'Texto', icon: Type, hint: 'Etiqueta de texto' },
];

const COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#f43f5e', '#a855f7', '#ffffff'];

export const StudioToolbar = ({
  state,
  onLayout,
  onRatio,
  onTool,
  onColor,
  onCaptions,
  onUndo,
  onClearAnnotations,
  onExport,
  exportDisabled,
  exportHint,
  pendingText,
  onCommitText,
  onCancelText,
}) => {
  const [textValue, setTextValue] = useState('');

  const commitText = (event) => {
    event.preventDefault();
    const value = textValue.trim();
    if (!value) return;
    onCommitText(value);
    setTextValue('');
  };

  return (
    <Panel tight className="col gap-4">
      <SectionTitle>Montaje</SectionTitle>

      <Field label="Composición">
        <SegmentedControl
          value={state.layout}
          onChange={onLayout}
          options={LAYOUTS.map((l) => ({ id: l.id, label: l.label }))}
          label="Composición"
        />
      </Field>

      <Field label="Proporción de salida">
        {(props) => (
          <select {...props} className="select" value={state.ratio} onChange={(e) => onRatio(e.target.value)}>
            {ASPECT_RATIOS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <label className="checkbox-row">
        <input type="checkbox" checked={state.showCaptions} onChange={(e) => onCaptions(e.target.checked)} />
        Mostrar semana, fecha y peso sobre cada foto
      </label>

      <hr className="divider" />

      <Field label="Herramienta">
        <div className="rail-wrap" role="group" aria-label="Herramienta de anotación">
          {TOOLS.map(({ id, label, icon: Icon, hint, rotate }) => (
            <button
              key={id}
              type="button"
              className="chip"
              aria-pressed={state.tool === id}
              onClick={() => onTool(id)}
              title={hint}
            >
              <Icon size={13} style={rotate ? { transform: 'rotate(90deg)' } : undefined} /> {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Color de la anotación">
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-pressed={state.color === c}
              onClick={() => onColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </Field>

      {pendingText && (
        <form className="card-inset col gap-2" onSubmit={commitText}>
          <span className="t-xs t-secondary">Texto de la etiqueta</span>
          <div className="row gap-2">
            <input
              autoFocus
              className="input grow"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Ej: −4 kg en 11 semanas"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!textValue.trim()}>
              Añadir
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => {
                setTextValue('');
                onCancelText();
              }}
              aria-label="Cancelar texto"
            >
              <X size={14} />
            </button>
          </div>
        </form>
      )}

      <div className="row gap-2 wrap">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onUndo}
          disabled={state.annotations.length === 0}
        >
          <Undo2 size={13} /> Deshacer
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClearAnnotations}
          disabled={state.annotations.length === 0}
        >
          Limpiar anotaciones
        </button>
      </div>

      <hr className="divider" />

      <button type="button" className="btn btn-primary btn-block" onClick={onExport} disabled={exportDisabled}>
        <Download size={16} /> Descargar PNG
      </button>
      {exportHint && <p className="t-xs t-secondary">{exportHint}</p>}
    </Panel>
  );
};
