import { useId, useMemo, useState } from 'react';
import { round, toNum } from '@/lib/num';
import { useElementWidth } from '@/lib/useElementWidth';

/**
 * Gráficos en SVG, sin librería.
 *
 * ── Nada de escalado no uniforme ────────────────────────────────────────────
 * La versión anterior usaba un `viewBox` fijo con `preserveAspectRatio="none"`
 * para llenar el ancho disponible. Eso estira el SVG en horizontal y lo comprime
 * en vertical, y con ello **el texto de los ejes**: de ahí que los números se
 * vieran deformados y los ejes «estirados».
 *
 * Ahora se mide el ancho real del contenedor y se dibuja a 1:1, una unidad de
 * SVG por píxel. El texto sale nítido y la geometría es exacta.
 *
 * ── El criterio, tomado de la referencia visual ─────────────────────────────
 * · Bandas anchas y bajas: una tendencia necesita recorrido horizontal, no alto.
 * · Línea de 2 px y área al 10%. Sin un punto por dato: solo el del cursor.
 * · Tres líneas de rejilla con su valor, y fechas abajo en mayúsculas diminutas.
 * · Ninguna recta de regresión: sobre pocas semanas queda impostada. Para
 *   suavizar, media móvil, que sigue el recorrido real.
 */

const MIN_W = 240;

/**
 * Curva suave que no inventa máximos entre puntos (Catmull-Rom, tensión baja).
 *
 * Se exporta porque la línea de tiempo de una revisión dibuja su propio SVG —es
 * un instrumento compuesto: la curva del peso, las barras de las calorías y la
 * tira de fotos sobre un mismo eje— y tiene que trazar la curva EXACTAMENTE
 * igual que los demás gráficos. Dos formas de suavizar una línea en el mismo
 * producto son dos curvas distintas para los mismos datos.
 */
export const smoothPath = (points) => {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const t = 0.16;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
};

const movingAverage = (values, window = 3) => {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
};

/**
 * El rango de un eje, con su margen. Exportada por lo mismo que `smoothPath`:
 * si la línea de tiempo calculara su escala por su cuenta, la misma serie
 * llenaría el alto de una forma aquí y de otra en la analítica.
 */
export const makeScale = (values, { fromZero = false, padRatio = 0.16 } = {}) => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  let min = fromZero ? Math.min(0, ...finite) : Math.min(...finite);
  let max = Math.max(...finite);

  if (min === max) {
    const pad = Math.abs(max) * 0.12 || 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * padRatio;
    if (!fromZero) min -= pad;
    max += pad;
  }
  return { min, max };
};

const Empty = ({ message, height }) => (
  <div className="chart-empty" style={{ minHeight: height }}>
    {message}
  </div>
);

/** Cuántas etiquetas del eje X caben sin apelotonarse, según el ancho real. */
const labelStep = (count, width) => {
  const maxLabels = Math.max(2, Math.floor(width / 76));
  return Math.max(1, Math.ceil(count / maxLabels));
};

/**
 * Banda: una o varias series sobre un eje común, ancha y baja.
 * @param series [{ id, label, color, unit, decimals, points: [{label,value}] }]
 */
/**
 * @param trend  Recta de tendencia a superponer: `{ from, to, weak }`, tal como la
 *   devuelve `linearTrend`. Es la PRUEBA VISUAL del número que da la lectura de la
 *   semana: sin ella el titular dice «−0,4 kg/semana» y el gráfico muestra una
 *   línea que sube y baja, y no hay forma de ver de dónde sale esa cifra.
 *
 *   Cuando `weak` es true se dibuja más tenue y de trazo discontinuo. Ese es el
 *   punto: una tendencia con r² bajo NO debe dibujarse igual que una buena, porque
 *   una recta sólida sobre datos dispersos afirma una certeza que no existe.
 *
 * @param band  Banda horizontal de referencia: `{ from, to, label }`. Se usa para
 *   el objetivo, y convierte «¿esto está bien?» en algo que se ve: el punto está
 *   dentro de la banda o está fuera.
 */
