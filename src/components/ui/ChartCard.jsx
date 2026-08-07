import { Panel, SectionTitle } from './primitives';

/**
 * Tarjeta de gráfico con sus PROPIOS controles.
 *
 * La versión anterior tenía una barra global de «periodo / escala / tendencias»
 * que se aplicaba a todos los gráficos a la vez. No funcionaba: cada gráfico
 * admite variaciones distintas —uno se filtra por ejercicio, otro por músculo,
 * otro por semana— y un mando único no podía representar eso, así que la mitad
 * de los controles no hacía nada en la mitad de los gráficos.
 *
 * Ahora cada tarjeta trae lo que de verdad puede variar en ella, junto al
 * gráfico que afecta.
 */
export const ChartCard = ({ icon, color, title, subtitle, controls, children, note }) => (
  <Panel tight className="col gap-4">
    <div className="row between wrap gap-3">
      <div style={{ minWidth: 0 }}>
        <SectionTitle icon={icon} color={color}>
          {title}
        </SectionTitle>
        {subtitle && <p className="text-xs text-dim">{subtitle}</p>}
      </div>
      {controls && <div className="row wrap gap-2 shrink-0">{controls}</div>}
    </div>

    {children}

    {note && <p className="text-xs text-dim">{note}</p>}
  </Panel>
);

/** Selector de periodo en chips, para los gráficos que tienen eje temporal. */
export const RangeChips = ({ value, onChange, options, label = 'Periodo' }) => (
  <div className="rail" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        className="chip"
        aria-pressed={value === option.id}
        onClick={() => onChange(option.id)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/** Desplegable compacto para elegir qué se dibuja (ejercicio, músculo, semana…). */
export const ChartSelect = ({ value, onChange, options, label, width = 190 }) => (
  <label className="row gap-2">
    <span className="sr-only">{label}</span>
    <select
      className="select input-sm"
      style={{ width }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      title={label}
    >
      {options.map((option) => (
        <option key={option.value ?? option} value={option.value ?? option}>
          {option.label ?? option}
        </option>
      ))}
    </select>
  </label>
);

/** Interruptor pequeño para variantes del propio gráfico (media móvil, etc.). */
export const ChartToggle = ({ checked, onChange, children }) => (
  <label className="checkbox-row text-xs">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {children}
  </label>
);
