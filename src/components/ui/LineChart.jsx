import { useMemo, useState } from 'react';
import { round } from '@/lib/num';

/**
 * Gráfico de líneas con doble eje y recta de tendencia.
 *
 * Pensado para responder a la pregunta que de verdad importa: ¿cómo se mueve una
 * métrica y cómo se relaciona con otra que está en unidades distintas? Por eso
 * admite un segundo eje a la derecha: comparar kcal (miles) con peso (decenas)
 * en un solo eje aplastaría una de las dos contra el borde.
 *
 * Todo en SVG, sin librería de gráficos: el bundle no crece y el resultado se
 * escala solo.
 */

const W = 720;
const H = 300;
const PAD = { top: 18, right: 56, bottom: 34, left: 52 };

const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

/**
 * Escala con un margen del 8% para que las líneas no toquen los bordes.
 *
 * `fromZero` fuerza el origen en cero. Ajustada al rango de datos amplifica los
 * cambios pequeños —lo que interesa para ver la tendencia del peso— mientras
 * que desde cero mantiene la proporción real y evita exagerar. Ninguna de las
 * dos es la correcta siempre, así que se elige.
 */
const makeScale = (values, fromZero = false) => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  let min = fromZero ? Math.min(0, ...finite) : Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    // Serie plana: se abre un rango artificial o la línea quedaría en el borde.
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }

  return {
    min,
    max,
    y: (value) => PAD.top + INNER_H - ((value - min) / (max - min)) * INNER_H,
    ticks: (count = 4) =>
      Array.from({ length: count + 1 }, (_, i) => round(min + ((max - min) * i) / count, 2)),
  };
};

const xAt = (index, total) =>
  total <= 1 ? PAD.left + INNER_W / 2 : PAD.left + (index / (total - 1)) * INNER_W;