export const BandChart = ({
  series,
  labels,
  height = 120,
  fromZero = false,
  smooth = false,
  showArea = true,
  gridLines = 3,
  trend = null,
  band = null,
  emptyMessage = 'Sin datos suficientes todavía.',
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState(null);
  const [wrapRef, measured] = useElementWidth();

  const W = Math.max(MIN_W, measured);
  const H = height;
  const PAD = { top: 8, right: 6, bottom: 18, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const prepared = useMemo(() => {
    const total = labels.length;
    const withIndex = series.map((s) => {
      const byLabel = new Map(s.points.map((p) => [p.label, toNum(p.value)]));
      const pts = labels
        .map((label, index) => ({ index, label, value: byLabel.get(label) }))
        .filter((p) => p.value !== null && p.value !== undefined);
      return { ...s, pts };
    });

    // La banda de objetivo entra en la escala: si se quedara fuera, una banda por
    // encima o por debajo del rango de los datos se dibujaría en el borde del
    // gráfico o directamente fuera, y parecería que el cliente la está tocando.
    const extra = band ? [band.from, band.to].map(toNum).filter((v) => v !== null) : [];

    return {
      total,
      series: withIndex,
      scale: makeScale([...withIndex.flatMap((s) => s.pts.map((p) => p.value)), ...extra], { fromZero }),
    };
  }, [series, labels, fromZero, band]);

  const hasData = prepared.series.some((s) => s.pts.length > 0);

  const xAt = (i) =>
    prepared.total <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (prepared.total - 1)) * innerW;

  /* El punto bajo el puntero — la misma cuenta sirve para ratón y para dedo. */
  const leerPunto = (event) => {
    const r = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - r.left;
    const i = Math.round(((x - PAD.left) / innerW) * (prepared.total - 1));
    setHover(i >= 0 && i < prepared.total ? i : null);
  };
  const yAt = (value) =>
    PAD.top + innerH - ((value - prepared.scale.min) / (prepared.scale.max - prepared.scale.min || 1)) * innerH;

  const ticks = prepared.scale
    ? Array.from({ length: gridLines }, (_, i) =>
        prepared.scale.min + ((prepared.scale.max - prepared.scale.min) * i) / (gridLines - 1)
      )
    : [];
  const step = labelStep(prepared.total, innerW);

  return (
    <figure className="col gap-2" ref={wrapRef}>
      {!hasData ? (
        <Empty message={emptyMessage} height={height} />
      ) : (
        <>
          <svg
            className="chart"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={series.map((s) => s.label).join(' y ')}
            /* Eventos de PUNTERO, no de ratón: con `onMouseMove` el gráfico era
               mudo en el móvil — se veía la forma de la curva pero no había
               manera de leer el valor de un punto. Tocar o arrastrar el dedo
               mueve el cursor igual que el ratón; la diferencia está en el
               «leave»: con dedo no existe un «salir» útil (dispara al levantar),
               así que solo el ratón limpia y en táctil la lectura queda fijada
               donde se tocó. `touch-action: pan-y` (en `.chart`) deja el scroll
               vertical de la página en manos del navegador. */
            onPointerLeave={(event) => event.pointerType === 'mouse' && setHover(null)}
            onPointerDown={leerPunto}
            onPointerMove={leerPunto}
          >
            <defs>
              {prepared.series.map((s) => (
                <linearGradient id={`${uid}-${s.id}`} key={s.id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="var(--area-opacity)" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            <g className="chart-grid">
              {ticks.map((tick, i) => (
                <line key={i} x1={PAD.left} x2={W - PAD.right} y1={yAt(tick)} y2={yAt(tick)} />
              ))}
            </g>

            {/* La banda del objetivo, DEBAJO de los datos: es el fondo contra el
                que se leen, no un elemento más que compita con ellos. */}
            {band && (
              <rect
                className="chart-band"
                x={PAD.left}
                y={Math.min(yAt(band.from), yAt(band.to))}
                width={innerW}
                height={Math.max(2, Math.abs(yAt(band.to) - yAt(band.from)))}
              />
            )}

            <g className="chart-axis">
              {ticks.map((tick, i) => (
                <text key={i} x={PAD.left - 6} y={yAt(tick)} textAnchor="end" dominantBaseline="middle">
                  {round(tick, Math.abs(tick) < 20 ? 1 : 0)}
                </text>
              ))}
              {labels.map((label, i) =>
                i % step === 0 || i === labels.length - 1 ? (
                  <text key={`${label}-${i}`} x={xAt(i)} y={H - 4} textAnchor="middle">
                    {label}
                  </text>
                ) : null
              )}
            </g>

            {hover !== null && (
              <line className="chart-cursor" x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={PAD.top + innerH} />
            )}

            {/* La recta de tendencia, sobre la primera serie y con su color. Va
                entre la banda y los datos: explica la línea, no la sustituye. */}
            {trend && prepared.series[0]?.pts.length > 1 && (
              <line
                className={`chart-trend${trend.weak ? ' is-weak' : ''}`}
                x1={xAt(prepared.series[0].pts[0].index)}
                y1={yAt(trend.from)}
                x2={xAt(prepared.series[0].pts[prepared.series[0].pts.length - 1].index)}
                y2={yAt(trend.to)}
                stroke={prepared.series[0].color}
              />
            )}

            {prepared.series.map((s) => {
              if (s.pts.length === 0) return null;

              const source =
                smooth && s.pts.length > 3
                  ? movingAverage(s.pts.map((p) => p.value), 3).map((v, i) => ({ ...s.pts[i], value: v }))
                  : s.pts;
              const coords = source.map((p) => ({ x: xAt(p.index), y: yAt(p.value) }));
              const path = smoothPath(coords);

              return (
                <g key={s.id}>
                  {showArea && coords.length > 1 && (
                    <path
                      d={`${path} L ${coords[coords.length - 1].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`}
                      fill={`url(#${uid}-${s.id})`}
                    />
                  )}
                  <path className="chart-line" d={path} stroke={s.color} />

                  {hover !== null &&
                    s.pts
                      .filter((p) => p.index === hover)
                      .map((p) => (
                        <circle
                          key={p.index}
                          cx={xAt(p.index)}
                          cy={yAt(p.value)}
                          r="4"
                          fill={s.color}
                          stroke="var(--surface)"
                          strokeWidth="2"
                        />
                      ))}
                </g>
              );
            })}
          </svg>

          <figcaption className="chart-legend">
            {prepared.series.map((s) => {
              const point = hover !== null ? s.pts.find((p) => p.index === hover) : null;
              const shown = point ? point.value : s.pts[s.pts.length - 1]?.value;
              return (
                <span className="row gap-2" key={s.id}>
                  <span className="chart-swatch" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <strong style={{ color: s.color }}>
                    {shown === undefined ? '—' : `${round(shown, s.decimals ?? 1)}${s.unit || ''}`}
                  </strong>
                </span>
              );
            })}
            {hover !== null && labels[hover] && <span className="t-tertiary">{labels[hover]}</span>}
          </figcaption>
        </>
      )}
    </figure>
  );
};

/**
 * Barras con la evolución uniendo los valores reales. Sin recta de tendencia
 * superpuesta: la línea pasa por cada dato.
 */
export const BarBandChart = ({
  bars,
  color = 'var(--data-blue)',
  height = 150,
  unit = '',
  showLine = true,
  emptyMessage = 'Sin datos todavía.',
}) => {
  const [hover, setHover] = useState(null);
  const [wrapRef, measured] = useElementWidth();

  const data = (bars || []).filter((b) => Number.isFinite(Number(b.value)));

  const W = Math.max(MIN_W, measured);
  const H = height;
  const PAD = { top: 12, right: 6, bottom: 18, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = data.map((b) => Number(b.value));
  const max = (values.length > 0 ? Math.max(...values) : 1) * 1.12 || 1;
  const yAt = (v) => PAD.top + innerH - (v / max) * innerH;

  const slot = data.length > 0 ? innerW / data.length : innerW;
  const barW = Math.max(4, Math.min(40, slot * 0.54));
  const xC = (i) => PAD.left + slot * i + slot / 2;
  const step = labelStep(data.length, innerW);

  return (
    <figure className="col gap-2" ref={wrapRef}>
      {data.length === 0 ? (
        <Empty message={emptyMessage} height={height} />
      ) : (
        <>
          <svg
            className="chart"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Valores por periodo"
            /* Mismo criterio que el gráfico de líneas: el ratón limpia al
               salir, el dedo deja la lectura fijada. */
            onPointerLeave={(event) => event.pointerType === 'mouse' && setHover(null)}
          >
            <g className="chart-grid">
              {[0, 0.5, 1].map((f) => (
                <line key={f} x1={PAD.left} x2={W - PAD.right} y1={yAt(max * f)} y2={yAt(max * f)} />
              ))}
            </g>
            <g className="chart-axis">
              {[0, 0.5, 1].map((f) => (
                <text key={f} x={PAD.left - 6} y={yAt(max * f)} textAnchor="end" dominantBaseline="middle">
                  {Math.round(max * f)}
                </text>
              ))}
            </g>

            {data.map((bar, i) => (
              <g key={`${bar.label}-${i}`} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <rect
                  x={xC(i) - barW / 2}
                  y={yAt(Number(bar.value))}
                  width={barW}
                  height={Math.max(2, yAt(0) - yAt(Number(bar.value)))}
                  rx={Math.min(4, barW / 3)}
                  fill={color}
                  opacity={hover === i ? 1 : bar.highlight === false ? 0.3 : 0.55}
                />
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              </g>
            ))}

            {showLine && data.length > 1 && (
              <path
                className="chart-line"
                d={smoothPath(values.map((v, i) => ({ x: xC(i), y: yAt(v) })))}
                stroke={color}
              />
            )}

            <g className="chart-axis">
              {data.map((bar, i) =>
                i % step === 0 || i === data.length - 1 ? (
                  <text key={`${bar.label}-x`} x={xC(i)} y={H - 4} textAnchor="middle">
                    {bar.label}
                  </text>
                ) : null
              )}
            </g>
          </svg>

          <figcaption className="chart-legend">
            <span className="row gap-2">
              <span className="chart-swatch" style={{ background: color, width: 8, height: 8, borderRadius: 2 }} />
              <span>{hover !== null ? data[hover].label : 'Último'}</span>
              <strong style={{ color }}>
                {hover !== null ? Math.round(values[hover]) : Math.round(values[values.length - 1])}
                {unit}
              </strong>
            </span>
          </figcaption>
        </>
      )}
    </figure>
  );
};

/**
 * Sparkline para los widgets. Aquí SÍ se estira a propósito: no hay texto que
 * pueda deformarse, y así llena el ancho de la tarjeta sea cual sea.
 */
export const Sparkline = ({ points, color = 'var(--data-blue)', height = 28, bars = false }) => {
  const values = (points || []).map((p) => toNum(p?.value ?? p)).filter((v) => v !== null);
  if (values.length < 2) return null;

  const W = 100;
  const H = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const y = (v) => H - 2 - ((v - min) / range) * (H - 5);
  const x = (i) => (i / (values.length - 1)) * W;

  /*
    ══ Las barras van en cajas, no en un SVG estirado ═══════════════════════

    Estaban dibujadas con `<rect rx>` dentro de un `<svg preserveAspectRatio=
    "none">`, y eso tiene dos fallos que solo se ven cuando el gráfico es ancho:

      1. **El redondeo se estira con el lienzo.** Un `rx` de 4 unidades dentro
         de un viewBox de 100 estirado a mil píxeles son 40 px de radio a lo
         ancho y 4 de alto: la barra deja de parecer una barra y sale como una
         pastilla flotando. En una tarjeta estrecha casi no se nota; a lo ancho
         de la radiografía era lo único que se veía.
      2. **La base no era cero.** `y()` normaliza entre el mínimo y el máximo,
         así que la barra más baja de la serie salía siempre a ras de suelo
         aunque valiera 11 de 17. Para una LÍNEA eso está bien —una línea
         enseña forma— pero una barra enseña magnitud, y una barra que arranca
         en el mínimo miente sobre ella. La regla del proyecto lo dice desde el
         principio: «eje desde cero» (cabecera de `scripts/radiografia/informe.mjs`).

    En cajas, el redondeo son píxeles de verdad a cualquier ancho, y sale la
    otra mitad de esa regla gratis: extremo del dato redondeado, base cuadrada.
  */
  if (bars) {
    const tope = Math.max(...values, 0) || 1;
    return (
      <div className="spark-bars" style={{ height }} aria-hidden="true">
        {values.map((v, i) => (
          <span
            key={i}
            className="spark-bar"
            style={{
              /* Un mínimo visible para que un cero siga ocupando su sitio: sin
                 él, una semana sin nada desaparece y la serie parece más corta
                 de lo que es. Dos por ciento es una pestaña, no una cifra. */
              height: `${Math.max(2, (Math.max(0, v) / tope) * 100)}%`,
              background: color,
              opacity: i === values.length - 1 ? 1 : 0.4,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height, width: '100%' }} preserveAspectRatio="none" aria-hidden="true">
      <path d={smoothPath(values.map((v, i) => ({ x: x(i), y: y(v) })))} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
};

/** Anillo de progreso con una cifra en el centro. */
export const ProgressRing = ({ value, max, size = 78, thickness = 8, color = 'var(--data-amber)', label, unit }) => {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: 'stroke-dasharray 0.4s var(--ease)' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          lineHeight: 1.1,
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {label}
          </div>
          {unit && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-tertiary)' }}>{unit}</div>}
        </div>
      </div>
    </div>
  );
};

/**
 * Donut de reparto: un arco por porción, proporcional a su valor.
 *
 * ── Por qué sustituye al anillo de antes ────────────────────────────────────
 * `ProgressRing` con `value === max` dibuja un anillo completo de un solo color:
 * decoración con forma de gráfico. Ocupaba el sitio del dato más importante de
 * una comida —cómo se reparte— sin decir nada, y por eso se leía como postizo.
 *
 * Aquí el anillo ES el reparto: la longitud de cada arco es la proporción de
 * kcal de ese macro. El hueco entre arcos es lo que permite distinguir tres
 * tramos contiguos sin ponerles borde.
 */
export const MacroDonut = ({ slices, size = 96, thickness = 11, label, unit, sub }) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const parts = (slices || []).filter((s) => s.value > 0);
  const total = parts.reduce((acc, s) => acc + s.value, 0);

  // Separación entre arcos, en píxeles de contorno. Con una sola porción no se
  // aplica: dejaría una muesca sin sentido en un anillo continuo.
  const gap = parts.length > 1 ? Math.min(4, circumference * 0.012) : 0;

  let cursor = 0;
  const arcs = parts.map((slice) => {
    const length = (slice.value / total) * circumference;
    const arc = {
      key: slice.key ?? slice.label,
      color: slice.color,
      label: slice.label,
      dash: Math.max(0, length - gap),
      offset: cursor + gap / 2,
    };
    cursor += length;
    return arc;
  });

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--fill)"
          strokeWidth={thickness}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={-arc.offset}
            style={{ transition: 'stroke-dasharray var(--normal), stroke-dashoffset var(--normal)' }}
          />
        ))}
      </svg>

      <div className="donut-center">
        <span className="v">{label}</span>
        {unit && <span className="u">{unit}</span>}
        {sub && <span className="s">{sub}</span>}
      </div>
    </div>
  );
};

/** Barras horizontales con marca de referencia (volumen por grupo muscular). */
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
          <div className="meter-fill" style={{ width: `${Math.min(100, item.pct)}%`, background: item.color }}>
            {item.value > 0 ? item.value : ''}
          </div>
        </div>
      </div>
    ))}
  </div>
);

