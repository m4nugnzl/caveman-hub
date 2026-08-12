import { useState } from 'react';
import {
  ArrowUpRight,
  Hand,
  SeparatorHorizontal,
  SeparatorVertical,
  Slash,
  Type,
  Undo2,
  X,
} from 'lucide-react';

// Sin `Panel`: este bloque se pinta dentro de `StudioPanel`, que ya es la tarjeta.

/**
 * Herramientas, agrupadas por lo que hacen.
 *
 * ── Por qué iconos y no seis chips con texto ────────────────────────────────
 * Con texto, «Regla —» y «Regla |» ocupaban tanto que de las seis solo cabían tres
 * en la columna, y las otras tres desaparecían sin dejar rastro. Y leer seis
 * etiquetas cada vez que quieres trazar una línea es trabajo que el icono ahorra.
 *
 * Los grupos separan lo que no se mezcla: mover el encuadre no es anotar, una regla
 * que cruza el montaje no es una línea entre dos puntos, y el texto va aparte
 * porque abre un campo.
 *
 * ── Por qué estos glifos y no los anteriores ────────────────────────────────
 * Los de antes no decían lo que hacía la herramienta:
 *
 *   · las dos reglas eran el MISMO `Minus` —un signo de restar, que se lee como
 *     «quitar»— y la vertical era ese mismo icono girado 90° por CSS. Dos botones
 *     con el mismo dibujo, uno torcido, parecen un apaño porque lo eran. Ahora son
 *     `SeparatorHorizontal` y `SeparatorVertical`: una guía que cruza el montaje,
 *     que es exactamente lo que dibujan, y cada una con su propio glifo.
 *   · «Línea» llevaba `Move`, la cruz de cuatro flechas. Eso significa mover, no
 *     trazar: chocaba de frente con la herramienta de al lado, que sí mueve. Ahora
 *     `Slash`, un trazo diagonal — la forma literal de una línea entre dos puntos.
 */
const TOOL_GROUPS = [
  [{ id: 'pan', label: 'Mover', icon: Hand, hint: 'Arrastra para encuadrar (o mover el divisor)' }],
  [
    {
      id: 'hline',
      label: 'Regla horizontal',
      icon: SeparatorHorizontal,
      hint: 'Regla horizontal: comprueba si dos fotos están a la misma altura',
    },
    {
      id: 'vline',
      label: 'Regla vertical',
      icon: SeparatorVertical,
      hint: 'Regla vertical: comprueba anchuras y simetría',
    },
  ],
  [
    { id: 'line', label: 'Línea', icon: Slash, hint: 'Línea libre entre dos puntos' },
    { id: 'arrow', label: 'Flecha', icon: ArrowUpRight, hint: 'Flecha para señalar un cambio' },
  ],
  [{ id: 'text', label: 'Texto', icon: Type, hint: 'Etiqueta de texto sobre la imagen' }],
];

const ALL_TOOLS = TOOL_GROUPS.flat();

const COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#f43f5e', '#a855f7', '#ffffff'];

export const StudioToolbar = ({
  state,
  onTool,
  onColor,
  onUndo,
  onClearAnnotations,
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
    <div className="col gap-4">
      <div className="col gap-2">
        <span className="section-label">Herramienta</span>

        <div className="toolbar" role="group" aria-label="Herramienta de anotación">
          {TOOL_GROUPS.map((group, index) => (
            <div className="toolbar-group" key={group[0].id}>
              {index > 0 && <span className="toolbar-sep" aria-hidden="true" />}
              {group.map(({ id, label, icon: Icon, hint }) => (
                <button
                  key={id}
                  type="button"
                  className="tool"
                  aria-pressed={state.tool === id}
                  aria-label={label}
                  onClick={() => onTool(id)}
                  title={hint}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* El nombre de la herramienta activa, debajo: los iconos son rápidos de
            pulsar pero no se explican solos la primera vez. */}
        <span className="t-xs t-tertiary">
          {ALL_TOOLS.find((t) => t.id === state.tool)?.hint}
        </span>
      </div>

      <div className="col gap-2">
        <span className="section-label">Color</span>
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
      </div>

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

      {state.annotations.length > 0 && (
        <div className="row between wrap gap-2">
          <span className="t-xs t-tertiary">
            {state.annotations.length}{' '}
            {state.annotations.length === 1 ? 'anotación' : 'anotaciones'}
          </span>
          <div className="row gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onUndo}>
              <Undo2 size={13} /> Deshacer
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClearAnnotations}>
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
