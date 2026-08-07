import { useId } from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react';

/**
 * Primitivas de presentación compartidas.
 *
 * Cada una sustituye una duplicación real detectada en el código anterior:
 * la tarjeta de dato estaba reimplementada cuatro veces, el banner de aviso
 * tres, el estado vacío no existía (los módulos se limitaban a fallar), y el
 * indicador de guardado mentía diciendo "Guardado" cuando la escritura había
 * fallado.
 */

// ── Panel ──────────────────────────────────────────────────────────────────

export const Panel = ({ as: Tag = 'section', tight, plain, className = '', children, ...rest }) => (
  <Tag
    className={[plain ? 'panel-plain' : 'panel', tight && !plain ? 'panel-tight' : '', className]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </Tag>
);

export const SectionTitle = ({ icon: Icon, color, children, action }) => (
  <div className="row between wrap gap-2">
    <h3 className="section-title" style={color ? { color } : undefined}>
      {Icon && <Icon size={17} />}
      {children}
    </h3>
    {action}
  </div>
);

// ── Tarjeta de dato ────────────────────────────────────────────────────────

export const StatCard = ({ label, value, color, sub, center = true }) => (
  <div className={`stat${center ? ' stat-center' : ''}`}>
    <span className="stat-label">{label}</span>
    <span className="stat-value" style={color ? { color } : undefined}>
      {value}
    </span>
    {sub && <span className="stat-sub">{sub}</span>}
  </div>
);

// ── Avisos ─────────────────────────────────────────────────────────────────

const NOTICE_ICONS = {
  error: XCircle,
  success: CheckCircle2,
  info: Info,
  warn: TriangleAlert,
};

export const Notice = ({ tone = 'info', children, action }) => {
  const Icon = NOTICE_ICONS[tone] || Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span className="grow">{children}</span>
      {action}
    </div>
  );
};

// ── Estado vacío ───────────────────────────────────────────────────────────

export const EmptyState = ({ icon: Icon, title, message, action }) => (
  <Panel>
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={26} />
        </span>
      )}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  </Panel>
);

// ── Indicador de guardado ──────────────────────────────────────────────────

/**
 * Muestra el estado REAL de la escritura. El comportamiento anterior era
 * mostrar "✓ Guardado" siempre que no hubiera una petición en vuelo, incluso
 * si la última había fallado: el usuario perdía trabajo creyéndolo a salvo.
 */
export const SaveIndicator = ({ status, error, onRetry }) => {
  if (status === 'saving') {
    return (
      <span className="save-indicator is-saving" role="status">
        <span className="save-dot" />
        Guardando…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="save-indicator is-error" role="alert">
        <XCircle size={13} />
        {error ? `No se guardó: ${error}` : 'No se pudo guardar'}
        {onRetry && (
          <button type="button" className="btn btn-danger btn-sm" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="save-indicator is-saved" role="status">
        <CheckCircle2 size={13} color="var(--accent-emerald)" />
        Guardado
      </span>
    );
  }

  return null;
};

// ── Controles de formulario ────────────────────────────────────────────────

export const Field = ({ label, hint, error, children, className = '' }) => {
  const id = useId();
  const isRenderProp = typeof children === 'function';
  const control = isRenderProp ? children({ id, 'aria-invalid': Boolean(error) }) : children;

  /*
   * `htmlFor` solo cuando el control recibe de verdad ese id (render prop). Con
   * hijos normales —un SegmentedControl, un grupo de chips— el id nunca llega a
   * ningún elemento, y un <label for> que apunta a la nada es peor que no tener
   * label: los lectores de pantalla anuncian una etiqueta huérfana. En ese caso
   * se usa un <span> y el grupo lleva su propio aria-label.
   */
  return (
    <div className={`field ${className}`}>
      {label &&
        (isRenderProp ? (
          <label className="field-label" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        ))}
      {control}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
};

/**
 * Campo numérico. `type="text"` + `inputMode="decimal"` a propósito: en
 * `type="number"` la rueda del ratón cambia el valor sin querer y Safari no
 * respeta el separador decimal de la configuración regional.
 */
export const NumberInput = ({ value, onChange, center = true, className = '', ...rest }) => (
  <input
    type="text"
    inputMode="decimal"
    autoComplete="off"
    className={`input${center ? ' input-center' : ''} ${className}`}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    {...rest}
  />
);

export const TextInput = ({ value, onChange, className = '', ...rest }) => (
  <input
    type="text"
    className={`input ${className}`}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    {...rest}
  />
);

// ── Segmented control ──────────────────────────────────────────────────────

export const SegmentedControl = ({ value, onChange, options, tone = '', label }) => (
  <div className="segmented" role="group" aria-label={label}>
    {options.map((opt) => (
      <button
        key={opt.id}
        type="button"
        className={`segmented-item ${opt.tone || tone}`}
        aria-pressed={value === opt.id}
        onClick={() => onChange(opt.id)}
        title={opt.hint}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ── Selector de semana / sesión ────────────────────────────────────────────

/**
 * Carril horizontal de semanas. Había tres copias de este componente (editor
 * de rutina, analítica de volumen y portal del cliente), con estilos que ya
 * habían divergido entre sí.
 */
export const WeekPicker = ({ weeks, value, onChange, prefix = 'Sem', onAdd, addLabel = 'Nueva' }) => (
  <div className="rail" role="tablist" aria-label="Semanas del programa">
    {weeks.map((week) => (
      <button
        key={week}
        type="button"
        role="tab"
        className="chip"
        aria-pressed={week === value}
        aria-selected={week === value}
        onClick={() => onChange(week)}
      >
        {prefix} {week}
      </button>
    ))}
    {onAdd && (
      <button type="button" className="chip chip-dashed" onClick={onAdd}>
        + {addLabel}
      </button>
    )}
  </div>
);