const pathOf = (points, scale, total) =>
  points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.index, total).toFixed(1)} ${scale.y(p.value).toFixed(1)}`)
    .join(' ');

/** Media móvil centrada sobre los puntos de una serie, conservando su índice. */
const smoothedPoints = (points, window) => {
  const half = Math.floor(window / 2);
  return points.map((point, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(points.length, i + half + 1);
    const slice = points.slice(from, to);
    return {
      index: point.index,
      value: slice.reduce((acc, p) => acc + p.value, 0) / slice.length,
    };
  });
};

export const LineChart = ({
  series,
  labels,
  height = 300,
  showTrend = false,
  smoothWindow = 0,
  fromZero = false,
  emptyMessage,
}) => {
  const [hover, setHover] = useState(null);

  const prepared = useMemo(() => {
    const total = labels.length;

    // Cada serie se indexa contra el eje X común de etiquetas, de forma que las
    // semanas sin dato dejan hueco en vez de desplazar la línea.
    const withIndex = series.map((s) => {
      const byLabel = new Map(s.points.map((p) => [p.label, p.value]));
      const points = labels
        .map((label, index) => ({ index, label, value: byLabel.get(label) }))
        .filter((p) => Number.isFinite(p.value));
      return { ...s, points };
    });

    const leftValues = withIndex.filter((s) => s.axis !== 'right').flatMap((s) => s.points.map((p) => p.value));
    const rightValues = withIndex.filter((s) => s.axis === 'right').flatMap((s) => s.points.map((p) => p.value));

    return {
      total,
      series: withIndex,
      left: makeScale(leftValues, fromZero),
      right: makeScale(rightValues, fromZero),
    };
  }, [series, labels, fromZero]);

  const hasData = prepared.series.some((s) => s.points.length > 0);
  if (!hasData) {
    return (
      <div className="row center text-sm text-muted" style={{ height: 140 }}>
        {emptyMessage || 'Todavía no hay datos suficientes para dibujar esta comparación.'}
      </div>
    );
  }

  const scaleFor = (s) => (s.axis === 'right' ? prepared.right : prepared.left);

  // Etiquetas del eje X: con muchas semanas se muestran salteadas.
  const step = Math.ceil(prepared.total / 8) || 1;

  return (
    <figure className="col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height }}
        role="img"
        aria-label={`Gráfico de ${series.map((s) => s.label).join(' y ')}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * W;
          const ratio = (x - PAD.left) / INNER_W;
          const index = Math.round(ratio * (prepared.total - 1));
          setHover(index >= 0 && index < prepared.total ? index : null);
        }}
      >
        {/* Rejilla y eje izquierdo */}
        {prepared.left?.ticks(4).map((tick) => (
          <g key={`l${tick}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={prepared.left.y(tick)}
              y2={prepared.left.y(tick)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={prepared.left.y(tick)}
              fill="var(--text-dark)"
              fontSize="11"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Eje derecho, solo si hay una segunda métrica */}
        {prepared.right &&
          prepared.right.ticks(4).map((tick) => (
            <text
              key={`r${tick}`}
              x={W - PAD.right + 8}
              y={prepared.right.y(tick)}
              fill="var(--text-dark)"
              fontSize="11"
              textAnchor="start"
              dominantBaseline="middle"
            >
              {tick}
            </text>
          ))}

        {/* Guía vertical del punto señalado */}
        {hover !== null && (
          <line
            x1={xAt(hover, prepared.total)}
            x2={xAt(hover, prepared.total)}
            y1={PAD.top}
            y2={PAD.top + INNER_H}
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Series */}
        {prepared.series.map((s) => {
          const scale = scaleFor(s);
          if (!scale || s.points.length === 0) return null;

          return (
            <g key={s.id}>
              {s.points.length > 1 && (
                <path
                  d={pathOf(s.points, scale, prepared.total)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/*
                Suavizado por media móvil centrada, no recta de regresión: una
                recta atravesando puntos irregulares parece impuesta desde fuera
                y no describe la forma real de la serie. La media móvil sigue el
                recorrido y solo le quita el ruido.
              */}
              {smoothWindow > 0 && s.points.length > smoothWindow && (
                <polyline
                  points={smoothedPoints(s.points, smoothWindow)
                    .map(
                      (p) => `${xAt(p.index, prepared.total).toFixed(1)},${scale.y(p.value).toFixed(1)}`
                    )
                    .join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* Recta de tendencia. Se deja disponible pero desactivada por
                  defecto: sobre pocas semanas engaña más que informa. */}
              {showTrend && s.trend && s.points.length >= 3 && (
                <line
                  x1={xAt(s.points[0].index, prepared.total)}
                  y1={scale.y(s.trend.from)}
                  x2={xAt(s.points[s.points.length - 1].index, prepared.total)}
                  y2={scale.y(s.trend.to)}
                  stroke={s.color}
                  strokeWidth="1.5"
                  strokeDasharray="7 5"
                  opacity="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {s.points.map((p) => (
                <circle
                  key={p.index}
                  cx={xAt(p.index, prepared.total)}
                  cy={scale.y(p.value)}
                  r={hover === p.index ? 5 : 3}
                  fill={s.color}
                  stroke="var(--bg-main)"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          );
        })}

        {/* Etiquetas del eje X */}
        {labels.map((label, index) =>
          index % step === 0 || index === labels.length - 1 ? (
            <text
              key={label + index}
              x={xAt(index, prepared.total)}
              y={H - 12}
              fill="var(--text-dark)"
              fontSize="11"
              textAnchor="middle"
            >
              {label}
            </text>
          ) : null
        )}
      </svg>

      {/* Leyenda y lectura del punto señalado */}
      <figcaption className="row wrap gap-4 text-xs">
        {prepared.series.map((s) => {
          const point = hover !== null ? s.points.find((p) => p.index === hover) : null;
          const shown = point ? point.value : s.points[s.points.length - 1]?.value;
          return (
            <span className="row gap-2" key={s.id}>
              <span
                style={{
                  width: 14,
                  height: 3,
                  background: s.color,
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
              <span className="text-muted">{s.label}</span>
              <strong style={{ color: s.color }}>
                {shown === undefined ? '—' : `${round(shown, s.decimals ?? 1)}${s.unit || ''}`}
              </strong>
              {s.axis === 'right' && <span className="text-dim">(eje dcho.)</span>}
            </span>
          );
        })}
        {hover !== null && labels[hover] && (
          <span className="text-dim">· semana del {labels[hover]}</span>
        )}
      </figcaption>
    </figure>
  );
};

/**
 * Media móvil centrada. Suaviza el ruido sin inventar una forma que los datos no
 * tienen, que es justo el problema de una recta de regresión: con 6 semanas
 * irregulares, una recta recta parece impuesta desde fuera y no describe nada.
 */
const movingAverage = (values, window = 3) => {
  if (values.length < window) return null;
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    const slice = values.slice(from, to);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
};

/**
 * Barras con la evolución dibujada UNIENDO LOS PUNTOS.
 *
 * La versión anterior superponía una recta de mínimos cuadrados. Sobre 6 u 8
 * semanas quedaba postiza: una línea recta atravesando barras irregulares no
 * cuenta lo que pasó, solo una media abstracta. Ahora la línea pasa por el valor
 * real de cada semana, y de forma opcional se añade una media móvil de 3
 * semanas, que suaviza sin falsear la forma.
 *
 * También sustituye al gráfico hecho con flexbox: allí el ancho se repartía con
 * `flex: 1` y con pocas semanas las barras quedaban nadando muy separadas. Aquí
 * el ancho de barra está acotado, así que con 3 o con 20 se lee igual.
 */
export const BarTrendChart = ({
  bars,
  color = 'var(--accent-cyan)',
  lineColor = '#ffffff',
  smoothColor = 'var(--accent-amber)',
  height = 220,
  unit = '',
  showLine = true,
  showSmooth = false,
  fromZero = true,
}) => {
  const [hover, setHover] = useState(null);

  const data = (bars || []).filter((b) => Number.isFinite(Number(b.value)));
  if (data.length === 0) {
    return (
      <div className="row center text-sm text-muted" style={{ height: 140 }}>
        Sin datos todavía.
      </div>
    );
  }

  const CW = 720;
  const CH = 260;
  const pad = { top: 16, right: 16, bottom: 34, left: 48 };
  const innerW = CW - pad.left - pad.right;
  const innerH = CH - pad.top - pad.bottom;

  const values = data.map((b) => Number(b.value));
  const max = Math.max(...values);
  const min = fromZero ? 0 : Math.min(...values);
  const span = max - min || max || 1;
  const headroom = span * 0.1;
  const top = max + headroom;
  const bottom = fromZero ? 0 : Math.max(0, min - headroom);
  const range = top - bottom || 1;

  const y = (value) => pad.top + innerH - ((value - bottom) / range) * innerH;

  // Ancho de barra acotado: nunca más de 56 px ni menos de 6.
  const slot = innerW / data.length;
  const barW = Math.max(6, Math.min(56, slot * 0.62));
  const xCenter = (i) => pad.left + slot * i + slot / 2;

  const smooth = showSmooth ? movingAverage(values, 3) : null;
  const step = Math.ceil(data.length / 10) || 1;

  const polyline = (vals) =>
    vals.map((v, i) => `${xCenter(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <figure className="col gap-2">
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        style={{ width: '100%', height }}
        role="img"
        aria-label="Barras con recta de tendencia"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const value = bottom + range * f;
          return (
            <g key={f}>
              <line
                x1={pad.left}
                x2={CW - pad.right}
                y1={y(value)}
                y2={y(value)}
                stroke="rgba(255,255,255,0.06)"
              />
              <text
                x={pad.left - 8}
                y={y(value)}
                fill="var(--text-dark)"
                fontSize="11"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {data.map((bar, i) => {
          const value = Number(bar.value);
          const barH = Math.max(2, y(bottom) - y(value));
          const active = hover === i;
          return (
            <g key={bar.label + i} onMouseEnter={() => setHover(i)}>
              <rect
                x={xCenter(i) - barW / 2}
                y={y(value)}
                width={barW}
                height={barH}
                rx={Math.min(6, barW / 3)}
                fill={color}
                opacity={bar.highlight === false ? 0.4 : active ? 1 : 0.78}
              />
              {/* Zona sensible al ratón: cubre todo el hueco, no solo la barra. */}
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
              />
              {active && (
                <text
                  x={xCenter(i)}
                  y={y(value) - 7}
                  fill="#fff"
                  fontSize="12"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {Math.round(value)}
                  {unit}
                </text>
              )}
            </g>
          );
        })}

        {/* Línea que une los valores reales, semana a semana. */}
        {showLine && data.length >= 2 && (
          <>
            <polyline
              points={polyline(values)}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
              vectorEffect="non-scaling-stroke"
            />
            {values.map((v, i) => (
              <circle
                key={`pt${i}`}
                cx={xCenter(i)}
                cy={y(v)}
                r={hover === i ? 5 : 3.5}
                fill={lineColor}
                stroke="var(--bg-main)"
                strokeWidth="1.5"
              />
            ))}
          </>
        )}

        {/* Media móvil de 3 semanas, opcional. */}
        {smooth && (
          <polyline
            points={polyline(smooth)}
            fill="none"
            stroke={smoothColor}
            strokeWidth="2"
            strokeDasharray="6 4"
            opacity="0.85"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {data.map((bar, i) =>
          i % step === 0 || i === data.length - 1 ? (
            <text
              key={`${bar.label}-x`}
              x={xCenter(i)}
              y={CH - 12}
              fill="var(--text-dark)"
              fontSize="11"
              textAnchor="middle"
            >
              {bar.label}
            </text>
          ) : null
        )}
      </svg>

      <figcaption className="row wrap gap-4 text-xs">
        <span className="row gap-2">
          <span style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
          <span className="text-muted">Valor de la semana</span>
          <strong style={{ color }}>
            {hover !== null ? round(values[hover], 0) : round(values[values.length - 1], 0)}
            {unit}
          </strong>
        </span>
        {smooth && (
          <span className="row gap-2">
            <span style={{ width: 14, height: 2, background: smoothColor }} />
            <span className="text-muted">Media de 3 semanas</span>
          </span>
        )}
        {hover !== null && data[hover] && <span className="text-dim">· {data[hover].label}</span>}
      </figcaption>
    </figure>
  );
};

/**
 * Bandas apiladas al 100%: el reparto de macros a lo largo del tiempo. Un
 * gráfico de líneas no serviría aquí, porque lo que importa es la PROPORCIÓN
 * entre los tres y que siempre suman 100.
 */
export const StackedShareChart = ({ rows, bands, height = 170 }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="row center text-sm text-muted" style={{ height: 120 }}>
        Aún no hay revisiones con macros registrados.
      </div>
    );
  }

  const step = Math.ceil(rows.length / 8) || 1;

  return (
    <figure className="col gap-2">
      <div className="row" style={{ gap: 3, height, alignItems: 'stretch' }}>
        {rows.map((row, index) => (
          <div
            key={row.date || index}
            className="col"
            style={{ flex: 1, gap: 0, justifyContent: 'flex-end', minWidth: 0 }}
            title={`${row.label}: ${bands.map((b) => `${b.label} ${row[b.key]}%`).join(' · ')}`}
          >
            {bands.map((band) => (
              <div
                key={band.key}
                style={{
                  height: `${row[band.key]}%`,
                  background: band.color,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 3 }}>
        {rows.map((row, index) => (
          <span
            key={`${row.date}-label`}
            className="text-xs text-dim"
            style={{ flex: 1, textAlign: 'center', minWidth: 0, overflow: 'hidden' }}
          >
            {index % step === 0 ? row.label : ''}
          </span>
        ))}
      </div>

      <figcaption className="row wrap gap-4 text-xs">
        {bands.map((band) => (
          <span className="row gap-2" key={band.key}>
            <span style={{ width: 10, height: 10, background: band.color, borderRadius: 2 }} />
            <span className="text-muted">{band.label}</span>
            <strong style={{ color: band.color }}>{rows[rows.length - 1][band.key]}%</strong>
          </span>
        ))}
      </figcaption>
    </figure>
  );
};
