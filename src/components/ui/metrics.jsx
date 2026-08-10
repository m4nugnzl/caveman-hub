import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { round } from '@/lib/num';

/**
 * Primitivas de métrica, calcadas del lenguaje de la referencia visual.
 *
 * La idea central: **toda cifra se presenta en el mismo orden** — etiqueta,
 * valor grande con su unidad, píldora de variación, y solo después el gráfico.
 * Esa repetición es lo que hace que veinte tarjetas distintas se lean como un
 * único producto, y es lo que faltaba cuando los gráficos aparecían sueltos sin
 * decir qué valor tienen ahora ni cuánto han cambiado.
 */

// ── Píldora de variación ───────────────────────────────────────────────────

/**
 * `lowerIsBetter` decide el color, no el signo: bajar de peso suele ser el
 * objetivo, bajar de tonelaje es lo contrario. Sin esto, el mismo signo se leería
 * igual en métricas que significan lo opuesto.
 */
export const Delta = ({ value, unit = '', percent = null, lowerIsBetter = false, decimals = 1 }) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;

  const n = Number(value);
  const flat = Math.abs(n) < 1e-9;
  const good = lowerIsBetter ? n < 0 : n > 0;
  const Icon = flat ? Minus : n > 0 ? ArrowUp : ArrowDown;
  const tone = flat ? 'flat' : good ? 'good' : 'bad';

  return (
    <span className={`delta delta-${tone}`}>
      <Icon size={11} strokeWidth={2.5} />
      {percent !== null && Number.isFinite(Number(percent))
        ? `${Math.abs(round(percent, 1))}%`
        : `${Math.abs(round(n, decimals))}${unit}`}
    </span>
  );
};

// ── Cifra ──────────────────────────────────────────────────────────────────

export const Figure = ({ value, unit, hero = false, color, delta }) => (
  <div className="metric-figure">
    <span className={`metric-value${hero ? ' is-hero' : ''}`} style={color ? { color } : undefined}>
      {value}
    </span>
    {unit && <span className="metric-unit">{unit}</span>}
    {delta}
  </div>
);

// ── Tarjeta de métrica: etiqueta → cifra → delta → gráfico ─────────────────

export const MetricCard = ({ title, subtitle, value, unit, color, delta, action, children, foot }) => (
  <article className="metric-card">
    <header className="metric-card-head">
      <div style={{ minWidth: 0 }}>
        <div className="metric-title">{title}</div>
        {subtitle && <div className="metric-sub">{subtitle}</div>}
      </div>
      {action}
    </header>

    <Figure value={value} unit={unit} color={color} delta={delta} />

    {children}

    {foot && <p className="metric-foot">{foot}</p>}
  </article>
);

/**
 * Widget compacto: las tarjetas flotantes pequeñas de la referencia. Título,
 * periodo, cifra y un sparkline. Se usan en rejilla para los KPIs de cabecera.
 */
export const StatWidget = ({ title, icon: Icon, timeframe, value, unit, color, delta, children }) => (
  <article className="widget">
    <header className="widget-head">
      <span className="widget-title">{title}</span>
      {Icon && <Icon size={14} style={{ color: color || 'var(--text-tertiary)', flexShrink: 0 }} />}
    </header>
    {timeframe && <span className="widget-sub">{timeframe}</span>}
    <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
      <span className="widget-value" style={color ? { color } : undefined}>
        {value}
        {unit && <span className="metric-unit"> {unit}</span>}
      </span>
      {delta}
    </div>
    {children && <div className="widget-spark">{children}</div>}
  </article>
);

// ── Lista agrupada de métricas ─────────────────────────────────────────────

/**
 * La tabla "All Metrics" de la referencia: encabezados diminutos en mayúsculas,
 * filas separadas por hairlines, y la fila destacada cuando procede.
 *
 * Es el sitio donde caben las quince cifras que no merecen un gráfico propio,
 * y evita tener que llenar el resumen de tarjetas.
 */
export const MetricList = ({ title, count, action, rows, emptyMessage = 'Sin datos todavía.' }) => (
  <section className="list">
    <header className="list-head">
      <div className="section-title">
        {title}
        {count !== undefined && <span className="t-sm t-tertiary">({count})</span>}
      </div>
      {action}
    </header>

    {rows.length === 0 ? (
      <div className="list-row">
        <span className="t-sm t-tertiary">{emptyMessage}</span>
      </div>
    ) : (
      <>
        <div className="list-row" style={{ minHeight: 0, paddingBottom: 6 }}>
          <span className="section-label grow">Métrica</span>
          <span className="section-label" style={{ minWidth: 92, textAlign: 'right' }}>
            Valor
          </span>
          <span className="section-label row-meta">Actualizado</span>
        </div>

        {rows.map((row) => (
          <div className={`list-row${row.highlight ? ' is-active' : ''}`} key={row.id || row.label}>
            {row.color && (
              <span
                className="list-icon"
                style={{ background: `color-mix(in srgb, ${row.color} 14%, transparent)`, color: row.color }}
              >
                {row.icon ? <row.icon size={15} /> : null}
              </span>
            )}
            <span className="list-row-label">
              <span className="title">{row.label}</span>
              {row.sub && <span className="sub">{row.sub}</span>}
            </span>
            <span className="row-value" style={{ minWidth: 92, textAlign: 'right' }}>
              {row.value}
            </span>
            <span className="row-meta">{row.updated || '—'}</span>
          </div>
        ))}
      </>
    )}
  </section>
);
