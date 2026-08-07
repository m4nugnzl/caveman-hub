/**
 * Gráficos en SVG puro, sin librería de charts.
 *
 * Había dos implementaciones distintas del mismo gráfico de tendencia (una con
 * área rellena en la analítica del coach, otra con solo una polilínea en el
 * portal del cliente) y dos del gráfico de tonelaje. Coach y cliente veían
 * gráficos diferentes para los mismos datos.
 */

import { toNum } from '@/lib/num';

const EMPTY_HEIGHT = 120;

/**
 * Línea de tendencia con área. `points` = [{ date, value }] en orden
 * cronológico. Con un solo punto no hay tendencia que dibujar, así que se
 * muestra el valor como dato suelto en vez de un gráfico vacío.
 */
export const TrendChart = ({ points, color = 'var(--accent-emerald)', unit = '', height = 140 }) => {
  const data = (points || []).filter((p) => toNum(p.value) !== null);

  if (data.length < 2) {
    return (
      <div
        className="row center text-sm text-muted"
        style={{ height: EMPTY_HEIGHT }}
      >
        {data.length === 1
          ? `Último dato: ${data[0].value}${unit}`
          : 'Aún no hay suficientes registros para ver una tendencia.'}
      </div>
    );
  }

  const values = data.map((p) => Number(p.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 600;
  const H = 140;
  const PAD = 16;

  const coords = data.map((p, i) => ({
    x: (i / (data.length - 1)) * (W - PAD * 2) + PAD,
    y: H - PAD - ((Number(p.value) - min) / range) * (H - PAD * 2),
  }));

  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${PAD},${H} ${line} ${W - PAD},${H}`;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Tendencia de ${data.length} registros, de ${min}${unit} a ${max}${unit}`}
      >
        <polygon points={area} fill={color} opacity="0.14" />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <circle key={data[i].date ?? i} cx={c.x} cy={c.y} r="3.5" fill={color} />
        ))}
      </svg>
      <figcaption className="row between text-xs text-dim" style={{ marginTop: 4 }}>
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </figcaption>
    </figure>
  );
};

/**
 * Barras horizontales con marca de referencia opcional (se usa para señalar el
 * MRV en el volumen por grupo muscular).
 */
export const MeterList = ({ items }) => (
  <div className="col gap-2">
    {items.map((item) => (
      <div className="meter-row" key={item.label}>
        <span className="meter-label">{item.label}</span>
        <div className="meter-track">
          {item.markerPct != null && (
            <span
              className="meter-marker"
              style={{ left: `${Math.min(100, item.markerPct)}%` }}
              title={item.markerTitle}
            />
          )}
          <div
            className="meter-fill"
            style={{
              width: `${Math.min(100, item.pct)}%`,
              background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}99 100%)`,
            }}
          >
            {item.value > 0 ? item.value : ''}
          </div>
        </div>
      </div>
    ))}
  </div>
);