/** Bandas apiladas al 100%: reparto de macros en el tiempo. */
export const StackedShareChart = ({ rows, bands, height = 130, emptyMessage }) => {
  if (!rows || rows.length === 0) {
    return <Empty message={emptyMessage || 'Sin revisiones con macros registrados.'} height={height} />;
  }

  const step = Math.max(1, Math.ceil(rows.length / 6));

  return (
    <figure className="col gap-2">
      <div className="row" style={{ gap: 3, height, alignItems: 'stretch' }}>
        {rows.map((row, index) => (
          <div
            key={row.date || index}
            className="col"
            style={{
              flex: 1,
              gap: 0,
              justifyContent: 'flex-end',
              minWidth: 0,
              borderRadius: 4,
              overflow: 'hidden',
            }}
            title={`${row.label}: ${bands.map((b) => `${b.label} ${row[b.key]}%`).join(' · ')}`}
          >
            {bands.map((band) => (
              <div key={band.key} style={{ height: `${row[band.key]}%`, background: band.color, opacity: 0.9 }} />
            ))}
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 3 }}>
        {rows.map((row, index) => (
          <span
            key={`${row.date}-l`}
            className="t-xs t-tertiary"
            style={{ flex: 1, textAlign: 'center', minWidth: 0, overflow: 'hidden' }}
          >
            {index % step === 0 || index === rows.length - 1 ? row.label : ''}
          </span>
        ))}
      </div>

      <figcaption className="chart-legend">
        {bands.map((band) => (
          <span className="row gap-2" key={band.key}>
            <span className="chart-swatch" style={{ background: band.color }} />
            <span>{band.label}</span>
            <strong style={{ color: band.color }}>{rows[rows.length - 1][band.key]}%</strong>
          </span>
        ))}
      </figcaption>
    </figure>
  );
};
